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

/* ===================== MULTI-DEVICE CHANNELS =====================
 * GW only — number of device channels to listen on.
 * channel_0 → PORT_BASE, channel_1 → PORT_BASE+1, ...
 *
 * PORT_BASE is env-overridable via GW_BIND_PORT (set in .env by start-local.*).
 * Defaults to 8080. Override if 8080 is taken (e.g. Oracle TNSLSNR on Windows
 * Oracle XE installs). The device-side reads GW_PORT — keep both in sync.
 * ================================================================ */
#define MAX_DEVICES     3
#define PORT_BASE       (getenv("GW_BIND_PORT") ? atoi(getenv("GW_BIND_PORT")) : 8080)

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

/* ===================== MQTT =====================
 * Broker connection parameters.
 * ================================================ */
/* Env-overridable (the launchers export MQTT_BROKER/MQTT_PORT from .env);
 * falls back to these literals when the env var is unset. */
#define MQTT_BROKER         (getenv("MQTT_BROKER") ? getenv("MQTT_BROKER") : "127.0.0.1")
#define MQTT_PORT           (getenv("MQTT_PORT")   ? atoi(getenv("MQTT_PORT")) : 1883)
#define MQTT_USER           (getenv("MQTT_USER") && getenv("MQTT_USER")[0] ? getenv("MQTT_USER") : "sandgrain")
#define MQTT_PASS           (getenv("MQTT_PASS") && getenv("MQTT_PASS")[0] ? getenv("MQTT_PASS") : "admin")
/* Keepalive drives how often the client PINGs. 60s left the mostly-idle
 * gw_log / gw_presence / gw_whitelist connections silent long enough for a
 * NAT or firewall to reap the flow; the next PINGREQ then went into a dead
 * socket and libmosquitto tore the connection down itself with
 * MOSQ_ERR_KEEPALIVE (rc=19), which is the "drops every few minutes" seen
 * against a remote broker. A shorter interval keeps the flow warm and
 * detects a genuine break sooner, at the cost of a couple of packets a
 * minute. Env-overridable so the field can tune it without a rebuild. */
#define MQTT_KEEPALIVE      (getenv("MQTT_KEEPALIVE") ? atoi(getenv("MQTT_KEEPALIVE")) : 30)

#endif /* POC_CONFIG_H */