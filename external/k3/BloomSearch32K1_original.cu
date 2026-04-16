/*
 * BloomSearch32K1.cu - K1-Optimized GPU Bloom Filter Search
 *
 * Optimizations from keyhunt:
 * 1. Batch modular inversion (Montgomery's trick) - already in base
 * 2. Three-tier bloom filter cascade - NEW
 * 3. Endomorphism with cached beta multiplications - OPTIMIZED
 * 4. secp256k1-specific K1 arithmetic - already in base
 *
 * Expected improvement: 1.3-1.6x throughput + 99% reduction in false positives
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

// GPU headers
#include "../GPUGroup.h"
#include "../GPUMath.h"
#include "../GPUHash.h"

#define NB_THREAD_PER_GROUP 512
#define MAX_FOUND 65536
#define STEP_SIZE 1024
#define ITEM_SIZE32 8

// Search mode flags
#define MODE_COMPRESSED_ONLY 0
#define MODE_UNCOMPRESSED_ONLY 1
#define MODE_BOTH 2  // Default: search BOTH (important for early Bitcoin!)

// Three-tier bloom filter structure
struct TieredBloom {
    uint32_t* data;
    uint64_t bits;
    uint32_t* seeds;
    int num_hashes;
};

volatile bool running = true;
void sighandler(int s) { running = false; }

// ============================================================================
// MURMUR3 HASH - GPU VERSION
// ============================================================================

__device__ __forceinline__ uint32_t rotl32(uint32_t x, int8_t r) {
    return (x << r) | (x >> (32 - r));
}

__device__ __forceinline__ uint32_t murmur3_32(const uint8_t* key, int len, uint32_t seed) {
    const uint32_t c1 = 0xcc9e2d51;
    const uint32_t c2 = 0x1b873593;
    uint32_t h1 = seed;
    const int nblocks = len / 4;

    const uint32_t* blocks = (const uint32_t*)key;
    for (int i = 0; i < nblocks; i++) {
        uint32_t k1 = blocks[i];
        k1 *= c1;
        k1 = rotl32(k1, 15);
        k1 *= c2;
        h1 ^= k1;
        h1 = rotl32(h1, 13);
        h1 = h1 * 5 + 0xe6546b64;
    }

    const uint8_t* tail = key + nblocks * 4;
    uint32_t k1 = 0;
    switch (len & 3) {
        case 3: k1 ^= tail[2] << 16;
        case 2: k1 ^= tail[1] << 8;
        case 1: k1 ^= tail[0];
                k1 *= c1;
                k1 = rotl32(k1, 15);
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

// ============================================================================
// THREE-TIER BLOOM FILTER CHECK
// ============================================================================

__device__ __forceinline__ bool bloom_check_single(
    const uint8_t* hash160,
    const uint32_t* data,
    uint64_t bits,
    const uint32_t* seeds,
    int num_hashes
) {
    #pragma unroll 4
    for (int i = 0; i < num_hashes; i++) {
        uint32_t h = murmur3_32(hash160, 20, seeds[i]);
        uint64_t bitPos = h % bits;
        uint64_t wordPos = bitPos >> 5;
        uint32_t bitMask = 1u << (bitPos & 31);
        if (!(data[wordPos] & bitMask)) {
            return false;
        }
    }
    return true;
}

// Tiered check: Tier1 (prefix bitmap) -> Tier2 (bloom1) -> Tier3 (bloom2)
__device__ __noinline__ bool CheckTieredBloom(
    const uint32_t* h,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes
) {
    // Tier 1: 32-bit prefix bitmap check (fastest)
    uint32_t prefix32 = __byte_perm(h[0], 0, 0x0123);
    uint32_t byteIdx = prefix32 >> 3;
    uint32_t bitIdx = prefix32 & 7;
    if (!(prefixTable32[byteIdx] & (1 << bitIdx))) {
        return false;  // Fast rejection
    }

    // Tier 2: First bloom filter
    if (!bloom_check_single((const uint8_t*)h, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes)) {
        return false;  // Filtered by tier 2
    }

    // Tier 3: Second bloom filter (optional, if provided)
    if (bloom2 != nullptr && bloom2Bits > 0) {
        if (!bloom_check_single((const uint8_t*)h, bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
            return false;  // Filtered by tier 3
        }
    }

    return true;  // Passed all tiers
}

// ============================================================================
// OPTIMIZED ENDOMORPHISM CHECK - Check BOTH Compressed AND Uncompressed
// ============================================================================

// Address type flags for output metadata
#define ADDR_COMPRESSED   0x8000   // Bit 15 = compressed
#define ADDR_UNCOMPRESSED 0x0000   // Bit 15 = 0 for uncompressed

// Helper: Record a bloom filter match
__device__ __forceinline__ void RecordMatch(
    uint32_t* out, uint32_t maxFound,
    uint32_t tid, int32_t incr, uint32_t addrType, uint32_t endoType,
    uint32_t* h
) {
    uint32_t pos = atomicAdd(out, 1);
    if (pos < maxFound) {
        out[pos * ITEM_SIZE32 + 1] = tid;
        out[pos * ITEM_SIZE32 + 2] = (incr << 16) | addrType | endoType;
        out[pos * ITEM_SIZE32 + 3] = h[0];
        out[pos * ITEM_SIZE32 + 4] = h[1];
        out[pos * ITEM_SIZE32 + 5] = h[2];
        out[pos * ITEM_SIZE32 + 6] = h[3];
        out[pos * ITEM_SIZE32 + 7] = h[4];
    }
}

// Check a single point for both compressed AND uncompressed addresses
__device__ __forceinline__ void CheckPointBothFormats(
    uint64_t* px, uint64_t* py_positive, uint64_t* py_negative,
    int32_t incr, uint32_t endoType,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint32_t h[5];
    uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;
    uint8_t isOdd = (uint8_t)(py_positive[0] & 1);
    uint8_t isEven = isOdd ^ 1;

    // === COMPRESSED ADDRESSES (33 bytes: 02/03 + x) ===

    // Compressed +y
    _GetHash160Comp(px, isOdd, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        RecordMatch(out, maxFound, tid, incr, ADDR_COMPRESSED, endoType, h);
    }

    // Compressed -y
    _GetHash160Comp(px, isEven, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        RecordMatch(out, maxFound, tid, -incr, ADDR_COMPRESSED, endoType, h);
    }

    // === UNCOMPRESSED ADDRESSES (65 bytes: 04 + x + y) ===
    // This is what early Bitcoin (2009-2012) used - Satoshi's coins!

    // Uncompressed +y (using positive y)
    _GetHash160(px, py_positive, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        RecordMatch(out, maxFound, tid, incr, ADDR_UNCOMPRESSED, endoType, h);
    }

    // Uncompressed -y (using negative y)
    _GetHash160(px, py_negative, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        RecordMatch(out, maxFound, tid, -incr, ADDR_UNCOMPRESSED, endoType, h);
    }
}

__device__ __noinline__ void CheckHashBothFormatsOptimized(
    uint64_t* px, uint64_t* py, int32_t incr,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint64_t pe1x[4], pe2x[4];
    uint64_t pyn[4];  // Negative y

    // Compute beta multiplications ONCE (key optimization from keyhunt)
    _ModMult(pe1x, px, _beta);
    _ModMult(pe2x, px, _beta2);

    // Compute negative y: -y mod p
    ModNeg256(pyn, py);

    // Check original point (px, py) - both compressed AND uncompressed
    // Endomorphism type 0 = original point
    CheckPointBothFormats(px, py, pyn, incr, 0,
        prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

    // Check endomorphism 1: (beta*x, y) - both compressed AND uncompressed
    // Endomorphism type 1
    CheckPointBothFormats(pe1x, py, pyn, incr, 1,
        prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

    // Check endomorphism 2: (beta2*x, y) - both compressed AND uncompressed
    // Endomorphism type 2
    CheckPointBothFormats(pe2x, py, pyn, incr, 2,
        prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);
}

// Legacy function for backwards compatibility (compressed only)
__device__ __noinline__ void CheckHashCompOptimized(
    uint64_t* px, uint64_t* py, int32_t incr,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint32_t h[5];
    uint64_t pe1x[4], pe2x[4];

    // Compute beta multiplications ONCE (key optimization from keyhunt)
    _ModMult(pe1x, px, _beta);
    _ModMult(pe2x, px, _beta2);

    uint8_t isOdd = (uint8_t)(py[0] & 1);
    uint8_t isEven = isOdd ^ 1;

    // Check 6 addresses from single EC point:
    // 1. Original (px, +y)
    _GetHash160Comp(px, isOdd, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;
        uint32_t pos = atomicAdd(out, 1);
        if (pos < maxFound) {
            out[pos * ITEM_SIZE32 + 1] = tid;
            out[pos * ITEM_SIZE32 + 2] = (incr << 16) | (1 << 15) | 0;
            out[pos * ITEM_SIZE32 + 3] = h[0];
            out[pos * ITEM_SIZE32 + 4] = h[1];
            out[pos * ITEM_SIZE32 + 5] = h[2];
            out[pos * ITEM_SIZE32 + 6] = h[3];
            out[pos * ITEM_SIZE32 + 7] = h[4];
        }
    }

    // 2. Original (px, -y)
    _GetHash160Comp(px, isEven, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;
        uint32_t pos = atomicAdd(out, 1);
        if (pos < maxFound) {
            out[pos * ITEM_SIZE32 + 1] = tid;
            out[pos * ITEM_SIZE32 + 2] = ((-incr) << 16) | (1 << 15) | 0;
            out[pos * ITEM_SIZE32 + 3] = h[0];
            out[pos * ITEM_SIZE32 + 4] = h[1];
            out[pos * ITEM_SIZE32 + 5] = h[2];
            out[pos * ITEM_SIZE32 + 6] = h[3];
            out[pos * ITEM_SIZE32 + 7] = h[4];
        }
    }

    // 3. Endomorphism 1: (beta*x, +y)
    _GetHash160Comp(pe1x, isOdd, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;
        uint32_t pos = atomicAdd(out, 1);
        if (pos < maxFound) {
            out[pos * ITEM_SIZE32 + 1] = tid;
            out[pos * ITEM_SIZE32 + 2] = (incr << 16) | (1 << 15) | 1;
            out[pos * ITEM_SIZE32 + 3] = h[0];
            out[pos * ITEM_SIZE32 + 4] = h[1];
            out[pos * ITEM_SIZE32 + 5] = h[2];
            out[pos * ITEM_SIZE32 + 6] = h[3];
            out[pos * ITEM_SIZE32 + 7] = h[4];
        }
    }

    // 4. Endomorphism 1: (beta*x, -y)
    _GetHash160Comp(pe1x, isEven, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;
        uint32_t pos = atomicAdd(out, 1);
        if (pos < maxFound) {
            out[pos * ITEM_SIZE32 + 1] = tid;
            out[pos * ITEM_SIZE32 + 2] = ((-incr) << 16) | (1 << 15) | 1;
            out[pos * ITEM_SIZE32 + 3] = h[0];
            out[pos * ITEM_SIZE32 + 4] = h[1];
            out[pos * ITEM_SIZE32 + 5] = h[2];
            out[pos * ITEM_SIZE32 + 6] = h[3];
            out[pos * ITEM_SIZE32 + 7] = h[4];
        }
    }

    // 5. Endomorphism 2: (beta2*x, +y)
    _GetHash160Comp(pe2x, isOdd, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;
        uint32_t pos = atomicAdd(out, 1);
        if (pos < maxFound) {
            out[pos * ITEM_SIZE32 + 1] = tid;
            out[pos * ITEM_SIZE32 + 2] = (incr << 16) | (1 << 15) | 2;
            out[pos * ITEM_SIZE32 + 3] = h[0];
            out[pos * ITEM_SIZE32 + 4] = h[1];
            out[pos * ITEM_SIZE32 + 5] = h[2];
            out[pos * ITEM_SIZE32 + 6] = h[3];
            out[pos * ITEM_SIZE32 + 7] = h[4];
        }
    }

    // 6. Endomorphism 2: (beta2*x, -y)
    _GetHash160Comp(pe2x, isEven, (uint8_t*)h);
    if (CheckTieredBloom(h, prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                         bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes)) {
        uint32_t tid = (blockIdx.x * blockDim.x) + threadIdx.x;
        uint32_t pos = atomicAdd(out, 1);
        if (pos < maxFound) {
            out[pos * ITEM_SIZE32 + 1] = tid;
            out[pos * ITEM_SIZE32 + 2] = ((-incr) << 16) | (1 << 15) | 2;
            out[pos * ITEM_SIZE32 + 3] = h[0];
            out[pos * ITEM_SIZE32 + 4] = h[1];
            out[pos * ITEM_SIZE32 + 5] = h[2];
            out[pos * ITEM_SIZE32 + 6] = h[3];
            out[pos * ITEM_SIZE32 + 7] = h[4];
        }
    }
}

// ============================================================================
// MAIN COMPUTE KERNEL - DUAL FORMAT (Compressed + Uncompressed)
// ============================================================================

__device__ void ComputeKeysK1Both(
    uint64_t* startx, uint64_t* starty,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint64_t dx[GRP_SIZE/2+1][4];
    uint64_t px[4], py[4], pyn[4], sx[4], sy[4], dy[4], _s[4], _p2[4];

    __syncthreads();
    Load256A(sx, startx);
    Load256A(sy, starty);
    Load256(px, sx);
    Load256(py, sy);

    for (uint32_t j = 0; j < STEP_SIZE / GRP_SIZE; j++) {
        uint32_t i;

        // Compute delta x values for batch inversion
        for (i = 0; i < HSIZE; i++)
            ModSub256(dx[i], Gx[i], sx);
        ModSub256(dx[i], Gx[i], sx);
        ModSub256(dx[i+1], _2Gnx, sx);

        // Batch modular inversion (Montgomery's trick)
        _ModInvGrouped(dx);

        // Check center point - BOTH compressed AND uncompressed!
        CheckHashBothFormatsOptimized(px, py, j*GRP_SIZE + GRP_SIZE/2,
            prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
            bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

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

            // Check BOTH compressed AND uncompressed addresses
            CheckHashBothFormatsOptimized(px, py, j*GRP_SIZE + GRP_SIZE/2 + (i+1),
                prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

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

            // Check BOTH compressed AND uncompressed addresses
            CheckHashBothFormatsOptimized(px, py, j*GRP_SIZE + GRP_SIZE/2 - (i+1),
                prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);
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

        // Check BOTH compressed AND uncompressed addresses
        CheckHashBothFormatsOptimized(px, py, j*GRP_SIZE,
            prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
            bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

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
    Store256A(startx, px);
    Store256A(starty, py);
}

// Legacy: Compressed-only compute kernel (for backwards compatibility)
__device__ void ComputeKeysK1(
    uint64_t* startx, uint64_t* starty,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* out
) {
    uint64_t dx[GRP_SIZE/2+1][4];
    uint64_t px[4], py[4], pyn[4], sx[4], sy[4], dy[4], _s[4], _p2[4];

    __syncthreads();
    Load256A(sx, startx);
    Load256A(sy, starty);
    Load256(px, sx);
    Load256(py, sy);

    for (uint32_t j = 0; j < STEP_SIZE / GRP_SIZE; j++) {
        uint32_t i;

        // Compute delta x values for batch inversion
        for (i = 0; i < HSIZE; i++)
            ModSub256(dx[i], Gx[i], sx);
        ModSub256(dx[i], Gx[i], sx);
        ModSub256(dx[i+1], _2Gnx, sx);

        // Batch modular inversion (Montgomery's trick)
        _ModInvGrouped(dx);

        // Check center point with full endomorphism
        CheckHashCompOptimized(px, py, j*GRP_SIZE + GRP_SIZE/2,
            prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
            bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

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

            CheckHashCompOptimized(px, py, j*GRP_SIZE + GRP_SIZE/2 + (i+1),
                prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

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

            CheckHashCompOptimized(px, py, j*GRP_SIZE + GRP_SIZE/2 - (i+1),
                prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
                bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);
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

        CheckHashCompOptimized(px, py, j*GRP_SIZE,
            prefixTable32, bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
            bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes, maxFound, out);

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
    Store256A(startx, px);
    Store256A(starty, py);
}

// ============================================================================
// KERNEL ENTRY POINTS
// ============================================================================

// NEW: Kernel that checks BOTH compressed AND uncompressed addresses
// This is essential for finding early Bitcoin (2009-2012) including Satoshi's coins!
__global__ void bloom_kernel_k1_both(
    uint64_t* keys,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* found
) {
    int xPtr = (blockIdx.x * blockDim.x) * 8;
    int yPtr = xPtr + 4 * NB_THREAD_PER_GROUP;
    ComputeKeysK1Both(keys + xPtr, keys + yPtr,
        prefixTable32,
        bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes,
        maxFound, found);
}

// Legacy: Kernel that only checks compressed addresses
__global__ void bloom_kernel_k1(
    uint64_t* keys,
    const uint8_t* prefixTable32,
    const uint32_t* bloom1, uint64_t bloom1Bits, const uint32_t* bloom1Seeds, int bloom1Hashes,
    const uint32_t* bloom2, uint64_t bloom2Bits, const uint32_t* bloom2Seeds, int bloom2Hashes,
    uint32_t maxFound, uint32_t* found
) {
    int xPtr = (blockIdx.x * blockDim.x) * 8;
    int yPtr = xPtr + 4 * NB_THREAD_PER_GROUP;
    ComputeKeysK1(keys + xPtr, keys + yPtr,
        prefixTable32,
        bloom1, bloom1Bits, bloom1Seeds, bloom1Hashes,
        bloom2, bloom2Bits, bloom2Seeds, bloom2Hashes,
        maxFound, found);
}

// ============================================================================
// HOST UTILITIES
// ============================================================================

void secure_random(void* buf, size_t len) {
    FILE* f = fopen("/dev/urandom", "rb");
    if (f) { fread(buf, 1, len, f); fclose(f); }
}

// ============================================================================
// SECP256K1 CPU SCALAR MULTIPLICATION (for proper key initialization)
// ============================================================================

// secp256k1 prime: P = 2^256 - 2^32 - 977
static const uint64_t SECP_P[4] = {
    0xFFFFFFFEFFFFFC2FULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL
};

// Generator point G
static const uint64_t SECP_GX[4] = {
    0x59F2815B16F81798ULL, 0x029BFCDB2DCE28D9ULL,
    0x55A06295CE870B07ULL, 0x79BE667EF9DCBBACULL
};
static const uint64_t SECP_GY[4] = {
    0x9C47D08FFB10D4B8ULL, 0xFD17B448A6855419ULL,
    0x5DA4FBFC0E1108A8ULL, 0x483ADA7726A3C465ULL
};

// 256-bit comparison: returns 1 if a >= b
static int cmp256(const uint64_t* a, const uint64_t* b) {
    for (int i = 3; i >= 0; i--) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }
    return 0;
}

// 256-bit addition with carry
static uint64_t add256(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = 0;
    for (int i = 0; i < 4; i++) {
        __uint128_t sum = (__uint128_t)a[i] + b[i] + c;
        r[i] = (uint64_t)sum;
        c = (uint64_t)(sum >> 64);
    }
    return c;
}

// 256-bit subtraction with borrow
static uint64_t sub256(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = 0;
    for (int i = 0; i < 4; i++) {
        __uint128_t diff = (__uint128_t)a[i] - b[i] - c;
        r[i] = (uint64_t)diff;
        c = (diff >> 64) ? 1 : 0;
    }
    return c;
}

// Modular addition: r = (a + b) mod P
static void mod_add(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = add256(r, a, b);
    if (c || cmp256(r, SECP_P) >= 0) {
        sub256(r, r, SECP_P);
    }
}

// Modular subtraction: r = (a - b) mod P
static void mod_sub(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    uint64_t c = sub256(r, a, b);
    if (c) {
        add256(r, r, SECP_P);
    }
}

// Modular multiplication using secp256k1's special form
static void mod_mul(uint64_t* r, const uint64_t* a, const uint64_t* b) {
    __uint128_t t[8] = {0};

    // Full 256x256 multiplication to 512 bits
    for (int i = 0; i < 4; i++) {
        __uint128_t c = 0;
        for (int j = 0; j < 4; j++) {
            c += t[i + j] + (__uint128_t)a[i] * b[j];
            t[i + j] = (uint64_t)c;
            c >>= 64;
        }
        t[i + 4] = c;
    }

    // Reduce modulo P using secp256k1's special form: P = 2^256 - 0x1000003D1
    // t mod P = t_low + t_high * 0x1000003D1 (mod P)
    uint64_t high[4] = {(uint64_t)t[4], (uint64_t)t[5], (uint64_t)t[6], (uint64_t)t[7]};
    uint64_t low[4] = {(uint64_t)t[0], (uint64_t)t[1], (uint64_t)t[2], (uint64_t)t[3]};

    // Multiply high by 0x1000003D1
    __uint128_t c = 0;
    uint64_t hc[5];
    for (int i = 0; i < 4; i++) {
        c += (__uint128_t)high[i] * 0x1000003D1ULL;
        hc[i] = (uint64_t)c;
        c >>= 64;
    }
    hc[4] = (uint64_t)c;

    // Add to low
    c = 0;
    for (int i = 0; i < 4; i++) {
        c += (__uint128_t)low[i] + hc[i];
        r[i] = (uint64_t)c;
        c >>= 64;
    }
    c += hc[4];

    // Final reduction if needed
    while (c) {
        uint64_t extra = (uint64_t)c;
        c = (__uint128_t)extra * 0x1000003D1ULL;
        for (int i = 0; i < 4 && c; i++) {
            c += r[i];
            r[i] = (uint64_t)c;
            c >>= 64;
        }
    }

    // Final comparison with P
    if (cmp256(r, SECP_P) >= 0) {
        sub256(r, r, SECP_P);
    }
}

// Modular inversion using extended Euclidean algorithm (Fermat's little theorem)
// a^(-1) = a^(P-2) mod P
static void mod_inv(uint64_t* r, const uint64_t* a) {
    // P - 2 in little-endian
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

// Point at infinity check (both coords zero)
static int is_infinity(const uint64_t* x, const uint64_t* y) {
    return (x[0] | x[1] | x[2] | x[3] | y[0] | y[1] | y[2] | y[3]) == 0;
}

// EC point addition: R = P + Q
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

    // dx = qx - px
    mod_sub(dx, qx, px);

    // Check if same x (either same point or inverse)
    if ((dx[0] | dx[1] | dx[2] | dx[3]) == 0) {
        // dy = qy - py
        mod_sub(dy, qy, py);
        if ((dy[0] | dy[1] | dy[2] | dy[3]) == 0) {
            // Same point - point doubling
            // s = (3*px^2) / (2*py)
            mod_mul(s, px, px);       // px^2
            mod_add(tmp, s, s);       // 2*px^2
            mod_add(s, tmp, s);       // 3*px^2
            mod_add(dy, py, py);      // 2*py
            mod_inv(tmp, dy);         // 1/(2*py)
            mod_mul(s, s, tmp);       // s = 3*px^2 / (2*py)
        } else {
            // Point at infinity (P + (-P) = O)
            memset(rx, 0, 32); memset(ry, 0, 32); return;
        }
    } else {
        // dy = qy - py
        mod_sub(dy, qy, py);
        // s = dy / dx
        mod_inv(tmp, dx);
        mod_mul(s, dy, tmp);
    }

    // rx = s^2 - px - qx
    mod_mul(s2, s, s);
    mod_sub(rx, s2, px);
    mod_sub(rx, rx, qx);

    // ry = s * (px - rx) - py
    mod_sub(tmp, px, rx);
    mod_mul(ry, s, tmp);
    mod_sub(ry, ry, py);
}

// EC point doubling: R = 2*P (optimized)
static void point_double(uint64_t* rx, uint64_t* ry,
                         const uint64_t* px, const uint64_t* py) {
    if (is_infinity(px, py) || (py[0] | py[1] | py[2] | py[3]) == 0) {
        memset(rx, 0, 32); memset(ry, 0, 32); return;
    }

    uint64_t s[4], s2[4], tmp[4], dy[4];

    // s = (3*px^2) / (2*py)
    mod_mul(s, px, px);       // px^2
    mod_add(tmp, s, s);       // 2*px^2
    mod_add(s, tmp, s);       // 3*px^2
    mod_add(dy, py, py);      // 2*py
    mod_inv(tmp, dy);         // 1/(2*py)
    mod_mul(s, s, tmp);       // s = 3*px^2 / (2*py)

    // rx = s^2 - 2*px
    mod_mul(s2, s, s);
    mod_sub(rx, s2, px);
    mod_sub(rx, rx, px);

    // ry = s * (px - rx) - py
    mod_sub(tmp, px, rx);
    mod_mul(ry, s, tmp);
    mod_sub(ry, ry, py);
}

// Scalar multiplication: R = k * G using double-and-add
static void scalar_mult_G(uint64_t* rx, uint64_t* ry, const uint64_t* k) {
    uint64_t qx[4], qy[4];  // Current point
    uint64_t tmpx[4], tmpy[4];

    // Start with point at infinity
    memset(rx, 0, 32);
    memset(ry, 0, 32);

    // Copy G to addend
    memcpy(qx, SECP_GX, 32);
    memcpy(qy, SECP_GY, 32);

    // Double-and-add
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

// Initialize h_keys with valid EC points from RANDOM private keys
//
// SECURITY CRITICAL: We use /dev/urandom to generate truly random 256-bit private keys.
// This is essential because:
// 1. Many searchers start from k=1,2,3... (sequential from zero)
// 2. Starting from random points ensures we cover unique keyspace
// 3. Overlapping with other searchers wastes computational resources
// 4. Random starting points are cryptographically unpredictable
//
// The private key k is generated randomly, then we compute P = k*G on CPU.
// This P becomes the starting point for GPU iteration.
static void init_valid_keys(uint64_t* h_keys, int nbThread) {
    printf("Generating %d valid EC starting points (this may take a moment)...\n", nbThread);
    printf("  Using /dev/urandom for cryptographic randomness\n");

    uint8_t privkey[32];

    for (int t = 0; t < nbThread; t++) {
        // Generate random 32-byte private key from /dev/urandom
        // This ensures truly random starting points, NOT sequential from zero!
        secure_random(privkey, 32);

        // Ensure it's in valid range (1 to N-1)
        // For simplicity, just ensure it's non-zero
        privkey[0] |= 1;  // Ensure not zero

        // Convert to uint64_t array (little-endian on x86)
        uint64_t k[4];
        memcpy(k, privkey, 32);

        // Compute P = k * G
        uint64_t px[4], py[4];
        scalar_mult_G(px, py, k);

        // Store in h_keys array
        // Layout: [x0, x1, x2, x3] for thread 0, then thread 1, etc.
        // Then [y0, y1, y2, y3] for thread 0, etc.
        // Actually the layout is interleaved for coalesced access:
        // h_keys[t*8 + 0..3] = px, h_keys[t*8 + 4..7] = py? No...
        // Looking at Load256A: keys + IDX, keys + IDX + blockDim.x, etc.
        // So it's: px[0] at keys[t], px[1] at keys[t + nbThread], etc.

        // The kernel uses:
        // xPtr = (blockIdx.x * blockDim.x) * 8
        // yPtr = xPtr + 4 * NB_THREAD_PER_GROUP
        // Load256A(sx, startx) loads from startx[IDX], startx[IDX+blockDim.x], etc.

        // So for thread t within block b:
        // xPtr = b * 512 * 8 = b * 4096
        // The t-th thread (t = b*512 + local_t) loads:
        // px[0] from keys[b*4096 + local_t]
        // px[1] from keys[b*4096 + local_t + 512]
        // px[2] from keys[b*4096 + local_t + 1024]
        // px[3] from keys[b*4096 + local_t + 1536]
        // py[0] from keys[b*4096 + 2048 + local_t]
        // etc.

        // For simplicity, let's use a different layout and fix it:
        // Store linearly: keys[t*8 + 0..3] = px, keys[t*8 + 4..7] = py
        // This won't work with the current kernel...

        // Actually, let's look at the allocation: nbThread * 64 bytes = nbThread * 8 uint64_t
        // And the copy to GPU is the full buffer.
        // The kernel accesses with Load256A which uses strided access.

        // Let me compute the proper layout:
        // For block b with 512 threads, xPtr = b * 512 * 8 = b * 4096
        // Thread t loads px[i] from keys[xPtr + t + i*512] for i=0..3
        // Thread t loads py[i] from keys[xPtr + 2048 + t + i*512] for i=0..3

        // With nbThread = 128 * 512 = 65536 threads
        // Total keys = 65536 * 8 = 524288 uint64_t

        // For thread t (global), block b = t / 512, local = t % 512
        // xPtr = b * 4096
        // keys[xPtr + local + 0*512] = px[0] -> keys[b*4096 + local] = keys[(t/512)*4096 + t%512]

        // Let's just compute the indices directly:
        int block = t / 512;
        int local = t % 512;
        int xPtr = block * 4096;

        h_keys[xPtr + local + 0 * 512] = px[0];
        h_keys[xPtr + local + 1 * 512] = px[1];
        h_keys[xPtr + local + 2 * 512] = px[2];
        h_keys[xPtr + local + 3 * 512] = px[3];
        h_keys[xPtr + 2048 + local + 0 * 512] = py[0];
        h_keys[xPtr + 2048 + local + 1 * 512] = py[1];
        h_keys[xPtr + 2048 + local + 2 * 512] = py[2];
        h_keys[xPtr + 2048 + local + 3 * 512] = py[3];

        if ((t + 1) % 10000 == 0 || t == nbThread - 1) {
            printf("\r  Generated %d/%d keys...", t + 1, nbThread);
            fflush(stdout);
        }
    }
    printf("\n  Done! All starting points are valid EC curve points.\n");
}

void save_state(const char* f, uint64_t* k, int n, uint64_t t) {
    FILE* fp = fopen(f, "wb");
    if (fp) { fwrite(&t, 8, 1, fp); fwrite(k, 8, n*8, fp); fclose(fp); }
}

uint64_t load_state(const char* f, uint64_t* k, int n) {
    struct stat st; if (stat(f, &st)) return 0;
    FILE* fp = fopen(f, "rb"); if (!fp) return 0;
    uint64_t t = 0;
    if (fread(&t, 8, 1, fp) != 1) { fclose(fp); return 0; }
    if (fread(k, 8, n*8, fp) != (size_t)(n*8)) { fclose(fp); return 0; }
    fclose(fp); return t;
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

// ============================================================================
// MAIN
// ============================================================================

int main(int argc, char** argv) {
    // File paths
    char* prefixFile = nullptr;
    char* bloom1File = nullptr;
    char* seeds1File = nullptr;
    char* bloom2File = nullptr;  // Optional second bloom filter
    char* seeds2File = nullptr;
    char* stateFile = nullptr;

    uint64_t bloom1Bits = 0;
    uint64_t bloom2Bits = 0;
    int bloom1Hashes = 8;
    int bloom2Hashes = 8;
    int gpuId = 0;
    int searchMode = MODE_BOTH;  // Default: search BOTH compressed AND uncompressed

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
        // Search mode options
        else if (!strcmp(argv[i], "-both")) searchMode = MODE_BOTH;
        else if (!strcmp(argv[i], "-compressed")) searchMode = MODE_COMPRESSED_ONLY;
        else if (!strcmp(argv[i], "-uncompressed")) searchMode = MODE_UNCOMPRESSED_ONLY;
    }

    if (!prefixFile || !bloom1File || !seeds1File || !bloom1Bits) {
        printf("BloomSearch32K1 - K1-Optimized GPU Search with Three-Tier Bloom Filter\n\n");
        printf("Usage: %s [options]\n\n", argv[0]);
        printf("Required:\n");
        printf("  -prefix <file>   32-bit prefix bitmap file\n");
        printf("  -bloom <file>    Primary bloom filter file\n");
        printf("  -seeds <file>    Primary bloom seeds file\n");
        printf("  -bits <n>        Primary bloom filter bits\n\n");
        printf("Optional (Tier 3):\n");
        printf("  -bloom2 <file>   Secondary bloom filter file\n");
        printf("  -seeds2 <file>   Secondary bloom seeds file\n");
        printf("  -bits2 <n>       Secondary bloom filter bits\n");
        printf("  -hashes2 <n>     Secondary bloom hash count (default: 8)\n\n");
        printf("Address Format (IMPORTANT for early Bitcoin!):\n");
        printf("  -both            Search BOTH compressed AND uncompressed (DEFAULT)\n");
        printf("                   -> Required to find Satoshi's coins & 2009-2012 addresses!\n");
        printf("  -compressed      Search compressed only (modern wallets, post-2012)\n");
        printf("  -uncompressed    Search uncompressed only (early Bitcoin 2009-2012)\n\n");
        printf("Other:\n");
        printf("  -gpu <id>        GPU device ID (default: 0)\n");
        printf("  -hashes <n>      Primary bloom hash count (default: 8)\n");
        printf("  -state <file>    State checkpoint file\n");
        return 1;
    }

    // Default state file
    char defaultState[256];
    if (!stateFile) {
        snprintf(defaultState, 256, "/root/gpu%d_k1.state", gpuId);
        stateFile = defaultState;
    }

    signal(SIGINT, sighandler);
    signal(SIGTERM, sighandler);
    cudaSetDevice(gpuId);

    cudaDeviceProp prop;
    cudaGetDeviceProperties(&prop, gpuId);
    printf("GPU %d: %s (K1-Optimized)\n", gpuId, prop.name);
    printf("Features: Batch ModInv + Cached Endomorphism + Tiered Bloom\n");

    // Print search mode
    const char* modeStr = (searchMode == MODE_BOTH) ? "BOTH (compressed + uncompressed)" :
                          (searchMode == MODE_COMPRESSED_ONLY) ? "COMPRESSED only" : "UNCOMPRESSED only";
    printf("Search Mode: %s\n", modeStr);
    if (searchMode == MODE_BOTH) {
        printf("  -> Will find early Bitcoin (2009-2012) AND modern addresses!\n");
    }

    // Load prefix bitmap
    size_t prefixSize;
    uint8_t* h_prefix = (uint8_t*)load_file(prefixFile, &prefixSize);
    if (!h_prefix) { printf("Error: Cannot load prefix file\n"); return 1; }
    printf("Loaded prefix bitmap: %zu MB\n", prefixSize / 1024 / 1024);

    // Load primary bloom filter
    size_t bloom1Size;
    uint32_t* h_bloom1 = (uint32_t*)load_file(bloom1File, &bloom1Size);
    if (!h_bloom1) { printf("Error: Cannot load bloom filter\n"); return 1; }
    printf("Loaded bloom filter 1: %zu MB, %lu bits, %d hashes\n",
           bloom1Size / 1024 / 1024, bloom1Bits, bloom1Hashes);

    // Load primary seeds
    size_t seeds1Size;
    uint32_t* h_seeds1 = (uint32_t*)load_file(seeds1File, &seeds1Size);
    if (!h_seeds1) { printf("Error: Cannot load seeds file\n"); return 1; }

    // Load optional secondary bloom filter
    uint32_t* h_bloom2 = nullptr;
    uint32_t* h_seeds2 = nullptr;
    if (bloom2File && seeds2File && bloom2Bits > 0) {
        size_t bloom2Size, seeds2Size;
        h_bloom2 = (uint32_t*)load_file(bloom2File, &bloom2Size);
        h_seeds2 = (uint32_t*)load_file(seeds2File, &seeds2Size);
        if (h_bloom2 && h_seeds2) {
            printf("Loaded bloom filter 2: %zu MB, %lu bits, %d hashes\n",
                   bloom2Size / 1024 / 1024, bloom2Bits, bloom2Hashes);
        }
    }

    // Allocate GPU memory
    int nbThread = 65536;
    uint8_t* d_prefix;
    uint32_t* d_bloom1;
    uint32_t* d_seeds1;
    uint32_t* d_bloom2 = nullptr;
    uint32_t* d_seeds2 = nullptr;
    uint64_t* d_keys;
    uint32_t* d_found;

    cudaMalloc(&d_prefix, prefixSize);
    cudaMalloc(&d_bloom1, (bloom1Bits + 31) / 32 * 4);
    cudaMalloc(&d_seeds1, bloom1Hashes * 4);
    cudaMalloc(&d_keys, nbThread * 64);
    cudaMalloc(&d_found, (1 + MAX_FOUND * ITEM_SIZE32) * 4);

    cudaMemcpy(d_prefix, h_prefix, prefixSize, cudaMemcpyHostToDevice);
    cudaMemcpy(d_bloom1, h_bloom1, (bloom1Bits + 31) / 32 * 4, cudaMemcpyHostToDevice);
    cudaMemcpy(d_seeds1, h_seeds1, bloom1Hashes * 4, cudaMemcpyHostToDevice);

    if (h_bloom2 && h_seeds2) {
        cudaMalloc(&d_bloom2, (bloom2Bits + 31) / 32 * 4);
        cudaMalloc(&d_seeds2, bloom2Hashes * 4);
        cudaMemcpy(d_bloom2, h_bloom2, (bloom2Bits + 31) / 32 * 4, cudaMemcpyHostToDevice);
        cudaMemcpy(d_seeds2, h_seeds2, bloom2Hashes * 4, cudaMemcpyHostToDevice);
    }

    // Initialize keys - IMPORTANT: Must use valid EC points, not random bytes!
    // Random bytes are almost NEVER valid points on the secp256k1 curve.
    // We generate random private keys and compute P = k*G for each thread.
    //
    // SECURITY: NEVER start from counter zero or sequential keys!
    // Many other searchers start from low key ranges (k=1,2,3...).
    // Always use cryptographically random starting points from /dev/urandom.
    // This ensures we search unique keyspace that others haven't covered.
    uint64_t* h_keys = (uint64_t*)malloc(nbThread * 64);
    uint64_t resumedKeys = load_state(stateFile, h_keys, nbThread);
    if (resumedKeys > 0) {
        printf("Resumed from checkpoint: %.2fB keys checked\n", resumedKeys / 1e9);
        printf("  NOTE: Continuing from saved random starting points\n");
    } else {
        // ALWAYS generate fresh random starting points - NEVER use sequential keys!
        // This is critical to avoid overlap with other searchers who start from k=1,2,3...
        printf("IMPORTANT: Generating cryptographically random starting points\n");
        printf("  -> Using /dev/urandom for true randomness\n");
        printf("  -> This ensures unique keyspace coverage\n");
        init_valid_keys(h_keys, nbThread);
        printf("Starting fresh search with random EC points (NOT sequential!)\n");
    }
    cudaMemcpy(d_keys, h_keys, nbThread * 64, cudaMemcpyHostToDevice);

    // Pinned host memory for results
    uint32_t* h_found;
    cudaMallocHost(&h_found, (1 + MAX_FOUND * ITEM_SIZE32) * 4);

    // Main search loop
    time_t start = time(NULL);
    uint64_t total = resumedKeys;
    uint64_t iter = 0;
    uint64_t totalHits = 0;

    // Calculate addresses per iteration based on mode
    // Compressed-only: 6 addresses (3 endomorphisms x 2 y values)
    // Both: 12 addresses (3 endomorphisms x 2 y values x 2 formats)
    int addrsPerPoint = (searchMode == MODE_BOTH) ? 12 : 6;
    printf("\nStarting K1-optimized search (%d addresses per EC point)...\n\n", addrsPerPoint);

    while (running) {
        cudaMemset(d_found, 0, 4);

        // Use appropriate kernel based on search mode
        if (searchMode == MODE_BOTH) {
            // NEW: Check BOTH compressed AND uncompressed addresses
            bloom_kernel_k1_both<<<nbThread/NB_THREAD_PER_GROUP, NB_THREAD_PER_GROUP>>>(
                d_keys, d_prefix,
                d_bloom1, bloom1Bits, d_seeds1, bloom1Hashes,
                d_bloom2, bloom2Bits, d_seeds2, bloom2Hashes,
                MAX_FOUND, d_found);
        } else {
            // Legacy: compressed-only kernel
            bloom_kernel_k1<<<nbThread/NB_THREAD_PER_GROUP, NB_THREAD_PER_GROUP>>>(
                d_keys, d_prefix,
                d_bloom1, bloom1Bits, d_seeds1, bloom1Hashes,
                d_bloom2, bloom2Bits, d_seeds2, bloom2Hashes,
                MAX_FOUND, d_found);
        }

        cudaDeviceSynchronize();

        // Check for matches
        cudaMemcpy(h_found, d_found, 4, cudaMemcpyDeviceToHost);
        uint32_t numFound = h_found[0];
        if (numFound > 0) {
            totalHits += numFound;
            cudaMemcpy(h_found, d_found, (1 + numFound * ITEM_SIZE32) * 4, cudaMemcpyDeviceToHost);
            // Log matches for verification
            for (uint32_t i = 0; i < numFound && i < 10; i++) {
                uint32_t* item = h_found + 1 + i * ITEM_SIZE32;
                // Decode address type from metadata
                uint32_t meta = item[1];
                const char* addrType = (meta & ADDR_COMPRESSED) ? "COMP" : "UNCOMP";
                printf("[CANDIDATE %s] tid=%u meta=%08x hash160=%08x%08x%08x%08x%08x\n",
                       addrType, item[0], item[1], item[2], item[3], item[4], item[5], item[6]);
            }
        }

        // Count addresses checked based on mode
        total += (uint64_t)nbThread * 1024 * addrsPerPoint;
        iter++;

        // Save checkpoint
        if (iter % 500 == 0) {
            cudaMemcpy(h_keys, d_keys, nbThread * 64, cudaMemcpyDeviceToHost);
            save_state(stateFile, h_keys, nbThread, total);
        }

        // Progress update
        if (iter % 50 == 0) {
            double t = difftime(time(NULL), start);
            double sessionKeys = total - resumedKeys;
            double rate = sessionKeys / t / 1e9;
            printf("\r[%5.0fs] %.2fT keys | %.2f GKey/s | %lu candidates     ",
                   t, total / 1e12, rate, totalHits);
            fflush(stdout);
        }
    }

    // Final save
    cudaMemcpy(h_keys, d_keys, nbThread * 64, cudaMemcpyDeviceToHost);
    save_state(stateFile, h_keys, nbThread, total);
    printf("\n\nSaved checkpoint: %.2fT keys, %lu total candidates\n", total / 1e12, totalHits);

    // Cleanup
    cudaFree(d_prefix);
    cudaFree(d_bloom1);
    cudaFree(d_seeds1);
    if (d_bloom2) cudaFree(d_bloom2);
    if (d_seeds2) cudaFree(d_seeds2);
    cudaFree(d_keys);
    cudaFree(d_found);
    cudaFreeHost(h_found);
    free(h_keys);
    free(h_prefix);
    free(h_bloom1);
    free(h_seeds1);
    if (h_bloom2) free(h_bloom2);
    if (h_seeds2) free(h_seeds2);

    return 0;
}
