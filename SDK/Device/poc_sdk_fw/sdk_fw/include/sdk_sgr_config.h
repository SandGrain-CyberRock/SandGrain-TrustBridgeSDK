#ifndef SGR_CONFIG_H
#define SGR_CONFIG_H

/* =====================================================================
 * SGR SDK - Client Configuration File
 * 
 * This file exposes all user-configurable parameters for the SDK.
 * Modify only this file to adapt the SDK to your project needs.
 * ===================================================================== */

 /* ===================== CRC VALIDATION =====================
 * Enable/disable CRC validation for received messages.
 * 1 = Enable CRC checks (recommended for production)
 * 0 = Disable CRC checks (for testing/debugging only)
 * ========================================================== */
#define CRC_ENABLE 0

 /* ===================== USB/SPI CONFIGURATION =====================
 * USB port configuration for token communication.
 * 
 * Windows: Set USB_COM_PORT to your COM port number (3, 4, 5, etc.)
 * Linux:   Set USB_TTY_PORT to your ttyUSB number (0, 1, 2, etc.)
 * ================================================================ */

#ifdef WIN32
    #define USB_COM_PORT 18                      // Change this to your COM port number
    
    // Macro magic to convert number to string
    #define STRINGIFY(x) #x
    #define TOSTRING(x) STRINGIFY(x)
    #define USB_PORT_STRING "SERIAL" TOSTRING(USB_COM_PORT) ":115200,N,8,1,N,N"
#else
    #define USB_TTY_PORT 0                      // Change this to your ttyUSB number
    
    // Macro magic to convert number to string
    #define STRINGIFY(x) #x
    #define TOSTRING(x) STRINGIFY(x)
    #define USB_PORT_STRING "SERIAL" TOSTRING(USB_TTY_PORT) ":115200,N,8,1,N,N"
#endif

 /* ===================== MQTT CONFIGURATION =====================
 * Configure the MQTT broker connection parameters.
 * These must match your own broker setup.
 * ============================================================== */
#define MQTT_BROKER         "172.16.124.248"    /* Broker IP or hostname */
#define MQTT_PORT           1883                /* Broker port           */
#define MQTT_USER           "admin"             /* Broker username       */
#define MQTT_PASS           "changeme"          /* Broker password       */
#define MQTT_KEEPALIVE      60                  /* Keepalive in seconds  */

/* ===================== RETRY CONFIGURATION =====================
 * MAX_RETRIES: Number of retry attempts for failed operations.
 * Minimum enforced value is 0.
 * ============================================================== */
#define MAX_RETRIES         4


/* ===================== DEBUG CONFIGURATION =====================
 * Enable or disable debug logging per module.
 * Set to 1 to enable, 0 to disable.
 * Comment out a line to disable that module's debug output.
 * ============================================================== */
#ifndef MW_DEBUG
    #define MW_DEBUG            1
#endif

#ifndef PORT_COMM_DEBUG
    #define PORT_COMM_DEBUG     1
#endif


/* ===================== PARAMETER VALIDATION =====================
 * Do not modify this section.
 * Enforces safe minimum values for critical parameters.
 * =============================================================== */
#if MAX_RETRIES < 0
    #warning "MAX_RETRIES is less than 0, forcing to 0"
    #undef  MAX_RETRIES
    #define MAX_RETRIES 0
#endif

#endif /* SGR_CONFIG_H */