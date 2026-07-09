#include "fi_device.h"
#include <stdint.h>
#include <string.h>

volatile uint8_t fi_enable_cw      = 0;
volatile uint8_t fi_enable_cw_echo = 0;
volatile uint8_t fi_enable_rw      = 0;
volatile uint8_t fi_enable_option3 = 0;
volatile uint8_t fi_skip_phase2    = 0;

void fi_apply_bitflip_hex(char *hex_str, int hex_len, int bit_position)
{
    /* convert hex string to bytes */
    int byte_len = hex_len / 2;
    uint8_t bytes[64];
    for (int i = 0; i < byte_len; i++)
    {
        uint8_t hi = hex_str[i*2];
        uint8_t lo = hex_str[i*2+1];
        hi = (hi >= 'a') ? hi - 'a' + 10 : (hi >= 'A') ? hi - 'A' + 10 : hi - '0';
        lo = (lo >= 'a') ? lo - 'a' + 10 : (lo >= 'A') ? lo - 'A' + 10 : lo - '0';
        bytes[i] = (hi << 4) | lo;
    }

    /* apply bitflip */
    int byte_idx = bit_position / 8;
    int bit_idx  = bit_position % 8;
    if (byte_idx < byte_len)
        bytes[byte_idx] ^= (1 << bit_idx);

    /* convert back to hex string */
    const char *hex_chars = "0123456789abcdef";
    for (int i = 0; i < byte_len; i++)
    {
        hex_str[i*2]   = hex_chars[(bytes[i] >> 4) & 0xF];
        hex_str[i*2+1] = hex_chars[ bytes[i]       & 0xF];
    }
}