#ifndef POC_CONFIG_H
#define POC_CONFIG_H

#include <stdlib.h>   /* getenv, atoi — for the env-overridable settings below */
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
/* Env-overridable (the launchers export GW_HOST/GW_PORT from .env);
 * defaults to localhost:8080 (not a stale LAN IP). */
#define PORT        (getenv("GW_PORT") ? atoi(getenv("GW_PORT")) : 8080)
#define SERVER_IP   (getenv("GW_HOST") ? getenv("GW_HOST") : "127.0.0.1")

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
/* The BE-driven listener in main_device.c (start_listener) connects to the
 * broker, so MQTT_BROKER/MQTT_PORT/MQTT_KEEPALIVE must be defined. They're
 * env-overridable (read from .env) with localhost fallbacks.
 * MQTT_USER/MQTT_PASS default to empty: the listener then connects
 * anonymously (no mosquitto_username_pw_set call). Set them via .env when the
 * broker requires authentication and start_listener() will authenticate. */
#define MQTT_BROKER         (getenv("MQTT_BROKER") ? getenv("MQTT_BROKER") : "127.0.0.1")
#define MQTT_PORT           (getenv("MQTT_PORT")   ? atoi(getenv("MQTT_PORT")) : 1883)
#define MQTT_USER           (getenv("MQTT_USER") ? getenv("MQTT_USER") : "")
#define MQTT_PASS           (getenv("MQTT_PASS") ? getenv("MQTT_PASS") : "")
#define MQTT_KEEPALIVE      60

#endif /* POC_CONFIG_H */
