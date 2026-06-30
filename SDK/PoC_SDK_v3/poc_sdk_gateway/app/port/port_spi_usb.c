/* =============================================================================
 * port_spi_usb.c  (gateway)
 *
 * USB-serial transport to the SandGrain crypto chip on the gateway side.
 * Wire format: ASCII hex bytes followed by a single '\r' terminator.
 *
 * Linux  : native POSIX termios (no external library required → portable to ARM).
 * Windows: native Win32 COM-port API (CreateFile / SetCommState / Read/WriteFile).
 *          Drops Ikerlan's rs232lib (librs232lib-static.a was never committed
 *          to this repo, so Windows builds couldn't link).
 *
 * The gateway typically uses an FTDI FT2232 (VID 0x0403 / PID 0x6014) which
 * enumerates as /dev/ttyUSB* on Linux. On Windows it appears as a COM port
 * (Device Manager -> Ports). Override the port name via USB_TTY_PORT env
 * (e.g. "COM3") or USB_PORT_STRING in config_poc.h.
 * ============================================================================= */

#include "config_poc.h"
#include "../../port/port_spi.h"
#include <string.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>   /* getenv */
#include "../../src/utils/encoding/encoding_hex.h"

#ifdef _WIN32
    #define WIN32_LEAN_AND_MEAN
    #include <windows.h>
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
static HANDLE c_h = INVALID_HANDLE_VALUE;
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

/* ===================== WINDOWS HELPERS ===================== */
#ifdef _WIN32

/* Resolve the COM port name (e.g. "COM3" or "\\.\COM10").
 *
 * Gateway uses COMPILE-TIME config only - no env var read, no runtime auto-
 * detect. This matches the Linux/macOS behavior of `linux_tty_path()` which
 * builds `/dev/tty<USB_TTY_PREFIX><USB_TTY_PORT>` from config_poc.h #defines
 * and never reads the launcher's USB_TTY_PORT env var.
 *
 * Rationale: in production the gateway has its own FT2232 USB bridge,
 * configured per-deployment in config_poc.h. In a single-machine local test
 * (e.g. Windows dev box with only one chip, plugged into what is meant to be
 * the device's COM port), this default config points at a port that doesn't
 * exist locally. CreateFile fails, port_spi_initialize returns false, the
 * SDK runs without a chip on the gateway side, and BIST is skipped - exactly
 * like the macOS local test where /dev/ttyUSB0 doesn't exist.
 *
 * Without this behavior, both test_gw and test_device would race for the
 * device's chip on the same COM port and the gateway would steal it,
 * breaking the device-side auth flow.
 *
 * Lookup order:
 *   1. USB_PORT_STRING from config_poc.h (legacy rs232lib config-string,
 *      e.g. "SERIAL3:115200,N,8,1,N,N" -> "SERIAL3"; first comma-separated
 *      field after the COM number is taken). Edit config_poc.h to point at
 *      the gateway's actual FT2232 COM port in production.
 *   2. Fallback to "COM3" if the macro isn't defined.
 *
 * For COM ports >= 10 the path needs the "\\.\COMn" form, otherwise
 * CreateFile() will fail.
 */
static const char *win_serial_path(void)
{
    static char path[64];
    char raw[32];
    const char *src = NULL;

#ifdef USB_PORT_STRING
    {
        const char *cfg = USB_PORT_STRING;
        if (cfg && cfg[0])
        {
            /* Copy up to the first comma (or full string if no comma). */
            size_t i = 0;
            while (cfg[i] && cfg[i] != ',' && i < sizeof(raw) - 1)
            {
                raw[i] = cfg[i];
                i++;
            }
            raw[i] = '\0';
            if (raw[0]) src = raw;
        }
    }
#endif
    if (!src || !src[0]) src = "COM3";

    /* Detect COMn with n >= 10 and rewrite as "\\.\COMn". */
    int n = 0;
    if ((src[0] == 'C' || src[0] == 'c') &&
        (src[1] == 'O' || src[1] == 'o') &&
        (src[2] == 'M' || src[2] == 'm'))
    {
        const char *p = src + 3;
        while (*p >= '0' && *p <= '9') { n = n * 10 + (*p - '0'); p++; }
    }
    if (n >= 10)
        snprintf(path, sizeof(path), "\\\\.\\%s", src);
    else
        snprintf(path, sizeof(path), "%s", src);
    return path;
}

/* Configure 115200 8N1, no flow control, 1s read/write timeouts. */
static bool win_serial_configure(HANDLE h)
{
    DCB dcb;
    memset(&dcb, 0, sizeof(dcb));
    dcb.DCBlength = sizeof(dcb);
    if (!GetCommState(h, &dcb)) return false;

    dcb.BaudRate        = CBR_115200;
    dcb.ByteSize        = 8;
    dcb.Parity          = NOPARITY;
    dcb.StopBits        = ONESTOPBIT;
    dcb.fBinary         = TRUE;
    dcb.fParity         = FALSE;
    dcb.fOutxCtsFlow    = FALSE;
    dcb.fOutxDsrFlow    = FALSE;
    dcb.fDtrControl     = DTR_CONTROL_ENABLE;
    dcb.fDsrSensitivity = FALSE;
    dcb.fOutX           = FALSE;
    dcb.fInX            = FALSE;
    dcb.fErrorChar      = FALSE;
    dcb.fNull           = FALSE;
    dcb.fRtsControl     = RTS_CONTROL_ENABLE;
    dcb.fAbortOnError   = FALSE;

    if (!SetCommState(h, &dcb)) return false;

    COMMTIMEOUTS to;
    memset(&to, 0, sizeof(to));
    to.ReadIntervalTimeout         = MAXDWORD;
    to.ReadTotalTimeoutMultiplier  = MAXDWORD;
    to.ReadTotalTimeoutConstant    = 1000;   /* 1 second */
    to.WriteTotalTimeoutMultiplier = 0;
    to.WriteTotalTimeoutConstant   = 1000;   /* 1 second */
    if (!SetCommTimeouts(h, &to)) return false;

    return true;
}

/* Read up to len bytes; return early on '\r' or after timeout_ms. */
static int win_serial_read_timeout(HANDLE h, uint8_t *buf, int len, int timeout_ms)
{
    COMMTIMEOUTS to;
    memset(&to, 0, sizeof(to));
    to.ReadIntervalTimeout         = MAXDWORD;
    to.ReadTotalTimeoutMultiplier  = MAXDWORD;
    to.ReadTotalTimeoutConstant    = (DWORD)timeout_ms;
    to.WriteTotalTimeoutMultiplier = 0;
    to.WriteTotalTimeoutConstant   = 1000;
    SetCommTimeouts(h, &to);

    int got = 0;
    while (got < len)
    {
        DWORD n = 0;
        if (!ReadFile(h, buf + got, (DWORD)(len - got), &n, NULL)) break;
        if (n == 0) break;          /* timeout */
        got += (int)n;
        if (got > 0 && buf[got - 1] == '\r') break;
    }
    return got;
}

/* Write the line "<hex>\r" to the device. */
static bool win_serial_write_line(const char *hex, int hex_len)
{
    if (c_h == INVALID_HANDLE_VALUE) return false;
    if (hex_len + 1 >= (int)sizeof(l_buffer)) return false;

    memmove(l_buffer, hex, hex_len);
    l_buffer[hex_len]     = '\r';
    l_buffer[hex_len + 1] = '\0';
    int to_send = hex_len + 1;

    int wrote = 0;
    while (wrote < to_send)
    {
        DWORD w = 0;
        if (!WriteFile(c_h, l_buffer + wrote, (DWORD)(to_send - wrote), &w, NULL))
            return false;
        if (w == 0) return false;
        wrote += (int)w;
    }
    return true;
}

/* Read one '\r'-terminated hex line, decode into rx_buffer up to size bytes. */
static bool win_serial_read_decode(uint8_t *rx_buffer, uint16_t size)
{
    int got = win_serial_read_timeout(c_h, l_buffer, sizeof(l_buffer) - 1, 1000);
    if (got <= 0) return false;
    l_buffer[got] = '\0';

    if (got > 0 && l_buffer[got - 1] == '\r')
    {
        l_buffer[got - 1] = '\0';
        got--;
    }
    if (got <= 0) return false;

    int rx_bytes = got / 2;
    if (rx_bytes > size) rx_bytes = size;

    int res = hex_to_bytes((const char *)l_buffer, rx_buffer, (size_t)rx_bytes);
    return res == 0;
}

#endif /* _WIN32 */

/* ===================== PUBLIC API ===================== */

bool port_spi_initialize(void)
{
#ifdef _WIN32
    if (c_h != INVALID_HANDLE_VALUE)
    {
        CloseHandle(c_h);
        c_h = INVALID_HANDLE_VALUE;
    }

    const char *dev = win_serial_path();
    HANDLE h = CreateFileA(dev,
                           GENERIC_READ | GENERIC_WRITE,
                           0,                /* no sharing */
                           NULL,             /* no security */
                           OPEN_EXISTING,
                           0,                /* non-overlapped */
                           NULL);
    if (h == INVALID_HANDLE_VALUE) return false;

    if (!win_serial_configure(h))
    {
        CloseHandle(h);
        return false;
    }

    /* Some USB-serial bridges reset the SPI chip on open (DTR transition).
     * Give the firmware time to boot before the first transaction,
     * then drain any unsolicited boot output. */
    Sleep(200);
    PurgeComm(h, PURGE_RXCLEAR | PURGE_TXCLEAR);

    c_h = h;
    return true;
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
    if (!win_serial_write_line((const char *)l_buffer, hex_len)) return false;
    /* Drain the echo (same length as what we just sent). */
    int got = win_serial_read_timeout(c_h, l_buffer, sizeof(l_buffer) - 1, 1000);
    return got > 0;
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
    if (!win_serial_write_line((const char *)l_buffer, hex_len)) return false;
    return win_serial_read_decode(rx_buffer, size);
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
    if (!win_serial_write_line((const char *)l_buffer, hex_len)) return false;
    if (!win_serial_read_decode(rx_buffer, size)) return false;

    if (g_fault_injection_enable_spi_rx == 1) {
        if (size > 20) {
            rx_buffer[20] = 0xFF;
            printf("[FAULT][SPI][RX] Byte 20 corrupted\n");
        }
    }
    return true;
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
    if (c_h != INVALID_HANDLE_VALUE)
    {
        CloseHandle(c_h);
        c_h = INVALID_HANDLE_VALUE;
    }
#else
    if (c_fd >= 0)
    {
        close(c_fd);
        c_fd = -1;
    }
#endif
    return true;
}
