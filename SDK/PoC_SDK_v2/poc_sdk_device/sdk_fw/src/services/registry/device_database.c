#include "device_database.h"
#include <string.h>
#include <stdio.h>

/* CRC library — same as used in middleware */
#include "../../utils/crc/crc.h"

/* ===================== RUNTIME TABLES ===================== */

uint16_t short_id_table[DEVICES_DATABASE_MAX];
char     cw_table[DEVICES_DATABASE_MAX][CW_HEX_LEN + 1];
char     rw_table[DEVICES_DATABASE_MAX][RW_HEX_LEN + 1];
char     cw_table_auth2[DEVICES_DATABASE_MAX][CW_HEX_LEN + 1];  /* Auth 2 */
char     rw_table_auth2[DEVICES_DATABASE_MAX][RW_HEX_LEN + 1];  /* Auth 2 */
bool     active_table[DEVICES_DATABASE_MAX];

/* ===================== API ===================== */

void device_db_init(void)
{
    for (int i = 0; i < DEVICES_DATABASE_MAX; i++)
    {
        short_id_table[i] = 0;
        active_table[i]   = false;
        cw_table[i][0]    = '\0';
        rw_table[i][0]    = '\0';
        cw_table_auth2[i][0] = '\0';
        rw_table_auth2[i][0] = '\0';
    }

    printf("[DEVICE_DB] Database initialized (%u slots)\n", DEVICES_DATABASE_MAX);
}

int device_db_find_by_tid(const char *tid_hex)
{
    if (tid_hex == NULL)
        return -1;

    for (int i = 0; i < device_whitelist_count; i++)
    {
        if (strncmp(device_whitelist[i], tid_hex, TID_HEX_LEN) == 0)
            return i;
    }

    return -1;
}

int device_db_find_by_short_id(uint16_t short_id)
{
    for (int i = 0; i < DEVICES_DATABASE_MAX; i++)
    {
        if (active_table[i] && short_id_table[i] == short_id)
            return i;
    }

    return -1;
}

device_db_status_t device_db_register(const char *tid_hex, uint16_t *short_id_out)
{
    if (tid_hex == NULL || short_id_out == NULL)
        return DEVICE_DB_ERROR;

    /* Look up TID in whitelist */
    int idx = device_db_find_by_tid(tid_hex);
    if (idx < 0)
    {
        printf("[DEVICE_DB] TID not found in whitelist: %.16s...\n", tid_hex);
        return DEVICE_DB_NOT_FOUND;
    }

    /* Already registered */
    if (active_table[idx])
    {
        *short_id_out = short_id_table[idx];
        printf("[DEVICE_DB] Device already registered — short_id = %u\n", *short_id_out);
        return DEVICE_DB_ALREADY_ACTIVE;
    }

    /* Compute CRC of TID hex string as short_id */
    crcInit();
    uint16_t crc = crcFast((unsigned char *)tid_hex, strlen(tid_hex));

    short_id_table[idx] = crc;
    active_table[idx]   = true;
    *short_id_out       = crc;

    printf("[DEVICE_DB] Device registered — idx=%d | short_id=%u | tid=%.16s...\n",
           idx, crc, tid_hex);

    return DEVICE_DB_OK;
}

device_db_status_t device_db_resolve(uint16_t short_id, char *tid_hex_out)
{
    if (tid_hex_out == NULL)
        return DEVICE_DB_ERROR;

    int idx = device_db_find_by_short_id(short_id);
    if (idx < 0)
    {
        printf("[DEVICE_DB] short_id not found: %u\n", short_id);
        return DEVICE_DB_NOT_FOUND;
    }

    strncpy(tid_hex_out, device_whitelist[idx], TID_HEX_LEN);
    tid_hex_out[TID_HEX_LEN] = '\0';

    return DEVICE_DB_OK;
}

void device_db_print_session(void)
{
    printf("\n╔══════════════════════════════════════════════════════════════════════════════╗\n");
    printf("║                        AUTHENTICATION SESSION TABLE                        ║\n");
    printf("╠══════════════════════════════════════════════════════════════════════════════╣\n");

    bool any = false;

    for (int i = 0; i < DEVICES_DATABASE_MAX; i++)
    {
        if (!active_table[i])
            continue;

        any = true;

        printf("║  Device #%-2d                                                                ║\n", i);
        printf("║  TID      : %.64s  ║\n", device_whitelist[i]);
        printf("║  short_id : %u\n", short_id_table[i]);
        printf("╠── Auth 1 ─────────────────────────────────────────────────────────────────╣\n");
        printf("║  CW : %s\n", cw_table[i][0] ? cw_table[i] : "(empty)");
        printf("║  RW : %s\n", rw_table[i][0] ? rw_table[i] : "(empty)");
        printf("╠── Auth 2 ─────────────────────────────────────────────────────────────────╣\n");
        printf("║  CW : %s\n", cw_table_auth2[i][0] ? cw_table_auth2[i] : "(empty)");
        printf("║  RW : %s\n", rw_table_auth2[i][0] ? rw_table_auth2[i] : "(empty)");
        printf("╚══════════════════════════════════════════════════════════════════════════════╝\n");
    }

    if (!any)
        printf("║  (no active devices)\n"
               "╚══════════════════════════════════════════════════════════════════════════════╝\n");
}