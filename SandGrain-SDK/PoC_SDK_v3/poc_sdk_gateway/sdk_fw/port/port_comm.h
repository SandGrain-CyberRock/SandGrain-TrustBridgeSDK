#ifndef PORT_COMM_H
#define PORT_COMM_H

#include <stdint.h>
#include <stdbool.h>
#include <mosquitto.h>

/* =============================================================================
 * port_comm_ctx_t
 *
 * All state for a single MQTT connection.
 * Each GW channel has its own context - no shared state.
 * ============================================================================= */
typedef struct {
    struct mosquitto *mosq;

    char topic_req_cw[128];
    char topic_reply_rw[128];
    char topic_req_rw[128];
    char topic_check_auth_cloud[128];
    char topic_fw_verify[128];
    char topic_installation[128];
    char topic_rsp[128];

    uint8_t  rx_buffer[512];
    uint16_t rx_size;
    bool     rx_available;
    bool     connected;
} port_comm_ctx_t;

bool port_comm_init   (port_comm_ctx_t *ctx, const char *device_id);
bool port_comm_send   (port_comm_ctx_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size);
bool port_comm_receive(port_comm_ctx_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size);
void port_comm_close  (port_comm_ctx_t *ctx);

#endif /* PORT_COMM_H */