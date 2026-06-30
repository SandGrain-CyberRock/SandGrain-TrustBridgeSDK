/* =============================================================================
 * port_comm_device.c
 *
 * Device communication port — socket implementation.
 * All state lives in port_comm_device_t — no static variables.
 * ============================================================================= */

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

/* Env-overridable (the launchers export GW_HOST/GW_PORT from .env) — the
 * gateway socket the device dials; defaults to localhost:8080. */
#define PORT      (getenv("GW_PORT") ? atoi(getenv("GW_PORT")) : 8080)
#define SERVER_IP (getenv("GW_HOST") ? getenv("GW_HOST") : "127.0.0.1")

/* ── Debug ───────────────────────────────────────────────── */
#if defined(PORT_COMM_DEVICE_DEBUG) && PORT_COMM_DEVICE_DEBUG == 1
    #define LOG_DEV(fmt, ...)  printf("[COMM_DEVICE] " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG_DEV(fmt, ...)  do {} while(0)
#endif

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

    struct sockaddr_in addr;
    int opt = 1;

    ctx->listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (ctx->listen_fd == SOCK_INVALID)
        return false;

    setsockopt(ctx->listen_fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    addr.sin_family = AF_INET;
    addr.sin_port   = htons(PORT);

    if (strcmp(device_id, "server") == 0)
    {
        ctx->is_server       = true;
        addr.sin_addr.s_addr = INADDR_ANY;

        if (bind(ctx->listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
        {
            SOCK_CLOSE(ctx->listen_fd);
            ctx->listen_fd = SOCK_INVALID;
            return false;
        }

        if (listen(ctx->listen_fd, 5) < 0)
        {
            SOCK_CLOSE(ctx->listen_fd);
            ctx->listen_fd = SOCK_INVALID;
            return false;
        }

        LOG_DEV("Listening for device connections...");

        socklen_t addrlen = sizeof(addr);
        ctx->conn_fd = accept(ctx->listen_fd, (struct sockaddr *)&addr, &addrlen);
        if (ctx->conn_fd == SOCK_INVALID)
        {
            SOCK_CLOSE(ctx->listen_fd);
            ctx->listen_fd = SOCK_INVALID;
            return false;
        }

        LOG_DEV("Device connected");
    }
    else
    {
        ctx->is_server = false;
        inet_pton(AF_INET, SERVER_IP, &addr.sin_addr);

        if (connect(ctx->listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
        {
            SOCK_CLOSE(ctx->listen_fd);
            ctx->listen_fd = SOCK_INVALID;
            return false;
        }

        ctx->conn_fd = ctx->listen_fd;
        LOG_DEV("Connected to GW");
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
bool port_comm_device_receive(port_comm_device_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    if (ctx == NULL || ctx->conn_fd == SOCK_INVALID || buffer_rx == NULL)
        return false;

    int rec = recv(ctx->conn_fd, (char *)buffer_rx, buffer_rx_size, 0);

    if (rec == 0)
    {
        LOG_DEV("Device disconnected — waiting for new connection...");
        SOCK_CLOSE(ctx->conn_fd);
        ctx->conn_fd = SOCK_INVALID;

        if (ctx->is_server)
        {
            struct sockaddr_in addr;
            socklen_t len = sizeof(addr);
            ctx->conn_fd = accept(ctx->listen_fd, (struct sockaddr *)&addr, &len);
            if (ctx->conn_fd == SOCK_INVALID)
                return false;

            LOG_DEV("New device connected");

            rec = recv(ctx->conn_fd, (char *)buffer_rx, buffer_rx_size, 0);
            if (rec <= 0)
            {
                if (buffer_rx_received_size)
                    *buffer_rx_received_size = 0;
                return true;
            }
        }
        else
        {
            if (buffer_rx_received_size)
                *buffer_rx_received_size = 0;
            return true;
        }
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
void port_comm_device_close(port_comm_device_t *ctx)
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
}