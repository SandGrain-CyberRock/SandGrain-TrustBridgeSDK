#ifndef PORT_DELAY_H
#define PORT_DELAY_H

#include <stdint.h>
#include <stdbool.h>

bool port_delay_init(void);
void port_delay_ms(uint32_t ms);
void port_delay_us(uint32_t us);
void port_delay_close(void);

#endif /* PORT_DELAY_H */
