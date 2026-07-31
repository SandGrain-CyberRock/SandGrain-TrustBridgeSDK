#ifndef PORT_COMM_H
#define PORT_COMM_H

#include <stdint.h>
#include <stdbool.h>

/* =============================================================================
 * port_comm_ctx_t
 *
 * Opaque per-connection context. The shape is defined by the transport
 * implementation (port_comm.c) — the SDK and its callers treat it as a handle.
 * Transports that keep their state in file-scope globals may ignore ctx and
 * accept NULL.
 * ============================================================================= */
typedef struct port_comm_ctx_s port_comm_ctx_t;

bool port_comm_init   (port_comm_ctx_t *ctx, const char *device_id);
bool port_comm_send   (port_comm_ctx_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size);
bool port_comm_receive(port_comm_ctx_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size);
void port_comm_close  (port_comm_ctx_t *ctx);

/* =============================================================================
 * Persistent link + BE trigger relay (device runs MQTT-free)
 *
 * The device dials the gateway once and keeps the link open for the whole
 * process. The gateway relays TrustBridge run_auth triggers down this link as
 * "RUN_AUTH <mode>" control lines (mirroring the device's own HELLO), so the
 * device no longer needs an MQTT client of its own. While the persistent link
 * is up, port_comm_init() reuses it and port_comm_close() keeps it open;
 * per-auth open/close then become no-ops.
 * ============================================================================= */

/* Dial the gateway (if not already linked) and announce this device with
 * "HELLO <tid_hex>[ TRIGGER]". Idempotent — returns true if the link is up. */
bool port_comm_connect_persistent(const char *tid_hex, bool wants_trigger);

/* True while the persistent link to the gateway is established. */
bool port_comm_is_linked(void);

/* Non-blocking: if the gateway pushed a "RUN_AUTH <mode>" line while the device
 * was idle, consume it, store the mode in *mode and return 1; otherwise 0.
 * Detects a dropped link (returns 0 and clears the link so the caller can
 * reconnect). Call only when NOT authenticating (the auth flow owns the socket). */
int  port_comm_poll_trigger(int *mode);

/* Tear the persistent link down (process exit). */
void port_comm_shutdown(void);

#endif /* PORT_COMM_H */
