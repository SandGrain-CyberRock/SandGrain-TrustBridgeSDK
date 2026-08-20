/* =============================================================================
 * random.h
 *
 * Random byte generation utility.
 *
 * Current implementation uses rand() - suitable for PoC only.
 * Replace random_bytes() implementation with hardware RNG when available.
 * ============================================================================= */

#ifndef RANDOM_H
#define RANDOM_H

#include <stdint.h>
#include <stddef.h>

/**
 * Fill buffer with random bytes.
 */
void random_bytes(uint8_t *buf, size_t len);

#endif /* RANDOM_H */