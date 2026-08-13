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
#include "trace_log.h"      /* local traceability log — survives broker outages */
#include "gw_whitelist.h"   /* gw_whitelist_resolve_ip — gateway's broker-facing IP */

#include <mosquitto.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#ifdef WIN32
  #include <winsock2.h>   /* gethostname is declared here on Windows (ws2_32) */
#endif

static struct mosquitto *g_log_mosq  = NULL;
static int               g_connected = 0;

/* Gateway's broker-facing IP, resolved once in gw_log_init() and stamped as
 * "gateway_id" into every gw_log payload so the BE can attribute the relaying
 * gateway. Same source as the wire envelope stamp (port_comm) and the local
 * trace file; "gw" if detection fails. */
static char              g_gateway_id[64] = {0};

/* Fallback gw_log sequence, used ONLY when local tracing is disabled
 * (trace_log_event returns 0). Normally the gw_log payload echoes the trace
 * file's app_message_seq so the two logs match 1:1; this just keeps the BE from
 * seeing all-zeros when the operator ran without TRACE_LOG_PATH set.
 * Single-writer (the FSM thread calls the publish path), so a plain ++ is safe. */
static unsigned long     g_gw_seq = 0;

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

    /* Resolve the gateway's broker-facing IP once, to stamp as "gateway_id" on
     * each gw_log payload (BE already forwards the whole payload into its trace
     * store, so this needs no BE change). Winsock is up now that
     * mosquitto_lib_init() has run (it calls WSAStartup on Windows). "gw" on
     * failure. */
    gw_whitelist_resolve_ip(g_gateway_id, sizeof(g_gateway_id));

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

/* Publish the gw_log telemetry to the BE. No local trace here — the public
 * entry points below emit the trace (at the right level) BEFORE calling this,
 * so the file log survives a broker outage. No-op when the link is down. */
static void prv_publish_gw_log(const char *tid_hex, const char *step,
                               const char *status, const char *message,
                               int attempt, unsigned long seq)
{
    if (!tid_hex || tid_hex[0] == '\0')   return;   /* not a real event */

    /* Echo the trace file's app_message_seq (passed in) so the gw_log stream and
     * the local trace file carry the EXACT same number for a given event —
     * including the "phantom gaps" from trace-only events (CHALLENGE_RECEIVED,
     * CONNECT, ...) that never reach this topic. That is intentional: the two
     * logs line up 1:1. When tracing is disabled the caller passes 0; fall back
     * to our own counter so the BE still gets a real sequence, not all-zeros.
     * The trace event that produced `seq` was emitted before this call
     * regardless of connectivity, so a publish dropped in an outage still leaves
     * a gap the BE can detect. */
    if (seq == 0) seq = ++g_gw_seq;

    /* Drop publishes if we're not connected. Once the loop thread reconnects,
     * the next publish call just works — no manual loop poking needed. */
    if (!g_log_mosq || !g_connected)      return;

    char topic[160];
    char payload[512];

    snprintf(topic, sizeof(topic), "sandgrain/v1/%s/gw_log", tid_hex);
    snprintf(payload, sizeof(payload),
             "{\"gateway_id\":\"%s\",\"app_message_seq\":%lu,\"step\":\"%s\",\"status\":\"%s\",\"message\":\"%s\",\"attempt\":%d}",
             g_gateway_id, seq, step ? step : "", status ? status : "", message ? message : "", attempt);

    mosquitto_publish(g_log_mosq, NULL, topic, (int)strlen(payload), payload, 0, false);
}

void gw_log_publish(const char *tid_hex, const char *step,
                    const char *status, const char *message, int attempt)
{
    /* Local traceability first (info level, no request_data). Echo its assigned
     * app_message_seq into the MQTT payload so both streams carry the same #. */
    unsigned long seq = trace_log_event(tid_hex, step, "MQTT", status, NULL, message);
    prv_publish_gw_log(tid_hex, step, status, message, attempt, seq);
}

void gw_log_publish_ex(const char *tid_hex, const char *step,
                       const char *status, const char *message, int attempt,
                       const char *request_data)
{
    /* Local traceability first, WITH the debug-level request_data object (the
     * MQTT telemetry payload stays lean — request_data is local-file only).
     * Echo the trace app_message_seq into the payload so both streams match. */
    unsigned long seq = trace_log_event_ex(tid_hex, step, "MQTT", status, NULL, message, request_data);
    prv_publish_gw_log(tid_hex, step, status, message, attempt, seq);
}

void gw_log_publish_auth_result(const char *tid_hex, int auth_ok)
{
    /* Local traceability first (survives broker outages — see gw_log_publish).
     * Reuse its app_message_seq so the auth_result carries the SAME number as
     * the AUTH_RESULT line in the trace file; fall back to our own counter when
     * tracing is disabled (return 0) so the BE never sees a zero. */
    unsigned long seq = trace_log_event(tid_hex, "AUTH_RESULT", "MQTT",
                                        auth_ok ? "AUTH_OK" : "AUTH_NOK", NULL,
                                        "terminal auth outcome");
    if (seq == 0) seq = ++g_gw_seq;

    if (!g_log_mosq || !g_connected)      return;
    if (!tid_hex || tid_hex[0] == '\0')   return;

    char topic[160];
    char payload[160];

    snprintf(topic, sizeof(topic), "sandgrain/v1/%s/auth_result", tid_hex);
    snprintf(payload, sizeof(payload),
             "{\"gateway_id\":\"%s\",\"app_message_seq\":%lu,\"auth_status\":\"%s\"}",
             g_gateway_id, seq, auth_ok ? "AUTH_OK" : "AUTH_NOK");

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
