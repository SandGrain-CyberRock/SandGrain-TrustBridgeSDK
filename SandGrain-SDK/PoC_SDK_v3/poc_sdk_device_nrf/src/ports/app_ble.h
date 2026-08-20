/* =============================================================================
 * app_ble.h - BLE lifecycle hooks exposed by port_comm.c to main.c
 * ============================================================================= */
#ifndef APP_BLE_H
#define APP_BLE_H

#include <stdbool.h>

/* Bring up Bluetooth: enable the stack, register the Nordic UART Service and
 * start connectable advertising as CONFIG_BT_DEVICE_NAME. Returns 0 on success. */
int app_ble_init(void);

/* True once a central (the laptop relay) is connected AND has enabled
 * notifications on the NUS TX characteristic - i.e. the byte pipe is ready. */
bool app_ble_ready(void);

/* Register this board's 64-hex-char TID (read from the SGT1001 at init).
 * Enables the presence announcement: "HELLO <tid> TRIGGER" is sent to the
 * gateway on every link-up so it can proxy a retained MQTT "online" for this
 * board and relay its cmd/run_auth triggers (see app_ble_set_trigger_cb). */
void app_ble_set_tid(const char *tid_hex);

/* Called when the gateway relays a TrustBridge auth trigger ("RUN_AUTH <mode>"
 * over NUS). Runs on the Bluetooth RX thread, so the handler must not block or
 * authenticate inline - hand the work to a thread of your own. */
typedef void (*app_ble_trigger_cb_t)(int mode);

/* Register the handler above. Without one, relayed triggers are logged and
 * dropped. Register it before BIST hands over the TID: the TID is what makes
 * the gateway subscribe, so a trigger can arrive moments later. */
void app_ble_set_trigger_cb(app_ble_trigger_cb_t cb);

#endif /* APP_BLE_H */
