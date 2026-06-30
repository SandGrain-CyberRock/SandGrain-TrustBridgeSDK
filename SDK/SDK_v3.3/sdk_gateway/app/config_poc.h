#ifndef POC_CONFIG_H
#define POC_CONFIG_H
/* =====================================================================
 * poc_config.h — Environment Configuration
 *
 * This is the ONLY file you need to edit to adapt the demo to your
 * hardware and network setup.
 *
 * Do NOT modify sdk_sgr_config.h directly.
 * ===================================================================== */

/* ===================== MULTI-DEVICE CHANNELS =====================
 * GW only — number of device channels to listen on.
 * channel_0 → PORT_BASE, channel_1 → PORT_BASE+1, ...
 * ================================================================ */
#define MAX_DEVICES     3
#define PORT_BASE       8080

/* ===================== USB / SPI =====================
 * Windows: COM port number (e.g. 3 for COM3)
 * Linux:   USB_TTY_PREFIX + USB_TTY_PORT  (e.g. "USB" + 0 → /dev/ttyUSB0,
 *                                                "ACM" + 0 → /dev/ttyACM0)
 *          - "USB" for USB-to-UART bridges (FTDI FT2232 0x0403:0x6014, CH340, CP210x)
 *          - "ACM" for native USB-CDC devices (STM32 USB-CDC, Pico, etc.)
 * ===================================================== */
#ifdef WIN32
    #define USB_COM_PORT    4
#else
    #define USB_TTY_PREFIX  "ACM"
    #define USB_TTY_PORT    0
#endif

/* ===================== USB PORT STRING =====================
 * Auto-generated from poc_config.h — do not modify.
 * ============================================================ */
#define STRINGIFY(x) #x
#define TOSTRING(x) STRINGIFY(x)

#ifdef WIN32
    #define USB_PORT_STRING "SERIAL" TOSTRING(USB_COM_PORT) ":115200,N,8,1,N,N"
#else
    #define USB_PORT_STRING "SERIAL" TOSTRING(USB_TTY_PORT) ":115200,N,8,1,N,N"
#endif

/* ===================== NATIVE SPI (Linux spidev) =====================
 * Used only when the build is invoked with `make TRANSPORT=spi`.
 * Inert when GW_CRYPTO_ENABLED=0 (default) — see sdk_sgr_config.h.
 *
 * Values match the SGT1001 datasheet (rev. May 2026):
 *   - SPI mode 0 (CPOL=0, CPHA=0), dedicated CSN, active-low.
 *   - Bit order: MSB first.
 *   - Word size: 8 bits.
 *   - fCLK max = 10 MHz at VDD 2.2-5.5 V (high-speed).
 *
 * SGT1001 max exchange = 824 clock cycles (103 bytes) — Mode 6 / Mode 7.
 * Verify the SBC's SPI driver supports this in a single transfer
 * (Linux spidev default bufsiz = 4096 bytes → OK).
 * Tset / Tend (≥ 1 SCK cycle) are handled by the kernel HW CS path.
 * ===================================================================== */
#define SPI_DEVICE_PATH      "/dev/spidev0.0"  /* set to your SBC's bus.cs */
#define SPI_MODE             0                 /* SGT1001: Mode 0 ✓ (CPOL=0, CPHA=0) */
#define SPI_MAX_HZ           10000000          /* SGT1001 fCLK max = 10 MHz (datasheet p.3) */
#define SPI_BITS_PER_WORD    8                 /* SGT1001: byte-oriented   */
#define SPI_CS_MODE_HW       1                 /* HW CS — datasheet has a dedicated CSN line */
#define SPI_CS_GPIO_CHIP     "gpiochip0"       /* only when SPI_CS_MODE_HW=0 */
#define SPI_CS_GPIO_LINE     8

/* ===================== MQTT =====================
 * Broker connection parameters.
 * ================================================ */
#define MQTT_BROKER         "127.0.0.1"
#define MQTT_PORT           1883
#define MQTT_USER           "admin"
#define MQTT_PASS           "changeme"
#define MQTT_KEEPALIVE      60

#endif /* POC_CONFIG_H */