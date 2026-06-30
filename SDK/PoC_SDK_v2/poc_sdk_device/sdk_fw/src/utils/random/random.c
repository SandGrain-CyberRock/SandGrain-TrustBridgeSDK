/* =============================================================================
 * random.c
 *
 * Random byte generation utility.
 *
 * Current implementation uses rand() — suitable for PoC only.
 * Replace with hardware RNG when available.
 * ============================================================================= */

#include "random.h"
#include <stdlib.h>
#include <time.h>
#include <stdbool.h>

static bool seeded = false;

void random_bytes(uint8_t *buf, size_t len)
{
    if (!seeded)
    {
        srand((unsigned int)time(NULL));
        seeded = true;
    }

    for (size_t i = 0; i < len; i++)
    {
        buf[i] = (uint8_t)(rand() & 0xFF);
    }
}