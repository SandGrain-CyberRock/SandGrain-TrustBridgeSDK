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
    SGR_SDK_AUTH_FAILED

} sgr_sdk_status_t;    

#endif // SGR_ERRORS_H