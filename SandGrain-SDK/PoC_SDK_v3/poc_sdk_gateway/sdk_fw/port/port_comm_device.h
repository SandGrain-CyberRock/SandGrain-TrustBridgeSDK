/* =============================================================================
 * port_comm_device.h
 *
 * Device communication port - socket implementation.
 *
 * Each device has its own context (port_comm_device_t) with independent
 * state. Multiple devices can be handled simultaneously without conflicts.
 *
 * GW  - init with "server" -> binds, listens, accepts
 * DEV - init with IP       -> connects to GW
 * ============================================================================= */

#ifndef PORT_COMM_DEVICE_H
#define PORT_COMM_DEVICE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef _WIN32
    #include <winsock2.h>
    typedef SOCKET sock_t;
    #define SOCK_INVALID_VAL  INVALID_SOCKET
#else
    typedef int sock_t;
    #define SOCK_INVALID_VAL  (-1)
#endif

/* ===================== CONTEXT =====================
 * One instance per device connection.
 * All state is self-contained - no shared static variables.
 * ===================================================== */
typedef struct {
    sock_t  listen_fd;
    sock_t  conn_fd;
    bool    is_server;
    char    id[32];        /* channel id ("channel_0", ...) - key for the trigger forwarder */
    char    tid[65];       /* device TID learned from its HELLO (empty until then)          */
} port_comm_device_t;

/* ===================== API ===================== */

/**
 * Initialize communication port.
 * device_id = "server" -> GW mode (bind, listen, accept)
 * device_id = IP string -> DEVICE mode (connect to GW)
 */
bool port_comm_device_init(port_comm_device_t *ctx, const char *device_id);

/**
 * Send data to connected peer.
 */
bool port_comm_device_send(port_comm_device_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size);

/**
 * Receive data from connected peer.
 */
bool port_comm_device_receive(port_comm_device_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size);

/**
 * Check if data is available to read.
 */
bool port_comm_device_is_ready(port_comm_device_t *ctx);

/**
 * Close connection.
 */
void port_comm_device_close(port_comm_device_t *ctx);

/**
 * Relay a TrustBridge run_auth trigger to a connected device: writes
 * "RUN_AUTH <mode>" down the channel whose id matches `id`. Registered with
 * gw_presence as the trigger forwarder (matches gw_presence_trigger_fn). No-op
 * if no channel with that id has a live connection. Thread-safe against
 * port_comm_device_send() (both take the channel send lock).
 */
void port_comm_device_forward_run_auth(const char *id, int mode);

#endif /* PORT_COMM_DEVICE_H */