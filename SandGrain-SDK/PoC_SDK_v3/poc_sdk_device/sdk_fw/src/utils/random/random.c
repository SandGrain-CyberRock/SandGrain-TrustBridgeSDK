/* =============================================================================
 * random.c
 *
 * Random byte generation — delegates to port_random_bytes().
 *
 * The implementation is platform-specific and lives in the port layer.
 * ============================================================================= */

#include "random.h"
#include "port_random.h"

void random_bytes(uint8_t *buf, size_t len)
{
    port_random_bytes(buf, len);
}
