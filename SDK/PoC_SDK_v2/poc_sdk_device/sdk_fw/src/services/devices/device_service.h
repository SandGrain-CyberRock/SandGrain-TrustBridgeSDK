/* =============================================================================
 * device_service.h
 *
 * DEVICE↔GW communication service — public interface
 *
 * Protocol:
 *   type "4" — auth request (DEVICE→GW) / auth result (GW→DEVICE)
 *   type "5" — CW (GW→DEVICE) / CW echo + RW (DEVICE→GW)
 * ============================================================================= */

#ifndef DEVICE_SERVICE_H
#define DEVICE_SERVICE_H

#include <stdint.h>
#include <stdbool.h>
#include "../../../port/port_comm_device.h"

/* ===================== CONTEXT ===================== */
typedef struct {
    port_comm_device_t *comm;
    uint32_t            crc32;
    uint8_t             cw[32];
    uint8_t             rw[16];
    uint8_t             cw_echo[32];
} device_service_ctx_t;

/* ===================== STATUS ===================== */
typedef enum {
    DEVICE_OK           =  0,
    DEVICE_NO_DATA      =  1,
    DEVICE_COMM_ERROR   = -1,
    DEVICE_PARSE_ERROR  = -2,
    DEVICE_ERROR        = -3
} device_status_t;

/* ===================== API ===================== */

/**
 * Initialize device communication port — bind + listen (GW mode).
 * Must be called once before any other DEVICE_* function.
 */
device_status_t DEVICE_Init(device_service_ctx_t *ctx, const char *device_id);

/**
 * Receive type "4" from device — extracts CRC32.
 */
device_status_t DEVICE_ReceiveAuthRequest(device_service_ctx_t *ctx, uint32_t *crc32_out);

/**
 * Send type "5" to device — sends CW.
 */
device_status_t DEVICE_SendCW(device_service_ctx_t *ctx, const uint8_t *cw);

/**
 * Receive type "5" from device — extracts CW echo + RW.
 */
device_status_t DEVICE_ReceiveRW(device_service_ctx_t *ctx, uint8_t *cw_out, uint8_t *rw_out);

/**
 * Send type "4" to device — sends auth result.
 */
device_status_t DEVICE_SendAuthResult(device_service_ctx_t *ctx, bool auth_ok);

#endif /* DEVICE_SERVICE_H */