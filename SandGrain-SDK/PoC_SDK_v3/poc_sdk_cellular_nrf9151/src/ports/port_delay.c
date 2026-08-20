/* =============================================================================
 * port_delay.c - Zephyr implementation of the SDK delay port.
 * ============================================================================= */
#include "port_delay.h"

#include <zephyr/kernel.h>

bool port_delay_init(void)
{
	return true;
}

void port_delay_ms(uint32_t ms)
{
	k_msleep(ms);
}

void port_delay_us(uint32_t us)
{
	k_busy_wait(us);
}

void port_delay_close(void)
{
}
