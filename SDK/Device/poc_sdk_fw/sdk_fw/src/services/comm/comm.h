#ifndef COMM_H
#define COMM_H

#include <stdint.h>
#include <stdbool.h>

/**
 * @brief Communication service status codes.
 *
 * These values represent the result of operations performed
 * by the communication service.
 */
typedef enum
{
    COMM_OK = 0,          /**< Operation completed successfully */
    COMM_ERROR,           /**< Generic internal error */
    COMM_INVALID_PARAM,   /**< Invalid input parameter */
    COMM_HW_ERROR         /**< Underlying hardware or port error */
} comm_status_t;

/**
 * @brief Initialize the communication service.
 *
 * This function initializes the communication service and the
 * underlying communication port.
 *
 * It is safe to call this function multiple times; initialization
 * will only be performed once.
 *
 * @return COMM_OK on success.
 * @return COMM_HW_ERROR if the underlying port initialization fails.
 */
comm_status_t comm_init(const char *device_id);

/**
 * @brief Send data to the remote endpoint.
 *
 * This function sends a raw data buffer using the underlying
 * communication port.
 *
 * @param[in] data Pointer to the data buffer to be sent.
 * @param[in] size Size of the data buffer in bytes.
 *
 * @return COMM_OK on success.
 * @return COMM_INVALID_PARAM if input parameters are invalid.
 * @return COMM_HW_ERROR if the transmission fails at port level.
 * @return COMM_ERROR if the service is not initialized.
 */
comm_status_t comm_send(const uint8_t *data, uint16_t size);

/**
 * @brief Receive data from the remote endpoint.
 *
 * This function receives data using the underlying communication port.
 * The actual number of received bytes is returned via @p received_size.
 *
 * @param[out] buffer Pointer to the reception buffer.
 * @param[in]  buffer_size Size of the reception buffer in bytes.
 * @param[out] received_size Number of bytes actually received.
 *
 * @return COMM_OK on success.
 * @return COMM_INVALID_PARAM if input parameters are invalid.
 * @return COMM_HW_ERROR if the reception fails at port level.
 * @return COMM_ERROR if the service is not initialized.
 */
comm_status_t comm_receive(uint8_t *buffer,
                           uint16_t buffer_size,
                           uint16_t *received_size);


comm_status_t comm_close(void);

#endif /* COMM_H */
