#ifndef SGR_CRYPTO_H
#define SGR_CRYPTO_H

#include <stdint.h>

/**
 * @defgroup Crypto_Service Crypto Service
 * @brief Cryptographic services for secure token authentication.
 *
 * This service provides access to cryptographic operations performed
 * by the secure crypto chip. It abstracts all low-level communication
 * details and exposes a simple interface for identification and
 * authentication purposes.
 *
 * The Crypto Service is used by the Middleware layer and relies on
 * the Portability layer for hardware access.
 *
 * @{
 */

/* ===================== PUBLIC PROTOCOL SIZES ===================== */
/**
 * @brief Size of protocol headers in bytes.
 */
#define HEADER_SIZE_BYTES          (uint8_t) 4

/**
 * @brief Size of the device unique identifier in bytes.
 */
#define ID_SIZE_BYTES              (uint8_t) 32

/**
 * @brief Size of the Challenge Word (CW) in bytes.
 */
#define CW_SIZE_BYTES              (uint8_t) 32

/**
 * @brief Size of the Response Word (RW) in bytes.
 */
#define RW_SIZE_BYTES              (uint8_t) 16

/**
 * @brief Crypto service return status.
 *
 * This enumeration defines the possible return values for
 * cryptographic service operations.
 */
typedef enum
{
    SGR_CRYPTO_OK = 0,          /**< Operation completed successfully */
    SGR_CRYPTO_ERROR,           /**< Generic error */
    SGR_CRYPTO_INVALID_PARAM,   /**< Invalid input parameter */
    SGR_CRYPTO_HW_ERROR         /**< Hardware or communication error */
} sgr_crypto_status_t;

/**
 * @brief Retrieve the unique identifier from the crypto chip.
 *
 * This function requests the unique device identifier from the
 * secure crypto chip. The identifier can be used to uniquely
 * identify the token during authentication procedures.
 *
 * @param[out] id_buffer Pointer to a buffer where the ID will be stored.
 *                       The buffer must be at least ID_SIZE_BYTES long.
 * @param[in]  id_size   Size of the provided buffer in bytes.
 *                       Must be exactly ID_SIZE_BYTES.
 *
 * @return SGR_CRYPTO_OK if the ID was successfully retrieved.
 * @return SGR_CRYPTO_INVALID_PARAM if input parameters are invalid.
 * @return SGR_CRYPTO_ERROR if the operation fails.
 */
sgr_crypto_status_t crypto_get_id(uint8_t *id_buffer, uint16_t id_size);

/**
 * @brief Generate a Response Word (RW) from a Challenge Word (CW).
 *
 * This function sends a Challenge Word to the crypto chip and
 * retrieves the corresponding Response Word generated internally
 * by the secure device.
 *
 * This operation is a core step of the authentication protocol
 * and is typically used during token-to-server authentication.
 *
 * @param[in]  cw_buffer Pointer to the Challenge Word buffer.
 *                       Must contain CW_SIZE_BYTES bytes.
 * @param[in]  cw_size   Size of the Challenge Word buffer in bytes.
 *                       Must be exactly CW_SIZE_BYTES.
 * @param[out] rw_buffer Pointer to a buffer where the Response Word
 *                       will be stored.
 *                       Must be at least RW_SIZE_BYTES long.
 * @param[in]  rw_size   Size of the Response Word buffer in bytes.
 *                       Must be exactly RW_SIZE_BYTES.
 *
 * @return SGR_CRYPTO_OK if the Response Word was successfully generated.
 * @return SGR_CRYPTO_INVALID_PARAM if input parameters are invalid.
 * @return SGR_CRYPTO_ERROR if the operation fails.
 */

sgr_crypto_status_t crypto_get_rw(const uint8_t *cw_buffer,
                                 uint16_t cw_size,
                                 uint8_t *rw_buffer,
                                 uint16_t rw_size,
                                 uint8_t  *cw_out_buffer, 
                                 uint16_t  cw_out_size);

/** @} */

#endif /* SGR_CRYPTO_H */
