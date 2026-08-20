/* =============================================================================
 * sgr_mw.h
 *
 * Middleware - unified header for all authentication flows
 *
 * GATEWAY_MODE:
 *   - sgr_mw_init
 *   - sgr_mw_authentication_token_to_server
 *   - sgr_mw_authentication_server_to_token
 *   - sgr_mw_gw_authenticate_device
 *
 * DEVICE_MODE:
 *   - sgr_mw_init
 *   - sgr_mw_authenticate_via_gw
 * ============================================================================= */

#ifndef SGR_MW_H
#define SGR_MW_H

#include <stdint.h>
#include <stdbool.h>
#include "sdk_sgr_config.h"

#if SDK_MODE == GATEWAY_MODE
    #include "device_service.h"
#endif

/* ===================== STATUS ===================== */
typedef enum {
    SGR_MW_OK            =  0,
    SGR_MW_BUSY          =  1,
    SGR_MW_ERROR         = -1,
    SGR_MW_AUTH_FAILED   = -2,
    SGR_MW_COMM_ERROR    = -3,
    SGR_MW_TOKEN_ERROR   = -4,
    SGR_MW_SERVER_ERROR  = -5,
    SGR_MW_INVALID_PARAM = -6,
    SGR_MW_NOT_REGISTERED = -7,
    SGR_MW_CLAIM_TOKEN    = -9   /* CR returned CLAIM_TOKEN; ID forwarded via DEVICE_SendAuthClaimToken */
} sgr_mw_status_t;

/* ===================== COMMON ===================== */

/**
 * Initialize middleware - reads TID from crypto chip.
 * Must be called once before any other function.
 */
sgr_mw_status_t sgr_mw_init(void);

/* ===================== GATEWAY MODE ===================== */
#if SDK_MODE == GATEWAY_MODE

/**
 * Phase 1 - GW authenticates itself to Server (Token->Server).
 */
sgr_mw_status_t sgr_mw_authentication_token_to_server(void);

/**
 * Phase 2 - GW authenticates itself to Server (Server->Token).
 */
sgr_mw_status_t sgr_mw_authentication_server_to_token(void);

/**
 * GW handles incoming device authentication request.
 * Orchestrates full DEVICE<->GW<->SERVER flow.
 */
sgr_mw_status_t sgr_mw_gw_authenticate_device(int device_idx);

/**
 * GW bridge: receives FW verification result from device (type "6"),
 * resolves device TID via CRC32, and forwards result to server.
 */
sgr_mw_status_t sgr_mw_gw_receive_fw_verification(int device_idx);

/**
 * GW bridge: receives installation request from device (type "7"),
 * resolves TID via CRC32, forwards to Cloud SDK, waits for result,
 * and relays result back to device.
 */
sgr_mw_status_t sgr_mw_gw_handle_installation(int device_idx);

/**
 * GW bridge: receives host-auth request from device (type "8") with HCW=RW||RW,
 * resolves TID via CRC32, forwards to Cloud SDK's requestRW action, receives
 * the cloud-computed HRW and relays it to the device so the device can verify
 * the cloud's identity (Phase 2 of mutual authentication).
 */
sgr_mw_status_t sgr_mw_gw_handle_host_auth(int device_idx);

/**
 * Unified dispatcher for one device channel.
 * Peeks at the incoming frame type and routes to the correct handler.
 * Replaces the three separate blocking API calls with a single non-blocking
 * function suitable for a main loop.
 */
sgr_mw_status_t sgr_mw_gw_run(int device_idx);

#endif /* SDK_MODE == GATEWAY_MODE */

/* ===================== DEVICE MODE ===================== */
#if SDK_MODE == DEVICE_MODE

/**
 * Device authenticates via Gateway.
 * Sends CRC32, receives CW, computes RW, returns result.
 */
sgr_mw_status_t sgr_mw_authenticate_via_gw(void);

/**
 * Verify firmware integrity using the crypto chip.
 * Computes SHA-256 of fw_data, uses hash as CW to get RW from chip,
 * compares with fw_rw, and sends result (FW_OK/FW_NOK) to Gateway.
 * Non-blocking FSM - returns SGR_MW_BUSY until done.
 */
sgr_mw_status_t sgr_mw_verify_fw(const uint8_t *fw_data,
                                   uint32_t       fw_size,
                                   const uint8_t *fw_rw);

/**
 * Installation request via Gateway.
 * Builds CW_install = RW_verify || RW_verify (from previous sgr_mw_verify_fw),
 * gets RW_install from crypto chip, sends type "7" to GW, waits for result.
 * Must be called after a successful sgr_mw_verify_fw.
 * Non-blocking FSM - returns SGR_MW_BUSY until done.
 */
sgr_mw_status_t sgr_mw_installation(void);

#endif /* SDK_MODE == DEVICE_MODE */

#endif /* SGR_MW_H */