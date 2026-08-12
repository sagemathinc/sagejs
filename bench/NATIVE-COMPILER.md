# Native Kernel v20

Native Kernel v20 asks whether selected Sage.js library functions can compile
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
Native Kernel v20 is currently a source-tree development feature and uses the
MPFR/MPC prefix built by `packages/flint`.

Importing `algorithms` normally in a fresh Sage.js process then resolves every
decorated function from that artifact. `SAGEJS_NATIVE_AUTOLOAD=0` forces the
original Python implementation. `SAGEJS_NATIVE_CACHE_DIR` selects a hermetic
cache instead of the default `.sagejs-native-kernels` beside the source.

## Transparent compiler tooling

V17 makes the compiler pipeline inspectable without finding files inside the
content-addressed cache:

```sh
sagejs native explain algorithms.py --function gcd
sagejs native audit bench/cowasm/src
sagejs native audit bench/cowasm/src --json
sagejs native ir algorithms.py --function gcd
sagejs native emit-c algorithms.py --function gcd
sagejs native emit-core-c algorithms.py --function gcd
sagejs native emit-header algorithms.py --function gcd
sagejs native compile algorithms.py
sagejs native benchmark algorithms.py --function gcd --args '[92250,922350]'
```

Every command supports `--json`. `audit` recursively classifies every Python
function below a file or directory, recording stable source hashes, detected
source features, exact rejection diagnostics, and summarized rejection
categories. `explain` reports eligibility, signatures,
dependency edges, storage/effect/backend analysis, recognized generic
optimizations, host-isolation eligibility, and rejection reasons. `ir`,
`emit-c`, `emit-core-c`, and `emit-header` perform no native build. The latter
two expose the Node-independent C ABI for every accepted kernel kind.
`benchmark` requires an explicit function and JSON argument array when
the module has multiple entries; it checks that automatic, JavaScript,
tagged-word/GMP, and forced-GMP forms agree before reporting warm medians.
It does not invent representative arguments for an arbitrary mathematical
function.

## Canonical host-isolated kernels

Every successful v17 build writes three distinct
artifacts:

- `kernel_core.c` contains the transitive compiled mathematical graph, tagged
  machine-word/GMP promotion, packed-buffer primitives, and status returns;
- `kernel_core.h` declares standalone C entry points and ownership rules;
- `kernel.c` is the Node-API adapter that marshals values, includes the core,
  and translates a returned status into a JavaScript exception.

The core contains no Node-API, CPython, JavaScript-engine, or interpreter
symbols. Direct compiled calls stay inside it. Unsupported calls fail lowering
instead of becoming callbacks. This is stronger than merely observing that a
particular hot loop does not happen to call the host.

Tests compile every backend family's core as an independent translation unit
and execute the exact-integer core as an independent native executable. When
the CoWasm WASI SDK and GMP archive are present, that identical file is also
compiled to `wasm32-wasip1` and executed through WASI. Exact/GMP, packed
binary64, MPFR/MPC, source-transparent prime-field, and specialized
prime-field kernels all use the same core-first status ABI. A backend that
cannot emit an isolated core is rejected rather than routed through a legacy
monolithic path.

Every serializable IR operation has a stable ID, its exact Python file,
line/column and byte range, and an origin list. Data-flow fusion retains the
IDs of all operations it replaces. Generated C contains corresponding
`sagejs-ir` comments and C `#line` directives, while the cache manifest maps
generated C line ranges back to those operations. Consequently compiler
diagnostics and later profiling tools can point to mathematical source rather
than opaque generated code.

## Pipeline

`tools/native-kernel/ir.cjs` parses source with the real Sage.js compiler and
lowers marked functions to typed IR. Native Kernel v20 supports:

- multi-function exact `int`/`Integer` modules backed by GMP, with multiple
  exact arguments and exact `BigInt` fallback;
- comparisons, Boolean conditions, short-circuit logic, `if`, `while`, early
  returns, unary negation, absolute value, Python floor division, and modulo;
- exact tuple returns, parallel tuple/list destructuring, `divmod`, literal
  positional defaults, fixed local integer sequences and checked indexing;
- exact-Integer `range` loops, `round(sqrt(Integer))`, and propagation of
  `ZeroDivisionError` through both generated backends;
- exact `sum` over one-clause range generator/list comprehensions, including
  optional starts, filters, Python 3 comprehension scope, loop fusion, and
  direct compiled calls in the producer expression;
- inferred scalar locals plus optional checked PEP 526 declarations such as
  `total: Integer = 0`; public parameter and result annotations remain
  mandatory because they define the stable native ABI;
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
- declaration-resolved calls imported from generated ``sagejs.ffi`` modules,
  with semantic/ABI type checking, ownership, transitive effects, direct
  foreign-library calls in the host-isolated core, and the same declaration's
  checked dynamic adapter as fallback;
- non-escaping opaque owned FFI resources created in the top-level native
  block, with declaration-driven initialization flags, all-exit cleanup, and
  reverse-order cleanup in the generated JavaScript fallback;
- generated, inspectable BigInt-versus-GMP selection based on call/loop shape,
  constant sizes, recursion, and runtime operand magnitude;
- source-transparent binary64 kernels with mixed `uint64`/`Float64`
  signatures, integer-to-double coercion, `abs`, arithmetic, and counted
  loops, returning ordinary JavaScript/Python floats;
- borrowed packed `Float64Buffer` parameters, bounded `Float64Record` views,
  checked indexed reads/writes, buffer aliasing, `sqrt`, dynamic one- and
  two-bound ranges, and arbitrarily nested counted loops;
- dense prime-field rank, determinant, echelon, and solve contracts;
- immutable packed prime-field decompositions reusable across all four
  operations and across arbitrarily many right sides;
- benchmark-selected classical or cache-blocked factorization with separate
  small-prime and full-word arithmetic policies;
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

The generated module validates its public arguments once before core entry.
`SAGEJS_NATIVE_MODE=dynamic`, `javascript`, or `native` respectively selects
the ordinary source fallback, portable typed-IR artifact, or required native
addon; `auto` is the default. The older `SAGEJS_NATIVE_DISABLE` and
`SAGEJS_NATIVE_REQUIRED` switches remain compatibility controls in `auto`.

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
policy. `SAGEJS_NATIVE_INTEGER_BACKEND=bigint`, `tagged`, `gmp`, or `auto`
provides an explicit process-wide override; `gmp` bypasses tagged word
execution and `auto` is the default. The policy is deliberately simple and
auditable rather than a hidden online benchmark.

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

## Packed binary64 buffers and records

V14 compiles numerical algorithms over mutable one-dimensional
`Float64Buffer` values. A `Float64Record` is a checked, non-owning view into a
contiguous portion of a buffer; it gives structured algorithms readable names
without changing the packed representation:

```python
from sagejs.native import Float64Buffer, float64_record, native


@native
def advance(records: Float64Buffer, count: uint64) -> float:
    total = 0.0
    for index in range(count):
        record = float64_record(records, index * 3, 3)
        record[0] += record[1] * record[2]
        total += record[0]
    return total
```

The addon borrows `Float64Array` memory directly for the duration of the call.
Ordinary Python/Sage.js lists remain supported by the generated module through
a temporary packed copy whose mutations are copied back in a `finally` block.
`kernel_float64_buffer(function, iterable)` and
`kernel_float64_zeros(function, length)` choose reusable packed storage for a
compiled function and ordinary lists for the dynamic fallback.
The portable implementation executes the same IR against arrays or lists.
Every view construction and indexed access is bounds checked; generated C does
not retain a borrowed pointer after returning.

[`cowasm/native/numerical_buffers.py`](cowasm/native/numerical_buffers.py)
contains complete source-transparent n-body and repeated classical matrix
multiplication bodies. There is no operation-name substitution: record views,
index arithmetic, nested loops, binary64 operations, and mutation all appear
in inspectable IR and generated C. Run the matched CPython, PyPy, generated-JS,
Julia, and C comparison with:

```sh
pnpm bench:cowasm:buffers
```

On the dedicated 16-vCPU AMD EPYC 7B13 host, with nine measured passes after
three warmups, GCC-generated n-body takes 1.715 ms versus 1.356 ms for
handwritten C, 1.529 ms for Julia, 73.32 ms for PyPy 7.3.15, and 739.13 ms for
CPython 3.12. Repeated 30-by-30 multiplication takes 1.471 ms generated versus
0.608 ms C, 1.062 ms Julia, 3.140 ms PyPy, and 124.03 ms CPython. Clang produces
1.641 ms and 1.017 ms generated artifacts respectively. The stripped addon is
18.6 KB; generated C is 112.9 KB and the portable module is 31.6 KB.

The n-body result establishes near-C performance for nested mutable records.
The larger handwritten-C matrix advantage identifies the next optimization:
prove and hoist buffer bounds from loop/shape constraints instead of emitting
a branch at every inner-loop access. V14 deliberately retains those checks;
the benchmark does not compare unsafe generated code with checked source.

## Packed exact buffers

V14 added mutable `Int64Buffer` values and bounded `Int64Record` views to the
exact-integer compiler. The native boundary borrows a `BigInt64Array`; ordinary
Python/Sage.js lists use a checked temporary and copy mutations back. Reads
enter the tagged exact-integer data flow, so later arithmetic still promotes
from machine words to GMP. Writes require signed-64-bit representability and
raise `OverflowError` instead of truncating. Negative indexing, record bounds,
and mutation behavior agree across CPython, generated JavaScript, tagged C,
and forced-GMP C.

Buffer mutation participates in effect analysis. A function that writes a
borrowed buffer reports the originating parameter in `externalWrites`, is not
pure, and cannot replay a speculative direct call after a visible write. The
generated JavaScript wrapper copies buffers back in `finally`, including when
the native function raises.

V15 adds mutable `IntegerBuffer` vectors without imposing a signed-64-bit
limit. The host-neutral layout is a fixed-capacity signed-limb table:
`Int32Array sizes` stores each entry's signed limb count and
`BigUint64Array limbs` stores `wordCapacity` little-endian 64-bit limbs per
entry. Native GMP and tagged backends read and write the same slots directly;
the word backend promotes individual reads whose slots do not fit `int64_t`.
Capacity is explicit and checked. A write that does not fit raises instead of
silently reallocating a borrowed ABI or truncating a value. Ordinary lists are
copied through the same representation, while `createIntegerBuffer()` exposes
the zero-copy packed form for batched kernels and future WebAssembly linear
memory.

[`src/lib/sagejs/kernels/p1.py`](../src/lib/sagejs/kernels/p1.py) is the first
mathematical witness. It writes complete Cremona and Merel Heilbronn
representative arrays, then compiles the actual higher-weight homogeneous
polynomial action into packed output. The latter emits every
`(weight - 1)`-square action block used inside the P1 Hecke loop; coset
transport, arbitrary-precision polynomial coefficients, and exact rational
quotient-presentation reduction are now compiled from the actual typed Python
body. FLINT still constructs the mature Manin presentation and supplies its
explicit rational reduction matrix; the typed kernel consumes that mathematical
interface rather than duplicating sparse rational row reduction.
At `p=1009`, weight 4, the checked typed-Python body writes 49,284 exact
coefficients in a median 0.745 ms with GCC and 0.447 ms with Clang on the
dedicated 16-vCPU AMD EPYC 7B13 host. The same standalone C transcription
takes 0.353 ms with GCC and 0.695 ms with Clang; thus compiler choice reverses
the ranking, from generated code 2.11x behind C to 1.55x faster. The generated
JavaScript fallback takes about 79 ms. These are medians across three complete
benchmark passes after each pass's internal warmups and samples. The complete
module's generated C is 1.68 MB, its portable module is 139 KB, and the
unstripped addon is 597 KB with GCC or 531 KB with Clang. Reproduce the
differential benchmark with:

```sh
pnpm bench:native:p1
```

The same benchmark now includes complete higher-weight P1 transport and
rational quotient reduction. The full diagnostic pipeline materializes all
44,496 arbitrary-precision source-generator coefficients; the production-shaped
typed body fuses transport and reduction for the 7,416 coefficients belonging
to the chosen quotient-basis generators. Its result is an owned generated
`FmpqMatrix`: FLINT grows each exact entry independently, and the host neither
predicts a uniform limb capacity nor reconstructs the output from packed
rational parts. A generic declared `fmpq_matrix_add_scaled_entry` operation
performs each exact `entry += scale * numerator / denominator` update in one
foreign call; bounds, zero denominators, ownership, and status failures remain
checked by the declaration system. On the 16-vCPU AMD EPYC 7B13 host, level
11, weight 4, and `T_101` produces a 6-by-6 rational matrix in median 2.446 ms
with GCC. The generated JavaScript fallback takes 55.046 ms and the production
FLINT C path takes 1.673 ms: compilation is 22.5x faster than the same-source
fallback and 1.46x the mature specialized C. Presentation construction is
excluded for both paths; allocation and deterministic release of the returned
resource are included. Every rational entry is checked against FLINT before
timing. These figures are medians from seven samples of 20 calls on 2026-08-12.

The production `P1List.higher_weight_hecke_matrix` path now invokes this fused
typed body directly. It caches packed signed and arbitrary-precision inputs
and takes ownership of the returned generated matrix resource without a
legacy N-API result or output serialization. The previous FLINT implementation
remains a private differential oracle. The typed function itself still retains
and differentially tests its same-source dynamic fallback. On the
same host, seven interleaved samples of 20 level-11, weight-4, `T_101` calls
measured 2.656 ms for the complete public typed route and 1.920 ms for the
FLINT oracle (1.38x). This includes generated-resource allocation and public
matrix construction, but no host-side exact-entry materialization. The
benchmark also reports process peak-RSS growth so representation changes are
not accepted on latency alone.
`pnpm bench:native:p1` reports both measurements.

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

Native Kernel v9 compiles every function directly from the complete unmodified
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

### Natural exact reductions

V20 lowers the actual `sum(gcd(...) for ... in range(...))` source in
[`native_reductions.py`](native_reductions.py) to the same counted IR as the
handwritten accumulator beside it. On the dedicated 16-vCPU AMD EPYC 7B13
host with Node 26.7.0, one million terms produced these warmed whole-call
medians (five samples after two warmups):

| Source spelling | Native core | Typed JavaScript | Dynamic Sage.js |
|---|---:|---:|---:|
| `sum(...)` generator | 8 ms | 60 ms | 441 ms |
| explicit accumulator loop | 8 ms | 58 ms | 143 ms |

Both forms returned `1500000`. Thus the natural source has no measurable
native penalty at this timer resolution and is about 55x faster than its own
dynamic execution. The slower dynamic-generator result is not hidden from the
comparison: compilation removes generator allocation and dispatch because the
lowered producer and direct `gcd` dependency remain inside the isolated core.
Reproduce it with:

```sh
sagejs native compile bench/native_reductions.py
for mode in native javascript dynamic; do
  SAGEJS_NATIVE_MODE=$mode sagejs bench/benchmark_native_reductions.py
done
```

## Dense prime-field matrices

V9 adds domain-specific lowering for annotated rank, determinant, reduced
echelon form, matrix solve, and reusable decomposition operations over `GF(p)`.
The readable reference implementation remains ordinary Python/Sage source.
Generated code owns a packed row-pivoted factorization and permutation, selects
classical or cache-blocked elimination, uses bounded unreduced dot products and
Shoup row updates, and solves by triangular substitution. Inputs remain
immutable and results use the zero-copy shared matrix ABI. The differential
corpus covers 1,000 small matrices, 200 systems, both blocked arithmetic paths,
late singular fallback, repeated solves, empty matrices, and forced Python
fallback.

Run the matched compiler/FLINT benchmark with:

```sh
pnpm run bench:native:prime-field
```

The dedicated-host comparison with Nemo and Magma, artifact-size accounting,
and full methodology are in
[`PRIME-FIELD-NATIVE-BENCHMARK.md`](PRIME-FIELD-NATIVE-BENCHMARK.md).

V10 also contains a deliberately separate source-transparency experiment.
Classical LU/rank and cubic multiplication are compiled from the loops in an
actual CPython-parseable Python module; no function-name intrinsic selects the
algorithm. Generic row-update and modular-dot-product data-flow idioms provide
Shoup multiplication and bounded delayed reduction. On a dedicated host, the
compiled Python LU is within 14% of handwritten classical C with GCC and
usually slightly faster with Clang. It remains slower than blocked v9 and
FLINT algorithms, which is the intended distinction between compiler quality
and algorithm quality. See
[`PRIME-FIELD-SOURCE-COMPILER-EXPERIMENT.md`](PRIME-FIELD-SOURCE-COMPILER-EXPERIMENT.md)
for code-size, safety, GCC/Clang, interpreted, handwritten-C, and FLINT data.

## Tate local reduction experiment

[`native_tate_large_prime.py`](native_tate_large_prime.py) is the second
source-transparency workload. It expresses the actual `p > 3` branch of Tate's
algorithm using typed ordinary Python, including invariant construction,
valuation, Legendre symbols, direct helper calls, many early returns, exact
tuple results, and automatic word-to-GMP promotion. There is no Tate-specific
intrinsic or name substitution. The same body executes as the portable
fallback.

The experiment uncovered two general frontend defects: postponed flat-tuple
annotations were not recognized, and compiling one selected entry did not
include its transitive typed dependencies. Both are now general features. Its
larger call graph also supplies enough work to select tagged native entry even
for small inputs, rather than paying dynamic BigInt dispatch throughout the
algorithm.

The initial 13-case timing mixed a corpus average for Sage.js with a repeated
single curve for PARI and is superseded by a matched large-corpus comparison.
The current benchmark selects 5,000 global minimal models from Cremona's
canonical ecdata, tests every bad prime greater than three, and supplements
them with four large-prime `I0*` stress cases. All 9,102 results agree among
PARI, production Sage.js, and every compiler backend. On an otherwise idle
16-vCPU, 64-GB dedicated host, the compiled coefficient-to-result path takes
1.650 microseconds per case versus 1.868 microseconds for PARI including
`ellinit`, and 19.23 microseconds for interpreted production Sage.js.
Precomputed-invariant classification takes 1.142 microseconds compiled versus
0.687 microseconds in PARI; a four-input native ABI probe alone takes about
0.850 microseconds. Reproduce the checked comparison with:

```sh
pnpm run bench:native:tate:corpus
pnpm run bench:native:tate
```

The typed source now uses binary Jacobi and scalar finite-field polynomial-gcd
algorithms rather than Euler exponentiation and residue enumeration. Full
methodology, per-Kodaira and prime-size results, artifact sizes, and the
production bug discovered by the corpus are recorded in
[`TATE-NATIVE-BENCHMARK.md`](TATE-NATIVE-BENCHMARK.md).

The production small-prime branch remains ordinary Python. Its mutable
coefficient lists and more involved structured state make it the next honest
compiler-capability test rather than a reason to introduce a hidden native
Tate implementation.

## Deliberate v20 limits

This is not yet a general Cython replacement or transparent JIT. It does not
infer argument types, compile arbitrary control flow, accept native elements
as arguments, release the event loop, build asynchronously, or provide
prebuilt kernels. Exact modules currently return one scalar `Integer`, `bool`,
or a flat typed tuple. Their mutable exact containers are deliberately limited
to fixed-shape signed-64-bit buffers, bounded record views, and fixed-capacity
arbitrary-precision integer buffers; resizable lists, keyword-only native ABI
arguments, general iterators, exception
handlers, and calls into uncompiled Python remain outside the typed subset.
Fixed local integer sequences are compile-time values,
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
