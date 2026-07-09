/* bitflip.c */
#include "bit_flip.h"
#include <stddef.h>
#include <string.h>
#include <stdio.h>


static const int fi_cw_bit_positions[FI_CW_BIT_COUNT] = { 0, 9 };
static const int fi_rw_bit_positions[FI_RW_BIT_COUNT] = { 0, 8 };
static const int fi_cw_echo_bit_positions[FI_CW_ECHO_BIT_COUNT] = {16};

bitflip_status_t bitflip_check(const char *received,
                                const char *expected,
                                uint16_t    len,
                                uint8_t     max_bits,
                                int        *bit_diff_out)
{
    if (!received || !expected || !bit_diff_out || len == 0)
        return BITFLIP_ERROR;

    /* Validate that both strings are at least len characters */
    uint16_t len_rx = (uint16_t)strlen(received);
    uint16_t len_ex = (uint16_t)strlen(expected);

    if (len_rx < len || len_ex < len)
        return BITFLIP_ERROR;

    int diff = 0;

    for (uint16_t i = 0; i < len; i++)
    {
        // Convertir cada char hex a su valor real antes del XOR
        uint8_t val_rx = (received[i] >= '0' && received[i] <= '9') 
                        ? received[i] - '0' 
                        : received[i] - 'a' + 10;

        uint8_t val_ex = (expected[i] >= '0' && expected[i] <= '9') 
                        ? expected[i] - '0' 
                        : expected[i] - 'a' + 10;

        uint8_t xor_val = val_rx ^ val_ex;
        while (xor_val)
        {
            diff += (xor_val & 1);
            xor_val >>= 1;
        }
    }

    *bit_diff_out = diff;

    if (diff == 0)
        return BITFLIP_OK;
    else if (diff <= max_bits)
        return BITFLIP_CORRECTED;
    else
        return BITFLIP_ERROR;
}

void bitflip_apply_mutation(const char *input,
                             uint32_t   *diffbits,
                             uint8_t     diffbits_len,
                             uint8_t     selection_mask,
                             uint16_t    len,
                             char       *output)
{
    memcpy(output, input, len);
    output[len] = '\0';

    for (int t = 0; t < diffbits_len; t++)
    {
        if (selection_mask & (1 << t))
        {
            uint16_t char_idx = (uint16_t)(diffbits[t] >> 8);
            uint8_t  bit_pos  = (uint8_t)(diffbits[t] & 0xFF);

            if (char_idx < len)
            {
                int val = (output[char_idx] >= '0' && output[char_idx] <= '9') ?
                          output[char_idx] - '0' : output[char_idx] - 'a' + 10;
                val ^= (1 << bit_pos);
                output[char_idx] = (val < 10) ? '0' + val : 'a' + val - 10;
            }
        }
    }
}



void fi_apply_cw(uint8_t *cw, int len)
{
#if FI_CW_ENABLED
    printf("[FI][CW] Injecting %d bit fault(s)\n", FI_CW_BIT_COUNT);
    for (int i = 0; i < FI_CW_BIT_COUNT; i++)
    {
        int byte_idx = fi_cw_bit_positions[i] / 8;
        int bit_idx  = fi_cw_bit_positions[i] % 8;
        if (byte_idx < len)
            cw[byte_idx] ^= (uint8_t)(1 << bit_idx);
    }
#else
    (void)cw; (void)len;
#endif
}

void fi_apply_rw(uint8_t *rw, int len)
{
#if FI_RW_ENABLED
    printf("[FI][RW] Injecting %d bit fault(s)\n", FI_RW_BIT_COUNT);
    for (int i = 0; i < FI_RW_BIT_COUNT; i++)
    {
        int byte_idx = fi_rw_bit_positions[i] / 8;
        int bit_idx  = fi_rw_bit_positions[i] % 8;
        if (byte_idx < len)
            rw[byte_idx] ^= (uint8_t)(1 << bit_idx);
    }
#else
    (void)rw; (void)len;
#endif
}

void fi_apply_cw_echo(uint8_t *cw_echo, int len)
{
#if FI_CW_ECHO_ENABLED
    printf("[FI][CW_ECHO] Injecting %d bit fault(s)\n", FI_CW_ECHO_BIT_COUNT);
    for (int i = 0; i < FI_CW_ECHO_BIT_COUNT; i++)
    {
        int byte_idx = fi_cw_echo_bit_positions[i] / 8;
        int bit_idx  = fi_cw_echo_bit_positions[i] % 8;
        if (byte_idx < len)
            cw_echo[byte_idx] ^= (uint8_t)(1 << bit_idx);
    }
#else
    (void)cw_echo; (void)len;
#endif
}