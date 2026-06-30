/* =============================================================================
 * sgr_mw.h
 *
 * Middleware — unified header for all authentication flows
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
    SGR_MW_NOT_REGISTERED = -7
} sgr_mw_status_t;

/* ===================== COMMON ===================== */

/**
 * Initialize middleware — reads TID from crypto chip.
 * Must be called once before any other function.
 */
sgr_mw_status_t sgr_mw_init(void);

/* ===================== GATEWAY MODE ===================== */
#if SDK_MODE == GATEWAY_MODE

/**
 * Phase 1 — GW authenticates itself to Server (Token→Server).
 */
sgr_mw_status_t sgr_mw_authentication_token_to_server(void);

/**
 * Phase 2 — GW authenticates itself to Server (Server→Token).
 */
sgr_mw_status_t sgr_mw_authentication_server_to_token(void);

/**
 * GW handles incoming device authentication request.
 * Orchestrates full DEVICE↔GW↔SERVER flow.
 */
//sgr_mw_status_t sgr_mw_gw_authenticate_device(device_service_ctx_t *dev_ctx);
//sgr_mw_status_t sgr_mw_gw_authenticate_device(void);
sgr_mw_status_t sgr_mw_gw_authenticate_device(int device_idx);

#endif /* SDK_MODE == GATEWAY_MODE */

/* ===================== DEVICE MODE ===================== */
#if SDK_MODE == DEVICE_MODE

/**
 * Device authenticates via Gateway.
 * Sends CRC32, receives CW, computes RW, returns result.
 */
sgr_mw_status_t sgr_mw_authenticate_via_gw(void);

#endif /* SDK_MODE == DEVICE_MODE */

#endif /* SGR_MW_H */