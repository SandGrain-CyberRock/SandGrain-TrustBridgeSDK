#ifndef SGR_CRYPTO_H
#define SGR_CRYPTO_H

#include <stdint.h>

/**
 * @brief Supported SandGrain crypto chip variants.
 *
 * Selected once at application startup and read by the crypto service
 * to pick the correct authentication opcode.
 */
typedef enum {
    SGR_CHIP_SGA = 0,  /**< header 0x03000800 */
    SGR_CHIP_SGB = 1   /**< header 0x05000800 */
} sgr_chip_variant_t;

/**
 * @brief Active chip variant for this process.
 *        Set once at startup by the application before any crypto call.
 *        Defaults to SGR_CHIP_SGA.
 */
extern sgr_chip_variant_t g_sgr_chip_variant;

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
 * @brief BIST protocol sizes (mirrors the Python reference script).
 */
#define BIST_TXRX_LEN_BYTES        (uint8_t) 72
#define BIST_PCC_SIZE_BYTES        (uint8_t) 16
#define BIST_ID_SIZE_BYTES         (uint8_t) 16
#define BIST_RW_SIZE_BYTES         (uint8_t) 16
#define BIST_EK_SIZE_BYTES         (uint8_t) 16
#define BIST_PASS_BYTE             (uint8_t) 0x50

/**
 * @brief Result of a Built-In Self-Test on the crypto chip.
 */
typedef struct
{
    uint8_t pcc[BIST_PCC_SIZE_BYTES];   /**< First half of TID                        */
    uint8_t id[BIST_ID_SIZE_BYTES];     /**< Second half of TID                       */
    uint8_t rw[BIST_RW_SIZE_BYTES];     /**< Response Word produced by BIST           */
    uint8_t ek[BIST_EK_SIZE_BYTES];     /**< Encryption Key produced by BIST          */
    uint8_t bist_byte;                  /**< Raw BIST result byte (0x50 == PASS)      */
    uint8_t passed;                     /**< 1 if bist_byte == BIST_PASS_BYTE, else 0 */
} sgr_crypto_bist_result_t;

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
 * @brief Authentication direction for crypto_get_rw.
 *
 * The chip exposes two distinct opcodes, one per direction:
 *   - TOKEN_AUTH (0x03000800): used for token→cloud authentication (Phase 1).
 *     Chip computes the value the cloud's tokenAuth/replyRW endpoint expects.
 *   - HOST_AUTH  (0x05000800): used for cloud→token authentication (Phase 2),
 *     FW verification and Installation. Chip computes the value the cloud's
 *     requestHRW/checkRequestHRWStatus endpoint produces.
 */
typedef enum
{
    SGR_CRYPTO_MODE_TOKEN_AUTH = 0,
    SGR_CRYPTO_MODE_HOST_AUTH  = 1
} sgr_crypto_auth_mode_t;

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

sgr_crypto_status_t crypto_get_rw(const uint8_t           *cw_buffer,
                                  uint16_t                 cw_size,
                                  uint8_t                 *rw_buffer,
                                  uint16_t                 rw_size,
                                  uint8_t                 *cw_out_buffer,
                                  uint16_t                 cw_out_size,
                                  sgr_crypto_auth_mode_t   mode);

/**
 * @brief Run the chip-internal Built-In Self-Test (BIST).
 *
 * Sends the BIST command (0xFF000000 + 68 zero bytes, 72-byte transaction)
 * to the crypto chip and parses the response into the supplied result struct.
 *
 * On a successful transaction the function returns SGR_CRYPTO_OK and the
 * caller must inspect @c result->passed to learn whether the chip reported
 * a PASS (BIST byte == 0x50) or a FAIL.
 *
 * @param[out] result Pointer to a result struct. Must not be NULL.
 *
 * @return SGR_CRYPTO_OK            if the transaction completed.
 * @return SGR_CRYPTO_INVALID_PARAM if @c result is NULL.
 * @return SGR_CRYPTO_HW_ERROR      if SPI/USB transport failed.
 */
sgr_crypto_status_t crypto_bist(sgr_crypto_bist_result_t *result);

/** @} */

#endif /* SGR_CRYPTO_H */
