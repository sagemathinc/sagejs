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
versions. In the representative run below, both systems reported MPFR 4.2.2
and GMP 6.3.0.

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

Run it with:

```sh
pnpm run bench:native
```

The script performs a warmup and reports the median of seven samples. Startup,
native compilation, and cache lookup are outside the timed region. One
Node-API call and the final result wrapper are included in the native-kernel
measurement.

## Representative result

Measured on 2026-07-27 using an AMD EPYC 7B13, Node.js 26.5.0, and SageMath
10.9.post1:

| Precision | Native MPFR kernel | Scalar Sage.js | SageMath/Cython |
|---:|---:|---:|---:|
| 53 bits | 11.7 ns/mul | 1194 ns/mul | 126.5 ns/mul |
| 1000 bits | 165.8 ns/mul | 1610 ns/mul | 272.9 ns/mul |
| 10000 bits | 6184 ns/mul | 8300 ns/mul | 5241 ns/mul |

At 53 bits, scalar Sage.js spends roughly 100 times the native arithmetic cost
on immutable object construction, JavaScript dispatch, and Node-API crossings.
Sage's Cython element type reduces that overhead to roughly 11 times the
native cost. Compiling the whole loop removes both per-element boundaries.

At 1000 bits, the native kernel remains about 1.6 times faster than SageMath.
By 10000 bits, MPFR/GMP arithmetic dominates and SageMath is about 18% faster
than this generated addon. This residual is not evidence of a Python or Node
boundary advantage: the boundary is crossed once. Although the upstream MPFR
and GMP versions match, Sagelite uses its bundled shared-library builds while
Sage.js uses the project's static MPFR build and the host GMP library. Build
configuration, compiler, and low-level library tuning remain variables at
large precision.

## What this establishes

The comparison puts the same `mpfr_mul` operation behind three execution
models:

1. JavaScript loop plus one Node-API crossing and allocation per product;
2. Python loop plus Cython dispatch and allocation per product;
3. generated C loop plus one boundary crossing for the complete algorithm.

CPython/Cython remains an excellent scalar native-extension interface. Node's
scalar native interface is materially more expensive. But neither cost is
fundamental when Sage.js can compile an entire mathematical kernel: the
generated 53-bit loop is over ten times faster than the SageMath loop while
preserving the same external immutable `RealNumber` semantics.
