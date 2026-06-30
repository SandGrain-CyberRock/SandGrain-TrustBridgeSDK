#ifndef FAULT_INJECTION_H
#define FAULT_INJECTION_H

#include <stdint.h>

extern volatile uint8_t g_fault_injection_enable_comm_tx;
extern volatile uint8_t g_fault_injection_enable_comm_rx;

extern volatile uint8_t g_fault_injection_enable_spi_tx;
extern volatile uint8_t g_fault_injection_enable_spi_rx;




#endif


