#ifndef DEVICE_DATABASE_H
#define DEVICE_DATABASE_H

#include <stdint.h>
#include <stdbool.h>

/* ===================== CONFIGURATION ===================== */

#define DEVICES_DATABASE_MAX  100
#define TID_HEX_LEN           64
#define CW_HEX_LEN            64
#define RW_HEX_LEN            32

/* ===================== WHITELIST =====================
 * Read-only list of authorized TIDs.
 * The client configures this in device_whitelist.c.
 * ===================================================== */
extern const char    *device_whitelist[];
extern const uint16_t device_whitelist_count;

/* ===================== RUNTIME TABLES =====================
 * All arrays share the same index.
 * Index i corresponds to device_whitelist[i].
 * ========================================================= */
extern uint16_t short_id_table[DEVICES_DATABASE_MAX]; /* CRC of TID     */
extern char     cw_table[DEVICES_DATABASE_MAX][CW_HEX_LEN + 1];
extern char     rw_table[DEVICES_DATABASE_MAX][RW_HEX_LEN + 1];
extern char     cw_table_auth2[DEVICES_DATABASE_MAX][CW_HEX_LEN + 1];  /* Auth 2 */
extern char     rw_table_auth2[DEVICES_DATABASE_MAX][RW_HEX_LEN + 1];  /* Auth 2 */
extern bool     active_table[DEVICES_DATABASE_MAX];   /* true = registered */

/* ===================== STATUS ===================== */
typedef enum {
    DEVICE_DB_OK               = 0,
    DEVICE_DB_NOT_FOUND        = 1,
    DEVICE_DB_ALREADY_ACTIVE   = 2,
    DEVICE_DB_FULL             = 3,
    DEVICE_DB_ERROR            = 4
} device_db_status_t;

/* ===================== API ===================== */
/**
 * Print full authentication session table for all active devices.
 * Shows TID, short_id, CW/RW from both auth phases.
 */
void device_db_print_session(void);

/**
 * Initialize runtime tables (clear all entries).
 * Must be called once at startup.
 */
void device_db_init(void);

/**
 * Find device index by TID hex string.
 * Returns index (0..N-1) or -1 if not found in whitelist.
 */
int device_db_find_by_tid(const char *tid_hex);

/**
 * Find device index by short_id (CRC).
 * Returns index (0..N-1) or -1 if not found or not active.
 */
int device_db_find_by_short_id(uint16_t short_id);

/**
 * Register a device by TID.
 * Looks up TID in whitelist, computes CRC as short_id,
 * marks as active and stores short_id.
 * Returns status and fills short_id_out.
 */
device_db_status_t device_db_register(const char *tid_hex, uint16_t *short_id_out);

/**
 * Resolve short_id to tid_hex.
 * Fills tid_hex_out (must be at least TID_HEX_LEN+1 bytes).
 * Returns DEVICE_DB_OK or DEVICE_DB_NOT_FOUND.
 */
device_db_status_t device_db_resolve(uint16_t short_id, char *tid_hex_out);

#endif /* DEVICE_DATABASE_H */