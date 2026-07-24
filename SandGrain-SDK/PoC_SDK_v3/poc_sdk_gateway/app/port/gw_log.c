/* =============================================================================
 * gw_log.c
 *
 * Persistent MQTT log publisher for gateway step/retry/result events plus the
 * terminal auth_result. Uses a dedicated mosquitto client so it never
 * interferes with the per-request server connections used by the auth FSM.
 *
 * Survives broker restarts: a disconnect callback flips the connected flag and
 * libmosquitto's background loop thread (mosquitto_loop_start) drives the
 * reconnect with exponential backoff. Publishes during a disconnect window are
 * a silent no-op; once the broker comes back, the next gw_log_publish call
 * just works.
 *
 * Ported from trustbridge-sdk-v3/.../poc_sdk_gateway/app/port/gw_log.c, adapted
 * to the new config (MQTT_BROKER/MQTT_PORT/MQTT_KEEPALIVE), with an added
 * auth_result publisher and the reconnect-on-disconnect plumbing.
 * ============================================================================= */

#include "gw_log.h"
#include "config_poc.h"

#include <mosquitto.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static struct mosquitto *g_log_mosq  = NULL;
static int               g_connected = 0;

static void prv_on_connect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)mosq; (void)obj;
    g_connected = (rc == 0);
    if (rc != 0)
        printf("[GW_LOG] MQTT connect failed (rc=%d)\n", rc);
    else
        /* Logged on every successful (re)connect so a reconnect after a broker
         * restart is visible in the gateway terminal. */
        printf("[GW_LOG] Connected — publishing to sandgrain/v1/{tid}/gw_log + /auth_result\n");
}

static void prv_on_disconnect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)mosq; (void)obj;
    g_connected = 0;
    /* rc == 0 means we initiated the disconnect (gw_log_close);
     * anything else is unexpected (broker died, network blip, etc.) and the
     * loop_start thread will auto-reconnect using the delay we set in init. */
    if (rc != 0)
        printf("[GW_LOG] MQTT disconnected (rc=%d) — auto-reconnect pending\n", rc);
}

void gw_log_init(void)
{
    g_connected = 0;

    mosquitto_lib_init();

    /* MQTT requires a unique client-id per broker connection. A hardcoded id
     * ("gw_log_client") collides the moment a second gateway — or a lingering
     * previous run — connects to the same broker: the broker evicts the older
     * connection (on_disconnect rc=7), both sides auto-reconnect, and they flap
     * forever. On a shared/public broker that is guaranteed. Derive a per-host,
     * per-process id so every gateway (and every restart) is distinct. */
    char client_id[96];
    char host[64] = {0};
    if (gethostname(host, sizeof(host) - 1) != 0)
        host[0] = '\0';
    snprintf(client_id, sizeof(client_id), "gw_log_%s_%d",
             host[0] ? host : "gw", (int)getpid());

    g_log_mosq = mosquitto_new(client_id, true, NULL);
    if (!g_log_mosq)
    {
        printf("[GW_LOG] mosquitto_new failed\n");
        return;
    }

    mosquitto_connect_callback_set   (g_log_mosq, prv_on_connect);
    mosquitto_disconnect_callback_set(g_log_mosq, prv_on_disconnect);

    /* Exponential backoff between reconnect attempts: 1s → 30s, with jitter.
     * This is what makes the gw_log client survive a Docker / mosquitto
     * restart without us having to kill+rerun test_gw. */
    mosquitto_reconnect_delay_set(g_log_mosq,
                                  /* base */ 1,
                                  /* max  */ 30,
                                  /* exponential backoff */ true);

    /* connect_async + loop_start: the background thread handles the initial
     * connect AND every subsequent reconnect. We don't drive the loop manually
     * anymore (the old prv_init drove it via mosquitto_loop in a tight for-loop
     * which worked for first-connect but had no path back from a disconnect). */
    int rc = mosquitto_connect_async(g_log_mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE);
    if (rc != MOSQ_ERR_SUCCESS)
    {
        printf("[GW_LOG] connect_async failed (rc=%d) — logs will not be published\n", rc);
        mosquitto_destroy(g_log_mosq);
        g_log_mosq = NULL;
        return;
    }

    if (mosquitto_loop_start(g_log_mosq) != MOSQ_ERR_SUCCESS)
    {
        printf("[GW_LOG] loop_start failed — logs will not be published\n");
        mosquitto_destroy(g_log_mosq);
        g_log_mosq = NULL;
        return;
    }

    /* Best-effort: wait briefly so the "Connected" log line lands before the
     * first auth flow runs. If it's still pending, the loop thread keeps
     * retrying in the background and publishes start working as soon as
     * the connect-callback flips g_connected. */
    for (int i = 0; i < 20 && !g_connected; i++)
    {
        struct timespec ts = { .tv_sec = 0, .tv_nsec = 50 * 1000 * 1000 };  /* 50 ms */
        nanosleep(&ts, NULL);
    }

    if (!g_connected)
        printf("[GW_LOG] Initial connect pending — background thread will retry until the broker is reachable\n");
}

void gw_log_publish(const char *tid_hex, const char *step,
                    const char *status, const char *message, int attempt)
{
    /* Drop publishes if we're not connected. Once the loop thread reconnects,
     * the next publish call just works — no manual loop poking needed. */
    if (!g_log_mosq || !g_connected)      return;
    if (!tid_hex || tid_hex[0] == '\0')   return;

    char topic[160];
    char payload[512];

    snprintf(topic, sizeof(topic), "sandgrain/v1/%s/gw_log", tid_hex);
    snprintf(payload, sizeof(payload),
             "{\"step\":\"%s\",\"status\":\"%s\",\"message\":\"%s\",\"attempt\":%d}",
             step ? step : "", status ? status : "", message ? message : "", attempt);

    mosquitto_publish(g_log_mosq, NULL, topic, (int)strlen(payload), payload, 0, false);
}

void gw_log_publish_auth_result(const char *tid_hex, int auth_ok)
{
    if (!g_log_mosq || !g_connected)      return;
    if (!tid_hex || tid_hex[0] == '\0')   return;

    char topic[160];
    char payload[64];

    snprintf(topic, sizeof(topic), "sandgrain/v1/%s/auth_result", tid_hex);
    snprintf(payload, sizeof(payload),
             "{\"auth_status\":\"%s\"}", auth_ok ? "AUTH_OK" : "AUTH_NOK");

    /* QoS 1 — auth_result is the terminal event the BE keys success/fail off,
     * so make the broker ack it; publishes during a disconnect window still
     * just no-op above. */
    mosquitto_publish(g_log_mosq, NULL, topic, (int)strlen(payload), payload, 1, false);
}

void gw_log_close(void)
{
    if (g_log_mosq)
    {
        /* Stop the background thread before destroying the client. The `true`
         * forces the loop to exit even if it's blocked in a network call. */
        mosquitto_loop_stop(g_log_mosq, true);
        mosquitto_disconnect(g_log_mosq);
        mosquitto_destroy(g_log_mosq);
        g_log_mosq  = NULL;
        g_connected = 0;
    }
}
