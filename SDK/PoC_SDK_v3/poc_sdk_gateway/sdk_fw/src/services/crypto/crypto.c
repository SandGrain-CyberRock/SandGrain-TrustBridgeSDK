#include "crypto.h"
#include "port_spi.h"
#include <string.h>
#include <stdio.h>

/* ===================== INTERNAL COMMAND HEADERS ===================== */

/* Identification mode command */
#define HEADER_MODE_IDENTIFICATION   (uint32_t)0x01000000

/* Authentication mode command */
#define HEADER_MODE_AUTHENTICATION   (uint32_t)0x03000800

/* Authentication mode command (variant 2) */
#define HEADER_MODE_AUTHENTICATION_2 (uint32_t)0x05000800

/* Built-in self-test command — variant-dependent opcode.
 * Per the Python reference (CyberRock_Token.py):
 *   SGB → 0xFF000000
 *   SGA → 0x80000000
 */
#define HEADER_MODE_BIST_SGB         (uint32_t)0xFF000000
#define HEADER_MODE_BIST_SGA         (uint32_t)0x80000000
/* Legacy alias kept for any pre-existing references */
#define HEADER_MODE_BIST             HEADER_MODE_BIST_SGB

/* ===================== INTERNAL PROTOCOL DEFINES ===================== */

/* Total TX/RX length for authentication mode */
#define TXRX_LEN            87

/* Total TX/RX length for identification mode */
#define TXRX_LEN_MODE_1     37

/* Offset where the Response Word starts in RX buffer */
#define RW_OFFSET           (TXRX_LEN - RW_SIZE_BYTES)
#define TID_OFFSET  5
#define CW_OFFSET   38

/* ===================== INTERNAL BUFFERS ===================== */

/* SPI buffers for authentication mode */
static uint8_t tx_super_buffer[TXRX_LEN];
static uint8_t rx_super_buffer[TXRX_LEN];

/* SPI buffers for identification mode */
static uint8_t tx_super_buffer_1[TXRX_LEN_MODE_1];
static uint8_t rx_super_buffer_1[TXRX_LEN_MODE_1];

/* SPI buffers for BIST mode */
static uint8_t tx_super_buffer_bist[BIST_TXRX_LEN_BYTES];
static uint8_t rx_super_buffer_bist[BIST_TXRX_LEN_BYTES];

/* ===================== BIST RESPONSE OFFSETS =====================
 * Mirrors the Python reference script CyberRock_Token.py
 *   PCC : bytes 5..20  (16 bytes)  — first half of TID
 *   ID  : bytes 21..36 (16 bytes)  — second half of TID
 *   RW  : bytes 38..53 (16 bytes)  — RWL part 1
 *   EK  : bytes 54..69 (16 bytes)  — RWL part 2
 *   BIST byte : index 71           — 0x50 == PASS
 * ============================================================== */
#define BIST_OFFSET_PCC        5
#define BIST_OFFSET_ID         21
#define BIST_OFFSET_RW         38
#define BIST_OFFSET_EK         54
#define BIST_OFFSET_PASS_BYTE  71

/* SPI command header */
static uint8_t tx_header[4];

/* Dummy byte required by protocol */
static uint8_t dummy = 0xFF;

/* Active chip variant — set by the application at startup. */
sgr_chip_variant_t g_sgr_chip_variant = SGR_CHIP_SGA;

sgr_crypto_status_t crypto_get_id(uint8_t *id_buffer, uint16_t id_size)
{
    sgr_crypto_status_t my_crypto_status = SGR_CRYPTO_ERROR;
    int index = 0;

    /* Parameter validation */
    if (!id_buffer || id_size != ID_SIZE_BYTES)
    {
        return SGR_CRYPTO_INVALID_PARAM;
    }
    else
    {
        /* Build identification command header */
        tx_header[0] = (HEADER_MODE_IDENTIFICATION >> 24) & 0xFF;
        tx_header[1] = (HEADER_MODE_IDENTIFICATION >> 16) & 0xFF;
        tx_header[2] = (HEADER_MODE_IDENTIFICATION >> 8)  & 0xFF;
        tx_header[3] = (HEADER_MODE_IDENTIFICATION)       & 0xFF;

        /* Header */
        memcpy(&tx_super_buffer_1[index], tx_header, 4);
        index += 4;

        /* Dummy byte */
        tx_super_buffer_1[index++] = dummy;

        /* ID placeholder */
        memset(&tx_super_buffer_1[index], 0xFF, ID_SIZE_BYTES);
        index += ID_SIZE_BYTES;

        /* Size verification */
        if (index != TXRX_LEN_MODE_1)
        {
            printf("ERROR: TX size = %d, expected %d\n",
                   index, TXRX_LEN_MODE_1);
        }
        else if (port_spi_initialize() != true)
        {
            port_spi_cs_disable();
            port_spi_close();
        }
        else if (port_spi_cs_enable() != true)
        {
            port_spi_cs_disable();
            port_spi_close();
        }
        else if (port_spi_TransmitReceive(tx_super_buffer_1,
                                          rx_super_buffer_1,
                                          TXRX_LEN_MODE_1) != true)
        {
            port_spi_cs_disable();
            port_spi_close();
        }
        else
        {
            /* ID starts after header (4) + dummy (1) */
            memcpy(id_buffer, &rx_super_buffer_1[5], ID_SIZE_BYTES);

            port_spi_cs_disable();
            port_spi_close();

            my_crypto_status = SGR_CRYPTO_OK;
        }
    }

    return my_crypto_status;
}

sgr_crypto_status_t crypto_get_rw(const uint8_t *cw_buffer,
                                 uint16_t cw_size,
                                 uint8_t *rw_buffer,
                                 uint16_t rw_size,
                                 uint8_t  *cw_out_buffer, 
                                 uint16_t  cw_out_size)
{
    sgr_crypto_status_t my_crypto_status = SGR_CRYPTO_ERROR;
    int idx = 0;

    /* Parameter validation */
    if (!cw_buffer || !rw_buffer)
    {
        my_crypto_status = SGR_CRYPTO_INVALID_PARAM;
    }
    else if (cw_size != CW_SIZE_BYTES || rw_size != RW_SIZE_BYTES)
    {
        my_crypto_status = SGR_CRYPTO_INVALID_PARAM;
    }
    else
    {
        /* Build authentication command header — pick opcode based on active chip variant */
        const uint32_t header_mode = (g_sgr_chip_variant == SGR_CHIP_SGB)
                                       ? HEADER_MODE_AUTHENTICATION_2
                                       : HEADER_MODE_AUTHENTICATION;
        tx_header[0] = (header_mode >> 24) & 0xFF;
        tx_header[1] = (header_mode >> 16) & 0xFF;
        tx_header[2] = (header_mode >> 8)  & 0xFF;
        tx_header[3] = (header_mode)       & 0xFF;

        /* Header */
        memcpy(&tx_super_buffer[idx], tx_header, 4);
        idx += 4;

        /* Dummy byte */
        tx_super_buffer[idx++] = dummy;

        /* Challenge Word */
        memcpy(&tx_super_buffer[idx], cw_buffer, CW_SIZE_BYTES);
        idx += CW_SIZE_BYTES;

        /* Dummy byte */
        tx_super_buffer[idx++] = dummy;

        /* Dummy data */
        memset(&tx_super_buffer[idx], 0xFF, 32);
        idx += 32;

        /* Dummy byte */
        tx_super_buffer[idx++] = dummy;

        /* Dummy data */
        memset(&tx_super_buffer[idx], 0xFF, RW_SIZE_BYTES);
        idx += RW_SIZE_BYTES;

        /* Size verification */
        if (idx != TXRX_LEN)
        {
            printf("ERROR: TX size = %d, expected %d\n", idx, TXRX_LEN);
        }
        else if (port_spi_initialize() != true)
        {
            port_spi_cs_disable();
            port_spi_close();
        }
        else if (port_spi_cs_enable() != true)
        {
            port_spi_cs_disable();
            port_spi_close();
        }
        else if (port_spi_TransmitReceive(tx_super_buffer,
                                          rx_super_buffer,
                                          TXRX_LEN) != true)
        {
            port_spi_cs_disable();
            port_spi_close();
        }
        else if (port_spi_cs_disable() != true)
        {
            port_spi_close();
        }
        else if (port_spi_close() != true)
        {
            port_spi_close();
        }
        else
        {
            /* Extract Response Word */
            memcpy(rw_buffer, &rx_super_buffer[RW_OFFSET], RW_SIZE_BYTES);
            /* Only extract CW if buffer provided */
            if (cw_out_buffer != NULL && cw_out_size == CW_SIZE_BYTES)
                memcpy(cw_out_buffer, &rx_super_buffer[CW_OFFSET], CW_SIZE_BYTES);

            port_spi_cs_disable();
            port_spi_close();

            my_crypto_status = SGR_CRYPTO_OK;
        }
    }

    return my_crypto_status;
}

sgr_crypto_status_t crypto_bist(sgr_crypto_bist_result_t *result)
{
    sgr_crypto_status_t my_crypto_status = SGR_CRYPTO_ERROR;

    /* Parameter validation */
    if (!result)
    {
        return SGR_CRYPTO_INVALID_PARAM;
    }

    /* Pick BIST opcode based on the active chip variant.
     * SGB → 0xFF000000   SGA → 0x80000000
     */
    const uint32_t header_mode = (g_sgr_chip_variant == SGR_CHIP_SGB)
                                   ? HEADER_MODE_BIST_SGB
                                   : HEADER_MODE_BIST_SGA;

    /* Build BIST command: header (variant-dependent) + 68 zero bytes */
    memset(tx_super_buffer_bist, 0, BIST_TXRX_LEN_BYTES);
    tx_super_buffer_bist[0] = (header_mode >> 24) & 0xFF;
    tx_super_buffer_bist[1] = (header_mode >> 16) & 0xFF;
    tx_super_buffer_bist[2] = (header_mode >> 8)  & 0xFF;
    tx_super_buffer_bist[3] = (header_mode)       & 0xFF;

    if (port_spi_initialize() != true)
    {
        port_spi_cs_disable();
        port_spi_close();
        my_crypto_status = SGR_CRYPTO_HW_ERROR;
    }
    else if (port_spi_cs_enable() != true)
    {
        port_spi_cs_disable();
        port_spi_close();
        my_crypto_status = SGR_CRYPTO_HW_ERROR;
    }
    else if (port_spi_TransmitReceive(tx_super_buffer_bist,
                                      rx_super_buffer_bist,
                                      BIST_TXRX_LEN_BYTES) != true)
    {
        port_spi_cs_disable();
        port_spi_close();
        my_crypto_status = SGR_CRYPTO_HW_ERROR;
    }
    else
    {
        /* Disassemble response — offsets mirror the Python reference */
        memcpy(result->pcc, &rx_super_buffer_bist[BIST_OFFSET_PCC], BIST_PCC_SIZE_BYTES);
        memcpy(result->id,  &rx_super_buffer_bist[BIST_OFFSET_ID],  BIST_ID_SIZE_BYTES);
        memcpy(result->rw,  &rx_super_buffer_bist[BIST_OFFSET_RW],  BIST_RW_SIZE_BYTES);
        memcpy(result->ek,  &rx_super_buffer_bist[BIST_OFFSET_EK],  BIST_EK_SIZE_BYTES);
        result->bist_byte = rx_super_buffer_bist[BIST_OFFSET_PASS_BYTE];
        result->passed    = (result->bist_byte == BIST_PASS_BYTE) ? 1u : 0u;

        port_spi_cs_disable();
        port_spi_close();

        my_crypto_status = SGR_CRYPTO_OK;
    }

    return my_crypto_status;
}
