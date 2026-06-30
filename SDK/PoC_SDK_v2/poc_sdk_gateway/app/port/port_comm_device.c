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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

    int sent = send(ctx->conn_fd, (const char *)buffer_tx, buffer_tx_size, 0);

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

    int rec = recv(ctx->conn_fd, (char *)buffer_rx, buffer_rx_size, 0);

    if (rec == 0)
    {
        LOG_DEV("Device disconnected — waiting for new connection...");
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
    if (ctx == NULL)
        return;

    if (ctx->conn_fd != SOCK_INVALID && ctx->conn_fd != ctx->listen_fd)
    {
        SOCK_CLOSE(ctx->conn_fd);
        ctx->conn_fd = SOCK_INVALID;
    }

    /* listen_fd stays open — server keeps listening for next device */
}