#ifndef SGR_ERRORS_H
#define SGR_ERRORS_H

typedef enum
{
    /* Success */
    SGR_SDK_OK = 0,

    /* Generic errors */
    SGR_SDK_ERROR,
    SGR_SDK_INVALID_PARAM,
    SGR_SDK_NOT_READY,
    SGR_SDK_TOKEN_ERROR,

    /* Data integrity */
    SGR_SDK_CRC_ERROR,

    /* Communication */
    SGR_SDK_COMM_ERROR,
    SGR_SDK_TIMEOUT,

    SGR_SDK_INTERNAL_ERROR,

    /* Authentication / flow */
    SGR_SDK_AUTH_FAILED,
    SGR_SDK_MUTUAL_AUTH_FAILED,    /* Phase-2 (cloud→device) HRW mismatch        */
    SGR_SDK_CLAIM_TOKEN_READY,     /* CR returned CLAIM_TOKEN — device awaits
                                      tenant claim. ID in g_sgr_last_claim_token_id */

    /* Registration */
    SGR_SDK_NOT_REGISTERED,        /* Device not registered in Gateway           */
    SGR_SDK_REGISTRATION_FAILED,   /* Registration attempt failed                */

    /* Gateway */
    SGR_SDK_NO_DATA,            /* No data available from DEVICE */
    SGR_SDK_BUSY                /* Dispatcher: no channel has data yet — call again */

} sgr_sdk_status_t;    

#endif // SGR_ERRORS_H