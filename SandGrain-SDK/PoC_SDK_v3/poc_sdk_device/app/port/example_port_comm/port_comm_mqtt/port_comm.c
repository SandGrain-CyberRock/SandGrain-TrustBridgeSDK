#include "port_comm.h"
#include "sdk_sgr_config.h"

#include <string.h>
#include <stdio.h>
#include <mosquitto.h>

/* ===================== DEBUG LOGGING ===================== */

#if PORT_COMM_DEBUG
    #define LOG_DEBUG(fmt, ...)   printf("   [PORT][MQTT] " fmt "\n", ##__VA_ARGS__)
    #define LOG_FAULT(fmt, ...)   printf("   [FAULT]      " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG_DEBUG(fmt, ...)   do {} while(0)
    #define LOG_FAULT(fmt, ...)   do {} while(0)
#endif

/* ===================== INTERNAL VARIABLES ===================== */

static struct mosquitto *mosq = NULL;

/* Dynamic topics — built at init from device_id */
static char topic_req_cw[128];
static char topic_reply_rw[128];
static char topic_req_rw[128];
static char topic_check_auth_cloud[128];
static char topic_rsp[128];

/* Internal receive buffer */
static uint8_t  rx_buffer[512];
static uint16_t rx_size      = 0;
static bool     rx_available = false;

volatile uint8_t g_fault_injection_enable_comm_tx = 0;
volatile uint8_t g_fault_injection_enable_comm_rx = 0;

/* RX diagnostics */
static volatile uint32_t rx_drop_count     = 0;
static volatile uint32_t rx_received_count = 0;

extern volatile int attempt;
extern volatile int enable_fi_comm_get_cw;

static volatile bool connected = false;

/* ===================== INTERNAL HELPERS ===================== */

static const char *resolve_topic_from_type(const uint8_t *buf, uint16_t len)
{
    if (!buf || len == 0)
        return NULL;

    const char *p = strstr((const char *)buf, "\"type\"");
    if (!p)
        return NULL;

    char type = 0;
    if (sscanf(p, "\"type\":\"%c\"", &type) != 1)
        return NULL;

    switch (type)
    {
        case '0': return topic_req_cw;
        case '1': return topic_reply_rw;
        case '2': return topic_req_rw;
        case '3': return topic_check_auth_cloud;
        default:  return NULL;
    }
}

/* ===================== MQTT CALLBACKS ===================== */

static void on_connect(struct mosquitto *mosq, void *obj, int rc)
{
    if (rc == 0)
    {
        connected = true;
        LOG_DEBUG("Connected");
        mosquitto_subscribe(mosq, NULL, topic_rsp, 1);
    }
    else
    {
        LOG_DEBUG("Connection Error: %d", rc);
    }
}

static void on_message(struct mosquitto *mosq, void *obj,
                       const struct mosquitto_message *msg)
{
    if (!msg || !msg->payload || msg->payloadlen == 0)
        return;

    if ((size_t)msg->payloadlen > sizeof(rx_buffer)) {
        rx_drop_count++;
        return;
    }

    /* DO NOT overwrite an unconsumed message */
    if (rx_available) {
        rx_drop_count++;
        return;
    }

    memcpy(rx_buffer, msg->payload, msg->payloadlen);
    rx_size      = (uint16_t)msg->payloadlen;
    rx_available = true;
    rx_received_count++;

    LOG_DEBUG("RX received (%u bytes) | data=%.*s", rx_size, rx_size, rx_buffer);
}

/* ===================== PORT_COMM API ===================== */

bool port_comm_init(const char *device_id)
{
    if (!device_id) {
        return false;
    }

    LOG_DEBUG("Initializing communication port .....");

    /* Build topics dynamically from device_id */
    snprintf(topic_req_cw,           sizeof(topic_req_cw),           "sandgrain/v1/%s/req/requestCW",            device_id);
    snprintf(topic_reply_rw,         sizeof(topic_reply_rw),         "sandgrain/v1/%s/req/replyRW",              device_id);
    snprintf(topic_req_rw,           sizeof(topic_req_rw),           "sandgrain/v1/%s/req/requestRW",            device_id);
    snprintf(topic_check_auth_cloud, sizeof(topic_check_auth_cloud), "sandgrain/v1/%s/req/checkAuthStatusCloud", device_id);
    snprintf(topic_rsp,              sizeof(topic_rsp),              "sandgrain/v1/%s/rsp/#",                    device_id);

    mosquitto_lib_init();

    mosq = mosquitto_new(NULL, true, NULL);
    if (!mosq) {
        return false;
    }

    mosquitto_username_pw_set(mosq, MQTT_USER, MQTT_PASS);
    mosquitto_connect_callback_set(mosq, on_connect);
    mosquitto_message_callback_set(mosq, on_message);

    if (mosquitto_connect(mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE) != MOSQ_ERR_SUCCESS) {
        return false;
    }

    //return true;

    /* Wait until connected */
    int timeout = 100;
    while (!connected && timeout > 0)
    {
        mosquitto_loop(mosq, 50, 1);
        timeout--;
    }

    if (!connected)
    {
        LOG_DEBUG("Connection timeout");
        return false;
    }

    return true;
}

bool port_comm_send(const uint8_t *buffer_tx, uint16_t buffer_tx_size)
{
    if (!mosq || !buffer_tx || buffer_tx_size == 0) {
        return false;
    }

    /* Process MQTT without blocking */
    mosquitto_loop(mosq, 0, 1);

    /* Resolve topic based on "type" field in JSON */
    const char *topic = resolve_topic_from_type(buffer_tx, buffer_tx_size);
    if (!topic) {
        LOG_DEBUG("ERROR: invalid or missing type in JSON");
        return false;
    }

    uint8_t tmp_buffer[buffer_tx_size];
    memcpy(tmp_buffer, buffer_tx, buffer_tx_size);
    tmp_buffer[buffer_tx_size] = '\0';

    /* Controlled fault injection */
    if ((g_fault_injection_enable_comm_tx == 1) && (attempt <= 3) && (enable_fi_comm_get_cw == 1)) {
        if (buffer_tx_size > 50) {
            tmp_buffer[50] = 'F';
            LOG_FAULT("Injection in byte 26 Tx .... json tx = %s", tmp_buffer);
        }
    }

    LOG_DEBUG("TX about to write | topic=%s | size=%u | data=%s",
        topic, buffer_tx_size, tmp_buffer);

    int rc = mosquitto_publish(mosq, NULL, topic, buffer_tx_size, tmp_buffer, 1, false);

    switch (rc)
    {
        case MOSQ_ERR_SUCCESS:           LOG_DEBUG("Publish OK");                                      break;
        case MOSQ_ERR_INVAL:             LOG_DEBUG("Publish failed | invalid input parameters");       break;
        case MOSQ_ERR_NOMEM:             LOG_DEBUG("Publish failed | out of memory");                  break;
        case MOSQ_ERR_NO_CONN:           LOG_DEBUG("Publish failed | client not connected to broker"); break;
        case MOSQ_ERR_PROTOCOL:          LOG_DEBUG("Publish failed | protocol error with broker");     break;
        case MOSQ_ERR_PAYLOAD_SIZE:      LOG_DEBUG("Publish failed | payload too large");              break;
        case MOSQ_ERR_MALFORMED_UTF8:    LOG_DEBUG("Publish failed | topic is not valid UTF-8");       break;
        case MOSQ_ERR_QOS_NOT_SUPPORTED: LOG_DEBUG("Publish failed | QoS not supported by broker");   break;
        case MOSQ_ERR_OVERSIZE_PACKET:   LOG_DEBUG("Publish failed | packet too large for broker");    break;
        default:                         LOG_DEBUG("Publish failed | unknown rc=%d", rc);              break;
    }

    return (rc == MOSQ_ERR_SUCCESS);
}

bool port_comm_receive(uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    if (!mosq || !buffer_rx || !buffer_rx_received_size) {
        return false;
    }

    /* Process MQTT without blocking */
    mosquitto_loop(mosq, 50, 1);

    if (!rx_available) {
        *buffer_rx_received_size = 0;
        return true;    /* No data available, but not an error */
    }

    if (rx_size > buffer_rx_size) {
        return false;
    }

    memcpy(buffer_rx, rx_buffer, rx_size);
    *buffer_rx_received_size = rx_size;

    /* RX fault injection */
    if (g_fault_injection_enable_comm_rx == 1) {
        if (*buffer_rx_received_size > 70) {
            buffer_rx[70] ^= 'F';
            LOG_FAULT("[RX] Payload corrupted at byte 70");
        }
    }

    /* Clear internal RX state */
    memset(rx_buffer, 0, sizeof(rx_buffer));
    rx_size      = 0;
    rx_available = false;

    return true;
}

void port_comm_close(void)
{
    if (mosq) {
        mosquitto_disconnect(mosq);
        mosquitto_destroy(mosq);
        mosq = NULL;
    }

    mosquitto_lib_cleanup();

    /* Clear internal state */
    memset(rx_buffer, 0, sizeof(rx_buffer));
    rx_size      = 0;
    rx_available = false;

    rx_drop_count     = 0;
    rx_received_count = 0;

    connected = false;

    LOG_DEBUG("Closing communication port ....");
}