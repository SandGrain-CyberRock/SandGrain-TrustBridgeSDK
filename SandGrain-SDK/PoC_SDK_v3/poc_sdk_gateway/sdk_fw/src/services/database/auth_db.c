/* =============================================================================
 * auth_db.c
 * ============================================================================= */

#include "auth_db.h"
#include "../../utils/crc/crc.h"
#include <string.h>
#include <stdio.h>

/* ===================== RUNTIME TABLES ===================== */
static uint32_t   crc32_table[AUTH_DB_MAX_DEVICES];
static bool       active_table[AUTH_DB_MAX_DEVICES];
static auth_ctx_t ctx_table[AUTH_DB_MAX_DEVICES];

/* Cache-miss hook — see auth_db.h for the rationale.
 * Set by the application (main_gw.c) so the SDK middleware stays generic. */
static auth_db_miss_handler_t s_miss_handler = NULL;

void auth_db_set_miss_handler(auth_db_miss_handler_t handler)
{
    s_miss_handler = handler;
}

/* ===================== INTERNAL ===================== */
static uint32_t prv_compute_crc32(const char *tid_hex)
{
    crcInit();
    uint16_t crc16 = crcFast((unsigned char *)tid_hex, strlen(tid_hex));

    /* Extend to 32 bits using both halves */
    uint32_t crc32 = ((uint32_t)crc16 << 16) |
                     (uint32_t)crcFast((unsigned char *)tid_hex + 1, strlen(tid_hex) - 1);

    return crc32;
}

/* ===================== API ===================== */

void auth_db_init(void)
{
    memset(crc32_table, 0,   sizeof(crc32_table));
    memset(active_table, 0,  sizeof(active_table));
    memset(ctx_table,    0,  sizeof(ctx_table));

    printf("[AUTH_DB] Initialized (%u slots)\n", AUTH_DB_MAX_DEVICES);
}

int auth_db_find_by_tid(const char *tid_hex)
{
    if (tid_hex == NULL)
        return -1;

    for (int i = 0; i < auth_db_whitelist_count; i++)
    {
        if (strncmp(auth_db_whitelist[i], tid_hex, AUTH_DB_TID_HEX_LEN) == 0)
            return i;
    }

    return -1;
}

int auth_db_find_by_crc32(uint32_t crc32)
{
    for (int i = 0; i < AUTH_DB_MAX_DEVICES; i++)
    {
        if (active_table[i] && crc32_table[i] == crc32)
            return i;
    }

    return -1;
}

auth_db_status_t auth_db_register(const char *tid_hex, uint32_t *crc32_out)
{
    auth_db_status_t status = AUTH_DB_ERROR;

    if (tid_hex == NULL || crc32_out == NULL)
    {
        status = AUTH_DB_ERROR;
    }
    else
    {
        int idx = auth_db_find_by_tid(tid_hex);
        if (idx < 0)
        {
            printf("[AUTH_DB] TID not in whitelist: %.16s...\n", tid_hex);
            status = AUTH_DB_NOT_FOUND;
        }
        else if (active_table[idx])
        {
            *crc32_out = crc32_table[idx];
            printf("[AUTH_DB] Already registered — crc32=0x%08X\n", *crc32_out);
            status = AUTH_DB_ALREADY_ACTIVE;
        }
        else
        {
            uint32_t crc32 = prv_compute_crc32(tid_hex);

            crc32_table[idx] = crc32;
            active_table[idx] = true;
            *crc32_out = crc32;

            /* Initialize auth context */
            memset(&ctx_table[idx], 0, sizeof(auth_ctx_t));
            ctx_table[idx].crc32 = crc32;
            strncpy(ctx_table[idx].tid_hex, tid_hex, AUTH_DB_TID_HEX_LEN);
            ctx_table[idx].state  = AUTH_STATE_IDLE;
            ctx_table[idx].result = AUTH_RESULT_NONE;

            printf("[AUTH_DB] Registered — idx=%d | crc32=0x%08X | tid=%.16s...\n",
                   idx, crc32, tid_hex);

            status = AUTH_DB_OK;
        }
    }

    return status;
}

void auth_db_rebind_whitelist(void)
{
    /* The runtime tables are indexed by whitelist POSITION, but the whitelist is
     * reloaded from the backend every few seconds and the backend may reorder it
     * (removing and re-adding a device moves it to the end). Registration skips
     * any slot that is already active, so without this pass a reorder leaves
     * crc32_table[i] bound to the TID that USED to sit at position i, while
     * auth_db_whitelist[i] now names a different one — and the gateway asks
     * CyberRock to challenge the wrong token, which always answers AUTH_NOT_OK.
     * Re-bind the slots that moved; leave the rest alone so an in-flight auth on
     * an unaffected device keeps its context. */
    for (int i = 0; i < AUTH_DB_MAX_DEVICES; i++)
    {
        if (!active_table[i])
            continue;

        /* Slot fell off the end of a shrunken whitelist — device de-enrolled. */
        if (i >= (int)auth_db_whitelist_count)
        {
            printf("[AUTH_DB] Released idx=%d | crc32=0x%08X | no longer in whitelist\n",
                   i, crc32_table[i]);
            active_table[i] = false;
            crc32_table[i]  = 0;
            memset(&ctx_table[i], 0, sizeof(auth_ctx_t));
            continue;
        }

        /* Still the TID this slot was registered with — nothing to do. */
        if (strncmp(ctx_table[i].tid_hex, auth_db_whitelist[i], AUTH_DB_TID_HEX_LEN) == 0)
            continue;

        /* Position now names a different TID: re-bind CRC32 and context to it. */
        uint32_t crc32 = prv_compute_crc32(auth_db_whitelist[i]);

        printf("[AUTH_DB] Re-bound idx=%d | crc32=0x%08X -> 0x%08X | tid=%.16s...\n",
               i, crc32_table[i], crc32, auth_db_whitelist[i]);

        crc32_table[i] = crc32;

        memset(&ctx_table[i], 0, sizeof(auth_ctx_t));
        ctx_table[i].crc32 = crc32;
        strncpy(ctx_table[i].tid_hex, auth_db_whitelist[i], AUTH_DB_TID_HEX_LEN);
        ctx_table[i].state  = AUTH_STATE_IDLE;
        ctx_table[i].result = AUTH_RESULT_NONE;
    }
}

auth_db_status_t auth_db_resolve(uint32_t crc32, char *tid_hex_out)
{
    auth_db_status_t status = AUTH_DB_ERROR;

    if (tid_hex_out == NULL)
    {
        status = AUTH_DB_ERROR;
    }
    else
    {
        int idx = auth_db_find_by_crc32(crc32);

        /* Cache miss → give the application a chance to refresh the whitelist
         * (e.g. fetch newly-enrolled TIDs from the backend) before failing.
         * This closes the race where a device starts authenticating moments
         * after being added in TrustBridge but before the gateway's polling
         * refresh has picked it up. */
        if (idx < 0 && s_miss_handler != NULL)
        {
            printf("[AUTH_DB] CRC32 not found: 0x%08X — forcing whitelist refresh\n", crc32);
            int new_count = s_miss_handler(crc32);
            if (new_count > 0)
                idx = auth_db_find_by_crc32(crc32);
        }

        if (idx < 0)
        {
            printf("[AUTH_DB] CRC32 not found: 0x%08X (after refresh)\n", crc32);
            status = AUTH_DB_NOT_FOUND;
        }
        else
        {
            /* Read the TID from the context the CRC32 was bound to, NOT from
             * auth_db_whitelist[idx]: the whitelist array is reloaded (and may be
             * reordered) independently of the tables this index came from, so
             * indexing it here can hand back a TID that does not match `crc32`.
             * auth_db_rebind_whitelist() keeps the two in step; this makes a
             * mismatch impossible even if a reload lands mid-flow. */
            strncpy(tid_hex_out, ctx_table[idx].tid_hex, AUTH_DB_TID_HEX_LEN);
            tid_hex_out[AUTH_DB_TID_HEX_LEN] = '\0';
            status = AUTH_DB_OK;
        }
    }

    return status;
}

auth_ctx_t *auth_db_get_ctx(uint32_t crc32)
{
    auth_ctx_t *ctx = NULL;

    int idx = auth_db_find_by_crc32(crc32);
    if (idx >= 0)
        ctx = &ctx_table[idx];

    return ctx;
}

auth_db_status_t auth_db_reset_ctx(uint32_t crc32)
{
    auth_db_status_t status = AUTH_DB_ERROR;

    int idx = auth_db_find_by_crc32(crc32);
    if (idx < 0)
    {
        status = AUTH_DB_NOT_FOUND;
    }
    else
    {
        uint32_t saved_crc32 = ctx_table[idx].crc32;
        char     saved_tid[AUTH_DB_TID_HEX_LEN + 1];
        strncpy(saved_tid, ctx_table[idx].tid_hex, AUTH_DB_TID_HEX_LEN);
        saved_tid[AUTH_DB_TID_HEX_LEN] = '\0';

        memset(&ctx_table[idx], 0, sizeof(auth_ctx_t));

        ctx_table[idx].crc32 = saved_crc32;
        strncpy(ctx_table[idx].tid_hex, saved_tid, AUTH_DB_TID_HEX_LEN);
        ctx_table[idx].state  = AUTH_STATE_IDLE;
        ctx_table[idx].result = AUTH_RESULT_NONE;

        status = AUTH_DB_OK;
    }

    return status;
}

