/* =============================================================================
 * gw_log.c - gateway telemetry over the shared MQTT connection
 *
 * Publishes the same topics as the PC gateway so the TrustBridge activity
 * board renders this board's auth runs identically:
 *   sandgrain/v1/<tid>/gw_log       {"step","status","message","attempt"}
 *   sandgrain/v1/<tid>/auth_result  {"auth_status":"AUTH_OK"|"AUTH_NOK"}
 * ============================================================================= */
#include "gw_log.h"
#include "app_mqtt.h"

#include <stdio.h>
#include <string.h>

void gw_log_init(void)
{
	/* Nothing to do - app_mqtt owns the connection. */
}

void gw_log_publish(const char *tid_hex, const char *step,
		    const char *status, const char *message, int attempt)
{
	char topic[160];
	char payload[512];

	if (tid_hex == NULL || tid_hex[0] == '\0' || !app_mqtt_is_up()) {
		return;
	}

	snprintf(topic, sizeof(topic), "sandgrain/v1/%s/gw_log", tid_hex);
	snprintf(payload, sizeof(payload),
		 "{\"step\":\"%s\",\"status\":\"%s\",\"message\":\"%s\",\"attempt\":%d}",
		 step ? step : "", status ? status : "",
		 message ? message : "", attempt);

	(void)app_mqtt_publish(topic, payload, (uint16_t)strlen(payload), false);
}

void gw_log_publish_auth_result(const char *tid_hex, int auth_ok)
{
	char topic[160];
	char payload[64];

	if (tid_hex == NULL || tid_hex[0] == '\0' || !app_mqtt_is_up()) {
		return;
	}

	snprintf(topic, sizeof(topic), "sandgrain/v1/%s/auth_result", tid_hex);
	snprintf(payload, sizeof(payload), "{\"auth_status\":\"%s\"}",
		 auth_ok ? "AUTH_OK" : "AUTH_NOK");

	(void)app_mqtt_publish(topic, payload, (uint16_t)strlen(payload), false);
}

void gw_log_close(void)
{
}
