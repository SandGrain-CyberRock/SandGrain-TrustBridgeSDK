/* =============================================================================
 * main_gw.c
 *
 * Gateway — unified dispatcher loop.
 *
 * Initializes the SDK and then continuously polls all device channels.
 * Frame type detection and routing are handled automatically by SGR_SDK_GW_Run.
 * ============================================================================= */

#ifdef WIN32
    #include <windows.h>
#endif

#include <stdio.h>
#include "sdk_sgr_user_api.h"
#include "crypto.h"

/* Required by port_comm.c for fault injection hooks */
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

    printf("\n");
    printf("=====================================================\n");
    printf("  SGR SDK — GATEWAY\n");
    printf("=====================================================\n\n");

    printf("[INIT] Initializing GW SDK...\n");
    sgr_sdk_status_t status = SGR_SDK_Initialize();
    if (status != SGR_SDK_OK)
    {
        printf("  ERROR — SGR_SDK_Initialize failed (status = %d)\n", status);
        return -1;
    }
    printf("  OK — GW SDK initialized\n\n");

    /* ------------------------------------------------------------------
     * Select crypto chip variant (one-time, for this session).
     * ------------------------------------------------------------------ */
    g_sgr_chip_variant = SGR_CHIP_SGB;
    printf("  ✔ Using SGB\n\n");

    printf("[GW] Listening for device requests...\n");
    printf("-----------------------------------------------------\n");

    while (1)
    {
        status = SGR_SDK_GW_Run();

        if (status == SGR_SDK_BUSY)
            continue;

        if (status == SGR_SDK_OK)
            printf("\n[GW] Flow completed OK\n");
        else if (status == SGR_SDK_AUTH_FAILED)
            printf("\n[GW] Flow completed — AUTH FAILED\n");
        else if (status == SGR_SDK_COMM_ERROR)
            printf("\n[GW] Communication error (status = %d)\n", status);
        else
            printf("\n[GW] Error (status = %d)\n", status);

        printf("-----------------------------------------------------\n");
    }

    return 0;
}
