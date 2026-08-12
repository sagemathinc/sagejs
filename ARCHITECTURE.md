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

## Compiled Python module boundaries

Every compiled Python source file has one lexical top-level environment and
one stable module namespace object. Functions and closures resolve globals in
that environment; reads and writes through the module object are live views of
the same storage. Repeated imports return the same object and preserve normal
`__name__`, `__package__`, `__spec__`, `__dict__`, function `__globals__`, and
function `__module__` relationships.

Top-level baselib files use canonical internal names of the form
`sagejs._baselib.<source-stem>` and are registered before initialization in the
baselib module cache. A file MUST import another module when it depends on that
module's private state; source ordering is not an import mechanism. Private
names may repeat independently in different modules and never enter the
transitional shared Sage facade. Public names exported through that facade
must remain unique until consumers use explicit module imports, and the build
rejects ambiguous cross-module references rather than selecting one by file
order.

The compiler's self-hosting bootstrap may use an explicitly delimited legacy
concatenation pass only to produce the current compiler. The converged compiler
and every shipped runtime artifact MUST use lexical modules. Module identity,
global mutation, closure behavior, introspection, import caching, duplicate
private names, and accidental public collisions are regression-tested as one
contract.

Large public mathematical types keep a small, stable bootstrap interface and
load substantial algorithm families from ordinary Python modules on first use.
For example, the unified public matrix API may delegate decompositions,
selection, or combinatorial algorithms to the lazy `sagejs.linear_algebra`
package. This is a deliberate dependency inversion: the lazy implementation
depends on the public type contract, while bootstrap code refers to it only by
its module name. Domain algorithms therefore remain independently readable,
claimable by parallel projects, and removable from startup without fragmenting
the public API into representation-specific classes.

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
admits owned resources as non-escaping lexical locals and emits initialization
flags plus all-exit cleanup in the isolated core. A public kernel signature may
borrow an owned resource synchronously: generated adapters validate a stable
type tag, retain its root for the call, and pass only its ABI value into the
isolated core. A resource result must transfer a newly constructed owned local.
Resource construction inside control-flow blocks still fails compilation. A
compiler change MUST NOT silently turn a resource into a raw pointer or host
callback.

An owned resource MAY declare a contiguous copied-byte host transfer by naming
opaque data and length accessors. The generated host adapter validates the
resource and complete range, then copies once into host-owned byte storage; it
never exposes the foreign address. A non-consuming copy leaves ownership
unchanged, while the generated consuming helper closes in `finally`. Wasm must
perform the corresponding checked copy from linear memory before resource
mutation, memory growth, or close; zero-copy views require a separate explicit
ownership contract and are not inferred from this transfer.

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
rational matrices are the first complete hybrid resource slice: a generated,
type-tagged owner holds FLINT's variable-size `fmpq_mat` representation behind
the checked FFI lifecycle. Construction uses one compiled typed-Python import,
ordinary entry reads and mutations are declared operations, and copy,
multiplication, RREF, determinant, formatting, and variable-size serialization
return callee-owned generated resources. A typed-Python witness safely borrows
and traverses the matrix with no host callback. Packed rational buffers remain
an explicit compatibility/serialization format, not canonical matrix state.
Python-facing exact matrix rows and columns are cached as immutable `Vector`
snapshots, never as foreign pointers or serialized bytes. The first orientation
bulk-decodes the resource once; the opposite orientation transposes the same
scalar references in the host representation layer. Fresh rows, columns, and
diagonals use one generated affine-sequence export (`start`, `stride`, `count`)
that validates the complete access path and preserves variable-size entries,
without constructing a temporary FLINT matrix or making scalar boundary calls.
Only a successful matrix mutation invalidates these presentation caches.
Characteristic and minimal polynomials pass the canonical matrix resource
directly to FLINT and publish a sealed `FmpqPolynomial` resource. They do not
export matrix entries, predict coefficient sizes, or recover a relation by
constructing a host-side sequence of matrix powers.
Explicitly scoped temporary resources close deterministically; long-lived
matrix resources have idempotent close plus a tracing-GC finalizer fallback.
Native allocation accounting remains required before this representation is
considered production-mature under sustained memory pressure.
On Node, univariate polynomials over `ZZ` and `QQ` canonically own sealed,
generated `FmpzPolynomial` and `FmpqPolynomial` resources. The checked wrapper
owns the FLINT object without exposing its pointer; construction, coefficient
access, equality, arithmetic, powers, evaluation, formatting, and stable bulk
serialization stay resource-to-resource or resource-to-scalar. The portable
host keeps normalized packed coefficients as its canonical fallback, and those
packed forms are also the explicit interchange representation. Exact division
stays resource-to-resource. Exact factorization computes once into a generated,
callee-owned factorization resource whose FLINT-owned variable-size factors are
copied directly into sealed polynomial resources; callers never select a limb
capacity, retry the factorization, or export coefficients individually.
Polynomials over small prime fields continue to own compiler-managed
packed `UInt64Buffer` coefficients and reach mature FLINT algorithms only
through generated declared FFI. Legacy polynomial and factor handles are
differential oracles, never production `PolynomialElement` state. Exact
algebraic roots and the not-yet-migrated power-series family retain narrow
audited bridges until their result and ownership models are migrated.

Dense matrices over primes below 256 may additionally use FFLAS/FFPACK after a
measured dimension crossover. This is an optional generated accelerator, not a
new canonical representation: the public matrix still owns row-major
`UInt64Buffer` residues, the complete operation crosses one declared boundary,
and the output is transactionally copied back. FLINT remains the exact declared
fallback and differential oracle. The FFLAS package has its own dependency
prefix and generated C++ exception shields, while the compiler contains no
FFLAS symbol-specific logic. Capability and crossover selection happen at the
public matrix layer and are visible through native tracing.

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
