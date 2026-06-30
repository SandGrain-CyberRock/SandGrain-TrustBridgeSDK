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