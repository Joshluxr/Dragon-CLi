# K3 Source Understanding

## Executive summary

The K3 source is a standalone CUDA-based Bitcoin `HASH160` candidate scanner built around secp256k1 public key generation.

Most accurate short description:

> K3 is a GPU-accelerated secp256k1 public-key and `HASH160` scanner that uses a prefix bitmap and one or two bloom filters to emit candidate matches.

Important distinction:

- It is strong at generating and filtering candidate `HASH160` values quickly.
- It is not, in its current form, a fully trustworthy end-to-end key recovery engine.

That gap is caused more by system semantics and result-state design than by obvious failures in the secp256k1 formulas themselves.

---

## Source inventory

Primary files in the archive:

- `src/BloomSearch32K3.cu`
  - main optimized scanner
- `BloomSearch32K1_original.cu`
  - older/original implementation kept as reference
- `GPUHash.h`
  - SHA-256, RIPEMD-160, compressed/uncompressed Bitcoin pubkey hashing helpers
- `GPUMath.h`
  - original GPU secp256k1 field/group arithmetic
- `GPUMath_K3.h`
  - K3 variant of the GPU math layer, mainly tuned for memory layout and execution characteristics
- `GPUGroup.h`
  - large precomputed secp256k1 generator table
- `Makefile`
  - CUDA build and profile targets
- `launch_all_gpus.sh`
  - multi-GPU launcher and range-start script
- `README.md`
  - optimization claims, build guidance, and usage examples

---

## What the code does exactly

At runtime, the scanner performs the following pipeline:

1. Load a 32-bit prefix bitmap.
2. Load one required bloom filter and one optional second bloom filter.
3. Load Murmur3 seed arrays used for bloom hashing.
4. Initialize a large set of GPU worker threads with secp256k1 starting points.
5. For each worker thread, scan a secp256k1 point window of size 1024.
6. For each point, derive compressed and/or uncompressed pubkey hashes.
7. Also derive two endomorphism-related x-coordinate variants to expand coverage.
8. Check each resulting `HASH160` through:
   - prefix bitmap
   - primary bloom filter
   - optional secondary bloom filter
9. Emit candidate records for any hash that passes the filter pipeline.
10. Periodically save progress state.

In other words:

> The scanner searches for public-key hashes that might belong to a target set.

It does not, by itself, prove exact membership unless an exact verification layer is added after the bloom stage.

---

## Internal execution model

## 1. Thread-local search windows

Each GPU thread owns a starting secp256k1 point and searches a local window of nearby points.

The code is built around `GRP_SIZE = 1024`, so one center point is expanded into a signed neighborhood using:

- precomputed group table values from `GPUGroup.h`
- grouped modular inversion
- affine point derivation relative to the center

This is much cheaper than performing a fresh scalar multiplication for every candidate.

## 2. Grouped inversion

The code uses a standard batching trick:

- compute many denominator terms
- multiply them together
- invert once
- recover each individual inverse from the batch product

This is the purpose of `_ModInvGrouped(...)` in the math layer.

This is a standard and mathematically sound optimization.

## 3. Endomorphism expansion

The scanner uses secp256k1 GLV endomorphism ideas:

- original point `(x, y)`
- transformed point `(beta * x mod p, y)`
- transformed point `(beta^2 * x mod p, y)`

This gives three related points from one base point and increases address coverage per thread.

## 4. Pubkey hashing

`GPUHash.h` implements:

- compressed pubkey serialization
- uncompressed pubkey serialization
- SHA-256
- RIPEMD-160
- `HASH160 = RIPEMD160(SHA256(pubkey))`

There are separate helpers for:

- compressed keys
- uncompressed keys
- symmetric compressed hashing that computes both parities together

## 5. Filter pipeline

The target check is tiered:

1. 32-bit prefix bitmap
2. bloom filter 1
3. bloom filter 2 (optional)

This makes the scanner fast, but the bloom layers are only probabilistic prefilters, not exact confirmation.

---

## What the code is not

It is important to define what the current implementation is not:

- not a full exact verifier by itself
- not guaranteed to preserve enough scalar state for reliable private-key reconstruction
- not semantically trustworthy for exact non-overlapping `-start` range scanning in its current form
- not truly correct for all bloom-filter configurations it accepts

That means the code is currently best understood as:

> a fast GPU candidate generator with partial search semantics and insufficient exact-result plumbing

---

## Math audit summary

### Host-side secp256k1 arithmetic

The host-side secp256k1 arithmetic used to generate starting EC points appears correct.

That includes:

- modular add/sub/mul over the secp256k1 field prime
- modular inversion by exponentiation
- point addition
- point doubling
- scalar multiplication by repeated double-and-add

This was independently cross-checked against a bigint reference implementation.

### GPU math layer

The GPU arithmetic in `GPUMath.h` / `GPUMath_K3.h` appears to be inherited from a VanitySearch-style implementation and does not show an obvious formula break by inspection.

### Hashing layer

The compressed/uncompressed `HASH160` routines appear plausible and structured correctly.

### Where correctness actually breaks

The biggest problems are not obviously in the field arithmetic itself. They are in:

- result buffer semantics
- scalar-state preservation
- hit recoverability
- mode semantics
- bloom indexing assumptions
- range/window semantics

---

## Key conclusion

The codebase contains real secp256k1 math and real GPU optimization work.

However, the biggest implementation risk is not:

> "the elliptic-curve formula is wrong"

The biggest risk is:

> "the scanner’s surrounding system logic does not preserve or interpret the math correctly enough to produce exact, reconstructable, trustworthy results"

That distinction should guide all remediation work.
