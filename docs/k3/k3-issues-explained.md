# K3 Issues Explained

This document explains each major issue in plain English: what is wrong, why it matters, and what correct behavior should be.

---

## Critical issues

## 1. Result buffer overflow

### What is wrong

The GPU increments the global hit counter even after the candidate buffer is full.

That means:

- more hits can be counted than were actually stored
- the host later trusts that oversized count
- the host tries to copy back more records than the buffer can hold

### Why it matters

This is not just a reporting bug. It can cause:

- out-of-bounds reads
- out-of-bounds writes
- crashes
- silent corruption

### What correct behavior should be

The system must track:

- how many candidate events occurred
- how many candidate records were actually stored
- how many were dropped

The host must only copy back the number of records actually stored.

---

## 2. Candidate hits are not reliably reconstructable to exact private keys

### What is wrong

The scanner stores EC points and candidate metadata, but it does not persist enough exact scalar-state to always reconstruct the private key behind a hit.

### Why it matters

Without the exact scalar, a candidate is not actionable. A real recovery/search engine must be able to say:

> this exact private scalar produced this exact hit

### What correct behavior should be

The scanner must preserve exact scalar ownership per thread and enough metadata per candidate to reconstruct:

- base scalar
- signed point interpretation
- endomorphism mapping

---

## 3. No exact verification after bloom hits

### What is wrong

Bloom filters are only probabilistic prefilters. Passing a bloom filter means "maybe present", not "definitely present".

The current pipeline reports bloom-passing candidates but does not always perform an exact set-membership check afterward.

### Why it matters

False positives are expected with bloom filters. Without exact verification, the scanner cannot distinguish:

- real matches
- false positives

### What correct behavior should be

Every bloom candidate must be checked against an exact target set before it becomes a confirmed hit.

---

## High issues

## 4. `-start` semantics are misleading and overlap-heavy

### What is wrong

The code initializes per-thread start points as though they were exact sequential scalars, but the kernel actually scans a signed window around each thread’s center point.

That means consecutive thread starts produce heavily overlapping scan windows.

### Why it matters

This breaks the operator’s mental model of exact range scanning.

Consequences:

- wasted work
- hidden overlap
- incorrect assumptions in multi-GPU range scripts

### What correct behavior should be

Each thread should own a disjoint scalar window, and `-start` should mean the first scalar searched is exactly the user’s requested start.

---

## 5. Compressed/uncompressed mode flags are not enforced correctly

### What is wrong

The CLI exposes:

- compressed only
- uncompressed only
- both

But the actual hashing/checking path does not consistently respect that choice.

### Why it matters

The user cannot trust the requested search mode.

Consequences:

- wrong performance assumptions
- wrong progress accounting
- wrong result semantics

### What correct behavior should be

Mode selection must control the actual pubkey hash computations and target checks, not just labels or counters.

---

## 6. Bloom filters larger than 2^32 bits are not truly supported

### What is wrong

Bloom positions are derived from a 32-bit Murmur3 hash. That means the scanner cannot address more than 2^32 distinct bit positions correctly.

### Why it matters

If the scanner accepts a bloom size larger than 2^32 bits, then some of that bit space is unreachable or semantically invalid.

### What correct behavior should be

Either:

- explicitly reject bloom sizes above the supported range

or

- introduce a versioned 64-bit bloom format with matching builder and scanner support

---

## 7. K3 silently changes bloom semantics by rounding sizes

### What is wrong

K3 rounds bloom sizes to a power of two and switches from exact modulo indexing to bitmask indexing.

That changes the meaning of the bloom file unless the bloom was built for that exact same layout.

### Why it matters

The scanner may silently disagree with the tool that built the bloom filter.

That can cause:

- false negatives
- false positives
- incorrect target filtering

### What correct behavior should be

The scanner should either:

- use exact modulo semantics with the declared bloom size

or

- explicitly require a versioned power-of-two bloom format

It should never silently reinterpret the input.

---

## Medium issues

## 8. Weak input validation

### What is wrong

The scanner does not rigorously validate:

- bloom file size
- seeds file size
- prefix bitmap size
- decimal input range
- checkpoint consistency

### Why it matters

Malformed inputs can lead to:

- bad copies
- wrong bloom behavior
- silent wrong answers

### What correct behavior should be

All inputs should be validated before GPU launch and rejected with clear error messages if inconsistent.

---

## 9. Some K3 optimizations are claimed but not actually active

### What is wrong

The code and README mention optimizations like warp-level atomic aggregation and batched inversion patterns that are not fully wired into the active candidate path.

### Why it matters

This is mainly a truth-in-advertising problem:

- performance claims become harder to trust
- reviewers may assume code paths are active when they are not

### What correct behavior should be

Either:

- activate the optimized path and prove equivalence

or

- remove or clearly label the inactive optimization claims

---

## 10. Progress accounting can be wrong

### What is wrong

If the actual hashing/checking behavior does not match the selected mode, the reported throughput and "keys checked" numbers also become inaccurate.

### Why it matters

Operators use those numbers to judge:

- search coverage
- throughput
- whether the scanner is doing what they expect

### What correct behavior should be

Progress reporting must be tied to the actual work performed:

- scalar windows checked
- pubkey forms checked
- candidates emitted
- confirmed hits

---

## 11. Range-partitioning arguments are not validated strictly

### What is wrong

`rangeId` and `totalRanges` are accepted with weak validation.

### Why it matters

Invalid range configuration can produce:

- bad partition math
- overlapping partitions
- nonsensical search space distribution

### What correct behavior should be

The scanner should reject invalid range combinations before any work begins.

---

## 12. Decimal parsing is too permissive and silent

### What is wrong

The decimal start parser strips non-digit formatting loosely and does not always reject overflow explicitly.

### Why it matters

A malformed or oversized input can be silently reinterpreted as a different scalar than the user intended.

### What correct behavior should be

The parser should:

- allow only explicitly supported separators
- reject invalid characters
- reject overflow
- reject zero and values `>= n`

---

## Lower-priority issues

## 13. Documentation and profiling examples are inaccurate

### What is wrong

Some examples omit required arguments or describe behavior that the current implementation does not actually enforce.

### Why it matters

This wastes operator time and hides semantic drift between docs and code.

### What correct behavior should be

Every documented command should work as written and match the implemented semantics.

---

## 14. Hardcoded CUDA path in the Makefile

### What is wrong

The build assumes a fixed CUDA install path.

### Why it matters

This hurts portability across systems.

### What correct behavior should be

The build should allow environment override or path detection.

---

## 15. Broad process killing in the launcher

### What is wrong

The launcher uses a broad `pkill -f ...` pattern.

### Why it matters

That can terminate unrelated processes whose command line happens to match.

### What correct behavior should be

Use more specific process management:

- PID files
- named sessions
- explicit process lists

---

## 16. Randomness helper ignores failures

### What is wrong

The random-key initialization helper does not strongly enforce successful reads from the OS RNG.

### Why it matters

If randomness fails, starting state may be weaker or malformed than intended.

### What correct behavior should be

Randomness acquisition should be checked and failure should abort the run cleanly.

---

## Final takeaway

The code’s most important problems are not obviously "the secp256k1 formula is wrong."

The real issues are:

- unsafe candidate transport
- insufficient scalar-state tracking
- misleading search semantics
- probabilistic results without exact confirmation
- inconsistent bloom assumptions

That is why the fix plan focuses first on:

1. safety
2. scalar recoverability
3. exact verification
4. semantic correctness

and only then on performance cleanup.
