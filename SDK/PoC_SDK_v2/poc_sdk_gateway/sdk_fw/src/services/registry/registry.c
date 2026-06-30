#include <string.h>
#include <stdio.h>
#include "registry.h"
#include "registry.h"

/* =====================================================================
 * Internal table
 * ===================================================================== */
typedef struct
{
    char     tid_hex[REGISTRY_TID_BUF_SIZE];  /* Native token ID (hex string) */
    uint16_t short_id;                         /* Assigned short ID (1-1000)   */
    bool     active;                           /* Slot in use                  */
} registry_entry_t;

static registry_entry_t registry_table[REGISTRY_MAX_DEVICES];
static uint16_t         registry_device_count = 0;

/* =====================================================================
 * registry_init
 * ===================================================================== */
void registry_init(void)
{
    memset(registry_table, 0, sizeof(registry_table));
    registry_device_count = 0;
}

/* =====================================================================
 * registry_register
 * ===================================================================== */
registry_status_t registry_register(const char *tid_hex, uint16_t *short_id_out)
{
    if (!tid_hex || !short_id_out)
        return REGISTRY_INVALID_PARAM;

    /* ---- Step 1: Check if device is already registered ---- */
    for (uint16_t i = 0; i < REGISTRY_MAX_DEVICES; i++)
    {
        if (registry_table[i].active &&
            strncmp(registry_table[i].tid_hex, tid_hex, REGISTRY_TID_HEX_LEN) == 0)
        {
            *short_id_out = registry_table[i].short_id;
            printf("[REGISTRY] Device already registered — short_id = %u\n", *short_id_out);
            return REGISTRY_ALREADY_REGISTERED;
        }
    }

    /* ---- Step 2: Find first free short_id (1-based, first free slot) ---- */
    uint16_t assigned_id = 0;

    for (uint16_t candidate = REGISTRY_SHORT_ID_MIN; candidate <= REGISTRY_SHORT_ID_MAX; candidate++)
    {
        bool in_use = false;

        for (uint16_t i = 0; i < REGISTRY_MAX_DEVICES; i++)
        {
            if (registry_table[i].active && registry_table[i].short_id == candidate)
            {
                in_use = true;
                break;
            }
        }

        if (!in_use)
        {
            assigned_id = candidate;
            break;
        }
    }

    if (assigned_id == 0)
    {
        printf("[REGISTRY] Table full — cannot register new device\n");
        return REGISTRY_FULL;
    }

    /* ---- Step 3: Find a free slot in the table ---- */
    for (uint16_t i = 0; i < REGISTRY_MAX_DEVICES; i++)
    {
        if (!registry_table[i].active)
        {
            strncpy(registry_table[i].tid_hex, tid_hex, REGISTRY_TID_HEX_LEN);
            registry_table[i].tid_hex[REGISTRY_TID_HEX_LEN] = '\0';
            registry_table[i].short_id = assigned_id;
            registry_table[i].active   = true;

            registry_device_count++;
            *short_id_out = assigned_id;

            printf("[REGISTRY] Device registered — short_id = %u | tid = %.16s...\n",
                   assigned_id, tid_hex);

            return REGISTRY_OK;
        }
    }

    return REGISTRY_FULL;
}

/* =====================================================================
 * registry_lookup
 * ===================================================================== */
registry_status_t registry_lookup(uint16_t short_id, char *tid_hex_out)
{
    if (!tid_hex_out)
        return REGISTRY_INVALID_PARAM;

    for (uint16_t i = 0; i < REGISTRY_MAX_DEVICES; i++)
    {
        if (registry_table[i].active && registry_table[i].short_id == short_id)
        {
            strncpy(tid_hex_out, registry_table[i].tid_hex, REGISTRY_TID_BUF_SIZE);
            return REGISTRY_OK;
        }
    }

    printf("[REGISTRY] short_id %u not found\n", short_id);
    return REGISTRY_NOT_FOUND;
}

/* =====================================================================
 * registry_reset
 * ===================================================================== */
void registry_reset(void)
{
    memset(registry_table, 0, sizeof(registry_table));
    registry_device_count = 0;
    printf("[REGISTRY] Table cleared\n");
}

/* =====================================================================
 * registry_count
 * ===================================================================== */
uint16_t registry_count(void)
{
    return registry_device_count;
}