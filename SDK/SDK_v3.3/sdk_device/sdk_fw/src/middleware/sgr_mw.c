/* =============================================================================
 * sgr_mw.c
 *
 * Middleware — unified FSM for all authentication flows
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GATEWAY_MODE
 *   sgr_mw_init                          — init crypto chip (common)
 *   sgr_mw_authentication_token_to_server — GW authenticates itself (Phase 1)
 *   sgr_mw_authentication_server_to_token — GW authenticates itself (Phase 2)
 *   sgr_mw_gw_authenticate_device         — GW handles device auth request
 *
 * DEVICE_MODE
 *   sgr_mw_init                          — init crypto chip (common)
 *   sgr_mw_authenticate_via_gw           — DEVICE authenticates via GW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pattern:
 *   - Non-blocking FSM — returns SGR_MW_BUSY until done
 *   - pending_result preserved across calls, CLOSE step returns it
 *   - attempt counter preserved across memset via saved_attempt
 * ============================================================================= */

#include "sgr_mw.h"
#include "sdk_sgr_config.h"
#include "server.h"
#include "crypto.h"
#include <string.h>
#include <stdio.h>
#include "../utils/random/random.h"
#include "../utils/encoding/encoding_hex.h"
#include "../utils/bit_flip/bit_flip.h"
#include "../utils/sha256/sha256.h"

#if SDK_MODE == GATEWAY_MODE
    #include "device_service.h"
    #include "auth_db.h"
    #include "port_comm_device.h"

    typedef enum {
        GW_STEP_OPEN = 0,
        GW_STEP_RECEIVE_AUTH_REQUEST,
        GW_STEP_GENERATE_CW,
        GW_STEP_SEND_CW,
        GW_STEP_RECEIVE_RW,
        GW_STEP_VERIFY_CW,
        GW_STEP_GET_RW_SERVER_SEND,
        GW_STEP_GET_RW_SERVER_RECV,
        GW_STEP_COMPARE_RW,
        GW_STEP_ERROR_MGT_SEND,
        GW_STEP_ERROR_MGT_RECV,
        GW_STEP_ERROR_MGT_COMPARE,
        GW_STEP_SEND_RESULT,
        GW_STEP_CLOSE
    } gw_step_t;

    typedef struct {
        gw_step_t       step;
        sgr_mw_status_t pending_result;
        int             attempt;
        uint32_t        crc32;
        char            tid_hex[AUTH_DB_TID_HEX_LEN + 1];
        uint8_t         cw[32];
        uint8_t         cw_echo[32];
        uint8_t         rw_device[16];
        uint8_t         rw_server[16];
        char            transaction_id[38];
        int             cw_bit_positions[32];
        int             cw_bit_diff_count;
        uint8_t         cw_candidates[7][32];
        int             candidate_count;
        int             candidate_idx;
        server_ctx_t    srv;              /* MQTT context — one per channel */
    } gw_ctx_t;

    static port_comm_device_t   gw_port_table[MAX_DEVICES];
    static device_service_ctx_t gw_dev_ctx_table[MAX_DEVICES];
    static gw_ctx_t             gw_ctx_table[MAX_DEVICES];

#endif

/* -----------------------------------------------------------------------------
 * Debug
 * ----------------------------------------------------------------------------- */
#if MW_DEBUG
    #define MW_LOG(fmt, ...)  printf("[MW] " fmt "\n", ##__VA_ARGS__)
#else
    #define MW_LOG(...)       do {} while (0)
#endif

/* -----------------------------------------------------------------------------
 * Device ID — read once at init, shared across all FSMs
 * ----------------------------------------------------------------------------- */
static uint8_t mw_tid[32];
static bool    mw_initialized = false;

/* RW from the most recent successful sgr_mw_verify_fw — used by sgr_mw_installation */
static uint8_t mw_rw_verify[16];
static bool    mw_rw_verify_valid = false;

/* Fault-injection test harness (app layer, fault_injection/fi_device.c) may set
 * this to skip Phase 2 for options 2/3 (main-branch single-phase parity).
 * The SDK does not depend on the app header — referenced via weak extern,
 * resolves to NULL (→ default mutual-auth behavior) when no app defines it. */
extern volatile uint8_t fi_skip_phase2 __attribute__((weak));
#define FI_SKIP_PHASE2_ACTIVE  (&fi_skip_phase2 != NULL && fi_skip_phase2)



/* =============================================================================
 *
 * COMMON — sgr_mw_init
 *
 * ============================================================================= */
sgr_mw_status_t sgr_mw_init(void)
{
    sgr_mw_status_t status = SGR_MW_ERROR;

    memset(mw_tid, 0, sizeof(mw_tid));
    mw_initialized = false;

    #if SDK_MODE == GATEWAY_MODE
        for (int i = 0; i < MAX_DEVICES; i++)
        {
            char channel_id[16];
            snprintf(channel_id, sizeof(channel_id), "channel_%d", i);
            memset(&gw_port_table[i],    0, sizeof(port_comm_device_t));
            memset(&gw_dev_ctx_table[i], 0, sizeof(device_service_ctx_t));
            gw_dev_ctx_table[i].comm = &gw_port_table[i];
            if (DEVICE_Init(&gw_dev_ctx_table[i], channel_id) != DEVICE_OK)
            {
                MW_LOG("ERROR — channel_%d init failed", i);
                return SGR_MW_ERROR;
            }
        }
    #endif

    #if SDK_MODE == GATEWAY_MODE && GW_CRYPTO_ENABLED == 0
        mw_initialized = true;
        status         = SGR_MW_OK;
        MW_LOG("SDK ready (no crypto chip)");
    #else
        if (crypto_get_id(mw_tid, sizeof(mw_tid)) == SGR_CRYPTO_OK)
        {
            mw_initialized = true;
            status         = SGR_MW_OK;
            MW_LOG("SDK ready");
        }
        else
        {
            MW_LOG("ERROR — crypto chip not responding");
        }
    #endif

    return status;
}

/* =============================================================================
 *
 * GATEWAY MODE
 *
 * ============================================================================= */
#if SDK_MODE == GATEWAY_MODE

/* ─────────────────────────────────────────────────────────────────────────────
 * sgr_mw_authentication_token_to_server
 * Phase 1 — GW sends TID to server, gets CW, computes RW, replies
 * ───────────────────────────────────────────────────────────────────────────── */
typedef enum {
    T2S_STEP_OPEN = 0,
    T2S_STEP_GET_CW_SEND,
    T2S_STEP_GET_CW_RECV,
    T2S_STEP_COMPUTE_RW,
    T2S_STEP_REPLY_RW_SEND,
    T2S_STEP_REPLY_RW_RECV,
    T2S_STEP_CLOSE
} t2s_step_t;

static server_ctx_t gw_srv_ctx;   /* GW own authentication — t2s / s2t */

static struct {
    t2s_step_t      step;
    sgr_mw_status_t pending_result;
    int             attempt;
    uint8_t         cw[32];
    uint8_t         rw[16];
    uint8_t         cw_echo[32];
    char            transaction_id[38];
} t2s_ctx;

sgr_mw_status_t sgr_mw_authentication_token_to_server(void)
{
    sgr_mw_status_t status     = SGR_MW_BUSY;
    server_status_t srv_status = SERVER_ERROR;

    if (!mw_initialized)
        return SGR_MW_ERROR;

    switch (t2s_ctx.step)
    {
        case T2S_STEP_OPEN:
        {
            int saved_attempt      = t2s_ctx.attempt;
            memset(&t2s_ctx, 0, sizeof(t2s_ctx));
            t2s_ctx.attempt        = saved_attempt;
            t2s_ctx.pending_result = SGR_MW_ERROR;

            MW_LOG("────────────────────────────────────────");
            MW_LOG("PHASE 1  Token → Server");
            MW_LOG("────────────────────────────────────────");

            srv_status = SERVER_Open(&gw_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Server connection failed");
                t2s_ctx.pending_result = SGR_MW_COMM_ERROR;
                t2s_ctx.step           = T2S_STEP_CLOSE;
            }
            else
            {
                t2s_ctx.step = T2S_STEP_GET_CW_SEND;
            }
            status = SGR_MW_BUSY;
            break;
        }

        case T2S_STEP_GET_CW_SEND:
            MW_LOG("[1/4] Requesting Challenge Word from server...");
            srv_status = SERVER_GetCW_Send(&gw_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send CW request");
                t2s_ctx.pending_result = SGR_MW_COMM_ERROR;
                t2s_ctx.step           = T2S_STEP_CLOSE;
            }
            else
            {
                t2s_ctx.step = T2S_STEP_GET_CW_RECV;
            }
            status = SGR_MW_BUSY;
            break;

        case T2S_STEP_GET_CW_RECV:
            srv_status = SERVER_GetCW_Receive(&gw_srv_ctx,
                                              mw_tid,
                                              t2s_ctx.cw,
                                              t2s_ctx.transaction_id);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to receive CW (status=%d)", srv_status);
                t2s_ctx.pending_result = SGR_MW_COMM_ERROR;
                t2s_ctx.step           = T2S_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[1/4] Challenge Word received ✔");
                t2s_ctx.step = T2S_STEP_COMPUTE_RW;
                status       = SGR_MW_BUSY;
            }
            break;

        case T2S_STEP_COMPUTE_RW:
            MW_LOG("[2/4] Computing Response Word on crypto chip...");
            if (crypto_get_rw(t2s_ctx.cw,     sizeof(t2s_ctx.cw),
                              t2s_ctx.rw,      sizeof(t2s_ctx.rw),
                              t2s_ctx.cw_echo, sizeof(t2s_ctx.cw_echo)) != SGR_CRYPTO_OK)
            {
                MW_LOG("[ERROR] Crypto chip failed to compute RW");
                t2s_ctx.pending_result = SGR_MW_TOKEN_ERROR;
                t2s_ctx.step           = T2S_STEP_CLOSE;
            }
            else if (memcmp(t2s_ctx.cw_echo, t2s_ctx.cw, sizeof(t2s_ctx.cw)) != 0)
            {
                MW_LOG("[ERROR] Challenge Word echo mismatch");
                t2s_ctx.pending_result = SGR_MW_TOKEN_ERROR;
                t2s_ctx.step           = T2S_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[2/4] Response Word computed ✔");
                t2s_ctx.step = T2S_STEP_REPLY_RW_SEND;
            }
            status = SGR_MW_BUSY;
            break;

        case T2S_STEP_REPLY_RW_SEND:
            MW_LOG("[3/4] Sending Response Word to server...");
            srv_status = SERVER_ReplyRW_Send(&gw_srv_ctx,
                                             mw_tid,
                                             t2s_ctx.cw,
                                             t2s_ctx.rw,
                                             t2s_ctx.transaction_id);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send RW");
                t2s_ctx.pending_result = SGR_MW_COMM_ERROR;
                t2s_ctx.step           = T2S_STEP_CLOSE;
            }
            else
            {
                t2s_ctx.step = T2S_STEP_REPLY_RW_RECV;
            }
            status = SGR_MW_BUSY;
            break;

        case T2S_STEP_REPLY_RW_RECV:
            srv_status = SERVER_ReplyRW_Receive(&gw_srv_ctx, mw_tid);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status == SERVER_AUTH_FAILED)
            {
                MW_LOG("[4/4] Server rejected token — AUTH FAILED ✖");
                t2s_ctx.pending_result = SGR_MW_AUTH_FAILED;
                t2s_ctx.step           = T2S_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to receive auth result (status=%d)", srv_status);
                t2s_ctx.pending_result = SGR_MW_COMM_ERROR;
                t2s_ctx.step           = T2S_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[4/4] Server validated token — AUTH OK ✔");
                t2s_ctx.pending_result = SGR_MW_OK;
                t2s_ctx.step           = T2S_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            break;

        case T2S_STEP_CLOSE:
            SERVER_Close(&gw_srv_ctx);
            if (t2s_ctx.pending_result != SGR_MW_OK && t2s_ctx.attempt < MAX_RETRIES)
            {
                t2s_ctx.attempt++;
                MW_LOG("[RETRY] Attempt %d / %d", t2s_ctx.attempt, MAX_RETRIES);
                t2s_ctx.step = T2S_STEP_OPEN;
                status       = SGR_MW_BUSY;
            }
            else
            {
                if (t2s_ctx.pending_result != SGR_MW_OK)
                    MW_LOG("[FAILED] Token→Server failed after %d attempts", t2s_ctx.attempt);
                status       = t2s_ctx.pending_result;
                t2s_ctx.step = T2S_STEP_OPEN;
            }
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * sgr_mw_authentication_server_to_token
 * Phase 2 — GW generates CW from previous RW, gets RW from server, compares
 * ───────────────────────────────────────────────────────────────────────────── */
typedef enum {
    S2T_STEP_OPEN = 0,
    S2T_STEP_BUILD_CW,
    S2T_STEP_GET_RW_SEND,
    S2T_STEP_GET_RW_RECV,
    S2T_STEP_COMPUTE_RW,
    S2T_STEP_COMPARE,
    S2T_STEP_SEND_RESULT,
    S2T_STEP_CLOSE
} s2t_step_t;

static struct {
    s2t_step_t      step;
    sgr_mw_status_t pending_result;
    int             attempt;
    uint8_t         cw[32];
    uint8_t         rw_server[16];
    uint8_t         rw_chip[16];
} s2t_ctx;

sgr_mw_status_t sgr_mw_authentication_server_to_token(void)
{
    sgr_mw_status_t status     = SGR_MW_BUSY;
    server_status_t srv_status = SERVER_ERROR;

    if (!mw_initialized)
        return SGR_MW_ERROR;

    switch (s2t_ctx.step)
    {
        case S2T_STEP_OPEN:
        {
            int saved_attempt      = s2t_ctx.attempt;
            memset(&s2t_ctx, 0, sizeof(s2t_ctx));
            s2t_ctx.attempt        = saved_attempt;
            s2t_ctx.pending_result = SGR_MW_ERROR;

            MW_LOG("────────────────────────────────────────");
            MW_LOG("PHASE 2  Server → Token");
            MW_LOG("────────────────────────────────────────");

            srv_status = SERVER_Open(&gw_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Server connection failed");
                s2t_ctx.pending_result = SGR_MW_COMM_ERROR;
                s2t_ctx.step           = S2T_STEP_CLOSE;
            }
            else
            {
                s2t_ctx.step = S2T_STEP_BUILD_CW;
            }
            status = SGR_MW_BUSY;
            break;
        }

        case S2T_STEP_BUILD_CW:
            memcpy(&s2t_ctx.cw[0],  t2s_ctx.rw, 16);
            memcpy(&s2t_ctx.cw[16], t2s_ctx.rw, 16);
            MW_LOG("[1/4] Challenge Word generated from previous RW ✔");
            s2t_ctx.step = S2T_STEP_GET_RW_SEND;
            status       = SGR_MW_BUSY;
            break;

        case S2T_STEP_GET_RW_SEND:
            MW_LOG("[2/4] Requesting Response Word from server...");
            srv_status = SERVER_GetRW_Send(&gw_srv_ctx,
                                           mw_tid,
                                           s2t_ctx.cw,
                                           t2s_ctx.transaction_id);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send RW request");
                s2t_ctx.pending_result = SGR_MW_COMM_ERROR;
                s2t_ctx.step           = S2T_STEP_CLOSE;
            }
            else
            {
                s2t_ctx.step = S2T_STEP_GET_RW_RECV;
            }
            status = SGR_MW_BUSY;
            break;

        case S2T_STEP_GET_RW_RECV:
            srv_status = SERVER_GetRW_Receive(&gw_srv_ctx, mw_tid, s2t_ctx.rw_server);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to receive RW (status=%d)", srv_status);
                s2t_ctx.pending_result = SGR_MW_COMM_ERROR;
                s2t_ctx.step           = S2T_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[2/4] Response Word received from server ✔");
                s2t_ctx.step = S2T_STEP_COMPUTE_RW;
                status       = SGR_MW_BUSY;
            }
            break;

        case S2T_STEP_COMPUTE_RW:
            MW_LOG("[3/4] Computing Response Word on crypto chip...");
            if (crypto_get_rw(s2t_ctx.cw,     sizeof(s2t_ctx.cw),
                              s2t_ctx.rw_chip, sizeof(s2t_ctx.rw_chip),
                              NULL, 0) != SGR_CRYPTO_OK)
            {
                MW_LOG("[ERROR] Crypto chip failed to compute RW");
                s2t_ctx.pending_result = SGR_MW_TOKEN_ERROR;
                s2t_ctx.step           = S2T_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[3/4] Response Word computed on chip ✔");
                s2t_ctx.step = S2T_STEP_COMPARE;
            }
            status = SGR_MW_BUSY;
            break;

        case S2T_STEP_COMPARE:
            if (memcmp(s2t_ctx.rw_server, s2t_ctx.rw_chip, 16) != 0)
            {
                MW_LOG("[4/4] Response Word mismatch — server not trusted ✖");
                s2t_ctx.pending_result = SGR_MW_AUTH_FAILED;
            }
            else
            {
                MW_LOG("[4/4] Response Word match — server identity confirmed ✔");
                s2t_ctx.pending_result = SGR_MW_OK;
            }
            s2t_ctx.step = S2T_STEP_SEND_RESULT;
            status       = SGR_MW_BUSY;
            break;

        case S2T_STEP_SEND_RESULT:
            srv_status = SERVER_Auth_Result_Send(&gw_srv_ctx,
                                                 mw_tid,
                                                 t2s_ctx.transaction_id,
                                                 s2t_ctx.pending_result == SGR_MW_OK);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send auth result");
                s2t_ctx.pending_result = SGR_MW_COMM_ERROR;
            }
            else
            {
                MW_LOG("[+] Authentication result reported to cloud");
            }
            s2t_ctx.step = S2T_STEP_CLOSE;
            status       = SGR_MW_BUSY;
            break;

        case S2T_STEP_CLOSE:
            SERVER_Close(&gw_srv_ctx);
            if (s2t_ctx.pending_result != SGR_MW_OK && s2t_ctx.attempt < MAX_RETRIES)
            {
                s2t_ctx.attempt++;
                MW_LOG("[RETRY] Attempt %d / %d", s2t_ctx.attempt, MAX_RETRIES);
                s2t_ctx.step = S2T_STEP_OPEN;
                status       = SGR_MW_BUSY;
            }
            else
            {
                if (s2t_ctx.pending_result != SGR_MW_OK)
                    MW_LOG("[FAILED] Server→Token failed after %d attempts", s2t_ctx.attempt);
                status       = s2t_ctx.pending_result;
                s2t_ctx.step = S2T_STEP_OPEN;
            }
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

/* =============================================================================
 * GW FSM — sgr_mw_gw_authenticate_device
 * ============================================================================= */

/* -----------------------------------------------------------------------------
 * build_cw_candidates
 *
 * Builds all 2^N - 1 CW candidates from CW2 (received) by flipping back
 * each combination of the differing bits — excluding CW2 itself (idx 0)
 * and CW1 original (all bits flipped back = last combination).
 * ----------------------------------------------------------------------------- */
static int build_cw_candidates(const uint8_t *cw1,
                                const uint8_t *cw2,
                                const int     *bit_positions,
                                int            bit_count,
                                uint8_t        candidates[7][32])
{
    int count = 0;
    int total = (1 << bit_count);

    for (int mask = 0; mask < total - 1; mask++)
    {
        memcpy(candidates[count], cw2, 32);
        for (int b = 0; b < bit_count; b++)
        {
            if (mask & (1 << b))
            {
                int byte_idx = bit_positions[b] / 8;
                int bit_idx  = bit_positions[b] % 8;
                candidates[count][byte_idx] ^= (uint8_t)(1 << bit_idx);
            }
        }
        count++;
        if (count >= 7) break;
    }

    (void)cw1;
    return count;
}

sgr_mw_status_t sgr_mw_gw_authenticate_device(int device_idx)
{
    sgr_mw_status_t      status     = SGR_MW_BUSY;
    device_status_t      dev_status = DEVICE_ERROR;
    server_status_t      srv_status = SERVER_ERROR;
    gw_ctx_t            *ctx        = &gw_ctx_table[device_idx];
    device_service_ctx_t *dev_ctx   = &gw_dev_ctx_table[device_idx];

    //MW_LOG("[CH%d] step=%d", device_idx, ctx->step);
    
    switch (ctx->step)
    {
        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_OPEN:
        {
            int saved_attempt   = ctx->attempt;
            memset(ctx, 0, sizeof(gw_ctx_t));
            ctx->attempt        = saved_attempt;
            ctx->pending_result = SGR_MW_ERROR;

            MW_LOG("[CH%d] ────────────────────────────────────────", device_idx);
            MW_LOG("[CH%d] GW — waiting for device auth request", device_idx);
            MW_LOG("[CH%d] ────────────────────────────────────────", device_idx);

            ctx->step = GW_STEP_RECEIVE_AUTH_REQUEST;
            status    = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_RECEIVE_AUTH_REQUEST:
            //MW_LOG("[CH%d] calling DEVICE_ReceiveAuthRequest", device_idx);
            dev_status = DEVICE_ReceiveAuthRequest(dev_ctx, &ctx->crc32);
            //MW_LOG("[CH%d] DEVICE_ReceiveAuthRequest returned %d", device_idx, dev_status);
            if (dev_status == DEVICE_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (dev_status != DEVICE_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to receive auth request (status=%d)", device_idx, dev_status);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_STEP_CLOSE;
                status              = SGR_MW_BUSY;
            }
            else
            {
                if (auth_db_resolve(ctx->crc32, ctx->tid_hex) != AUTH_DB_OK)
                {
                    MW_LOG("[CH%d][ERROR] Device not registered (CRC32=0x%08X)", device_idx, ctx->crc32);
                    ctx->pending_result = SGR_MW_ERROR;
                    ctx->step           = GW_STEP_SEND_RESULT;
                }
                else
                {
                    MW_LOG("[CH%d][1/6] Auth request received — CRC32=0x%08X ✔", device_idx, ctx->crc32);
                    ctx->step = GW_STEP_GENERATE_CW;
                }
                status = SGR_MW_BUSY;
            }
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_GENERATE_CW:
            random_bytes(ctx->cw, sizeof(ctx->cw));
            {
                auth_ctx_t *auth = auth_db_get_ctx(ctx->crc32);
                if (auth != NULL)
                {
                    memcpy(auth->cw, ctx->cw, sizeof(ctx->cw));
                    auth->state = AUTH_STATE_CW_SENT;
                }
                MW_LOG("[CH%d][2/6] Challenge Word generated ✔", device_idx);
                ctx->step = GW_STEP_SEND_CW;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_SEND_CW:
        {
            uint8_t cw_to_send[32];
            memcpy(cw_to_send, ctx->cw, 32);
            fi_apply_cw(cw_to_send, 32);

            dev_status = DEVICE_SendCW(dev_ctx, cw_to_send);
            if (dev_status != DEVICE_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to send CW to device", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[CH%d][3/6] Challenge Word sent to device ✔", device_idx);
                ctx->step = GW_STEP_RECEIVE_RW;
            }
            status = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_RECEIVE_RW:
            dev_status = DEVICE_ReceiveRW(dev_ctx, ctx->cw_echo, ctx->rw_device);

            if (dev_status == DEVICE_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (dev_status != DEVICE_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to receive RW from device (status=%d)", device_idx, dev_status);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_STEP_CLOSE;
                status              = SGR_MW_BUSY;
            }
            else
            {
                fi_apply_cw_echo(ctx->cw_echo, 32);
                fi_apply_rw(ctx->rw_device, 16);

                auth_ctx_t *auth = auth_db_get_ctx(ctx->crc32);
                if (auth != NULL)
                {
                    memcpy(auth->rw_device, ctx->rw_device, sizeof(ctx->rw_device));
                    auth->state = AUTH_STATE_RW_RECEIVED;
                }
                MW_LOG("[CH%d][4/6] CW echo + RW received from device ✔", device_idx);
                MW_LOG("[CH%d][DEBUG] RW_device: ", device_idx);
                for (int i = 0; i < 16; i++) printf("%02x", ctx->rw_device[i]);
                printf("\n");
                ctx->step = GW_STEP_VERIFY_CW;
                status    = SGR_MW_BUSY;
            }
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_VERIFY_CW:
        {
            int bit_diff = 0;
            ctx->cw_bit_diff_count = 0;

            for (int i = 0; i < (int)sizeof(ctx->cw); i++)
            {
                uint8_t diff = ctx->cw[i] ^ ctx->cw_echo[i];
                for (int b = 0; b < 8; b++)
                {
                    if (diff & (1 << b))
                    {
                        if (ctx->cw_bit_diff_count < 32)
                        {
                            ctx->cw_bit_positions[ctx->cw_bit_diff_count] = i * 8 + b;
                            ctx->cw_bit_diff_count++;
                        }
                        bit_diff++;
                    }
                }
            }

            MW_LOG("[CH%d][DEBUG] CW1 original: ", device_idx);
            for (int i = 0; i < 32; i++) printf("%02x", ctx->cw[i]);
            printf("\n");
            MW_LOG("[CH%d][DEBUG] CW2 received: ", device_idx);
            for (int i = 0; i < 32; i++) printf("%02x", ctx->cw_echo[i]);
            printf("\n");
            MW_LOG("[CH%d][DEBUG] Differing bit positions: ", device_idx);
            for (int i = 0; i < ctx->cw_bit_diff_count; i++)
                printf("%d ", ctx->cw_bit_positions[i]);
            printf("\n");

            auth_ctx_t *auth = auth_db_get_ctx(ctx->crc32);
            if (auth != NULL)
                auth->cw_bit_diff = bit_diff;

            if (bit_diff > CW_BITFLIP_THRESHOLD)
            {
                MW_LOG("[CH%d][ERROR] CW mismatch — bit diff=%d > threshold=%d — AUT_NOK",
                       device_idx, bit_diff, CW_BITFLIP_THRESHOLD);
                ctx->pending_result    = SGR_MW_AUTH_FAILED;
                ctx->cw_bit_diff_count = 0;
                ctx->step              = GW_STEP_SEND_RESULT;
            }
            else if (bit_diff > 0)
            {
                ctx->candidate_count = build_cw_candidates(
                    ctx->cw, ctx->cw_echo,
                    ctx->cw_bit_positions,
                    ctx->cw_bit_diff_count,
                    ctx->cw_candidates);

                MW_LOG("[CH%d][4/6] CW verified — bit diff=%d — %d candidates built ✔",
                       device_idx, bit_diff, ctx->candidate_count);
                ctx->step = GW_STEP_GET_RW_SERVER_SEND;
            }
            else
            {
                MW_LOG("[CH%d][4/6] CW verified — bit diff=0 ✔", device_idx);
                ctx->cw_bit_diff_count = 0;
                ctx->candidate_count   = 0;
                ctx->step              = GW_STEP_GET_RW_SERVER_SEND;
            }
            status = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_GET_RW_SERVER_SEND:
        {
            uint8_t tid_bytes[32];
            hex_to_bytes(ctx->tid_hex, tid_bytes, 32);

            srv_status = SERVER_Open(&ctx->srv, tid_bytes);
            //srv_status = SERVER_Open(&ctx->srv, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to open server connection", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_STEP_CLOSE;
            }
            else
            {
                srv_status = SERVER_GetRW_Send(&ctx->srv, tid_bytes, ctx->cw, ctx->transaction_id);
                if (srv_status != SERVER_OK)
                {
                    MW_LOG("[CH%d][ERROR] Failed to send RW request to server", device_idx);
                    ctx->pending_result = SGR_MW_COMM_ERROR;
                    ctx->step           = GW_STEP_CLOSE;
                }
                else
                {
                    MW_LOG("[CH%d][5/6] RW request sent to server ✔", device_idx);
                    ctx->step = GW_STEP_GET_RW_SERVER_RECV;
                }
            }
            status = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_GET_RW_SERVER_RECV:
        {
            uint8_t tid_bytes[32];
            hex_to_bytes(ctx->tid_hex, tid_bytes, 32);

            srv_status = SERVER_GetRW_Receive(&ctx->srv, tid_bytes, ctx->rw_server);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to receive RW from server (status=%d)", device_idx, srv_status);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_STEP_CLOSE;
                status              = SGR_MW_BUSY;
            }
            else
            {
                auth_ctx_t *auth = auth_db_get_ctx(ctx->crc32);
                if (auth != NULL)
                {
                    memcpy(auth->rw_server, ctx->rw_server, sizeof(ctx->rw_server));
                    auth->state = AUTH_STATE_SERVER_VERIFIED;
                }
                MW_LOG("[CH%d][5/6] RW received from server ✔", device_idx);
                MW_LOG("[CH%d][DEBUG] RW_server: ", device_idx);
                for (int i = 0; i < 16; i++) printf("%02x", ctx->rw_server[i]);
                printf("\n");
                ctx->step = GW_STEP_COMPARE_RW;
                status    = SGR_MW_BUSY;
            }
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_COMPARE_RW:
        {
            int bit_diff = 0;
            for (int i = 0; i < 16; i++)
            {
                uint8_t diff = ctx->rw_device[i] ^ ctx->rw_server[i];
                while (diff) { bit_diff += (diff & 1); diff >>= 1; }
            }

            MW_LOG("[CH%d][DEBUG] RW compare — device vs server — bit_diff=%d", device_idx, bit_diff);

            auth_ctx_t *auth = auth_db_get_ctx(ctx->crc32);
            if (auth != NULL)
                auth->rw_bit_diff = bit_diff;

            if (bit_diff == 0)
            {
                MW_LOG("[CH%d][6/6] RW match — bit diff=0 — AUT_OK ✔", device_idx);
                ctx->pending_result = SGR_MW_OK;
                ctx->step           = GW_STEP_SEND_RESULT;
            }
            else if (bit_diff <= RW_BITFLIP_THRESHOLD)
            {
                MW_LOG("[CH%d][6/6] RW near-match — bit diff=%d <= threshold=%d — AUT_OK ✔",
                       device_idx, bit_diff, RW_BITFLIP_THRESHOLD);
                ctx->pending_result = SGR_MW_OK;
                ctx->step           = GW_STEP_SEND_RESULT;
            }
            else
            {
                MW_LOG("[CH%d][6/6] RW mismatch — bit diff=%d > threshold=%d",
                       device_idx, bit_diff, RW_BITFLIP_THRESHOLD);

                if (ctx->cw_bit_diff_count == 0 || ctx->candidate_count == 0)
                {
                    MW_LOG("[CH%d][ERROR] No CW candidates available — AUT_NOK", device_idx);
                    ctx->pending_result = SGR_MW_AUTH_FAILED;
                    ctx->step           = GW_STEP_SEND_RESULT;
                }
                else
                {
                    MW_LOG("[CH%d][ERROR MGT] Starting Error Management — %d candidates",
                           device_idx, ctx->candidate_count);
                    ctx->candidate_idx = 0;
                    ctx->step          = GW_STEP_ERROR_MGT_SEND;
                }
            }
            status = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_ERROR_MGT_SEND:
        {
            uint8_t tid_bytes[32];
            hex_to_bytes(ctx->tid_hex, tid_bytes, 32);

            MW_LOG("[CH%d][ERROR MGT] Testing candidate %d / %d",
                   device_idx, ctx->candidate_idx + 1, ctx->candidate_count);

            SERVER_Close(&ctx->srv);

            srv_status = SERVER_Open(&ctx->srv, tid_bytes);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR MGT] Failed to open server connection", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_STEP_CLOSE;
            }
            else
            {
                srv_status = SERVER_GetRW_Send(&ctx->srv,
                                               tid_bytes,
                                               ctx->cw_candidates[ctx->candidate_idx],
                                               ctx->transaction_id);
                if (srv_status != SERVER_OK)
                {
                    MW_LOG("[CH%d][ERROR MGT] Failed to send candidate to server", device_idx);
                    ctx->pending_result = SGR_MW_COMM_ERROR;
                    ctx->step           = GW_STEP_CLOSE;
                }
                else
                {
                    ctx->step = GW_STEP_ERROR_MGT_RECV;
                }
            }
            status = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_ERROR_MGT_RECV:
        {
            uint8_t tid_bytes[32];
            hex_to_bytes(ctx->tid_hex, tid_bytes, 32);

            srv_status = SERVER_GetRW_Receive(&ctx->srv, tid_bytes, ctx->rw_server);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR MGT] Failed to receive RW from server (status=%d)", device_idx, srv_status);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_STEP_CLOSE;
                status              = SGR_MW_BUSY;
            }
            else
            {
                ctx->step = GW_STEP_ERROR_MGT_COMPARE;
                status    = SGR_MW_BUSY;
            }
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_ERROR_MGT_COMPARE:
        {
            int bit_diff = 0;
            for (int i = 0; i < 16; i++)
            {
                uint8_t diff = ctx->rw_device[i] ^ ctx->rw_server[i];
                while (diff) { bit_diff += (diff & 1); diff >>= 1; }
            }

            MW_LOG("[CH%d][ERROR MGT] ─────────────────────────────────", device_idx);
            MW_LOG("[CH%d][ERROR MGT] Candidate %d / %d", device_idx, ctx->candidate_idx + 1, ctx->candidate_count);
            MW_LOG("[CH%d][ERROR MGT] CW candidate: ", device_idx);
            for (int i = 0; i < 32; i++) printf("%02x", ctx->cw_candidates[ctx->candidate_idx][i]);
            printf("\n");
            MW_LOG("[CH%d][ERROR MGT] RW_device:    ", device_idx);
            for (int i = 0; i < 16; i++) printf("%02x", ctx->rw_device[i]);
            printf("\n");
            MW_LOG("[CH%d][ERROR MGT] RW_server:    ", device_idx);
            for (int i = 0; i < 16; i++) printf("%02x", ctx->rw_server[i]);
            printf("\n");
            MW_LOG("[CH%d][ERROR MGT] bit_diff=%d — %s", device_idx, bit_diff,
                   bit_diff <= RW_BITFLIP_THRESHOLD ? "MATCH ✔" : "no match, trying next");
            MW_LOG("[CH%d][ERROR MGT] ─────────────────────────────────", device_idx);

            if (bit_diff <= RW_BITFLIP_THRESHOLD)
            {
                MW_LOG("[CH%d][ERROR MGT] Candidate %d matched — AUT_OK ✔",
                       device_idx, ctx->candidate_idx + 1);
                ctx->pending_result = SGR_MW_OK;
                ctx->step           = GW_STEP_SEND_RESULT;
            }
            else
            {
                ctx->candidate_idx++;
                if (ctx->candidate_idx < ctx->candidate_count)
                {
                    MW_LOG("[CH%d][ERROR MGT] Candidate %d failed — trying next",
                           device_idx, ctx->candidate_idx);
                    ctx->step = GW_STEP_ERROR_MGT_SEND;
                }
                else
                {
                    MW_LOG("[CH%d][ERROR MGT] All candidates exhausted — AUT_NOK", device_idx);
                    ctx->pending_result = SGR_MW_AUTH_FAILED;
                    ctx->step           = GW_STEP_SEND_RESULT;
                }
            }
            status = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_SEND_RESULT:
        {
            bool auth_ok = (ctx->pending_result == SGR_MW_OK);

            dev_status = DEVICE_SendAuthResult(dev_ctx, auth_ok);
            if (dev_status != DEVICE_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to send auth result to device", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
            }
            else
            {
                MW_LOG("[CH%d][6/6] Auth result sent to device — %s",
                       device_idx, auth_ok ? "AUT_OK" : "AUT_NOK");
            }

            auth_ctx_t *auth = auth_db_get_ctx(ctx->crc32);
            if (auth != NULL)
            {
                auth->result = auth_ok ? AUTH_RESULT_OK : AUTH_RESULT_NOK;
                auth->state  = AUTH_STATE_DONE;
            }

            ctx->step = GW_STEP_CLOSE;
            status    = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_STEP_CLOSE:
            SERVER_Close(&ctx->srv);
            port_comm_device_close(dev_ctx->comm);

            if (ctx->pending_result != SGR_MW_OK && ctx->attempt < GW_MAX_RETRIES)
            {
                ctx->attempt++;
                MW_LOG("[CH%d][RETRY] Attempt %d / %d", device_idx, ctx->attempt, GW_MAX_RETRIES);
                ctx->step = GW_STEP_OPEN;
                status    = SGR_MW_BUSY;
            }
            else
            {
                if (ctx->pending_result != SGR_MW_OK)
                    MW_LOG("[CH%d][FAILED] GW authentication failed after %d attempts",
                           device_idx, ctx->attempt);
                status    = ctx->pending_result;
                ctx->step = GW_STEP_OPEN;
            }
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * sgr_mw_gw_receive_fw_verification
 * GW bridge: receive type "6" from device, resolve TID, forward to server
 * ───────────────────────────────────────────────────────────────────────────── */
typedef enum {
    GW_FWV_STEP_RECEIVE = 0,
    GW_FWV_STEP_SERVER_OPEN,
    GW_FWV_STEP_FORWARD,
    GW_FWV_STEP_WAIT_ACK,
    GW_FWV_STEP_FORWARD_ACK,
    GW_FWV_STEP_CLOSE
} gw_fwv_step_t;

typedef struct {
    gw_fwv_step_t   step;
    sgr_mw_status_t pending_result;
    uint32_t        crc32;
    char            tid_hex[65];
    uint8_t         tid_bytes[32];
    bool            fw_ok;
    uint8_t         fw_rw[16];   /* RW computed by device crypto chip — bridged to server */
    bool            ack_ok;
    server_ctx_t    srv;
} gw_fwv_ctx_t;

static gw_fwv_ctx_t gw_fwv_ctx_table[MAX_DEVICES];

sgr_mw_status_t sgr_mw_gw_receive_fw_verification(int device_idx)
{
    sgr_mw_status_t      status     = SGR_MW_BUSY;
    device_status_t      dev_status = DEVICE_ERROR;
    server_status_t      srv_status = SERVER_ERROR;
    gw_fwv_ctx_t        *ctx        = &gw_fwv_ctx_table[device_idx];
    device_service_ctx_t *dev_ctx   = &gw_dev_ctx_table[device_idx];

    switch (ctx->step)
    {
        /* ─────────────────────────────────────────────────────────────────── */
        case GW_FWV_STEP_RECEIVE:
        {
            memset(ctx, 0, sizeof(gw_fwv_ctx_t));
            ctx->pending_result = SGR_MW_ERROR;

            MW_LOG("[CH%d] ────────────────────────────────────────", device_idx);
            MW_LOG("[CH%d] GW — waiting for FW verification result", device_idx);
            MW_LOG("[CH%d] ────────────────────────────────────────", device_idx);

            dev_status = DEVICE_ReceiveFWVerificationResult(dev_ctx, &ctx->crc32, &ctx->fw_ok, ctx->fw_rw);

            if (dev_status == DEVICE_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (dev_status != DEVICE_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to receive FW verification result (status=%d)",
                       device_idx, dev_status);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_FWV_STEP_CLOSE;
                status              = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[CH%d][1/2] FW verification received — CRC32=0x%08X, result=%s ✔",
                       device_idx, ctx->crc32, ctx->fw_ok ? "FW_OK" : "FW_NOK");

                /* Resolve CRC32 → TID */
                if (auth_db_resolve(ctx->crc32, ctx->tid_hex) != AUTH_DB_OK)
                {
                    MW_LOG("[CH%d][ERROR] Device not registered (CRC32=0x%08X)", device_idx, ctx->crc32);
                    ctx->pending_result = SGR_MW_NOT_REGISTERED;
                    ctx->step           = GW_FWV_STEP_CLOSE;
                }
                else
                {
                    hex_to_bytes(ctx->tid_hex, ctx->tid_bytes, 32);
                    ctx->step = GW_FWV_STEP_SERVER_OPEN;
                }
                status = SGR_MW_BUSY;
            }
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_FWV_STEP_SERVER_OPEN:
            srv_status = SERVER_Open(&ctx->srv, ctx->tid_bytes);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to open server connection", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_FWV_STEP_CLOSE;
            }
            else
            {
                ctx->step = GW_FWV_STEP_FORWARD;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_FWV_STEP_FORWARD:
            MW_LOG("[CH%d][2/4] Bridging FW verification result to server...", device_idx);
            srv_status = SERVER_SendFWVerificationBridge(&ctx->srv, ctx->tid_bytes, ctx->fw_ok, ctx->fw_rw);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to bridge result to server", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_FWV_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[CH%d][2/4] FW verification bridged to server ✔", device_idx);
                ctx->step = GW_FWV_STEP_WAIT_ACK;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_FWV_STEP_WAIT_ACK:
            srv_status = SERVER_ReceiveFWVerificationACK(&ctx->srv, &ctx->ack_ok);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to receive ACK from server", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_FWV_STEP_CLOSE;
                status              = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[CH%d][3/4] ACK received from server: %s ✔", device_idx, ctx->ack_ok ? "ACK_OK" : "ACK_NOK");
                ctx->pending_result = ctx->ack_ok ? SGR_MW_OK : SGR_MW_AUTH_FAILED;
                ctx->step           = GW_FWV_STEP_FORWARD_ACK;
                status              = SGR_MW_BUSY;
            }
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_FWV_STEP_FORWARD_ACK:
        {
            device_service_ctx_t *dev_ctx_ack = &gw_dev_ctx_table[device_idx];
            device_status_t       ack_status  = DEVICE_SendFWVerificationACK(dev_ctx_ack, ctx->ack_ok);
            if (ack_status != DEVICE_OK)
                MW_LOG("[CH%d][ERROR] Failed to forward ACK to device", device_idx);
            else
                MW_LOG("[CH%d][4/4] ACK forwarded to device ✔", device_idx);
            ctx->step = GW_FWV_STEP_CLOSE;
            status    = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_FWV_STEP_CLOSE:
            SERVER_Close(&ctx->srv);
            status    = ctx->pending_result;
            ctx->step = GW_FWV_STEP_RECEIVE;
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * sgr_mw_gw_handle_installation
 * GW bridge: receive type "7" from device, resolve TID via CRC32,
 * forward to Cloud SDK, wait for result, relay back to device.
 * ───────────────────────────────────────────────────────────────────────────── */
typedef enum {
    GW_INST_STEP_RECEIVE = 0,
    GW_INST_STEP_SERVER_OPEN,
    GW_INST_STEP_FORWARD_SEND,
    GW_INST_STEP_FORWARD_RECV,
    GW_INST_STEP_REPLY,
    GW_INST_STEP_CLOSE
} gw_inst_step_t;

typedef struct {
    gw_inst_step_t  step;
    sgr_mw_status_t pending_result;
    uint32_t        crc32;
    char            tid_hex[65];
    uint8_t         tid_bytes[32];
    uint8_t         cw_install[32];
    uint8_t         rw_install[16];
    bool            install_ok;
    server_ctx_t    srv;
} gw_inst_ctx_t;

static gw_inst_ctx_t gw_inst_ctx_table[MAX_DEVICES];

sgr_mw_status_t sgr_mw_gw_handle_installation(int device_idx)
{
    sgr_mw_status_t      status     = SGR_MW_BUSY;
    device_status_t      dev_status = DEVICE_ERROR;
    server_status_t      srv_status = SERVER_ERROR;
    gw_inst_ctx_t       *ctx        = &gw_inst_ctx_table[device_idx];
    device_service_ctx_t *dev_ctx   = &gw_dev_ctx_table[device_idx];

    switch (ctx->step)
    {
        /* ─────────────────────────────────────────────────────────────────── */
        case GW_INST_STEP_RECEIVE:
        {
            memset(ctx, 0, sizeof(gw_inst_ctx_t));
            ctx->pending_result = SGR_MW_ERROR;

            MW_LOG("[CH%d] ────────────────────────────────────────", device_idx);
            MW_LOG("[CH%d] GW — Installation bridge", device_idx);

            dev_status = DEVICE_ReceiveInstallationRequest(dev_ctx, &ctx->crc32,
                                                           ctx->cw_install, ctx->rw_install);
            if (dev_status == DEVICE_NO_DATA)
            {
                status = SGR_MW_BUSY;
                break;
            }
            if (dev_status != DEVICE_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to receive installation request (status=%d)",
                       device_idx, dev_status);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_INST_STEP_CLOSE;
                status              = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[CH%d][1/4] Installation request received | CRC32=0x%08X", device_idx, ctx->crc32);
                if (auth_db_resolve(ctx->crc32, ctx->tid_hex) != AUTH_DB_OK)
                {
                    MW_LOG("[CH%d][ERROR] Device not registered (CRC32=0x%08X)", device_idx, ctx->crc32);
                    ctx->pending_result = SGR_MW_NOT_REGISTERED;
                    ctx->step           = GW_INST_STEP_CLOSE;
                }
                else
                {
                    hex_to_bytes(ctx->tid_hex, ctx->tid_bytes, 32);
                    ctx->step = GW_INST_STEP_SERVER_OPEN;
                }
                status = SGR_MW_BUSY;
            }
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_INST_STEP_SERVER_OPEN:
            srv_status = SERVER_Open(&ctx->srv, ctx->tid_bytes);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to open server connection", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_INST_STEP_CLOSE;
            }
            else
            {
                ctx->step = GW_INST_STEP_FORWARD_SEND;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_INST_STEP_FORWARD_SEND:
            MW_LOG("[CH%d][2/4] Forwarding installation request to Cloud SDK...", device_idx);
            srv_status = SERVER_SendInstallationBridge(&ctx->srv, ctx->tid_bytes,
                                                       ctx->cw_install, ctx->rw_install);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to forward installation request", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
                ctx->step           = GW_INST_STEP_CLOSE;
            }
            else
            {
                ctx->step = GW_INST_STEP_FORWARD_RECV;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_INST_STEP_FORWARD_RECV:
            MW_LOG("[CH%d][3/4] Waiting for installation result from Cloud SDK...", device_idx);
            srv_status = SERVER_ReceiveInstallationBridgeResult(&ctx->srv, &ctx->install_ok);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
                break;
            }
            if (srv_status == SERVER_OK || srv_status == SERVER_AUTH_FAILED)
            {
                MW_LOG("[CH%d][3/4] Cloud SDK result: %s", device_idx,
                       ctx->install_ok ? "INSTALL_OK" : "INSTALL_NOK");
                ctx->pending_result = ctx->install_ok ? SGR_MW_OK : SGR_MW_AUTH_FAILED;
            }
            else
            {
                MW_LOG("[CH%d][ERROR] Failed to receive Cloud SDK result (status=%d)",
                       device_idx, srv_status);
                ctx->pending_result = SGR_MW_COMM_ERROR;
            }
            ctx->step = GW_INST_STEP_REPLY;
            status    = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_INST_STEP_REPLY:
            MW_LOG("[CH%d][4/4] Relaying installation result to device...", device_idx);
            dev_status = DEVICE_SendInstallationResult(dev_ctx, ctx->install_ok);
            if (dev_status != DEVICE_OK)
            {
                MW_LOG("[CH%d][ERROR] Failed to send installation result to device", device_idx);
                ctx->pending_result = SGR_MW_COMM_ERROR;
            }
            ctx->step = GW_INST_STEP_CLOSE;
            status    = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case GW_INST_STEP_CLOSE:
            SERVER_Close(&ctx->srv);
            status    = ctx->pending_result;
            ctx->step = GW_INST_STEP_RECEIVE;
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

#endif /* SDK_MODE == GATEWAY_MODE */

/* =============================================================================
 *
 * DEVICE MODE
 *
 * ============================================================================= */
#if SDK_MODE == DEVICE_MODE

/* ─────────────────────────────────────────────────────────────────────────────
 * sgr_mw_authenticate_via_gw
 * DEVICE sends CRC32, receives CW, computes RW, sends back, gets result
 * ───────────────────────────────────────────────────────────────────────────── */
typedef enum {
    VGW_STEP_OPEN = 0,
    VGW_STEP_SEND_AUTH_REQUEST,
    VGW_STEP_RECEIVE_CW,
    VGW_STEP_COMPUTE_RW,
    VGW_STEP_SEND_RW,
    VGW_STEP_RECEIVE_RESULT,
    VGW_STEP_PHASE2_COMPUTE_HRW_TOKEN,
    VGW_STEP_PHASE2_SEND_HCW,
    VGW_STEP_PHASE2_RECEIVE_HRW,
    VGW_STEP_PHASE2_COMPARE,
    VGW_STEP_CLOSE
} vgw_step_t;

static server_ctx_t vgw_srv_ctx;   /* DEVICE own server context */

static struct {
    vgw_step_t      step;
    sgr_mw_status_t pending_result;
    int             attempt;
    uint8_t         cw[32];
    uint8_t         rw[16];
    uint8_t         cw_echo[32];
    uint8_t         hcw[32];        /* Phase 2: rw || rw                       */
    uint8_t         hrw_token[16];  /* Phase 2: HRW from local crypto chip     */
    uint8_t         hrw_cloud[16];  /* Phase 2: HRW returned by cloud via GW   */
} vgw_ctx;

sgr_mw_status_t sgr_mw_authenticate_via_gw(void)
{
    sgr_mw_status_t status     = SGR_MW_BUSY;
    server_status_t srv_status = SERVER_ERROR;

    if (!mw_initialized)
        return SGR_MW_ERROR;

    switch (vgw_ctx.step)
    {
        case VGW_STEP_OPEN:
        {
            int saved_attempt      = vgw_ctx.attempt;
            memset(&vgw_ctx, 0, sizeof(vgw_ctx));
            vgw_ctx.attempt        = saved_attempt;
            vgw_ctx.pending_result = SGR_MW_ERROR;

            MW_LOG("────────────────────────────────────────");
            MW_LOG("DEVICE — Authenticate via GW");
            MW_LOG("────────────────────────────────────────");

            srv_status = SERVER_Open(&vgw_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to connect to GW");
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
            }
            else
            {
                vgw_ctx.step = VGW_STEP_SEND_AUTH_REQUEST;
            }
            status = SGR_MW_BUSY;
            break;
        }

        case VGW_STEP_SEND_AUTH_REQUEST:
            MW_LOG("[1/4] Sending auth request to GW...");
            MW_LOG("[1/4] TID: ");
            for (int i = 0; i < 32; i++) printf("%02x", mw_tid[i]);
            printf("\n");
            srv_status = SERVER_SendAuthRequest(&vgw_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send auth request");
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[1/4] Auth request sent ✔");
                vgw_ctx.step = VGW_STEP_RECEIVE_CW;
            }
            status = SGR_MW_BUSY;
            break;

        case VGW_STEP_RECEIVE_CW:
            srv_status = SERVER_ReceiveCW(&vgw_srv_ctx, vgw_ctx.cw);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to receive CW from GW (status=%d)", srv_status);
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[2/4] Challenge Word received from GW ✔");
                for (int i = 0; i < 32; i++) printf("%02x", vgw_ctx.cw[i]);
                printf("\n");
                vgw_ctx.step = VGW_STEP_COMPUTE_RW;
                status       = SGR_MW_BUSY;
            }
            break;

        case VGW_STEP_COMPUTE_RW:
            MW_LOG("[3/4] Computing Response Word on crypto chip...");
            if (crypto_get_rw(vgw_ctx.cw,     sizeof(vgw_ctx.cw),
                              vgw_ctx.rw,      sizeof(vgw_ctx.rw),
                              vgw_ctx.cw_echo, sizeof(vgw_ctx.cw_echo)) != SGR_CRYPTO_OK)
            {
                MW_LOG("[ERROR] Crypto chip failed to compute RW");
                vgw_ctx.pending_result = SGR_MW_TOKEN_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[3/4] Response Word computed ✔");
                vgw_ctx.step = VGW_STEP_SEND_RW;
            }
            status = SGR_MW_BUSY;
            break;

        case VGW_STEP_SEND_RW:
            srv_status = SERVER_SendRW(&vgw_srv_ctx, vgw_ctx.cw_echo, vgw_ctx.rw);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send RW to GW");
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
            }
            else
            {
                //MW_LOG("[3/4] CW echo + RW sent to GW ✔");
                MW_LOG("[3/4] CW echo: ");
                for (int i = 0; i < 32; i++) printf("%02x", vgw_ctx.cw_echo[i]);
                printf("\n");
                MW_LOG("[3/4] RW: ");
                for (int i = 0; i < 16; i++) printf("%02x", vgw_ctx.rw[i]);
                printf("\n");
                vgw_ctx.step = VGW_STEP_RECEIVE_RESULT;
            }
            status = SGR_MW_BUSY;
            break;

        case VGW_STEP_RECEIVE_RESULT:
        {
            bool auth_ok = false;
            srv_status   = SERVER_ReceiveAuthResult(&vgw_srv_ctx, &auth_ok);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status == SERVER_AUTH_FAILED)
            {
                MW_LOG("[4/4] GW rejected device — AUT_NOK ✖");
                vgw_ctx.pending_result = SGR_MW_AUTH_FAILED;
                vgw_ctx.step           = VGW_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to receive auth result (status=%d)", srv_status);
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else
            {
                /* Options 2/3 (fault-injection harness) emulate the main-branch
                 * single-phase flow — finish here without entering Phase 2. */
                if (FI_SKIP_PHASE2_ACTIVE)
                {
                    MW_LOG("[4/4] GW confirmed device — AUT_OK ✔  (Phase 1 only — Phase 2 skipped by test harness)");
                    vgw_ctx.pending_result = SGR_MW_OK;
                    vgw_ctx.step           = VGW_STEP_CLOSE;
                }
                else
                {
                    MW_LOG("[4/4] GW confirmed device — AUT_OK ✔  (Phase 1 done, starting Phase 2)");
                    vgw_ctx.step = VGW_STEP_PHASE2_COMPUTE_HRW_TOKEN;
                }
                status = SGR_MW_BUSY;
            }
            break;
        }

        case VGW_STEP_PHASE2_COMPUTE_HRW_TOKEN:
            /* HCW = RW || RW (32 bytes), then crypto chip → HRW_token (16 bytes).
             * ARM crypto_get_rw picks the opcode from g_sgr_chip_variant (SGB → 0x05000800). */
            memcpy(vgw_ctx.hcw,      vgw_ctx.rw, 16);
            memcpy(vgw_ctx.hcw + 16, vgw_ctx.rw, 16);

            MW_LOG("[Phase 2 — 1/4] Computing local HRW on crypto chip (HCW = RW || RW)...");
            if (crypto_get_rw(vgw_ctx.hcw,       sizeof(vgw_ctx.hcw),
                              vgw_ctx.hrw_token, sizeof(vgw_ctx.hrw_token),
                              NULL, 0) != SGR_CRYPTO_OK)
            {
                MW_LOG("[ERROR] Crypto chip failed to compute HRW_token");
                vgw_ctx.pending_result = SGR_MW_TOKEN_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[Phase 2 — 1/4] HRW_token: ");
                for (int i = 0; i < 16; i++) printf("%02x", vgw_ctx.hrw_token[i]);
                printf("\n");
                vgw_ctx.step = VGW_STEP_PHASE2_SEND_HCW;
            }
            status = SGR_MW_BUSY;
            break;

        case VGW_STEP_PHASE2_SEND_HCW:
            /* GW closes the device-facing socket at the end of its auth flow.
             * Reopen so the GW dispatcher routes our type-8 frame to the
             * HOST_AUTH flow. */
            MW_LOG("[Phase 2 — 2/4] Reopening connection to GW for host-auth phase...");
            SERVER_Close(&vgw_srv_ctx);
            srv_status = SERVER_Open(&vgw_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to reopen GW connection for Phase 2");
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
                break;
            }

            MW_LOG("[Phase 2 — 2/4] Sending HCW to GW (type 8)...");
            srv_status = SERVER_SendHostAuthRequest(&vgw_srv_ctx, mw_tid, vgw_ctx.hcw);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send host-auth request");
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
            }
            else
            {
                vgw_ctx.step = VGW_STEP_PHASE2_RECEIVE_HRW;
            }
            status = SGR_MW_BUSY;
            break;

        case VGW_STEP_PHASE2_RECEIVE_HRW:
            srv_status = SERVER_ReceiveHRW(&vgw_srv_ctx, vgw_ctx.hrw_cloud);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status == SERVER_AUTH_FAILED)
            {
                MW_LOG("[Phase 2 — 3/4] GW reported HOST_AUTH_NOK — cloud could not produce HRW ✖");
                vgw_ctx.pending_result = SGR_MW_MUTUAL_AUTH_FAILED;
                vgw_ctx.step           = VGW_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to receive HRW from GW (status=%d)", srv_status);
                vgw_ctx.pending_result = SGR_MW_COMM_ERROR;
                vgw_ctx.step           = VGW_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[Phase 2 — 3/4] HRW_cloud received: ");
                for (int i = 0; i < 16; i++) printf("%02x", vgw_ctx.hrw_cloud[i]);
                printf("\n");
                vgw_ctx.step = VGW_STEP_PHASE2_COMPARE;
                status       = SGR_MW_BUSY;
            }
            break;

        case VGW_STEP_PHASE2_COMPARE:
            if (memcmp(vgw_ctx.hrw_token, vgw_ctx.hrw_cloud, 16) == 0)
            {
                MW_LOG("[Phase 2 — 4/4] HRW_token == HRW_cloud — MUTUAL AUTH OK ✔");
                vgw_ctx.pending_result = SGR_MW_OK;
            }
            else
            {
                MW_LOG("[Phase 2 — 4/4] HRW mismatch — cloud identity NOT verified ✖");
                vgw_ctx.pending_result = SGR_MW_MUTUAL_AUTH_FAILED;
            }
            vgw_ctx.step = VGW_STEP_CLOSE;
            status       = SGR_MW_BUSY;
            break;

        case VGW_STEP_CLOSE:
            SERVER_Close(&vgw_srv_ctx);
            /* Phase-2 HRW mismatch is deterministic — retrying won't change the result. */
            if (vgw_ctx.pending_result != SGR_MW_OK
                && vgw_ctx.pending_result != SGR_MW_MUTUAL_AUTH_FAILED
                && vgw_ctx.attempt < MAX_RETRIES)
            {
                vgw_ctx.attempt++;
                MW_LOG("[RETRY] Attempt %d / %d", vgw_ctx.attempt, MAX_RETRIES);
                vgw_ctx.step = VGW_STEP_OPEN;
                status       = SGR_MW_BUSY;
            }
            else
            {
                if (vgw_ctx.pending_result != SGR_MW_OK)
                    MW_LOG("[FAILED] Device authentication failed after %d attempts", vgw_ctx.attempt);
                status       = vgw_ctx.pending_result;
                vgw_ctx.step = VGW_STEP_OPEN;
            }
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * sgr_mw_verify_fw
 * DEVICE computes SHA-256 of FW, uses hash as CW to get RW from crypto chip,
 * compares it with the RW embedded in the FW image, sends result to GW.
 * ───────────────────────────────────────────────────────────────────────────── */
typedef enum {
    FWV_STEP_INIT = 0,
    FWV_STEP_COMPUTE_HASH,
    FWV_STEP_GET_RW,
    FWV_STEP_COMPARE,
    FWV_STEP_OPEN,
    FWV_STEP_SEND_RESULT,
    FWV_STEP_WAIT_ACK,
    FWV_STEP_CLOSE
} fwv_step_t;

static server_ctx_t fwv_srv_ctx;

static struct {
    fwv_step_t       step;
    sgr_mw_status_t  pending_result;
    int              attempt;
    uint8_t          hash[32];           /* SHA-256 of FW content (used as CW) */
    uint8_t          rw_computed[16];    /* RW returned by the crypto chip      */
    const uint8_t   *fw_data;            /* pointer into caller's FW buffer     */
    uint32_t         fw_size;
    const uint8_t   *fw_rw;             /* expected RW embedded in FW image    */
} fwv_ctx;

sgr_mw_status_t sgr_mw_verify_fw(const uint8_t *fw_data,
                                   uint32_t       fw_size,
                                   const uint8_t *fw_rw)
{
    sgr_mw_status_t status     = SGR_MW_BUSY;
    server_status_t srv_status = SERVER_ERROR;

    if (!mw_initialized)
        return SGR_MW_ERROR;

    switch (fwv_ctx.step)
    {
        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_INIT:
        {
            int saved_attempt      = fwv_ctx.attempt;
            memset(&fwv_ctx, 0, sizeof(fwv_ctx));
            fwv_ctx.attempt        = saved_attempt;
            fwv_ctx.pending_result = SGR_MW_ERROR;
            fwv_ctx.fw_data        = fw_data;
            fwv_ctx.fw_size        = fw_size;
            fwv_ctx.fw_rw          = fw_rw;

            MW_LOG("────────────────────────────────────────");
            MW_LOG("DEVICE — FW Verification");
            MW_LOG("────────────────────────────────────────");

            fwv_ctx.step = FWV_STEP_COMPUTE_HASH;
            status       = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_COMPUTE_HASH:
            MW_LOG("[1/4] Computing SHA-256 of firmware (%lu bytes)...", (unsigned long)fwv_ctx.fw_size);
            sha256_compute(fwv_ctx.fw_data, fwv_ctx.fw_size, fwv_ctx.hash);
            MW_LOG("[1/4] SHA-256 computed ✔");
            #if MW_DEBUG
            printf("[MW] HASH: ");
            for (int i = 0; i < 32; i++) printf("%02x", fwv_ctx.hash[i]);
            printf("\n");
            #endif
            fwv_ctx.step = FWV_STEP_GET_RW;
            status       = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_GET_RW:
            MW_LOG("[2/4] Requesting RW from crypto chip (HASH as CW)...");
            if (crypto_get_rw(fwv_ctx.hash,       sizeof(fwv_ctx.hash),
                              fwv_ctx.rw_computed, sizeof(fwv_ctx.rw_computed),
                              NULL, 0) != SGR_CRYPTO_OK)
            {
                MW_LOG("[ERROR] Crypto chip failed to compute RW");
                fwv_ctx.pending_result = SGR_MW_TOKEN_ERROR;
                fwv_ctx.step           = FWV_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[2/4] RW computed by crypto chip ✔");
                /* Save for sgr_mw_installation */
                memcpy(mw_rw_verify, fwv_ctx.rw_computed, 16);
                mw_rw_verify_valid = true;
                #if MW_DEBUG
                printf("[MW] RW computed: ");
                for (int i = 0; i < 16; i++) printf("%02x", fwv_ctx.rw_computed[i]);
                printf("\n");
                printf("[MW] RW expected: ");
                for (int i = 0; i < 16; i++) printf("%02x", fwv_ctx.fw_rw[i]);
                printf("\n");
                #endif
                fwv_ctx.step = FWV_STEP_COMPARE;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_COMPARE:
            if (memcmp(fwv_ctx.rw_computed, fwv_ctx.fw_rw, 16) == 0)
            {
                MW_LOG("[3/4] RW match — firmware integrity verified ✔");
                fwv_ctx.pending_result = SGR_MW_OK;
            }
            else
            {
                MW_LOG("[3/4] RW mismatch — firmware integrity FAILED ✖");
                fwv_ctx.pending_result = SGR_MW_AUTH_FAILED;
            }
            fwv_ctx.step = FWV_STEP_OPEN;
            status       = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_OPEN:
            srv_status = SERVER_Open(&fwv_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to connect to GW");
                fwv_ctx.pending_result = SGR_MW_COMM_ERROR;
                fwv_ctx.step           = FWV_STEP_CLOSE;
            }
            else
            {
                fwv_ctx.step = FWV_STEP_SEND_RESULT;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_SEND_RESULT:
        {
            bool fw_ok = (fwv_ctx.pending_result == SGR_MW_OK);
            MW_LOG("[4/5] Sending FW verification result to GW: %s", fw_ok ? "FW_OK" : "FW_NOK");
            srv_status = SERVER_SendFWVerificationResult(&fwv_srv_ctx, mw_tid, fw_ok, fwv_ctx.rw_computed);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send FW verification result");
                fwv_ctx.pending_result = SGR_MW_COMM_ERROR;
                fwv_ctx.step           = FWV_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[4/5] Result sent ✔ — waiting for cloud ACK...");
                fwv_ctx.step = FWV_STEP_WAIT_ACK;
            }
            status = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_WAIT_ACK:
        {
            bool ack_ok    = false;
            srv_status = SERVER_ReceiveFWVerificationACK(&fwv_srv_ctx, &ack_ok);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
            }
            else if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to receive cloud ACK");
                fwv_ctx.pending_result = SGR_MW_COMM_ERROR;
                fwv_ctx.step           = FWV_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            else
            {
                MW_LOG("[5/5] Cloud ACK received: %s ✔", ack_ok ? "ACK_OK" : "ACK_NOK");
                if (!ack_ok)
                    fwv_ctx.pending_result = SGR_MW_AUTH_FAILED;
                fwv_ctx.step = FWV_STEP_CLOSE;
                status       = SGR_MW_BUSY;
            }
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case FWV_STEP_CLOSE:
            SERVER_Close(&fwv_srv_ctx);
            if (fwv_ctx.pending_result == SGR_MW_COMM_ERROR && fwv_ctx.attempt < MAX_RETRIES)
            {
                fwv_ctx.attempt++;
                MW_LOG("[RETRY] Attempt %d / %d", fwv_ctx.attempt, MAX_RETRIES);
                fwv_ctx.step = FWV_STEP_OPEN;
                status       = SGR_MW_BUSY;
            }
            else
            {
                if (fwv_ctx.pending_result == SGR_MW_COMM_ERROR)
                    MW_LOG("[FAILED] FW verification comm failed after %d attempts", fwv_ctx.attempt);
                status       = fwv_ctx.pending_result;
                fwv_ctx.step = FWV_STEP_INIT;
            }
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * sgr_mw_installation
 * DEVICE builds CW_install = RW_verify || RW_verify, sends to crypto chip,
 * sends type "7" to GW with CRC32 + CW_install + RW_install, waits for result.
 * Requires prior successful sgr_mw_verify_fw (mw_rw_verify_valid must be true).
 * ───────────────────────────────────────────────────────────────────────────── */
typedef enum {
    INST_STEP_INIT = 0,
    INST_STEP_GET_RW,
    INST_STEP_OPEN,
    INST_STEP_SEND,
    INST_STEP_RECV,
    INST_STEP_CLOSE
} inst_step_t;

static server_ctx_t inst_srv_ctx;

static struct {
    inst_step_t      step;
    sgr_mw_status_t  pending_result;
    int              attempt;
    uint8_t          cw_install[32];   /* RW_verify || RW_verify */
    uint8_t          rw_install[16];   /* RW returned by crypto chip */
} inst_ctx;

sgr_mw_status_t sgr_mw_installation(void)
{
    sgr_mw_status_t status     = SGR_MW_BUSY;
    server_status_t srv_status = SERVER_ERROR;

    if (!mw_initialized)
        return SGR_MW_ERROR;

    switch (inst_ctx.step)
    {
        /* ─────────────────────────────────────────────────────────────────── */
        case INST_STEP_INIT:
        {
            if (!mw_rw_verify_valid)
            {
                MW_LOG("[ERROR] No valid RW_verify — run sgr_mw_verify_fw first");
                return SGR_MW_ERROR;
            }

            int saved_attempt      = inst_ctx.attempt;
            memset(&inst_ctx, 0, sizeof(inst_ctx));
            inst_ctx.attempt        = saved_attempt;
            inst_ctx.pending_result = SGR_MW_ERROR;

            MW_LOG("────────────────────────────────────────");
            MW_LOG("DEVICE — Installation");
            MW_LOG("────────────────────────────────────────");

            /* CW_install = RW_verify || RW_verify */
            memcpy(inst_ctx.cw_install,      mw_rw_verify, 16);
            memcpy(inst_ctx.cw_install + 16, mw_rw_verify, 16);

            inst_ctx.step = INST_STEP_GET_RW;
            status        = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case INST_STEP_GET_RW:
            MW_LOG("[1/3] Requesting RW_install from crypto chip...");
            if (crypto_get_rw(inst_ctx.cw_install, sizeof(inst_ctx.cw_install),
                              inst_ctx.rw_install,  sizeof(inst_ctx.rw_install),
                              NULL, 0) != SGR_CRYPTO_OK)
            {
                MW_LOG("[ERROR] Crypto chip failed to compute RW_install");
                inst_ctx.pending_result = SGR_MW_TOKEN_ERROR;
                inst_ctx.step           = INST_STEP_CLOSE;
            }
            else
            {
                MW_LOG("[1/3] RW_install computed ✔");
                inst_ctx.step = INST_STEP_OPEN;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case INST_STEP_OPEN:
            srv_status = SERVER_Open(&inst_srv_ctx, mw_tid);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to connect to GW");
                inst_ctx.pending_result = SGR_MW_COMM_ERROR;
                inst_ctx.step           = INST_STEP_CLOSE;
            }
            else
            {
                inst_ctx.step = INST_STEP_SEND;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case INST_STEP_SEND:
            MW_LOG("[2/3] Sending installation request to GW...");
            srv_status = SERVER_SendInstallationRequest(&inst_srv_ctx, mw_tid,
                                                        inst_ctx.cw_install,
                                                        inst_ctx.rw_install);
            if (srv_status != SERVER_OK)
            {
                MW_LOG("[ERROR] Failed to send installation request");
                inst_ctx.pending_result = SGR_MW_COMM_ERROR;
                inst_ctx.step           = INST_STEP_CLOSE;
            }
            else
            {
                inst_ctx.step = INST_STEP_RECV;
            }
            status = SGR_MW_BUSY;
            break;

        /* ─────────────────────────────────────────────────────────────────── */
        case INST_STEP_RECV:
        {
            bool install_ok = false;
            MW_LOG("[3/3] Waiting for installation result from GW...");
            srv_status = SERVER_ReceiveInstallationResult(&inst_srv_ctx, &install_ok);
            if (srv_status == SERVER_NO_DATA)
            {
                status = SGR_MW_BUSY;
                break;
            }
            if (srv_status == SERVER_OK)
            {
                MW_LOG("[3/3] Installation authorized ✔");
                inst_ctx.pending_result = SGR_MW_OK;
            }
            else if (srv_status == SERVER_AUTH_FAILED)
            {
                MW_LOG("[3/3] Installation denied ✖");
                inst_ctx.pending_result = SGR_MW_AUTH_FAILED;
            }
            else
            {
                MW_LOG("[ERROR] Failed to receive installation result (status=%d)", srv_status);
                inst_ctx.pending_result = SGR_MW_COMM_ERROR;
            }
            inst_ctx.step = INST_STEP_CLOSE;
            status        = SGR_MW_BUSY;
            break;
        }

        /* ─────────────────────────────────────────────────────────────────── */
        case INST_STEP_CLOSE:
            SERVER_Close(&inst_srv_ctx);
            if (inst_ctx.pending_result == SGR_MW_COMM_ERROR && inst_ctx.attempt < MAX_RETRIES)
            {
                inst_ctx.attempt++;
                MW_LOG("[RETRY] Attempt %d / %d", inst_ctx.attempt, MAX_RETRIES);
                inst_ctx.step = INST_STEP_OPEN;
                status        = SGR_MW_BUSY;
            }
            else
            {
                status        = inst_ctx.pending_result;
                inst_ctx.step = INST_STEP_INIT;
            }
            break;

        default:
            status = SGR_MW_ERROR;
            break;
    }

    return status;
}

#endif /* SDK_MODE == DEVICE_MODE */

/* =============================================================================
 * sgr_mw_gw_run  (GATEWAY_MODE only)
 *
 * Unified dispatcher for one device channel.
 * When idle: peeks at the incoming frame type to select the flow.
 * When a flow is in progress: continues it without peeking again.
 * Only returns to idle once the flow completes (any non-BUSY result).
 * ============================================================================= */
#if SDK_MODE == GATEWAY_MODE

typedef enum {
    GW_FLOW_IDLE       = 0,
    GW_FLOW_AUTH       = 1,
    GW_FLOW_FW_VERIFY  = 2,
    GW_FLOW_INSTALL    = 3
} gw_flow_t;

static gw_flow_t gw_active_flow[MAX_DEVICES];

sgr_mw_status_t sgr_mw_gw_run(int device_idx)
{
    if (device_idx < 0 || device_idx >= MAX_DEVICES)
        return SGR_MW_ERROR;

    /* If no flow is active, peek to detect the next frame type */
    if (gw_active_flow[device_idx] == GW_FLOW_IDLE)
    {
        device_service_ctx_t *dev_ctx = &gw_dev_ctx_table[device_idx];
        gw_frame_type_t frame_type = DEVICE_PeekFrameType(dev_ctx);

        switch (frame_type)
        {
            case GW_FRAME_AUTH:
                gw_active_flow[device_idx] = GW_FLOW_AUTH;
                break;
            case GW_FRAME_FW_VERIFY:
                gw_active_flow[device_idx] = GW_FLOW_FW_VERIFY;
                break;
            case GW_FRAME_INSTALL:
                gw_active_flow[device_idx] = GW_FLOW_INSTALL;
                break;
            case GW_FRAME_UNKNOWN:
            default:
                return SGR_MW_BUSY;
        }
    }

    /* Continue the active flow */
    sgr_mw_status_t result = SGR_MW_BUSY;

    switch (gw_active_flow[device_idx])
    {
        case GW_FLOW_AUTH:
            result = sgr_mw_gw_authenticate_device(device_idx);
            break;
        case GW_FLOW_FW_VERIFY:
            result = sgr_mw_gw_receive_fw_verification(device_idx);
            break;
        case GW_FLOW_INSTALL:
            result = sgr_mw_gw_handle_installation(device_idx);
            break;
        default:
            result = SGR_MW_ERROR;
            break;
    }

    /* Flow done — return to idle */
    if (result != SGR_MW_BUSY)
        gw_active_flow[device_idx] = GW_FLOW_IDLE;

    return result;
}
#endif /* SDK_MODE == GATEWAY_MODE */