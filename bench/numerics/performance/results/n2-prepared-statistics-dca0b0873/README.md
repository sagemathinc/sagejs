# Prepared public statistics: first current-source measurement

Frozen clean source: `dca0b087308e665f56adb706944e93314708f97e`.
Fresh eight-stage build: 10m37s. Twelve focused/domain tests pass without
skips, including the complete 296-case compiled arithmetic corpus, isolated
Wasm in three browser engines, and standalone ASAN/UBSAN with leak detection.
These browser kernel witnesses do not qualify public prepared-Wasm storage.

`local-development.json` retains the collector's checked public-call samples,
input/source/compiler/core/addon hashes, first-call costs and preparation.
The workload has 20,000 values near 1e9 and includes sorting, MAD, independent
validation, structured results and the stated trace policy. No summary is
precomputed during preparation. The loaded-module assertion rejects incidental
exact-library and Plotly loads. The host is Linux x64 / EPYC 7B13 / Node 26.8.1.

| Route | Untraced median | Summary median | Preparation (none / summary) |
| --- | ---: | ---: | ---: |
| Sage.js generic | 5,685.90 ms | 5,785.26 ms | none |
| Sage.js prepared dynamic | 4,216.36 ms | 6,391.34 ms | 1,024.56 / 1,157.05 ms |
| Sage.js prepared native | 96.14 ms | 102.99 ms | 1,488.74 / 1,212.93 ms |
| CPython generic, same source | 17.48 ms | 18.54 ms | none |
| CPython prepared dynamic, same source | 7.83 ms | 8.08 ms | 10.20 / 10.07 ms |

CPython's explicit native request correctly selects ordinary Python; those
additional samples remain in the raw record. All public values and validation
records agree between CPython and Sage.js. Query samples exclude the subsequent
test assertions and detached exports used to check returned results.

This is a **development observation, not a qualified speedup**. Three warmups
and seven samples follow a fixed sequential order, not paired/interleaved
runs. The shared development host had load averages 11.31/13.33/11.98 at report
time; generic samples range from 4.7 to 8.2 seconds across modes. The slower
prepared-dynamic summary row is retained. This does not establish trace
overhead, a same-host quiet crossover or an independent repetition.

The public 10 ms target is still missed. Setup is expensive even though a warm
native query avoids repeated per-observation interpretation. Peak memory,
browser/public-Wasm, clean npm/SEA, four-platform public queries and paired
quiet-host measurements remain open. The raw kernel's sub-millisecond timings
cannot be substituted for these public-call costs.

## Independent reserved Linux x64 run

The same clean source completed a fresh eight-stage build (10m25s), 10 focused
and existing domain tests with two explicit SDK/sanitizer skips, and the checked
collector on `bench-1`. Node 26.5.1 / EPYC 7B13; report-time load averages were
1.00/1.02/0.81. The original report and all three stage logs are retained under
`linux-x64/`, with a verifier checking their hashes and source identity.

| Sage.js route | Untraced median | Summary median | Preparation (none / summary) |
| --- | ---: | ---: | ---: |
| Generic | 4,952.98 ms | 4,797.04 ms | none |
| Prepared dynamic | 4,636.78 ms | 4,576.63 ms | 1,086.95 / 1,062.28 ms |
| Prepared native | 82.06 ms | 92.58 ms | 1,070.80 / 1,255.30 ms |

CPython same-source generic is 19.94/20.63 ms and prepared dynamic is
8.90/9.50 ms. All returned values and validation agree. This independently
repeats the scale of the development observation on a reserved host, but keeps
the same sequential ordering limitation: it is **not** a paired speedup
qualification or a passed 10 ms target. The host was handed back after copying
and verifying the evidence.

Reproduce using a matching fresh build:

```sh
node bench/numerics/performance/prepared-statistics.cjs --output build/numerical-performance/new-measurement.json
```

The collector refuses to overwrite an existing measurement. Check the retained
record without running a benchmark:

```sh
node bench/numerics/performance/results/n2-prepared-statistics-dca0b0873/verify.cjs
```

## Browser follow-up (packaging fix, not the original clean source)

The retained initial browser log rejects a missing `_prepared_native` module.
The explicit precompiled-package entry added after `dca0b0873` fixes that
function-local import. `browser-fallback.log` records all three real engines
passing the public ownership/failure corpus, and `browser-domains.log` records
the routine cross-domain browser checks with the new explicit native request.
`browser-artifact.json` inventories the rebuilt working-tree artifact at
`sha256:6ee801bf335ec7ef0cfffc94c12662c9c27b8b5399ca2debd6f7547e182eb842`;
the unchanged payload/topology budget passes. Its source-revision field names
the parent `dca0b0873`, so it must **not** be described as that clean commit's
release artifact: the precompiled-package configuration includes the fix.

The separate startup-dependency finding is also retained. All three engines
download FLINT/algebraic/M4RI during existing evaluator startup; none adds an
exact/Plotly request during statistics. The fallback is correct, but browser
startup is not lightweight. These logs intentionally preserve that outstanding
N0/N6 requirement. No public prepared-Wasm acceleration, clean npm/SEA or
four-platform full-product claim is made.
