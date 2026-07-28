# Types and strict mathematical source

Sage.js mathematical library code should look like maintainable Python. Its
type annotations serve three related purposes:

1. help humans and coding agents understand local program structure;
2. catch ordinary interface mistakes with standard Python tooling;
3. provide compiler facts for optimizations and optional native lowering.

They are not an attempt to encode the complete Sage parent and coercion model
in a static programming-language type system. A value's precise mathematical
parent is often dynamic, and the common parent of two operands may be neither
input parent. Use `Any` deliberately at those boundaries instead of rebuilding
Sage's runtime mathematics as a tower of generic types.

## Strict baselib

The modules listed in `pyrightconfig.json` form the initial strict baselib:

- `factorization.py`
- `finite_fields.py`
- `polynomial.py`

Each listed module must:

- parse unchanged with CPython's `ast` module;
- contain no verbatim JavaScript `v"..."` escape;
- use explicit imports instead of `# globals` declarations;
- annotate every function argument and return value;
- pass the pinned Ruff and Pyright checks with no baseline suppressions;
- continue to compile through both the checked-in bootstrap compiler and the
  converged compiler.

Run all three checks with:

```sh
pnpm test:baselib:strict
```

The command uses the pnpm-pinned Ruff WebAssembly package and Pyright, so it
does not depend on globally installed Python lint tools. It also asks CPython
itself to parse every strict module. `pnpm test` runs this check by default.

When migrating another mathematical module, first make it ordinary Python,
add focused Sage.js behavior tests, then add its path to the
`pyrightconfig.json` `include` list. That one list also drives the source
boundary regression test and Ruff runner.

## Runtime boundaries

Low-level operations which cannot be expressed honestly as portable Python
belong behind an explicit namespace:

```py
import sagejs.runtime as runtime

value = runtime.integer_bigint(value)
backend = runtime.flint_backend()
```

The Sage.js compiler validates and erases these accesses, lowering them to
direct runtime operations without allocating a module or performing a
property lookup. Stub files under `src/baselib/sagejs/` describe this boundary
to Pyright and provide a starting contract for a future CPython compatibility
package.

Do not hide a new escape inside mathematical source merely to silence a tool
or win a microbenchmark. Add a small named runtime intrinsic or a documented
compiler contract, test its lowering, and give it an honest stub.

## Compiler-bearing annotations

Most annotations are documentation and static checks only. A few deliberately
carry compiler meaning:

- Native Kernel reads simple argument and return annotations such as
  `ComplexField`, `ComplexNumber`, and `uint64` directly from the Sage.js AST.
- decorators in `sagejs.runtime` declare narrow object-layout or callable
  contracts used by the JavaScript backend.
- selected scalar annotations may guide safe arithmetic specialization.

Compiler-bearing annotations must remain explicit, narrow, and tested. The
compiler should reject unsupported or missing facts rather than guess from a
mathematical value at runtime. Adding compiler meaning to a broadly used
annotation is a language change and requires regression tests for both Sage
and Python modes.

Implementation `.py` files use ordinary Python syntax. User-facing `.sage`
files may additionally use mathematical syntax such as `R.<x> = ZZ[]`; a
future `.sage`-to-`.py` command can provide the same transition SageMath uses
when exploratory code becomes library code.
