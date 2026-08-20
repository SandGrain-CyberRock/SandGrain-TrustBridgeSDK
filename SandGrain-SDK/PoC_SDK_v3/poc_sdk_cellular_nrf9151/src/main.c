/* =============================================================================
 * main.c - SandGrain device+gateway combined on the nRF9151-DK (cellular)
 *
 * Dev-shortcut topology chosen for the cellular phase: the gateway-mode SDK
 * runs ON the board with the SGT1001 attached locally over SPI, talking MQTT
 * over LTE straight to the hosted TrustBridge broker. That is the SDK's
 * "gateway authenticates its own token" path (Token_To_Server /
 * Server_To_Token) - the same shape as the original PC-with-USB-chip PoC,
 * with LTE replacing Ethernet. Every connection is outbound, so carrier-grade
 * NAT never gets in the way. Production keeps device and gateway separate.
 *
 * UART menu (PuTTY on the COM port, 115200):
 *   0  BIST - read + print TID          (works without network)
 *   1  Mutual authentication with cloud (Phase 1 Token->Server, then
 *                                        Phase 2 Server->Token)
 *   2  FW verification, correct RW      (expect FW_OK, arms option 4)
 *   3  FW verification, wrong RW        (expect FW_NOK)
 *   4  Installation                     (needs a successful 2 first)
 *
 * Options 2-4 have no gateway to relay through, so they use the SDK self
 * flows: device-role compute on the local chip, gateway-role bridge frames to
 * CyberRock.
 *
 * There is deliberately NO fault-injection option here, unlike the PC device
 * app and the BLE builds. Fault injection exists to exercise the GATEWAY's
 * Error Management: the gateway keeps the CW it issued, diffs it against the
 * device's echo, rebuilds candidate CWs and asks CyberRock for each one's RW
 * until one matches - which is why a corrupted run there still ends AUT_OK.
 * This board has no gateway relaying for it, and no uncorrupted reference CW
 * to diff against: the corruption would land in port_comm.c, below the
 * middleware, so the board could never tell which bits moved. The frames
 * would simply be rejected by the cloud, which tests nothing the clean run
 * does not already test.
 * ============================================================================= */
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/console/console.h>
#include <zephyr/net/conn_mgr_monitor.h>
#include <zephyr/net/conn_mgr_connectivity.h>

#include "sdk_sgr_user_api.h"
#include "crypto.h"          /* g_sgr_chip_variant, SGR_CHIP_SGB */
#include "sha256.h"          /* pre-computing the RW a signer would embed */
#include "app_mqtt.h"
#include "gw_log.h"
#include "sgr_mw.h"          /* g_sgr_last_claim_token_id */

/* First-enrollment auto re-auth budget. The PC device app reads these from the
 * environment; a board has no environment, so they are compile-time. Four
 * passes at 3s covers a claim that lands while the run is still in flight
 * without holding the auth thread for long. */
#define CLAIM_REAUTH_PASSES   4
#define CLAIM_REAUTH_DELAY_S  3

/* Simulated firmware image, standing in for the contents of the secondary
 * flash partition. Same bytes as the PC device app so a verdict can be compared
 * across the two builds; a real integration hands SGR_SDK_Self_Verification_FW
 * the actual image instead. */
static const uint8_t test_fw_data[] = {
	0x7F, 0x45, 0x4C, 0x46, 0x01, 0x01, 0x01, 0x00,  /* ELF-like header */
	0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE,
	0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
	0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00,
	0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
	0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10,
	0xA5, 0x5A, 0xA5, 0x5A, 0xA5, 0x5A, 0xA5, 0x5A,
	0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77
};

/* What the worker thread should run next. */
enum board_action {
	ACTION_AUTH = 0,
	ACTION_FW_VERIFY_OK,
	ACTION_FW_VERIFY_NOK,
	ACTION_INSTALL
};

#define L4_EVENT_MASK         (NET_EVENT_L4_CONNECTED | NET_EVENT_L4_DISCONNECTED)
#define CONN_LAYER_EVENT_MASK (NET_EVENT_CONN_IF_FATAL_ERROR)

static K_SEM_DEFINE(network_connected_sem, 0, 1);
static struct net_mgmt_event_callback l4_cb;
static struct net_mgmt_event_callback conn_cb;

static bool g_sdk_ready;
static char g_tid_hex[65];

/* SDK flows run on a dedicated worker thread so they can be started both from
 * the UART menu and from TrustBridge's cmd/run_auth trigger (which arrives on
 * the MQTT RX thread - that thread must NOT block for the length of a run,
 * since the run itself needs it to deliver the cloud's replies).
 *
 * One thread, one busy flag, for every flow: auth, FW verification and
 * installation all drive the same chip over the same SPI bus and the same
 * server context over the same MQTT connection, so they must never overlap. */
static K_SEM_DEFINE(work_sem, 0, 1);
static atomic_t g_busy;
static atomic_t g_pending_action;   /* enum board_action */

/* -- LTE ---------------------------------------------------------------------- */
static void l4_event_handler(struct net_mgmt_event_callback *cb,
			     uint64_t event, struct net_if *iface)
{
	ARG_UNUSED(cb);
	ARG_UNUSED(iface);

	switch (event) {
	case NET_EVENT_L4_CONNECTED:
		printk("[LTE] Connected - IP address assigned\n");
		k_sem_give(&network_connected_sem);
		break;
	case NET_EVENT_L4_DISCONNECTED:
		printk("[LTE] Network connectivity lost\n");
		break;
	default:
		break;
	}
}

static void connectivity_event_handler(struct net_mgmt_event_callback *cb,
				       uint64_t event, struct net_if *iface)
{
	ARG_UNUSED(cb);
	ARG_UNUSED(iface);

	if (event == NET_EVENT_CONN_IF_FATAL_ERROR) {
		printk("[LTE] Fatal error from the connectivity layer\n");
	}
}

static int lte_connect(void)
{
	int err;

	net_mgmt_init_event_callback(&l4_cb, l4_event_handler, L4_EVENT_MASK);
	net_mgmt_add_event_callback(&l4_cb);
	net_mgmt_init_event_callback(&conn_cb, connectivity_event_handler,
				     CONN_LAYER_EVENT_MASK);
	net_mgmt_add_event_callback(&conn_cb);

	printk("[LTE] Bringing the modem network interface up...\n");
	err = conn_mgr_all_if_up(true);
	if (err) {
		printk("[LTE] conn_mgr_all_if_up failed (err %d)\n", err);
		return err;
	}

	printk("[LTE] Attaching to the network (can take a few minutes)...\n");
	err = conn_mgr_all_if_connect(true);
	if (err) {
		printk("[LTE] conn_mgr_all_if_connect failed (err %d)\n", err);
		return err;
	}
	k_sem_take(&network_connected_sem, K_FOREVER);
	return 0;
}

/* -- SDK ---------------------------------------------------------------------- */
static bool run_bist(void)
{
	sgr_sdk_bist_result_t bist = {0};
	sgr_sdk_status_t st = SGR_SDK_BIST(&bist);

	if (st != SGR_SDK_OK && st != SGR_SDK_AUTH_FAILED) {
		printk("[BIST] error (status=%d) - is the SGT1001 wired to the SPI header?\n", st);
		return false;
	}

	printk("[BIST] status byte: 0x%02x (%s)\n",
	       bist.bist_byte, bist.passed ? "PASS" : "not PASS");

	for (int i = 0; i < 16; i++) {
		snprintk(&g_tid_hex[i * 2], 3, "%02x", bist.pcc[i]);
	}
	for (int i = 0; i < 16; i++) {
		snprintk(&g_tid_hex[32 + i * 2], 3, "%02x", bist.id[i]);
	}
	printk("TID: %s\n", g_tid_hex);
	return true;
}

/* (Re)initialize the SDK - reads the chip TID over SPI. Retryable so the
 * chip can be wired/fixed without reflashing. */
static bool sdk_init(void)
{
	if (g_sdk_ready) {
		return true;
	}
	printk("[INIT] Initializing gateway SDK (reads TID over SPI)...\n");
	if (SGR_SDK_Initialize() != SGR_SDK_OK) {
		printk("[INIT] FAILED - crypto chip not responding. Check the wiring:\n");
		printk("       CLK->D13  MISO->D12  MOSI->D11  CSN->D10  VCC->3V3  GND->GND\n");
		return false;
	}
	g_sgr_chip_variant = SGR_CHIP_SGB;
	g_sdk_ready = true;
	printk("[INIT] SDK ready (chip variant: SGB)\n");
	return true;
}

static void run_mutual_auth(void)
{
	sgr_sdk_status_t st;

	if (!sdk_init()) {
		return;
	}
	if (!app_mqtt_is_up()) {
		printk("  [!] Broker connection is down - cannot authenticate.\n");
		return;
	}

	/* Step telemetry so the TrustBridge activity board renders this run
	 * (same topics/format as the PC gateway's per-step gw_log). */
	gw_log_publish(g_tid_hex, "1/6", "ok",
		       "Auth run started - combined device+gateway (cellular)", 1);

	printk("\n[AUTH] Phase 1 - Token -> Server (cloud verifies the chip)...\n");
	st = SGR_SDK_Authentication_Token_To_Server();

	/* First-enrollment auto re-auth. An unclaimed chip authenticates fine but
	 * CyberRock answers CLAIM_TOKEN instead of AUTH_OK; the BE then claims that
	 * token, and a later pass yields the real verdict. Drive those passes here,
	 * after a delay, so an FE-triggered run finishes enrollment on its own
	 * instead of needing a second trigger - same behaviour as the PC device app.
	 *
	 * This is NOT the tight retry the middleware refuses to do: the delay is the
	 * whole point, and the middleware still returns after a single attempt. The
	 * sleep runs on the dedicated auth thread, so the MQTT RX thread keeps
	 * servicing keepalives and the broker connection stays up throughout. */
	for (int pass = 1;
	     st == SGR_SDK_CLAIM_TOKEN_READY && pass <= CLAIM_REAUTH_PASSES;
	     pass++) {
		printk("  Token ready to be claimed: %s\n", g_sgr_last_claim_token_id);
		printk("  Waiting %ds for the claim to settle, re-auth (pass %d/%d)...\n",
		       CLAIM_REAUTH_DELAY_S, pass, CLAIM_REAUTH_PASSES);
		gw_log_publish(g_tid_hex, "claim", "info",
			       "Token ready to be claimed - awaiting claim", pass);
		k_sleep(K_SECONDS(CLAIM_REAUTH_DELAY_S));
		st = SGR_SDK_Authentication_Token_To_Server();
	}

	if (st == SGR_SDK_CLAIM_TOKEN_READY) {
		/* Still unclaimed after every pass. Stop without publishing
		 * auth_result 0 - that would mark the device Rejected in the FE for
		 * what is a pending claim, and Phase 2 has nothing to verify yet. */
		printk("  >> Phase 1 PENDING - token still not claimed after %d passes\n",
		       CLAIM_REAUTH_PASSES);
		printk("     Claim TID %.16s... in TrustBridge, then run auth again.\n",
		       g_tid_hex);
		gw_log_publish(g_tid_hex, "claim", "info",
			       "Claim still pending - will finish on the next trigger",
			       CLAIM_REAUTH_PASSES);
		return;
	}
	if (st != SGR_SDK_OK) {
		printk("  >> Phase 1 FAILED (status=%d)\n", st);
		printk("     (is TID %.16s... registered in TrustBridge?)\n", g_tid_hex);
		gw_log_publish(g_tid_hex, "auth", "fail",
			       "Phase 1 - CyberRock rejected token authentication", 1);
		gw_log_publish(g_tid_hex, "6/6", "fail",
			       "Phase 1 failed - CR verdict AUT_NOK", 1);
		gw_log_publish_auth_result(g_tid_hex, 0);
		return;
	}
	printk("  >> Phase 1 OK - cloud accepted the chip\n");
	gw_log_publish(g_tid_hex, "auth", "ok",
		       "Phase 1 - token authentication verified by CyberRock", 1);
	gw_log_publish(g_tid_hex, "6/6", "ok",
		       "Phase 1 complete - token auth verified", 1);

	printk("\n[AUTH] Phase 2 - Server -> Token (chip verifies the cloud)...\n");
	st = SGR_SDK_Authentication_Server_To_Token();
	if (st != SGR_SDK_OK) {
		printk("  >> Phase 2 FAILED (status=%d)\n", st);
		gw_log_publish(g_tid_hex, "Phase 2", "fail",
			       "Phase 2 - HRW mismatch, cloud identity NOT verified", 1);
		gw_log_publish_auth_result(g_tid_hex, 0);
		return;
	}
	printk("  >> MUTUAL AUTHENTICATION OK\n");
	gw_log_publish(g_tid_hex, "Phase 2", "ok",
		       "Phase 2 - chip verified cloud identity (HRW match)", 1);
	gw_log_publish_auth_result(g_tid_hex, 1);
}

/* Pre-compute the RW a signing authority would have embedded in the image:
 * SHA-256 over the image is the CW, and the chip turns that into the RW. The
 * OK case passes it back to the SDK unchanged; the NOK case passes zeros, which
 * stands in for a tampered or unsigned image. */
static bool fw_expected_rw(uint8_t rw_out[16])
{
	uint8_t hash[32];

	sha256_compute(test_fw_data, sizeof(test_fw_data), hash);
	if (crypto_get_rw(hash, sizeof(hash), rw_out, 16, NULL, 0,
			  SGR_CRYPTO_MODE_HOST_AUTH) != SGR_CRYPTO_OK) {
		printk("  [!] Crypto chip failed to compute the expected RW\n");
		return false;
	}
	return true;
}

static void run_fw_verification(bool use_valid_rw)
{
	sgr_sdk_status_t st;
	uint8_t          rw_valid[16] = {0};
	uint8_t          rw_wrong[16] = {0};   /* zeros - deliberately not the RW */

	if (!sdk_init()) {
		return;
	}
	if (!app_mqtt_is_up()) {
		printk("  [!] Broker connection is down - cannot reach CyberRock.\n");
		return;
	}
	if (!fw_expected_rw(rw_valid)) {
		return;
	}

	printk("\n[ FW ] Image size: %u bytes, using the %s RW\n",
	       (unsigned)sizeof(test_fw_data),
	       use_valid_rw ? "CORRECT" : "WRONG");
	gw_log_publish(g_tid_hex, "fw", "ok",
		       use_valid_rw ? "FW verification started - valid image"
				    : "FW verification started - tampered image", 1);

	st = SGR_SDK_Self_Verification_FW(test_fw_data, sizeof(test_fw_data),
					  use_valid_rw ? rw_valid : rw_wrong);

	if (st == SGR_SDK_OK) {
		printk("  >> FW VERIFICATION OK - FW_OK recorded, option 4 is armed\n");
		gw_log_publish(g_tid_hex, "fw", "ok",
			       "FW verification passed - install permission granted", 1);
	} else if (st == SGR_SDK_AUTH_FAILED) {
		printk("  >> FW VERIFICATION NOK - FW_NOK recorded (expected for option 3)\n");
		gw_log_publish(g_tid_hex, "fw", "fail",
			       "FW verification failed - install permission denied", 1);
	} else if (st == SGR_SDK_COMM_ERROR) {
		printk("  >> FW verification ERROR - cloud communication failed (status=%d)\n", st);
	} else if (st == SGR_SDK_TOKEN_ERROR) {
		printk("  >> FW verification ERROR - crypto chip failed (status=%d)\n", st);
	} else {
		printk("  >> FW verification ERROR (status=%d)\n", st);
	}
}

static void run_installation(void)
{
	sgr_sdk_status_t st;

	if (!sdk_init()) {
		return;
	}
	if (!app_mqtt_is_up()) {
		printk("  [!] Broker connection is down - cannot reach CyberRock.\n");
		return;
	}

	printk("\n[INST] Requesting installation authorization...\n");
	gw_log_publish(g_tid_hex, "install", "ok",
		       "Installation authorization requested", 1);

	st = SGR_SDK_Self_Installation();

	if (st == SGR_SDK_OK) {
		printk("  >> INSTALLATION AUTHORIZED\n");
		gw_log_publish(g_tid_hex, "install", "ok",
			       "Installation authorized by CyberRock", 1);
	} else if (st == SGR_SDK_AUTH_FAILED) {
		printk("  >> INSTALLATION DENIED\n");
		gw_log_publish(g_tid_hex, "install", "fail",
			       "Installation denied by CyberRock", 1);
	} else if (st == SGR_SDK_COMM_ERROR) {
		printk("  >> Installation ERROR - cloud communication failed (status=%d)\n", st);
	} else if (st == SGR_SDK_TOKEN_ERROR) {
		printk("  >> Installation ERROR - crypto chip failed (status=%d)\n", st);
	} else {
		printk("  >> Installation ERROR (status=%d)\n", st);
		printk("     (run option 2 first - the cloud needs a fresh FW_OK record,\n");
		printk("      and that record expires a few minutes after it is made)\n");
	}
}

/* Called by app_mqtt.c (MQTT RX thread) on a TrustBridge auth trigger.
 * TrustBridge sends {"mode":N}. This build has one auth flow, so every mode
 * runs it. Modes 2 and 3 - fault injection on the PC and BLE builds - are
 * called out rather than silently treated as a normal run, so a pass in the
 * frontend is never mistaken for a fault-injection result. */
void app_on_run_auth(int mode)
{
	if (mode == 2 || mode == 3) {
		printk("[MQTT] Mode %d (fault injection) does not exist on this "
		       "build - running a normal mutual auth.\n", mode);
		printk("       Fault injection exercises the gateway's Error "
		       "Management; this board has no gateway relaying for it.\n");
	}

	atomic_set(&g_pending_action, ACTION_AUTH);
	k_sem_give(&work_sem);
}

/* Queue a menu-selected flow. Refuses while the worker is running, since every
 * flow needs exclusive use of the chip and the server context. */
static void request_action(enum board_action action)
{
	if (atomic_get(&g_busy)) {
		printk("  [!] A run is already in progress - try again when it finishes\n");
		return;
	}
	atomic_set(&g_pending_action, action);
	k_sem_give(&work_sem);
}

static void print_menu(void);

static void worker_thread_fn(void *a, void *b, void *c)
{
	ARG_UNUSED(a); ARG_UNUSED(b); ARG_UNUSED(c);

	while (1) {
		k_sem_take(&work_sem, K_FOREVER);
		if (!atomic_cas(&g_busy, 0, 1)) {
			continue;   /* a run is already in progress */
		}
		switch ((enum board_action)atomic_get(&g_pending_action)) {
		case ACTION_FW_VERIFY_OK:
			run_fw_verification(true);
			break;
		case ACTION_FW_VERIFY_NOK:
			run_fw_verification(false);
			break;
		case ACTION_INSTALL:
			run_installation();
			break;
		case ACTION_AUTH:
		default:
			run_mutual_auth();
			break;
		}
		atomic_set(&g_busy, 0);
		/* A background-triggered run scrolls the console - reprint the
		 * prompt so the menu doesn't look dead afterwards. */
		print_menu();
	}
}

K_THREAD_DEFINE(worker_thread, 8192, worker_thread_fn, NULL, NULL, NULL, 5, 0, 0);

/* -- Menu --------------------------------------------------------------------- */
static void print_menu(void)
{
	printk("\n=====================================================\n");
	printk("  Select an option:\n");
	printk("   0  BIST - read + print TID\n");
	printk("   1  Mutual Authentication with TrustBridge (over LTE)\n");
	printk("   2  FW Verification - correct RW (expect FW_OK, arms option 4)\n");
	printk("   3  FW Verification - wrong RW   (expect FW_NOK)\n");
	printk("   4  Installation - request install auth (run option 2 first)\n");
	printk("=====================================================\n");
	printk("  Option: ");
}

int main(void)
{
	k_sleep(K_MSEC(300));
	printk("\n=====================================================\n");
	printk("  SandGrain DEVICE+GATEWAY - mutual auth over LTE\n");
	printk("  board:  %s\n", CONFIG_BOARD_TARGET);
	printk("  broker: %s:%d\n", APP_MQTT_BROKER_HOST, APP_MQTT_BROKER_PORT);
	printk("=====================================================\n");

	/* Read the chip FIRST (SPI needs no network): the TID must be known
	 * before the MQTT CONNECT so the retained Last Will - "offline" on
	 * this chip's status topic - can ride along in it. */
	bool have_tid = sdk_init() && run_bist();

	if (!have_tid) {
		printk("[WARN] TID unknown - connecting without a presence will"
		       " (fix the chip, then use menu option 0)\n");
	}

	if (lte_connect() != 0) {
		printk("[FATAL] LTE bring-up failed\n");
		return 0;
	}
	if (app_mqtt_start(have_tid ? g_tid_hex : NULL) != 0) {
		printk("[WARN] Broker unreachable - reconnecting in the background\n");
	}
	gw_log_init();

	if (have_tid) {
		/* Board announces itself online (retained) - same presence
		 * semantics as native devices and the BLE gateway proxy. */
		app_mqtt_publish_presence(g_tid_hex, true);
		/* Let TrustBridge trigger auth runs (online device flow). */
		app_mqtt_subscribe_run_auth(g_tid_hex);
	}

	console_init();
	print_menu();

	while (1) {
		uint8_t c = console_getchar();

		if (c == '\r' || c == '\n') {
			continue;
		}
		printk("%c\n", c);

		switch (c) {
		case '0':
			if (atomic_get(&g_busy)) {
				printk("  [!] Auth run in progress - try again after it finishes\n");
				break;
			}
			if (sdk_init() && run_bist() && g_tid_hex[0]) {
				if (app_mqtt_reconnect_with_tid(g_tid_hex) == 0) {
					/* Identity already installed - just
					 * refresh the retained state. */
					app_mqtt_publish_presence(g_tid_hex, true);
					app_mqtt_subscribe_run_auth(g_tid_hex);
				} else {
					printk("  [i] Installing TID identity - reconnecting to broker...\n");
				}
			}
			break;
		case '1':
			request_action(ACTION_AUTH);
			break;
		case '2':
			request_action(ACTION_FW_VERIFY_OK);
			break;
		case '3':
			request_action(ACTION_FW_VERIFY_NOK);
			break;
		case '4':
			request_action(ACTION_INSTALL);
			break;
		default:
			printk("  [!] Invalid option\n");
			break;
		}
		print_menu();
	}
	return 0;
}
