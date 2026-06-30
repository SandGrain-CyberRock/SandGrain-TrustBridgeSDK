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
        if (idx < 0)
        {
            printf("[AUTH_DB] CRC32 not found: 0x%08X\n", crc32);
            status = AUTH_DB_NOT_FOUND;
        }
        else
        {
            strncpy(tid_hex_out, auth_db_whitelist[idx], AUTH_DB_TID_HEX_LEN);
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

void auth_db_print_session(void)
{
    printf("\n╔══════════════════════════════════════════════════════════════════════════════╗\n");
    printf("║                     GATEWAY AUTHENTICATION SESSION TABLE                   ║\n");
    printf("╠══════════════════════════════════════════════════════════════════════════════╣\n");

    bool any = false;

    for (int i = 0; i < AUTH_DB_MAX_DEVICES; i++)
    {
        if (!active_table[i])
            continue;

        any = true;

        const char *state_str  = "IDLE";
        const char *result_str = "NONE";

        switch (ctx_table[i].state)
        {
            case AUTH_STATE_IDLE:              state_str = "IDLE";              break;
            case AUTH_STATE_CW_SENT:           state_str = "CW_SENT";          break;
            case AUTH_STATE_RW_RECEIVED:       state_str = "RW_RECEIVED";      break;
            case AUTH_STATE_SERVER_VERIFIED:   state_str = "SERVER_VERIFIED";  break;
            case AUTH_STATE_DONE:              state_str = "DONE";             break;
        }

        switch (ctx_table[i].result)
        {
            case AUTH_RESULT_NONE:  result_str = "NONE";  break;
            case AUTH_RESULT_OK:    result_str = "OK";    break;
            case AUTH_RESULT_NOK:   result_str = "NOK";   break;
        }

        printf("║  Device #%-2d                                                                ║\n", i);
        printf("║  TID    : %.64s  ║\n", ctx_table[i].tid_hex);
        printf("║  CRC32  : 0x%08X                                                         ║\n", ctx_table[i].crc32);
        printf("║  State  : %-16s  Result : %-6s                              ║\n", state_str, result_str);
        printf("║  CW diff: %d bits   RW diff: %d bits                                       ║\n",
               ctx_table[i].cw_bit_diff, ctx_table[i].rw_bit_diff);
        printf("╚══════════════════════════════════════════════════════════════════════════════╝\n");
    }

    if (!any)
    {
        printf("║  (no active devices)                                                        ║\n");
        printf("╚══════════════════════════════════════════════════════════════════════════════╝\n");
    }
}