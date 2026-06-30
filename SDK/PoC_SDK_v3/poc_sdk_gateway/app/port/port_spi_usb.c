/* =============================================================================
 * port_spi_usb.c  (gateway)
 *
 * USB-serial transport to the SandGrain crypto chip on the gateway side.
 * Wire format: ASCII hex bytes followed by a single '\r' terminator.
 *
 * Linux : native POSIX termios (no external library required → portable to ARM).
 * Windows: keeps using Ikerlan's rs232lib (librs232lib-static.a).
 *
 * The gateway typically uses an FTDI FT2232 (VID 0x0403 / PID 0x6014) which
 * enumerates as /dev/ttyUSB* on Linux. Override USB_TTY_PREFIX in
 * config_poc.h if your bridge enumerates differently.
 * ============================================================================= */

#include "config_poc.h"
#include "../../port/port_spi.h"
#include <string.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include "../../src/utils/encoding/encoding_hex.h"

#ifdef _WIN32
    #include "../../src/utils/rs232/rs232.h"
#else
    #include <unistd.h>
    #include <fcntl.h>
    #include <termios.h>
    #include <errno.h>
    #include <sys/select.h>
#endif

/* ===================== FAULT INJECTION HOOKS ===================== */
volatile uint8_t g_fault_injection_enable_spi_rx = 0;
volatile uint8_t g_fault_injection_enable_spi_tx = 0;

/* ===================== INTERNAL STATE ===================== */
#ifdef _WIN32
static rs232_handle      c_h = -1;
static rs232_conf_st     c_conf;
static rs232_return_code ret;
#else
static int c_fd = -1;
#endif

static uint8_t l_buffer[200];

/* ===================== LINUX HELPERS ===================== */
#ifndef _WIN32

/* Build "/dev/tty<USB_TTY_PREFIX><USB_TTY_PORT>" from the configured prefix and port number. */
#ifndef USB_TTY_PREFIX
#define USB_TTY_PREFIX "USB"   /* FT2232 default; override in config_poc.h for CDC-ACM */
#endif
static const char *linux_tty_path(void)
{
    static char path[64];
    snprintf(path, sizeof(path), "/dev/tty%s%d", USB_TTY_PREFIX, USB_TTY_PORT);
    return path;
}

/* Configure 115200 8N1, no flow control, raw mode. */
static bool linux_tty_configure(int fd)
{
    struct termios tio;
    if (tcgetattr(fd, &tio) != 0) return false;

    cfmakeraw(&tio);
    cfsetispeed(&tio, B115200);
    cfsetospeed(&tio, B115200);

    tio.c_cflag |= (CLOCAL | CREAD);
    tio.c_cflag &= ~CRTSCTS;        /* no HW flow control       */
    tio.c_cflag &= ~CSTOPB;         /* 1 stop bit               */
    tio.c_cflag &= ~PARENB;         /* no parity                */
    tio.c_cflag &= ~CSIZE;
    tio.c_cflag |= CS8;             /* 8 data bits              */
    tio.c_cflag &= ~HUPCL;          /* don't pulse DTR on close → keeps device from resetting */

    tio.c_iflag &= ~(IXON | IXOFF | IXANY);  /* no SW flow      */

    /* Non-canonical: read returns whatever is available; we use
     * select() below for the per-call timeout. */
    tio.c_cc[VMIN]  = 0;
    tio.c_cc[VTIME] = 0;

    tcflush(fd, TCIOFLUSH);
    return tcsetattr(fd, TCSANOW, &tio) == 0;
}

/* Read up to len bytes; return early on '\r' or after timeout_ms. */
static int linux_tty_read_timeout(int fd, uint8_t *buf, int len, int timeout_ms)
{
    int got = 0;
    while (got < len)
    {
        fd_set rfds;
        FD_ZERO(&rfds);
        FD_SET(fd, &rfds);

        struct timeval tv;
        tv.tv_sec  = timeout_ms / 1000;
        tv.tv_usec = (timeout_ms % 1000) * 1000;

        int rs = select(fd + 1, &rfds, NULL, NULL, &tv);
        if (rs <= 0) break;          /* timeout or error */

        ssize_t r = read(fd, buf + got, len - got);
        if (r <= 0) break;
        got += (int)r;

        if (got > 0 && buf[got - 1] == '\r') break;
    }
    return got;
}

/* Write the line "<hex>\r" to the device. */
static bool linux_tty_write_line(const char *hex, int hex_len)
{
    if (c_fd < 0) return false;
    if (hex_len + 1 >= (int)sizeof(l_buffer)) return false;

    /* Build "<hex>\r" in l_buffer (overwrite — caller already used it for hex). */
    memmove(l_buffer, hex, hex_len);
    l_buffer[hex_len]     = '\r';
    l_buffer[hex_len + 1] = '\0';
    int to_send = hex_len + 1;

    ssize_t wrote = 0;
    while (wrote < to_send)
    {
        ssize_t w = write(c_fd, l_buffer + wrote, to_send - wrote);
        if (w <= 0) return false;
        wrote += w;
    }
    return true;
}

/* Read one '\r'-terminated hex line, decode into rx_buffer up to size bytes. */
static bool linux_tty_read_decode(uint8_t *rx_buffer, uint16_t size)
{
    int got = linux_tty_read_timeout(c_fd, l_buffer, sizeof(l_buffer) - 1, 1000);
    if (got <= 0) return false;
    l_buffer[got] = '\0';

    if (got > 0 && l_buffer[got - 1] == '\r')
    {
        l_buffer[got - 1] = '\0';
        got--;
    }
    if (got <= 0) return false;

    /* Tolerate small length mismatches: cap to caller's buffer size. */
    int rx_bytes = got / 2;
    if (rx_bytes > size) rx_bytes = size;

    int res = hex_to_bytes((const char *)l_buffer, rx_buffer, (size_t)rx_bytes);
    return res == 0;
}

#endif /* !_WIN32 */

/* ===================== PUBLIC API ===================== */

bool port_spi_initialize(void)
{
#ifdef _WIN32
    int res = RS232_Parse_Uart_Info_Str((char *)USB_PORT_STRING, &c_conf);
    if (res != -1)
    {
        c_conf.sd_buffer_size = 4600;
        ret = RS232_Open(c_conf.uart_desc, &c_h, &c_conf);
        if (ret == rs232_success) return true;
    }
    return false;
#else
    if (c_fd >= 0)
    {
        close(c_fd);
        c_fd = -1;
    }

    int fd = open(linux_tty_path(), O_RDWR | O_NOCTTY);
    if (fd < 0) return false;

    if (!linux_tty_configure(fd))
    {
        close(fd);
        return false;
    }

    /* Some USB-serial bridges reset the SPI chip on open (DTR transition).
     * Give the firmware time to boot before the first transaction,
     * then drain any unsolicited boot output. */
    usleep(200 * 1000);
    tcflush(fd, TCIOFLUSH);

    c_fd = fd;
    return true;
#endif
}

bool port_spi_cs_enable(void)  { return true; }
bool port_spi_cs_disable(void) { return true; }

bool port_spi_transmit(const uint8_t *tx_buffer, uint16_t size)
{
    int res = bytes_to_hex(tx_buffer, size, (char *)l_buffer, sizeof(l_buffer));
    if (res) return false;
    int hex_len = (int)strlen((char *)l_buffer);

#ifdef _WIN32
    uint16_t nc = 0;
    ret = rs232_error_invalid_uart_handle;
    ret = RS232_Printf(c_h, "%s\r", l_buffer);
    int rsize = hex_len + 1;
    if (ret == rs232_success)
        ret = RS232_Read(c_h, l_buffer, rsize, &nc, 1000);
    return ret == rs232_success;
#else
    if (!linux_tty_write_line((const char *)l_buffer, hex_len)) return false;
    /* Drain the echo (same length as what we just sent). */
    int got = linux_tty_read_timeout(c_fd, l_buffer, sizeof(l_buffer) - 1, 1000);
    return got > 0;
#endif
}

bool port_spi_receive(uint8_t *rx_buffer, uint16_t size)
{
    /* SPI is full-duplex: to receive `size` bytes, send `size` dummy bytes. */
    uint8_t t_buffer[200] = {0};
    if (size > sizeof(t_buffer)) return false;

    int res = bytes_to_hex(t_buffer, size, (char *)l_buffer, sizeof(l_buffer));
    if (res) return false;
    int hex_len = (int)strlen((char *)l_buffer);

#ifdef _WIN32
    uint16_t nc = 0;
    ret = rs232_error_invalid_uart_handle;
    ret = RS232_Printf(c_h, "%s\r", l_buffer);
    int rsize = hex_len + 1;
    if (ret == rs232_success)
        ret = RS232_Read(c_h, l_buffer, rsize, &nc, 1000);

    if (nc <= 0) return false;
    /* nc is the hex-char count; hex_to_bytes wants the output byte count. */
    int rx_bytes = nc / 2;
    if (rx_bytes > size) rx_bytes = size;
    res = hex_to_bytes((const char *)l_buffer, rx_buffer, (size_t)rx_bytes);
    return res == 0 && ret == rs232_success;
#else
    if (!linux_tty_write_line((const char *)l_buffer, hex_len)) return false;
    return linux_tty_read_decode(rx_buffer, size);
#endif
}

bool port_spi_TransmitReceive(uint8_t *tx_buffer, uint8_t *rx_buffer, uint16_t size)
{
    /* Fault injection — TX side only */
    if (g_fault_injection_enable_spi_tx == 1)
    {
        if (size > 20) {
            tx_buffer[20] = 'F';
            printf("[FAULT][SPI][TX] Byte 20 corrupted\n");
        }
    }

    int res = bytes_to_hex(tx_buffer, size, (char *)l_buffer, sizeof(l_buffer));
    if (res) return false;
    int hex_len = (int)strlen((char *)l_buffer);

#ifdef _WIN32
    uint16_t nc = 0;
    ret = rs232_error_invalid_uart_handle;
    ret = RS232_Printf(c_h, "%s\r", l_buffer);
    int rsize = hex_len + 1;
    if (ret == rs232_success)
        ret = RS232_Read(c_h, l_buffer, rsize, &nc, 1000);

    if (nc <= 0) return false;
    int rx_bytes = nc / 2;
    if (rx_bytes > size) rx_bytes = size;
    res = hex_to_bytes((const char *)l_buffer, rx_buffer, (size_t)rx_bytes);

    if (g_fault_injection_enable_spi_rx == 1) {
        if (size > 20) {
            rx_buffer[20] = 0xFF;
            printf("[FAULT][SPI][RX] Byte 20 corrupted\n");
        }
    }
    return res == 0 && ret == rs232_success;
#else
    if (!linux_tty_write_line((const char *)l_buffer, hex_len)) return false;
    if (!linux_tty_read_decode(rx_buffer, size)) return false;

    if (g_fault_injection_enable_spi_rx == 1) {
        if (size > 20) {
            rx_buffer[20] = 0xFF;
            printf("[FAULT][SPI][RX] Byte 20 corrupted\n");
        }
    }
    return true;
#endif
}

bool port_spi_close(void)
{
#ifdef _WIN32
    RS232_Close(c_h);
#else
    if (c_fd >= 0)
    {
        close(c_fd);
        c_fd = -1;
    }
#endif
    return true;
}
