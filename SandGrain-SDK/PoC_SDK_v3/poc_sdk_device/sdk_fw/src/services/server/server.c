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

#include "server.h"
#include <stddef.h>
#include <string.h>
#include <stdio.h>

#include "../protocol/protocol.h"
#include "../../utils/crc/crc.h"
#include "../../utils/encoding/encoding_hex.h"
#include "../../../include/sdk_sgr_config.h"
#include "trace_log.h"   /* device-minted flow_id, put on the wire for gw + cloud */

#define SERVER_TX_BUF_SIZE 512

/* =============================================================================
 * Transport interface — registered by the application via SGR_SDK_SetCommInterface().
 *
 * All frame I/O goes through these callbacks instead of a hard-wired port layer.
 * The wrappers below adapt the interface to the boolean semantics the SERVER_*
 * functions expect (true = ok, false = comm error; out_len == 0 means no data).
 * ============================================================================= */
static sgr_sdk_comm_interface_t s_comm;
static bool                     s_comm_set = false;

void SERVER_SetCommInterface(const sgr_sdk_comm_interface_t *iface)
{
    if (iface == NULL)
    {
        s_comm_set = false;
        return;
    }
    s_comm     = *iface;          /* shallow copy — caller owns ctx */
    s_comm_set = true;
}

/* Open the connection. Returns true on success (or true if no open callback was
 * supplied — the transport is assumed already open). */
static bool comm_open(const char *device_id)
{
    if (!s_comm_set)
        return false;
    if (s_comm.open == NULL)
        return true;
    return s_comm.open(device_id, s_comm.ctx) == 0;
}

/* Send one frame. Returns true on success. */
static bool comm_send(const uint8_t *data, uint16_t len)
{
    if (!s_comm_set || s_comm.send == NULL)
        return false;
    return s_comm.send(data, len, s_comm.ctx) == 0;
}

/* Receive one frame. Returns false only on a real comm error; on success
 * *out_len is the byte count (0 when no data is available yet). */
static bool comm_receive(uint8_t *buf, uint16_t buf_size, uint16_t *out_len)
{
    if (out_len)
        *out_len = 0;
    if (!s_comm_set || s_comm.receive == NULL)
        return false;
    return s_comm.receive(buf, buf_size, out_len, s_comm.ctx) >= 0;
}

/* Close the connection (no-op if no close callback was supplied). */
static void comm_close(void)
{
    if (s_comm_set && s_comm.close != NULL)
        s_comm.close(s_comm.ctx);
}

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
    else if (!comm_open(tid_hex))
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

    comm_close();
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
        else if (!comm_send(tx_buf, (uint16_t)frame_len))
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

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
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
        else if (!comm_send(tx_buf, (uint16_t)frame_len))
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

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
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
        else if (!comm_send(tx_buf, (uint16_t)frame_len))
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

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
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
        else if (!comm_send(tx_buf, (uint16_t)frame_len))
            status = SERVER_COMM_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

/* =============================================================================
 * SERVER_SendFWVerificationBridge  (GATEWAY_MODE)
 * GW bridge: forwards device FW verification result to server — type "6"
 * Frame: {"type":"6","payload":{"TID":"<tid_hex>","FW_VERIFY":"FW_OK/FW_NOK"}}
 * ============================================================================= */
server_status_t SERVER_SendFWVerificationBridge(server_ctx_t   *ctx,
                                                const uint8_t  *tid,
                                                bool            fw_ok,
                                                const uint8_t  *rw)
{
    server_status_t status    = SERVER_ERROR;
    uint8_t         tx_buf[SERVER_TX_BUF_SIZE];
    char            tid_hex[65];
    char            rw_hex[33];
    int             frame_len = 0;

    if (!ctx || !tid || !rw)
        return SERVER_ERROR;

    if (bytes_to_hex(tid, 32, tid_hex, sizeof(tid_hex)) != 0)
        return SERVER_ERROR;

    if (bytes_to_hex(rw, 16, rw_hex, sizeof(rw_hex)) != 0)
        return SERVER_ERROR;

    frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                         "{\"type\":\"6\",\"payload\":{\"TID\":\"%s\",\"FW_VERIFY\":\"%s\",\"RW\":\"%s\"}}",
                         tid_hex, fw_ok ? "FW_OK" : "FW_NOK", rw_hex);

    if (frame_len <= 0)
        status = SERVER_PARSE_ERROR;
    else if (!comm_send(tx_buf, (uint16_t)frame_len))
        status = SERVER_COMM_ERROR;
    else
        status = SERVER_OK;

    #if PORT_COMM_DEBUG
    printf("[SERVER] FW verification bridged to server — TID: %.8s..., result: %s, RW: %.8s...\n",
           tid_hex, fw_ok ? "FW_OK" : "FW_NOK", rw_hex);
    #endif

    return status;
}

/* =============================================================================
 * SERVER_SendInstallationBridge  (GATEWAY_MODE)
 * GW bridge: forwards device installation request to Cloud SDK — type "7"
 * Frame: {"type":"7","payload":{"TID":"<tid_hex>","CW":"<64 hex>","RW":"<32 hex>"}}
 * ============================================================================= */
server_status_t SERVER_SendInstallationBridge(server_ctx_t  *ctx,
                                              const uint8_t *tid,
                                              const uint8_t *cw_install,
                                              const uint8_t *rw_install)
{
    server_status_t status    = SERVER_ERROR;
    uint8_t         tx_buf[SERVER_TX_BUF_SIZE];
    char            tid_hex[65];
    char            cw_hex[65];
    char            rw_hex[33];
    int             frame_len = 0;

    if (!ctx || !tid || !cw_install || !rw_install)
        return SERVER_ERROR;

    if (bytes_to_hex(tid, 32, tid_hex, sizeof(tid_hex)) != 0)
        return SERVER_ERROR;
    if (bytes_to_hex(cw_install, 32, cw_hex, sizeof(cw_hex)) != 0)
        return SERVER_ERROR;
    if (bytes_to_hex(rw_install, 16, rw_hex, sizeof(rw_hex)) != 0)
        return SERVER_ERROR;

    frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                         "{\"type\":\"7\",\"payload\":{\"TID\":\"%s\",\"CW\":\"%s\",\"RW\":\"%s\"}}",
                         tid_hex, cw_hex, rw_hex);

    if (frame_len <= 0)
        status = SERVER_PARSE_ERROR;
    else if (!comm_send(tx_buf, (uint16_t)frame_len))
        status = SERVER_COMM_ERROR;
    else
        status = SERVER_OK;

    return status;
}

/* =============================================================================
 * SERVER_ReceiveInstallationBridgeResult  (GATEWAY_MODE)
 * Receive Cloud SDK installation result — type "7" response
 * Server format: {"type":"7","status":{"code":0,"result":"OK"},"payload":{"FW_INSTALLATION":"OK",...}}
 * ============================================================================= */
server_status_t SERVER_ReceiveInstallationBridgeResult(server_ctx_t *ctx, bool *install_ok_out)
{
    server_status_t status = SERVER_ERROR;

    if (!ctx || !install_ok_out)
        return SERVER_ERROR;

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        return SERVER_COMM_ERROR;

    if (ctx->rx_len == 0)
        return SERVER_NO_DATA;

    ctx->rx_buf[ctx->rx_len] = '\0';

    if (strstr((char *)ctx->rx_buf, "\"type\":\"7\"") == NULL)
        return SERVER_PARSE_ERROR;

    char *result_ptr = strstr((char *)ctx->rx_buf, "\"result\":\"");
    if (result_ptr != NULL)
    {
        result_ptr += strlen("\"result\":\"");
        *install_ok_out = (strncmp(result_ptr, "OK", 2) == 0);
        status          = *install_ok_out ? SERVER_OK : SERVER_AUTH_FAILED;
    }
    else
    {
        status = SERVER_PARSE_ERROR;
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

    (void)ctx;  /* frame I/O goes through the registered comm interface */

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
                             "{\"type\":\"4\",\"payload\":{\"CRC32\":\"%08X\",\"flow_id\":\"%s\"}}",
                             crc32, trace_log_get_flow_id());

        if (frame_len <= 0){
            status = SERVER_PARSE_ERROR;
        }    
        else if (!comm_send(tx_buf, (uint16_t)frame_len)){
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

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
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

    (void)ctx;  /* frame I/O goes through the registered comm interface */

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
        else if (!comm_send(tx_buf, (uint16_t)frame_len))
            status = SERVER_COMM_ERROR;
        else
            status = SERVER_OK;
    }

    return status;
}

server_status_t SERVER_ReceiveAuthResult(server_ctx_t *ctx, bool *auth_ok_out)
{
    server_status_t status = SERVER_ERROR;

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        status = SERVER_COMM_ERROR;
    else if (ctx->rx_len == 0)
        status = SERVER_NO_DATA;
    else
    {
        ctx->rx_buf[ctx->rx_len] = '\0';

        /* Parse HRW2 (host-auth response word) if the mutual-auth verdict carried
         * it, so the device can verify host-auth locally against it. 32 hex → 16
         * bytes. Reset per frame; consumers check have_hrw2. */
        ctx->have_hrw2 = false;
        {
            const char *h = strstr((char *)ctx->rx_buf, "\"HRW2\":\"");
            if (h != NULL)
            {
                h += strlen("\"HRW2\":\"");
                bool ok = true;
                for (int i = 0; i < 16; i++)
                {
                    unsigned int b;
                    if (sscanf(h + i * 2, "%2x", &b) != 1) { ok = false; break; }
                    ctx->hrw2[i] = (uint8_t)b;
                }
                ctx->have_hrw2 = ok;
            }
        }

        if (strstr((char *)ctx->rx_buf, "\"type\":\"4\"") == NULL)
            status = SERVER_PARSE_ERROR;
        else if (strstr((char *)ctx->rx_buf, "\"CLAIM_TOKEN\"") != NULL)
        {
            /* Extract claim_token_id from the type-4 frame, e.g.:
             *   {"type":"4","payload":{"auth_status":"CLAIM_TOKEN",
             *                          "claim_token_id":"<uuid>"}} */
            ctx->claim_token_id[0] = '\0';
            const char *p = strstr((char *)ctx->rx_buf, "\"claim_token_id\":\"");
            if (p != NULL)
            {
                p += strlen("\"claim_token_id\":\"");
                const char *end = strchr(p, '"');
                if (end != NULL && (size_t)(end - p) < sizeof(ctx->claim_token_id))
                {
                    memcpy(ctx->claim_token_id, p, (size_t)(end - p));
                    ctx->claim_token_id[end - p] = '\0';
                }
            }
            *auth_ok_out = false;            /* CLAIM_TOKEN is not AUT_OK */
            status       = SERVER_CLAIM_TOKEN;
        }
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

server_status_t SERVER_SendFWVerificationResult(server_ctx_t  *ctx,
                                                const uint8_t *tid,
                                                bool           fw_ok,
                                                const uint8_t *rw)
{
    server_status_t status    = SERVER_ERROR;
    uint8_t         tx_buf[SERVER_TX_BUF_SIZE];
    char            tid_hex[65];
    char            rw_hex[33];
    uint32_t        crc32     = 0;
    int             frame_len = 0;

    if (!ctx || !tid || !rw)
        return SERVER_ERROR;

    /* Compute CRC32 from TID — same method as SERVER_SendAuthRequest */
    if (bytes_to_hex(tid, 32, tid_hex, sizeof(tid_hex)) != 0)
        return SERVER_ERROR;

    if (bytes_to_hex(rw, 16, rw_hex, sizeof(rw_hex)) != 0)
        return SERVER_ERROR;

    crcInit();
    uint16_t crc16a = crcFast((unsigned char *)tid_hex, strlen(tid_hex));
    uint16_t crc16b = crcFast((unsigned char *)tid_hex + 1, strlen(tid_hex) - 1);
    crc32 = ((uint32_t)crc16a << 16) | (uint32_t)crc16b;

    frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                         "{\"type\":\"6\",\"payload\":{\"CRC32\":\"%08X\",\"FW_VERIFY\":\"%s\",\"RW\":\"%s\"}}",
                         crc32, fw_ok ? "FW_OK" : "FW_NOK", rw_hex);

    if (frame_len <= 0)
        status = SERVER_PARSE_ERROR;
    else if (!comm_send(tx_buf, (uint16_t)frame_len))
        status = SERVER_COMM_ERROR;
    else
        status = SERVER_OK;

    #if PORT_COMM_DEBUG
    printf("[SERVER] FW verification result sent — CRC32: 0x%08X, result: %s, RW: %.8s...\n",
           crc32, fw_ok ? "FW_OK" : "FW_NOK", rw_hex);
    #endif

    return status;
}

server_status_t SERVER_SendInstallationRequest(server_ctx_t  *ctx,
                                               const uint8_t *tid,
                                               const uint8_t *cw_install,
                                               const uint8_t *rw_install)
{
    server_status_t status    = SERVER_ERROR;
    uint8_t         tx_buf[SERVER_TX_BUF_SIZE];
    char            tid_hex[65];
    char            cw_hex[65];
    char            rw_hex[33];
    uint32_t        crc32     = 0;
    int             frame_len = 0;

    if (!ctx || !tid || !cw_install || !rw_install)
        return SERVER_ERROR;

    if (bytes_to_hex(tid, 32, tid_hex, sizeof(tid_hex)) != 0)
        return SERVER_ERROR;
    if (bytes_to_hex(cw_install, 32, cw_hex, sizeof(cw_hex)) != 0)
        return SERVER_ERROR;
    if (bytes_to_hex(rw_install, 16, rw_hex, sizeof(rw_hex)) != 0)
        return SERVER_ERROR;

    crcInit();
    uint16_t crc16a = crcFast((unsigned char *)tid_hex, strlen(tid_hex));
    uint16_t crc16b = crcFast((unsigned char *)tid_hex + 1, strlen(tid_hex) - 1);
    crc32 = ((uint32_t)crc16a << 16) | (uint32_t)crc16b;

    frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                         "{\"type\":\"7\",\"payload\":{\"CRC32\":\"%08X\",\"CW\":\"%s\",\"RW\":\"%s\"}}",
                         crc32, cw_hex, rw_hex);

    if (frame_len <= 0)
        status = SERVER_PARSE_ERROR;
    else if (!comm_send(tx_buf, (uint16_t)frame_len))
        status = SERVER_COMM_ERROR;
    else
        status = SERVER_OK;

    return status;
}

server_status_t SERVER_ReceiveInstallationResult(server_ctx_t *ctx, bool *install_ok_out)
{
    server_status_t status = SERVER_ERROR;

    if (!ctx || !install_ok_out)
        return SERVER_ERROR;

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        return SERVER_COMM_ERROR;

    if (ctx->rx_len == 0)
        return SERVER_NO_DATA;

    ctx->rx_buf[ctx->rx_len] = '\0';

    if (strstr((char *)ctx->rx_buf, "\"type\":\"7\"") == NULL)
        return SERVER_PARSE_ERROR;

    if (strstr((char *)ctx->rx_buf, "\"INSTALL_OK\"") != NULL)
    {
        *install_ok_out = true;
        status          = SERVER_OK;
    }
    else if (strstr((char *)ctx->rx_buf, "\"INSTALL_NOK\"") != NULL)
    {
        *install_ok_out = false;
        status          = SERVER_AUTH_FAILED;
    }
    else
    {
        status = SERVER_PARSE_ERROR;
    }

    return status;
}

server_status_t SERVER_SendHostAuthRequest(server_ctx_t *ctx, const uint8_t *tid, const uint8_t *hcw)
{
    server_status_t status    = SERVER_ERROR;
    uint8_t         tx_buf[SERVER_TX_BUF_SIZE];
    char            tid_hex[65];
    char            hcw_hex[65];
    uint32_t        crc32     = 0;
    int             frame_len = 0;

    if (!ctx || !tid || !hcw)
        return SERVER_ERROR;

    if (bytes_to_hex(tid, 32, tid_hex, sizeof(tid_hex)) != 0)
        return SERVER_ERROR;
    if (bytes_to_hex(hcw, 32, hcw_hex, sizeof(hcw_hex)) != 0)
        return SERVER_ERROR;

    crcInit();
    uint16_t crc16a = crcFast((unsigned char *)tid_hex, strlen(tid_hex));
    uint16_t crc16b = crcFast((unsigned char *)tid_hex + 1, strlen(tid_hex) - 1);
    crc32 = ((uint32_t)crc16a << 16) | (uint32_t)crc16b;

    frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                         "{\"type\":\"8\",\"payload\":{\"CRC32\":\"%08X\",\"HCW\":\"%s\"}}",
                         crc32, hcw_hex);

    if (frame_len <= 0)
        status = SERVER_PARSE_ERROR;
    else if (!comm_send(tx_buf, (uint16_t)frame_len))
        status = SERVER_COMM_ERROR;
    else
        status = SERVER_OK;

    return status;
}

server_status_t SERVER_ReceiveHRW(server_ctx_t *ctx, uint8_t *hrw_out)
{
    server_status_t status = SERVER_ERROR;
    char            hrw_hex[33];

    if (!ctx || !hrw_out)
        return SERVER_ERROR;

    if (!comm_receive(ctx->rx_buf, sizeof(ctx->rx_buf) - 1, &ctx->rx_len))
        return SERVER_COMM_ERROR;
    if (ctx->rx_len == 0)
        return SERVER_NO_DATA;

    ctx->rx_buf[ctx->rx_len] = '\0';

    if (strstr((char *)ctx->rx_buf, "\"type\":\"8\"") == NULL)
        return SERVER_PARSE_ERROR;

    if (strstr((char *)ctx->rx_buf, "\"HOST_AUTH_NOK\"") != NULL)
        return SERVER_AUTH_FAILED;

    char *ptr = strstr((char *)ctx->rx_buf, "\"HRW\":\"");
    if (ptr == NULL)
        return SERVER_PARSE_ERROR;

    ptr += strlen("\"HRW\":\"");
    int i = 0;
    while (ptr[i] != '"' && ptr[i] != '\0' && i < 32)
    {
        hrw_hex[i] = ptr[i];
        i++;
    }
    hrw_hex[i] = '\0';

    if (hex_to_bytes(hrw_hex, hrw_out, 16) != 0)
        status = SERVER_PARSE_ERROR;
    else
        status = SERVER_OK;

    return status;
}

#endif /* SDK_MODE == DEVICE_MODE */

/* =============================================================================
 * SERVER_ReceiveFWVerificationACK  (DEVICE_MODE + GATEWAY_MODE)
 *
 * Handles two response formats:
 *   Format A — GW→Device : {"type":"6_ack","payload":{"status":"ACK_OK/ACK_NOK"}}
 *   Format B — Server→GW : {"type":"6","status":{"code":0,"result":"OK"},...}
 * ============================================================================= */
server_status_t SERVER_ReceiveFWVerificationACK(server_ctx_t *ctx, bool *ack_ok_out)
{
    if (!ctx || !ack_ok_out)
        return SERVER_ERROR;

    uint8_t  rx_buf[SERVER_RX_BUF_SIZE];
    uint16_t rx_len = 0;

    if (!comm_receive(rx_buf, sizeof(rx_buf) - 1, &rx_len))
        return SERVER_COMM_ERROR;

    if (rx_len == 0)
        return SERVER_NO_DATA;

    rx_buf[rx_len] = '\0';

    if (strstr((char *)rx_buf, "\"type\":\"6_ack\"") != NULL)
    {
        /* Format A — GW→Device */
        char *ptr = strstr((char *)rx_buf, "\"status\":\"");
        if (ptr == NULL)
            return SERVER_PARSE_ERROR;
        ptr += strlen("\"status\":\"");
        *ack_ok_out = (strncmp(ptr, "ACK_OK", 6) == 0);
    }
    else if (strstr((char *)rx_buf, "\"type\":\"6\"") != NULL)
    {
        /* Format B — Server→GW */
        char *ptr = strstr((char *)rx_buf, "\"result\":\"");
        if (ptr == NULL)
            return SERVER_PARSE_ERROR;
        ptr += strlen("\"result\":\"");
        *ack_ok_out = (strncmp(ptr, "OK", 2) == 0);
    }
    else
    {
        return SERVER_PARSE_ERROR;
    }

    #if PORT_COMM_DEBUG
    printf("[SERVER] FW verification ACK received — status: %s\n",
           *ack_ok_out ? "ACK_OK" : "ACK_NOK");
    #endif

    return SERVER_OK;
}