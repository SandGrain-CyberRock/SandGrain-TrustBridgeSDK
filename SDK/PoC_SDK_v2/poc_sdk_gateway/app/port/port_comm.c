/* =============================================================================
 * port_comm.c
 *
 * MQTT communication port.
 * All state lives in port_comm_ctx_t — no static variables.
 * ============================================================================= */

#include "port_comm.h"
//#include "sdk_sgr_config.h"
#include "config_poc.h"

#include <string.h>
#include <stdio.h>
#include <mosquitto.h>

/* ── Debug ───────────────────────────────────────────────── */
#if PORT_COMM_DEBUG
    #define LOG_DEBUG(fmt, ...)  printf("      [PORT][MQTT] " fmt "\n", ##__VA_ARGS__)
    #define LOG_FAULT(fmt, ...)  printf("      [FAULT]      " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG_DEBUG(fmt, ...)  do {} while(0)
    #define LOG_FAULT(fmt, ...)  do {} while(0)
#endif

/* ── Fault injection ─────────────────────────────────────── */
extern volatile int fi_attempt;
extern volatile int fi_enable_type0_tx;
extern volatile int fi_enable_type1_tx;
extern volatile int fi_enable_type2_tx;
extern volatile int fi_recover_attempt;

/* -----------------------------------------------------------------------------
 * prv_resolve_topic
 * ----------------------------------------------------------------------------- */
static const char *prv_resolve_topic(port_comm_ctx_t *ctx, const uint8_t *buf, uint16_t len)
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
        case '0': return ctx->topic_req_cw;
        case '1': return ctx->topic_reply_rw;
        case '2': return ctx->topic_req_rw;
        case '3': return ctx->topic_check_auth_cloud;
        default:  return NULL;
    }
}

/* -----------------------------------------------------------------------------
 * prv_get_type
 * ----------------------------------------------------------------------------- */
static char prv_get_type(const uint8_t *buf, uint16_t len)
{
    if (!buf || len == 0)
        return 0;

    const char *p = strstr((const char *)buf, "\"type\"");
    if (!p)
        return 0;

    char type = 0;
    sscanf(p, "\"type\":\"%c\"", &type);
    return type;
}

/* -----------------------------------------------------------------------------
 * MQTT callbacks — ctx passed via userdata
 * ----------------------------------------------------------------------------- */
static void on_connect(struct mosquitto *mosq, void *obj, int rc)
{
    port_comm_ctx_t *ctx = (port_comm_ctx_t *)obj;
    if (rc == 0)
    {
        ctx->connected = true;
        LOG_DEBUG("Connected");
        mosquitto_subscribe(mosq, NULL, ctx->topic_rsp, 1);
    }
    else
    {
        LOG_DEBUG("Connection Error: %d", rc);
    }
}

static void on_message(struct mosquitto *mosq, void *obj,
                       const struct mosquitto_message *msg)
{
    port_comm_ctx_t *ctx = (port_comm_ctx_t *)obj;

    if (!msg || !msg->payload || msg->payloadlen == 0)
        return;

    if ((size_t)msg->payloadlen > sizeof(ctx->rx_buffer))
        return;

    if (ctx->rx_available)
        return;

    memcpy(ctx->rx_buffer, msg->payload, msg->payloadlen);
    ctx->rx_size      = (uint16_t)msg->payloadlen;
    ctx->rx_available = true;

    LOG_DEBUG("RX received (%u bytes) | data=%.*s",
              ctx->rx_size, ctx->rx_size, ctx->rx_buffer);
}

/* =============================================================================
 * port_comm_init
 * ============================================================================= */
bool port_comm_init(port_comm_ctx_t *ctx, const char *device_id)
{
    if (!ctx || !device_id)
        return false;

    memset(ctx, 0, sizeof(port_comm_ctx_t));

    LOG_DEBUG("Initializing communication port .....");

    snprintf(ctx->topic_req_cw,           sizeof(ctx->topic_req_cw),           "sandgrain/v1/%s/req/requestCW",            device_id);
    snprintf(ctx->topic_reply_rw,         sizeof(ctx->topic_reply_rw),         "sandgrain/v1/%s/req/replyRW",              device_id);
    snprintf(ctx->topic_req_rw,           sizeof(ctx->topic_req_rw),           "sandgrain/v1/%s/req/requestRW",            device_id);
    snprintf(ctx->topic_check_auth_cloud, sizeof(ctx->topic_check_auth_cloud), "sandgrain/v1/%s/req/checkAuthStatusCloud", device_id);
    snprintf(ctx->topic_rsp,              sizeof(ctx->topic_rsp),              "sandgrain/v1/%s/rsp/#",                    device_id);

    mosquitto_lib_init();

    ctx->mosq = mosquitto_new(NULL, true, ctx);  /* pass ctx as userdata */
    if (!ctx->mosq)
        return false;

    mosquitto_username_pw_set(ctx->mosq, MQTT_USER, MQTT_PASS);
    mosquitto_connect_callback_set(ctx->mosq, on_connect);
    mosquitto_message_callback_set(ctx->mosq, on_message);

    if (mosquitto_connect(ctx->mosq, MQTT_BROKER, MQTT_PORT, MQTT_KEEPALIVE) != MOSQ_ERR_SUCCESS)
        return false;

    int timeout = 100;
    while (!ctx->connected && timeout > 0)
    {
        mosquitto_loop(ctx->mosq, 50, 1);
        timeout--;
    }

    if (!ctx->connected)
    {
        LOG_DEBUG("Connection timeout");
        return false;
    }

    return true;
}

/* =============================================================================
 * port_comm_send
 * ============================================================================= */
bool port_comm_send(port_comm_ctx_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size)
{
    if (!ctx || !ctx->mosq || !buffer_tx || buffer_tx_size == 0)
        return false;

    mosquitto_loop(ctx->mosq, 0, 1);

    const char *topic = prv_resolve_topic(ctx, buffer_tx, buffer_tx_size);
    if (!topic)
    {
        LOG_DEBUG("ERROR: invalid or missing type in JSON");
        return false;
    }

    uint8_t tmp_buffer[512];
    memcpy(tmp_buffer, buffer_tx, buffer_tx_size);
    tmp_buffer[buffer_tx_size] = '\0';

    /* ── Fault injection ── */
    char  type      = prv_get_type(buffer_tx, buffer_tx_size);
    char *field_ptr = NULL;

    if (fi_enable_type0_tx && type == '0' && fi_attempt <= fi_recover_attempt)
    {
        field_ptr = strstr((char *)tmp_buffer, "\"TID\":\"");
        if (field_ptr)
        {
            field_ptr += strlen("\"TID\":\"");
            field_ptr[10] ^= 0xFF;
            LOG_FAULT("TX corrupted | type=0 | TID byte 10 | attempt=%d", fi_attempt);
        }
    }
    else if (fi_enable_type1_tx && type == '1' && fi_attempt <= fi_recover_attempt)
    {
        field_ptr = strstr((char *)tmp_buffer, "\"RW\":\"");
        if (field_ptr)
        {
            field_ptr += strlen("\"RW\":\"");
            field_ptr[10] ^= 0xFF;
            LOG_FAULT("TX corrupted | type=1 | RW byte 10 | attempt=%d", fi_attempt);
        }
    }
    else if (fi_enable_type2_tx && type == '2' && fi_attempt <= fi_recover_attempt)
    {
        field_ptr = strstr((char *)tmp_buffer, "\"CW\":\"");
        if (field_ptr)
        {
            field_ptr += strlen("\"CW\":\"");
            field_ptr[10] ^= 0xFF;
            LOG_FAULT("TX corrupted | type=2 | CW byte 10 | attempt=%d", fi_attempt);
        }
    }

    fi_attempt++;

    LOG_DEBUG("TX about to write | topic=%s | size=%u | data=%s",
              topic, buffer_tx_size, tmp_buffer);

    int rc = mosquitto_publish(ctx->mosq, NULL, topic, buffer_tx_size, tmp_buffer, 1, false);

    switch (rc)
    {
        case MOSQ_ERR_SUCCESS:           LOG_DEBUG("Publish OK");                                      break;
        case MOSQ_ERR_INVAL:             LOG_DEBUG("Publish failed | invalid input parameters");       break;
        case MOSQ_ERR_NOMEM:             LOG_DEBUG("Publish failed | out of memory");                  break;
        case MOSQ_ERR_NO_CONN:           LOG_DEBUG("Publish failed | client not connected to broker"); break;
        case MOSQ_ERR_PROTOCOL:          LOG_DEBUG("Publish failed | protocol error with broker");     break;
        case MOSQ_ERR_PAYLOAD_SIZE:      LOG_DEBUG("Publish failed | payload too large");              break;
        case MOSQ_ERR_MALFORMED_UTF8:    LOG_DEBUG("Publish failed | topic is not valid UTF-8");       break;
        case MOSQ_ERR_QOS_NOT_SUPPORTED: LOG_DEBUG("Publish failed | QoS not supported by broker");    break;
        case MOSQ_ERR_OVERSIZE_PACKET:   LOG_DEBUG("Publish failed | packet too large for broker");    break;
        default:                         LOG_DEBUG("Publish failed | unknown rc=%d", rc);              break;
    }

    return (rc == MOSQ_ERR_SUCCESS);
}

/* =============================================================================
 * port_comm_receive
 * ============================================================================= */
bool port_comm_receive(port_comm_ctx_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    if (!ctx || !ctx->mosq || !buffer_rx || !buffer_rx_received_size)
        return false;

    mosquitto_loop(ctx->mosq, 50, 1);

    if (!ctx->rx_available)
    {
        *buffer_rx_received_size = 0;
        return true;
    }

    if (ctx->rx_size > buffer_rx_size)
        return false;

    memcpy(buffer_rx, ctx->rx_buffer, ctx->rx_size);
    *buffer_rx_received_size = ctx->rx_size;

    memset(ctx->rx_buffer, 0, sizeof(ctx->rx_buffer));
    ctx->rx_size      = 0;
    ctx->rx_available = false;

    return true;
}

/* =============================================================================
 * port_comm_close
 * ============================================================================= */
void port_comm_close(port_comm_ctx_t *ctx)
{
    if (!ctx)
        return;

    if (ctx->mosq)
    {
        mosquitto_disconnect(ctx->mosq);
        mosquitto_destroy(ctx->mosq);
        ctx->mosq = NULL;
    }

    mosquitto_lib_cleanup();

    memset(ctx->rx_buffer, 0, sizeof(ctx->rx_buffer));
    ctx->rx_size      = 0;
    ctx->rx_available = false;
    ctx->connected    = false;

    LOG_DEBUG("Closing communication port ....");
}