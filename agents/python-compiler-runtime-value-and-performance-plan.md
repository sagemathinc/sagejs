# Plan: a high-value Python compiler and runtime for Sage.js

## Executive decision

Sage.js should become an unusually pleasant implementation of Python for
mathematics, automation, teaching, and agent-written code. Upstream Python test
suites are the main source of adversarial examples and regression coverage, but
their aggregate pass percentage is not the objective. The objective is to make
ordinary, valuable Python code work correctly, predictably, quickly, and on
every Sage.js host without turning Sage.js into a CPython reimplementation.

The program has four equal concerns:

1. **Language and object-model quality.** Common Python syntax and protocols
   should behave as an experienced Python programmer expects.
2. **Ecosystem value.** Pure-Python packages, the standard-library surface they
   use, and normal development tools should work with few Sage.js-specific
   accommodations.
3. **Failure quality.** Unsupported facilities should fail early and clearly;
   compiler/runtime bugs should produce Python source locations and Python
   exceptions rather than inscrutable JavaScript failures.
4. **Performance.** The same suites should expose expensive compiler and
   runtime paths. Fixing a shared object-model or import hot path is more
   valuable than hand-optimizing one benchmark. Correct behavior can still be
   incompatibly slow: this plan names and gates **performance-cliff
   incompatibilities** separately from semantic failures.

The initial semantic target is the portable, public behavior of Python 3.14.
Use the current stable CPython 3.14 release as the primary oracle. Tests from
MicroPython, PyPy, RustPython, GraalPy, IronPython, and later alternative
implementations contribute excellent cases, but do not independently define
Sage.js behavior. CPython `main` is a forward-looking grammar probe, not the
release oracle.

This plan deliberately sets Sage.js's own rules. Exact CPython behavior is
valuable when users or packages observe it. CPython bytecode, reference counts,
memory layout, private C APIs, its extension-module ABI, GIL details, and
operating-system accidents are not compatibility goals. Differences must be
explicit, tested, useful, and easy to discover; they must never be silent wrong
answers.

## Succinct public position

Use the following wording, or something no stronger, in the README, website,
CLI documentation, and package documentation:

> Sage.js is an independent implementation of Python for mathematical
> computing on JavaScript and WebAssembly. It targets the portable,
> user-visible semantics of Python 3.14 and runs unmodified pure-Python code
> where doing so is useful. CPython is the primary compatibility reference,
> not the embedded engine or an absolute implementation specification. Sage.js
> does not provide CPython bytecode, reference-counting behavior, its C-extension
> ABI, or every host operating-system facility; supported behavior and
> intentional differences are tested and published.

A compact label for space-constrained surfaces is:

> Independent Python 3.14 implementation; pure-Python compatible; no CPython
> runtime or C ABI.

Do not describe Sage.js as “CPython,” “CPython in JavaScript,” or “100% Python
compatible.” Do not describe every observable difference as acceptable merely
because the implementation is independent.

## Why this matters for agents

An agent is an exacting Python user. It writes idiomatic code quickly, composes
libraries it has seen elsewhere, inspects failures programmatically, and assumes
that common protocols compose. It is especially harmed by a runtime which
usually accepts code but occasionally changes scope, skips a descriptor, loses
an exception cause, or returns a plausible wrong value.

The agent-facing success criterion is not “an agent can be prompted around the
difference.” It is that an agent can write straightforward Python with few
Sage.js-specific branches and can diagnose the remaining boundaries from the
error itself.

The following workflows form the initial agent usability contract:

- create and import a multi-file pure-Python package;
- use functions, closures, comprehensions, generators, decorators, context
  managers, classes, descriptors, metaclasses, dataclasses, enums, and typing
  helpers without special syntax;
- use ordinary containers, iteration protocols, comparison, hashing, slicing,
  formatting, exceptions, and numeric conversion at boundary values;
- inspect call signatures, annotations, modules, classes, and tracebacks well
  enough for decorators, test frameworks, serialization, and dependency
  injection;
- read and write files safely with `pathlib`, `os`, `io`, `tempfile`, JSON, CSV,
  text encodings, compression, hashing, and pickle where the host permits;
- install and import a compatible `py3-none-any` wheel without pretending that
  a `cp314` native wheel can work;
- run a useful pytest/unittest test suite with correct exit status and concise
  failure output;
- use `sys.argv`, environment variables, stdin/stdout/stderr, clocks, and
  subprocess/network APIs according to an explicit host capability profile;
- receive Python exception types, source lines, columns, causes, and traceback
  frames instead of a raw generated-JavaScript stack;
- ask the runtime, in machine-readable form, which implementation, language
  target, host capabilities, and intentional differences apply; and
- get repeatable source compilation, cached import, and warm execution without
  surprising multi-second cliffs in ordinary package code.

These workflows are more important than obscure fidelity in an internal
CPython object.

## Current foundation

This is an expansion of working infrastructure, not a new conformance effort:

- `scripts/audit-python-grammar.cjs` already audits Tree-sitter, stage-zero,
  and CPython acceptance and retains a deterministic report.
- `upstream-tests/micropython` already provides 508 CPython-differential
  candidates. The Python 3.14 baseline records 506 exact passes and two reviewed
  weak-reference/GC scheduling differences.
- `scripts/run-python-conformance.cjs` already isolates cases, compares output,
  classifies failures, and rejects unreviewed baseline drift.
- `sagejs pip`, a user package cache, and
  `upstream-tests/python-packages/manifest.json` already exercise eleven pinned
  pure-Python wheel workflows.
- Sage.js already runs a substantial supported subset of upstream pytest and
  compiled upstream packages including traitlets and ipywidgets.
- `test/python-runtime-hotpaths.cjs` and focused benchmarks already protect
  important call, attribute, comparison, integer, class, scope, and traceback
  semantics.
- source/runtime caches, package graph budgets, cold-start measurement, browser
  size budgets, and the source-transparent native architecture already provide
  the controls needed to keep compatibility work from bloating releases.

Extend these assets only as needed to deliver the next useful, tested slice.
Generalizing the harness is a means to improve Python, not a prerequisite for
every runtime fix or package measurement.

### First implementation checkpoint and lessons

The first implementation cycle has already produced separate PRs for language
and object-model regressions ([#117](https://github.com/sagemathinc/sagejs/pull/117)),
a behavior-gated warm-performance laboratory
([#119](https://github.com/sagemathinc/sagejs/pull/119)), native sequence slicing
([#120](https://github.com/sagemathinc/sagejs/pull/120)), and dictionary fast paths
([#124](https://github.com/sagemathinc/sagejs/pull/124)). These are delivered PR
milestones, not a claim that every PR is merged or the program is complete.

- The 506 exact MicroPython comparisons and two reviewed GC differences were
  validated against CPython **3.14.4**. This is a bounded language corpus, not
  qualification of the later suite/package matrix or the proposed 3.14.7 pin.
- Initial measurements indicate roughly 24-fold faster full-list slicing and
  9-fold faster small dictionary construction than their earlier Sage.js
  implementations. The comparison data are provisional; remaining CPython
  gaps stay visible, and formal confirmation still follows the policy below.
- These gains remove shared allocation/dispatch costs while preserving
  generic and subclass behavior. They justify investigating common runtime
  mechanisms before assuming a JavaScript performance ceiling.
- The performance laboratory currently covers warm workloads. Separate cold
  CLI, compilation, import, and first-call scopes remain work to do.
- Source- and raw-outcome-bound baseline evidence is still being implemented.
  Existing status comparisons are not equivalent to that stronger guarantee:
  one wrong output must not replace another under the same accepted status.
- Broad build-receipt invalidation and tests observing in-progress compiler
  output caused expensive rebuilds and misleading failures. Improving the
  edit-test feedback loop is now an early enabling milestone.

Use this checkpoint to guide sequencing, not as a permanent status dashboard.
Current claims must link the exact revisions and receipts; consult
`bench/python-compat/README.md` for the measurement scope and remaining cliffs.

## Pinned upstream inputs

The developer checkouts currently available under `/home/user/upstream` are
research inputs only. The test harness and CI must not depend on those paths or
ship their full repositories.

| Source | Initial pin | Initial use | Authority |
| --- | --- | --- | --- |
| MicroPython | existing pin in `upstream-tests/micropython/SOURCE.json` | compact output-differential language corpus | CPython output for applicable cases |
| CPython | tag `v3.14.7`, commit `823f0323ee6ec1402088b73bce1a38473cac36dc` | selected language, builtins, object-model, stdlib, diagnostics, and benchmark cases | primary Python 3.14 oracle |
| CPython `main` | observed commit `7b4364de251265b7920ae9692bf7cde250956af1` | non-gating forward grammar/AST report | future signal only |
| PyPy | tag `release-pypy3.11-v7.3.23`, commit `194f9f44b50552d75484d67cda6e2b36607dee0c` | selected `apptest_*` and portable `extra_tests` edge cases | test source; revalidate with CPython 3.14 |
| RustPython | commit `59453b9b2505600dcfc5de06aafedeba260b600d` | 221 compact functional snippets, then selected library tests | test source; revalidate with CPython 3.14 |
| GraalPy | commit `992e0053563c2f73876c0e47d2cc7d14b0505699` | selected pure-Python language tests plus interpreter/warmup benchmark ideas | test source; revalidate with CPython 3.14 |
| IronPython 3 | commit `b32412cc16f2a917b854021360f1c4b1c8815c2a` | selected binding, object-model, bigint, import, formatting, and traceback tests | test source; revalidate with CPython 3.14 |

Record the relevant PSF, MIT, and other notices beside every vendored
selection. GraalPy files can carry notices which differ from the repository's
top-level UPL license, so synchronization must retain and audit per-file
headers. A sync tool must copy only reviewed files (or reviewed individual test
cases), record upstream path and SHA-256, and fail if the requested commit does
not match. CI and release artifacts must not include the more than 2 GB of
upstream Git checkouts.

The pins above are bootstrap choices, not permanent claims that old releases
are ideal or that every oracle has already been qualified. Keep the actually
executed interpreter version in each receipt. Adopting a newer reference,
including moving the existing 3.14.4 evidence to the proposed 3.14.7 oracle,
requires an explicit reviewed change, a generated case diff, and a fresh
baseline; never relabel historical measurements.

## What to take from each suite

### MicroPython

Keep the complete existing differential corpus and strengthen its status-only
baseline checks to enforce the raw-outcome fingerprint rule below. It is
exceptionally good at short programs involving basic syntax, numeric
operations, containers, functions, classes, generators, and exceptions. It
should remain the fast, broad language smoke gate.

Do not broaden Sage.js's emulation of deterministic garbage collection merely
to turn the two reviewed differences green.

### RustPython

Begin here because the 221 `extra_tests/snippets` files are compact,
assertion-oriented, and organized by observable feature. They cover precisely
the builtins, protocols, syntax, object model, imports, and standard-library
interactions that tend to block pure-Python packages.

Classify every snippet before execution:

- portable and high-value: adopt unchanged;
- portable but dependent on a missing stdlib module: adopt as a visible
  library gap if that module is in scope;
- operating-system or native-extension dependent: record the needed capability
  rather than allowing a confusing import failure;
- RustPython VM/JIT/internal behavior: do not adopt as a compatibility target;
- invalid-syntax or expected-failure case: run through the negative-test path;
- multi-file/resource case: retain its complete fixture closure and isolate it
  in a temporary directory.

RustPython's own expected behavior is not automatically authoritative. Each
portable case must pass under the pinned CPython oracle, or receive a recorded
version/implementation disposition before Sage.js is judged against it.

### PyPy

Prioritize the 32 `apptest_*.py` files concerned with classes, descriptors,
binary-operation dispatch, strings/bytes, iteration, frames, scopes, generators,
exceptions, compilation, and ordinary collection types. These are valuable
because an independent mature runtime has already isolated semantic corners
which application code can observe.

Select from `extra_tests` only when the test describes public Python behavior.
Exclude PyPy JIT, `vmprof`, `_testcapi`, greenlet implementation, remote-debug,
free-threading, and platform internals unless Sage.js deliberately implements
the corresponding public capability. Re-express PyPy's application-level test
selection through a small pytest/unittest adapter; never add a fake PyPy object
space just to run a test.

### CPython 3.14

Do not point Sage.js at all 830 recursively discovered `test_*.py` files and
count the wreckage. CPython explicitly documents `test` and `test.support` as
internal implementation infrastructure. Adopt public-behavior tests at
individual test-method granularity through a reviewed manifest.

Start with these families:

1. syntax acceptance/rejection, compilation, scopes, closures, comprehensions,
   generators, pattern matching, annotations, and exception control flow;
2. builtins and core types: integers, floats, complex, bool, strings, bytes,
   lists, tuples, dicts, sets, ranges, slices, memory views, and iterators;
3. object model: classes, MRO, metaclasses, descriptors, `super`, special-method
   lookup, reflected operations, hashing, weak references, and finalization;
4. imports and module identity, including packages, relative imports, circular
   imports, `__main__`, cache invalidation, and import errors;
5. high-centrality stdlib modules already shipped by Sage.js, including `abc`,
   `collections`, `contextlib`, `copy`, `dataclasses`, `datetime`, `enum`,
   `functools`, `inspect`, `io`, `itertools`, `json`, `math`, `operator`,
   `pathlib`, `pickle`, `random`, `re`, `statistics`, `string`, `struct`,
   `tempfile`, `traceback`, `types`, `typing`, `unittest`, and `warnings`;
6. diagnostics that validate exception class, location, chaining, notes,
   traceback structure, and useful syntax errors; and
7. portable benchmark workloads with clear behavioral checks.

Create a minimal, honest `test.support` compatibility layer containing only
helpers needed by selected cases. Every skip helper must emit a structured
capability reason. Do not copy CPython's entire test harness, run `_testcapi`,
or implement an internal API solely because a selected file imports it.

Use CPython `main` only for a non-gating report of new syntax and AST shapes.
Nothing from that report changes Sage.js's declared 3.14 target without an
explicit language-version decision.

### GraalPy

GraalPy is especially useful because it is another modern non-CPython runtime
with a substantial suite of small Python tests. Its core test tree contains
focused cases for arithmetic boundaries, calls, classes, closures,
comprehensions, descriptors, generators, imports, scopes, exceptions,
collections, standard-library modules, and parser behavior. Its interpreter
and warmup benchmark directories are also promising sources for
performance-cliff discovery.

Select pure-Python, public-language tests from
`graalpython/com.oracle.graal.python.test/src/tests` at individual-test
granularity. Exclude `cpyext`, Graal/JVM interop, Truffle internals, Java array
behavior, JIT/intrinsification expectations, and Graal-specific sandbox or
startup contracts. A test whose filename mentions an optimization may still
contain a useful portable semantic case, but the optimization itself is not a
Sage.js requirement.

Do not build GraalPy merely to adopt these tests. Revalidate each case and
benchmark answer with CPython 3.14. Preserve every file's actual copyright and
license header rather than assuming the top-level UPL applies uniformly.

### IronPython 3

IronPython provides a valuable independent object model and a long history of
finding dynamic-language binding corners. Prioritize pure cases involving
argument binding, closures and name lookup, classes and metaclasses,
descriptors and properties, special-method dispatch, arbitrary-size integers,
strings/Unicode/formatting, imports, generators, exceptions, and tracebacks.

The checked-out project still states Python 3.4 as its compatibility target,
although individual cases include later behavior. Therefore IronPython tests
are ideas, not even a version-matched oracle: each selected method must first
pass or receive a version analysis under CPython 3.14. Exclude CLR/.NET
interop, hosting, compiled assemblies, Dynamic Language Runtime behavior,
IronPython-only modules, and obsolete version expectations. Provide only the
small honest portion of `iptest` needed to run selected portable cases; never
make `is_cli` true or turn IronPython-only skips into Sage.js assertions.

### Later independent sources

After these initial suites are productive, consider selected
pure-language cases from Brython and Pyodide. Their chief value is independent
browser and host-boundary coverage. They are not prerequisites for the initial
program and must not create another suite-specific orchestration layer.

Use Hypothesmith for parser acceptance/rejection fuzzing. Because arbitrary
generated programs can have destructive effects or undefined resource use, use
a separate bounded AST generator for execution differential testing. Use a
selected `pyperformance` subset only after behavior probes establish equivalent
work.

## Compatibility evidence has three axes, not one percentage

Publish results along three independent axes.

### Semantic outcome

- `exact-pass`: exit status and normalized observable output exactly match;
- `semantic-pass`: assertions or a typed result oracle agree, but unstable
  presentation is intentionally not byte-compared;
- `wrong-result`: execution succeeds with observably incorrect state or value;
- `compile-error`: valid targeted Python is rejected or lowered incorrectly;
- `runtime-error`: execution fails with the wrong behavior;
- `missing-name` or `missing-module`: an API/library dependency is absent;
- `diagnostic-failure`: the underlying failure occurs but loses required Python
  exception or source information;
- `timeout` or `resource-failure`: execution exceeds a declared bound;
- `oracle-failure`: the reference or upstream case itself is inapplicable; and
- `launch-failure`: harness infrastructure did not run the interpreter.

### Reviewed disposition

- `required`: part of the current product contract and must pass;
- `high-value-backlog`: useful behavior selected for implementation;
- `intentional-difference`: Sage.js deliberately behaves differently;
- `unsupported-capability`: a host/runtime facility is outside the current
  contract;
- `implementation-internal`: observable only through implementation-specific
  internals which Sage.js does not promise;
- `version-inapplicable`: not Python 3.14 behavior;
- `suite-adapter-needed`: valuable but not yet runnable without honest harness
  work; and
- `rejected-low-value`: reviewed and deliberately not adopted.

A disposition applies only to the exact source hash, oracle identity, raw
outcome class, and failure fingerprint that were reviewed. A compile error may
not silently become a wrong result under an old `intentional-difference`
record. A previously missing module which starts importing must be re-evaluated,
not counted as permanently unsupported.

### Performance compatibility

Semantic success is not the end of compatibility. A program which is correct
but takes seconds where ordinary Python takes a fraction of a second changes
what programs users and agents can reasonably write. Record a third,
independent performance status for semantically passing cases.

Before assigning a measured status, the case must be valid under pinned
CPython 3.14, exercise portable
semantics that make sense for the declared Sage.js host, and produce the same
checked result and relevant side effects in Sage.js. A reference-count,
garbage-collector scheduling, CPython C-ABI, unavailable host-capability, or
otherwise different-work case is `not-comparable`, not a performance cliff.

- `not-measured`: no performance claim has been made for this semantic case;
- `within-envelope`: no material measured divergence;
- `watch`: slower enough to investigate but below the product-cliff threshold;
- `performance-cliff`: a confirmed user-visible or throughput incompatibility;
- `critical-performance-cliff`: timeout-scale, memory-exhaustion-scale, or at
  least 50-fold confirmed time divergence; and
- `not-comparable`: the two runtimes do materially different work or no stable
  reference measurement exists.

For a named execution scope, let:

```text
C = median time under pinned CPython 3.14
S = median time under Sage.js
R = S / C
D = S - C
```

The scopes are separate: `cold-cli`, `source-compile`, `cold-import`,
`cached-import`, `first-call`, and `warm-throughput`. Do not divide a Sage.js
cold compile by a CPython warm function call or hide compiler time inside a
throughput claim.

The initial threshold policy is:

1. **Watch:** `R >= 5` and `D >= 25 ms` for a representative workload.
2. **Default performance cliff:** `R >= 10` and `D >= 100 ms` for a stable,
   representative workload whose CPython measurement is above the timer/noise
   floor.
3. **Interactive-latency cliff:** even when `R < 10`, `S >= 1 second`,
   `D >= 500 ms`, and `R >= 3` for an operation a user or agent waits for
   directly, such as startup, import, first evaluation, or first traceback.
4. **Critical cliff:** `R >= 50` with `D >= 100 ms`, Sage.js takes at least 10
   seconds while CPython takes at most 1 second, or the equivalent bounded
   program times out or exhausts the declared memory budget only in Sage.js.

Version these thresholds in the report schema. The first broad corpus may
justify lowering or refining them, but changing them requires a reviewed policy
decision and a before/after reclassification report. “Calibration” may estimate
noise and representative loop sizes; it may not raise a threshold merely to
make existing cliffs disappear.

Ten-fold is intentionally the default threshold. Twenty- or fifty-fold would
miss important, fixable runtime defects. For example, an import taking roughly
7.2 seconds in Sage.js and 0.65 seconds in CPython is about 11-fold slower and
is plainly a product incompatibility; this sort of investigation already
revealed a class-`__dict__` path which could be made roughly 146 times faster.
Conversely, 1 microsecond versus 11 microseconds is not automatically a product
cliff. It becomes a formal watch item only if a calibrated loop or real
workflow proves at least 25 ms of representative cost, and becomes a cliff
only when that cost reaches the 100 ms threshold.

A measurement is **confirmed** only when:

- both runtimes produce the same checked result and side effects;
- source, input, host, CPU allocation, runtime versions, and execution scope
  are recorded;
- warmup and at least seven recorded samples (or a justified import/startup
  protocol) give stable medians and dispersion;
- neither side failed early, used a stub, skipped work, or reused an
  incomparable cache;
- the candidate reproduces in a second run on `bench-1` or an equivalently idle
  qualified host; and
- the absolute and ratio bounds remain true with confidence intervals or a
  robust noise allowance.

The threshold classifies the evidence; it does not force every obscure 10-fold
case ahead of common functionality. A cliff in an `agent-core`, package
dependency, teaching, or common mathematical workflow is P1. A low-frequency
case may be P2/P3 or a documented current limitation. A critical cliff which
causes hangs, timeouts, or practical denial of service is P0/P1 according to
reachability.

Also maintain same-runtime regression budgets. A Sage.js change which makes a
stable workflow at least 20% and 50 ms slower deserves review even if Sage.js
remains under the CPython-relative cliff threshold.

Never collapse semantic outcomes, reviewed dispositions, and performance
status into a vanity “Python compatibility percent.”

Useful published measures include:

- required cases passing by capability area;
- unclassified cases (must always be zero in a gating corpus);
- silent wrong-result count (must always be zero);
- high-value blockers and the packages/workflows they block;
- confirmed performance cliffs by execution scope and value tag;
- intentional differences with user-facing explanations;
- standard-library modules at tested support tiers;
- real package suites/workflows passing; and
- representative latency, throughput, memory, startup, and size budgets.

## Value and priority model

Fix root causes, not whichever upstream project has the largest failing file.
Rank work using these questions, in order:

1. Can this produce a silent wrong value, corrupt shared state, hang, or make a
   correct program nondeterministically wrong?
2. Is the behavior common in agent-written code, mathematical library code,
   teaching examples, or package/tooling infrastructure?
3. How many adopted tests, stdlib modules, and real packages does the same root
   cause unblock?
4. Does it improve all hosts, or only emulate an implementation detail on one?
5. Does it also remove a measured performance cliff?
6. Is there a simple, maintainable implementation consistent with the Sage.js
   compiler/runtime architecture?

Use four priority bands:

- **P0 — correctness and trust:** silent wrong answers, state corruption,
  escaping JS exceptions, invalid cache reuse, hangs, or cross-session leakage;
- **P1 — broad usability:** common syntax/object protocols, imports, exceptions,
  diagnostics, pytest/unittest, and high-centrality stdlib blockers;
- **P2 — ecosystem depth:** a well-used package or coherent stdlib family with
  demonstrated workflows;
- **P3 — optional fidelity:** uncommon presentation details, platform-specific
  APIs, or internals with little effect on ordinary code.

Exact CPython exception wording is generally P3. Correct exception type,
chaining, source span, and recognizable message are P1. Exact `repr`, ordering,
hashing, and formatting are higher priority when programs persist or compare
the result.

Maintain a blocker graph from root cause to tests, modules, package suites, and
agent workflows. One descriptor or argument-binding correction which unblocks
traitlets, dataclasses, decorators, and dozens of upstream cases outranks four
isolated compatibility shims.

### Delivery loop: correctness, performance, and applications together

Treat the numbered phases below as workstreams with acceptance gates, not a
waterfall. Start performance and representative package workflows immediately;
do not wait for all upstream suites, all runner types, or full package-suite
qualification. Carry a small negative-diagnostics corpus alongside them.

Repeat this loop in small independently reviewable PRs:

1. Select a bounded upstream tranche or an observed high-value workflow cliff.
2. Reproduce its behavior with exact source, oracle, and artifact identities.
3. Reduce the defect and identify the shared runtime/compiler mechanism.
4. Fix the general rule, retaining fallback, subclass, mutation, and error
   behavior as applicable.
5. Run connected semantic regressions and measure both the isolated mechanism
   and a relevant real workflow. Report no application gain if none is shown.
6. Record remaining limitations, validate the change, commit, and push the PR.

Do not require a speedup from every correctness fix or put every benchmark in
every PR gate. Do require explicit performance consideration for common hot
paths, and make semantic, performance, and workflow evidence independently
visible. A fast path which shrinks a cliff without closing it is useful, but
the remaining cliff remains open.

After the evidence foundation and first RustPython tranche, calls, argument
binding, bound methods, and instance construction are strong candidates for
the next shared-mechanism investigations. Confirm their profiles and package
impact before selecting a particular optimization; this is a priority
hypothesis, not permission to weaken the Python object model.

## Intentional-difference policy

An intentional difference requires a checked record with:

- stable identifier and short title;
- affected Python version, execution mode, and host profile;
- exact upstream cases and current raw failure fingerprints;
- Sage.js behavior and CPython behavior;
- user-visible rationale;
- recommended portable alternative, when one exists;
- correctness, security, performance, and package impact;
- owner/review date and condition for reconsideration; and
- documentation location.

Reasonable categories include:

- V8 garbage collection and weak-finalizer scheduling;
- absence of the CPython C ABI, CPython bytecode, `_testcapi`, and refcount
  observations;
- browser sandbox restrictions on processes, signals, arbitrary files, raw
  sockets, and dynamic native loading;
- host-specific facilities which are capability-gated;
- a safer deterministic behavior chosen and documented by Sage.js; and
- Sage-mode mathematical syntax and types, which must not leak into Python mode.

“Hard to implement,” “the current code does something else,” and “the suite is
large” are backlog explanations, not intentional differences.

## A unified Python compatibility laboratory

Replace suite-specific orchestration with a manifest-driven engine while
retaining the existing MicroPython command as a thin compatibility entry point
until the new engine has exact report parity.

Build the minimum rigorous slice first: provenance and license hashes, exact
oracle/artifact identity, bounded execution, raw outcomes, explicit reviewed
dispositions, and synthetic tests that reject changed failures. Migrate the
existing corpus with reviewed parity, then add an assertion runner for the
first selected RustPython cases. Do not wait for every runner, a comprehensive
dashboard, automatic minimization, or complete inventories to ship that slice.
Add each adapter or reporting abstraction when a selected case needs it. This
staging does not relax isolation or evidence requirements for adopted cases.

Proposed layout:

```text
upstream-tests/python-compat/
  README.md
  manifest.json
  manifest.schema.json
  capabilities.json
  intentional-differences.json
  suites/
    cpython-3.14/
      SOURCE.json
      LICENSE
      selected/
      support/
    pypy/
      SOURCE.json
      LICENSE
      selected/
    rustpython/
      SOURCE.json
      LICENSE
      selected/
    graalpy/
      SOURCE.json
      LICENSES/
      selected/
    ironpython3/
      SOURCE.json
      LICENSE
      selected/
  baselines/
    node-linux-x64.json
    portable.json
  reports/                 # generated and ignored
scripts/
  sync-python-compat.cjs
  run-python-compat.cjs
  explain-python-compat.cjs
  minimize-python-case.cjs
bench/
  python-compat/
    workloads.json
    budgets.json
    run.cjs
```

The unified manifest may refer to the existing
`upstream-tests/micropython` and `upstream-tests/python-packages` paths rather
than moving them immediately. Avoid repository churn which adds no capability.

### Case manifest

Each adopted case records at least:

```json
{
  "id": "rustpython/builtin_dict",
  "suite": "rustpython",
  "upstreamPath": "extra_tests/snippets/builtin_dict.py",
  "sourceSha256": "...",
  "runner": "program",
  "mode": "python",
  "oracle": "cpython-3.14",
  "valueTags": ["containers", "object-model", "agent-core"],
  "capabilities": ["filesystem:temporary"],
  "targets": ["node", "sea", "browser"],
  "timeoutMs": 5000,
  "comparison": "assertion-exit",
  "performanceScopes": ["source-compile", "warm-throughput"],
  "priority": "P1"
}
```

Supported runners should include:

- isolated program with exact stdout/stderr;
- assertion program where clean exit is the semantic oracle;
- selected unittest/pytest node by fully qualified test ID;
- compile-only accepted/rejected syntax;
- normalized AST comparison;
- multi-file package/fixture execution;
- persistent-session sequence for module/cache/state behavior; and
- typed JSON result comparison for values whose display is not the contract.

Normalizers must be narrow and named: temporary paths, process IDs, permitted
hash randomization, or unordered sets only where order is explicitly outside
the tested contract. Never delete exception text broadly or sort arbitrary
output to manufacture a pass.

### Capability profiles

Define capabilities independently of test outcomes. At minimum distinguish:

- `node` and standalone SEA on Linux, macOS, and Windows;
- browser main-thread and browser worker/Wasm execution;
- filesystem read/write/temp/home;
- environment and command-line arguments;
- subprocesses and shell;
- TCP/HTTP/WebSocket/raw socket/network disabled;
- threads/workers/shared memory;
- signals and process control;
- locale, timezone, entropy, and high-resolution clocks;
- native libraries and dynamically loaded extensions; and
- interactive display/Jupyter comm support.

An unavailable declared capability is a structured skip. An undeclared
`ENOENT`, `ReferenceError`, import error, or hang is a test failure.

Expose the same profile to users and agents with a stable JSON command, for
example:

```sh
sagepython --compatibility
sagepython --compatibility --json
sagejs doctor --python --json
```

The precise CLI spelling should be selected once after auditing existing CLI
conventions. Its data must include Sage.js version, Python language target,
`sys.implementation`, host/architecture, supported wheel tags, capability
flags, and a link or installed path to intentional differences.

Audit `sys.implementation`, `sys.version_info`,
`platform.python_implementation()`, packaging environment markers, and wheel
selection together. Sage.js must identify itself as Sage.js while accurately
stating the Python language version it targets. Accept `py3-none-any` artifacts
which satisfy the declared version; reject CPython ABI and incompatible native
wheel tags explicitly.

Land truthful identity and a compact human/machine-readable capability guide
early, alongside the first useful corpus expansion. Start structured errors
with representative syntax, import, and runtime failures; expand callbacks and
other contexts incrementally. Users and agents should not have to wait for the
full diagnostics workstream to discover that this is not CPython or understand
a known unsupported facility. Existing packaging support is the starting point,
not something to replace wholesale.

### Isolation and security

Upstream tests are pinned code, but the runner must still behave like a safe
test harness:

- run each isolated case in a new temporary working directory by default;
- scrub credentials, tokens, cookies, SSH agent variables, and unrelated home
  paths from the environment;
- disable network unless the manifest declares a loopback or external-network
  capability;
- bound time, output bytes, child processes, and retained fixtures;
- never let a test write to the repository or real user home;
- preserve the complete failure artifact outside the console summary;
- terminate process trees rather than only the immediate child; and
- make Windows cleanup and path behavior first-class.

Run broad generated-program and full fuzz campaigns in a rootless container
inside a native VM, not directly in the development container or on a checkout
host. The `bench-1` SSH target is currently a native x86-64 Ubuntu VM with
rootless Podman, 8 CPUs, about 32 GB RAM, and enough disk for a deliberately
small pinned image. Use that facility before installing another container
runtime.

The fuzz image should pin Node, CPython, and the exact Sage.js artifact. Run as
an unprivileged user with a read-only root filesystem, no network, all
capabilities dropped, no-new-privileges, bounded PIDs/CPU/memory/output, and a
size-limited temporary filesystem. Do not mount a developer checkout, home,
SSH agent, credentials, or package cache writable into the container. Copy in
only the immutable corpus/artifact and copy out only structured results and
minimal reducers. Use fresh interpreter processes within bounded container
shards, then destroy each shard. For higher-risk campaigns, use a disposable
VM or restore/recreate the VM after the run; a container is strong
defense-in-depth, not a claim that arbitrary hostile code is harmless.

The development home has automatic rolling read-only snapshots under
`$HOME/.snapshots`, nominally created every 15 minutes. Treat those as a
valuable recovery and audit layer for accidental file damage, never as the
execution sandbox: snapshots do not stop credential disclosure, network
access, resource exhaustion, or damage before the next snapshot. Probe and
record snapshot availability before a campaign—the current `bench-1` home does
not itself expose `$HOME/.snapshots`—and never mount snapshots into the fuzz
container. Keep coherent work committed and pushed so recovery does not depend
on snapshot timing.

Suite synchronization must display additions, deletions, license changes, and
source hashes for review. It must not execute newly discovered upstream files
automatically.

### Developer and agent interface

The common operations should be obvious and fast:

```sh
# Gating, bounded corpus used on ordinary changes.
pnpm test:python:compat

# Full adopted corpus and all eligible hosts available locally.
pnpm test:python:compat:full

# Focus by suite, area, status, package blocker, or test ID.
pnpm python:compat --suite rustpython --tag descriptors
pnpm python:compat --id cpython-3.14/test_descr/DescriptorTests.test_data_descr

# Explain provenance, last outcome, dependent workflows, and disposition.
pnpm python:compat:explain --id rustpython/builtin_dict

# Produce a standalone reducer input without editing the upstream source.
pnpm python:compat:minimize --id rustpython/builtin_dict

# Run behavior-validated performance workloads.
pnpm bench:python:compat
```

Console output should lead with progress, totals, new regressions, newly passing
cases, P0/P1 blockers, and slow outliers. Full traces and machine-readable JSON
belong in report files. A newly passing case should fail baseline checking until
reviewed so that a latent wrong-result or weaker diagnostic is not silently
blessed.

### Fast and trustworthy build/test feedback

Measure the development loop as well as execution speed. Record time spent
compiling, validating, and waiting, and eliminate redundant rebuilds before
scaling the corpus. Start with the existing build receipts and caches rather
than introducing another independent build system.

- Separate artifact freshness from test/corpus/policy freshness. A test-only
  or documentation-only edit should rerun its relevant checks without
  recompiling an unchanged compiler/runtime. If documentation is an input to
  a generated artifact, rebuild that affected artifact, not everything.
- Derive cache identity from the actual source, generators, configuration,
  dependencies, and toolchain used. Retain full source/test identities in
  validation receipts; narrower artifact invalidation must not erase evidence.
- Publish compiler/runtime generations atomically or coordinate readers with
  build completion. A failed or interrupted build must not expose partial or
  mixed-generation outputs as a usable successful build, including on Windows.
- Allow explicit read-only diagnosis of an existing artifact, naming its hash
  and its mismatch with the current source when applicable. Such a report is
  not a current-source qualification gate and cannot bless a release baseline.
- Batch related edits before expensive validation; do not run tests against
  compiler files while self-compilation is replacing them. Show whether each
  phase is building, testing, or reusing verified artifacts and explain misses.

Acceptance includes synthetic invalidation tests: no-op/docs/test-only edits
reuse unaffected artifacts, actual compiler/dependency changes invalidate the
right artifacts, stale qualification fails, and interrupted/concurrent builds
cannot be mistaken for success. Record before/after edit-test timings. Do not
solve this problem by disabling receipts, relaxing gates, or refreshing a
receipt for artifacts which were never rebuilt from their changed inputs.

## From failures to small, durable fixes

For each selected failure:

1. reproduce it under the pinned CPython and Sage.js modes;
2. identify the earliest divergent layer: parser, CST/AST lowering, compiler,
   generated code, runtime primitive, builtin, import system, stdlib, host
   adapter, or diagnostic mapper;
3. reduce it to the smallest ordinary Python program which still demonstrates
   the behavior;
4. add the reduced first-party regression close to the responsible layer;
5. implement the general protocol or semantic rule, not a suite filename or
   package-name special case;
6. re-run every upstream case and package workflow connected in the blocker
   graph;
7. measure source size, startup, import, and hot-path effects; and
8. update the reviewed baseline only after the raw result and disposition are
   understood.

The reducer must preserve imports, multi-file fixtures, and sequencing when
they are essential. It should use syntax-aware transformations rather than
blind line deletion and should emit a command that reproduces both runtimes.

Generated JavaScript and source maps must remain inspectable. Compiler fixes
must preserve Sage/Python mode separation. Mathematical `.py` sources remain
ordinary CPython-parseable code, and source-transparent native compilation
continues to follow `ARCHITECTURE.md`.

## Diagnostics are part of compatibility

Build a dedicated negative corpus from selected upstream invalid programs and
real Sage.js bug reports. Test these separately:

- exception class and inheritance;
- message usefulness, without requiring incidental CPython punctuation;
- filename, source line, start/end positions, and caret range;
- Python call frames in logical order;
- `__cause__`, `__context__`, suppression, notes, groups, and reraising;
- syntax errors during import, `eval`, and `exec`;
- errors in generators, async work, callbacks, widget events, and lazy imports;
- Windows and POSIX path rendering;
- absence of generated-source URLs or raw JavaScript frames in the default
  user traceback; and
- an opt-in developer view which retains the underlying JavaScript details.

Add a stable structured diagnostic format for tools and agents. A JSON record
should include the Python exception type, message, frames, source spans,
cause/context tree, execution phase, host capability failure if any, and a
stable Sage.js diagnostic identifier. Human output remains the default.

Unsupported features should say what is unavailable, on which host, and what
portable alternative exists. “`ReferenceError: display is not defined`” and
raw `spawnSync ... ENOENT` are not acceptable descriptions of a known Python or
host capability boundary.

## Standard-library and package strategy

Do not maximize the count of importable stdlib names. Define support tiers per
module:

- `import-only`: import succeeds, with no substantive claim;
- `core`: common documented operations have focused tests;
- `upstream-selected`: a reviewed set of CPython tests passes;
- `package-qualified`: named unmodified package suites depend on it and pass;
- `host-limited`: behavior is complete only for named capability profiles; and
- `unsupported`: absent by design with an explanation.

Only `core` and stronger tiers should appear as generally supported in user
documentation. Generate the table from checked metadata and test receipts.

Prioritize modules by dependency centrality in desired pure-Python packages,
not alphabetically. Instrument import failures from the package corpus to
produce a graph from a missing name/behavior to blocked packages. Typical early
targets are `collections`, `functools`, `itertools`, `inspect`, `typing`,
`dataclasses`, `enum`, `contextlib`, `pathlib`, `io`, `re`, `json`, `pickle`,
`traceback`, `unittest`, and packaging/importlib metadata.

Advance from smoke scripts to unmodified upstream package tests in a ladder:

1. small zero-dependency foundations: `packaging`, `six`, `attrs`,
   `sortedcontainers`, `decorator`, `tomli`, `idna`, and `more-itertools`;
2. developer and presentation libraries: pytest's supported core, Click,
   Jinja2, Rich, and `typing_extensions` where their dependency closures are
   pure Python;
3. mathematical/data libraries: mpmath, SymPy, NetworkX, and selected
   serialization/data-validation packages;
4. larger application workflows chosen from actual Sage.js users and agents.

This list is a prioritization hypothesis, not a promise to bundle every
package. Package sources and suites should normally be installed into an
isolated test cache and excluded from release artifacts. If a dependency has a
native CPython core with no useful pure-Python path, classify it honestly
rather than creating a package-name stub.

For each qualified package record version, wheel hash, dependency closure,
upstream test selection, expected skips, runtime capabilities, import time,
test time, and loaded size. One end-to-end workflow remains alongside the full
suite because passing internal unit tests does not prove package installation
and public use.

Begin representative workflow probes before full-suite qualification. Keep a
small pinned set covering traitlets/ipywidgets import and object construction,
decorator/dataclass-heavy code, JSON and collection processing, and multi-file
imports. Exercise actual operations and observable results, not just imports.
Pair relevant primitive optimizations with these probes and report cold
import, first useful operation, and warm operation separately. A passing probe
does not upgrade a package to `package-qualified`; the full selected suite and
host receipts are still required for that claim.

## Performance program

Correctness suites are valuable performance workloads only after both runtimes
perform equivalent work. Never time a failing import, an early exception, a
stub, or a different algorithm and call the result a speedup.

### Measurements

Separate at least these costs:

- Tree-sitter parse and CST/AST lowering;
- compiler optimization and JavaScript emission;
- cold source execution;
- precompiled/cached module load;
- first execution in a live session;
- steady-state execution after V8 warmup;
- cold and warm module import;
- attribute lookup, call binding, descriptors, iteration, exceptions, and
  numeric primitives;
- package import and a meaningful package operation;
- peak and retained memory;
- cache bytes, shipped source bytes, SEA bytes, and browser compressed bytes;
  and
- latency under Node, SEA, and browser/Wasm where applicable.

For container operations and other size-sensitive paths, include a small
input-size sweep and allocation measurements where feasible. A single ratio
can hide an accidental quadratic algorithm or allocation pressure that appears
only at larger sizes. Keep these diagnostic measurements distinct from the
uninstrumented timing used to qualify a performance claim.

Report both absolute time and comparison ratio. Ratios become meaningless for
microsecond baselines, while a small ratio can still hide multi-second user
latency. Apply the explicit watch/cliff/critical thresholds in
“Performance compatibility” above, and ratchet only stable representative
workloads. For primitive operations, calibrate an identical loop so CPython's
recorded body takes enough time to measure reliably, then report both total
workload time and estimated time per operation. For import, startup, and first
evaluation, use fresh processes or fresh immutable caches instead of pretending
that repeated reload is the same operation.

A confirmed cliff is a compatibility result and must appear in the same
blocker graph as semantic failures, tagged with its execution scope, absolute
penalty, ratio, affected workflows, suspected root mechanism, and priority.
Closing it requires both a semantic receipt and a before/after performance
receipt. Moving a cost from `cold-import` to `first-call` does not close the
cliff unless the user-visible workflow improves.

### Workload sources

Use four layers:

1. reduced semantic cases which isolate a runtime primitive;
2. compact RustPython, MicroPython, PyPy, GraalPy, IronPython, and CPython
   benchmark/test snippets after behavior validation;
3. a selected portable `pyperformance` subset; and
4. real workflows: compiler bootstrap, pytest collection, importing traitlets
   and ipywidgets, package installation/import, symbolic/matrix code, and PREP
   or interact examples.

Track “agent time” explicitly: fresh CLI startup, first useful evaluation,
import of common modules, test discovery, first failure report, and repeated
edit-run-test cycles.

### Finding root causes

Each performance receipt should be able to attach:

- source/AST size and generated-JavaScript size;
- compiler phase timings;
- module graph and import-cache hits/misses;
- counts for slow generic attribute access, argument binding, iteration,
  exception construction, coercion, and bridge crossings;
- V8 CPU profile/source-map attribution when sampling is enabled;
- allocation and retained-object summaries; and
- the exact behavioral oracle receipt.

Instrumentation must be off or very cheap in production. Compare instrumented
and uninstrumented runs before trusting rankings. Feed source-attributed hot
regions into the existing compiler-development engine rather than building a
second optimization dashboard.

Optimize general mechanisms. The successful class `__dict__` cache, which made
one live read-only path roughly 146 times faster while preserving behavior, is
the model: identify a widespread protocol cost, establish mutation/invalidation
semantics, fix it centrally, and retain focused correctness and performance
ratchets.

### Performance guardrails

- no package-name, test-name, or source-text recognition;
- no cached answer in place of equivalent execution;
- no weaker Python semantics on a fast path;
- no benchmark-specific eager import in the bootstrap runtime;
- no added native dependency without Windows support or an explicit correct
  fallback;
- no size/startup regression hidden by reporting only compressed artifacts;
- no benchmark result without host, revision, Node/Sage.js/CPython versions,
  warmup, samples, variance, and answer equivalence; and
- no performance baseline recorded on a noisy machine when `bench-1` or an
  equivalent idle host is available.

## Keeping the runtime light

Compatibility work must not recreate CPython's distribution footprint.

- Upstream test sources are development inputs and never enter SEA or browser
  release payloads.
- Standard-library modules remain lazy unless startup evidence justifies a
  small bootstrap surface.
- Package qualification installs into disposable or content-addressed test
  caches; it does not bundle the ecosystem.
- The `python-stdlib` package source budget, startup budget, SEA size, browser
  gzip/Brotli budgets, and loaded-memory budgets remain gating ratchets.
- Add a module because it enables coherent user workflows, not solely because
  CPython ships it.
- Prefer a small portable implementation or a JavaScript/Web API adapter where
  semantics are honest. Do not port CPython C internals to satisfy private
  tests.
- Share runtime primitives rather than growing per-package compatibility
  shims.
- Measure dependency closure and first-import cost before promoting a module
  into a default cache.

A compatibility change which adds 500 KiB of lazy test-only source is very
different from one which adds 500 KiB to every browser startup. Reports and
reviews must make that distinction visible.

## Differential and property testing

Once the adopted deterministic suites are stable, add generated cases in
bounded domains:

- expression evaluation across integers, floats (including signed zero, NaN,
  and infinities), complex numbers, strings, bytes, and containers;
- slicing/index normalization, ranges, formatting, and Unicode boundaries;
- function signatures and positional-only/keyword-only/variadic binding;
- class hierarchies, descriptors, reflected operators, and `super`;
- exception nesting, chaining, reraising, and context managers;
- closure/global/nonlocal scopes and comprehensions;
- import graphs with packages, cycles, relative imports, and failures;
- serialization round trips; and
- parser/AST accepted and rejected syntax.

Generate a safe closed AST subset for execution: no external network, arbitrary
paths, unbounded allocation, subprocesses, or wall-clock dependence. Run each
case in an isolated process with deterministic seeds and resource limits. The
closed subset may run as a small routine CI corpus; broad, mutation-based, or
not-yet-reviewed generated programs must run through the rootless
Podman-inside-VM fuzz tier described above. Do not relax that tier merely
because `$HOME/.snapshots` offers recovery from some filesystem mistakes.

Compare typed result trees rather than only `repr` when possible, but test
`repr` separately because interactive work and snapshot tests depend on it.
Preserve every discovered failure as a minimized deterministic regression and
record the generator seed and version.

Use grammar fuzzing and execution fuzzing as separate campaigns. A parser
accepting a program says nothing about safe or terminating execution.

## Phased implementation

The phase numbers identify scope and completion gates, not mandatory serial
execution. Phase 0 and a minimal Phase 1 enable the first adoption loop. Start
build-feedback improvements, identity/basic diagnostics (Phase 5), real-package
probes (Phase 6), and performance work (Phase 7) during that loop. Broaden each
workstream as evidence warrants. No early PR must complete the whole program,
and no early milestone substitutes for the primary definition of done.

### Phase 0 — Freeze policy, provenance, and current evidence

1. Approve the public positioning text and intentional-difference policy.
2. Record current Sage.js, MicroPython, grammar, pytest, package, startup, size,
   and Python hot-path results without changing behavior.
3. Pin the CPython 3.14, PyPy, RustPython, GraalPy, and IronPython revisions
   and exact applicable licenses above.
4. Audit and correct `sys.implementation`, language-version reporting,
   environment markers, and wheel tags for truthfulness; publish the first
   concise capability guide without waiting for full diagnostics coverage.
5. Define capability names and the three-axis semantic/disposition/performance
   vocabulary.
6. Capture build/edit-test timing and establish the artifact-versus-validation
   freshness contract; implement its first safe feedback-loop improvement.

Acceptance:

- all existing MicroPython results survive byte-for-byte in a frozen receipt;
- every upstream input has an exact revision and license;
- no external checkout is needed to reproduce existing gates; and
- the public statement distinguishes Python language compatibility from
  CPython implementation identity.

### Phase 1 — Grow the unified compatibility engine in useful slices

1. Add manifest/schema parsing, isolated execution, CPython oracle capture,
   baselines, filtering, sharding, and JSON reports.
2. Bind existing MicroPython outcomes and reviewed differences to source,
   oracle, and raw-result fingerprints, then register the corpus with exact
   reviewed parity. Reject status-only exceptions once migrated.
3. Add program, assertion, syntax, selected unittest/pytest, package fixture,
   persistent session, and typed-JSON runners.
4. Add capability-aware environment isolation and process-tree cleanup.
5. Add explain and baseline-diff commands with concise console output.
6. Keep old commands as thin entry points only until output/result parity is
   verified, then use the greenfield rule to remove duplicate internals.

The first delivery boundary is fingerprinted MicroPython parity plus the
program/assertion runner needed by the initial RustPython tranche. The other
runner types are later slices of this phase, not blockers for Phase 2.

Acceptance:

- old and new MicroPython classifications agree exactly;
- unclassified drift, newly passing cases, weaker failures, and wrong results
  each fail a synthetic baseline test;
- runner self-tests pass on Linux and Windows path/process conventions; and
- filtered local diagnosis does not require a full compiler rebuild.

Complete the fast-feedback contract above before expanding expensive routine
gates across more suites; diagnostic convenience must preserve source/artifact
qualification boundaries.

### Phase 2 — Adopt RustPython's compact snippets

1. Inventory all 221 functional snippets by feature, dependencies, capability,
   Python version, and value.
2. Vendor the portable/high-value selection unchanged with provenance.
3. Supply only the small fixture/test utility closure each selected snippet
   needs.
4. Run every candidate under CPython 3.14 before assigning Sage.js work.
5. Build the first blocker graph and fix P0/P1 general runtime/compiler defects
   in coherent commits.
6. Retain reduced first-party tests for every fixed root cause.

Acceptance:

- every one of the 221 candidates has a reviewed disposition;
- every adopted case is reproducible without the RustPython checkout;
- all required adopted cases pass, with zero silent wrong results; and
- no fix detects RustPython filenames or packages.

### Phase 3 — Add independent-runtime adversarial cases

1. Inventory the 32 application-level files and portable public-behavior
   `extra_tests` cases from PyPy.
2. Select descriptors, operators, classes/MRO, scopes, generators, exceptions,
   strings/bytes, buffers, and container behavior first.
3. Add a narrow adapter for application-level pytest cases without emulating a
   PyPy object space.
4. Inventory GraalPy's focused pure-Python language tests and interpreter/warmup
   benchmarks; select a first tranche covering calls, arithmetic boundaries,
   classes, closures, descriptors, generators, imports, and scopes.
5. Inventory IronPython's pure test suite; select a first tranche covering
   binding, bigint, classes, names, formatting, imports, and tracebacks.
6. Revalidate every selected behavior with CPython 3.14 and classify
   implementation- or old-version-specific cases explicitly.
7. Fix cross-suite root causes and update the blocker graph.

Acceptance:

- every initial `apptest_*` candidate is reviewed;
- adopted tests run at individual-test granularity;
- the initial GraalPy and IronPython candidate tranches have reviewed
  dispositions and exact per-file licenses;
- no PyPy JIT, Graal/JVM/C-extension, or CLR/.NET dependency enters the Sage.js
  runtime; and
- fixes preserve the MicroPython and RustPython gates.

### Phase 4 — Adopt selected CPython 3.14 tests

1. Build a selector at fully qualified unittest/pytest test ID granularity.
2. Implement the minimal honest `test.support` subset and structured skips.
3. Adopt language/builtins/object-model/import families before stdlib breadth.
4. Add selected tests for each currently documented stdlib module.
5. Split exact public semantics from diagnostic wording and implementation
   internals.
6. Generate a non-gating CPython-main grammar/AST delta report.

Acceptance:

- selected tests run unchanged except for declared harness wrappers;
- every helper and skip reports why it exists;
- no `_testcapi`, CPython bytecode, refcount, or GIL emulation is introduced;
- module support tiers cite exact passing upstream selections; and
- the 3.14 gate is unaffected by changes on CPython `main`.

### Phase 5 — Make failures excellent

Start the identity/capability guide and small syntax/import/runtime negative
corpus during Phases 0–2. This phase's full gate extends that early contract.

1. Establish the negative diagnostics corpus.
2. Correct source spans, exception translation/chaining, import errors, and
   async/callback tracebacks.
3. Hide generated JS stacks by default while retaining an opt-in developer
   view.
4. Add structured JSON diagnostics and stable identifiers.
5. Add the user/agent compatibility and capability command.
6. Document portable alternatives for every user-facing intentional difference
   and unsupported capability.

Acceptance:

- representative syntax, import, runtime, callback, and package failures show
  Python source and Python exception structure;
- no adopted P1 workflow exposes an unclassified raw JavaScript exception;
- machine-readable diagnostics round-trip on all four release platforms; and
- known unsupported behavior fails before partial side effects when practical.

### Phase 6 — Qualify standard-library and package value

Start meaningful public-workflow probes and their timings during the first
adoption loop; full-suite breadth below follows demonstrated package value.

1. Generate the stdlib support-tier table and import dependency graph.
2. Use real package failures to select high-centrality stdlib work.
3. Expand each current smoke workflow into a meaningful upstream test subset.
4. Add packages from the value ladder only with an end-to-end workflow and
   isolated package receipt.
5. Keep package source/test caches out of release payloads.
6. Feed every general semantic fix back into the language corpus.

Acceptance:

- documentation distinguishes import-only from tested support;
- every qualified package has a pinned, reproducible suite and public workflow;
- package skips are capability-specific and reviewed;
- native/CPython-only wheels are rejected with useful guidance; and
- startup, source, browser, SEA, and retained-memory budgets remain green.

### Phase 7 — Turn compatibility workloads into a performance engine

This is an ongoing workstream, not the seventh step to begin. Reuse the
delivered warm-workload laboratory and primitive fixes; next add package-level
and cold/import/first-call evidence rather than rebuilding the dashboard.

1. Add behavior-gated phase timings and warm/cold execution modes.
2. Implement the 5-fold watch, 10-fold/default, interactive-latency, 50-fold
   critical, and same-runtime regression policies above; calibrate their noise
   allowances on `bench-1` without weakening the stated thresholds.
3. Add selected portable upstream and `pyperformance` workloads.
4. Profile compiler bootstrap, pytest, traitlets/ipywidgets, and package imports.
5. Attach source-attributed dossiers to the existing compiler optimization
   engine.
6. Fix shared hot paths with invalidation/correctness tests and representative
   budgets.

Acceptance:

- every benchmark verifies equivalent behavior before timing;
- parse, compile, load, first, and warm costs are reported separately;
- every confirmed 10-fold or interactive cliff appears as a compatibility
  blocker rather than only a benchmark row;
- the dashboard identifies root mechanisms and affected workflows;
- at least one independent rerun confirms each promoted major speedup; and
- no optimized path weakens the adopted semantic corpus.

### Phase 8 — Add generated differential testing

1. Introduce bounded parser generation and safe execution AST generation.
2. Compare typed results and exception structures with CPython 3.14.
3. Minimize and permanently retain each unique failure.
4. Add import-graph and stateful-session generation.
5. Build the pinned rootless Podman fuzz image and resource/network policy on
   `bench-1`.
6. Run larger seeded campaigns outside ordinary PR CI, retaining only
   structured receipts and minimized reproducers.

Acceptance:

- fixed seeds are reproducible on Linux, macOS, and Windows;
- generator time/resource bounds are enforced;
- duplicate failures cluster by stable root fingerprint;
- no fuzzed program can access credentials, the real home, or external network;
  and
- recovery does not depend on `$HOME/.snapshots`, though available snapshots
  and pushed commits provide an additional recovery trail.

### Phase 9 — Four-platform and browser qualification

1. Run the portable required corpus on Linux x64, Linux arm64, macOS arm64, and
   Windows x64 persistent hosts.
2. Run the declared browser subset through the production Wasm/app evaluator,
   not a Node-only simulation.
3. Compare host capability profiles and ensure skips are intentional.
4. Qualify the exact release candidate as required by `RELEASE.md`.
5. Publish generated compatibility, difference, stdlib, package, and
   performance summaries.

Acceptance:

- portable semantics agree across all four native platforms;
- browser differences correspond exactly to documented capability flags;
- no release depends on `/home/user/upstream` or a host CPython installation;
- all P0/P1 required cases pass with zero unclassified outcomes; and
- release receipts include startup, size, import, and representative warm
  performance budgets.

### Phase 10 — Sustainable updates

1. Add an explicit upstream-update command and review report.
2. Schedule non-gating CPython-main grammar reports and periodic stable-suite
   update proposals.
3. Require every Python semantic bug fix to add a minimal first-party test and,
   when available, connect an upstream case.
4. Retire redundant bespoke regressions only when provenance and failure
   localization remain at least as good.
5. Revisit intentional differences on language-target changes and major host
   capability improvements.

Acceptance:

- updating an upstream pin is a bounded review, not a repository-wide surprise;
- case additions/deletions and changed oracle outcomes are explicit;
- historical performance receipts remain comparable or carry a schema/version
  boundary; and
- compatibility documentation is generated from current tested evidence.

## Test and CI policy

Use several time budgets rather than putting every suite in every command:

- **change-focused:** reducer plus directly connected first-party/upstream cases;
- **routine PR:** MicroPython, core RustPython/PyPy/GraalPy/IronPython/CPython
  selections, negative diagnostics, and key package workflows;
- **full PR/pre-merge:** all adopted cases and supported package suites on the
  primary Linux host;
- **nightly:** generated tests, full selected package suites, alternate
  reference reports, browser cases, and performance outlier discovery;
- **release:** exact candidate on the persistent four-platform hosts plus
  production browser artifacts.

Shard only after deterministic case isolation works. Record the complete
manifest hash and merge shard receipts before declaring success. A skipped or
timed-out shard is not a pass.

CI must fail on:

- a required regression;
- any new silent wrong result;
- an unclassified adopted outcome;
- an old intentional difference with a changed raw fingerprint;
- a newly passing result awaiting review;
- a missing upstream license/provenance/hash;
- an undeclared network/process/home access;
- a ratcheted startup, size, memory, or stable performance regression;
- a confirmed required-workflow performance cliff which disappears from the
  report without a reviewed resolution; or
- disagreement between source and cached/precompiled execution.

## Risks and mitigations

### The project optimizes a pass percentage instead of user value

Mitigation: publish capability areas, package workflows, blockers, differences,
and performance—not one score. Select tests at case granularity and require
value tags and priority.

### CPython's internal harness becomes a shadow dependency

Mitigation: adopt only reviewed public-behavior cases and the minimal support
closure. Treat `test.support` as test infrastructure, never a runtime API.

### Alternative runtimes pull Sage.js toward conflicting quirks

Mitigation: use them as case authors. Revalidate portable behavior with pinned
CPython 3.14 and make Sage.js's own intentional decisions explicit.

### Baselines hide regressions

Mitigation: separate raw outcome from reviewed disposition and bind every
exception to source/oracle/outcome fingerprints. Newly green is review-worthy,
not automatically accepted.

### Infrastructure and rebuilds consume the useful-work budget

Mitigation: deliver the smallest safe evidence/runner slice required by the
next corpus tranche, track edit-test latency, separate artifact freshness from
validation freshness, and publish outputs safely. Keep full inventories and
runner coverage as completion requirements, not prerequisites for the next
general Python fix. Prefer small reviewed PRs to a long harness-only project.

### Compatibility adds unacceptable startup or distribution weight

Mitigation: keep suites/test packages out of releases, keep stdlib lazy, retain
package/source/startup/SEA/browser/memory ratchets, and require a workflow for
each shipped module.

### Package shims replace language correctness

Mitigation: prohibit package-name/source recognition, maintain the blocker
graph, reduce failures, and fix the earliest general semantic layer.

### Exact CPython wording consumes effort without value

Mitigation: distinguish exception structure and useful diagnostics from
incidental punctuation. Require exact text only when documented or consumed by
real tooling.

### Performance work weakens semantics

Mitigation: behavior probes precede benchmarks, fast and generic paths run
differential tests, and optimizations include mutation/invalidation cases.

### Ratio noise labels trivial microseconds incompatible

Mitigation: require both the 10-fold ratio and 100 ms representative absolute
penalty, provide a separate interactive-latency rule, confirm on an idle host,
and classify 50-fold cases separately. Keep the 5-fold watch list visible
without presenting it as failed compatibility.

### Cross-platform skips conceal Unix assumptions

Mitigation: capabilities are declared before execution, Windows is first-class,
and portable cases must agree across the release matrix.

### Fuzzing executes dangerous or unbounded programs

Mitigation: separate grammar from execution generation, use a closed safe AST,
scrub environments, isolate directories/processes, and enforce strict bounds.
Run broad campaigns in rootless Podman inside a native VM with no writable
checkout or credentials. Treat rolling read-only home snapshots as recovery,
not containment.

### Agents learn stale or overstated capabilities

Mitigation: generate human and JSON compatibility reports from current receipts
and make runtime implementation/language/capability identity queryable.

## Primary definition of done

This program's first major completion point is reached when:

1. one manifest-driven engine runs the existing MicroPython corpus plus the
   reviewed RustPython, PyPy, GraalPy, IronPython, and selected CPython 3.14
   cases;
2. every adopted case has exact provenance, license, value tags, capabilities,
   semantic outcome, reviewed disposition, and applicable performance status;
3. all required P0/P1 cases pass on their declared targets, with zero silent
   wrong results and zero unclassified outcomes;
4. the agent usability workflows above have end-to-end regression tests;
5. Python failures have useful Python tracebacks and a structured diagnostic
   form, with no unexplained JavaScript leakage in required workflows;
6. `sys`/`platform`/packaging identity tells the truth: Sage.js is the
   implementation, Python 3.14 is the language target, and only compatible
   wheels are accepted;
7. a generated stdlib support table and package qualification matrix cite
   current test receipts rather than aspiration;
8. selected real package suites—not only smoke examples—pass in isolated,
   reproducible environments;
9. compatibility workloads produce behavior-gated parse/compile/load/first/warm
   performance evidence and have driven general measured improvements;
10. no `agent-core`, package-foundation, teaching, or common mathematical
    workflow retains a confirmed default or critical performance cliff without
    an explicit reviewed product decision, and every remaining cliff is
    published by execution scope;
11. broad generated-program campaigns run in the container-inside-VM safety
    tier and produce reproducible minimized cases without access to real homes,
    credentials, or external networks;
12. test sources and package caches add nothing to shipped payloads, and all
    existing startup, size, architecture, and memory gates remain satisfied;
13. the portable corpus is qualified on Linux x64, Linux arm64, macOS arm64,
    and Windows x64, with a real-browser subset; and
14. README, website, CLI help, and machine-readable capability output use the
    independent-implementation wording and link every intentional difference.

Completion does **not** mean that every CPython test passes, every standard
library module exists, native CPython wheels load, or no differences remain. It
means that Sage.js has a rigorous, high-value, sustainable method for deciding
what Python behavior to implement, proving that behavior, making failures
pleasant, and continuously finding the compiler/runtime improvements with the
largest payoff.

## Recommended next milestones

The first language fixes, warm-performance laboratory, slicing, and dictionary
improvements are already separate PRs. Preserve them and continue with small
tested, pushed PRs rather than restarting or accumulating a mega-change:

1. Finish source/oracle/raw-outcome-bound evidence, migrate the existing
   MicroPython baseline with reviewed parity, and freeze honest current results.
2. Improve build/test freshness and safe artifact publication using measured
   edit-test costs and invalidation/concurrency regressions. Land independently
   of language changes; do not make every harness feature a prerequisite.
3. Land truthful implementation/capability identity and the first small
   structured negative-diagnostics slice.
4. Adopt the first useful RustPython builtins/protocol tranche with the minimum
   program/assertion engine. Extend the inventory incrementally to all 221
   candidates; do not require complete inventory before fixing adopted cases.
5. Establish pinned package/workflow probes with separate import/first/warm
   timings. Then pair the next high-fanout semantic or performance fix—likely
   calls, argument binding, or construction—with those probes. Keep the
   existing 5x/10x/50x policies and absolute-time floors unchanged.
6. Repeat that adoption/fix/measure/ship loop with PyPy descriptors/operators/
   scopes and focused GraalPy, IronPython, and CPython selections. Add adapters
   when a selected tranche actually needs them.
7. Expand the highest-value package probes into selected upstream suite
   qualification and broaden diagnostics, cold-start, and allocation/scaling
   coverage alongside demonstrated needs.
8. Independently confirm major speedups and close real high-value cliffs;
   publish unresolved ones rather than declaring them solved by relative gains.
9. Finish the remaining engine, suite, generated-testing, and four-platform/
   browser gates in the primary definition of done.

Milestones 2, 3, and initial workflow measurements can progress alongside the
first adoption tranche when file ownership and build coordination allow it.
Keep each PR valuable independently: the objective is ordinary Python that is
correct, understandable, useful, and fast—not infrastructure breadth, a pass
percentage, or a green dashboard obtained by weakening the rules.
