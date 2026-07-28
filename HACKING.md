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

The modules in `pyrightconfig.json` are the strict mathematical baselib. They
must parse as ordinary Python, contain no verbatim JavaScript or implicit
global declarations, and pass pinned Ruff and Pyright checks. Run
`pnpm test:baselib:strict`; add a migrated module to the config's `include`
list only when it has a clean zero-error baseline. See
[`TYPING.md`](TYPING.md) for the annotation policy. Types describe useful
program structure, but should not attempt to statically encode value-dependent
parents or Sage's runtime coercion graph.

`@ρσ_lightweight_math_class` is an internal compile-time annotation for hot,
immutable element classes. It omits the generic eagerly allocated object
identity slot; use it only when profiling demonstrates construction overhead
and the type supplies its own representation and mathematical identity
semantics. The no-op decorator definition in `finite_fields.py` keeps the
source bootstrappable by older checked-in compilers: they treat it as an
ordinary decorator, while the converged compiler consumes it at compile time.

`@ρσ_bigint_fields(...)` declares the named private storage fields to be
JavaScript BigInts. Method argument annotations then let the compiler lower
arithmetic between those fields directly to JavaScript operators. This is a
narrow compile-time contract, not a runtime type assertion or a general
license to use JavaScript arithmetic. The no-op decorator fallback lets an
older bootstrap compiler complete the first self-build; the converged compiler
consumes the annotation and emits the specialized code.

`@ρσ_sequence_class` is the corresponding narrow contract for a class whose
instances implement numeric `__getitem__`, `__setitem__`, and `__len__`
semantics. The compiler applies the shared callable sequence adapter after the
class is complete. This keeps dynamic calls to a base-library class and direct
JavaScript bracket access compatible with the Python methods without embedding
a bespoke `Proxy` implementation in each mathematical module.

`@ρσ_callable_instance_class` supports mathematical parents whose instances
are simultaneously ordinary class instances and callable element
constructors. The shared adapter creates a callable function object with the
class prototype, then runs the normal generated constructor on it. Parent
classes can consequently be written using ordinary `class`, `__init__`, and
`__call__` syntax instead of hand-assembling JavaScript function objects.

Low-level operations used by mathematical source belong to the explicit
compiler-intrinsic namespace:

```py
import sagejs.runtime as runtime

product = runtime.operator_mul_exact(left, right)
backend = runtime.flint_backend()
```

The compiler validates every attribute against a small manifest, erases the
import, and lowers the attribute directly to its internal runtime global.
Thus generated JavaScript has no module allocation or property-lookup cost.
Keep `src/baselib/sagejs/runtime.py` in sync with the manifest: it is the
ordinary source implementation used when the checked-in older compiler
bootstraps a new compiler. This Python-shaped boundary is also the intended
starting point for a future CPython compatibility package. For now, use the
explicit `import sagejs.runtime as runtime` form; wildcard and `from` imports
are deliberately unsupported.

Verbatim `v` expressions are appropriate in the runtime substrate and
JavaScript/native adapters. Mathematical library code should not use them to
work around compiler performance gaps: add a focused, tested compiler contract
instead. `test/typed-math-lowering.cjs` guards the generated fast path, while
`test/baselib-boundaries.cjs` prevents escape syntax from returning to
mathematical modules which have been migrated.

`tools/native-kernel/` contains Native Kernel v0. The frontend lowers a
restricted Sage.js AST to typed IR; independent JavaScript and C/MPC backends
consume that IR. Generated addons and `packages/flint` share the native
MPFR/MPC element ABI in `packages/flint/include/sagejs/native.h`. Keep ABI
changes explicit and versioned, and preserve a JavaScript fallback for every
supported kernel. Native argument and result types come from the function's
ordinary annotations; do not add a second signature table to build
configuration.

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
