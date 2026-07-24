/* =============================================================================
 * port_comm_device.h
 *
 * Per-connection transport for the device ↔ gateway link.
 *
 * The struct is OPAQUE - its layout is defined by the transport implementation
 * (e.g. POSIX/winsock sockets, UART, BLE). The shipped SDK header has no
 * dependency on any platform header, so it compiles on bare-metal MCUs without
 * an OS or socket stack.
 *
 * Lifecycle:
 *   port_comm_device_create() - allocate a context
 *   port_comm_device_init() - open the link (device_id="server" for the
 *   listening side, an IP/host for the connecting
 *   side; the implementation decides how to interpret it)
 *   ... send / receive / is_ready ...
 *   port_comm_device_close() - close the link
 *   port_comm_device_destroy() - free the context
 * ============================================================================= */

#ifndef PORT_COMM_DEVICE_H
#define PORT_COMM_DEVICE_H

#include <stdint.h>
#include <stdbool.h>

typedef struct port_comm_device_s port_comm_device_t;

/**
 * Allocate a new context. Returns NULL on allocation failure.
 * On platforms without a heap, the implementation may return a slot from a
 * static pool instead.
 */
port_comm_device_t *port_comm_device_create(void);

/**
 * Release a context previously returned by port_comm_device_create().
 * Safe to call with NULL.
 */
void port_comm_device_destroy(port_comm_device_t *ctx);

/**
 * Open the link.
 * device_id = "server" - listening side (bind/listen/accept on socket impls)
 * device_id = host/IP - connecting side
 */
bool port_comm_device_init(port_comm_device_t *ctx, const char *device_id);

/**
 * Send data to the connected peer.
 */
bool port_comm_device_send(port_comm_device_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size);

/**
 * Receive data from the connected peer. *buffer_rx_received_size is 0 if no
 * data was available. Returns false only on a transport error.
 */
bool port_comm_device_receive(port_comm_device_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size);

/**
 * Non-blocking poll: true if a subsequent _receive would return data.
 */
bool port_comm_device_is_ready(port_comm_device_t *ctx);

/**
 * Close the link. The context remains valid for re-use until _destroy.
 */
void port_comm_device_close(port_comm_device_t *ctx);

#endif /* PORT_COMM_DEVICE_H */
