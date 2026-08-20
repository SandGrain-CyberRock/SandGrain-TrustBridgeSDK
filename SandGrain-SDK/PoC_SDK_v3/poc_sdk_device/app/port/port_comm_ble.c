/* =============================================================================
 * port_comm_ble.c — device<->gateway transport over Bluetooth LE (NUS) on Linux
 *
 * Drop-in replacement for the TCP port_comm.c on a Raspberry Pi / Linux device:
 * makes the Pi look, on the air, exactly like the nRF54L15 board — a BLE
 * peripheral advertising "SandGrain-Dev" and exposing the Nordic UART Service.
 * The gateway (BLE central) and the cloud are UNCHANGED.
 *
 *   Selected by `make DEV_BLE=1` (Linux/BlueZ only). Implements the SDK's
 *   port_comm.h contract (init/send/receive/close) that the auth FSM calls.
 *
 * Wire format (identical to the board's Zephyr port_comm.c, so the gateway
 * central can't tell the difference):
 *     device -> gw :  "HELLO <tid>[ TRIGGER]\n"
 *                                 (once per link-up — presence announce; the
 *                                  optional TRIGGER capability asks the gateway
 *                                  to relay our cmd/run_auth topic as well)
 *                     "OPEN\n"    (port_comm_init  — start of a session)
 *                     "CLOSE\n"   (port_comm_close — end of a session)
 *                     "<json>\n"  (port_comm_send  — one frame per NUS packet)
 *     gw -> device :  "RUN_AUTH <mode>\n"
 *                                 (TrustBridge triggered an authentication;
 *                                  consumed here, never seen by the SDK)
 *                     "<json>\n"  (gateway frames, reassembled by newline)
 *
 * gattlib (used by the gateway) is central-only, so we drive BlueZ directly
 * over D-Bus (GLib/GIO): a GATT server (GattManager1.RegisterApplication) + an
 * LE advertisement (LEAdvertisingManager1). Notifications on the TX
 * characteristic are delivered the classic BlueZ way — PropertiesChanged on the
 * "Value" property while the central is subscribed.
 *
 * Threading: a background thread owns a private GMainContext + GMainLoop and
 * does all D-Bus work. The RX write callback (BLE thread) reassembles complete
 * newline-delimited lines and pushes them to a thread-safe queue; the SDK/main
 * thread drains that queue in port_comm_receive. The BLE link comes up from a
 * constructor at process start, so main_device.c needs no changes.
 * ============================================================================= */
#include "port_comm.h"     /* SDK port_comm_ctx_t + the 4 prototypes */
#include "fi_device.h"     /* menu options 2/3: fault injection on the frames */

#include <gio/gio.h>
#include <glib.h>
#include <glib-unix.h>
#include <pthread.h>
#include <signal.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <poll.h>
#include <sys/socket.h>

/* ── BlueZ ── */
#define BLUEZ_BUS_NAME   "org.bluez"

/* ── Exported object tree ── */
#define APP_PATH         "/org/sandgrain/app"
#define SERVICE_PATH     "/org/sandgrain/app/service0"
#define CHAR_TX_PATH     "/org/sandgrain/app/service0/char_tx"
#define CHAR_RX_PATH     "/org/sandgrain/app/service0/char_rx"
#define ADV_PATH         "/org/sandgrain/adv0"

/* ── Nordic UART Service UUIDs (must match the board and the gateway central) ─ */
#define NUS_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  /* periph notifies */
#define NUS_RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  /* periph is written */

/* Advertised name. Override with env BLE_NAME (e.g. "SandGrain-Dev2") when
 * several devices run against a multi-device gateway — the gateway central
 * matches any name starting with "SandGrain-Dev". Max 29 bytes (the complete
 * name AD structure must fit the 31-byte scan response). */
#define DEVICE_NAME_DEFAULT "SandGrain-Dev"
static const char *device_name(void)
{
    static char buf[30];
    if (!buf[0]) {
        const char *n = getenv("BLE_NAME");
        snprintf(buf, sizeof(buf), "%s", (n && *n) ? n : DEVICE_NAME_DEFAULT);
    }
    return buf;
}
#define DEVICE_NAME device_name()

#define GATT_CHRC_IFACE  "org.bluez.GattCharacteristic1"
#define GATT_SVC_IFACE   "org.bluez.GattService1"
#define ADV_IFACE        "org.bluez.LEAdvertisement1"
#define OM_IFACE         "org.freedesktop.DBus.ObjectManager"

#define BLE_LINE_MAX         512    /* longest single frame (JSON + framing)   */

#if defined(PORT_COMM_DEBUG) && PORT_COMM_DEBUG == 1
    #define LOG(fmt, ...)  fprintf(stderr, "[COMM_BLE] " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG(fmt, ...)  do {} while (0)
#endif
#define LOGE(fmt, ...)     fprintf(stderr, "[COMM_BLE] " fmt "\n", ##__VA_ARGS__)

/* ── One inbound frame handed from the BLE thread to the SDK thread ── */
typedef struct { uint16_t len; uint8_t data[BLE_LINE_MAX]; } rx_line_t;

/* ── Module state ──────────────────────────────────────────────────────────
 * g_conn / g_loop are touched only on the BLE thread after startup. The
 * cross-thread channels are rx_q (GAsyncQueue, thread-safe) and the two
 * gint flags accessed atomically. */
static pthread_t         ble_thread;
static GMainContext     *ble_ctx;
static GMainLoop        *ble_loop;
static GDBusConnection  *g_conn;
static GDBusNodeInfo    *node_info;
static const char       *adapter_path = "/org/bluez/hci0";

static GAsyncQueue      *rx_q;                 /* rx_line_t* produced by BLE thread */
static volatile gint     tx_notifying = 0;     /* central subscribed to TX          */
static volatile gint     ble_up       = 0;     /* GATT app + advertisement registered */
static volatile gint     adv_via_dbus = 0;     /* adv registered via bluetoothd (not mgmt) */
static int               reg_gen      = 0;     /* bluetoothd incarnation counter (BLE thread only) */

/* Line assembly for inbound writes (BLE thread only). */
static uint8_t  rx_acc[BLE_LINE_MAX];
static uint16_t rx_acc_len;

/* -------------------------------------------------------------------------- */
/* Introspection                                                              */
/* -------------------------------------------------------------------------- */
static const char introspection_xml[] =
    "<node>"
    "  <interface name='org.freedesktop.DBus.ObjectManager'>"
    "    <method name='GetManagedObjects'>"
    "      <arg type='a{oa{sa{sv}}}' name='objects' direction='out'/>"
    "    </method>"
    "  </interface>"
    "  <interface name='org.bluez.GattService1'>"
    "    <property name='UUID' type='s' access='read'/>"
    "    <property name='Primary' type='b' access='read'/>"
    "  </interface>"
    "  <interface name='org.bluez.GattCharacteristic1'>"
    "    <method name='ReadValue'>"
    "      <arg type='a{sv}' name='options' direction='in'/>"
    "      <arg type='ay' name='value' direction='out'/>"
    "    </method>"
    "    <method name='WriteValue'>"
    "      <arg type='ay' name='value' direction='in'/>"
    "      <arg type='a{sv}' name='options' direction='in'/>"
    "    </method>"
    "    <method name='StartNotify'/>"
    "    <method name='StopNotify'/>"
    "    <property name='UUID' type='s' access='read'/>"
    "    <property name='Service' type='o' access='read'/>"
    "    <property name='Flags' type='as' access='read'/>"
    "    <property name='Notifying' type='b' access='read'/>"
    "    <property name='Value' type='ay' access='read'/>"
    "  </interface>"
    "  <interface name='org.bluez.LEAdvertisement1'>"
    "    <method name='Release'/>"
    "    <property name='Type' type='s' access='read'/>"
    "    <property name='LocalName' type='s' access='read'/>"
    "    <property name='ServiceUUIDs' type='as' access='read'/>"
    "  </interface>"
    "</node>";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
static GVariant *bytes_to_ay(const guint8 *data, gsize len)
{
    return g_variant_new_fixed_array(G_VARIANT_TYPE_BYTE, data, len, sizeof(guint8));
}

static GVariant *strv_as(const char *const *v)
{
    GVariantBuilder b;
    g_variant_builder_init(&b, G_VARIANT_TYPE("as"));
    for (int i = 0; v[i]; i++) g_variant_builder_add(&b, "s", v[i]);
    return g_variant_builder_end(&b);
}

static const char *const TX_FLAGS[] = { "notify", NULL };
static const char *const RX_FLAGS[] = { "write", "write-without-response", NULL };

/* Emit a notification on TX (called from the SDK thread). g_dbus_connection is
 * thread-safe for sending; if notifications ever flake under load, marshal this
 * onto the BLE thread with g_main_context_invoke(ble_ctx, ...). */
static gboolean tx_notify(const guint8 *data, gsize len)
{
    if (!g_atomic_int_get(&tx_notifying) || g_conn == NULL) {
        LOGE("TX not subscribed — dropping %zu bytes", len);
        return FALSE;
    }
    GVariantBuilder changed, invalidated;
    g_variant_builder_init(&changed, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&changed, "{sv}", "Value", bytes_to_ay(data, len));
    g_variant_builder_init(&invalidated, G_VARIANT_TYPE("as"));

    GError *err = NULL;
    g_dbus_connection_emit_signal(g_conn, NULL, CHAR_TX_PATH,
                                  "org.freedesktop.DBus.Properties", "PropertiesChanged",
                                  g_variant_new("(sa{sv}as)", GATT_CHRC_IFACE,
                                                &changed, &invalidated), &err);
    if (err) { LOGE("notify failed: %s", err->message); g_error_free(err); return FALSE; }
    return TRUE;
}

/* -------------------------------------------------------------------------- */
/* Property getters                                                           */
/* -------------------------------------------------------------------------- */
static GVariant *get_property(GDBusConnection *c, const char *sender,
                              const char *object_path, const char *iface,
                              const char *prop, GError **error, gpointer u)
{
    (void)c; (void)sender; (void)iface; (void)u;

    if (g_strcmp0(object_path, SERVICE_PATH) == 0) {
        if (!g_strcmp0(prop, "UUID"))    return g_variant_new_string(NUS_SERVICE_UUID);
        if (!g_strcmp0(prop, "Primary")) return g_variant_new_boolean(TRUE);
    } else if (g_strcmp0(object_path, CHAR_TX_PATH) == 0) {
        if (!g_strcmp0(prop, "UUID"))      return g_variant_new_string(NUS_TX_UUID);
        if (!g_strcmp0(prop, "Service"))   return g_variant_new_object_path(SERVICE_PATH);
        if (!g_strcmp0(prop, "Flags"))     return strv_as(TX_FLAGS);
        if (!g_strcmp0(prop, "Notifying")) return g_variant_new_boolean(g_atomic_int_get(&tx_notifying));
        if (!g_strcmp0(prop, "Value"))     return bytes_to_ay(NULL, 0);
    } else if (g_strcmp0(object_path, CHAR_RX_PATH) == 0) {
        if (!g_strcmp0(prop, "UUID"))      return g_variant_new_string(NUS_RX_UUID);
        if (!g_strcmp0(prop, "Service"))   return g_variant_new_object_path(SERVICE_PATH);
        if (!g_strcmp0(prop, "Flags"))     return strv_as(RX_FLAGS);
        if (!g_strcmp0(prop, "Notifying")) return g_variant_new_boolean(FALSE);
        if (!g_strcmp0(prop, "Value"))     return bytes_to_ay(NULL, 0);
    } else if (g_strcmp0(object_path, ADV_PATH) == 0) {
        if (!g_strcmp0(prop, "Type"))      return g_variant_new_string("peripheral");
        if (!g_strcmp0(prop, "LocalName")) return g_variant_new_string(DEVICE_NAME);
        if (!g_strcmp0(prop, "ServiceUUIDs")) {
            const char *const uuids[] = { NUS_SERVICE_UUID, NULL };
            return strv_as(uuids);
        }
    }
    g_set_error(error, G_DBUS_ERROR, G_DBUS_ERROR_UNKNOWN_PROPERTY,
                "No such property %s on %s", prop, object_path);
    return NULL;
}

/* -------------------------------------------------------------------------- */
/* GetManagedObjects                                                          */
/* -------------------------------------------------------------------------- */
static void add_char(GVariantBuilder *objs, const char *path, const char *uuid,
                     const char *const *flags)
{
    GVariantBuilder ifaces, props;
    g_variant_builder_init(&ifaces, G_VARIANT_TYPE("a{sa{sv}}"));
    g_variant_builder_init(&props,  G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&props, "{sv}", "UUID",      g_variant_new_string(uuid));
    g_variant_builder_add(&props, "{sv}", "Service",   g_variant_new_object_path(SERVICE_PATH));
    g_variant_builder_add(&props, "{sv}", "Flags",     strv_as(flags));
    g_variant_builder_add(&props, "{sv}", "Notifying", g_variant_new_boolean(FALSE));
    g_variant_builder_add(&props, "{sv}", "Value",     bytes_to_ay(NULL, 0));
    g_variant_builder_add(&ifaces, "{sa{sv}}", GATT_CHRC_IFACE, &props);
    g_variant_builder_add(objs, "{oa{sa{sv}}}", path, &ifaces);
}

static GVariant *build_managed_objects(void)
{
    GVariantBuilder objs;
    g_variant_builder_init(&objs, G_VARIANT_TYPE("a{oa{sa{sv}}}"));

    GVariantBuilder svc_ifaces, svc_props;
    g_variant_builder_init(&svc_ifaces, G_VARIANT_TYPE("a{sa{sv}}"));
    g_variant_builder_init(&svc_props,  G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&svc_props, "{sv}", "UUID",    g_variant_new_string(NUS_SERVICE_UUID));
    g_variant_builder_add(&svc_props, "{sv}", "Primary", g_variant_new_boolean(TRUE));
    g_variant_builder_add(&svc_ifaces, "{sa{sv}}", GATT_SVC_IFACE, &svc_props);
    g_variant_builder_add(&objs, "{oa{sa{sv}}}", SERVICE_PATH, &svc_ifaces);

    add_char(&objs, CHAR_TX_PATH, NUS_TX_UUID, TX_FLAGS);
    add_char(&objs, CHAR_RX_PATH, NUS_RX_UUID, RX_FLAGS);

    return g_variant_new("(a{oa{sa{sv}}})", &objs);
}

/* -------------------------------------------------------------------------- */
/* RX line assembly (BLE thread): push complete newline-delimited frames       */
/* -------------------------------------------------------------------------- */
/* Gateway -> device control lines, consumed here so they never reach the SDK's
 * frame queue. One today: "RUN_AUTH <mode>", TrustBridge's cmd/run_auth trigger
 * relayed by the gateway on our behalf (see the TRIGGER capability below).
 * Returns TRUE if the line was a control line and has been handled.
 *
 * Runs on the BLE thread, which is the thread that delivers every inbound
 * frame - the handler must only signal a worker, never authenticate inline, or
 * the auth it starts would starve itself of replies. A JSON frame always starts
 * with '{', so there is no ambiguity with real traffic. */
static void (*trigger_cb)(int mode);

static gboolean rx_control_line(const uint8_t *line, uint16_t len)
{
    const uint16_t pfx = 8;   /* strlen("RUN_AUTH") */

    if (len < pfx || memcmp(line, "RUN_AUTH", pfx) != 0)
        return FALSE;

    int mode = 1;             /* no mode digit = normal mutual authentication */
    for (uint16_t i = pfx; i < len; i++) {
        if (line[i] >= '1' && line[i] <= '3') { mode = line[i] - '0'; break; }
    }

    LOGE("RUN_AUTH from gateway (mode %d) - TrustBridge trigger", mode);
    if (trigger_cb)
        trigger_cb(mode);
    else
        LOGE("no trigger handler registered - ignoring");
    return TRUE;
}

/* Called from main_device.c before the TID is handed over. */
void port_comm_ble_set_trigger_cb(void (*cb)(int mode))
{
    trigger_cb = cb;
}

static void rx_feed(const guint8 *data, gsize len)
{
    for (gsize i = 0; i < len; i++) {
        uint8_t b = data[i];
        if (b == '\n') {
            if (rx_control_line(rx_acc, rx_acc_len)) {
                rx_acc_len = 0;
                continue;
            }
            rx_line_t *m = g_new(rx_line_t, 1);
            m->len = rx_acc_len;
            if (rx_acc_len) memcpy(m->data, rx_acc, rx_acc_len);
            rx_acc_len = 0;
            g_async_queue_push(rx_q, m);
        } else if (rx_acc_len < BLE_LINE_MAX) {
            rx_acc[rx_acc_len++] = b;
        } else {
            rx_acc_len = 0;   /* overflow: resync on next newline */
        }
    }
}

/* ── Presence: "HELLO <tid>" once per link-up ──────────────────────────────
 * The gateway can't see a BLE device's IP-less existence on MQTT, so it
 * proxies the retained sandgrain/v1/{tid}/status topic on our behalf
 * (gw_presence.c) — it learns which TID sits behind this link from a HELLO
 * line sent every time the central subscribes to TX. Same wire format as the
 * nRF54L15 board. The TID arrives from main_device.c via
 * port_comm_ble_set_tid() once the SDK has read the chip; until then the
 * timer below just re-arms. All scheduling happens on the BLE thread
 * (StartNotify dispatches there); only the tid buffer crosses threads,
 * guarded by the tid_set flag. */
static char          hello_tid[65];
static volatile gint tid_set;
static volatile gint want_trigger;     /* append the TRIGGER capability flag */
static gboolean      hello_armed;      /* BLE thread only */

static gboolean send_line(const uint8_t *payload, uint16_t len);
static void     hello_schedule(guint delay_ms);

static gboolean hello_cb(gpointer u)
{
    (void)u;
    hello_armed = FALSE;
    if (!g_atomic_int_get(&tx_notifying))
        return G_SOURCE_REMOVE;                /* link dropped — next StartNotify re-arms */
    if (!g_atomic_int_get(&tid_set)) {
        hello_schedule(200);                   /* chip not read yet — poll */
        return G_SOURCE_REMOVE;
    }
    gboolean trig = g_atomic_int_get(&want_trigger);
    char line[96];
    int  n = snprintf(line, sizeof(line), "HELLO %s%s",
                      hello_tid, trig ? " TRIGGER" : "");
    if (send_line((const uint8_t *)line, (uint16_t)n))
        LOGE("sent HELLO (presence%s) for TID %.16s...",
             trig ? " + trigger proxy" : "", hello_tid);
    else
        hello_schedule(500);                   /* transient notify failure — retry */
    return G_SOURCE_REMOVE;
}

static void hello_schedule(guint delay_ms)
{
    if (hello_armed) return;
    hello_armed = TRUE;
    GSource *s = g_timeout_source_new(delay_ms);
    g_source_set_callback(s, hello_cb, NULL, NULL);
    g_source_attach(s, ble_ctx);
    g_source_unref(s);
}

/* Ask the gateway to subscribe to our cmd/run_auth topic and relay triggers
 * down this link, by advertising the TRIGGER capability in HELLO. Call before
 * port_comm_ble_set_tid() - the TID is what releases the HELLO.
 *
 * A device that reaches the broker itself (the --listen path) leaves this off,
 * or one TrustBridge request would authenticate it twice. A device that does
 * not - the nRF board, or this build with no listener - turns it on, and that
 * is what makes it driveable from TrustBridge over BLE alone. */
void port_comm_ble_enable_trigger_proxy(int enable)
{
    g_atomic_int_set(&want_trigger, enable ? 1 : 0);
}

/* Called from main_device.c (main thread) once the chip TID is known. */
void port_comm_ble_set_tid(const char *tid_hex)
{
    if (!tid_hex || !*tid_hex) return;
    snprintf(hello_tid, sizeof(hello_tid), "%s", tid_hex);
    g_atomic_int_set(&tid_set, 1);             /* full barrier — publishes the buffer */
}

/* -------------------------------------------------------------------------- */
/* Method dispatch                                                            */
/* -------------------------------------------------------------------------- */
static void method_call(GDBusConnection *c, const char *sender,
                        const char *object_path, const char *iface,
                        const char *method, GVariant *params,
                        GDBusMethodInvocation *inv, gpointer u)
{
    (void)c; (void)sender; (void)object_path; (void)u;

    if (!g_strcmp0(iface, OM_IFACE) && !g_strcmp0(method, "GetManagedObjects")) {
        g_dbus_method_invocation_return_value(inv, build_managed_objects());
        return;
    }
    if (!g_strcmp0(iface, GATT_CHRC_IFACE)) {
        if (!g_strcmp0(method, "WriteValue")) {
            GVariant *ay = NULL, *opts = NULL;
            g_variant_get(params, "(@ay@a{sv})", &ay, &opts);
            gsize n = 0;
            const guint8 *d = g_variant_get_fixed_array(ay, &n, sizeof(guint8));
            rx_feed(d, n);
            g_variant_unref(ay);
            if (opts) g_variant_unref(opts);
            g_dbus_method_invocation_return_value(inv, NULL);
            return;
        }
        if (!g_strcmp0(method, "ReadValue")) {
            g_dbus_method_invocation_return_value(inv, g_variant_new("(@ay)", bytes_to_ay(NULL, 0)));
            return;
        }
        if (!g_strcmp0(method, "StartNotify")) {
            g_atomic_int_set(&tx_notifying, 1);
            LOGE("central subscribed — link ready");
            g_dbus_method_invocation_return_value(inv, NULL);
            /* Give the central a beat to finish its CCCD write, then announce. */
            hello_schedule(100);
            return;
        }
        if (!g_strcmp0(method, "StopNotify")) {
            g_atomic_int_set(&tx_notifying, 0);
            g_dbus_method_invocation_return_value(inv, NULL);
            return;
        }
    }
    if (!g_strcmp0(iface, ADV_IFACE) && !g_strcmp0(method, "Release")) {
        g_dbus_method_invocation_return_value(inv, NULL);
        return;
    }
    g_dbus_method_invocation_return_error(inv, G_DBUS_ERROR, G_DBUS_ERROR_UNKNOWN_METHOD,
                                          "Unhandled %s.%s", iface, method);
}

static const GDBusInterfaceVTable iface_vtable = {
    .method_call = method_call, .get_property = get_property, .set_property = NULL,
};

/* -------------------------------------------------------------------------- */
/* BLE thread: bring up the GATT server + advertisement, run the loop         */
/* -------------------------------------------------------------------------- */
static void register_iface(const char *path, const char *iface_name)
{
    GDBusInterfaceInfo *info = g_dbus_node_info_lookup_interface(node_info, iface_name);
    GError *err = NULL;
    if (!g_dbus_connection_register_object(g_conn, path, info, &iface_vtable, NULL, NULL, &err)) {
        LOGE("register %s (%s) failed: %s", path, iface_name, err ? err->message : "?");
        if (err) g_error_free(err);
    }
}

/* ── Kernel mgmt-API advertising fallback ─────────────────────────────────
 * On Raspberry Pi OS (kernel 6.18 / BlueZ 5.82) the kernel rejects
 * bluetoothd's Add Extended Advertising Data with Invalid Parameters, so the
 * D-Bus LEAdvertisingManager1 path fails. The LEGACY mgmt Add Advertising
 * (what `btmgmt add-adv` uses) works, so after 3 D-Bus failures we register
 * the instance ourselves over the Bluetooth mgmt control socket. bluetoothd
 * keeps serving GATT. Requires CAP_NET_ADMIN (the device runs under sudo for
 * BLE anyway). Proven on hardware by tools/ble_peripheral (Milestone 1). */
#ifndef AF_BLUETOOTH
#define AF_BLUETOOTH 31
#endif
#define BTPROTO_HCI                 1
#define HCI_CHANNEL_CONTROL         3
#define HCI_DEV_NONE                0xffff
#define MGMT_OP_SET_CONNECTABLE     0x0007
#define MGMT_OP_ADD_ADVERTISING     0x003e
#define MGMT_OP_REMOVE_ADVERTISING  0x003f
#define MGMT_EV_CMD_COMPLETE        0x0001
#define MGMT_EV_CMD_STATUS          0x0002
#define MGMT_ADV_FLAG_CONNECTABLE   (1 << 0)
#define MGMT_ADV_FLAG_DISCOV        (1 << 1)

struct sockaddr_hci_compat {
    sa_family_t    hci_family;
    unsigned short hci_dev;
    unsigned short hci_channel;
};

/* NUS service UUID as a little-endian complete-128-bit-UUID AD structure. */
static const guint8 ADV_AD_UUID[] = {
    0x11, 0x07,
    0x9e, 0xca, 0xdc, 0x24, 0x0e, 0xe5, 0xa9, 0xe0,
    0x93, 0xf3, 0xa3, 0xb5, 0x01, 0x00, 0x40, 0x6e,
};

static int mgmt_hci_index(void)
{
    int idx = 0;
    sscanf(adapter_path, "/org/bluez/hci%d", &idx);
    return idx;
}

static gboolean mgmt_cmd(int fd, guint16 opcode, guint16 index,
                         const guint8 *param, guint16 plen)
{
    guint8 buf[512];
    buf[0] = opcode & 0xff; buf[1] = opcode >> 8;
    buf[2] = index  & 0xff; buf[3] = index  >> 8;
    buf[4] = plen   & 0xff; buf[5] = plen   >> 8;
    if (plen) memcpy(buf + 6, param, plen);
    if (write(fd, buf, 6 + plen) != (ssize_t)(6 + plen)) return FALSE;

    for (;;) {
        struct pollfd pfd = { .fd = fd, .events = POLLIN };
        if (poll(&pfd, 1, 3000) <= 0) return FALSE;
        guint8  ev[1024];
        ssize_t n = read(fd, ev, sizeof(ev));
        if (n < 9) continue;
        guint16 ev_op  = ev[0] | (ev[1] << 8);
        guint16 cmd_op = ev[6] | (ev[7] << 8);
        guint8  status = ev[8];
        if (cmd_op != opcode) continue;
        if (ev_op == MGMT_EV_CMD_COMPLETE && status == 0) return TRUE;
        if (ev_op == MGMT_EV_CMD_COMPLETE || ev_op == MGMT_EV_CMD_STATUS) return FALSE;
    }
}

static int mgmt_open(void)
{
    int fd = socket(AF_BLUETOOTH, SOCK_RAW | SOCK_CLOEXEC, BTPROTO_HCI);
    if (fd < 0) return -1;
    struct sockaddr_hci_compat sa = {
        .hci_family  = AF_BLUETOOTH,
        .hci_dev     = HCI_DEV_NONE,
        .hci_channel = HCI_CHANNEL_CONTROL,
    };
    if (bind(fd, (struct sockaddr *)&sa, sizeof(sa)) < 0) { close(fd); return -1; }
    return fd;
}

/* Make the adapter connectable, independently of how the advertisement ends up
 * being registered.
 *
 * This used to happen only inside mgmt_add_advertising() below, which runs only
 * after three D-Bus registration failures. On a Pi where bluetoothd accepts the
 * registration first try, that fallback never ran, SET_CONNECTABLE was never
 * sent, and the adapter was left non-connectable: the controller happily
 * reported "LE Set Advertise Enable: Enabled" while no scanner could see or
 * reach the device.
 *
 * What made it look intermittent is that the mgmt setting lives on the ADAPTER
 * and survives process restarts - a Pi that had once been through the fallback
 * kept working, while a freshly booted one never did. Observed on hardware: a
 * Pi 3 was invisible to the gateway for an entire session, advertising the
 * whole time, until `btmgmt connectable on` was issued by hand.
 *
 * Called every time bluetoothd appears, since that is also when the setting can
 * have been lost. LE mode itself is handled by ControllerMode = le in
 * /etc/bluetooth/main.conf (pi_device_ble_setup.sh). */
static void mgmt_set_connectable(void)
{
    int fd = mgmt_open();
    if (fd < 0)
        return;   /* no CAP_NET_ADMIN - mgmt_add_advertising reports that loudly */

    guint8 on = 1;
    (void)mgmt_cmd(fd, MGMT_OP_SET_CONNECTABLE, (guint16)mgmt_hci_index(), &on, 1);
    close(fd);
}

static gboolean mgmt_add_advertising(void)
{
    int fd = mgmt_open();
    if (fd < 0) { LOGE("mgmt socket: need root/CAP_NET_ADMIN"); return FALSE; }

    guint16 index = (guint16)mgmt_hci_index();

    guint8 on = 1;
    (void)mgmt_cmd(fd, MGMT_OP_SET_CONNECTABLE, index, &on, 1);

    guint8 inst = 1;   /* clear stale instance from a previous run */
    (void)mgmt_cmd(fd, MGMT_OP_REMOVE_ADVERTISING, index, &inst, 1);

    /* instance(1) flags(4) duration(2) timeout(2) adv_len(1) srsp_len(1) data */
    guint8  cp[256];
    guint32 flags    = MGMT_ADV_FLAG_CONNECTABLE | MGMT_ADV_FLAG_DISCOV;
    gsize   name_len = strlen(DEVICE_NAME);
    guint8  adv_len  = (guint8)sizeof(ADV_AD_UUID);
    guint8  srsp_len = (guint8)(2 + name_len);
    cp[0] = 1;
    cp[1] = flags & 0xff; cp[2] = (flags >> 8) & 0xff;
    cp[3] = (flags >> 16) & 0xff; cp[4] = (flags >> 24) & 0xff;
    cp[5] = 0; cp[6] = 0;
    cp[7] = 0; cp[8] = 0;
    cp[9]  = adv_len;
    cp[10] = srsp_len;
    gsize off = 11;
    memcpy(cp + off, ADV_AD_UUID, adv_len); off += adv_len;
    cp[off]     = (guint8)(1 + name_len);
    cp[off + 1] = 0x09;                       /* complete local name */
    memcpy(cp + off + 2, DEVICE_NAME, name_len);
    off += srsp_len;

    gboolean ok = mgmt_cmd(fd, MGMT_OP_ADD_ADVERTISING, index, cp, (guint16)off);
    close(fd);
    return ok;
}

/* The mgmt advertising instance belongs to the kernel, not this process — it
 * keeps advertising after we exit. Remove it on shutdown. */
static void mgmt_remove_advertising(void)
{
    int fd = mgmt_open();
    if (fd < 0) return;
    guint8 inst = 1;
    (void)mgmt_cmd(fd, MGMT_OP_REMOVE_ADVERTISING, (guint16)mgmt_hci_index(), &inst, 1);
    close(fd);
}

static void request_register_adv(void);
static int  adv_attempts;

static gboolean retry_adv_cb(gpointer u)
{
    if (GPOINTER_TO_INT(u) == reg_gen) request_register_adv();
    return G_SOURCE_REMOVE;
}

static void on_register_adv(GObject *src, GAsyncResult *res, gpointer u)
{
    GError *err = NULL;
    GVariant *r = g_dbus_connection_call_finish(G_DBUS_CONNECTION(src), res, &err);
    if (GPOINTER_TO_INT(u) != reg_gen) {          /* previous bluetoothd incarnation */
        if (r)   g_variant_unref(r);
        if (err) g_error_free(err);
        return;
    }
    if (err) {
        adv_attempts++;
        if (adv_attempts >= 3) {
            LOGE("bluetoothd advertising failed (%s) — kernel mgmt fallback", err->message);
            g_error_free(err);
            if (mgmt_add_advertising()) {
                g_atomic_int_set(&ble_up, 1);
                LOGE("advertising as '%s' (kernel mgmt fallback)", DEVICE_NAME);
            } else {
                LOGE("mgmt advertising fallback failed — device not discoverable");
            }
            return;
        }
        g_error_free(err);
        /* Attach to ble_ctx explicitly: g_timeout_add() targets the global
         * default context, which no thread in this process iterates. */
        GSource *s = g_timeout_source_new(1000);
        g_source_set_callback(s, retry_adv_cb, GINT_TO_POINTER(reg_gen), NULL);
        g_source_attach(s, ble_ctx);
        g_source_unref(s);
        return;
    }
    g_variant_unref(r);
    g_atomic_int_set(&adv_via_dbus, 1);
    g_atomic_int_set(&ble_up, 1);
    LOGE("advertising as '%s'", DEVICE_NAME);
}

static void request_register_adv(void)
{
    g_dbus_connection_call(g_conn, BLUEZ_BUS_NAME, adapter_path,
        "org.bluez.LEAdvertisingManager1", "RegisterAdvertisement",
        g_variant_new("(oa{sv})", ADV_PATH, NULL),
        NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL,
        on_register_adv, GINT_TO_POINTER(reg_gen));
}

/* ── bluetoothd lifecycle ──────────────────────────────────────────────────
 * Our GATT app + D-Bus advertisement live inside bluetoothd and die with it,
 * while the mgmt advertising instance lives in the kernel and does NOT. If
 * bluetoothd restarts mid-run, the device would keep advertising with no
 * GATT service behind it — centrals connect, find no NUS, and loop forever.
 * So registration is driven by a D-Bus name watch: every time org.bluez
 * (re)appears we register afresh; when it vanishes we mark the link down.
 * reg_gen invalidates async callbacks and retry timers left over from a
 * previous incarnation. Everything here runs on the BLE thread. */
static int app_attempts;

static void try_register_app(void);

static gboolean retry_app_cb(gpointer u)
{
    if (GPOINTER_TO_INT(u) == reg_gen) try_register_app();
    return G_SOURCE_REMOVE;
}

static void on_register_app(GObject *src, GAsyncResult *res, gpointer u)
{
    GError *err = NULL;
    GVariant *r = g_dbus_connection_call_finish(G_DBUS_CONNECTION(src), res, &err);
    if (GPOINTER_TO_INT(u) != reg_gen) {          /* previous bluetoothd incarnation */
        if (r)   g_variant_unref(r);
        if (err) g_error_free(err);
        return;
    }
    if (err) {
        app_attempts++;
        if (app_attempts >= 15) {
            LOGE("RegisterApplication failed: %s — giving up", err->message);
        } else {
            /* Right after bluetoothd (re)starts, the adapter object may not
             * be on the bus yet — retry. */
            GSource *s = g_timeout_source_new(1000);
            g_source_set_callback(s, retry_app_cb, GINT_TO_POINTER(reg_gen), NULL);
            g_source_attach(s, ble_ctx);
            g_source_unref(s);
        }
        g_error_free(err);
        return;
    }
    g_variant_unref(r);
    LOGE("GATT application registered");
    /* Advertise only once the GATT app is in place — an advert with no
     * service behind it just attracts doomed connections. */
    adv_attempts = 0;
    request_register_adv();
}

static void try_register_app(void)
{
    /* Power the adapter on (idempotent; may fail harmlessly if the adapter
     * object isn't up yet — the RegisterApplication retry covers that). */
    g_dbus_connection_call_sync(g_conn, BLUEZ_BUS_NAME, adapter_path,
        "org.freedesktop.DBus.Properties", "Set",
        g_variant_new("(ssv)", "org.bluez.Adapter1", "Powered", g_variant_new_boolean(TRUE)),
        NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL, NULL);

    g_dbus_connection_call(g_conn, BLUEZ_BUS_NAME, adapter_path,
        "org.bluez.GattManager1", "RegisterApplication",
        g_variant_new("(oa{sv})", APP_PATH, NULL),
        NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL,
        on_register_app, GINT_TO_POINTER(reg_gen));
}

static void on_bluez_appeared(GDBusConnection *c, const gchar *name,
                              const gchar *owner, gpointer u)
{
    (void)c; (void)name; (void)owner; (void)u;
    reg_gen++;
    app_attempts = 0;
    g_atomic_int_set(&adv_via_dbus, 0);
    /* Connectable BEFORE the advertisement is registered: bluetoothd may
     * accept the registration first try, in which case nothing else would
     * ever set it. */
    mgmt_set_connectable();
    LOGE("bluetoothd is up — registering GATT application");
    try_register_app();
}

static void on_bluez_vanished(GDBusConnection *c, const gchar *name, gpointer u)
{
    (void)c; (void)name; (void)u;
    reg_gen++;                                    /* kill in-flight retries */
    g_atomic_int_set(&ble_up, 0);
    g_atomic_int_set(&tx_notifying, 0);
    g_atomic_int_set(&adv_via_dbus, 0);
    LOGE("bluetoothd went away — GATT registration lost, waiting for it to return");
}

/* ── Graceful shutdown (SIGINT/SIGTERM) ────────────────────────────────────
 * The advertising instance and a live central connection belong to the
 * kernel/bluetoothd, not to this process — a plain Ctrl-C leaves them behind,
 * and a peripheral with a leftover connection can't re-advertise, which is
 * what forced `systemctl restart bluetooth` between runs. Tear them down
 * explicitly. The GLib unix-signal source dispatches on the BLE thread, so
 * synchronous D-Bus calls are safe here. */
static void disconnect_centrals(void)
{
    GError *err = NULL;
    GVariant *r = g_dbus_connection_call_sync(g_conn, BLUEZ_BUS_NAME, "/",
        OM_IFACE, "GetManagedObjects", NULL, G_VARIANT_TYPE("(a{oa{sa{sv}}})"),
        G_DBUS_CALL_FLAGS_NONE, 3000, NULL, &err);
    if (!r) {
        if (err) { LOGE("GetManagedObjects failed: %s", err->message); g_error_free(err); }
        return;
    }
    GVariantIter *objs = NULL;
    const char   *path;
    GVariant     *ifaces;
    g_variant_get(r, "(a{oa{sa{sv}}})", &objs);
    while (g_variant_iter_loop(objs, "{&o@a{sa{sv}}}", &path, &ifaces)) {
        GVariant *dev = g_variant_lookup_value(ifaces, "org.bluez.Device1",
                                               G_VARIANT_TYPE("a{sv}"));
        if (!dev) continue;
        gboolean connected = FALSE;
        g_variant_lookup(dev, "Connected", "b", &connected);
        g_variant_unref(dev);
        if (!connected || !g_str_has_prefix(path, adapter_path)) continue;
        LOGE("disconnecting central %s", path);
        GVariant *d = g_dbus_connection_call_sync(g_conn, BLUEZ_BUS_NAME, path,
            "org.bluez.Device1", "Disconnect", NULL, NULL,
            G_DBUS_CALL_FLAGS_NONE, 5000, NULL, NULL);
        if (d) g_variant_unref(d);
    }
    g_variant_iter_free(objs);
    g_variant_unref(r);
}

static gboolean on_shutdown(gpointer u)
{
    (void)u;
    signal(SIGINT,  SIG_DFL);   /* second Ctrl-C = force quit */
    signal(SIGTERM, SIG_DFL);
    LOGE("shutting down — cleaning up BLE state (Ctrl-C again to force quit)");

    if (g_atomic_int_get(&adv_via_dbus)) {
        GVariant *r = g_dbus_connection_call_sync(g_conn, BLUEZ_BUS_NAME, adapter_path,
            "org.bluez.LEAdvertisingManager1", "UnregisterAdvertisement",
            g_variant_new("(o)", ADV_PATH), NULL, G_DBUS_CALL_FLAGS_NONE, 3000, NULL, NULL);
        if (r) g_variant_unref(r);
    }
    mgmt_remove_advertising();
    if (g_conn) {
        disconnect_centrals();
        GVariant *r = g_dbus_connection_call_sync(g_conn, BLUEZ_BUS_NAME, adapter_path,
            "org.bluez.GattManager1", "UnregisterApplication",
            g_variant_new("(o)", APP_PATH), NULL, G_DBUS_CALL_FLAGS_NONE, 3000, NULL, NULL);
        if (r) g_variant_unref(r);
    }
    LOGE("BLE state cleaned up — exiting");
    /* _exit, not exit: exit() flushes stdio, and the main thread sits blocked
     * in scanf() on the menu HOLDING the stdin lock — exit() from this thread
     * deadlocks on it (observed: process hung after this log line). Nothing
     * needs flushing — the logs go to unbuffered stderr. */
    _exit(0);
}

static void *ble_main(void *arg)
{
    (void)arg;
    ble_ctx = g_main_context_new();
    g_main_context_push_thread_default(ble_ctx);

    GError *err = NULL;
    g_conn = g_bus_get_sync(G_BUS_TYPE_SYSTEM, NULL, &err);
    if (!g_conn) { LOGE("system bus: %s", err ? err->message : "?"); return NULL; }

    node_info = g_dbus_node_info_new_for_xml(introspection_xml, &err);
    if (!node_info) { LOGE("introspection: %s", err ? err->message : "?"); return NULL; }

    const char *hci = g_getenv("HCI");
    if (hci && *hci) adapter_path = g_strdup_printf("/org/bluez/%s", hci);

    register_iface(APP_PATH,     OM_IFACE);
    register_iface(SERVICE_PATH, GATT_SVC_IFACE);
    register_iface(CHAR_TX_PATH, GATT_CHRC_IFACE);
    register_iface(CHAR_RX_PATH, GATT_CHRC_IFACE);
    register_iface(ADV_PATH,     ADV_IFACE);

    /* bluetoothd owns our GATT registration and can restart under us — drive
     * (re)registration from a name watch instead of registering once. The
     * appeared callback fires immediately when org.bluez is already up, so
     * this also performs the initial bring-up (adapter power, GATT app, then
     * advertising — D-Bus path first, kernel mgmt fallback on failure). */
    g_bus_watch_name_on_connection(g_conn, BLUEZ_BUS_NAME,
        G_BUS_NAME_WATCHER_FLAGS_NONE, on_bluez_appeared, on_bluez_vanished,
        NULL, NULL);

    /* Ctrl-C / kill: clean shutdown instead of leaving BLE debris behind.
     * Attach to ble_ctx explicitly (same pitfall as the adv retry timer). */
    GSource *sig = g_unix_signal_source_new(SIGINT);
    g_source_set_callback(sig, on_shutdown, NULL, NULL);
    g_source_attach(sig, ble_ctx);
    g_source_unref(sig);
    sig = g_unix_signal_source_new(SIGTERM);
    g_source_set_callback(sig, on_shutdown, NULL, NULL);
    g_source_attach(sig, ble_ctx);
    g_source_unref(sig);

    ble_loop = g_main_loop_new(ble_ctx, FALSE);
    g_main_loop_run(ble_loop);
    return NULL;
}

/* Start the BLE stack once, at process load — so the device is already
 * advertising by the time the SDK begins an authentication. */
__attribute__((constructor))
static void port_comm_ble_boot(void)
{
    rx_q = g_async_queue_new();
    if (pthread_create(&ble_thread, NULL, ble_main, NULL) != 0)
        LOGE("failed to start BLE thread");
}

/* ============================================================================
 * SDK port_comm interface
 * ========================================================================== */
static gboolean send_line(const uint8_t *payload, uint16_t len)
{
    uint8_t frame[BLE_LINE_MAX];
    if ((size_t)len + 1 > sizeof(frame)) return FALSE;
    if (len) memcpy(frame, payload, len);
    frame[len] = '\n';
    return tx_notify(frame, len + 1);
}

bool port_comm_init(port_comm_ctx_t *ctx, const char *device_id)
{
    (void)ctx; (void)device_id;

    /* Wait for the gateway (central) to connect and subscribe to TX. */
    const char *w = getenv("BLE_WAIT_MS");
    int wait_ms = w ? atoi(w) : 60000;          /* default 60 s; 0 = wait forever */
    int waited  = 0;
    while (!g_atomic_int_get(&tx_notifying)) {
        if (wait_ms && waited >= wait_ms) {
            LOGE("timed out waiting for gateway to connect");
            return false;
        }
        if (waited % 5000 == 0)
            LOGE("waiting for gateway (central) to connect%s ...",
                 g_atomic_int_get(&ble_up) ? "" : " [advertising not up yet]");
        usleep(100 * 1000);
        waited += 100;
    }

    /* Fresh session: drop any stale inbound frames, tell the gateway to OPEN. */
    rx_acc_len = 0;
    rx_line_t *stale;
    while ((stale = g_async_queue_try_pop(rx_q)) != NULL) g_free(stale);

    return send_line((const uint8_t *)"OPEN", 4);
}

bool port_comm_send(port_comm_ctx_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size)
{
    (void)ctx;
    if (!buffer_tx || buffer_tx_size == 0) return false;

    /* Menu options 2 and 3 corrupt the frame on its way out. The PC/TCP port
     * does this inline; over BLE it has to happen here or those options would
     * silently authenticate cleanly. Copy first - the SDK's buffer is not
     * ours to mutate. */
    char frame[BLE_LINE_MAX];
    if ((size_t)buffer_tx_size >= sizeof(frame)) return false;
    memcpy(frame, buffer_tx, buffer_tx_size);
    frame[buffer_tx_size] = '\0';
    fi_apply_tx_frame(frame);

    return send_line((const uint8_t *)frame, buffer_tx_size);
}

bool port_comm_receive(port_comm_ctx_t *ctx, uint8_t *buffer_rx,
                       uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    (void)ctx;
    if (!buffer_rx || !buffer_rx_received_size) return false;

    rx_line_t *m = g_async_queue_try_pop(rx_q);
    if (m) {
        uint16_t n = m->len < buffer_rx_size ? m->len : buffer_rx_size;
        if (n) memcpy(buffer_rx, m->data, n);
        *buffer_rx_received_size = n;
        g_free(m);
        /* Inbound half of the fault injection (options 2 and 3): corrupt the
         * CW the gateway just handed us. Needs a terminator for the JSON
         * scan; the frames are ~130 B against a 512 B buffer, so the guard
         * only ever trips on a malformed giant frame. */
        if (n < buffer_rx_size) {
            buffer_rx[n] = '\0';
            fi_apply_rx_frame((char *)buffer_rx);
        }
        return true;
    }

    /* Queue empty and the central is gone: the reply is never coming. The
     * gateway unbinds its channel the moment the link drops, so there is no
     * session left to resume - reporting NO_DATA here would leave the FSM BUSY
     * forever. Return false instead; server.c maps that to SERVER_COMM_ERROR,
     * the run fails cleanly and the next trigger starts fresh. */
    if (!g_atomic_int_get(&tx_notifying)) {
        LOGE("link lost mid-session - aborting this exchange");
        return false;
    }

    /* No frame yet: yield ~1 ms and report NO_DATA (size 0) so the FSM stays
     * BUSY without hot-spinning — mirrors the board's port_comm_receive. */
    *buffer_rx_received_size = 0;
    usleep(1000);
    return true;
}

void port_comm_close(port_comm_ctx_t *ctx)
{
    (void)ctx;
    /* End the session; keep the BLE link up for the next authentication. */
    (void)send_line((const uint8_t *)"CLOSE", 5);
}
