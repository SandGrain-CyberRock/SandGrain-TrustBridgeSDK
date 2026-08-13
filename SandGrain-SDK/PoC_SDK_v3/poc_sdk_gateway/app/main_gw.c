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
#include <stdlib.h>     /* getenv, system */
#include <string.h>     /* memcmp - whitelist content compare */
#include <time.h>       /* time() — throttle whitelist refresh */
#include <sys/stat.h>   /* stat() — skip reload when whitelist unchanged */
#include "sdk_sgr_user_api.h"
#include "crypto.h"
#include "gw_log.h"
#include "trace_log.h"     /* local traceability log — enabled by TRACE_LOG_PATH */
#include "gw_whitelist.h"  /* MQTT-driven whitelist + gateway presence (TrustBridge mode) */
#include "gw_presence.h"       /* per-device presence + BE trigger proxy (device MQTT-free) */
#include "port_comm_device.h"  /* port_comm_device_forward_run_auth (the trigger forwarder) */
#include "auth_db.h"  /* auth_db_load_whitelist / auth_db_register / whitelist */

/* Required by port_comm.c for fault injection hooks */
volatile int fi_attempt         = 0;
volatile int fi_enable_type0_tx = 0;
volatile int fi_enable_type1_tx = 0;
volatile int fi_enable_type2_tx = 0;
volatile int fi_recover_attempt = 0;

/* Reload the gateway whitelist from its file and register any new TIDs.
 *
 * The file is the single source of truth for authorized TIDs. In standalone it
 * is a static list; in TrustBridge mode gw_whitelist.c keeps it current by
 * merging TIDs pushed over MQTT (sandgrain/v1/gw/whitelist) — replacing the old
 * 3-second HTTP poll of {BE_URL}/devices/whitelist. This just reloads that file
 * when it actually changed (mtime,size gate) so it can be called freely without
 * log spam, and returns the resulting whitelist size. */
static int reload_whitelist_from_file(void)
{
    const char *path = getenv("GW_WHITELIST_PATH");
    if (!path || !path[0]) path = "./trustbridge_whitelist.txt";

    /* Gate on (mtime, size) together — when a device is swapped the file size
     * stays identical (one 64-hex-char TID per line) so size alone isn't enough. */
    static time_t last_mtime = 0;
    static long   last_size  = -2;
    struct stat st;
    if (stat(path, &st) != 0)
        return (int)auth_db_whitelist_count;
    long   size  = (long)st.st_size;
    time_t mtime = st.st_mtime;
    if (mtime == last_mtime && size == last_size)
        return (int)auth_db_whitelist_count;
    last_mtime = mtime;
    last_size  = size;

    auth_db_load_whitelist(path);
    for (int i = 0; i < auth_db_whitelist_count; i++) {
        uint32_t crc;
        auth_db_register(auth_db_whitelist[i], &crc);
    }
    return (int)auth_db_whitelist_count;
}

/* Cache-miss hook (called by auth_db when an unknown CRC32 arrives).
 * Closes the race where a device starts authenticating right after being
 * enrolled in TrustBridge but before the gateway has learned its TID.
 * Nudges the BE to re-push the whitelist over MQTT (async — announce_online is
 * a no-op in standalone), and immediately reloads anything already written to
 * the file so a TID that just arrived resolves on auth_db's retry. */
static int on_auth_db_miss(uint32_t missing_crc32)
{
    (void)missing_crc32;
    gw_whitelist_announce_online();
    return reload_whitelist_from_file();
}

int main(void)
{
    #ifdef WIN32
        SetConsoleOutputCP(CP_UTF8);
        SetConsoleCP(CP_UTF8);
    #endif

    /* Line-buffer stdout so the startup banner and per-flow logs appear live
     * even when stdout is a pipe (e.g. run_gateway.sh timestamps output via
     * `| _stamp`). Without this the gateway relies on an external `stdbuf`/
     * `gstdbuf` wrapper, which isn't present on a stock macOS (no coreutils),
     * leaving the whole banner trapped in libc's fully-buffered pipe buffer. */
    setvbuf(stdout, NULL, _IOLBF, 0);

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
     *
     * Skipped entirely when GW_CRYPTO_ENABLED == 0: a relay gateway has no
     * crypto chip of its own, and on a single-host standalone setup (device +
     * gateway sharing one USB chip) probing here would race the device for
     * /dev/ttyACM0 — corrupting one side's read and aborting startup.
     * ------------------------------------------------------------------ */
#if GW_CRYPTO_ENABLED
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
#else
    printf("[BIST] Gateway crypto disabled (relay mode) — chip left to the device.\n\n");
#endif

    /* Open the MQTT telemetry connection so the BE receives per-step gw_log
     * messages and the terminal auth_result (published from the FSM). */
    gw_log_init();

    /* Open the local traceability log (no-op unless TRACE_LOG_PATH is set). */
    trace_log_init();

    /* TrustBridge mode (BE_URL set): receive the authorized-TID whitelist over
     * MQTT instead of polling the BE's HTTP endpoint. gw_whitelist announces the
     * gateway "online" so the BE pushes the current list, and subscribes for
     * live updates as devices enroll. Standalone (no BE_URL) skips this and just
     * uses the static whitelist file loaded below. */
    const char *be_url = getenv("BE_URL");
    if (be_url && be_url[0])
        gw_whitelist_init();

    /* Devices are MQTT-free: they announce "HELLO <tid> TRIGGER" over their
     * persistent link and the gateway proxies their presence + relays
     * cmd/run_auth. Register the forwarder that writes "RUN_AUTH <mode>" back
     * down the right device channel (see gw_presence.c / port_comm_device.c). */
    gw_presence_set_trigger_handler(port_comm_device_forward_run_auth);

    /* Register the cache-miss hook so the SDK calls back whenever it sees an
     * unknown CRC32 — re-nudges the BE and reloads the file, bypassing the race
     * between a device being enrolled in TrustBridge and its first auth arriving. */
    auth_db_set_miss_handler(on_auth_db_miss);

    /* Load the authorized-device whitelist from the file up front (last-known in
     * TrustBridge mode; the static list in standalone). */
    reload_whitelist_from_file();

    printf("[GW] Listening for device requests...\n");
    printf("-----------------------------------------------------\n");

    while (1)
    {
        /* Reload the whitelist when gw_whitelist reports the file changed
         * (TrustBridge pushed an update over MQTT). Standalone never sets this,
         * so the file is loaded once at startup above. */
        if (gw_whitelist_take_dirty())
            reload_whitelist_from_file();

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
