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
#include "auth_db.h"  /* auth_db_load_whitelist / auth_db_register / whitelist */

/* Byte-compare two files. Returns 1 if both files exist and have identical
 * contents (including empty == empty), 0 otherwise. Used in place of shell
 * cmp/fc so we don't depend on platform shell behavior - in particular,
 * Windows `fc /b` was unreliable on empty whitelist files, causing
 * `move /Y` to overwrite the main file every poll and bumping its mtime,
 * which defeated the (mtime, size) gate below and produced "Loaded 0
 * device(s)" log spam every 3 seconds. */
static int files_equal(const char *a, const char *b)
{
    struct stat sa, sb;
    if (stat(a, &sa) != 0 || stat(b, &sb) != 0) return 0;
    if (sa.st_size != sb.st_size) return 0;
    if (sa.st_size == 0) return 1;  /* both empty */

    FILE *fa = fopen(a, "rb");
    FILE *fb = fopen(b, "rb");
    if (!fa || !fb) { if (fa) fclose(fa); if (fb) fclose(fb); return 0; }

    char ba[2048], bb[2048];
    int equal = 1;
    for (;;) {
        size_t na = fread(ba, 1, sizeof(ba), fa);
        size_t nb = fread(bb, 1, sizeof(bb), fb);
        if (na != nb || (na > 0 && memcmp(ba, bb, na) != 0)) { equal = 0; break; }
        if (na == 0) break;
    }
    fclose(fa); fclose(fb);
    return equal;
}

/* Required by port_comm.c for fault injection hooks */
volatile int fi_attempt         = 0;
volatile int fi_enable_type0_tx = 0;
volatile int fi_enable_type1_tx = 0;
volatile int fi_enable_type2_tx = 0;
volatile int fi_recover_attempt = 0;

/* Pull enrolled-device TIDs from the TrustBridge BE into the gateway whitelist
 * file, (re)load it, and register any new TIDs — so a device registered in
 * TrustBridge is authorized at the gateway WITHOUT recompiling or restarting.
 * If the BE is unreachable, the existing whitelist file is used as-is. */
static void refresh_whitelist(void)
{
    const char *be   = getenv("BE_URL");
    const char *path = getenv("GW_WHITELIST_PATH");
    if (!path || !path[0]) path = "./trustbridge_whitelist.txt";

    if (be && be[0]) {
        /* Step 1: fetch to a temp file. Just curl, nothing else - we do the
         * "only replace if different" dedup in C below via files_equal() so
         * we don't depend on shell builtins (`cmp -s` on POSIX, `fc /b` on
         * Windows) that differ in behavior on empty files. */
        char tmp_path[600];
        snprintf(tmp_path, sizeof(tmp_path), "%s.tmp", path);
        char cmd[1024];
#ifdef _WIN32
        snprintf(cmd, sizeof(cmd),
                 "curl -fsS --max-time 3 \"%s/devices/whitelist\" -o \"%s\" 2>nul",
                 be, tmp_path);
#else
        snprintf(cmd, sizeof(cmd),
                 "curl -fsS --max-time 3 \"%s/devices/whitelist\" -o \"%s\" 2>/dev/null",
                 be, tmp_path);
#endif
        (void)system(cmd);   /* best-effort; falls back to existing file if BE is down */

        /* Step 2: only replace the main whitelist if curl succeeded AND the
         * new content differs from what we already have. Otherwise leave the
         * existing file alone (don't touch mtime) and drop the tmp. */
        struct stat tmp_st;
        if (stat(tmp_path, &tmp_st) == 0) {
            if (!files_equal(tmp_path, path)) {
                /* rename() on Windows fails if target exists; remove first.
                 * On POSIX, rename() is atomic and replaces the target. */
                remove(path);
                rename(tmp_path, path);
            } else {
                remove(tmp_path);
            }
        }
    }

    /* Only reload + re-register when the file actually changed, so the loop can
     * poll this every few seconds without spamming logs. Gate on (mtime, size)
     * together — when a device is swapped, the file size stays identical
     * (one 64-hex-char TID per line) so size alone is not enough. */
    static time_t last_mtime = 0;
    static long   last_size  = -2;
    struct stat st;
    if (stat(path, &st) != 0)
        return;
    long   size  = (long)st.st_size;
    time_t mtime = st.st_mtime;
    if (mtime == last_mtime && size == last_size)
        return;
    last_mtime = mtime;
    last_size  = size;

    auth_db_load_whitelist(path);
    for (int i = 0; i < auth_db_whitelist_count; i++) {
        uint32_t crc;
        auth_db_register(auth_db_whitelist[i], &crc);
    }
}

/* Cache-miss hook (called by auth_db when an unknown CRC32 arrives).
 * Closes the race where a device starts authenticating right after being
 * enrolled in TrustBridge but before the gateway's 3-second polling refresh
 * picks it up — without this, the device burns through its 4 retries before
 * the gateway sees the new TID. */
static int on_auth_db_miss(uint32_t missing_crc32)
{
    (void)missing_crc32;
    refresh_whitelist();
    return (int)auth_db_whitelist_count;
}

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

    /* Register the cache-miss hook so the SDK calls back into refresh_whitelist
     * whenever it sees an unknown CRC32 — bypasses the up-to-3s race between a
     * device being enrolled in TrustBridge and its first auth attempt arriving. */
    auth_db_set_miss_handler(on_auth_db_miss);

    /* Load the authorized-device whitelist from the TrustBridge BE up front. */
    refresh_whitelist();

    printf("[GW] Listening for device requests...\n");
    printf("-----------------------------------------------------\n");

    while (1)
    {
        /* Re-sync the whitelist from the BE every ~3s, so a device just enrolled
         * in TrustBridge becomes authorized without restarting the gateway. */
        static time_t s_last_wl = 0;
        time_t now_wl = time(NULL);
        if (now_wl - s_last_wl >= 3) { refresh_whitelist(); s_last_wl = now_wl; }

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
