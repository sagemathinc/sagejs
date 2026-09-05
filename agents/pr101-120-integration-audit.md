# PR 101–120 integration audit

Status: in progress. This is development integration, not a release.

## Combined candidate checkpoint (2026-09-05)

The remaining stacks are integrated on `agent/integrate-prs101-120` through
`bf2d27204`, but **not promoted to main**. This includes #106/#125, #114,
#101/#123 and the regulator-safety correction #127. Upstream main at
`16527fa5d` and #125's generated-only refresh `fe773c951` are preserved.

Fresh combined validation found and corrected additional integration issues:

- The private native-helper fallback sentinel was not exposed by the builtins
  proxy, causing attempts to assign `__wrapped__` to the frozen sentinel.
  Both language modes and the actual cubic public receipt/replay tests pass
  with the corrected whitelist.
- Cubic holdout protocol fixtures paired arbitrary discriminants with an
  unrelated polynomial. The strengthened equation-index check correctly
  rejected them. Fixtures now use matching squarefree polynomial/discriminant
  pairs; their class-group outcomes remain explicitly synthetic protocol data.
- Runtime-directory filtering hid declared JavaScript-undefined intrinsics.
  A live intrinsic-module directory fixes this without exposing ordinary
  Python unbound slots; the focused canonical-namespace test passes.
- Algebraic matrix pivots were routed into the rational Wasm backend. A
  batched shared-FLINT binding now returns pivot indices without per-entry
  scalar transfers; real Wasm and ASan/UBSan shared-core checks pass. The mock
  ABI used by wrapper lifecycle tests now includes the new exports.

Evidence, with scope kept explicit:

- The first combined native build completed all eight stages in 18m02s.
  A new full build is running for the final runtime-directory changes; the
  older receipt is not a source-current receipt for these follow-ups.
- Native Windows x64: 22 focused kernel/adapter tests passed and two Unix-only
  sanitizer tests skipped. This used an isolated checkout and the already
  validated dependency prefix read-only, not a full Windows runtime build.
- Combined architecture and merge inventories passed; strict Python passed
  for 377 modules. They must be rechecked after the last source changes.
- The completed Wasm artifact contained 286 compiled functions and the one
  deliberate wasm32 cubic fallback. Its eager payload measured 15,384,841
  gzip bytes / 9,160,091 Brotli bytes against unchanged 17,400,000 / 9,600,000
  limits. The algebraic specialist measured 2,053,470 / 1,652,810 against
  unchanged 2,200,000 / 1,800,000 limits. These precede the pivot follow-up.
- Actual Node-Wasm passes the geometry fixture, Gamma1(7) rational descent,
  dynamic import identity, and all seven other public-gap cases. The larger
  Gamma1(13) cusp/newform case is **not passing**: the nonreal-character
  `p1ListCharacterHeckeMatrix` backend is missing. The capability inventory's
  claim of an ordinary portable fallback is too broad and must be corrected
  or implemented before promotion. User guidance has been requested on
  whether this substantial additional Wasm backend belongs in this wave.
- Full unit and portable attempts stopped fail-fast at integration defects
  above. Do not describe those attempts as complete passing suites. Rerun
  both after the fresh build and the browser-scope decision.

Starting main: `675b1d3f494d1e9dedab86e5a348524b0493b1fb`.
Integration branch: `agent/integrate-prs101-120`.
Coordination: GitHub Discussion #104.

The user additionally approved reviewing and including #123 (nested-arena
qualification) and #125 (Gamma1 memory repair). Other new feature PRs are not
automatically part of this wave.

## Inventory and order

Seven PRs in the requested range were open at inventory time:

| PR | Scope | Reviewed initial head | Integration order |
| --- | --- | --- | --- |
| 117 | Python namespace, object, and exception semantics | `977f50e8d8ddb27396d42a6adbfad6745233fb1a` | Runtime foundation |
| 119 | Python performance corpus and classification | `ad1d47befd649dc0b333869aae96fec3992b6440` | Depends on 117 |
| 120 | Native list/tuple slice fast paths | `ee53d47686184da437bb3affe1d7c7d2c1cad5d7` | Depends on 119 |
| 118 | Canonical macOS temporary fixture paths | `00f25cd246afed50981dbf3b127e9008a21e7aef` | Test infrastructure |
| 106 | Gamma1 modular forms and cyclotomic operators | `5733bd63ee17da17a0ea1a394a6cc220cfa47f5a` | Mathematics |
| 114 | Exact no-Singular algebraic geometry | `5b6ffb5075fabd1f040cbf2553d34837ff8e3da5` | Mathematics |
| 101 | Resident fmpz backend and cubic class groups | `96df6701a9879dd32d23df5239ad09f22d07895c` | Broad native compiler integration |

The remaining numbers include already merged/closed PRs and issues or
discussions. No open PR had review threads at inventory time. Recheck tips and
comments before final publication; branch authors may still be working.

## Confirmed integration findings

- #117 overlaps main's recent namespace performance fixes. Keep set-based
  `dir()` deduplication, direct construction of namespace dictionaries, cached
  class mapping proxies, and callable-instance allocation metadata while
  integrating deleted-binding filtering and live instance dictionaries.
- Git automatically duplicated the tier annotation in
  `test/python-conformance-runner.cjs`; remove the duplicate.
- #117 returned the original `abs` after clearing an exception target named
  `abs`, even when `builtins.abs` had been monkey-patched. CPython returns the
  patched result. A focused regression now covers this interaction.
- #117 accepted nested exception-handler tuples. CPython requires a flat tuple
  of exception classes and validates all entries even after finding a match.
  The focused regression includes an invalid nested entry after a valid match.
- #106's routine CI run `33914376124` failed because its q-expansion source
  freeze did not match `modular.py` and `qexp.py`. Regenerate from the integrated
  source after validating it; do not disable the source-freeze check.
- #120's full-slice recognizer now distinguishes source identifiers from the
  synthetic `slice` constructor. User classes/functions named `slice` remain
  ordinary calls, while shadowing does not change actual slicing syntax.
- Explicit noncallable `__getitem__` overrides were ignored during slicing.
  The fast paths now require an absent method, not merely a nonfunction;
  disabled/replaced methods retain Python dispatch and TypeError behavior.
- #119's benchmark smoke was in the unit/portable tier but compiled the full
  corpus. Keep pure policy checks in that tier and move real compilation to
  integration, bounded by a five-minute process-tree deadline. Its benchmark
  provenance references are narrowly classified by the dependency audit.

## Validation so far

- Initial merged compiler: 63/63 focused CST lowering tests passed.
- Initial merged strict library: 367 modules, zero errors or warnings.
- Initial runtime hot-path tests passed apart from the newly added regression
  exposing the two defects above.
- After fixing those defects, all 13 runtime hot-path tests pass. Compiler
  convergence, cache-dependent tests, and final generated manifests will be
  checked again after integrating the dependent slice optimization.
- The combined #117/#119/#120 compiler converges in two passes. All 18 focused
  runtime/slice tests pass, including user-defined `slice` and disabled or
  dynamically replaced subclass subscription methods.
- The 63 CST lowering tests and strict Python checks (367 modules, zero errors)
  pass. The performance lab's five policy tests and real end-to-end smoke pass;
  cold standalone corpus compilation took 179 seconds on this loaded host.
- Full cache validation caught an oversized compiler bootstrap (4,412,866
  bytes). A source-builder comparison shows compacting only the private
  compiler-support modules saves 234,023 bytes, with no removal of function
  names, documentation or annotations. Restore main's original compiler size
  ceiling rather than adopting the PR's higher allowance. Rebuild and recheck.
- #118's 25 promotion tests pass; its tooling digest is refreshed and release
  qualification remains explicitly pending.
- The first complete native build passed all eight stages in 18m26s. A quiet
  bench-1 Python build also passed; its startup medians were 383.6 ms full and
  176.1 ms empty against unchanged 400/225 ms budgets. These precede the private
  compiler compaction follow-up and do not replace final validation.
- Compact emission exposed an old statement-printer defect: a semicolon
  anywhere inside the previous fragment suppressed the required separator.
  Inspect only its final character. The focused regression fails before and
  passes after the fix, including newline-based and explicit-semicolon modes.
  Self-hosting probes that behavior before compacting, so stage-zero/older
  compilers still produce a valid bootstrap pass.
- The corrected compact build passes all eight stages (12m22s), with all five
  native adapters and all 41 production kernel families reused. Compiler size
  is 4,178,882 bytes; the public runtime SHA-256 remains exactly
  `647f58fc76ce5c8048ed34a9516393dea62612684c8bab2b170fbfb1a36c5275`.
  Focused compiler/runtime/cache checks pass (71 tests), architecture passes,
  strict Python passes (367 modules), and portable passes (116/116 files,
  1m38s). Startup passes at 389.4 ms full / 182.9 ms empty without any timing
  threshold changes.
- Before publication, main advanced to `25571014c` with the release owner's
  narrow symbolic-root Wasm fast-path restoration. Preserve that correction
  when advancing the integration branch; the receipts above precede that merge.
- The combined symbolic-root source builds successfully in 12m31s, reusing all
  native adapters and kernel families. Its focused compiler/runtime checks
  pass (70 tests); architecture, strict Python, and merge inventories pass.
  Portable passes 116/116 files in 1m40s. Eight symbolic/numerical-root checks
  pass, including the public Wasm route (zero skips). Startup medians are
  395.5 ms full and 182.2 ms empty against unchanged 400/225 ms budgets.
- Initial build was deliberately stopped after defect reproduction. Cache
  tests attempted during module-cache construction saw missing artifacts and
  must be rerun after the final build; they are not passing receipts.

## Review follow-ups

- The Python stack and #118 are published on main at `d520ed4df` after the
  checks above. The stacked #119/#120 PRs were closed as already integrated;
  their complete commit ancestry is on main, not rejected or discarded.
- Review #114's recursive Laplace determinant for Jacobian minors: order eight
  is bounded but still factorial work. Prefer a division-free subset recurrence
  if the public matrix engine cannot handle this coefficient domain directly.
- Check #101's implicit FLINT backend fingerprint includes transitive headers,
  not only `fmpz.h` and the static library.
- Confirmed #101 defect: `integer.buffer.get/set` checks uint64 indices but
  uses an uninitialized `sagejs_buffer_position` for the access. Initialize the
  checked position and test distinct-entry native reads/writes before merging.
  The author separately identified call-induced nested arena ownership risk;
  review the fail-closed guard in follow-up #123 as an integration prerequisite.
- #101 advanced to `f7f00552dd4178993ceef4522cc2897622cdf2c6` during review;
  review the new online relation-support reuse and equation-index diagnostics
  before merging that head.
- Check geometry resource limits before dense Hilbert-numerator allocation,
  stop high-order derivatives once zero, and reject constant/zero defining
  equations as plane curves without misclassifying empty affine patches.
- Review the new rational multivariate reduction adapter's array validation and
  allocation-size checks, especially size_t overflow on Wasm32. Also check
  ambient-space identity when the bounded geometry parent cache evicts entries
  that still have live points or schemes.
- #106's global strong maps retain every Gamma1 parent and its large descent
  matrices. Prefer lazy parent-owned caches. Follow-up #125 separately repairs
  a demonstrated large-level row-space/publication memory cliff; inclusion is
  approved. Isolated prepared corrections use parent-owned caches and exact
  elimination when its 32-prime full-rank certificate search is inconclusive.
  A standalone native ASan/UBSan diagnostic passes for an ordinary certificate
  and full-rank matrices whose numerator or denominator contains every trial
  prime. Public Python and integrated native validation remain pending.
- The cubic author's #127 contains a required narrow rejection after failed
  reconstructed-regulator authentication. Review confirms the status-1 path
  previously disabled materialization before authenticating the replacement,
  allowing stale coordinates under synthetic helper-contract violations.
  Include the rejection and its regression as a #101 correctness fix, without
  importing the separate staged-certification feature work. No ordinary-field
  trigger or wrong census result has been established.
- Measure combined bootstrap source and emitted runtime growth. Preserve all
  startup and compressed-size guardrails; explain any narrow reviewed source
  budget change with actual measurements.
  The #117/main combination currently owns 884,112 core source bytes; its
  proposed narrow ceiling is 890,000 bytes (main previously allowed 853,000).
  No startup timing or compressed-artifact ceiling has been raised here.
- Invalidate source-bound production qualification receipts when runtime or
  qualification tooling changes. Do not carry release evidence from a
  different source into this integration.

Final combined build, mathematical regressions, architecture checks, portable
tests, browser/Wasm checks, and main CI remain pending.

## Gamma1 integration and main-CI follow-up

- Reviewed #125 head `acee1f9d31b8955e5aec72426fe2c43eb788c5e4`, which includes
  #106. Combined native build passed all eight stages in 18m05s.
- Parent-owned Gamma1 caches remove process-global retention of parents and
  descent matrices. The missing-cache sentinel is `None`; a focused test caught
  that this runtime interprets `runtime.undefined` as an omitted default.
- Exhausting the 32 modular full-row-rank trial primes is inconclusive, not a
  rank-deficiency proof. The public operation now falls back to exact pivots.
  Full-rank adversarial numerator and denominator fixtures cover all trial
  primes; standalone ASan/UBSan header checks and public matrix tests pass.
- Packed matrix allocation sizes are checked before multiplication by element
  size. New packed-series ingress tests cover large exact coefficients, offset
  views, malformed/truncated buffers and invalid denominators.
- All 13 focused Gamma1/algebraic/ingress/cache tests pass, including pinned
  Sage operators, nonreal characters, wide degree-20 row spaces, old/new
  descent, and the bounded public sweep. All 15 native Dirichlet/modular tests
  pass with their required `--expose-gc` flag.
- Gamma1 is explicitly included in the browser lazy-module manifest. The
  Node-Wasm and Chromium shared corpus now contains a pinned level-7 Gamma1
  Hecke matrix and diamond-operator consistency checks. First execution caught
  the pre-existing missing q-expansion lazy family as well; include `qexp`,
  `qexp_algebra`, `newforms`, and their eta-product helper. Re-execution is pending.
- The Wasm build compiled 287 production functions with zero unsupported and
  then correctly stopped at the ABI gate. Inspection shows only source-bound
  module-hash prefix changes in the FLINT kernel: the normalized import/export
  inventory is identical. The reviewed allowlist is regenerated, not disabled.
- Extend the q-expansion source freeze itself to include the new Gamma1
  implementation, its documentation and oracle test. Merely regenerating the
  previous file list would leave the new mathematical source unauthenticated.
- Portable passes 117/117 files in 2m06s, strict Python passes 368 modules with
  zero errors, and refreshed architecture checks pass. An 11-sample startup
  check with the compilation worker briefly paused passes at 397.0 ms full /
  177.9 ms empty; earlier overlapping-build runs were slower. Existing 400/225
  ms thresholds are unchanged.
- Main's routine CI timed out computing the full disabled-native S8 center.
  Retain that exact witness in the integration tier (11.6s locally) and use a
  degree-eight dihedral witness for routine coverage (under one second warm).
  Both still assert the fallback decision and independent exact result.
- Main's Wasm CI exceeded the eager-core compressed-size budgets. Browser
  compiler entry points use only beautified module outputs, with and without
  docstrings, but packaging shipped all four variants. Keep both used outputs
  byte-for-byte and all source/metadata, omit the unused compact variants, and
  bind the selector into the production receipt. A prior artifact measurement
  drops stdlib JSON from 62.9 MB to 34.7 MB and gzip from 5.36 MB to 2.97 MB.
  No compressed-size allowance is raised; final artifact checks are pending.

### Browser execution corrections under qualification

- The first complete browser artifact passed the unchanged eager-core budgets
  at 15,283,365 gzip / 9,102,820 Brotli bytes (artifact `dc5f9527...`), before
  the additional algebraic and dynamic-import corrections below. It is not
  the final candidate receipt.
- Real Gamma1 execution exposed missing algebraic matrix selection, stacking,
  right kernel, and recognition of matrix-produced cyclotomic values. The
  shared FLINT core now supplies canonical row kernels and exact field
  recognition. Selection uses one checked index-buffer transfer and stacking
  uses FLINT's matrix concatenation, not scalar host crossings. Five focused
  actual-Wasm algebraic/resource tests pass, including exact reconstruction,
  zero/rectangular kernels and deterministic resource cleanup.
- FLINT 3.6.0 registers `nfloat_set` (returning `int`) as the `void` shallow-copy
  method. LLL's matrix multiplication triggers a Wasm signature trap. A
  Wasm-local signature adapter calls the same FLINT copy operation; it neither
  changes the arithmetic nor modifies a shared installed toolchain prefix.
- Classical Eisenstein series had no browser entry point. A lazy ordinary
  Python divisor sieve preserves all three normalizations and avoids factoring
  every coefficient or creating algebraic objects inside the sieve. Sixty
  native-FLINT differential cases pass. Native execution is unchanged;
  high-weight Bernoulli cost remains an explicit optimization opportunity.
- Dynamic `exec` originally constructed an import registry containing only its
  private module. The baselib lexical registry is itself a prototype view;
  copy descriptors from the canonical interpreter registry instead, preserving
  module identity and laziness while keeping dynamic assignments isolated.
  Three source-extracted primitive regressions and the rebuilt native public
  `exec` regression pass. This defect predates cache pruning; browser
  import-identity tests remain pending the fresh artifact.
- The isolated #114 preparation now passes all nine geometry fixtures, both
  malformed multivariate ingress tests, strict Python (376 modules), and merge
  invariants. Regression fault injection now targets the actual instance-bound
  reducer, and weak-parent-cache cleanup uses the explicit runtime `delete`
  property rather than a renamed Python identifier. Integration onto the
  current main-based Gamma1 stack remains pending.

This source checkpoint is committed on the integration branch so the numerical
build verifier can bind the reviewed runtime source to a real candidate tree.
It is not a main promotion. The numerical manifest remains explicitly pending
source-current requalification, and the browser end-to-end/build receipts must
still pass before advancing main. Current strict Python is 368 modules with
zero errors; merge inventories and native architecture pass unchanged caps.

### Exact slice integration regression

The freshly compiled cubic kernel produced a valid-looking success record but
its public validator returned no certificate. Exposing the caught exception
identified a runtime TypeError in `exact[3:3 + invariant_count]`: native-backed
integers remain BigInts, and the #120 unit-stride fast path passed normalized
bounds directly to JavaScript `Array.slice`. A standalone regression reproduces
the same failure in both Python and Sage modes. Convert only the already
array-length-clamped start/stop bounds to host numbers at that boundary; retain
arbitrary-size Python slice semantics before clamping and preserve strided
iteration. No cubic proof condition is relaxed. The previous full candidate
build was stopped before receipt publication; fresh validation is pending.
