#include "port_comm.h"
#include "sdk_sgr_config.h"
#include "config_poc.h"
#include "fi_device.h"
#include <string.h>
#include <stdio.h>

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

/* ===================== DEBUG LOGGING ===================== */

#if PORT_COMM_DEBUG
    #define LOG_DEBUG(fmt, ...)   printf("[PORT][SOCKET] " fmt "\n", ##__VA_ARGS__)
    #define LOG_FAULT(fmt, ...)   printf("[FAULT]        " fmt "\n", ##__VA_ARGS__)
#else
    #define LOG_DEBUG(fmt, ...)   do {} while(0)
    #define LOG_FAULT(fmt, ...)   do {} while(0)
#endif

/* ===================== CONFIGURATION ===================== */


/* ===================== INTERNAL VARIABLES ===================== */

#ifdef _WIN32
    static SOCKET listen_fd = INVALID_SOCKET;
    static SOCKET conn_fd   = INVALID_SOCKET;
    #define SOCK_INVALID     INVALID_SOCKET
    #define SOCK_CLOSE(s)    closesocket(s)
    #define SOCK_ERROR       SOCKET_ERROR
#else
    static int listen_fd = -1;
    static int conn_fd   = -1;
    #define SOCK_INVALID     -1
    #define SOCK_CLOSE(s)    close(s)
    #define SOCK_ERROR       -1
#endif

static bool is_server = false;

/* Persistent-link state (device MQTT-free model). When set, the socket dialed to
 * the gateway is kept open across auths: port_comm_init() reuses it and
 * port_comm_close() leaves it up. g_ctrl accumulates inbound control lines
 * ("RUN_AUTH <mode>") that arrive while the device is idle. */
static bool g_persistent = false;
static char g_ctrl[256];
static int  g_ctrl_len = 0;

volatile uint8_t g_fault_injection_enable_comm_tx = 0;
volatile uint8_t g_fault_injection_enable_comm_rx = 0;

static volatile uint32_t rx_drop_count     = 0;
static volatile uint32_t rx_received_count = 0;

extern volatile int attempt;
extern volatile int enable_fi_comm_get_cw;

/* ===================== PORT_COMM API ===================== */
bool port_comm_init   (port_comm_ctx_t *ctx, const char *device_id)
{
    if (!device_id)
        return false;

    /* Reuse the persistent link when it's already up (MQTT-free model): the SDK
     * calls this per auth (SERVER_Open), but the socket stays open across auths. */
    if (conn_fd != SOCK_INVALID)
        return true;

    #ifdef _WIN32
        WSADATA wsa;
        WSAStartup(MAKEWORD(2,2), &wsa);
    #endif

    LOG_DEBUG("Initializing communication port .....");

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

        LOG_DEBUG("Waiting for client connection...");

        socklen_t len = sizeof(addr);
        conn_fd = accept(listen_fd, (struct sockaddr *)&addr, &len);
        if (conn_fd == SOCK_INVALID)
            return false;

        LOG_DEBUG("Client connected");
    }
    else
    {
        is_server = false;
        inet_pton(AF_INET, SERVER_IP, &addr.sin_addr);

        if (connect(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
            return false;

        conn_fd = listen_fd;
        LOG_DEBUG("Connected to server | ip=%s | port=%d", SERVER_IP, PORT);
    }

    return true;
}

bool port_comm_send   (port_comm_ctx_t *ctx, const uint8_t *buffer_tx, uint16_t buffer_tx_size)
{
    if (conn_fd == SOCK_INVALID || !buffer_tx || buffer_tx_size == 0)
        return false;

    uint8_t tmp_buffer[512];

    if (buffer_tx_size >= sizeof(tmp_buffer))
        return false;

    memcpy(tmp_buffer, buffer_tx, buffer_tx_size);
    tmp_buffer[buffer_tx_size] = '\0';

    if ((g_fault_injection_enable_comm_tx == 1) && (attempt <= 3) && (enable_fi_comm_get_cw == 1))
    {
        if (buffer_tx_size > 50)
        {
            tmp_buffer[50] = 'F';
            LOG_FAULT("Injection in byte 50 Tx .... json tx = %s", tmp_buffer);
        }
    }
    #if SDK_MODE == DEVICE_MODE
        if (fi_enable_cw_echo == 1)
        {
            char *ptr = strstr((char *)tmp_buffer, "\"CW\":\"");
            if (ptr != NULL)
            {
                ptr += strlen("\"CW\":\"");
                //fi_apply_bitflip_hex(ptr, 64, 3);   /* bit 3 */
                fi_apply_bitflip_hex(ptr, 64, FI_CW_ECHO_BIT_POS);
                LOG_FAULT("CW echo corrupted — 1 bit flipped");
            }
        }
        if (fi_enable_rw == 1)
        {
            char *ptr = strstr((char *)tmp_buffer, "\"RW\":\"");
            if (ptr != NULL)
            {
                ptr += strlen("\"RW\":\"");
                fi_apply_bitflip_hex(ptr, 32, FI_RW_BIT_POS);
                LOG_FAULT("RW corrupted — 1 bit flipped");
            }
        }

        if (fi_enable_option3 == 1)
        {
            char *ptr = strstr((char *)tmp_buffer, "\"CW\":\"");
            if (ptr != NULL)
            {
                ptr += strlen("\"CW\":\"");
                fi_apply_bitflip_hex(ptr, 64, FI_CW_ECHO_BIT_POS_0_OPT3);
                fi_apply_bitflip_hex(ptr, 64, FI_CW_ECHO_BIT_POS_1_OPT3);
                LOG_FAULT("CW echo corrupted — 2 bits flipped (option 3)");
            }
        }
    #endif

    LOG_DEBUG("TX → Gateway | size=%u | data=%s", buffer_tx_size, tmp_buffer);

    int sent = send(conn_fd, (const char *)tmp_buffer, buffer_tx_size, 0);

    if (sent != buffer_tx_size)
    {
        LOG_DEBUG("Send failed | expected=%u sent=%d", buffer_tx_size, sent);
        return false;
    }

    LOG_DEBUG("Send OK");
    return true;
}

bool port_comm_receive(port_comm_ctx_t *ctx, uint8_t *buffer_rx, uint16_t buffer_rx_size, uint16_t *buffer_rx_received_size)
{
    if (conn_fd == SOCK_INVALID || !buffer_rx || !buffer_rx_received_size)
        return false;

    *buffer_rx_received_size = 0;

    int received = recv(conn_fd, (char *)buffer_rx, buffer_rx_size, 0);

    if (received <= 0)
    {
        LOG_DEBUG("Receive failed or connection closed");
        return false;
    }

    *buffer_rx_received_size = (uint16_t)received;
    rx_received_count++;

    if (g_fault_injection_enable_comm_rx == 1)
    {
        if (*buffer_rx_received_size > 70)
        {
            buffer_rx[70] ^= 'F';
            LOG_FAULT("[RX] Payload corrupted at byte 70");
        }
    }

    #if SDK_MODE == DEVICE_MODE
        if (fi_enable_cw == 1)
        {
            char *ptr = strstr((char *)buffer_rx, "\"CW\":\"");
            if (ptr != NULL)
            {
                ptr += strlen("\"CW\":\"");
                fi_apply_bitflip_hex(ptr, 64, FI_CW_BIT_POS_0);
                fi_apply_bitflip_hex(ptr, 64, FI_CW_BIT_POS_1);
                LOG_FAULT("CW corrupted — 2 bits flipped");
            }
        }

        if (fi_enable_option3 == 1)
        {
            char *ptr = strstr((char *)buffer_rx, "\"CW\":\"");
            if (ptr != NULL)
            {
                ptr += strlen("\"CW\":\"");
                fi_apply_bitflip_hex(ptr, 64, FI_CW_BIT_POS_OPT3);
                LOG_FAULT("CW corrupted — 3 bits flipped (option 3)");
            }
        }
    #endif

    LOG_DEBUG("RX ← Gateway | size=%u | data=%.*s",
              *buffer_rx_received_size,
              *buffer_rx_received_size,
              buffer_rx);

    return true;
}

/* =============================================================================
 * port_comm_connect_persistent  — dial the gateway once, keep the link, HELLO
 * ============================================================================= */
bool port_comm_connect_persistent(const char *tid_hex, bool wants_trigger)
{
    if (!tid_hex)
        return false;

    if (conn_fd == SOCK_INVALID)
    {
        #ifdef _WIN32
            WSADATA wsa;
            WSAStartup(MAKEWORD(2, 2), &wsa);
        #endif

        struct sockaddr_in addr;
        listen_fd = socket(AF_INET, SOCK_STREAM, 0);
        if (listen_fd == SOCK_INVALID)
            return false;

        addr.sin_family = AF_INET;
        addr.sin_port   = htons(PORT);
        inet_pton(AF_INET, SERVER_IP, &addr.sin_addr);

        if (connect(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
        {
            SOCK_CLOSE(listen_fd);
            listen_fd = SOCK_INVALID;
            return false;
        }

        conn_fd   = listen_fd;
        is_server = false;
        LOG_DEBUG("Persistent link to gateway | ip=%s | port=%d", SERVER_IP, PORT);
    }

    g_persistent = true;
    g_ctrl_len   = 0;

    /* Announce presence + trigger capability: "HELLO <tid>[ TRIGGER]\n".
     * The gateway proxies our presence and (if TRIGGER) relays cmd/run_auth. */
    char hello[128];
    int n = snprintf(hello, sizeof(hello), "HELLO %s%s\n",
                     tid_hex, wants_trigger ? " TRIGGER" : "");
    if (n > 0)
        send(conn_fd, hello, n, 0);

    return true;
}

/* =============================================================================
 * port_comm_is_linked
 * ============================================================================= */
bool port_comm_is_linked(void)
{
    return (conn_fd != SOCK_INVALID);
}

/* =============================================================================
 * port_comm_poll_trigger  — non-blocking check for a "RUN_AUTH <mode>" line
 * ============================================================================= */
int port_comm_poll_trigger(int *mode)
{
    if (conn_fd == SOCK_INVALID || !mode)
        return 0;

    /* Non-blocking readiness — return immediately if nothing is waiting. */
    fd_set         readfds;
    struct timeval tv = {0, 0};
    FD_ZERO(&readfds);
    FD_SET(conn_fd, &readfds);
#ifdef _WIN32
    int sel = select(0, &readfds, NULL, NULL, &tv);
#else
    int sel = select(conn_fd + 1, &readfds, NULL, NULL, &tv);
#endif
    if (sel <= 0)
        return 0;

    char tmp[128];
    int  r = recv(conn_fd, (char *)tmp, sizeof(tmp) - 1, 0);
    if (r == 0)
    {
        /* Gateway dropped the link — clear it so the caller reconnects. */
        LOG_DEBUG("Persistent link closed by gateway");
        SOCK_CLOSE(conn_fd);
        conn_fd    = SOCK_INVALID;
        g_ctrl_len = 0;
        return 0;
    }
    if (r < 0)
        return 0;

    /* Accumulate into the control-line buffer, then look for a full line. */
    for (int i = 0; i < r && g_ctrl_len < (int)sizeof(g_ctrl) - 1; i++)
        g_ctrl[g_ctrl_len++] = tmp[i];
    g_ctrl[g_ctrl_len] = '\0';

    char *nl = strchr(g_ctrl, '\n');
    if (!nl)
        return 0;                 /* partial line — wait for the rest */
    *nl = '\0';

    int found = 0;
    if (strncmp(g_ctrl, "RUN_AUTH", 8) == 0)
    {
        int m = 1;
        const char *p = g_ctrl + 8;
        while (*p == ' ') p++;
        if (*p >= '1' && *p <= '3') m = *p - '0';
        *mode = m;
        found = 1;
    }

    /* Consume the line (keep any bytes after the newline for the next call). */
    int consumed = (int)(nl - g_ctrl) + 1;
    memmove(g_ctrl, g_ctrl + consumed, (size_t)(g_ctrl_len - consumed));
    g_ctrl_len -= consumed;
    g_ctrl[g_ctrl_len] = '\0';

    return found;
}

/* =============================================================================
 * port_comm_shutdown  — real teardown of the persistent link (process exit)
 * ============================================================================= */
void port_comm_shutdown(void)
{
    g_persistent = false;

    if (conn_fd != SOCK_INVALID)
        SOCK_CLOSE(conn_fd);
    conn_fd    = SOCK_INVALID;
    listen_fd  = SOCK_INVALID;
    g_ctrl_len = 0;

    #ifdef _WIN32
        WSACleanup();
    #endif
}

void port_comm_close  (port_comm_ctx_t *ctx)
{
    /* Persistent model: leave the socket open across auths — only reset the
     * per-auth counters. Real teardown happens in port_comm_shutdown(). */
    if (g_persistent)
    {
        rx_drop_count     = 0;
        rx_received_count = 0;
        return;
    }

    if (conn_fd != SOCK_INVALID)
        SOCK_CLOSE(conn_fd);

    if (is_server && listen_fd != SOCK_INVALID)
        SOCK_CLOSE(listen_fd);

    conn_fd   = SOCK_INVALID;
    listen_fd = SOCK_INVALID;

    rx_drop_count     = 0;
    rx_received_count = 0;

    #ifdef _WIN32
        Sleep(100);
        WSACleanup();
    #else
        usleep(100 * 1000);
    #endif

    LOG_DEBUG("Closing communication port ....");
}