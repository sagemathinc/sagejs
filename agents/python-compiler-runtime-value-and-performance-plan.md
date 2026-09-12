# Plan: a high-value Python compiler and runtime for Sage.js

Revision: 2026-09-10. This revision replaces the earlier phase ordering, not its
correctness, safety, provenance, performance, or portability requirements.

## Executive decision

Make Sage.js a Python implementation that people and agents can confidently use
for mathematics, teaching, automation, and substantial pure-Python programs.
The objective is **useful programs that compose correctly and run efficiently**,
not a CPython pass percentage or a growing collection of compatibility shims.

The next bottleneck is no longer finding test suites. We have a usable
compatibility runner, reviewed upstream cases, package probes, performance
workloads, and concrete runtime defects. Spend most implementation effort
turning that evidence into improvements. Extend infrastructure when a selected
workflow needs it or an evidence/safety defect makes it necessary.

The strategic unit of work is a **shared semantic mechanism**, not an upstream
repository, a single failing assertion, or a package import. For example,
correct method lookup can repair decorators, descriptors, callable instances,
class mutation, and package behavior while removing repeated dispatch costs.
Conversely, a locally faster cache is a regression if it returns a stale method.

This program has four inseparable outcomes:

1. **Trust:** ordinary Python means what a programmer expects; unsupported
   behavior is distinguishable from a plausible wrong answer.
2. **Leverage:** general runtime and stdlib improvements unlock unmodified
   packages and useful agent/user workflows.
3. **Speed:** correct programs do not encounter avoidable startup, import,
   dispatch, allocation, or scaling cliffs.
4. **Lightness:** test machinery and optional packages do not become mandatory
   startup or distribution weight.

Use the project's greenfield freedom to correct internal representations and
remove accidental designs. Preserve Python/Sage semantics and documented
external formats, not accidental JavaScript implementation details. A stronger
implementation capability justifies investigating deeper causes; it does not
replace or weaken experimental evidence.

## Public contract: Python, not CPython

The language target remains portable, public **Python 3.14** behavior. The
currently executed reference in this work is **CPython 3.14.4**. Source-suite
versions and executable-oracle versions are separate identities. Do not change
the oracle opportunistically while repairing a language defect.

Suggested public wording:

> Sage.js is an independent implementation of Python for mathematical computing
> on JavaScript and WebAssembly. It compiles Python to JavaScript; CPython is a
> compatibility reference, not its runtime. It targets Python 3.14's portable,
> user-visible behavior, with tested support for selected standard-library and
> pure-Python package workflows. It does not provide CPython's C-extension ABI,
> bytecode, reference-counting behavior, or every operating-system facility.
> Supported capabilities and intentional differences are documented.

Compact version:

> Independent Python 3.14 implementation on JavaScript/WebAssembly.
> See tested package support and documented differences; no CPython runtime or C ABI.

Do not say "100% Python compatible," imply all pure-Python packages work, or
equate successful imports with package support. A `py3-none-any` wheel is an
eligible packaging format, not proof that its Python features or host needs
are supported. Reject incompatible CPython/native wheel tags explicitly.

CPython bytecode, refcounts, private C APIs, memory layouts, GIL details, and
implementation-specific GC scheduling are not goals. Common descriptors,
exceptions, scopes, calls, containers, and mutation semantics are not optional
merely because Sage.js is independent. Sage-mode mathematical syntax/types must
not leak into Python mode.

## Evidence checkpoint and integration reality

This is a dated checkpoint, not a live dashboard or a new qualification receipt.
Reconcile it against source, artifacts, PR bases, and current tests before coding.

- Delivered work includes upstream language selections, package probes, live
  constructor binding, callable/descriptor repairs, implementation identity,
  concise CLI diagnostics, build feedback improvements, and initial slicing
  and dictionary optimizations. Consult the actual commits and receipts;
  closed PRs may have been integrated through a different PR.
- The development stack's manifest combines **508 MicroPython output programs
  and 28 assertion programs** from RustPython, PyPy, GraalPy, IronPython, and
  CPython. Its recorded full run had **522 passes, three reviewed differences,
  and 11 required failures**; it was explicitly not fully qualified.
  See `agents/python-manifest-output-migration.md` and
  `agents/python-live-conformance-repairs.md` on that stack.
- The same historical package checkpoint passed **8/11 workflows plus seven
  selected Tomli tests**. pyparsing execution, IDNA stderr, and mpmath cold
  timeout remained open. These are first observations, not necessarily the
  defects or totals on today's main.
- PRs #192 and #194 are merged **into their stacked bases**, respectively
  `python-keyword-binding-data-path` and `python-runtime-conformance-repairs`.
  A fresh fetch and GitHub's main API both identify `89e6fcfb2`. At that revision,
  #192's commit `bc5aee2f0` is not an ancestor, its new
  `tools/python-compat/output-baseline.cjs` file is absent, and the runner still
  contains inline baseline comparisons. The corpus README also describes the
  earlier assertion-only runner. Check both ancestry and actual changes when
  squashes/cherry-picks are possible; "PR merged" alone does not establish main
  integration, combined-stack correctness, or released availability.
- The current workspace contains uncommitted canonical type-ownership work.
  It has recorded focused checks and local before/after measurements, but is
  not a main-qualified change. Preserve it before integration. Do not reuse
  vanished temporary reports or historical validation as fresh evidence.
- The RustPython inventory reviewed all 221 recorded files, but these are not
  221 independently passing programs: discovery excludes an expected-failure
  file and includes helper/fixture files. The inventory records 213 non-helper
  candidates, 32 settled record dispositions, and 179 backlog recommendations.
  Full-source review is not adoption, execution, or a settled product decision.
- The initial measured slicing/dictionary gains and later truth/type probes
  are useful leads. Historical comparisons were provisional; independent
  confirmation and remaining CPython-relative cliffs are still work.

**2026-09-11 integration update:** #208 integrated the isolated #192/#194 harness
changes into main at `d654e3d45`, without their draft runtime ancestors. Fresh
main qualification records 518 passes, three reviewed outcomes, and fifteen
required assertion failures across 536 cases. All original/extracted/manifest
raw outcomes match; four-platform routine/smoke CI passed. This supersedes the
main-integration observation above, not the historical stack's distinct results.
The canonical type-ownership slice is now being qualified directly on that
main baseline; see `agents/python-canonical-instance-type.md`. The preserved
original worktree and the remaining draft stack are not thereby qualified.

**2026-09-11 adopted-failure campaign checkpoint:** the clean combined stack at
`5b7f4ddc5` passes the unchanged 536-case corpus: 533 passes, three reviewed
differences and zero required failures. Four pinned package workflows and the
focused cross-feature checks also pass. This closes the original fifteen
required failures on that candidate, not on main and not across all upstream
tests. PR214 is non-draft with successful routine/Chromium CI; PR216 remains
draft pending combined qualification and its cold-import correction.

The controlled campaign demonstrates common-call/construction improvements of
1.23–1.88x, but warm packaging remains about 228x CPython and cold packaging is
26% slower than the retained baseline. Treat these as open performance cliffs,
not completed M5 gates. Profiles identify duplicated prepared/legacy class
method emission as the main added cold cost. Correct that shared mechanism and
repeat paired measurements before broadening adoption. The private compiler
artifact has a separately focused-tested size correction; it does not establish
that the cold regression is fixed. Exact candidates, receipts and remaining
qualification work are recorded in `agents/python-object-call-protocols.md`.

**Subsequent shared-emission checkpoint:** `c99e6067a` preserves the 533/3/0
corpus result and four package workflows. Direct pairing with the previous
candidate reduces packaging cold time 17.0% and first-import time 19.7%, while
retaining common-call gains. The original-baseline cold/import gaps are now
about 5%, not zero; warm packaging remains about 228x CPython. The compiled-size
gate is repaired. All portable checks pass after the test-only `c40561c4e`, but
startup remains over its unchanged 400 ms gate (409.7 ms, then 400.2 ms).
PR216 remains draft. Reliable startup headroom and a passing complete routine
are the next readiness work; do not hide this behind the successful semantic
and package campaign or expand adoption before resolving it.

**Readiness update:** `4d8909d33` defers capability-catalogue loading until first
query and passes the complete routine, including the unchanged startup gate,
plus a fresh 533/3/0 corpus and four package workflows. PR216 is ready for
non-draft CI/integration review. The prior failed runs and all remaining
CPython-relative cliffs stay recorded; this does not complete the broader plan.

Existing assets to reuse:

- `scripts/audit-python-grammar.cjs`
- `scripts/run-python-conformance.cjs`
- `scripts/run-python-compat.cjs` and `upstream-tests/python-compat/`
- `scripts/run-pure-python-packages.cjs`, package phase/suite helpers, and
  `upstream-tests/python-packages/`
- `bench/python-compat/` and the legacy workloads linked from its README
- compiler/runtime focused tests, build receipts, package/source budgets,
  startup gates, and the existing optimizer-development tooling

Do not rebuild these systems from scratch or maintain a second dashboard.
Repair stale summaries as part of consolidation; retain historical evidence
with its exact scope and identities.

## Bounded product scope

The program must be finishable without pretending that all of Python is
implemented. Freeze an initial **qualification tranche** in repository metadata
during consolidation. It names exact workflows, cases, package versions and
test selections, targets, budgets, and open blockers.

The tranche must include existing required cases and high-value regressions
already found. It cannot erase a required failure by shrinking the denominator.
Broader source inventories remain selection pools, not implicit adoption of
every file. New discoveries get an explicit disposition; a newly discovered
P0/P1 defect in a required workflow blocks that workflow even if absent from an
upstream suite. Unrelated breadth goes into a visible next-tranche backlog.

Separate four states:

- reviewed candidate;
- adopted and required, possibly still failing;
- implemented with scoped evidence;
- qualified on named targets at a named revision.

Record implementation, merge, and release state separately. No single checkbox
or percentage can represent these distinctions.

### Initial workflow contracts

The exact versions and bounded test IDs belong in the qualification manifest.
These workflow families are mandatory selection anchors, not claims of current
support or permission to bundle the named packages.

| Family | Observable success | Important stress |
| --- | --- | --- |
| Agent project | Install an eligible pure-Python wheel, import a multi-file project, transform JSON/CSV using containers, dataclasses and paths, then run selected pytest/unittest tests | Names, imports, calls, errors, filesystem profile |
| Decorated object model | Use decorators, signatures/defaults, properties, inheritance, `super`, and traitlets; mutate a class/default and observe the documented new behavior | Binding, identity, descriptors, cache validity |
| Interactive mathematics | Import traitlets/ipywidgets; create an interact, update it repeatedly, render symbolic/plot output, reset and rerun | Persistent globals, callback capture, binary/display transport, lifecycle |
| Pure-Python ecosystem | Execute the existing eleven pinned public workflows and expand selected Tomli plus foundation package suites | Not just import success; meaningful answers and failure paths |
| Mathematical throughput | Execute bounded mpmath and existing Sage symbolic/matrix workloads with checked answers | Import/first/warm time, dispatch, exactness, memory |
| Failure and recovery | Trigger nested source/import/callback errors, inspect structured diagnostics, then successfully continue in the same session | Python frames, causes/context, state restoration |

Use the production app evaluator for browser contracts and the real kernel path
for Jupyter contracts. A Node simulation does not qualify either frontend.
Cross-cell and reset behavior belong in these tests because the shipped product
is interactive, not merely a batch Python runner.

Grow SymPy, NetworkX, Click, Jinja2, Rich, and other package selections only when
they add a concrete workflow or independently stress a weak mechanism. Native
CPython cores without an honest portable path are not candidates for name-based
stubs. Async/generator semantics needed by selected workflows are in scope;
a complete event-loop/OS ecosystem is a separately reviewed expansion.

## Priority and operating model

Choose work by this order:

1. Silent wrong answers, state corruption, stale caches, hangs, and
   cross-session contamination.
2. Common agent, teaching, package-foundation, and mathematical operations.
3. Root causes with several downstream beneficiaries.
4. Measured latency/throughput/scaling cliffs in those workflows.
5. Additional ecosystem depth.
6. Rare presentation fidelity and implementation-internal behavior.

P0 means correctness/trust; P1 means broad usability or a required-workflow
cliff; P2 means coherent ecosystem depth; P3 means optional fidelity.
Exception type, source location, cause, and useful message are P1. Incidental
CPython punctuation is usually P3; exact formatting is important when a public
format, serializer, or program consumes it.

Keep a compact blocker graph: mechanism -> cases -> modules/packages ->
workflows. Do not build a graph service; checked metadata and a generated view
are sufficient. When causality is uncertain, label a suspected edge rather than
claiming one passing smoke test proves a package was unblocked.

### A milestone is an executable experiment

Before implementing, write a short dossier with:

- the user-visible failure/cost and the smallest reproducer;
- the earliest divergent layer and hypothesized shared cause;
- the semantic invariant, including side effects and mutation;
- the proposed change, fallback, and competing explanation;
- the focused, upstream, package, and performance checks;
- success criteria, risks, and what is explicitly not being claimed.

Then reproduce, fix, measure, review, commit, and push. Preserve a useful negative
result when an optimization does not help. Prefer a small number of decisive
experiments to repeated full builds or increasingly elaborate bookkeeping.

A milestone must deliver a user-visible improvement, a required correctness
repair, or a specific enabling capability with a named immediate consumer.
Harness-only work is justified by evidence/safety defects or a selected test
that cannot yet run honestly; it is not progress merely because more metadata
exists. Scope may require multiple small PRs, but each intermediate state must
be semantically sound and reviewable.

## Runtime architecture: repair invariants, then specialize

This is the principal technical shift. Upstream suites supply counterexamples;
they do not design the runtime. Write down a small set of shared semantic
invariants, map the current implementations onto them, and remove inconsistent
representations a bounded slice at a time. Do not attempt an all-at-once runtime
rewrite, new VM, new compiler IR, or type-inference system.

### Type identity and representation ownership

Python type identity must not depend on writable user attributes such as
`constructor`, `__python_type__`, or a public marker claiming to be a cache.
Separate semantic type identity, storage representation, and JavaScript host
adapter identity.

Private metadata, exact prototype ownership, or existing authenticated
registries are plausible mechanisms. Define registration timing for static and
dynamic classes, metaclass returns, native-backed subclasses, proxies, and
`__class__` reassignment before sharing a lookup helper across dispatch sites.
The canonical type patch is a first slice, not universal native-type repair.

Do not infer inherited native storage from a function's name, silently treat
unregistered native objects as heap instances, or confuse semantic branding
with a security boundary against explicit foreign-JavaScript access.

### Attribute access and method binding

Keep distinct:

- instance lookup with data-descriptor / instance-namespace / non-data
  descriptor / class lookup precedence, plus custom attribute hooks;
- class and metaclass lookup;
- special-method lookup on the type;
- explicit function/descriptor access; and
- native adapter receiver rules.

These paths may share primitives, but cannot be collapsed into "read a JS
property." Descriptors can raise, mutate state, or return arbitrary objects.

Bound-method cache repair is the next high-payoff investigation. Own-instance
cached methods currently risk hiding later class or descriptor changes.
A private marker alone is insufficient: `obj.m = obj.m` is an explicit Python
assignment even if the value equals a cached method.

Preferred direction to test: cache authenticated lookup/binding plans rather
than exposing memoized method values as user namespace entries. Ordinary
function-descriptor reads should produce fresh bound-method objects while a
previously saved bound method retains its original function and receiver.
Explicit user assignments must remain explicit assignments. Avoid globally
retaining every receiver.

Immediate method calls may avoid allocating an observable wrapper when a
guarded resolved target/receiver suffices. Preserve evaluation order:

```python
obj.m(change_class_method())  # resolve obj.m BEFORE evaluating the argument
```

A later call must see a replacement; the already-resolved call must not.
Evaluate the receiver once. Keep custom hooks, descriptors, subclasses,
callable proxies, aliases, and native adapters on correct paths. Benchmark
both repeated calls and saved/read methods; do not trade correctness for speed
or silently impose a major hot-loop regression.

### Function calls, construction, and live metadata

Use one authoritative semantic contract for argument binding across source
functions, runtime-compiled functions, methods, decorators, constructors,
metaclasses, and native boundaries.

Test positional-only, keyword-only, defaults, duplicate/unexpected keywords,
starred unpacking, mappings with side effects, empty signatures, and live
`__defaults__`/`__kwdefaults__`. Reflective metadata must describe executable
behavior, not an independent stale copy.

Optimize direct/common calls only where guards prove the calling convention.
Do not allocate general argument carriers, inspect a signature, or bind a
wrapper on every call when a valid specialization avoids it. Conversely,
changing defaults or class initializers must invalidate assumptions.
Function names, package names, and benchmark source text are never guards.

### Operators, containers, and native-backed subclasses

A comparison or arithmetic fast path must preserve subtype priority, reflected
operations, `NotImplemented`, descriptor binding, callback order, exception
propagation, and type-level special-method lookup. Do not expose missing
default slots before their observable invocation semantics are implemented.

Use independently written small scheduling oracles and native/subclass
witnesses before changing shared dispatch. Integer/string/list/dict subclasses
must retain the correct payload and user overrides; type repair alone does not
qualify subclass arithmetic.

For mappings, sequences, and iteration, test identity, aliasing, iterator
exceptions, live views, mutation during callbacks, slices, hashing/equality,
and large-input scaling. Repair the common representation or protocol, not
one package's use of it.

### Scope, imports, and interactive lifetime

Model Python binding and lifetime explicitly across module globals, closures,
comprehensions, generators, `exec`/`eval`, imported functions, and notebook
callbacks. "Works in a single compiled block" is inadequate.

Cover relative/circular/failed imports, module identity, partial initialization,
reload/invalidation where promised, repeated execution, and session reset.
Keep compile caches distinct from module execution state. Do not share mutable
module globals, class caches, or callback ownership across independent kernels
or browser sessions.

For native globals, closure cells, or import-resolution optimization, first
show where time is spent; global lookup being slower than a local alias is
a lead, not proof that bypassing Python name resolution is valid.

### Mutation and invalidation test matrix

For every new semantic cache, specify key, ownership, lifetime, invalidators,
fallback, and retained-memory behavior. No cache is accepted without tests of
the mutations it claims to survive.

Use bounded combinations of:

- fresh lookup / repeated lookup / saved reference / immediate call;
- class replacement/deletion, descriptor replacement, instance assignment,
  namespace writes, default mutation, and supported class reassignment;
- a mutation before lookup, between resolution and invocation, inside a
  descriptor/callback, and after a prior successful call;
- inherited/native-backed types and independent sessions;
- source execution, cached/precompiled execution, and the applicable frontend.

Do not blindly multiply every feature into a giant Cartesian suite. Choose
pairs with a shared invariant and preserve each discovered combination as a
small deterministic regression. Stateful tests should compare side-effect
transcripts as well as final values.

## Upstream suites: adversarial sources, not competing specifications

Local checkouts under `/home/user/upstream` or `/home/upstream` are research
inputs. CI must reproduce adopted tests without them; no full checkout belongs
in a release. Consult checked SOURCE records when a path or pin differs.

| Source | Retained source pin | Use |
| --- | --- | --- |
| MicroPython | `upstream-tests/micropython/SOURCE.json` | Existing compact output-differential corpus |
| CPython | `v3.14.7`, `823f0323ee6ec1402088b73bce1a38473cac36dc` | Selected public language/stdlib tests, distinct from executed 3.14.4 oracle |
| CPython main | historical observation `7b4364de251265b7920ae9692bf7cde250956af1` | Non-gating grammar/AST delta only |
| PyPy | `release-pypy3.11-v7.3.23`, `194f9f44b50552d75484d67cda6e2b36607dee0c` | Descriptors, operators, scopes, generators, imports |
| RustPython | `59453b9b2505600dcfc5de06aafedeba260b600d` | Compact snippets, then selected library tests |
| GraalPy | `992e0053563c2f73876c0e47d2cc7d14b0505699` | Calls, classes, metadata, numeric boundaries, warmup ideas |
| IronPython 3 | `b32412cc16f2a917b854021360f1c4b1c8815c2a` | Binding, descriptors, bigint, formatting, imports, tracebacks |

Record upstream commit/path, source and fixture hashes, selection boundaries,
and actual per-file licenses. GraalPy headers need not match its top-level UPL;
PyPy/CPython-derived and HPy sources can need separate notices. Do not format
vendored source or rewrite assertions to match Sage.js.

The executed oracle stays pinned to 3.14.4 until an explicit oracle-update
change revalidates the selection and records changed outcomes. A version
upgrade is not part of a performance optimization or a failing-test repair.
No historical 3.14.4 result becomes a 3.14.7 result by updating a label.

Selection guidance:

- Preserve all existing MicroPython comparisons and the exact three reviewed
  differences: two GC/weakref behaviors and the implementation-name whitelist.
  Any changed source, outcome, or reference version requires review.
- Continue from the RustPython inventory; finish unsettled dispositions while
  adopting useful cases in small groups. Inventory counts include helpers,
  dormant assertions, negative examples, and capability-dependent programs.
- PyPy's pinned inventory has 92 application-level files. Select public
  descriptor/operator/scope cases, not a fake object space, JIT, vmprof,
  remote-debug, or implementation-specific tracing.
- Select individual CPython unittest methods or pytest nodes with the minimum
  real fixture/support closure. Do not run all of `Lib/test`, import
  `_testcapi`, or build a shadow CPython harness. Prioritize already-shipped
  high-centrality stdlib behavior and package blockers.
- GraalPy and IronPython contribute independently found counterexamples.
  Exclude JVM/Truffle/cpyext and CLR/.NET assumptions. Revalidate old-version
  expectations with the pinned oracle before judging Sage.js.
- Use `pyperformance`, Brython, and Pyodide selections only for a specific
  behavior/performance/host question. Building other interpreters is not a
  prerequisite for adopting their public tests.
- A whole file's first failure is not a diagnosis of every later assertion.
  Record dormant coverage and newly reachable failures after a fix.

The remaining inventory and selected-runner requirements are still completion
work. They are not prerequisites for fixing an already reproduced defect.

## One evidence engine, with honest scope

Reuse the manifest runner. Add selected unittest/pytest, negative syntax,
multi-file, persistent-session, typed-result, and AST comparison adapters only
as needed, then complete the declared runner matrix before final acceptance.
Use real assertion/fixture/skip semantics; do not simulate a test framework by
deleting decorators or replacing asserts with print statements.

Each adopted case needs:

- stable ID, upstream revision/path, source/fixture/license hashes;
- selection/runner/comparison contract and exact executable oracle;
- mode, target/capabilities, resources, priority, and value tags;
- semantic outcome, reviewed disposition, and performance status;
- raw stdout/stderr, exit/signal/launch/timeout information;
- source/artifact/toolchain identities and before/after guards; and
- links to a reducer, responsible mechanism, and affected workflow when known.

### Three independent axes

**Semantic outcome:** `exact-pass`, `semantic-pass`, `wrong-result`,
`compile-error`, `runtime-error`, `missing-name`, `missing-module`,
`diagnostic-failure`, `timeout`, `resource-failure`, `oracle-failure`, or
`launch-failure`.

**Reviewed disposition:** `required`, `high-value-backlog`,
`intentional-difference`, `unsupported-capability`,
`implementation-internal`, `version-inapplicable`, `suite-adapter-needed`,
or `rejected-low-value`.

**Performance status:** `not-measured`, `within-envelope`, `watch`,
`performance-cliff`, `critical-performance-cliff`, or `not-comparable`.
Single-run observations cannot establish confirmed compatibility or closure.

A reviewed exception is bound to exact source, oracle identity, outcome class,
and failure fingerprint. An old missing-module exception cannot excuse a new
wrong result after the module starts importing. Newly passing behavior requires
review too: it might reflect skipped work or weakened assertions.

Keep raw outcomes even when using narrow named normalizers for temporary
paths, permitted hash randomization, or contractually unordered values.
Do not broadly remove errors/warnings or sort arbitrary output. Typed-result
comparisons need an explicit representation for bigint, signed zero, NaN,
exceptions, and relevant aliasing; JSON alone does not preserve these semantics.

### Inherited boundaries must remain visible

The historical MicroPython profile retains corpus working directory, ambient
environment behavior, original filenames/timeouts, and raw output conventions.
It is not the isolated assertion profile or a security sandbox. Consolidating
runners must preserve reviewed parity before a separately reviewed isolation
migration. The current exact oracle-executable resolution is also distinct
from preserving arbitrary wrapper startup effects.

Keep complete-suite qualification separate from filtered diagnostics. A
passing subset, missing shard, old artifact, or stale source cannot qualify the
full manifest. `--artifact-report` is useful diagnosis, not a freshness bypass.
Process elapsed time is not automatically a warm-throughput benchmark.

The existing assertion profile uses reviewed bounded programs, temporary
homes/directories, scrubbed environments, and output limits. Process isolation
is not OS containment; native Windows child cleanup limitations must remain
explicit until solved. Do not admit subprocess-generating programs merely
because timeout handling terminates the immediate interpreter.

### Developer interface

Keep working commands discoverable. On the appropriate implementation branch:

```sh
node scripts/run-python-compat.cjs --list
node scripts/run-python-compat.cjs --python /path/to/pinned-python --json /tmp/compat.json
node scripts/run-python-compat.cjs --artifact-report --only rustpython/builtin_callable
pnpm bench:python:compat -- --samples 7 --warmups 3 --json /tmp/performance.json
```

Do not document proposed CLI aliases as implemented commands. Add filtering,
explain, baseline diff, sharding and reducer export through the existing tools;
select final names by auditing actual CLI conventions.

Progress output should distinguish building/testing/reusing artifacts and show
new regressions, newly passing cases, remaining required blockers, and elapsed
time. Put full logs and structured evidence in report files, not console floods.

## Performance-cliff incompatibility is a product defect

A comparable program must be valid under the pinned CPython oracle, exercise
semantics supported on the declared Sage.js host, and produce the same checked
answers and relevant side effects. Timing a stub, failed import, early
exception, different algorithm, or GC-specific behavior is not comparison.

For each named scope:

```text
C = median CPython time
S = median Sage.js time
R = S / C
D = S - C
```

Retain the existing versioned policy without weakening it:

| Classification | Required observation |
| --- | --- |
| Watch | R >= 5 and D >= 25 ms |
| Default cliff | R >= 10 and D >= 100 ms |
| Interactive cliff | S >= 1 second, D >= 500 ms, R >= 3, even if R < 10 |
| Critical cliff | R >= 50 and D >= 100 ms; or S >= 10 seconds while C <= 1 second; or equivalent bounded work times out/exhausts memory only in Sage.js |
| Same-runtime regression review | At least 20% and 50 ms slower on a stable workflow |

Ratio thresholds require a reference above the timer/noise floor and a
representative workload. Calibrate identical loop sizes rather than labeling
a single 1-microsecond versus 11-microsecond call a product cliff. Loop counts
must reflect a plausible workflow; arbitrarily multiplying a trivial operation
until it exceeds an absolute floor is not enough. Do not change thresholds or
inputs to make a known cliff disappear.

A confirmed result requires checked equivalence, exact sources/inputs/artifacts,
runtime and host identity, stable medians and dispersion, warmup and at least
seven measured samples (or a justified cold-start/import protocol), and a
second independent run on an idle qualified host such as `bench-1`.
The threshold must survive a confidence interval or robust noise allowance.
Coordinate shared-host access; local noisy profiles can select experiments
but cannot promote a result to confirmed.

Separate `cold-cli`, `source-compile`, `cold-import`, `cached-import`,
`first-call`, and `warm-throughput`. Also retain parse/lowering/emission
attribution, allocation, peak/retained memory, cache bytes, and shipped bytes
when relevant. Module reload is not a cold import. Moving work from import to
first use is not a workflow gain unless end-to-end latency improves.

### Experimental design

- Preserve before/after artifacts and exact benchmark sources outside volatile
  temporary storage. Record their hashes and qualification scope.
- Use alternating or randomized paired runs on the same host and CPU allocation,
  identical inputs, explicit cache states, and controlled concurrent work.
- Keep correctness checks separate from timed bodies where necessary; prevent
  dead-code elimination and check real outputs rather than a vacuous checksum.
- Report medians, dispersion, absolute cost, ratio, sample counts, versions,
  warmup, and measured scope. Keep profiling/instrumented runs separate from
  uninstrumented qualification.
- Include small input-size sweeps for containers, parsing, and allocation.
  Look for quadratic behavior, repeated copying, wrapper allocation, and
  retained caches rather than only a high ratio at one size.
- Profile the full user operation before choosing a micro-optimization.
  Estimate its maximum possible contribution; report no package speedup if
  only an isolated primitive improved.
- Test realistic polymorphism and mutations, not only a monomorphic hot loop.
  Check the post-invalidation path as well as a warmed stable cache.
- Track tail latency for interactive operations as a diagnostic. Do not invent
  a percentile claim from seven samples or replace the versioned median gates.
- Independent reruns must not compare different reference versions or different
  work. A same-source alternate entry point is not an independent algorithm.

The next performance hypotheses are method binding/lookup, common function
calls, instance construction, name resolution, repeated container allocation,
and import/compile work. Profile them against the current baseline; historical
500x slicing or 100x call ratios are leads, not today's measurements.

A speedup that reduces a cliff is valuable even before closure. Keep the
remaining absolute penalty and ratio visible. Required agent/package/teaching/
math workflow cliffs are P1 unless reachability/severity makes them P0.
Do not postpone correctness repairs because they do not also improve speed.

## Diagnostics and agent usability

A concise message without Python frames is an intermediate improvement, not
completion. Implement language exception semantics and source mapping together:

1. Preserve `raise ... from cause`, implicit dynamically scoped context,
   suppression, reraising, notes, and relevant exception groups.
2. Associate generated code with its exact Python source and mapping lifetime,
   including runtime compilation, imported code, and precompiled modules.
3. Produce logical Python frames and source spans for ordinary nested calls,
   generators, callbacks, and the selected asynchronous workflows.
4. Render a useful default traceback in CLI, kernel, and browser; retain an
   opt-in JS/developer stack. Unknown internal errors must stay identifiable
   as runtime defects, not be disguised as an arbitrary Python exception.
5. Expose structured type/message/phase/frames/spans/cause/context/capability
   information with a stable schema for agents.

Never fabricate empty or guessed frames and call them source-mapped. Test
uncaught and caught failures, followed by successful continued execution.
Use durable mappings tied to executable identity rather than a filename alone.

The capability guide should tell an agent how to run Python versus Sage mode,
install an eligible package, discover supported modules, inspect a failure,
and identify unavailable host facilities. Use one checked source for CLI JSON,
human docs, and website summaries. Tell the truth in `sys.implementation`,
`sys.version_info`, packaging markers, and `platform`.

## Standard-library and package leverage

Keep support claims scoped:

- `import-only`: no useful-behavior claim;
- `core`: named common operations tested;
- `upstream-selected`: named upstream tests pass;
- `package-qualified`: a named selected package suite/workflow passes;
- `host-limited`: qualified only for declared host capabilities;
- `unsupported`: absent with an explanation.

These labels describe scope, not a promise that every API in a module works.
Generate the support table from current checked selections/receipts. Preserve
expected skips and dormant test counts; they are not independent coverage.

Prioritize the existing package blockers before a broad new-package campaign.
Reduce pyparsing execution, IDNA stderr, and mpmath timeout on current main;
a warning may be legitimate behavior, an adapter mismatch, or a real defect.
Do not silence it or increase a timeout without resolving which.

Choose stdlib work by actual dependency centrality: `collections`,
`functools`, `itertools`, `inspect`, `typing`, `dataclasses`, `enum`,
`contextlib`, paths/I/O, `re`, JSON/pickle, tracebacks, warnings, unittest,
and packaging/import metadata are strong candidates. Prefer upstream portable
Python when it fits; otherwise use small honest portable implementations or
JS/Web API adapters. No package-name special cases.

Advance from installation/public workflow to selected upstream suite, including
negative paths and meaningful fixtures. Keep versions, wheel/dependency hashes,
test selections, capabilities, skips, import/first/warm times and loaded size.
A successful public workflow does not imply the whole upstream suite passes;
a selected suite does not prove installation or frontend behavior.

## Keeping feedback fast and the runtime small

Preserve the artifact-input versus validation-workspace distinction in build
receipts. The earlier v2/v3 work is a foundation, not proof that every dependency,
symlink, concurrent build, or interrupted publication is handled.

- Hash actual source/generators/configuration/toolchain/dependencies used.
  Preserve validation identities even when test/docs-only edits reuse artifacts.
- Publish complete compiler/runtime generations atomically or coordinate
  readers with completed builds. Never run against mixed in-progress outputs.
- Serialize source-changing builds in a shared checkout. Parallel read-only
  analysis or tests of a frozen artifact are fine; separate worktrees need
  separate mutable build outputs.
- Do not "refresh" receipts by hashing artifacts that were never rebuilt from
  the recorded input. Unknown inputs invalidate conservatively.
- Add invalidation, interruption, stale-artifact, and concurrency tests for the
  cache behavior being changed. Measure edit-test latency.
- Do not make every future cache feature a prerequisite for a runtime fix.

No upstream suite, full checkout, package test cache, or test-support harness
enters the runtime payload. Optional packages are not bundled by qualification.
Keep stdlib lazy; measure first useful operation as well as startup.
Report bootstrap source, lazy source, native/SEA size, browser compressed and
uncompressed bytes, memory, and extracted/cache disk use as applicable.

Budgets are constraints, not counters to increment automatically when code no
longer fits. First simplify or move genuinely optional code out of bootstrap.
Any necessary budget change needs a separate justification and measured product
impact; never hide a correctness feature's cost with a compressed-size-only
report. Follow `ARCHITECTURE.md` for mathematical/native work: ordinary Python,
source-transparent compilation, and correct dynamic fallback remain the default.

## Differential generation and safety

Use upstream cases, hand-reduced invariants, and generated stateful sequences
as complementary evidence. Two runners executing the same buggy helper are
not independent semantic oracles.

Begin with bounded generators around a selected mechanism: signatures, slices,
class/descriptor mutation, exception nesting, or import graphs. Compare
intermediate side-effect transcripts and typed results with CPython. Preserve
the seed, generator version, failure fingerprint, source closure, and minimized
ordinary-Python reproducer. Reducers must preserve essential imports and ordering.

Keep grammar generation separate from execution. Hypothesmith/parser fuzzing
does not authorize running arbitrary accepted programs. Small reviewed closed
AST generators may enter routine CI only with strict bounds and no arbitrary
paths, network, subprocesses, unbounded allocation, or wall-clock dependence.

Broad or mutation-generated execution runs in a rootless container inside a
native VM, not directly in this development container or a real home:

- Recheck the VM and existing container runtime before use. Prior observations
  found rootless Podman on `bench-1`; they are not a current availability claim.
  Coordinate with other lanes and prefer a disposable VM for higher-risk work.
- Pin Node, CPython, and exact Sage.js artifacts. Use an unprivileged identity,
  read-only root, no network, dropped capabilities, no-new-privileges, bounded
  CPU/memory/PIDs/output, and size-limited temporary storage.
- Mount no real home, checkout, credential, SSH-agent socket, or writable
  developer/package cache. Copy in only reviewed immutable inputs.
- Run bounded process/container shards with process-tree cleanup, including
  Windows where selected tests use children. Export only bounded inert results
  and reducers; inspect exported paths/symlinks and never auto-execute artifacts.
- Test the sandbox policy using explicit denial/resource probes before a
  campaign. Environment scrubbing and timeouts alone are not containment.
- Destroy the shard after execution. A container is defense in depth, not a
  proof that hostile code cannot escape; snapshots cannot provide that proof.

The user reports read-only rolling home snapshots under `$HOME/.snapshots`,
nominally every 15 minutes. Verify availability when needed; do not assume the
remote VM has them. They support recovery, not prevention of disclosure or
damage. Never mount snapshots into fuzz containers. Commit/push coherent work
and preserve evidence independently of snapshot timing.

## Delivery milestones and exit gates

These replace the earlier eleven-phase ordering. They are sequential where
semantics depend on each other; diagnostic, package, and performance validation
can accompany every runtime slice. The remaining suite/engine work is retained,
but no longer drives the daily task list.

### M0 — Consolidate, preserve work, freeze the tranche

- Inventory current main, all related PR bases/commits, uncommitted changes,
  generated outputs, and available evidence. Verify ancestry, not just PR state.
- Preserve the canonical-type draft and its raw benchmark sources/results.
  Missing temporary receipts must be rerun when needed, not reconstructed.
- Land or rebase/isolate independently sound prerequisites with merge-manager
  coordination. Prefer short main-based PRs; keep only necessary short stacks.
- Run one source-current baseline and publish exact remaining semantic,
  package, diagnostic, and performance gaps without changing dispositions.
- Freeze initial qualification selections and workflow contracts. Link every
  completion criterion below to existing evidence or a named missing deliverable.

Exit: a reproducible main-based starting point, preserved work, and no ambiguity
about what is merged, tested, required, or still failing. Existing failures may
remain visible during incremental development; they prevent final qualification,
not every unrelated improvement.

### M1 — Canonical type identity

Finish/reconcile the existing private type-ownership slice. Include constructor
and marker shadowing, raising getters, dynamic class allocation, metaclass
callback timing, proxy aliases, supported class reassignment, and native
fallback boundaries. Check standalone and session routes, Python and Sage modes.

Exit: the selected type identity regressions pass; broader outcomes are compared
to the M0 baseline; source/startup budgets and type-lookup regression probes pass.
Document adjacent call/cache defects rather than implying this slice fixes them.

### M2 — Correct method resolution, then fast common calls

Establish the mutation/lookup/binding oracles above. Repair user-namespace
pollution and stale binding without a marker-only half-fix. Measure resolution,
fresh bound-method reads, immediate calls, saved calls, and instance construction.
Pair the change with traitlets/decorator and interactive callback workflows.

Exit: saved references, explicit assignments, class replacement, descriptors,
native receivers and lookup-before-argument evaluation all obey the selected
Python contract; no hidden major common-call regression. Promote speed claims
only with independent paired confirmation. Split later specialization from
correctness where a sound intermediate implementation is practical.

### M3 — Close adopted protocol and package blockers

Work through the current required failures in root-cause groups, not file order:
operator/default-slot behavior, descriptors/metaclasses/native subclasses,
argument/default metadata, formatting, mappings and their package consumers.
Each repaired group adds cross-suite and mutation tests. Continue small upstream
adoption batches where they expose independently useful cases.

Exit: all required cases in the frozen tranche pass, existing package workflows
pass on declared hosts, and selected foundation suites substantiate the claim.
No converted required failure, widened timeout, deleted assertion, or blanket
normalizer can serve as closure.

### M4 — Useful Python diagnostics across frontends

Finish exception semantics, executable-identity-bound source maps, Python
frames, and structured output for the negative workflow corpus. Validate
continued execution and widget/callback paths, not only batch stderr.

Exit: required failures are understandable to a Python user/agent in CLI,
Jupyter, and browser. Unsupported host capabilities have explicit explanations;
unknown compiler/runtime defects remain diagnosable in developer output.

### M5 — Confirm and remove high-value cliffs

Extend existing performance tooling to missing cold/compile/import/first scopes,
allocation/scaling probes and real workflow pairs. Confirm current high-value
cliffs on a coordinated idle host. Profile and repair shared mechanisms in small
PRs; do not repeat stale benchmark conclusions.

Exit: no confirmed default/critical cliff in the frozen required workflows
remains without an explicit reviewed product decision. Lesser or out-of-tranche
cliffs remain published with scope; improved-but-still-cliff is not closure.

### M6 — Complete qualification and sustainable discovery

Finish settled inventory dispositions, selected runners/support closures,
explain/diff/sharding and reproducible reducer export. Run bounded generated
campaigns in the verified VM/container tier. Qualify the portable tranche on
Linux x64, Linux arm64, macOS arm64, Windows x64, and real production browser
artifacts; include SEA and kernel paths for their declared workflows.

Publish support/difference/package/performance reports and concise agent
guidance from the same checked metadata. Add reviewed upstream-update reports
with additions, removals, licenses and oracle changes; CPython-main remains
non-gating. Retain deterministic minimized regressions from discovery.

Exit: every primary acceptance item below has current evidence or an explicitly
approved product-scope decision. No actual release or deployment is implied by
this plan task; publishing a release follows `RELEASE.md` and its authority.

## Validation and PR integration

Use layered checks:

1. Fast reducer and mechanism-level tests during development.
2. Connected upstream cases, package workflows and negative diagnostics.
3. Current routine gates, architecture/strict Python as affected, complete
   adopted corpus and selected package suites before qualification.
4. Targeted Windows/browser checks early for representation, serialization,
   callbacks, filesystem/process, or code-generation changes.
5. Exact-candidate four-platform/browser/SEA qualification at tranche completion,
   not a claim inferred from Linux unit tests.

Match source, input, toolchain and artifact identities across comparisons.
Do not edit source/evidence while a source-qualified gate is running. Collect
all shards before calling a suite complete. Interrupted/missing/skipped shards
are not passes. Keep inherited failures distinct from new regressions; preserve
full outcome/disposition comparisons, not just aggregate counts.

Routine CI must reject new wrong results, changed reviewed fingerprints,
unclassified outcomes, missing provenance/licenses, source/cache disagreement,
undeclared capabilities, and budget regressions. Existing required failures stay
visible and keep the full qualification result false until repaired.

Each PR should state its semantic change, affected workflows, evidence scope,
known limitations, and dependency/base. Commit coherent validated changes and
push promptly. Preserve unrelated work; never sweep an unfinished runtime patch
into a documentation or harness commit.

For merge readiness:

- Check every prerequisite's actual integration state and the combined diff
  against intended main; a green child PR does not qualify draft ancestors.
- Investigate CI failures. Distinguish a reproduced unrelated infrastructure
  failure from an implementation regression with evidence, not assumption.
- Keep incomplete or dependency-blocked work draft. When the change and its
  prerequisites are merge-ready, remove draft status for the merge manager.
- Do not self-merge, retarget a large stack, rewrite shared history, or publish
  releases merely to clear a status indicator.
- Read and update the existing public Discussion #104 with concise scope,
  discoveries, commit/PR IDs, validation, and integration dependencies. Durable
  contracts and evidence belong in the repository, not only in comments.

## Primary definition of done

The first complete delivery of this program requires all fourteen gates:

1. One manifest-driven engine covers the existing MicroPython corpus and the
   reviewed RustPython, PyPy, GraalPy, IronPython and selected CPython cases;
   runner support is sufficient for the frozen program and its stated matrix.
2. Every adopted case has exact provenance/license/fixture identity, value tags,
   capabilities, semantic outcome, disposition and performance status.
   Remaining inventory candidates have settled reviewed dispositions, not
   recommendations masquerading as decisions.
3. All required P0/P1 cases and newly found in-scope trust defects pass on their
   declared targets, with zero silent wrong results or unclassified outcomes
   in that qualification corpus.
4. The six workflow families have pinned end-to-end regressions, including
   mutation, persistence and reset where applicable.
5. Negative workflows have useful Python tracebacks and structured diagnostics;
   no unexplained raw JS leakage or fabricated Python frames.
6. Implementation/language/host/wheel identity is truthful and queryable;
   only eligible wheel formats are accepted, with no claim that eligibility
   alone guarantees package compatibility.
7. Generated stdlib and package support tables cite current scoped selections
   and receipts; import-only is not advertised as general support.
8. Selected real upstream package suites and public workflows pass reproducibly
   in isolated environments, with fixtures/skips/dormant coverage explicit.
9. Behavior-gated parse/compile/load/first/warm evidence has driven measured
   general improvements; claimed major speedups have independent confirmation.
10. Required agent/package-foundation/teaching/math workflows retain no confirmed
    default or critical cliff without an explicit reviewed product decision.
    All remaining measured cliffs are visible by scope and absolute cost.
11. Broad generated-program campaigns use verified VM/container containment and
    produce reproducible minimized cases without real homes, credentials or
    external network access.
12. Test sources/caches are absent from shipped payloads; source, startup, SEA,
    browser, memory and architecture budgets remain satisfied.
13. Exact portable candidates pass Linux x64, Linux arm64, macOS arm64 and
    Windows x64 plus the real-browser subset; additional SEA/kernel claims
    have their own matching workflow evidence.
14. README, website, CLI and machine-readable capability guidance agree on the
    independent implementation and link tested support/intentional differences.

Completion does not mean every CPython test passes or every module exists.
It means a substantial, explicitly bounded Python product is correct, useful,
understandable and fast, with a sustainable way to find the next improvements.
Do not declare completion from elapsed effort, a single demo, green routine CI,
an inventory count, or a pass percentage.

## Intentional decisions and stop rules

A deliberate difference needs a stable ID, exact affected cases/fingerprints,
Python version/mode/host, both behaviors, user rationale, impact, portable
alternative where possible, review owner/date, and reconsideration condition.
"Hard," "slow," and "already implemented differently" describe backlog, not an
approved difference. Product-scope changes and threshold relaxations require
explicit review; autonomous work must not waive its own acceptance gates.

When a mechanism investigation finds no useful improvement, record the result
and select the next evidence-backed hypothesis. When a safe fix needs a deeper
representation change, write the invariant and bounded migration/test plan;
do not pile on compatibility branches. When a needed host, approval, credential
flow, or product decision is unavailable, preserve work and report the exact
blocker rather than claiming completion.

Immediate next action after this document: M0 consolidation, then finish the
canonical type slice and attack method binding with mutation-aware correctness
and package-level measurements. This is the critical path; broad suite breadth
and optional fidelity must not displace it.
