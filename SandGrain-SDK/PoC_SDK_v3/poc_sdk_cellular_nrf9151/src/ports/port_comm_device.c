/* =============================================================================
 * port_comm_device.c - INERT device-channel stub (cellular gateway+device build)
 *
 * On this board the "device" is the locally-attached SGT1001 - there are no
 * remote devices connecting in (and over cellular CGNAT there could be none:
 * inbound connections never reach the board). sgr_mw_init still initializes
 * MAX_DEVICES channels through this port, so provide no-op implementations:
 * channels come up "ready", never produce data, never accept sends.
 * ============================================================================= */
#include "port_comm_device.h"

#include <string.h>

bool port_comm_device_init(port_comm_device_t *ctx, const char *device_id)
{
	(void)device_id;
	if (ctx != NULL) {
		memset(ctx, 0, sizeof(*ctx));
		ctx->listen_fd = SOCK_INVALID_VAL;
		ctx->conn_fd   = SOCK_INVALID_VAL;
	}
	return true;
}

bool port_comm_device_send(port_comm_device_t *ctx, const uint8_t *buffer_tx,
			   uint16_t buffer_tx_size)
{
	(void)ctx; (void)buffer_tx; (void)buffer_tx_size;
	return false;   /* no remote devices on this build */
}

bool port_comm_device_receive(port_comm_device_t *ctx, uint8_t *buffer_rx,
			      uint16_t buffer_rx_size,
			      uint16_t *buffer_rx_received_size)
{
	(void)ctx; (void)buffer_rx; (void)buffer_rx_size;
	if (buffer_rx_received_size != NULL) {
		*buffer_rx_received_size = 0;   /* forever NO_DATA */
	}
	return true;
}

bool port_comm_device_is_ready(port_comm_device_t *ctx)
{
	(void)ctx;
	return false;
}

void port_comm_device_close(port_comm_device_t *ctx)
{
	(void)ctx;
}
