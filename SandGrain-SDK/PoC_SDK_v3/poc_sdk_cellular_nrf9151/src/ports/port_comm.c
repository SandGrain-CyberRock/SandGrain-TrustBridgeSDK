/* =============================================================================
 * port_comm.c - gateway<->cloud MQTT port over LTE (nRF9151)
 *
 * Zephyr implementation of the gateway SDK's cloud transport. The PC gateway
 * creates one mosquitto client per auth flow; here there is ONE broker
 * connection (raw Zephyr MQTT client, owned by app_mqtt.c) for the whole
 * application, and this port multiplexes on it:
 *
 *   port_comm_init(ctx, tid_hex)  builds the sandgrain/v1/<tid>/... topics,
 *                                 subscribes to .../rsp/# and marks this ctx
 *                                 as the active receiver of cloud replies
 *   port_comm_send                maps the frame's "type" to the request topic
 *                                 (same table as the PC port) and publishes
 *   port_comm_receive             hands the last received reply to the FSM;
 *                                 returns size 0 (SERVER_NO_DATA) while the
 *                                 FSM polls and nothing has arrived
 *   port_comm_close               detaches the ctx; the broker connection and
 *                                 the rsp subscription stay up for reuse
 *
 * Only one auth flow runs at a time on this board (single local chip), so a
 * single active ctx is sufficient.
 * ============================================================================= */
#include "port_comm.h"
#include "app_mqtt.h"
#include "fi_device.h"   /* fault injection, menu options 2 and 3 */

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/net/mqtt.h>

#include <stdio.h>
#include <string.h>

/* The ctx currently receiving cloud replies (set by init, cleared by close).
 * Written from the main thread, read from the MQTT RX thread. */
static port_comm_ctx_t *g_active_ctx;

static K_SEM_DEFINE(suback_sem, 0, 1);
static char g_subscribed_topic[128];   /* rsp/# topic we are subscribed to */

/* Called by app_mqtt.c for every incoming publish. */
void port_comm_on_mqtt_message(const char *topic, size_t topic_len,
			       const char *payload, size_t payload_len)
{
	port_comm_ctx_t *ctx = g_active_ctx;

	if (ctx == NULL) {
		return;
	}
	/* Only sandgrain/v1/<tid>/rsp/... belongs to the auth FSM. */
	size_t prefix_len = strlen(ctx->topic_rsp) - 1;   /* strip trailing '#' */
	if (topic_len < prefix_len ||
	    strncmp(topic, ctx->topic_rsp, prefix_len) != 0) {
		return;
	}
	if (payload_len == 0 || payload_len > sizeof(ctx->rx_buffer)) {
		return;
	}
	if (ctx->rx_available) {
		return;   /* previous reply not consumed yet - drop (PC parity) */
	}

	memcpy(ctx->rx_buffer, payload, payload_len);
	ctx->rx_size      = (uint16_t)payload_len;
	ctx->rx_available = true;
}

/* Called by app_mqtt.c after a broker reconnect: clean session means the
 * broker dropped the rsp/# subscription - forget it so the next
 * port_comm_init() actually re-subscribes instead of skipping. */
void port_comm_reset_subscription(void)
{
	g_subscribed_topic[0] = '\0';
}

/* Called by app_mqtt.c on SUBACK. */
void port_comm_on_mqtt_suback(uint16_t message_id, int result)
{
	ARG_UNUSED(message_id);

	if (result == 0) {
		k_sem_give(&suback_sem);
	} else {
		printk("[PORT][MQTT] SUBACK error (%d)\n", result);
	}
}

/* ---------------------------------------------------------------------------
 * Fault injection (menu options 2 and 3)
 *
 * Frames travel as JSON, so the corruption is applied to the hex text of the
 * CW / RW fields - the same fields, the same bit positions and the same helper
 * the PC device app uses, so a corrupted cellular run is indistinguishable from
 * a corrupted PC run at CyberRock. The SDK's TX buffer is not ours to mutate,
 * so it is copied first; the copy is static because the auth thread is the only
 * caller and a 512 B frame does not belong on its stack.
 * ------------------------------------------------------------------------- */
#define FI_TX_BUF_SIZE 512
static uint8_t prv_fi_tx_buf[FI_TX_BUF_SIZE];

static const uint8_t *prv_apply_tx_fi(const uint8_t *buffer_tx, uint16_t len)
{
	char *p;

	if (!fi_enable_cw_echo && !fi_enable_rw && !fi_enable_option3) {
		return buffer_tx;          /* nothing armed - send the original */
	}
	if ((size_t)len + 1 > sizeof(prv_fi_tx_buf)) {
		printk("[FI] frame too large to corrupt (%u B) - sent intact\n", len);
		return buffer_tx;
	}

	memcpy(prv_fi_tx_buf, buffer_tx, len);
	prv_fi_tx_buf[len] = '\0';

	/* The requestCW frame carries neither field, so strstr misses and it goes
	 * out clean - only the replyRW frame is corrupted, which is what we want. */
	if (fi_enable_cw_echo) {
		p = strstr((char *)prv_fi_tx_buf, "\"CW\":\"");
		if (p != NULL) {
			fi_apply_bitflip_hex(p + 6, 64, FI_CW_ECHO_BIT_POS);
			printk("[FI] CW echo corrupted - 1 bit flipped\n");
		}
	}
	if (fi_enable_rw) {
		p = strstr((char *)prv_fi_tx_buf, "\"RW\":\"");
		if (p != NULL) {
			fi_apply_bitflip_hex(p + 6, 32, FI_RW_BIT_POS);
			printk("[FI] RW corrupted - 1 bit flipped\n");
		}
	}
	if (fi_enable_option3) {
		p = strstr((char *)prv_fi_tx_buf, "\"CW\":\"");
		if (p != NULL) {
			fi_apply_bitflip_hex(p + 6, 64, FI_CW_ECHO_BIT_POS_0_OPT3);
			fi_apply_bitflip_hex(p + 6, 64, FI_CW_ECHO_BIT_POS_1_OPT3);
			printk("[FI] CW echo corrupted - 2 bits flipped (option 3)\n");
		}
	}
	return prv_fi_tx_buf;
}

/* Same frame-type -> topic table as the PC gateway port. */
static const char *prv_resolve_topic(port_comm_ctx_t *ctx, const uint8_t *buf,
				     uint16_t len)
{
	if (buf == NULL || len == 0) {
		return NULL;
	}

	const char *p = strstr((const char *)buf, "\"type\"");
	char type = 0;

	if (p == NULL || sscanf(p, "\"type\":\"%c\"", &type) != 1) {
		return NULL;
	}

	switch (type) {
	case '0': return ctx->topic_req_cw;
	case '1': return ctx->topic_reply_rw;
	case '2': return ctx->topic_req_rw;
	case '3': return ctx->topic_check_auth_cloud;
	case '6': return ctx->topic_fw_verify;
	case '7': return ctx->topic_installation;
	default:  return NULL;
	}
}

bool port_comm_init(port_comm_ctx_t *ctx, const char *device_id)
{
	if (ctx == NULL || device_id == NULL) {
		return false;
	}

	memset(ctx, 0, sizeof(*ctx));

	if (!app_mqtt_is_up()) {
		printk("[PORT][MQTT] broker connection is down\n");
		return false;
	}

	snprintf(ctx->topic_req_cw,           sizeof(ctx->topic_req_cw),           "sandgrain/v1/%s/req/requestCW",            device_id);
	snprintf(ctx->topic_reply_rw,         sizeof(ctx->topic_reply_rw),         "sandgrain/v1/%s/req/replyRW",              device_id);
	snprintf(ctx->topic_req_rw,           sizeof(ctx->topic_req_rw),           "sandgrain/v1/%s/req/requestRW",            device_id);
	snprintf(ctx->topic_check_auth_cloud, sizeof(ctx->topic_check_auth_cloud), "sandgrain/v1/%s/req/checkAuthStatusCloud", device_id);
	snprintf(ctx->topic_fw_verify,        sizeof(ctx->topic_fw_verify),        "sandgrain/v1/%s/req/fwVerification",       device_id);
	snprintf(ctx->topic_installation,     sizeof(ctx->topic_installation),     "sandgrain/v1/%s/req/fwInstallation",       device_id);
	snprintf(ctx->topic_rsp,              sizeof(ctx->topic_rsp),              "sandgrain/v1/%s/rsp/#",                    device_id);

	/* Subscribe to the reply topic (once - it survives close/reopen since
	 * the broker connection is shared and persistent). */
	if (strcmp(g_subscribed_topic, ctx->topic_rsp) != 0) {
		struct mqtt_topic topic = {
			.topic = { .utf8 = ctx->topic_rsp,
				   .size = strlen(ctx->topic_rsp) },
			.qos = MQTT_QOS_1_AT_LEAST_ONCE,
		};
		struct mqtt_subscription_list list = {
			.list = &topic,
			.list_count = 1,
			.message_id = 4321,
		};

		k_sem_reset(&suback_sem);
		if (app_mqtt_subscribe(&list) != 0) {
			printk("[PORT][MQTT] subscribe failed\n");
			return false;
		}
		if (k_sem_take(&suback_sem, K_SECONDS(10)) != 0) {
			printk("[PORT][MQTT] no SUBACK within 10 s\n");
			return false;
		}
		snprintf(g_subscribed_topic, sizeof(g_subscribed_topic), "%s",
			 ctx->topic_rsp);
	}

	ctx->connected = true;
	g_active_ctx   = ctx;
	return true;
}

bool port_comm_send(port_comm_ctx_t *ctx, const uint8_t *buffer_tx,
		    uint16_t buffer_tx_size)
{
	if (ctx == NULL || buffer_tx == NULL || buffer_tx_size == 0) {
		return false;
	}

	const char *topic = prv_resolve_topic(ctx, buffer_tx, buffer_tx_size);

	if (topic == NULL) {
		printk("[PORT][MQTT] invalid or missing type in frame\n");
		return false;
	}

	buffer_tx = prv_apply_tx_fi(buffer_tx, buffer_tx_size);

	return app_mqtt_publish(topic, buffer_tx, buffer_tx_size, false) == 0;
}

bool port_comm_receive(port_comm_ctx_t *ctx, uint8_t *buffer_rx,
		       uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
	if (ctx == NULL || buffer_rx == NULL || buffer_rx_received_size == NULL) {
		return false;
	}

	if (!ctx->rx_available) {
		/* Nothing yet - the FSM busy-polls this; yield so the
		 * MQTT RX thread can deliver the broker's reply. */
		*buffer_rx_received_size = 0;
		k_msleep(10);
		return true;
	}

	if (ctx->rx_size > buffer_rx_size) {
		return false;
	}

	memcpy(buffer_rx, ctx->rx_buffer, ctx->rx_size);
	*buffer_rx_received_size = ctx->rx_size;

	/* Inbound half of the fault injection: corrupt the CW before the SDK
	 * computes the RW from it, so the RW that goes back is wrong the way a
	 * glitched read would make it wrong. strstr needs a terminator; replies
	 * are ~200 B against a much larger buffer, so the guard only trips on a
	 * malformed giant frame. */
	if ((fi_enable_cw || fi_enable_option3) && ctx->rx_size < buffer_rx_size) {
		buffer_rx[ctx->rx_size] = '\0';
		char *p = strstr((char *)buffer_rx, "\"CW\":\"");

		if (p != NULL) {
			if (fi_enable_cw) {
				fi_apply_bitflip_hex(p + 6, 64, FI_CW_BIT_POS_0);
				fi_apply_bitflip_hex(p + 6, 64, FI_CW_BIT_POS_1);
				printk("[FI] CW corrupted - 2 bits flipped\n");
			}
			if (fi_enable_option3) {
				fi_apply_bitflip_hex(p + 6, 64, FI_CW_BIT_POS_OPT3);
				printk("[FI] CW corrupted - 1 bit flipped (option 3)\n");
			}
		}
	}

	memset(ctx->rx_buffer, 0, sizeof(ctx->rx_buffer));
	ctx->rx_size      = 0;
	ctx->rx_available = false;

	return true;
}

void port_comm_close(port_comm_ctx_t *ctx)
{
	if (ctx == NULL) {
		return;
	}

	if (g_active_ctx == ctx) {
		g_active_ctx = NULL;
	}
	memset(ctx->rx_buffer, 0, sizeof(ctx->rx_buffer));
	ctx->rx_size      = 0;
	ctx->rx_available = false;
	ctx->connected    = false;
	/* The shared broker connection and rsp subscription stay up. */
}
