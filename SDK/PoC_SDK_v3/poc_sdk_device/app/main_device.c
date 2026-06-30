/* =============================================================================
 * main_device.c
 *
 * Device test — DEVICE↔GW↔SERVER flow.
 *
 * SDK_MODE must be DEVICE_MODE.
 *
 * BIST flow (option 0):
 *   1. Send BIST command (0xFF000000 + 68 zero bytes) to crypto chip
 *   2. Receive 72-byte response (PCC, ID, RW, EK, BIST status byte)
 *   3. Report PASS if BIST byte == 0x50, otherwise FAIL
 *
 * Authentication flow (full mutual, Phase 1 + Phase 2):
 *   Phase 1 (token → cloud, via GW):
 *     1. Initialize Device SDK
 *     2. Select test option (normal / fault injection)
 *     3. Send auth request to GW
 *     4. Receive CW, compute RW on crypto chip
 *     5. Send CW echo + RW to GW
 *     6. Receive AUT_OK or AUT_NOK
 *   Phase 2 (cloud → device verification, only on AUT_OK):
 *     7. Build HCW = RW || RW (32 bytes)
 *     8. Crypto chip computes HRW_token from HCW
 *     9. Send HCW to GW (frame "8"); GW asks cloud (requestRW) for HRW_cloud
 *    10. Compare HRW_token == HRW_cloud locally → MUTUAL_AUTH_OK / NOK
 *
 * FW Verification flow (option 4 or 5):
 *   1. Compute SHA-256 of simulated FW content
 *   2. Use hash as CW → get RW from crypto chip
 *   3. Compare computed RW with embedded RW
 *   4. Send FW_OK or FW_NOK to GW (frame type "6")
 *   5. RW_verify is saved internally for use by Installation
 *
 * Installation flow (option 6):
 *   Prerequisites: run option 4 first (FW_OK saves RW_verify internally)
 *   1. CW_install = RW_verify || RW_verify (32 bytes)
 *   2. Get RW_install from crypto chip
 *   3. Send type "7" frame to GW
 *   4. Receive INSTALL_OK or INSTALL_NOK from GW
 * ============================================================================= */

#ifdef WIN32
    #include <windows.h>
#endif

#include <stdio.h>
#include <string.h>
#include "sdk_sgr_user_api.h"
#include "fi_device.h"
#include "sha256.h"
#include "crypto.h"

volatile int attempt               = 0;
volatile int enable_fi_comm_get_cw = 0;

/* ──────────────────────────────────────────────────────────────────────────────
 * Simulated firmware content (represents a FW image stored in alternate flash).
 * In a real system this would be read from the secondary flash partition.
 * ────────────────────────────────────────────────────────────────────────────── */
static const uint8_t test_fw_data[] = {
    0x7F, 0x45, 0x4C, 0x46, 0x01, 0x01, 0x01, 0x00,  /* ELF-like header */
    0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE,
    0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
    0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00,
    0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
    0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10,
    0xA5, 0x5A, 0xA5, 0x5A, 0xA5, 0x5A, 0xA5, 0x5A,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77
};
static const uint32_t test_fw_size = sizeof(test_fw_data);

/* ──────────────────────────────────────────────────────────────────────────────
 * run_bist
 *
 * Runs SGR_SDK_BIST and prints the parsed crypto-chip response:
 *   PCC, ID, RW, EK and the raw BIST status byte (0x50 == PASS).
 * ────────────────────────────────────────────────────────────────────────────── */
static int run_bist(void)
{
    sgr_sdk_bist_result_t bist = {0};
    sgr_sdk_status_t      status;

    printf("[ BIST ] Sending BIST command to crypto chip...\n");
    printf("-----------------------------------------------------\n");

    status = SGR_SDK_BIST(&bist);

    printf("-----------------------------------------------------\n");

    if (status == SGR_SDK_TOKEN_ERROR)
    {
        printf("  ✖ BIST ERROR — crypto chip transport failed (status = %d)\n", status);
        return -1;
    }
    if (status == SGR_SDK_INVALID_PARAM)
    {
        printf("  ✖ BIST ERROR — invalid parameter (status = %d)\n", status);
        return -1;
    }
    if (status != SGR_SDK_OK && status != SGR_SDK_AUTH_FAILED)
    {
        printf("  ✖ BIST ERROR (status = %d)\n", status);
        return -1;
    }

    printf("[ BIST ] PCC      : ");
    for (int i = 0; i < 16; i++) printf("%02x", bist.pcc[i]);
    printf("\n");

    printf("[ BIST ] ID       : ");
    for (int i = 0; i < 16; i++) printf("%02x", bist.id[i]);
    printf("\n");

    printf("[ BIST ] RW       : ");
    for (int i = 0; i < 16; i++) printf("%02x", bist.rw[i]);
    printf("\n");

    printf("[ BIST ] EK       : ");
    for (int i = 0; i < 16; i++) printf("%02x", bist.ek[i]);
    printf("\n");

    printf("[ BIST ] Status   : 0x%02x  (0x50 == PASS)\n", bist.bist_byte);

    if (status == SGR_SDK_OK)
    {
        printf("  ✔ BIST PASS\n");
        return 0;
    }
    printf("  ✖ BIST FAIL\n");
    return -1;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * run_fw_verification
 *
 * Demonstrates both OK and NOK cases:
 *
 *  CASE 1 (use_valid_rw = 1):
 *    Pre-computes the correct RW using SHA-256 + crypto chip, then passes it
 *    to SGR_SDK_Verification_FW → simulates a legitimately signed FW image.
 *    Expected: SGR_SDK_OK   → GW receives FW_OK.
 *
 *  CASE 2 (use_valid_rw = 0):
 *    Passes an all-zero RW (tampered / unsigned FW image).
 *    Expected: SGR_SDK_AUTH_FAILED → GW receives FW_NOK.
 * ────────────────────────────────────────────────────────────────────────────── */
static int run_fw_verification(int use_valid_rw)
{
    sgr_sdk_status_t status         = SGR_SDK_ERROR;
    uint8_t          fw_hash[32]    = {0};
    uint8_t          fw_rw_valid[16] = {0};
    uint8_t          fw_rw_wrong[16] = {0};  /* all zeros → intentionally wrong */
    const uint8_t   *fw_rw_to_use   = NULL;

    printf("[ FW ] Simulated FW size : %u bytes\n", (unsigned)test_fw_size);

    /* ------------------------------------------------------------------
     * Pre-compute the valid RW for the test FW:
     *   SHA-256(fw_data) → hash (32 bytes, used as CW)
     *   crypto_get_rw(hash) → fw_rw_valid (16 bytes)
     *
     * This replicates what the signing authority does when building
     * the FW image — the result is the RW that gets embedded at the end.
     * ------------------------------------------------------------------ */
    printf("[ FW ] Computing SHA-256 of test FW...\n");
    sha256_compute(test_fw_data, test_fw_size, fw_hash);

    printf("[ FW ] SHA-256: ");
    for (int i = 0; i < 32; i++) printf("%02x", fw_hash[i]);
    printf("\n");

    printf("[ FW ] Obtaining expected RW from crypto chip...\n");
    if (crypto_get_rw(fw_hash, sizeof(fw_hash),
                      fw_rw_valid, sizeof(fw_rw_valid),
                      NULL, 0,
                      SGR_CRYPTO_MODE_HOST_AUTH) != SGR_CRYPTO_OK)
    {
        printf("  ✖ crypto_get_rw failed — is the crypto chip connected?\n");
        return -1;
    }

    printf("[ FW ] Expected RW : ");
    for (int i = 0; i < 16; i++) printf("%02x", fw_rw_valid[i]);
    printf("\n");

    /* ------------------------------------------------------------------
     * Select which RW to pass based on the test case
     * ------------------------------------------------------------------ */
    if (use_valid_rw)
    {
        fw_rw_to_use = fw_rw_valid;
        printf("[ FW ] Using CORRECT RW (valid FW image)\n");
    }
    else
    {
        fw_rw_to_use = fw_rw_wrong;
        printf("[ FW ] Using WRONG RW  (tampered / unsigned FW image)\n");
        printf("[ FW ] Wrong RW    : ");
        for (int i = 0; i < 16; i++) printf("%02x", fw_rw_wrong[i]);
        printf("\n");
    }

    /* ------------------------------------------------------------------
     * Call SGR_SDK_Verification_FW
     * ------------------------------------------------------------------ */
    printf("\n[ FW ] Running SGR_SDK_Verification_FW...\n");
    printf("-----------------------------------------------------\n");

    status = SGR_SDK_Verification_FW(test_fw_data, test_fw_size, fw_rw_to_use);

    printf("-----------------------------------------------------\n");
    if (status == SGR_SDK_OK)
        printf("  ✔ FW Verification OK  — FW_OK  sent to GW\n");
    else if (status == SGR_SDK_AUTH_FAILED)
        printf("  ✖ FW Verification NOK — FW_NOK sent to GW\n");
    else if (status == SGR_SDK_COMM_ERROR)
        printf("  ✖ FW Verification ERROR — GW communication failed (status = %d)\n", status);
    else if (status == SGR_SDK_TOKEN_ERROR)
        printf("  ✖ FW Verification ERROR — crypto chip failed (status = %d)\n", status);
    else
        printf("  ✖ FW Verification ERROR (status = %d)\n", status);

    return (status == SGR_SDK_OK) ? 0 : -1;
}

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
    printf("  SGR SDK — DEVICE TEST\n");
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
     * Select crypto chip variant (one-time, for this session).
     * ------------------------------------------------------------------ */
    
    g_sgr_chip_variant = SGR_CHIP_SGB;
    printf("  ✔ Using SGB\n\n");

    /* ------------------------------------------------------------------
     * Menu loop — run multiple operations in the same session.
     * Typical Installation sequence: option 4 → option 6.
     * ------------------------------------------------------------------ */
    while (1)
    {
        printf("=====================================================\n");
        printf("  Select test option:\n");
        printf("  --- BIST ---\n");
        printf("  0. BIST — Built-In Self-Test (crypto chip)\n");
        printf("  --- Authentication ---\n");
        printf("  1. Mutual Authentication (Phase 1 + Phase 2, no fault injection)\n");
        printf("  2. Fault injection (CW: 2 bits, CW echo: 1 bit, RW: 1 bit)\n");
        printf("  3. Fault injection — Error Management stress (CW: 3 bits, CW echo: 2 bits)\n");
        printf("  --- FW Verification ---\n");
        printf("  4. FW Verification — correct RW  (expect FW_OK, saves RW_verify)\n");
        printf("  5. FW Verification — wrong RW    (expect FW_NOK)\n");
        printf("  --- Installation ---\n");
        printf("  6. Installation    — request install auth (run option 4 first)\n");
        printf("  --- \n");
        printf("  9. Exit\n");
        printf("=====================================================\n");
        printf("  Option: ");
        scanf("%d", &option);
        printf("\n");

        /* ------------------------------------------------------------------
         * Exit
         * ------------------------------------------------------------------ */
        if (option == 9)
        {
            printf("  Exiting.\n\n");
            return 0;
        }

        /* ------------------------------------------------------------------
         * BIST path (option 0)
         * ------------------------------------------------------------------ */
        if (option == 0)
        {
            printf("=====================================================\n");
            printf("  BIST TEST\n");
            printf("=====================================================\n\n");

            run_bist();

            printf("\n=====================================================\n");
            printf("  BIST TEST COMPLETE\n");
            printf("=====================================================\n\n");

            continue;
        }

        /* ------------------------------------------------------------------
         * FW Verification paths
         * ------------------------------------------------------------------ */
        if (option == 4 || option == 5)
        {
            printf("=====================================================\n");
            printf("  FW VERIFICATION TEST\n");
            printf("=====================================================\n\n");

            run_fw_verification(option == 4 ? 1 : 0);

            printf("\n=====================================================\n");
            printf("  FW VERIFICATION TEST COMPLETE\n");
            printf("=====================================================\n\n");

            continue;
        }

        /* ------------------------------------------------------------------
         * Installation path (option 6)
         * Prerequisites: option 4 must have been run first in this session
         *                so that RW_verify is saved internally by the SDK.
         * ------------------------------------------------------------------ */
        if (option == 6)
        {
            printf("=====================================================\n");
            printf("  INSTALLATION TEST\n");
            printf("=====================================================\n\n");

            printf("[ INST ] Requesting installation authorization...\n");
            printf("-----------------------------------------------------\n");

            status = SGR_SDK_Installation();

            printf("-----------------------------------------------------\n");
            if (status == SGR_SDK_OK)
                printf("  ✔ Installation AUTHORIZED\n");
            else if (status == SGR_SDK_AUTH_FAILED)
                printf("  ✖ Installation DENIED\n");
            else if (status == SGR_SDK_COMM_ERROR)
                printf("  ✖ Installation ERROR — communication failed (status = %d)\n", status);
            else if (status == SGR_SDK_TOKEN_ERROR)
                printf("  ✖ Installation ERROR — crypto chip failed (status = %d)\n", status);
            else
                printf("  ✖ Installation ERROR (status = %d)\n", status);

            printf("\n=====================================================\n");
            printf("  INSTALLATION TEST COMPLETE\n");
            printf("=====================================================\n\n");

            continue;
        }

        /* ------------------------------------------------------------------
         * Authentication paths (options 1-3)
         * ------------------------------------------------------------------ */
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
                fi_skip_phase2    = 1;   /* main-branch behavior: Phase 1 only */
                break;
            case 3:
                fi_enable_cw      = 0;
                fi_enable_cw_echo = 0;
                fi_enable_rw      = 0;
                fi_enable_option3 = 1;
                fi_skip_phase2    = 1;   /* main-branch behavior: Phase 1 only */
                break;
            default:
                printf("  ✖ Invalid option\n\n");
                continue;
        }

        printf("=====================================================\n");
        printf("  AUTHENTICATION TEST\n");
        printf("=====================================================\n\n");

        printf("[ AUTH ] Authenticating via Gateway...\n");
        printf("-----------------------------------------------------\n");

        int phase1_only = fi_skip_phase2;   /* remember for result message */

        status = SGR_SDK_Authenticate_Via_GW();

        /* Reset all fault injection flags after auth completes */
        fi_enable_cw      = 0;
        fi_enable_cw_echo = 0;
        fi_enable_rw      = 0;
        fi_enable_option3 = 0;
        fi_skip_phase2    = 0;

        if (phase1_only)
        {
            /* Options 2/3 — main-branch single-phase wording */
            if (status == SGR_SDK_OK)
                printf("\n  ✔ Authentication OK (Phase 1)\n");
            else if (status == SGR_SDK_AUTH_FAILED)
                printf("\n  ✖ Authentication FAILED\n");
            else
                printf("\n  ✖ Authentication ERROR (status = %d)\n", status);
        }
        else
        {
            if (status == SGR_SDK_OK)
                printf("\n  ✔ Mutual Authentication OK (Phase 1 + Phase 2)\n");
            else if (status == SGR_SDK_AUTH_FAILED)
                printf("\n  ✖ Authentication FAILED — Phase 1 (cloud rejected device)\n");
            else if (status == SGR_SDK_MUTUAL_AUTH_FAILED)
                printf("\n  ✖ Mutual Authentication FAILED — Phase 2 (HRW mismatch, cloud not verified)\n");
            else
                printf("\n  ✖ Authentication ERROR (status = %d)\n", status);
        }

        printf("\n=====================================================\n");
        printf("  AUTHENTICATION TEST COMPLETE\n");
        printf("=====================================================\n\n");
    }

    return 0;
}
