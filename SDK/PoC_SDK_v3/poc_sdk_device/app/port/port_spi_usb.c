/* =============================================================================
 * port_spi_usb.c  (device)
 *
 * USB-serial transport to the SandGrain crypto chip on the device side.
 * Wire format: ASCII hex bytes followed by a single '\r' terminator.
 *
 * Linux  : native POSIX termios (no external library required).
 * macOS  : native POSIX termios with /dev/cu.usbmodem* / /dev/cu.usbserial* auto-detect.
 * Windows: native Win32 COM-port API (CreateFile / SetCommState / Read/WriteFile).
 *          Drops Ikerlan's rs232lib (librs232lib-static.a was never committed
 *          to this repo, so Windows builds couldn't link).
 *
 * Override the port name via USB_TTY_PORT env (e.g. "COM3") or USB_PORT_STRING
 * in config_poc.h.
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
    #include <glob.h>     /* macOS device auto-scan fallback */
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

/* Resolve the serial device path for the SandGrain crypto chip.
 *
 * USB_TTY_PORT is read from the environment first (the launchers export it from
 * .env / auto-detect, e.g. "usbmodemCOMP0011" or "usbserial-XXXX" — the suffix
 * after /dev/tty.); falls back to the compiled config_poc.h values.
 *
 *   macOS : /dev/cu.<USB_TTY_PORT>  — the call-out device (doesn't block on DCD),
 *           and identical whether the chip is on a built-in port or a USB-C /
 *           USB-hub dongle. If the env var is unset, auto-scan for the first
 *           /dev/cu.usbmodem* or /dev/cu.usbserial* device.
 *   Linux : /dev/tty<USB_TTY_PREFIX><USB_TTY_PORT>
 */
#ifndef USB_TTY_PREFIX
#define USB_TTY_PREFIX "ACM"
#endif
static const char *linux_tty_path(void)
{
    static char path[96];
    const char *env = getenv("USB_TTY_PORT");
#ifdef __APPLE__
    if (env && env[0]) {
        snprintf(path, sizeof(path), "/dev/cu.%s", env);
    } else {
        glob_t g;
        int found = 0;
        if (glob("/dev/cu.usbmodem*", 0, NULL, &g) == 0 && g.gl_pathc > 0) {
            snprintf(path, sizeof(path), "%s", g.gl_pathv[0]);
            found = 1;
        }
        globfree(&g);
        if (!found) {
            if (glob("/dev/cu.usbserial*", 0, NULL, &g) == 0 && g.gl_pathc > 0) {
                snprintf(path, sizeof(path), "%s", g.gl_pathv[0]);
                found = 1;
            }
            globfree(&g);
        }
        if (!found)
            snprintf(path, sizeof(path), "/dev/cu.usbmodem");  /* will fail clearly */
    }
#else
    if (env && env[0])
        snprintf(path, sizeof(path), "/dev/tty%s%s", USB_TTY_PREFIX, env);
    else
        snprintf(path, sizeof(path), "/dev/tty%s%d", USB_TTY_PREFIX, USB_TTY_PORT);
#endif
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
    tio.c_cflag &= ~HUPCL;          /* don't pulse DTR on close → keeps CDC-ACM device from resetting */

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

        /* Crypto chip terminates each response with '\r' */
        if (got > 0 && buf[got - 1] == '\r') break;
    }
    return got;
}

#endif /* !_WIN32 */

/* ===================== WINDOWS HELPERS ===================== */
#ifdef _WIN32

/* Resolve the COM port name (e.g. "COM3" or "\\.\COM10").
 *
 * Mirrors the Linux/macOS branch of linux_tty_path() above:
 *   - if USB_TTY_PORT env is set, use it (set by start-local.ps1 after its
 *     PnP auto-detect, or set manually in .env by the user)
 *   - else fall back to USB_PORT_STRING from config_poc.h, else "COM3"
 *
 * No runtime port scan. The launcher is the single source of truth for which
 * COM port to use, exactly like macOS/Pi where start-local.sh / bootstrap-pi.sh
 * write USB_TTY_PORT into .env and the binary just reads it.
 *
 * For COM ports >= 10 the path needs the "\\.\COMn" form, otherwise
 * CreateFile() will fail.
 */
static const char *win_serial_path(void)
{
    static char path[64];
    char raw[32];
    const char *src = NULL;

    const char *env = getenv("USB_TTY_PORT");
    if (env && env[0])
    {
        src = env;
    }
#ifdef USB_PORT_STRING
    if (!src || !src[0])
    {
        const char *cfg = USB_PORT_STRING;
        if (cfg && cfg[0])
        {
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
    if (h == INVALID_HANDLE_VALUE)
    {
        printf("[PORT] cannot open crypto-chip serial device '%s'\n", dev);
        return false;
    }
    printf("[PORT] crypto chip on %s\n", dev);

    if (!win_serial_configure(h))
    {
        CloseHandle(h);
        return false;
    }

    /* Some CDC-ACM devices reset on open (DTR transition).
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

    const char *dev = linux_tty_path();
    int fd = open(dev, O_RDWR | O_NOCTTY);
    if (fd < 0)
    {
        printf("[PORT] cannot open crypto-chip serial device '%s': %s\n",
               dev, strerror(errno));
        return false;
    }
    printf("[PORT] crypto chip on %s\n", dev);

    if (!linux_tty_configure(fd))
    {
        close(fd);
        return false;
    }

    /* Some CDC-ACM devices reset on open (DTR transition).
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

    /* Encode tx bytes to ASCII hex */
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
    if (c_fd < 0) return false;

    /* Append '\r' terminator and write the line */
    if (hex_len + 1 >= (int)sizeof(l_buffer)) return false;
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

    /* Read echoed hex response — same length, terminated by '\r' */
    int got = linux_tty_read_timeout(c_fd, l_buffer, sizeof(l_buffer) - 1, 1000);
    if (got <= 0) {
        fprintf(stderr, "[DBG][SPI] read timeout (got=%d, expected %d hex chars + CR)\n",
                got, hex_len);
        return false;
    }
    l_buffer[got] = '\0';

    /* Strip trailing '\r' before hex decode */
    if (got > 0 && l_buffer[got - 1] == '\r')
    {
        l_buffer[got - 1] = '\0';
        got--;
    }
    if (got <= 0) return false;

    /* Tolerate a small mismatch in length (some devices prepend a sync byte
     * or extra padding). Cap to the requested rx size. */
    int rx_bytes = got / 2;
    if (rx_bytes > size) rx_bytes = size;

    if (got % 2 != 0)
        fprintf(stderr, "[DBG][SPI] odd hex length got=%d, l_buffer='%s'\n",
                got, (const char *)l_buffer);

    res = hex_to_bytes((const char *)l_buffer, rx_buffer, (size_t)rx_bytes);
    if (res) {
        fprintf(stderr, "[DBG][SPI] hex_to_bytes failed: got=%d rx_bytes=%d buf='%s'\n",
                got, rx_bytes, (const char *)l_buffer);
        return false;
    }

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
