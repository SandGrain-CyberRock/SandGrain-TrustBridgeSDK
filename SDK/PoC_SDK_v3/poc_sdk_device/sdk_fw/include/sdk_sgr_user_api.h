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
 * Blocking — convenience wrapper around _NonBlocking() + _Poll().
 */
sgr_sdk_status_t SGR_SDK_Authenticate_Via_GW(void);

/* ----- Non-blocking (cooperative) authentication API ----- */

/**
 * Public step identifiers for the authenticate-via-GW state machine.
 * Useful for diagnostics / status display in the caller's main loop.
 */
typedef enum {
    SGR_SDK_AUTH_STEP_IDLE = 0,        /* No flow active                       */
    SGR_SDK_AUTH_STEP_OPEN,            /* Opening server connection            */
    SGR_SDK_AUTH_STEP_SEND_REQUEST,    /* Sending auth request to GW           */
    SGR_SDK_AUTH_STEP_RECEIVE_CW,      /* Waiting for CW from GW               */
    SGR_SDK_AUTH_STEP_COMPUTE_RW,      /* Computing RW on crypto chip          */
    SGR_SDK_AUTH_STEP_SEND_RW,         /* Sending CW echo + RW to GW           */
    SGR_SDK_AUTH_STEP_RECEIVE_RESULT,  /* Waiting for final result from GW     */
    SGR_SDK_AUTH_STEP_CLOSE            /* Closing connection / handling retry  */
} sgr_sdk_auth_step_t;

/**
 * Start a non-blocking authentication flow.
 * Resets internal state and begins the authentication sequence.
 * Must be called once before polling with _Poll().
 *
 * @return SGR_SDK_OK    if the flow was successfully started.
 * @return SGR_SDK_ERROR if SDK is not initialized or a flow is already active.
 */
sgr_sdk_status_t SGR_SDK_Authenticate_Via_GW_NonBlocking(void);

/**
 * Advance the authentication state machine by one step.
 * Must be called repeatedly after _NonBlocking() until it returns
 * something other than SGR_SDK_BUSY.
 *
 * @return SGR_SDK_BUSY        — still in progress, call again.
 * @return SGR_SDK_OK          — authentication succeeded.
 * @return SGR_SDK_AUTH_FAILED — gateway rejected the device.
 * @return SGR_SDK_COMM_ERROR  — communication failure.
 * @return SGR_SDK_TOKEN_ERROR — crypto chip failure.
 * @return SGR_SDK_ERROR       — _NonBlocking() was not called first.
 */
sgr_sdk_status_t SGR_SDK_Authenticate_Via_GW_Poll(void);

/**
 * Query current step for diagnostics.
 * Returns SGR_SDK_AUTH_STEP_IDLE when no flow is active.
 */
sgr_sdk_auth_step_t SGR_SDK_Authenticate_Via_GW_GetStep(void);

/**
 * Abort an in-progress authentication flow.
 * Closes the server connection and resets internal state.
 *
 * @return SGR_SDK_OK    if state was reset (always, even if no flow was active).
 */
sgr_sdk_status_t SGR_SDK_Authenticate_Via_GW_Abort(void);

/**
 * Verify firmware integrity using the crypto chip.
 *
 * The firmware image stored in alternate memory is expected to carry
 * its own 16-byte Response Word (RW) computed over its SHA-256 hash.
 * This function:
 *   1. Computes SHA-256(fw_data, fw_size)  → 32-byte hash (used as CW)
 *   2. Sends the hash as Challenge Word to the crypto chip → 16-byte RW
 *   3. Compares the chip RW against the fw_rw embedded in the image
 *   4. Sends the result (FW_OK / FW_NOK) to the Gateway (frame type "6")
 *
 * @param fw_data  Pointer to the firmware content in memory.
 * @param fw_size  Size of the firmware content in bytes (excluding fw_rw).
 * @param fw_rw    16-byte Response Word (N_BYTES_RW) embedded in the image.
 *
 * @return SGR_SDK_OK          if RW matches and result was sent to GW.
 * @return SGR_SDK_AUTH_FAILED if RW does not match (result still sent to GW).
 * @return SGR_SDK_COMM_ERROR  if the GW connection failed.
 * @return SGR_SDK_TOKEN_ERROR if the crypto chip failed.
 * @return SGR_SDK_INVALID_PARAM if any pointer is NULL or fw_size is 0.
 * @return SGR_SDK_ERROR       on any other failure.
 */
sgr_sdk_status_t SGR_SDK_Verification_FW(const uint8_t *fw_data,
                                          uint32_t       fw_size,
                                          const uint8_t *fw_rw);

/**
 * Request installation authorization via Gateway.
 * Must be called after a successful SGR_SDK_Verification_FW.
 * Internally uses the RW from FW verification to build CW_install.
 * Blocking — waits until GW responds with OK or NOK.
 *
 * @return SGR_SDK_OK          if installation authorized.
 * @return SGR_SDK_AUTH_FAILED if installation denied.
 * @return SGR_SDK_COMM_ERROR  if communication with GW failed.
 * @return SGR_SDK_TOKEN_ERROR if crypto chip failed.
 * @return SGR_SDK_ERROR       on any other failure.
 */
sgr_sdk_status_t SGR_SDK_Installation(void);

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

/**
 * GW bridge: waits for a device FW verification result (type "6"),
 * resolves the device TID via CRC32, and forwards the result to the server.
 * Blocking — waits until message is received and forwarded.
 *
 * @return SGR_SDK_OK          if device reported FW_OK and was bridged.
 * @return SGR_SDK_AUTH_FAILED if device reported FW_NOK (still bridged).
 * @return SGR_SDK_COMM_ERROR  on communication failure.
 * @return SGR_SDK_ERROR       on any other failure.
 */
sgr_sdk_status_t SGR_SDK_GW_Handle_FW_Verification(void);

/**
 * GW bridge: waits for a device installation request (type "7"),
 * resolves TID via CRC32, forwards to Cloud SDK, receives result,
 * and relays it back to the device.
 * Blocking — waits until the full round-trip completes.
 *
 * @return SGR_SDK_OK          if installation authorized.
 * @return SGR_SDK_AUTH_FAILED if installation denied.
 * @return SGR_SDK_COMM_ERROR  on communication failure.
 * @return SGR_SDK_ERROR       on any other failure.
 */
sgr_sdk_status_t SGR_SDK_GW_Handle_Installation(void);

/**
 * Unified GW dispatcher — replaces the three separate Handle_* calls.
 *
 * Polls all device channels once per call, peeks at each incoming frame type,
 * and routes to the correct flow (auth / FW verification / installation).
 * Designed for use in a main loop — call repeatedly until it returns
 * something other than SGR_SDK_BUSY.
 *
 * @return SGR_SDK_OK          if any channel completed a flow successfully.
 * @return SGR_SDK_BUSY        if no channel has data yet.
 * @return SGR_SDK_AUTH_FAILED if a flow was rejected.
 * @return SGR_SDK_COMM_ERROR  on communication failure.
 * @return SGR_SDK_ERROR       on any other failure.
 */
sgr_sdk_status_t SGR_SDK_GW_Run(void);

#endif /* SDK_MODE == GATEWAY_MODE */

#endif /* SDK_SGR_USER_API_H */