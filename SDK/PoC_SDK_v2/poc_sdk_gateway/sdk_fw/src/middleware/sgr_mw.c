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
                MW_LOG("[4/4] GW confirmed device — AUT_OK ✔");
                vgw_ctx.pending_result = SGR_MW_OK;
                vgw_ctx.step           = VGW_STEP_CLOSE;
                status                 = SGR_MW_BUSY;
            }
            break;
        }

        case VGW_STEP_CLOSE:
            SERVER_Close(&vgw_srv_ctx);
            if (vgw_ctx.pending_result != SGR_MW_OK && vgw_ctx.attempt < MAX_RETRIES)
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

#endif /* SDK_MODE == DEVICE_MODE */