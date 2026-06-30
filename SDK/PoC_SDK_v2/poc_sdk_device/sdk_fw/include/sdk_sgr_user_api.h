/*#include <stdint.h>
#include <string.h>
#include "sdk_sgr_config.h"
#include "sdk_sgr_errors.h"
#include "sdk_sgr_types.h"

sgr_sdk_status_t SGR_SDK_Initialize(void);

sgr_sdk_status_t SGR_SDK_Authentication_Token_To_Server(void);

sgr_sdk_status_t SGR_SDK_Authentication_Server_To_Token(void);

#if SDK_MODE == GATEWAY_MODE
    sgr_sdk_status_t SGR_SDK_Redirect_Operation(void);
    sgr_sdk_status_t SGR_SDK_Gateway_Process(void);
#endif
*/


/* =============================================================================
 * sdk_sgr_user_api.h
 *
 * Public SDK API — single header for the client application.
 *
 * SDK_MODE controls which functions are available:
 *
 *   DEVICE_MODE  — Device authenticates via Gateway
 *
 *   GATEWAY_MODE — Gateway authenticates itself to Server
 *                  AND handles incoming device authentication requests
 * ============================================================================= */

#ifndef SDK_SGR_USER_API_H
#define SDK_SGR_USER_API_H

#include <stdint.h>
#include <string.h>
#include "sdk_sgr_config.h"
#include "sdk_sgr_errors.h"
#include "sdk_sgr_types.h"

/* ===================== COMMON ===================== */

/**
 * Initialize SDK.
 * Must be called once before any other function.
 * Behavior depends on SDK_MODE.
 */
sgr_sdk_status_t SGR_SDK_Initialize(void);

/* ===================== DEVICE MODE ===================== */
#if SDK_MODE == DEVICE_MODE

/**
 * Device requests mutual authentication via Gateway.
 * Sends CRC32 to GW, receives CW, computes RW, returns result.
 * Blocking — waits until authentication completes.
 */
sgr_sdk_status_t SGR_SDK_Authenticate_Via_GW(void);

#endif /* SDK_MODE == DEVICE_MODE */

/* ===================== GATEWAY MODE ===================== */
#if SDK_MODE == GATEWAY_MODE

/**
 * Phase 1 — GW authenticates itself to Server (Token→Server).
 * Blocking — waits until authentication completes.
 */
sgr_sdk_status_t SGR_SDK_Authentication_Token_To_Server(void);

/**
 * Phase 2 — GW authenticates itself to Server (Server→Token).
 * Blocking — waits until authentication completes.
 */
sgr_sdk_status_t SGR_SDK_Authentication_Server_To_Token(void);

/**
 * GW waits for and handles a device authentication request.
 * Orchestrates full DEVICE↔GW↔SERVER flow.
 * Blocking — waits until authentication completes.
 */
sgr_sdk_status_t SGR_SDK_GW_Handle_Device_Auth(void);

#endif /* SDK_MODE == GATEWAY_MODE */

#endif /* SDK_SGR_USER_API_H */