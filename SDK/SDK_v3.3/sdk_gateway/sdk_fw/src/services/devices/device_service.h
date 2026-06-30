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

/* ===================== FRAME TYPES ===================== */
typedef enum {
    GW_FRAME_AUTH         = 4,
    GW_FRAME_FW_VERIFY    = 6,
    GW_FRAME_INSTALL      = 7,
    GW_FRAME_HOST_AUTH    = 8,
    GW_FRAME_UNKNOWN      = -1
} gw_frame_type_t;

/* ===================== CONTEXT ===================== */
#define DEVICE_PENDING_BUF_SIZE 512

typedef struct {
    port_comm_device_t *comm;
    uint32_t            crc32;
    uint8_t             cw[32];
    uint8_t             rw[16];
    uint8_t             cw_echo[32];
    uint8_t             pending_buf[DEVICE_PENDING_BUF_SIZE];
    uint16_t            pending_len;
    bool                has_pending;
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
 * Read one frame from device and return its type without processing it.
 * The frame is stored internally — the next DEVICE_Receive* call will use it.
 * Returns GW_FRAME_UNKNOWN if no data or unrecognised type.
 */
gw_frame_type_t DEVICE_PeekFrameType(device_service_ctx_t *ctx);

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

/**
 * Receive type "6" from device — extracts CRC32, FW verification result and computed RW.
 * crc32_out  : device identifier (used by GW to resolve TID via auth_db).
 * fw_ok_out  : true = FW_OK, false = FW_NOK.
 * rw_out     : RW computed by the device crypto chip (16 bytes).
 */
device_status_t DEVICE_ReceiveFWVerificationResult(device_service_ctx_t *ctx,
                                                    uint32_t             *crc32_out,
                                                    bool                 *fw_ok_out,
                                                    uint8_t              *rw_out);

/**
 * Send type "6_ack" to device — ACK from cloud confirming FW verification was processed.
 * ack_ok : true = ACK_OK, false = ACK_NOK.
 */
device_status_t DEVICE_SendFWVerificationACK(device_service_ctx_t *ctx, bool ack_ok);

/**
 * Receive type "7" from device — extracts CRC32, CW_install (32 bytes), RW_install (16 bytes).
 */
device_status_t DEVICE_ReceiveInstallationRequest(device_service_ctx_t *ctx,
                                                   uint32_t             *crc32_out,
                                                   uint8_t              *cw_out,
                                                   uint8_t              *rw_out);

/**
 * Send type "7" to device — installation result (INSTALL_OK / INSTALL_NOK).
 */
device_status_t DEVICE_SendInstallationResult(device_service_ctx_t *ctx, bool install_ok);

/**
 * Receive type "8" from device — extracts CRC32 + HCW (32 bytes).
 * Phase 2 of mutual auth: device wants the cloud to compute HRW from HCW.
 */
device_status_t DEVICE_ReceiveHostAuthRequest(device_service_ctx_t *ctx,
                                              uint32_t             *crc32_out,
                                              uint8_t              *hcw_out);

/**
 * Send type "8" response to device with HRW (16 bytes) computed by the cloud.
 * If hrw is NULL, sends HOST_AUTH_NOK.
 */
device_status_t DEVICE_SendHRW(device_service_ctx_t *ctx, const uint8_t *hrw);

#endif /* DEVICE_SERVICE_H */