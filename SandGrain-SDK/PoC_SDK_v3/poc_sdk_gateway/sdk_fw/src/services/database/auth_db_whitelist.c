/* =============================================================================
 * auth_db_whitelist.c
 *
 * Dynamically loads the list of authorized device TIDs from a plain-text file.
 *
 * File format: one 64-character hex TID per line, blank lines / '#' comments ignored.
 * Default path: GW_WHITELIST_PATH env var, or "./trustbridge_whitelist.txt".
 *
 * TrustBridge backend exposes the current enrolled TIDs at
 *   GET {BE_URL}/devices/whitelist   (plain text, one TID per line)
 * which the gateway curls into this file (see refresh_whitelist() in main_gw.c),
 * so registering a device in TrustBridge auto-authorizes it — no recompile.
 *
 * (Ported from trustbridge-sdk-v3, which had this dynamic loader; the new SDK
 * had reverted it to a hardcoded static array.)
 * ============================================================================= */

#include "auth_db.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define WHITELIST_MAX_DEVICES  AUTH_DB_MAX_DEVICES
#define WHITELIST_DEFAULT_PATH "./trustbridge_whitelist.txt"

/* Storage for loaded TID strings */
static char   s_tid_storage[WHITELIST_MAX_DEVICES][AUTH_DB_TID_HEX_LEN + 1];

/* Public symbols referenced by auth_db.c */
const char    *auth_db_whitelist[AUTH_DB_MAX_DEVICES];
uint16_t       auth_db_whitelist_count = 0;

int auth_db_load_whitelist(const char *file_path)
{
    if (file_path == NULL)
        file_path = getenv("GW_WHITELIST_PATH");
    if (file_path == NULL)
        file_path = WHITELIST_DEFAULT_PATH;

    FILE *f = fopen(file_path, "r");
    if (!f) {
        printf("[AUTH_DB] Whitelist file not found: %s — keeping current list (%u)\n",
               file_path, auth_db_whitelist_count);
        return auth_db_whitelist_count;
    }

    int count = 0;
    char line[128];

    while (fgets(line, sizeof(line), f) && count < WHITELIST_MAX_DEVICES) {
        /* Strip trailing newline / CR / whitespace */
        int len = (int)strlen(line);
        while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r' ||
                           isspace((unsigned char)line[len - 1])))
            line[--len] = '\0';

        if (len == 0 || line[0] == '#')
            continue;

        if (len != AUTH_DB_TID_HEX_LEN) {
            printf("[AUTH_DB] Skipping invalid TID (len=%d): %.16s...\n", len, line);
            continue;
        }

        strncpy(s_tid_storage[count], line, AUTH_DB_TID_HEX_LEN);
        s_tid_storage[count][AUTH_DB_TID_HEX_LEN] = '\0';
        auth_db_whitelist[count] = s_tid_storage[count];
        count++;
    }

    fclose(f);

    auth_db_whitelist_count = (uint16_t)count;
    printf("[AUTH_DB] Loaded %d device(s) from whitelist: %s\n", count, file_path);

    /* The backend reorders this list (re-adding a device moves it to the end),
     * and the runtime tables are keyed by position — re-bind them or the gateway
     * will resolve a CRC32 to whichever TID now occupies that slot. */
    auth_db_rebind_whitelist();

    return count;
}
