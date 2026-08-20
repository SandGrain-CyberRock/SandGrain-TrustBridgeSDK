# ================== PLATFORM DETECTION ==================
ifeq ($(OS),Windows_NT)
PLATFORM := WINDOWS
else
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
PLATFORM := MACOS
else
PLATFORM := LINUX
endif
endif

# ================== CONFIG ==================
CC := gcc
BUILD_DIR := ./build
SDK_DIR := ../sdk_fw

CFLAGS   += -g3 -O0 -ggdb
CXXFLAGS += -g3 -O0 -ggdb
CFLAGS   += -fno-lto
LDFLAGS  += -fno-lto

ifeq ($(PLATFORM),WINDOWS)
CFLAGS  += -Wall -Wextra -std=c11 -DWIN32 -DSDK_MODE=0
# MQTT-free device: no libmosquitto. Threads via kernel32 (CreateThread).
LDFLAGS := \
        -lws2_32 -lbcrypt -lkernel32
else ifeq ($(PLATFORM),MACOS)
# MQTT-free device: the gateway proxies presence + relays triggers over the
# persistent TCP link, so no libmosquitto is needed here. pthread is in libSystem.
CFLAGS  += -Wall -Wextra -std=c11 -D_GNU_SOURCE -DLINUX -DSDK_MODE=0
LDFLAGS :=
else
# _GNU_SOURCE exposes POSIX/BSD APIs (usleep, etc.) under -std=c11
# Required on glibc >= 2.38 (Raspberry Pi OS Trixie 13, Debian 13).
CFLAGS  += -Wall -Wextra -std=c11 -D_GNU_SOURCE -DLINUX -DSDK_MODE=0
# MQTT-free device: no libmosquitto. -lpthread for the SDK-call mutex + the
# trigger-listener thread (CRITICAL_SECTION/CreateThread used on Windows instead).
LDFLAGS := \
        -lpthread
endif

# ================== DEVICE<->GATEWAY TRANSPORT ==================
# Default: TCP (port_comm.c). `make DEV_BLE=1` (Linux/BlueZ only): act as a BLE
# peripheral exposing the Nordic UART Service, so a Raspberry Pi can replace the
# nRF board as the device. Swaps in port_comm_ble.c and links GLib/GIO (BlueZ
# over D-Bus). The gateway (BLE central) and cloud are unchanged.
ifeq ($(DEV_BLE),1)
COMM_SRC := port/port_comm_ble.c
CFLAGS   += -DDEV_BLE=1 $(shell pkg-config --cflags gio-2.0)
LDFLAGS  += $(shell pkg-config --libs gio-2.0)
else
COMM_SRC := port/port_comm.c
endif

# ================== CRYPTO-CHIP TRANSPORT ==================
# Default: USB-serial dongle on /dev/ttyACM0 (port_spi_usb.c). `make DEV_SPI=1`
# (Linux only, e.g. Raspberry Pi): talk to the SGT1001 wired directly to the
# SPI header via /dev/spidev0.0 (port_spi_dev.c) — same one-frame full-duplex
# protocol as the nRF54L15 Zephyr port. Combine with DEV_BLE=1 for a Pi that
# is both a BLE peripheral and reads the chip over SPI.
ifeq ($(DEV_SPI),1)
SPI_SRC := port/port_spi_dev.c
CFLAGS  += -DDEV_SPI=1
else
SPI_SRC := port/port_spi_usb.c
endif

TARGET := test_device

# ================== INCLUDE PATHS ==================
INC_DIRS := \
    $(SDK_DIR)/include \
    $(SDK_DIR)/src \
    $(SDK_DIR)/src/application \
    $(SDK_DIR)/src/middleware \
    $(SDK_DIR)/src/services/server \
    $(SDK_DIR)/src/services/crypto \
    $(SDK_DIR)/src/services/protocol \
    $(SDK_DIR)/src/services/devices \
    $(SDK_DIR)/src/services/database \
    $(SDK_DIR)/src/utils/crc \
    $(SDK_DIR)/src/utils/encoding \
    $(SDK_DIR)/src/utils/rs232 \
    $(SDK_DIR)/src/utils/json \
    $(SDK_DIR)/src/utils/bit_flip \
    $(SDK_DIR)/src/utils/sha256 \
    $(SDK_DIR)/port \
    ./port \
    ./fault_injection \
    .

# ================== SOURCES ==================
SDK_SRCS := \
    $(SDK_DIR)/src/application/api.c \
    $(SDK_DIR)/src/middleware/sgr_mw.c \
    $(SDK_DIR)/src/services/server/server.c \
    $(SDK_DIR)/src/services/protocol/protocol.c \
    $(SDK_DIR)/src/services/crypto/crypto.c \
    $(SDK_DIR)/src/utils/json/json_tx_build.c \
    $(SDK_DIR)/src/utils/encoding/encoding_hex.c \
    $(SDK_DIR)/src/utils/crc/crc.c \
    $(SDK_DIR)/src/services/devices/device_service.c \
    $(SDK_DIR)/src/services/database/auth_db.c \
    $(SDK_DIR)/src/services/database/auth_db_whitelist.c \
    $(SDK_DIR)/src/utils/bit_flip/bit_flip.c \
    $(SDK_DIR)/src/utils/sha256/sha256.c

POC_SRCS := \
    main_device.c \
    $(COMM_SRC) \
    port/comm_adapter.c \
    port/port_comm_device.c \
    port/port_delay.c \
    $(SPI_SRC) \
    port/port_random.c \
    fault_injection/fi_device.c
    

# ================== BUILD ==================
INCLUDES := $(addprefix -I,$(INC_DIRS))

SDK_OBJS := $(patsubst $(SDK_DIR)/src/%.c, $(BUILD_DIR)/sdk/src/%.o, $(SDK_SRCS))
POC_OBJS := $(patsubst %.c, $(BUILD_DIR)/poc/%.o, $(POC_SRCS))
OBJS     := $(SDK_OBJS) $(POC_OBJS)

# ================== RULES ==================
all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)

# SDK sources → build/sdk/src/
$(BUILD_DIR)/sdk/src/%.o: $(SDK_DIR)/src/%.c
	mkdir -p $(dir $@)
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

# PoC sources → build/poc/
$(BUILD_DIR)/poc/%.o: %.c
	mkdir -p $(dir $@)
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

clean:
	rm -rf $(BUILD_DIR) $(TARGET)

.PHONY: all clean
