#ifndef GW_WHITELIST_H
#define GW_WHITELIST_H

/* =============================================================================
 * gw_whitelist.h
 *
 * MQTT-driven gateway whitelist + presence (TrustBridge mode).
 *
 * Replaces the old 3-second HTTP poll of {BE_URL}/devices/whitelist with a push
 * model over the same MQTT broker the gateway already uses for gw_log:
 *
 *   publish   sandgrain/v1/gw/gw_status   {"status":"online"}   (on every connect)
 *   subscribe sandgrain/v1/gw/whitelist   <newline-separated 64-hex TIDs>
 *
 * The TrustBridge BE republishes the full enrolled-TID list whenever it sees the
 * gateway announce "online", and pushes newly-enrolled TIDs as they register.
 * The whitelist reply is published non-retained, so this module subscribes
 * BEFORE announcing online.
 *
 * Received TIDs are merged into the gateway whitelist file (the same file
 * auth_db_load_whitelist() reads). The mqtt thread only touches the file; the
 * main loop reloads it when gw_whitelist_take_dirty() reports a change, so all
 * auth_db mutation stays single-threaded on the main loop.
 * ============================================================================= */

/* Open the presence/whitelist MQTT connection and announce the gateway online.
 * Call once at startup in TrustBridge mode (BE_URL set). */
void gw_whitelist_init(void);

/* (Re)publish the gateway "online" status so the BE resends the whitelist.
 * Safe no-op if the connection isn't up (e.g. standalone). Used to close the
 * enroll->first-auth race from the auth_db cache-miss hook. */
void gw_whitelist_announce_online(void);

/* Returns 1 (and clears the flag) if new whitelist data has been written to the
 * file since the last call, so the main loop knows to reload it; else 0. */
int gw_whitelist_take_dirty(void);

/* Close the presence/whitelist MQTT connection at shutdown. */
void gw_whitelist_close(void);

#endif /* GW_WHITELIST_H */
