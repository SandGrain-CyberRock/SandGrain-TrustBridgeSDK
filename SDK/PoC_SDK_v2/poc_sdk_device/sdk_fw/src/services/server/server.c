/* =============================================================================
 * server.c
 *
 * SERVER Service — implementation
 *
 * GATEWAY_MODE: full SERVER communication (types 0,1,2,3)
 * DEVICE_MODE:  GW communication (types 4,5)
 *
 * All state lives in server_ctx_t — no static variables.
 * ============================================================================= */

#include "../../../port/port_comm.h"
#include "../../../port/port_comm_device.h"
#include "server.h"
#include <stddef.h>
#include <string.h>
#include <stdio.h>

#include "../protocol/protocol.h"
#include "../../utils/crc/crc.h"
#include "../../utils/encoding/encoding_hex.h"
#include "../../../include/sdk_sgr_config.h"

#define SERVER_TX_BUF_SIZE 512

/* -----------------------------------------------------------------------------
 * prv_compute_crc_hex
 * ----------------------------------------------------------------------------- */
static void prv_compute_crc_hex(const char *str, char *out_crc)
{
    uint16_t crc      = crcFast((unsigned char *)str, strlen(str));
    uint8_t  crc_bytes[2];
    crc_bytes[0] = (uint8_t)((crc >> 8) & 0xFF);
    crc_bytes[1] = (uint8_t)( crc       & 0xFF);
    bytes_to_hex(crc_bytes, 2, out_crc, 5);
}

/* -----------------------------------------------------------------------------
 * prv_apply_crc
 * ----------------------------------------------------------------------------- */
static void prv_apply_crc(sgr_proto2_ctx_t *ctx, bool has_cw, bool has_rw)
{
    crcInit();
    prv_compute_crc_hex(ctx->tid_hex,        ctx->tid_crc);
    prv_compute_crc_hex(ctx->transaction_id, ctx->transaction_id_crc);
    if (has_cw) prv_compute_crc_hex(ctx->cw_hex, ctx->cw_crc);
    if (has_rw) prv_compute_crc_hex(ctx->rw_hex, ctx->rw_crc);
}

/* =============================================================================
 * SERVER_Open
 * ============================================================================= */
server_status_t SERVER_Open(server_ctx_t *ctx, const uint8_t *tid)
{
    server_status_t status = SERVER_ERROR;
    char            tid_hex[65];

    if (!ctx || !tid)
        return SERVER_ERROR;

    ctx->rx_len = 0;
    memset(ctx->rx_buf, 0, sizeof(ctx->rx_buf));

    if (bytes_to_hex(tid, 32, tid_hex, sizeof(tid_hex)) != 0)
    {
        status = SERVER_ERROR;
    }
    else if (!port_comm_init(&ctx->comm, tid_hex))
    {
        status = SERVER_COMM_ERROR;
    }
    else
    {
        status = SERVER_OK;
    }

    return status;
}

/* =============================================================================
 * SERVER_Close
 * ============================================================================= */
server_status_t SERVER_Close(server_ctx_t *ctx)
{
    if (!ctx)
        return SERVER_ERROR;

    port_comm_close(&ctx->comm);
    ctx->rx_len = 0;
    memset(ctx->rx_buf, 0, sizeof(ctx->rx_buf));
    return SERVER_OK;
}

/* =============================================================================
 * GATEWAY MODE — types 0, 1, 2, 3
 * ============================================================================= */
#if SDK_MODE == GATEWAY_MODE

server_status_t SERVER_GetCW_Send(server_ctx_t *ctx, const uint8_t *tid)
{
    server_status_t  status    = SERVER_ERROR;
    sgr_proto2_ctx_t proto;
    uint8_t          tx_buf[SERVER_TX_BUF_SIZE];
    int              frame_len = 0;

    memset(&proto, 0, sizeof(proto));

    if (bytes_to_hex(tid, 32, proto.tid_hex, sizeof(proto.tid_hex)) != 0)
    {
        status = SERVER_ERROR;
    }
    else
    {
        prv_apply_crc(&proto, false, false);
        frame_len = Frame_Get_CW_From_Server((char *)tx_buf, sizeof(tx_buf), &proto);

        if (frame_len <= 0)
            status = SERVER_ERROR;
        else if (!port_comm_send(&ctx->comm, tx_buf, (uint16_t)frame_len))
            status = SERVER_COMM_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_GetCW_Receive(server_ctx_t *ctx, const uint8_t *tid, uint8_t *cw_out, char *transaction_id_out)
{
    server_status_t status = SERVER_ERROR;
    rx_response_t   rx;
    char            cw_hex[65];

    if (!port_comm_receive(&ctx->comm, ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        status = SERVER_COMM_ERROR;
    else if (ctx->rx_len == 0)
        status = SERVER_NO_DATA;
    else
    {
        ctx->rx_buf[ctx->rx_len] = '\0';

        if (RX_Get_Response((char *)ctx->rx_buf, '0', &rx) != 0)
            status = SERVER_PARSE_ERROR;
        else if (rx.status_code != 0)
            status = SERVER_SERVER_ERROR;
        else if (RX_Extract_And_Check_Field(&rx, "CW", cw_hex, sizeof(cw_hex)) != 0)
            status = SERVER_CRC_ERROR;
        else if (hex_to_bytes(cw_hex, cw_out, 32) != 0)
            status = SERVER_PARSE_ERROR;
        else if (RX_Extract_And_Check_Field(&rx, "transactionId", transaction_id_out, 38) != 0)
            status = SERVER_CRC_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_ReplyRW_Send(server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw, const uint8_t *rw, const char *transaction_id)
{
    server_status_t  status    = SERVER_ERROR;
    sgr_proto2_ctx_t proto;
    uint8_t          tx_buf[SERVER_TX_BUF_SIZE];
    int              frame_len = 0;

    memset(&proto, 0, sizeof(proto));
    strncpy(proto.transaction_id, transaction_id, sizeof(proto.transaction_id) - 1);

    if (bytes_to_hex(tid, 32, proto.tid_hex, sizeof(proto.tid_hex)) != 0)
        status = SERVER_ERROR;
    else if (bytes_to_hex(cw, 32, proto.cw_hex, sizeof(proto.cw_hex)) != 0)
        status = SERVER_ERROR;
    else if (bytes_to_hex(rw, 16, proto.rw_hex, sizeof(proto.rw_hex)) != 0)
        status = SERVER_ERROR;
    else
    {
        prv_apply_crc(&proto, true, true);
        frame_len = Frame_Reply_RW_To_Server((char *)tx_buf, sizeof(tx_buf), &proto);

        if (frame_len <= 0)
            status = SERVER_ERROR;
        else if (!port_comm_send(&ctx->comm, tx_buf, (uint16_t)frame_len))
            status = SERVER_COMM_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_ReplyRW_Receive(server_ctx_t *ctx, const uint8_t *tid)
{
    server_status_t status = SERVER_ERROR;
    rx_response_t   rx;

    if (!port_comm_receive(&ctx->comm, ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        status = SERVER_COMM_ERROR;
    else if (ctx->rx_len == 0)
        status = SERVER_NO_DATA;
    else
    {
        ctx->rx_buf[ctx->rx_len] = '\0';

        if (RX_Get_Response((char *)ctx->rx_buf, '1', &rx) != 0)
            status = SERVER_PARSE_ERROR;
        else if (rx.status_code != 0)
            status = SERVER_SERVER_ERROR;
        else if (strstr(rx.payload, "\"auth_status\":\"AUTH_OK\"") == NULL)
            status = SERVER_AUTH_FAILED;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_GetRW_Send(server_ctx_t *ctx, const uint8_t *tid, const uint8_t *cw, const char *transaction_id)
{
    server_status_t  status    = SERVER_ERROR;
    sgr_proto2_ctx_t proto;
    uint8_t          tx_buf[SERVER_TX_BUF_SIZE];
    int              frame_len = 0;

    memset(&proto, 0, sizeof(proto));
    strncpy(proto.transaction_id, transaction_id, sizeof(proto.transaction_id) - 1);

    if (bytes_to_hex(tid, 32, proto.tid_hex, sizeof(proto.tid_hex)) != 0)
    {
        printf("[DEBUG] SERVER_GetRW_Send — bytes_to_hex tid FAILED\n");
        status = SERVER_ERROR;
    }
    else if (bytes_to_hex(cw, 32, proto.cw_hex, sizeof(proto.cw_hex)) != 0)
    {
        printf("[DEBUG] SERVER_GetRW_Send — bytes_to_hex cw FAILED\n");
        status = SERVER_ERROR;
    }
    else
    {
        prv_apply_crc(&proto, true, false);
        frame_len = Frame_Get_RW_From_Server((char *)tx_buf, sizeof(tx_buf), &proto);

        printf("[DEBUG] SERVER_GetRW_Send — frame_len=%d\n", frame_len);

        if (frame_len <= 0)
            status = SERVER_ERROR;
        else if (!port_comm_send(&ctx->comm, tx_buf, (uint16_t)frame_len))
            status = SERVER_COMM_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_GetRW_Receive(server_ctx_t *ctx, const uint8_t *tid, uint8_t *rw_out)
{
    server_status_t status = SERVER_ERROR;
    rx_response_t   rx;
    char            rw_hex[33];

    if (!port_comm_receive(&ctx->comm, ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        status = SERVER_COMM_ERROR;
    else if (ctx->rx_len == 0)
        status = SERVER_NO_DATA;
    else
    {
        ctx->rx_buf[ctx->rx_len] = '\0';

        if (RX_Get_Response((char *)ctx->rx_buf, '2', &rx) != 0)
            status = SERVER_PARSE_ERROR;
        else if (rx.status_code != 0)
            status = SERVER_SERVER_ERROR;
        else if (RX_Extract_And_Check_Field(&rx, "RW", rw_hex, sizeof(rw_hex)) != 0)
            status = SERVER_CRC_ERROR;
        else if (hex_to_bytes(rw_hex, rw_out, 16) != 0)
            status = SERVER_PARSE_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_Auth_Result_Send(server_ctx_t *ctx, const uint8_t *tid, const char *transaction_id, bool auth_ok)
{
    server_status_t  status    = SERVER_ERROR;
    sgr_proto2_ctx_t proto;
    uint8_t          tx_buf[SERVER_TX_BUF_SIZE];
    int              frame_len = 0;

    memset(&proto, 0, sizeof(proto));
    strncpy(proto.transaction_id, transaction_id, sizeof(proto.transaction_id) - 1);
    proto.auth_status2 = auth_ok ? 1 : 0;

    if (bytes_to_hex(tid, 32, proto.tid_hex, sizeof(proto.tid_hex)) != 0)
        status = SERVER_ERROR;
    else
    {
        frame_len = Frame_Reply_Status_Authentication((char *)tx_buf, sizeof(tx_buf), &proto);

        if (frame_len <= 0)
            status = SERVER_ERROR;
        else if (!port_comm_send(&ctx->comm, tx_buf, (uint16_t)frame_len))
            status = SERVER_COMM_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

#endif /* SDK_MODE == GATEWAY_MODE */

/* =============================================================================
 * DEVICE MODE — types 4, 5
 * ============================================================================= */
#if SDK_MODE == DEVICE_MODE

server_status_t SERVER_SendAuthRequest(server_ctx_t *ctx, const uint8_t *tid)
{
    server_status_t status    = SERVER_ERROR;
    uint8_t         tx_buf[SERVER_TX_BUF_SIZE];
    char            tid_hex[65];
    uint32_t        crc32     = 0;
    int             frame_len = 0;

    if (bytes_to_hex(tid, 32, tid_hex, sizeof(tid_hex)) != 0)
    {
        status = SERVER_CRC_ERROR;
    }
    else
    {
        crcInit();
        uint16_t crc16a = crcFast((unsigned char *)tid_hex, strlen(tid_hex));
        uint16_t crc16b = crcFast((unsigned char *)tid_hex + 1, strlen(tid_hex) - 1);
        crc32 = ((uint32_t)crc16a << 16) | (uint32_t)crc16b;

        frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                             "{\"type\":\"4\",\"payload\":{\"CRC32\":\"%08X\"}}",
                             crc32);

        if (frame_len <= 0){
            status = SERVER_PARSE_ERROR;
        }    
        else if (!port_comm_send(&ctx->comm, tx_buf, (uint16_t)frame_len)){
            status = SERVER_COMM_ERROR;
        }
        else{
            status = SERVER_OK;
        }
    }

    #if PORT_COMM_DEBUG
    printf("[SERVER] Auth request — CRC32: 0x%08X\n", crc32);
    #endif

    return status;
}

server_status_t SERVER_ReceiveCW(server_ctx_t *ctx, uint8_t *cw_out)
{
    server_status_t status = SERVER_ERROR;
    char            cw_hex[65];

    if (!port_comm_receive(&ctx->comm, ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        status = SERVER_COMM_ERROR;
    else if (ctx->rx_len == 0)
        status = SERVER_NO_DATA;
    else
    {
        ctx->rx_buf[ctx->rx_len] = '\0';

        if (strstr((char *)ctx->rx_buf, "\"type\":\"5\"") == NULL)
        {
            status = SERVER_PARSE_ERROR;
        }
        else
        {
            char *ptr = strstr((char *)ctx->rx_buf, "\"CW\":\"");
            if (ptr == NULL)
            {
                status = SERVER_PARSE_ERROR;
            }
            else
            {
                ptr += strlen("\"CW\":\"");
                int i = 0;
                while (ptr[i] != '"' && ptr[i] != '\0' && i < 64)
                {
                    cw_hex[i] = ptr[i];
                    i++;
                }
                cw_hex[i] = '\0';

                if (hex_to_bytes(cw_hex, cw_out, 32) != 0)
                    status = SERVER_PARSE_ERROR;
                else
                    status = SERVER_OK;
            }
        }
    }

    return status;
}

server_status_t SERVER_SendRW(server_ctx_t *ctx, const uint8_t *cw, const uint8_t *rw)
{
    server_status_t status    = SERVER_ERROR;
    uint8_t         tx_buf[SERVER_TX_BUF_SIZE];
    char            cw_hex[65];
    char            rw_hex[33];
    int             frame_len = 0;

    if (bytes_to_hex(cw, 32, cw_hex, sizeof(cw_hex)) != 0)
        status = SERVER_ERROR;
    else if (bytes_to_hex(rw, 16, rw_hex, sizeof(rw_hex)) != 0)
        status = SERVER_ERROR;
    else
    {
        frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                             "{\"type\":\"5\",\"payload\":{\"CW\":\"%s\",\"RW\":\"%s\"}}",
                             cw_hex, rw_hex);

        if (frame_len <= 0)
            status = SERVER_ERROR;
        else if (!port_comm_send(&ctx->comm, tx_buf, (uint16_t)frame_len))
            status = SERVER_COMM_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_ReceiveAuthResult(server_ctx_t *ctx, bool *auth_ok_out)
{
    server_status_t status = SERVER_ERROR;

    if (!port_comm_receive(&ctx->comm, ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        status = SERVER_COMM_ERROR;
    else if (ctx->rx_len == 0)
        status = SERVER_NO_DATA;
    else
    {
        ctx->rx_buf[ctx->rx_len] = '\0';

        if (strstr((char *)ctx->rx_buf, "\"type\":\"4\"") == NULL)
            status = SERVER_PARSE_ERROR;
        else if (strstr((char *)ctx->rx_buf, "\"AUT_OK\"") != NULL)
        {
            *auth_ok_out = true;
            status       = SERVER_OK;
        }
        else if (strstr((char *)ctx->rx_buf, "\"AUT_NOK\"") != NULL)
        {
            *auth_ok_out = false;
            status       = SERVER_AUTH_FAILED;
        }
        else
        {
            status = SERVER_PARSE_ERROR;
        }
    }

    return status;
}

#endif /* SDK_MODE == DEVICE_MODE */