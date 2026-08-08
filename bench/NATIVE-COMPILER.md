# Native Kernel v8

Native Kernel v8 asks whether selected Sage.js library functions can compile
as whole native algorithms instead of crossing Node-API for every scalar
operation. Its exact-integer backend uses checked machine words until an
operation cannot fit, promotes the live frame to lazy GMP-backed tagged values,
and resumes at that exact instruction. There is no whole-function replay.

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
Native Kernel v8 is currently a source-tree development feature and uses the
MPFR/MPC prefix built by `packages/flint`.

Importing `algorithms` normally in a fresh Sage.js process then resolves every
decorated function from that artifact. `SAGEJS_NATIVE_AUTOLOAD=0` forces the
original Python implementation. `SAGEJS_NATIVE_CACHE_DIR` selects a hermetic
cache instead of the default `.sagejs-native-kernels` beside the source.

## Pipeline

`tools/native-kernel/ir.cjs` parses source with the real Sage.js compiler and
lowers marked functions to typed IR. Native Kernel v8 supports:

- multi-function exact `int`/`Integer` modules backed by GMP, with multiple
  exact arguments and exact `BigInt` fallback;
- comparisons, Boolean conditions, short-circuit logic, `if`, `while`, early
  returns, unary negation, absolute value, Python floor division, and modulo;
- exact tuple returns, parallel tuple/list destructuring, `divmod`, literal
  positional defaults, fixed local integer sequences and checked indexing;
- exact-Integer `range` loops, `round(sqrt(Integer))`, and propagation of
  `ZeroDivisionError` through both generated backends;
- a module dependency graph and direct private-C calls among compiled exact
  functions, including recursion;
- conservative exact-value mutability, escape, and lifetime analysis, with
  immutable inputs borrowed and nonoverlapping locals assigned to reusable GMP
  scratch slots;
- a separately generated signed-64-bit call graph whose entry guards, checked
  arithmetic, and propagated callee statuses form an explicit representation
  proof;
- lazy tagged `int64_t`/GMP frames with a stable resume label for every
  promoting operation, so an intermediate overflow converts live values and
  continues without replaying the public function;
- a call-graph effect analysis recording local and external writes, possible
  exceptions, determinism, and whether speculative word-prefix execution is
  safe at a direct-call boundary;
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

Four exact execution forms consume the same IR:

- the JavaScript backend uses exact `BigInt` or ordinary immutable Sage.js real
  and complex operations;
- the word companion call graph uses checked `int64_t` values;
- the tagged C entry begins in the word graph, then lazily creates GMP storage
  and resumes at a failed instruction when promotion is necessary;
- the forced native entry starts with GMP, MPFR, or MPC and mutates
  non-escaping native locals in place.

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

The exact wrapper exposes its decision and all three implementations:

```js
kernel.native_gcd.backendFor(a, b); // "bigint", "tagged", or "gmp"
kernel.native_gcd.backendPolicy;
kernel.native_gcd.effects;
kernel.native_gcd.taggedInteger;
kernel.native_gcd.bigint(a, b);
kernel.native_gcd.tagged(a, b); // word execution with in-place promotion
kernel.native_gcd.gmp(a, b);    // force GMP from function entry
```

Automatic dispatch first honors addon availability, then uses the generated
policy. `SAGEJS_NATIVE_INTEGER_BACKEND=bigint`, `gmp`, or `auto` provides an
explicit process-wide override; `gmp` bypasses tagged word execution and
`auto` is the default. The policy is deliberately simple and auditable rather
than a hidden online benchmark.

For an eligible function, `taggedInteger` records the small and large
representations, guarded parameters, checked operation classes, promotion
action, direct calls, and deoptimization contract. `effects` records local and
external writes, possible exceptions, purity, and determinism. An overflow in
the public function stores its current word locals in tagged cells and jumps
to the failed operation's slow-path label; the public prefix is never replayed.
A pure direct callee is first tried through its word companion. If that callee
requests promotion, the caller promotes at the call site and invokes the
tagged callee, so a pure callee prefix can currently execute twice. The effect
guard prevents that speculation for a future callee with observable writes.

## Shared native values

`packages/flint/include/sagejs/native.h` is ABI version 2. It defines ownership
and stable Node-API type tags for opaque MPFR and MPC elements, plus the shared
dense matrix layout used by prime-field kernels. Generated matrix results are
accepted directly by the normal FLINT addon without copying through
JavaScript. Scalar results remain ordinary native values that the supplied
field wraps in the standard Sage.js `RealNumber` or `ComplexNumber` class.

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

Native Kernel v8 compiles every function directly from the complete unmodified
[`cowasm/src/nt.py`](cowasm/src/nt.py):

```sh
sagejs native compile bench/cowasm/src/nt.py
```

The resulting private C call graph contains `inverse_mod → xgcd`,
`is_prime → trial_division`, and `pi → is_prime`; none of those internal calls
returns through JavaScript or Python. On the dedicated 16-vCPU AMD EPYC 7B13
host with Node 26.7.0, medians for `pi(100000)` were 2.365 ms with resumable
word/GMP execution, 128.29 ms with forced GMP, 235.40 ms with generated
BigInt, 78.35 ms in CPython 3.12, and 285.00 ms in interpreted Sage.js. Thus
v7 makes this unchanged multi-function workload about 33x faster than CPython
and 121x faster than interpreted Sage.js. Every one of its six functions has
an inspectable tagged-integer proof and effect record.

The matched module benchmark in
[`native_number_theory.py`](cowasm/src/native_number_theory.py) moves the loop
inside the compiled module and exercises direct `native_bench_gcd → native_gcd`
calls. On the dedicated 16-vCPU AMD EPYC 7B13 host with Node 26.7.0, medians
were:

| Workload | Resumable int64/GMP | Forced GMP | exact BigInt | CPython 3.12 | Sage.js Python |
|---|---:|---:|---:|---:|---:|
| 100,000 small GCDs | 4.833 ms | 45.65 ms | 16.45 ms | 53.13 ms | 24.00 ms |
| 100 GCDs of 314-digit consecutive Fibonacci numbers | 11.355 ms | 11.776 ms | 53.39 ms | 21.86 ms | 67.00 ms |
| recursive Fibonacci, `n=30` | 5.461 ms | 291.84 ms | 462.17 ms | 152.02 ms | 149.00 ms |

These results expose all three representations. Checked machine words dominate
small exact loops and recursion. The 314-digit constants mechanically disable
the specialization and adaptive execution immediately takes the same GMP path
as the forced run. Generated BigInt remains useful as the portable backend.

The four-million-term exact quadratic sum is the deoptimization benchmark. Its
result, `-21333325333330000000`, crosses the signed-64-bit boundary late in the
loop. V6 replayed the whole function and took 96.93 ms. V7 promotes the live
frame at that addition and finishes in 16.75 ms, versus 79.66 ms with forced
GMP, 162.36 ms with generated BigInt, 332.78 ms in CPython, and 421.00 ms in
interpreted Sage.js. The v7 path is 5.79x faster than v6 replay and 4.76x
faster than starting in GMP. Reproduce the tables with:

```sh
pnpm run bench:native:cowasm
SAGEJS_NATIVE_INTEGER_TERMS=4000000 pnpm run bench:native:integer
```

## Dense prime-field matrices

V8 adds domain-specific lowering for annotated rank, determinant, reduced
echelon form, and matrix solve operations over `GF(p)`. The readable reference
implementation remains ordinary Python/Sage source. Generated code selects
32-bit or word-size modular arithmetic, uses Shoup row updates, preserves
inputs, and returns a zero-copy shared matrix. Its 1,000-matrix differential
corpus covers primes from 2 through 61 bits; a further 200 systems exercise
solve.

Run the matched compiler/FLINT benchmark with:

```sh
pnpm run bench:native:prime-field
```

The dedicated-host comparison with Nemo and Magma, artifact-size accounting,
and full methodology are in
[`PRIME-FIELD-NATIVE-BENCHMARK.md`](PRIME-FIELD-NATIVE-BENCHMARK.md).

## Deliberate v8 limits

This is not yet a general Cython replacement or transparent JIT. It does not
infer argument types, compile arbitrary control flow, accept native elements
as arguments, release the event loop, build asynchronously, or provide
prebuilt kernels. Exact modules currently return one scalar `Integer`, `bool`,
or a flat typed tuple. Mutable containers, keyword-only native ABI arguments,
general iterators, exception handlers, and calls into uncompiled Python remain
outside the typed subset. Fixed local integer sequences are compile-time values,
not general lists. Tagged promotion is per value and per instruction, but a
pure direct callee's speculative word prefix can be retried through its tagged
entry if the callee itself overflows. Effect analysis makes this behavior
explicit and prevents unsafe speculation as the typed subset grows.
Unsupported constructs fail during compilation instead of
silently changing Python semantics. The next compiler work should be driven by
real Sage.js library code and Sage-compatible semantics rather than by
accumulating unconnected AST cases.

The architectural seams are now present: ordinary Python decorator markers,
typed IR, escape-aware native
storage, independent backends, a JavaScript fallback, a versioned shared
element ABI, standard runtime results, and deterministic compilation caching.

A matched comparison against warmed Julia 1.12.6, including independent GCC
and Clang builds of the same generated C, is recorded in
[`JULIA-NATIVE-COMPARISON.md`](JULIA-NATIVE-COMPARISON.md). It covers
machine-word loops, GMP promotion, recursive calls, a complete number-theory
module, and in-place MPFR arithmetic.

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
