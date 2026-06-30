/* bitflip.h */
#ifndef BITFLIP_H
#define BITFLIP_H

#include <stdint.h>

/* Maximum number of bit positions tracked for mutation */
#define BITFLIP_MAX_DIFFBITS 32

/* -----------------------------------------------------------------------------
 * Fault Injection — for testing only
 * Set FI_CW_ENABLED / FI_RW_ENABLED to 0 in production
 * ----------------------------------------------------------------------------- */
#define FI_CW_ENABLED    0
#define FI_CW_BIT_COUNT  2
#define FI_RW_ENABLED    0
#define FI_RW_BIT_COUNT  2

#define FI_CW_ECHO_ENABLED   0
#define FI_CW_ECHO_BIT_COUNT 1  /* 1 bit adicional en el echo */

typedef enum {
    BITFLIP_OK        = 0,  /* No differences */
    BITFLIP_CORRECTED = 1,  /* Difference <= threshold */
    BITFLIP_ERROR     = 2   /* Difference > threshold */
} bitflip_status_t;

/**
 * Compare two hex strings and count bit differences.
 * @param received     Hex string received (possibly corrupted)
 * @param expected     Hex string expected (reference)
 * @param len          Length to compare in characters
 * @param max_bits     Maximum tolerated bit differences
 * @param bit_diff_out Output: actual number of differing bits
 * @return BITFLIP_OK, BITFLIP_CORRECTED or BITFLIP_ERROR
 */
bitflip_status_t bitflip_check(const char *received,
                                const char *expected,
                                uint16_t    len,
                                uint8_t     max_bits,
                                int        *bit_diff_out);


/**
 * Extract individual differing bit positions between two hex strings.
 * Equivalent to Python's bitsublist(a XOR b)
 * @param received      Hex string received
 * @param expected      Hex string expected
 * @param len           Length in characters
 * @param diffbits_out  Output array of differing bit masks (as hex char offsets)
 * @param diffbits_len  Output: number of differing bits found
 */
void bitflip_get_diffbits(const char *received,
                           const char *expected,
                           uint16_t    len,
                           uint32_t   *diffbits_out,
                           uint8_t    *diffbits_len);

/**
 * Apply a mutation mask to a hex string.
 * @param input     Original hex string
 * @param mask      Mutation mask (from diffbits)
 * @param len       Length in characters
 * @param output    Output mutated hex string
 */
/*void bitflip_apply_mutation(const char *input,
                             uint32_t    mask,
                             uint16_t    len,
                             char       *output);*/
void bitflip_apply_mutation(const char *input,
                             uint32_t   *diffbits,
                             uint8_t     diffbits_len,
                             uint8_t     selection_mask,
                             uint16_t    len,
                             char       *output);


                             
void fi_apply_cw(uint8_t *cw, int len);
void fi_apply_rw(uint8_t *rw, int len);
void fi_apply_cw_echo(uint8_t *cw_echo, int len);

#endif /* BITFLIP_H */