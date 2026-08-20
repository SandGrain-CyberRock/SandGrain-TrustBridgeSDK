#ifndef SDK_SGR_TYPES_H
#define SDK_SGR_TYPES_H

#include <stdint.h>

/* =============================================================================
 * sgr_sdk_comm_interface_t
 *
 * User-supplied communication (transport) interface.
 *
 * The SDK is transport-agnostic: it builds frames (byte buffers) and hands them
 * to these callbacks instead of calling a hard-wired port layer. The developer
 * registers an implementation once via SGR_SDK_SetCommInterface() and may back
 * it with any transport (MQTT, TCP socket, UART, SPI, BLE, LoRa, ...).
 *
 * Return conventions:
 *   open    :  0 on success, <0 on error.            (optional - may be NULL)
 *   send    :  0 on success, <0 on error.
 *   receive :  0 = a frame was received (out_len > 0),
 *              1 = no data available yet (out_len set to 0),
 *             <0 = communication error.
 *   close   :  no return value.                       (optional - may be NULL)
 *
 * ctx is an opaque pointer owned by the caller (e.g. their socket/UART handle);
 * it is passed unchanged to every callback.
 * ============================================================================= */
typedef struct {
    /* Open / establish the connection. device_id is the device TID in hex
     * (used by addressed transports such as MQTT for topic routing; transports
     * with no addressing - e.g. UART - may ignore it). Optional: leave NULL if
     * the transport is opened by the application before registration. */
    int  (*open)   (const char *device_id, void *ctx);

    /* Send one frame to the gateway. */
    int  (*send)   (const uint8_t *data, uint16_t len, void *ctx);

    /* Receive one frame from the gateway (see return conventions above). */
    int  (*receive)(uint8_t *buf, uint16_t buf_size, uint16_t *out_len, void *ctx);

    /* Close / tear down the connection. Optional: leave NULL if not needed. */
    void (*close)  (void *ctx);

    /* User context passed to every callback. */
    void *ctx;
} sgr_sdk_comm_interface_t;

/* =============================================================================
 * sgr_sdk_event_t / sgr_sdk_event_cb_t
 *
 * Optional progress events for the authenticate-via-GW flow. The application
 * registers a callback via SGR_SDK_SetEventCallback() to observe each step
 * transition (drive LEDs/UI, log over its own channel, react to retries, ...).
 *
 * The callback is invoked SYNCHRONOUSLY from within the authentication state
 * machine (during _Poll() or the blocking wrapper). It MUST be short and
 * non-blocking, and MUST NOT call other SGR_SDK_* functions - record the event
 * and act on it from your own main loop.
 * ============================================================================= */
typedef enum {
    SGR_SDK_EVT_AUTH_STARTED = 0,   /* Flow started (first attempt only)        */
    SGR_SDK_EVT_AUTH_REQUEST_SENT,  /* Auth request sent to GW                  */
    SGR_SDK_EVT_CW_RECEIVED,        /* Challenge Word received from GW          */
    SGR_SDK_EVT_RW_COMPUTED,        /* Response Word computed on crypto chip    */
    SGR_SDK_EVT_RW_SENT,            /* CW echo + RW sent to GW                  */
    SGR_SDK_EVT_RESULT_RECEIVED,    /* A verdict frame arrived (OK or NOK)      */
    SGR_SDK_EVT_AUTH_COMPLETE,      /* Terminal: authentication succeeded       */
    SGR_SDK_EVT_AUTH_FAILED,        /* Terminal: rejected / failed (no retries) */
    SGR_SDK_EVT_RETRY               /* Attempt failed - retrying                */
} sgr_sdk_event_t;

typedef void (*sgr_sdk_event_cb_t)(sgr_sdk_event_t event, void *ctx);

#define MAX_FIELD_SIZE 100 
#define N_BYTES_ID 32
#define N_BYTES_CW 32
#define N_BYTES_RW 16

#define N_HEX_TID 37 // str + null

typedef struct
{
    // BYTES
    uint8_t id[N_BYTES_ID];
    uint8_t cw[N_BYTES_CW];
    uint8_t rw[N_BYTES_RW];
    char transaction_id[N_HEX_TID];
    char rw_transaction_id[N_HEX_TID];

    uint16_t id_crc;
    uint16_t cw_crc;
    uint16_t rw_crc;

    uint8_t auth_status_1;
    uint8_t auth_status_2;

    /* Registration - assigned by Gateway (DEVICE_MODE only)
     * Valid range: 0-1000. Set to 0xFFFF when not registered. */
    uint16_t short_id;

    /* Raw frame buffer - used in GATEWAY_MODE to pass received frames to MW */
    uint8_t  raw_frame[512];
    uint16_t raw_frame_size;
}sdk_sgr_param_t;

#endif /* SDK_SGR_TYPES_H */