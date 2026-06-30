#ifndef FI_DEVICE_H
#define FI_DEVICE_H

#include <stdint.h>

/* ── Bit positions for fault injection ── */
#define FI_CW_BIT_POS_0      7    /* 1st bit to flip in received CW  */
#define FI_CW_BIT_POS_1      15   /* 2nd bit to flip in received CW  */
#define FI_CW_ECHO_BIT_POS   3    /* bit to flip in CW echo to send  */
#define FI_RW_BIT_POS        5    /* bit to flip in RW to send       */

/* ── Bit positions for fault injection — option 3 ── */
/* ── Bit positions for fault injection — option 3 ── */
#define FI_CW_BIT_POS_OPT3          7     /* 1 bit corrupto al recibir CW    */
#define FI_CW_ECHO_BIT_POS_0_OPT3   15    /* 1er bit adicional al enviar echo */
#define FI_CW_ECHO_BIT_POS_1_OPT3   23    /* 2do bit adicional al enviar echo */

/* ── Fault injection flags — controlled from menu ── */
extern volatile uint8_t fi_enable_cw;       /* inject 2 bits in received CW     */
extern volatile uint8_t fi_enable_cw_echo;  /* inject 1 bit in CW echo to send  */
extern volatile uint8_t fi_enable_rw;       /* inject 1 bit in RW to send       */
extern volatile uint8_t fi_enable_option3; /* inject 2 bits in CW echo to send (option 3) */
extern volatile uint8_t fi_skip_phase2;     /* skip Phase 2 — emulate main-branch single-phase auth (options 2/3) */

/* ── Apply bitflip on hex string ── */
void fi_apply_bitflip_hex(char *hex_str, int hex_len, int bit_position);

#endif /* FI_DEVICE_H */