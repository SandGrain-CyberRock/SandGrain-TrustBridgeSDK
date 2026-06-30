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

    /* ------------------------------------------------------------------
     * Built-In Self-Test on the gateway's crypto chip.
     *
     * Probe for a token first via crypto_get_id(). If no token responds,
     * skip BIST silently and proceed straight to the dispatcher loop.
     * If a token is present, BIST is mandatory and a FAIL aborts startup.
     * ------------------------------------------------------------------ */
    {
        uint8_t probe_id[ID_SIZE_BYTES];
        sgr_crypto_status_t probe_status = crypto_get_id(probe_id, ID_SIZE_BYTES);

        if (probe_status != SGR_CRYPTO_OK)
        {
            printf("[BIST] No token detected — skipping self-test.\n\n");
        }
        else
        {
            sgr_sdk_bist_result_t bist  = {0};
            sgr_sdk_status_t      bist_status;

            printf("[BIST] Token detected — running crypto chip self-test...\n");
            printf("-----------------------------------------------------\n");

            bist_status = SGR_SDK_BIST(&bist);

            if (bist_status == SGR_SDK_OK || bist_status == SGR_SDK_AUTH_FAILED)
            {
                printf("[BIST] PCC      : ");
                for (int i = 0; i < 16; i++) printf("%02x", bist.pcc[i]);
                printf("\n");
                printf("[BIST] ID       : ");
                for (int i = 0; i < 16; i++) printf("%02x", bist.id[i]);
                printf("\n");
                printf("[BIST] RW       : ");
                for (int i = 0; i < 16; i++) printf("%02x", bist.rw[i]);
                printf("\n");
                printf("[BIST] EK       : ");
                for (int i = 0; i < 16; i++) printf("%02x", bist.ek[i]);
                printf("\n");
                printf("[BIST] Status   : 0x%02x  (0x50 == PASS)\n", bist.bist_byte);
            }

            printf("-----------------------------------------------------\n");

            if (bist_status == SGR_SDK_OK)
            {
                printf("  ✔ BIST PASS\n\n");
            }
            else if (bist_status == SGR_SDK_AUTH_FAILED)
            {
                printf("  ✖ BIST FAIL — aborting startup\n");
                return -1;
            }
            else if (bist_status == SGR_SDK_TOKEN_ERROR)
            {
                printf("  ✖ BIST ERROR — crypto chip transport failed (status = %d)\n", bist_status);
                return -1;
            }
            else
            {
                printf("  ✖ BIST ERROR (status = %d)\n", bist_status);
                return -1;
            }
        }
    }

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
