# K3 Scalar Reconstruction Explained

This document explains how exact private scalars should be reconstructed from K3 candidate metadata once scalar-aware thread state is in place.

---

## Goal

Turn this candidate metadata:

- `threadId`
- `pointDelta`
- `yVariant`
- `addrFormat`
- `endoVariant`
- `hash160`

into:

> the exact private scalar that produced the confirmed hit

---

## Core principle

For secp256k1:

```text
P = k * G
```

where:

- `k` is the private scalar modulo group order `n`
- `G` is the generator point

Everything in reconstruction revolves around recovering `k` exactly.

---

## Thread ownership model

Each worker thread must own an exact scalar center:

```text
k_center = threadState.windowCenter
```

Within one local scan window, the kernel checks nearby points corresponding to:

```text
k_center + pointDelta
```

So `pointDelta` must mean:

> signed scalar offset from the exact current thread window center

---

## Step 1: reconstruct the base point scalar

Given:

- `k_center`
- `pointDelta`

the first scalar is:

```text
k_point = k_center + pointDelta mod n
```

Examples:

- if `k_center = 1,000,000` and `pointDelta = +7`, then `k_point = 1,000,007`
- if `k_center = 1,000,000` and `pointDelta = -23`, then `k_point = 999,977`

---

## Step 2: handle positive-y vs negative-y point semantics

On secp256k1:

- `P = kG`
- `-P = (n - k)G`

So if the candidate came from the negative point, the scalar is not "the same scalar with a sign flag". It is:

```text
n - k
```

Therefore:

### If `yVariant == POSITIVE`

```text
k_signed = k_point
```

### If `yVariant == NEGATIVE`

```text
k_signed = n - k_point mod n
```

This is the correct scalar-level interpretation of point negation.

---

## Step 3: apply endomorphism mapping

K3 checks endomorphism-related point variants using secp256k1 GLV properties.

Point-side transform:

```text
(x, y) -> (beta * x mod p, y)
```

Scalar-side equivalent:

```text
phi(P) = (lambda * k mod n) G
```

and similarly:

```text
phi^2(P) = (lambda^2 * k mod n) G
```

So:

### If `endoVariant == 0`

```text
k_final = k_signed
```

### If `endoVariant == 1`

```text
k_final = lambda * k_signed mod n
```

### If `endoVariant == 2`

```text
k_final = lambda^2 * k_signed mod n
```

That `k_final` is the exact private scalar for the candidate.

---

## Final reconstruction formula

Putting it together:

```text
k0 = windowCenter + pointDelta mod n
k1 = (yVariant == NEGATIVE) ? (n - k0 mod n) : k0
k_final =
    k1                       if endoVariant == 0
    lambda * k1 mod n        if endoVariant == 1
    lambda^2 * k1 mod n      if endoVariant == 2
```

`addrFormat` does not change the scalar. It only changes how the public key is serialized before hashing.

---

## What each metadata field contributes

### `threadId`

Identifies which thread’s scalar center should be used.

### `pointDelta`

Identifies which scalar within the thread’s current window produced the hit.

### `yVariant`

Distinguishes `P` from `-P`.

### `endoVariant`

Distinguishes:

- original scalar
- `lambda * k`
- `lambda^2 * k`

### `addrFormat`

Determines compressed vs uncompressed verification only. It does not change the private scalar.

---

## Why exact thread scalar state is required

This reconstruction only works if the scanner preserves exact scalar ownership for each thread.

Without exact `windowCenter` state:

- `threadId + pointDelta` is not enough
- a candidate cannot be mapped back to a unique scalar

That is why checkpoint v2 and scalar-aware thread state are foundational fixes.

---

## Required tests for scalar reconstruction

### 1. Non-endomorphism reconstruction

For random thread centers and random deltas:

- reconstruct scalar
- compute `kG`
- verify point matches the expected local point

### 2. Negative-point scalar mapping

For random `k`:

- verify `(n-k)G == -kG`

### 3. Endomorphism mapping

For random `k`:

- compare point-side `(beta*x, y)` transform
- against scalar-side `(lambda*k mod n)G`

and similarly for `lambda^2`.

### 4. Full candidate round-trip

For known targets:

- generate candidate metadata
- reconstruct scalar
- recompute public key and `HASH160`
- verify exact target membership

---

## Why this step matters

This is the transition from:

> "a bloom candidate scanner"

to:

> "a search engine that can recover and prove the exact private scalar for confirmed hits"

Without correct scalar reconstruction, exact verification alone is not enough to make the scanner operationally complete.
