#ifndef TRACE_LOG_H
#define TRACE_LOG_H

#include <stddef.h>   /* size_t (trace_log_mask) */

/* =============================================================================
 * trace_log.h  (gateway)
 *
 * Local per-event traceability log for the Gateway SDK, per the TrustBridge
 * "Device - Gateway - Backend Traceability" spec (section 2). When enabled it
 * appends one JSON object per line to a local file.
 *
 * This is DISTINCT from gw_log.c: gw_log publishes step/status telemetry to the
 * backend over MQTT (and goes silent when the broker is down); this writes a
 * local file that survives broker outages, for end-to-end offline traceability.
 *
 * Enable + destination: set the TRACE_LOG_PATH environment variable to a file
 * path. Unset/empty -> tracing OFF and every call is a cheap no-op.
 *
 * Log LEVELS (spec section 2): the info fields below are always emitted. The
 * debug-level `request_data` field is emitted ONLY when TRACE_LOG_DEBUG is also
 * set (to anything other than "0"/"false").
 *
 * Each line carries the section-2 info fields:
 *   local_timestamp        ISO-8601 UTC (seconds precision)
 *   gateway_id             this gateway's broker-facing IP (resolved at init)
 *   app_message_seq        monotonic per-process gateway app-level sequence
 *   device_id              hex TID of the device the gateway is relaying for
 *   device_app_message_seq gateway-observed per-device message sequence
 *   event_type             CONNECT / CHALLENGE_RECEIVED / RESPONSE_COMPUTED /
 *                          PUBLISH / RESULT_RECEIVED / ...
 *   outbound_interface     transport toward cloud/backend ("MQTT") or the
 *                          device leg ("GW_TCP")
 *   result_code            optional status string (NULL -> "")
 *   backend_response       optional response from cloud/backend (NULL -> "")
 *   additional_info        optional free text (NULL -> "")
 * and, at debug level only:
 *   request_data           the message's data elements as a nested JSON object,
 *                          with sensitive crypto values MASKED to first-4 +
 *                          last-4 characters (trace_log_mask) per the spec.
 *
 * Thread-safety: the file append + the sequence counters are guarded by an
 * internal mutex, so the main FSM loop and the MQTT loop threads (gw_log /
 * gw_presence / gw_whitelist) can log concurrently.
 *
 * SECURITY NOTE (spec-mandated override): the traceability spec (section 2)
 * requires a debug-level `request_data` field carrying rw/ek "masked except the
 * first 4 and last 4 characters". That partially exposes crypto material and is
 * a deliberate, documented exception to the project's otherwise-strict "never
 * log CW/RW/echo/HCW/HRW" rule — which is why it lives behind the SEPARATE
 * TRACE_LOG_DEBUG switch and every sensitive value MUST be passed through
 * trace_log_mask() before it reaches request_data. Never place UNmasked crypto
 * material in any field here; for info-level fields keep logging only the TID
 * (identity) and the CyberRock transaction_id (cloud lookup handle).
 * ============================================================================= */

/** Open the log (append) if TRACE_LOG_PATH is set; resolve gateway_id; init the
 *  mutex. Idempotent. */
void trace_log_init(void);

/** Append one traceability event on behalf of device `device_id` (hex TID; may
 *  be NULL/empty for gateway-only events). Any of result_code/backend_response/
 *  additional_info may be NULL. No-op when tracing is disabled. Thin wrapper
 *  over trace_log_event_ex() with request_data == NULL.
 *  Returns the app_message_seq assigned to this event (so a caller can echo the
 *  exact same number elsewhere, e.g. gw_log's MQTT payload); 0 when tracing is
 *  disabled. */
unsigned long trace_log_event(const char *device_id,
                              const char *event_type,
                              const char *outbound_interface,
                              const char *result_code,
                              const char *backend_response,
                              const char *additional_info);

/** As trace_log_event(), plus the debug-level `request_data`. `request_data`
 *  must be a valid JSON object string whose sensitive members have ALREADY been
 *  passed through trace_log_mask(); it is emitted verbatim (unescaped) and ONLY
 *  when TRACE_LOG_DEBUG is enabled. Pass NULL to omit it.
 *  Returns the app_message_seq assigned to this event; 0 when tracing is
 *  disabled. */
unsigned long trace_log_event_ex(const char *device_id,
                                 const char *event_type,
                                 const char *outbound_interface,
                                 const char *result_code,
                                 const char *backend_response,
                                 const char *additional_info,
                                 const char *request_data);

/** Mask a sensitive value for request_data: keeps the first 4 and last 4
 *  characters ("1a2b...ef01") per the spec. Values shorter than 12 chars are
 *  fully masked ("****") so a short secret is never revealed whole. `out` is
 *  always NUL-terminated (empty if `in` is NULL). */
void trace_log_mask(const char *in, char *out, size_t out_cap);

/** Cheap check callers can use to skip building expensive log strings. */
int  trace_log_enabled(void);

/** True only when tracing AND debug level (TRACE_LOG_DEBUG) are both enabled —
 *  i.e. when request_data will actually be emitted. */
int  trace_log_debug_enabled(void);

/** Record / read the per-attempt flow_id stamped on every subsequent trace line
 *  AND onto the outgoing cloud envelope (port_comm). Adopted from the
 *  device-minted id relayed on the wire; empty string clears it. */
void        trace_log_set_flow_id(const char *flow_id);
const char *trace_log_get_flow_id(void);

/** Flush + close the log file and destroy the mutex. */
void trace_log_close(void);

#endif /* TRACE_LOG_H */
