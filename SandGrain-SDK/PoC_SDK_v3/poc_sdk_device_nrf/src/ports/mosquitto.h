/* =============================================================================
 * mosquitto.h - stub for the nRF/BLE device build
 *
 * The SDK's sdk_fw/port/port_comm.h includes <mosquitto.h> and keeps a
 * `struct mosquitto *mosq` field in port_comm_ctx_t. On this target the
 * device<->gateway link is Bluetooth LE, not MQTT, so libmosquitto is never
 * used. port_comm.h only ever references `struct mosquitto` as an opaque
 * pointer, so a forward declaration is all that is needed to compile.
 * ============================================================================= */
#ifndef MOSQUITTO_STUB_H
#define MOSQUITTO_STUB_H

struct mosquitto;   /* opaque - never dereferenced on this target */

#endif /* MOSQUITTO_STUB_H */
