/* =============================================================================
 * comm_adapter.c
 *
 * Adapts port_comm.c (the socket/MQTT transport) to the SDK's
 * sgr_sdk_comm_interface_t callback contract.
 *
 * The underlying port_comm_* functions keep their connection state in file-scope
 * globals and ignore the port_comm_ctx_t* argument, so NULL is passed for it and
 * the interface ctx is unused. A transport with per-connection state would store
 * its handle in iface->ctx and use it here instead.
 * ============================================================================= */

#include "comm_adapter.h"
#include "port_comm.h"

#include <stddef.h>  /* NULL */

static int adapter_open(const char *device_id, void *ctx)
{
    (void)ctx;
    return port_comm_init(NULL, device_id) ? 0 : -1;
}

static int adapter_send(const uint8_t *data, uint16_t len, void *ctx)
{
    (void)ctx;
    return port_comm_send(NULL, data, len) ? 0 : -1;
}

static int adapter_receive(uint8_t *buf, uint16_t buf_size, uint16_t *out_len, void *ctx)
{
    (void)ctx;
    /* port_comm_receive() returns false on error/closed connection. The blocking
     * socket transport never reports "no data" separately, so map false -> -1. */
    return port_comm_receive(NULL, buf, buf_size, out_len) ? 0 : -1;
}

static void adapter_close(void *ctx)
{
    (void)ctx;
    port_comm_close(NULL);
}

void comm_adapter_get_interface(sgr_sdk_comm_interface_t *iface)
{
    if (iface == NULL)
        return;

    iface->open    = adapter_open;
    iface->send    = adapter_send;
    iface->receive = adapter_receive;
    iface->close   = adapter_close;
    iface->ctx     = NULL;
}
