/* =============================================================================
 * server.h
 *
 * SERVER Service - public interface
 *
 * GATEWAY_MODE: full SERVER communication (types 0,1,2,3)
 * DEVICE_MODE:  GW communication (types 4,5)
 *
 * Usage pattern per operation:
 *   1. SERVER_Open(ctx, tid)      - open connection
 *   2. SERVER_XxxSend(ctx, ...)   - build frame and transmit
 *   3. SERVER_XxxReceive(ctx, .)  - poll for response (SERVER_NO_DATA if not yet)
 *   4. SERVER_Close(ctx)          - close connection
 * ============================================================================= */

#ifndef SERVER_H
#define SERVER_H

#include <stdint.h>
#include <stdbool.h>
#include "../../../include/sdk_sgr_config.h"
#include "../../../include/sdk_sgr_types.h"

/* -----------------------------------------------------------------------------
 * server_ctx_t
 *
 * All state for a single server connection.
 * Each GW channel has its own context - no shared state.
 * ----------------------------------------------------------------------------- */
#define SERVER_RX_BUF_SIZE 512
#define SERVER_CLAIM_TOKEN_ID_LEN 64

typedef struct {
    uint8_t         rx_buf[SERVER_RX_BUF_SIZE];
    uint16_t        rx_len;
    /* Populated when SERVER_ReceiveAuthResult returns SERVER_CLAIM_TOKEN
     * (device side: parsed from GW's type-4 frame).                      */
    char            claim_token_id[SERVER_CLAIM_TOKEN_ID_LEN];
    /* Host-auth response word (HRW2) from the mutual-auth verdict frame. The
     * device compares this against its own local host-auth (opcode 0x05000800)
     * - Phase 2 folds into the verdict, no separate requestRW round-trip.  */
    uint8_t         hrw2[16];
    bool            have_hrw2;
} server_ctx_t;

/* -----------------------------------------------------------------------------
 * Return codes
 * ----------------------------------------------------------------------------- */
typedef enum {
    SERVER_OK           =  0,
    SERVER_NO_DATA      =  1,
    SERVER_CLAIM_TOKEN  =  2,   /* CR returned CLAIM_TOKEN - claim_token_id in ctx */
    SERVER_COMM_ERROR   = -1,
    SERVER_PARSE_ERROR  = -2,
    SERVER_CRC_ERROR    = -3,
    SERVER_AUTH_FAILED  = -4,
    SERVER_SERVER_ERROR = -5,
    SERVER_ERROR        = -6
} server_status_t;

/* -----------------------------------------------------------------------------
 * Transport registration - common to all modes
 *
 * Registers the user-supplied transport used for all gateway/server frame I/O.
 * Called by SGR_SDK_SetCommInterface(). Must be set before SERVER_Open().
 * ----------------------------------------------------------------------------- */
void SERVER_SetCommInterface(const sgr_sdk_comm_interface_t *iface);

/* -----------------------------------------------------------------------------
 * Connection management - common to all modes
 * ----------------------------------------------------------------------------- */
server_status_t SERVER_Open (server_ctx_t *ctx, const uint8_t *tid);
server_status_t SERVER_Close(server_ctx_t *ctx);

/* -----------------------------------------------------------------------------
 * GATEWAY MODE - types 0, 1, 2, 3
 * ----------------------------------------------------------------------------- */
#if SDK_MODE == GATEWAY_MODE

server_status_t SERVER_GetCW_Send   (server_ctx_t *ctx, const uint8_t *tid);
server_status_t SERVER_GetCW_Receive(server_ctx_t *ctx, const uint8_t *tid, uint8_t *cw_out, char *transaction_id_out);

server_status_t SERVER_ReplyRW_Send   (server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw, const uint8_t *rw, const char *transaction_id);
server_status_t SERVER_ReplyRW_Receive(server_ctx_t *ctx, const uint8_t *tid);

server_status_t SERVER_GetRW_Send   (server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw, const char *transaction_id);
server_status_t SERVER_GetRW_Receive(server_ctx_t *ctx, const uint8_t *tid, uint8_t *rw_out);

server_status_t SERVER_Auth_Result_Send(server_ctx_t *ctx, const uint8_t *tid, const char *transaction_id, bool auth_ok);

/* GW bridge: forward device FW verification result to server - type "6" */
server_status_t SERVER_SendFWVerificationBridge(server_ctx_t *ctx, const uint8_t *tid, bool fw_ok, const uint8_t *rw);

/* GW bridge: receive cloud ACK for FW verification - type "6_ack" */
server_status_t SERVER_ReceiveFWVerificationACK(server_ctx_t *ctx, bool *ack_ok_out);

/* GW bridge: forward device installation request to Cloud SDK - type "7" */
server_status_t SERVER_SendInstallationBridge          (server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw_install, const uint8_t *rw_install);

/* GW bridge: receive installation result from Cloud SDK - type "7" response */
server_status_t SERVER_ReceiveInstallationBridgeResult (server_ctx_t *ctx, bool *install_ok_out);

#endif /* SDK_MODE == GATEWAY_MODE */

/* -----------------------------------------------------------------------------
 * DEVICE MODE - types 4, 5
 * ----------------------------------------------------------------------------- */
#if SDK_MODE == DEVICE_MODE

server_status_t SERVER_SendAuthRequest  (server_ctx_t *ctx, const uint8_t *tid);
server_status_t SERVER_ReceiveCW        (server_ctx_t *ctx, uint8_t *cw_out);
server_status_t SERVER_SendRW           (server_ctx_t *ctx, const uint8_t *cw, const uint8_t *rw);
server_status_t SERVER_ReceiveAuthResult(server_ctx_t *ctx, bool *auth_ok_out);

/* FW verification result - frame type "6"
 * Includes device CRC32 so GW can resolve device identity, and the RW computed by the crypto chip */
server_status_t SERVER_SendFWVerificationResult(server_ctx_t *ctx, const uint8_t *tid, bool fw_ok, const uint8_t *rw);

/* Installation request - frame type "7"
 * Sends CW_install (RW_verify||RW_verify) + RW_install to GW */
server_status_t SERVER_SendInstallationRequest  (server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw_install, const uint8_t *rw_install);

/* Installation result - frame type "7" response from GW */
server_status_t SERVER_ReceiveInstallationResult(server_ctx_t *ctx, bool *install_ok_out);

/* Host-auth request - frame type "8"
 * Phase 2 of mutual authentication: device sends HCW (=RW||RW) and asks GW
 * to relay to cloud's requestRW action so device can verify the cloud. */
server_status_t SERVER_SendHostAuthRequest(server_ctx_t *ctx, const uint8_t *tid, const uint8_t *hcw);

/* Host-auth response - frame type "8" response from GW
 * Returns the HRW computed by the cloud. Device compares it against
 * its locally-computed HRW to verify the cloud's identity. */
server_status_t SERVER_ReceiveHRW(server_ctx_t *ctx, uint8_t *hrw_out);

#endif /* SDK_MODE == DEVICE_MODE */

/* FW verification ACK - type "6_ack" - used by both DEVICE_MODE and GATEWAY_MODE */
server_status_t SERVER_ReceiveFWVerificationACK(server_ctx_t *ctx, bool *ack_ok_out);

#endif /* SERVER_H */