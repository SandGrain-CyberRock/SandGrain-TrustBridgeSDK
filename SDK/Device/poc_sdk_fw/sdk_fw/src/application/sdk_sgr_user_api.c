#include <unistd.h>
#include <stdio.h>

#include <stdio.h>  // printf
#include <unistd.h> // Sleep
#include "sdk_sgr_user_api.h"
#include "../../port/port_comm.h"
#include "../utils/crc/crc.h"
#include "../services/comm/comm.h"
#include "../services/delay/delay.h"
#include "../services/crypto/crypto.h"
#include "../middleware/sgr_middleware.h"
#include "../../include/sdk_sgr_user_api.h"

#include "../../include/sdk_sgr_errors.h"
#include "../../include/sdk_sgr_types.h"
#include "../../include/sdk_sgr_config.h"

sdk_sgr_param_t params;
sgr_mw_server_auth_data_t params_server;

volatile int attempt = 1;
//////////////// This is only fault injection ////////////////
volatile int enable_fi_comm_get_cw = 0;
/////////////////////////////////////////////////////////////
static sgr_mw_status_t sgr_mw_run_operation(sgr_mw_operation_t op, sdk_sgr_param_t *params, sgr_mw_server_auth_data_t *params_server);
static sgr_mw_status_t sgr_mw_run_operation_with_retry(sgr_mw_operation_t op, sdk_sgr_param_t *params, sgr_mw_server_auth_data_t *params_server);

sgr_sdk_status_t SGR_SDK_Initialize(void)
{
    sgr_sdk_status_t my_status_init = SGR_SDK_ERROR;
        /* ---- INIT COMM ---- */
    //if (comm_init() != COMM_OK){
    //    my_status_init = SGR_SDK_COMM_ERROR;
    //}
    /* ---- INIT MW ---- */
    if (sgr_mw_init() != SGR_MW_OK){
        my_status_init = SGR_SDK_INTERNAL_ERROR;
    }
    else{
        my_status_init = SGR_SDK_OK;
    }
    return my_status_init;
}

/* =========================================================
 * TOKEN → SERVER AUTHENTICATION
 * ========================================================= */
sgr_sdk_status_t SGR_SDK_Authentication_Token_To_Server(void)
{
    sgr_mw_status_t mw_status;



    /* =====================================================
     * STEP 1: GET CW FROM SERVER
     * ===================================================== */
    //printf("STEP 1: Get CW from Server .... \n");
    printf("=============== [APP] Step 1: Requesting Challenge Word from Server ===============\n");
    //mw_status = sgr_mw_run_operation(SGR_MW_OP_GET_CW,&params,&params_server);
    mw_status = sgr_mw_run_operation_with_retry(SGR_MW_OP_GET_CW,&params,&params_server);

    if (mw_status != SGR_MW_OK)
        return SGR_SDK_AUTH_FAILED;

    /* =====================================================
     * STEP 2: REPLY RW TO SERVER
     * ===================================================== */
    //printf("STEP 2: Reply CW to Server .... \n");
    printf("=============== [APP] Step 2: Computing and replying Response Word to Server ===============\n");
    //mw_status = sgr_mw_run_operation(SGR_MW_OP_REPLY_RW, &params, &params_server);
    mw_status = sgr_mw_run_operation_with_retry(SGR_MW_OP_REPLY_RW, &params, &params_server);

    if (mw_status != SGR_MW_OK)
        return SGR_SDK_AUTH_FAILED;

    /* =====================================================
     * STEP 3: AUTH RESULT
     * ===================================================== */
    //printf("STEP 3: AUTH RESULT .... \n");
    //printf("=============== [APP] Step 3: Processing authentication result ===============\n");
    //mw_status = sgr_mw_run_operation(SGR_MW_OP_AUTH_RESULT, &params,&params_server);
    //mw_status = sgr_mw_run_operation_with_retry(SGR_MW_OP_AUTH_RESULT, &params,&params_server);

    //if (mw_status != SGR_MW_OK)
    //    return SGR_SDK_AUTH_FAILED;

    /* =====================================================
     * ALL OK
     * ===================================================== */
    return SGR_SDK_OK;
}

/* =========================================================
 * SERVER → TOKEN AUTHENTICATION
 * ========================================================= */
sgr_sdk_status_t SGR_SDK_Authentication_Server_To_Token(void)
{
   sgr_mw_status_t mw_status;
 /* =====================================================
     * STEP 1: GET CW FROM TOKEN
     * ===================================================== */
    printf("=============== [APP] Step 1: Generating Challenge Word from Token ===============\n");
    //mw_status = sgr_mw_run_operation(SGR_MW_OP_SERVER_GET_CW, &params, &params_server);
    mw_status = sgr_mw_run_operation_with_retry(SGR_MW_OP_SERVER_GET_CW, &params, &params_server);
    if (mw_status != SGR_MW_OK)
    {
        return SGR_SDK_AUTH_FAILED;
    }

    /* =====================================================
     * STEP 2: GET RW AND COMPARE
     * ===================================================== */
    printf("=============== [APP] Step 2: Verifying Response Word (Server vs Token) ===============\n");
    //mw_status = sgr_mw_run_operation(SGR_MW_OP_SERVER_GET_RW, &params, &params_server);
    mw_status = sgr_mw_run_operation_with_retry(SGR_MW_OP_SERVER_GET_RW, &params, &params_server);

    if (mw_status != SGR_MW_OK)
    {
        return SGR_SDK_AUTH_FAILED;
    }
    
    /* =====================================================
     * STEP 3: AUTH RESULT (OPTIONAL / FUTURE)
     * ===================================================== */
    //printf("STEP 3: AUTH RESULT .... \n");

    printf("=============== [APP] Step 3: Reporting authentication result to Cloud ===============\n");
    //mw_status = sgr_mw_run_operation(SGR_MW_OP_AUTH_RESULT_CLOUD, &params, &params_server);
    mw_status = sgr_mw_run_operation_with_retry(SGR_MW_OP_AUTH_RESULT_CLOUD, &params, &params_server);

    if (mw_status != SGR_MW_OK)
    {
        return SGR_SDK_AUTH_FAILED;
    }
    return SGR_SDK_OK;
}

// Private Functions
static sgr_mw_status_t sgr_mw_run_operation(sgr_mw_operation_t op, sdk_sgr_param_t *params, sgr_mw_server_auth_data_t *params_server)
{
    //Initialize Communication 
    //if (comm_init() != COMM_OK){
    //    return SGR_MW_COMM_ERROR;
    //}

    if (sgr_mw_start_operation(op, params, params_server) != SGR_MW_OK)
        return SGR_MW_ERROR;

    while (!sgr_mw_is_done())
    {
        sgr_mw_process();
        //usleep(100 * 1000);   // tick
        delay_ms(100);
    }

    return sgr_mw_get_result();
}

static sgr_mw_status_t sgr_mw_run_operation_with_retry(sgr_mw_operation_t op, sdk_sgr_param_t *params, sgr_mw_server_auth_data_t *params_server)
{
    sgr_mw_status_t status = SGR_MW_ERROR;
    static uint8_t attempt_total = 0;

    if(op == SGR_MW_OP_GET_CW){
        enable_fi_comm_get_cw = 1;
    }
    else{
        enable_fi_comm_get_cw = 0;
    }

    if(MAX_RETRIES == 0){
        attempt_total = 1;
    }
    else{
        attempt_total = 1 + MAX_RETRIES;
    }

    for (attempt = 1; attempt <= attempt_total; attempt++)
    {
        printf("[APP] Attempt %d/%d\n", attempt, attempt_total);

        
        status = sgr_mw_run_operation(op, params, params_server);

        if (status == SGR_MW_OK)
            return SGR_MW_OK;

        /* Optional: small delay */
        //usleep(200 * 1000);
        delay_ms(200);
    }

    return status;
}
