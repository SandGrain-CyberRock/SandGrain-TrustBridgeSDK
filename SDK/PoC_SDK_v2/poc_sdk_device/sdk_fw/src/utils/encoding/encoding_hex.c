#include <stdint.h>
#include "encoding_hex.h"


int bytes_to_hex(const uint8_t *in, size_t in_len, char *out, size_t out_size)
{
    //static const char hex[] = "0123456789ABCDEF";
    static const char hex[] = "0123456789abcdef";

    if (!in || !out || out_size < (in_len * 2 + 1))
        return -1;

    for (uint16_t i = 0; i < in_len; i++)
    {
        out[i * 2]     = hex[(in[i] >> 4) & 0x0F];
        out[i * 2 + 1] = hex[in[i] & 0x0F];
    }

    out[in_len * 2] = '\0';

    return 0;
}

/* 
 * Convierte HEX ASCII a bytes
 * hex      : string HEX (ej "A1B2C3")
 * out      : buffer binario de salida
 * out_size : tamaño del buffer binario
 *
 * return 0 si OK, -1 si error
 */

int hex_to_bytes(const char *hex,
                 uint8_t *out,
                 size_t out_size)
{
    uint16_t i;
    uint8_t  high, low;

    if (!hex || !out)
        return -1;

    for (i = 0; i < out_size; i++)
    {
        char c1 = hex[i * 2];
        char c2 = hex[i * 2 + 1];

        if (c1 == '\0' || c2 == '\0')
            return -1;

        /* high nibble */
        if (c1 >= '0' && c1 <= '9')
            high = c1 - '0';
        else if (c1 >= 'a' && c1 <= 'f')
            high = c1 - 'a' + 10;
        else if (c1 >= 'A' && c1 <= 'F')
            high = c1 - 'A' + 10;
        else
            return -1;

        /* low nibble */
        if (c2 >= '0' && c2 <= '9')
            low = c2 - '0';
        else if (c2 >= 'a' && c2 <= 'f')
            low = c2 - 'a' + 10;
        else if (c2 >= 'A' && c2 <= 'F')
            low = c2 - 'A' + 10;
        else
            return -1;

        out[i] = (high << 4) | low;
    }

    return 0;
}