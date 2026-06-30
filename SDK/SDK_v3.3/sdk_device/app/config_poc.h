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

/* ===================== NETWORK =====================
 * GW socket configuration.
 * ===================================================== */
#define PORT           8080
#define SERVER_IP   "192.168.0.249"

/* ===================== USB / SPI =====================
 * Windows: COM port number (e.g. 3 for COM3)
 * Linux:   USB_TTY_PREFIX + USB_TTY_PORT  (e.g. "ACM" + 0 → /dev/ttyACM0,
 *                                                "USB" + 0 → /dev/ttyUSB0)
 *          - "ACM" for native USB-CDC devices (STM32 USB-CDC, Pico, etc.)
 *          - "USB" for USB-to-UART bridges (FTDI, CH340, CP210x, PL2303)
 * ===================================================== */
#ifdef WIN32
    #define USB_COM_PORT    4
    //#define USB_COM_PORT    3
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
 *
 * Values below are CONFIRMED against the SGT1001 datasheet (rev. May 2026):
 *   - SPI mode 0 (CPOL=0, CPHA=0), dedicated CSN, active-low.
 *   - Bit order: MSB first ("All headers are sent MSB first left to right").
 *   - Word size: 8 bits.
 *   - VDD: 2.2–5.5 V for SCK > 1 MHz (high-speed);
 *          1.8–5.5 V for SCK ≤ 1 MHz (low-speed).
 *     Pi runs at 3.3 V → high-speed is permitted once wiring is stable.
 *
 * Open: the datasheet's absolute SCK_max value is not yet locked here.
 *       Start at 1 MHz (safe at any supply); raise after first successful
 *       BIST and verify against the SGT1001 AC characteristics table.
 *
 * - SPI_DEVICE_PATH : kernel spidev node; /dev/spidev<bus>.<cs>.
 *                    Pi default: 0.0 (CE0) / 0.1 (CE1). Wire SGT1001 CSN
 *                    to the matching SBC CE pin.
 * - SPI_CS_MODE_HW  : 1 = let the SPI controller drive CSN automatically
 *                         (cs_enable / cs_disable are no-ops).
 *                    0 = drive CS manually via libgpiod (SPI_CS_GPIO_*).
 *                    Datasheet says "dedicated CSN signal" — HW CS is fine
 *                    unless your wiring routes CSN to a non-SPI GPIO.
 * ===================================================================== */
#define SPI_DEVICE_PATH      "/dev/spidev0.0"  /* set to your SBC's bus.cs */
#define SPI_MODE             0                 /* SGT1001: Mode 0 ✓ (CPOL=0, CPHA=0) */
#define SPI_MAX_HZ           10000000          /* SGT1001 fCLK max = 10 MHz (datasheet p.3) */
#define SPI_BITS_PER_WORD    8                 /* SGT1001: byte-oriented   */
#define SPI_CS_MODE_HW       1                 /* HW CS — datasheet has a dedicated CSN line */
#define SPI_CS_GPIO_CHIP     "gpiochip0"       /* only when SPI_CS_MODE_HW=0 */
#define SPI_CS_GPIO_LINE     8

/* SGT1001 max exchange length is 824 clock cycles (103 bytes) — Mode 6 / Mode 7.
 * Verify your SBC's SPI driver supports this size in a single transfer:
 *   - Linux spidev on Raspberry Pi: default bufsiz = 4096 bytes → OK.
 *   - Some MCUs auto-deassert CS after 256 cycles → use manual CS via libgpiod.
 * Tset / Tend (≥ 1 SCK cycle) are handled by the kernel HW CS path. */

/* ===================== MQTT =====================
 * Broker connection parameters.
 * ================================================ */
//#define MQTT_BROKER         "172.16.124.248"
//#define MQTT_PORT           1883
//#define MQTT_USER           "admin"
//#define MQTT_PASS           "changeme"
//#define MQTT_KEEPALIVE      60

#endif /* POC_CONFIG_H */
