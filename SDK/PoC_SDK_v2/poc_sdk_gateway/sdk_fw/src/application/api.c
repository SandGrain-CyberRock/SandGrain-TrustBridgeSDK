/* =============================================================================
 * sdk_sgr_user_api.c
 *
 * Application Layer — implementation
 *
 * SDK_MODE controls which functions are compiled:
 *   DEVICE_MODE  — Device authenticates via Gateway
 *   GATEWAY_MODE — Gateway authenticates itself + handles device requests
 * ============================================================================= */

#include <string.h>
#include <stdio.h>
#include "../middleware/sgr_mw.h"
#include "../../include/sdk_sgr_errors.h"
#include "../../include/sdk_sgr_types.h"
#include "../../include/sdk_sgr_config.h"

#if SDK_MODE == GATEWAY_MODE
    #include "../services/devices/device_service.h"
    #include "../../port/port_comm_device.h"
    #include "../services/database/auth_db.h"
#endif

/* =============================================================================
 * SGR_SDK_Initialize
 * ============================================================================= */
sgr_sdk_status_t SGR_SDK_Initialize(void)
{
    sgr_sdk_status_t sdk_status = SGR_SDK_ERROR;

    #if SDK_MODE == GATEWAY_MODE

        auth_db_init();

        for (int i = 0; i < auth_db_whitelist_count; i++)
        {
            uint32_t crc32 = 0;
            auth_db_register(auth_db_whitelist[i], &crc32);
        }

        if (sgr_mw_init() == SGR_MW_OK)
        {
            sdk_status = SGR_SDK_OK;
        }
        else
        {
            sdk_status = SGR_SDK_ERROR;
        }
        
    #else

        if (sgr_mw_init() == SGR_MW_OK)
        {
            sdk_status = SGR_SDK_OK;
        }
        else
        {
            sdk_status = SGR_SDK_ERROR;
        }

    #endif

        return sdk_status;
}

/* =============================================================================
 * DEVICE MODE
 * ============================================================================= */
#if SDK_MODE == DEVICE_MODE

sgr_sdk_status_t SGR_SDK_Authenticate_Via_GW(void)
{
    sgr_sdk_status_t sdk_status = SGR_SDK_ERROR;
    sgr_mw_status_t  mw_status  = SGR_MW_BUSY;

    do
    {
        mw_status = sgr_mw_authenticate_via_gw();
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)
    {
        sdk_status = SGR_SDK_OK;
    }
    else if (mw_status == SGR_MW_AUTH_FAILED)
    {
        sdk_status = SGR_SDK_AUTH_FAILED;
    }
    else if (mw_status == SGR_MW_COMM_ERROR)
    {
        sdk_status = SGR_SDK_COMM_ERROR;
    }
    else
    {
        sdk_status = SGR_SDK_ERROR;
    }

    return sdk_status;
}

#endif /* SDK_MODE == DEVICE_MODE */

/* =============================================================================
 * GATEWAY MODE
 * ============================================================================= */
#if SDK_MODE == GATEWAY_MODE

sgr_sdk_status_t SGR_SDK_Authentication_Token_To_Server(void)
{
    sgr_sdk_status_t sdk_status = SGR_SDK_ERROR;
    sgr_mw_status_t  mw_status  = SGR_MW_BUSY;

    do
    {
        mw_status = sgr_mw_authentication_token_to_server();
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)
    {
        sdk_status = SGR_SDK_OK;
    }
    else
    {
        sdk_status = SGR_SDK_ERROR;
    }

    return sdk_status;
}

sgr_sdk_status_t SGR_SDK_Authentication_Server_To_Token(void)
{
    sgr_sdk_status_t sdk_status = SGR_SDK_ERROR;
    sgr_mw_status_t  mw_status  = SGR_MW_BUSY;

    do
    {
        mw_status = sgr_mw_authentication_server_to_token();
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)
    {
        sdk_status = SGR_SDK_OK;
    }
    else if (mw_status == SGR_MW_COMM_ERROR)
    {
        sdk_status = SGR_SDK_COMM_ERROR;
    }
    else if (mw_status == SGR_MW_AUTH_FAILED)
    {
        sdk_status = SGR_SDK_AUTH_FAILED;
    }
    else
    {
        sdk_status = SGR_SDK_ERROR;
    }

    return sdk_status;
}

/*sgr_sdk_status_t SGR_SDK_GW_Handle_Device_Auth(void)
{
    sgr_sdk_status_t   sdk_status = SGR_SDK_ERROR;
    sgr_mw_status_t mw_status  = SGR_MW_BUSY;

    do
    {
        mw_status = sgr_mw_gw_authenticate_device();
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)
    {
        sdk_status = SGR_SDK_OK;
    }
    else if (mw_status == SGR_MW_AUTH_FAILED)
    {
        sdk_status = SGR_SDK_AUTH_FAILED;
    }
    else if (mw_status == SGR_MW_COMM_ERROR)
    {
        sdk_status = SGR_SDK_COMM_ERROR;
    }
    else
    {
        sdk_status = SGR_SDK_ERROR;
    }

    return sdk_status;
}*/

sgr_sdk_status_t SGR_SDK_GW_Handle_Device_Auth(void)
{
    sgr_mw_status_t results[MAX_DEVICES];
    bool            done[MAX_DEVICES];

    for (int i = 0; i < MAX_DEVICES; i++)
    {
        results[i] = SGR_MW_BUSY;
        done[i]    = false;
    }

    //bool all_done = false;
    bool any_done = false;
    while (!any_done)
    {
        //all_done = true;
        for (int i = 0; i < MAX_DEVICES; i++)
        {
            //if (!done[i])
            //{
                results[i] = sgr_mw_gw_authenticate_device(i);
                
              //  if (results[i] != SGR_MW_BUSY)
                //    done[i] = true;
                //    any_done = true;
                //else
                //    all_done = false;
            //}
        }
    }

    /*printf("\n[GW] ── Auth Results ──────────────────────\n");
    printf("[GW]  Channel │ Result\n");
    printf("[GW] ─────────┼──────────────────────────────\n");
    for (int i = 0; i < MAX_DEVICES; i++)
    {
        const char *result_str;
        switch (results[i])
        {
            case SGR_MW_OK:          result_str = "AUT_OK  ✔"; break;
            case SGR_MW_AUTH_FAILED: result_str = "AUT_NOK ✖"; break;
            case SGR_MW_COMM_ERROR:  result_str = "COMM_ERROR"; break;
            default:                 result_str = "ERROR";      break;
        }
        printf("[GW]  CH%-6d │ %s\n", i, result_str);
    }
    printf("[GW] ──────────────────────────────────────\n\n");*/

    /* return OK only if all channels succeeded */
    /*for (int i = 0; i < MAX_DEVICES; i++)
    {
        if (results[i] == SGR_MW_AUTH_FAILED)
            return SGR_SDK_AUTH_FAILED;
        if (results[i] == SGR_MW_COMM_ERROR)
            return SGR_SDK_COMM_ERROR;
        if (results[i] != SGR_MW_OK)
            return SGR_SDK_ERROR;
    }*/

    return SGR_SDK_OK;
}

#endif /* SDK_MODE == GATEWAY_MODE */