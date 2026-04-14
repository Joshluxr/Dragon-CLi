## K3 implementation notes

This vendored K3 tree has been refactored from a raw bloom-filter candidate
scanner into a runtime with explicit candidate transport, scalar-aware state,
and optional exact confirmation.

### Implemented behavior

- **Bounded candidate buffering**
  - Candidate events are transported via `ResultHeader` and `CandidateRecord`
    instead of a raw unbounded hit counter.
  - The runtime tracks stored, total, and dropped candidate counts separately.

- **Scalar-aware host state**
  - Each thread now owns explicit scalar state:
    - `windowStart`
    - `windowCenter`
  - Checkpoints persist this scalar state via checkpoint v2 instead of only
    saving EC points.

- **Exact scalar reconstruction**
  - Candidate metadata is sufficient to reconstruct the scalar implied by:
    - thread id
    - signed center-relative delta
    - y variant
    - endomorphism variant

- **Exact confirmation**
  - The optional `-targets-exact` file lets the host distinguish bloom
    candidates from exact confirmed hits.

- **Exact bloom semantics**
  - Bloom lookup uses exact modulo semantics:
    - `bitPos = hash % bloomBits`
  - The runtime no longer silently rounds bloom sizes to powers of two.
  - Bloom bit sizes above `2^32` are rejected.

- **Range semantics**
  - `-start` is treated as the first scalar of a disjoint 1024-scalar window
    stream.
  - Thread `t` starts at:
    - `windowStart = start + t * 1024`
    - `windowCenter = windowStart + 512`
  - After each kernel launch, host scalar state advances by:
    - `totalThreads * 1024`
  - Device EC points are then repopulated from the updated host scalar state
    before the next launch so host/device state stays synchronized.

### Remote verification status

This implementation was subsequently copied to a remote CUDA server and built
successfully with:

- CUDA 13.0
- `make CCAP=120`

Runtime smoke testing was also performed on that remote host using generated
fixture files in the exact on-disk formats the scanner expects:

- deterministic exact target files
- permissive prefix bitmap
- permissive bloom filter
- Murmur3 seed file

Key results from remote verification:

- the branch now compiles successfully on real CUDA hardware
- a reduced debug launch geometry (`-blocks 1 -threads-per-block 32`) produces
  stored candidates, confirming that the candidate pipeline is live
- exact confirmation was exercised successfully using a known emitted candidate
  promoted into an exact target file, resulting in:
  - `1 confirmed`
- the original full production geometry is still substantially slower, so smoke
  tests should prefer the reduced launch geometry

### Performance note

The original production-sized kernel build showed a very large stack frame.
After batching the inversion work, the remote PTXAS metrics improved to:

- kernel stack frame: `4880 bytes`
- kernel spill stores: `0 bytes`
- kernel spill loads: `0 bytes`

The inlined helper `ComputeKeysK3` still shows spill pressure in PTXAS output,
so further tuning may still be useful for production performance, but the
worst stack-frame issue was reduced substantially.
