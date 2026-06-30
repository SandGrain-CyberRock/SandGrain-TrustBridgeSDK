/* =============================================================================
 * server.h
 *
 * SERVER Service — public interface
 *
 * GATEWAY_MODE: full SERVER communication (types 0,1,2,3)
 * DEVICE_MODE:  GW communication (types 4,5)
 *
 * Usage pattern per operation:
 *   1. SERVER_Open(ctx, tid)      — open connection
 *   2. SERVER_XxxSend(ctx, ...)   — build frame and transmit
 *   3. SERVER_XxxReceive(ctx, .)  — poll for response (SERVER_NO_DATA if not yet)
 *   4. SERVER_Close(ctx)          — close connection
 * ============================================================================= */

#ifndef SERVER_H
#define SERVER_H

#include <stdint.h>
#include <stdbool.h>
#include "../../../include/sdk_sgr_config.h"
#include "../../../port/port_comm.h"

/* -----------------------------------------------------------------------------
 * server_ctx_t
 *
 * All state for a single server connection.
 * Each GW channel has its own context — no shared state.
 * ----------------------------------------------------------------------------- */
#define SERVER_RX_BUF_SIZE 512

typedef struct {
    port_comm_ctx_t comm;
    uint8_t         rx_buf[SERVER_RX_BUF_SIZE];
    uint16_t        rx_len;
} server_ctx_t;

/* -----------------------------------------------------------------------------
 * Return codes
 * ----------------------------------------------------------------------------- */
typedef enum {
    SERVER_OK           =  0,
    SERVER_NO_DATA      =  1,
    SERVER_COMM_ERROR   = -1,
    SERVER_PARSE_ERROR  = -2,
    SERVER_CRC_ERROR    = -3,
    SERVER_AUTH_FAILED  = -4,
    SERVER_SERVER_ERROR = -5,
    SERVER_ERROR        = -6
} server_status_t;

/* -----------------------------------------------------------------------------
 * Connection management — common to all modes
 * ----------------------------------------------------------------------------- */
server_status_t SERVER_Open (server_ctx_t *ctx, const uint8_t *tid);
server_status_t SERVER_Close(server_ctx_t *ctx);

/* -----------------------------------------------------------------------------
 * GATEWAY MODE — types 0, 1, 2, 3
 * ----------------------------------------------------------------------------- */
#if SDK_MODE == GATEWAY_MODE

server_status_t SERVER_GetCW_Send   (server_ctx_t *ctx, const uint8_t *tid);
server_status_t SERVER_GetCW_Receive(server_ctx_t *ctx, const uint8_t *tid, uint8_t *cw_out, char *transaction_id_out);

server_status_t SERVER_ReplyRW_Send   (server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw, const uint8_t *rw, const char *transaction_id);
server_status_t SERVER_ReplyRW_Receive(server_ctx_t *ctx, const uint8_t *tid);

server_status_t SERVER_GetRW_Send   (server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw, const char *transaction_id);
server_status_t SERVER_GetRW_Receive(server_ctx_t *ctx, const uint8_t *tid, uint8_t *rw_out);

server_status_t SERVER_Auth_Result_Send(server_ctx_t *ctx, const uint8_t *tid, const char *transaction_id, bool auth_ok);

#endif /* SDK_MODE == GATEWAY_MODE */

/* -----------------------------------------------------------------------------
 * DEVICE MODE — types 4, 5
 * ----------------------------------------------------------------------------- */
#if SDK_MODE == DEVICE_MODE

server_status_t SERVER_SendAuthRequest  (server_ctx_t *ctx, const uint8_t *tid);
server_status_t SERVER_ReceiveCW        (server_ctx_t *ctx, uint8_t *cw_out);
server_status_t SERVER_SendRW           (server_ctx_t *ctx, const uint8_t *cw, const uint8_t *rw);
server_status_t SERVER_ReceiveAuthResult(server_ctx_t *ctx, bool *auth_ok_out);

#endif /* SDK_MODE == DEVICE_MODE */

#endif /* SERVER_H */