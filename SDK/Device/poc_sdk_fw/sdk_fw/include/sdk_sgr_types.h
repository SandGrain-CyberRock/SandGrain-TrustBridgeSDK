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
    /* data */
}sdk_sgr_param_t;

#endif /* SDK_SGR_TYPES_H */