
# ================== PLATFORM DETECTION ==================
ifeq ($(OS),Windows_NT)
PLATFORM := WINDOWS
else
PLATFORM := LINUX
endif

# ================== CONFIG ==================
CC := gcc
#CFLAGS := -Wall -Wextra -Wpedantic -Wshadow -Wundef -Wconversion -Wcast-align \
          -Wstrict-prototypes -Wmissing-prototypes -Wswitch-enum -Wmissing-declarations \
          -Wdouble-promotion -Wformat=2 -Wredundant-decls -Wno-unused-parameter \
          -Wimplicit-fallthrough -std=c11 -DLINUX

CFLAGS   += -g3 -O0 -ggdb
CXXFLAGS += -g3 -O0 -ggdb
CFLAGS   += -fno-lto
LDFLAGS  += -fno-lto

ifeq ($(PLATFORM),WINDOWS)
CFLAGS  += -Wall -Wextra -std=c11 -DWIN32
LDFLAGS := \
        -lmosquitto \
        ../sdk_fw/src/utils/rs232/librs232lib-static.a -lws2_32
else
CFLAGS  += -Wall -Wextra -std=c11 -DLINUX
LDFLAGS := \
        -lmosquitto \
        -lftdi1 \
        -L../sdk_fw/src/utils/rs232 -lrs232lib \
        -Wl,-rpath,'$$ORIGIN/../sdk_fw/src/utils/rs232'
endif

TARGET  := test_sdk

# ================== INCLUDE PATHS ==================
INC_DIRS := \
    ../sdk_fw/include \
    ../sdk_fw/src \
    ../sdk_fw/src/application \
    ../sdk_fw/src/middleware \
    ../sdk_fw/src/services/comm \
    ../sdk_fw/src/services/delay \
    ../sdk_fw/src/services/crypto \
    ../sdk_fw/src/services/protocol \
    ../sdk_fw/src/utils/crc \
    ../sdk_fw/src/utils/encoding \
    ../sdk_fw/src/utils/rs232 \
    ../sdk_fw/src/utils/json \
    ../sdk_fw/port \
    .

# ================== SOURCES ==================
SRCS := \
    ../sdk_fw/src/application/sdk_sgr_user_api.c \
    ../sdk_fw/src/middleware/sgr_middleware.c \
    ../sdk_fw/src/services/comm/comm.c \
    ../sdk_fw/src/services/delay/delay.c \
    ../sdk_fw/src/services/protocol/protocol.c \
    ../sdk_fw/src/utils/json/json_tx_build.c \
    ../sdk_fw/src/services/crypto/crypto.c \
    main_rw_cw.c \
    port/port_comm.c \
    port/port_delay.c \
    port/port_spi_usb.c \
    ../sdk_fw/src/utils/encoding/encoding_hex.c \
    ../sdk_fw/src/utils/crc/crc.c

# ================== BUILD ==================
INCLUDES := $(addprefix -I,$(INC_DIRS))
OBJS := $(SRCS:.c=.o)

# ================== RULES ==================
all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

.PHONY: all clean