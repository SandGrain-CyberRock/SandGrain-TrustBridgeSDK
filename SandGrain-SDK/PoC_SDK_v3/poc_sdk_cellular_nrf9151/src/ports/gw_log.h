/* =============================================================================
 * gw_log.h - gateway step/result telemetry to TrustBridge (MQTT)
 *
 * Same interface as the PC gateway's gw_log; implemented on the shared
 * app_mqtt connection instead of a dedicated mosquitto client.
 * ============================================================================= */
#ifndef GW_LOG_H
#define GW_LOG_H

void gw_log_init(void);
void gw_log_publish(const char *tid_hex, const char *step,
		    const char *status, const char *message, int attempt);
void gw_log_publish_auth_result(const char *tid_hex, int auth_ok);
void gw_log_close(void);

#endif /* GW_LOG_H */
