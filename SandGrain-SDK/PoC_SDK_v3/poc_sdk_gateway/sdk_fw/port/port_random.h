/* =============================================================================
 * port_random.h
 *
 * Platform-specific cryptographic random byte generation.
 *
 * The SDK calls port_random_bytes() wherever random data is needed.
 * Each platform provides its own implementation:
 *
 *   PC Windows  - BCryptGenRandom (CNG)
 *   PC Linux    - /dev/urandom
 *   MCU STM32   - HAL_RNG_GenerateRandomNumber
 *   MCU nRF     - nrf_drv_rng_rand
 *   ...
 *
 * Returns true on success, false on failure.
 * ============================================================================= */

#ifndef PORT_RANDOM_H
#define PORT_RANDOM_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

/**
 * Fill buf with len cryptographically random bytes.
 * Returns true on success, false if the platform RNG failed.
 */
bool port_random_bytes(uint8_t *buf, size_t len);

#endif /* PORT_RANDOM_H */
