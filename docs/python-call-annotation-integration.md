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

The argument-allocation follow-up (`2b35504f4`) copies the native variadic
array straight into an independent public tuple, avoiding an intermediate
decorated Python list and generic length/equality dispatch. Native-backed
raise values bypass the foreign-error string-tag probe. Both modes pass
regressions for argument identity, initializer reuse, foreign errors, and a
throwing tag getter; strict checks pass for all 403 admitted modules. Separate
local medians are 337–341 ms for construction, 290–291 ms for construction and
catch, and 118–119 ms for re-raising, per 10,000 operations. The construction
benchmark also reads argument length. These remain mechanism diagnostics,
not updated CPython ratios.

The preceding lazy-stack/boolean revision (`bf7c9c32e`) passed a full build,
18 focused tests and the pinned pyparsing workflow. Those receipts do not
qualify later edits. Tuple matching now avoids recursively revalidating each
already-validated flat class; all entries still undergo live validation,
including invalid entries following a successful match. No exception-class
cache or mutation assumption is introduced. Final combined full-build,
controlled benchmark and platform qualification remain outstanding.

Combined revision `3edff0e0c` subsequently passed the full build in 6m 56s,
all 18 selected exception/traceback/truth-conversion tests, and the pinned
pyparsing 3.3.2 workflow with the CPython 3.14.4 oracle. The package report
qualifies only that selected workflow, not the full package manifest or its
performance. The separate combined CPU profile still places exception
initialization first among sampled functions; it includes compiler setup and
is not a warm-only percentage attribution. The remaining exception cliff and
cross-platform qualification are open; PR #272 retains its other documented
integration gaps and remains draft.

### Host-realm attribution correction

The original microdiagnostic used `vm.runInContext`; production Node bootstrap
uses `Script.runInThisContext`. The former imposes substantially different
global lookup costs. On the same local candidate, moving only the diagnostic
to the host realm changes construction/catch from approximately 290 ms to
83 ms per 10,000 operations, and re-raising from 119 ms to 12 ms. These are
different execution configurations, **not an additional runtime speedup**.
The diagnostic now defaults to the host realm; `SAGEJS_EXCEPTION_REALM=vm`
and `SAGEJS_EXCEPTION_PRIVATE_SCOPE=1` expose the attribution alternatives.

An explicit `SAGEJS_EXCEPTION_VARIANT=no-capture-diagnostic` ablation measures
about 27 ms/10,000 construction/catch operations in the host realm. It drops
frames, is marked semantically invalid in the report, and is never a runtime
option or accepted performance result. This attributes roughly 56 ms of the
83 ms to native creation-stack capture. Removing the second argument-array
copy passes aliasing/reinitialization tests but produces no timing improvement
outside local noise; do not claim otherwise.

A fresh-process bench-1 comparison (Node 26.7.0, CPython 3.14.4, AMD EPYC 7B13,
100,000 operations, three warmups/seven samples, reversed runtime orders)
measured the current standalone host-realm candidate as follows:

| Workload | Sage.js median, two rounds | CPython median, two rounds |
| --- | --- | --- |
| Construct and read argument length | 1015 / 1000 ms | 10.40 / 10.04 ms |
| Construct, raise, catch | 1083 / 1087 ms | 13.15 / 12.97 ms |

The remaining construction/catch gap is about **82–84x**, not closed. This
compares the current candidate with CPython, not historical runtime revisions;
do not divide it into older ratios to infer a speedup. Re-raising is excluded
because CPython accumulates traceback entries, unlike the current Sage.js
traceback carrier. Inputs, executable hashes and raw samples are retained at
`/home/user/sagejs-exception-host-pair.7QyZmd` on bench-1 and
`/tmp/sagejs-exception-host-pair.BYL1KZ` locally. The generated candidate is
bound by its content hash in `report.json`. This is standalone throughput,
not packaged runtime, startup, browser or four-platform qualification.

Closing the remaining capture-dominated cliff requires a correct cheaper
traceback representation (for example executable-identity-bound logical Python
frames), not suppressing stacks or postponing capture until their creation
frames are lost. That architectural work remains open.

### Scoped handler state prerequisite

The catch emitter now saves its lexical and shared active-exception slots and
restores them in `finally` around synchronous handler dispatch. The previous
implementation leaked the inner exception after nested handlers and leaked
handled exceptions after function returns. A new fixture first passed CPython
and failed both Sage.js modes, then passed all three after compiler convergence.
It covers nested handlers, helper calls, returns, break/continue and propagation
through a nonmatching handler. Strict checks pass. This is a correctness
prerequisite for traceback redesign, not a claimed performance improvement.

Generator suspension/resumption remains separate required work; the synchronous
restoration test does not qualify it.

Bare `raise` now calls a runtime helper to read the shared active exception,
rather than selecting a lexical catch variable or unconditionally failing
outside a syntactic handler. The fixture covers a helper called within a
handler and the required RuntimeError when it is called outside one. The full
build passed in 7m 05s and all nine selected state/stack/lookup tests passed.
A subsequent narrow Pyright annotation documents the existing host-backed
exception inheritance boundary; this typing-only change is not covered by the
earlier source-identity build receipt. No new speedup, generator isolation,
chaining or logical traceback completion is claimed.

### Explicit cause and traceback-lowering experiments

Explicit `raise value from cause` now lowers through a helper that evaluates
both operands, normalizes exception classes/instances, and sets `__cause__`
and `__suppress_context__` without formatting either exception. Previously the
cause expression was discarded. The state fixture also covers `from None` and
invalid causes. This does not implement implicit context or cycle prevention.
The expanded fixture passed CPython and failed both Sage.js modes before the
change. After the change the full build passed in 6m 50s, all eight selected
state/stack tests passed, and strict checks passed for 403 library modules.

A hand-lowered synchronous three-function JavaScript sketch compares native
capture with unwind-time linked records and an active logical frame stack.
The first mixed-process run showed large order effects and is not accepted as
a comparison. Fresh processes per variant/mode (three warmups/seven samples,
100,000 iterations) gave normal/throwing medians of approximately: plain
1.11/99 ms, native capture 1.01/495 ms, unwind records 1.26/370 ms, active
stack 3.50/323 ms. These are development leads, not Python/runtime acceptance
evidence: fixed-depth normal calls may optimize away, and source identity,
generators, async, foreign errors and Python dispatch are absent. Do not infer
a deployable speedup or normal-call budget from this sketch.

Prototype and raw runs are retained at
`/tmp/sagejs-traceback-prototype.Gg85LV`. The next compiler experiment should
start with unwind-time records to avoid allocating an active-frame object on
every successful call. It must correctly record local catches and throwing
call sites, preserve foreign-error diagnostics, and compare generated ordinary
calls against an unchanged build before selecting a production representation.

### Implicit context at compiler raise boundaries

Compiler-emitted raises now use `ρσ_prepare_raise`: normalize the exception,
read the active handler, and attach it as `__context__`. With no active handler
or when reraising that same exception, it returns without traversing a chain.
For another active exception it severs a reverse context edge before linking,
so reuse of an older exception cannot create a new cycle. A visited WeakSet
bounds traversal of cycles introduced through host interop. No stack is
captured or formatted by this helper.

The CPython-backed fixture covers ordinary chaining, context retained under
`from None`, and reuse of the original exception while handling its replacement.
It passed CPython and failed both Sage.js modes before the change. This scope
does not qualify foreign JavaScript throws, generator state isolation, or a
complete traceback representation. These remain explicit follow-up work.

Qualification: full build 6m 56s, nine selected semantic/stack/lookup tests,
strict403 checks and the frozen selected pyparsing 3.3.2 workflow all pass.
Local host-realm diagnostics (10,000 operations, three warmups/seven samples,
two rounds) report construction 91–92 ms, construction/catch 83.5–84.2 ms,
and re-raise 12.64–12.68 ms. These are current-candidate diagnostics, not a
controlled before/after speedup or a new CPython ratio. The chained path is
not timed by this ordinary-handler workload; its allocation/lookup cost remains
a separate measurement target. Native stack capture remains the major open
performance issue.

### Experimental compiler-assisted unwind records

The private `python_traceback_records` output option instruments synchronous
function statements, explicit raises, local catches and unwind boundaries.
Activation identities are allocated on the exception path, not on successful
calls. Bare reraises reuse the activation's existing frame; explicit reraises
prepend a new record. A catch before a bare `finally` preserves the throwing
call's line before cleanup executes. Records retain frozen source metadata,
and `traceback.extract_tb` and formatting consume their Python coordinates.

The mechanism diagnostic enables `__sagejs_traceback_records_enabled__` only
after bootstrap. Exceptions created under that private flag do not capture a
native stack; ordinary operation remains on the native path. Foreign errors
are not converted into fabricated Python records. This is an experiment, **not
a supported global runtime switch**: uninstrumented callers, module execution,
generators/async, argument-binding failures before the instrumented body,
`sys.exc_info()` integration and all CLI/notebook display consumers still need
qualification before production adoption. Generators and lambdas are rejected
by the experimental emitter. Code metadata allocation/deduplication, nested
expression call-site precision, traceback mutation and ordinary-call overhead
also remain follow-up work. The existing draft PR remains draft.

Use `SAGEJS_EXCEPTION_LOGICAL_RECORDS=1 SAGEJS_EXCEPTION_VARIANT=lazy
SAGEJS_EXCEPTION_CASE=construct_raise_catch node bench/python-exception-cost.cjs`
for the experimental warm diagnostic, and omit the logical-record variable for
its same-candidate native control. Do not compare repeated explicit reraises
as equivalent work: logical traceback chains now grow, unlike the legacy
native carrier. This diagnostic is not four-platform/package qualification or
a newly measured CPython ratio.

Local Node 26.8.1 host-realm measurements (10,000 fresh raises/catches,
three warmups, seven samples per round, two rounds in each fresh process,
native/records/records/native process order) gave round medians of 88.2–92.7 ms
for native capture and 40.7–41.8 ms for records: approximately 2.1–2.3x faster.
Raw runs are retained as `/home/user/python-logical-final-{native,records}-{a,b}.json`.
This removes capture from the exercised path, not all exception overhead.
An additional `normal_call` case measures successful calls with instrumentation
enabled; it is a small mechanism diagnostic, not a package-level overhead gate.

Validation: the initial full build passed (6m 54s), then the final compiler
changes converged in two self-hosting passes; all 15 focused tests and strict
403-module checks passed. The tests cover source lines, recursive activation
identity, local catches, bare reraises, `finally` call sites, native fallback,
zero native captures on the logical path, and stdlib formatting/limit direction.
This is not a claim of a final four-platform build or a closed performance cliff.
