#include "json_tx_build.h"
#include <stdio.h>

/* =========================================================
 * JSON init
 * ========================================================= */
json_err_t json_init(char *buf, size_t size, size_t *offset)
{
    int n;

    if (!buf || !offset || size == 0)
        return JSON_ERR_PARAM;

    n = snprintf(buf, size, "{");
    if (n < 0 || (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset = (size_t)n;
    return JSON_OK;
}

/* =========================================================
 * JSON end
 * ========================================================= */
json_err_t json_end(char *buf, size_t size, size_t *offset)
{
    int n;

    if (!buf || !offset)
        return JSON_ERR_PARAM;

    n = snprintf(buf + *offset, size - *offset, "}");
    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset += (size_t)n;
    return JSON_OK;
}

/* =========================================================
 * Add string key/value
 * ========================================================= */
json_err_t json_add_string(char *buf, size_t size, size_t *offset,
                           const char *key,
                           const char *value,
                           int comma)
{
    int n;

    if (!buf || !offset || !key || !value)
        return JSON_ERR_PARAM;

    n = snprintf(buf + *offset, size - *offset,
                 "\"%s\":\"%s\"%s",
                 key, value, comma ? "," : "");

    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset += (size_t)n;
    return JSON_OK;
}

/* =========================================================
 * Add integer key/value
 * ========================================================= */
json_err_t json_add_int(char *buf, size_t size, size_t *offset,
                        const char *key,
                        int value,
                        int comma)
{
    int n;

    if (!buf || !offset || !key)
        return JSON_ERR_PARAM;

    n = snprintf(buf + *offset, size - *offset,
                 "\"%s\":%d%s",
                 key, value, comma ? "," : "");

    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset += (size_t)n;
    return JSON_OK;
}

/* =========================================================
 * Add boolean key/value
 * ========================================================= */
json_err_t json_add_bool(char *buf, size_t size, size_t *offset,
                         const char *key,
                         int value,
                         int comma)
{
    int n;

    if (!buf || !offset || !key)
        return JSON_ERR_PARAM;

    n = snprintf(buf + *offset, size - *offset,
                 "\"%s\":%s%s",
                 key,
                 value ? "true" : "false",
                 comma ? "," : "");

    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset += (size_t)n;
    return JSON_OK;
}

/* =========================================================
 * Add integer array key/value
 * ========================================================= */
json_err_t json_add_int_array(char *buf, size_t size, size_t *offset,
                              const char *key,
                              const int *arr,
                              int len,
                              int comma)
{
    int n;
    int i;

    if (!buf || !offset || !key || !arr || len < 0)
        return JSON_ERR_PARAM;

    /* Open array */
    n = snprintf(buf + *offset, size - *offset,
                 "\"%s\":[", key);
    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;
    *offset += (size_t)n;

    /* Elements */
    for (i = 0; i < len; i++) {
        n = snprintf(buf + *offset, size - *offset,
                     "%d%s",
                     arr[i],
                     (i < len - 1) ? "," : "");
        if (n < 0 || *offset + (size_t)n >= size)
            return JSON_ERR_OVERFLOW;
        *offset += (size_t)n;
    }

    /* Close array */
    n = snprintf(buf + *offset, size - *offset,
                 "]%s",
                 comma ? "," : "");
    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset += (size_t)n;
    return JSON_OK;
}

json_err_t json_payload_begin(char *buf, size_t size, size_t *offset)
{
    int n;

    if (!buf || !offset)
        return JSON_ERR_PARAM;

    n = snprintf(buf + *offset, size - *offset, "\"payload\":{");
    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset += (size_t)n;
    return JSON_OK;
}

json_err_t json_object_begin(char *buf, size_t size, size_t *offset, const char *key, int with_comma)
{
    int n;

    if (!buf || !offset || !key)
        return JSON_ERR_PARAM;

    n = snprintf(buf + *offset, size - *offset,
                 "%s\"%s\":{",
                 with_comma ? "," : "",
                 key);

    if (n < 0 || *offset + (size_t)n >= size)
        return JSON_ERR_OVERFLOW;

    *offset += (size_t)n;
    return JSON_OK;
}



json_err_t json_payload_end(char *buf, size_t size, size_t *offset)
{
    return json_end(buf, size, offset);
}