# Native Kernel v0

Native Kernel v0 asks whether selected Sage.js library functions can compile
as whole native algorithms instead of crossing Node-API for every scalar
operation. It is a small but structured compiler path, replacing the earlier
single-function code-generation proof.

The input is ordinary Sage.js source:

```python
def multiply_loop(
    field: ComplexField, iterations: uint64
) -> ComplexNumber:
    value = field("1.25", "-0.75")
    step = field("1.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value * step
    return value
```

The annotations are the native signature. The build configuration only names
the source and cache:

```js
module.exports = {
  sourcePath: "native-kernel-input.sage",
  cacheRoot: ".native-kernel-cache",
};
```

Build that kernel with:

```sh
pnpm --dir packages/flint build
node tools/native-kernel.cjs bench/native-kernel.config.cjs
```

The command prints the content-addressed generated-module path. A subsequent
identical build reports `cached`. The cache identity includes source,
typed IR, all backend source, the shared native header, native ABI, Node module
ABI, operating system, architecture, and MPFR/MPC versions.
Native Kernel v0 is currently a source-tree development feature and uses the
MPFR/MPC prefix built by `packages/flint`.

## Pipeline

`tools/native-kernel/ir.cjs` parses source with the real Sage.js compiler and
lowers the selected functions to typed IR. Native Kernel v0 supports:

- one `RealField` or `ComplexField` parent and one nonnegative `uint64`
  argument;
- local `RealNumber` or `ComplexNumber` values constructed from decimal
  strings;
- `for ... in range(iterations)`;
- local real or complex addition, subtraction, multiplication, and division;
- return of a local matching the annotated field.

Unsupported syntax and missing types are rejected during lowering. The IR
marks the returned local separately from non-escaping temporaries: the C
backend allocates only the result in the shared native heap representation and
keeps other MPFR/MPC values as local storage.

Two backends consume the same IR:

- the JavaScript backend uses ordinary immutable Sage.js real or complex
  operations;
- the C backend uses MPFR or MPC and mutates non-escaping native locals in
  place.

The generated module validates the Sage.js parent and iteration count. It uses
the C addon when available and otherwise uses the JavaScript implementation.
`SAGEJS_NATIVE_DISABLE=1` forces the fallback, while
`SAGEJS_NATIVE_REQUIRED=1` makes a missing or unloadable addon an error.

## Shared native values

`packages/flint/include/sagejs/native.h` is ABI version 1. It defines ownership
and stable Node-API type tags for opaque MPFR and MPC elements. The generated
kernel returns one of these ordinary native values. The supplied field verifies
its precision and wraps it in the standard Sage.js `RealNumber` or
`ComplexNumber` class.

Consequently:

- there is no decimal serialization at the kernel boundary;
- the result is accepted directly by the normal FLINT/MPC addon;
- users receive a normal Sage.js element with the correct parent;
- the JavaScript and native backends expose the same public return type.

The regression test compiles real and complex kernels into a fresh cache,
checks a cache hit, consumes results across the two independently built addons
at 53, 1000, and 10000 bits, and runs the same generated module through both
backends.

For the matched real-number comparison against SageMath, see
[`MPFR-BENCHMARK.md`](MPFR-BENCHMARK.md).

## Performance

Run the comparative benchmark with:

```sh
pnpm run bench:native
```

Measured on 2026-07-27 using an AMD EPYC 7B13, Node.js 26.5.0, and SageMath
10.9.post1:

| Precision | Native kernel | Sage.js loop | Native speedup | SageMath/Cython |
|---:|---:|---:|---:|---:|
| 53 bits | 141 ns/iteration | 1470 ns | 10.4x | 206 ns |
| 1000 bits | 1027 ns/iteration | 2510 ns | 2.4x | 773 ns |
| 10000 bits | 26103 ns/iteration | 28900 ns | 1.1x | 20505 ns |

The 53-bit generated loop is faster than Sage's Cython loop in this
microbenchmark. This demonstrates that the scalar-operation gap is not a
fundamental limitation of Node or JavaScript as the calling environment. It
comes from placing immutable native-object creation and a Node-API crossing
inside the hot loop.

Sage's complex field implements multiplication directly using four MPFR
multiplications, while this backend calls MPC. The remaining
large-precision difference therefore includes a kernel implementation
difference, not merely compiler or language overhead.

## Deliberate v0 limits

This is not yet a general Cython replacement or transparent JIT. It does not
infer argument types, compile arbitrary control flow, accept native elements
as arguments, release the event loop, build asynchronously, or provide
prebuilt kernels. The next compiler work should be driven by real Sage.js
library code and Sage-compatible semantics rather than by accumulating
unconnected AST cases.

The architectural seams are now present: typed IR, escape-aware native
storage, independent backends, a JavaScript fallback, a versioned shared
element ABI, standard runtime results, and deterministic compilation caching.
