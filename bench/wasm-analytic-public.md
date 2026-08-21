# Public analytic WebAssembly benchmark

Run:

```sh
node bench/wasm-analytic-public.mjs --check
```

The workload evaluates the same 160-bit complex points through the public
`complex_gamma_values` and `riemann_xi_values` functions, then through their
scalar public counterparts. One warmup is excluded. The JSON receipt identifies
the production Wasm artifact, host, point count, samples, copied bytes, timings,
and private boundary crossings.

The acceptance condition is structural as well as temporal: each batched
family must observe exactly one `receipt-backed-wasm-artifact` route, while the
scalar control observes one route per point. Thus `N` points use two coarse
crossings instead of `2*N`; the check also requires the batched median to beat
the scalar median on the same initialized Node-Wasm session.

Correctness is kept outside the timing loop. The focused public workflow test
checks exact Arb/Acb special values, at least 150 valid enclosure bits for
nonexact values, the Riemann-xi functional equation, deterministic buffer
release, identical Node-Wasm/Chromium public output, and private route evidence.
The shared native analytic-core test is the native FLINT oracle for the exact
same packed operation IDs.

## Linux x64 check receipt

On Node 26.7.0 with the authenticated
`sha256:2fccb60d04536aa9cdfa5dc902d7710d203e66703c580785f02aa3849285519f`
artifact, 128 points per family and two measured samples gave:

| route | median | analytic crossings | all instrumented crossings | copied bytes |
| --- | ---: | ---: | ---: | ---: |
| two coarse public batches | 52.30 ms | 2 | 2,693 | 116,562 |
| 256 public scalar calls | 92.53 ms | 256 | 3,328 | 124,436 |

This is a 128-fold analytic crossing reduction and a 1.77-fold median speedup.
The total column also includes the now-instrumented numeric-resource ingress,
materialization, and public result inspection, so it is intentionally larger
than the two analytic core calls. These
numbers are the focused `--check` workload, not a claim about every point set
or precision.
