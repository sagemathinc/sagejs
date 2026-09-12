# Handled-exception ownership

This state-only change depends explicitly on the shared bootstrap prerequisite
PR #231, commit `0f62af751f3d0b8c63adc37dec4acb2d9240d0d9`.
Its validation-only source-freeze followup `cd4d959cf` is cherry-picked as
`b380c38a1`; no runtime source changes accompany that receipt correction.
It does not incorporate or modify the separate source-map foundation PR #227.

## Contract

An exception handler installs the normalized exception identity for its dynamic
extent and restores its parent on every exit. Bare `raise` resolves that dynamic
identity, including through a called helper. Unmatched handlers, pending
exceptions during `finally`, and exceptional context-manager exit calls also
restore ownership. Explicit `raise error` retains the existing normalization
and throw behavior; this change does not implement exception chaining or a
Python unwind traceback.

The existing private `__sagejs_last_exception__` name becomes a read-only
accessor, so `sys.exception()` and the exception-value part of `sys.exc_info()`
observe current state across lexical module boundaries. All source emission of
writes to that property is removed. The separate lexical `ρσ_last_exception`
binding and its low-level consumers are retained; it is not the new ownership
stack. `sys.exc_info()` still has no genuine Python traceback value.

## Continuations

Each compiler-produced native generator owns a transparent resume root and a
saved top pointer. Handler nodes contain `{error, parent}`; the root contains
only `{parent}`. At each `next`, native `throw`, or native `return`, the root
rebases onto the current caller, and execution switches to the saved top.
Suspension saves that top, disconnects the root from the caller, and restores
the caller. Completion or an escaping exception discards saved handler nodes.
A generator without an owned handler therefore inherits its current resumer,
not its creator or a previous resumer.

Native wrapper methods are shared by original native-method identity and find
the actual receiver's state in a WeakMap. A separate WeakMap caches an adapter
prototype for each original generator prototype, preserving the original chain
and keeping resume methods inherited. This matters because Python attribute
lookup binds inherited host methods, but correctly leaves own function-valued
attributes unbound. Unknown receivers and reentrant calls
go directly to the original native method, preserving its validation and
reentrancy rejection. A native `return` that yields in `finally` returns
`done: false` and retains ownership until genuinely completed.

Wrapping occurs before saving `__native_throw__` and before exposing Python
protocol adapters. Native `{value, done}` results remain native results;
Python StopIteration conversion happens after the resume wrapper's `finally`
has restored the caller. Existing send, throw, close, and delegation adapters
keep their protocol responsibilities.

Both ordinary generator functions and generator comprehensions are covered.
Current async functions are lowered onto this same native generator protocol;
manual send/throw/close and existing await delegation receive the same ownership
switch. This is not an asyncio scheduler, native JavaScript Promise-context
propagation, task cancellation implementation, or a claim of complete async
language compatibility. Raw foreign iterators are not registered or modified.

## Realm ownership

The accessor closes over one runtime's state. Node compiler instances run in
fresh `vm.Context` realms, including the compiler lazily created by dynamic
code, so compiler initialization cannot replace an active runtime's accessor.
Public reusable sessions own separate workers; each kernel and multiprocessing
worker initializes one evaluator. The browser compiler is in its own nested
worker, and browser kernel initialization rejects a second initialization.
The pytest import retry closes its failed direct evaluator before replacing it.
Arbitrary concurrent direct evaluators sharing one JavaScript global are not
isolated by this helper and are not claimed safe; replacing a bootstrap in that
global must not be used to keep old live Python continuations.

## Bootstrap, ownership, and cost

The entire helper is counted in the existing core-owned `bootstrap_shared.py`
host-boundary module. It initializes without Python calls or imports before
builtins; the RuntimeError constructor is looked up only on a later failed bare
raise. No lazy first-exception import or compiler bootstrap recursion is added.
The immutable stage-zero compiler does not contain the removed global writer;
the converged emitter owns all new writes and reads. A complete build is needed
to qualify this ordering and replace old generated modules and cache identities.

Ordinary function entry and ordinary calls receive no state instrumentation.
Each handled entry allocates one node; each generator creation allocates a root
and state record, selects a cached adapter prototype, and each native resume saves
and restores ownership pointers. The three WeakMaps are eager; iterator state is
weakly owned and disconnected from the caller while suspended. This is not a
zero-cost claim: handler, resume, startup, emitted-size, and memory costs need
separate observations after the frozen build.

The corrected source graph is 902,749 / 903,000 core bytes, an increase
of 2,768 bytes over PR #231 with 251 bytes of reserve. No source budgets change.
Emitter code remains in its normal compiler source modules; the runtime helper
is not hidden in generated strings outside core accounting.

## Qualification

The native helper is exercised directly from its actual source in
`test/handled-state-native.cjs`, separately from full bootstrap qualification.
The ordinary Python differential fixture is
`test/fixtures/python-handled-state.py`; its host test compares each case with
CPython and then executes Python and Sage modes. It checks identities and state,
not traceback text or chaining. Assertions include outside-state restoration,
nested handlers and helper reraises, finally/return/loop exits, context exits,
alternating generator callers, reentrancy, throw completion, close/finally
suspension, delegation, comprehensions, and manual coroutine boundaries.

The corrected frozen build completed in 10m53 on Node 26.8.1 linux-x64, converging
in two compiler passes (27.441s and 50.034s). Receipt
`2026-09-12T08:03:23.651Z` covers the rebuilt compiler, task runtime, 94 standard
library modules, and 66 baselib dependencies. The diagnostic seeds were private
copies of PR #231 artifacts/dependencies; they are not qualification evidence.
An interrupted corrected build left no receipt and was restarted using the
unmodified build tool rather than inventing a partial-build receipt.

Passed on the corrected artifacts:

- Twenty CPython 3.14.4 differential cases, each also executed in Python and Sage
  modes through the actual rebuilt kernel workers, plus interleaved reusable
  sessions and direct/extracted native-next binding: 22 host tests.
- The legacy `compiler/generators.py` fixture, including its raw `.next()` ABI.
- Ninety focused CST, bootstrap, generator, receiver, source-boundary, and
  browser-frontend checks.
- All 208 portable test files, in 2m13.
- Strict Python checks: 387 modules, zero errors; Ruff and TypeScript no-emit.
- Package graph, documentation generation checks, and build-receipt reuse.
- FFI, native boundaries, numerical surface/browser closure, Wasm capability,
  workload and lifetime audits; optimizer metadata regeneration and verification;
  algebraic-geometry boundaries and 34 optimization-engine tests.

Full `architecture:check` is **not green**: the inherited dependency audit still
rejects the historical documentation references at
`agents/python-property-mutation-followup.md:47` and
`docs/general-class-unit-frontier.md:280`. This same failure was reproduced on
the unchanged PR #231 baseline; no audit or unrelated documentation was weakened.
All phases following that failure were run separately and passed.

The rebuilt compiler, full baselib, task runtime and 157 precompiled cache JSON
files were checked for obsolete global exception-state assignments. None
remain. The final compiler SHA-256 is
`dc7b55222b17a80c365d6255ff4646982106ba7b447354682ad72285b23f8f67`.

The first candidate completed a full build and passed the twenty Python/Sage
differential cases and 208 portable files, but an additional legacy
`compiler/generators.py` check exposed the own-property receiver regression.
That candidate is not qualified for promotion. The inherited prototype adapter
correction adds direct/extracted native-next coverage and requires a fresh
build and rerun; earlier passing checks do not qualify the corrected artifacts.

The helper wraps fresh compiler-created native generators, before public
protocol adapters are installed. It reads next/throw/return in that order on
the first generator for each original prototype; subsequent generators reuse
the adapter. Mutating native generator prototypes from foreign JavaScript after
wrapping is not a supported Python operation and is not made live by this
snapshotting adapter. Raw unregistered iterators remain untouched.

## Cost observation, not a speedup claim

The final emitted compiler grows by 15,798 bytes, full pretty baselib by 56,349
bytes, and task runtime by 82,785 bytes versus the PR #231 artifact receipt
`2026-09-12T06:11:57.372Z`. These are uncompressed source-file sizes, not a
startup or compressed payload equivalence claim.

After owned tests and evidence generation finished, a local Python-mode kernel
probe ran baseline/candidate and then candidate/baseline. Each process used two
warmups and five measured samples with result assertions. This was not a
reserved idle host, allocation attribution, cold-start qualification, or a
CPython throughput comparison. The following are medians in milliseconds for
each order, not combined confidence estimates:

| Workload | Baseline A/B | Candidate A/B | Baseline B/A | Candidate B/A |
| --- | ---: | ---: | ---: | ---: |
| 50,000 ordinary calls | 14.77 | 14.64 | 14.63 | 14.50 |
| 50,000 no-error try/except calls | 15.26 | 15.06 | 15.15 | 15.20 |
| 50,000 no-error try/finally calls | 15.27 | 14.17 | 14.89 | 14.83 |
| Create and retain 5,000 generators | 55.48 | 87.65 | 48.53 | 97.20 |
| 50,000 next() resumes | 59.79 | 66.71 | 61.13 | 65.79 |

Creation is approximately 1.58–2.00 times baseline and resume is approximately
1.08–1.12 times baseline in this probe. The existing emitter creates a nested
`js_generator` function per Python generator call, so original prototypes are
often distinct and adapter caching does not amortize their allocation across
calls. Three WeakMaps, an adapter prototype, per-generator ownership records,
and `Object.setPrototypeOf` are real costs. Ordinary-call emission is unchanged;
these observations do not establish zero overhead or a performance improvement.
