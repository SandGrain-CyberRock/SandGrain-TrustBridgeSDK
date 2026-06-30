#include <string.h>
#include <stdio.h>
#include "sdk_sgr_config.h"
#include "sgr_middleware.h"

#include "comm.h"
#include "../services/crypto/crypto.h"
#include "../services/protocol/protocol.h"

#include "../utils/encoding/encoding_hex.h"

#include "../../include/sdk_sgr_errors.h"
#include "../../include/sdk_sgr_types.h"

#include "../utils/crc/crc.h" 

//#ifndef MW_DEBUG
//#define MW_DEBUG 1
//#endif

#if MW_DEBUG
    #define MW_LOG(fmt, ...)      printf("[MW] " fmt "\n", ##__VA_ARGS__)
    #define MW_LOG_RAW(fmt, ...)  printf(fmt, ##__VA_ARGS__)
#else
    #define MW_LOG(...)           do {} while (0)
    #define MW_LOG_RAW(...)       do {} while (0)
#endif

/* ===================== CONFIG ===================== */

#define MW_TX_BUFFER_SIZE   512
#define MW_RX_BUFFER_SIZE   512
#define MW_TIMEOUT_MS       5000U

/* ===================== FSM ===================== */
typedef enum
{
    MW_STATE_IDLE = 0,   /* No active operation */
    MW_STATE_INIT,       /* Prepare data / crypto / frames */
    MW_STATE_SEND,       /* Send frame via comm */
    MW_STATE_WAIT_RX,    /* Wait for response */
    MW_STATE_PARSE,      /* Parse and validate response */
    MW_STATE_DONE,       /* Operation completed successfully */
    MW_STATE_ERROR       /* Operation failed */
} mw_state_t;


/* ===================== CONTEXTO ===================== */

typedef struct
{
    sgr_mw_operation_t current_op;     /* Current middleware operation */
    mw_state_t         state;          /* Current FSM state */
    sgr_mw_status_t    result;         /* Final operation result */

    sdk_sgr_param_t   *params;         /* Token-side parameters */
    sgr_mw_server_auth_data_t *params_server; /* Server-side parameters */

    uint8_t  tx_buf[MW_TX_BUFFER_SIZE]; /* TX buffer for protocol frames */
    uint16_t tx_len;                   /* Length of TX buffer */

    uint8_t  rx_buf[MW_RX_BUFFER_SIZE]; /* RX buffer for protocol frames */
    uint16_t rx_len;                   /* Length of RX buffer */

    uint32_t start_time_ms;             /* Operation start time (ms) */
    uint32_t timeout_ms;                /* Operation timeout (ms) */

} mw_ctx_t;

/* Global middleware execution context (single operation at a time) */
static mw_ctx_t mw_ctx;

/* Protocol framing context */
static sgr_proto2_ctx_t proto_ctx;

/* Last received protocol response */
static rx_response_t rx;

static uint8_t  mw_device_id_raw[32];      /* raw bytes del chip    */
static char     mw_device_id_hex[65];      /* HEX string + null terminator */

/* ===================== Private Prototypes ===================== */
static void MW_Get_CW_From_Server(void);
static void MW_Reply_RW_To_Server(void);

static void MW_Reply_RW_To_Token(void);
static void MW_Get_CW_From_Token(void);

static void MW_Authentication_Result_Cloud(void);

static uint32_t mw_get_time_ms(void);

/* ===================== PUBLICA API ===================== */
sgr_mw_status_t sgr_mw_init(void){

    mw_ctx.state      = MW_STATE_IDLE;
    mw_ctx.current_op = SGR_MW_OP_NONE;
    mw_ctx.result     = SGR_MW_OK;
    mw_ctx.params     = NULL;

    /* Read Device ID from chip */
    if (crypto_get_id(mw_device_id_raw, sizeof(mw_device_id_raw)) != SGR_CRYPTO_OK)
    {
        return SGR_MW_ERROR;
    }

    /* Convert to HEX string immediately */
    if (bytes_to_hex(mw_device_id_raw, sizeof(mw_device_id_raw), mw_device_id_hex, sizeof(mw_device_id_hex)) != 0)
    {
        return SGR_MW_ERROR;
    }

    return SGR_MW_OK;
}

sgr_mw_status_t sgr_mw_start_operation(sgr_mw_operation_t op, sdk_sgr_param_t *params, sgr_mw_server_auth_data_t *params_server){

    sgr_mw_status_t my_status_op = SGR_MW_ERROR;

    if (mw_ctx.state != MW_STATE_IDLE)
        return SGR_MW_BUSY;

    if (params == NULL)
        return SGR_MW_INVALID_PARAM;

    /* ===== RESET CONTEXT (CRITICAL) ===== */
    memset(&proto_ctx, 0, sizeof(proto_ctx));
    mw_ctx.rx_len = 0;

    mw_ctx.current_op    = op;
    mw_ctx.params        = params;
    mw_ctx.params_server = params_server;
    mw_ctx.state         = MW_STATE_INIT;
    mw_ctx.result        = SGR_MW_ERROR;
    mw_ctx.tx_len        = 0;
    mw_ctx.rx_len        = 0;
    mw_ctx.start_time_ms = mw_get_time_ms();
    mw_ctx.timeout_ms    = MW_TIMEOUT_MS;


    //Initialize Communication 
    if (comm_init(mw_device_id_hex)!= COMM_OK){
        return SGR_MW_COMM_ERROR;
    }

    return SGR_MW_OK;
}

sgr_mw_status_t sgr_mw_process(void){

    if (mw_ctx.state == MW_STATE_IDLE)
        return SGR_MW_OK;

    switch (mw_ctx.current_op)
    {
        //memset(mw_ctx.rx_buf, 0, sizeof(mw_ctx.rx_buf));
        //mw_ctx.rx_len = 0;

        case SGR_MW_OP_GET_CW:
            MW_Get_CW_From_Server();
            break;
        case SGR_MW_OP_REPLY_RW:
            MW_Reply_RW_To_Server();
            break;
        case SGR_MW_OP_SERVER_GET_CW:
            MW_Get_CW_From_Token();
            break;
        case SGR_MW_OP_SERVER_GET_RW:
            MW_Reply_RW_To_Token();
            break;
        case SGR_MW_OP_AUTH_RESULT_CLOUD:
            MW_Authentication_Result_Cloud();   
            break;
        default:
            mw_ctx.state  = MW_STATE_ERROR;
            mw_ctx.result = SGR_MW_ERROR;
            break;
    }

    return SGR_MW_OK;
}

bool sgr_mw_is_done(void){
    return (mw_ctx.state == MW_STATE_DONE || mw_ctx.state == MW_STATE_ERROR);
}

sgr_mw_status_t sgr_mw_get_result(void){

    sgr_mw_status_t res = mw_ctx.result;

    mw_ctx.state      = MW_STATE_IDLE;
    mw_ctx.current_op = SGR_MW_OP_NONE;
    mw_ctx.params     = NULL;

    //mw_ctx.params        = NULL;
    mw_ctx.params_server = NULL;
    mw_ctx.tx_len        = 0;
    mw_ctx.rx_len        = 0;

    /* Close communication service */
    if (comm_close() != COMM_OK)
    {
        return SGR_MW_ERROR;
    }

    return res;
}

/* ===================== All the processes for Token to Server ===================== */
/*
 * Handle the middleware flow to request a Challenge Word (CW) from the server.
 *
 * This function implements a finite state machine that:
 *  - Reads the device identifier from the crypto chip.
 *  - Converts the identifier to hexadecimal and computes its CRC.
 *  - Builds and sends a "GET CW" protocol frame to the server.
 *  - Receives and parses the server response.
 *  - Extracts and validates the CW and transaction ID using CRC checks.
 *
 * On success, the CW and transaction ID are stored in the middleware
 * parameters and the operation is marked as completed.
 */

static void MW_Get_CW_From_Server(void){
    switch (mw_ctx.state)
    {
        case MW_STATE_INIT:
        {
            MW_LOG("▶ Getting Device ID...");

            /* =========================================================
             * 1. Read PCCID (32 binary bytes)
             * ========================================================= */
            if (crypto_get_id(mw_ctx.params->id, sizeof(mw_ctx.params->id)) != SGR_CRYPTO_OK)
            {
                MW_LOG("✖ Error reading Device ID");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("✔ Device ID read successfully");

            /* =========================================================
             * 2. Split PCC / ID and convert to HEX
             * ========================================================= */

            if (bytes_to_hex(&mw_ctx.params->id[0], 32, proto_ctx.tid_hex, sizeof(proto_ctx.tid_hex)) != 0){
                MW_LOG("✖ Error converting ID to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("ID (HEX): %s", proto_ctx.tid_hex);

            /* =========================================================
             * 2.1 Calculate CRC-CCITT for TID (HEX string)
             * ========================================================= */

            /* CRC library must be initialized once (can be moved to init) */
            crcInit();

            uint16_t crc = crcFast((unsigned char *)proto_ctx.tid_hex, strlen(proto_ctx.tid_hex));

            uint8_t crc_bytes[2];

            /* MSB first (CRC-CCITT) */
            crc_bytes[0] = (uint8_t)((crc >> 8) & 0xFF);
            crc_bytes[1] = (uint8_t)(crc & 0xFF);

            if (bytes_to_hex(crc_bytes, sizeof(crc_bytes), proto_ctx.tid_crc, sizeof(proto_ctx.tid_crc)) != 0)
            {
                MW_LOG("✖ Error converting CRC to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("TID CRC: %s", proto_ctx.tid_crc);           

            /* =========================================================
             * 3. Build GET CW JSON
             * ========================================================= */

            MW_LOG("▶ Building GET CW request");

            int len = Frame_Get_CW_From_Server((char *)mw_ctx.tx_buf, sizeof(mw_ctx.tx_buf), &proto_ctx);

            if (len < 0)
            {
                MW_LOG("✖ Error building GET CW request");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("▶ TX → Server (%d bytes)", len);
            MW_LOG_RAW("%s\n", mw_ctx.tx_buf);

            mw_ctx.tx_len = (uint16_t)len;
            mw_ctx.state  = MW_STATE_SEND;
            break;
        }

        case MW_STATE_SEND:
        {
            if (comm_send(mw_ctx.tx_buf, mw_ctx.tx_len) == COMM_OK)
            {
                MW_LOG("✔ Request sent to server");
                mw_ctx.state = MW_STATE_WAIT_RX;
            }
            break;
        }

        case MW_STATE_WAIT_RX:
        {
            if (comm_receive(mw_ctx.rx_buf, sizeof(mw_ctx.rx_buf), &mw_ctx.rx_len) == COMM_OK && mw_ctx.rx_len > 0)
            {
                MW_LOG("◀ RX ← Server (%d bytes)", mw_ctx.rx_len);

                /* Ensure null-terminated buffer for parsing */
                mw_ctx.rx_buf[mw_ctx.rx_len] = '\0';
                mw_ctx.state = MW_STATE_PARSE;
            }
            break;
        }

        case MW_STATE_PARSE:
        {
            MW_LOG_RAW("%s\n", mw_ctx.rx_buf);

            int ret = RX_Get_Response((char *)mw_ctx.rx_buf, '0', &rx); /* type esperado: GET CW */

            if (ret != 0)
            {
                MW_LOG("✖ RX parse error");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_COMM_ERROR;
                break;
            }

            /* =====================================================
            *  STATUS MANAGEMENT
            * ===================================================== */
            if (rx.status_code != 0)
            {
                //MW_LOG("✖ Server error: %s", rx.result);
                MW_LOG("Rx Error (code = %i)",rx.status_code);
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_SERVER_ERROR;
                break;
            }

            /* =====================================================
            *  Get CW + Validate CRC
            * ===================================================== */
            char cw_hex[65];

            ret = RX_Extract_And_Check_Field(&rx,"CW", cw_hex, sizeof(cw_hex));

            if (ret != 0)
            {
                MW_LOG("✖ CW CRC invalid");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_COMM_ERROR;
                break;
            }

            if (hex_to_bytes(cw_hex, mw_ctx.params->cw, 32) != 0)
            {
                MW_LOG("✖ Error converting CW");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_COMM_ERROR;
                break;
            }

            /* =====================================================
            *  Extract transactionId + Validate CRC
            * ===================================================== */
            char transaction_id[37];

            ret = RX_Extract_And_Check_Field(
                    &rx,
                    "transactionId",
                    transaction_id,
                    sizeof(transaction_id));

            if (ret != 0)
            {
                MW_LOG("✖ transactionId CRC invalid");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_COMM_ERROR;
                break;
            }

            strncpy(mw_ctx.params->transaction_id, transaction_id, sizeof(mw_ctx.params->transaction_id));
            mw_ctx.params->transaction_id[sizeof(mw_ctx.params->transaction_id) - 1] = '\0';

            MW_LOG("✔ CW received successfully");
            MW_LOG("Transaction ID: %s", mw_ctx.params->transaction_id);

            mw_ctx.state  = MW_STATE_DONE;
            mw_ctx.result = SGR_MW_OK;
            break;
        }

        default:
            break;
    }
}

/*
 * Handle the middleware flow to reply with the Response Word (RW) to the server.
 *
 * This function:
 *  - Computes the RW from the previously received CW using the crypto chip.
 *  - Converts TID, CW, RW and transaction ID to hexadecimal.
 *  - Computes CRC-CCITT for all payload fields.
 *  - Builds and sends a "REPLY RW" protocol frame to the server.
 *  - Waits for and parses the server response.
 *  - Validates the returned transaction ID and server status.
 *
 * A successful execution confirms that the server accepted the RW.
 */

static void MW_Reply_RW_To_Server(void){
    
    switch (mw_ctx.state)
    {
        case MW_STATE_INIT:
        {
            MW_LOG("▶ Computing RW from CW");

            /* =========================================================
             * 1. Compute RW from token
             * ========================================================= */
            if (crypto_get_rw(
                    mw_ctx.params->cw,
                    sizeof(mw_ctx.params->cw),
                    mw_ctx.params->rw,
                    sizeof(mw_ctx.params->rw)) != SGR_CRYPTO_OK)
            {
                MW_LOG("✖ Error computing RW");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_TOKEN_ERROR;
                break;
            }

            MW_LOG("✔ RW computed successfully");

            /* =========================================================
             * 2. Convert TID/CW/RW/TransactionID to HEX
             * ========================================================= */
            if (bytes_to_hex(&mw_ctx.params->id[0], 32, proto_ctx.tid_hex, sizeof(proto_ctx.tid_hex)) != 0)
            {
                MW_LOG("✖ Error converting TID to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            /* CW = 32 bytes */
            if (bytes_to_hex(mw_ctx.params->cw, 32, proto_ctx.cw_hex, sizeof(proto_ctx.cw_hex)) != 0)
            {
                MW_LOG("✖ Error converting CW to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            /* RW = 16 bytes */
            if (bytes_to_hex(mw_ctx.params->rw, 16, proto_ctx.rw_hex, sizeof(proto_ctx.rw_hex)) != 0)
            {
                MW_LOG("✖ Error converting RW to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;                
            }

            MW_LOG("TID (HEX): %s", proto_ctx.tid_hex);
            MW_LOG("CW  (HEX): %s", proto_ctx.cw_hex);
            MW_LOG("RW  (HEX): %s", proto_ctx.rw_hex);

            /* Transaction ID */
            memcpy(proto_ctx.transaction_id, mw_ctx.params->transaction_id, 37);
            MW_LOG("Transaction ID: %s", proto_ctx.transaction_id);


            /* =========================================================
            * 2.1 Calculate CRC-CCITT for payload fields (HEX strings)
            * ========================================================= */
            crcInit();

            /* --- TID CRC --- */
            {
                uint16_t crc = crcFast((unsigned char *)proto_ctx.tid_hex,
                                    strlen(proto_ctx.tid_hex));
                uint8_t crc_bytes[2] = {
                    (uint8_t)((crc >> 8) & 0xFF),
                    (uint8_t)(crc & 0xFF)
                };
                bytes_to_hex(crc_bytes, 2,
                            proto_ctx.tid_crc,
                            sizeof(proto_ctx.tid_crc));
            }

            /* --- CW CRC --- */
            {
                uint16_t crc = crcFast((unsigned char *)proto_ctx.cw_hex,
                                    strlen(proto_ctx.cw_hex));
                uint8_t crc_bytes[2] = {
                    (uint8_t)((crc >> 8) & 0xFF),
                    (uint8_t)(crc & 0xFF)
                };
                bytes_to_hex(crc_bytes, 2,
                            proto_ctx.cw_crc,
                            sizeof(proto_ctx.cw_crc));
            }

            /* --- RW CRC --- */
            {
                uint16_t crc = crcFast((unsigned char *)proto_ctx.rw_hex,
                                    strlen(proto_ctx.rw_hex));
                uint8_t crc_bytes[2] = {
                    (uint8_t)((crc >> 8) & 0xFF),
                    (uint8_t)(crc & 0xFF)
                    //(uint8_t)(crc & 0xAB)
                };
                bytes_to_hex(crc_bytes, 2,
                            proto_ctx.rw_crc,
                            sizeof(proto_ctx.rw_crc));
            }

            /* --- Transaction ID CRC --- */
            {
                uint16_t crc = crcFast((unsigned char *)proto_ctx.transaction_id,
                                    strlen(proto_ctx.transaction_id));
                uint8_t crc_bytes[2] = {
                    (uint8_t)((crc >> 8) & 0xFF),
                    (uint8_t)(crc & 0xFF)
                };
                bytes_to_hex(crc_bytes, 2,
                            proto_ctx.transaction_id_crc,
                            sizeof(proto_ctx.transaction_id_crc));
            }

            /* =========================================================
             * 3. Build REPLY RW JSON
             * ========================================================= */
            MW_LOG("▶ Building REPLY RW request");

            int len = Frame_Reply_RW_To_Server((char *)mw_ctx.tx_buf, sizeof(mw_ctx.tx_buf), &proto_ctx);

            if (len < 0)
            {
                MW_LOG("✖ Error building REPLY RW request");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("▶ TX → Server (%d bytes)", len);
            MW_LOG_RAW("%s\n", mw_ctx.tx_buf);

            mw_ctx.tx_len = (uint16_t)len;
            mw_ctx.state  = MW_STATE_SEND;
            break;
        }

        case MW_STATE_SEND:
        {
            if (comm_send(mw_ctx.tx_buf, mw_ctx.tx_len) == COMM_OK)
            {
                MW_LOG("✔ REPLY RW sent to server");
                mw_ctx.state = MW_STATE_WAIT_RX;
            }
            break;
        }

        case MW_STATE_WAIT_RX:
        {
            if (comm_receive(mw_ctx.rx_buf, sizeof(mw_ctx.rx_buf), &mw_ctx.rx_len) == COMM_OK && mw_ctx.rx_len > 0)
            {
                MW_LOG("◀ RX ← Server (%d bytes)", mw_ctx.rx_len);

                /* Ensure null-terminated buffer for parsing */
                mw_ctx.rx_buf[mw_ctx.rx_len] = '\0';
                mw_ctx.state = MW_STATE_PARSE;
            }
            break;
        }

        case MW_STATE_PARSE:
        {
            MW_LOG_RAW("%s\n", mw_ctx.rx_buf);

            /* RX_Get_Response */
            //int ret = RX_Get_Response((char *)mw_ctx.rx_buf, '1', &rx); /* type esperado: REPLY RW */
            int ret = RX_Get_Response((char *)mw_ctx.rx_buf,'1', &rx);    /* expected type: AUTH RESULT */

            if (ret != 0)
            {
                MW_LOG("✖ RX parse error");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_COMM_ERROR;
                break;
            }

            /* status */
            if (rx.status_code != 0)
            {
                //MW_LOG("✖ Server error: %s", rx.result);
                MW_LOG("Rx Error (code = %i)",rx.status_code);
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_SERVER_ERROR;
                break;
            }

            /* transactionId + CRC */
            /*char transaction_id[37];

            ret = RX_Extract_And_Check_Field(&rx, "transactionId", transaction_id, sizeof(transaction_id));

            if (ret != 0)
            {
                MW_LOG("✖ transactionId CRC invalid");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_COMM_ERROR;
                break;
            }

            strncpy(mw_ctx.params->transaction_id, transaction_id, sizeof(mw_ctx.params->transaction_id));
            mw_ctx.params->transaction_id[sizeof(mw_ctx.params->transaction_id) - 1] = '\0';

            MW_LOG("✔ RW accepted by server");
            MW_LOG("Transaction ID: %s", mw_ctx.params->transaction_id);

            mw_ctx.state  = MW_STATE_DONE;
            mw_ctx.result = SGR_MW_OK;*/

            /* 3️⃣ Read payload.status (NO CRC) */
            if (strstr(rx.payload, "\"auth_status\":\"AUTH_OK\"") != NULL)
            {
                MW_LOG("✔ Authentication SUCCESS");
                mw_ctx.state  = MW_STATE_DONE;
                mw_ctx.result = SGR_MW_OK;
            }
            else
            {
                MW_LOG("✖ Authentication FAILED");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_AUTH_FAILED;
            }

            break;
        }

        default:
            break;
    }
}

/* ===================== All the processes for Server to Token ===================== */
/*
 * Generate a Challenge Word (CW) on the token side for server-initiated flows.
 *
 * This function:
 *  - Validates the middleware context.
 *  - Derives a CW from the previously computed RW.
 *  - Stores the generated CW in the server authentication parameters.
 *
 * No communication with the server is performed in this flow.
 */
static void MW_Get_CW_From_Token(void){

    switch (mw_ctx.state)
    {
        case MW_STATE_INIT:
        {
            MW_LOG("▶ Generating CW with TOken");

            /* =========================================================
             * 1. Validar contexto
             * ========================================================= */
            if (mw_ctx.params == NULL)
            {
                MW_LOG("✖ Invalid parameters (mw_ctx.params == NULL)");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_INVALID_PARAM;
                break;
            }

            /* =========================================================
             * 2. Construir CW a partir del RW ya calculado
             * ========================================================= */
            //MW_LOG("RW source (HEX):");

            memcpy(&mw_ctx.params_server->cw[0],  &mw_ctx.params->rw[0], 16);
            memcpy(&mw_ctx.params_server->cw[16], &mw_ctx.params->rw[0], 16);

            MW_LOG_RAW("CW generated (HEX):");

            for (int i = 0; i < 32; i++)
            {
                MW_LOG_RAW("%02X", mw_ctx.params_server->cw[i]);
            }
            MW_LOG_RAW("\n");

            /* =========================================================
             * 3. Finalizar proceso
             * ========================================================= */
            MW_LOG("✔ CW successfully generated from RW");

            mw_ctx.state  = MW_STATE_DONE;
            mw_ctx.result = SGR_MW_OK;
            break;
        }

        default:
            break;
    }
}

/*
 * Handle the middleware flow to verify a Response Word (RW) between
 * the server and the token.
 *
 * This function:
 *  - Builds and sends a "GET RW" request to the server.
 *  - Receives and parses the server response.
 *  - Computes the RW locally using the crypto chip.
 *  - Extracts and validates the RW received from the server.
 *  - Compares the server RW with the locally computed RW.
 *
 * The authentication status is set based on the RW comparison result.
 */

static void MW_Reply_RW_To_Token(void)
{
    switch (mw_ctx.state)
    {
        /* =========================================================
         * INIT: Send CW to server
         * ========================================================= */
        case MW_STATE_INIT:
        {
            MW_LOG("▶ Preparing RW verification (Token ↔ Server)");

            if (bytes_to_hex(&mw_ctx.params->id[0], 32, proto_ctx.tid_hex, sizeof(proto_ctx.tid_hex)) != 0){
                MW_LOG("✖ Error converting TID to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            if (bytes_to_hex(mw_ctx.params_server->cw, 32, proto_ctx.cw_hex, sizeof(proto_ctx.cw_hex)) != 0){
                MW_LOG("✖ Error converting CW to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;    
            }

            MW_LOG("TID (HEX): %s", proto_ctx.tid_hex);
            MW_LOG("CW  (HEX): %s", proto_ctx.cw_hex);

            strncpy(proto_ctx.transaction_id,
                    mw_ctx.params->transaction_id,
                    sizeof(proto_ctx.transaction_id) - 1);
            proto_ctx.transaction_id[sizeof(proto_ctx.transaction_id) - 1] = '\0';

            MW_LOG("Transaction ID: %s", proto_ctx.transaction_id);

            /* =========================================================
            * Calculate CRC-CCITT for Get RW payload fields
            * ========================================================= */

            /* CRC init (can be done once globally if you want) */
            crcInit();

            /* -------- TID CRC -------- */
            {
                uint16_t crc = crcFast((unsigned char *)proto_ctx.tid_hex, strlen(proto_ctx.tid_hex));

                uint8_t crc_bytes[2];
                crc_bytes[0] = (uint8_t)((crc >> 8) & 0xFF);
                crc_bytes[1] = (uint8_t)(crc & 0xFF);

                if (bytes_to_hex(crc_bytes, sizeof(crc_bytes),proto_ctx.tid_crc, sizeof(proto_ctx.tid_crc)) != 0)
                {
                    MW_LOG("✖ Error converting TID CRC to HEX");
                    mw_ctx.state  = MW_STATE_ERROR;
                    mw_ctx.result = SGR_MW_ERROR;
                    break;
                }

                MW_LOG("TID CRC: %s", proto_ctx.tid_crc);
            }

            /* -------- CW CRC -------- */
            {
                uint16_t crc = crcFast((unsigned char *)proto_ctx.cw_hex,
                                    strlen(proto_ctx.cw_hex));

                uint8_t crc_bytes[2];
                crc_bytes[0] = (uint8_t)((crc >> 8) & 0xFF);
                crc_bytes[1] = (uint8_t)(crc & 0xFF);

                if (bytes_to_hex(crc_bytes, sizeof(crc_bytes),
                                proto_ctx.cw_crc,
                                sizeof(proto_ctx.cw_crc)) != 0)
                {
                    MW_LOG("✖ Error converting CW CRC to HEX");
                    mw_ctx.state  = MW_STATE_ERROR;
                    mw_ctx.result = SGR_MW_ERROR;
                    break;
                }

                MW_LOG("CW CRC: %s", proto_ctx.cw_crc);
            }

            /* -------- Transaction ID CRC -------- */
            {
                uint16_t crc = crcFast((unsigned char *)proto_ctx.transaction_id,
                                    strlen(proto_ctx.transaction_id));

                uint8_t crc_bytes[2];
                crc_bytes[0] = (uint8_t)((crc >> 8) & 0xFF);
                crc_bytes[1] = (uint8_t)(crc & 0xFF);

                if (bytes_to_hex(crc_bytes, sizeof(crc_bytes),
                                proto_ctx.transaction_id_crc,
                                sizeof(proto_ctx.transaction_id_crc)) != 0)
                {
                    MW_LOG("✖ Error converting Transaction ID CRC to HEX");
                    mw_ctx.state  = MW_STATE_ERROR;
                    mw_ctx.result = SGR_MW_ERROR;
                    break;
                }

                MW_LOG("Transaction ID CRC: %s", proto_ctx.transaction_id_crc);
            }


            MW_LOG("▶ Requesting RW from server");

            int len = Frame_Get_RW_From_Server(
                (char *)mw_ctx.tx_buf,
                sizeof(mw_ctx.tx_buf),
                &proto_ctx
            );

            if (len < 0)
            {
                MW_LOG("✖ Error building Get RW request");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("▶ Token → Server (%d bytes)", len);
            MW_LOG("%s\n", mw_ctx.tx_buf);

            mw_ctx.tx_len = (uint16_t)len;
            mw_ctx.state  = MW_STATE_SEND;
            break;
        }

        /* =========================================================
         * SEND
         * ========================================================= */
        case MW_STATE_SEND:
        {
            if (comm_send(mw_ctx.tx_buf, mw_ctx.tx_len) == COMM_OK)
            {
                //MW_LOG("✔ Request sent to server");
                mw_ctx.state = MW_STATE_WAIT_RX;
            }
            break;
        }

        /* =========================================================
         * WAIT RESPONSE
         * ========================================================= */
        case MW_STATE_WAIT_RX:
        {
            if (comm_receive(mw_ctx.rx_buf, sizeof(mw_ctx.rx_buf), &mw_ctx.rx_len) == COMM_OK && mw_ctx.rx_len > 0)
            {
                MW_LOG("◀ TOken ← Server (%d bytes)", mw_ctx.rx_len);

                mw_ctx.rx_buf[mw_ctx.rx_len] = '\0';
                mw_ctx.state = MW_STATE_PARSE;
            }
            break;
        }

        /* =========================================================
         * PARSE + VERIFY
         * ========================================================= */
        case MW_STATE_PARSE:
        {
            MW_LOG_RAW("%s\n", mw_ctx.rx_buf);
            
            MW_LOG("▶ Computing RW on token (chip)");

            /* -------- Compute RW on chip -------- */
            if (crypto_get_rw(mw_ctx.params_server->cw,
                              sizeof(mw_ctx.params_server->cw),
                              mw_ctx.params_server->rw_chip,
                              sizeof(mw_ctx.params_server->rw_chip)) != SGR_CRYPTO_OK)
            {
                MW_LOG("✖ Error computing RW on token");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_TOKEN_ERROR;
                break;
            }

            MW_LOG_RAW("RW computed on token:");

            for (size_t  i = 0; i < sizeof(mw_ctx.params_server->rw_chip); i++)
            {
                MW_LOG_RAW("%02X", mw_ctx.params_server->rw_chip[i]);
            }
            MW_LOG_RAW("\n");

             /* ================= New Parse ================= */
            int ret = RX_Get_Response((char *)mw_ctx.rx_buf, '2', &rx);   /* Expected type: GET RW */

            if (ret != 0)
            {
                MW_LOG("✖ RX parse error");
                mw_ctx.params->auth_status_2 = 0;
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_COMM_ERROR;
                break;
            }

            /* 2️⃣ Status root */
            if (rx.status_code != 0)
            {
                //MW_LOG("✖ Server error: %s", rx.result);

                MW_LOG("Rx Error (code = %i)",rx.status_code);
                mw_ctx.params->auth_status_2 = 0;
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_SERVER_ERROR;
                break;
            }

            char rw_hex[33];

            ret = RX_Extract_And_Check_Field(&rx,"RW", rw_hex, sizeof(rw_hex));

            if (ret != 0)
            {
                MW_LOG("✖ RW CRC invalid");
                mw_ctx.params->auth_status_2 = 0;
                //mw_ctx.state  = MW_STATE_DONE;
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_SERVER_ERROR;
                //mw_ctx.result = SGR_MW_OK;
                break;
            }

            if (hex_to_bytes(rw_hex, mw_ctx.params_server->rw, 16) != 0)
            {
                MW_LOG("✖ Error converting RW HEX");
                mw_ctx.params->auth_status_2 = 0;
                //mw_ctx.state  = MW_STATE_DONE;
                //mw_ctx.result = SGR_MW_OK;
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_SERVER_ERROR;

                break;
            }

            MW_LOG_RAW("RW received from server:");
            for (size_t  i = 0; i < sizeof(mw_ctx.params_server->rw); i++)
            {
                MW_LOG_RAW("%02X", mw_ctx.params_server->rw[i]);
            }
            MW_LOG_RAW("\n");

            /* -------- Compare RW -------- */
            if (memcmp(mw_ctx.params_server->rw, mw_ctx.params_server->rw_chip, sizeof(mw_ctx.params_server->rw)) != 0)
            {
                MW_LOG("✖ RW mismatch (AUTH FAILED)");
                mw_ctx.params->auth_status_2 = 0;
                                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_SERVER_ERROR;
            }
            else
            {
                MW_LOG("✔ RW match (AUTH OK)");
                mw_ctx.params->auth_status_2 = 1;
                mw_ctx.state  = MW_STATE_DONE;
                mw_ctx.result = SGR_MW_OK;  
            }


            break;
        }

        default:
            break;
    }
}

/*
 * Send the final authentication result to the cloud.
 *
 * This function:
 *  - Prepares the authentication result using the token identifier,
 *    transaction ID and authentication status.
 *  - Builds the corresponding protocol frame.
 *  - Sends the authentication result to the cloud.
 *
 * This is the final step of the cloud authentication flow.
 */

static void MW_Authentication_Result_Cloud(void)
{
    switch (mw_ctx.state)
    {
        case MW_STATE_INIT:
        {
            MW_LOG("▶ Preparing Authentication Result for Cloud");

            /* -------------------------------------------------
             * Convert TID to hex
             * ------------------------------------------------- */
            if (bytes_to_hex(mw_ctx.params->id, 32, proto_ctx.tid_hex, sizeof(proto_ctx.tid_hex)) != 0)
            {
                MW_LOG("✖ Error converting TID to HEX");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("TID (HEX): %s", proto_ctx.tid_hex);

            /* -------------------------------------------------
             * Copy transaction ID
             * ------------------------------------------------- */
            strncpy(proto_ctx.transaction_id,
                    mw_ctx.params->transaction_id,
                    sizeof(proto_ctx.transaction_id) - 1);

            proto_ctx.transaction_id[sizeof(proto_ctx.transaction_id) - 1] = '\0';

            MW_LOG("Transaction ID: %s", proto_ctx.transaction_id);

            /* -------------------------------------------------
             * Set authentication status
             * ------------------------------------------------- */
            proto_ctx.auth_status2 = mw_ctx.params->auth_status_2;
            /* CLOUD_AUTH_OK / CLOUD_AUTH_NOK */

            MW_LOG("Authentication status: %s",
                   proto_ctx.auth_status2 ? "CLOUD_AUTH_OK" : "CLOUD_AUTH_NOK");

            /* -------------------------------------------------
             * Build frame (type = 4)
             * ------------------------------------------------- */
            MW_LOG("▶ Building Authentication Result frame");

            int len = Frame_Reply_Status_Authentication(
                (char *)mw_ctx.tx_buf,
                sizeof(mw_ctx.tx_buf),
                &proto_ctx
            );

            if (len < 0)
            {
                MW_LOG("✖ Error building Authentication Result frame");
                mw_ctx.state  = MW_STATE_ERROR;
                mw_ctx.result = SGR_MW_ERROR;
                break;
            }

            MW_LOG("▶ TX → Cloud (%d bytes)", len);
            MW_LOG_RAW("%s\n", mw_ctx.tx_buf);

            mw_ctx.tx_len = (uint16_t)len;
            mw_ctx.state  = MW_STATE_SEND;
            break;
        }

        case MW_STATE_SEND:
        {
            if (comm_send(mw_ctx.tx_buf, mw_ctx.tx_len) == COMM_OK)
            {
                MW_LOG("✔ Authentication Result successfully sent to Cloud");
                mw_ctx.state  = MW_STATE_DONE;
                mw_ctx.result = SGR_MW_OK;
            }
            break;
        }

        default:
            break;
    }
}

/* Time source placeholder.
 * Currently unused on PC/Linux builds.
 * Can be replaced by a real timer on embedded targets.
 */
static uint32_t mw_get_time_ms(void)
{
    return 0;
}
