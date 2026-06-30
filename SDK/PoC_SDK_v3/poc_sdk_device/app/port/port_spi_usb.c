//#include "sdk_sgr_config.h"
#include "config_poc.h"
#include "../../port/port_spi.h"
#include <string.h>
#include <stdio.h>
#include <unistd.h>
#include "../../src/utils/rs232/rs232.h"
#include "../../src/utils/encoding/encoding_hex.h"

#define VID 0x0403
#define PID 0x6014

#define PIN_CLK   0x01   // AD0
#define PIN_MOSI  0x02   // AD1
#define PIN_CS    0x08   // AD3


uint16_t total, n;
                                 
uint8_t tx_dummy_33[33] = {0};
uint8_t tx_dummy_32[32] = {0};
uint8_t tx_dummy_16[16] = {0};

uint8_t size_oficial = 0;

uint8_t buf[3];

volatile uint8_t g_fault_injection_enable_spi_rx = 0;
volatile uint8_t g_fault_injection_enable_spi_tx = 0;

static rs232_handle c_h=-1;
static rs232_conf_st c_conf;
static rs232_return_code ret;
static uint8_t l_buffer[200];

bool port_spi_initialize(void)
{
    int res;

	//res = RS232_Parse_Uart_Info_Str((char *)"SERIAL0:115200,N,8,1,N,N", &c_conf);
	//res = RS232_Parse_Uart_Info_Str((char *)"CSOCKET:127.0.0.1:1234,N,N", &c_conf);
    res = RS232_Parse_Uart_Info_Str((char *)USB_PORT_STRING, &c_conf);

	if (res != -1)
	{
		c_conf.sd_buffer_size = 4600;
		ret = RS232_Open(c_conf.uart_desc, &c_h, &c_conf);
        if (ret==rs232_success)
        {
            // RS232_Write(c_h,(uint8_t *)"Hello world!\r\n",13);
            return true;
        }
    }

    return false;
}

bool port_spi_cs_enable(void){

    return true;
}
bool port_spi_cs_disable(void)
{

    return true;
}
bool port_spi_TransmitReceive(uint8_t *tx_buffer, uint8_t *rx_buffer, uint16_t size)
{
    // Fault injection ONLY in transmission
    if (g_fault_injection_enable_spi_tx == 1)
    {
        if (size > 20) {
            tx_buffer[20] = 'F';   // Corruption of a byte TX
            printf("[FAULT][SPI][TX] Byte 20 corrupted\n");
        }
    }
    //!< sends size bytes and receives size also
    //!< send part
    uint16_t nc;
    int res, rsize;
    ret = rs232_error_invalid_uart_handle;
    res = bytes_to_hex(tx_buffer, size, l_buffer, sizeof(l_buffer));

    if (!res)
        ret = RS232_Printf(c_h,"%s\r",l_buffer);
    else return false;
    
    rsize = strlen(l_buffer)+1;
    
    //!< receive part

    if (ret==rs232_success)
        ret = RS232_Read(c_h,l_buffer, rsize, &nc, 1000);

    if (nc>0)
        res= hex_to_bytes((const char *)l_buffer,rx_buffer,nc);
    else 
        return false;

    if (g_fault_injection_enable_spi_rx == 1) 
    {

        if (size > 20) {
            rx_buffer[20] = 0xFF;   // Byte corruption
            printf("[FAULT][SPI][RX] Byte 20 corrupted\n");
        }
    }

    return ret == rs232_success;

}
bool port_spi_close(void)
{
    RS232_Close(c_h);
    
    return true;
}