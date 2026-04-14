# K3 File-by-File Implementation Plan

This document turns the K3 remediation plan into a concrete engineering checklist.

---

## New files to add

## `src/search-state.h` and `src/search-state.cpp`

### Purpose

- scalar representation
- scalar arithmetic modulo secp256k1 group order `n`
- exact thread-window ownership
- candidate-to-scalar reconstruction
- checkpoint v2 structures

### Key structs

- `Scalar256`
- `ThreadScalarState`
- `ResultHeader`
- `CandidateRecord`
- `ConfirmedHit`
- `CheckpointHeaderV2`

### Key functions

- `addScalarModN`
- `subScalarModN`
- `negateScalarModN`
- `initializeThreadScalarWindows`
- `advanceThreadScalarWindows`
- `deriveExactScalarForHit`
- `saveCheckpointV2`
- `loadCheckpointV2`

---

## `src/target-verifier.h` and `src/target-verifier.cpp`

### Purpose

- exact target set loading
- exact `HASH160` lookup
- candidate -> confirmed hit conversion

### Key structs

- `ExactTargetSet`

### Key functions

- `loadExactTargetSet`
- `normalizeExactTargetSet`
- `containsHash160`
- `confirmCandidateHash`
- `buildConfirmedHit`

---

## `src/input-validation.h` and `src/input-validation.cpp`

### Purpose

- validate bloom configuration
- validate seed file sizes
- validate prefix bitmap size
- validate range arguments
- parse decimal start values strictly
- validate checkpoint headers

### Key functions

- `validateBloomConfig`
- `validateOptionalBloomConfig`
- `validatePrefixBitmapSize`
- `validateRangeArgs`
- `parseDecimalScalarStrict`
- `validateCheckpointHeaderV2`

---

## Existing files to modify

## `src/BloomSearch32K3.cu`

### Main responsibilities after refactor

- argument parsing
- strict validation
- GPU setup
- candidate transport
- scalar-aware initialization
- exact verification
- checkpoint save/resume
- progress reporting

### Key changes

#### 1. Replace old result buffer format

Current model:

- one raw count word
- packed integer records

New model:

- `ResultHeader`
- `CandidateRecord[]`

#### 2. Replace unsafe candidate recording

Add GPU helpers:

- `reserveCandidateSlot(...)`
- `writeCandidateRecord(...)`
- `EmitCandidateIfMatch_K3(...)`

#### 3. Remove mask-based bloom reinterpretation

Replace:

- `next_power_of_2(...)`
- `bitsMask`
- `h & mask`

with:

- exact `bits`
- `h % bits`

#### 4. Add mode-aware point checking

Split the current combined path into:

- compressed only
- uncompressed only
- both

#### 5. Add scalar-aware startup

Replace old point-only init with:

- exact thread scalar windows
- point generation from thread center scalars

#### 6. Add exact verification

After GPU candidates are copied back:

- exact target set lookup
- build confirmed hits
- log confirmed hits separately from candidates

#### 7. Replace old checkpoint scheme

Replace point-only checkpointing with checkpoint v2 storing:

- header
- exact thread scalar state

#### 8. Fix progress accounting

Report:

- scalar checks
- candidate hits
- confirmed hits
- dropped candidate count

---

## `BloomSearch32K1_original.cu`

### Recommended scope

Minimal changes only:

- fix unsafe result overflow
- make mode limitations explicit if not fully repaired
- treat as reference-only path

### Reason

Do not duplicate the full K3 remediation twice unless absolutely necessary.

---

## `GPUHash.h`

### Recommended changes

- no algorithm rewrite unless tests prove a bug
- add comments clarifying compressed parity semantics
- verify symmetric compressed helper against single-call reference behavior

---

## `GPUMath_K3.h`

### Recommended changes

- keep the core arithmetic stable
- add comments if needed
- only add scalar-side constants if they are shared and oracle-verified

### Important note

Do not change core field arithmetic unless reference tests prove a mismatch.

---

## `GPUMath.h`

### Recommended changes

- minimal or none
- keep as reference implementation

---

## `GPUGroup.h`

### Recommended changes

- none
- treat as trusted precomputed table, verified indirectly by point-generation tests

---

## `README.md`

### Rewrite sections

- what K3 is
- candidate vs confirmed hit semantics
- exact meaning of `-start`
- exact meaning of compressed/uncompressed modes
- bloom semantics
- checkpoint semantics
- working examples

---

## `Makefile`

### Add targets

- `test-host-math`
- `test-fixtures`
- `test-bloom`
- `test-reconstruction`
- `test-e2e`
- `verify-docs`

### Fix targets

- profile targets must include required inputs
- CUDA path should be configurable

---

## `launch_all_gpus.sh`

### Rewrite assumptions

- do not rely on the old overlapping `-start` interpretation
- generate true disjoint scalar starts if using exact range mode
- avoid unsupported default bloom sizes
- replace broad `pkill -f` with safer process handling

---

## Test and fixture files to add

## `tests/reference_oracle.py`

### Responsibilities

- reference secp256k1 field arithmetic
- reference scalar arithmetic mod `n`
- reference point arithmetic
- reference `HASH160`
- reference bloom lookup
- reference endomorphism scalar mapping

---

## `tests/generate_fixtures.py`

### Responsibilities

- generate small deterministic target sets
- generate matching exact target file
- generate matching prefix bitmap
- generate matching bloom and seed files

---

## `tests/fixtures/*`

### Suggested contents

- `targets_small.json`
- `targets_exact.bin`
- `prefix_small.bin`
- `bloom_small.bin`
- `seeds_small.bin`

---

## Exact implementation sequence

1. add test oracle and fixtures
2. add `search-state.*`
3. add `input-validation.*`
4. add `target-verifier.*`
5. convert K3 candidate buffer format
6. convert K3 startup/resume to scalar-aware state
7. fix `-start`
8. fix mode semantics
9. add exact verification
10. fix bloom semantics
11. add endomorphism scalar mapping
12. align docs and scripts

---

## Completion criteria

The file-by-file plan is complete when:

- new support files own exact scalar semantics cleanly
- `BloomSearch32K3.cu` stops packing ambiguous metadata
- every confirmed hit is reconstructable and exactly verified
- docs and scripts describe the corrected runtime behavior exactly
