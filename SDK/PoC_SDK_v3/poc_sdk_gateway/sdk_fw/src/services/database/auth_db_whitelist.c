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
    "80000000000000000000000000000024a57c6163979d46dd84efb24906349c64",
    "8000000000000000000000000000002423dc3ae5e528dc653377172c7f4be01b"
    /* Add more TIDs here */
};

const uint16_t auth_db_whitelist_count =
    sizeof(auth_db_whitelist) / sizeof(auth_db_whitelist[0]);