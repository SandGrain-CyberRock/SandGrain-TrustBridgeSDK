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
#include "../../include/sdk_sgr_user_api.h"

#if SDK_MODE == DEVICE_MODE
    #include "../services/crypto/crypto.h"
#endif

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

sgr_sdk_status_t SGR_SDK_BIST(sgr_sdk_bist_result_t *result)
{
    sgr_crypto_bist_result_t  chip_result;
    sgr_crypto_status_t       crypto_status;

    memset(&chip_result, 0, sizeof(chip_result));

    crypto_status = crypto_bist(&chip_result);

    /* Forward chip output to caller (if requested) regardless of pass/fail */
    if (result != NULL)
    {
        memcpy(result->pcc, chip_result.pcc, sizeof(result->pcc));
        memcpy(result->id,  chip_result.id,  sizeof(result->id));
        memcpy(result->rw,  chip_result.rw,  sizeof(result->rw));
        memcpy(result->ek,  chip_result.ek,  sizeof(result->ek));
        result->bist_byte = chip_result.bist_byte;
        result->passed    = chip_result.passed;
    }

    if (crypto_status == SGR_CRYPTO_INVALID_PARAM)
        return SGR_SDK_INVALID_PARAM;
    if (crypto_status == SGR_CRYPTO_HW_ERROR)
        return SGR_SDK_TOKEN_ERROR;
    if (crypto_status != SGR_CRYPTO_OK)
        return SGR_SDK_ERROR;

    return chip_result.passed ? SGR_SDK_OK : SGR_SDK_AUTH_FAILED;
}

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
    else if (mw_status == SGR_MW_MUTUAL_AUTH_FAILED)
    {
        sdk_status = SGR_SDK_MUTUAL_AUTH_FAILED;
    }
    else if (mw_status == SGR_MW_CLAIM_TOKEN)
    {
        sdk_status = SGR_SDK_CLAIM_TOKEN_READY;
    }
    else if (mw_status == SGR_MW_COMM_ERROR)
    {
        sdk_status = SGR_SDK_COMM_ERROR;
    }
    else if (mw_status == SGR_MW_TOKEN_ERROR)
    {
        sdk_status = SGR_SDK_TOKEN_ERROR;
    }
    else
    {
        sdk_status = SGR_SDK_ERROR;
    }

    return sdk_status;
}

sgr_sdk_status_t SGR_SDK_Verification_FW(const uint8_t *fw_data,
                                          uint32_t       fw_size,
                                          const uint8_t *fw_rw)
{
    sgr_sdk_status_t sdk_status = SGR_SDK_ERROR;
    sgr_mw_status_t  mw_status  = SGR_MW_BUSY;

    if (!fw_data || fw_size == 0 || !fw_rw)
        return SGR_SDK_INVALID_PARAM;

    do
    {
        mw_status = sgr_mw_verify_fw(fw_data, fw_size, fw_rw);
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)
        sdk_status = SGR_SDK_OK;
    else if (mw_status == SGR_MW_AUTH_FAILED)
        sdk_status = SGR_SDK_AUTH_FAILED;
    else if (mw_status == SGR_MW_COMM_ERROR)
        sdk_status = SGR_SDK_COMM_ERROR;
    else if (mw_status == SGR_MW_TOKEN_ERROR)
        sdk_status = SGR_SDK_TOKEN_ERROR;
    else
        sdk_status = SGR_SDK_ERROR;

    return sdk_status;
}

sgr_sdk_status_t SGR_SDK_Installation(void)
{
    sgr_sdk_status_t sdk_status = SGR_SDK_ERROR;
    sgr_mw_status_t  mw_status  = SGR_MW_BUSY;

    do
    {
        mw_status = sgr_mw_installation();
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)
        sdk_status = SGR_SDK_OK;
    else if (mw_status == SGR_MW_AUTH_FAILED)
        sdk_status = SGR_SDK_AUTH_FAILED;
    else if (mw_status == SGR_MW_COMM_ERROR)
        sdk_status = SGR_SDK_COMM_ERROR;
    else if (mw_status == SGR_MW_TOKEN_ERROR)
        sdk_status = SGR_SDK_TOKEN_ERROR;
    else
        sdk_status = SGR_SDK_ERROR;

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

sgr_sdk_status_t SGR_SDK_GW_Handle_FW_Verification(void)
{
    sgr_sdk_status_t sdk_status = SGR_SDK_ERROR;
    sgr_mw_status_t  mw_status  = SGR_MW_BUSY;

    do
    {
        mw_status = sgr_mw_gw_receive_fw_verification(0);
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)
        sdk_status = SGR_SDK_OK;
    else if (mw_status == SGR_MW_AUTH_FAILED)
        sdk_status = SGR_SDK_AUTH_FAILED;
    else if (mw_status == SGR_MW_COMM_ERROR)
        sdk_status = SGR_SDK_COMM_ERROR;
    else
        sdk_status = SGR_SDK_ERROR;

    return sdk_status;
}

sgr_sdk_status_t SGR_SDK_GW_Handle_Installation(void)
{
    sgr_mw_status_t mw_status = SGR_MW_BUSY;

    /* Step 1 — wait for FW Verification result from device (type "6") */
    do
    {
        mw_status = sgr_mw_gw_receive_fw_verification(0);
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status != SGR_MW_OK)
    {
        if (mw_status == SGR_MW_AUTH_FAILED) return SGR_SDK_AUTH_FAILED;
        if (mw_status == SGR_MW_COMM_ERROR)  return SGR_SDK_COMM_ERROR;
        return SGR_SDK_ERROR;
    }

    /* Step 2 — wait for Installation request from device (type "7") */
    mw_status = SGR_MW_BUSY;
    do
    {
        mw_status = sgr_mw_gw_handle_installation(0);
    }
    while (mw_status == SGR_MW_BUSY);

    if (mw_status == SGR_MW_OK)          return SGR_SDK_OK;
    if (mw_status == SGR_MW_AUTH_FAILED) return SGR_SDK_AUTH_FAILED;
    if (mw_status == SGR_MW_COMM_ERROR)  return SGR_SDK_COMM_ERROR;
    return SGR_SDK_ERROR;
}

sgr_sdk_status_t SGR_SDK_GW_Handle_Device_Auth(void)
{
    sgr_mw_status_t results[MAX_DEVICES];
    bool            done[MAX_DEVICES];

    for (int i = 0; i < MAX_DEVICES; i++)
    {
        results[i] = SGR_MW_BUSY;
        done[i]    = false;
    }

    bool any_done = false;
    while (!any_done)
    {
        for (int i = 0; i < MAX_DEVICES; i++)
        {
            if (!done[i])
            {
                results[i] = sgr_mw_gw_authenticate_device(i);
                if (results[i] != SGR_MW_BUSY)
                {
                    done[i]  = true;
                    any_done = true;
                }
            }
        }
    }

    for (int i = 0; i < MAX_DEVICES; i++)
    {
        if (done[i])
        {
            if (results[i] == SGR_MW_AUTH_FAILED)
                return SGR_SDK_AUTH_FAILED;
            if (results[i] == SGR_MW_COMM_ERROR)
                return SGR_SDK_COMM_ERROR;
            if (results[i] != SGR_MW_OK)
                return SGR_SDK_ERROR;
            return SGR_SDK_OK;
        }
    }

    return SGR_SDK_OK;
}

sgr_sdk_status_t SGR_SDK_GW_Run(void)
{
    sgr_mw_status_t result     = SGR_MW_BUSY;
    bool            any_done   = false;

    for (int i = 0; i < MAX_DEVICES; i++)
    {
        sgr_mw_status_t r = sgr_mw_gw_run(i);
        if (r != SGR_MW_BUSY)
        {
            result   = r;
            any_done = true;
        }
    }

    if (!any_done)
        return SGR_SDK_BUSY;

    if (result == SGR_MW_OK)          return SGR_SDK_OK;
    if (result == SGR_MW_AUTH_FAILED) return SGR_SDK_AUTH_FAILED;
    if (result == SGR_MW_COMM_ERROR)  return SGR_SDK_COMM_ERROR;
    return SGR_SDK_ERROR;
}

#endif /* SDK_MODE == GATEWAY_MODE */