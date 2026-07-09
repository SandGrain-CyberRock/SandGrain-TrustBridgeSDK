#include "../../../port/port_delay.h"
#include <unistd.h>

bool port_delay_init(void)
{
    return true;
}

void port_delay_ms(uint32_t ms)
{
    usleep(ms * 1000U);
}

void port_delay_us(uint32_t us)
{
    usleep(us);
}

void port_delay_close(void)
{
    /* Nothing to release on Linux */
}
