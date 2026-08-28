# Strict binary64 immutable-tuple reduction benchmark

Run the bounded receipt with:

```sh
node bench/optimizer-strict-float-array/benchmark.cjs --check
```

The workload is one source-ordered multiply-add reduction over an immutable
`tuple[float, ...]`. The report separates frontend initialization, warm source
compilation, input tuple materialization, warm execution, and the optimizer's
zero-copy/zero-boundary accounting. It checks exact little-endian binary64 bits.

Before the integration lane registers the pass, verifier, lowering contract,
and Python emitter, the harness measures isolated recognition/verification,
Sage.js O0, matched JavaScript, CPython, and optional NumPy, Numba, and Julia.
It labels the Sage.js O2 result unavailable and makes no optimized runtime
claim. After registration, the same command requires the emitted O2 route and
checks its exact checksum and execution tier. Optional tools are reported with
their versions and availability; timings are observations for this workload,
not general rankings of languages or numerical systems.
