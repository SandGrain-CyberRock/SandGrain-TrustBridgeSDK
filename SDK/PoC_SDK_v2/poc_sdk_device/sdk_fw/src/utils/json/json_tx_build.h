#ifndef json_tx_build_H
#define json_tx_build_H

#include <stddef.h>

typedef enum {
    JSON_OK = 0,
    JSON_ERR_PARAM,
    JSON_ERR_OVERFLOW
} json_err_t;

/* Base */
json_err_t json_init(char *buf, size_t size, size_t *offset);
json_err_t json_end(char *buf, size_t size, size_t *offset);

/* Payload helpers */
json_err_t json_payload_begin(char *buf, size_t size, size_t *offset);
json_err_t json_payload_end(char *buf, size_t size, size_t *offset);

json_err_t json_object_begin(char *buf, size_t size, size_t *offset, const char *key, int with_comma);

/* Values */
json_err_t json_add_string(char *buf, size_t size, size_t *offset, const char *key, const char *value, int comma);

#endif /* json_tx_build_H */
