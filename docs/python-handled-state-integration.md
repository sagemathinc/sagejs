# Handled-state ownership integration candidate

This candidate starts from freshly fetched main
`ce40da9413dc635a990c174bf594be816ca6d54b` and explicitly combines:

- PR #247 bootstrap metadata copying, `37e80f4681c4b0e9dae1510c36eefd015f7e42bc`;
- PR #244 handled ownership, `1beda068edf2b4312efce29543b43ed59055f951`;
- stacked PR #249 selective wrapping/evidence, `50d35b46c4bbc0cbd97d9b3e53eb66175bee3034`;
- PR #260 generator definition scope, `ce2aedd1faef253b281fd3a0a1553a88b12a1c90`.

The task's base `c261d99740f2812cb74598df4ead2c73cb6eb720` is this assembled
import foundation, not main. The original branches and frozen artifacts remain
untouched. Integration does not mark any PR ready or merge it into main.

## Composition and regressions

The two lowerer conflicts are resolved by calculating `isGenerator` with the
PR #260 executing-body scope detector, including coroutine classification.
Both the generator flag and PR #249 ownership-proof metadata use that one
decision. The automatically merged emitter preserves PR #260 default capture
and PR #249 selective wrapping; no other runtime semantics are modified.

The generator-scope source test now loads the actual new handled-state analyzer
dependency, retaining its fail-closed policy for unknown imports. Cross-product
tests cover named/lambda yield defaults, nested owned handlers, plain coroutines,
and implicit context-manager suspension. Runtime tests combine owned defaults
with caller-handler restoration and require the formerly open nested-default
fixture to pass in CPython, Python mode, and Sage mode.

The real combined core-runtime budget is **902,078 / 903,000 bytes**, including
the PR #247 deduplication. No budget or assertion is widened.

## Performance evidence and boundaries

The complete upstream campaign remains in
`agents/validation/python-handled-state/`. Plain generator creation is about
40% faster than PR #244 for the fixed 20,000-generator microbenchmark in both
mixed and isolated process orders. This is not a pre-ownership recovery result.

Mixed-phase owned-creation medians were 13.0% and 6.4% higher with larger tails.
The isolated follow-up changes were -1.3% and +3.7%, without the earlier
candidate-only tail excess. Both datasets remain intact. This supports phase
sensitivity, not a proven GC explanation or blanket no-regression claim.
No new performance measurement is attributed to this combined candidate.

Ownership remains scoped to synchronous handlers and supported generator/manual
coroutine resume boundaries. This is not true unwind traceback, chaining,
asyncio scheduling, browser, four-platform release, or third-party-package closure.
Qualification results are recorded after the frozen full build; copied seed
artifacts and diagnostic compiler generation are not full-build evidence.

Preflight passes 27 source-only checks, five scope/ownership emitted-metadata
cross-products, the CPython combined/default fixture, and nine selective-emission
checks. The diagnostic compiler converged in two passes (125.165 and 125.581
seconds); these runs are not a full-build receipt. Formatting is unchanged across
867 Python files, and the existing 37-file q-exp freeze validates unchanged.

## Frozen local qualification

The single full build completed in 11 minutes with receipt
`2026-09-12T09:56:04.316Z` (657,220 ms recorded build duration).
Artifact inputs SHA-256:
`403884da918ab64a073c0473bbde95af864ee665520c17bc5fb066d8473fbfc4`.
The compiler SHA-256 is
`0d4357ac1943d95c12d1330b5b522cde8766c0ab52bec3ef3c5f3abc83f0df59`;
baselib SHA-256 is
`f9d21b02865b854b6b6e911803689b543bed8e3af372c8ce5c5a177c23bae4a9`.
Optional native addons were absent and production native kernels were skipped.

Against finished artifacts, 85 focused checks pass, including the complete
PR #249/#260 regression intersection and eight new combined checks. The legacy
compiler generator fixture passes. All 213 portable files pass (1m53s), strict
checking passes 393 modules with zero errors, formatting passes 867 files,
and generated documentation and merge invariants pass.

The first full architecture check found one imported historical report sentence
containing a forbidden dependency-name literal. Root made an explicitly
integration-owned documentation repair: remove only that parenthetical from
`agents/python-selective-handled-state.md`, preserving the original historical
two-failure results and paths. No runtime, test, policy, or task metadata changed.
The original failed architecture log is retained; final architecture validation
is recorded externally after this repair. Documentation-only changes preserve
the artifact-input identity; they do not authorize rewriting the frozen receipt.

Logs and the final handoff receipt are retained under
`/home/user/handled-state-integration-*`. Final architecture checking passed
after the report correction, and repeated portable qualification passed all 213
files in 1m54s. The original architecture failure remains in its separate log.

After executable qualification, root explicitly authorized adding only the exact
imported report path to the integration lane and adding that report plus the
lane file to this task's claims. This permission-only metadata change makes the
full-build receipt historical: it is **not current for the final commit**.
Executable source and compiler/baselib outputs are unchanged, with metadata
before/after hashes retained externally. No receipt rewrite or local rebuild
follows; CI must qualify the final head. The final scope check must pass with
these explicit claims, not with an unreported exception. No current-main adoption
or readiness claim is made.
Generated optimizer evidence assets remain local; no GitHub release or tag is
created or published. Their manifest identity does not imply remote availability.
