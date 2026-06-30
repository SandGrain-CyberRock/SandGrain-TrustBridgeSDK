/* =============================================================================
 * auth_db_whitelist.c
 *
 * List of authorized device TIDs.
 * Only devices whose TID appears here can register with the Gateway.
 *
 * Format: 64-character hex string (32 bytes).
 * ============================================================================= */

#include "auth_db.h"

const char *auth_db_whitelist[] = {
    "800000000000000000000000000000180a72d37e7592f9e89fc9e0b54b7ae9bc"
    /* Add more TIDs here */
};

const uint16_t auth_db_whitelist_count =
    sizeof(auth_db_whitelist) / sizeof(auth_db_whitelist[0]);