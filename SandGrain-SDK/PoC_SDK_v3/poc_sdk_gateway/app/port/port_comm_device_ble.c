/* =============================================================================
 * port_comm_device_ble.c
 *
 * Device communication port — BLE-CENTRAL implementation (BlueZ via gattlib),
 * MULTI-DEVICE: one BLE connection per gateway channel (MAX_DEVICES).
 *
 * This is the mirror of the device-side BLE port: the devices (nRF board, Pi)
 * are BLE peripherals exposing the Nordic UART Service (NUS); the gateway here
 * is the BLE central. It replaces the TCP server in port_comm_device.c so the
 * gateway talks to the devices directly over Bluetooth — no laptop relay.
 *
 * It implements the SAME port_comm_device_* interface the gateway's
 * device_service/middleware already use, so nothing above this layer changes.
 * The gateway↔cloud (MQTT) path is untouched (per-flow mosquitto clients, so
 * concurrent auth flows on different channels don't collide).
 *
 * Build with `make GW_BLE=1 [GW_BLE_DEVICES=n]` (see Makefile). The middleware
 * initializes channel_0..channel_{n-1}; each channel binds to ONE peripheral.
 * Peripherals are matched by advertised-name PREFIX (default "SandGrain-Dev",
 * env BLE_TARGET_PREFIX) so "SandGrain-Dev" (board) and "SandGrain-Dev2" (Pi)
 * both qualify; a discovered peripheral is bound to the first free channel,
 * and one MAC is never bound to two channels. The devices can keep their
 * identical default name — binding is by MAC — but distinct names make the
 * logs readable.
 *
 * Wire format per channel (identical to what the relay used to bridge):
 *   device -> gw (NUS TX notify): newline-delimited messages
 *       "HELLO <tid>[ TRIGGER]\n"
 *                  presence announcement, once per link-up - proxied to MQTT
 *                  as a retained "online" on the board's status topic. The
 *                  optional TRIGGER capability asks the gateway to relay the
 *                  board's cmd/run_auth topic too (see gw_presence.c)
 *       "OPEN\n"   start of a device session  (maps to a TCP "accept")
 *       "CLOSE\n"  end of a device session    (maps to a TCP close)
 *       "<json>\n" one protocol frame (type 4/5/8 ...)
 *   gw -> device (NUS RX write):
 *       "RUN_AUTH <mode>\n"  TrustBridge asked this board to authenticate
 *       "<json>\n"           one protocol frame
 * HELLO/OPEN/CLOSE are consumed here and surfaced as NO_DATA, so the gateway's
 * frame-type dispatch only ever sees real JSON frames.
 *
 * gattlib API: written against the current (DBus) gattlib API —
 *   - opaque gattlib_adapter_t / gattlib_connection_t handles,
 *   - gattlib_mainloop(task, arg): gattlib owns the GLib main loop and runs our
 *     task in a worker thread; BLE ops (scan/connect/notify) operate within it,
 *   - ASYNCHRONOUS gattlib_connect(): the connection is delivered in a
 *     gatt_connect_cb_t callback (user_data = our channel), not returned.
 * Pin gattlib to the version recorded in scripts/pi_ble_gateway_setup.sh.
 * ============================================================================= */
#include "port_comm_device.h"
#include "gw_presence.h"

#include <gattlib.h>
#include <gio/gio.h>       /* raw D-Bus: Adapter1.RemoveDevice (cache eviction) */

#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <unistd.h>

/* ── Debug ───────────────────────────────────────────────── */
#if defined(PORT_COMM_DEVICE_DEBUG) && PORT_COMM_DEVICE_DEBUG == 1
    #define LOG_BLE(fmt, ...)  printf("[COMM_BLE] " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG_BLE(fmt, ...)  do {} while (0)
#endif

/* Nordic UART Service characteristic UUIDs */
#define NUS_RX_UUID   "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  /* write:  central -> peripheral */
#define NUS_TX_UUID   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  /* notify: peripheral -> central */

#define TARGET_PREFIX_DEFAULT "SandGrain-Dev"  /* advertised-name prefix to scan for */
#define SCAN_SECONDS      6
#define BLE_LINE_MAX      256               /* (was LINE_MAX — renamed to avoid the glib/limits.h macro) */
#define RXQ_DEPTH         16
#define RECONNECT_DELAY_S 2

#ifndef MAX_DEVICES
#define MAX_DEVICES 1
#endif

/* ── per-channel state ─────────────────────────────────────────────────────
 * One BLE peripheral per gateway channel. The middleware passes each channel's
 * port_comm_device_t; we stash the channel index in ctx->listen_fd (unused by
 * the BLE build) so send/receive can find their channel. */
typedef struct {
    /* inbound newline-framed lines from the device (device -> gw) */
    char     q[RXQ_DEPTH][BLE_LINE_MAX];
    uint16_t q_len[RXQ_DEPTH];
    int      head, tail, count;
    pthread_mutex_t q_lock;

    /* notification reassembly (gattlib loop thread only) */
    uint8_t  acc[BLE_LINE_MAX];
    int      acc_len;

    gattlib_connection_t *conn;
    pthread_mutex_t       conn_lock;   /* guards conn for writes vs the BLE thread */

    char     addr[64];                 /* bound peripheral MAC ('\0' = free)   */
    char     name[32];                 /* advertised name (for logs)           */
    int      tries;                    /* connect attempts for this bind       */
    volatile bool connecting;          /* a gattlib_connect() is in flight     */
    volatile bool connected;
    volatile bool drop;                /* task thread must disconnect+requeue  */
    volatile bool in_session;          /* device is mid-exchange (OPEN..CLOSE) */
    int      idx;
} ble_chan_t;

static ble_chan_t chans[MAX_DEVICES];

/* ── shared state ── */
static gattlib_adapter_t *g_adapter;
static uuid_t             g_tx_uuid, g_rx_uuid;
static pthread_t          g_thread;        /* runs gattlib_mainloop() */
static volatile bool      g_started;
static volatile bool      g_task_done;   /* prv_ble_task has finished its teardown */
static const char        *g_prefix = TARGET_PREFIX_DEFAULT;

/* Scan candidates — a PERSISTENT queue (filled by the discovery callback,
 * consumed one connect at a time by the task). It must survive across scan
 * passes: bluetoothd caches a device after its first advertisement, and a
 * cached device is not re-reported by later scans — a candidate discarded
 * here would starve its channel forever. */
#define CAND_MAX (MAX_DEVICES + 4)
#define CAND_TRIES_MAX 3
static struct { char addr[64]; char name[32]; int tries; } g_cand[CAND_MAX];
static int             g_cand_count;
static int             g_scan_want;         /* free channels at scan start (log only) */
static pthread_mutex_t g_scan_lock = PTHREAD_MUTEX_INITIALIZER;

/* ── inbound queue (device -> gw), per channel ────────────────────────────── */
static void prv_q_push(ble_chan_t *ch, const uint8_t *line, uint16_t len)
{
    pthread_mutex_lock(&ch->q_lock);
    if (ch->count < RXQ_DEPTH) {
        uint16_t n = (len < BLE_LINE_MAX) ? len : (BLE_LINE_MAX - 1);
        memcpy(ch->q[ch->tail], line, n);
        ch->q_len[ch->tail] = n;
        ch->tail = (ch->tail + 1) % RXQ_DEPTH;
        ch->count++;
    } else {
        LOG_BLE("[ch%d] RX queue full — dropping frame", ch->idx);
    }
    pthread_mutex_unlock(&ch->q_lock);
}

static bool prv_q_pop(ble_chan_t *ch, uint8_t *out, uint16_t out_size, uint16_t *out_len)
{
    bool got = false;
    pthread_mutex_lock(&ch->q_lock);
    if (ch->count > 0) {
        uint16_t n = ch->q_len[ch->head];
        if (n > out_size) n = out_size;
        memcpy(out, ch->q[ch->head], n);
        *out_len = n;
        ch->head = (ch->head + 1) % RXQ_DEPTH;
        ch->count--;
        got = true;
    }
    pthread_mutex_unlock(&ch->q_lock);
    return got;
}

/* ── NUS TX notification handler (gattlib_event_handler_t) ───────────────── */
static void prv_on_notification(const uuid_t *uuid, const uint8_t *data,
                                size_t len, void *user_data)
{
    (void)uuid;
    ble_chan_t *ch = (ble_chan_t *)user_data;
    for (size_t i = 0; i < len; i++) {
        uint8_t b = data[i];
        if (b == '\n') {
            if (ch->acc_len > 0) {
                prv_q_push(ch, ch->acc, (uint16_t)ch->acc_len);
            }
            ch->acc_len = 0;
        } else if (ch->acc_len < BLE_LINE_MAX) {
            ch->acc[ch->acc_len++] = b;
        } else {
            ch->acc_len = 0;   /* overflow — resync on next newline */
        }
    }
}

static void prv_queue_candidate(const char *addr, const char *name, int tries);

/* gattlib_disconnection_handler_t: (connection, user_data) */
static void prv_on_disconnect(gattlib_connection_t *connection, void *user_data)
{
    ble_chan_t *ch = (ble_chan_t *)user_data;

    /* Only act if this event is for the channel's CURRENT connection — a
     * late event from an already-replaced/dropped connection must not stomp
     * the channel's new state. */
    pthread_mutex_lock(&ch->conn_lock);
    bool ours = (ch->conn == connection);
    if (ours)
        ch->conn = NULL;
    pthread_mutex_unlock(&ch->conn_lock);
    if (!ours) {
        LOG_BLE("[ch%d] stale disconnect event ignored", ch->idx);
        return;
    }

    LOG_BLE("[ch%d] device %s disconnected — channel free, will reconnect",
            ch->idx, ch->name[0] ? ch->name : ch->addr);
    /* Re-queue the MAC for a DIRECT reconnect — a scan cannot re-find it:
     * once connected the device is non-temporary in BlueZ's cache, so its
     * re-advertisements never surface as a new discovery. gattlib_connect on
     * the cached object works without any scan. */
    prv_queue_candidate(ch->addr, ch->name, 0);
    ch->connected = false;
    /* A device that vanishes mid-exchange never sends CLOSE. Clearing here is
     * what stops the session flag sticking true and starving discovery for the
     * lifetime of the process. */
    ch->in_session = false;
    ch->addr[0] = '\0';     /* unbind: the MAC may rebind to any free channel */
    ch->name[0] = '\0';
    /* The BLE task thread polls and reconnects/rebinds. */
}

/* Is this MAC already bound (connecting or connected) to some channel? */
static bool prv_addr_in_use(const char *addr)
{
    for (int i = 0; i < MAX_DEVICES; i++)
        if ((chans[i].connecting || chans[i].connected) &&
            strcmp(chans[i].addr, addr) == 0)
            return true;
    return false;
}

/* Append a candidate to the queue (dedup by MAC). Safe from any thread. */
static void prv_queue_candidate(const char *addr, const char *name, int tries)
{
    if (addr == NULL || addr[0] == '\0')
        return;   /* an empty MAC once poisoned the queue (double-handled
                   * connect failure read the channel addr after it was
                   * cleared) — never let one in */
    pthread_mutex_lock(&g_scan_lock);
    bool known = false;
    for (int i = 0; i < g_cand_count; i++)
        if (strcmp(g_cand[i].addr, addr) == 0) { known = true; break; }
    if (!known && g_cand_count < CAND_MAX) {
        snprintf(g_cand[g_cand_count].addr, sizeof(g_cand[0].addr), "%s", addr);
        snprintf(g_cand[g_cand_count].name, sizeof(g_cand[0].name), "%s", name);
        g_cand[g_cand_count].tries = tries;
        g_cand_count++;
        LOG_BLE("found %s @ %s (candidate %d, %d channel(s) free)", name, addr,
                g_cand_count, g_scan_want);
    }
    pthread_mutex_unlock(&g_scan_lock);
}

/* Pop the oldest queued candidate. Returns false if the queue is empty. */
static bool prv_pop_candidate(char *addr, size_t addr_sz,
                              char *name, size_t name_sz, int *tries)
{
    bool got = false;
    pthread_mutex_lock(&g_scan_lock);
    if (g_cand_count > 0) {
        snprintf(addr, addr_sz, "%s", g_cand[0].addr);
        snprintf(name, name_sz, "%s", g_cand[0].name);
        *tries = g_cand[0].tries;
        g_cand_count--;
        memmove(&g_cand[0], &g_cand[1], (size_t)g_cand_count * sizeof(g_cand[0]));
        got = true;
    }
    pthread_mutex_unlock(&g_scan_lock);
    return got;
}

/* Evict a device from bluetoothd's cache (the `bluetoothctl remove`
 * equivalent). Once a peripheral has been CONNECTED, BlueZ marks it
 * non-temporary: it is never purged, later advertisements only update
 * properties on the cached object, and gattlib re-reports a device to a scan
 * only while its internal state is NOT_FOUND — so a device we gave up on
 * could otherwise never be found again. Removing the object makes its next
 * advertisement a fresh discovery. Uses our own D-Bus connection (a GDBus
 * sync call is safe from any thread — replies arrive on GDBus's worker). */
static void prv_bluez_remove_device(const char *addr)
{
    GDBusConnection *bus = g_bus_get_sync(G_BUS_TYPE_SYSTEM, NULL, NULL);
    if (bus == NULL)
        return;
    char path[64];   /* /org/bluez/hci0/dev_XX_XX_XX_XX_XX_XX */
    snprintf(path, sizeof(path), "/org/bluez/hci0/dev_%s", addr);
    for (char *p = path; *p; p++)
        if (*p == ':') *p = '_';
    GError *err = NULL;
    GVariant *r = g_dbus_connection_call_sync(bus, "org.bluez", "/org/bluez/hci0",
        "org.bluez.Adapter1", "RemoveDevice", g_variant_new("(o)", path),
        NULL, G_DBUS_CALL_FLAGS_NONE, 5000, NULL, &err);
    if (r) {
        g_variant_unref(r);
        LOG_BLE("evicted %s from BlueZ cache — a scan can re-find it", addr);
    } else if (err) {
        LOG_BLE("RemoveDevice %s failed: %s", addr, err->message);
        g_error_free(err);
    }
    g_object_unref(bus);
}

/* Clear BlueZ's cache of every DISCONNECTED peripheral matching our target
 * prefix. Run once at startup.
 *
 * Same root cause as prv_bluez_remove_device above - a device that has been
 * connected once is non-temporary and gattlib only reports one to a scan while
 * its state is NOT_FOUND - but a different moment. That eviction only fires
 * after a bind has exhausted its retries; a freshly started gateway has nothing
 * bound yet, so the peripherals it used in its previous run are simply
 * invisible and it scans forever. (Recovering by hand means bluetoothctl remove
 * on the gateway Pi, which is a poor thing to require after every restart.)
 *
 * Connected devices are left alone: one that is connected belongs to some other
 * process and must not be torn down. The adapter path is derived from each
 * device's own object path rather than assumed to be hci0. */
static void prv_bluez_evict_stale_peripherals(void)
{
    GDBusConnection *bus = g_bus_get_sync(G_BUS_TYPE_SYSTEM, NULL, NULL);
    if (bus == NULL)
        return;

    GError   *err   = NULL;
    GVariant *reply = g_dbus_connection_call_sync(
        bus, "org.bluez", "/", "org.freedesktop.DBus.ObjectManager",
        "GetManagedObjects", NULL, G_VARIANT_TYPE("(a{oa{sa{sv}}})"),
        G_DBUS_CALL_FLAGS_NONE, 5000, NULL, &err);
    if (reply == NULL) {
        if (err) {
            LOG_BLE("GetManagedObjects failed: %s", err->message);
            g_error_free(err);
        }
        g_object_unref(bus);
        return;
    }

    GVariantIter *objs = NULL;
    g_variant_get(reply, "(a{oa{sa{sv}}})", &objs);

    const char   *path;
    GVariantIter *ifaces;
    int           removed = 0;

    while (g_variant_iter_next(objs, "{&oa{sa{sv}}}", &path, &ifaces)) {
        const char   *iface;
        GVariantIter *props;

        while (g_variant_iter_next(ifaces, "{&sa{sv}}", &iface, &props)) {
            if (strcmp(iface, "org.bluez.Device1") != 0) {
                g_variant_iter_free(props);
                continue;
            }

            const char *key;
            GVariant   *val;
            char        name[64]  = {0};
            gboolean    connected = FALSE;

            while (g_variant_iter_next(props, "{&sv}", &key, &val)) {
                /* Alias defaults to Name, so whichever arrives first is fine. */
                if (name[0] == '\0' &&
                    (strcmp(key, "Alias") == 0 || strcmp(key, "Name") == 0))
                    snprintf(name, sizeof(name), "%s", g_variant_get_string(val, NULL));
                else if (strcmp(key, "Connected") == 0)
                    connected = g_variant_get_boolean(val);
                g_variant_unref(val);
            }
            g_variant_iter_free(props);

            if (connected || strncmp(name, g_prefix, strlen(g_prefix)) != 0)
                continue;

            char adapter[128];
            snprintf(adapter, sizeof(adapter), "%s", path);
            char *slash = strrchr(adapter, '/');
            if (slash == NULL)
                continue;
            *slash = '\0';

            GError   *rerr = NULL;
            GVariant *r    = g_dbus_connection_call_sync(
                bus, "org.bluez", adapter, "org.bluez.Adapter1", "RemoveDevice",
                g_variant_new("(o)", path), NULL, G_DBUS_CALL_FLAGS_NONE,
                5000, NULL, &rerr);
            if (r) {
                g_variant_unref(r);
                removed++;
            } else if (rerr) {
                LOG_BLE("startup eviction of %s failed: %s", path, rerr->message);
                g_error_free(rerr);
            }
        }
        g_variant_iter_free(ifaces);
    }

    g_variant_iter_free(objs);
    g_variant_unref(reply);
    g_object_unref(bus);

    if (removed)
        LOG_BLE("evicted %d cached '%s*' peripheral(s) at startup - scans start clean",
                removed, g_prefix);
}

/* gattlib_discovered_device_t: (adapter, addr, name, user_data).
 * Runs in gattlib's loop thread — do NOT call scan_disable from here (an
 * early stop issued from inside the callback wedges bluetoothd's discovery:
 * later scans return nothing, then error out). Just queue and let the scan
 * run out its timeout. */
static void prv_on_discovered(gattlib_adapter_t *adapter, const char *addr,
                              const char *name, void *user_data)
{
    (void)adapter; (void)user_data;
    if (!name || strncmp(name, g_prefix, strlen(g_prefix)) != 0)
        return;
    if (prv_addr_in_use(addr))
        return;
    prv_queue_candidate(addr, name, 0);
}

/* gatt_connect_cb_t: (adapter, dst, connection, error, user_data).
 * Fires (from gattlib's loop) when the async connect completes. */
static void prv_on_connect(gattlib_adapter_t *adapter, const char *dst,
                           gattlib_connection_t *connection, int error,
                           void *user_data)
{
    (void)adapter;
    ble_chan_t *ch = (ble_chan_t *)user_data;

    /* Filter stale/duplicate events. gattlib leaves a watcher behind for
     * every connect attempt, and attempts that already FAILED fire again —
     * with success — once the device finally connects (observed on hardware
     * after retries: 4x "connected", 4 notification subscriptions, every
     * frame quadrupled, auth wrecked). Only the one in-flight attempt for
     * this channel's currently-bound address may settle it. */
    if (!ch->connecting || ch->connected || ch->drop ||
        (dst && ch->addr[0] && strcmp(ch->addr, dst) != 0)) {
        LOG_BLE("[ch%d] stale connect event (%s) ignored",
                ch->idx, dst ? dst : "?");
        return;
    }

    /* NOTE: ch->connecting must stay TRUE until the channel state is final.
     * The task thread treats (!connected && !connecting) as a free channel —
     * clearing 'connecting' before 'connected' opens a window where the next
     * queued candidate gets bound onto THIS channel, stomping its state
     * (observed on hardware: both peripherals bound to ch0, link wrecked). */

    if (error != GATTLIB_SUCCESS || connection == NULL) {
        /* Re-queue directly (with a retry cap) instead of relying on a
         * re-scan: bluetoothd won't re-report a cached device. */
        if (ch->tries + 1 < CAND_TRIES_MAX) {
            LOG_BLE("[ch%d] connect to %s failed (error=%d) — re-queued (try %d/%d)",
                    ch->idx, ch->addr, error, ch->tries + 1, CAND_TRIES_MAX);
            prv_queue_candidate(ch->addr, ch->name, ch->tries + 1);
        } else {
            LOG_BLE("[ch%d] connect to %s failed (error=%d) — giving up on it",
                    ch->idx, ch->addr, error);
            prv_bluez_remove_device(ch->addr);   /* so a scan can re-find it */
            gw_presence_lost(ch->addr);          /* retained "offline" in TrustBridge */
        }
        ch->addr[0] = '\0';    /* unbind the channel */
        ch->name[0] = '\0';
        ch->connecting = false;   /* frees the channel — must be LAST */
        return;
    }

    pthread_mutex_lock(&ch->conn_lock);
    ch->conn = connection;
    pthread_mutex_unlock(&ch->conn_lock);

    gattlib_register_on_disconnect(connection, prv_on_disconnect, ch);
    gattlib_register_notification(connection, prv_on_notification, ch);

    int sub = gattlib_notification_start(connection, &g_tx_uuid);
    if (sub != GATTLIB_SUCCESS) {
        /* Do NOT call gattlib_disconnect() from here: this callback runs in
         * gattlib's loop thread, and a re-entrant disconnect corrupts its
         * connection bookkeeping (observed: g_object_unref assertion +
         * double free on the retry). Flag the channel; the task thread does
         * the disconnect + re-queue. 'connecting' stays true meanwhile.
         * Common cause of the failure itself: NUS characteristic missing
         * because the peripheral registered its GATT app with a bluetoothd
         * that was since restarted. */
        LOG_BLE("[ch%d] failed to subscribe to NUS TX on %s (rc=%d) — dropping link",
                ch->idx, ch->addr, sub);
        ch->drop = true;
        return;
    }

    ch->acc_len = 0;
    ch->connected  = true;        /* mark ready BEFORE freeing 'connecting' */
    ch->connecting = false;
    LOG_BLE("[ch%d] connected to %s @ %s, subscribed to NUS — link ready",
            ch->idx, ch->name, ch->addr);
}

/* How many channels have neither a connection nor one in flight? */
/* True while any channel is mid-exchange. Discovery on these Pis destabilises
 * links that are already up, and a scan that drops the link during an auth run
 * costs the whole run: the device aborts, and the gateway throws away a verdict
 * CyberRock has already issued. A spare channel that can never bind (more
 * GW_BLE_DEVICES than devices present) would otherwise scan straight through
 * every session. Waiting costs only the delay until the session ends. */
static bool prv_any_session_active(void)
{
    for (int i = 0; i < MAX_DEVICES; i++)
        if (chans[i].in_session) return true;
    return false;
}

/* True while at least one channel holds a live link. */
static bool prv_any_connected(void)
{
    for (int i = 0; i < MAX_DEVICES; i++)
        if (chans[i].connected) return true;
    return false;
}

static int prv_free_channels(void)
{
    int n = 0;
    for (int i = 0; i < MAX_DEVICES; i++)
        if (!chans[i].connected && !chans[i].connecting) n++;
    return n;
}

/* Run one scan pass to (re)fill the candidate queue. Runs in the BLE task
 * thread (NOT gattlib's loop thread), so the blocking scan is fine. */
static int prv_scan(void)
{
    pthread_mutex_lock(&g_scan_lock);
    g_scan_want = prv_free_channels();
    pthread_mutex_unlock(&g_scan_lock);

    /* Non-blocking enable with NO gattlib-side timeout; we time the scan
     * ourselves and stop it while gattlib still considers it running.
     * Rationale (pinned gattlib commit): its scan-timeout path only clears
     * the internal is_scanning flag — it never issues StopDiscovery — and
     * gattlib_adapter_scan_disable() SKIPS StopDiscovery once is_scanning is
     * false. The blocking+timeout API therefore leaked the BlueZ discovery
     * session on every scan, and each later StartDiscovery failed with
     * org.bluez.Error.InProgress — the endless "scan failed (rc=268476708)"
     * spam. Stopping while is_scanning is still true makes scan_disable
     * actually call StopDiscovery. */
    int rc = gattlib_adapter_scan_enable_with_filter_non_blocking(
                 g_adapter, NULL, 0, GATTLIB_DISCOVER_FILTER_USE_NONE,
                 prv_on_discovered, 0 /* no gattlib timeout */, NULL);
    if (rc != GATTLIB_SUCCESS) {
        LOG_BLE("scan failed (rc=%d) — resetting discovery", rc);
        gattlib_adapter_scan_disable(g_adapter);   /* clear a stuck discovery */
        return -1;
    }
    sleep(SCAN_SECONDS);
    gattlib_adapter_scan_disable(g_adapter);   /* stops discovery for real */

    pthread_mutex_lock(&g_scan_lock);
    bool none = (g_cand_count == 0);
    pthread_mutex_unlock(&g_scan_lock);
    if (none) {
        LOG_BLE("no unbound '%s*' peripheral found in scan (%d channel(s) waiting)",
                g_prefix, prv_free_channels());
        return -1;
    }
    return 0;
}

/* Bind the oldest queued candidate to the first free channel and kick off its
 * async connect (completion in prv_on_connect). One connect in flight at a
 * time keeps the BlueZ stack happy; the queue holds the rest.
 * Returns true if there was a candidate to try (kickoff attempted). */
static bool prv_connect_next(void)
{
    ble_chan_t *ch = NULL;
    for (int i = 0; i < MAX_DEVICES; i++)
        if (!chans[i].connected && !chans[i].connecting) { ch = &chans[i]; break; }
    if (ch == NULL)
        return true;   /* raced: everything got bound meanwhile — nothing to do */

    char addr[64], name[32];
    int  tries;
    do {
        if (!prv_pop_candidate(addr, sizeof(addr), name, sizeof(name), &tries))
            return false;   /* queue empty — caller should scan */
    } while (prv_addr_in_use(addr));   /* discard: already bound elsewhere */

    snprintf(ch->addr, sizeof(ch->addr), "%s", addr);
    snprintf(ch->name, sizeof(ch->name), "%s", name);
    ch->tries = tries;
    ch->connecting = true;
    int rc = gattlib_connect(g_adapter, ch->addr,
                             GATTLIB_CONNECTION_OPTIONS_LEGACY_DEFAULT,
                             prv_on_connect, ch);
    if (rc != GATTLIB_SUCCESS) {
        /* The failure callback usually fires for this too (gattlib reports a
         * failed attempt both ways) and may already have re-queued and
         * cleared the channel — so work from the LOCAL copies; the queue's
         * dedup-by-MAC makes a double requeue harmless. */
        LOG_BLE("[ch%d] connect kickoff to %s failed (rc=%d)", ch->idx, addr, rc);
        if (tries + 1 < CAND_TRIES_MAX) {
            prv_queue_candidate(addr, name, tries + 1);
        } else {
            prv_bluez_remove_device(addr);   /* so a scan can re-find it */
            gw_presence_lost(addr);          /* retained "offline" in TrustBridge */
        }
        ch->addr[0] = '\0';
        ch->name[0] = '\0';
        ch->connecting = false;   /* frees the channel — must be LAST */
    } else {
        LOG_BLE("[ch%d] connecting to %s @ %s ...", ch->idx, ch->name, ch->addr);
    }
    return true;
}

/* Pause between scans, after N scans in a row that found nothing.
 *
 * Two ladders, because a scan does not cost the same in both states. With no
 * link up a scan is free and a device should be picked up fast: 2s, 5s, 10s,
 * 30s, 60s. With a link already up every scan is a gamble with that link -
 * discovery starves an established connection on these adapters and BlueZ
 * drops it a few seconds later. Observed on hardware: a spare channel ran the
 * 2/5/10s ladder and the live link died at the end of it, every single time,
 * which then cost the auth run that followed. A channel that can never be
 * filled (GW_BLE_DEVICES higher than the number of devices actually present)
 * would otherwise keep paying that price for the lifetime of the process, so
 * with a link up the ladder climbs out of the way: 2s, 5s, 30s, 120s, 600s.
 * Nothing is lost that matters: a known device coming back is reconnected
 * straight from the candidate queue with no scan at all, and a genuinely new
 * one is still picked up within the top rung. */
#define SCAN_LADDER_STEPS 5
static int prv_scan_backoff_s(int empty_scans, bool link_up)
{
    static const int steps[SCAN_LADDER_STEPS]    = { 2, 5, 10, 30,  60 };
    static const int steps_up[SCAN_LADDER_STEPS] = { 2, 5, 30, 120, 600 };
    const int       *ladder = link_up ? steps_up : steps;

    if (empty_scans < 1)
        empty_scans = 1;
    return (empty_scans >= SCAN_LADDER_STEPS) ? ladder[SCAN_LADDER_STEPS - 1]
                                              : ladder[empty_scans - 1];
}

/* sleep(), but responsive: a backoff of minutes must not stall the reconnect
 * of a link that drops one second into it. */
static void prv_sleep_interruptible(int seconds)
{
    for (int i = 0; i < seconds && g_started; i++) {
        pthread_mutex_lock(&g_scan_lock);
        bool pending = (g_cand_count > 0);
        pthread_mutex_unlock(&g_scan_lock);
        if (pending)
            return;
        sleep(1);
    }
}

/* BLE worker task — passed to gattlib_mainloop(); runs in gattlib's worker
 * thread while gattlib runs the GLib loop. Keeps every channel's connection
 * up and rebinds whenever a link drops. */
static void *prv_ble_task(void *arg)
{
    (void)arg;
    int empty_scans = 0;

    if (gattlib_adapter_open(NULL, &g_adapter) != GATTLIB_SUCCESS) {
        LOG_BLE("failed to open BLE adapter (is bluetoothd running?)");
        return NULL;
    }
    LOG_BLE("BLE central started — %d channel(s), scanning for '%s*'",
            MAX_DEVICES, g_prefix);

    while (g_started) {
        /* Tear down links flagged by the connect callback (subscribe failed).
         * The disconnect must happen HERE, not in gattlib's loop thread. */
        for (int i = 0; i < MAX_DEVICES; i++) {
            ble_chan_t *ch = &chans[i];
            if (!ch->drop)
                continue;
            char addr[64], name[32];
            snprintf(addr, sizeof(addr), "%s", ch->addr);
            snprintf(name, sizeof(name), "%s", ch->name);
            pthread_mutex_lock(&ch->conn_lock);
            if (ch->conn) {
                gattlib_disconnect(ch->conn, false);
                ch->conn = NULL;
            }
            pthread_mutex_unlock(&ch->conn_lock);
            if (addr[0] && ch->tries + 1 < CAND_TRIES_MAX) {
                LOG_BLE("[ch%d] re-queued %s (try %d/%d)",
                        ch->idx, addr, ch->tries + 1, CAND_TRIES_MAX);
                prv_queue_candidate(addr, name, ch->tries + 1);
            } else if (addr[0]) {
                prv_bluez_remove_device(addr);   /* so a scan can re-find it */
                gw_presence_lost(addr);          /* retained "offline" in TrustBridge */
            }
            ch->addr[0] = '\0';
            ch->name[0] = '\0';
            ch->connected  = false;
            ch->in_session = false;
            ch->drop       = false;
            ch->connecting = false;   /* frees the channel — must be LAST */
        }

        bool any_connecting = false;
        for (int i = 0; i < MAX_DEVICES; i++)
            if (chans[i].connecting) any_connecting = true;

        if (prv_any_session_active()) {
            /* Hold the radio still until the exchange finishes. Reconnects of
             * an already-known MAC still happen above via the candidate queue;
             * it is only the discovery scan that has to wait. */
            sleep(1);
            continue;
        }

        if (!any_connecting && prv_free_channels() > 0) {
            /* Drain the candidate queue first; scan only when it runs dry
             * (a scan pass won't re-report bluetoothd-cached devices). */
            if (prv_connect_next()) {
                /* NOTE: the ladder deliberately does NOT reset here. A queued
                 * candidate is almost always a known MAC coming back after a
                 * drop, which needs no scan at all. Resetting on it puts the
                 * spare channel straight back on the fast rungs and the next
                 * scan kills the link again - the connect/drop loop seen on
                 * hardware. Only a scan that actually finds something (below)
                 * is evidence that scanning is paying for itself. */
                (void)0;
            } else if (prv_scan() != 0) {
                int backoff = prv_scan_backoff_s(++empty_scans,
                                                 prv_any_connected());
                if (empty_scans == 3 || empty_scans == SCAN_LADDER_STEPS)
                    LOG_BLE("nothing found in %d scans - backing off to %ds "
                            "between scans until a device shows up",
                            empty_scans, backoff);
                prv_sleep_interruptible(backoff);
                continue;
            } else {
                empty_scans = 0;          /* the scan turned something up */
            }
        }
        sleep(1);   /* all bound, or waiting for an async connect to resolve */
    }

    for (int i = 0; i < MAX_DEVICES; i++) {
        ble_chan_t *ch = &chans[i];
        pthread_mutex_lock(&ch->conn_lock);
        if (ch->conn) {
            gattlib_disconnect(ch->conn, false);
            ch->conn = NULL;
        }
        pthread_mutex_unlock(&ch->conn_lock);
    }
    g_task_done = true;
    return NULL;
}

/* The pthread that hands control to gattlib's main loop. gattlib_mainloop()
 * runs the GLib loop here and invokes prv_ble_task in its own worker thread;
 * it blocks until gattlib_mainloop_quit() (we run for the process lifetime). */
static void *prv_mainloop_thread(void *arg)
{
    (void)arg;
    gattlib_mainloop(prv_ble_task, NULL);
    return NULL;
}

/* ── Trigger proxy: TrustBridge -> board ───────────────────────────────────
 * gw_presence.c subscribes to cmd/run_auth for every board that asked for the
 * proxy in its HELLO and calls this with the board's MAC. We relay it down that
 * channel's NUS link as a "RUN_AUTH <mode>" control line - the exact mirror of
 * the board's own HELLO/OPEN/CLOSE lines, opposite direction. The board runs
 * the authentication as if its menu key had been pressed; everything after that
 * (gw_log, auth_result) is the gateway's normal device-relay path.
 *
 * Runs on a mosquitto thread: it must not block, and it shares the channel's
 * conn_lock with the FSM's own writes. If a session is already in flight the
 * board's own busy guard rejects the extra trigger.
 *
 * This is the BLE implementation of the transport-agnostic forwarder declared in
 * port_comm_device.h (port_comm_device.c has the TCP one), so main_gw.c can
 * register it without knowing which transport it was built against. */
void port_comm_device_forward_run_auth(const char *mac, int mode)
{
    ble_chan_t *ch = NULL;
    for (int i = 0; i < MAX_DEVICES; i++) {
        if (chans[i].connected && strcmp(chans[i].addr, mac) == 0) {
            ch = &chans[i];
            break;
        }
    }
    if (ch == NULL) {
        LOG_BLE("RUN_AUTH for %s dropped - no connected channel", mac);
        return;
    }

    uint8_t line[32];
    int n = snprintf((char *)line, sizeof(line), "RUN_AUTH %d\n", mode);
    if (n <= 0)
        return;

    pthread_mutex_lock(&ch->conn_lock);
    int rc = -1;
    if (ch->conn) {
        rc = gattlib_write_without_response_char_by_uuid(ch->conn, &g_rx_uuid,
                                                         line, (size_t)n);
    }
    pthread_mutex_unlock(&ch->conn_lock);

    if (rc != GATTLIB_SUCCESS)
        LOG_BLE("[ch%d] RUN_AUTH write failed (rc=%d)", ch->idx, rc);
    else
        LOG_BLE("[ch%d] RUN_AUTH mode %d -> %s", ch->idx, mode,
                ch->name[0] ? ch->name : ch->addr);
}

/* =============================================================================
 * port_comm_device interface
 * ============================================================================= */
static ble_chan_t *prv_chan(port_comm_device_t *ctx)
{
    int idx = (int)ctx->listen_fd;
    if (idx < 0 || idx >= MAX_DEVICES)
        return NULL;
    return &chans[idx];
}

bool port_comm_device_init(port_comm_device_t *ctx, const char *device_id)
{
    if (ctx == NULL || device_id == NULL)
        return false;

    /* Map "channel_N" (or legacy "server" = channel_0) to a channel slot. */
    int idx = 0;
    if (strncmp(device_id, "channel_", 8) == 0)
        idx = atoi(device_id + 8);
    else if (strcmp(device_id, "server") != 0)
        return true;   /* unknown id — inert channel, receive reports NO_DATA */
    if (idx < 0 || idx >= MAX_DEVICES) {
        LOG_BLE("init: %s out of range (MAX_DEVICES=%d)", device_id, MAX_DEVICES);
        return false;
    }
    ctx->listen_fd = idx;   /* stash the channel index for send/receive */

    ble_chan_t *ch = &chans[idx];
    pthread_mutex_init(&ch->q_lock, NULL);
    pthread_mutex_init(&ch->conn_lock, NULL);
    ch->head = ch->tail = ch->count = 0;
    ch->acc_len = 0;
    ch->connected  = false;
    ch->connecting = false;
    ch->addr[0] = ch->name[0] = '\0';
    ch->idx = idx;

    if (g_started)
        return true;   /* shared BLE thread already up */

    const char *p = getenv("BLE_TARGET_PREFIX");
    if (p && *p) g_prefix = p;

    /* Drop bluetoothd's cached objects for our peripherals before the first
     * scan, or a restarted gateway can never re-discover the devices it was
     * talking to a moment ago. */
    prv_bluez_evict_stale_peripherals();

    /* Let the MQTT side push TrustBridge's cmd/run_auth triggers back down the
     * BLE links (only for boards that requested it in their HELLO). main_gw.c
     * registers the same forwarder too; doing it here as well closes the window
     * between this init (which starts scanning) and that call. */
    gw_presence_set_trigger_handler(port_comm_device_forward_run_auth);

    if (gattlib_string_to_uuid(NUS_TX_UUID, strlen(NUS_TX_UUID) + 1, &g_tx_uuid) != 0 ||
        gattlib_string_to_uuid(NUS_RX_UUID, strlen(NUS_RX_UUID) + 1, &g_rx_uuid) != 0) {
        LOG_BLE("bad NUS UUID");
        return false;
    }

    g_started = true;
    /* Adapter is opened inside the gattlib loop context (prv_ble_task). */
    if (pthread_create(&g_thread, NULL, prv_mainloop_thread, NULL) != 0) {
        LOG_BLE("failed to start BLE mainloop thread");
        g_started = false;
        return false;
    }

    LOG_BLE("BLE central init — connections established asynchronously");
    return true;   /* connections come up asynchronously (like TCP accepts) */
}

bool port_comm_device_send(port_comm_device_t *ctx, const uint8_t *buffer_tx,
                           uint16_t buffer_tx_size)
{
    if (ctx == NULL || buffer_tx == NULL || buffer_tx_size == 0)
        return false;
    ble_chan_t *ch = prv_chan(ctx);
    if (ch == NULL || !ch->connected)
        return false;

    /* Frame = JSON + '\n' (the device splits inbound NUS data on newlines). */
    uint8_t frame[BLE_LINE_MAX];
    if ((size_t)buffer_tx_size + 1 > sizeof(frame))
        return false;
    memcpy(frame, buffer_tx, buffer_tx_size);
    frame[buffer_tx_size] = '\n';

    pthread_mutex_lock(&ch->conn_lock);
    int rc = -1;
    if (ch->conn) {
        rc = gattlib_write_without_response_char_by_uuid(
                 ch->conn, &g_rx_uuid, frame, buffer_tx_size + 1);
    }
    pthread_mutex_unlock(&ch->conn_lock);

    if (rc != GATTLIB_SUCCESS) {
        LOG_BLE("[ch%d] NUS write failed (rc=%d)", ch->idx, rc);
        return false;
    }
    return true;
}

bool port_comm_device_receive(port_comm_device_t *ctx, uint8_t *buffer_rx,
                              uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    if (ctx == NULL || buffer_rx == NULL || buffer_rx_received_size == NULL)
        return false;

    *buffer_rx_received_size = 0;

    ble_chan_t *ch = prv_chan(ctx);
    if (ch == NULL)
        return true;   /* inert channel — NO_DATA */

    uint16_t len = 0;
    if (prv_q_pop(ch, buffer_rx, buffer_rx_size, &len)) {
        /* OPEN/CLOSE are session markers (TCP accept/close equivalents) — the
         * gateway FSM never sees them; surface as NO_DATA so it just polls on. */
        if (len == 4 && memcmp(buffer_rx, "OPEN", 4) == 0) {
            LOG_BLE("[ch%d] session OPEN (device connected)", ch->idx);
            ch->in_session = true;
            return true;   /* size 0 */
        }
        if (len == 5 && memcmp(buffer_rx, "CLOSE", 5) == 0) {
            LOG_BLE("[ch%d] session CLOSE (device done)", ch->idx);
            ch->in_session = false;
            return true;   /* size 0 */
        }
        if (len > 6 && memcmp(buffer_rx, "HELLO ", 6) == 0) {
            /* Presence announcement: the board identifies itself right after
             * link-up (its auth frames would reveal the TID too - but only
             * once an auth runs, and presence is what TRIGGERS auto-auth).
             * Proxy it to MQTT as a retained "online".
             *
             * Format: "HELLO <tid>[ <capability>...]". TRIGGER means the board
             * has no MQTT client of its own and wants the gateway to subscribe
             * to its cmd/run_auth topic and relay triggers back down this link
             * (see gw_presence.c). Devices that run their own listener omit it. */
            char rest[128];
            uint16_t rlen = (uint16_t)(len - 6);
            if (rlen >= sizeof(rest))
                rlen = sizeof(rest) - 1;
            memcpy(rest, buffer_rx + 6, rlen);
            rest[rlen] = '\0';

            char tid[65];
            const char *sp   = strchr(rest, ' ');
            size_t      tlen = sp ? (size_t)(sp - rest) : strlen(rest);
            if (tlen >= sizeof(tid))
                tlen = sizeof(tid) - 1;
            memcpy(tid, rest, tlen);
            tid[tlen] = '\0';
            bool wants_trigger = (sp != NULL && strstr(sp, " TRIGGER") != NULL);

            LOG_BLE("[ch%d] HELLO from %s - TID %.8s... (marking online%s)",
                    ch->idx, ch->name[0] ? ch->name : ch->addr, tid,
                    wants_trigger ? ", trigger proxy requested" : "");
            gw_presence_online(ch->addr, tid, wants_trigger);
            return true;   /* size 0 - control line, never reaches the FSM */
        }
        *buffer_rx_received_size = len;
        return true;
    }

    /* No data — be gentle on the CPU since the gateway main loop hot-polls
     * every channel. Keep the sleep short so N channels still poll quickly. */
    usleep(1000);
    return true;
}

bool port_comm_device_is_ready(port_comm_device_t *ctx)
{
    if (ctx == NULL)
        return false;
    ble_chan_t *ch = prv_chan(ctx);
    if (ch == NULL)
        return false;
    bool ready;
    pthread_mutex_lock(&ch->q_lock);
    ready = (ch->count > 0);
    pthread_mutex_unlock(&ch->q_lock);
    return ch->connected && ready;
}

void port_comm_device_close(port_comm_device_t *ctx)
{
    (void)ctx;
    /* Per-session close from the gateway FSM. Over BLE the link is persistent
     * and shared across Phase 1 / Phase 2 / future auths, so we keep it up —
     * the device's own OPEN/CLOSE markers delimit sessions. Nothing to do. */
}

void port_comm_device_shutdown(void)
{
    /* Release the BLE links before the process exits.
     *
     * Without this, a SIGTERM - which is how systemd restarts the service -
     * kills the process with the ACL still up. BlueZ keeps the connection, and
     * a peripheral holding a leftover connection cannot re-advertise, so the
     * device vanishes until someone disconnects it by hand. That was reported
     * from the field as "after a gateway restart the device can never be
     * re-discovered".
     *
     * prv_ble_task already disconnects every channel once g_started goes false,
     * so this only has to ask it to and wait. The wait is bounded: a wedged
     * gattlib must not be able to hang the exit. */
    if (!g_started)
        return;

    g_started = false;
    for (int i = 0; i < 30 && !g_task_done; i++)
        usleep(100 * 1000);

    /* The GLib loop is deliberately left running: every channel is already
     * disconnected by now, which is the whole point, and the process exits
     * immediately after. Tearing the loop down as well would add a gattlib
     * call on the exit path for no benefit. */
}
