# ================== PLATFORM DETECTION ==================
ifeq ($(OS),Windows_NT)
PLATFORM := WINDOWS
else
PLATFORM := LINUX
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
LDFLAGS := \
        -lmosquitto \
        $(SDK_DIR)/src/utils/rs232/librs232lib-static.a -lws2_32 -lbcrypt
else
CFLAGS  += -Wall -Wextra -std=c11 -DLINUX -DSDK_MODE=1 -DMAX_DEVICES=3
LDFLAGS := \
        -lmosquitto \
        -L$(SDK_DIR)/src/utils/rs232 -lrs232lib \
        -Wl,-rpath,'$$ORIGIN/../sdk_fw/src/utils/rs232'
endif

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
    port/port_comm_device.c \
    port/port_delay.c \
    port/port_spi_usb.c \
    port/port_random.c

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