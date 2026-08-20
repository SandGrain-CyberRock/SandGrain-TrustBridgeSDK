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

    /* Registration */
    SGR_SDK_NOT_REGISTERED,        /* Device not registered in Gateway           */
    SGR_SDK_REGISTRATION_FAILED,   /* Registration attempt failed                */

    /* Gateway */
    SGR_SDK_NO_DATA,            /* No data available from DEVICE */
    SGR_SDK_BUSY,               /* Dispatcher: no channel has data yet - call again */

    /* Claim
     * Appended at the END on purpose: every value above keeps its number, so
     * this cannot renumber a status any existing caller already compares. */
    SGR_SDK_CLAIM_TOKEN_READY   /* CR authenticated the chip but no tenant has
                                 * claimed it yet. NOT a failure and NOT worth
                                 * retrying - the claim settles on the BE side,
                                 * after which a fresh auth run gets a verdict.
                                 * ID in g_sgr_last_claim_token_id. Same name as
                                 * the device SDK's status for this case. */

} sgr_sdk_status_t;    

#endif // SGR_ERRORS_H