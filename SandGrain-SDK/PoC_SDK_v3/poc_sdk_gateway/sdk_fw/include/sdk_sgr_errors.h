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
    SGR_SDK_BUSY                /* Dispatcher: no channel has data yet - call again */,

    /* CyberRock authenticated the chip but no tenant has claimed it yet.
     * Appended so existing values keep their numbers. Not a failure and not
     * transient: the claim is asynchronous (cloud -> BE -> tenant-api), so the
     * gateway must report it and let the device re-auth, never retry it in a
     * tight loop - a retry just re-fetches CLAIM_TOKEN. Named to match the
     * device SDK, which already used this spelling. */
    SGR_SDK_CLAIM_TOKEN_READY

} sgr_sdk_status_t;    

#endif // SGR_ERRORS_H