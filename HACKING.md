# Developing Sage.js

## Source layout

- `src/` contains the self-hosting compiler and small Python-like standard
  library. Most compiler sources are themselves written in the language that
  Sage.js compiles.
- `tools/` contains the TypeScript and JavaScript CLI, REPL, bootstrap, lint,
  and test tooling.
- `bootstrap/` is the checked-in compiler required to build from a clean clone.
- `dist/compiler/` is the newly self-compiled compiler.
- `dist/tools/` is generated from `tools/` by TypeScript.
- `test/` contains the language test suite and CLI smoke tests.

## Build

```sh
pnpm install --frozen-lockfile
pnpm build
```

The build removes `dist/`, copies the bootstrap compiler into it, compiles the
tooling, and then repeatedly recompiles the compiler until its source and
compiler signatures agree.

Run every check with:

```sh
pnpm test
```

Inspect the exact npm payload with:

```sh
pnpm pack --dry-run
```

## Modes

The same parser supports two intentional modes:

- `sagejs` enables all currently implemented Sage-style syntax.
- `sagepython`, or `sagejs --python`, uses Python-like syntax.

When adding syntax, add tests for both its enabled and disabled behavior.

## Bootstrap changes

Normal compiler development does not require changing `bootstrap/`: an older
compiler builds the new compiler. Update the bootstrap artifacts only when a
source change cannot be parsed by the existing bootstrap compiler. Such
updates should be isolated and carefully reviewed.

## Generated files

Do not edit `dist/` manually. It is ignored by git and completely recreated by
the build.
