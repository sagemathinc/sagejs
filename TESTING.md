# Testing Sage.js

Sage.js uses Node's built-in `node:test` runner as its host-level test
framework. Tests which exercise compiled Python, native libraries, subprocesses,
or browsers keep the harness appropriate to that boundary, but report through
named and independently selectable tests whenever practical.

## Routine validation

```sh
pnpm test
```

This is the bounded validation plan used by routine CI. It prints the complete
plan before starting, labels every phase, reports expected and elapsed time,
emits a heartbeat every 20 seconds, and stops at the first failed phase. It
covers architecture boundaries, a build, startup, strict Python checks, portable
unit tests, and a representative public-API smoke suite. It deliberately does
not compile every optional native dependency or run compatibility, performance,
and evidence corpora.

Use exhaustive validation before a release or after a broad native change:

```sh
pnpm test:full
```

The full plan adds the compiler corpus, every unit and integration file, native
addon validation, generated documentation, and CoWasm compatibility. Release
tags, manual CI dispatches, and the weekly scheduled workflow also run the full
cross-platform native and SEA matrix.

## Focused development commands

```sh
pnpm test:unit
pnpm test:compiler
pnpm test:integration
pnpm test:native
```

For a focused change, `pnpm test:changed` examines the diff from `origin/main`
and runs a deterministic conservative subset. Use `--base REF` to select a
different merge base or `--list` to inspect the commands without running them.
Native-source changes rebuild the addon before its tests.

Parallel project work records reproducible final checks with:

```sh
pnpm parallel:run -- PROJECT_ID -- pnpm test:native
```

The receipt contains the exact command, result, duration, host platform,
commit, and workspace fingerprint. See
[`PARALLEL-DEVELOPMENT.md`](PARALLEL-DEVELOPMENT.md).

- `test:unit` covers JavaScript and TypeScript components without starting the
  full evaluator.
- `test:compiler` compiles every top-level `test/*.py` file into an isolated VM
  and registers the file as a named `node:test` case.
- `test:integration` covers the CLI, embeddable kernel, plotting, NumPy,
  symbolic expressions, and polyglot sessions.
- `test:native` covers the native FLINT binding and its Sage-facing boundary.

The Node test tiers run in small file batches. The runner reports completed and
remaining files after each batch, estimates the remaining duration, and does not
start later batches after a failure. Override the defaults when diagnosing an
individual machine:

```sh
pnpm test:integration -- --batch-size 4 --heartbeat-seconds 10
SAGEJS_TEST_BATCH_SIZE=1 SAGEJS_TEST_HEARTBEAT_SECONDS=5 pnpm test:unit
```

Noninteractive reporters such as JUnit use one batch by default so they produce
one document. Set `SAGEJS_TEST_BATCH_SIZE` explicitly if separate documents are
desired.

The historical command

```sh
sagejs test
```

remains supported. It uses the same compiler-test harness and is useful when
debugging the compiler directly.

## Selecting one test

Node test-runner arguments can be passed through the pnpm commands:

```sh
pnpm test:compiler -- --test-name-pattern=matrix
pnpm test:unit -- --test-name-pattern=magma
pnpm test:integration -- --test-name-pattern=graphics
```

Set `SAGEJS_TEST_REPORTER` to select another Node reporter:

```sh
SAGEJS_TEST_REPORTER=tap pnpm test:unit
SAGEJS_TEST_REPORTER=junit pnpm --silent test:integration > results.xml
```

## Specialized compatibility suites

Some suites deliberately retain purpose-built runners:

```sh
pnpm test:python:conformance
pnpm test:matrix:corpus
pnpm test:rh
pnpm test:cowasm
```

These runners model oracle output, manifests, intentional incompatibilities,
expected failures, and performance budgets. They are compatibility or benchmark
corpora rather than ordinary unit tests.

## Adding tests

Prefer:

- focused `node:test` cases for JavaScript, TypeScript, native-binding, and
  host-integration behavior;
- ordinary CPython-parseable `.py` files for compiler and mathematical-library
  behavior;
- an upstream doctest or corpus fixture when compatibility with an external
  implementation is the point of the test;
- deterministic seeds for randomized mathematics;
- explicit cleanup of sessions, workers, temporary directories, and browser
  processes.

Keep individual tests independent. File-level parallel execution and process
isolation are intentional; a test must not depend on another test having run
first.

## CI policy

Routine pushes first run the same bounded `pnpm test` plan on Linux x64. Only
after it passes does a fail-fast matrix perform lightweight build and API smoke
checks on Linux arm64, macOS arm64, and Windows x64. Expensive native dependency
builds, complete integration corpora, SEA packaging, and release artifacts are
reserved for tags, manual runs, and the weekly schedule. A new push cancels an
older run for the same branch.
