/* =============================================================================
 * trace_log.c  (device)
 *
 * Local JSON-lines traceability logger. See trace_log.h for the field contract
 * and the TRACE_LOG_PATH enable switch.
 *
 * The device is MQTT-free, so outbound_interface is always the persistent TCP
 * link to the gateway ("GW_TCP"). app_message_seq is a process-wide monotonic
 * counter bumped on every recorded event.
 * ============================================================================= */

#include "trace_log.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Portable mutex — mirrors the WIN32/pthread split used elsewhere in the app. */
#ifdef WIN32
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

#define OUTBOUND_INTERFACE "GW_TCP"   /* MQTT-free device: only the GW TCP link */

static FILE         *g_fp        = NULL;
static int           g_enabled   = 0;
static int           g_debug     = 0;   /* TRACE_LOG_DEBUG -> emit request_data */
static unsigned long g_seq       = 0;
static char          g_device_id[65] = {0};

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
                if (c < 0x20) {            /* other control chars -> \u00XX */
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
    if (g_fp) return;                 /* already open */

    const char *path = getenv("TRACE_LOG_PATH");
    if (!path || path[0] == '\0')     /* tracing disabled */
        return;

    g_fp = fopen(path, "a");
    if (!g_fp) {
        printf("[TRACE_LOG] cannot open '%s' — device tracing disabled\n", path);
        return;
    }
    setvbuf(g_fp, NULL, _IOLBF, 0);   /* line-buffered so tails see events live */
    LOCK_INIT();
    g_enabled = 1;

    /* Debug level (spec section 1): request_data is emitted only when this
     * second switch is on. Any value except unset/empty/"0"/"false" enables. */
    const char *dbg = getenv("TRACE_LOG_DEBUG");
    g_debug = (dbg && dbg[0] != '\0' &&
               strcmp(dbg, "0") != 0 && strcmp(dbg, "false") != 0) ? 1 : 0;

    printf("[TRACE_LOG] device traceability -> %s (debug=%s)\n",
           path, g_debug ? "on" : "off");
}

void trace_log_set_device_id(const char *tid_hex)
{
    if (!tid_hex) return;
    strncpy(g_device_id, tid_hex, sizeof(g_device_id) - 1);
    g_device_id[sizeof(g_device_id) - 1] = '\0';
}

int trace_log_enabled(void)       { return g_enabled; }
int trace_log_debug_enabled(void) { return g_enabled && g_debug; }

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

void trace_log_event(const char *event_type,
                     const char *result_code,
                     const char *peer_response,
                     const char *additional_info)
{
    trace_log_event_ex(event_type, result_code, peer_response, additional_info, NULL);
}

void trace_log_event_ex(const char *event_type,
                        const char *result_code,
                        const char *peer_response,
                        const char *additional_info,
                        const char *request_data)
{
    if (!g_enabled || !g_fp) return;

    char ts[32];
    iso8601_utc(ts, sizeof(ts));

    char line[2048];
    size_t pos = 0;

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos,
        "{\"local_timestamp\":\"%s\",\"device_id\":\"", ts);
    json_escape(line, sizeof(line), &pos, g_device_id);

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos, "\",\"event_type\":\"");
    json_escape(line, sizeof(line), &pos, event_type ? event_type : "");

    LOCK();
    unsigned long seq = ++g_seq;

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos,
        "\",\"app_message_seq\":%lu,\"outbound_interface\":\"%s\",\"result_code\":\"",
        seq, OUTBOUND_INTERFACE);
    json_escape(line, sizeof(line), &pos, result_code ? result_code : "");

    pos += (size_t)snprintf(line + pos, sizeof(line) - pos, "\",\"peer_response\":\"");
    json_escape(line, sizeof(line), &pos, peer_response ? peer_response : "");

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
        /* Overflow guard: terminate as valid JSON regardless. */
        strcpy(line + sizeof(line) - 3, "}\n");
    }

    fputs(line, g_fp);
    UNLOCK();
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
