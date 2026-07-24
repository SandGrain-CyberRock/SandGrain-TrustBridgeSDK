/* =============================================================================
 * sandgrain.h
 *
 * Public entry point for the SandGrain device SDK.
 *
 * Integrators include this single header to get the full public API; no other
 * include is required:
 *
 *     #include "sandgrain.h"
 *
 * The other headers in sdk_fw/include/ (sdk_sgr_user_api.h, sdk_sgr_types.h,
 * sdk_sgr_config.h, sdk_sgr_errors.h) are internal organizational units that
 * may be reorganized between SDK versions. Including them directly is not
 * supported.
 *
 * Quick start (device side):
 *
 *     sgr_sdk_comm_interface_t comm;
 *     comm_adapter_get_interface(&comm);
 *     SGR_SDK_SetCommInterface(&comm);
 *     SGR_SDK_Initialize();
 *     SGR_SDK_Authenticate_Via_GW();
 * ============================================================================= */

#ifndef SANDGRAIN_H
#define SANDGRAIN_H

#include "sdk_sgr_config.h"
#include "sdk_sgr_errors.h"
#include "sdk_sgr_types.h"
#include "sdk_sgr_user_api.h"

#endif /* SANDGRAIN_H */
