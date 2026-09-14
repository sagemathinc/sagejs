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
all CLI/notebook display consumers still need
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

### Logical traceback consumer handoff

`sys.exc_info()` now exposes the current logical record by identity, including
replacement or clearing of the exception's traceback. Native carriers retain
the legacy empty tuple rather than pretending a JavaScript Error is a Python
frame chain. The three-argument `traceback.format_exception(type, value, tb)`
honors a supplied record chain or explicit `None`; clearing a traceback also
suppresses frames in the one-argument formatter. These are consumer changes,
not a change to capture policy or a new performance result. Focused tests cover
the handoff, explicit inner-chain selection, clearing, and handler restoration.

### Structured diagnostic transport and Node consumers

After merging main `4834ec0cb`, structured diagnostics carry detached
`python-record` frames and an explicit `framesTruncated` flag. Traversal stops
at 256 frames, malformed records or cycles. Live activation objects and source
descriptors are not transported; attached frames are frozen. Host-only errors
do not acquire inferred Python frames. CLI rendering, Jupyter reply formatting
and the Node kernel output-event path consume this shared representation.

The merged-source full build passed in 6m 54s. Thirty-three focused tests pass,
including actual compiled records normalized into diagnostics, kernel output
event transport, and a Jupyter reply-adapter test (not a live client session).
TypeScript checking also passes. Browser worker transport, production capture
policy, mixed-code coverage and suspended-frame ownership remain unqualified;
the feature is still off by default. All four persistent qualification hosts
were reachable, but no new remote qualification or timing is claimed here.

Required follow-up gates on this combined candidate:

- The initial merged candidate exceeded the core-runtime source budget at
  904,070 / 903,000 bytes. The compact exception helpers below repair this
  gate without changing its allowance.
- Suspended generator ownership is still incorrect. This reducer prints `ok`
  on CPython and fails its final assertion on the current Python kernel:

  ```python
  import sys
  def gen():
      try:
          raise ValueError('owned')
      except ValueError:
          yield 1
  g = gen()
  assert next(g) == 1
  assert sys.exception() is None
  print('ok')
  ```

  PR244 (`9c46612c1`) contains an ownership-aware stack and generator adapter
  to audit/reconcile, not blindly merge: its reviewed evidence is historical,
  and it interacts with the current synchronous restoration and traceback work.
  Native stack capture by itself is not a fallback for this state-isolation bug.

These are required failures, not accepted incompatibilities. The 33 focused
diagnostic passes do not supersede them. PR272 must remain draft.

### Compact exception runtime boundaries

Logical construction no longer reads the native stack-capture hook, and
native exception prototype installation shares its existing metadata loop.
Fresh, null-prototype traceback records use direct field initialization;
updates to caller-owned traceback carriers still use `Reflect.set`, preserving
the nonthrowing behavior for read-only carriers. Native stack capture and its
no-`captureStackTrace` fallback remain available and unchanged in policy.

An attempted direct tuple-finalizer call required a `typing.cast` that survived
bootstrap lowering and failed compiler self-hosting. The proven reflective
tuple-call boundary is retained instead. Focused qualification includes
argument tuple ownership, reinitialization, native lazy stack formatting,
logical frame consumers, primitive foreign throws, and frozen carriers. This
repairs a size gate; it does not qualify mixed execution, generator ownership,
or a production capture policy, and is not a performance-cliff closure claim.

The revised source census is 902,742 / 903,000 bytes; the allowance is unchanged.
The final full build passed in 6m 57s, all 42 focused tests passed with a
parallel validation receipt, and strict checking passed for 404 modules.
The pinned pyparsing 3.3.2 workflow also passes its unchanged source-qualified
gate, parsing `2, 3, 5, 7` into integer values. That workflow uses the native
capture default; it does not qualify experimental records inside packages.

Controlled mechanism comparison on idle `bench-1` (AMD EPYC 7B13, Node 26.7.0,
CPython 3.14.4, JIT disabled) uses 100,000 operations, three warmups, seven
samples, and two reversed-order fresh-process rounds. Per-round median ranges:

| Workload | Native capture | Experimental records | CPython |
| --- | ---: | ---: | ---: |
| Construct exception | 1,009–1,024 ms | 351–359 ms | 10.04–10.05 ms |
| Construct, raise, catch | 1,111–1,122 ms | 543.8–543.9 ms | 12.84–13.15 ms |
| Successful identity call | 8.916–8.918 ms | 9.127–9.423 ms | 3.878–3.884 ms |

Records are about 2.1× faster for raise/catch, but remain roughly 41–42×
CPython: the cliff is open. Successful-call medians are 2–6% higher on this
small probe; this is not a package-wide overhead bound. Generated standalone
source grows from 14,175,273 to 14,395,909 bytes (+1.56%). Two bootstrap samples
per policy overlap (native 430–446 ms, records 440–442 ms); this is insufficient
to qualify startup. This compares capture policies on the same candidate, not
a historical optimization speedup, and the records policy remains experimental.

Retained evidence: `/home/user/exception-record-pair.qpudPG` on `bench-1`, local
copy `/home/user/exception-record-pair.cN1MHz`. `report.json` records input and
interpreter hashes, all samples, process order, and load observations. Native
source SHA256 starts `4bcc33adc8ccd022`; record source starts `ee6d19bc714e6a25`.

### Pending exceptions during cleanup

The compiler now treats an exception escaping any part of a try/except/else
statement as active handled state while its finally suite executes. A scoped
pending slot surrounds the whole statement, and cleanup saves/restores the
caller's state even when it returns, breaks, continues, or replaces the pending
exception. Ordinary catches and cleanup share the state-emission helper.
Logical traceback records are appended before cleanup changes the line marker,
so bare reraises preserve the original call site and replacement exceptions
retain the original exception's frames through their context.

The focused CPython/Python/Sage regression and logical record tests pass,
including nested handlers inside cleanup, failures from except/else, caller
restoration and replacement chaining. CPython 3.14's three expected warnings
for legal return/break/continue exits are checked explicitly; unexpected stderr
still fails the oracle. This is synchronous state handling, not generator
ownership or an asynchronous fallback qualification.

The full build passes (7m 02s), and all 42 exception/diagnostic tests pass on
the revised compiler with a recorded parallel receipt. The source budget is
unchanged. Broader compiler-suite qualification is separate from those focused
passes; neither result qualifies generator ownership.

The subsequent broad compiler run has 24 passes, 34 fixture-declared skips,
and eight failures: `algebra.py` times out, and seven polynomial/extension
fixtures fail module resolution (`packed_prime_field`, `field_capabilities`,
or `extension_mpoly_backend`). These are not waived or yet attributed by a
parent-revision comparison. The pinned pyparsing workflow passes again on the
cleanup revision. PR272 remains draft, and the full compiler gate remains open.

### Ownership reconciliation and capture-policy guardrail

The ownership adapter under qualification follows PR244's linked-handler
model: a suspended generator retains its own chain; its root reconnects to
the current caller on each resume. Shared adapters intercept native next,
throw and return while preserving native receiver/reentrancy checks. Cleanup
and context-manager exit scopes participate in the same ownership model.
The adapter is singleton per realm so repeated bootstrap initialization cannot
orphan a live or suspended chain. The initial reconciliation passed 30 of 33
focused cases; its three context-manager exit failures prompted a correction,
not a reclassification. After the exit-scope correction and singleton guard,
all 34 ownership/state/logical tests pass; the other 36 exception/diagnostic
tests also pass. Strict checking passes for 404 modules. This checkpoint uses
a converged compiler and refreshed runtime cache; it is not a final
four-platform or fully rebuilt package qualification.

Direct reads of the known host global object replace reflective reads;
caller-owned member access is not broadly rewritten. Repeated builtin weak-map
initialization shares one allocator. These changes keep ownership support
within the existing source allowance (902,765 / 903,000 bytes at this checkpoint).

Production capture must not be justified by these state-only tests. In
particular, the experimental global skip-capture switch cannot distinguish an
instrumented callback entered through opaque JavaScript or uninstrumented
Python. A safe policy must retain native capture for opaque call ancestry,
including callbacks and generator/coroutine resumes, and preserve those native
diagnostics when logical callers add frames. An instrumented callee must not
blindly re-enable stack suppression beneath an opaque ancestor. The switch
remains experimental until that boundary is implemented and tested.

### Bare-reraise propagation qualification

Bare `raise` must not add the helper's frame, but its caller must still acquire
a frame when propagation resumes there. Function-activation deduplication was
too coarse: it also discarded legitimate repeated calls at the same source
line. The compiler now tracks captured and bare-reraised exception identities
locally, resets them when a handler or cleanup starts new execution, and
restores them only for implicit propagation of the original exception. Records
no longer allocate or retain activation objects.

The new CPython differential oracle checks exact names, line numbers, filenames
and source excerpts in Python and Sage modes, including recursive helpers,
same-line repeated calls, unmatched handlers, selector failures, context exits,
nested finally handlers and explicitly cleared tracebacks. The full build
passes in 7m 06s; all 72 exception/diagnostic tests pass with a parallel receipt,
and strict checking passes for 404 modules. The pinned pyparsing
workflow passes on that full build. The source remains inside its unchanged
allowance at 902,509 / 903,000 bytes.

A fresh bench-1 comparison uses 100,000 operations, three warmups and seven
samples in each of two opposite-order rounds (fresh processes). Median ranges
in milliseconds:

| Workload | Native capture | Records | CPython |
| --- | ---: | ---: | ---: |
| Construction | 970–976 | 323–329 | 10.05–10.23 |
| Construction, raise and catch | 1071–1085 | 516–527 | 13.02–13.14 |
| Successful call | 8.94–9.94 | 9.17–10.13 | 3.89–3.92 |

Raise/catch improves about 2.1× against the same candidate's native policy,
but remains about 40× CPython: the cliff is open. Successful-call samples vary
enough between rounds that they do not establish a general overhead bound.
Two bootstrap observations per policy are not startup qualification. Evidence
is retained locally in `/home/user/exception-propagation-pair.nYJzH1` and on
bench-1 in `/home/user/exception-propagation-pair.QRgeEH`; `report.json` records
hashes, all samples and process order. This is an experimental synchronous
record comparison, not mixed-execution, package-record or four-platform
qualification. The pyparsing check above still uses the native default.

### Injected generator exceptions

The CPython oracle exposed missing implicit context on `generator.throw()` and
`close()` while a generator is suspended in its own handler. Injection now
prepares that context after reconnecting the generator's owned chain. It does
not use an inherited caller handler: CPython leaves injection context unchanged
when the generator has no owned handler, including before startup and after
completion. Explicit causes, suppression and reverse context cycles are tested.
The converged compiler and refreshed runtime pass the three new differential
cases in both modes and all 75 focused exception/diagnostic tests with a recorded
receipt; strict checking still passes for 404 modules. This is a
native-path correctness fix, not qualification of generator logical records.

### Suspension records and mixed native carriers (qualification in progress)

Logical records now cover generator suspension, delegation, bare reraising,
cleanup, injection, alternating owners and manually driven nested coroutines.
An entry callback handles injection before the first resume: JavaScript never
enters the generator body in that case, so its body catch cannot supply the
definition-line frame. The callback is discarded on the first resume.

Instrumented propagation can also add known Python frames to a native-backed
exception such as `TypeError`. Its original native carrier is retained lazily
in `__sagejs_native_tb__`; the host-neutral diagnostic and stdlib formatter
preserve that evidence under a separately labeled native-capture section.
Native capture can overlap the compiler frames and is not presented as a
second set of independently inferred Python frames. Ordinary helper calls
without explicit native participation still leave foreign carriers untouched.

The suspension oracle exposed that `await` had been lowered as plain
`yield from`. A distinct AST marker now invokes the existing type-slot resolver
for `__await__`, ignoring instance overrides and rejecting noncallable slots
or non-iterator results. Tests use the supported manual `send()` coroutine
path. A CPython-style coroutine `__await__()` wrapper and general event-loop
qualification are not claimed here. Lambdas still reject the experimental
record option; global native-capture suppression is still not a safe production
policy for opaque ancestry or uninstrumented module execution.

The initial combined set passed 58 tests. A subsequent constructor probe found
that replacing native argument-length access with public `len()` made exception
messages depend on a monkeypatched builtin. Explicit native access is restored
and a minimized CPython regression protects it. The final candidate remains
under the unchanged core source allowance (902,984 / 903,000 bytes), with strict
checking passing for 404 modules. All 98 focused exception/diagnostic tests pass
with a recorded receipt on the corrected source. Full-build and portable results
must be recorded separately, not borrowed from earlier runs. A direct probe
confirms a remaining binding defect: a generator called without a required
argument returns an iterator and only fails on resume. Moving binding to call
time remains required; suspension frame qualification does not close it.

For `1dd497dec`, the full build passes in 7m 08s and the pinned pyparsing 3.3.2
workflow passes on that build (native default policy). Frozen standalone probes
pass all nine suspension/native-diagnostic cases in both modes on bench-1
(Linux x64, Node 26.7.0), bench-arm (Linux ARM64, Node 26.5.1), m1 (macOS ARM64,
Node 26.5.0), and native Windows x64 (Node 26.5.1). Artifact hashes agree on all
hosts: Python `39c292655e845cf1`, Sage `8569f322b9d6fe28`. Full artifacts and the
scoped report are in `/home/user/exception-portable-probes.bOBERD`. This is
targeted portability evidence, not four-platform package/browser qualification.

The same-candidate bench-1 comparison was rerun with the same 100,000-operation,
three-warmup, seven-sample, two-opposite-order protocol. Per-round medians (ms):

| Workload | Native capture | Records | CPython |
| --- | ---: | ---: | ---: |
| Construction | 954–972 | 316–322 | 10.06–10.10 |
| Construction, raise and catch | 1072–1075 | 482–483 | 13.15–13.25 |
| Successful call | 8.99–9.30 | 9.17–9.87 | 3.88–3.90 |

Raise/catch is about 2.2× faster than this candidate's native policy, but still
about 37× CPython: the cliff remains open. The small successful-call probe does
not establish a package-level overhead bound. Emitted native/record source is
14,209,547 / 14,445,066 bytes (+1.66%); two bootstrap samples per policy are not
a startup distribution. Evidence and input/binary hashes are retained in
`/home/user/exception-suspension-pair.hZk01j` locally and
`/home/user/exception-suspension-pair.wdessh` on bench-1.

### Call-time generator binding

The generator wrapper now performs the ordinary argument preamble at the call
and closes over those bound values. Its suspended body no longer repeats
binding. This repairs immediate argument errors and prevents later default or
function-name mutations from changing an already-created iterator. Positional,
variadic and keyword arguments, parameter assignment, instance/class/static
methods and rebound function names agree with CPython in both modes.

The shared binding-error helper now attaches the active exception context,
including ordinary non-generator functions. Exact logical frame oracles also
check binding errors with and without an active handler: the unentered callee
does not contribute a body frame. All 109 focused tests pass with a receipt;
strict checking passes for 404 modules and the unchanged source allowance holds
at 902,999 / 903,000 bytes. This revision has converged-compiler/runtime-cache
qualification, not a new full-build, timing or four-platform receipt. Earlier
receipts remain bound to their original source/artifact identities.

### Lambda, chaining and native-evidence checkpoint

At `2178fcaf92396ee0dd4ccbc5b2c2c1b68b1094b3`, lambda expressions use the
shared unwind emitter, including multiline body locations; binding errors
exclude unentered lambda bodies. `traceback.format_exception` now follows
explicit causes and unsuppressed contexts, respects `chain=False`, and breaks
identity cycles. Native-only self-carriers also retain their native evidence
in the structured diagnostic/Jupyter renderer.

The first full build exposed a stage-zero parser rejection of a formatted
multiline conditional in the emitter. The follow-up rewrites name selection
before constructing the metadata literal. The corrected full build passes in
7m05s, all 125 focused tests pass again against rebuilt artifacts, and the pinned
pyparsing 3.3.2 workflow passes. Strict checking passes for 404 modules. Logs:
`/home/user/exception-lambda-chain-build-retry.log`,
`/home/user/exception-lambda-chain-rebuilt-tests.log`,
`/home/user/exception-lambda-chain-strict.log`, and
`/home/user/exception-lambda-chain-pyparsing.json`.

Frozen standalone probes cover 11 generator/binding/async cases and five lambda
cases in each language mode. All pass on Linux x64 (Node 26.7.0), Linux ARM64
(26.5.1), macOS ARM64 (26.5.0), and native Windows x64 (26.5.1). Artifacts and
their exporter are in `/home/user/exception-lambda-portable.n7W9ne`; every host
reports matching SHA-256 hashes:

- Python: `80d59034ca303b589d0de4cef017a7e03395fd56da76b4249ef40de628436005`.
- Sage: `2e1fef8b9f6655c5e0979b5e4e121f2ab4021d10dba0452f9539c03101eb18d6`.

This is targeted compiler/runtime portability, not full browser/package
qualification on all hosts. No new performance claim is made by this correctness
checkpoint. Native suppression remains experimental and disabled by default;
module-level coverage, opaque ancestry, browser consumers and broad gates remain
open. Rechecking `test/extension-field-capabilities.py` on this build still fails
to resolve `sagejs.kernels.polynomial.packed_prime_field` (12.7s, not a timeout);
see `/home/user/exception-extension-gate-recheck.log`. The earlier broad failures
are not waived by the focused passes. PR272 remains draft.

### Module and class-body checkpoint

At `7fb8f3fd849292c4762761d6681e8c6d2a1c61d0`, the shared unwind emitter
covers main/module bodies and class-body execution, including method and
property defaults. Records-mode declarations remain visible outside their
instrumentation blocks; repeated cells reset location/propagation markers.
Prepared metaclass namespaces and ordinary class construction have exact
CPython frame oracles in both language modes, with private scope on and off.

The clean build passes in 7m12s, all 175 focused tests pass again against rebuilt
artifacts, strict checking passes for 404 modules, and the pinned pyparsing 3.3.2
workflow passes. Evidence: `/home/user/exception-class-clean-build.log`,
`/home/user/exception-class-rebuilt-tests.log`,
`/home/user/exception-property-metadata-strict.log`, and
`/home/user/exception-class-pyparsing.json`.

Frozen standalone probes in `/home/user/exception-class-portable.GZwENS` cover
12 module/class failure cases with private scope both on and off (24 per mode).
All pass on Linux x64 (Node 26.7.0), Linux ARM64 (26.5.1), macOS ARM64 (26.5.0),
and native Windows x64 (26.5.1), with matching artifact hashes:

- Python: `9b6587b2ce54f049ad78b8388fb966a1127dedd5998ba0e631637200ed20064f`.
- Sage: `a66d3c592b9c7528cb69188fb12e7227d7b381e33ea26a86a1ba0a4c8acacf56`.

These are targeted correctness/portability checks, not timing or full-product
qualification. Native capture remains the default. Eager import initialization,
opaque cached modules and mixed ancestry still prevent blanket suppression;
browser transport and the broader gates remain open. The prepared-namespace
test installs its support module once in the same runtime and uses the current
module cache. Earlier aborted cold/repeated-bootstrap fixture runs are not
performance evidence and are not counted as passing qualification.

### Browser transport and renewed mechanism measurements

Commits `d5469f1bd` and `0783bc873` bundle the shared diagnostic formatter into
the browser package. Worker errors, session rejections, widget error events,
the live app and embedded cells retain logical records, chains and labelled
native evidence. Frozen/foreign errors keep their original stacks; a transport
wrapper cannot replace them. Eleven focused browser adapter/client/render-helper
checks pass. These tests do not enable compiler records in the browser compiler.

The corrected full Wasm build at `0783bc873` passes, producing artifact identity
`sha256:d101bfc3d9bab5328fc547aaf54909d8478a28132951c360ff7efb86a9574b4b`.
The first attempt failed sorted-asset validation and is not a passing receipt.
Rebuilt worker error recovery passes. The combined check is 17/18 because the
receipt fixture omits the already-declared extension-multivariate specialist;
the full Chromium smoke test separately fails its punycode workflow because
`sagejs._punycode` is absent from the implicit browser core. Logs:
`/home/user/exception-browser-full-build-retry.log`,
`/home/user/exception-browser-rebuilt-tests.log`, and
`/home/user/exception-browser-smoke.log`. Those prerequisites are being fixed
independently on `agent/browser-core-codec-closure`, based on fresh main.
The initial codec inclusion exposed a second required invariant: every implicit
core module must also enter the standalone cache closure. The regression retains
both assertions. No broad browser pass is claimed yet.

Frozen compiler artifacts from the `7fb8f3fd8` correctness checkpoint were
remeasured on idle bench-1 (Node 26.7.0, CPython 3.14.4), under an exclusive
benchmark lock, with three warmups, seven samples and two opposite process
orders. Medians for 100,000 operations:

| Workload | Native capture | Experimental records | CPython |
|---|---:|---:|---:|
| Construct | 952–963 ms | 325–332 ms | 10.0–10.1 ms |
| Construct/raise/catch | 1,072–1,073 ms | 486–490 ms | 13.0–13.3 ms |
| Successful call | 9.05–9.16 ms | 9.16–9.18 ms | 3.88–3.93 ms |

The raise/catch cliff remains open at approximately 37× CPython. Native and
records artifacts contain 14,216,075 and 14,651,385 bytes respectively (+3.06%).
Twenty fresh processes per policy, with alternating order and warmed filesystem
cache, give median total process times of 488.2 ms and 490.3 ms; p95 is 512.6 ms
and 517.2 ms. This is standalone bootstrap, not browser download/startup.
Hash-bound inputs and reports are in `/home/user/exception-class-pair.sDWjlJ`
and `/home/user/exception-class-pair.v1NDqj` on bench-1. The CPU profile there
also shows tuple finalization, constructors and generic lookup costs; aggregated
minified-source samples do not precisely isolate native throw cost.

A fresh prepared-call gate is 41/45: duplicate mapping access order and custom
`__getattribute__` lookup each fail in both modes. See
`/home/user/exception-prepared-gate-recheck.log`. Merge inventory checks pass
(`/home/user/exception-merge-gate.log`), but they do not waive these semantic
failures. Native suppression stays experimental/off by default, PR272 stays
draft, and opaque ancestry/default policy and final package/platform qualification
remain required.

### Source-ordered keyword failure checkpoint

Keyword lowering now retains the order of explicit keyword segments and
`**mapping` expansions. Each segment merges into one compiler-owned accumulator
before the next segment is evaluated. This fixes duplicate-key versus item-read
and later-argument exception precedence without quadratic packet copying or an
extra closure that could change `yield`/`await` scope. Computed literal keys also
preserve the Python keyword `__proto__`. The private merge helper and its
`js_new` caller change together; old generated code must be rebuilt.

The clean build passes in 7m10s; strict checking passes for 404 modules, and
the pinned pyparsing 3.3.2 workflow passes. The prepared-call selection improves
to 58/60, with only the existing custom-`__getattribute__` failures in both
modes remaining. All 113 selected traceback/diagnostic regressions pass.
Six additional source-order/generator checks pass against CPython and both
language modes. Logs: `/home/user/exception-keyword-build.log`,
`/home/user/exception-keyword-focused.log`,
`/home/user/exception-keyword-records-regressions.log`,
`/home/user/exception-keyword-segments.log`, and
`/home/user/exception-keyword-pyparsing.json`.

Core source usage decreases to 902,971 / 903,000 bytes. The architecture chain
passes that gate but later stops at the stale optimizer-opportunity manifest
(expected input `51678a4c17954ed55f5817523c1b69458aeadf71f0d102276c2a5fa89bcdc93b`,
found `5a861be64dd133755c35ef93f89fcc2f4a68846f62c6c1553b9a013e8cbef5dc`).
That is not a passing architecture receipt and has not been waived.
This checkpoint makes no new performance or production-capture-policy claim.

### Shared exception initialization and binding capture

Argument-binding failures now allocate an owned Python exception with the native
`TypeError.prototype` and share message, context and stack initialization with
`BaseException`. The old binding path constructed a native `TypeError` (capturing
a stack) and then captured another stack to exclude the unentered target. The
new path captures once in native mode and zero times under the explicit
experimental records switch. A fresh native argument array is transferred to
the tuple finalizer without decorating an intermediate Python list. Existing
argument-tuple ownership and initialization order are retained.

The JavaScript representation is intentional: these owned errors satisfy
`instanceof TypeError` and `instanceof Error`, but do not have the engine's exotic
native-error brand (`util.types.isNativeError`). This matches the ownership
model already used by Python `ValueError`; foreign JavaScript errors are not
converted and retain their identity and original stacks. Python `type`,
`isinstance`, tuple `args`, context, message descriptors, lazy formatting, target
frame exclusion and no-`captureStackTrace` diagnostics have regression checks.

The frozen build passes in 7m09s, all 404 strict modules pass, and core source is
902,857 / 903,000 bytes without changing the allowance. All 168 selected
exception/diagnostic tests and the pinned pyparsing 3.3.2 workflow pass. Prepared
namespace failures observed during an overlapping cache build do not recur on
the final frozen artifacts; that provisional run is not qualification evidence.
The prepared-keyword oracle file is 52/54: its two existing reentrant custom
`__getattribute__` failures remain open in Python and Sage modes. They are not
waived by this exception checkpoint.

Frozen Python/Sage binding probes pass in native and records modes on Linux
x64/ARM64, macOS ARM64 and native Windows. The probes cover ordinary and
generator binding, nested exception context, exact logical caller records,
capture counts and foreign error preservation. Their source hashes are
`626040db00d2f27f29af4860dc46421319381ee72192aca7eb1d0e47be3173ac`
and `f0a0d4be61dc421a18818293c54f6598cb077fc5e08682fa272b15ed9266b82b`.
Evidence lives in `/home/user/exception-binding-pair.j4mN5E` and the matching
`exception-binding.*` directories on the four hosts. These targeted probes do
not replace full product/platform qualification. Blanket native suppression
remains experimental; this change does not resolve opaque ancestry.

Controlled same-host before/after qualification of `f84d17a24` uses preserved
pre-change artifacts from `70ad1a13f`, Node 26.7.0 and CPython 3.14.4 on bench-1
(AMD EPYC 7B13), with an exclusive benchmark lock. Each run has 100,000
operations, three warmups and seven samples; the second pass reverses target
order. Ranges below are the two run medians in milliseconds, not confidence
intervals. Inputs are hashed in `exception-binding-pair.j4mN5E/report.json`.

| Workload | Native before → after | Records before → after | CPython |
| --- | --- | --- | --- |
| Binding failure | 1693–1722 → 1647–1655 | 1758–1799 → 972–990 | 45–46 |
| Construct `ValueError` | 964–969 → 990–991 | 329 → 330–337 | 10 |
| Construct/raise/catch | 1050–1063 → 1100–1107 | 472–478 → 501–502 | 12.5–12.8 |
| Successful call | 9.03–9.63 → 8.98 | 8.98–9.01 → 8.99–9.33 | 3.90–3.91 |

Binding improves substantially only in explicit records mode (about 1.8×);
its remaining 21–22× CPython gap is still an open cliff. The small native
binding improvement accompanies correct owned tuple arguments, which the old
factory did not initialize. Ordinary raise/catch regresses about 4–6% after
initializer extraction. That regression requires follow-up rather than a claim
of an unqualified performance win. Pyparsing above is a correctness workflow,
not a timed package speedup. These warm mechanism runs do not replace startup,
package, mixed-code, browser or full four-platform performance qualification.

### Current-stack adapter capture

Node's current-stack adapter now uses a private `Error.prototype` carrier and
captures once, rather than constructing an `Error` and immediately recapturing
at the requested boundary. This carrier never escapes to Python. Existing
exception inputs are still read without conversion, recapture or mutation.
Mapped/excluded/foreign frames and boundary/trampoline rules are unchanged.

TypeScript compilation and all 34 selected adapter/CLI/diagnostic checks pass.
The five adapter checks also pass on all four native hosts. Frozen artifacts
in `/home/user/exception-current-stack.9hQ6vh` were measured under the bench-1
exclusive lock after the initializer probe finished: 10,000 current-stack
collections, each returning ten frames, three warmups and seven samples,
before/after/after/before order. Run medians fall from 316.1–316.4ms to
229.9–232.4ms (about 27% less time). This is a Node adapter comparison, not a
CPython/package speedup or a closure of the remaining exception cliffs.

### Reuse the original initializer without an extra ordinary-exception frame

Binding errors now invoke a saved reference to `BaseException`'s original
initializer. Ordinary exceptions initialize inline again, avoiding the extra
helper frame introduced in `f84d17a24`. The private binding marker temporarily
carries the target during capture and becomes `True` before publication; it is
not retained as a function reference. Reinitialization safely ignores the
completed boolean marker. Public initializer replacement cannot redirect the
automatic binding-error factory. The shared class classifier also uses static
`Object.hasOwn` without a temporary argument array; own/inherited markers,
non-invocation of a bases getter and callable-instance exclusion are checked.

The frozen build passes in 7m09s, 404 strict modules pass, all 173 selected
exception/diagnostic tests pass, and pyparsing passes. Core source is exactly
903,000 / 903,000 bytes; the allowance is unchanged. Extended binding probes
pass on all four native hosts. Python/Sage artifact hashes are
`70b9ff9d3cb7c094366ea51d68a60d5b900f2cdeeb575a83c16d2f15d40a58dc`
and `09646043f8bb214780fb499fd38c33344e40116b698fd63a5e62121661b0815d`.

`/home/user/exception-inline-pair.KLOIfb/report.json` repeats the locked,
opposite-order comparison directly against preserved `70ad1a13f` artifacts:

| Workload | Native original → follow-up | Records original → follow-up | CPython |
| --- | --- | --- | --- |
| Binding failure | 1690–1701 → 1553–1593 | 1801–1839 → 923–931 | 45–46 |
| Construct `ValueError` | 960–966 → 941–943 | 324–338 → 331–332 | 10 |
| Construct/raise/catch | 1054–1071 → 1037–1045 | 471–478 → 498–506 | 12.6–12.7 |
| Successful call | 8.96–8.97 → 8.97–8.98 | 8.97–8.99 → 9.50 | 3.89–3.90 |

Values are run medians in milliseconds per 100,000 operations, not confidence
intervals. The native regression is removed, but records raise/catch remains
about 4–7% behind the original in this combined-workload process. Its warmup
order and shared-initializer effects require investigation. Binding's remaining
roughly 20–21× records/CPython gap is still open. No production suppression
policy or package performance claim follows from these results.

### Keyword hook disambiguation

Plain keyword packets now treat callable `keys`, `__getitem__`, and
`hasOwnProperty` values as values, not mapping hooks. User mapping objects still
use their protocol. Internal own-key checks use native `Object.hasOwn`, avoiding
the explicit reflective-call argument array. Its missing static-method contract
entry was caught by rebuilt runtime checks and corrected with an emitter
regression; the first failed candidate is not qualified.

The corrected clean build passes in 7m17s. Strict checking passes, all 113
selected traceback regressions pass, and pyparsing 3.3.2 passes. Prepared-call
checks are 64/66, retaining the two custom-`__getattribute__` failures. Core source
usage is 902,933 / 903,000 bytes, without a budget change. Logs use the prefixes
`/home/user/exception-keyword-hooks-build-retry`,
`/home/user/exception-keyword-hooks-final-`, and
`/home/user/exception-hasown-final-emitter`.

Eight selected keyword/generator/receiver checks pass against CPython and in
both language modes on Linux x64/ARM64, macOS ARM64, and native Windows x64.
Frozen artifacts and exporter: `/home/user/keyword-merge-qualified.GKQooG`.
Python SHA-256: `f00bb7a7f4e635f1820124a2151b93fdfe6f8f99e7f8ac06a514767150461f0f`;
Sage: `36bc93b44204491e6f4b51dd71363b51d3b65965389e0b842db7bf3709a65dde`.
These are targeted standalone checks, not full four-platform product coverage.
The mechanism benchmark now includes a missing-argument exception workload for
the next native-capture comparison. No speedup is inferred from this change.

### Guarded synchronous traceback policy checkpoint

PR284 is merged into main and integrated in this lane. The new
`python_traceback_guarded` output option remains **opt-in** and requires
`python_traceback_records`. Production defaults have not changed.

The policy gives ordinary synchronous named functions an opaque public entry
and a private compiled-call target. Simple positional compiled calls may use
the private target; foreign callbacks use the public entry and retain native
capture. Eligible owned exception constructors require an unchanged initializer
chain, including compiler-marked forwarding initializers. Permission is
consumed before argument conversion can invoke callbacks. Each synchronous
root retains one native outer-stack backstop, including when an exception is
saved after returning. Missing `Error.captureStackTrace` forces native fallback.
This is an internal compiler protocol, not a JavaScript security sandbox.

Methods, decorators, lambdas, generators/coroutines, keyword calls, uninstrumented
code and custom initializers conservatively retain native capture. Tests cover
async resumption while another guarded root is active. Function identity,
self-referencing attributes and replacement defaults remain observable on the
public function; the compiler's private self-reference is separate. Reentrant
bare evaluations use lexical root tokens rather than overwriting a global
token. Reinitialization discards a previous logical backstop on native fallback.

The frozen root build passes (7m20s), strict checking passes all 404 modules,
and pyparsing 3.3.2 passes. The broader initial run passed 196/198 checks and
exposed two raw-native-stack CLI formatting regressions; ae3269e7c restores the
existing concise CLI contract while preserving native evidence in transport,
rich consumers and developer output. Its 33 focused checks pass. Core source
usage is 902,966 / 903,000 bytes, without widening the budget. Allocation-free
`Object.hasOwn` calls replace reflective temporary-array checks in deletion and
object allocation, offsetting the small initializer hook.

Ten policy-isolation checks and the same frozen compiled Python/Sage probes
pass on Linux x64/ARM64, macOS ARM64 and native Windows x64. Compiled probes cover
raises, reraises, chaining, finally, recursion, binding, saved defaults/identity,
foreign callbacks/errors, mutation, generator/async fallback, missing capture
capability and reentrant evaluation. These are targeted standalone probes, not
full four-platform product qualification. Artifacts/exporters are retained in
`/home/user/exception-guarded-campaign.tvkZpY`:

- Python SHA-256: `052f5dfac92194c319760239f3a10fb0e2d40e054124a3e7865de1304b29d345`.
- Sage SHA-256: `b6973988fe220cd3e8f50a4a32579dd13d1de6ab2839de138e9df9a325b01fd7`.

Controlled, exclusive-lock bench-1 measurements use Node 26.7.0, CPython 3.14.4,
100,000 iterations, three warmups, seven samples and opposite process order.
The guarded entry includes one native backstop per batch. Medians in ms:

| Workload | Previous native (acab9ce08) | Current native | Guarded | CPython |
| --- | ---: | ---: | ---: | ---: |
| Missing-argument binding | 1621–1660 | 1683–1692 | 994–1052 | 45–46 |
| Exception construction | 982–988 | 973–1019 | 456–459 | 10.1 |
| Construct, raise, catch | 1071–1089 | 1095–1106 | 597–600 | 12.5–12.6 |
| Successful call | 9.08–9.37 | 8.99 | 9.68–9.86 | 3.88–3.90 |

This improves guarded exception cost substantially but leaves roughly 22–23x
binding, 45x construction and 48x raise/catch gaps against CPython. None is
closed. Successful-call overhead is approximately 8–10%; native binding also
shows a small regression. Both need investigation before selecting a default.
The standalone artifact is 14,272,462 bytes native versus 14,777,282 guarded
(about 3.5% larger, including the large shared runtime); that is not a claim
about user-code-only size or packaged startup. Raw samples, hashes and commands
are in `report.json`/`run.cjs` in the artifact directory, mirrored at
`bench-1:/home/user/exception-binding.DPGjJs/guarded-policy`.

The earlier isolated initializer probe is retained at
`/home/user/exception-inline-pair.KLOIfb/isolated-report.json`: records
raise/catch medians overlap (467–469ms before, 467–482ms after), unlike the small
combined-process regression. This suggests feedback/order sensitivity but does
not invalidate the combined-process observation. Neither set is discarded.

Default enablement, actual guarded package-workflow performance, final consumer
and product-wide platform qualification, and the existing architectural and
prepared-call gates remain open. PR272 remains draft; no release is published.

The subsequent scope-correctness checkpoint tracks the actual execution
context during code generation, rather than choosing the nearest function AST.
Default expressions execute in the enclosing context; a nested definition in
an uninstrumented method must not bypass that method's native boundary.
Suspended generator expressions likewise cannot inherit the surrounding
guarded function's permission. Minimized regressions exercise both cases while
another guarded root is active. All 12 policy/integration tests pass after
two-pass compiler convergence. The preceding broader diagnostic suite passed
199/199 after the CLI correction; it is not a new full-build receipt for these
last compiler changes.

Refreshed Python/Sage standalone probes pass on all four native hosts, including
the two new boundary cases. Artifacts are retained in
`/home/user/exception-guarded-scope.MrqVXP`:

- Python SHA-256: `63347691c41a9a8434afd813e4aa9d6bdb388cb3d87b8b37256cca27346d67d0`.
- Sage SHA-256: `36e97f3522c1e23fda85612b36ee4120cc548633fb9145908d08b72aedf4c327`.

The performance table above describes the earlier frozen checkpoint, not a
rebenchmark of these scope fixes. Separate million-call attribution probes
found roughly 20% guarded successful-call overhead. Removing an identity
function's unreachable body unwind handler in a generated-code-only prototype
reduced that to roughly 10%; this is evidence for investigating a conservative
nonthrowing-body proof, not a shipped optimization or a waived overhead gate.

The subsequent compiler change implements that narrow proof for guarded
function bodies consisting only of a bare return or a bound-parameter return.
Binding diagnostics remain outside the body handler; global reads, callbacks
and generators are not elided. Two-pass compiler convergence and all 50 focused
checks pass. Real generated outputs, not hand-edited prototypes, were compared
on the locked benchmark host in opposite process order:

- Isolated one-million successful calls: native 90.77–90.79ms, previous guarded
  110.64–112.54ms, elided guarded 100.46–103.08ms (roughly 8–11% improvement,
  still 11–14% above native).
- Mixed 100,000-call campaign after binding failures: previous guarded
  9.68–10.01ms, elided guarded 9.90–10.12ms; no demonstrated gain there.
- Exception costs remain approximately 997–1007ms binding, 458–468ms
  construction, and 607–614ms raise/catch. CPython remains approximately
  45–46ms, 10.1–10.3ms, and 12.6ms respectively. These cliffs remain open.

Frozen inputs, hashes, all samples, startup observations and both runners are
retained in `/home/user/exception-nonthrowing-pair.e9XOpn` and
`bench-1:/home/user/exception-binding.DPGjJs/nonthrowing`. Isolated and mixed
results are both retained; the favorable isolated result does not supersede
the mixed result or qualify a default-policy change.

Node consumer qualification now has an explicit selection surface:
`createSage({mode: "python", tracebackCapture: "guarded"})`, or the
command-scoped environment setting `SAGEJS_TRACEBACK_CAPTURE=guarded` for the
source CLI and Node/Jupyter sessions. Explicit session options override the
environment; accepted values are exactly `native` and `guarded`. Invalid values
fail before user execution. Native remains the default and preserves the old
native-only capture behavior; it does not invent compiler frames for
`traceback.extract_tb()`. Guarded mode enables records and guarded capture
together, retaining native boundaries for unsupported execution paths.

Six focused consumer checks cover CLI source diagnostics, invalid selection,
Python/Sage sessions under both policies, `sys.exc_info()`/`traceback.extract_tb()`,
transported uncaught failures and successful subsequent evaluation. Browser,
actual Jupyter protocol, package timings and complete product qualification
still need their own evidence; these Node tests do not stand in for them.

The frozen Node-consumer build passes in 7m16s and the expanded focused suite
passes 56/56. The Jupyter protocol run exposes the same traitlets
`missing required argument: self` failure under **both** native and guarded
capture. A minimal custom-metaclass subclass using
`super(D, self).setup(*args, **kwargs)` reproduces it without widgets. The super
proxy uses JavaScript-only receiver binding instead of the existing dual
Python/native method binder. This is an integration prerequisite, not a
guarded-capture regression or a waived Jupyter test.

The pinned `packaging` 26.2 version-sorting/epoch workflow passes under both
policies. Local seven-sample phase observations are retained at
`/home/user/exception-package-capture.AKJOcy/report.json`: cold CLI is about
4.0s versus CPython 49ms, and 1,000 warm workflows are about 2.4s versus 12ms.
Guarded capture shows no material package speedup here; both warm ratios remain
around 200x. These are provisional local observations, not controlled VM
acceptance measurements. No threshold or budget was changed.
