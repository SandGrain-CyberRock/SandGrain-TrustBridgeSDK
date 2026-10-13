/* =============================================================================
 * port_spi_dev.c  (device)
 *
 * Native SPI transport to the SandGrain crypto chip (SGT1001) via Linux
 * spidev — for a Raspberry Pi with the chip wired directly to the SPI header
 * instead of a USB-serial dongle. Build with  make DEV_SPI=1  to select this
 * file over port_spi_usb.c.
 *
 * Mirrors the proven nRF54L15 Zephyr port (poc_sdk_device_nrf/src/ports/
 * port_spi.c): every chip operation is ONE full-duplex frame — the chip
 * computes its response inline while the dummy bytes are clocked out — with
 * chip-select held low for the whole frame. Bus parameters match the Nordic
 * devicetree node: mode 0, 8-bit words, MSB first, 1 MHz.
 *
 * CHIP-SELECT — two modes, chosen at runtime by the SPI_CS_GPIO env var:
 *   - UNSET (default): hardware chip-select. The kernel asserts the spidev
 *     node's native CS (CE0 = GPIO8 / header pin 24) for the whole
 *     SPI_IOC_MESSAGE transfer, so cs_enable/cs_disable are no-ops. This is
 *     the original behaviour — loose-jumper setups with CS on pin 24 keep
 *     working unchanged.
 *   - SET to a BCM GPIO number (e.g. SPI_CS_GPIO=22): software chip-select.
 *     The SandGrain token HAT routes the chip's CS to GPIO22 (pin 15), NOT to
 *     CE0, so the hardware CS never reaches the chip and reads come back all
 *     zero. In this mode we drive the given GPIO low around the frame via the
 *     gpiochip character device (no libgpiod dependency) and set SPI_NO_CS so
 *     the kernel leaves the native CE lines alone.
 *
 * Configuration (environment, read on every initialize):
 *   SPI_DEV       device node, default /dev/spidev0.0 (CE0 on the Pi header)
 *   SPI_SPEED_HZ  clock speed, default 1000000
 *   SPI_CS_GPIO   BCM GPIO for a software chip-select (e.g. 22 for the HAT).
 *                 Unset => hardware CS (CE0) as before.
 *   SPI_CS_CHIP   gpiochip node for SPI_CS_GPIO (default: auto-detect the SoC
 *                 bank, i.e. the first /dev/gpiochipN with >= 54 lines).
 * ============================================================================= */

#include "config_poc.h"
#include "port_spi.h"

#include <string.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>   /* getenv, strtoul, strtol */
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <linux/spi/spidev.h>
#include <linux/gpio.h>   /* gpiochip char-device ABI for the software CS */

#ifndef SPI_DEV_DEFAULT
#define SPI_DEV_DEFAULT      "/dev/spidev0.0"
#endif
#ifndef SPI_SPEED_HZ_DEFAULT
#define SPI_SPEED_HZ_DEFAULT 1000000u
#endif

/* ===================== FAULT INJECTION HOOKS ===================== */
volatile uint8_t g_fault_injection_enable_spi_rx = 0;
volatile uint8_t g_fault_injection_enable_spi_tx = 0;

/* ===================== INTERNAL STATE ===================== */
static int      c_fd         = -1;   /* spidev fd                                   */
static uint32_t c_speed_hz   = SPI_SPEED_HZ_DEFAULT;
static int      c_cs_gpio    = -1;   /* <0 = hardware CE0; >=0 = software CS on GPIO */
static int      c_cs_line_fd = -1;   /* persistent gpiochip line handle (software CS)*/

static const char *spi_dev_path(void)
{
    const char *env = getenv("SPI_DEV");
    return (env && env[0]) ? env : SPI_DEV_DEFAULT;
}

/* Parse SPI_CS_GPIO -> BCM number, or -1 when unset/invalid (hardware CS). */
static int spi_cs_gpio_cfg(void)
{
    const char *env = getenv("SPI_CS_GPIO");
    if (!env || !env[0]) return -1;
    char *end = NULL;
    long v = strtol(env, &end, 10);
    if (end == env || v < 0 || v > 1023) return -1;
    return (int)v;
}

/* Open the gpiochip that owns the 40-pin header BCM lines. SPI_CS_CHIP wins if
 * set; otherwise pick the first /dev/gpiochipN exposing the full SoC bank
 * (bcm2711/bcm2712 = 58 lines) so we skip the small firmware-expander chip. */
static int open_cs_gpiochip(void)
{
    const char *env = getenv("SPI_CS_CHIP");
    if (env && env[0])
        return open(env, O_RDWR | O_CLOEXEC);

    for (int i = 0; i < 8; i++)
    {
        char path[32];
        snprintf(path, sizeof(path), "/dev/gpiochip%d", i);
        int fd = open(path, O_RDWR | O_CLOEXEC);
        if (fd < 0) continue;

        struct gpiochip_info info;
        memset(&info, 0, sizeof(info));
        if (ioctl(fd, GPIO_GET_CHIPINFO_IOCTL, &info) == 0 && info.lines >= 54)
            return fd;           /* main SoC bank */
        close(fd);
    }
    return open("/dev/gpiochip0", O_RDWR | O_CLOEXEC);   /* best-effort fallback */
}

/* Request the CS line as an output, initial level = deasserted (high). Returns
 * a line-handle fd that stays valid after the chip fd is closed, or -1. */
static int request_cs_line(int gpio)
{
    int chip_fd = open_cs_gpiochip();
    if (chip_fd < 0)
    {
        printf("[PORT] software CS: cannot open gpiochip for GPIO%d: %s\n",
               gpio, strerror(errno));
        return -1;
    }

    struct gpiohandle_request req;
    memset(&req, 0, sizeof(req));
    req.lineoffsets[0]   = (uint32_t)gpio;
    req.lines            = 1;
    req.flags            = GPIOHANDLE_REQUEST_OUTPUT;
    req.default_values[0] = 1;    /* idle HIGH = deasserted (CS active-low) */
    strncpy(req.consumer_label, "sgr_spi_cs", sizeof(req.consumer_label) - 1);

    int rc = ioctl(chip_fd, GPIO_GET_LINEHANDLE_IOCTL, &req);
    close(chip_fd);               /* line handle survives chip-fd close */
    if (rc < 0)
    {
        printf("[PORT] software CS: cannot claim GPIO%d: %s\n",
               gpio, strerror(errno));
        return -1;
    }
    return req.fd;
}

static bool cs_line_set(int level)
{
    if (c_cs_line_fd < 0) return true;     /* hardware CS — nothing to drive */
    struct gpiohandle_data data;
    memset(&data, 0, sizeof(data));
    data.values[0] = level ? 1 : 0;
    return ioctl(c_cs_line_fd, GPIOHANDLE_SET_LINE_VALUES_IOCTL, &data) == 0;
}

/* ===================== PUBLIC API ===================== */

bool port_spi_initialize(void)
{
    if (c_fd >= 0)
    {
        close(c_fd);
        c_fd = -1;
    }

    const char *dev = spi_dev_path();
    int fd = open(dev, O_RDWR);
    if (fd < 0)
    {
        printf("[PORT] cannot open crypto-chip SPI device '%s': %s\n",
               dev, strerror(errno));
        if (errno == ENOENT)
            printf("[PORT] enable SPI first: sudo raspi-config nonint do_spi 0\n");
        return false;
    }

    const char *env = getenv("SPI_SPEED_HZ");
    c_speed_hz = SPI_SPEED_HZ_DEFAULT;
    if (env && env[0])
    {
        unsigned long v = strtoul(env, NULL, 10);
        if (v > 0) c_speed_hz = (uint32_t)v;
    }

    c_cs_gpio = spi_cs_gpio_cfg();

    /* Software CS: ask the kernel not to drive a native CE line too. */
    uint8_t mode = SPI_MODE_0;      /* CPOL=0 CPHA=0, matches the Nordic node */
    if (c_cs_gpio >= 0) mode |= SPI_NO_CS;
    uint8_t bits = 8;
    uint8_t lsb  = 0;               /* MSB first */

    if (ioctl(fd, SPI_IOC_WR_MODE, &mode) < 0)
    {
        /* Some SPI controllers — notably the RP1/DesignWare on the Pi 5 — manage
         * CS in hardware and reject SPI_NO_CS with EINVAL. The bit is only an
         * optimisation: with a software CS we drive the HAT's real CS (GPIO%d)
         * ourselves, and the kernel's native CE0 toggle is harmless because
         * nothing is wired to CE0 on the HAT. So drop the bit and retry. */
        if ((mode & SPI_NO_CS) && errno == EINVAL)
        {
            mode &= (uint8_t)~SPI_NO_CS;
            if (ioctl(fd, SPI_IOC_WR_MODE, &mode) == 0)
            {
                printf("[PORT] SPI_NO_CS unsupported here — using software CS on "
                       "GPIO%d only (native CE left to the kernel)\n", c_cs_gpio);
            }
            else
            {
                printf("[PORT] cannot set SPI mode on '%s': %s\n",
                       dev, strerror(errno));
                close(fd);
                return false;
            }
        }
        else
        {
            printf("[PORT] cannot set SPI mode on '%s': %s\n",
                   dev, strerror(errno));
            close(fd);
            return false;
        }
    }

    if (ioctl(fd, SPI_IOC_WR_BITS_PER_WORD, &bits) < 0 ||
        ioctl(fd, SPI_IOC_WR_LSB_FIRST, &lsb) < 0 ||
        ioctl(fd, SPI_IOC_WR_MAX_SPEED_HZ, &c_speed_hz) < 0)
    {
        printf("[PORT] cannot configure SPI device '%s': %s\n",
               dev, strerror(errno));
        close(fd);
        return false;
    }

    /* Claim the software-CS line once; keep it for the process lifetime so the
     * chip stays deasserted (high) between crypto.c's per-transaction inits. */
    if (c_cs_gpio >= 0 && c_cs_line_fd < 0)
    {
        c_cs_line_fd = request_cs_line(c_cs_gpio);
        if (c_cs_line_fd < 0)
        {
            close(fd);
            return false;          /* fail loudly rather than read all-zero */
        }
    }

    /* crypto.c re-initializes for every transaction — announce only once. */
    static bool announced = false;
    if (!announced)
    {
        if (c_cs_gpio >= 0)
            printf("[PORT] crypto chip on %s (SPI mode 0, %u Hz, software CS on GPIO%d)\n",
                   dev, c_speed_hz, c_cs_gpio);
        else
            printf("[PORT] crypto chip on %s (SPI mode 0, %u Hz, hardware CS)\n",
                   dev, c_speed_hz);
        announced = true;
    }

    c_fd = fd;
    return true;
}

/* Hardware CS: the kernel asserts CE for the whole frame, so these are no-ops.
 * Software CS: assert (low) on enable, deassert (high) on disable. */
bool port_spi_cs_enable(void)  { return cs_line_set(0); }
bool port_spi_cs_disable(void) { return cs_line_set(1); }

bool port_spi_TransmitReceive(uint8_t *tx_buffer, uint8_t *rx_buffer, uint16_t size)
{
    if (c_fd < 0 || tx_buffer == NULL || rx_buffer == NULL || size == 0)
        return false;

    /* Fault injection — TX side only */
    if (g_fault_injection_enable_spi_tx == 1)
    {
        if (size > 20) {
            tx_buffer[20] = 'F';
            printf("[FAULT][SPI][TX] Byte 20 corrupted\n");
        }
    }

    struct spi_ioc_transfer xfer;
    memset(&xfer, 0, sizeof(xfer));
    xfer.tx_buf        = (uintptr_t)tx_buffer;
    xfer.rx_buf        = (uintptr_t)rx_buffer;
    xfer.len           = size;
    xfer.speed_hz      = c_speed_hz;
    xfer.bits_per_word = 8;
    xfer.cs_change     = 0;         /* keep CS low across the frame, release at end */

    if (ioctl(c_fd, SPI_IOC_MESSAGE(1), &xfer) < 0)
    {
        fprintf(stderr, "[DBG][SPI] SPI_IOC_MESSAGE failed (size=%u): %s\n",
                size, strerror(errno));
        return false;
    }

    if (g_fault_injection_enable_spi_rx == 1)
    {
        if (size > 20) {
            rx_buffer[20] = 0xFF;
            printf("[FAULT][SPI][RX] Byte 20 corrupted\n");
        }
    }
    return true;
}

bool port_spi_close(void)
{
    if (c_fd >= 0)
    {
        close(c_fd);
        c_fd = -1;
    }
    /* Keep the software-CS line handle (idle high) for the process lifetime;
     * the OS releases it on exit. This avoids the line floating between the
     * per-transaction initialize/close cycles crypto.c performs. */
    return true;
}
