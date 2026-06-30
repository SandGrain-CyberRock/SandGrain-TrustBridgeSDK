#include "../../../port/port_comm.h"
#include "comm.h"
#include <stddef.h>

/* ===================== INTERNAL STATE ===================== */

/* Indicates whether the communication service has been initialized */
static bool comm_initialized = false;

/* ===================== COMM API ===================== */

comm_status_t comm_init(const char *device_id)
{
    comm_status_t status = COMM_ERROR;   /* Default fail-safe */

    if (!comm_initialized)
    {
        if (port_comm_init(device_id))
        {
            comm_initialized = true;
            status = COMM_OK;
        }
        else
        {
            status = COMM_HW_ERROR;
        }
    }
    else
    {
        /* Already initialized */
        status = COMM_OK;
    }

    return status;
}

comm_status_t comm_send(const uint8_t *data, uint16_t size)
{
    comm_status_t status = COMM_ERROR;   /* Default fail-safe */

    if (comm_initialized)
    {
        if ((data != NULL) && (size > 0U))
        {
            /* Data is sent directly through the communication port */
            if (port_comm_send(data, size))
            {
                status = COMM_OK;
            }
            else
            {
                status = COMM_HW_ERROR;
            }
        }
        else
        {
            status = COMM_INVALID_PARAM;
        }
    }
    /* else: service not initialized, status remains COMM_ERROR */

    return status;
}

comm_status_t comm_receive(uint8_t *buffer, uint16_t buffer_size, uint16_t *received_size)
{
    comm_status_t status = COMM_ERROR;   /* Default fail-safe */

    if (comm_initialized)
    {
        if ((buffer != NULL) && (buffer_size > 0U) && (received_size != NULL))
        {
            /* Safe default before reception */
            *received_size = 0U;

            if (port_comm_receive(buffer, buffer_size, received_size))
            {
                status = COMM_OK;
            }
            else
            {
                status = COMM_HW_ERROR;
            }
        }
        else
        {
            status = COMM_INVALID_PARAM;
        }
    }
    /* else: service not initialized, status remains COMM_ERROR */

    return status;
}

comm_status_t comm_close(void)
{
    comm_status_t status = COMM_ERROR;

    if (comm_initialized)
    {
        /* Delegate resource release to portability layer */
        port_comm_close();

        /* Update internal service state */
        comm_initialized = false;

        status = COMM_OK;
    }
    else
    {
        /* Service was not initialized */
        status = COMM_ERROR;
    }

    return status;
}
