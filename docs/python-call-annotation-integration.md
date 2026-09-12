# Call and annotation integration qualification

This candidate starts from main `256419004`, imports the prepared-call and
divmod checkpoint `70c851427`, then annotation checkpoint `478f47864`.
The runtime merges without conflicts. The only merge conflicts were generated
reference coordinates/fingerprints, resolved by regenerating the reference
files from the assembled source. Historical task metadata is preserved.

The source census is **899,262 / 903,000 core bytes**, with no allowance change.
This is not the over-budget canonical dictionary experiment, nor does it
include the held handled-state/generator stack from PR244/260.

## Required distinctions

- Prepared calls have a qualified earlier runtime and green PR267 CI. Controlled
  keyword-method throughput improves 26–27%, but descriptor fallback calls
  regress 7–10%; those results are not a closed performance cliff or a package
  speedup. PR267 remains draft pending tradeoff review.
- Divmod dispatch fixes ordinary/class/static/custom-descriptor selection and
  mutation order. Metaclass hook support and numeric fallback defects remain
  required independent work; no universal divmod compatibility is claimed.
- Annotation pairs preserve special names and annotated receivers. Early class
  publication still fails the independently preserved strict tests. Raw baselib
  annotation metadata and documentation text retain their original format.

Full source qualification must use this exact combined candidate. Copied
artifacts used to bootstrap the build are not evidence that the candidate
passes. Keep any missing-addon, inherited, or newly introduced failure explicit;
do not relabel required cases or widen thresholds. No release is authorized.

## Combined Linux checkpoint (2026-09-12)

Runtime merge `dadf015b1` with regenerated references and the integration task
passed a full build in 422 seconds, strict Python checks (403 modules), all
227 portable test files, direct reference generation checks, and task scope
checks. The pinned pyparsing 3.3.2 public workflow passed with a source-current,
unchanged, qualified selected-scope receipt; this is not the full package matrix.

The focused call/annotation/traceback matrix reports **58 passes and 8 required
failures**, without skips: early class publication, duplicate mapping merge
order, custom `__getattribute__`, and sole-star iteration order, each in Python
and Sage modes. Divmod independently passes 21 targeted CPython cases per mode,
10 baseline-preservation numeric controls per mode, documentation lookup
controls, and all 14 existing runtime hot-path tests. Its metaclass and
floor-only fallback differences remain explicitly reported required gaps.

The completed build receipt records workspace SHA256
`3ee4ab67775cbad8444ad3b69c01dfd1a2c23a5c3f5440c37bcf71e7a902779b`
and artifact-input SHA256
`269ddcef0b760a79f11525f03f1e743b7cdb27d7ca3e72a56f830a98f10be7c9`.
Node was 26.8.1 on Linux x64. This report is a subsequent documentation edit,
not a claim that a prior workspace fingerprint includes the report itself.
No fresh four-platform or production-browser qualification has been run for
this combined candidate, and the earlier controlled performance comparison
does not measure these additional annotation/divmod changes.

## Follow-up: sole starred argument consumption

The Python emitter now evaluates a sole starred expression and the keyword
packet before consuming the iterable. A private, per-invocation function only
performs consumption and packet assembly; user expressions remain arguments at
the original call site, preserving generator suspension and nested-call state.
Multiple starred groups and positional-prefix calls keep their existing path;
the legacy raw-JavaScript emission mode is unchanged.

The compiler converged in two passes (72.339s and 72.891s). All 12 focused
ordering checks pass across CPython 3.14 and both Sage.js modes, covering
constructors, keyword failures preventing iteration, multiple-star controls,
and generator suspension. The same eight-file call/annotation/traceback matrix,
with two added regression functions, now reports **66 passes and 6 required
failures**: class publication, duplicate mapping order, and custom attribute
lookup remain unfixed in both modes. Strict Python and formatting checks pass.

These are source-emitter and focused runtime checks using the rebuilt compiler
with the earlier built runtime. They do not replace a new full-build or
cross-platform receipt for this follow-up, or the open performance review.

The legacy compiler run completed with 17 passes, 34 explicitly marked skips,
and 15 missing-addon errors, all naming `sagejs_flint.node`. These are missing
native qualification prerequisites, not passing mathematics tests. The broad
architecture check also requires a refreshed optimizer opportunity manifest
for the changed compiler; it currently rejects its stale input identity.
The imported planning note's obsolete benchmark staging path was removed
without changing audit rules or its retained helper hash.

## Exception-cost mechanism experiments

The exception initializer used to format every stack immediately. The new
host-capability path captures creation-site frames with `captureStackTrace`
without forcing formatting; hosts lacking that API retain the old fallback.
Focused standalone checks in both modes cover format-once behavior, assigned
stacks, original creation frames, identity, arguments, and forced fallback.

A subsequent profile found generic truth conversion costly in the exception
path. Exact `True`/`False` values now return directly, without invoking the
general representation lookup. Object truth hooks and numeric truth values
retain their previous behavior; the regression checks include `__bool__`
precedence over `__len__`.

Local Node 26.8.1 diagnostics (10,000 iterations, three warmups, seven samples,
two reversed variant orders) measured construction-and-catch at 615–621 ms on
the forced eager fallback and 498–499 ms with lazy capture. After the boolean
fast path, a separate local run measured 375–376 ms; re-raising an existing
exception fell from approximately 190–191 ms to 121–122 ms. These are local
mechanism experiments, not an independent controlled before/after or CPython
comparison, and do not close the previously reported cliff. Reproduce with
`node bench/python-exception-cost.cjs`; optional `SAGEJS_EXCEPTION_CASE` and
`SAGEJS_EXCEPTION_VARIANT` select profiling subsets. The profile and timing
campaigns are separate. Full source-current qualification follows these
focused checks; no four-platform or package-speedup claim is made here.
