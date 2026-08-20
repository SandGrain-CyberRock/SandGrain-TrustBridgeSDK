/* =============================================================================
 * app_mqtt.h - shared MQTT connection for the cellular gateway+device build
 *
 * One MQTT connection to the hosted TrustBridge broker, shared by:
 *   - the SDK's port_comm (auth frames on sandgrain/v1/<tid>/req|rsp topics)
 *   - gw_log (step + auth_result telemetry)
 *   - presence (retained online on sandgrain/v1/<tid>/status)
 *
 * Implemented directly on the raw Zephyr MQTT client (zephyr/net/mqtt.h)
 * rather than the NCS mqtt_helper wrapper, because the wrapper only takes the
 * Last Will as compile-time Kconfig strings. Raw client gives us:
 *   - will topic built at runtime from the chip's TID (no per-chip rebuild)
 *   - retained will (broker's stored status flips to "offline" too)
 *   - client ID derived from the TID (multiple boards can coexist)
 *   - reconnect with backoff + re-subscribe after an LTE/TCP drop
 * ============================================================================= */
#ifndef APP_MQTT_H
#define APP_MQTT_H

#include <stdbool.h>
#include <stdint.h>
#include <zephyr/net/mqtt.h>

/* Broker: the hosted TrustBridge stack (trustbridge.sandgrain.dev).
 * The Elastic IP of its EC2 origin, NOT the hostname: the domain resolves to
 * Cloudflare, which only proxies web traffic - MQTT 1883 is reached directly
 * on the origin (security group opens it to 0.0.0.0/0, per the Coseco
 * server spec). 47.131.121.98 is a DIFFERENT environment (Intemo). */
#define APP_MQTT_BROKER_HOST  "52.220.111.145"
#define APP_MQTT_BROKER_PORT  1883
#define APP_MQTT_USERNAME     "sandgrain"
#define APP_MQTT_PASSWORD     "admin"

/* Client ID when the chip's TID is not known yet (chip unwired/unreadable).
 * With a TID the client ID is "sgr-<first 12 hex chars>" so several boards
 * can be connected to the broker at the same time. */
#define APP_MQTT_CLIENT_ID_FALLBACK  "nrf9151-cellular-gw"

/* Bring the shared MQTT connection up (call once, after LTE is connected).
 * tid_hex sets the connect-time identity: client ID and the retained Last
 * Will ("offline" on sandgrain/v1/<tid>/status). Pass NULL if the TID is not
 * known yet - connects with the fallback client ID and no will; install the
 * identity later with app_mqtt_reconnect_with_tid().
 * Returns 0 on success (CONNACK accepted). On failure the background
 * reconnect keeps retrying, so a late broker can still come up on its own. */
int app_mqtt_start(const char *tid_hex);

/* Install a (new) TID identity: if the connection is already up under this
 * TID, does nothing and returns 0. Otherwise stores the TID and forces a
 * drop + reconnect so the will/client ID get installed; returns 1 (the
 * reconnect finishes in the background: re-subscribe + presence included). */
int app_mqtt_reconnect_with_tid(const char *tid_hex);

/* True while the broker connection is up. */
bool app_mqtt_is_up(void);

/* Publish a payload to a topic. QoS 1. Returns 0 on success. */
int app_mqtt_publish(const char *topic, const void *payload, uint16_t len,
		     bool retain);

/* Subscribe (raw list passthrough) on the shared connection. The SUBACK is
 * reported asynchronously through port_comm_on_mqtt_suback() /
 * the cmd handler, keyed by list->message_id. Returns 0 on success. */
int app_mqtt_subscribe(struct mqtt_subscription_list *list);

/* Publish the retained presence state for a TID:
 * "online"/"offline" on sandgrain/v1/<tid_hex>/status. */
void app_mqtt_publish_presence(const char *tid_hex, bool online);

/* Subscribe to sandgrain/v1/<tid_hex>/cmd/run_auth - the topic TrustBridge
 * publishes on to trigger an authentication run ("online device flow").
 * On each trigger app_on_run_auth(mode) (implemented in main.c) is called
 * from the MQTT RX thread, with the mode parsed out of the {"mode":N}
 * payload (2 and 3 select the fault-injection runs, anything else is a
 * normal mutual auth). Call once, after the TID is known. Returns 0 on
 * success. Re-subscribing after a reconnect is handled internally. */
int app_mqtt_subscribe_run_auth(const char *tid_hex);

#endif /* APP_MQTT_H */
