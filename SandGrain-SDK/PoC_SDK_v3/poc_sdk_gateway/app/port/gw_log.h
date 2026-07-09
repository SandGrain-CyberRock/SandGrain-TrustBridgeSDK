#ifndef GW_LOG_H
#define GW_LOG_H

/* =============================================================================
 * gw_log.h
 *
 * Publish gateway step/retry/result + terminal auth_result to TrustBridge over
 * MQTT, so the backend can drive and observe mutual auth + error management.
 *   sandgrain/v1/{tid_hex}/gw_log       {"step":"...","status":"...","message":"...","attempt":N}
 *   sandgrain/v1/{tid_hex}/auth_result  {"auth_status":"AUTH_OK"|"AUTH_NOK"}
 *
 * Ported from trustbridge-sdk-v3; uses MQTT_BROKER/MQTT_PORT/MQTT_KEEPALIVE
 * from config_poc.h (env-overridable).
 * ============================================================================= */

/** Call once at gateway startup — opens a persistent MQTT log connection. */
void gw_log_init(void);

/**
 * Publish a gateway log entry for a device.
 * @param tid_hex 64-char hex TID  @param step e.g. "1/6","retry","err_mgt"
 * @param status  "ok"|"fail"|"info"  @param message human text  @param attempt 1-based
 */
void gw_log_publish(const char *tid_hex, const char *step,
                    const char *status, const char *message, int attempt);

/** Publish the terminal authentication outcome for a device. */
void gw_log_publish_auth_result(const char *tid_hex, int auth_ok);

/** Call at gateway shutdown — closes the log MQTT connection. */
void gw_log_close(void);

#endif /* GW_LOG_H */
