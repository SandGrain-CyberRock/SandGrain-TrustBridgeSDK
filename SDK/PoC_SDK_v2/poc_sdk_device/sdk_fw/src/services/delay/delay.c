#include "delay.h"
#include "../../../port/port_delay.h"

static bool delay_initialized = false;

delay_status_t delay_init(void)
{
    delay_status_t status = DELAY_ERROR;

    if (!delay_initialized)
    {
        if (port_delay_init())
        {
            delay_initialized = true;
            status = DELAY_OK;
        }
    }
    else
    {
        status = DELAY_OK;
    }

    return status;
}

delay_status_t delay_ms(uint32_t ms)
{
    if (!delay_initialized)
        return DELAY_NOT_INITIALIZED;

    if (ms == 0U)
        return DELAY_INVALID_PARAM;

    port_delay_ms(ms);
    return DELAY_OK;
}

delay_status_t delay_us(uint32_t us)
{
    if (!delay_initialized)
        return DELAY_NOT_INITIALIZED;

    if (us == 0U)
        return DELAY_INVALID_PARAM;

    port_delay_us(us);
    return DELAY_OK;
}

delay_status_t delay_close(void)
{
    delay_status_t status = DELAY_ERROR;

    if (delay_initialized)
    {
        port_delay_close();
        delay_initialized = false;
        status = DELAY_OK;
    }

    return status;
}
