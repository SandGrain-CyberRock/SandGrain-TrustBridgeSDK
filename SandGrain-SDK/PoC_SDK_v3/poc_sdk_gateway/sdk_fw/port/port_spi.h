#ifndef PORT_SPI_H
#define PORT_SPI_H

#include <stdint.h>
#include <stdbool.h>

bool port_spi_initialize(void);
bool port_spi_cs_enable(void);
bool port_spi_cs_disable(void);
bool port_spi_TransmitReceive(uint8_t *tx_buffer, uint8_t *rx_buffer, uint16_t size);
bool port_spi_close(void);

#endif /* PORT_SPI_H */
