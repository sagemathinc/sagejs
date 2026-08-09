# Sage.js mathematical architecture

This document is normative.  It records how Sage.js mathematical software is
implemented so that performance work does not silently replace readable,
portable algorithms with a second hidden system.  The rationale and rejected
alternatives are preserved in
[`architecture/decisions/0001-three-layer-mathematics.md`](architecture/decisions/0001-three-layer-mathematics.md).

## Implementation order

New mathematical algorithms MUST be considered in this order:

1. **Ordinary Python.**  The primary source is CPython-parseable Python with a
   correct dynamic Sage.js implementation.
2. **Source-transparent native compilation.**  Performance-critical regions
   retain the same source body and acquire explicit mathematical/storage types
   understood by `@native`.
3. **Mature external mathematics.**  Sage.js calls established libraries such
   as FLINT, Arb, GMP, PARI, or msolve when they contain important algorithms
   that should not be recreated.
4. **Handwritten native primitives.**  New C/C++ is reserved for host adapters,
   compact representation primitives, foreign-library bindings, or a measured
   compiler limitation recorded as an architecture exception.

This order is a decision procedure, not a claim that C is undesirable.  A
well-tested FLINT call is generally preferable to recreating FLINT in Python.
The policy prevents an unrelated handwritten implementation from becoming the
real algorithm merely because a benchmark was urgent.

## Required invariants

- Mathematical library `.py` files MUST remain ordinary CPython-parseable
  source.  Low-level boundaries use `sagejs.runtime`; verbatim JavaScript and
  undeclared globals do not belong in strict mathematical modules.
- Native compilation MUST lower the selected typed Python body.  Selecting a
  replacement implementation from a Python function's name is prohibited.
- Every compiled function MUST retain a correct dynamic same-source fallback,
  unless an explicit capability boundary and tested fallback are documented.
- Generated IR and target code MUST retain source provenance.  `native
  explain`, `native ir`, and `native emit-c` are public developer interfaces,
  not incidental debugging output.
- Native ABIs SHOULD use packed typed storage, explicit dimensions, explicit
  ownership, and batched calls.  Object-at-a-time crossings through JavaScript
  are not a scalable mathematical representation.
- Trusted production kernels MAY ship precompiled.  User compilation remains
  optional; lack of a compiler MUST NOT make the dynamic implementation wrong.
- Native artifacts MUST be content-addressed by source, compiler/IR/ABI,
  toolchain, target, and relevant tuning policy, and MUST be safe to discard.
- Differential execution against CPython, the generated JavaScript fallback,
  and every emitted native target is routine.  A mature package or CAS is used
  as an additional mathematical oracle when appropriate.
- A performance claim MUST identify the exact workload, result equivalence,
  warmup/sample policy, host, and separately report dynamic Sage.js, compiled
  Sage.js, and relevant established/native baselines.
- Native Windows x64 is first class.  New native dependencies require Windows
  support or an explicit capability flag with a tested correct fallback.

## Native code and exceptions

Every tracked C/C++ source or header is classified in
[`architecture/native-code.json`](architecture/native-code.json).  New files
are rejected by `pnpm architecture:check` until classified.  The categories
distinguish adapters and generated parsers from mathematical algorithms.
Focused reviews of mixed and mathematical sources live in
[`architecture/native-audit.json`](architecture/native-audit.json).  The gate
checks that audited sources still have the reviewed byte and line counts, so a
later edit cannot quietly rely on a stale architectural conclusion.
The current human-readable findings and P1 remediation evidence are in
[`architecture/NATIVE-AUDIT.md`](architecture/NATIVE-AUDIT.md).

An exception for handwritten mathematical native code records:

- the mathematical or systems reason;
- the dynamic/reference implementation and correctness oracle;
- benchmark evidence where performance is the reason;
- portability and fallback policy;
- a decision record when the exception establishes a lasting precedent.

Exceptions are allowed and visible.  Quietly bypassing the policy is not.

## Compiled-kernel witnesses

[`architecture/native-kernels.json`](architecture/native-kernels.json) lists
representative source-transparent kernels.  At minimum, the witness set covers
exact integer promotion, dense prime-field computation, packed binary64
storage, mutable signed exact-integer records, and packed arbitrary-precision
integer vectors.  Compiler changes preserve their same-source fallback,
provenance, introspection, differential tests, and benchmarks.

## Parallel work

Every parallel task contract declares its implementation strategy, fallback,
oracles, and architecture exceptions.  Mathematical lanes default to ordinary
Python.  Native primitives and mixed implementations require a nonempty
exception.  Shared ABI, registry, policy, and compiler changes belong to the
native-compiler or integration lanes.

The required local gate is:

```sh
pnpm architecture:check
pnpm parallel:check
pnpm test:changed
```

The machine-readable checks deliberately enforce only objective structure.
Code review still decides whether an alleged primitive is actually a disguised
mathematical implementation and whether benchmark evidence is representative.
