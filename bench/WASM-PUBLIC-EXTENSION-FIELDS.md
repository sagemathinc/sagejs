# Public extension-field Wasm benchmark

`wasm-public-extension-fields.cjs` exercises the ordinary public
`GF(p^n)` and `PolynomialRing` APIs.  The workload deliberately contains no
`sagejs.ffi` import and no forced-resource test helper: it constructs two dense
polynomials over `GF(65537^3)` and performs twelve chained multiplications,
ending at degree 5632.

Run it after building the production browser artifacts:

```bash
pnpm --dir packages/flint-wasm build
node bench/wasm-public-extension-fields.cjs
```

The benchmark warms the persistent Node Wasm evaluator, then reports the
median of five complete public construction-and-arithmetic samples.  It checks
an exact coefficient fingerprint and rejects any dynamic-Python, portable, or
shared-JavaScript fallback route.  Its route receipt must identify
`ffi:flint:fq_polynomial_mul` as executing in the production Wasm artifact.

This measures the public dense arithmetic boundary, including one evaluator
request per sample.  It does not claim to benchmark default Conway-polynomial
selection, formatting, sparse arithmetic, factorization, or multivariate
polynomials.
