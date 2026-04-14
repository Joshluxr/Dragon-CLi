# K3 - Optimized Bloom Filter Bitcoin Address Search

K3 is a performance-optimized CUDA implementation for searching Bitcoin address HASH160 values using a GPU bloom-filter candidate pass plus optional exact host-side verification. It builds on the BloomSearch32K1 architecture with significant GPU optimizations for improved throughput.

## Performance Optimizations

K3 implements the following optimizations over the baseline BloomSearch32K1:

### 1. Memory Coalescing (Est. 2-3x speedup)
The original implementation uses strided memory access patterns that waste memory bandwidth:
```cuda
// Original (non-coalesced): threads access memory with large strides
(r)[0] = (a)[IDX]; (r)[1] = (a)[IDX+blockDim.x]; ...
```

K3 uses contiguous memory access:
```cuda
// K3 (coalesced): threads access adjacent memory locations
uint64_t* ptr = (base) + (tid) * 4;
(r)[0] = ptr[0]; (r)[1] = ptr[1]; (r)[2] = ptr[2]; (r)[3] = ptr[3];
```

### 2. Register Pressure Reduction (Est. 1.5-2x speedup)
- Reduced threads per block: 512 -> 256
- This allows more registers per thread for the complex EC arithmetic
- More active blocks can execute concurrently (better occupancy)

### 3. Explicit Candidate Buffering
K3 records bloom-filter candidates into an explicit bounded candidate-record array instead of relying on an unbounded raw hit counter. This prevents host/device copy overruns when false positives spike.

### 4. Exact Bloom Filter Semantics
K3 now uses exact modulo-based bloom lookup semantics:
```cuda
uint64_t bitPos = ((uint64_t)h) % bloomBits;
```
The scanner no longer silently rounds bloom sizes to a power of two.

### 5. Symmetric Hash Function (Est. 1.3x speedup)
Computes both compressed address parities (02/03 prefix) in a single operation:
```cuda
_GetHash160CompSym(px, hash_even, hash_odd);
```

### 6. Pinned Memory Transfers
Uses `cudaMallocHost` for host buffers, enabling faster DMA transfers between CPU and GPU.

### 7. CUDA Error Checking
Comprehensive error checking with the `CUDA_CHECK` macro for debugging and reliability.

## Build

```bash
# Standard build (auto-detects CUDA)
make

# Specify compute capability for your GPU
make CCAP=86  # RTX 3090
make CCAP=89  # RTX 4090
make CCAP=80  # A100

# Multi-architecture build (supports multiple GPUs)
make multi-arch

# Debug build for profiling
make debug
```

## Usage

```bash
./BloomSearch32K3 -prefix <prefix_file> -bloom <bloom_file> -seeds <seeds_file> -bits <bloom_bits> -gpu <gpu_id>
```

### Parameters
- `-prefix`: Path to 32-bit prefix bitmap file
- `-bloom`: Path to bloom filter file
- `-seeds`: Path to murmur3 seed file used by the bloom filter
- `-bits`: Number of bits in the bloom filter (exact value, no silent rounding)
- `-gpu`: GPU device ID (default: 0)
- `-targets-exact`: Optional exact HASH160 target file for confirmed-hit verification

### Example
```bash
./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -seeds bloom.seeds -bits 268435456 -gpu 0
```

## Building K3 target artifacts from a public address list

K3 expects four input artifacts:

- `prefix.bin` - 2^32-bit sparse prefix bitmap
- `bloom.bin` - bloom filter over HASH160 values
- `seeds.bin` - murmur3 seeds used by the bloom
- `targets.exact` - exact HASH160 set for confirmed-hit verification

This repository now includes:

```bash
python3 tools/build-k3-targets.py \
  --input Bitcoin_addresses_LATEST.txt.gz \
  --output-dir /workspace/k3-generated \
  --bits 4294967296 \
  --hashes 8
```

### Converter behavior

- accepts either plain text or `.gz` compressed address lists
- expects **one Bitcoin address per line**
- keeps only **legacy base58 P2PKH** addresses (those starting with `1`)
- rejects unsupported address types such as:
  - P2SH (`3...`)
  - Bech32 / SegWit (`bc1...`)
- decodes each kept address into a 20-byte HASH160
- writes:
  - `prefix.bin`
  - `bloom.bin`
  - `seeds.bin`
  - `targets.exact`
  - `summary.json`

### Why only P2PKH is supported

The current K3 scanner computes HASH160 values for public keys directly:

- compressed pubkey -> HASH160
- uncompressed pubkey -> HASH160

That matches **legacy P2PKH** addresses only. It does **not** currently generate:

- redeem scripts for P2SH
- witness programs for Bech32

So the converter intentionally filters the address list down to the address type
the scanner can actually verify correctly.

## Candidate vs confirmed hits

K3 now distinguishes between:

- **candidate hits**: HASH160 values that passed the prefix bitmap and bloom filters
- **confirmed hits**: candidate hits that also appear in the optional exact target set passed via `-targets-exact`

If `-targets-exact` is omitted, the scanner still emits candidates but cannot distinguish bloom false positives from exact matches.

## Profiling

```bash
# NVIDIA Nsight Systems (timeline profiling)
make profile-nsys

# NVIDIA Nsight Compute (kernel analysis)
make profile-ncu

# Or manually:
nsys profile -t cuda ./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -seeds bloom.seeds -bits 268435456 -gpu 0
ncu --set full ./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -seeds bloom.seeds -bits 268435456 -gpu 0
```

## Architecture

```
K3 Architecture
---------------
Host (CPU)                          Device (GPU)
-----------                         ------------
Pinned Memory                       Global Memory (Coalesced Layout)
  h_keys[]      ----DMA--->           d_keys[] [thread0_x0..x3][thread1_x0..x3]...
  h_found[]     <---DMA----           d_found[]

                                    ComputeKeysK3Both Kernel
                                    ------------------------
                                    256 threads/block x 256 blocks = 65536 threads

                                    Per Thread:
                                    1. Load EC point (coalesced)
                                    2. Compute addresses (symmetric hash)
                                    3. Check 3-tier bloom filter (exact modulo)
                                    4. Record bounded candidate records
                                    5. Reconstruct exact scalars on host
                                    6. Optionally confirm against exact target set
```

## File Structure

```
k3/
├── Makefile                    # Build system
├── README.md                   # This file
├── src/
│   └── BloomSearch32K3.cu      # Main optimized kernel
├── GPUMath_K3.h                # Optimized 256-bit arithmetic with coalescing
├── GPUMath.h                   # Original 256-bit arithmetic (reference)
├── GPUHash.h                   # SHA256/RIPEMD160 GPU implementation
├── GPUGroup.h                  # EC group operations and generator tables
└── BloomSearch32K1_original.cu # Original implementation (reference)
```

## Key Differences from BloomSearch32K1

| Feature | K1 (Original) | K3 (Optimized) |
|---------|---------------|----------------|
| Threads/block | 512 | 256 |
| Total threads | 32768 | 65536 |
| Memory access | Strided | Coalesced |
| Bloom check | Modulo | Modulo (exact semantics) |
| Hash compute | Separate | Symmetric |
| Candidate buffering | Raw counter | Explicit bounded records |
| Host memory | Pageable | Pinned |

## Requirements

- CUDA Toolkit 11.0+
- GPU with compute capability 7.5+ (Turing or newer)
- g++ with C++17 support

## Credits

Based on VanitySearch by Jean Luc PONS and BloomSearch32K1.
