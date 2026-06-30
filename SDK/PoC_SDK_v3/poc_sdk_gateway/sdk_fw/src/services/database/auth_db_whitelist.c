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
    "800000000000000000000000000000185dcba84764025caa98c6c43032c8b433", // USB 1
    "8000000000000000000000000000001813ee114f3a061a3d6929ac91d9a1ca20",
    //"8000000000000000000000000000001813EE114F3A061A3D6929AC91D9A1CA20", // USB 2
    "80000000000000000000000000000018b99d9c43a98f7b7021ede0825809fbf6", // USB 3
    "80000000000000000000000000000018fb9365883684d7d641b218bd2becfa24" // USB 4
    /* Add more TIDs here */
};

const uint16_t auth_db_whitelist_count =
    sizeof(auth_db_whitelist) / sizeof(auth_db_whitelist[0]);