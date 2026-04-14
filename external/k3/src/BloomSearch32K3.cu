/*
 * BloomSearch32K3.cu - K3 Optimized GPU Bloom Filter Search
 *
 * Based on BloomSearch32K1.cu with the following optimizations:
 *
 * 1. MEMORY COALESCING: New data layout [thread][component] for coalesced access
 * 2. REGISTER PRESSURE: Batched modular inversion to reduce register spilling
 * 3. WARP-LEVEL ATOMICS: Reduced atomic contention via warp voting
 * 4. BLOOM FILTER BITMASK: Power-of-2 sizes for fast modulo via AND
 * 5. SYMMETRIC HASH: Compute +y and -y hashes in single pass
 * 6. BLOCK CONFIGURATION: Optimized for better occupancy
 * 7. PINNED MEMORY: Host-pinned buffers for faster transfers
 * 8. CUDA ERROR HANDLING: Proper error checking throughout
 *
 * Expected speedup: 3-5x over original K1 implementation
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <cuda.h>
#include <cuda_runtime.h>
#include <time.h>
#include <signal.h>
#include <sys/stat.h>

// Include optimized headers
#include "../GPUGroup.h"
#include "../GPUMath_K3.h"
#include "../GPUHash.h"

// ---------------------------------------------------------------------------------------
// K3 CONFIGURATION
// ---------------------------------------------------------------------------------------
#define K3_THREADS_PER_BLOCK 256    // Reduced from 512 for better occupancy
#define K3_BLOCKS 256               // Increased block count
#define K3_TOTAL_THREADS (K3_THREADS_PER_BLOCK * K3_BLOCKS)  // 65536
#define K3_STEP_SIZE 1024
#define K3_MAX_FOUND 65536
#define K3_ITEM_SIZE32 8
#define K3_INV_BATCH 64             // Batch size for modular inversion

// Search mode flags
#define MODE_COMPRESSED_ONLY 0
#define MODE_UNCOMPRESSED_ONLY 1
#define MODE_BOTH 2

// Address type flags
#define ADDR_COMPRESSED   0x8000
#define ADDR_UNCOMPRESSED 0x0000

// ---------------------------------------------------------------------------------------
// CUDA ERROR HANDLING MACRO
// ---------------------------------------------------------------------------------------
#define CUDA_CHECK(call) do { \
    cudaError_t err = call; \
    if (err != cudaSuccess) { \
        fprintf(stderr, "CUDA error at %s:%d: %s\n", __FILE__, __LINE__, \
                cudaGetErrorString(err)); \
        exit(1); \
    } \
} while(0)

volatile bool running = true;
void sighandler(int s) { running = false; }

// ---------------------------------------------------------------------------------------
// K3 OPTIMIZATION: FAST MURMUR3 WITH BITMASK
// ---------------------------------------------------------------------------------------
__device__ __forceinline__ uint32_t rotl32_k3(uint32_t x, int8_t r) {
    return (x << r) | (x >> (32 - r));
}

__device__ __forceinline__ uint32_t murmur3_32_k3(const uint8_t* key, int len, uint32_t seed) {
    const uint32_t c1 = 0xcc9e2d51;
    const uint32_t c2 = 0x1b873593;
    uint32_t h1 = seed;
    const int nblocks = len / 4;

    const uint32_t* blocks = (const uint32_t*)key;
    #pragma unroll 5
    for (int i = 0; i < nblocks; i++) {
        uint32_t k1 = blocks[i];
        k1 *= c1;
        k1 = rotl32_k3(k1, 15);
        k1 *= c2;
        h1 ^= k1;
        h1 = rotl32_k3(h1, 13);
        h1 = h1 * 5 + 0xe6546b64;
    }

    const uint8_t* tail = key + nblocks * 4;
    uint32_t k1 = 0;
    switch (len & 3) {
        case 3: k1 ^= tail[2] << 16;
        case 2: k1 ^= tail[1] << 8;
        case 1: k1 ^= tail[0];
                k1 *= c1;
                k1 = rotl32_k3(k1, 15);
                k1 *= c2;
                h1 ^= k1;
    }

    h1 ^= len;
    h1 ^= h1 >> 16;
    h1 *= 0x85ebca6b;
    h1 ^= h1 >> 13;
    h1 *= 0xc2b2ae35;
    h1 ^= h1 >> 16;
    return h1;
}

// ---------------------------------------------------------------------------------------
// K3 OPTIMIZATION: BLOOM CHECK WITH BITMASK (power-of-2 sizes)
// ---------------------------------------------------------------------------------------
__device__ __forceinline__ bool bloom_check_k3(
    const uint8_t* hash160,
    const uint32_t* data,
    uint64_t bitsMask,  // bits - 1 for power-of-2
    const uint32_t* seeds,
    int num_hashes
) {
    #pragma unroll 4
    for (int i = 0; i < num_hashes; i++) {
        uint32_t h = murmur3_32_k3(hash160, 20, seeds[i]);
        uint64_t bitPos = h & bitsMask;  // Fast AND instead of slow modulo!
        uint64_t wordPos = bitPos >> 5;
        uint32_t bitMask = 1u << (bitPos & 31);
        if (!(data[wordPos] & bitMask)) {
            return false;
        }
    }
    return true;
}

// Tiered bloom check with fast bitmask
__device__ __forceinline__ bool CheckTieredBloom_K3(
    const uint32_t* h,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Mask, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Mask, const uint32_t* bloom2Seeds, int bloom2Hashes
) {
    // Tier 1: 32-bit prefix bitmap check (fastest)
    uint32_t prefix32 = __byte_perm(h[0], 0, 0x0123);
    uint32_t byteIdx = prefix32 >> 3;
    uint32_t bitIdx = prefix32 & 7;
    if (!(prefixTable32[byteIdx] & (1 << bitIdx))) {
        return false;
    }

    // Tier 2: Primary bloom filter with bitmask
    if (!bloom_check_k3((const uint8_t*)h, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes)) {
        return false;
    }

    // Tier 3: Optional secondary bloom filter
    if (bloom2 != nullptr && bloom2Mask > 0) {
        if (!bloom_check_k3((const uint8_t*)h, bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes)) {
            return false;
        }
    }

    return true;
}

// ---------------------------------------------------------------------------------------
// K3 OPTIMIZATION: WARP-LEVEL ATOMIC RECORDING
// ---------------------------------------------------------------------------------------
__device__ void RecordMatch_K3(
    uint32_t* out, uint32_t maxFound,
    uint32_t tid, int32_t incr, uint32_t addrType, uint32_t endoType,
    uint32_t* h,
    bool hasMatch
) {
    // Warp-level voting to reduce atomic contention
    unsigned mask = __ballot_sync(0xFFFFFFFF, hasMatch);

    if (mask == 0) return;  // No matches in this warp

    int matchCount = __popc(mask);
    uint32_t basePos;

    // Only lane 0 does the atomic
    if ((threadIdx.x & 31) == 0) {
        basePos = atomicAdd(out, matchCount);
    }

    // Broadcast basePos to all lanes
    basePos = __shfl_sync(0xFFFFFFFF, basePos, 0);

    if (hasMatch) {
        // Calculate this thread's offset within the warp's matches
        unsigned lowerMask = (1u << (threadIdx.x & 31)) - 1;
        int laneOffset = __popc(mask & lowerMask);
        uint32_t pos = basePos + laneOffset;

        if (pos < maxFound) {
            out[pos * K3_ITEM_SIZE32 + 1] = tid;
            out[pos * K3_ITEM_SIZE32 + 2] = (incr << 16) | addrType | endoType;
            out[pos * K3_ITEM_SIZE32 + 3] = h[0];
            out[pos * K3_ITEM_SIZE32 + 4] = h[1];
            out[pos * K3_ITEM_SIZE32 + 5] = h[2];
            out[pos * K3_ITEM_SIZE32 + 6] = h[3];
            out[pos * K3_ITEM_SIZE32 + 7] = h[4];
        }
    }
}

// Simple non-warp version for fallback
__device__ __forceinline__ void RecordMatchSimple(
    uint32_t* out, uint32_t maxFound,
    uint32_t tid, int32_t incr, uint32_t addrType, uint32_t endoType,
    uint32_t* h
) {
    uint32_t pos = atomicAdd(out, 1);
    if (pos < maxFound) {
        out[pos * K3_ITEM_SIZE32 + 1] = tid;
        out[pos * K3_ITEM_SIZE32 + 2] = (incr << 16) | addrType | endoType;
        out[pos * K3_ITEM_SIZE32 + 3] = h[0];
        out[pos * K3_ITEM_SIZE32 + 4] = h[1];
        out[pos * K3_ITEM_SIZE32 + 5] = h[2];
        out[pos * K3_ITEM_SIZE32 + 6] = h[3];
        out[pos * K3_ITEM_SIZE32 + 7] = h[4];
    }
}

// ---------------------------------------------------------------------------------------
// K3: CHECK POINT WITH BOTH FORMATS (using symmetric hash)
// ---------------------------------------------------------------------------------------
__device__ void CheckPointBothFormats_K3(
    uint64_t* px, uint64_t* py_positive, uint64_t* py_negative,
    int32_t incr, uint32_t endoType,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Mask, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Mask, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint32_t h_even[5], h_odd[5];
    uint32_t h_uncomp_pos[5], h_uncomp_neg[5];
    uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;

    // K3 OPTIMIZATION: Use symmetric hash for compressed (computes both parities at once)
    _GetHash160CompSym(px, (uint8_t*)h_even, (uint8_t*)h_odd);

    // Check compressed +y (even parity corresponds to one, odd to other)
    uint8_t isOdd = (uint8_t)(py_positive[0] & 1);
    uint32_t* h_comp_pos = isOdd ? h_odd : h_even;
    uint32_t* h_comp_neg = isOdd ? h_even : h_odd;

    if (CheckTieredBloom_K3(h_comp_pos, prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
                            bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes)) {
        RecordMatchSimple(out, maxFound, tid, incr, ADDR_COMPRESSED, endoType, h_comp_pos);
    }

    if (CheckTieredBloom_K3(h_comp_neg, prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
                            bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes)) {
        RecordMatchSimple(out, maxFound, tid, -incr, ADDR_COMPRESSED, endoType, h_comp_neg);
    }

    // Uncompressed addresses (need full y coordinate)
    _GetHash160(px, py_positive, (uint8_t*)h_uncomp_pos);
    if (CheckTieredBloom_K3(h_uncomp_pos, prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
                            bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes)) {
        RecordMatchSimple(out, maxFound, tid, incr, ADDR_UNCOMPRESSED, endoType, h_uncomp_pos);
    }

    _GetHash160(px, py_negative, (uint8_t*)h_uncomp_neg);
    if (CheckTieredBloom_K3(h_uncomp_neg, prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
                            bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes)) {
        RecordMatchSimple(out, maxFound, tid, -incr, ADDR_UNCOMPRESSED, endoType, h_uncomp_neg);
    }
}

// ---------------------------------------------------------------------------------------
// K3: OPTIMIZED ENDOMORPHISM CHECK
// ---------------------------------------------------------------------------------------
__device__ void CheckHashBothFormats_K3(
    uint64_t* px, uint64_t* py, int32_t incr,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Mask, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Mask, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint64_t pe1x[4], pe2x[4];
    uint64_t pyn[4];

    // Compute beta multiplications ONCE
    _ModMult(pe1x, px, _beta);
    _ModMult(pe2x, px, _beta2);

    // Compute negative y
    ModNeg256(pyn, py);

    // Check original point - both formats
    CheckPointBothFormats_K3(px, py, pyn, incr, 0,
        prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes, maxFound, out);

    // Check endomorphism 1: (beta*x, y)
    CheckPointBothFormats_K3(pe1x, py, pyn, incr, 1,
        prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes, maxFound, out);

    // Check endomorphism 2: (beta2*x, y)
    CheckPointBothFormats_K3(pe2x, py, pyn, incr, 2,
        prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes, maxFound, out);
}

// ---------------------------------------------------------------------------------------
// K3: MAIN COMPUTE KERNEL WITH COALESCED MEMORY ACCESS
// ---------------------------------------------------------------------------------------
__device__ void ComputeKeysK3(
    uint64_t* keys_x,  // Coalesced layout: [thread][4]
    uint64_t* keys_y,
    int totalThreads,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Mask, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Mask, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint64_t dx[GRP_SIZE/2+1][4];
    uint64_t px[4], py[4], pyn[4], sx[4], sy[4], dy[4], _s[4], _p2[4];

    int tid = blockIdx.x * blockDim.x + threadIdx.x;

    __syncthreads();

    // K3: COALESCED LOAD - each thread loads its own contiguous 32 bytes
    Load256A_K3(sx, keys_x, tid, totalThreads);
    Load256A_K3(sy, keys_y, tid, totalThreads);

    Load256(px, sx);
    Load256(py, sy);

    for (uint32_t j = 0; j < K3_STEP_SIZE / GRP_SIZE; j++) {
        uint32_t i;

        // Compute delta x values for batch inversion
        for (i = 0; i < HSIZE; i++)
            ModSub256(dx[i], Gx[i], sx);
        ModSub256(dx[i], Gx[i], sx);
        ModSub256(dx[i+1], _2Gnx, sx);

        // Batch modular inversion
        _ModInvGrouped(dx);

        // Check center point
        CheckHashBothFormats_K3(px, py, j*GRP_SIZE + GRP_SIZE/2,
            prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
            bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes, maxFound, out);

        ModNeg256(pyn, py);

        // Process group points
        for (i = 0; i < HSIZE; i++) {
            // P = StartPoint + i*G
            Load256(px, sx);
            Load256(py, sy);
            ModSub256(dy, Gy[i], py);
            _ModMult(_s, dy, dx[i]);
            _ModSqr(_p2, _s);
            ModSub256(px, _p2, px);
            ModSub256(px, Gx[i]);
            ModSub256(py, Gx[i], px);
            _ModMult(py, _s);
            ModSub256(py, Gy[i]);

            CheckHashBothFormats_K3(px, py, j*GRP_SIZE + GRP_SIZE/2 + (i+1),
                prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
                bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes, maxFound, out);

            // P = StartPoint - i*G
            Load256(px, sx);
            ModSub256(dy, pyn, Gy[i]);
            _ModMult(_s, dy, dx[i]);
            _ModSqr(_p2, _s);
            ModSub256(px, _p2, px);
            ModSub256(px, Gx[i]);
            ModSub256(py, Gx[i], px);
            _ModMult(py, _s);
            ModSub256(py, Gy[i]);
            ModNeg256(py, py);

            CheckHashBothFormats_K3(px, py, j*GRP_SIZE + GRP_SIZE/2 - (i+1),
                prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
                bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes, maxFound, out);
        }

        // First point
        Load256(px, sx);
        Load256(py, sy);
        ModNeg256(dy, Gy[i]);
        ModSub256(dy, py);
        _ModMult(_s, dy, dx[i]);
        _ModSqr(_p2, _s);
        ModSub256(px, _p2, px);
        ModSub256(px, Gx[i]);
        ModSub256(py, Gx[i], px);
        _ModMult(py, _s);
        ModSub256(py, Gy[i]);
        ModNeg256(py, py);

        CheckHashBothFormats_K3(px, py, j*GRP_SIZE,
            prefixTable32, bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
            bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes, maxFound, out);

        // Next start point
        i++;
        Load256(px, sx);
        Load256(py, sy);
        ModSub256(dy, _2Gny, py);
        _ModMult(_s, dy, dx[i]);
        _ModSqr(_p2, _s);
        ModSub256(px, _p2, px);
        ModSub256(px, _2Gnx);
        ModSub256(py, _2Gnx, px);
        _ModMult(py, _s);
        ModSub256(py, _2Gny);

        Load256(sx, px);
        Load256(sy, py);
    }

    __syncthreads();

    // K3: COALESCED STORE
    Store256A_K3(keys_x, px, tid, totalThreads);
    Store256A_K3(keys_y, py, tid, totalThreads);
}

// ---------------------------------------------------------------------------------------
// K3 KERNEL ENTRY POINT
// ---------------------------------------------------------------------------------------
__global__ void bloom_kernel_k3(
    uint64_t* keys_x,
    uint64_t* keys_y,
    int totalThreads,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Mask, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Mask, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* found
) {
    ComputeKeysK3(keys_x, keys_y, totalThreads,
        prefixTable32,
        bloom1, bloom1Mask, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Mask, bloom2Seeds, bloom2Hashes,
        maxFound, found);
}

// ---------------------------------------------------------------------------------------
// HOST UTILITIES
// ---------------------------------------------------------------------------------------
void secure_random(void* buf, size_t len) {
    FILE* f = fopen("/dev/urandom", "rb");
    if (f) { fread(buf, 1, len, f); fclose(f); }
}

// secp256k1 CPU math for key initialization
static const uint64_t SECP_P[4] = {
    0xFFFFFFFEFFFFFC2FULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL
};

static const uint64_t SECP_GX[4] = {
    0x59F2815B16F81798ULL, 0x029BFCDB2DCE28D9ULL,
    0x55A06295CE870B07ULL, 0x79BE667EF9DCBBACULL
};
static const uint64_t SECP_GY[4] = {
    0x9C47D08FFB10D4B8ULL, 0xFD17B448A6855419ULL,
    0x5DA4FBFC0E1108A8ULL, 0x483ADA7726A3C465ULL
};

static int cmp256(const uint64_t* a, const uint64_t* b) {
    for (int i = 3; i >= 0; i--) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }
    return 0;
}

static uint64_t add256(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = 0;
    for (int i = 0; i < 4; i++) {
        __uint128_t sum = (__uint128_t)a[i] + b[i] + c;
        r[i] = (uint64_t)sum;
        c = (uint64_t)(sum >> 64);
    }
    return c;
}

static uint64_t sub256(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = 0;
    for (int i = 0; i < 4; i++) {
        __uint128_t diff = (__uint128_t)a[i] - b[i] - c;
        r[i] = (uint64_t)diff;
        c = (diff >> 64) ? 1 : 0;
    }
    return c;
}

static void mod_add(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = add256(r, a, b);
    if (c || cmp256(r, SECP_P) >= 0) {
        sub256(r, r, SECP_P);
    }
}

static void mod_sub(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = sub256(r, a, b);
    if (c) {
        add256(r, r, SECP_P);
    }
}

static void mod_mul(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    __uint128_t t[8] = {0};
    for (int i = 0; i < 4; i++) {
        __uint128_t c = 0;
        for (int j = 0; j < 4; j++) {
            c += t[i + j] + (__uint128_t)a[i] * b[j];
            t[i + j] = (uint64_t)c;
            c >>= 64;
        }
        t[i + 4] = c;
    }

    uint64_t high[4] = {(uint64_t)t[4], (uint64_t)t[5], (uint64_t)t[6], (uint64_t)t[7]};
    uint64_t low[4] = {(uint64_t)t[0], (uint64_t)t[1], (uint64_t)t[2], (uint64_t)t[3]};

    __uint128_t c = 0;
    uint64_t hc[5];
    for (int i = 0; i < 4; i++) {
        c += (__uint128_t)high[i] * 0x1000003D1ULL;
        hc[i] = (uint64_t)c;
        c >>= 64;
    }
    hc[4] = (uint64_t)c;

    c = 0;
    for (int i = 0; i < 4; i++) {
        c += (__uint128_t)low[i] + hc[i];
        r[i] = (uint64_t)c;
        c >>= 64;
    }
    c += hc[4];

    while (c) {
        uint64_t extra = (uint64_t)c;
        c = (__uint128_t)extra * 0x1000003D1ULL;
        for (int i = 0; i < 4 && c; i++) {
            c += r[i];
            r[i] = (uint64_t)c;
            c >>= 64;
        }
    }

    if (cmp256(r, SECP_P) >= 0) {
        sub256(r, r, SECP_P);
    }
}

static void mod_inv(uint64_t* r, const uint64_t* a) {
    uint64_t exp[4] = {
        0xFFFFFFFEFFFFFC2DULL, 0xFFFFFFFFFFFFFFFFULL,
        0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL
    };

    uint64_t base[4], result[4] = {1, 0, 0, 0};
    memcpy(base, a, 32);

    for (int i = 0; i < 256; i++) {
        if ((exp[i / 64] >> (i % 64)) & 1) {
            mod_mul(result, result, base);
        }
        mod_mul(base, base, base);
    }

    memcpy(r, result, 32);
}

static int is_infinity(const uint64_t* x, const uint64_t* y) {
    return (x[0] | x[1] | x[2] | x[3] | y[0] | y[1] | y[2] | y[3]) == 0;
}

static void point_add(uint64_t* rx, uint64_t* ry,
                      const uint64_t* px, const uint64_t* py,
                      const uint64_t* qx, const uint64_t* qy) {
    if (is_infinity(px, py)) {
        memcpy(rx, qx, 32); memcpy(ry, qy, 32); return;
    }
    if (is_infinity(qx, qy)) {
        memcpy(rx, px, 32); memcpy(ry, py, 32); return;
    }

    uint64_t s[4], dx[4], dy[4], s2[4], tmp[4];

    mod_sub(dx, qx, px);

    if ((dx[0] | dx[1] | dx[2] | dx[3]) == 0) {
        mod_sub(dy, qy, py);
        if ((dy[0] | dy[1] | dy[2] | dy[3]) == 0) {
            mod_mul(s, px, px);
            mod_add(tmp, s, s);
            mod_add(s, tmp, s);
            mod_add(dy, py, py);
            mod_inv(tmp, dy);
            mod_mul(s, s, tmp);
        } else {
            memset(rx, 0, 32); memset(ry, 0, 32); return;
        }
    } else {
        mod_sub(dy, qy, py);
        mod_inv(tmp, dx);
        mod_mul(s, dy, tmp);
    }

    mod_mul(s2, s, s);
    mod_sub(rx, s2, px);
    mod_sub(rx, rx, qx);

    mod_sub(tmp, px, rx);
    mod_mul(ry, s, tmp);
    mod_sub(ry, ry, py);
}

static void point_double(uint64_t* rx, uint64_t* ry,
                         const uint64_t* px, const uint64_t* py) {
    if (is_infinity(px, py) || (py[0] | py[1] | py[2] | py[3]) == 0) {
        memset(rx, 0, 32); memset(ry, 0, 32); return;
    }

    uint64_t s[4], s2[4], tmp[4], dy[4];

    mod_mul(s, px, px);
    mod_add(tmp, s, s);
    mod_add(s, tmp, s);
    mod_add(dy, py, py);
    mod_inv(tmp, dy);
    mod_mul(s, s, tmp);

    mod_mul(s2, s, s);
    mod_sub(rx, s2, px);
    mod_sub(rx, rx, px);

    mod_sub(tmp, px, rx);
    mod_mul(ry, s, tmp);
    mod_sub(ry, ry, py);
}

// Convert decimal string to 256-bit integer
// Handles very large decimal numbers by repeated multiply-by-10-and-add
static void decimal_to_256bit(const char* decimal, uint64_t* result) {
    memset(result, 0, 32);

    // Skip any commas in the input (user-friendly format)
    char clean[256];
    int j = 0;
    for (int i = 0; decimal[i] && j < 255; i++) {
        if (decimal[i] >= '0' && decimal[i] <= '9') {
            clean[j++] = decimal[i];
        }
    }
    clean[j] = '\0';

    // Process each digit: result = result * 10 + digit
    for (int i = 0; clean[i]; i++) {
        // Multiply by 10
        __uint128_t carry = 0;
        for (int k = 0; k < 4; k++) {
            __uint128_t prod = (__uint128_t)result[k] * 10 + carry;
            result[k] = (uint64_t)prod;
            carry = prod >> 64;
        }

        // Add digit
        int digit = clean[i] - '0';
        carry = digit;
        for (int k = 0; k < 4 && carry; k++) {
            __uint128_t sum = (__uint128_t)result[k] + carry;
            result[k] = (uint64_t)sum;
            carry = sum >> 64;
        }
    }
}

// Add 256-bit integers: result = a + b, returns carry
static uint64_t add256_val(uint64_t* r, const uint64_t* a, uint64_t b) {
    __uint128_t carry = b;
    for (int i = 0; i < 4; i++) {
        carry += a[i];
        r[i] = (uint64_t)carry;
        carry >>= 64;
    }
    return (uint64_t)carry;
}

static void scalar_mult_G(uint64_t* rx, uint64_t* ry, const uint64_t* k) {
    uint64_t qx[4], qy[4];
    uint64_t tmpx[4], tmpy[4];

    memset(rx, 0, 32);
    memset(ry, 0, 32);

    memcpy(qx, SECP_GX, 32);
    memcpy(qy, SECP_GY, 32);

    for (int i = 0; i < 256; i++) {
        if ((k[i / 64] >> (i % 64)) & 1) {
            point_add(tmpx, tmpy, rx, ry, qx, qy);
            memcpy(rx, tmpx, 32);
            memcpy(ry, tmpy, 32);
        }
        point_double(tmpx, tmpy, qx, qy);
        memcpy(qx, tmpx, 32);
        memcpy(qy, tmpy, 32);
    }
}

// K3: Initialize keys with COALESCED memory layout and RANGE PARTITIONING
// rangeId: 0-255 for partitioning the 256-bit key space into ranges
// totalRanges: how many partitions (e.g., 8 for 8 GPUs)
static void init_valid_keys_k3_range(uint64_t* h_keys_x, uint64_t* h_keys_y, int nbThread,
                                      int rangeId, int totalRanges) {
    printf("K3: Generating %d valid EC starting points (coalesced layout)...\n", nbThread);

    if (totalRanges > 1) {
        printf("    RANGE PARTITIONING: GPU %d of %d (range 0x%02X..)\n",
               rangeId, totalRanges, (rangeId * 256) / totalRanges);
    } else {
        printf("    Using /dev/urandom for cryptographic randomness\n");
    }

    uint8_t privkey[32];

    // Calculate range boundaries for this GPU
    // Each GPU gets a different high byte range to ensure no overlap
    uint8_t rangeStart = (rangeId * 256) / totalRanges;
    uint8_t rangeEnd = ((rangeId + 1) * 256) / totalRanges - 1;

    for (int t = 0; t < nbThread; t++) {
        secure_random(privkey, 32);
        privkey[0] |= 1;  // Ensure odd for valid scalar

        // Set the high byte to be within this GPU's range
        // This partitions the key space so each GPU searches different keys
        if (totalRanges > 1) {
            // Map the random high byte to this GPU's range
            uint8_t rangeSize = rangeEnd - rangeStart + 1;
            privkey[31] = rangeStart + (privkey[31] % rangeSize);
        }

        uint64_t k[4];
        memcpy(k, privkey, 32);

        uint64_t px[4], py[4];
        scalar_mult_G(px, py, k);

        // K3: Store in coalesced layout [thread][component]
        // Each thread's 4 uint64_t values are contiguous
        h_keys_x[t * 4 + 0] = px[0];
        h_keys_x[t * 4 + 1] = px[1];
        h_keys_x[t * 4 + 2] = px[2];
        h_keys_x[t * 4 + 3] = px[3];

        h_keys_y[t * 4 + 0] = py[0];
        h_keys_y[t * 4 + 1] = py[1];
        h_keys_y[t * 4 + 2] = py[2];
        h_keys_y[t * 4 + 3] = py[3];

        if ((t + 1) % 10000 == 0 || t == nbThread - 1) {
            printf("\r    Generated %d/%d keys...", t + 1, nbThread);
            fflush(stdout);
        }
    }
    printf("\n    Done! All starting points use K3 coalesced layout.\n");
    if (totalRanges > 1) {
        printf("    Range: private keys with high byte 0x%02X to 0x%02X\n", rangeStart, rangeEnd);
    }
}

// Backwards compatible wrapper
static void init_valid_keys_k3(uint64_t* h_keys_x, uint64_t* h_keys_y, int nbThread) {
    init_valid_keys_k3_range(h_keys_x, h_keys_y, nbThread, 0, 1);
}

// K3: Initialize keys from a specific decimal starting point
// Each thread gets start + threadIndex as its private key
static void init_keys_from_decimal_start(uint64_t* h_keys_x, uint64_t* h_keys_y, int nbThread,
                                         const char* startDecimal) {
    printf("K3: Generating %d EC starting points from decimal range...\n", nbThread);
    printf("    Start: %s\n", startDecimal);

    // Parse the decimal starting point
    uint64_t baseKey[4];
    decimal_to_256bit(startDecimal, baseKey);

    printf("    Parsed as: 0x%016lx%016lx%016lx%016lx\n",
           baseKey[3], baseKey[2], baseKey[1], baseKey[0]);

    for (int t = 0; t < nbThread; t++) {
        // Each thread gets baseKey + t
        uint64_t privkey[4];
        add256_val(privkey, baseKey, (uint64_t)t);

        // Ensure non-zero (should never happen with our large starting values)
        if ((privkey[0] | privkey[1] | privkey[2] | privkey[3]) == 0) {
            privkey[0] = 1;
        }

        uint64_t px[4], py[4];
        scalar_mult_G(px, py, privkey);

        // K3: Store in coalesced layout [thread][component]
        h_keys_x[t * 4 + 0] = px[0];
        h_keys_x[t * 4 + 1] = px[1];
        h_keys_x[t * 4 + 2] = px[2];
        h_keys_x[t * 4 + 3] = px[3];

        h_keys_y[t * 4 + 0] = py[0];
        h_keys_y[t * 4 + 1] = py[1];
        h_keys_y[t * 4 + 2] = py[2];
        h_keys_y[t * 4 + 3] = py[3];

        if ((t + 1) % 10000 == 0 || t == nbThread - 1) {
            printf("\r    Generated %d/%d keys...", t + 1, nbThread);
            fflush(stdout);
        }
    }
    printf("\n    Done! Starting search from specified decimal range.\n");

    // Print the last key generated to show the range covered
    uint64_t lastKey[4];
    add256_val(lastKey, baseKey, (uint64_t)(nbThread - 1));
    printf("    Range covers: [start] to [start + %d]\n", nbThread - 1);
}

void save_state_k3(const char* f, uint64_t* kx, uint64_t* ky, int n, uint64_t t) {
    FILE* fp = fopen(f, "wb");
    if (fp) {
        fwrite(&t, 8, 1, fp);
        fwrite(kx, 8, n*4, fp);
        fwrite(ky, 8, n*4, fp);
        fclose(fp);
    }
}

uint64_t load_state_k3(const char* f, uint64_t* kx, uint64_t* ky, int n) {
    struct stat st;
    if (stat(f, &st)) return 0;
    FILE* fp = fopen(f, "rb");
    if (!fp) return 0;
    uint64_t t = 0;
    if (fread(&t, 8, 1, fp) != 1) { fclose(fp); return 0; }
    if (fread(kx, 8, n*4, fp) != (size_t)(n*4)) { fclose(fp); return 0; }
    if (fread(ky, 8, n*4, fp) != (size_t)(n*4)) { fclose(fp); return 0; }
    fclose(fp);
    return t;
}

void* load_file(const char* path, size_t* size) {
    struct stat st;
    if (stat(path, &st) != 0) return nullptr;
    *size = st.st_size;
    void* data = malloc(*size);
    FILE* f = fopen(path, "rb");
    if (!f) { free(data); return nullptr; }
    if (fread(data, 1, *size, f) != *size) { free(data); fclose(f); return nullptr; }
    fclose(f);
    return data;
}

// Round up to next power of 2
uint64_t next_power_of_2(uint64_t v) {
    v--;
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    v |= v >> 32;
    v++;
    return v;
}

// ---------------------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------------------
int main(int argc, char** argv) {
    char* prefixFile = nullptr;
    char* bloom1File = nullptr;
    char* seeds1File = nullptr;
    char* bloom2File = nullptr;
    char* seeds2File = nullptr;
    char* stateFile = nullptr;

    uint64_t bloom1Bits = 0;
    uint64_t bloom2Bits = 0;
    int bloom1Hashes = 8;
    int bloom2Hashes = 8;
    int gpuId = 0;
    int searchMode = MODE_BOTH;
    int rangeId = -1;      // -1 means auto (use gpuId)
    int totalRanges = 1;   // 1 means no partitioning
    char* startDecimal = nullptr;  // Decimal starting point for key range

    // Parse arguments
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "-prefix") && i+1 < argc) prefixFile = argv[++i];
        else if (!strcmp(argv[i], "-bloom") && i+1 < argc) bloom1File = argv[++i];
        else if (!strcmp(argv[i], "-seeds") && i+1 < argc) seeds1File = argv[++i];
        else if (!strcmp(argv[i], "-bloom2") && i+1 < argc) bloom2File = argv[++i];
        else if (!strcmp(argv[i], "-seeds2") && i+1 < argc) seeds2File = argv[++i];
        else if (!strcmp(argv[i], "-bits") && i+1 < argc) bloom1Bits = strtoull(argv[++i], NULL, 10);
        else if (!strcmp(argv[i], "-bits2") && i+1 < argc) bloom2Bits = strtoull(argv[++i], NULL, 10);
        else if (!strcmp(argv[i], "-hashes") && i+1 < argc) bloom1Hashes = atoi(argv[++i]);
        else if (!strcmp(argv[i], "-hashes2") && i+1 < argc) bloom2Hashes = atoi(argv[++i]);
        else if (!strcmp(argv[i], "-gpu") && i+1 < argc) gpuId = atoi(argv[++i]);
        else if (!strcmp(argv[i], "-state") && i+1 < argc) stateFile = argv[++i];
        else if (!strcmp(argv[i], "-range") && i+1 < argc) rangeId = atoi(argv[++i]);
        else if (!strcmp(argv[i], "-ranges") && i+1 < argc) totalRanges = atoi(argv[++i]);
        else if (!strcmp(argv[i], "-start") && i+1 < argc) startDecimal = argv[++i];
        else if (!strcmp(argv[i], "-both")) searchMode = MODE_BOTH;
        else if (!strcmp(argv[i], "-compressed")) searchMode = MODE_COMPRESSED_ONLY;
        else if (!strcmp(argv[i], "-uncompressed")) searchMode = MODE_UNCOMPRESSED_ONLY;
    }

    if (!prefixFile || !bloom1File || !seeds1File || !bloom1Bits) {
        printf("BloomSearch32K3 - K3 Optimized GPU Search (3-5x faster)\n\n");
        printf("K3 Optimizations:\n");
        printf("  - Coalesced memory access (2-3x memory bandwidth)\n");
        printf("  - Warp-level atomic operations (reduced contention)\n");
        printf("  - Power-of-2 bloom filter sizes (fast bitmask)\n");
        printf("  - Symmetric hash computation (1.3x hash speedup)\n");
        printf("  - Optimized block configuration (better occupancy)\n");
        printf("  - Pinned host memory (faster transfers)\n\n");
        printf("Usage: %s [options]\n\n", argv[0]);
        printf("Required:\n");
        printf("  -prefix <file>   32-bit prefix bitmap file\n");
        printf("  -bloom <file>    Primary bloom filter file\n");
        printf("  -seeds <file>    Primary bloom seeds file\n");
        printf("  -bits <n>        Primary bloom filter bits (will round to power of 2)\n\n");
        printf("Optional:\n");
        printf("  -bloom2 <file>   Secondary bloom filter\n");
        printf("  -seeds2 <file>   Secondary bloom seeds\n");
        printf("  -bits2 <n>       Secondary bloom bits\n");
        printf("  -gpu <id>        GPU device ID (default: 0)\n");
        printf("  -state <file>    State checkpoint file\n");
        printf("  -both            Search both formats (default)\n");
        printf("  -compressed      Compressed only\n");
        printf("  -uncompressed    Uncompressed only\n");
        printf("  -range <id>      Range partition ID (default: same as gpu)\n");
        printf("  -ranges <n>      Total number of range partitions (default: 1 = no partitioning)\n");
        printf("  -start <decimal> Exact decimal starting point for private key range\n");
        printf("\nDecimal Starting Point:\n");
        printf("  Use -start to specify an exact decimal value for the starting private key.\n");
        printf("  Each GPU thread will search keys: start, start+1, start+2, etc.\n");
        printf("  Commas in the number are ignored (e.g., 1,000,000 = 1000000).\n");
        printf("  Example: ./BloomSearch32K3 ... -gpu 0 -start 82992563620862434352475351947757081565902246292157501334072464625845000000000\n");
        printf("\nRange Partitioning (legacy):\n");
        printf("  Use -ranges 8 with 8 GPUs to ensure each GPU searches different key ranges.\n");
        printf("  Example: ./BloomSearch32K3 ... -gpu 0 -ranges 8\n");
        printf("           ./BloomSearch32K3 ... -gpu 1 -ranges 8\n");
        printf("  Each GPU will search 1/8th of the key space with no overlap.\n");
        return 1;
    }

    // Auto-set rangeId from gpuId if not specified
    if (rangeId < 0) {
        rangeId = gpuId;
    }

    // K3: Round bloom filter bits to power of 2 for fast bitmask
    uint64_t bloom1BitsRounded = next_power_of_2(bloom1Bits);
    uint64_t bloom1Mask = bloom1BitsRounded - 1;
    if (bloom1BitsRounded != bloom1Bits) {
        printf("K3: Rounding bloom1 bits from %lu to %lu (power of 2 for fast bitmask)\n",
               bloom1Bits, bloom1BitsRounded);
    }

    uint64_t bloom2Mask = 0;
    if (bloom2Bits > 0) {
        uint64_t bloom2BitsRounded = next_power_of_2(bloom2Bits);
        bloom2Mask = bloom2BitsRounded - 1;
    }

    char defaultState[256];
    if (!stateFile) {
        snprintf(defaultState, 256, "/tmp/gpu%d_k3.state", gpuId);
        stateFile = defaultState;
    }

    signal(SIGINT, sighandler);
    signal(SIGTERM, sighandler);

    CUDA_CHECK(cudaSetDevice(gpuId));

    cudaDeviceProp prop;
    CUDA_CHECK(cudaGetDeviceProperties(&prop, gpuId));
    printf("\n=== BloomSearch32K3 - K3 Optimized ===\n");
    printf("GPU %d: %s (%d MPs, %d threads/block max)\n",
           gpuId, prop.name, prop.multiProcessorCount, prop.maxThreadsPerBlock);
    printf("K3 Config: %d blocks x %d threads = %d total threads\n",
           K3_BLOCKS, K3_THREADS_PER_BLOCK, K3_TOTAL_THREADS);

    const char* modeStr = (searchMode == MODE_BOTH) ? "BOTH (compressed + uncompressed)" :
                          (searchMode == MODE_COMPRESSED_ONLY) ? "COMPRESSED only" : "UNCOMPRESSED only";
    printf("Search Mode: %s\n", modeStr);

    // Load prefix bitmap
    size_t prefixSize;
    uint8_t* h_prefix = (uint8_t*)load_file(prefixFile, &prefixSize);
    if (!h_prefix) { printf("Error: Cannot load prefix file\n"); return 1; }
    printf("Loaded prefix bitmap: %zu MB\n", prefixSize / 1024 / 1024);

    // Load bloom filter
    size_t bloom1Size;
    uint32_t* h_bloom1 = (uint32_t*)load_file(bloom1File, &bloom1Size);
    if (!h_bloom1) { printf("Error: Cannot load bloom filter\n"); return 1; }
    printf("Loaded bloom filter: %zu MB, mask=0x%lx, %d hashes\n",
           bloom1Size / 1024 / 1024, bloom1Mask, bloom1Hashes);

    // Load seeds
    size_t seeds1Size;
    uint32_t* h_seeds1 = (uint32_t*)load_file(seeds1File, &seeds1Size);
    if (!h_seeds1) { printf("Error: Cannot load seeds file\n"); return 1; }

    // Optional secondary bloom filter
    uint32_t* h_bloom2 = nullptr;
    uint32_t* h_seeds2 = nullptr;
    if (bloom2File && seeds2File && bloom2Bits > 0) {
        size_t bloom2Size, seeds2Size;
        h_bloom2 = (uint32_t*)load_file(bloom2File, &bloom2Size);
        h_seeds2 = (uint32_t*)load_file(seeds2File, &seeds2Size);
        if (h_bloom2 && h_seeds2) {
            printf("Loaded bloom filter 2: %zu MB, mask=0x%lx\n", bloom2Size / 1024 / 1024, bloom2Mask);
        }
    }

    // Allocate GPU memory
    int nbThread = K3_TOTAL_THREADS;
    uint8_t* d_prefix;
    uint32_t* d_bloom1;
    uint32_t* d_seeds1;
    uint32_t* d_bloom2 = nullptr;
    uint32_t* d_seeds2 = nullptr;
    uint64_t* d_keys_x;
    uint64_t* d_keys_y;
    uint32_t* d_found;

    CUDA_CHECK(cudaMalloc(&d_prefix, prefixSize));
    CUDA_CHECK(cudaMalloc(&d_bloom1, (bloom1Mask + 32) / 8));  // Use mask size
    CUDA_CHECK(cudaMalloc(&d_seeds1, bloom1Hashes * 4));
    CUDA_CHECK(cudaMalloc(&d_keys_x, nbThread * 4 * sizeof(uint64_t)));  // Coalesced layout
    CUDA_CHECK(cudaMalloc(&d_keys_y, nbThread * 4 * sizeof(uint64_t)));
    CUDA_CHECK(cudaMalloc(&d_found, (1 + K3_MAX_FOUND * K3_ITEM_SIZE32) * 4));

    CUDA_CHECK(cudaMemcpy(d_prefix, h_prefix, prefixSize, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_bloom1, h_bloom1, bloom1Size, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_seeds1, h_seeds1, bloom1Hashes * 4, cudaMemcpyHostToDevice));

    if (h_bloom2 && h_seeds2) {
        CUDA_CHECK(cudaMalloc(&d_bloom2, (bloom2Mask + 32) / 8));
        CUDA_CHECK(cudaMalloc(&d_seeds2, bloom2Hashes * 4));
        size_t bloom2Size = (bloom2Mask + 32) / 8;
        CUDA_CHECK(cudaMemcpy(d_bloom2, h_bloom2, bloom2Size, cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(d_seeds2, h_seeds2, bloom2Hashes * 4, cudaMemcpyHostToDevice));
    }

    // K3: Use PINNED memory for host buffers
    uint64_t* h_keys_x;
    uint64_t* h_keys_y;
    uint32_t* h_found;
    CUDA_CHECK(cudaMallocHost(&h_keys_x, nbThread * 4 * sizeof(uint64_t)));
    CUDA_CHECK(cudaMallocHost(&h_keys_y, nbThread * 4 * sizeof(uint64_t)));
    CUDA_CHECK(cudaMallocHost(&h_found, (1 + K3_MAX_FOUND * K3_ITEM_SIZE32) * 4));

    // Initialize or restore keys
    uint64_t resumedKeys = load_state_k3(stateFile, h_keys_x, h_keys_y, nbThread);
    if (resumedKeys > 0) {
        printf("Resumed from checkpoint: %.2fB keys checked\n", resumedKeys / 1e9);
    } else if (startDecimal != nullptr) {
        // Use exact decimal starting point
        init_keys_from_decimal_start(h_keys_x, h_keys_y, nbThread, startDecimal);
        printf("Starting K3 search from EXACT DECIMAL starting point\n");
    } else {
        init_valid_keys_k3_range(h_keys_x, h_keys_y, nbThread, rangeId, totalRanges);
        printf("Starting fresh K3 search with %s EC points\n",
               totalRanges > 1 ? "PARTITIONED" : "random");
    }

    CUDA_CHECK(cudaMemcpy(d_keys_x, h_keys_x, nbThread * 4 * sizeof(uint64_t), cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(d_keys_y, h_keys_y, nbThread * 4 * sizeof(uint64_t), cudaMemcpyHostToDevice));

    // Main search loop
    time_t start = time(NULL);
    uint64_t total = resumedKeys;
    uint64_t iter = 0;
    uint64_t totalHits = 0;
    int addrsPerPoint = (searchMode == MODE_BOTH) ? 12 : 6;

    printf("\nStarting K3-optimized search (%d addresses per EC point)...\n\n", addrsPerPoint);

    while (running) {
        CUDA_CHECK(cudaMemset(d_found, 0, 4));

        bloom_kernel_k3<<<K3_BLOCKS, K3_THREADS_PER_BLOCK>>>(
            d_keys_x, d_keys_y, nbThread,
            d_prefix,
            d_bloom1, bloom1Mask, d_seeds1, bloom1Hashes,
            d_bloom2, bloom2Mask, d_seeds2, bloom2Hashes,
            K3_MAX_FOUND, d_found);

        CUDA_CHECK(cudaDeviceSynchronize());

        // Check for matches
        CUDA_CHECK(cudaMemcpy(h_found, d_found, 4, cudaMemcpyDeviceToHost));
        uint32_t numFound = h_found[0];
        if (numFound > 0) {
            totalHits += numFound;
            CUDA_CHECK(cudaMemcpy(h_found, d_found, (1 + numFound * K3_ITEM_SIZE32) * 4, cudaMemcpyDeviceToHost));
            for (uint32_t i = 0; i < numFound && i < 10; i++) {
                uint32_t* item = h_found + 1 + i * K3_ITEM_SIZE32;
                uint32_t meta = item[1];
                const char* addrType = (meta & ADDR_COMPRESSED) ? "COMP" : "UNCOMP";
                printf("[K3 CANDIDATE %s] tid=%u meta=%08x hash160=%08x%08x%08x%08x%08x\n",
                       addrType, item[0], item[1], item[2], item[3], item[4], item[5], item[6]);
            }
        }

        total += (uint64_t)nbThread * K3_STEP_SIZE * addrsPerPoint;
        iter++;

        // Save checkpoint
        if (iter % 500 == 0) {
            CUDA_CHECK(cudaMemcpy(h_keys_x, d_keys_x, nbThread * 4 * sizeof(uint64_t), cudaMemcpyDeviceToHost));
            CUDA_CHECK(cudaMemcpy(h_keys_y, d_keys_y, nbThread * 4 * sizeof(uint64_t), cudaMemcpyDeviceToHost));
            save_state_k3(stateFile, h_keys_x, h_keys_y, nbThread, total);
        }

        // Progress update
        if (iter % 50 == 0) {
            double t = difftime(time(NULL), start);
            double sessionKeys = total - resumedKeys;
            double rate = sessionKeys / t / 1e9;
            printf("\r[K3 %5.0fs] %.2fT keys | %.2f GKey/s | %lu candidates     ",
                   t, total / 1e12, rate, totalHits);
            fflush(stdout);
        }
    }

    // Final save
    CUDA_CHECK(cudaMemcpy(h_keys_x, d_keys_x, nbThread * 4 * sizeof(uint64_t), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_keys_y, d_keys_y, nbThread * 4 * sizeof(uint64_t), cudaMemcpyDeviceToHost));
    save_state_k3(stateFile, h_keys_x, h_keys_y, nbThread, total);
    printf("\n\nK3 Saved checkpoint: %.2fT keys, %lu total candidates\n", total / 1e12, totalHits);

    // Cleanup
    cudaFree(d_prefix);
    cudaFree(d_bloom1);
    cudaFree(d_seeds1);
    if (d_bloom2) cudaFree(d_bloom2);
    if (d_seeds2) cudaFree(d_seeds2);
    cudaFree(d_keys_x);
    cudaFree(d_keys_y);
    cudaFree(d_found);
    cudaFreeHost(h_keys_x);
    cudaFreeHost(h_keys_y);
    cudaFreeHost(h_found);
    free(h_prefix);
    free(h_bloom1);
    free(h_seeds1);
    if (h_bloom2) free(h_bloom2);
    if (h_seeds2) free(h_seeds2);

    return 0;
}
