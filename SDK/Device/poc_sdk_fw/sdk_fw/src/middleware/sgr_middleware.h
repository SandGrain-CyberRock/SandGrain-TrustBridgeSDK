#ifndef SGR_MIDDLEWARE_H
#define SGR_MIDDLEWARE_H

#include <stdint.h>
#include <stdbool.h>
#include "../../include/sdk_sgr_types.h"

/* ============================================================
 * Middleware return status
 * ============================================================ */
typedef enum
{
    SGR_MW_OK = 0,          /* Operation completed successfully */
    SGR_MW_ERROR,           /* Generic error */
    SGR_MW_INVALID_PARAM,   /* Invalid input parameter */
    SGR_MW_BUSY,            /* Middleware is busy */
    SGR_MW_TIMEOUT,         /* Operation timeout */
    SGR_MW_TOKEN_ERROR,     /* Token / crypto error */
    SGR_MW_COMM_ERROR,      /* Communication error */
    SGR_MW_AUTH_FAILED,     /* Authentication failed */
    SGR_MW_SERVER_ERROR     /* Server returned error */
} sgr_mw_status_t;

/* ============================================================
 * Token-side authentication data
 * ============================================================ */
typedef struct
{
    uint8_t id[N_BYTES_ID];
    uint8_t cw[N_BYTES_CW];
    uint8_t rw[N_BYTES_RW];

    char transaction_id[N_HEX_TID];

    uint16_t id_crc;
    uint16_t cw_crc;
    uint16_t rw_crc;
} sgr_mw_chip_auth_data_t;

/* ============================================================
 * Server-side authentication data
 * ============================================================ */
typedef struct
{
    uint8_t cw[N_BYTES_CW];
    uint8_t rw[N_BYTES_RW];       
    uint8_t rw_chip[N_BYTES_RW];  

    char transaction_id[N_HEX_TID];

    uint16_t cw_crc;
    uint16_t rw_crc;
} sgr_mw_server_auth_data_t;

/* ============================================================
 * Middleware operations
 * ============================================================ */
typedef enum
{
    SGR_MW_OP_NONE = 0,

    /* Token → Server */
    SGR_MW_OP_GET_CW,
    SGR_MW_OP_REPLY_RW,
    SGR_MW_OP_AUTH_RESULT,

    /* Server → Token / Cloud */
    SGR_MW_OP_SERVER_GET_CW,
    SGR_MW_OP_SERVER_GET_RW,
    SGR_MW_OP_AUTH_RESULT_CLOUD
} sgr_mw_operation_t;

/* ============================================================
 * Public API
 * ============================================================ */

/**
 * @brief Initialize middleware internal state.
 */
sgr_mw_status_t sgr_mw_init(void);

/**
 * @brief Start a non-blocking middleware operation.
 *
 * @param op            Operation to execute.
 * @param params        Token-side parameters.
 * @param params_server Server-side parameters (can be NULL depending on op).
 */
sgr_mw_status_t sgr_mw_start_operation(sgr_mw_operation_t op, sdk_sgr_param_t *params, sgr_mw_server_auth_data_t *params_server);

/**
 * @brief Execute one step of the middleware FSM.
 *
 * This function must be called periodically.
 */
sgr_mw_status_t sgr_mw_process(void);

/**
 * @brief Check whether the current operation has finished.
 *
 * @return true if operation is done (OK or ERROR), false otherwise.
 */
bool sgr_mw_is_done(void);

/**
 * @brief Get the final result of the operation and release middleware.
 */
sgr_mw_status_t sgr_mw_get_result(void);

#endif /* SGR_MIDDLEWARE_H */
