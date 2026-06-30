#ifndef SGR_ENCODING_HEX_H
#define SGR_ENCODING_HEX_H

#include <stddef.h>
#include <stdint.h>

/* =========================================================
 * Hex encoding / decoding utilities
 *
 * - Generic
 * - Stateless
 * - No dynamic memory
 * - SDK-agnostic (no SGR protocol knowledge)
 * ========================================================= */

/**
 * @brief Convert binary data to HEX ASCII string.
 *
 * Example:
 *   Input : {0xA1, 0x2F}
 *   Output: "a12f"
 *
 * @param[in]  in        Pointer to input binary buffer
 * @param[in]  in_len    Length of input buffer in bytes
 * @param[out] out       Output buffer for HEX string
 * @param[in]  out_size  Size of output buffer in bytes
 *
 * @return 0 on success
 * @return -1 on error (null pointer or insufficient output buffer)
 */
int bytes_to_hex(const uint8_t *in,
                     size_t         in_len,
                     char          *out,
                     size_t         out_size);

/**
 * @brief Convert HEX ASCII string to binary data.
 *
 * Example:
 *   Input : "a12f"
 *   Output: {0xA1, 0x2F}
 *
 * @param[in]  hex       Null-terminated HEX string
 * @param[out] out       Output buffer for binary data
 * @param[in]  out_size  Maximum size of output buffer in bytes
 *
 * @return 0 on success
 * @return -1 on error (invalid format or insufficient output buffer)
 */
int hex_to_bytes(const char *hex,
                     uint8_t    *out,
                     size_t      out_size);


#endif /* SGR_ENCODING_HEX_H */
