/* =============================================================================
 * trace_log.c  (gateway)
 *
 * Local JSON-lines traceability logger. See trace_log.h for the field contract
 * and the TRACE_LOG_PATH enable switch.
 *
 * gateway_id is resolved once at init from the gateway's broker-facing IP (the
 * SAME source port_comm stamps onto the wire envelope), so this local trace file
 * and the cloud trace agree on the gateway's identity. The gateway runs in relay
 * mode and has no crypto TID/UUID of its own. app_message_seq is a
 * process-wide monotonic counter; device_app_message_seq is a per-TID counter
 * the gateway maintains for each device it relays for (best-effort — the
 * MQTT-free device does not carry its own seq over the wire).
 * ============================================================================= */

#include "trace_log.h"
#include "gw_whitelist.h"   /* gw_whitelist_resolve_ip — same gateway IP as port_comm */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Portable mutex — mirrors the WIN32/pthread split used elsewhere in the app. */
#ifdef WIN32
  #include <winsock2.h>   /* include before windows.h to avoid winsock1 clash */
  #include <windows.h>
  static CRITICAL_SECTION g_lock;
  static int              g_lock_ready = 0;
  #define LOCK_INIT()    do { InitializeCriticalSection(&g_lock); g_lock_ready = 1; } while (0)
  #define LOCK()         do { if (g_lock_ready) EnterCriticalSection(&g_lock); } while (0)
  #define UNLOCK()       do { if (g_lock_ready) LeaveCriticalSection(&g_lock); } while (0)
  #define LOCK_DESTROY() do { if (g_lock_ready) { DeleteCriticalSection(&g_lock); g_lock_ready = 0; } } while (0)
#else
  #include <pthread.h>
  static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
  #define LOCK_INIT()    ((void)0)
  #define LOCK()         pthread_mutex_lock(&g_lock)
  #define UNLOCK()       pthread_mutex_unlock(&g_lock)
  #define LOCK_DESTROY() ((void)0)
#endif

#define PERDEV_SLOTS 16   /* per-TID seq table size (best-effort) */

static FILE         *g_fp        = NULL;
static int           g_enabled   = 0;
static int           g_debug     = 0;   /* TRACE_LOG_DEBUG -> emit request_data */
static unsigned long g_seq       = 0;
static char          g_gateway_id[80] = {0};
static char          g_flow_id[24] = {0};   /* per-attempt correlation id (device-minted, relayed) */

/* Small per-device sequence table, keyed by hex TID. Guarded by g_lock. */
static struct {
    char          tid[65];
    unsigned long seq;
} g_perdev[PERDEV_SLOTS];
static int g_perdev_count = 0;

/* Return + increment the per-device seq for tid. Caller holds g_lock. */
static unsigned long perdev_next(const char *tid)
{
    if (!tid || tid[0] == '\0')
        return 0;
    for (int i = 0; i < g_perdev_count; i++)
        if (strncmp(g_perdev[i].tid, tid, sizeof(g_perdev[i].tid) - 1) == 0)
            return ++g_perdev[i].seq;
    if (g_perdev_count < PERDEV_SLOTS) {
        int i = g_perdev_count++;
        strncpy(g_perdev[i].tid, tid, sizeof(g_perdev[i].tid) - 1);
        g_perdev[i].tid[sizeof(g_perdev[i].tid) - 1] = '\0';
        g_perdev[i].seq = 1;
        return 1;
    }
    return 0;   /* table full — best-effort, stop tracking new TIDs */
}

/* Append a JSON-string-escaped copy of src into buf[*pos..cap). */
static void json_escape(char *buf, size_t cap, size_t *pos, const char *src)
{
    if (!src) return;
    for (; *src && *pos + 2 < cap; src++)
    {
        unsigned char c = (unsigned char)*src;
        switch (c)
        {
            case '"':  buf[(*pos)++] = '\\'; buf[(*pos)++] = '"';  break;
            case '\\': buf[(*pos)++] = '\\'; buf[(*pos)++] = '\\'; break;
            case '\n': buf[(*pos)++] = '\\'; buf[(*pos)++] = 'n';  break;
            case '\r': buf[(*pos)++] = '\\'; buf[(*pos)++] = 'r';  break;
            case '\t': buf[(*pos)++] = '\\'; buf[(*pos)++] = 't';  break;
            default:
                if (c < 0x20) {
                    if (*pos + 6 >= cap) return;
                    *pos += (size_t)snprintf(buf + *pos, cap - *pos, "\\u%04x", c);
                } else {
                    buf[(*pos)++] = (char)c;
                }
                break;
        }
    }
}

static void iso8601_utc(char *buf, size_t n)
{
    time_t now = time(NULL);
    struct tm tm_utc;
#ifdef WIN32
    gmtime_s(&tm_utc, &now);
#else
    gmtime_r(&now, &tm_utc);
#endif
    if (strftime(buf, n, "%Y-%m-%dT%H:%M:%SZ", &tm_utc) == 0 && n > 0)
        buf[0] = '\0';
}

void trace_log_init(void)
{
    if (g_fp) return;

    const char *path = getenv("TRACE_LOG_PATH");
    if (!path || path[0] == '\0')
        return;

    /* Resolve a stable gateway identity: the gateway's broker-facing IP, the
     * SAME source port_comm stamps onto the wire envelope, so the gateway's own
     * trace file and the cloud trace agree. Relay mode has no chip TID of its
     * own; resolve_gw_ip falls back to "gw" internally on failure. */
    gw_whitelist_resolve_ip(g_gateway_id, sizeof(g_gateway_id));

    g_fp = fopen(path, "a");
    if (!g_fp) {
        printf("[TRACE_LOG] cannot open '%s' — gateway tracing disabled\n", path);
        return;
    }
    setvbuf(g_fp, NULL, _IOLBF, 0);
    LOCK_INIT();
    g_enabled = 1;

    /* Debug level (spec section 2): request_data is emitted only when this
     * second switch is on. Any value except unset/empty/"0"/"false" enables. */
    const char *dbg = getenv("TRACE_LOG_DEBUG");
    g_debug = (dbg && dbg[0] != '\0' &&
               strcmp(dbg, "0") != 0 && strcmp(dbg, "false") != 0) ? 1 : 0;

    printf("[TRACE_LOG] gateway traceability -> %s (gateway_id=%s, debug=%s)\n",
           path, g_gateway_id, g_debug ? "on" : "off");
}

int trace_log_enabled(void)       { return g_enabled; }
int trace_log_debug_enabled(void) { return g_enabled && g_debug; }

void trace_log_set_flow_id(const char *flow_id)
{
    if (!flow_id) { g_flow_id[0] = '\0'; return; }
    strncpy(g_flow_id, flow_id, sizeof(g_flow_id) - 1);
    g_flow_id[sizeof(g_flow_id) - 1] = '\0';
}

const char *trace_log_get_flow_id(void) { return g_flow_id; }

void trace_log_mask(const char *in, char *out, size_t out_cap)
{
    if (!out || out_cap == 0) return;
    out[0] = '\0';
    if (!in) return;

    size_t n = strlen(in);
    /* Short values: first-4 + last-4 would reveal (nearly) the whole secret, so
     * mask them entirely. Real crypto material (rw/ek/cw = 32+ hex chars) never
     * hits this branch and always keeps >= 8 chars hidden. */
    if (n < 12)
    {
        snprintf(out, out_cap, "****");
        return;
    }
    snprintf(out, out_cap, "%.4s...%s", in, in + (n - 4));
}

unsigned long trace_log_event(const char *device_id,
                              const char *event_type,
                              const char *outbound_interface,
                              const char *result_code,
                              const char *backend_response,
                              const char *additional_info)
{
    return trace_log_event_ex(device_id, event_type, outbound_interface,
                              result_code, backend_response, additional_info, NULL);
}

unsigned long trace_log_event_ex(const char *device_id,
                                 const char *event_type,
                                 const char *outbound_interface,
                                 const char *result_code,
                                 const char *backend_response,
                                 const char *additional_info,
                                 const char *request_data)
{
    /* Disabled: no line written and no sequence assigned. Returns 0 so callers
     * that want the app_message_seq (gw_log) can fall back to their own. */
    if (!g_enabled || !g_fp) return 0;

    char ts[32];
    iso8601_utc(ts, sizeof(ts));

    char line[2048];
    size_t pos = 0;

    LOCK();
    unsigned long seq        = ++g_seq;
    unsigned long dev_seq    = perdev_next(device_id);

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos,
        "{\"local_timestamp\":\"%s\",\"gateway_id\":\"", ts);
    json_escape(line, sizeof(line), &pos, g_gateway_id);

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos, "\",\"flow_id\":\"");
    json_escape(line, sizeof(line), &pos, g_flow_id);

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos,
        "\",\"app_message_seq\":%lu,\"device_id\":\"", seq);
    json_escape(line, sizeof(line), &pos, device_id ? device_id : "");

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos,
        "\",\"device_app_message_seq\":%lu,\"event_type\":\"", dev_seq);
    json_escape(line, sizeof(line), &pos, event_type ? event_type : "");

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos, "\",\"outbound_interface\":\"");
    json_escape(line, sizeof(line), &pos, outbound_interface ? outbound_interface : "");

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos, "\",\"result_code\":\"");
    json_escape(line, sizeof(line), &pos, result_code ? result_code : "");

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos, "\",\"backend_response\":\"");
    json_escape(line, sizeof(line), &pos, backend_response ? backend_response : "");

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos, "\",\"additional_info\":\"");
    json_escape(line, sizeof(line), &pos, additional_info ? additional_info : "");

    /* Close the additional_info string value. */
    if (pos < sizeof(line) - 2)
        line[pos++] = '"';

    /* Debug level: append request_data as a nested JSON object, verbatim. The
     * caller is responsible for having masked any sensitive members already. */
    if (g_debug && request_data && request_data[0] != '\0')
    {
        pos += (size_t)snprintf(line + pos, sizeof(line) - pos,
                                ",\"request_data\":%s", request_data);
        if (pos >= sizeof(line))          /* snprintf truncated — clamp */
            pos = sizeof(line) - 1;
    }

    if (pos < sizeof(line) - 2) {
        line[pos++] = '}'; line[pos++] = '\n';
        line[pos]   = '\0';
    } else {
        strcpy(line + sizeof(line) - 3, "}\n");
    }

    fputs(line, g_fp);
    UNLOCK();
    return seq;
}

void trace_log_close(void)
{
    if (g_fp) {
        LOCK();
        fflush(g_fp);
        fclose(g_fp);
        g_fp      = NULL;
        g_enabled = 0;
        UNLOCK();
        LOCK_DESTROY();
    }
}
