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
    "80000000000000000000000000000024ad8fc3d839e09ca8aba9474002e7d185"
    /* Add more TIDs here */
};

const uint16_t auth_db_whitelist_count =
    sizeof(auth_db_whitelist) / sizeof(auth_db_whitelist[0]);