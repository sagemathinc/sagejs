# Complex-field arithmetic benchmark

Run the comparison with:

```sh
pnpm run bench:complex
```

The harness compares three paths:

1. raw calls to the opaque MPC values in `@sagemath/sagejs-flint`;
2. the same operations through Sage.js `ComplexNumber` elements and operators;
3. SageMath `ComplexNumber` operations through its Python/Cython extension
   type.

Process startup, field creation, and warmup are excluded. Each reported value
is the median of seven in-process samples. Every loop retains and consumes its
previous result, so each iteration constructs one immutable result value.

## Representative result

Measured on 2026-07-27 using an AMD EPYC 7B13, Node.js 26.5.0, and SageMath
10.9.post1 on Python 3.14.4:

| Operation | Precision | Raw Node-API | Sage.js | SageMath | Sage.js / Sage |
|---|---:|---:|---:|---:|---:|
| add | 53 | 1375 ns | 1342 ns | 136 ns | 9.90x |
| multiply | 53 | 1528 ns | 1486 ns | 204 ns | 7.28x |
| add | 1000 | 1553 ns | 1515 ns | 184 ns | 8.25x |
| multiply | 1000 | 2523 ns | 2590 ns | 794 ns | 3.26x |
| add | 10000 | 3416 ns | 3620 ns | 505 ns | 7.17x |
| multiply | 10000 | 29469 ns | 30100 ns | 20829 ns | 1.45x |

Repeated runs varied by a few percent and gave the same overall ratios.
Sage.js was within measurement noise of the raw Node-API path. Its
language-level element and operator wrapper therefore adds little to the
current native cost.

Two raw calls which do not allocate a native result object help isolate the
boundary:

| Probe | Median |
|---|---:|
| unwrap one complex value and return its precision | 184 ns/call |
| unwrap two complex values, compare, and return a boolean | 348 ns/call |

The roughly 1.3 microseconds needed for a small immutable addition is not just
the function-call boundary. It also includes allocating and initializing an
MPC result, creating and tagging a JavaScript wrapper, attaching its finalizer,
and eventually reclaiming it through V8 garbage collection.

SageMath's complex MPFR type is a Cython extension containing two `mpfr_t`
values and implements basic arithmetic directly with MPFR; it does not call
MPC for these operations. Thus this is a comparison of the same field
semantics and language-level operation, not identical generated machine code.
At low precision the object/dispatch costs dominate. At 10,000-bit
multiplication the mathematical kernel dominates and the gap falls to about
1.4x. High-precision addition remains too cheap to amortize the per-result
boundary.

The practical design conclusion is to avoid crossing Node-API once per tiny
scalar operation in performance-critical algorithms. Larger FLINT/MPC
operations, batched loops, native algorithms, allocation reuse, and expression
fusion can amortize the boundary. The no-allocation probes also show that the
full observed gap is not an unavoidable cost of merely entering native code.
