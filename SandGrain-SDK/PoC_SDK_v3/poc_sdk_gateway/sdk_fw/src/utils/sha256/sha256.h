#ifndef SHA256_H
#define SHA256_H

/* =============================================================================
 * sha256.h
 *
 * Compact SHA-256 (FIPS PUB 180-4) — utility for firmware verification.
 *
 * Usage:
 *   uint8_t hash[32];
 *   sha256_compute(fw_data, fw_size, hash);
 * ============================================================================= */

#include <stdint.h>

/**
 * @brief Compute the SHA-256 digest of a data buffer.
 *
 * @param data  Pointer to input data.
 * @param len   Length of input data in bytes.
 * @param hash  Output buffer — must be exactly 32 bytes.
 */
void sha256_compute(const uint8_t *data, uint32_t len, uint8_t hash[32]);

#endif /* SHA256_H */
