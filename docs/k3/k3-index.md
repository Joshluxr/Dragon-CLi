# K3 Documentation Index

This directory captures the complete K3 analysis and planning work discussed for the external `k3` CUDA scanner archive.

Scope of this documentation set:

- what the K3 codebase is
- what it actually does
- how it works internally
- which parts of the math appear correct
- which system-level semantics are incorrect or unsafe
- how to fix each issue
- how to test each fix
- how the work should be split into reviewable commits

Files in this bundle:

1. [`k3-source-understanding.md`](./k3-source-understanding.md)
   - source inventory
   - end-to-end execution model
   - exact description of what the program does
   - internal mechanics of secp256k1 scanning, hashing, and bloom filtering

2. [`k3-issues-explained.md`](./k3-issues-explained.md)
   - plain-English explanation of each major issue
   - why it matters
   - what correct behavior should be

3. [`k3-fix-and-test-plan.md`](./k3-fix-and-test-plan.md)
   - comprehensive remediation plan
   - testing strategy for logic, math, and semantics
   - acceptance criteria

4. [`k3-file-by-file-implementation-plan.md`](./k3-file-by-file-implementation-plan.md)
   - exact file ownership
   - new files to add
   - existing files to modify
   - struct/function level design direction

5. [`k3-proposed-commit-plan.md`](./k3-proposed-commit-plan.md)
   - proposed commit sequence
   - exact commit message recommendations
   - PR title and body outline

6. [`k3-scalar-reconstruction-explained.md`](./k3-scalar-reconstruction-explained.md)
   - mathematical walkthrough for reconstructing exact private scalars from candidate metadata
   - explanation of `pointDelta`, `yVariant`, and `endoVariant`

7. [`k3-runtime-refactor-blueprint.md`](./k3-runtime-refactor-blueprint.md)
   - immediate next-step refactor inside `BloomSearch32K3.cu`
   - safe result-buffer redesign
   - host/device copyback changes
   - kernel-parameter and stepping changes

Status of this branch:

- documentation only
- no production code changes
- intended as a review artifact and implementation guide
