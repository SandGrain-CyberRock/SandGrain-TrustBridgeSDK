/* =============================================================================
 * port_random.c - Zephyr implementation of the SDK random port.
 *
 * Not exercised on the device path (random_bytes() is only called in
 * GATEWAY_MODE), but provided so the SDK's random.c links cleanly.
 * ============================================================================= */
#include "port_random.h"

#include <zephyr/random/random.h>

bool port_random_bytes(uint8_t *buf, size_t len)
{
	if (buf == NULL || len == 0) {
		return false;
	}

	sys_rand_get(buf, len);
	return true;
}
