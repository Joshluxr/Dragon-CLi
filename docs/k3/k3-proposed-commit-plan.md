# K3 Proposed Commit Plan

This document records the recommended commit sequence, exact commit messages, and the intended scope of each change.

---

## Commit 1

### Message

```text
test(k3): add reference oracle and deterministic search fixtures
```

### Scope

- add bigint/oracle validation
- add small deterministic fixtures
- add test targets

### Reason

Establish a trusted reference before modifying scanner behavior.

---

## Commit 2

### Message

```text
fix(k3): harden result buffering and validate input file sizes
```

### Scope

- safe candidate header/counter model
- bounded host copyback
- bloom / seeds / prefix validation

### Reason

Remove unsafe behavior first and fail fast on bad inputs.

---

## Commit 3

### Message

```text
refactor(k3): introduce scalar-aware search state and checkpoint v2
```

### Scope

- exact scalar ownership per thread
- checkpoint v2 storing scalar state
- resume logic updated to exact state

### Reason

Make candidate hits reconstructable in principle.

---

## Commit 4

### Message

```text
fix(k3): make start-range scanning exact and thread windows disjoint
```

### Scope

- exact `-start` semantics
- no unintended overlap between thread windows
- deterministic global stepping

### Reason

Repair the scanner’s core range-search semantics.

---

## Commit 5

### Message

```text
fix(k3): enforce compressed and uncompressed mode semantics
```

### Scope

- actual mode-gated hash checks
- corrected progress accounting

### Reason

Make CLI mode flags truthful and operational.

---

## Commit 6

### Message

```text
feat(k3): add exact target verification and confirmed-hit pipeline
```

### Scope

- exact target set loader
- exact post-bloom confirmation
- candidate vs confirmed separation

### Reason

Turn bloom candidates into trustworthy confirmed hits.

---

## Commit 7

### Message

```text
fix(k3): restore exact bloom semantics and reject unsupported large filters
```

### Scope

- remove silent power-of-two bloom reinterpretation
- exact modulo bloom semantics
- explicit rejection of unsupported large blooms in v1

### Reason

Make bloom filtering semantically correct and builder-compatible.

---

## Commit 8

### Message

```text
fix(k3): map endomorphism hit metadata back to exact private scalars
```

### Scope

- add scalar-side lambda mapping
- validate point-side vs scalar-side endomorphism equivalence
- make endomorphism hits reconstructable

### Reason

Complete the scalar recovery story for all candidate variants.

---

## Commit 9

### Message

```text
docs(k3): align scripts, build targets, and usage with corrected semantics
```

### Scope

- README rewrite
- Makefile cleanup
- launcher semantics cleanup
- truthful examples and profile commands

### Reason

Ensure documentation and tooling match the corrected implementation.

---

## Suggested PR title

```text
Fix K3 search semantics, exact verification, and scalar recovery
```

---

## Suggested PR body outline

### Summary

Repair K3 so confirmed hits are:

- safely transported
- exactly verified
- reconstructable to exact private scalars
- produced under correct range and mode semantics

### Problem statement

K3 has strong secp256k1 and hashing machinery but several system-level semantic issues:

- unsafe hit buffering
- insufficient scalar-state preservation
- misleading `-start` behavior
- broken mode semantics
- bloom hits without exact confirmation
- silent bloom semantic changes

### What changes

1. reference oracle and fixtures
2. safe buffering and validation
3. scalar-aware search state
4. exact disjoint range semantics
5. correct mode behavior
6. exact verification
7. exact bloom semantics
8. endomorphism scalar recovery
9. documentation/tooling alignment

### Testing

- field/scalar/point arithmetic reference checks
- hash serialization tests
- bloom equivalence tests
- range overlap/gap tests
- mode semantics tests
- candidate overflow tests
- scalar reconstruction tests
- exact confirmation tests
- checkpoint/resume tests

---

## Why this commit order is recommended

The order is deliberate:

1. establish truth
2. remove unsafe behavior
3. preserve exact scalar state
4. fix semantics
5. add exact verification
6. fix mathematical bloom assumptions
7. finalize endomorphism scalar recovery
8. then clean docs/scripts

This minimizes the risk of optimizing or documenting behavior that is still semantically wrong.
