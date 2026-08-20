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
 * The kernel asserts CS for the duration of the SPI_IOC_MESSAGE transfer, so
 * cs_enable/cs_disable are no-ops here, exactly like the Zephyr port.
 *
 * Configuration (environment, read on every initialize):
 *   SPI_DEV       device node, default /dev/spidev0.0 (CE0 on the Pi header)
 *   SPI_SPEED_HZ  clock speed, default 1000000
 * ============================================================================= */

#include "config_poc.h"
#include "port_spi.h"

#include <string.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>   /* getenv, strtoul */
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <linux/spi/spidev.h>

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
static int      c_fd       = -1;
static uint32_t c_speed_hz = SPI_SPEED_HZ_DEFAULT;

static const char *spi_dev_path(void)
{
    const char *env = getenv("SPI_DEV");
    return (env && env[0]) ? env : SPI_DEV_DEFAULT;
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

    uint8_t mode = SPI_MODE_0;      /* CPOL=0 CPHA=0, matches the Nordic node */
    uint8_t bits = 8;
    uint8_t lsb  = 0;               /* MSB first */

    if (ioctl(fd, SPI_IOC_WR_MODE, &mode) < 0 ||
        ioctl(fd, SPI_IOC_WR_BITS_PER_WORD, &bits) < 0 ||
        ioctl(fd, SPI_IOC_WR_LSB_FIRST, &lsb) < 0 ||
        ioctl(fd, SPI_IOC_WR_MAX_SPEED_HZ, &c_speed_hz) < 0)
    {
        printf("[PORT] cannot configure SPI device '%s': %s\n",
               dev, strerror(errno));
        close(fd);
        return false;
    }

    /* crypto.c re-initializes for every transaction — announce only once. */
    static bool announced = false;
    if (!announced)
    {
        printf("[PORT] crypto chip on %s (SPI mode 0, %u Hz)\n", dev, c_speed_hz);
        announced = true;
    }

    c_fd = fd;
    return true;
}

/* CS is asserted by the kernel for the whole SPI_IOC_MESSAGE frame. */
bool port_spi_cs_enable(void)  { return true; }
bool port_spi_cs_disable(void) { return true; }

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
    return true;
}
