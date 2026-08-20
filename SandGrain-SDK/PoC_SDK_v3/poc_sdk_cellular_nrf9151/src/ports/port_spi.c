/* =============================================================================
 * port_spi.c - SGT1001 SPI transport, Zephyr implementation (nRF9151-DK)
 *
 * Implements the SDK's 5-function port_spi interface against the `sgt1001`
 * devicetree node on the nRF9151-DK Arduino SPI header (&spi3). crypto.c drives
 * every chip operation as a single full-duplex transfer bracketed by:
 *     initialize -> cs_enable -> TransmitReceive -> cs_disable -> close
 * Zephyr's spi_transceive_dt() manages chip-select automatically for the whole
 * transfer, so cs_enable/cs_disable/initialize/close are no-ops here and the
 * single transceive reproduces the exact wire behaviour (CS low for the frame).
 * Identical to the nRF54L15 port - only the devicetree node differs (per-board).
 * ============================================================================= */
#include "port_spi.h"

#include <zephyr/kernel.h>
#include <zephyr/drivers/spi.h>

#define SGT1001_NODE          DT_NODELABEL(sgt1001)
#define SGT1001_SPI_OPERATION (SPI_OP_MODE_MASTER | SPI_WORD_SET(8) | SPI_TRANSFER_MSB)

static const struct spi_dt_spec sgt1001 =
	SPI_DT_SPEC_GET(SGT1001_NODE, SGT1001_SPI_OPERATION);

bool port_spi_initialize(void)
{
	return spi_is_ready_dt(&sgt1001);
}

bool port_spi_cs_enable(void)
{
	/* CS is asserted by the driver inside spi_transceive_dt(). */
	return true;
}

bool port_spi_cs_disable(void)
{
	/* CS is de-asserted by the driver after spi_transceive_dt(). */
	return true;
}

bool port_spi_TransmitReceive(uint8_t *tx_buffer, uint8_t *rx_buffer, uint16_t size)
{
	if (tx_buffer == NULL || rx_buffer == NULL || size == 0) {
		return false;
	}

	const struct spi_buf tx_buf = { .buf = tx_buffer, .len = size };
	const struct spi_buf rx_buf = { .buf = rx_buffer, .len = size };
	const struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	const struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };

	return spi_transceive_dt(&sgt1001, &tx, &rx) == 0;
}

bool port_spi_close(void)
{
	return true;
}
