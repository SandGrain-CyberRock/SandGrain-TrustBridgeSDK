/*#include <stdint.h>

void delay(uint16_t time_us);

*/

#ifndef DELAY_H
#define DELAY_H

#include <stdint.h>
#include <stdbool.h>

typedef enum
{
    DELAY_OK = 0,
    DELAY_ERROR,
    DELAY_INVALID_PARAM,
    DELAY_NOT_INITIALIZED
} delay_status_t;

delay_status_t delay_init(void);
delay_status_t delay_ms(uint32_t ms);
delay_status_t delay_us(uint32_t us);
delay_status_t delay_close(void);

#endif /* DELAY_H */
