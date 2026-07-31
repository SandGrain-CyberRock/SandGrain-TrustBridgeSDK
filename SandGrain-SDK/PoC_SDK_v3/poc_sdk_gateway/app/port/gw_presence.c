/* =============================================================================
 * gw_presence.c
 *
 * Gateway-side MQTT proxy: device presence + BE-driven auth triggers, published
 * on each device's behalf. See gw_presence.h for the contract.
 *
 * Ported from the BLE gateway's gw_presence and generalized to be transport-
 * agnostic: devices are keyed by an opaque channel-id string (a TCP channel
 * name here; a BLE MAC in the BLE build) instead of a BLE MAC, and the relayed
 * trigger is handed to a link-supplied forwarder rather than written to gattlib
 * directly. Modeled on gw_log/gw_whitelist: one dedicated mosquitto client per
 * device with the same reconnect plumbing, so a broker restart re-announces.
 * ============================================================================= */
#include "gw_presence.h"
#include "config_poc.h"

#include <mosquitto.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <errno.h>   /* strerror on connect failure */

#ifndef MAX_DEVICES
#define MAX_DEVICES 1
#endif
/* Devices can rebind across channels over time; keep a little headroom. */
#define PRES_MAX (MAX_DEVICES + 4)

typedef struct {
    char id[64];                  /* channel-id this TID was last seen on      */
    char tid[65];
    char topic[160];              /* sandgrain/v1/<tid>/status                 */
    char cmd_topic[160];          /* sandgrain/v1/<tid>/cmd/run_auth           */
    struct mosquitto *mosq;
    volatile int connected;       /* broker link up (set by callbacks)         */
    volatile int online;          /* desired/last-published presence state     */
    int          trigger;         /* device asked us to relay cmd/run_auth     */
} pres_t;

static pres_t          g_pres[PRES_MAX];
static int             g_count;
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static int             g_lib_inited;

static gw_presence_trigger_fn g_trigger_fn;

void gw_presence_set_trigger_handler(gw_presence_trigger_fn fn)
{
    g_trigger_fn = fn;
}

static void prv_publish_state(pres_t *p)
{
    if (!p->mosq || !p->connected)
        return;
    const char *msg = p->online ? "online" : "offline";
    /* QoS 1 + retain: mirrors a native device's own status publish; retain is
     * what lets the BE learn the state even after a restart. */
    mosquitto_publish(p->mosq, NULL, p->topic, (int)strlen(msg), msg, 1, true);
    printf("[PRESENCE] %.8s... -> %s (retained)\n", p->tid, msg);
}

/* Pull the auth mode out of {"mode":N}. Lenient parse: find "mode", take the
 * first digit 1..3 after it. Anything unreadable means normal mutual auth. */
static int prv_parse_mode(const char *payload)
{
    const char *p = strstr(payload, "mode");
    if (p == NULL)
        return 1;
    while (*p && (*p < '1' || *p > '3'))
        p++;
    return (*p >= '1' && *p <= '3') ? (*p - '0') : 1;
}

static void prv_on_message(struct mosquitto *mosq, void *obj,
                           const struct mosquitto_message *msg)
{
    (void)mosq;
    pres_t *p = (pres_t *)obj;
    if (msg == NULL)
        return;

    /* Stored trigger replayed to us because we just subscribed. Dropping it is
     * what keeps a flapping link from re-authenticating on every reconnect. */
    if (msg->retain) {
        printf("[TRIGGER] %.8s... retained cmd/run_auth ignored (replay on subscribe)\n",
               p->tid);
        return;
    }

    char payload[256];
    int  plen = 0;
    if (msg->payload && msg->payloadlen > 0) {
        plen = (msg->payloadlen < (int)sizeof(payload) - 1)
                   ? msg->payloadlen : (int)sizeof(payload) - 1;
        memcpy(payload, msg->payload, (size_t)plen);
    }
    payload[plen] = '\0';

    int mode = prv_parse_mode(payload);
    printf("[TRIGGER] %.8s... run_auth mode %d from TrustBridge (%s)\n",
           p->tid, mode, payload[0] ? payload : "empty payload");

    if (g_trigger_fn == NULL) {
        printf("[TRIGGER] no device-link forwarder registered - dropping\n");
        return;
    }

    /* Snapshot the channel-id under the lock (the link side rewrites it on
     * rebind), then forward outside it — the forwarder takes its own lock. */
    char id[64];
    pthread_mutex_lock(&g_lock);
    snprintf(id, sizeof(id), "%s", p->id);
    pthread_mutex_unlock(&g_lock);

    if (id[0] == '\0') {
        printf("[TRIGGER] %.8s... has no device link bound - dropping\n", p->tid);
        return;
    }
    g_trigger_fn(id, mode);
}

static void prv_on_connect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)mosq;
    pres_t *p = (pres_t *)obj;
    p->connected = (rc == 0);
    if (rc == 0) {
        /* Subscribe BEFORE announcing "online": the BE triggers off the status
         * topic, so the trigger can arrive the moment we publish it. */
        if (p->trigger) {
            if (mosquitto_subscribe(p->mosq, NULL, p->cmd_topic, 1) == MOSQ_ERR_SUCCESS)
                printf("[TRIGGER] %.8s... subscribed to %s\n", p->tid, p->cmd_topic);
            else
                printf("[TRIGGER] %.8s... subscribe to %s failed\n", p->tid, p->cmd_topic);
        }
        /* Publish on every (re)connect so a broker restart can't lose the
         * retained state. */
        prv_publish_state(p);
    } else {
        printf("[PRESENCE] MQTT connect failed for %.8s... (rc=%d)\n", p->tid, rc);
    }
}

static void prv_on_disconnect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)mosq;
    pres_t *p = (pres_t *)obj;
    p->connected = 0;
    if (rc != 0)
        printf("[PRESENCE] MQTT disconnected for %.8s... (rc=%d) - auto-reconnect pending\n",
               p->tid, rc);
}

/* Create and start the per-device client. Called with g_lock held. */
static bool prv_start_client(pres_t *p)
{
    if (!g_lib_inited) {
        mosquitto_lib_init();   /* ref-counted — safe next to gw_log/gw_whitelist */
        g_lib_inited = 1;
    }

    p->mosq = mosquitto_new(NULL, true, p);
    if (!p->mosq) {
        printf("[PRESENCE] mosquitto_new failed for %.8s...\n", p->tid);
        return false;
    }

    /* The Last-Will IS the reason for a dedicated client per device: topic and
     * payload are fixed at connect time, so each device needs its own. */
    mosquitto_will_set(p->mosq, p->topic, (int)strlen("offline"), "offline", 1, true);

    const char *user = MQTT_USER;
    if (user && user[0])
        mosquitto_username_pw_set(p->mosq, user, MQTT_PASS);

    mosquitto_connect_callback_set(p->mosq, prv_on_connect);
    mosquitto_disconnect_callback_set(p->mosq, prv_on_disconnect);
    mosquitto_message_callback_set(p->mosq, prv_on_message);
    mosquitto_reconnect_delay_set(p->mosq, 1, 30, true);

    /* Blocking connect, not connect_async: on macOS/BSD the async path writes
     * the CONNECT packet before the TCP handshake finishes and gets ENOTCONN(57)
     * (surfaced as MOSQ_ERR_ERRNO). Blocking connect completes the handshake
     * first; loop_start below still handles reads + auto-reconnect. Fall back to
     * async if the broker isn't up yet at startup. */
    int crc = mosquitto_connect(p->mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE);
    if (crc != MOSQ_ERR_SUCCESS) {
        /* Broker not up yet: fall back to async so loop_start keeps retrying. */
        printf("[PRESENCE] connect failed (rc=%d, errno=%d %s) — retrying in background for %.8s...\n",
               crc, errno, strerror(errno), p->tid);
        crc = mosquitto_connect_async(p->mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE);
    }
    if (crc != MOSQ_ERR_SUCCESS ||
        mosquitto_loop_start(p->mosq) != MOSQ_ERR_SUCCESS) {
        printf("[PRESENCE] cannot reach broker %s:%d — presence for %.8s... disabled\n",
               MQTT_BROKER, MQTT_PORT, p->tid);
        mosquitto_destroy(p->mosq);
        p->mosq = NULL;
        return false;
    }
    return true;
}

void gw_presence_online(const char *id, const char *tid_hex, bool wants_trigger)
{
    if (tid_hex == NULL || tid_hex[0] == '\0')
        return;

    pthread_mutex_lock(&g_lock);

    pres_t *p = NULL;
    for (int i = 0; i < g_count; i++) {
        if (strcmp(g_pres[i].tid, tid_hex) == 0) {
            p = &g_pres[i];
            break;
        }
    }
    if (p == NULL) {
        if (g_count >= PRES_MAX) {
            pthread_mutex_unlock(&g_lock);
            printf("[PRESENCE] table full (%d) — cannot track %.8s...\n", PRES_MAX, tid_hex);
            return;
        }
        p = &g_pres[g_count++];
        /* Build from the tid_hex parameter (a distinct object) rather than
         * p->tid — writing p->topic while reading p->tid would both alias into
         * g_pres and trip -Wrestrict. */
        snprintf(p->tid, sizeof(p->tid), "%s", tid_hex);
        snprintf(p->topic, sizeof(p->topic), "sandgrain/v1/%s/status", tid_hex);
        snprintf(p->cmd_topic, sizeof(p->cmd_topic),
                 "sandgrain/v1/%s/cmd/run_auth", tid_hex);
    }

    if (id && id[0])
        snprintf(p->id, sizeof(p->id), "%s", id);

    p->online = 1;
    if (p->mosq == NULL) {
        p->trigger = wants_trigger ? 1 : 0;
        prv_start_client(p);      /* on_connect subscribes + publishes "online" */
    } else {
        /* Client already up. A device that only now asks for the proxy still
         * needs the subscribe, and the connect callback won't fire again until a
         * reconnect. */
        if (wants_trigger && !p->trigger) {
            p->trigger = 1;
            if (p->connected &&
                mosquitto_subscribe(p->mosq, NULL, p->cmd_topic, 1) == MOSQ_ERR_SUCCESS)
                printf("[TRIGGER] %.8s... subscribed to %s\n", p->tid, p->cmd_topic);
        }
        prv_publish_state(p);     /* publish the refreshed presence now */
    }

    pthread_mutex_unlock(&g_lock);
}

void gw_presence_lost(const char *id)
{
    if (id == NULL || id[0] == '\0')
        return;

    pthread_mutex_lock(&g_lock);
    for (int i = 0; i < g_count; i++) {
        if (strcmp(g_pres[i].id, id) == 0 && g_pres[i].online) {
            g_pres[i].online = 0;
            prv_publish_state(&g_pres[i]);
        }
    }
    pthread_mutex_unlock(&g_lock);
}

void gw_presence_close_all(void)
{
    pthread_mutex_lock(&g_lock);
    for (int i = 0; i < g_count; i++) {
        if (g_pres[i].mosq) {
            mosquitto_loop_stop(g_pres[i].mosq, true);
            mosquitto_disconnect(g_pres[i].mosq);
            mosquitto_destroy(g_pres[i].mosq);
            g_pres[i].mosq = NULL;
        }
    }
    g_count = 0;
    pthread_mutex_unlock(&g_lock);
}
