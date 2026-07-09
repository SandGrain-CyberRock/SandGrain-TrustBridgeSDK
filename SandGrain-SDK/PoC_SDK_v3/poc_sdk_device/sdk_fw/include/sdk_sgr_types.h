#ifndef SDK_SGR_TYPES_H
#define SDK_SGR_TYPES_H

#include <stdint.h>

#define MAX_FIELD_SIZE 100 
#define N_BYTES_ID 32
#define N_BYTES_CW 32
#define N_BYTES_RW 16

#define N_HEX_TID 37 // str + null

typedef struct
{
    // BYTES
    uint8_t id[N_BYTES_ID];
    uint8_t cw[N_BYTES_CW];
    uint8_t rw[N_BYTES_RW];
    char transaction_id[N_HEX_TID];
    char rw_transaction_id[N_HEX_TID];

    uint16_t id_crc;
    uint16_t cw_crc;
    uint16_t rw_crc;

    uint8_t auth_status_1;
    uint8_t auth_status_2;

    /* Registration - assigned by Gateway (DEVICE_MODE only)
     * Valid range: 0-1000. Set to 0xFFFF when not registered. */
    uint16_t short_id;

    /* Raw frame buffer — used in GATEWAY_MODE to pass received frames to MW */
    uint8_t  raw_frame[512];
    uint16_t raw_frame_size;
}sdk_sgr_param_t;

#endif /* SDK_SGR_TYPES_H */