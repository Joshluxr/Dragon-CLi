# K3 - Optimized Bloom Filter Bitcoin Address Search

K3 is a performance-optimized CUDA implementation for searching Bitcoin addresses using bloom filters. It builds on the BloomSearch32K1 architecture with significant GPU optimizations for improved throughput.

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

### 3. Warp-Level Atomics (Est. 1.5-2x speedup)
When recording found addresses, K3 uses warp-level ballot to reduce atomic contention:
```cuda
uint32_t mask = __ballot_sync(0xFFFFFFFF, found);
if (found && (threadIdx.x == __ffs(mask) - 1)) {
    // Only leader thread does atomic
}
```

### 4. Fast Bloom Filter Access (Est. 1.2-1.3x speedup)
Power-of-2 bloom filter sizes enable fast bitmask instead of expensive modulo:
```cuda
// Original: expensive integer division
uint64_t bitPos = h % bloomBits;

// K3: fast bitmask (when bloomBits = 2^n)
uint64_t bitPos = h & (bloomBits - 1);
```

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
./BloomSearch32K3 -prefix <prefix_file> -bloom <bloom_file> -bits <bloom_bits> -gpu <gpu_id>
```

### Parameters
- `-prefix`: Path to 32-bit prefix bitmap file
- `-bloom`: Path to bloom filter file
- `-bits`: Number of bits in the bloom filter (must be power of 2 for optimal performance)
- `-gpu`: GPU device ID (default: 0)

### Example
```bash
./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -bits 268435456 -gpu 0
```

## Profiling

```bash
# NVIDIA Nsight Systems (timeline profiling)
make profile-nsys

# NVIDIA Nsight Compute (kernel analysis)
make profile-ncu

# Or manually:
nsys profile -t cuda ./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -bits 268435456 -gpu 0
ncu --set full ./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -bits 268435456 -gpu 0
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
                                    3. Check 3-tier bloom filter (bitmask)
                                    4. Record hits (warp atomics)
                                    5. Add 512*G using endomorphism
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
| Bloom check | Modulo | Bitmask |
| Hash compute | Separate | Symmetric |
| Atomics | Global | Warp-level |
| Host memory | Pageable | Pinned |

## Requirements

- CUDA Toolkit 11.0+
- GPU with compute capability 7.5+ (Turing or newer)
- g++ with C++17 support

## Credits

Based on VanitySearch by Jean Luc PONS and BloomSearch32K1.
