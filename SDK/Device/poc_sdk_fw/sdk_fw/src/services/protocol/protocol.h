#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <stddef.h>
#include <stdint.h>

/**
 * @file protocol.h
 * @brief Protocol service public interface.
 *
 * This header defines the public API, data types, and constants
 * used by the protocol service. The protocol service is responsible
 * for building and parsing JSON messages exchanged between the token
 * and the server during the authentication process.
 *
 * This module belongs to the Services layer.
 */

/**
 * @defgroup Protocol_Service Protocol Service
 * @brief JSON-based authentication protocol handling.
 *
 * The Protocol Service provides functions to:
 *  - Build JSON frames sent from the token to the server.
 *  - Parse JSON frames received from the server.
 *  - Validate received data using CRC checks.
 *
 * All protocol fields are represented as ASCII strings (HEX or plain text).
 *
 * @{
 */

/* =========================================================
 * Length definitions (CONTENT length, no '\0')
 * ========================================================= */

/**
 * @brief Length of the Token ID (TID) in hexadecimal characters.
 */
#define SGR_TID_HEX_LEN                 64

/**
 * @brief Length of the Challenge Word (CW) in hexadecimal characters.
 */
#define SGR_CW_HEX_LEN                  64

/**
 * @brief Length of the Response Word (RW) in hexadecimal characters.
 */
#define SGR_RW_HEX_LEN                  32

/**
 * @brief Length of the transaction identifier (UUID string).
 */
#define SGR_TRANSACTION_ID_LEN          36

/* =========================================================
 * Buffer sizes (CONTENT + '\0')
 * ========================================================= */

/**
 * @brief Buffer size for the Token ID string (including null terminator).
 */
#define SGR_TID_HEX_BUF_SIZE            (SGR_TID_HEX_LEN + 1)

/**
 * @brief Buffer size for the Challenge Word string (including null terminator).
 */
#define SGR_CW_HEX_BUF_SIZE             (SGR_CW_HEX_LEN + 1)

/**
 * @brief Buffer size for the Response Word string (including null terminator).
 */
#define SGR_RW_HEX_BUF_SIZE             (SGR_RW_HEX_LEN + 1)

/**
 * @brief Buffer size for the transaction identifier string (including null terminator).
 */
#define SGR_TRANSACTION_ID_BUF_SIZE     (SGR_TRANSACTION_ID_LEN + 1)

/* =========================================================
 * Protocol parsing configuration
 * ========================================================= */

/**
 * @brief Maximum number of JSON tokens supported during parsing.
 *
 * This value is used internally by the JSON parser (JSMN) when
 * parsing received messages.
 */
#define MAX_TOKENS 128

/**
 * @brief Enable RX debug logs.
 *
 * Uncomment this macro to enable verbose debug logs related
 * to RX parsing and validation.
 */
//#define RX_DEBUG   /* Uncomment to enable RX logs */

#ifdef RX_DEBUG
    #define RX_DBG(fmt, ...)  printf(fmt, ##__VA_ARGS__)
#else
    #define RX_DBG(fmt, ...)  do {} while (0)
#endif

/* =========================================================
 * RX response structure
 * ========================================================= */

/**
 * @brief Parsed response received from the server.
 *
 * This structure contains the extracted components of a received
 * JSON response, including payload and CRC sections.
 */
typedef struct {
    int status_code;          /**< 1 if server status code is OK (0), different 0 otherwise */
    char result[32];         /**< Result string (e.g. "OK", "AUTH_FAILED") */
    char payload[512];       /**< Raw JSON payload object as string */
    char crc[256];           /**< Raw JSON CRC object as string */
} rx_response_t;

/* =========================================================
 * Protocol context structure
 * ========================================================= */

/**
 * @brief Protocol context used to build and validate protocol frames.
 *
 * All fields are ASCII strings (HEX or plain text) unless stated otherwise.
 * String buffers must respect the exact lengths defined by the protocol.
 */
typedef struct
{
    char tid_hex[65];           /**< Token ID (64 hex characters) */
    char cw_hex[65];            /**< Challenge Word (64 hex characters) */
    char rw_hex[33];            /**< Response Word (32 hex characters) */
    char transaction_id[37];    /**< Transaction identifier (UUID string) */

    uint8_t auth_status1;       /**< Authentication status flag (internal use) */
    uint8_t auth_status2;       /**< Authentication status flag (internal use) */

    /* CRCs (CRC-CCITT 16 bits, hex string without prefix) */
    char tid_crc[5];            /**< CRC of Token ID */
    char cw_crc[5];             /**< CRC of Challenge Word */
    char rw_crc[5];             /**< CRC of Response Word */
    char transaction_id_crc[5]; /**< CRC of Transaction ID */
    char status_crc[5];         /**< CRC of authentication status */
} sgr_proto2_ctx_t;

/* =========================================================
 * Frame builders (Token to Server)
 * ========================================================= */

/**
 * @brief Build a frame to request a Challenge Word from the server.
 *
 * @param out_buf  Output buffer for the generated JSON frame.
 * @param out_size Size of the output buffer in bytes.
 * @param ctx      Protocol context containing required fields.
 *
 * @return Number of bytes written on success.
 * @return -1 on error.
 */
int Frame_Get_CW_From_Server(char *out_buf,
                            size_t out_size,
                            const sgr_proto2_ctx_t *ctx);

/**
 * @brief Build a frame containing the Response Word.
 *
 * @param out_buf  Output buffer for the generated JSON frame.
 * @param out_size Size of the output buffer in bytes.
 * @param ctx      Protocol context containing authentication data.
 *
 * @return Number of bytes written on success.
 * @return -1 on error.
 */
int Frame_Reply_RW_To_Server(char *out_buf,
                             size_t out_size,
                             const sgr_proto2_ctx_t *ctx);

/**
 * @brief Build a frame reporting the authentication result.
 *
 * @param out_buf  Output buffer for the generated JSON frame.
 * @param out_size Size of the output buffer in bytes.
 * @param ctx      Protocol context containing authentication status.
 *
 * @return Number of bytes written on success.
 * @return -1 on error.
 */
int Frame_Authentication_Result(char *out_buf,
                                size_t out_size,
                                const sgr_proto2_ctx_t *ctx);

/* =========================================================
 * Frame builders (Server to Token)
 * ========================================================= */

/**
 * @brief Build a frame to request the Response Word from the server.
 *
 * @param out_buf  Output buffer for the generated JSON frame.
 * @param out_size Size of the output buffer in bytes.
 * @param ctx      Protocol context containing required fields.
 *
 * @return Number of bytes written on success.
 * @return -1 on error.
 */
int Frame_Get_RW_From_Server(char *out_buf,
                             size_t out_size,
                             const sgr_proto2_ctx_t *ctx);

/**
 * @brief Build a frame replying with authentication status.
 *
 * @param out_buf  Output buffer for the generated JSON frame.
 * @param out_size Size of the output buffer in bytes.
 * @param ctx      Protocol context containing authentication result.
 *
 * @return Number of bytes written on success.
 * @return -1 on error.
 */
int Frame_Reply_Status_Authentication(char *out_buf,
                                      size_t out_size,
                                      const sgr_proto2_ctx_t *ctx);

/* =========================================================
 * RX parsing and validation
 * ========================================================= */

/**
 * @brief Parse a received JSON response from the server.
 *
 * @param rx_total      Full JSON response string.
 * @param expected_type Expected protocol message type.
 * @param out           Output structure for parsed response.
 *
 * @return 0 on success.
 * @return Negative value on error.
 */
int RX_Get_Response(const char *rx_total,
                    char expected_type,
                    rx_response_t *out);

/**
 * @brief Extract a field from RX payload and validate its CRC.
 *
 * @param rx             Parsed RX response structure.
 * @param field_name     Name of the field to extract.
 * @param out_value      Output buffer for extracted value.
 * @param out_value_size Size of the output buffer.
 *
 * @return 0 on success.
 * @return Negative value on error or CRC mismatch.
 */
int RX_Extract_And_Check_Field(const rx_response_t *rx,
                               const char *field_name,
                               char *out_value,
                               size_t out_value_size);

/** @} */

#endif /* PROTOCOL_H */
