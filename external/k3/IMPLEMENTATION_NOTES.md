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

### Current limitation in this environment

The implementation changes were applied at the source level, but CUDA compile
verification is currently blocked in this environment because `nvcc` is not
available at `/usr/local/cuda/bin/nvcc`.
