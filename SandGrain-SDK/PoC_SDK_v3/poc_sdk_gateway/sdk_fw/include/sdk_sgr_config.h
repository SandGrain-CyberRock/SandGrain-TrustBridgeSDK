#ifndef SGR_CONFIG_H
#define SGR_CONFIG_H

/* =====================================================================
 * sdk_sgr_config.h - SDK Internal Configuration
 *
 * This file must NOT be modified.
 * All parameters are overridable via compiler flags (-DPARAM=value).
 *
 * For a PoC or application, pass the required flags from your Makefile:
 *   -DSDK_MODE=DEVICE_MODE  or  -DSDK_MODE=GATEWAY_MODE
 *   -DMAX_DEVICES=1
 *   -DCRC_ENABLE=1
 * ===================================================================== */

/* -- SDK mode constants --------------------------------------------- */
#define DEVICE_MODE     0
#define GATEWAY_MODE    1

/* ===================== NODE MODE =====================
 * Must be provided by the build system.
 * Default: DEVICE_MODE
 * ===================================================== */
#ifndef SDK_MODE
    #define SDK_MODE    DEVICE_MODE
#endif

/* ===================== MAX DEVICES =====================
 * Maximum number of simultaneous device channels (GW only).
 * Default: 1 (typical for MCU targets)
 * ======================================================= */
#ifndef MAX_DEVICES
    #define MAX_DEVICES     3
#endif

/* ===================== CRYPTO CHIP =====================
 * 1 = GW has its own crypto token connected via USB/SPI
 * 0 = GW does not require a crypto token
 * ======================================================= */
#ifndef GW_CRYPTO_ENABLED
    #define GW_CRYPTO_ENABLED   0
#endif

/* ===================== CRC VALIDATION =====================
 * 1 = Enable CRC checks (recommended for production)
 * 0 = Disable CRC checks (for testing/debugging only)
 * Default: 0 (disabled for PoC/testing)
 * ========================================================== */
#ifndef CRC_ENABLE
    #define CRC_ENABLE  0
#endif

/* ===================== RETRY CONFIGURATION =====================
 * Internal SDK retry limits.
 * ============================================================== */
#ifndef MAX_RETRIES
    #define MAX_RETRIES         4
#endif

#ifndef GW_MAX_RETRIES
    #define GW_MAX_RETRIES      3
#endif

/* ===================== BITFLIP THRESHOLDS =====================
 * Maximum number of differing bits tolerated before authentication
 * fails or Error Management is triggered.
 * CW_BITFLIP_THRESHOLD: applied to CW vs CW echo comparison.
 * RW_BITFLIP_THRESHOLD: applied to RW device vs RW server comparison.
 * Default: 3 - adjust based on channel noise characteristics.
 * Override via compiler flags (e.g. -DCW_BITFLIP_THRESHOLD=2).
 * ============================================================== */
#ifndef CW_BITFLIP_THRESHOLD
    #define CW_BITFLIP_THRESHOLD    3
#endif

#ifndef RW_BITFLIP_THRESHOLD
    #define RW_BITFLIP_THRESHOLD    3
#endif

#if CW_BITFLIP_THRESHOLD < 0
    #warning "CW_BITFLIP_THRESHOLD is less than 0, forcing to 0"
    #undef  CW_BITFLIP_THRESHOLD
    #define CW_BITFLIP_THRESHOLD    0
#endif

#if RW_BITFLIP_THRESHOLD < 0
    #warning "RW_BITFLIP_THRESHOLD is less than 0, forcing to 0"
    #undef  RW_BITFLIP_THRESHOLD
    #define RW_BITFLIP_THRESHOLD    0
#endif

/* ===================== DEBUG CONFIGURATION =====================
 * Set to 1 to enable, 0 to disable per module.
 * Override via compiler flags (e.g. -DMW_DEBUG=0).
 * Default: 1 (enabled - disable explicitly for MCU release builds)
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

#if (SDK_MODE != DEVICE_MODE) && (SDK_MODE != GATEWAY_MODE)
    #error "SDK_MODE must be either DEVICE_MODE or GATEWAY_MODE"
#endif

#endif /* SGR_CONFIG_H */
