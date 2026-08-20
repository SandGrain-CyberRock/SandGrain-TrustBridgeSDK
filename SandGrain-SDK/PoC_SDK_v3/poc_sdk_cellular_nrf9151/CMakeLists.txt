# =============================================================================
# poc_sdk_cellular_nrf9151 — SandGrain device+gateway combined on the nRF9151
#
# Dev-shortcut topology: the GATEWAY-mode SDK runs on the board with the
# SGT1001 attached locally over SPI, and talks MQTT over LTE straight to the
# hosted TrustBridge broker (the SDK's Token_To_Server / Server_To_Token
# "gateway authenticates its own token" path — the PC_USB_SGR shape).
#
# Reuses the portable gateway SDK from ../poc_sdk_gateway/sdk_fw
# (GATEWAY_MODE, GW_CRYPTO_ENABLED) with Zephyr ports:
#   port_spi.c          — SGT1001 over Zephyr SPI (proven on this board)
#   port_comm.c         — cloud MQTT over LTE, raw Zephyr client (app_mqtt.c)
#   port_comm_device.c  — inert stub (no remote devices on this build)
#   gw_log.c            — step/auth_result telemetry on the shared connection
# =============================================================================
cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(poc_sdk_cellular_nrf9151)

set(SDK ${CMAKE_CURRENT_SOURCE_DIR}/../poc_sdk_gateway/sdk_fw)

target_sources(app PRIVATE
    # --- application ---
    src/main.c

    # --- Zephyr port layer ---
    src/ports/port_spi.c
    src/ports/port_comm.c
    src/ports/app_mqtt.c
    src/ports/port_comm_device.c
    src/ports/gw_log.c
    src/ports/port_delay.c
    src/ports/port_random.c

    # --- portable gateway SDK firmware (GATEWAY_MODE) ---
    ${SDK}/src/application/api.c
    ${SDK}/src/middleware/sgr_mw.c
    ${SDK}/src/services/server/server.c
    ${SDK}/src/services/database/auth_db.c
    ${SDK}/src/services/database/auth_db_whitelist.c
    ${SDK}/src/services/devices/device_service.c
    ${SDK}/src/services/protocol/protocol.c
    ${SDK}/src/services/crypto/crypto.c
    ${SDK}/src/utils/json/json_tx_build.c
    ${SDK}/src/utils/encoding/encoding_hex.c
    ${SDK}/src/utils/crc/crc.c
    ${SDK}/src/utils/sha256/sha256.c

    # --- fault injection (menu options 2 and 3) ---
    # Shared with the PC device app rather than copied: the bit POSITIONS are
    # what make a corrupted cellular run and a corrupted PC run look identical
    # to CyberRock, so they must not drift. The file is plain C (stdint/string
    # only) and builds under Zephyr unchanged.
    ${CMAKE_CURRENT_SOURCE_DIR}/../poc_sdk_device/app/fault_injection/fi_device.c
    ${SDK}/src/utils/random/random.c
    ${SDK}/src/utils/bit_flip/bit_flip.c
)

target_include_directories(app PRIVATE
    src/ports                       # mosquitto.h stub + gw_log.h (searched first)
    ${SDK}/include
    ${SDK}/src/application
    ${SDK}/src/middleware
    ${SDK}/src/services/server
    ${SDK}/src/services/crypto
    ${SDK}/src/services/protocol
    ${SDK}/src/services/devices
    ${SDK}/src/services/database
    ${SDK}/src/utils/crc
    ${SDK}/src/utils/sha256
    ${CMAKE_CURRENT_SOURCE_DIR}/../poc_sdk_device/app/fault_injection
    ${SDK}/src/utils/encoding
    ${SDK}/src/utils/json
    ${SDK}/src/utils/bit_flip
    ${SDK}/src/utils/random
    ${SDK}/port
)

# GATEWAY_MODE=1 with the local crypto chip enabled; one (inert) device
# channel. CRC checks off (PoC parity with the PC builds).
target_compile_definitions(app PRIVATE
    SDK_MODE=1
    MAX_DEVICES=1
    GW_CRYPTO_ENABLED=1
    CRC_ENABLE=0
)
