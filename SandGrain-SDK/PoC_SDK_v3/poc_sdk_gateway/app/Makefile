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
CFLAGS  += -Wall -Wextra -std=c11 -DWIN32 -DSDK_MODE=1 -DMAX_DEVICES=3
# -lpthread for gw_presence / port_comm_device per-device proxy + send lock.
LDFLAGS := \
        -lmosquitto -lpthread \
        -lws2_32 -lbcrypt -lkernel32
else ifeq ($(PLATFORM),MACOS)
# macOS: libmosquitto comes from Homebrew; add its include/lib paths.
BREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
CFLAGS  += -Wall -Wextra -std=c11 -D_GNU_SOURCE -DLINUX -DSDK_MODE=1 -DMAX_DEVICES=3 \
           -I$(BREW_PREFIX)/include \
           -I$(BREW_PREFIX)/opt/mosquitto/include
# pthread is in libSystem on macOS — no explicit -lpthread needed.
LDFLAGS := \
        -L$(BREW_PREFIX)/lib \
        -L$(BREW_PREFIX)/opt/mosquitto/lib \
        -lmosquitto
else
# _GNU_SOURCE exposes POSIX/BSD APIs (usleep, etc.) under -std=c11
# Required on glibc >= 2.38 (Raspberry Pi OS Trixie 13, Debian 13).
# port_spi_usb.c uses native termios on Linux, no external serial lib needed.
# -lpthread for gw_presence / port_comm_device per-device proxy + send lock.
CFLAGS  += -Wall -Wextra -std=c11 -D_GNU_SOURCE -DLINUX -DSDK_MODE=1 -DMAX_DEVICES=3
LDFLAGS := \
        -lmosquitto -lpthread
endif

# ---- Device transport selection ----
# Default: TCP server (port_comm_device.c).
# `make GW_BLE=1`: talk to the board(s) directly over Bluetooth LE (NUS) via
# gattlib/BlueZ — no relay. Linux only. Each device channel scans for and
# connects to its own peripheral (any advertised name starting with
# "SandGrain-Dev"). GW_BLE_DEVICES sets how many concurrent BLE devices the
# gateway serves (default 2 — e.g. one nRF board + one Pi device).
GW_BLE_DEVICES ?= 2
ifeq ($(GW_BLE),1)
DEVICE_PORT_SRC := port/port_comm_device_ble.c
# PORT_COMM_DEVICE_DEBUG: the [COMM_BLE] logs are essential for diagnosing
# scan/connect/subscribe issues and cheap at runtime — always on for BLE.
CFLAGS  += -DGW_BLE=1 -UMAX_DEVICES -DMAX_DEVICES=$(GW_BLE_DEVICES) -DPORT_COMM_DEVICE_DEBUG=1 $(shell pkg-config --cflags gattlib gio-2.0 glib-2.0)
LDFLAGS += $(shell pkg-config --libs gattlib gio-2.0 glib-2.0) -lpthread
else
DEVICE_PORT_SRC := port/port_comm_device.c
endif
# gw_presence.c is built for BOTH transports: devices are MQTT-free now, so the
# gateway publishes their retained sandgrain/v1/{tid}/status and relays their
# cmd/run_auth triggers whether they are reached over TCP or BLE.

TARGET := test_gw

# ================== INCLUDE PATHS ==================
INC_DIRS := \
    $(SDK_DIR)/include \
    $(SDK_DIR)/src \
    $(SDK_DIR)/src/application \
    $(SDK_DIR)/src/middleware \
    $(SDK_DIR)/src/services/server \
    $(SDK_DIR)/src/services/database \
    $(SDK_DIR)/src/services/devices \
    $(SDK_DIR)/src/services/crypto \
    $(SDK_DIR)/src/services/protocol \
    $(SDK_DIR)/src/utils/crc \
    $(SDK_DIR)/src/utils/encoding \
    $(SDK_DIR)/src/utils/random \
    $(SDK_DIR)/src/utils/rs232 \
    $(SDK_DIR)/src/utils/json \
    $(SDK_DIR)/src/utils/bit_flip \
    $(SDK_DIR)/port \
    ./port \
    .

# ================== SOURCES ==================
SDK_SRCS := \
    $(SDK_DIR)/src/application/api.c \
    $(SDK_DIR)/src/middleware/sgr_mw.c \
    $(SDK_DIR)/src/services/server/server.c \
    $(SDK_DIR)/src/services/database/auth_db.c \
    $(SDK_DIR)/src/services/database/auth_db_whitelist.c \
    $(SDK_DIR)/src/services/devices/device_service.c \
    $(SDK_DIR)/src/services/protocol/protocol.c \
    $(SDK_DIR)/src/services/crypto/crypto.c \
    $(SDK_DIR)/src/utils/json/json_tx_build.c \
    $(SDK_DIR)/src/utils/encoding/encoding_hex.c \
    $(SDK_DIR)/src/utils/crc/crc.c \
    $(SDK_DIR)/src/utils/random/random.c \
    $(SDK_DIR)/src/utils/bit_flip/bit_flip.c

POC_SRCS := \
    main_gw.c \
    port/port_comm.c \
    $(DEVICE_PORT_SRC) \
    port/port_delay.c \
    port/port_spi_usb.c \
    port/port_random.c \
    port/gw_log.c \
    port/gw_whitelist.c \
    port/gw_presence.c

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