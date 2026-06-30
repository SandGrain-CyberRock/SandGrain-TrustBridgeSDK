#ifndef PORT_COMM_H
#define PORT_COMM_H

#include <stdint.h>
#include <stdbool.h>

/**
 * @brief Inicializa el hardware / stack de comunicación
 */
//bool port_comm_init(void);
bool port_comm_init(const char *device_id);

/**
 * @brief Envía datos por el medio de comunicación
 */
bool port_comm_send(const uint8_t *buffer_tx, uint16_t buffer_tx_size);

/**
 * @brief Recibe datos por el medio de comunicación
 */
bool port_comm_receive(uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size);

void port_comm_close(void);

#endif /* PORT_COMM_H */
