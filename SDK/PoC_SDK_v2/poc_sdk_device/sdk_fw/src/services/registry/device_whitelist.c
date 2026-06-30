#include "device_database.h"

/* =====================================================================
 * DEVICE WHITELIST — CLIENT CONFIGURATION
 *
 * Add all authorized TID hex strings here.
 * Only devices whose TID appears in this list will be allowed to
 * register with the Gateway.
 *
 * Format: 64-character hex string (32 bytes).
 * ===================================================================== */

const char *device_whitelist[] = {
    "800000000000000000000000000000185dcba84764025caa98c6c43032c8b433",
    "8000000000000000000000000000001813ee114f3a061a3d6929ac91d9a1ca20",
    /* Add more TIDs here */
};

const uint16_t device_whitelist_count =
    sizeof(device_whitelist) / sizeof(device_whitelist[0]);