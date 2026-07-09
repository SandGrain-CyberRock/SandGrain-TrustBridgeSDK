/* =============================================================================
 * port_random.c
 *
 * Cryptographic random byte generation — PC implementation.
 *
 *   Windows — BCryptGenRandom (CNG)
 *   Linux   — /dev/urandom
 * ============================================================================= */

#include "port_random.h"
#include <string.h>

#ifdef _WIN32
    #include <windows.h>
    #include <bcrypt.h>
    #pragma comment(lib, "bcrypt.lib")
#else
    #include <stdio.h>
#endif

bool port_random_bytes(uint8_t *buf, size_t len)
{
    if (!buf || len == 0)
        return false;

#ifdef _WIN32
    NTSTATUS status = BCryptGenRandom(NULL, (PUCHAR)buf, (ULONG)len,
                                      BCRYPT_USE_SYSTEM_PREFERRED_RNG);
    return BCRYPT_SUCCESS(status);
#else
    FILE *f = fopen("/dev/urandom", "rb");
    if (!f)
        return false;
    size_t read = fread(buf, 1, len, f);
    fclose(f);
    return (read == len);
#endif
}
