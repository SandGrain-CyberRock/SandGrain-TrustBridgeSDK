/* =============================================================================
 * app_mqtt.c - the single shared MQTT connection (see app_mqtt.h)
 *
 * Raw Zephyr MQTT client. Connection plumbing formerly provided by the NCS
 * mqtt_helper is owned here now:
 *   - RX thread: poll(sock) with a keepalive-derived timeout; POLLIN ->
 *     mqtt_input(), timeout -> mqtt_live() (the PINGREQ). Same loop shape as
 *     mqtt_helper's poll loop and the zephyr mqtt_publisher sample.
 *   - QoS1 PUBACK on received publishes (payload read into a static buffer).
 *   - Reconnect with backoff (5s -> 60s cap, forever) after any drop; on
 *     re-CONNACK: re-subscribe rsp/# (via port_comm_reset_subscription) and
 *     cmd/run_auth, republish retained "online" (clean session wipes all
 *     broker-side state on disconnect).
 *
 * What the raw client buys over the wrapper: the Last Will (retained
 * "offline" on sandgrain/v1/<tid>/status, QoS1) and the client ID are built
 * at RUNTIME from the chip's TID - flash the same hex on any board/chip.
 * ============================================================================= */
#include "app_mqtt.h"

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/net/mqtt.h>
#include <zephyr/net/net_ip.h>
#include <zephyr/net/socket.h>

#include <errno.h>
#include <stdio.h>
#include <string.h>

/* Implemented in port_comm.c - routes auth replies into the active flow ctx. */
extern void port_comm_on_mqtt_message(const char *topic, size_t topic_len,
				      const char *payload, size_t payload_len);
extern void port_comm_on_mqtt_suback(uint16_t message_id, int result);
extern void port_comm_reset_subscription(void);

/* Implemented in main.c - queues a mutual-auth run on the auth thread. */
extern void app_on_run_auth(int mode);

/* -- Connection state --------------------------------------------------------- */
enum conn_state {
	ST_DISCONNECTED,
	ST_CONNECTING,    /* TCP up, CONNECT sent, waiting for CONNACK */
	ST_CONNECTED,
};

static struct mqtt_client g_client;
static struct net_sockaddr_storage g_broker;
static volatile enum conn_state g_state = ST_DISCONNECTED;
static volatile bool g_up;

static uint8_t rx_buf[512];
static uint8_t tx_buf[512];
static uint8_t payload_buf[2048];

static K_SEM_DEFINE(connack_sem, 0, 1);
static K_SEM_DEFINE(run_sem, 0, 1);      /* releases the RX thread at boot */
static uint16_t g_msg_id = 100;

/* Runtime identity, all derived from the chip's TID (empty until known). */
static char g_tid[65];
static char g_client_id[24];
static char g_will_topic_str[128];
static bool g_will_installed;            /* will was part of the last CONNECT */

/* cmd/run_auth trigger subscription (BE-driven auth). */
#define CMD_SUB_MSG_ID 4322
#define RSP_SUB_MSG_ID 4321              /* owned by port_comm.c */
static char g_cmd_topic[160];
static K_SEM_DEFINE(cmd_suback_sem, 0, 1);

static uint16_t next_msg_id(void)
{
	if (++g_msg_id == 0 || g_msg_id == RSP_SUB_MSG_ID ||
	    g_msg_id == CMD_SUB_MSG_ID) {
		g_msg_id = 100;   /* keep clear of 0 and the SUBSCRIBE ids */
	}
	return g_msg_id;
}

/* -- Incoming publishes ------------------------------------------------------- */
static void handle_publish(const struct mqtt_evt *evt)
{
	const struct mqtt_publish_param *p = &evt->param.publish;
	uint32_t len = p->message.payload.len;
	bool dropped = false;

	if (len > sizeof(payload_buf)) {
		printk("[MQTT] publish too large (%u bytes) - dropped\n", len);
		/* Drain it anyway or the packet stream desynchronizes. */
		uint32_t left = len;

		while (left > 0) {
			int chunk = mqtt_read_publish_payload_blocking(
				&g_client, payload_buf,
				MIN(left, sizeof(payload_buf)));
			if (chunk <= 0) {
				break;
			}
			left -= chunk;
		}
		dropped = true;
	} else if (mqtt_readall_publish_payload(&g_client, payload_buf, len) != 0) {
		printk("[MQTT] failed to read publish payload\n");
		return;
	}

	if (p->message.topic.qos == MQTT_QOS_1_AT_LEAST_ONCE) {
		struct mqtt_puback_param ack = { .message_id = p->message_id };

		(void)mqtt_publish_qos1_ack(&g_client, &ack);
	}
	if (dropped) {
		return;
	}

	const char *topic = (const char *)p->message.topic.topic.utf8;
	size_t topic_len  = p->message.topic.topic.size;

	if (g_cmd_topic[0] != '\0' &&
	    topic_len == strlen(g_cmd_topic) &&
	    memcmp(topic, g_cmd_topic, topic_len) == 0) {
		/* TrustBridge sends {"mode":N}. Modes 2 and 3 are the fault-injection
		 * runs, everything else is a normal mutual auth. The payload is tiny,
		 * so copy just enough of it to terminate for strstr. */
		char   modebuf[32];
		size_t mlen = len < sizeof(modebuf) - 1 ? len : sizeof(modebuf) - 1;
		int    mode = 1;

		memcpy(modebuf, payload_buf, mlen);
		modebuf[mlen] = '\0';

		const char *mp = strstr(modebuf, "\"mode\"");

		if (mp != NULL) {
			mp += 6;
			while (*mp == ':' || *mp == ' ' || *mp == '"') {
				mp++;
			}
			if (*mp >= '0' && *mp <= '9') {
				mode = *mp - '0';
			}
		}

		printk("[MQTT] Auth trigger received from TrustBridge (mode %d)\n", mode);
		app_on_run_auth(mode);
		return;
	}

	port_comm_on_mqtt_message(topic, topic_len,
				  (const char *)payload_buf, len);
}

/* -- Event handler (runs in the RX thread, inside mqtt_input) ----------------- */
static void mqtt_evt_handler(struct mqtt_client *client,
			     const struct mqtt_evt *evt)
{
	ARG_UNUSED(client);

	switch (evt->type) {
	case MQTT_EVT_CONNACK:
		if (evt->result != 0) {
			printk("[MQTT] CONNACK refused (rc=%d)%s\n", evt->result,
			       evt->result == MQTT_NOT_AUTHORIZED ?
			       " - check username/password" : "");
			break;
		}
		printk("[MQTT] Connected to broker - credentials OK\n");
		g_state = ST_CONNECTED;
		g_up = true;
		k_sem_give(&connack_sem);
		break;
	case MQTT_EVT_DISCONNECT:
		printk("[MQTT] Disconnected from broker (result %d)\n",
		       evt->result);
		g_up = false;
		g_state = ST_DISCONNECTED;
		break;
	case MQTT_EVT_PUBLISH:
		handle_publish(evt);
		break;
	case MQTT_EVT_SUBACK:
		if (evt->param.suback.message_id == CMD_SUB_MSG_ID) {
			if (evt->result == 0) {
				printk("[MQTT] cmd/run_auth subscription active\n");
				k_sem_give(&cmd_suback_sem);
			} else {
				printk("[MQTT] cmd/run_auth SUBACK error (%d)\n",
				       evt->result);
			}
			break;
		}
		port_comm_on_mqtt_suback(evt->param.suback.message_id,
					 evt->result);
		break;
	case MQTT_EVT_PUBACK:
	case MQTT_EVT_PINGRESP:
	default:
		break;
	}
}

/* -- Connect ------------------------------------------------------------------ */
static struct mqtt_utf8 g_user_name = {
	.utf8 = (const uint8_t *)APP_MQTT_USERNAME,
	.size = sizeof(APP_MQTT_USERNAME) - 1,
};
static struct mqtt_utf8 g_password = {
	.utf8 = (const uint8_t *)APP_MQTT_PASSWORD,
	.size = sizeof(APP_MQTT_PASSWORD) - 1,
};
static struct mqtt_topic g_will_topic;
static struct mqtt_utf8 g_will_message = {
	.utf8 = (const uint8_t *)"offline",
	.size = sizeof("offline") - 1,
};

static void broker_init(void)
{
	struct net_sockaddr_in *b4 = (struct net_sockaddr_in *)&g_broker;

	b4->sin_family = NET_AF_INET;
	b4->sin_port   = net_htons(APP_MQTT_BROKER_PORT);
	net_addr_pton(NET_AF_INET, APP_MQTT_BROKER_HOST, &b4->sin_addr);
}

/* (Re)build the client for a CONNECT attempt. Identity comes from g_tid:
 * client ID "sgr-<tid[0..11]>" and the retained QoS1 will "offline" on the
 * status topic. Without a TID: fallback client ID, no will. */
static void prepare_client(void)
{
	broker_init();
	mqtt_client_init(&g_client);

	if (g_tid[0] != '\0') {
		snprintf(g_client_id, sizeof(g_client_id), "sgr-%.12s", g_tid);
		snprintf(g_will_topic_str, sizeof(g_will_topic_str),
			 "sandgrain/v1/%s/status", g_tid);
		g_will_topic.topic.utf8 = (const uint8_t *)g_will_topic_str;
		g_will_topic.topic.size = strlen(g_will_topic_str);
		g_will_topic.qos        = MQTT_QOS_1_AT_LEAST_ONCE;
		g_client.will_topic   = &g_will_topic;
		g_client.will_message = &g_will_message;
		g_client.will_retain  = 1;
		g_will_installed = true;
	} else {
		snprintf(g_client_id, sizeof(g_client_id), "%s",
			 APP_MQTT_CLIENT_ID_FALLBACK);
		g_will_installed = false;
	}

	g_client.broker           = &g_broker;
	g_client.evt_cb           = mqtt_evt_handler;
	g_client.client_id.utf8   = (const uint8_t *)g_client_id;
	g_client.client_id.size   = strlen(g_client_id);
	g_client.user_name        = &g_user_name;
	g_client.password         = &g_password;
	g_client.protocol_version = MQTT_VERSION_3_1_1;
	g_client.rx_buf           = rx_buf;
	g_client.rx_buf_size      = sizeof(rx_buf);
	g_client.tx_buf           = tx_buf;
	g_client.tx_buf_size      = sizeof(tx_buf);
	g_client.transport.type   = MQTT_TRANSPORT_NON_SECURE;
}

/* -- RX thread: poll loop + reconnect ----------------------------------------- */
static void poll_loop(void)
{
	struct zsock_pollfd fds = {
		.fd     = g_client.transport.tcp.sock,
		.events = ZSOCK_POLLIN,
	};

	while (g_state == ST_CONNECTING || g_state == ST_CONNECTED) {
		int ret = zsock_poll(&fds, 1,
				     mqtt_keepalive_time_left(&g_client));

		if (ret < 0) {
			printk("[MQTT] poll error (errno %d)\n", errno);
			return;
		}
		if (ret == 0) {
			/* Keepalive due - mqtt_live sends the PINGREQ. */
			int err = mqtt_live(&g_client);

			if (err != 0 && err != -EAGAIN) {
				printk("[MQTT] mqtt_live error (%d)\n", err);
				return;
			}
			continue;
		}
		if (fds.revents & ZSOCK_POLLIN) {
			int err = mqtt_input(&g_client);

			if (err != 0) {
				printk("[MQTT] mqtt_input error (%d)\n", err);
				return;
			}
			if (g_state == ST_DISCONNECTED) {
				return;   /* DISCONNECT event during input */
			}
		}
		if (fds.revents & (ZSOCK_POLLHUP | ZSOCK_POLLERR |
				   ZSOCK_POLLNVAL)) {
			printk("[MQTT] socket closed (revents 0x%x)\n",
			       fds.revents);
			return;
		}
	}
}

/* One CONNECT attempt: TCP connect + wait up to 10 s for the CONNACK.
 * Returns 0 with g_state == ST_CONNECTED on success. */
static int try_connect(void)
{
	prepare_client();

	int err = mqtt_connect(&g_client);

	if (err != 0) {
		return err;
	}
	g_state = ST_CONNECTING;

	struct zsock_pollfd fds = {
		.fd     = g_client.transport.tcp.sock,
		.events = ZSOCK_POLLIN,
	};

	for (int i = 0; i < 10 && !g_up; i++) {
		if (zsock_poll(&fds, 1, 1000) > 0 &&
		    (fds.revents & ZSOCK_POLLIN)) {
			if (mqtt_input(&g_client) != 0) {
				break;
			}
		}
	}
	if (!g_up) {
		(void)mqtt_abort(&g_client);
		g_state = ST_DISCONNECTED;
		return -ETIMEDOUT;
	}
	return 0;
}

/* Send the cmd/run_auth SUBSCRIBE (SUBACK is reported asynchronously by the
 * event handler). Safe to call from the RX thread. */
static int cmd_subscribe_send(const char *tid_hex)
{
	char topic[160];

	snprintf(topic, sizeof(topic), "sandgrain/v1/%s/cmd/run_auth", tid_hex);

	struct mqtt_topic t = {
		.topic = { .utf8 = (const uint8_t *)topic,
			   .size = strlen(topic) },
		.qos = MQTT_QOS_1_AT_LEAST_ONCE,
	};
	struct mqtt_subscription_list list = {
		.list = &t,
		.list_count = 1,
		.message_id = CMD_SUB_MSG_ID,
	};

	int err = mqtt_subscribe(&g_client, &list);

	if (err == 0) {
		snprintf(g_cmd_topic, sizeof(g_cmd_topic), "%s", topic);
	}
	return err;
}

/* After a reconnect: clean session wiped every broker-side subscription, so
 * re-establish them and re-announce presence. Runs in the RX thread - must
 * NOT wait for SUBACKs (this thread is the one that would deliver them). */
static void reestablish(void)
{
	port_comm_reset_subscription();

	if (g_tid[0] != '\0') {
		g_cmd_topic[0] = '\0';
		if (cmd_subscribe_send(g_tid) != 0) {
			printk("[MQTT] cmd/run_auth re-subscribe failed\n");
		}
		app_mqtt_publish_presence(g_tid, true);
	}
}

static void reconnect_loop(void)
{
	int backoff = 5;

	while (1) {
		printk("[MQTT] Reconnecting in %d s...\n", backoff);
		k_sleep(K_SECONDS(backoff));
		if (try_connect() == 0) {
			reestablish();
			return;
		}
		backoff = MIN(backoff * 2, 60);
	}
}

static void mqtt_thread_fn(void *a, void *b, void *c)
{
	ARG_UNUSED(a); ARG_UNUSED(b); ARG_UNUSED(c);

	k_sem_take(&run_sem, K_FOREVER);

	while (1) {
		if (g_state != ST_DISCONNECTED) {
			poll_loop();
		}
		g_up = false;
		g_state = ST_DISCONNECTED;
		(void)mqtt_abort(&g_client);
		reconnect_loop();
	}
}

K_THREAD_DEFINE(mqtt_rx_thread, 3072, mqtt_thread_fn, NULL, NULL, NULL,
		K_LOWEST_APPLICATION_THREAD_PRIO, 0, 0);

/* -- Public API --------------------------------------------------------------- */
int app_mqtt_start(const char *tid_hex)
{
	if (tid_hex != NULL && tid_hex[0] != '\0') {
		snprintf(g_tid, sizeof(g_tid), "%s", tid_hex);
	}

	printk("[MQTT] Connecting to %s:%d ...\n",
	       APP_MQTT_BROKER_HOST, APP_MQTT_BROKER_PORT);

	prepare_client();

	int err = mqtt_connect(&g_client);

	if (err != 0) {
		printk("[MQTT] mqtt_connect failed (err %d)\n", err);
		/* Release the RX thread anyway: its reconnect loop keeps
		 * retrying in the background (and re-announces on success). */
		k_sem_give(&run_sem);
		return err;
	}
	g_state = ST_CONNECTING;
	k_sem_reset(&connack_sem);
	k_sem_give(&run_sem);   /* RX thread polls and processes the CONNACK */

	if (k_sem_take(&connack_sem, K_SECONDS(30)) != 0) {
		printk("[MQTT] No CONNACK within 30 s\n");
		return -ETIMEDOUT;
	}
	return 0;
}

int app_mqtt_reconnect_with_tid(const char *tid_hex)
{
	if (tid_hex == NULL || tid_hex[0] == '\0') {
		return -EINVAL;
	}
	if (g_up && g_will_installed && strcmp(g_tid, tid_hex) == 0) {
		return 0;   /* identity already installed on this connection */
	}

	/* Chip swap: retract the old TID's retained "online" first. */
	if (g_up && g_tid[0] != '\0' && strcmp(g_tid, tid_hex) != 0) {
		app_mqtt_publish_presence(g_tid, false);
	}
	snprintf(g_tid, sizeof(g_tid), "%s", tid_hex);
	g_cmd_topic[0] = '\0';

	if (g_up) {
		/* Graceful drop; the RX thread reconnects with the new
		 * identity and re-announces (reestablish()). */
		(void)mqtt_disconnect(&g_client, NULL);
	}
	/* If the connection is down the reconnect loop is already running and
	 * picks the new TID up on its next attempt. */
	return 1;
}

bool app_mqtt_is_up(void)
{
	return g_up;
}

int app_mqtt_publish(const char *topic, const void *payload, uint16_t len,
		     bool retain)
{
	if (!g_up) {
		return -ENOTCONN;
	}

	struct mqtt_publish_param param = {
		.message.topic.topic.utf8 = (const uint8_t *)topic,
		.message.topic.topic.size = strlen(topic),
		.message.topic.qos = MQTT_QOS_1_AT_LEAST_ONCE,
		.message.payload.data = (uint8_t *)payload,
		.message.payload.len = len,
		.message_id = next_msg_id(),
		.retain_flag = retain ? 1 : 0,
	};

	return mqtt_publish(&g_client, &param);
}

int app_mqtt_subscribe(struct mqtt_subscription_list *list)
{
	if (!g_up) {
		return -ENOTCONN;
	}
	return mqtt_subscribe(&g_client, list);
}

int app_mqtt_subscribe_run_auth(const char *tid_hex)
{
	if (!g_up || tid_hex == NULL || tid_hex[0] == '\0') {
		return -ENOTCONN;
	}
	if (g_cmd_topic[0] != '\0') {
		return 0;   /* already subscribed on this connection */
	}

	k_sem_reset(&cmd_suback_sem);

	int err = cmd_subscribe_send(tid_hex);

	if (err != 0) {
		printk("[MQTT] cmd/run_auth subscribe failed (err %d)\n", err);
		return err;
	}
	if (k_sem_take(&cmd_suback_sem, K_SECONDS(10)) != 0) {
		printk("[MQTT] cmd/run_auth: no SUBACK within 10 s\n");
		return -ETIMEDOUT;
	}

	printk("[MQTT] Listening for TrustBridge auth triggers on %s\n",
	       g_cmd_topic);
	return 0;
}

void app_mqtt_publish_presence(const char *tid_hex, bool online)
{
	char topic[160];
	const char *state = online ? "online" : "offline";

	if (tid_hex == NULL || tid_hex[0] == '\0') {
		return;
	}
	snprintf(topic, sizeof(topic), "sandgrain/v1/%s/status", tid_hex);

	if (app_mqtt_publish(topic, state, (uint16_t)strlen(state), true) == 0) {
		printk("[MQTT] Presence: %s (retained)\n", state);
	}
}
