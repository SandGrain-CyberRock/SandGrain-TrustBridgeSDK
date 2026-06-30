//#define FAULT_INJECTION_DEFINE
#ifdef WIN32
    #include <windows.h>
#endif

#include <stdio.h>
#include <stdlib.h>
#include "../include/sdk_sgr_user_api.h"
#include "../include/fault_injection.h"

/* -------------------------------------------------
 * Helpers
 * ------------------------------------------------- */
static void reset_fault_injection(void)
{
    g_fault_injection_enable_comm_tx = 0;
    g_fault_injection_enable_comm_rx = 0;
    g_fault_injection_enable_spi_tx  = 0;
    g_fault_injection_enable_spi_rx  = 0;
}

static void print_menu(void)
{
    printf("\n============================================================\n");
    printf("                 SGR SDK DEMO MENU\n");
    printf("============================================================\n");
    printf(" 1) Normal flow (no faults)\n");
    printf(" 2) COMM TX error\n");
    printf(" 3) COMM RX error\n");
    printf(" 4) SPI TX error\n");
    printf(" 5) SPI RX error\n");
    printf(" 0) Exit\n");
    printf("------------------------------------------------------------\n");
    printf(" Select option: ");
}

/* -------------------------------------------------
 * Run full authentication demo
 * ------------------------------------------------- */
static void run_demo(void)
{
    sgr_sdk_status_t status;

    /* ================= PHASE 1 ================= */
    printf("\n\n**************************** [MAIN] Authenticating TOKEN → SERVER... ****************************\n");

    status = SGR_SDK_Authentication_Token_To_Server();
    if (status != SGR_SDK_OK)
    {
        printf("[MAIN] TOKEN → SERVER AUTH FAILED (status=%d)\n", status);
        return;
    }

    printf("[MAIN] TOKEN → SERVER AUTH OK\n");

    ///* ================= PHASE 2 ================= */
    printf("\n\n**************************** [MAIN] Authenticating SERVER → TOKEN... ****************************\n");

    status = SGR_SDK_Authentication_Server_To_Token();
    if (status != SGR_SDK_OK)
    {
        printf("[MAIN] SERVER → TOKEN AUTH FAILED (status=%d)\n", status);
        return;
    }

    printf("[MAIN] SERVER → TOKEN AUTH OK\n");

    printf("\n[MAIN] DEMO FLOW COMPLETED SUCCESSFULLY\n");
}

/* -------------------------------------------------
 * Main
 * ------------------------------------------------- */
int main(void)
{
    #ifdef WIN32
        // Forzar codepage UTF-8 en la consola de Windows
        SetConsoleOutputCP(CP_UTF8);
        SetConsoleCP(CP_UTF8);
    #endif

    int option = -1;
    sgr_sdk_status_t status;

    /* ---- SDK INIT ---- */
    status = SGR_SDK_Initialize();
    
    if (status != SGR_SDK_OK)
    {
        printf("[MAIN] SDK initialization failed (status=%d)\n", status);
        return -1;
    }

    while (1)
    {
        print_menu();

        if (scanf("%d", &option) != 1)
        {
            while (getchar() != '\n'); // flush input
            continue;
        }

        reset_fault_injection();

        switch (option)
        {
            case 1:
                printf("\n[MAIN] Running NORMAL flow (no faults)\n");
                run_demo();
                break;

            case 2:
                printf("\n[MAIN] Injecting COMM TX error\n");
                g_fault_injection_enable_comm_tx = 1;
                run_demo();
                break;

            case 3:
                printf("\n[MAIN] Injecting COMM RX error\n");
                g_fault_injection_enable_comm_rx = 1;
                run_demo();
                break;

            case 4:
                printf("\n[MAIN] Injecting SPI TX error\n");
                g_fault_injection_enable_spi_tx = 1;
                run_demo();
                break;

            case 5:
                printf("\n[MAIN] Injecting SPI RX error\n");
                g_fault_injection_enable_spi_rx = 1;
                run_demo();
                break;

            case 0:
                printf("\n[MAIN] Exiting demo\n");
                return 0;

            default:
                printf("\n[MAIN] Invalid option\n");
                break;
        }
    }

    return 0;
}
