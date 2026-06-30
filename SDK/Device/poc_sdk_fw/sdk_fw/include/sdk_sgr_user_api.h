#include <stdint.h>
#include <string.h>
#include "sdk_sgr_config.h"
#include "sdk_sgr_errors.h"
#include "sdk_sgr_types.h"

sgr_sdk_status_t SGR_SDK_Initialize(void);

sgr_sdk_status_t SGR_SDK_Authentication_Token_To_Server(void);

sgr_sdk_status_t SGR_SDK_Authentication_Server_To_Token(void);