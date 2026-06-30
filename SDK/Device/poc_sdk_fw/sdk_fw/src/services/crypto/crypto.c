#include "crypto.h"
#include "port_spi.h"
#include <string.h>
#include <stdio.h>

/* ===================== INTERNAL COMMAND HEADERS ===================== */

/* Identification mode command */
#define HEADER_MODE_IDENTIFICATION   (uint32_t)0x01000000

/* Authentication mode command */
#define HEADER_MODE_AUTHENTICATION   (uint32_t)0x03000800

/* Built-in self-test command (currently unused) */
#define HEADER_MODE_BIST             (uint32_t)0xFF000000

/* ===================== INTERNAL PROTOCOL DEFINES ===================== */

/* Total TX/RX length for authentication mode */
#define TXRX_LEN            87

/* Total TX/RX length for identification mode */
#define TXRX_LEN_MODE_1     37

/* Offset where the Response Word starts in RX buffer */
#define RW_OFFSET           (TXRX_LEN - RW_SIZE_BYTES)

/* ===================== INTERNAL BUFFERS ===================== */

/* SPI buffers for authentication mode */
static uint8_t tx_super_buffer[TXRX_LEN];
static uint8_t rx_super_buffer[TXRX_LEN];

/* SPI buffers for identification mode */
static uint8_t tx_super_buffer_1[TXRX_LEN_MODE_1];
static uint8_t rx_super_buffer_1[TXRX_LEN_MODE_1];

/* SPI command header */
static uint8_t tx_header[4];

/* Dummy byte required by protocol */
static uint8_t dummy = 0xFF;

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
                                 uint16_t rw_size)
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
        /* Build authentication command header */
        tx_header[0] = (HEADER_MODE_AUTHENTICATION >> 24) & 0xFF;
        tx_header[1] = (HEADER_MODE_AUTHENTICATION >> 16) & 0xFF;
        tx_header[2] = (HEADER_MODE_AUTHENTICATION >> 8)  & 0xFF;
        tx_header[3] = (HEADER_MODE_AUTHENTICATION)       & 0xFF;

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
            memcpy(rw_buffer,
                   &rx_super_buffer[RW_OFFSET],
                   RW_SIZE_BYTES);

            port_spi_cs_disable();
            port_spi_close();

            my_crypto_status = SGR_CRYPTO_OK;
        }
    }

    return my_crypto_status;
}
