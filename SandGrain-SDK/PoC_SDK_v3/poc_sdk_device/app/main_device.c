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
 * Authentication flow:
 *   1. Initialize Device SDK
 *   2. Select test option (normal / fault injection)
 *   3. Send auth request to GW
 *   4. Receive CW, compute RW on crypto chip
 *   5. Send CW echo + RW to GW
 *   6. Receive AUT_OK or AUT_NOK
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
#else
    #include <pthread.h>
#endif

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <mosquitto.h>
#include "sandgrain.h"
#include "comm_adapter.h"
#include "fi_device.h"
#include "sha256.h"
#include "crypto.h"
#include "encoding_hex.h"
#include "config_poc.h"

/* Serializes SDK calls between the menu (main thread) and BE-driven MQTT
 * triggers (mosquitto background thread started by mosquitto_loop_start). */
#ifdef WIN32
    static CRITICAL_SECTION g_sdk_mutex;
    static int              g_sdk_mutex_inited = 0;
    static void sdk_mutex_init(void)    { if (!g_sdk_mutex_inited) { InitializeCriticalSection(&g_sdk_mutex); g_sdk_mutex_inited = 1; } }
    static void sdk_mutex_lock(void)    { EnterCriticalSection(&g_sdk_mutex); }
    static void sdk_mutex_unlock(void)  { LeaveCriticalSection(&g_sdk_mutex); }
    static void sdk_mutex_destroy(void) { if (g_sdk_mutex_inited) { DeleteCriticalSection(&g_sdk_mutex); g_sdk_mutex_inited = 0; } }
#else
    static pthread_mutex_t g_sdk_mutex = PTHREAD_MUTEX_INITIALIZER;
    static void sdk_mutex_init(void)    { }
    static void sdk_mutex_lock(void)    { pthread_mutex_lock(&g_sdk_mutex); }
    static void sdk_mutex_unlock(void)  { pthread_mutex_unlock(&g_sdk_mutex); }
    static void sdk_mutex_destroy(void) { pthread_mutex_destroy(&g_sdk_mutex); }
#endif

/* Populated by the middleware when the cloud returns CLAIM_TOKEN.
 * Defined in sdk_fw/src/middleware/sgr_mw.c. */
extern char g_sgr_last_claim_token_id[];

/* First-enrollment auto re-auth: an unclaimed chip's first auth returns
 * CLAIM_TOKEN (not AUTH_OK). The BE claims the token; once that claim settles a
 * second auth pass yields AUTH_OK. A *delayed* re-auth is the part that works —
 * rapid retries can't outwait the claim. Defaults are env-overridable so the
 * wait can be tuned (e.g. slow claim propagation) without recompiling:
 *   CLAIM_REAUTH_PASSES   — max re-auth passes      (default 4)
 *   CLAIM_REAUTH_DELAY_S  — seconds to wait per pass (default 3)  */
#define CLAIM_REAUTH_PASSES_DEFAULT  4
#define CLAIM_REAUTH_DELAY_DEFAULT   3
static int claim_reauth_passes(void) { const char *e = getenv("CLAIM_REAUTH_PASSES");  return e ? atoi(e) : CLAIM_REAUTH_PASSES_DEFAULT; }
static int claim_reauth_delay_s(void){ const char *e = getenv("CLAIM_REAUTH_DELAY_S"); return e ? atoi(e) : CLAIM_REAUTH_DELAY_DEFAULT; }

/* Portable whole-second sleep (lets a fresh CLAIM_TOKEN settle on the BE). */
#ifdef WIN32
    static void sdk_sleep_s(int s) { Sleep((DWORD)s * 1000); }
#else
    #include <unistd.h>
    static void sdk_sleep_s(int s) { sleep((unsigned)s); }
#endif

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

/* =============================================================================
 * BE-driven listener mode (TrustBridge integration)
 *
 * When RUN_MODE=listener (or --listen), the device subscribes to
 *   sandgrain/v1/{tid}/cmd/run_auth   (payload {"mode":1|2|3})
 * and runs mutual auth on trigger, publishing presence to
 *   sandgrain/v1/{tid}/status        ("online"/"offline")
 * The gateway publishes gw_log + the terminal auth_result.
 *
 * The listener runs on mosquitto's background thread (mosquitto_loop_start);
 * the interactive menu runs in parallel on the main thread. g_sdk_mutex
 * serializes SDK calls so the two paths can't race for the gateway socket.
 * ============================================================================= */
static struct mosquitto *g_mosq        = NULL;
static char              g_tid_hex[65] = {0};

static void on_connect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)obj;
    if (rc != 0) { printf("[MQTT] Connection failed (rc=%d)\n", rc); return; }
    char topic[160];
    snprintf(topic, sizeof(topic), "sandgrain/v1/%s/cmd/run_auth", g_tid_hex);
    mosquitto_subscribe(mosq, NULL, topic, 0);
    char status_topic[160];
    snprintf(status_topic, sizeof(status_topic), "sandgrain/v1/%s/status", g_tid_hex);
    mosquitto_publish(mosq, NULL, status_topic, (int)strlen("online"), "online", 0, true);
    printf("[MQTT] Connected — subscribed to %s, published status=online\n", topic);
}

/* Run auth with fault-injection flags matching the menu's options 1/2/3.
 * Caller must hold g_sdk_mutex. */
static void run_auth_listener(int mode)
{
    fi_enable_cw = 0; fi_enable_cw_echo = 0; fi_enable_rw = 0; fi_enable_option3 = 0; fi_skip_phase2 = 0;
    const char *name = "Unknown";
    switch (mode) {
        case 1: name = "Mutual Authentication"; break;
        case 2: fi_enable_cw = 1; fi_enable_cw_echo = 1; fi_enable_rw = 1; fi_skip_phase2 = 1;
                name = "Fault Injection"; break;
        case 3: fi_enable_option3 = 1; fi_skip_phase2 = 1; name = "Error Management stress"; break;
        default: printf("[AUTH] Unknown mode %d — skipping\n", mode); return;
    }
    printf("\n=== AUTH (mode %d: %s) — triggered by TrustBridge ===\n", mode, name);
    sgr_sdk_status_t st = SGR_SDK_Authenticate_Via_GW();

    /* First-time enrollment: an unclaimed chip authenticates fine but the cloud
     * returns CLAIM_TOKEN instead of AUTH_OK. The BE then claims that token;
     * once the claim settles, a second auth pass yields AUTH_OK. Drive that
     * second pass here (after a delay so the claim can land) so the FE-triggered
     * flow finishes enrollment on its own instead of ending "Rejected". */
    {
        int max_passes = claim_reauth_passes();
        int delay_s    = claim_reauth_delay_s();
        for (int pass = 1; st == SGR_SDK_CLAIM_TOKEN_READY && pass <= max_passes; pass++)
        {
            printf("  Token ready to be claimed: %s\n", g_sgr_last_claim_token_id);
            printf("  Waiting %ds for claim to settle, re-authenticating (pass %d/%d)...\n",
                   delay_s, pass, max_passes);
            sdk_sleep_s(delay_s);
            st = SGR_SDK_Authenticate_Via_GW();
        }
    }

    fi_enable_cw = 0; fi_enable_cw_echo = 0; fi_enable_rw = 0; fi_enable_option3 = 0; fi_skip_phase2 = 0;
    if (st == SGR_SDK_OK)                     printf("  ✔ Authentication OK\n");
    else if (st == SGR_SDK_CLAIM_TOKEN_READY) printf("  ⚠ Claim still pending after re-auth passes — will finish on next trigger\n");
    else if (st == SGR_SDK_AUTH_FAILED)       printf("  ✖ Authentication FAILED\n");
    else                                      printf("  ✖ Authentication ERROR (status=%d)\n", st);
}

static void on_message(struct mosquitto *mosq, void *obj,
                       const struct mosquitto_message *msg)
{
    (void)mosq; (void)obj;
    if (!msg || !msg->payload) return;
    char payload[256];
    int plen = msg->payloadlen < (int)sizeof(payload) - 1 ? msg->payloadlen : (int)sizeof(payload) - 1;
    memcpy(payload, msg->payload, plen);
    payload[plen] = '\0';
    printf("\n[MQTT] Trigger received: %s\n", payload);

    int mode = 1;  /* default to normal auth */
    const char *p = strstr(payload, "mode");
    if (p) { while (*p && (*p < '1' || *p > '3')) p++;
             if (*p >= '1' && *p <= '3') { mode = *p - '0'; } }

    sdk_mutex_lock();
    run_auth_listener(mode);
    sdk_mutex_unlock();

    printf("\n  Option: ");   /* re-prompt menu after BE-triggered run */
    fflush(stdout);
}

static void on_disconnect(struct mosquitto *mosq, void *obj, int rc)
{
    (void)mosq; (void)obj;
    if (rc != 0) printf("[MQTT] Unexpectedly disconnected (rc=%d) — reconnecting...\n", rc);
}

/* Non-blocking: sets up MQTT, kicks off mosquitto's background loop, returns.
 * Returns 0 on success, -1 if MQTT couldn't be brought up (caller continues
 * with menu only). */
static int start_listener(void)
{
    uint8_t tid_bytes[32] = {0};
    if (crypto_get_id(tid_bytes, sizeof(tid_bytes)) == SGR_CRYPTO_OK) {
        bytes_to_hex(tid_bytes, sizeof(tid_bytes), g_tid_hex, sizeof(g_tid_hex));
    } else {
        const char *env_tid = getenv("DEVICE_TID");
        if (env_tid && env_tid[0]) {
            strncpy(g_tid_hex, env_tid, sizeof(g_tid_hex) - 1);
            printf("[LISTENER] crypto chip TID unavailable — using DEVICE_TID env\n");
        } else {
            printf("[LISTENER] Cannot determine TID (no crypto chip, no DEVICE_TID) — listener disabled\n");
            return -1;
        }
    }
    printf("[LISTENER] TID: %s\n", g_tid_hex);

    mosquitto_lib_init();
    g_mosq = mosquitto_new(g_tid_hex, true, NULL);
    if (!g_mosq) { printf("[LISTENER] mosquitto_new failed — listener disabled\n"); mosquitto_lib_cleanup(); return -1; }
    mosquitto_connect_callback_set(g_mosq, on_connect);
    mosquitto_message_callback_set(g_mosq, on_message);
    mosquitto_disconnect_callback_set(g_mosq, on_disconnect);

    char will_topic[160];
    snprintf(will_topic, sizeof(will_topic), "sandgrain/v1/%s/status", g_tid_hex);
    mosquitto_will_set(g_mosq, will_topic, (int)strlen("offline"), "offline", 0, true);

    /* Authenticate only when MQTT_USER is set; otherwise connect anonymously
     * (default). Lets the device reach a broker that requires credentials. */
    const char *mqtt_user = MQTT_USER;
    if (mqtt_user && mqtt_user[0]) {
        const char *mqtt_pass = MQTT_PASS;
        mosquitto_username_pw_set(g_mosq, mqtt_user, (mqtt_pass && mqtt_pass[0]) ? mqtt_pass : NULL);
    }

    if (mosquitto_connect(g_mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE) != MOSQ_ERR_SUCCESS) {
        printf("[LISTENER] Cannot connect to MQTT broker at %s:%d — listener disabled\n", MQTT_BROKER, MQTT_PORT);
        mosquitto_destroy(g_mosq); g_mosq = NULL;
        mosquitto_lib_cleanup();
        return -1;
    }

    if (mosquitto_loop_start(g_mosq) != MOSQ_ERR_SUCCESS) {
        printf("[LISTENER] mosquitto_loop_start failed — listener disabled\n");
        mosquitto_disconnect(g_mosq);
        mosquitto_destroy(g_mosq); g_mosq = NULL;
        mosquitto_lib_cleanup();
        return -1;
    }

    printf("[READY] Listening for TrustBridge triggers on sandgrain/v1/%s/cmd/run_auth\n\n", g_tid_hex);
    return 0;
}

static void stop_listener(void)
{
    if (!g_mosq) return;
    mosquitto_loop_stop(g_mosq, true);
    mosquitto_disconnect(g_mosq);
    mosquitto_destroy(g_mosq); g_mosq = NULL;
    mosquitto_lib_cleanup();
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Progress event handler (demo).
 *
 * Invoked synchronously by the SDK at each authentication step. Keep it short
 * and do not call SGR_SDK_* functions from here — just observe. A real device
 * would drive LEDs/UI or log over its own diagnostic channel.
 * ────────────────────────────────────────────────────────────────────────────── */
static const char *auth_event_name(sgr_sdk_event_t e)
{
    switch (e)
    {
        case SGR_SDK_EVT_AUTH_STARTED:      return "AUTH_STARTED";
        case SGR_SDK_EVT_AUTH_REQUEST_SENT: return "AUTH_REQUEST_SENT";
        case SGR_SDK_EVT_CW_RECEIVED:       return "CW_RECEIVED";
        case SGR_SDK_EVT_RW_COMPUTED:       return "RW_COMPUTED";
        case SGR_SDK_EVT_RW_SENT:           return "RW_SENT";
        case SGR_SDK_EVT_RESULT_RECEIVED:   return "RESULT_RECEIVED";
        case SGR_SDK_EVT_AUTH_COMPLETE:     return "AUTH_COMPLETE";
        case SGR_SDK_EVT_AUTH_FAILED:       return "AUTH_FAILED";
        case SGR_SDK_EVT_RETRY:             return "RETRY";
        default:                            return "UNKNOWN";
    }
}

static void on_auth_event(sgr_sdk_event_t e, void *ctx)
{
    (void)ctx;
    printf("        [EVT] %s\n", auth_event_name(e));
}

int main(int argc, char **argv)
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
     * Register the communication transport (socket/MQTT via port_comm.c).
     * Swap this adapter for your own to run over UART/SPI/BLE/LoRa/etc.
     * ------------------------------------------------------------------ */
    sgr_sdk_comm_interface_t comm;
    comm_adapter_get_interface(&comm);
    if (SGR_SDK_SetCommInterface(&comm) != SGR_SDK_OK)
    {
        printf("  ✖ SGR_SDK_SetCommInterface failed\n");
        return -1;
    }

    /* ------------------------------------------------------------------
     * Register an optional progress callback (drives the [EVT] lines).
     * ------------------------------------------------------------------ */
    SGR_SDK_SetEventCallback(on_auth_event, NULL);

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

    /* Initialize the SDK-call mutex once before either input surface can run. */
    sdk_mutex_init();

    /* BE-driven listener (RUN_MODE=listener or --listen): subscribes to
     * cmd/run_auth in a background thread, then falls through so the menu
     * runs in parallel on the main thread. Both paths serialize SDK calls
     * via g_sdk_mutex. */
    {
        int listen = (getenv("RUN_MODE") && strcmp(getenv("RUN_MODE"), "listener") == 0);
        for (int i = 1; i < argc; i++)
            if (strcmp(argv[i], "--listen") == 0) listen = 1;
        if (listen)
            start_listener();   /* failure logs and disables MQTT, menu still runs */
    }

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
        printf("  1. Mutual Authentication (no fault injection)\n");
        printf("  2. Fault injection (CW: 2 bits, CW echo: 1 bit, RW: 1 bit)\n");
        printf("  3. Fault injection — Error Management stress (CW: 3 bits, CW echo: 2 bits)\n");
        printf("  --- FW Verification ---\n");
        printf("  4. FW Verification — correct RW  (expect FW_OK, saves RW_verify)\n");
        printf("  5. FW Verification — wrong RW    (expect FW_NOK)\n");
        printf("  --- Installation ---\n");
        printf("  6. Installation    — request install auth (run option 4 first)\n");
        printf("  --- \n");
        printf("  7. Exit\n");
        printf("=====================================================\n");
        printf("  Option: ");
        scanf("%d", &option);
        printf("\n");

        /* ------------------------------------------------------------------
         * Exit
         * ------------------------------------------------------------------ */
        if (option == 7)
        {
            printf("  Exiting.\n\n");
            stop_listener();
            sdk_mutex_destroy();
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

            sdk_mutex_lock();
            run_bist();
            sdk_mutex_unlock();

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

            sdk_mutex_lock();
            run_fw_verification(option == 4 ? 1 : 0);
            sdk_mutex_unlock();

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

            sdk_mutex_lock();
            status = SGR_SDK_Installation();
            sdk_mutex_unlock();

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
        if (option < 1 || option > 3) {
            printf("  ✖ Invalid option\n\n");
            continue;
        }

        printf("=====================================================\n");
        printf("  AUTHENTICATION TEST\n");
        printf("=====================================================\n\n");

        printf("[ AUTH ] Authenticating via Gateway...\n");
        printf("-----------------------------------------------------\n");

        sdk_mutex_lock();

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
                fi_skip_phase2    = 1;   /* parity with rev3.2-Mutual (no effect on ARM — single-phase) */
                break;
            case 3:
                fi_enable_cw      = 0;
                fi_enable_cw_echo = 0;
                fi_enable_rw      = 0;
                fi_enable_option3 = 1;
                fi_skip_phase2    = 1;   /* parity with rev3.2-Mutual (no effect on ARM — single-phase) */
                break;
        }

        int phase1_only = fi_skip_phase2;   /* remember for result message */

        status = SGR_SDK_Authenticate_Via_GW();

        /* Reset all fault injection flags after auth completes */
        fi_enable_cw      = 0;
        fi_enable_cw_echo = 0;
        fi_enable_rw      = 0;
        fi_enable_option3 = 0;
        fi_skip_phase2    = 0;

        sdk_mutex_unlock();

        if (phase1_only)
        {
            /* Options 2/3 — main-branch single-phase wording */
            if (status == SGR_SDK_OK)
                printf("\n  ✔ Authentication OK (Phase 1)\n");
            else if (status == SGR_SDK_AUTH_FAILED)
                printf("\n  ✖ Authentication FAILED\n");
            else if (status == SGR_SDK_CLAIM_TOKEN_READY)
                printf("\n  ⚠ Token Ready to be Claimed: %s\n", g_sgr_last_claim_token_id);
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
            else if (status == SGR_SDK_CLAIM_TOKEN_READY)
                printf("\n  ⚠ Token Ready to be Claimed: %s\n", g_sgr_last_claim_token_id);
            else
                printf("\n  ✖ Authentication ERROR (status = %d)\n", status);
        }

        printf("\n=====================================================\n");
        printf("  AUTHENTICATION TEST COMPLETE\n");
        printf("=====================================================\n\n");
    }

    return 0;
}
