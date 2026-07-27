# Matched MPFR multiplication benchmark

This benchmark isolates the implementation-language overhead around the same
real-number arithmetic kernel. Sage.js and SageMath both ultimately call
MPFR's `mpfr_mul` with round-to-nearest semantics:

- the Native Kernel C backend emits
  `mpfr_mul(value, value, step, MPFR_RNDN)` inside the generated loop;
- scalar Sage.js calls the Node-API `realMul` binding, which allocates a result
  and calls `mpfr_mul`;
- SageMath's `RealNumber._mul_` allocates a result and calls `mpfr_mul` from
  Cython.

The benchmark queries the loaded libraries rather than assuming their
versions. In the representative run below, Sage.js, SageMath, and Julia all
reported MPFR 4.2.2 and GMP 6.3.0.

The ordinary source loop is:

```python
def real_multiply_loop(field, iterations):
    value = field("1.25")
    step = field("1.0000000000000002")
    for _ in range(iterations):
        value = value * step
    return value
```

The scalar loop runs unchanged in Sage.js and SageMath. Native Kernel v0
lowers the same body to typed IR and then C. Since `value` cannot escape during
the loop, generated C updates its MPFR storage in place and constructs only
the final immutable Sage.js `RealNumber`.

The Julia comparison uses the
[official Julia 1.12.6 binary](https://julialang.org/downloads/manual-downloads/)
and has two implementations:

- ordinary `BigFloat` source with `value = value * step`;
- an `@inline` Julia `mpfr_mul!` wrapper which calls MPFR with `value` as both
  target and left operand.

The second is not Julia's public immutable `BigFloat` arithmetic API. It is a
small low-level implementation primitive included to distinguish Julia loop
and foreign-call overhead from allocation. See
[`julia-real-multiply.jl`](julia-real-multiply.jl).

Run it with:

```sh
pnpm run bench:native
```

Julia rows are included when `julia` is on `PATH`; set `JULIA=/path/to/julia`
to select a particular installation.

The script performs a warmup and reports the median of seven samples. Startup,
native compilation, and cache lookup are outside the timed region. One
Node-API call and the final result wrapper are included in the native-kernel
measurement.

## Representative result

Measured on 2026-07-27 using an AMD EPYC 7B13, Node.js 26.5.0, and SageMath
10.9.post1:

| Precision | Native kernel | Scalar Sage.js | SageMath/Cython | Julia `BigFloat` | Julia in-place |
|---:|---:|---:|---:|---:|---:|
| 53 bits | 12.4 ns | 1204 ns | 128.3 ns | 95.8 ns | 20.7 ns |
| 1000 bits | 166.0 ns | 1570 ns | 265.3 ns | 278.8 ns | 185.5 ns |
| 10000 bits | 6201 ns | 8300 ns | 5150 ns | 6534 ns | 6373 ns |

At 53 bits, scalar Sage.js spends roughly 97 times the native arithmetic cost
on immutable object construction, JavaScript dispatch, and Node-API crossings.
Sage's Cython element type reduces that to roughly 10 times native. Idiomatic
Julia `BigFloat` is faster than Cython here, but is still 7.7 times native.
Compiling the whole loop removes all three per-element boundaries.

The in-place Julia loop gets within 1.7 times native at 53 bits and 1.1 times
at 1000 bits. By 10000 bits, MPFR/GMP arithmetic dominates and SageMath is
about 20% faster than this generated addon. This residual is not evidence of a
Python or Node boundary advantage: the boundary is crossed once. Although the
upstream MPFR and GMP versions match, Sagelite, Julia, and Sage.js use
separately built libraries. Build configuration, compiler, and low-level
library tuning remain variables at large precision.

## Allocation

Julia reports the following amortized allocation:

| Precision | Julia `BigFloat` | Julia in-place |
|---:|---:|---:|
| 53 bits | 80.001 bytes/mul | 0.001 bytes/mul |
| 1000 bits | 224.007 bytes/mul | 0.007 bytes/mul |
| 10000 bits | 1392.302 bytes/mul | 0.302 bytes/mul |

The tiny in-place figures are fixed setup allocations divided by the iteration
count. Julia's JIT cannot generally remove ordinary `BigFloat` allocations:
each result owns opaque, mutable, finalizable MPFR storage, and `ccall` makes
that storage observable to native code.

## What this establishes

The comparison puts the same `mpfr_mul` operation behind five execution
models:

1. JavaScript loop plus one Node-API crossing and allocation per product;
2. Python loop plus Cython dispatch and allocation per product;
3. idiomatic Julia JIT code with allocation per product;
4. Julia JIT code with an explicit in-place MPFR primitive per product;
5. generated C loop plus one boundary crossing for the complete algorithm.

CPython/Cython remains an excellent scalar native-extension interface. Node's
scalar native interface is materially more expensive, and Julia's JIT gives
idiomatic native-number code a smaller scalar cost than either. But none of
these per-product costs is fundamental when Sage.js can compile an entire
mathematical kernel. Escape-aware in-place lowering is the decisive
optimization, while the public `RealNumber` remains immutable.
