# K3 Fix and Test Plan

This document captures the comprehensive remediation plan for K3, including the order of fixes, the logic behind that order, and the tests required to prove correctness.

---

## Fix order

### Phase 1: safety and candidate transport

1. fix result buffer overflow
2. redesign candidate records so metadata is explicit and bounded
3. validate input files and runtime arguments strictly

### Phase 2: exact scalar state

4. introduce scalar-aware thread state
5. version checkpoints to preserve exact scalar ownership
6. make every candidate reconstructable to an exact scalar in the non-endomorphism case

### Phase 3: range and mode semantics

7. fix `-start` to define exact disjoint thread windows
8. fix per-iteration stepping so there are no gaps or overlaps
9. enforce compressed/uncompressed mode semantics

### Phase 4: exact verification and bloom correctness

10. add exact post-bloom verification
11. remove silent bloom reinterpretation
12. reject unsupported large blooms until versioned support exists

### Phase 5: endomorphism scalar recovery

13. add scalar-side `lambda` mapping
14. prove point-side and scalar-side endomorphism equivalence
15. make endomorphism hits reconstructable to exact private scalars

### Phase 6: documentation and tooling cleanup

16. update README, Makefile targets, and launcher scripts
17. make docs match implemented semantics exactly

---

## Core semantic targets

The corrected implementation should satisfy these rules:

### Search mode rules

- `-compressed` checks only compressed pubkeys
- `-uncompressed` checks only uncompressed pubkeys
- `-both` checks both

### Range rules

- `-start X` means the first scalar searched is exactly `X`
- each thread owns a disjoint scalar window
- each global iteration advances by a disjoint global stride

### Candidate rules

- bloom pass produces a candidate
- exact target-set match produces a confirmed hit

### Scalar recovery rules

Every confirmed hit must map back to:

- exact private scalar
- exact pubkey format
- exact `HASH160`
- exact mode / endomorphism metadata

### Bloom rules

The scanner must never silently reinterpret the bloom format.

---

## File and architecture changes

### New support files

- `src/search-state.h/.cpp`
  - scalar ownership
  - scalar arithmetic mod group order `n`
  - checkpoint v2
  - hit reconstruction

- `src/target-verifier.h/.cpp`
  - exact target loading
  - exact membership testing
  - candidate -> confirmed conversion

- `src/input-validation.h/.cpp`
  - strict input validation
  - strict decimal parsing
  - bloom and checkpoint validation

### Main runtime file

- `src/BloomSearch32K3.cu`
  - safe candidate buffer header
  - explicit candidate records
  - exact-mode bloom checks
  - scalar-aware initialization and stepping
  - candidate confirmation path
  - progress accounting fix

### Documentation/tooling

- `README.md`
- `Makefile`
- `launch_all_gpus.sh`

---

## Test strategy

Testing must be layered so failures are easy to localize.

---

## Layer A: host-side scalar and field arithmetic

### Goal
Prove host scalar/field helpers match the secp256k1 reference math.

### Tests

- compare modular add/sub/mul against bigint reference
- compare scalar arithmetic mod `n`
- compare inversion results

### Acceptance criteria

All arithmetic matches the reference implementation for:

- edge cases
- random values
- near-boundary values

---

## Layer B: point arithmetic

### Goal
Prove point addition, doubling, and scalar multiplication match a trusted oracle.

### Tests

- random `k`: verify `kG`
- deterministic small values:
  - `1G`
  - `2G`
  - `3G`
  - `n-1`
- verify point negation relation:
  - `(n-k)G == -kG`

### Acceptance criteria

Host-side point generation matches the oracle exactly.

---

## Layer C: hashing and pubkey serialization

### Goal
Prove compressed/uncompressed `HASH160` behavior is correct.

### Tests

- compressed pubkey `HASH160` vectors
- uncompressed pubkey `HASH160` vectors
- symmetric compressed hashing must match two single compressed computations

### Acceptance criteria

All `HASH160` values match known-good vectors.

---

## Layer D: bloom correctness

### Goal
Ensure scanner bloom semantics match the builder/oracle semantics.

### Tests

- exact modulo bloom lookup against reference implementation
- malformed bloom size validation
- malformed seeds validation
- reject unsupported bloom sizes > 2^32 in exact-mode v1

### Acceptance criteria

No silent bloom reinterpretation. CPU and GPU logic agree on every tested lookup.

---

## Layer E: range/window semantics

### Goal
Prove `-start` and stepping behavior are exact and disjoint.

### Tests

- tiny thread count / tiny step size model
- enumerate scalar ownership by thread
- verify:
  - no overlap
  - no gaps
  - first searched scalar equals requested start

### Acceptance criteria

Range semantics are deterministic, gap-free, and overlap-free.

---

## Layer F: candidate transport safety

### Goal
Prove candidate buffering is safe even under heavy hit rates.

### Tests

- force every thread to emit candidates
- use tiny candidate capacity
- verify:
  - `storedCount <= capacity`
  - `totalCount == storedCount + droppedCount`
  - no invalid host/device copies

### Acceptance criteria

No out-of-bounds behavior and correct accounting under overflow pressure.

---

## Layer G: scalar reconstruction

### Goal
Prove candidate metadata can reconstruct exact private scalars.

### Tests

- non-endomorphism:
  - `windowCenter + pointDelta mod n`
- negative point:
  - `n - k`
- endomorphism:
  - `lambda * k mod n`
  - `lambda^2 * k mod n`

### Acceptance criteria

Reconstructed scalar reproduces the exact candidate point and exact hash.

---

## Layer H: exact verification

### Goal
Prove bloom candidates and confirmed hits are separated correctly.

### Tests

- bloom false-positive fixture
- exact known target fixture
- no-target negative fixture

### Acceptance criteria

- false positives remain candidates only
- true targets become confirmed hits only after exact lookup

---

## Layer I: checkpoint/resume

### Goal
Prove that checkpoint v2 preserves exact scalar semantics.

### Tests

- save state mid-run
- resume from checkpoint
- compare resumed behavior with uninterrupted run

### Acceptance criteria

Checkpoint resume produces equivalent scalar ownership and equivalent confirmed hits.

---

## Implementation acceptance checklist

The K3 remediation is complete only when all of these are true:

- no unsafe candidate copyback
- exact scalar ownership per thread exists
- `-start` is exact and disjoint
- search modes are enforced by the actual hashing/checking path
- bloom semantics are explicit and validated
- candidates are distinct from confirmed hits
- every confirmed hit has an exact reconstructable private scalar
- checkpoint v2 preserves exact scalar semantics
- documentation and scripts reflect the corrected behavior

---

## Recommended implementation discipline

Do not optimize first.

The correct order is:

1. get the semantics right
2. get the tests right
3. make the implementation safe
4. make exact verification work
5. then revisit optimizations

That order minimizes the risk of benchmarking the wrong behavior.
