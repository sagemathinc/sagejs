# Prepared keyword calls: pre-implementation contract

Initial base: main `ce40da941`. Current scope is tests and this design only.
Do not edit `src/baselib/builtins.py`, `src/output/functions.py`, or
`src/baselib/internal.py` until their current owners freeze and the integration
lane authorizes those claims. No candidate runtime build or performance result
is implied by this checkpoint.

## Bounded mechanism

Immediate positional Python method calls already use
`ρσ_prepare_method_call`: lookup captures a per-call context before evaluating
arguments, avoiding observable bound-method materialization for a known
ordinary descriptor. Keyword calls currently perform ordinary attribute lookup
and allocate/copy a bound method before interpolation.

Proposed changes after authorization:

1. In `src/output/functions.py`, only the existing authoritative
   `resolved_python_attribute` predicate with `has_kwargs` selects a new
   prepared-keyword invocation, initially without starred positional arguments.
   Starred combinations retain required oracles but need a separate ordering
   repair before inclusion. Reuse existing argument/keyword emission exactly;
   no rewrite of merge order, native exemptions or constructor lowering.
2. Reuse unchanged `ρσ_prepare_method_call` and its existing three-field
   context. Only `context[1] !== undefined` proves the fast descriptor path.
   If field 2 is true, prepend the captured Python receiver to the argument
   vector and bind with undefined host receiver. Otherwise bind with the
   captured receiver-style host receiver. No new function-name heuristic,
   signature cache, or persistent receiver cache is needed.
3. Factor the binding-only tail of `ρσ_interpolate_kwargs` in
   `src/baselib/internal.py`, after all callable/class/raw-receiver resolution,
   into one private helper. Both the original public entry point and prepared
   known-descriptor path share that tail; do not duplicate the binder or delete
   its validation. Keep signature reads live, positional-only handling,
   duplicate checks, keyword packet consumption and opaque-signature
   passthrough unchanged.
4. Contexts containing only a target retain the full original
   `ρσ_interpolate_kwargs(undefined, target, args)` path. This covers instance
   dictionary functions, descriptor results, custom lookup, classes and unknown
   callables. Classmethod handling currently falls back through ordinary
   binding too; do not broaden the prepared lookup in this tranche.

Proposed consumer pseudocode (not an implemented ABI):

```python
def invoke_prepared_keywords(context, args):
    target, receiver, explicit_self = context
    if receiver is runtime.undefined:
        return interpolate_kwargs(runtime.undefined, target, args)
    if explicit_self:
        args.unshift(receiver)
        receiver = runtime.undefined
    return bind_keyword_tail(receiver, target, args)
```

The new consumer can live beside the binder in `internal.py`; reusing the
existing preparation helper need not modify `builtins.py` at all. Verify normal
core export/bootstrap wiring and count any required ABI glue before adopting
this placement. Do not silently fall back to a mutable global callback.

The prepared record belongs to one invocation, so nested argument calls cannot
overwrite it. Lookup precedes argument evaluation; callability and binding
follow argument/keyword expansion. Explicit-self insertion precedes binding
against the original signature, preserving duplicate-self and positional-only
self rules. Ordinary attribute reads and saved bound methods remain unchanged.
Existing positional prepared calls, direct/name calls, legacy calls,
constructors and raw internal receivers retain their implementations.

Candidate assembly must explicitly include/review #238 if it is not yet merged
(overlapping call emitter/evaluation-order changes), and #247 if not merged
(shared adapter metadata/source-budget prerequisite). Include the integration
lane's combined ownership foundation rather than replacing its `functions.py`.
The reported combined source census is 902,078 / 903,000 bytes: measure the
actual merged delta before building; no budget increase or uncounted emitter
helper is permitted. Extraction reduces duplication, but helper/glue size and
ordinary keyword-function overhead still require measurement.

## Oracle matrix

`test/fixtures/prepared-keyword-calls.py` contains independent ordinary CPython
assertions; `test/python-prepared-keyword-calls.cjs` runs each case on CPython
and, when exact own artifacts exist, on Python/Sage sessions. A CPython-only
test selection does not borrow another checkout's runtime.

| Case | Required observation |
| --- | --- |
| Property receiver and argument-time class mutation | Lookup once; captured old target executes |
| Saved methods and metadata identity | `__self__`, `__func__`, distinct reads and saved old body remain correct |
| Instance-owned/descriptor-returned function | No additional implicit receiver |
| Noncallable descriptor plus mapping | `get`, `keys`, item read, then callability error |
| Duplicate explicit/mapping keyword | Duplicate rejected before mapping item read and invocation |
| Throwing argument to noncallable | Original argument exception wins |
| Inherited/class/static/unbound methods | Correct receivers and positional-only rejection |
| Defaults mutated by argument expansion | New defaults apply to the captured function |
| Duplicate binding versus body TypeError | Binding never enters body; body exception identity retained |
| Reentrant custom `__getattribute__` | Both ordered lookups and nested calls remain independent |
| Starred positional plus keyword argument | Lookup, star expression, keyword evaluation, star consumption, body |
| Multiple stars and intervening positional items | Each star consumed eagerly before the later positional/keyword expression |
| Explicit/receiver-style self | Positional-only self can coexist with keyword `self`; ordinary self cannot |

Also rerun existing prepared-method, namespace-interaction, resolved-keyword,
live-default, callable-slot, constructor and native ABI suites. Add actual
emission checks after authorization: fast keyword calls must use a prepared
context, while name/saved/native/legacy/constructor paths keep their prior
shapes. Do not turn baseline failures into skips or alter error assertions to
qualify an optimization.

Initial CPython execution rejected the newly written starred-order expectation:
the starred expression is evaluated before the keyword expression, but the
iterable is consumed afterward in this call shape. The corrected new assertion
records both events separately. Current-main runtime execution must check this
precise order before any optimization: eager `unpack_asarray` emission would
be a required baseline defect, not grounds to weaken the oracle.

CPython 3.14.4 disassembly confirms the distinction: a sole starred vector is
passed to `CALL_FUNCTION_EX` without preceding `LIST_EXTEND`; multiple stars,
prefix positional and suffix positional forms use `LIST_EXTEND` (plus
`LIST_APPEND` for the suffix) and consume stars earlier. A keyword written
textually before the sole star still evaluates the star expression first and
consumes its iterable after keyword evaluation. Do not impose one consumption
order on all call shapes.

## Baseline profile prerequisite

Historical controlled reports motivate this investigation only. PR228 measured
100,000 keyword-function calls near 291 ms and keyword-method calls near
582–587 ms; PR234 removed owned-callback field-count scaling without a
consistent ordinary bound-keyword gain. The old `keyword_method.cpuprofile`
contains prominent bound-method finishing and descriptor binding, but it is
not a fresh-main profile or a candidate speedup prediction.

Before runtime edits, profile the exact assembled current-main control with
the existing driver/probes from `/tmp/python-call-profile.vDw3Fr/`, keeping
profiles separate from timings. Retained SHA256 values:

- `probes.py`: `2717af5d907a7a392275941dce65b86bb241d2a2c9c85c242df1c7be35c04f28`
- `profile.cjs`: `cf6403c42010e7dfa9c318632dc1a532822af201936bc75cd706afb0fd25360e`
- `campaign.cjs`: `b6de840940881f78867c92e9386f72fea777e3442906b9142006b01b63e522b1`
- historical `standalone-host.cjs`: `44c30afc74422b06ca64f064f7946830751c28fc2ef490355ad7c9b94b2bb8c7`

The local profile directory lacks its nested standalone-host copy, but the
fresh main checkout's `bench/cowasm/standalone-host.cjs` matches the recorded
SHA256 exactly and can supply that file when staging. No host is reserved yet.
Reserve only after fresh Discussion/idle checks and exact control artifacts
are ready. Keep counts, correctness checks, warmups/seven samples and reversed
fresh-process orders; preserve every failure and sample. Record actual
compiler/baselib/output/Node identities, startup exclusion and heap/profile
scope. No package-wide, construction, pre-ownership recovery, or cliff-closure
claim follows from this bounded method-call probe.

## Read-only diagnostic artifact and current status

All 13 independent CPython 3.14.4 cases pass. No own runtime build exists yet.
For inherited-behavior diagnosis only, the integration lane authorized the
qualified #241 artifact at `419a10fb1f34c6ade3fa41061fd6143bfe51f875`, whose
compiler SHA256 is
`50c9f153a9543f8ecad694ebae8c618d40c23e4e9c4b085c58a7b07a772be666`.
Git comparison confirms `output/functions.py`, `tools/python/lowerer.ts`, and
`baselib/internal.py` are byte-identical to base main `ce40da941`; the only
builtins change is its independent module-name resolver.

The unchanged sole-star oracle fails on that artifact in Python and Sage.
A separately instrumented diagnostic prints `lookup, star-expression, iterate,
keyword, body`, whereas CPython requires the keyword event before iteration.
This is an inherited required ordering failure on the exact #241 candidate,
not a bare-main execution receipt and not an accepted incompatibility. No
artifact or source in the qualified worktree was edited. Initial fast-path
scope excludes starred positional calls while retaining their full oracle.

The complete read-only #241 matrix passes nine cases and fails four in each
language mode (Python and Sage); this is not represented as green:

| Required baseline failure | Observed result / initial diagnosis |
| --- | --- |
| Sole-star consumption order | Iterable consumed before keyword expression; multiple-star/prefix/suffix cases pass |
| Duplicate explicit keyword plus mapping | Mapping item getter executes before duplicate rejection, triggering the oracle's AssertionError |
| Custom `__getattribute__` | Both expected custom lookup events are absent; only nested body events `[3, 3]` remain |
| Assigned explicit-self function with positional-only self | `c.f(value=3, self=4)` reports missing `value`; equivalent compiler receiver-style method passes |

For the last case, `_builtins_bind_python_function` slices `__argnames__` after
binding explicit self but leaves copied numeric `__positional_only__` unchanged.
That is a concrete source-level explanation to investigate, not authorization
to patch it during this test-only phase. The custom-lookup fallback likewise
needs a separately reviewed correctness boundary; merely withholding prepared
context does not itself invoke a user override. Keyword-source ordering must
be preserved before binder execution, not compensated by a faster binder.
Do not move these failures into deliberate differences or silently omit them
from the required matrix to qualify a speedup. Core-edit authorization and
disposition of these prerequisites remain with the integration lane.

## Separate minimized defects and proposed repair scopes

The four ordinary CPython programs under
`test/fixtures/prepared-keyword-open/` retain the required failures independently
of the proposed optimization. Exact #241 diagnostic results are:

- `duplicate-mapping.py`: CPython records only `keys`; runtime records `keys,
  item`. Actual emitted `ρσ_desugar_kwargs` input is `[mapping, {value: 1}]`,
  despite the explicit keyword preceding the mapping in source. `lowerCall`
  separates `.kwargs` from `.kwarg_items`, and `print_kwargs` emits all mapping
  sources first. The helper itself checks duplicates before item reads; do not
  rewrite that correct check. A separate ordered-keyword-segment representation
  and incremental merge emission must preserve evaluation *and* mapping
  consumption before evaluating later segments, not merely reorder an eagerly
  evaluated array of sources.
- `sole-star.py`: CPython records `keyword, iterate`; runtime reverses them.
  Repair only the sole-star consumption point using captured expression values;
  retain earlier eager expansion for multiple-star/positional-list forms.
  This is independent of prepared method lookup.
- `positional-only-self.py`: immediate/saved/unbound results are `[3, 3, 3]`
  on CPython versus `[TypeError, TypeError, 3]` on runtime. Binding removes the
  first argument name without shifting its numeric positional-only boundary.
  A narrow correctness repair must cover saved bound adapters as well as the
  new immediate path, retain boolean all-positional metadata, and audit native
  adapter signature slicing (`bootstrap_shared.py` and compiler stage-zero
  adapter) before claiming the full binding boundary. Constructor emission
  already adjusts its explicit-self positional-only boundary independently.
- `getattribute.py`: direct read/public `getattr`/explicit base lookup/
  positional call/keyword call respectively produce `(1, []), (1, []),
  (TypeError, []), (3, []), (3, [])`. CPython honors the inherited hook for
  every normal form and bypasses it only for `object.__getattribute__`.
  This is a general lookup gap, not a keyword bypass. Repair requires a real
  default object primitive that bypasses both custom `__getattribute__` and
  `__getattr__`, plus outer normal lookup dispatch and AttributeError fallback.
  Reuse existing descriptor epoch/cache ownership for hook resolution; do not
  add recursion or an uncached type/MRO scan to every attribute access.

The lookup and ordered expansion repairs are independent scopes, not additions
to this performance PR. Initial prepared optimization claims only correct
ordinary lookup cases; unrelated failures stay required. Shared packet-loop
refactoring is only a budget proposal, not authorized implementation here:
strict and legacy validation/metadata/argument mutation differ, and legacy
still uses Python `max` on native lengths. The separate call-cost review owns
profiling that fact. Do not silently change legacy behavior to fund a helper.

The current all-open source projection leaves only 39 bytes (902,961/903,000).
Prepared consumer, shared binder-tail extraction and binding correctness need
an actual overlap-aware size estimate with #238/#247/#264 and current main
before core edits. Genuine duplicated mechanism reduction is required if they
do not fit; no ceiling increase, comment removal or hidden emitted helper.
