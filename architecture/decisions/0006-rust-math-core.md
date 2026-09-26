# ADR 0006: Qualification and alpha dispatch for a Rust mathematical core

- Status: accepted for scoped alpha automatic dispatch; production promotion remains receipt-gated
- Date: 2026-09-20
- Alpha dispatch amendment: 2026-09-22

## Context

Sage.js needs mathematical implementations that combine readable source,
predictable ownership, native performance, browser portability, and a stable
public Python interface. The existing architecture prefers ordinary
CPython-parseable Python, source-transparent native compilation, and mature
external libraries. That remains the default. It does not cover a substantial
handwritten Rust implementation of a mathematical algorithm.

The class-group experiments establish enough evidence to evaluate such a
backend, but not enough to promote one. A Rust relation collector and Smith
computation reached the same performance regime as PARI on one prepared cubic,
while simpler Rust collectors remained several times slower and the current
GMP wrapper did not cross-compile to the required browser target. The
[qualification plan](../../agents/rust-class-group-core-qualification-plan.md)
therefore treats complete class-group computation as the trial domain and
requires native and browser evidence before Rust becomes a production
mathematical backend.

This decision defines the architectural contract for that trial. The project
owner subsequently authorized automatic use in Sage.js's explicitly alpha
release channel for admitted absolute irreducible cubic fields. That
authorization does not declare the implementation production-qualified or
weaken proof semantics: `proof=False` may publish the named conditional-GRH
authority, while `proof=True` and the default require the authenticated
unconditional Minkowski suffix.

The fail-closed executable form of this decision is
[`architecture/rust-math-core-policy.json`](../rust-math-core-policy.json).
That policy and the Rust entries in
[`architecture/native-code.json`](../native-code.json) deliberately label the
current Rust sources `experimental-qualification`, while the backend policy
records the narrower `alpha-automatic-dispatch` state. Production promotion
still requires the exact promotion receipt described below; an architecture
document edit by itself remains insufficient for a production claim.

## Decision

Sage.js may contain a host-independent Rust mathematical core as an explicit
architecture exception for algorithms that pass the gates below. Rust is a
distinct implementation backend. It is not represented as generated code from
an ordinary Python function and is never selected by matching a Python function
name.

The first candidate is complete class-group computation for the input domain
frozen by the qualification campaign. Its promotion is all-or-nothing with
respect to the public contract claimed by a given proof mode: a candidate may
be useful as an experimental diagnostic backend without being eligible to
publish a complete public result.

Ordinary Python remains the semantic public layer. Public constructors,
methods, result types, exception behavior, proof flags, normalization,
serialization, resource-limit behavior, and lazy/eager distinctions retain
their documented Sage/Python meaning. Backend selection is an implementation
detail exposed through diagnostics and receipts, not a new mathematical API.
Where a correct existing Python path covers the same request, it remains the
reference and fallback. A backend that cannot satisfy a requested proof mode
must use a declared correct fallback or return an explicit unsupported or
resource-limit result; it must not silently substitute heuristic evidence.

## Source and mathematical provenance

Every Rust mathematical module must declare one provenance class:

- original Sage.js implementation, with the specification, paper, or theorem
  used to justify it;
- behavioral reimplementation, with its independent public specification and
  differential or certificate oracle; or
- source translation or close adaptation, with the exact upstream project,
  version, files, functions, commit or archive digest, copyright notices,
  license, and a maintained source-correspondence map.

Correspondence is recorded at a useful algorithmic granularity: each translated
Rust function or coherent module names the upstream routine or source region it
implements and describes intentional changes. Renaming, rearranging control
flow, or making ownership explicit does not turn a translation into an original
implementation. Tests and benchmark data derived from upstream code are also
identified.

PARI-derived class-group work is treated as derived from PARI 2.17.4 unless a
later provenance review records a different source identity. Its GPL terms,
copyright notices, attribution, and complete corresponding-source obligations
apply to native binaries, WebAssembly, JavaScript glue, packages, and any other
distributed combined work as determined by the repository's license review.
The release process must verify the resulting distribution license rather than
assuming that translation into Rust changes it. Every Rust crate and linked C
or C++ library has pinned version, source identity, license metadata, and a
reproducible source archive or registry reference.

## Core structure and dependency direction

The mathematical implementation is a normal Rust library divided by
mathematical responsibility: exact arithmetic, number-field and ideal
representations, field preparation, numerical embeddings, relation collection,
linear algebra, unit and regulator work, completion, and class-group maps.
Modules expose explicit ownership and error types. The core does not depend on
Node-API, Python, a JavaScript engine, browser APIs, or Sage.js host objects.

Native and WebAssembly adapters depend on the same core. They validate and
marshal complete requests at entry, execute coarse mathematical operations in
Rust and declared arithmetic libraries, then publish complete results. A hot
computation may not perform scalar-by-scalar host calls or serialize internal
state between phases. Platform-specific scheduling, cancellation transport,
and package loading belong in thin adapters.

The dependency graph is deliberately bounded. Performance-sensitive code may
use a small number of concrete arithmetic representations and specialized
algorithms; it should not create an open generic framework that causes
uncontrolled monomorphization, duplicated native/Wasm implementations, or an
unreviewable feature closure. The release receipt records the reachable crate,
foreign-library, feature, symbol, and license closure for each artifact.

## Safety and `unsafe` policy

Safe Rust is the default throughout mathematical algorithms, orchestration,
storage ownership, and error handling. `unsafe` is permitted only for:

- foreign-function interfaces;
- narrowly scoped representation primitives whose invariants cannot be stated
  to the Rust type system; or
- a measured optimization that passes the same correctness, memory, and
  portability gates and has no acceptably competitive safe formulation.

Each `unsafe` block or `unsafe impl` has an adjacent `SAFETY` explanation naming
the lifetime, aliasing, alignment, initialization, bounds, allocator, thread,
and panic assumptions that apply. Unsafe code lives in small modules with a
safe interface and targeted tests. New unsafe code is denied by default outside
the reviewed allowlist. The qualification report includes the unsafe inventory,
line count, justification, sanitizer or interpreter coverage where applicable,
and reviewer identity.

Unchecked indexing and arithmetic are not admitted merely to improve a
benchmark. Exact bounded arithmetic checks overflow in release builds and
promotes or retries from an authenticated checkpoint. Foreign allocations do
not cross allocator domains unless the ABI explicitly transfers ownership with
the matching deallocator. Panics, traps, allocation failures, precision
failures, cancellation, and capacity failures cannot publish partial
mathematical results.

## Stable boundary and ABI

No Rust ABI is public or shared across independently built components. The
boundary is a versioned, host-neutral C ABI or a mechanically equivalent
WebAssembly ABI with fixed-width scalars, explicit byte spans, checked lengths,
opaque handles, and status records. Its schema declares:

- ABI major and minor version and feature bits;
- integer encoding, byte order, canonical signs, and normalization;
- request and result limits, proof mode, and cancellation policy;
- ownership of every input, output, handle, and allocated byte range;
- the allocator and matching free/close operation;
- error domains and stable status codes; and
- capability, backend, artifact, and proof-status diagnostics.

Arbitrary-precision values cross the boundary in one canonical owned encoding.
GMP, FLINT, MPFR, Arb, Rust crate internals, pointers, limb layouts, and Rust
enum or struct layouts remain private. Opaque handles are authenticated by
type, generation, artifact identity, and open state. Every entry validates
offsets, lengths, shapes, resource limits, and handle state before borrowing
memory. No reference survives WebAssembly memory growth. Close is explicit and
idempotence or double-close rejection is specified and tested.

The complete result is published transactionally. Long jobs expose coarse,
resumable steps or another reviewed worker interruption boundary so browser
cancellation has bounded latency. Cancellation never makes an incomplete
relation lattice or unverified class-group candidate observable as a complete
result.

## Native and WebAssembly routes

Linux x64 is the first development and performance route. Production
qualification also covers Linux ARM64, macOS ARM64, and native Windows x64. The
Windows user path cannot require WSL, MSYS2, MinGW, Cargo, or a local C compiler.
Packaged native consumers receive prebuilt artifacts or use an explicitly
declared portable route.

WebAssembly is a required production route for this candidate, not evidence to
collect after the native implementation is complete. The same mathematical
core must execute through Sage.js's actual browser worker and loader in
Chromium, Firefox, and WebKit. The baseline works without SharedArrayBuffer,
cross-origin isolation, runtime compilation, a server, or a native helper.
Optional threads or SIMD require capability checks and retain the correct
baseline route.

The arithmetic dependency route is selected only after executable ABI,
correctness, memory, size, and performance measurements. It may reuse the
repository's pinned GMP/MPFR/FLINT/Arb WebAssembly builds, use a reviewed Rust
binding to them, or use a qualified Rust arithmetic implementation. A crate
that merely compiles for `wasm32` does not establish compatibility with the
browser loader or linked arithmetic libraries. One artifact must not contain
accidental duplicate arbitrary-precision runtimes, allocators, or incompatible
copies of the same foreign library.

The exact Wasm artifact, adapter, capability IDs, dependencies, compressed
payload, loader route, imports, and hashes are entered into the existing
[WebAssembly capability manifest](../wasm-capabilities.json) and exercised by
its receipt-backed production route. Browser qualification measures download,
initialization, first answer, warmed fresh-field work, cancellation, peak and
repeated-call memory, and result closure.

## Fallback and dispatch

Dispatch is capability- and contract-driven. It considers platform, artifact
availability, input domain, proof mode, resource limits, and qualification
status. It must not infer support from a successful dynamic import or from the
name of a public Python function.

The Rust route may be selected automatically in the alpha release channel for
the admitted cubic domain recorded in the executable policy. The host must
authenticate the exact artifact, and automatic fallback is allowed only for a
typed capability decline before publication. Resource exhaustion,
cancellation, corrupt success, and any decline after resident publication are
reported rather than silently changing backends. Production qualification and
any widening beyond that alpha domain require a receipt authenticating the
exact artifact and admitted workload. A correct
Python, generated native, mature-library, or qualified WebAssembly path may be
declared as fallback when it satisfies the same public request. Fallback is
chosen before computation or from an authenticated retry checkpoint; there is
no mid-computation semantic mixture across backends.

Alpha automatic selection is a dispatch decision, not a distribution review.
It does not waive the existing safety, provenance, license, notice, source
delivery, relinking, or artifact-SBOM gates for anything included in a release.

Diagnostics report selected backend, artifact identity, proof mode, completion
status, fallback reason, resource limits, and whether the result came from a
fresh computation or cache. Cache keys include every mathematical and backend
condition that can affect the result or its proof authority.

## Inspectability and reproducibility

The Rust implementation is first-party readable source. For each public
algorithm the repository exposes:

- the public Python entry and semantic contract;
- the Rust entry and complete reachable function/module graph;
- provenance and upstream correspondence;
- arithmetic representations, ownership and unsafe inventory;
- native and Wasm dependencies and build features;
- stage names, counters, bit-size and allocation telemetry;
- benchmark and correctness corpus identities; and
- exact build commands, toolchains, flags, artifact hashes, sizes, licenses,
  and qualification receipts.

Release builds retain symbols or a generated symbol/source map sufficient to
attribute samples and failures to source modules. Generated bindings and glue
are reproducible and separately identified; generated bulk does not replace
review of the handwritten algorithm. Nested stage timers reconcile with total
time. Headline timings come from uninstrumented artifacts while an identical
source/configuration build supplies profiles and counters.

Independent test tooling verifies mathematical equivalence rather than only
byte equality where valid generators or relation order can differ. It checks
relation valuations, ideal identities, HNF/SNF transforms, generator orders,
class and principality maps, units, regulator enclosures, saturation, and the
completion evidence required by each claimed proof mode.

## Qualification and promotion gates

The normative campaign details and frozen numerical thresholds live in the
[Rust class-group qualification
plan](../../agents/rust-class-group-core-qualification-plan.md). This ADR fixes
the architectural meaning of the gates:

1. **R0, frozen contract:** input domain, public outputs and maps, proof modes,
   resource outcomes, timing boundaries, development and held-out corpora,
   performance thresholds, ABI schema, and evidence formats are versioned and
   hashed before tuning.
2. **W0, browser arithmetic:** one nontrivial exact arithmetic pipeline returns
   identical results through native Rust and the released Sage.js browser route
   in Chromium, Firefox, and WebKit, with measured throughput, memory, size,
   loading, overflow promotion, precision restart, and cancellation behavior.
3. **R1--R4, mathematical completion:** general prepared cubics, continuation,
   exact linear algebra, unit/regulator and completion work, generators and
   maps, public polynomial preparation, and degrees 2 through 6 pass the frozen
   open and held-out panels without runtime PARI data or answers.
4. **R5, product qualification:** native and browser public calls meet the
   frozen speed, memory, build, download, startup, lifecycle, cancellation, and
   packaging thresholds on the exact candidate artifacts.
5. **Independent review:** another agent or reviewer reproduces the build,
   diagnoses a seeded failure, extends one small arithmetic operation, reviews
   provenance and unsafe code, and confirms the release evidence without chat
   history or private fixtures.

A gate passes only with raw samples, failures and timeouts included. A prepared
field result cannot qualify the polynomial-to-public-result boundary. A PARI
match, full-rank relation matrix, Smith invariants, numerical residual, or fixed
surplus of relations cannot independently assert completeness. Native success
does not waive W0 or browser R5.

Only an artifact that passes all applicable gates may be registered as an
automatic production-qualified backend for the class-group domain. The scoped
alpha dispatch authorization is not such a registration and cannot satisfy or
replace a missing promotion receipt. Partial
outcomes are recorded precisely: experimental, prepared-field only,
native-qualified with unresolved browser/platform work, or unqualified with a
named limiting stage. Thresholds are not relaxed after seeing results to create
a passing label.

## Required architecture integration before promotion

The integration lane must, before production-qualified selection:

- update the project architecture policy to name handwritten Rust as this
  explicit receipt-gated exception;
- extend native-code classification to `.rs` and classify every Rust source,
  adapter, generated binding, and foreign bridge;
- register the public boundary, ownership, exports, capabilities, fallback,
  and exact native/Wasm routes in the existing architecture inventories;
- add provenance and license records for translated source and every shipped
  dependency;
- make architecture checks fail closed on unknown Rust source, unreviewed
  `unsafe`, undeclared exports, ABI drift, or a missing Wasm route; and
- bind automatic dispatch to release receipts for the exact artifact and
  workload contract.

Those inventory changes describe implemented artifacts and therefore follow
the shared integration workflow. This proposed ADR does not predeclare files,
symbols, or capabilities that do not yet exist.

## Consequences

- Sage.js gains a path for agent-maintainable handwritten performance code
  without presenting it as source-transparent Python compilation.
- Public mathematical meaning and proof authority remain in the existing
  Python/Sage contract even when the complete computation runs in Rust.
- Native and browser implementations share one reviewed algorithm and differ
  only at declared host and arithmetic boundaries.
- Rust's ownership model reduces accidental lifetime errors, while explicit
  unsafe and allocator policies retain the escape hatches needed by mature
  arithmetic libraries and measured kernels.
- Qualification is expensive: complete class groups, proof evidence, multiple
  platforms, browser engines, memory behavior, artifact size, licensing, and
  maintainability all form part of the result.
- A failed campaign still identifies whether the limiting issue is algorithm,
  arithmetic, foreign-library packaging, WebAssembly, platform support, or the
  public boundary, and does not imply a general conclusion about Rust.

## Rejected alternatives

- **Treat Rust as another compiler target for existing Python bodies.** The
  trial contains handwritten algorithms with independent source provenance and
  cannot honestly use source-transparent compiler guarantees.
- **Expose Rust structs or a Rust ABI directly.** Their layout and stability
  are unsuitable for separately built Node, browser, and platform packages.
- **Qualify Linux first and defer WebAssembly.** Browser arithmetic and foreign
  library integration are critical feasibility risks and are required Sage.js
  product behavior.
- **Call PARI in the product path.** PARI remains an oracle and source authority
  for this campaign; invoking its class-group engine would not test the Rust
  core and would restore the portability boundary the trial is intended to
  remove.
- **Accept class-number agreement as completion.** It does not establish the
  relation lattice, maps, units, regulator, saturation, or proof status.
- **Require zero unsafe code.** Narrow reviewed FFI and representation code is
  necessary for mature arithmetic libraries and some measured optimizations;
  banning it would replace auditable local risk with duplicated or slower code.
- **Use a silent best-effort fallback.** Hidden proof or backend changes make
  results and performance impossible to interpret.
