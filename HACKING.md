# Developing Sage.js

## Source layout

- `src/` contains the self-hosting compiler and small Python-like standard
  library. Most compiler sources are themselves written in the language that
  Sage.js compiles.
- `tools/` contains the TypeScript and JavaScript CLI, REPL, bootstrap, lint,
  test tooling, and the experimental typed native-kernel compiler.
- `bootstrap/` is the checked-in compiler required to build from a clean clone.
- `dist/compiler/` is the newly self-compiled compiler.
- `dist/tools/` is generated from `tools/` by TypeScript.
- `test/` contains the language test suite and CLI smoke tests.
- `packages/flint/` is the optional native FLINT Node-API experiment.
- `bench/` contains process-startup and Sage/Sagelite arithmetic benchmarks.

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

The default checks intentionally do not compile FLINT. Native mathematics must
remain optional so language development and installation stay fast. Build and
test the native workspace explicitly:

```sh
pnpm --dir packages/flint build
pnpm test:native
pnpm bench:arithmetic
```

`src/baselib/algebra.py` contains the small low-level parent/coercion kernel
and JavaScript/native adapters. Keep its raw JavaScript escape block small.
Mathematical parents, elements, and algorithms should normally be ordinary
Sage.js source; `src/baselib/finite_fields.py` is the first complete example.
The coercion resolver is responsible for both operand maps and may construct a
common parent such as `QQ[x]`; do not reintroduce asymmetric `__radd__`
dispatch for mathematical elements.

`@ρσ_lightweight_math_class` is an internal compile-time annotation for hot,
immutable element classes. It omits the generic eagerly allocated object
identity slot; use it only when profiling demonstrates construction overhead
and the type supplies its own representation and mathematical identity
semantics. The identity decorator implementation in `finite_fields.py` keeps
the source bootstrappable by older checked-in compilers.

`tools/native-kernel/` contains Native Kernel v0. The frontend lowers a
restricted Sage.js AST to typed IR; independent JavaScript and C/MPC backends
consume that IR. Generated addons and `packages/flint` share the native
MPFR/MPC element ABI in `packages/flint/include/sagejs/native.h`. Keep ABI
changes explicit and versioned, and preserve a JavaScript fallback for every
supported kernel.

## Modes

The same parser supports two intentional modes:

- `sagejs` enables all currently implemented Sage-style syntax.
- `sagepython`, or `sagejs --python`, uses Python-like syntax.

When adding syntax, add tests for both its enabled and disabled behavior.
Sage generator declarations such as `R.<x> = ZZ[]` are recognized in
`statement()` and lowered to ordinary assignment nodes; they are not a
textual preprocessing pass. Keep the contextual meaning of empty brackets
isolated from normal indexing syntax.

## Bootstrap changes

Normal compiler development does not require changing `bootstrap/`: an older
compiler builds the new compiler. Update the bootstrap artifacts only when a
source change cannot be parsed by the existing bootstrap compiler. Such
updates should be isolated and carefully reviewed.

## Generated files

Do not edit `dist/` manually. It is ignored by git and completely recreated by
the build.
