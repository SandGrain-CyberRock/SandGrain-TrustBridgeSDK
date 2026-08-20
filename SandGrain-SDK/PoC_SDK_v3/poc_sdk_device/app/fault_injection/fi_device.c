#include "fi_device.h"
#include <stdint.h>
#include <stdio.h>
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

/* ── Whole-frame helpers (see fi_device.h) ─────────────────────────────────
 * Same flips, same bit positions and same order as the PC/TCP port applies
 * inline in port_comm.c - kept here so the BLE transports (Pi peripheral and
 * nRF board) do not each grow their own copy and drift. */

/* Locate the hex payload of "<key>":"..." in a JSON frame, or NULL. */
static char *fi_field(char *json, const char *key)
{
    char pattern[16];
    snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
    char *p = strstr(json, pattern);
    return p ? (p + strlen(pattern)) : NULL;
}

void fi_apply_tx_frame(char *json)
{
    if (json == NULL)
        return;

    if (fi_enable_cw_echo)
    {
        char *cw = fi_field(json, "CW");
        if (cw)
        {
            fi_apply_bitflip_hex(cw, 64, FI_CW_ECHO_BIT_POS);
            printf("[FAULT] CW echo corrupted - 1 bit flipped\n");
        }
    }

    if (fi_enable_rw)
    {
        char *rw = fi_field(json, "RW");
        if (rw)
        {
            fi_apply_bitflip_hex(rw, 32, FI_RW_BIT_POS);
            printf("[FAULT] RW corrupted - 1 bit flipped\n");
        }
    }

    if (fi_enable_option3)
    {
        char *cw = fi_field(json, "CW");
        if (cw)
        {
            fi_apply_bitflip_hex(cw, 64, FI_CW_ECHO_BIT_POS_0_OPT3);
            fi_apply_bitflip_hex(cw, 64, FI_CW_ECHO_BIT_POS_1_OPT3);
            printf("[FAULT] CW echo corrupted - 2 bits flipped (option 3)\n");
        }
    }
}

void fi_apply_rx_frame(char *json)
{
    if (json == NULL)
        return;

    if (fi_enable_cw)
    {
        char *cw = fi_field(json, "CW");
        if (cw)
        {
            fi_apply_bitflip_hex(cw, 64, FI_CW_BIT_POS_0);
            fi_apply_bitflip_hex(cw, 64, FI_CW_BIT_POS_1);
            printf("[FAULT] CW corrupted - 2 bits flipped\n");
        }
    }

    if (fi_enable_option3)
    {
        char *cw = fi_field(json, "CW");
        if (cw)
        {
            fi_apply_bitflip_hex(cw, 64, FI_CW_BIT_POS_OPT3);
            printf("[FAULT] CW corrupted - 1 more bit flipped (option 3)\n");
        }
    }
}
