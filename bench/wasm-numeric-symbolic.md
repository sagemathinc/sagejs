# WebAssembly numeric and symbolic benchmark

This benchmark measures the public browser numeric representation bottleneck
that motivated the port. It repeatedly evaluates a 100-bit affine recurrence
using either the capability-disabled exact-BigInt-rational fallback or bounded
MPFR resources owned by the production FLINT WebAssembly instance. Both paths
use the same decimal inputs, operation order, iteration count, and checksum.

Run after building `packages/flint-wasm/dist/flint-factor.wasm`:

```sh
node bench/wasm-numeric-symbolic.mjs
```

The benchmark also times the representative supported symbolic integral
`numerical_integral(exp(x^2), 1, 2)` as one compiled-expression Wasm call.
Arbitrary Python callables are intentionally outside that coarse-call domain
and continue to use the checked portable quadrature path.

The checked-in code does not encode a machine-specific timing threshold. The
release workload dashboard owns reviewed browser budgets; this script records
the exact workload, result checksum, sample policy, Node version, and separate
portable/Wasm medians needed to set or review such a budget.
