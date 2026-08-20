/* =============================================================================
 * main.c - SandGrain device on the nRF54L15-DK
 *
 * Runs the real device-side SDK flow on the board, talking to the gateway over
 * BLE (NUS). Two front-ends, chosen by CONFIG_SANDGRAIN_INTERACTIVE_MENU:
 *
 *   MENU (default): an interactive menu on the UART console (COM port) to run
 *     BIST / mutual authentication on demand - like the PC test app. Needs an
 *     interactive serial terminal that can send keystrokes.
 *
 *   AUTO (config n): wait for the relay/gateway link, then authenticate
 *     automatically every few seconds.
 *
 * Either way auth runs over the same BLE transport (relay -> gateway -> cloud).
 *
 * On top of both, TrustBridge can trigger an authentication itself: the gateway
 * subscribes to this board's cmd/run_auth topic (it has no MQTT client of its
 * own) and relays the trigger over BLE, where it is handled exactly like the
 * menu's "1" - see the trigger section below.
 * ============================================================================= */
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#include <string.h>

#include "sdk_sgr_user_api.h"
#include "sgr_mw.h"          /* g_sgr_last_claim_token_id */
#include "crypto.h"          /* g_sgr_chip_variant, SGR_CHIP_SGB */
#include "sha256.h"          /* FW verification hashes the test image */
#include "fi_device.h"       /* fault-injection flags for menu options 2 / 3 */
#include "comm_adapter.h"    /* wraps port_comm.c as the SDK's comm interface */
#include "app_ble.h"

#if defined(CONFIG_SANDGRAIN_INTERACTIVE_MENU)
#include <zephyr/console/console.h>
#else
#define REAUTH_PERIOD_S  10
#endif

/* Simulated firmware image for the FW-verification options, byte-identical to
 * the PC device app's so both report the same hash. In a real system this would
 * be read from the secondary flash partition. */
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
static const uint32_t test_fw_size = sizeof(test_fw_data);

/* Progress events from the auth FSM, same [EVT] trail the PC/Pi app prints.
 * Invoked synchronously from inside the flow - observe only, never call back
 * into SGR_SDK_* from here. */
static const char *auth_event_name(sgr_sdk_event_t e)
{
	switch (e) {
	case SGR_SDK_EVT_AUTH_STARTED:      return "AUTH_STARTED";
	case SGR_SDK_EVT_AUTH_REQUEST_SENT: return "AUTH_REQUEST_SENT";
	case SGR_SDK_EVT_CW_RECEIVED:       return "CW_RECEIVED";
	case SGR_SDK_EVT_RW_COMPUTED:       return "RW_COMPUTED";
	case SGR_SDK_EVT_RW_SENT:           return "RW_SENT";
	case SGR_SDK_EVT_RESULT_RECEIVED:   return "RESULT_RECEIVED";
	case SGR_SDK_EVT_AUTH_COMPLETE:     return "AUTH_COMPLETE";
	case SGR_SDK_EVT_AUTH_FAILED:       return "AUTH_FAILED";
	case SGR_SDK_EVT_RETRY:             return "RETRY";
	default:                            return "UNKNOWN";
	}
}

static void on_auth_event(sgr_sdk_event_t e, void *user)
{
	ARG_UNUSED(user);
	printk("        [EVT] %s\n", auth_event_name(e));
}

static void print_hex(const char *label, const uint8_t *buf, int len)
{
	printk("%s", label);
	for (int i = 0; i < len; i++) {
		printk("%02x", buf[i]);
	}
	printk("\n");
}

/* Menu option 0. Prints the same fields the PC app's BIST does, and hands the
 * TID to the BLE layer: it announces "HELLO <tid>" to the gateway on every
 * link-up, which is what puts this board online in TrustBridge. */
static void run_bist(void)
{
	sgr_sdk_bist_result_t bist = {0};
	sgr_sdk_status_t st = SGR_SDK_BIST(&bist);

	if (st != SGR_SDK_OK && st != SGR_SDK_AUTH_FAILED) {
		printk("[BIST] error (status=%d) - crypto chip transport?\n", st);
		return;
	}

	print_hex("[BIST] PCC    : ", bist.pcc, 16);
	print_hex("[BIST] ID     : ", bist.id,  16);
	print_hex("[BIST] RW     : ", bist.rw,  16);
	print_hex("[BIST] EK     : ", bist.ek,  16);
	printk("[BIST] Status : 0x%02x  (0x50 == PASS)\n", bist.bist_byte);
	printk("  >> BIST %s\n", bist.passed ? "PASS" : "FAIL");

	char tid_hex[65];
	for (int i = 0; i < 16; i++) {
		snprintk(&tid_hex[i * 2], 3, "%02x", bist.pcc[i]);
	}
	for (int i = 0; i < 16; i++) {
		snprintk(&tid_hex[32 + i * 2], 3, "%02x", bist.id[i]);
	}
	printk("TID: %s\n", tid_hex);

	app_ble_set_tid(tid_hex);
}

static void print_auth_result(sgr_sdk_status_t st)
{
	switch (st) {
	case SGR_SDK_OK:
		printk("  >> Mutual Authentication OK (token + host auth)\n");
		break;
	case SGR_SDK_AUTH_FAILED:
		printk("  >> Authentication FAILED (token auth - cloud rejected device)\n");
		break;
	case SGR_SDK_MUTUAL_AUTH_FAILED:
		printk("  >> Mutual Authentication FAILED (host auth - HRW mismatch)\n");
		break;
	case SGR_SDK_CLAIM_TOKEN_READY:
		printk("  >> Token ready to be claimed (not yet bound to a tenant)\n");
		break;
	case SGR_SDK_COMM_ERROR:
		printk("  >> Communication error (relay/gateway link)\n");
		break;
	case SGR_SDK_TOKEN_ERROR:
		printk("  >> Crypto chip error\n");
		break;
	default:
		printk("  >> Error (status=%d)\n", st);
		break;
	}
}

/* First-time enrollment: an unclaimed chip authenticates fine but the cloud
 * answers CLAIM_TOKEN instead of AUTH_OK. TrustBridge then claims that token,
 * and a second pass a moment later yields AUTH_OK. These bound the delayed
 * re-auth the triggered path drives so a TrustBridge-started flow finishes
 * enrollment on its own instead of ending "Rejected". */
#define CLAIM_REAUTH_PASSES   4
#define CLAIM_REAUTH_DELAY_S  3

K_MUTEX_DEFINE(sdk_lock);

/* Modes 1-3 are the PC app's authentication options, and they mean the same
 * thing here: the flags below are read by the transport (port_comm.c), which
 * flips bits in the JSON frames on their way past. Mode 1 clears them all. */
static const char *fi_select_mode(int mode)
{
	fi_enable_cw      = 0;
	fi_enable_cw_echo = 0;
	fi_enable_rw      = 0;
	fi_enable_option3 = 0;
	fi_skip_phase2    = 0;

	switch (mode) {
	case 2:
		fi_enable_cw      = 1;
		fi_enable_cw_echo = 1;
		fi_enable_rw      = 1;
		fi_skip_phase2    = 1;
		return "Fault injection (CW 2 bits, CW echo 1 bit, RW 1 bit)";
	case 3:
		fi_enable_option3 = 1;
		fi_skip_phase2    = 1;
		return "Error Management stress (CW 3 bits, CW echo 2 bits)";
	default:
		return "Mutual Authentication (no fault injection)";
	}
}

/* One shared BLE session serves every auth path, and SGR_SDK_Authenticate_Via_GW
 * is not reentrant - the menu and the TrustBridge trigger must take turns.
 * Returns false if an authentication was already in flight (the caller reports
 * it; nothing is queued, TrustBridge simply triggers again).
 *
 * `claim_retry` drives the delayed re-auth passes above. The triggered path
 * wants them (nobody is watching the console to press "1" again); the menu path
 * stays a single deliberate pass, matching the PC device build. */
static bool run_auth_guarded(int mode, bool claim_retry)
{
	if (k_mutex_lock(&sdk_lock, K_NO_WAIT) != 0) {
		printk("  [!] The SDK is busy with another operation - request ignored\n");
		return false;
	}

	const char *name = fi_select_mode(mode);
	printk("\n[AUTH] Mode %d: %s\n", mode, name);
	printk("[AUTH] Authenticating via gateway...\n");
	sgr_sdk_status_t st = SGR_SDK_Authenticate_Via_GW();

	if (claim_retry) {
		for (int pass = 1;
		     st == SGR_SDK_CLAIM_TOKEN_READY && pass <= CLAIM_REAUTH_PASSES;
		     pass++) {
			printk("  Token ready to be claimed: %s\n", g_sgr_last_claim_token_id);
			printk("  Waiting %ds for claim to settle, re-authenticating (pass %d/%d)...\n",
			       CLAIM_REAUTH_DELAY_S, pass, CLAIM_REAUTH_PASSES);
			k_sleep(K_SECONDS(CLAIM_REAUTH_DELAY_S));
			st = SGR_SDK_Authenticate_Via_GW();
		}
	}

	/* Leave the flags clear so the next run is clean unless it asks otherwise. */
	fi_select_mode(1);

	print_auth_result(st);
	k_mutex_unlock(&sdk_lock);
	return true;
}

/* Menu options 4 and 5. Option 4 also saves RW_verify inside the SDK, which is
 * what option 6 (Installation) needs - run 4 before 6.
 *
 *   use_valid_rw = 1: pre-compute the correct RW (SHA-256 of the image, then
 *     the crypto chip) and hand it over - a legitimately signed image, expect
 *     FW_OK.
 *   use_valid_rw = 0: hand over an all-zero RW - a tampered image, expect
 *     FW_NOK. */
static void run_fw_verification(bool use_valid_rw)
{
	uint8_t fw_hash[32]      = {0};
	uint8_t fw_rw_valid[16]  = {0};
	uint8_t fw_rw_wrong[16]  = {0};   /* all zeros - intentionally wrong */

	if (k_mutex_lock(&sdk_lock, K_NO_WAIT) != 0) {
		printk("  [!] The SDK is busy with another operation - request ignored\n");
		return;
	}

	printk("\n[FW] Simulated FW size: %u bytes\n", (unsigned)test_fw_size);
	sha256_compute(test_fw_data, test_fw_size, fw_hash);
	print_hex("[FW] SHA-256    : ", fw_hash, 32);

	if (crypto_get_rw(fw_hash, sizeof(fw_hash),
			  fw_rw_valid, sizeof(fw_rw_valid),
			  NULL, 0,
			  SGR_CRYPTO_MODE_HOST_AUTH) != SGR_CRYPTO_OK) {
		printk("  >> crypto_get_rw failed - is the SGT1001 connected?\n");
		k_mutex_unlock(&sdk_lock);
		return;
	}
	print_hex("[FW] Expected RW: ", fw_rw_valid, 16);
	printk("[FW] Using %s RW\n",
	       use_valid_rw ? "CORRECT (valid image)" : "WRONG (tampered image)");

	sgr_sdk_status_t st = SGR_SDK_Verification_FW(test_fw_data, test_fw_size,
						      use_valid_rw ? fw_rw_valid : fw_rw_wrong);

	if (st == SGR_SDK_OK) {
		printk("  >> FW Verification OK - FW_OK sent to the gateway\n");
	} else if (st == SGR_SDK_AUTH_FAILED) {
		printk("  >> FW Verification NOK - FW_NOK sent to the gateway\n");
	} else if (st == SGR_SDK_COMM_ERROR) {
		printk("  >> FW Verification ERROR - gateway link failed (status=%d)\n", st);
	} else if (st == SGR_SDK_TOKEN_ERROR) {
		printk("  >> FW Verification ERROR - crypto chip failed (status=%d)\n", st);
	} else {
		printk("  >> FW Verification ERROR (status=%d)\n", st);
	}

	k_mutex_unlock(&sdk_lock);
}

/* Menu option 6. Requires option 4 to have run in this session: it is the
 * FW_OK path that saves RW_verify, from which CW_install is derived. */
static void run_installation(void)
{
	if (k_mutex_lock(&sdk_lock, K_NO_WAIT) != 0) {
		printk("  [!] The SDK is busy with another operation - request ignored\n");
		return;
	}

	printk("\n[INST] Requesting installation authorization...\n");
	sgr_sdk_status_t st = SGR_SDK_Installation();

	if (st == SGR_SDK_OK) {
		printk("  >> Installation AUTHORIZED\n");
	} else if (st == SGR_SDK_AUTH_FAILED) {
		printk("  >> Installation DENIED (did you run option 4 first?)\n");
	} else if (st == SGR_SDK_COMM_ERROR) {
		printk("  >> Installation ERROR - gateway link failed (status=%d)\n", st);
	} else if (st == SGR_SDK_TOKEN_ERROR) {
		printk("  >> Installation ERROR - crypto chip failed (status=%d)\n", st);
	} else {
		printk("  >> Installation ERROR (status=%d)\n", st);
	}

	k_mutex_unlock(&sdk_lock);
}

#if defined(CONFIG_SANDGRAIN_INTERACTIVE_MENU)
/* Same option numbering as the PC device app, so a demo script reads the same
 * on either device. Only "7 Exit" is missing - a board has nothing to exit to. */
static void print_menu(void)
{
	printk("\n=====================================================\n");
	printk("  Select test option:\n");
	printk("  --- BIST ---\n");
	printk("   0  BIST - Built-In Self-Test (crypto chip) + TID\n");
	printk("  --- Authentication ---\n");
	printk("   1  Mutual Authentication (no fault injection)\n");
	printk("   2  Fault injection (CW: 2 bits, CW echo: 1 bit, RW: 1 bit)\n");
	printk("   3  Fault injection - Error Management stress (CW: 3 bits, CW echo: 2 bits)\n");
	printk("  --- FW Verification ---\n");
	printk("   4  FW Verification - correct RW  (expect FW_OK, saves RW_verify)\n");
	printk("   5  FW Verification - wrong RW    (expect FW_NOK)\n");
	printk("  --- Installation ---\n");
	printk("   6  Installation    - request install auth (run option 4 first)\n");
	printk("=====================================================\n");
	printk("  Option: ");
}

/* Everything except BIST talks to the gateway. */
static bool link_required(void)
{
	if (app_ble_ready()) {
		return true;
	}
	printk("  [!] Relay/gateway link not up yet - connect the relay "
	       "(or the BLE gateway) first.\n");
	return false;
}

static void menu_loop(void)
{
	console_init();
	print_menu();

	while (1) {
		uint8_t c = console_getchar();

		/* ignore line endings from terminals that send CR/LF */
		if (c == '\r' || c == '\n') {
			continue;
		}
		printk("%c\n", c);

		switch (c) {
		case '0':
			run_bist();
			break;
		case '1':
		case '2':
		case '3':
			if (link_required()) {
				run_auth_guarded(c - '0', false);
			}
			break;
		case '4':
		case '5':
			if (link_required()) {
				run_fw_verification(c == '4');
			}
			break;
		case '6':
			if (link_required()) {
				run_installation();
			}
			break;
		default:
			printk("  [!] Invalid option\n");
			break;
		}
		print_menu();
	}
}
#endif /* CONFIG_SANDGRAIN_INTERACTIVE_MENU */

/* =============================================================================
 * TrustBridge-driven authentication (BE -> gateway -> board)
 *
 * A native (IP) device subscribes to sandgrain/v1/{tid}/cmd/run_auth itself and
 * authenticates when the backend publishes there. This board has no IP stack, so
 * the gateway does it on our behalf and relays the trigger over the BLE link
 * (it learned which TID we are from the HELLO we send on every link-up). What
 * arrives here is a "RUN_AUTH <mode>" line, consumed by port_comm.c.
 *
 * The trigger lands on the Bluetooth RX thread, which must stay responsive -
 * the authentication it kicks off needs that very thread to deliver the
 * gateway's replies, so running it inline would deadlock the flow. Hence a
 * dedicated worker: the callback only signals, the worker authenticates.
 *
 * The worker stack mirrors CONFIG_MAIN_STACK_SIZE - it runs the same auth FSM,
 * whose 512-byte TX/RX frame buffers dominate the frame.
 * ============================================================================= */
#define AUTH_WORKER_STACK  4096
#define AUTH_WORKER_PRIO   5

static K_SEM_DEFINE(trigger_sem, 0, 1);
static atomic_t     trigger_mode = ATOMIC_INIT(1);

/* Runs on the Bluetooth RX thread: signal only, never authenticate here.
 * The mode carries the same 1/2/3 meaning as the menu, so TrustBridge can ask
 * for a fault-injection run exactly as it can from a PC device. */
static void on_ble_trigger(int mode)
{
	if (mode < 1 || mode > 3) {
		mode = 1;
	}
	atomic_set(&trigger_mode, mode);
	k_sem_give(&trigger_sem);
}

static void auth_worker(void *a, void *b, void *c)
{
	ARG_UNUSED(a);
	ARG_UNUSED(b);
	ARG_UNUSED(c);

	while (1) {
		k_sem_take(&trigger_sem, K_FOREVER);

		if (!app_ble_ready()) {
			/* The link that carried the trigger dropped in between. */
			printk("[TRIGGER] gateway link is down - skipping\n");
			continue;
		}

		run_auth_guarded((int)atomic_get(&trigger_mode), true);

#if defined(CONFIG_SANDGRAIN_INTERACTIVE_MENU)
		/* The main thread is parked in console_getchar with a half-printed
		 * prompt; put the menu back so the console does not look dead. */
		print_menu();
#endif
	}
}

K_THREAD_DEFINE(auth_worker_tid, AUTH_WORKER_STACK, auth_worker,
		NULL, NULL, NULL, AUTH_WORKER_PRIO, 0, 0);

int main(void)
{
	k_sleep(K_MSEC(300));
	printk("\n=====================================================\n");
	printk("  SandGrain DEVICE - mutual auth via GW over BLE\n");
	printk("  board: %s\n", CONFIG_BOARD_TARGET);
	printk("=====================================================\n");

	if (app_ble_init() != 0) {
		printk("[FATAL] BLE init failed\n");
		return 0;
	}

	/* Register the transport. The SDK no longer calls port_comm_* directly -
	 * the application supplies an sgr_sdk_comm_interface_t, and comm_adapter.c
	 * is the stock adapter that forwards to whatever port_comm.c is linked in
	 * (here: BLE NUS). Without this every SERVER_Open fails and the auth FSM
	 * reports "Failed to connect to GW". */
	{
		sgr_sdk_comm_interface_t comm;
		comm_adapter_get_interface(&comm);
		if (SGR_SDK_SetCommInterface(&comm) != SGR_SDK_OK) {
			printk("[FATAL] SGR_SDK_SetCommInterface failed\n");
			return 0;
		}
	}
	SGR_SDK_SetEventCallback(on_auth_event, NULL);

	printk("[INIT] Initializing device SDK (reads TID over SPI)...\n");
	if (SGR_SDK_Initialize() != SGR_SDK_OK) {
		printk("[FATAL] SGR_SDK_Initialize failed - is the SGT1001 connected?\n");
		return 0;
	}
	g_sgr_chip_variant = SGR_CHIP_SGB;
	printk("[INIT] SDK ready (chip variant: SGB)\n");

	/* Register BEFORE the TID goes out: the TID in our HELLO is what makes the
	 * gateway subscribe to cmd/run_auth, so a trigger can arrive right after. */
	app_ble_set_trigger_cb(on_ble_trigger);

	run_bist();

#if defined(CONFIG_SANDGRAIN_INTERACTIVE_MENU)
	printk("\n[MENU] Interactive menu enabled - open the COM port with a terminal\n");
	printk("       that can send keystrokes. Connect the relay/gateway before\n");
	printk("       choosing Mutual Authentication. TrustBridge can also trigger\n");
	printk("       an authentication itself, without any keystroke.\n");
	menu_loop();   /* never returns */
#else
	printk("[WAIT] Waiting for the relay (BLE central) to connect & subscribe...\n");
	while (!app_ble_ready()) {
		k_msleep(100);
	}

	while (1) {
		run_auth_guarded(1, false);

		/* If the link dropped mid-flow, wait for it to come back. */
		if (!app_ble_ready()) {
			printk("[WAIT] Link down - waiting to reconnect...\n");
			while (!app_ble_ready()) {
				k_msleep(100);
			}
		}
		k_sleep(K_SECONDS(REAUTH_PERIOD_S));
	}
#endif

	return 0;
}
