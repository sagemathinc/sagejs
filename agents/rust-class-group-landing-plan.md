# Rust class-group landing plan

## Decision

The two-month Rust experiment is successful enough to become a Sage.js product
project. The first production scope is deliberately narrower than the original
qualification campaign:

- irreducible absolute cubic number fields admitted by the existing resource
  policy;
- complete class groups, unit groups, regulators, exact generators, arbitrary
  ideal maps, and replayable proof metadata;
- conditional-GRH authority when `proof=False`;
- the existing authenticated unconditional suffix when `proof=True` or the
  Sage.js default `proof=None`;
- a native implementation on qualified Unix platforms and the same Rust
  mathematical source compiled to Wasm for browsers and Windows fallback.

Degrees four through six remain future qualification milestones. They are not
allowed to block promotion of the independently qualified cubic capability.

## Non-negotiable product semantics

1. Python remains the owner of the public Sage-compatible mathematical API.
   Rust is a coarse performance backend, not a second public object model.
2. A conditional result is never relabelled unconditional. For an
   unconditional request, Rust may produce the authenticated relation/unit
   prefix only; the existing Minkowski suffix must independently finish and
   replay successfully.
3. `algorithm="auto"` may fall back only after a typed pre-publication decline.
   Cancellation, exhausted explicit limits, malformed claimed success, and
   failed replay retain their distinct failure semantics.
4. Ordinary class-group objects must support exact arbitrary fractional-ideal
   coordinates and principality witnesses. Returning invariants alone is not a
   landed class-group implementation.
5. Native and Wasm artifacts are built from the same authoritative production
   Rust sources. Benchmarks and qualification programs consume those sources;
   they do not own copies.
6. Rust execution is deterministic and single-threaded for the first release.
   The internal design remains executor-neutral for later ordered parallel
   candidate evaluation.

## Production topology

### Authoritative mathematical package

`packages/class-groups/` owns the extracted Rust mathematical core and thin
service/reactor boundaries. Historical corpora, comparison programs, and
qualification receipts stay under `bench/pari-class-group-rust/` and import the
production package by path.

The first extraction preserves the qualified algorithms rather than reorganizing
them aggressively. It exports only polynomial preparation, conditional cubic
completion, sealed publication, and resident arbitrary-ideal queries. Prototype
CLIs, Row-6 assumptions, brute-force collectors, and qualification-only schemas
remain in `bench/`.

### Host routes

- Linux x64: a lazy, integrity-checked resident native service shipped in the
  existing platform package.
- macOS arm64: the same native service after allocator/link closure and target
  qualification on `m1`.
- Browser and Windows x64: an authenticated lazy Wasm reactor in a worker. The
  Windows native MSVC route is deferred because `rug`/`gmp-mpfr-sys` and the
  current C bridge are not presently MSVC-safe.
- Sage evaluator: a synchronous coarse runtime primitive inside the evaluator
  context. Promises do not leak into `K.class_group()`.

## Landing sequence

### 1. Extract source identity

- Move the qualified cubic mathematical graph into `packages/class-groups/`.
- Make every native/Wasm qualification harness depend on that package.
- Re-run the existing native and Wasm public projections before changing any
  algorithm.

Exit criterion: qualification exercises exactly the source that will ship.

### 2. Close the public-object witness boundary

- Extend resident arbitrary-ideal results with the exact relation combination
  needed to prove `I / representative(coords)` principal.
- Normalize fractional ideals by an exact principal denominator and transform
  the returned witness back.
- Construct the existing `ClassUnitComputation`, `IdealClassGroup`, unit group,
  regulator, and proof-record objects after independent Python replay.

Exit criterion: public class/unit objects pass existing map, proof, serialization,
cache, principality, and mutation contracts.

### 3. Stabilize service operations

- Use versioned create/compute/query/publication/close operations, fixed-width
  limits, typed operational failures, generation-bound handles, and deterministic
  documents without timings in authority-bearing payloads.
- Keep worker termination as the documented alpha cancellation mechanism while
  bounded resumable computation is implemented. Termination invalidates every
  handle owned by that worker.

Exit criterion: malformed inputs, stale handles, cancellation, capacity limits,
and worker failure all fail closed and clean up deterministically.

### 4. Package native and Wasm products

- Generate content-addressed artifacts and immutable receipts from locked
  production builds.
- Enforce a 256 MiB Wasm maximum (4096 pages), not merely an observed peak.
- Ship native Linux artifacts in the existing optional platform package and
  make loading lazy so ordinary Sage.js startup is unchanged.
- Add installed-package, relocation, missing-artifact, corrupt-artifact, and
  fallback tests.

Initial budgets:

- native stripped binary at most 24 MiB and compressed increment at most 9 MiB;
- Wasm artifact at most 7 MiB and compressed at most 3 MiB;
- native cold capability probe median at most 25 ms;
- row-6 native at most 8 seconds on the qualification machine;
- Wasm memory at most 256 MiB.

### 5. Connect Sage dispatch

- Add `algorithm="rust"` as an explicit producer choice.
- Enable `algorithm="auto"` for admitted cubics once the exact production
  receipt is installed.
- Preserve proof/cache separation and reuse the Rust prefix for the existing
  unconditional suffix where possible.
- Use the original request unchanged on a typed capability decline.

Exit criterion: ordinary `class_group`, `class_number`, `unit_group`, `units`,
`regulator`, ideal maps, and principality calls use the Rust route within its
capability and retain exact existing behavior outside it.

### 6. Qualify and promote

Every pull request runs a bounded public corpus including trivial, cyclic,
noncyclic, nonmonogenic/index-prime, and large-regulator cubics. Nightly/release
jobs run the committed 100/1000-field corpora and browser lifecycle loops.
Historical “held-out” corpora are now public regression data; genuinely unseen
evidence must be sampled only after a candidate commit is frozen.

Platform gates are Linux x64, macOS arm64, browser Chromium/Firefox/WebKit, and
Windows x64 through the explicit Wasm fallback. Linux arm64 is a release gate
once its platform artifact exists.

Promotion also requires:

- documented `SAFETY` and `FFI-SAFETY` contracts for the FLINT bridge;
- sanitizer/leak and malformed-input qualification;
- resolved source provenance for the seven partially mapped PARI-behavior
  modules;
- dependency notices, corresponding-source obligations, and artifact-level
  native/Wasm link/SBOM receipts;
- an exact cubic promotion receipt that binds source, artifact, ABI, corpus,
  resource, lifecycle, and performance identities.

The policy changes from experimental to production only in the same integration
commit that installs this receipt.

## Parallel work lanes

- `class-group-rust-core`: authoritative production Rust extraction.
- `class-group-public-objects`: exact publication replay and ordinary Sage
  objects, including ideal witnesses.
- `class-group-wasm-product`: production Wasm build, receipt, worker lifecycle,
  and browser/package tests.
- native platform service and packaging: starts after the production source
  extraction is green.
- integration lane: proof-aware dispatch, synchronous evaluator primitive,
  policy/inventories, qualification receipt, final cross-platform merge.

## Later parallelism

The first release stays serial. A later native executor may parallelize
canonically indexed relation candidate evaluation, per-prime factor-base work,
and per-relation logarithms. One deterministic coordinator continues to own the
schedule, RNG, relation cache, resource accounting, continuation state, and
FLINT workspaces; worker results commit strictly by original ordinal.
