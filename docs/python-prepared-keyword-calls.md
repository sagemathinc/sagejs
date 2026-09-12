# Prepared immediate keyword calls

This implementation follows the preserved
[initial design and required baseline defects](../agents/python-prepared-keyword-calls.md).
It is not qualification of all call semantics or of the all-open integration.

## Exact source foundation

The isolated `python-prepared-keyword-implementation` branch starts from main
`02a683d21`, with clean reviewed prerequisite imports:

- #238 `550b635ed09e53ae0b4cce327751d1de387ccff2`, merge `19b4ab233`;
- #247 `37e80f4681c4b0e9dae1510c36eefd015f7e42bc`, merge `ca44e3daf`;
- #264 `24e19608c211301dc807d02f1b03fbb70d6339b5`, merge `612316caf`.

The imported oracle checkpoint `a58feb41619f62b86a70ea30a05eaea325d0f96e`
is the exact assembled control source. No source conflicts were resolved.

## Bounded changes

Immediate resolved Python attribute calls with keywords and no positional star
capture the existing prepared-method context before arguments. The invocation
uses the shared strict binder only when that context contains a receiver.
Explicit-self targets receive that receiver in the fresh argument array;
receiver-style targets keep it as the host receiver. Descriptor results and
other target-only contexts retain full callable resolution. Keyword expansion
and evaluation retain the existing emitter, including its known defects.

Ordinary saved bound methods now decrement numeric positional-only counts when
their argument-name list loses explicit `self`. Boolean all-positional metadata
remains boolean; receiver-style metadata is unchanged. The binding-array change
removes a previously discarded allocation and preserves marker short-circuit
read order. No ordinary attribute read is replaced with a prepared record.

Six cold marker definitions share a helper that allocates a fresh descriptor
with exactly `value`, `writable: true`, and `configurable: true`. Omitting
`enumerable` preserves an existing property's flag. Shared error-type lookup
still reads the live registry, errors module and requested type independently
at each original validation/matching point; it caches nothing.

The assembled core census is 899,355 / 903,000 bytes, versus 899,399 in the
control: 451 saved by marker factoring, 144 saved by binding allocation,
295 added for bound positional-only metadata, 328 saved by live error lookup,
and 584 added for the consumer/shared binder tail. An earlier all-open arithmetic
projection left 83 bytes, but was superseded by the coordinator's overlap-aware
source census including the new container domain: 910,686 / 903,000 bytes.
That over-budget integration is not this candidate and requires separate work;
this change neither raises a budget nor claims all-open qualification or an
emitted-size/startup improvement.

## Required limits

All four original standalone failure minima remain tracked. The ordinary
saved/immediate positional-only repair passes the actual Python and Sage
runtime regressions. Custom `__getattribute__`, sole-star consumption
order and explicit/mapping keyword source order are not repaired here.

The bootstrap and stage-zero native adapters also slice argument names without
normalizing positional-only counts. Their metadata copier preserves live
getter descriptors, unlike ordinary binding's value copy. A later repair must
transform that metadata without assigning through a copied getter-only or
nonconfigurable descriptor, and must review the reverse unbound adapter's
inserted self too. Those paths are unchanged; this is not universal signature
normalization.

Annotation dictionary emission, constructor redesign, native exception ABI and
true unwind traceback semantics are separate work.

The first full build revealed one genuine integration regression: extracting a
current stack through keyword binding exposed the new binding helper instead
of the caller. The narrow host-adapter correction recognizes
`_internal_bind_kwargs` and `ρσ_invoke_prepared_keywords` alongside the existing
trampolines, only while no caller frame has been collected and only at the exact
Python/Sage bootstrap filename. Every exception stack and same-named user frame
remains visible. Original coordinates are asserted for Python CLI only; Sage
CLI retains its existing raw/unmapped stack contract and is tested for absence
of leaked trampolines, not invented Python coordinates.

An additional pre-existing `divmod` reflected-method precedence failure was
confirmed on the untouched assembled control and remains unmodified:
`divmod(Base(), Subclass())` incorrectly selected `Base.__divmod__`, while a
subclass alias of the inherited reflected method incorrectly won priority.
The exact control prints `base` / `inherited-right`; CPython requires
`reflected-subclass` / `inherited-left`. The existing runtime-hotpaths assertion
is retained. This is not an accepted incompatibility or a keyword-call repair.

## Qualification and controlled comparison

Before the frozen build, source-protocol checks execute the actual extracted
Python helpers: descriptor flags/freshness, error lookup access traces and
bootstrap fallback, tuple validation, explicit-self/receiver-style keyword
binding, opaque-signature passthrough and full-resolution fallback. Thirteen
CPython 3.14.4 oracles pass, including strengthened saved-method positional-only
cases. Shared bootstrap seven source ABI checks, Ruff formatting and the
package graph pass. These checks do not qualify emitted runtime behavior.

The planned single candidate product build is followed by actual compiler
emission and Python/Sage regression checks, strict typing and applicable
portable/bootstrap suites. Expected inherited oracle failures must be reported
individually, not skipped or relabeled as accepted differences.

For the controlled campaign, derive the exact control compiler and full baselib
from untouched `a58feb416` sources using the existing self-build tool, avoiding
a second product build. Record control/candidate compiler, full baselib and
standalone-output hashes, exact Node 26.7 executable and CPython 3.14.4. Validate
answers before timing. Use the existing driver/probes with fixed keyword-method
100,000-call primary and keyword-function, saved/immediate positional,
descriptor-result, keyword-constructor and exception-heavy controls. Keep
three warmups/seven samples, reversed fresh-process orders, every result and
failure. Control CPU/heap profiling is separate from timing. Reserve a shared
host only after a fresh coordination/idle check. Historical #241/#228 results
are motivation, never this candidate's baseline; no performance claim is made
before the exact comparison.

## Intermediate evidence, not final source qualification

The first build attempt lacked the three pinned grammar submodules and stopped
at frontend bundling; initializing those tracked inputs required no source
change. The unchanged retry passed in 619,236 ms and wrote receipt
`2026-09-12T10:41:58.992Z`. Its complete artifact was copied before the stack
adapter change. That receipt is now stale, not evidence for the corrected source.

After TypeScript recompilation, the real CLI stack oracle and seven scoped
stack/adapter tests pass. The unchanged pyparsing 3.3.2 selected workflow passes
in explicitly unqualified artifact-report mode. The 218-file portable artifact
suite passes. The first 47-case focused run passed 40 cases and failed the six
Python/Sage instances of the three retained oracle gaps plus one stale emitter
expectation. Saved and immediate positional-only cases pass in both runtime
modes. Exact emitter assertions were updated without removing receiver
single-evaluation or native/legacy checks. The broader 105-case run exposed the
inherited `divmod` case and one additional exact-parenthesis expectation; the
latter was corrected and its focused rerun passed. Final source qualification
must use the corrected frozen build, not these intermediate counts.

The exact clean control compiler/baselib was derived in two self-build passes
(122.388 / 121.424 seconds), with hashes:

- compiler: `ecd9c381ace0ab5163688cbae4dc43ff03715f2a003855fc7325b57f32f1126c`;
- full baselib: `7d34b953046758663586b654a6fef50278acfaeb2b493fd71ceb9eef696196a6`;
- minimized `divmod` standalone: `8b91420abd83a59807435fe1367e71096896e7fe564b93ab5f58c2c2f20f4b24`.

The control's 16-case benchmark fixture passes a ten-iteration smoke run under
both CPython and the derived standalone runtime. Its original historical cases
are unchanged; supplemental saved-keyword, descriptor-result,
keyword-constructor and exception-handler controls were added. These are
correctness smoke results, not timing evidence or product qualification.

## Final corrected source qualification

The corrected frozen build passed in 628,079 ms, with receipt timestamp
`2026-09-12T11:07:28.586Z`. Artifact-input/output validation was current for
the checks below. The receipt was preserved before subsequent generated-doc
reconciliation and the necessary task-claim/handoff update. That metadata
change invalidates the local receipt: the checks below are historical evidence
for the exact unchanged runtime, not final-head qualification. No third local
build is claimed; final-head CI must requalify. No runtime source changed after
the frozen build. Local validation used Node 26.8.1;
the planned controlled timing executable remains the separately pinned Node
26.7, not this local build executable.

- Strict checks: 403 modules, zero errors; Ruff formatting current on 903 files.
- Portable artifact suite: all 218 files pass.
- Focused emitted-runtime, source protocol, metaclass and stack checks:
  115 / 116 pass; only the independently reproduced baseline `divmod` assertion
  fails. No assertion was removed or weakened.
- Required keyword oracles plus bootstrap checks: 40 / 46 pass. The six failures
  are Python/Sage instances of duplicate mapping access order, custom attribute
  lookup and sole-star consumption order, all retained as required defects.
- The unchanged pinned pyparsing 3.3.2 selected workflow passes with current
  source qualification, without artifact-report mode. This qualifies only that
  selected workflow, not the complete package manifest or upstream suite.
- The broader compiler suite has 17 passes, 34 skips and 15 failures. All 15
  failures report the absent optional `build/Release/sagejs_flint.node` addon;
  this run is not a complete compiler-suite pass.
- Package graph and narrow task-scope checks pass. Full integration tests and
  four-platform qualification have not been claimed.

Generated reference source coordinates and the website content fingerprint were
reconciled after the build; the direct documentation check and task-scope check
pass on that final metadata state. No Prism assets needed changes.

The exact final candidate artifacts are:

- compiler: `5b7c784c5cf31ee1132d60cd72eeb770ac6b05cc619e6788250dc630bf78dca3`;
- full baselib: `4111c5c2e30bdb3365331c49103c48e3e1e666050537634c8749e35f9092dfd0`;
- sixteen-case standalone: `ae00c29b0ddb0e54791364f49f1f2eab2e4a295736c050216ce66bc0c1a07a34`.

The final standalone passes the same ten-iteration answer smoke checks as the
exact control. Controlled timing and profiling remain pending: no speedup claim
is made here. The `keyword_owned_0`, `keyword_owned_10` and `keyword_owned_100`
cases execute `iterations // 10` calls, unlike the other cases; any per-call
normalization must use that actual count.
