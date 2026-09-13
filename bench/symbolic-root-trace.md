# Scalar symbolic root trace cost

`Expression.find_root` returns a scalar by default. Collecting optional iteration
events for that call adds serialization and allocation work, although the
caller receives no trace. The default now requests `trace="none"` for scalar
results and `trace="iterations"` for `full_output=True`. Explicit trace choices
are honored. Required validation and summary events remain part of the shared
solver; this change only suppresses optional iteration tracing.

The comparison uses the same solver and expression in both cases. Run:

```sh
node bench/browser-wasm-performance.mjs --runtime node-native --samples 7 \
  --workloads bench/symbolic-root-trace-cases.json --output /tmp/root-trace.json
```

The harness starts a new kernel for each case and sample, measures one cold
evaluation and one immediately following warm evaluation, and includes public
kernel dispatch, compilation, solving, validation, and formatting. These are
development measurements, not cross-platform release receipts or isolated
algorithm timings. Both cases return the same approximation to `sqrt(2)`.

Measured on Linux x64, Node v26.8.1, 2026-09-05:

| Trace selection | Cold median (ms) | Warm median (ms) |
| --- | ---: | ---: |
| Scalar default | 338.188 | 61.533 |
| Explicit iterations (previous default) | 415.361 | 120.083 |

Warm samples, in measurement order:

- Scalar default: 61.532622, 63.257113, 64.642493, 60.741443, 60.626752, 62.039932, 60.646183 ms.
- Explicit iterations: 125.708776, 119.211195, 120.082615, 116.561675, 120.221465, 136.999966, 117.018855 ms.

The warm median is about 1.95 times faster, or 48.8% lower. No release
performance baseline is changed by this optimization. Browser, other host, and
full release qualification remain separate requirements.

Measurement source identities (SHA-256):

- `src/baselib/symbolic.py`: `b3b0f93baa0195ea1cf3e8489a9155f7970c7f556a7c859de716a363aae4410e`
- `bench/symbolic-root-trace-cases.json`: `8d5258444bc47432e8a6a9832d0d036a8a4a1dcf4c70d7a602281a1c2ccd86ce`

`test/numerical-root-laboratory.cjs` exercises the actual solver through the
Sage facade, observes the resulting policies and retained event kinds, and
checks the scalar default, explicit iterations, rich default, explicit silent
rich result, and equality of the scalar answers. Its existing corpus also
checks convergence, independent validation, and failure behavior.
