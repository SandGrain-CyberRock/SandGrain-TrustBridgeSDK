#ifndef REGISTRY_H
#define REGISTRY_H

#include <stdint.h>
#include <stdbool.h>

/* =====================================================================
 * Registry Service
 *
 * Manages the registration table of DEVICE nodes in GATEWAY_MODE.
 * Each entry maps a native token ID (tid_hex) to a short_id (1-1000).
 *
 * - Table lives in RAM: resets on Gateway power cycle.
 * - short_id is assigned by finding the first free slot (starting at 1).
 * - A device that reconnects after a GW reset must re-register.
 * ===================================================================== */

#define REGISTRY_MAX_DEVICES    100
#define REGISTRY_SHORT_ID_MIN   1
#define REGISTRY_SHORT_ID_MAX   1000
#define REGISTRY_TID_HEX_LEN    64      /* 32 bytes → 64 hex chars, no null */
#define REGISTRY_TID_BUF_SIZE   (REGISTRY_TID_HEX_LEN + 1)

/* ===================== Return status ===================== */
typedef enum
{
    REGISTRY_OK = 0,
    REGISTRY_ALREADY_REGISTERED,    /* Device was already in the table     */
    REGISTRY_FULL,                  /* No free slots available             */
    REGISTRY_NOT_FOUND,             /* short_id not found in table         */
    REGISTRY_INVALID_PARAM          /* NULL or invalid argument            */
} registry_status_t;

/* ===================== Public API ===================== */

/**
 * @brief Initialize the registry table (all slots marked as free).
 *        Must be called once at Gateway startup.
 */
void registry_init(void);

/**
 * @brief Register a device by its native token ID.
 *
 * If the device is already registered, returns REGISTRY_ALREADY_REGISTERED
 * and fills short_id_out with the existing value.
 *
 * If the device is new, assigns the first free short_id and returns REGISTRY_OK.
 *
 * @param tid_hex       Native token ID as hex string (64 chars + null).
 * @param short_id_out  Output: assigned short_id.
 * @return registry_status_t
 */
registry_status_t registry_register(const char *tid_hex, uint16_t *short_id_out);

/**
 * @brief Look up a native token ID by short_id.
 *
 * @param short_id      Short ID to look up.
 * @param tid_hex_out   Output buffer for the native token ID (must be REGISTRY_TID_BUF_SIZE).
 * @return registry_status_t
 */
registry_status_t registry_lookup(uint16_t short_id, char *tid_hex_out);

/**
 * @brief Clear all entries from the registry table.
 */
void registry_reset(void);

/**
 * @brief Get the number of currently registered devices.
 */
uint16_t registry_count(void);

#endif /* REGISTRY_H */