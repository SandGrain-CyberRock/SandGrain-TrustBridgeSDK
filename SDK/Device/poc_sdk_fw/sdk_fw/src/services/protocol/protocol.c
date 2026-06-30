#include <stdio.h>     // snprintf, sscanf
#include <stdlib.h>   // atoi
#include <string.h> 
#include <strings.h>  // strcasecmp (POSIX)
#include "sdk_sgr_config.h"
#include "protocol.h"
#include "../../utils/json/json_tx_build.h"     /* json_manual */
#include "../../utils/json/json_rx_parser.h"
#include "crc.h"
/* ============================================================
 * INTERNAL HELPERS (JSON parsing)
 * ============================================================ */

/*
 * Compare a JSMN token with a string literal.
 *
 * JSMN tokens are not null-terminated strings; they reference
 * a substring of the original JSON buffer using start/end offsets.
 *
 * This helper checks whether the token matches a given key name
 * (e.g. "type", "payload", "crc").
 */
static int jsmn_eq(const char *json, const jsmntok_t *tok, const char *s);

/*
 * Copy a JSMN token value into a C string buffer.
 *
 * The copy is bounded by dst_size and always null-terminated.
 * Used to extract values from JSON tokens safely.
 */
static void token_to_str(const char *json, const jsmntok_t *tok, char *dst, size_t dst_size);

/* ============================================================
 * TX FRAMES (Token → Server)
 * ============================================================ */
/*
 * Build JSON frame requesting a Challenge Word (CW) from server.
 * Frame type: "0"
 */
int Frame_Get_CW_From_Server(char *out_buf, size_t out_size, const sgr_proto2_ctx_t *ctx)
{
    size_t offset = 0;

    /* Basic parameter validation */
    if (!out_buf || !ctx)
        return -1;

    if (ctx->tid_hex[0] == '\0' || ctx->tid_crc[0] == '\0')
        return -1;

    /* Protocol requires fixed-length fields */
    if (strlen(ctx->tid_hex) != SGR_TID_HEX_LEN)
        return -1;

    if (strlen(ctx->tid_crc) != 4)
        return -1;

    /* Root JSON object */
    if (json_init(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    /* Message type: "0" → Request CW */
    if (json_add_string(out_buf, out_size, &offset, "type", "0", 1) != JSON_OK)
        return -1;

    /* Payload object -> "payload":{*/
    //if (json_object_begin(out_buf, out_size, &offset, "payload") != JSON_OK)
    if (json_object_begin(out_buf, out_size, &offset, "payload", 0) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset, "TID", ctx->tid_hex, 0) != JSON_OK)
        return -1;

    /* Close payload */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

     /* CRC object (sibling of payload) */
    /* CRC object */
    #if CRC_ENABLE
        if (json_object_begin(out_buf, out_size, &offset, "crc",1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset, "TID", ctx->tid_crc, 0) != JSON_OK)
            return -1;

        /* Close crc */
        if (json_end(out_buf, out_size, &offset) != JSON_OK)
            return -1;
    #endif

    /* Close root */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    return (int)offset;
}

/*
 * Build JSON frame replying with RW to server.
 * Frame type: "1"
 */
int Frame_Reply_RW_To_Server(char *out_buf, size_t out_size, const sgr_proto2_ctx_t *ctx)
{
    size_t offset = 0;

     /* Validate presence of all required fields */
    if (!out_buf || !ctx)
    {
        return -1;
    }

    /* Validate protocol-mandated lengths */
    if (strlen(ctx->tid_hex) != SGR_TID_HEX_LEN ||
        strlen(ctx->cw_hex)  != SGR_CW_HEX_LEN  ||
        strlen(ctx->rw_hex)  != SGR_RW_HEX_LEN  ||
        strlen(ctx->transaction_id) != SGR_TRANSACTION_ID_LEN ||
        strlen(ctx->tid_crc) != 4 ||
        strlen(ctx->cw_crc)  != 4 ||
        strlen(ctx->rw_crc)  != 4 ||
        strlen(ctx->transaction_id_crc) != 4)
    {
        return -1;
    }

    /* Root object */
    if (json_init(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    /* "type":"1" */
    if (json_add_string(out_buf, out_size, &offset, "type", "1", 1) != JSON_OK)
        return -1;

    /* "payload":{ */
    //if (json_object_begin(out_buf, out_size, &offset, "payload") != JSON_OK)
    if (json_object_begin(out_buf, out_size, &offset, "payload", 0) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset, "TID", ctx->tid_hex, 1) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset, "CW", ctx->cw_hex, 1) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset, "RW", ctx->rw_hex, 1) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset,
                        "transactionId", ctx->transaction_id, 0) != JSON_OK)
        return -1;

    /* close payload */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    #if CRC_ENABLE
        /* "crc":{  (sibling object, begins with a comma) */
        if (json_object_begin(out_buf, out_size, &offset, "crc", 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset, "TID", ctx->tid_crc, 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset, "CW", ctx->cw_crc, 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset, "RW", ctx->rw_crc, 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset,
                            "transactionId", ctx->transaction_id_crc, 0) != JSON_OK)
            return -1;

        /* close crc */
        if (json_end(out_buf, out_size, &offset) != JSON_OK)
            return -1;
    #endif
    /* close root */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    return (int)offset;
}

int Frame_Authentication_Result(char *out_buf, size_t out_size, const sgr_proto2_ctx_t *ctx)
{
    size_t offset = 0;

    if (!out_buf || !ctx)   
    {
        return -1;
    }

    if (strlen(ctx->transaction_id) != SGR_TRANSACTION_ID_LEN)
        return -1;

    if (json_init(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    /* "type":"2" */
    if (json_add_string(out_buf, out_size, &offset, "type", "2", 1) != JSON_OK)
        return -1;

    /* "payload":{ */
    //if (json_object_begin(out_buf, out_size, &offset, "payload") != JSON_OK)
    if (json_object_begin(out_buf, out_size, &offset, "payload", 0) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset, "TID", ctx->tid_hex, 1) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset,
                        "transactionId", ctx->transaction_id, 0) != JSON_OK)
        return -1;

    /* close payload */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    #if CRC_ENABLE    
        /* New: "crc":{ */
        if (json_object_begin(out_buf, out_size, &offset, "crc", 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset,
                            "TID", ctx->tid_crc, 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset,
                            "transactionId", ctx->transaction_id_crc, 0) != JSON_OK)
            return -1;

        /* close crc */
        if (json_end(out_buf, out_size, &offset) != JSON_OK)
            return -1;
    #endif

    /* close root */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    return (int)offset;
}

int Frame_Get_RW_From_Server(char *out_buf, size_t out_size, const sgr_proto2_ctx_t *ctx){

    size_t offset = 0;

    if (!out_buf || !ctx)
    {
        return -1;
    }

    if (strlen(ctx->tid_hex) != SGR_TID_HEX_LEN)
        return -1;

    if (strlen(ctx->cw_hex) != SGR_CW_HEX_LEN)
        return -1;

    if (strlen(ctx->transaction_id) != SGR_TRANSACTION_ID_LEN)
        return -1;

    if (json_init(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    /* "type":"3" */
    if (json_add_string(out_buf, out_size, &offset, "type", "2", 1) != JSON_OK)
        return -1;

    /* "payload":{ */
    //if (json_object_begin(out_buf, out_size, &offset, "payload") != JSON_OK)
    if (json_object_begin(out_buf, out_size, &offset, "payload", 0) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset, "TID", ctx->tid_hex, 1) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset, "CW", ctx->cw_hex, 1) != JSON_OK)
        return -1;

    if (json_add_string(out_buf, out_size, &offset,
                        "transactionId", ctx->transaction_id, 0) != JSON_OK)
        return -1;

    /* close payload */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    #if CRC_ENABLE
        /* New: "crc":{ */
        if (json_object_begin(out_buf, out_size, &offset, "crc", 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset, "TID", ctx->tid_crc, 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset, "CW", ctx->cw_crc, 1) != JSON_OK)
            return -1;

        if (json_add_string(out_buf, out_size, &offset,
                            "transactionId", ctx->transaction_id_crc, 0) != JSON_OK)
            return -1;

        /* close crc */
        if (json_end(out_buf, out_size, &offset) != JSON_OK)
            return -1;
    #endif
    /* close root */
    if (json_end(out_buf, out_size, &offset) != JSON_OK)
        return -1;

    return (int)offset;
}

int Frame_Reply_Status_Authentication(char *out_buf, size_t out_size, const sgr_proto2_ctx_t *ctx){

    size_t offset = 0;
    int len = -1;

    if (!out_buf || !ctx)
    {
        len = -1;
    }
    else if (strlen(ctx->transaction_id) != SGR_TRANSACTION_ID_LEN)
    {
        len = -1;
    }
    else if (json_init(out_buf, out_size, &offset) != JSON_OK)
    {
        len = -1;
    }
    else if (json_add_string(out_buf, out_size, &offset,"type", "3", 1) != JSON_OK)
    {
        len = -1;
    }
    else if (json_payload_begin(out_buf, out_size, &offset) != JSON_OK)
    {
        len = -1;
    }
    else if (json_add_string(out_buf, out_size, &offset,"TID", ctx->tid_hex, 1) != JSON_OK)
    {
        len = -1;
    }
    else if (json_add_string(out_buf, out_size, &offset,"transactionId", ctx->transaction_id, 1) != JSON_OK)
    {
        len = -1;
    }
    else if (json_add_string(out_buf, out_size, &offset,"auth_status",ctx->auth_status2 ? "CLOUD_AUTH_OK" : "CLOUD_AUTH_NOT_OK", 0) != JSON_OK)
    {
        len = -1;
    }
    else if (json_payload_end(out_buf, out_size, &offset) != JSON_OK)
    {
        len = -1;
    }
    else if (json_end(out_buf, out_size, &offset) != JSON_OK)
    {
        len = -1;
    }
    else
    {
        len = (int)offset;
    }

    return len;
}


int RX_Extract_And_Check_Field(const rx_response_t *rx, const char *field_name, char *out_value, size_t out_value_size){

    char value[256] = {0};
    char crc_rx[5]  = {0};
    char pattern[64];
    char pattern_prefix[64];

    RX_DBG("\n========== RX_Extract_And_Check_Field ==========\n");
    RX_DBG("[STEP 0] Entry\n");
    RX_DBG(" rx ptr        : %p\n", (void *)rx);
    RX_DBG(" field_name    : %s (%p)\n", field_name, (void *)field_name);
    RX_DBG(" out_value ptr : %p\n", (void *)out_value);
    RX_DBG(" out_value_size: %zu\n", out_value_size);

    /* ------------------------------------------------- */
    RX_DBG("[STEP 1] Validate parameters\n");
    if (!rx || !field_name || !out_value || out_value_size == 0)
    {
        RX_DBG(" ❌ Invalid parameters\n");
        return -1;
    }
    RX_DBG(" ✔ Parameters OK\n");

    /* ------------------------------------------------- */
    RX_DBG("[STEP 2] Payload content\n");
    RX_DBG(" payload raw   : %s\n", rx->payload);

    snprintf(pattern_prefix, sizeof(pattern_prefix),"\"%s\":\"", field_name);

    RX_DBG("search prefix : %s\n", pattern_prefix);

    const char *p = strstr(rx->payload, pattern_prefix);
    if (!p)
    {
        RX_DBG(" ❌ Field '%s' NOT FOUND in payload\n", field_name);
        return -2;
    }

    snprintf(pattern, sizeof(pattern),
             "\"%s\":\"%%255[^\"]\"",
             field_name);

    RX_DBG(" sscanf pattern: %s\n", pattern);

    if (sscanf(p, pattern, value) != 1)
    {
        RX_DBG(" ❌ Failed to extract field '%s'\n", field_name);
        return -2;
    }

    RX_DBG(" ✔ Field extracted\n");
    RX_DBG(" value         : '%s'\n", value);
    RX_DBG(" value length  : %zu\n", strlen(value));

    /* ------------------------------------------------- */
    #if CRC_ENABLE
        RX_DBG("[STEP 3] CRC JSON content\n");
        RX_DBG(" crc raw       : %s\n", rx->crc);

        const char *c = strstr(rx->crc, pattern_prefix);
        if (!c)
        {
            RX_DBG(" ❌ CRC for field '%s' NOT FOUND\n", field_name);
            return -3;
        }

        snprintf(pattern, sizeof(pattern),
                "\"%s\":\"%%4[0-9a-fA-F]\"",
                field_name);

        RX_DBG(" sscanf CRC pattern: %s\n", pattern);

        if (sscanf(c, pattern, crc_rx) != 1)
        {
            RX_DBG(" ❌ Failed to extract CRC for '%s'\n", field_name);
            return -3;
        }

        RX_DBG(" ✔ CRC extracted from RX\n");
        RX_DBG(" crc_rx        : %s\n", crc_rx);

        /* ------------------------------------------------- */
        RX_DBG("[STEP 4] CRC calculation\n");
        RX_DBG(" Calculating CRC over ASCII string\n");
        RX_DBG(" Data used     : '%s'\n", value);
        RX_DBG(" Data length   : %zu\n", strlen(value));

        uint16_t crc_calc = crcFast(
            (unsigned char *)value,
            strlen(value));

        RX_DBG(" crcFast raw   : 0x%04X\n", crc_calc);

        char crc_calc_hex[5];
        crc_calc_hex[0] = "0123456789abcdef"[(crc_calc >> 12) & 0xF];
        crc_calc_hex[1] = "0123456789abcdef"[(crc_calc >> 8)  & 0xF];
        crc_calc_hex[2] = "0123456789abcdef"[(crc_calc >> 4)  & 0xF];
        crc_calc_hex[3] = "0123456789abcdef"[ crc_calc        & 0xF];
        crc_calc_hex[4] = '\0';

        RX_DBG(" crc_calc_hex  : %s\n", crc_calc_hex);

        /* ------------------------------------------------- */
        RX_DBG("[STEP 5] CRC compare\n");
        RX_DBG(" RX  CRC       : %s\n", crc_rx);
        RX_DBG(" CALC CRC      : %s\n", crc_calc_hex);

        if (strcasecmp(crc_calc_hex, crc_rx) != 0)
        {
            RX_DBG(" ❌ CRC MISMATCH\n");
            RX_DBG("===============================================\n");
            return -4;
        }

        RX_DBG(" ✔ CRC MATCH\n");
    #else
        RX_DBG("[STEP 3-5] CRC validation DISABLED by configuration\n");
    #endif

    /* ------------------------------------------------- */
    RX_DBG("[STEP 6] Copy output\n");

    strncpy(out_value, value, out_value_size - 1);
    out_value[out_value_size - 1] = '\0';

    RX_DBG(" out_value     : %s\n", out_value);
    RX_DBG(" ✔ SUCCESS\n");
    RX_DBG("===============================================\n");

    return 0;
}

int RX_Get_Response(const char *rx_total, char expected_type, rx_response_t *out){

    jsmn_parser parser;
    jsmntok_t tokens[MAX_TOKENS];

    int code = -1;
    char rx_type = 0;
    int count;

    jsmn_init(&parser);
    
    count = jsmn_parse(&parser, rx_total, strlen(rx_total), tokens, MAX_TOKENS);

    if (count < 0)
        return -1;

    memset(out, 0, sizeof(*out));

    for (int i = 1; i < count; i++)
    {
        if (jsmn_eq(rx_total, &tokens[i], "type"))
        {
            rx_type = rx_total[tokens[i + 1].start];
            if (rx_type != expected_type)
                return -2;
            i++;
        }
        else if (jsmn_eq(rx_total, &tokens[i], "status"))
        {
            int j = i + 1;
            int end = tokens[j].end;
            while (j < count && tokens[j].start < end)
            {
                if (jsmn_eq(rx_total, &tokens[j], "code"))
                {
                    char tmp[8];
                    token_to_str(rx_total, &tokens[j + 1], tmp, sizeof(tmp));
                    code = atoi(tmp);
                    j++;
                }
                else if (jsmn_eq(rx_total, &tokens[j], "result"))
                {
                    token_to_str(rx_total, &tokens[j + 1], out->result, sizeof(out->result));
                    j++;
                }
                j++;
            }
        }
        else if (jsmn_eq(rx_total, &tokens[i], "payload"))
        {
            token_to_str(rx_total, &tokens[i + 1], out->payload, sizeof(out->payload));
            i++;
        }
        #if CRC_ENABLE
            else if (jsmn_eq(rx_total, &tokens[i], "crc"))
            {
                token_to_str(rx_total, &tokens[i + 1],
                            out->crc,
                            sizeof(out->crc));
                i++;
            }
        #endif
    }

    //out->status_code = (code == 0) ? 1 : 0;
    out->status_code = code;
    return 0;
}

static int jsmn_eq(const char *json, const jsmntok_t *tok, const char *s){

    return tok->type == JSMN_STRING &&
           (int)strlen(s) == tok->end - tok->start &&
           strncmp(json + tok->start,
                   s,
                   tok->end - tok->start) == 0;
}

static void token_to_str(const char *json, const jsmntok_t *tok, char *dst, size_t dst_size){
    
    int len = tok->end - tok->start;
    if (len >= (int)dst_size)
        len = dst_size - 1;

    memcpy(dst, json + tok->start, len);
    dst[len] = '\0';
}