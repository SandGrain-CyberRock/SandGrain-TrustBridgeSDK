/* =============================================================================
 * comm_adapter.h
 *
 * Application-side adapter that exposes the existing socket/MQTT port layer
 * (port_comm.c) as an SGR SDK transport interface.
 *
 * Usage:
 *     sgr_sdk_comm_interface_t comm;
 *     comm_adapter_get_interface(&comm);
 *     SGR_SDK_SetCommInterface(&comm);
 *
 * To use a different transport (UART, SPI, BLE, ...), provide your own
 * implementation of sgr_sdk_comm_interface_t instead of this adapter — the
 * SDK does not need to change.
 * ============================================================================= */

#ifndef COMM_ADAPTER_H
#define COMM_ADAPTER_H

#include "sdk_sgr_types.h"

/* Populate iface with callbacks backed by the port_comm.c transport. */
void comm_adapter_get_interface(sgr_sdk_comm_interface_t *iface);

#endif /* COMM_ADAPTER_H */
