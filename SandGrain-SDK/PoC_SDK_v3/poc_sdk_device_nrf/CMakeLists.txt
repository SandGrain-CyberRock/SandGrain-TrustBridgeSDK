# =============================================================================
# poc_sdk_device_nrf — SandGrain device SDK on the nRF54L15-DK
#
# Runs the real device-side mutual-auth flow (SGR_SDK_Authenticate_Via_GW) on
# the board. The device<->gateway transport (normally a TCP socket in the PC
# build) is replaced by a Bluetooth LE Nordic UART Service link; a laptop
# relay bridges BLE <-> the gateway's TCP:8080. Gateway and cloud are unchanged.
#
# Builds in DEVICE_MODE, reusing the portable SDK sources from
# ../poc_sdk_device/sdk_fw and providing Zephyr port_* implementations.
# =============================================================================
cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(poc_sdk_device_nrf)

set(SDK    ${CMAKE_CURRENT_SOURCE_DIR}/../poc_sdk_device/sdk_fw)
# The PC device app, reused for the parts that are pure logic: the menu's
# fault-injection options flip bits in the same JSON frames on any transport.
set(DEVAPP ${CMAKE_CURRENT_SOURCE_DIR}/../poc_sdk_device/app)

target_sources(app PRIVATE
    # --- application ---
    src/main.c

    # --- Zephyr port layer (the platform-specific seam) ---
    src/ports/port_spi.c        # SGT1001 over Zephyr SPI
    src/ports/port_comm.c       # device<->gateway over BLE NUS (replaces TCP)
    src/ports/port_delay.c
    src/ports/port_random.c

    # --- shared with the PC device app ---
    ${DEVAPP}/fault_injection/fi_device.c   # menu options 2 and 3
    ${DEVAPP}/port/comm_adapter.c           # port_comm.c -> SDK comm interface

    # --- portable SDK firmware (reused as-is, DEVICE_MODE) ---
    ${SDK}/src/application/api.c
    ${SDK}/src/middleware/sgr_mw.c
    ${SDK}/src/services/server/server.c
    ${SDK}/src/services/protocol/protocol.c
    ${SDK}/src/services/crypto/crypto.c
    ${SDK}/src/utils/json/json_tx_build.c
    ${SDK}/src/utils/encoding/encoding_hex.c
    ${SDK}/src/utils/crc/crc.c
    ${SDK}/src/utils/bit_flip/bit_flip.c
    ${SDK}/src/utils/sha256/sha256.c
    ${SDK}/src/utils/random/random.c
)

target_include_directories(app PRIVATE
    src/ports                       # mosquitto.h stub + app_ble.h (searched first)
    ${DEVAPP}/fault_injection
    ${DEVAPP}/port                  # comm_adapter.h (the only header there)
    ${SDK}/include
    ${SDK}/src/application
    ${SDK}/src/middleware
    ${SDK}/src/services/server
    ${SDK}/src/services/crypto
    ${SDK}/src/services/protocol
    ${SDK}/src/services/devices
    ${SDK}/src/services/database
    ${SDK}/src/utils/crc
    ${SDK}/src/utils/encoding
    ${SDK}/src/utils/json
    ${SDK}/src/utils/bit_flip
    ${SDK}/src/utils/sha256
    ${SDK}/src/utils/random
    ${SDK}/port
)

# DEVICE_MODE=0. MAX_DEVICES=1 (one channel). CRC checks off (PoC parity).
target_compile_definitions(app PRIVATE
    SDK_MODE=0
    MAX_DEVICES=1
    CRC_ENABLE=0
)
