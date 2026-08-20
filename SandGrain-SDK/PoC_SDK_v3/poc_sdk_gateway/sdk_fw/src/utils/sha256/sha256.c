/* =============================================================================
 * sha256.c
 *
 * Compact SHA-256 implementation (FIPS PUB 180-4).
 * No dynamic allocation - operates entirely on the stack.
 * ============================================================================= */

#include "sha256.h"
#include <string.h>

/* -- Round constants (first 32 bits of fractional parts of cube roots
 *    of the first 64 primes) --------------------------------------- */
static const uint32_t K[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u,
    0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
    0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
    0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
    0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
    0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u,
    0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
    0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
    0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
    0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u,
    0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u,
    0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
    0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
};

/* -- Initial hash values (first 32 bits of fractional parts of square
 *    roots of the first 8 primes) --------------------------------- */
static const uint32_t H0[8] = {
    0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
    0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u
};

/* -- Bitwise operations -------------------------------------------- */
#define ROTR(x, n)  (((x) >> (n)) | ((x) << (32u - (n))))
#define SHR(x, n)   ((x) >> (n))

#define CH(x, y, z)   (((x) & (y)) ^ (~(x) & (z)))
#define MAJ(x, y, z)  (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))

#define SIGMA0(x)  (ROTR(x,  2) ^ ROTR(x, 13) ^ ROTR(x, 22))
#define SIGMA1(x)  (ROTR(x,  6) ^ ROTR(x, 11) ^ ROTR(x, 25))
#define sigma0(x)  (ROTR(x,  7) ^ ROTR(x, 18) ^ SHR( x,  3))
#define sigma1(x)  (ROTR(x, 17) ^ ROTR(x, 19) ^ SHR( x, 10))

/* -- Process one 512-bit (64-byte) block -------------------------- */
static void sha256_block(const uint8_t block[64], uint32_t h[8])
{
    uint32_t w[64];
    uint32_t a, b, c, d, e, f, g, hh;
    uint32_t t1, t2;
    int      i;

    /* Prepare message schedule */
    for (i = 0; i < 16; i++)
    {
        w[i] = ((uint32_t)block[i * 4    ] << 24) |
               ((uint32_t)block[i * 4 + 1] << 16) |
               ((uint32_t)block[i * 4 + 2] <<  8) |
               ((uint32_t)block[i * 4 + 3]      );
    }
    for (i = 16; i < 64; i++)
    {
        w[i] = sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16];
    }

    /* Initialize working variables */
    a = h[0]; b = h[1]; c = h[2]; d = h[3];
    e = h[4]; f = h[5]; g = h[6]; hh = h[7];

    /* 64 compression rounds */
    for (i = 0; i < 64; i++)
    {
        t1 = hh + SIGMA1(e) + CH(e, f, g) + K[i] + w[i];
        t2 = SIGMA0(a) + MAJ(a, b, c);
        hh = g;
        g  = f;
        f  = e;
        e  = d + t1;
        d  = c;
        c  = b;
        b  = a;
        a  = t1 + t2;
    }

    /* Update hash state */
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
}

/* =============================================================================
 * sha256_compute
 * ============================================================================= */
void sha256_compute(const uint8_t *data, uint32_t len, uint8_t hash[32])
{
    uint32_t h[8];
    uint8_t  block[64];
    uint32_t offset = 0;
    uint64_t bit_len;
    int      i;

    /* Copy initial hash values */
    for (i = 0; i < 8; i++)
        h[i] = H0[i];

    /* Process all complete 64-byte blocks */
    while (offset + 64 <= len)
    {
        sha256_block(data + offset, h);
        offset += 64;
    }

    /* Build the final padded block(s) */
    uint32_t remaining = len - offset;
    memset(block, 0, sizeof(block));
    memcpy(block, data + offset, remaining);

    /* Append 0x80 padding byte */
    block[remaining] = 0x80u;

    if (remaining >= 56)
    {
        /* Not enough room for length - process this block and add a second */
        sha256_block(block, h);
        memset(block, 0, sizeof(block));
    }

    /* Append message length as 64-bit big-endian bit count */
    bit_len = (uint64_t)len * 8u;
    block[56] = (uint8_t)(bit_len >> 56);
    block[57] = (uint8_t)(bit_len >> 48);
    block[58] = (uint8_t)(bit_len >> 40);
    block[59] = (uint8_t)(bit_len >> 32);
    block[60] = (uint8_t)(bit_len >> 24);
    block[61] = (uint8_t)(bit_len >> 16);
    block[62] = (uint8_t)(bit_len >>  8);
    block[63] = (uint8_t)(bit_len      );
    sha256_block(block, h);

    /* Produce final digest in big-endian byte order */
    for (i = 0; i < 8; i++)
    {
        hash[i * 4    ] = (uint8_t)(h[i] >> 24);
        hash[i * 4 + 1] = (uint8_t)(h[i] >> 16);
        hash[i * 4 + 2] = (uint8_t)(h[i] >>  8);
        hash[i * 4 + 3] = (uint8_t)(h[i]      );
    }
}
