# Selective handled-state wrapping

This followup depends on PR #244 commit
`1beda068edf2b4312efce29543b43ed59055f951`. Its qualified branch is untouched.
The objective is removing ownership wrapping from a narrow, provably
handler-free subset of generators, not reducing exception semantics or
implementing general suspension liveness analysis.

## Proof boundary

An unwrapped generator is safe if it cannot own a handled-state token when it
suspends. This tranche proves the stronger condition that the generator body
cannot own a token at all. A closed CST-node allowlist excludes every try,
with/async-with, class definition, import, string/f-string and unknown node.
Even handlers that provably finish before yield remain wrapped. String literals
are deliberately conservative, including ordinary non-native strings; broader
literal classification is not required for the common numeric-generator case.

Nested function/lambda bodies belong to their own generator decisions and are
excluded from the enclosing scan. Their defaults and other definition-time
expressions, plus surrounding decorators, remain visited. Unknown/raw defaults
therefore cannot obtain an exemption by hiding inside a nested definition.
The existing broad `containsNodeType` generator detector is not reused as this
ownership proof; its separate semantics are unchanged.

Calls do not suspend the calling activation. A synchronous helper restores its
own handled state before returning or throwing. A wrapped child generator
restores its resumer before returning its native yielded result, so an unwrapped
handler-free parent can safely yield from that child. When resumed, an unwrapped
generator observes the current resumer's active state naturally, including when
the resumer changes. It has no saved owned state requiring rebasing.

Plain await and implicit async-for awaits can be exempt because their generated
delegation and StopAsyncIteration handling do not install a Python handled
token in that activation. Async-with is always retained: its exceptional exit
installs a token and can await implicitly even with no explicit body await.
Every catch selector, handler yield, and pending finally suspension is retained
by rejecting the enclosing try node. This does not claim new asyncio, async
generator, foreign iterator, or JavaScript Promise ownership support.

## Representation and emission

`needs_handled_state` is optional AST metadata on function and comprehension
nodes, set by the authoritative frontend's syntax proof. Emission omits the
wrapper only for the literal boolean false. True, absent metadata, old ASTs,
unknown syntax and conservative cases retain the PR #244 mechanism.
Registering the field in the AST schema preserves it through normal AST copies.
There is no runtime helper modification or ordinary-call instrumentation.
The counted core remains 902,749 / 903,000 bytes; no budget changes.

The analyzer visits each selected function body once and stops at rejected
nodes. Nested bodies are analyzed for their own definitions, avoiding repeated
deep scans of their contents from every enclosing scope. The allowlist is an
explicit maintenance contract: new control-flow emission must not be added to
it without verifying the no-owned-token proof.

## Qualification evidence

`test/python-selective-handled-state.cjs` runs the current source classifier
against real parsed CSTs and verifies conservative missing/unknown behavior.
The shared state differential fixture retains all PR #244 assertions and adds
catch-selector suspension, nested defaults/decorators, handler-free delegation,
manual await rebasing and iterator-error restoration.

Private copies of PR #244 dependencies and artifacts were diagnostic seeds only.
The frozen source then completed its own full build in 872,746 ms, with receipt
`2026-09-12T08:44:32.420Z`. Compiler convergence took two passes (36.864 and
55.499 seconds); 94 stdlib and 66 baselib modules were precompiled. Optional
native adapters were absent: this is not full-native qualification. Subsequent
documentation checks reused that exact artifact receipt.

The 121 focused tests pass, including 22 CST-proof tests and nine actual rebuilt
emission tests. All 27 handled-state host tests pass: the 25 Python fixture
cases compare pinned CPython with both Sage.js language modes, followed by
reusable-session and raw-native-next regressions. The legacy compiler generator
fixture also passes. These checks use rebuilt dist/worker artifacts, not an
in-process compiler override.

The initial missing-metadata emission test failed with
`TypeError: compiler.TreeWalker is not a constructor`; the other eight emission
tests passed. This was a harness use of an unavailable API, not an emission
failure. The corrected test verifies the parsed public AST's sole function and
its generator/proof fields before deleting its metadata. Only test source
changed after the frozen build; no runtime rebuild was needed for this repair.

The first recorded full portable run stopped after 132 passing files because
the source-only class metadata harness rejected the new `./handled-state`
dependency. Its explicit loader now compiles the actual analyzer source; the
class assertions and fail-closed behavior for other imports are unchanged.
This second test-only correction also leaves the runtime receipt current.
The corrected complete portable run passes all 210 files. Strict qualification
passes 387 modules with zero errors; Ruff checks 850 files and TypeScript
`--noEmit` passes. These are local Linux results, not four-platform release
qualification. The stacked draft is not main integration or performance-ready;
its parent integration and combined CI remain coordinated separately.

The architecture aggregate retains the two inherited prose audit failures in
`agents/python-property-mutation-followup.md:47` and
`docs/general-class-unit-frontier.md:280` (the word `cowasm`). Package budgets,
native/export/wasm checks preceding that audit pass; algebraic geometry,
optimization engine and current optimizer-opportunity evidence pass separately.
The aggregate is not represented as green, and no assertion or budget changed.
This is not an optimization claim for all generators.

## Local cost observation, not controlled performance evidence

An actual-worker Python-mode proxy compared PR #244 with this candidate in
A/B then B/A order, with two warmups and five retained samples per operation.
The shared host was busy with other work, so even ordinary-call medians varied
from 15.29 to 25.17 ms. These are diagnostic observations, not a qualified
speedup, throughput, startup, or no-regression claim.

Creating and retaining 5,000 plain numeric generators took median 162.15 ms
(baseline) versus 61.33 ms (selective) in A/B order, and 136.78 versus 94.14 ms
in reverse order. Resuming a generator 50,000 times took 267.49 versus 77.89 ms,
then 90.90 versus 90.85 ms, demonstrating why these loaded-host timings cannot
establish a resume speedup. The measured no-error try/except and try/finally
proxies likewise do not justify a performance claim. A coordinated remote
campaign remains required. The structural result is narrower and tested:
proved handler-free emitted generators no longer allocate ownership wrappers;
owned/unknown generators still use the unchanged PR #244 mechanism.

The subsequent reserved-host standalone campaign is retained in
`agents/validation/python-handled-state/README.md` and `results.json`, with a
reproduction driver and ordinary Python fixture. Exact #244/#249 A/B/B/A
processes under Node 26.7.0 show 40.5%/40.0% lower plain-creation medians on the
fixed 20,000-generator case. This is not a pre-ownership recovery comparison or
full-package result. Owned-creation medians are higher with wide tails, so the
campaign explicitly does not claim blanket no-regression or readiness. The
earlier loaded-host observations above remain unqualified historical evidence.
The separately reviewed fresh-process-per-creation-case followup repeats the
plain gain (40.2%/40.7%); owned medians vary -1.3%/+3.7% without the earlier
candidate-only tail excess. This supports phase sensitivity, not erasure of the
original mixed results or proof of a particular GC explanation. Both complete
raw datasets and drivers are retained; no runtime code was changed afterward.

## Required open defect discovered during diagnostics

`test/fixtures/python-nested-yield-default-open.py` retains the full CPython
oracle for a preexisting PR #244 defect: a yield in a nested function's default
expression makes the nested function itself a generator incorrectly. The
second value is a generator object instead of 42. No decorator is needed.
`lowerFunction` determines `is_generator` by visiting the whole definition,
including defaults; its nested-definition exclusion also misses those defaults
when determining the enclosing function's generator status. This requires a
separate repair, not an ownership exemption or accepted compatibility change.

The full open fixture is intentionally not represented as a passing required
test. The ownership fixture separately asserts exception identity across the
default and decorator suspensions without invoking the misclassified inner
function. The original final-value assertion remains in the tracked open
fixture and must pass when the distinct defect is repaired.
