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
- After host argument marshalling, a native kernel's complete transitive call
  graph MUST NOT call Python, JavaScript, Node-API, or another interpreter
  runtime. Unsupported operations fail compilation instead of inserting a
  host callback. Explicitly declared native libraries and packed C ABI calls
  are allowed. There is no accepted partially isolated backend: a new kernel
  kind remains experimental outside the canonical compiler until it emits a
  certified isolated core.
- Every compiled function MUST retain a correct dynamic same-source fallback,
  unless an explicit capability boundary and tested fallback are documented.
- Generated IR and target code MUST retain source provenance.  `native
  explain`, `native ir`, `native emit-c`, `native emit-core-c`, and `native
  emit-header` are public developer interfaces, not incidental debugging
  output.
- Native ABIs SHOULD use packed typed storage, explicit dimensions, explicit
  ownership, and batched calls.  Object-at-a-time crossings through JavaScript
  are not a scalable mathematical representation.
- Mathematical algorithms, isolated kernel ABIs, and foreign-library
  declarations MUST remain independent of a particular dynamic host ABI.
  Node-API belongs only in replaceable host adapters. A future CPython adapter,
  standalone executable, or WebAssembly host must not require extracting the
  algorithm from an N-API callback first.
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
The exhaustive symbol-level dense-matrix result is in
[`architecture/DENSE-MATRIX-COMPLIANCE.md`](architecture/DENSE-MATRIX-COMPLIANCE.md).

Every registered N-API property also has an explicit decision in
[`architecture/native-export-policy.json`](architecture/native-export-policy.json).
The generated
[`architecture/native-exports.json`](architecture/native-exports.json) resolves
each property to its unique callback definition, source location, direct calls,
known consumers, family, and decision. The default is reject-unclassified:
regenerating the inventory cannot bless a new export, and the generic
`legacy-handwritten-dynamic` disposition is prohibited.

An exception for handwritten mathematical native code records:

- the mathematical or systems reason;
- the dynamic/reference implementation and correctness oracle;
- benchmark evidence where performance is the reason;
- portability and fallback policy;
- a decision record when the exception establishes a lasting precedent.

Exceptions are allowed and visible.  Quietly bypassing the policy is not.

## Declared foreign libraries

Foreign-library calls use the strict declarations documented in
[`FFI.md`](FFI.md). The primary declaration is statically parsed,
CPython-parseable `.ffi.py`; checked `.ffi.json` is its deterministic lowered
IR. A declaration is the shared source of truth for the
ordinary dynamic wrapper and host-isolated native lowering. Mathematical code
imports only generated safe modules under `sagejs.ffi`; it does not load an
addon, name a C symbol, own a raw pointer, or encode cleanup itself.

The complete exported native surface is ratcheted in
[`architecture/native-boundaries.json`](architecture/native-boundaries.json).
`sagejs ffi audit` and `pnpm architecture:check` reject unreviewed N-API,
Wasm, runtime-intrinsic, declaration, or classified-native-file drift. Updating
the inventory requires explicit regeneration and review; regeneration does not
classify or justify a new boundary by itself.

Native lowering resolves an imported function by Python module, declaration
identity, and declaration content hash. It MUST NOT infer a foreign call from
an unqualified function name. The IR retains the foreign identity, semantic
signature, ABI signature, ownership, effects, error policy, target support,
and source provenance. The declaration hash participates in the native cache
identity.

Only ABI type adapters are compiler primitives. Adding another function with
an already supported ABI requires a declaration and generated wrapper, not a
function-specific compiler branch. Unknown declarations, fields, types,
effects, error policies, and target combinations fail closed. The dynamic and
native paths are differential oracles for each other; mature upstream tests
remain additional oracles.

Calls admitted to `@native` are part of the isolated core call graph. They may
call declared C/C++ libraries but MUST NOT call Node-API, JavaScript, Python,
or a host callback after marshalling. Ownership and cleanup are explicit and
lexically generated. Raw pointers are not a public mathematical type.

Owned foreign resources follow the same rule. The declaration, rather than
mathematical source, specifies the ABI storage, constructor, close operation,
and scalar preconditions. Ordinary execution uses a generated opaque wrapper
with deterministic idempotent close and a finalizer fallback. Native execution
currently admits owned resources only as non-escaping lexical locals and emits
initialization flags plus all-exit cleanup in the isolated core. Resource
construction inside control-flow blocks and resources in public kernel signatures fail
compilation until a future ownership model proves them safe. A compiler change
MUST NOT silently turn such a resource into a raw pointer or host callback.

Borrowed foreign views form a declaration-validated acyclic ownership graph.
Every view names its immediate owner and computed owned root. Ordinary
execution strongly retains that owner and rejects every view operation after
explicit root closure. Native execution represents a view as non-owning ABI
storage, emits no destructor for it, and keeps the lexical owned root alive
through all uses. Views cannot escape a kernel or appear in its public ABI.
This is intentionally a narrow foreign-resource protocol, not a general
borrow checker: unsupported ownership patterns fail schema validation or
compilation. Unix native CI exercises real resource/view schedules under
AddressSanitizer, UndefinedBehaviorSanitizer, and leak detection.

Compiler-owned records are fixed-layout value aggregates declared by an
ordinary CPython-parseable `NativeRecord` subclass. Their schema—not a host
object layout—defines the isolated ABI. Record fields are checked scalars or
borrowed packed storage; generated adapters root every borrowed owner for the
synchronous call, and direct compiled calls pass records by value. Records do
not expose pointers, destructors, arbitrary attributes, or host methods.
Returning or retaining a borrowed record fails compilation. Nested or owned
records remain unsupported until their construction, cleanup, and escape rules
are specified here and enforced mechanically.

## Compiled-kernel witnesses

[`architecture/native-kernels.json`](architecture/native-kernels.json) lists
representative source-transparent kernels.  At minimum, the witness set covers
exact integer promotion, dense prime-field computation, packed binary64
storage, compiler-owned value records, mutable signed exact-integer record
views, and packed arbitrary-precision integer vectors. Compiler changes
preserve their same-source fallback,
provenance, introspection, differential tests, and benchmarks. Dense exact
rational matrices use an owned normalized pair of packed tagged-integer spans;
structural arithmetic is typed Python and mature `fmpq_mat` algorithms cross
only generated declaration-driven copy-in/copy-out boundaries.
Univariate polynomials over `ZZ`, `QQ`, and small prime fields likewise own
normalized packed coefficient storage. Construction and structural arithmetic
are host-independent typed Python; mature FLINT multiplication, exact division,
finite-field gcd and roots, irreducibility, and factorization cross only
generated declared FFI using caller-owned buffers. Pointer-bearing FLINT
polynomial and factor objects are differential oracles, never production
`PolynomialElement` state. Exact algebraic roots and the not-yet-migrated
power-series family retain narrow audited bridges until their result/resource
representations become packed.

Every successful native compilation emits a host-independent `kernel_core.c`
and `kernel_core.h` as its canonical mathematical artifact.  The core owns the
entire lowered transitive call graph; a generated Node addon is only one host
adapter that includes that core.  Exact integers, packed binary64 buffers,
MPFR/MPC fields, source-transparent prime-field matrices, and the legacy
specialized prime-field backend all use this pipeline.  Core source is
mechanically rejected if it
contains Node-API, CPython, or JavaScript-engine symbols.  The Node addon is an
adapter: it validates and borrows packed inputs, calls the isolated core, and
translates the returned status only after native execution finishes.  The same
core is compiled and executed as a standalone C program and as WebAssembly
when the WASI/GMP toolchain is available.

The compiler MUST generate the isolated core first and fail closed before it
generates a host adapter.  `kernel.c` is never an alternative mathematical
implementation and MUST contain the generated core only through the explicit
`kernel_core.c` boundary.  Cache identities include the core ABI and every
generator module that contributes to either artifact.

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
