# K3 Runtime Refactor Blueprint

This document records the immediate next-step refactor discussed for `src/BloomSearch32K3.cu`.

The goal of this first runtime change is:

> make candidate transport safe and explicit before attempting deeper semantic fixes

---

## Why this is the right first code change

The existing runtime pipeline has one especially dangerous flaw:

- the candidate hit count can exceed the storage capacity of the result buffer
- the host then trusts that oversized count
- host/device copies can go out of bounds

That means the first practical refactor should focus on:

1. safe bounded candidate transport
2. explicit candidate metadata
3. host copyback based on stored capacity, not raw event count

This change does **not** solve every K3 issue, but it creates the safe foundation required for later fixes.

---

## Current result-buffer model

The current implementation conceptually uses:

```text
out[0] = hit count
out[1..] = packed candidate payloads
```

Problems with this model:

- one counter is doing too many jobs
- payload count and event count can diverge
- payload metadata is packed too tightly and ambiguously
- the host has no safe way to distinguish "stored" from "observed"

---

## New result-buffer model

Replace the raw word buffer with:

### 1. `ResultHeader`

```cpp
struct ResultHeader {
    uint32_t storedCount;
    uint32_t totalCount;
    uint32_t droppedCount;
    uint32_t reserved;
};
```

### 2. `CandidateRecord[]`

```cpp
struct CandidateRecord {
    uint32_t threadId;
    int32_t pointDelta;
    uint8_t yVariant;
    uint8_t addrFormat;
    uint8_t endoVariant;
    uint8_t reserved;
    uint32_t hash160[5];
};
```

### Why this is better

It separates:

- how many candidate events happened
- how many records were stored
- how many were dropped
- what each candidate actually means

---

## GPU-side refactor

## Replace `RecordMatchSimple(...)`

The current helper should be replaced by two clearer helpers:

### `reserveCandidateSlot(...)`

Responsibilities:

- increment `totalCount`
- reserve a bounded storage slot if available
- otherwise increment `droppedCount`

### `writeCandidateRecord(...)`

Responsibilities:

- write explicit metadata fields
- avoid packed multi-meaning words

### Combined behavior

Candidate emission should become:

1. bloom pass succeeds
2. reserve bounded slot
3. if reservation succeeds, write explicit record

That is safer and easier to reason about.

---

## Host-side refactor

The host should:

1. copy back `ResultHeader`
2. copy back only `storedCount` records
3. never trust `totalCount` as a payload-copy length

This single change eliminates the current unsafe copyback behavior.

---

## Why explicit candidate fields matter

The current packed metadata scheme overloads one integer with multiple meanings.

That is a problem because later scalar reconstruction needs exact semantics for:

- thread identity
- point offset from center
- positive vs negative point
- compressed vs uncompressed hash path
- endomorphism variant

Using `CandidateRecord` now makes the later exact-reconstruction step much cleaner.

---

## Additional runtime changes tied to this refactor

Once the result-buffer model is replaced, `src/BloomSearch32K3.cu` should also begin the following staged cleanup:

### Remove silent bloom-mask logic

Replace:

- power-of-two rounding
- mask-based addressing

with exact bloom `bits` values in function signatures and exact modulo semantics.

### Add mode-aware dispatch

Prepare for:

- compressed only
- uncompressed only
- both

by splitting the point-check path into mode-aware functions.

### Prepare for scalar-aware host processing

Once candidates are explicit records, the host can later:

- reconstruct exact scalars
- exact-verify against target sets
- emit confirmed hits

---

## What this step deliberately does not finish

This runtime refactor is intentionally first-step only. It does **not yet** fully solve:

- exact scalar recovery
- `-start` range semantics
- endomorphism scalar mapping
- exact verification
- checkpoint v2

Those come in later commits.

The purpose of this step is to make the runtime candidate pipeline:

- safe
- explicit
- testable

---

## Tests that should pass after this step

### Candidate flood test

Force heavy candidate production and verify:

- `storedCount <= capacity`
- `totalCount == storedCount + droppedCount`

### Copyback bounds test

Verify the host copies only `storedCount * sizeof(CandidateRecord)` bytes.

### Candidate integrity test

Force a known candidate and confirm:

- `threadId`
- `pointDelta`
- `yVariant`
- `addrFormat`
- `endoVariant`
- `hash160`

are stored exactly as expected.

---

## Key design takeaway

This first runtime refactor is the bridge from:

> "fast but unsafe candidate word buffer"

to:

> "safe, explicit, reconstructable candidate transport"

That is why it is the correct next implementation step before the larger semantic repairs.
