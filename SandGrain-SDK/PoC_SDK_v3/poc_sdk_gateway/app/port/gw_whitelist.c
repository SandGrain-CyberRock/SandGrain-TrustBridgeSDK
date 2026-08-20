/* =============================================================================
 * gw_whitelist.c
 *
 * MQTT-driven gateway whitelist + presence for TrustBridge mode. See
 * gw_whitelist.h for the topic contract and the threading model.
 *
 * Modeled on gw_log.c: a dedicated mosquitto client with a unique per-host/pid
 * client-id and the same reconnect-on-disconnect plumbing (connect_async +
 * loop_start + exponential backoff), so it survives a broker/Docker restart.
 * The connect callback re-subscribes AND re-announces "online" on every
 * (re)connect, so the BE re-pushes the current whitelist after any blip.
 * ============================================================================= */

#include "gw_whitelist.h"
#include "config_poc.h"
#include "auth_db.h"   /* AUTH_DB_TID_HEX_LEN, AUTH_DB_MAX_DEVICES */

#include <mosquitto.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>   /* strerror on connect failure */
#include <ctype.h>
#ifdef _WIN32
    #include <winsock2.h>   /* gethostname + sockets (declared here on Windows, not unistd.h) */
    #include <ws2tcpip.h>   /* getaddrinfo, inet_ntop */
    #include <process.h>    /* getpid */
    typedef SOCKET   sock_t;
    #define SOCK_INVALID INVALID_SOCKET
    #define CLOSESOCK    closesocket
#else
    #include <unistd.h>       /* gethostname, getpid, close */
    #include <sys/socket.h>   /* socket, connect, getsockname */
    #include <netinet/in.h>   /* sockaddr_in */
    #include <arpa/inet.h>    /* inet_ntop */
    #include <netdb.h>        /* getaddrinfo */
    typedef int      sock_t;
    #define SOCK_INVALID (-1)
    #define CLOSESOCK    close
#endif

#define GW_WHITELIST_TOPIC  "sandgrain/v1/gw/whitelist"
#define GW_STATUS_ONLINE    "{\"status\":\"online\"}"
#define GW_STATUS_OFFLINE   "{\"status\":\"offline\"}"

static struct mosquitto *g_wl_mosq   = NULL;
static int               g_connected = 0;
/* Presence topic sandgrain/v1/<id>/gw_status, where <id> is the gateway's own
 * IP (the local address that routes to the broker) so multiple gateways are
 * distinguishable to the BE. Built once in gw_whitelist_init() before the
 * Last-Will is set (which must share this exact topic), so it can't depend on
 * the post-connect socket address; falls back to "gw" if detection fails. */
static char              g_status_topic[128] = "sandgrain/v1/gw/gw_status";
/* Set by the mqtt thread after it rewrites the whitelist file, cleared by the
 * main loop in gw_whitelist_take_dirty(). volatile so the main loop actually
 * re-reads it (matches gw_log.c's lock-free connected-flag style). */
static volatile int      g_dirty     = 0;

/* Resolve the whitelist file path the same way auth_db / main_gw do. */
static const char *wl_path(void)
{
    const char *p = getenv("GW_WHITELIST_PATH");
    return (p && p[0]) ? p : "./trustbridge_whitelist.txt";
}

/* Determine the gateway's own IPv4 address as seen toward the broker, and write
 * it to `out` (falls back to "gw" on any failure). Uses the standard connected-
 * UDP-socket trick: a UDP connect() sends no packets, it just picks the local
 * endpoint the kernel would route to the broker through, which getsockname()
 * then reports — so this reflects the exact interface that reaches the broker,
 * even on a multi-homed host. Winsock is already initialized by the time this
 * runs (mosquitto_lib_init() calls WSAStartup). */
static void resolve_gw_ip(char *out, size_t n)
{
    snprintf(out, n, "gw");   /* default label if anything below fails */

    struct addrinfo hints, *res = NULL;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family   = AF_INET;      /* IPv4 → a clean dotted single topic level */
    hints.ai_socktype = SOCK_DGRAM;

    char port_s[16];
    snprintf(port_s, sizeof(port_s), "%d", MQTT_PORT);
    if (getaddrinfo(MQTT_BROKER, port_s, &hints, &res) != 0 || res == NULL)
        return;

    sock_t s = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (s != SOCK_INVALID) {
        if (connect(s, res->ai_addr, (int)res->ai_addrlen) == 0) {
            struct sockaddr_in local;
            socklen_t len = sizeof(local);
            if (getsockname(s, (struct sockaddr *)&local, &len) == 0) {
                char ip[INET_ADDRSTRLEN];
                if (inet_ntop(AF_INET, &local.sin_addr, ip, sizeof(ip)) != NULL)
                    snprintf(out, n, "%s", ip);
            }
        }
        CLOSESOCK(s);
    }
    freeaddrinfo(res);
}

/* Case-insensitive compare of two 64-hex TIDs (BE and file may differ in case). */
static int tid_ieq(const char *a, const char *b)
{
    for (int i = 0; i < AUTH_DB_TID_HEX_LEN; i++)
        if (tolower((unsigned char)a[i]) != tolower((unsigned char)b[i]))
            return 0;
    return 1;
}

/* Merge the newline-separated TID list in `payload` into the whitelist file
 * (union with what's already there; case-insensitive de-dup; 64-hex lines only).
 *
 * The BE sends the FULL list on gateway-online and a SINGLE new TID on each
 * registration, both on the same topic with no framing to tell them apart, so
 * the merge is additive — see the removal note in gw_whitelist.h's companion
 * commit. Writes atomically via a temp file + rename so a concurrent reader in
 * the main thread (auth_db_load_whitelist) always sees a complete file. */
static void wl_merge_into_file(const char *payload, int len)
{
    const char *path = wl_path();

    /* 1. Load existing TIDs from the file. */
    char tids[AUTH_DB_MAX_DEVICES][AUTH_DB_TID_HEX_LEN + 1];
    int  n = 0;

    FILE *f = fopen(path, "r");
    if (f) {
        char line[128];
        while (n < AUTH_DB_MAX_DEVICES && fgets(line, sizeof(line), f)) {
            int L = (int)strlen(line);
            while (L > 0 && (line[L-1] == '\n' || line[L-1] == '\r' ||
                             isspace((unsigned char)line[L-1])))
                line[--L] = '\0';
            if (L == AUTH_DB_TID_HEX_LEN) {
                memcpy(tids[n], line, (size_t)L);
                tids[n][L] = '\0';
                n++;
            }
        }
        fclose(f);
    }

    /* 2. Add new TIDs from the payload (dedup, case-insensitive). */
    int         added = 0;
    const char *p     = payload;
    const char *end   = payload + len;
    while (p < end && n < AUTH_DB_MAX_DEVICES) {
        const char *nl = memchr(p, '\n', (size_t)(end - p));
        int         L  = nl ? (int)(nl - p) : (int)(end - p);
        /* Trim leading/trailing whitespace (incl. a CR before the LF). */
        while (L > 0 && isspace((unsigned char)p[L-1])) L--;
        while (L > 0 && isspace((unsigned char)*p)) { p++; L--; }

        if (L == AUTH_DB_TID_HEX_LEN) {
            char tid[AUTH_DB_TID_HEX_LEN + 1];
            memcpy(tid, p, (size_t)L);
            tid[L] = '\0';
            int dup = 0;
            for (int i = 0; i < n; i++)
                if (tid_ieq(tids[i], tid)) { dup = 1; break; }
            if (!dup) {
                memcpy(tids[n], tid, (size_t)L + 1);
                n++;
                added++;
            }
        }
        p = nl ? nl + 1 : end;
    }

    if (added == 0)
        return;   /* nothing new — don't churn the file or wake the main loop */

    /* 3. Write atomically: temp file then rename over the target. */
    char tmp[600];
    snprintf(tmp, sizeof(tmp), "%s.mqtt.tmp", path);
    FILE *out = fopen(tmp, "w");
    if (!out) {
        printf("[GW_WL] cannot open temp whitelist for write: %s\n", tmp);
        return;
    }
    for (int i = 0; i < n; i++)
        fprintf(out, "%s\n", tids[i]);
    fclose(out);

    remove(path);   /* Windows rename() fails if the target exists; POSIX is fine either way */
    if (rename(tmp, path) != 0) {
        printf("[GW_WL] rename %s -> %s failed\n", tmp, path);
        remove(tmp);
        return;
    }

    printf("[GW_WL] Whitelist updated (+%d, total %d) from MQTT\n", added, n);
    g_dirty = 1;
}

static void prv_on_connect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)obj;
    g_connected = (rc == 0);
    if (rc != 0) {
        printf("[GW_WL] MQTT connect failed (rc=%d)\n", rc);
        return;
    }

    /* Subscribe BEFORE announcing online: the BE publishes the whitelist reply
     * non-retained, so we must already be subscribed when it answers. Done on
     * every (re)connect so a reconnect after a broker restart re-arms both. */
    mosquitto_subscribe(mosq, NULL, GW_WHITELIST_TOPIC, 1);
    printf("[GW_WL] Connected — subscribed %s, announcing online on %s\n",
           GW_WHITELIST_TOPIC, g_status_topic);
    mosquitto_publish(mosq, NULL, g_status_topic,
                      (int)strlen(GW_STATUS_ONLINE), GW_STATUS_ONLINE, 1, false);
}

static void prv_on_disconnect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)mosq; (void)obj;
    g_connected = 0;
    if (rc != 0)
        printf("[GW_WL] MQTT disconnected (rc=%d) — auto-reconnect pending\n", rc);
}

static void prv_on_message(struct mosquitto *mosq, void *obj,
                           const struct mosquitto_message *msg)
{
    (void)mosq; (void)obj;
    if (!msg || !msg->payload || msg->payloadlen <= 0)
        return;
    wl_merge_into_file((const char *)msg->payload, msg->payloadlen);
}

void gw_whitelist_init(void)
{
    g_connected = 0;
    g_dirty     = 0;

    mosquitto_lib_init();

    /* Unique per-host/pid client-id — a hardcoded id would collide with a
     * second gateway (or a lingering previous run) and flap forever. Same
     * rationale as gw_log.c. */
    char client_id[96];
    char host[64] = {0};
    if (gethostname(host, sizeof(host) - 1) != 0)
        host[0] = '\0';
    snprintf(client_id, sizeof(client_id), "gw_wl_%s_%d",
             host[0] ? host : "gw", (int)getpid());

    g_wl_mosq = mosquitto_new(client_id, true, NULL);
    if (!g_wl_mosq) {
        printf("[GW_WL] mosquitto_new failed — whitelist will not sync over MQTT\n");
        return;
    }

    /* Build the presence topic from this gateway's IP so the BE can tell
     * multiple gateways apart. Must be done before the Last-Will below, which
     * has to publish "offline" on the SAME topic as the "online" announce. */
    char gw_ip[64];
    resolve_gw_ip(gw_ip, sizeof(gw_ip));
    snprintf(g_status_topic, sizeof(g_status_topic),
             "sandgrain/v1/%s/gw_status", gw_ip);

    /* Last-Will: if the gateway drops unexpectedly, the BE sees it go offline. */
    mosquitto_will_set(g_wl_mosq, g_status_topic,
                       (int)strlen(GW_STATUS_OFFLINE), GW_STATUS_OFFLINE, 1, false);

    mosquitto_connect_callback_set   (g_wl_mosq, prv_on_connect);
    mosquitto_disconnect_callback_set(g_wl_mosq, prv_on_disconnect);
    mosquitto_message_callback_set   (g_wl_mosq, prv_on_message);
    mosquitto_reconnect_delay_set    (g_wl_mosq, 1, 30, true);

    /* Blocking connect, not connect_async: on macOS/BSD the async path does a
     * non-blocking connect() (EINPROGRESS) and then writes the CONNECT packet
     * before the handshake finishes; a write to a still-connecting socket
     * returns ENOTCONN(57) there, which surfaces as MOSQ_ERR_ERRNO. A blocking
     * connect completes the handshake first, so the CONNECT write succeeds.
     * loop_start below still drives reads + auto-reconnect after a broker blip.
     * Fall back to async if the broker isn't up yet at startup (so we keep
     * retrying rather than giving up). */
    int rc = mosquitto_connect(g_wl_mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE);
    if (rc != MOSQ_ERR_SUCCESS) {
        /* Broker not up yet at startup: fall back to async so loop_start's
         * thread keeps retrying until it appears. */
        printf("[GW_WL] connect failed (rc=%d, errno=%d %s) — retrying in background\n",
               rc, errno, strerror(errno));
        rc = mosquitto_connect_async(g_wl_mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE);
    }
    if (rc != MOSQ_ERR_SUCCESS) {
        printf("[GW_WL] connect failed (rc=%d) — whitelist will not sync\n", rc);
        mosquitto_destroy(g_wl_mosq);
        g_wl_mosq = NULL;
        return;
    }

    if (mosquitto_loop_start(g_wl_mosq) != MOSQ_ERR_SUCCESS) {
        printf("[GW_WL] loop_start failed — whitelist will not sync\n");
        mosquitto_destroy(g_wl_mosq);
        g_wl_mosq = NULL;
        return;
    }

    printf("[GW_WL] Whitelist sync over MQTT enabled (broker %s:%d, presence %s)\n",
           MQTT_BROKER, MQTT_PORT, g_status_topic);
}

void gw_whitelist_announce_online(void)
{
    if (!g_wl_mosq || !g_connected)
        return;
    mosquitto_publish(g_wl_mosq, NULL, g_status_topic,
                      (int)strlen(GW_STATUS_ONLINE), GW_STATUS_ONLINE, 1, false);
}

int gw_whitelist_take_dirty(void)
{
    if (g_dirty) {
        g_dirty = 0;
        return 1;
    }
    return 0;
}

void gw_whitelist_close(void)
{
    if (g_wl_mosq) {
        /* Best-effort clean "offline" before we go (the LWT covers a crash). */
        mosquitto_publish(g_wl_mosq, NULL, g_status_topic,
                          (int)strlen(GW_STATUS_OFFLINE), GW_STATUS_OFFLINE, 1, false);
        mosquitto_loop_stop(g_wl_mosq, true);
        mosquitto_disconnect(g_wl_mosq);
        mosquitto_destroy(g_wl_mosq);
        g_wl_mosq   = NULL;
        g_connected = 0;
    }
}
