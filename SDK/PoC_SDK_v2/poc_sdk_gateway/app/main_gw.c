/* =============================================================================
 * main_gw.c
 *
 * Gateway authentication test — DEVICE↔GW↔SERVER flow.
 *
 * SDK_MODE must be GATEWAY_MODE.
 *
 * Flow:
 *   1. Initialize GW SDK
 *   2. Wait for device connection
 *   3. Run full DEVICE↔GW↔SERVER authentication
 *   4. Print session table
 * ============================================================================= */

#ifdef WIN32
    #include <windows.h>
#endif

#include <stdio.h>
#include "sdk_sgr_user_api.h"
#include "auth_db.h"

volatile int fi_attempt         = 0;
volatile int fi_enable_type0_tx = 0;
volatile int fi_enable_type1_tx = 0;
volatile int fi_enable_type2_tx = 0;
volatile int fi_recover_attempt = 0;

int main(void)
{
    #ifdef WIN32
        SetConsoleOutputCP(CP_UTF8);
        SetConsoleCP(CP_UTF8);
    #endif

    sgr_sdk_status_t status = SGR_SDK_ERROR;

    printf("\n");
    printf("=====================================================\n");
    printf("  SGR SDK — GATEWAY AUTHENTICATION TEST\n");
    printf("=====================================================\n\n");

    /* ------------------------------------------------------------------
     * Initialize GW SDK
     * ------------------------------------------------------------------ */
    printf("[INIT] Initializing GW SDK...\n");
    status = SGR_SDK_Initialize();
    if (status != SGR_SDK_OK)
    {
        printf("  ✖ SGR_SDK_Initialize failed (status = %d)\n", status);
        return -1;
    }
    printf("  ✔ GW SDK initialized OK\n\n");

    /* ------------------------------------------------------------------
     * Handle device authentication requests — loop forever
     * ------------------------------------------------------------------ */
    printf("[ AUTH ] Waiting for devices...\n");
    printf("-----------------------------------------------------\n");

    while (1)
    {
        status = SGR_SDK_GW_Handle_Device_Auth();

        if (status == SGR_SDK_OK)
            printf("\n  ✔ All devices authenticated OK\n");
        else if (status == SGR_SDK_AUTH_FAILED)
            printf("\n  ✖ One or more devices FAILED\n");
        else
            printf("\n  ✖ Authentication ERROR (status = %d)\n", status);

        auth_db_print_session();

        printf("\n[ AUTH ] Waiting for next round...\n");
        printf("-----------------------------------------------------\n");
    }

    return 0;
}