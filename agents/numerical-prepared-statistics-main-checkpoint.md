# Owned descriptive-statistics slice on the isolated binary64 foundation

This follow-up to PR #232 brings only the owned statistics boundary, three
actual typed centered transformations and public `describe` integration from
the earlier experimental lane. It preserves current-main compiler/private
helper behavior and the binary64 foundation's `statistics._packed` location.
It does not import the old PR stack or change default numerical dispatch.

`StatisticsData` validates and copies inputs once, with a logical workspace
budget and explicit lifetime. Each query still performs arithmetic, sorting,
MAD and independent checks, and constructs a fresh structured result. Setup
does not precompute an answer. The opt-in native workspace requires all
matching kernels; dynamic, missing, stale and non-native artifacts retain the
ordinary path. No exact-library or plotting dependency is loaded. Subclass
iterators and generic input/callback order are not bypassed.

The compiled helpers contain only source-transparent binary64 arithmetic and
never call the interpreter. Original input is reread for independent centered
residual/MAD checks. Sorted owned storage is a host representation primitive,
not a replacement numerical algorithm; it preserves Python's stable ordering
of equal signed zeros and rejects user scalar coercion hooks. No public buffer
alias or raw pointer is exposed. Cancellation is cooperative between complete
regions, not a hard deadline inside sorting or native arithmetic.

## Validation before the first source freeze

- Fresh eight-stage build passes (10m32s); optional exact-native packs are
  explicitly absent, not purportedly qualified by these numerical tests.
- Strict CPython/Ruff/Pyright passes for 391 modules.
- Five focused tests pass with no skips: owned CPython/public Sage.js
  dynamic/native/fallback queries, 296 exact-rational centered cases in native
  and JavaScript IR, isolated Node-Wasm and Chromium/Firefox/WebKit workers.
- Six existing statistics-domain tests pass, including retained SciPy/R oracle
  fixtures, failure cases and RNG replay. The tests do not depend on a live
  SciPy service.
- Standalone ASAN/UBSAN with leak detection passes all 296 centered cases and
  surrounding allocation sentinels. The first fixture-driver compilation hit
  its 120-second timeout while optimizing a huge assertion function. Splitting
  cases and compiling only that literal test driver at `-O0` resolves it; the
  actual mathematical core remains `-O1` with all sanitizers and contraction
  disabled. No mathematical case or assertion was removed.
- FFI, package graph, numerical closure, native, Wasm capability/workload and
  lifetime audits pass. The aggregate architecture command still stops on
  inherited historical-word mentions in `agents/python-property-mutation-followup.md`
  and `docs/general-class-unit-frontier.md`; those unrelated documents are
  untouched. Algebraic-geometry and optimization-engine checks pass separately.
  The source-bound optimizer inventory is regenerated and verified for this
  slice (16,626 functions, 14,535 loops); its four immutable infrastructure
  evidence assets are published and their GitHub digests verified. Product
  Latest remains unchanged; this is not a product release.
- The inherited lane-only check reports 406 live task manifests; this isolated
  integration branch is not a new lane contract and does not retire them.

## Frozen source and public browser follow-up

At clean source `dca0b0873`, a fresh eight-stage local build passes (10m37s) and
12 focused/domain tests pass without skips. The same clean source independently
builds on reserved `bench-1` (10m25s), with 10 tests passing and two explicit
optional SDK/sanitizer skips. Checked public `describe(20000 observations)` is
96/103 ms locally and 82/93 ms on the independent host (none/summary traces),
versus generic 5.7/5.8 seconds locally and 5.0/4.8 seconds on the host. Preparation
remains separately 1.1–1.5 seconds. Values and validation agree with CPython.
These sequential collectors are not paired performance qualification. The
[raw records, logs and verifier](../bench/numerics/performance/results/n2-prepared-statistics-dca0b0873/README.md)
retain slower/noisy rows and every setup/first-call cost.

The real browser corpus initially failed because build-time import discovery
missed the function-local `_prepared_native` import. An explicit precompiled
package entry fixes the bundle, without swallowing ImportError. The full owned
data/ordinary fallback corpus now passes in Chromium, Firefox and WebKit. The
existing routine numerical-browser test also exercises the explicit native
request and correct fallback, so this gap cannot hide behind kernel-only tests.
All 69 public numerical modules and the cross-domain routine witnesses pass.
The rebuilt browser artifact passes the unchanged payload/topology budget:
195,193,174 raw bytes, 25,000,895 gzip bytes, 15,661,748 Brotli bytes across all
groups. These are artifact inventory totals, not bytes fetched by one query.
This browser build includes the packaging fix atop `dca0b0873`; it is not a
clean immutable release qualification of that original commit.

A stricter dependency probe exposed an inherited startup limitation:
`evaluator.mjs` eagerly instantiates FLINT/algebraic/M4RI before any evaluation.
The browser tests record those requests and require no additional exact/Plotly
loads from statistics. They explicitly report `lightweight_startup: false`.
Node's no-exact-load assertion remains strict. Both original browser failures
are retained; the browser startup requirement remains open rather than being
silently turned into an incremental-load pass.

The sign witness now uses float representations instead of the existing
dynamic `math.copysign`, which incorrectly ignores negative zero. The complete
Node ownership/fallback corpus and all three public browser engines pass again
with that independent oracle. This does not repair the separate math wrapper.

## Still open

The 10 ms public `describe(20000 observations)` target is not met or qualified.
Historical approximately 33 ms prepared timings are not current-branch evidence.
Sorting, public input conversion and result/validation costs remain important.
Public prepared Wasm storage and distribution are not integrated; browser users
keep the correct ordinary fallback. Linear regression, approximation batches,
full ownership/memory stress and four-platform public packaging remain N2 work.
This slice must not be offered for merging before its #232 foundation is
qualified, and does not imply completion of N0–N6.

User semantics and example: [owned data](../docs/numerical-computing/statistics/prepared-data.md).
# Packaging-source revalidation, 2026-09-12

Clean source `32922c911e68a288fc916e442a679d5939c51245` completed the full
eight-stage root build in 13m17s. Its focused centered/prepared/domain run passed
11 tests with the one explicitly opt-in sanitizer skip. A separate
`SAGEJS_NUMERICAL_SANITIZER_TESTS=1` centered run passed all four tests with zero
skips, including the address/undefined/leak checks. This strengthens packaging
source evidence; it does not turn developer-cache native execution into a
qualified installed-product route. The previous browser artifact and frozen
mathematical timing identities remain as recorded below, not relabeled.

PR #232 merged at `fb98e46e3`; #240 is now based on `main` and remains draft.
Its included test-only follow-up `39ca74dc1` independently checks dynamic zero
signs rather than relying on the inherited defective `math.copysign` wrapper.

## Production-pack integration in progress

The separate `perf/numerical-prepared-production` branch carries this slice
onto multipack evidence head `743756fa2` (runtime `d3c436020`, main ancestor
`256419004`). It registers the finite sum and centered transformations as
production native families. A new public test removes every other pack before
running the ownership, budget, failure and backend-identity corpus with the
no-exact-library-load assertion enabled. This is a stronger distribution check
than compiling a private development cache; it now passes from a script file.

These descriptors explicitly exclude production Wasm dispatch until owned
prepared storage is qualified in the browser. The checked ordinary browser
fallback remains available. No automatic public backend default changes, and
kernel-level Wasm execution is not promoted to installed-browser qualification.

Current integration checks pass TypeScript, strict Python (406 modules), Python
formatting, architecture and merge inventories. The focused suite passes five
tests with one explicit opt-in sanitizer skip; the separate sanitizer-enabled
run passes with no skips. The initial eight-stage build passes but omits the
optional host addons, so it does not qualify production native packaging.
The native-enabled eight-stage rebuild passes in 10m49s after explicitly building
the host adapters against existing dependency prefixes. Strict all-module
autoload then catches an omitted third decorated function (`prepare_products`).
The corrected descriptor registers all three already differential-tested
functions. Direct pack republication reuses the other families and publishes
43 modules in two packs; all 14 production/layout/closure/multipack/statistics
tests pass without skips. The full-build receipt predates that descriptor fix;
a new full-build/package receipt is still required. All six statistics-domain
tests also pass without skips. No native library rebuild or new timing campaign
is included in these observations. Historical timings above retain their
original source identities and their unmet public target.

The dependency-test helper previously rejected every aggregate pack by basename.
It now accepts only a caller-selected absolute numerical-pack path whose SHA-256
matches the production catalog; another pack path or wrong hash remains rejected
by regression tests. Exact-library and renderer checks remain active.
The first full corpus fed through stdin rejected a `Convertible` instance;
file execution passes, as does a smaller stdin conversion probe. This unresolved
stdin-corpus finding was subsequently localized to REPL input framing: blank
lines inside the class submit it before its second method, with inconsistent
indentation on the remaining method. It is not a native arithmetic or float
conversion defect. Complete-program file execution is the packaging witness;
the CLI's piped-program framing remains unchanged.
The initial post-build run also omitted the reused native-prefix environment;
its compile-fixture failure is distinct from the corrected descriptor failure.

The corrected source completes another full build in 7m50s, reusing all 43
families. Its runtime source is `85b374462`, with only the plan documentation
advanced to `852544c9c` while building; no runtime bytes changed. All 14 pack
tests pass again. Routine validation then finds a brittle negative-test fixture
in `wasm-capabilities.cjs`: selecting the first fallback now picks an explicitly
excluded statistics kernel, correctly triggering the aggregate-coverage guard
before the expected receipt guard. Select an actual production-pack fallback
for the receipt test and separately assert rejection for both excluded
statistics descriptors. No capability is promoted and no guard is relaxed.

All 16 capability tests pass after that fixture correction. The next ordinary
routine run passes its functional phases, including the complete portable suite,
but fails the unchanged startup gate: 405.7 ms raw, 404.2 ms normalized, versus
400 ms. No repeated retry is counted as erasing that miss. The branch remains
draft at this gate; independent current-source qualification and attribution
against the main/control startup observations remain required.
