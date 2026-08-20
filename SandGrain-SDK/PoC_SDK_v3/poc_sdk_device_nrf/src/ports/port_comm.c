/* =============================================================================
 * port_comm.c - device<->gateway transport over Bluetooth LE (NUS)
 *
 * The PC build of the SDK talks to the gateway over a TCP socket. On the board
 * there is no IP stack, so this port carries the exact same byte stream over a
 * BLE Nordic UART Service link to a laptop relay, which bridges it to the
 * gateway's TCP:8080. The gateway and cloud are completely unchanged.
 *
 * Wire format between board and relay (a thin control layer that never reaches
 * the gateway): newline-delimited messages over NUS.
 *     board -> relay :  "HELLO <tid> TRIGGER\n"
 *                                          (once per link-up - presence: the
 *                                           gateway proxies this to MQTT as a
 *                                           retained "online" on the board's
 *                                           status topic so TrustBridge shows
 *                                           the board online. TRIGGER asks the
 *                                           gateway to relay our cmd/run_auth
 *                                           topic too - we have no MQTT client)
 *                       "OPEN\n"           (port_comm_init  - relay opens TCP)
 *                       "CLOSE\n"          (port_comm_close - relay closes TCP)
 *                       "<json>\n"         (port_comm_send  - relay strips '\n',
 *                                           forwards raw JSON to the gateway)
 *     relay -> board :  "RUN_AUTH <mode>\n" (TrustBridge triggered an auth; the
 *                                           gateway relays it here - consumed
 *                                           by this file, never seen by the SDK)
 *                       "<json>\n"         (one gateway frame per line; the
 *                                           relay re-frames the TCP stream into
 *                                           complete JSON objects)
 * The SDK's JSON frames are single-line (no embedded newlines) and < ~130 B,
 * so each frame fits in one NUS packet at the negotiated 247-byte MTU.
 *
 * This file also owns the BLE link (enable / NUS / advertising / connection)
 * and exposes app_ble_init()/app_ble_ready() to main.c.
 * ============================================================================= */
#include "port_comm.h"     /* SDK port_comm_ctx_t + prototypes (mosquitto stubbed) */
#include "app_ble.h"
#include "fi_device.h"     /* menu options 2/3: fault injection on the frames */

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/util.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <bluetooth/services/nus.h>

#include <errno.h>
#include <string.h>

#define DEVICE_NAME      CONFIG_BT_DEVICE_NAME
#define DEVICE_NAME_LEN  (sizeof(DEVICE_NAME) - 1)

#define LINE_MAX   256   /* longest single message (JSON frame + framing)        */
#define RXQ_DEPTH  8     /* gateway frames buffered toward the SDK               */

/* -- Inbound queue: complete gateway->device lines, fed by the NUS RX
 *    callback (BT RX thread), drained by port_comm_receive (main thread). -- */
struct rx_msg {
	uint16_t len;
	uint8_t  data[LINE_MAX];
};
K_MSGQ_DEFINE(rx_q, sizeof(struct rx_msg), RXQ_DEPTH, 4);

/* Line assembly for the inbound NUS stream (BT RX thread context only). */
static uint8_t  rx_acc[LINE_MAX];
static uint16_t rx_acc_len;

/* -- BLE link state -- */
static struct bt_conn *current_conn;
static volatile bool   notif_enabled;

/* Handler for gateway-relayed TrustBridge auth triggers (set from main.c). */
static app_ble_trigger_cb_t g_trigger_cb;

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, DEVICE_NAME, DEVICE_NAME_LEN),
};

static const struct bt_data sd[] = {
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_NUS_VAL),
};

/* -- NUS callbacks --------------------------------------------------------- */

/* Gateway -> board control lines are consumed here and never reach the SDK's
 * frame queue. There is exactly one today: "RUN_AUTH <mode>", TrustBridge's
 * cmd/run_auth trigger relayed by the gateway on this board's behalf (the board
 * has no MQTT client of its own - see the TRIGGER capability in HELLO below).
 * Returns true if the line was a control line and has been handled.
 *
 * Runs on the Bluetooth RX thread: the registered callback only signals a
 * worker, it must never authenticate inline. A JSON frame always starts with
 * '{', so there is no ambiguity with real traffic. */
static bool prv_handle_control_line(const uint8_t *line, uint16_t len)
{
	const uint16_t pfx = 8;   /* strlen("RUN_AUTH") */

	if (len < pfx || memcmp(line, "RUN_AUTH", pfx) != 0) {
		return false;
	}

	int mode = 1;   /* no mode digit = normal mutual authentication */
	for (uint16_t i = pfx; i < len; i++) {
		if (line[i] >= '1' && line[i] <= '3') {
			mode = line[i] - '0';
			break;
		}
	}

	printk("\n[BLE] RUN_AUTH from gateway (mode %d) - TrustBridge trigger\n", mode);
	if (g_trigger_cb) {
		g_trigger_cb(mode);
	} else {
		printk("[BLE] no trigger handler registered - ignoring\n");
	}
	return true;
}

/* Central (relay) wrote data on the NUS RX characteristic. Reassemble lines and
 * push each completed line into rx_q for the SDK to consume. */
static void nus_received(struct bt_conn *conn, const uint8_t *const data, uint16_t len)
{
	ARG_UNUSED(conn);

	for (uint16_t i = 0; i < len; i++) {
		uint8_t b = data[i];

		if (b == '\n') {
			if (prv_handle_control_line(rx_acc, rx_acc_len)) {
				rx_acc_len = 0;
				continue;
			}

			struct rx_msg m;
			m.len = rx_acc_len;
			if (rx_acc_len) {
				memcpy(m.data, rx_acc, rx_acc_len);
			}
			rx_acc_len = 0;
			/* Drop the frame rather than block the BT RX thread if the
			 * SDK has fallen behind (should not happen in the ping-pong). */
			(void)k_msgq_put(&rx_q, &m, K_NO_WAIT);
		} else if (rx_acc_len < LINE_MAX) {
			rx_acc[rx_acc_len++] = b;
		} else {
			/* Overflow: resync on the next newline. */
			rx_acc_len = 0;
		}
	}
}

static void prv_schedule_hello(int delay_ms);   /* defined with the presence code below */

static void nus_send_enabled(enum bt_nus_send_status status)
{
	notif_enabled = (status == BT_NUS_SEND_STATUS_ENABLED);
	if (notif_enabled) {
		printk("[BLE] Relay subscribed - link ready\n");
		/* Announce presence: the gateway marks us online in TrustBridge on
		 * the HELLO. Small delay so the central finishes its subscribe
		 * round-trip before the first notification. */
		prv_schedule_hello(100);
	}
}

static struct bt_nus_cb nus_cb = {
	.received     = nus_received,
	.send_enabled = nus_send_enabled,
};

/* -- Connection callbacks -------------------------------------------------- */

static void connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		printk("[BLE] Connection failed (err %u)\n", err);
		return;
	}
	current_conn = bt_conn_ref(conn);
	printk("[BLE] Relay connected\n");
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	ARG_UNUSED(conn);
	printk("[BLE] Relay disconnected (reason 0x%02x)\n", reason);
	notif_enabled = false;
	rx_acc_len    = 0;
	k_msgq_purge(&rx_q);
	if (current_conn) {
		bt_conn_unref(current_conn);
		current_conn = NULL;
	}
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected    = connected,
	.disconnected = disconnected,
};

/* -- Internal helper: send one newline-framed message over NUS ------------- */
static bool nus_send_line(const uint8_t *payload, uint16_t payload_len)
{
	if (current_conn == NULL || !notif_enabled) {
		return false;
	}

	uint8_t frame[LINE_MAX];
	if (payload_len + 1 > (uint16_t)sizeof(frame)) {
		return false;
	}
	if (payload_len) {
		memcpy(frame, payload, payload_len);
	}
	frame[payload_len] = '\n';
	uint16_t frame_len = payload_len + 1;

	/* bt_nus_send can transiently return -ENOMEM while a previous buffer is
	 * in flight; retry briefly. */
	for (int attempt = 0; attempt < 20; attempt++) {
		int err = bt_nus_send(current_conn, frame, frame_len);
		if (err == 0) {
			return true;
		}
		if (err != -ENOMEM && err != -EAGAIN) {
			printk("[BLE] bt_nus_send failed (err %d)\n", err);
			return false;
		}
		k_msleep(5);
	}
	printk("[BLE] bt_nus_send timed out (no buffers)\n");
	return false;
}

/* -- Presence: one-shot "HELLO <tid>" per link-up --------------------------- *
 * TrustBridge derives a device's online/offline state from a retained MQTT
 * status topic that native (IP) devices publish themselves. This board has no
 * IP stack, so the gateway publishes that topic on our behalf - but it needs
 * to know WHICH board is on the link before any auth runs (presence is what
 * triggers auto-auth). Hence one HELLO with our TID as soon as the central
 * subscribes. Sent from the system workqueue, not the BT callback, because
 * nus_send_line may retry/sleep.
 *
 * The TRIGGER token is a capability flag: it tells the gateway to subscribe to
 * our cmd/run_auth topic as well and relay what arrives back down this link, so
 * TrustBridge can DRIVE this board and not just watch it. Gateways that predate
 * the flag ignore the extra token and still get presence. */
static char g_tid_hex[65];   /* set once by app_ble_set_tid() after SDK init */

static void hello_work_handler(struct k_work *work)
{
	ARG_UNUSED(work);

	if (!app_ble_ready()) {
		return;   /* link dropped meanwhile - re-armed on the next subscribe */
	}
	if (g_tid_hex[0] == '\0') {
		/* SDK init (TID read over SPI) hasn't finished yet - retry shortly. */
		prv_schedule_hello(200);
		return;
	}

	char line[96];
	int n = snprintk(line, sizeof(line), "HELLO %s TRIGGER", g_tid_hex);
	if (nus_send_line((const uint8_t *)line, (uint16_t)n)) {
		printk("[BLE] Sent HELLO (presence + trigger proxy) - "
		       "gateway marks us online\n");
	} else {
		printk("[BLE] HELLO send failed - retrying\n");
		prv_schedule_hello(500);
	}
}

static K_WORK_DELAYABLE_DEFINE(hello_work, hello_work_handler);

static void prv_schedule_hello(int delay_ms)
{
	k_work_schedule(&hello_work, K_MSEC(delay_ms));
}

void app_ble_set_tid(const char *tid_hex)
{
	snprintk(g_tid_hex, sizeof(g_tid_hex), "%s", tid_hex);
	/* If the gateway subscribed before the SDK finished init, the pending
	 * HELLO retry loop picks the TID up; if it already gave up, kick it. */
	if (app_ble_ready()) {
		prv_schedule_hello(0);
	}
}

void app_ble_set_trigger_cb(app_ble_trigger_cb_t cb)
{
	g_trigger_cb = cb;
}

/* -- BLE bring-up (called once from main) ---------------------------------- */
int app_ble_init(void)
{
	int err = bt_enable(NULL);
	if (err) {
		printk("[BLE] bt_enable failed (err %d)\n", err);
		return err;
	}

	err = bt_nus_init(&nus_cb);
	if (err) {
		printk("[BLE] bt_nus_init failed (err %d)\n", err);
		return err;
	}

	err = bt_le_adv_start(BT_LE_ADV_CONN_FAST_2, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
	if (err) {
		printk("[BLE] Advertising failed to start (err %d)\n", err);
		return err;
	}

	printk("[BLE] Advertising as '%s'\n", DEVICE_NAME);
	return 0;
}

bool app_ble_ready(void)
{
	return (current_conn != NULL) && notif_enabled;
}

/* ============================================================================
 * SDK port_comm interface
 * ========================================================================== */

bool port_comm_init(port_comm_ctx_t *ctx, const char *device_id)
{
	ARG_UNUSED(ctx);
	ARG_UNUSED(device_id);

	if (!app_ble_ready()) {
		return false;
	}

	/* Start a fresh device<->gateway session: clear any stale inbound frames
	 * and tell the relay to open a TCP connection to the gateway. */
	rx_acc_len = 0;
	k_msgq_purge(&rx_q);

	return nus_send_line((const uint8_t *)"OPEN", 4);
}

bool port_comm_send(port_comm_ctx_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size)
{
	ARG_UNUSED(ctx);

	if (buffer_tx == NULL || buffer_tx_size == 0) {
		return false;
	}

	/* Menu options 2 and 3 corrupt the frame on its way out. Copy first - the
	 * SDK's buffer is not ours to mutate - and terminate it for the JSON scan. */
	char frame[LINE_MAX];
	if ((size_t)buffer_tx_size >= sizeof(frame)) {
		return false;
	}
	memcpy(frame, buffer_tx, buffer_tx_size);
	frame[buffer_tx_size] = '\0';
	fi_apply_tx_frame(frame);

	return nus_send_line((const uint8_t *)frame, buffer_tx_size);
}

bool port_comm_receive(port_comm_ctx_t *ctx, uint8_t *buffer_rx,
		       uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
	ARG_UNUSED(ctx);

	if (buffer_rx == NULL || buffer_rx_received_size == NULL) {
		return false;
	}

	struct rx_msg m;
	if (k_msgq_get(&rx_q, &m, K_NO_WAIT) == 0) {
		uint16_t n = MIN(m.len, buffer_rx_size);
		if (n) {
			memcpy(buffer_rx, m.data, n);
		}
		*buffer_rx_received_size = n;
		/* Inbound half of the fault injection (options 2 and 3): corrupt the
		 * CW the gateway just handed us. The JSON scan needs a terminator;
		 * frames are ~130 B against a 512 B buffer, so the guard only trips
		 * on a malformed giant frame. */
		if (n < buffer_rx_size) {
			buffer_rx[n] = '\0';
			fi_apply_rx_frame((char *)buffer_rx);
		}
		return true;
	}

	/* Queue empty and the link is gone: the reply is never coming. The gateway
	 * unbinds its channel the moment the link drops, so there is no session
	 * left to resume - reporting NO_DATA here would leave the FSM BUSY
	 * forever. Return false instead; server.c maps that to SERVER_COMM_ERROR,
	 * the run fails cleanly and the next trigger starts fresh. */
	if (!app_ble_ready()) {
		printk("[BLE] link lost mid-session - aborting this exchange\n");
		return false;
	}

	/* No frame yet. The SDK busy-loops the FSM, polling this; yield ~1 ms so
	 * the BT RX thread can deliver the gateway's reply and we don't hot-spin.
	 * Returning true with size 0 maps to SERVER_NO_DATA -> FSM stays BUSY. */
	*buffer_rx_received_size = 0;
	k_msleep(1);
	return true;
}

void port_comm_close(port_comm_ctx_t *ctx)
{
	ARG_UNUSED(ctx);
	/* End the session: ask the relay to close the gateway TCP connection.
	 * The BLE link itself stays up for the next authentication. */
	(void)nus_send_line((const uint8_t *)"CLOSE", 5);
}
