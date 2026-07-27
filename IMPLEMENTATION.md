# Sage.js implementation strategy

## Decision

Write most mathematical library code in Sage.js itself, with Sage-compatible
parents, elements, coercions, and immutable public semantics.

Compile stable performance-critical functions through typed IR to native
kernels. The native compiler should automatically use mutable, non-escaping
temporaries and call FLINT, MPFR, MPC, PARI, Singular, and other C libraries
directly. Cross Node-API once per algorithm, not once per scalar operation.

C is the initial generated backend because the mathematical libraries already
have C APIs and C data models. C++, Rust, and WASM can be additional backends
where they provide a concrete advantage; they should not complicate the
Sage.js source language or mathematical semantics.

In short:

> **Maintain algorithms in Sage.js; lower hot kernels to native library calls.**

## Evidence

The matched 53-bit MPFR multiplication benchmark measures the same
`mpfr_mul` operation behind several implementation models:

| Implementation | Time/multiplication | Relative to native kernel |
|---|---:|---:|
| Sage.js scalar Node-API | 1204 ns | 97.0x |
| SageMath/Cython | 128.3 ns | 10.3x |
| Julia `BigFloat` | 95.8 ns | 7.7x |
| Julia explicit in-place MPFR | 20.7 ns | 1.7x |
| Sage.js generated C kernel | 12.4 ns | 1.0x |

Sage.js, SageMath, and Julia all reported MPFR 4.2.2 and GMP 6.3.0.

The result is precision-dependent. At 10,000 bits the cost of MPFR/GMP
dominates, separately built native libraries become a significant variable,
and SageMath was faster than the current generated addon. “AOT is ten times
faster” is therefore a small-operation result, not a universal constant.

The architectural conclusion is much stronger than that particular ratio:

> The dominant avoidable cost is scalar allocation and language/native
> boundary placement. A JIT alone cannot remove that cost for opaque,
> finalizable native objects.

Julia's idiomatic loop is faster than Cython at 53 bits, demonstrating the
value of a typed JIT implementation language. It nevertheless allocates about
80 bytes per product. Julia's explicit in-place MPFR loop removes essentially
all allocation and approaches the generated C kernel. Native Kernel v0 obtains
the same optimization automatically from ordinary immutable source because
its typed IR knows that the loop temporary cannot escape.

See [`bench/MPFR-BENCHMARK.md`](bench/MPFR-BENCHMARK.md) for methodology,
large-precision results, allocation measurements, and reproduction commands.

## Layers and implementation languages

| Layer | Default implementation | Reason |
|---|---|---|
| User-facing mathematics | Sage.js source | Sage-compatible, readable, fast to write and review |
| Parents, coercions, representations | Sage.js runtime | One semantic model shared by JavaScript and native backends |
| Typed analysis and lowering | Sage.js/TypeScript compiler tooling | Close to the language frontend and easy to test |
| Generated mathematical kernels | C | Direct fit for existing library APIs, minimal runtime, easy inspection |
| Native ABI and primitive bindings | Small C or Rust shims | Explicit ownership and stable Node-API boundary |
| New low-level algorithms | Existing libraries first; then C++, Rust, or C as appropriate | Choose by ecosystem and algorithm, not one project-wide ideology |

Rust is attractive for hand-maintained ownership-heavy runtime code. It does
not by itself make MPFR or FLINT calls faster, and a Rust backend would still
cross their C APIs. Generated C is currently the shortest path from typed IR
to the libraries Sage.js needs.

Embedding Julia as Sage.js's implementation runtime would duplicate runtimes,
packaging systems, object models, and startup costs. The Julia benchmark is
valuable because it validates the compiler architecture, not because Sage.js
should depend on Julia.

## Native-kernel contract

A native-compilable Sage.js function should have:

1. explicit or inferable parent and element types;
2. a backend-independent typed IR;
3. a JavaScript implementation used as fallback and semantic oracle;
4. generated native code using the same rounding, coercion, and exception
   semantics;
5. escape and alias analysis before any in-place mutation;
6. standard Sage.js elements at its public boundary;
7. a content-addressed build keyed by source, types, compiler, native ABI,
   libraries, platform, and Node ABI;
8. correctness tests against the JavaScript backend and Sage;
9. representative performance tests at several operand sizes.

Generated source and binaries are disposable artifacts. Review and maintain
the Sage.js source, type declarations, lowering rules, and tests—not individual
generated C files.

## Mutation policy

Public mathematical elements remain immutable unless Sage semantics explicitly
say otherwise. The compiler may mutate native storage only when it proves that
the storage:

- was created inside the kernel;
- has no observable aliases;
- cannot escape before the mutation;
- is not shared with an input or cached constant;
- is wrapped exactly once if returned.

This is the optimization illustrated by `value = value * step`: JavaScript,
Cython, and idiomatic Julia construct a new public element each iteration.
Typed native lowering can reuse `value`'s private MPFR storage while producing
the same observable answer.

## Maintainability for coding agents

Agents should work primarily on mathematical source and explicit compiler
contracts, not repetitive FFI code. A good vertical slice contains:

- readable Sage.js implementing a meaningful algorithm;
- a small type signature or inferred parent plan;
- reusable IR operations rather than syntax-specific C templates;
- declarative native-library bindings;
- differential tests against Sage and the JavaScript fallback;
- benchmarks which reveal both boundary overhead and underlying library
  performance.

This makes generated native performance systematic. Adding a parent or native
operation improves many algorithms, instead of producing another isolated
hand-written addon.

## Near-term direction

Native Kernel v0 should grow only through real mathematical library needs.
The next kernels should exercise native inputs, coercion plans, multiple return
paths, exceptions, and library-owned objects while preserving the same dual
JavaScript/native contract.

The goal is not a general Python-to-C compiler. It is a mathematical compiler
which understands Sage parents and elements well enough to turn clean research
code into state-of-the-art native algorithms.
