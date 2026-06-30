#include "port_comm_input.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #pragma comment(lib, "ws2_32.lib")
#else
    #include <unistd.h>
    #include <arpa/inet.h>
    #include <sys/socket.h>
    #include <sys/select.h>
#endif

#define PORT      8080
#define SERVER_IP "127.0.0.1"

#ifdef _WIN32
    static SOCKET listen_fd = INVALID_SOCKET;
    static SOCKET conn_fd   = INVALID_SOCKET;
    #define SOCK_INVALID   INVALID_SOCKET
    #define SOCK_CLOSE(s)  closesocket(s)
#else
    static int listen_fd = -1;
    static int conn_fd   = -1;
    #define SOCK_INVALID   -1
    #define SOCK_CLOSE(s)  close(s)
#endif

static bool is_server = false;

bool port_comm_input_init(const char *device_id)
{
    if (device_id == NULL)
        return false;

    #ifdef _WIN32
        WSADATA wsa;
        WSAStartup(MAKEWORD(2,2), &wsa);
    #endif

    struct sockaddr_in addr;
    int opt = 1;

    listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd == SOCK_INVALID)
        return false;

    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    addr.sin_family = AF_INET;
    addr.sin_port   = htons(PORT);

    if (strcmp(device_id, "server") == 0)
    {
        is_server            = true;
        addr.sin_addr.s_addr = INADDR_ANY;

        if (bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
            return false;

        if (listen(listen_fd, 1) < 0)
            return false;

        printf("[INPUT] Esperando cliente...\n");

        socklen_t addrlen = sizeof(addr);
        conn_fd = accept(listen_fd, (struct sockaddr *)&addr, &addrlen);
        if (conn_fd == SOCK_INVALID)
            return false;

        printf("[INPUT] Cliente conectado\n");
    }
    else
    {
        is_server = false;
        inet_pton(AF_INET, SERVER_IP, &addr.sin_addr);

        if (connect(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
            return false;

        conn_fd = listen_fd;
        printf("[INPUT] Conectado al servidor\n");
    }

    return true;
}

bool port_comm_input_send(const uint8_t *buffer_tx, uint16_t buffer_tx_size)
{
    if (conn_fd == SOCK_INVALID || buffer_tx == NULL)
        return false;

    int sent = send(conn_fd, (const char *)buffer_tx, buffer_tx_size, 0);

    return (sent == buffer_tx_size);
}

bool port_comm_input_receive(uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    if (conn_fd == SOCK_INVALID || !buffer_rx)
        return false;

    int rec = recv(conn_fd, (char *)buffer_rx, buffer_rx_size, 0);

    if (rec == 0)
    {
        printf("[INPUT] Cliente desconectado — esperando nuevo cliente...\n");
        SOCK_CLOSE(conn_fd);
        conn_fd = SOCK_INVALID;

        struct sockaddr_in addr;
        socklen_t len = sizeof(addr);
        conn_fd = accept(listen_fd, (struct sockaddr *)&addr, &len);
        if (conn_fd == SOCK_INVALID)
            return false;

        printf("[INPUT] Nuevo cliente conectado\n");

        rec = recv(conn_fd, (char *)buffer_rx, buffer_rx_size, 0);
        if (rec <= 0)
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

bool port_comm_input_is_ready(void)
{
    if (conn_fd == SOCK_INVALID)
        return false;

    fd_set readfds;
    struct timeval timeout = {0, 0};

    FD_ZERO(&readfds);
    FD_SET(conn_fd, &readfds);

    #ifdef _WIN32
        int ret = select(0, &readfds, NULL, NULL, &timeout);
    #else
        int ret = select(conn_fd + 1, &readfds, NULL, NULL, &timeout);
    #endif

    return (ret > 0 && FD_ISSET(conn_fd, &readfds));
}

void port_comm_input_close(void)
{
    if (conn_fd != SOCK_INVALID)
        SOCK_CLOSE(conn_fd);

    if (is_server && listen_fd != SOCK_INVALID)
        SOCK_CLOSE(listen_fd);

    conn_fd   = SOCK_INVALID;
    listen_fd = SOCK_INVALID;

    #ifdef _WIN32
        WSACleanup();
    #endif
}