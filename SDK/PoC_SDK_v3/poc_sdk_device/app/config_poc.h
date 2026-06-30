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

/* ===================== MQTT =====================
 * Broker connection parameters.
 * ================================================ */
//#define MQTT_BROKER         "172.16.124.248"
//#define MQTT_PORT           1883
//#define MQTT_USER           "admin"
//#define MQTT_PASS           "changeme"
//#define MQTT_KEEPALIVE      60

#endif /* POC_CONFIG_H */
