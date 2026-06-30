#ifndef SGR_CONFIG_H
#define SGR_CONFIG_H

#define MAX_DEVICES     3

/* =====================================================================
 * sdk_sgr_config.h — SDK Internal Configuration
 *
 * Do NOT modify this file.
 * To configure your node, edit poc_config.h instead.
 * ===================================================================== */

/* ── SDK mode constants ───────────────────────────────────────────── */
#define DEVICE_MODE     0
#define GATEWAY_MODE    1

/* ===================== NODE MODE =====================
 * DEVICE_MODE  → token node, authenticates via GW
 * GATEWAY_MODE → GW node, handles device requests + cloud
 * ===================================================== */
#define SDK_MODE        GATEWAY_MODE

/* ===================== CRYPTO CHIP =====================
 * 1 = GW has its own crypto token connected via USB/SPI
 * 0 = GW does not require a crypto token
 * ======================================================= */
#define GW_CRYPTO_ENABLED  0

/* ── Include environment configuration ───────────────────────────── */


/* ===================== CRC VALIDATION =====================
 * 1 = Enable CRC checks (recommended for production)
 * 0 = Disable CRC checks (for testing/debugging only)
 * ========================================================== */
#define CRC_ENABLE 0


/* ===================== RETRY CONFIGURATION =====================
 * Internal SDK retry limits — do not modify.
 * ============================================================== */
#define MAX_RETRIES          4
#define GW_MAX_RETRIES       3
#define CW_BITFLIP_THRESHOLD 3
#define RW_BITFLIP_THRESHOLD 3

/* ===================== DEBUG CONFIGURATION =====================
 * Set to 1 to enable, 0 to disable per module.
 * Can be overridden via compiler flags (-DMW_DEBUG=0).
 * ============================================================== */
#ifndef MW_DEBUG
    #define MW_DEBUG                1
#endif

#ifndef PORT_COMM_DEBUG
    #define PORT_COMM_DEBUG         1
#endif

#ifndef PORT_COMM_INPUT_DEBUG
    #define PORT_COMM_INPUT_DEBUG   1
#endif

#ifndef PORT_COMM_DEVICE_DEBUG
    #define PORT_COMM_DEVICE_DEBUG  1
#endif

#ifndef APP_GW_DEBUG
    #define APP_GW_DEBUG            1
#endif

#ifndef MW_GW_DEBUG
    #define MW_GW_DEBUG             1
#endif

/* ===================== PARAMETER VALIDATION =====================
 * Do not modify this section.
 * =============================================================== */
#if MAX_RETRIES < 0
    #warning "MAX_RETRIES is less than 0, forcing to 0"
    #undef  MAX_RETRIES
    #define MAX_RETRIES 0
#endif



/* ===================== PARAMETER VALIDATION =====================
 * Do not modify this section.
 * =============================================================== */
#if (SDK_MODE != DEVICE_MODE) && (SDK_MODE != GATEWAY_MODE)
    #error "SDK_MODE must be either DEVICE_MODE or GATEWAY_MODE"
#endif

#endif /* SGR_CONFIG_H */