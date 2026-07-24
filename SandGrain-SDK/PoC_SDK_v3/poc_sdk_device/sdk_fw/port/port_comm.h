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

#endif /* PORT_COMM_H */
