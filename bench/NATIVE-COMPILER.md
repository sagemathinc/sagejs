# Native Kernel v4

Native Kernel v4 asks whether selected Sage.js library functions can compile
as whole native algorithms instead of crossing Node-API for every scalar
operation. It is a small but structured compiler path, replacing the earlier
single-function code-generation proof.

The input is ordinary Sage.js source. `@native` is a no-op under CPython and
remains the readable fallback in Sage.js. When a source-hash-matched compiled
artifact exists, Sage.js resolves it automatically without changing call sites:

```python
from sagejs.native import native


@native
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

The first-class module command needs no JavaScript configuration file:

```sh
sagejs native compile algorithms.py
```

Applications can use the same content-addressed compiler through the public
Node subpath:

```js
const { compile } = require("@sagemath/sagejs/native");

const result = await compile({
  sourcePath: "algorithms.sage",
  cacheRoot: ".sagejs-native-kernels",
});
const algorithms = require(result.modulePath);
```

The command prints the content-addressed generated-module path. A subsequent
identical build reports `cached`. The cache identity includes source,
typed IR, all backend source, the shared native header, native ABI, Node module
ABI, operating system, architecture, and MPFR/MPC versions.
Native Kernel v4 is currently a source-tree development feature and uses the
MPFR/MPC prefix built by `packages/flint`.

Importing `algorithms` normally in a fresh Sage.js process then resolves every
decorated function from that artifact. `SAGEJS_NATIVE_AUTOLOAD=0` forces the
original Python implementation. `SAGEJS_NATIVE_CACHE_DIR` selects a hermetic
cache instead of the default `.sagejs-native-kernels` beside the source.

## Pipeline

`tools/native-kernel/ir.cjs` parses source with the real Sage.js compiler and
lowers marked functions to typed IR. Native Kernel v4 supports:

- multi-function exact `int`/`Integer` modules backed by GMP, with multiple
  exact arguments and exact `BigInt` fallback;
- comparisons, Boolean conditions, short-circuit logic, `if`, `while`, early
  returns, unary negation, absolute value, Python floor division, and modulo;
- a module dependency graph and direct private-C calls among compiled exact
  functions, including recursion;
- conservative exact-value mutability, escape, and lifetime analysis, with
  immutable inputs borrowed and nonoverlapping locals assigned to reusable GMP
  scratch slots;
- generated, inspectable BigInt-versus-GMP selection based on call/loop shape,
  constant sizes, recursion, and runtime operand magnitude;

- one `RealField` or `ComplexField` parent and one nonnegative `uint64`
  argument;
- local `RealNumber` or `ComplexNumber` values constructed from decimal or
  integer literals;
- coercion of a `uint64` argument or loop index through the supplied field;
- `range(iterations)` and `range(k, iterations + k)` loops;
- local real or complex addition, subtraction, multiplication, and division;
- nested arithmetic expressions, augmented assignments, copies, and
  nonnegative constant powers through exponent 64;
- return of a local matching the annotated field.

Unsupported syntax and missing types are rejected during lowering. The IR
marks the returned local separately from non-escaping temporaries: the C
backend allocates only the result in the shared native heap representation and
keeps other MPFR/MPC values as local storage.

Two backends consume the same IR:

- the JavaScript backend uses exact `BigInt` or ordinary immutable Sage.js real
  and complex operations;
- the C backend uses GMP, MPFR, or MPC and mutates non-escaping native locals
  in place.

The generated module validates the Sage.js parent and iteration count. It uses
the C addon when available and otherwise uses the JavaScript implementation.
`SAGEJS_NATIVE_DISABLE=1` forces the fallback, while
`SAGEJS_NATIVE_REQUIRED=1` makes a missing or unloadable addon an error.

## Exact storage and backend selection

Every exact function has an analysis record in the content-addressed IR. A
parameter assigned by the function receives owned GMP storage; an immutable
parameter is borrowed from its caller. Integer local live intervals are colored
onto scratch slots, with loop-carried values conservatively kept live across
the entire backedge. Returned values are copied into caller-owned ABI storage,
so scratch values never escape their frame.

For the recursive Fibonacci workload this reduces each native frame from 14
initialized `mpz_t` values—the argument plus thirteen locals—to three scratch
values and one borrowed argument. Direct BigInt conversion also uses Node-API's
little-endian limb interface rather than decimal text, with inline boundary
storage through 256 bits.

The exact wrapper exposes its decision and both implementations:

```js
kernel.native_gcd.backendFor(a, b); // "bigint" or "gmp"
kernel.native_gcd.backendPolicy;
kernel.native_gcd.bigint(a, b);
kernel.native_gcd.gmp(a, b);
```

Automatic dispatch first honors addon availability, then uses the generated
policy. `SAGEJS_NATIVE_INTEGER_BACKEND=bigint`, `gmp`, or `auto` provides an
explicit process-wide override; `auto` is the default. The policy is deliberately
simple and auditable rather than a hidden online benchmark.

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

Exact integer results cross Node-API as ordinary JavaScript `BigInt` values and
therefore appear as normal Sage.js/Python integers; they need no opaque wrapper.
For an exact module, every public Node callback delegates to a private C entry
point. A call such as `native_lcm(a, b) -> native_gcd(a, b)` invokes that entry
point directly and reuses GMP values without another JavaScript or Python
transition.

Run the exact-integer comparisons with:

```sh
pnpm run bench:native:integer
pnpm run bench:native:cowasm
```

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

### Exact integers and CoWasm number theory

Native Kernel v4 also compiles the `gcd` function directly from the unmodified
[`cowasm/src/nt.py`](cowasm/src/nt.py):

```sh
sagejs native compile bench/cowasm/src/nt.py --functions gcd
```

The matched module benchmark in
[`native_number_theory.py`](cowasm/src/native_number_theory.py) moves the loop
inside the compiled module and exercises direct `native_bench_gcd → native_gcd`
calls. On the dedicated 16-vCPU AMD EPYC 7B13 host with Node 26.7.0, medians
were:

| Workload | Automatic | AOT/GMP | exact BigInt | CPython 3.12 | Sage.js Python |
|---|---:|---:|---:|---:|---:|
| 100,000 small GCDs | 17.65 ms (BigInt) | 47.53 ms | 17.52 ms | 54.44 ms | 25.00 ms |
| 100 GCDs of 314-digit consecutive Fibonacci numbers | 9.341 ms (GMP) | 9.573 ms | 51.311 ms | 21.281 ms | 59.000 ms |
| recursive Fibonacci, `n=30` | 294.06 ms (GMP) | 293.70 ms | 468.23 ms | 135.65 ms | 136.00 ms |

These results expose both sides of the design. V8 BigInt remains 2.7x faster
than GMP for the small-GCD module, while GMP is 5.4x faster for the 314-digit
case. Scratch coalescing reverses the earlier generated-backend result for the
call-heavy recursive case: GMP is now 1.6x faster than generated BigInt,
though both still trail CPython and interpreted Sage.js there. The
automatic policy selects the faster generated backend in all three workloads.

The separate ten-million-term exact quadratic sum performs substantial GMP
work without repeated internal calls. A later v4 run took 229.22 ms in
AOT/GMP, 417.32 ms in the generated BigInt backend, 849.96 ms in CPython, and
1072.00 ms in interpreted Sage.js on the same host. Automatic selection chose
GMP and added no measurable overhead. Reproduce both tables with:

```sh
pnpm run bench:native:cowasm
SAGEJS_NATIVE_INTEGER_TERMS=10000000 pnpm run bench:native:integer
```

## Deliberate v4 limits

This is not yet a general Cython replacement or transparent JIT. It does not
infer argument types, compile arbitrary control flow, accept native elements
as arguments, release the event loop, build asynchronously, or provide
prebuilt kernels. Exact modules currently return one scalar `Integer` or
`bool`; tuples, containers, keyword-only native ABI arguments, general
iterators, exception handlers, and calls into uncompiled Python remain outside
the typed subset. Unsupported constructs fail during compilation instead of
silently changing Python semantics. The next compiler work should be driven by
real Sage.js library code and Sage-compatible semantics rather than by
accumulating unconnected AST cases.

The architectural seams are now present: ordinary Python decorator markers,
typed IR, escape-aware native
storage, independent backends, a JavaScript fallback, a versioned shared
element ABI, standard runtime results, and deterministic compilation caching.

## mpmath workload prototype

The first application beyond repeated multiplication is the dominant
harmonic-cubic loop from the 80-decimal-digit mpmath benchmark. The input in
`native-mpmath-kernel.sage` is ordinary typed Sage.js; the existing Native
Kernel pipeline lowers its loop and five MPFR operations per term to one C
entry point. Run the comparison with:

```sh
pnpm bench:mpmath:aot
```

The benchmark checks the 60-digit result against unmodified mpmath under both
CPython and Sage.js, excludes process startup, and reports median time per
400-term sum. This is deliberately a Cython-style explicit annotation
prototype.  Its body now has the same loop shape as upstream mpmath:

```python
@native
def harmonic_cubic_loop(field: RealField, terms: uint64) -> RealNumber:
    total = field(0)
    for denominator in range(1, terms + 1):
        total += field(1) / field(denominator) ** 3
    return total
```

It demonstrates the attainable native ceiling and the reusable AOT pipeline,
but does not claim that arbitrary unmodified mpmath functions are
automatically compilable.

On a dedicated 16-vCPU AMD EPYC 7B13 VM with Node 26.7.0, the Python-shaped
the generated kernel took 0.119 ms per 400-term sum, versus 1.989 ms for CPython 3.12 with
mpmath 1.3.0 and 26.850 ms for unmodified mpmath under Sage.js. All paths
agreed to the reported 60 decimal digits. These are whole-call measurements
after warmup; compilation and process startup are excluded. The compiler also
hoists its generated immutable `field(1)` temporary out of the loop.

## SEA distribution direction

The cache artifact is already the right unit for a future SEA build. Release
CI can compile marked library modules once per supported platform and Node ABI,
embed the generated JavaScript, manifest, and native addon, then materialize
the addon into a verified content-addressed user cache before loading it.
Native addons cannot generally be loaded directly from bytes inside a SEA, so
the extraction step is intentional; the source/IR/backend/ABI cache key keeps
it deterministic and safe to reuse. The ordinary decorated function remains
available whenever a platform has no precompiled artifact.
