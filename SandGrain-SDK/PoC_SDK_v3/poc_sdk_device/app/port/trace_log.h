#ifndef TRACE_LOG_H
#define TRACE_LOG_H

#include <stddef.h>   /* size_t (trace_log_mask) */

/* =============================================================================
 * trace_log.h  (device)
 *
 * Local per-event traceability log for the Device SDK, per the TrustBridge
 * "Device - Gateway - Backend Traceability" spec (section 1). When enabled it
 * appends one JSON object per line to a local file so a transaction can be
 * followed end-to-end: device -> gateway -> cloud -> backend.
 *
 * Enable + destination: set the TRACE_LOG_PATH environment variable to a file
 * path. If it is unset (or empty) tracing is OFF and every call here is a cheap
 * no-op — the device behaves exactly as before. This is the master traceability
 * switch.
 *
 * Log LEVELS (spec section 1): the info fields below are always emitted. The
 * debug-level `request_data` field is emitted ONLY when TRACE_LOG_DEBUG is also
 * set (to anything other than "0"/"false"). That two-switch split lets an
 * operator capture the identity/flow trail without the heavier per-message data
 * dump in normal runs.
 *
 * Each line carries the section-1 info fields:
 *   local_timestamp   ISO-8601 UTC (seconds precision)
 *   device_id         hex TID (set once via trace_log_set_device_id)
 *   event_type        CONNECT / CHALLENGE_RECEIVED / RESPONSE_COMPUTED /
 *                     PUBLISH / RESULT_RECEIVED / AUTH_COMPLETE / ...
 *   app_message_seq   monotonic per-process app-level sequence
 *   outbound_interface transport toward the peer (constant "GW_TCP" — the
 *                     MQTT-free device only ever talks to the gateway over the
 *                     persistent TCP link)
 *   result_code       optional status string (NULL -> "")
 *   peer_response     optional response from gateway/backend (NULL -> "")
 *   additional_info   optional free text (NULL -> "")
 * and, at debug level only:
 *   request_data      the message's data elements as a nested JSON object,
 *                     with sensitive crypto values MASKED to first-4 + last-4
 *                     characters (trace_log_mask) per the spec.
 *
 * Thread-safety: the file append is guarded by an internal mutex, so the
 * interactive-menu thread and the trigger-listener thread can log concurrently.
 *
 * SECURITY NOTE (spec-mandated override): the traceability spec (section 1)
 * requires a debug-level `request_data` field carrying rw/ek "masked except the
 * first 4 and last 4 characters". That partially exposes crypto material and is
 * a deliberate, documented exception to the project's otherwise-strict "never
 * log CW/RW/echo/HCW/HRW" rule — which is why it lives behind the SEPARATE
 * TRACE_LOG_DEBUG switch and every sensitive value MUST be passed through
 * trace_log_mask() before it reaches request_data. Never place UNmasked crypto
 * material in any field here; for info-level fields keep logging only the TID
 * (identity) and the CyberRock transaction_id (cloud lookup handle).
 * ============================================================================= */

/** Open the log (append) if TRACE_LOG_PATH is set; init the mutex. Idempotent.
 *  Safe to call before the device id is known. */
void trace_log_init(void);

/** Record the device id (hex TID) stamped on every subsequent line. */
void trace_log_set_device_id(const char *tid_hex);

/** Append one traceability event (info fields only). Any of result_code/
 *  peer_response/additional_info may be NULL. No-op when tracing is disabled.
 *  Thin wrapper over trace_log_event_ex() with request_data == NULL. */
void trace_log_event(const char *event_type,
                     const char *result_code,
                     const char *peer_response,
                     const char *additional_info);

/** Append one traceability event, optionally carrying the debug-level
 *  `request_data`. `request_data` must be a valid JSON object string (e.g.
 *  "{\"rw\":\"1a2b...ef01\"}") whose sensitive members have ALREADY been passed
 *  through trace_log_mask(); it is emitted verbatim (unescaped) and ONLY when
 *  TRACE_LOG_DEBUG is enabled. Pass NULL to omit it. */
void trace_log_event_ex(const char *event_type,
                        const char *result_code,
                        const char *peer_response,
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

/** Flush + close the log file and destroy the mutex. */
void trace_log_close(void);

#endif /* TRACE_LOG_H */
