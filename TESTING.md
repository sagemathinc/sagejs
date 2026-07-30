# Testing Sage.js

Sage.js uses Node's built-in `node:test` runner as its host-level test
framework. Tests which exercise compiled Python, native libraries, subprocesses,
or browsers keep the harness appropriate to that boundary, but report through
named and independently selectable tests whenever practical.

## Fast development commands

```sh
pnpm test:unit
pnpm test:compiler
pnpm test:integration
pnpm test:native
```

- `test:unit` covers JavaScript and TypeScript components without starting the
  full evaluator.
- `test:compiler` compiles every top-level `test/*.py` file into an isolated VM
  and registers the file as a named `node:test` case.
- `test:integration` covers the CLI, embeddable kernel, plotting, NumPy,
  symbolic expressions, and polyglot sessions.
- `test:native` covers the native FLINT binding and its Sage-facing boundary.

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

## Full validation

```sh
pnpm test
```

This builds Sage.js, runs strict baselib checks, the compiler and host suites,
the pinned upstream Sage corpus, and the CoWasm compatibility benchmarks.
