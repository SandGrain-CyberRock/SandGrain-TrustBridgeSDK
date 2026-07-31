#ifndef GW_PRESENCE_H
#define GW_PRESENCE_H

#include <stdbool.h>

/* =============================================================================
 * gw_presence.h
 *
 * Gateway-side MQTT proxy for devices that have no MQTT client of their own:
 * device presence AND BE-driven auth triggers, on the device's behalf.
 *
 * Transport-agnostic: the device link layer identifies each device by an opaque
 * channel-id string (a TCP channel name, a BLE MAC, ...) and drives this module
 * from its own events:
 *
 *   - on connect + "HELLO <tid> [TRIGGER]"  -> gw_presence_online(id, tid, want)
 *   - on link loss / disconnect             -> gw_presence_lost(id)
 *
 * For each device this module runs one dedicated mosquitto client that:
 *   - publishes  sandgrain/v1/{tid}/status  "online"/"offline" (retained, QoS 1),
 *     with a retained "offline" Last-Will so a gateway crash flips it offline;
 *   - if the device asked for it (TRIGGER), subscribes
 *     sandgrain/v1/{tid}/cmd/run_auth and relays the trigger back down the device
 *     link as "RUN_AUTH <mode>" via the registered forwarder.
 *
 * From the broker's point of view these are indistinguishable from a native
 * device publishing its own presence and subscribing its own trigger topic, so
 * TrustBridge is untouched.
 * ============================================================================= */

/* The device link forwards a relayed trigger down the channel identified by
 * `id` as a "RUN_AUTH <mode>" control line. Registered by the link layer. */
typedef void (*gw_presence_trigger_fn)(const char *id, int mode);
void gw_presence_set_trigger_handler(gw_presence_trigger_fn fn);

/* A device announced itself ("HELLO <tid> [TRIGGER]") on channel `id`. Brings it
 * ONLINE (retained status) and, if `wants_trigger`, subscribes its cmd/run_auth.
 * Safe to call again on reconnect (rebinds the channel, refreshes presence). */
void gw_presence_online(const char *id, const char *tid_hex, bool wants_trigger);

/* The device on channel `id` dropped — publish a retained "offline". No-op if
 * that channel never sent a HELLO. */
void gw_presence_lost(const char *id);

/* Close every per-device client (gateway shutdown). */
void gw_presence_close_all(void);

#endif /* GW_PRESENCE_H */
