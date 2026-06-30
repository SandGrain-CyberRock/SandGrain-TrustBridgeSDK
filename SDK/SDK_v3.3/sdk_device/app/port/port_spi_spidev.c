/* =============================================================================
 * port_spi_spidev.c
 *
 * Native SPI transport to the SandGrain crypto chip via Linux spidev.
 *
 * Wire format: BINARY, full-duplex. No ASCII-hex framing, no '\r' terminator.
 * The same `size` bytes are clocked out on MOSI and clocked in on MISO in
 * one ioctl(SPI_IOC_MESSAGE(1)) transaction.
 *
 * Configuration: see app/config_poc.h (SPI_DEVICE_PATH, SPI_MODE, SPI_MAX_HZ,
 * SPI_BITS_PER_WORD, SPI_CS_MODE_HW).
 *
 * Selected at build time:  make TRANSPORT=spi
 * ============================================================================= */

#ifndef LINUX
#error "port_spi_spidev.c is Linux-only — build with TRANSPORT=usb on Windows."
#endif

#include "config_poc.h"
#include "../../port/port_spi.h"

#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <linux/spi/spidev.h>

/* ===================== FAULT INJECTION HOOK (parity with USB port) ===================== */
volatile uint8_t g_fault_injection_enable_spi_rx = 0;

/* ===================== INTERNAL STATE ===================== */
static int spi_fd = -1;

/* Manual CS (libgpiod) is not enabled in this build. If SPI_CS_MODE_HW is 0,
 * we currently log a warning and fall back to no-op — wire up libgpiod here
 * if your chip needs manual CS timing. */
#if SPI_CS_MODE_HW == 0
    #warning "Manual CS path (SPI_CS_MODE_HW=0) is not wired in this stub — using no-op CS. Add libgpiod here when needed."
#endif

/* ===================== port_spi_* IMPLEMENTATION ===================== */

bool port_spi_initialize(void)
{
    if (spi_fd >= 0)
    {
        /* already open — keep current handle */
        return true;
    }

    spi_fd = open(SPI_DEVICE_PATH, O_RDWR);
    if (spi_fd < 0)
    {
        printf("[PORT][SPI] open(%s) failed: %s\n", SPI_DEVICE_PATH, strerror(errno));
        return false;
    }

    uint8_t  mode = SPI_MODE;
    uint8_t  bits = SPI_BITS_PER_WORD;
    uint32_t hz   = SPI_MAX_HZ;

    if (ioctl(spi_fd, SPI_IOC_WR_MODE, &mode) < 0)
    {
        printf("[PORT][SPI] SPI_IOC_WR_MODE failed: %s\n", strerror(errno));
        close(spi_fd); spi_fd = -1;
        return false;
    }
    if (ioctl(spi_fd, SPI_IOC_WR_BITS_PER_WORD, &bits) < 0)
    {
        printf("[PORT][SPI] SPI_IOC_WR_BITS_PER_WORD failed: %s\n", strerror(errno));
        close(spi_fd); spi_fd = -1;
        return false;
    }
    if (ioctl(spi_fd, SPI_IOC_WR_MAX_SPEED_HZ, &hz) < 0)
    {
        printf("[PORT][SPI] SPI_IOC_WR_MAX_SPEED_HZ failed: %s\n", strerror(errno));
        close(spi_fd); spi_fd = -1;
        return false;
    }

    printf("[PORT][SPI] Initialized | %s mode=%u bits=%u clock=%u Hz cs=%s\n",
           SPI_DEVICE_PATH, (unsigned)mode, (unsigned)bits, (unsigned)hz,
           SPI_CS_MODE_HW ? "hardware" : "manual(stub)");
    return true;
}

/* Hardware CS: the kernel asserts/deasserts CS around each transfer.
 * cs_enable/cs_disable become no-ops. Keep the SDK call shape unchanged. */
bool port_spi_cs_enable(void)  { return true; }
bool port_spi_cs_disable(void) { return true; }

bool port_spi_TransmitReceive(uint8_t *tx_buffer, uint8_t *rx_buffer, uint16_t size)
{
    if (spi_fd < 0 || !tx_buffer || !rx_buffer || size == 0)
        return false;

    struct spi_ioc_transfer xfer;
    memset(&xfer, 0, sizeof(xfer));
    xfer.tx_buf        = (unsigned long)tx_buffer;
    xfer.rx_buf        = (unsigned long)rx_buffer;
    xfer.len           = (uint32_t)size;
    xfer.speed_hz      = 0;   /* 0 → use the fd's default set in initialize */
    xfer.bits_per_word = 0;   /* 0 → use the fd's default                   */
    xfer.delay_usecs   = 0;
    xfer.cs_change     = 0;

    int rc = ioctl(spi_fd, SPI_IOC_MESSAGE(1), &xfer);
    if (rc < 0)
    {
        printf("[PORT][SPI] SPI_IOC_MESSAGE failed: %s\n", strerror(errno));
        return false;
    }

    if (g_fault_injection_enable_spi_rx)
    {
        /* Mirror the USB port's RX fault-injection hook for parity.
         * Currently a no-op — extend if you need to corrupt MISO bytes
         * for chip-side fault tests. */
    }

    return true;
}

bool port_spi_close(void)
{
    if (spi_fd >= 0)
    {
        close(spi_fd);
        spi_fd = -1;
    }
    return true;
}
