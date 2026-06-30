/* =============================================================================
 * main_device.c
 *
 * Device authentication test — DEVICE↔GW↔SERVER flow.
 *
 * SDK_MODE must be DEVICE_MODE.
 *
 * Flow:
 *   1. Initialize Device SDK
 *   2. Select test option (normal / fault injection)
 *   3. Send auth request to GW
 *   4. Receive CW, compute RW on crypto chip
 *   5. Send CW echo + RW to GW
 *   6. Receive AUT_OK or AUT_NOK
 * ============================================================================= */

#ifdef WIN32
    #include <windows.h>
#endif

#include <stdio.h>
#include "sdk_sgr_user_api.h"
#include "fi_device.h"

volatile int attempt               = 0;
volatile int enable_fi_comm_get_cw = 0;

int main(void)
{
#ifdef WIN32
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif

    sgr_sdk_status_t status = SGR_SDK_ERROR;
    int option = 0;

    printf("\n");
    printf("=====================================================\n");
    printf("  SGR SDK — DEVICE AUTHENTICATION TEST\n");
    printf("=====================================================\n\n");

    /* ------------------------------------------------------------------
     * Initialize Device SDK
     * ------------------------------------------------------------------ */
    printf("[INIT] Initializing Device SDK...\n");
    status = SGR_SDK_Initialize();
    if (status != SGR_SDK_OK)
    {
        printf("  ✖ SGR_SDK_Initialize failed (status = %d)\n", status);
        return -1;
    }
    printf("  ✔ Device SDK initialized OK\n\n");

    /* ------------------------------------------------------------------
     * Menu
     * ------------------------------------------------------------------ */
    printf("=====================================================\n");
    printf("  Select test option:\n");
    printf("  1. Normal flow (no fault injection)\n");
    printf("  2. Fault injection (CW: 2 bits, CW echo: 1 bit, RW: 1 bit)\n");
    printf("  3. Fault injection — Error Management stress (CW: 3 bits, CW echo: 2 bits)\n");
    printf("=====================================================\n");
    printf("  Option: ");
    scanf("%d", &option);
    printf("\n");

    switch (option)
    {
        case 1:
            fi_enable_cw      = 0;
            fi_enable_cw_echo = 0;
            fi_enable_rw      = 0;
            break;
        case 2:
            fi_enable_cw      = 1;
            fi_enable_cw_echo = 1;
            fi_enable_rw      = 1;
            break;
        case 3:
            fi_enable_cw      = 0;
            fi_enable_cw_echo = 0;
            fi_enable_rw      = 0;
            fi_enable_option3 = 1;
            break;
        default:
            printf("  ✖ Invalid option\n");
            return -1;
    }

    /* ------------------------------------------------------------------
     * Authenticate via GW
     * ------------------------------------------------------------------ */
    printf("[ AUTH ] Authenticating via Gateway...\n");
    printf("-----------------------------------------------------\n");

    status = SGR_SDK_Authenticate_Via_GW();

    if (status == SGR_SDK_OK)
        printf("\n  ✔ Authentication OK\n");
    else if (status == SGR_SDK_AUTH_FAILED)
        printf("\n  ✖ Authentication FAILED\n");
    else
        printf("\n  ✖ Authentication ERROR (status = %d)\n", status);

    printf("\n=====================================================\n");
    printf("  DEVICE TEST COMPLETE\n");
    printf("=====================================================\n\n");

    return (status == SGR_SDK_OK) ? 0 : -1;
}