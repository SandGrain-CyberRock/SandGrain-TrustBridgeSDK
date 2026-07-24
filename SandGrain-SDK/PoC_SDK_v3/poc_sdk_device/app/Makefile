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
LDFLAGS := \
        -lmosquitto \
        -lws2_32 -lbcrypt -lkernel32
else ifeq ($(PLATFORM),MACOS)
# macOS: libmosquitto comes from Homebrew; add its include/lib paths.
BREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
CFLAGS  += -Wall -Wextra -std=c11 -D_GNU_SOURCE -DLINUX -DSDK_MODE=0 \
           -I$(BREW_PREFIX)/include \
           -I$(BREW_PREFIX)/opt/mosquitto/include
LDFLAGS := \
        -L$(BREW_PREFIX)/lib \
        -L$(BREW_PREFIX)/opt/mosquitto/lib \
        -lmosquitto
else
# _GNU_SOURCE exposes POSIX/BSD APIs (usleep, etc.) under -std=c11
# Required on glibc >= 2.38 (Raspberry Pi OS Trixie 13, Debian 13).
CFLAGS  += -Wall -Wextra -std=c11 -D_GNU_SOURCE -DLINUX -DSDK_MODE=0
# port_spi_usb.c uses native termios on Linux — no rs232lib link needed.
# -lpthread for the SDK-call mutex (CRITICAL_SECTION used on Windows instead).
LDFLAGS := \
        -lmosquitto -lpthread
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
    port/port_comm.c \
    port/comm_adapter.c \
    port/port_comm_device.c \
    port/port_delay.c \
    port/port_spi_usb.c \
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
