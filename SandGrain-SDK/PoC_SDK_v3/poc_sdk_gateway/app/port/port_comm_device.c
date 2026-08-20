/* =============================================================================
 * port_comm_device.c
 *
 * Device communication port — socket implementation.
 * All state lives in port_comm_device_t — no static variables.
 *
 * Channel naming convention:
 *   GW mode  — "channel_0", "channel_1", ... → ports 8080, 8081, ...
 *   DEV mode — "channel_0", "channel_1", ... → connects to 8080, 8081, ...
 *
 * Legacy: "server" is treated as "channel_0" for backwards compatibility.
 * ============================================================================= */
//#include "sdk_sgr_config.h"
#include "config_poc.h"
#include "port_comm_device.h"
#include "gw_presence.h"   /* device presence + BE trigger proxy (device MQTT-free) */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <fcntl.h>
#include <pthread.h>

#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #pragma comment(lib, "ws2_32.lib")
    #define SOCK_CLOSE(s)  closesocket(s)
    #define SOCK_INVALID   INVALID_SOCKET
#else
    #include <unistd.h>
    #include <arpa/inet.h>
    #include <sys/socket.h>
    #include <sys/select.h>
    #define SOCK_CLOSE(s)  close(s)
    #define SOCK_INVALID   (-1)
#endif

#define SERVER_IP  "127.0.0.1"

/* ── Debug ───────────────────────────────────────────────── */
#if defined(PORT_COMM_DEVICE_DEBUG) && PORT_COMM_DEVICE_DEBUG == 1
    #define LOG_DEV(fmt, ...)  printf("[COMM_DEVICE] " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG_DEV(fmt, ...)  do {} while(0)
#endif

/* ── Channel registry + send lock ────────────────────────────────────────────
 * Devices are now MQTT-free: they send "HELLO <tid> [TRIGGER]" over the
 * persistent link, and the gateway proxies their presence and relays
 * cmd/run_auth back as "RUN_AUTH <mode>" (see gw_presence.c). The registry lets
 * the trigger forwarder find a device's socket by its channel id; the lock
 * serializes the forwarder's write (on gw_presence's mqtt thread) against the
 * FSM's writes (on the main loop). Reads (recv) are the opposite direction and
 * need no lock. */
#define GW_CH_MAX (MAX_DEVICES + 4)
static port_comm_device_t *g_channels[GW_CH_MAX];
static int                 g_channel_count = 0;
static pthread_mutex_t     g_send_lock = PTHREAD_MUTEX_INITIALIZER;

/* Parse a "HELLO <tid>[ TRIGGER]" control line from a device: learn its TID,
 * bind it to this channel, and bring it ONLINE via the presence proxy (only in
 * TrustBridge mode — BE_URL set; standalone has no BE to answer). */
static void prv_handle_hello(port_comm_device_t *ctx, const uint8_t *data, int len)
{
    char buf[128];
    int  n = (len < (int)sizeof(buf) - 1) ? len : (int)sizeof(buf) - 1;
    memcpy(buf, data, (size_t)n);
    buf[n] = '\0';
    char *nl = strchr(buf, '\n');
    if (nl) *nl = '\0';

    const char *p = buf + 6;                 /* skip "HELLO " */
    while (*p == ' ') p++;

    char tid[65] = {0};
    int  i = 0;
    while (i < 64 && isxdigit((unsigned char)p[i])) { tid[i] = p[i]; i++; }
    tid[i] = '\0';
    if (i != 64) {
        LOG_DEV("malformed HELLO on %s", ctx->id);
        return;
    }
    int wants_trigger = (strstr(p + i, "TRIGGER") != NULL);

    snprintf(ctx->tid, sizeof(ctx->tid), "%s", tid);
    printf("[HELLO] %.8s... on %s%s\n", tid, ctx->id, wants_trigger ? " (TRIGGER)" : "");

    if (getenv("BE_URL"))
        gw_presence_online(ctx->id, tid, wants_trigger ? true : false);
}

/* -----------------------------------------------------------------------------
 * prv_parse_channel
 * Parses channel index from device_id string.
 *   "channel_0" → 0
 *   "channel_1" → 1
 *   "server"    → 0  (legacy)
 * ----------------------------------------------------------------------------- */
static int prv_parse_channel(const char *device_id)
{
    if (device_id == NULL)
        return 0;

    if (strcmp(device_id, "server") == 0)
        return 0;

    if (strncmp(device_id, "channel_", 8) == 0)
        return atoi(device_id + 8);

    return 0;
}

/* =============================================================================
 * port_comm_device_init
 * ============================================================================= */
/* =============================================================================
 * port_comm_device_init
 * ============================================================================= */
bool port_comm_device_init(port_comm_device_t *ctx, const char *device_id)
{
    if (ctx == NULL || device_id == NULL)
        return false;

    ctx->listen_fd = SOCK_INVALID;
    ctx->conn_fd   = SOCK_INVALID;
    ctx->is_server = false;

    /* Record the channel id and register this context so the trigger forwarder
     * can find its socket by id later. */
    snprintf(ctx->id, sizeof(ctx->id), "%s", device_id);
    ctx->tid[0] = '\0';
    pthread_mutex_lock(&g_send_lock);
    {
        int already = 0;
        for (int k = 0; k < g_channel_count; k++)
            if (g_channels[k] == ctx) { already = 1; break; }
        if (!already && g_channel_count < GW_CH_MAX)
            g_channels[g_channel_count++] = ctx;
    }
    pthread_mutex_unlock(&g_send_lock);

#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
#endif

    int channel = prv_parse_channel(device_id);
    int port    = PORT_BASE + channel;

    struct sockaddr_in addr;
    int opt = 1;

    ctx->listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (ctx->listen_fd == SOCK_INVALID)
        return false;

    setsockopt(ctx->listen_fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    addr.sin_family = AF_INET;
    addr.sin_port   = htons((uint16_t)port);

    if (strncmp(device_id, "channel_", 8) == 0 || strcmp(device_id, "server") == 0)
    {
        /* ── GW mode — bind + listen only, accept deferred to receive ── */
        ctx->is_server       = true;
        addr.sin_addr.s_addr = INADDR_ANY;

        if (bind(ctx->listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
        {
            LOG_DEV("bind failed on port %d", port);
            SOCK_CLOSE(ctx->listen_fd);
            ctx->listen_fd = SOCK_INVALID;
            return false;
        }

        if (listen(ctx->listen_fd, 5) < 0)
        {
            LOG_DEV("listen failed on port %d", port);
            SOCK_CLOSE(ctx->listen_fd);
            ctx->listen_fd = SOCK_INVALID;
            return false;
        }

        /* make listen_fd non-blocking so accept never blocks */
#ifdef _WIN32
        u_long mode = 1;
        ioctlsocket(ctx->listen_fd, FIONBIO, &mode);
#else
        fcntl(ctx->listen_fd, F_SETFL, O_NONBLOCK);
#endif

        LOG_DEV("Listening on port %d (channel_%d) — waiting for device...", port, channel);
        /* conn_fd stays SOCK_INVALID — accept happens in receive */
    }
    else
    {
        /* ── DEVICE mode — connect to GW ── */
        ctx->is_server = false;
        inet_pton(AF_INET, SERVER_IP, &addr.sin_addr);

        if (connect(ctx->listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
        {
            LOG_DEV("connect failed to port %d", port);
            SOCK_CLOSE(ctx->listen_fd);
            ctx->listen_fd = SOCK_INVALID;
            return false;
        }

        ctx->conn_fd = ctx->listen_fd;
        LOG_DEV("Connected to GW on channel_%d (port %d)", channel, port);
    }

    return true;
}


/* =============================================================================
 * port_comm_device_send
 * ============================================================================= */
bool port_comm_device_send(port_comm_device_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size)
{
    if (ctx == NULL || ctx->conn_fd == SOCK_INVALID || buffer_tx == NULL)
        return false;

    /* Serialize with the trigger forwarder (RUN_AUTH) writing from the presence
     * thread on the same socket. */
    pthread_mutex_lock(&g_send_lock);
    int sent = send(ctx->conn_fd, (const char *)buffer_tx, buffer_tx_size, 0);
    pthread_mutex_unlock(&g_send_lock);

#ifdef _WIN32
    Sleep(100);
#endif

    return (sent == (int)buffer_tx_size);
}

/* =============================================================================
 * port_comm_device_receive
 * ============================================================================= */
/* =============================================================================
 * port_comm_device_receive
 * ============================================================================= */
bool port_comm_device_receive(port_comm_device_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    if (ctx == NULL || buffer_rx == NULL)
        return false;

    /* ── GW mode — if no active connection, try non-blocking accept ── */
    if (ctx->conn_fd == SOCK_INVALID && ctx->is_server)
    {
        struct sockaddr_in addr;
        socklen_t len = sizeof(addr);
        ctx->conn_fd = accept(ctx->listen_fd, (struct sockaddr *)&addr, &len);
        if (ctx->conn_fd == SOCK_INVALID)
        {
            /* no device connected yet — return NO_DATA */
            if (buffer_rx_received_size)
                *buffer_rx_received_size = 0;
            return true;
        }
        LOG_DEV("Device connected");
    }

    if (ctx->conn_fd == SOCK_INVALID)
        return false;

    /* Non-blocking check — return NO_DATA immediately if nothing available */
    if (!port_comm_device_is_ready(ctx))
    {
        if (buffer_rx_received_size)
            *buffer_rx_received_size = 0;
        return true;
    }

    int rec = recv(ctx->conn_fd, (char *)buffer_rx, buffer_rx_size, 0);

    if (rec == 0)
    {
        LOG_DEV("Device disconnected — waiting for new connection...");
        /* Publish the device offline (gateway-derived presence) before we drop
         * the socket, so TrustBridge sees it go away. */
        if (ctx->tid[0] && getenv("BE_URL"))
            gw_presence_lost(ctx->id);
        ctx->tid[0] = '\0';

        SOCK_CLOSE(ctx->conn_fd);
        ctx->conn_fd = SOCK_INVALID;

        /* return NO_DATA — next receive will try accept again */
        if (buffer_rx_received_size)
            *buffer_rx_received_size = 0;
        return true;
    }
    else if (rec < 0)
    {
        if (buffer_rx_received_size)
            *buffer_rx_received_size = 0;
        return true;
    }

    /* Intercept device control lines (HELLO) — they carry presence/trigger info,
     * not auth frames, so consume them and surface NO_DATA to the FSM. Auth
     * frames are JSON ("{...}") and fall through untouched. */
    if (rec > 6 && memcmp(buffer_rx, "HELLO ", 6) == 0)
    {
        prv_handle_hello(ctx, buffer_rx, rec);
        if (buffer_rx_received_size)
            *buffer_rx_received_size = 0;
        return true;
    }

    if (buffer_rx_received_size)
        *buffer_rx_received_size = (uint16_t)rec;

    return true;
}

/* =============================================================================
 * port_comm_device_is_ready
 * ============================================================================= */
bool port_comm_device_is_ready(port_comm_device_t *ctx)
{
    if (ctx == NULL || ctx->conn_fd == SOCK_INVALID)
        return false;

    fd_set         readfds;
    struct timeval timeout = {0, 0};

    FD_ZERO(&readfds);
    FD_SET(ctx->conn_fd, &readfds);

#ifdef _WIN32
    int ret = select(0, &readfds, NULL, NULL, &timeout);
#else
    int ret = select(ctx->conn_fd + 1, &readfds, NULL, NULL, &timeout);
#endif

    return (ret > 0 && FD_ISSET(ctx->conn_fd, &readfds));
}

/* =============================================================================
 * port_comm_device_close
 * ============================================================================= */
/*void port_comm_device_close(port_comm_device_t *ctx)
{
    if (ctx == NULL)
        return;

    if (ctx->conn_fd != SOCK_INVALID && ctx->conn_fd != ctx->listen_fd)
    {
        SOCK_CLOSE(ctx->conn_fd);
        ctx->conn_fd = SOCK_INVALID;
    }

    if (ctx->is_server && ctx->listen_fd != SOCK_INVALID)
    {
        SOCK_CLOSE(ctx->listen_fd);
        ctx->listen_fd = SOCK_INVALID;
    }

#ifdef _WIN32
    WSACleanup();
#endif
}*/

void port_comm_device_close(port_comm_device_t *ctx)
{
    (void)ctx;
    /* Persistent device link: keep conn_fd open across auth flows AND across the
     * phase-1 -> phase-2 boundary. The device no longer reconnects per phase (it
     * holds the link open too), so closing here would break Phase 2 — the device
     * would send its host-auth frame down a half-closed socket (SIGPIPE) and the
     * gateway would never see it. The connection is dropped only on a real device
     * disconnect (recv()==0 in port_comm_device_receive, which also publishes the
     * device offline). listen_fd likewise stays open for the next device. */
}

/* =============================================================================
 * port_comm_device_forward_run_auth  — relay a run_auth trigger to a device
 *
 * Registered with gw_presence (gw_presence_set_trigger_handler). Called on the
 * presence proxy's mqtt thread when TrustBridge publishes cmd/run_auth for a
 * proxied device; writes "RUN_AUTH <mode>" down that device's channel. The
 * send lock serializes this against the FSM's writes on the main loop.
 * ============================================================================= */
void port_comm_device_forward_run_auth(const char *id, int mode)
{
    if (id == NULL)
        return;

    char line[32];
    int  n = snprintf(line, sizeof(line), "RUN_AUTH %d\n", mode);

    pthread_mutex_lock(&g_send_lock);
    port_comm_device_t *ch = NULL;
    for (int i = 0; i < g_channel_count; i++)
        if (g_channels[i] && strcmp(g_channels[i]->id, id) == 0) { ch = g_channels[i]; break; }

    if (ch && ch->conn_fd != SOCK_INVALID)
    {
        send(ch->conn_fd, line, n, 0);
        printf("[TRIGGER] RUN_AUTH %d -> %s (%.8s...)\n", mode, id, ch->tid);
    }
    else
    {
        printf("[TRIGGER] RUN_AUTH %d dropped — %s has no live connection\n", mode, id);
    }
    pthread_mutex_unlock(&g_send_lock);
}

void port_comm_device_shutdown(void)
{
    /* Nothing to release on the TCP port: the sockets are process-owned, so the
     * kernel closes them on exit and the peer sees the link drop immediately.
     * The BLE port needs a real teardown (BlueZ owns the connection there and
     * outlives us), hence the shared entry point. */
}
