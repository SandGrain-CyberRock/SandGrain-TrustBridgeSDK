/* =============================================================================
 * device_service.c
 *
 * Internal flow per operation:
 *   Send:    build JSON → port_comm_device_send
 *   Receive: port_comm_device_receive → parse JSON → extract fields
 * ============================================================================= */

#include "device_service.h"
#include "../../../port/port_comm_device.h"
#include "../../utils/encoding/encoding_hex.h"
#include "../../../include/sdk_sgr_config.h"

#include <string.h>
#include <stdio.h>
#include <stdlib.h>

/* ===================== INTERNAL BUFFERS ===================== */
#define DEVICE_TX_BUF_SIZE  512
#define DEVICE_RX_BUF_SIZE  512

/* =============================================================================
 * prv_get_pending
 * Internal helper — fills rx_buf from pending buffer if available, else reads.
 * ============================================================================= */
static bool prv_get_pending(device_service_ctx_t *ctx, uint8_t *rx_buf, uint16_t *rx_len)
{
    if (ctx->has_pending)
    {
        memcpy(rx_buf, ctx->pending_buf, ctx->pending_len);
        *rx_len          = ctx->pending_len;
        ctx->has_pending = false;
        ctx->pending_len = 0;
        return true;
    }
    return port_comm_device_receive(ctx->comm, rx_buf, DEVICE_PENDING_BUF_SIZE - 1, rx_len);
}

/* =============================================================================
 * DEVICE_PeekFrameType
 * Reads one frame, stores it as pending, returns its type.
 * ============================================================================= */
gw_frame_type_t DEVICE_PeekFrameType(device_service_ctx_t *ctx)
{
    if (ctx == NULL || ctx->comm == NULL)
        return GW_FRAME_UNKNOWN;

    if (!port_comm_device_receive(ctx->comm, ctx->pending_buf, DEVICE_PENDING_BUF_SIZE - 1, &ctx->pending_len))
        return GW_FRAME_UNKNOWN;

    if (ctx->pending_len == 0)
        return GW_FRAME_UNKNOWN;

    ctx->pending_buf[ctx->pending_len] = '\0';
    ctx->has_pending                   = true;

    if      (strstr((char *)ctx->pending_buf, "\"type\":\"4\"") != NULL) return GW_FRAME_AUTH;
    else if (strstr((char *)ctx->pending_buf, "\"type\":\"6\"") != NULL) return GW_FRAME_FW_VERIFY;
    else if (strstr((char *)ctx->pending_buf, "\"type\":\"7\"") != NULL) return GW_FRAME_INSTALL;
    else                                                                  return GW_FRAME_UNKNOWN;
}

/* =============================================================================
 * DEVICE_Init
 * Initializes device communication port — bind + listen (GW mode)
 * ============================================================================= */
device_status_t DEVICE_Init(device_service_ctx_t *ctx, const char *device_id)
{
    device_status_t status = DEVICE_ERROR;

    if (ctx == NULL || ctx->comm == NULL || device_id == NULL)
    {
        status = DEVICE_ERROR;
    }
    else if (!port_comm_device_init(ctx->comm, device_id))
    {
        status = DEVICE_COMM_ERROR;
    }
    else
    {
        status = DEVICE_OK;
    }

    return status;
}

/* =============================================================================
 * DEVICE_ReceiveAuthRequest
 * Receives type "4" from device — extracts CRC32
 * ============================================================================= */
device_status_t DEVICE_ReceiveAuthRequest(device_service_ctx_t *ctx, uint32_t *crc32_out)
{
    device_status_t status = DEVICE_ERROR;
    uint8_t         rx_buf[DEVICE_RX_BUF_SIZE];
    uint16_t        rx_len = 0;

    if (ctx == NULL || ctx->comm == NULL || crc32_out == NULL)
    {
        status = DEVICE_ERROR;
    }
    else if (!prv_get_pending(ctx, rx_buf, &rx_len))
    {
        status = DEVICE_COMM_ERROR;
    }
    else if (rx_len == 0)
    {
        status = DEVICE_NO_DATA;
    }
    else
    {
        rx_buf[rx_len] = '\0';

        if (strstr((char *)rx_buf, "\"type\":\"4\"") == NULL)
        {
            status = DEVICE_PARSE_ERROR;
        }
        else
        {
            char *ptr = strstr((char *)rx_buf, "\"CRC32\":\"");
            if (ptr == NULL)
            {
                status = DEVICE_PARSE_ERROR;
            }
            else
            {
                ptr += strlen("\"CRC32\":\"");
                char crc32_str[9];
                int  i = 0;
                while (ptr[i] != '"' && ptr[i] != '\0' && i < 8)
                {
                    crc32_str[i] = ptr[i];
                    i++;
                }
                crc32_str[i] = '\0';

                *crc32_out = (uint32_t)strtoul(crc32_str, NULL, 16);
                ctx->crc32 = *crc32_out;
                status     = DEVICE_OK;
            }
        }
    }

    return status;
}

/* =============================================================================
 * DEVICE_SendCW
 * Sends type "5" to device with CW
 * ============================================================================= */
device_status_t DEVICE_SendCW(device_service_ctx_t *ctx, const uint8_t *cw)
{
    device_status_t status = DEVICE_ERROR;
    uint8_t         tx_buf[DEVICE_TX_BUF_SIZE];
    char            cw_hex[65];
    int             len = 0;

    if (ctx == NULL || ctx->comm == NULL || cw == NULL)
    {
        status = DEVICE_ERROR;
    }
    else if (bytes_to_hex(cw, 32, cw_hex, sizeof(cw_hex)) != 0)
    {
        status = DEVICE_ERROR;
    }
    else
    {
        len = snprintf((char *)tx_buf, sizeof(tx_buf),
                       "{\"type\":\"5\",\"payload\":{\"CW\":\"%s\"}}",
                       cw_hex);

        if (len <= 0)
        {
            status = DEVICE_ERROR;
        }
        else if (!port_comm_device_send(ctx->comm, tx_buf, (uint16_t)len))
        {
            status = DEVICE_COMM_ERROR;
        }
        else
        {
            status = DEVICE_OK;
        }
    }

    return status;
}

/* =============================================================================
 * DEVICE_ReceiveRW
 * Receives type "5" from device — extracts CW echo + RW
 * ============================================================================= */
device_status_t DEVICE_ReceiveRW(device_service_ctx_t *ctx, uint8_t *cw_out, uint8_t *rw_out)
{
    device_status_t status = DEVICE_ERROR;
    uint8_t         rx_buf[DEVICE_RX_BUF_SIZE];
    uint16_t        rx_len = 0;
    char            cw_hex[65];
    char            rw_hex[33];

    if (ctx == NULL || ctx->comm == NULL || cw_out == NULL || rw_out == NULL)
    {
        status = DEVICE_ERROR;
    }
    else if (!port_comm_device_receive(ctx->comm, rx_buf, sizeof(rx_buf) - 1, &rx_len))
    {
        status = DEVICE_COMM_ERROR;
    }
    else if (rx_len == 0)
    {
        status = DEVICE_NO_DATA;
    }
    else
    {
        rx_buf[rx_len] = '\0';

        if (strstr((char *)rx_buf, "\"type\":\"5\"") == NULL)
        {
            status = DEVICE_PARSE_ERROR;
        }
        else
        {
            char *cw_ptr = strstr((char *)rx_buf, "\"CW\":\"");
            if (cw_ptr == NULL)
            {
                status = DEVICE_PARSE_ERROR;
            }
            else
            {
                cw_ptr += strlen("\"CW\":\"");
                int i = 0;
                while (cw_ptr[i] != '"' && cw_ptr[i] != '\0' && i < 64)
                {
                    cw_hex[i] = cw_ptr[i];
                    i++;
                }
                cw_hex[i] = '\0';

                char *rw_ptr = strstr((char *)rx_buf, "\"RW\":\"");
                if (rw_ptr == NULL)
                {
                    status = DEVICE_PARSE_ERROR;
                }
                else
                {
                    rw_ptr += strlen("\"RW\":\"");
                    int j = 0;
                    while (rw_ptr[j] != '"' && rw_ptr[j] != '\0' && j < 32)
                    {
                        rw_hex[j] = rw_ptr[j];
                        j++;
                    }
                    rw_hex[j] = '\0';

                    if (hex_to_bytes(cw_hex, cw_out, 32) != 0)
                    {
                        status = DEVICE_PARSE_ERROR;
                    }
                    else if (hex_to_bytes(rw_hex, rw_out, 16) != 0)
                    {
                        status = DEVICE_PARSE_ERROR;
                    }
                    else
                    {
                        status = DEVICE_OK;
                    }
                }
            }
        }
    }

    return status;
}

/* =============================================================================
 * DEVICE_ReceiveFWVerificationResult
 * Receives type "6" from device — extracts CRC32 + FW_VERIFY
 * ============================================================================= */
device_status_t DEVICE_ReceiveFWVerificationResult(device_service_ctx_t *ctx,
                                                    uint32_t             *crc32_out,
                                                    bool                 *fw_ok_out,
                                                    uint8_t              *rw_out)
{
    device_status_t status = DEVICE_ERROR;
    uint8_t         rx_buf[DEVICE_RX_BUF_SIZE];
    uint16_t        rx_len = 0;

    if (ctx == NULL || ctx->comm == NULL || crc32_out == NULL || fw_ok_out == NULL || rw_out == NULL)
        return DEVICE_ERROR;

    if (!prv_get_pending(ctx, rx_buf, &rx_len))
        return DEVICE_COMM_ERROR;

    if (rx_len == 0)
        return DEVICE_NO_DATA;

    rx_buf[rx_len] = '\0';

    if (strstr((char *)rx_buf, "\"type\":\"6\"") == NULL)
        return DEVICE_PARSE_ERROR;

    /* Extract CRC32 */
    char *crc_ptr = strstr((char *)rx_buf, "\"CRC32\":\"");
    if (crc_ptr == NULL)
        return DEVICE_PARSE_ERROR;

    crc_ptr += strlen("\"CRC32\":\"");
    char crc32_str[9];
    int  i = 0;
    while (crc_ptr[i] != '"' && crc_ptr[i] != '\0' && i < 8)
    {
        crc32_str[i] = crc_ptr[i];
        i++;
    }
    crc32_str[i] = '\0';
    *crc32_out = (uint32_t)strtoul(crc32_str, NULL, 16);

    /* Extract FW_VERIFY */
    char *fw_ptr = strstr((char *)rx_buf, "\"FW_VERIFY\":\"");
    if (fw_ptr == NULL)
        return DEVICE_PARSE_ERROR;

    fw_ptr += strlen("\"FW_VERIFY\":\"");
    *fw_ok_out = (strncmp(fw_ptr, "FW_OK", 5) == 0);

    /* Extract RW (32 hex chars → 16 bytes) */
    char *rw_ptr = strstr((char *)rx_buf, "\"RW\":\"");
    if (rw_ptr == NULL)
        return DEVICE_PARSE_ERROR;

    rw_ptr += strlen("\"RW\":\"");
    char rw_hex[33];
    int  j = 0;
    while (rw_ptr[j] != '"' && rw_ptr[j] != '\0' && j < 32)
    {
        rw_hex[j] = rw_ptr[j];
        j++;
    }
    rw_hex[j] = '\0';

    if (hex_to_bytes(rw_hex, rw_out, 16) != 0)
        return DEVICE_PARSE_ERROR;

    status = DEVICE_OK;
    return status;
}

/* =============================================================================
 * DEVICE_SendFWVerificationACK
 * Send type "6_ack" to device — cloud confirmation that FW verification was processed.
 * Frame: {"type":"6_ack","payload":{"status":"ACK_OK/ACK_NOK"}}
 * ============================================================================= */
device_status_t DEVICE_SendFWVerificationACK(device_service_ctx_t *ctx, bool ack_ok)
{
    uint8_t tx_buf[DEVICE_TX_BUF_SIZE];
    int     frame_len = 0;

    if (ctx == NULL || ctx->comm == NULL)
        return DEVICE_ERROR;

    frame_len = snprintf((char *)tx_buf, sizeof(tx_buf),
                         "{\"type\":\"6_ack\",\"payload\":{\"status\":\"%s\"}}",
                         ack_ok ? "ACK_OK" : "ACK_NOK");

    if (frame_len <= 0)
        return DEVICE_ERROR;

    if (!port_comm_device_send(ctx->comm, tx_buf, (uint16_t)frame_len))
        return DEVICE_COMM_ERROR;

    return DEVICE_OK;
}

/* =============================================================================
 * DEVICE_ReceiveInstallationRequest
 * Receives type "7" from device — extracts CRC32, CW_install (32 bytes), RW_install (16 bytes)
 * ============================================================================= */
device_status_t DEVICE_ReceiveInstallationRequest(device_service_ctx_t *ctx,
                                                   uint32_t             *crc32_out,
                                                   uint8_t              *cw_out,
                                                   uint8_t              *rw_out)
{
    device_status_t status = DEVICE_ERROR;
    uint8_t         rx_buf[DEVICE_RX_BUF_SIZE];
    uint16_t        rx_len = 0;
    char            cw_hex[65];
    char            rw_hex[33];

    if (!ctx || !ctx->comm || !crc32_out || !cw_out || !rw_out)
        return DEVICE_ERROR;

    if (!prv_get_pending(ctx, rx_buf, &rx_len))
        return DEVICE_COMM_ERROR;

    if (rx_len == 0)
        return DEVICE_NO_DATA;

    rx_buf[rx_len] = '\0';

    if (strstr((char *)rx_buf, "\"type\":\"7\"") == NULL)
        return DEVICE_PARSE_ERROR;

    /* Extract CRC32 */
    char *crc_ptr = strstr((char *)rx_buf, "\"CRC32\":\"");
    if (!crc_ptr)
        return DEVICE_PARSE_ERROR;

    crc_ptr += strlen("\"CRC32\":\"");
    char crc32_str[9];
    int  i = 0;
    while (crc_ptr[i] != '"' && crc_ptr[i] != '\0' && i < 8)
    {
        crc32_str[i] = crc_ptr[i];
        i++;
    }
    crc32_str[i] = '\0';
    *crc32_out = (uint32_t)strtoul(crc32_str, NULL, 16);

    /* Extract CW (64 hex chars = 32 bytes) */
    char *cw_ptr = strstr((char *)rx_buf, "\"CW\":\"");
    if (!cw_ptr)
        return DEVICE_PARSE_ERROR;

    cw_ptr += strlen("\"CW\":\"");
    i = 0;
    while (cw_ptr[i] != '"' && cw_ptr[i] != '\0' && i < 64)
    {
        cw_hex[i] = cw_ptr[i];
        i++;
    }
    cw_hex[i] = '\0';

    /* Extract RW (32 hex chars = 16 bytes) */
    char *rw_ptr = strstr((char *)rx_buf, "\"RW\":\"");
    if (!rw_ptr)
        return DEVICE_PARSE_ERROR;

    rw_ptr += strlen("\"RW\":\"");
    i = 0;
    while (rw_ptr[i] != '"' && rw_ptr[i] != '\0' && i < 32)
    {
        rw_hex[i] = rw_ptr[i];
        i++;
    }
    rw_hex[i] = '\0';

    if (hex_to_bytes(cw_hex, cw_out, 32) != 0)
        return DEVICE_PARSE_ERROR;

    if (hex_to_bytes(rw_hex, rw_out, 16) != 0)
        return DEVICE_PARSE_ERROR;

    status = DEVICE_OK;
    return status;
}

/* =============================================================================
 * DEVICE_SendInstallationResult
 * Sends type "7" to device with installation result
 * ============================================================================= */
device_status_t DEVICE_SendInstallationResult(device_service_ctx_t *ctx, bool install_ok)
{
    device_status_t status = DEVICE_ERROR;
    uint8_t         tx_buf[DEVICE_TX_BUF_SIZE];
    int             len = 0;

    if (!ctx || !ctx->comm)
        return DEVICE_ERROR;

    len = snprintf((char *)tx_buf, sizeof(tx_buf),
                   "{\"type\":\"7\",\"payload\":{\"INSTALL\":\"%s\"}}",
                   install_ok ? "INSTALL_OK" : "INSTALL_NOK");

    if (len <= 0)
        status = DEVICE_ERROR;
    else if (!port_comm_device_send(ctx->comm, tx_buf, (uint16_t)len))
        status = DEVICE_COMM_ERROR;
    else
        status = DEVICE_OK;

    return status;
}

/* =============================================================================
 * DEVICE_SendAuthResult
 * Sends type "4" to device with auth result
 * ============================================================================= */
device_status_t DEVICE_SendAuthResult(device_service_ctx_t *ctx, bool auth_ok)
{
    device_status_t status = DEVICE_ERROR;
    uint8_t         tx_buf[DEVICE_TX_BUF_SIZE];
    int             len = 0;

    if (ctx == NULL || ctx->comm == NULL)
    {
        status = DEVICE_ERROR;
    }
    else
    {
        len = snprintf((char *)tx_buf, sizeof(tx_buf),
                       "{\"type\":\"4\",\"payload\":{\"auth_status\":\"%s\"}}",
                       auth_ok ? "AUT_OK" : "AUT_NOK");

        if (len <= 0)
        {
            status = DEVICE_ERROR;
        }
        else if (!port_comm_device_send(ctx->comm, tx_buf, (uint16_t)len))
        {
            status = DEVICE_COMM_ERROR;
        }
        else
        {
            status = DEVICE_OK;
        }
    }

    return status;
}