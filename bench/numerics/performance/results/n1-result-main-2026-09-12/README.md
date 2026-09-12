# Main-based result binding: evidence and limits

Baseline: `5b307b65fc350763abd52062e57f1c7a3666f925`.
Candidate: `b0c532cfb9b0295ae444b536027231c403214bea`.
This is the independent identity-binding change, **without** #224's trace fix.
Both checkouts were freshly built with the same compiler. The collector and
workloads come from #224 but select the above roots explicitly; they force
the ordinary dynamic route and keep solver validation/result construction
inside the clock. No optional native addon is needed for these calls.

## Paired local timing, with host drift

The serial A1/B1/B2/A2 blocks each retain three warmups and seven samples per
case/policy. All 40 observations agree exactly, including independent error,
method, work counts, validation classification and retained trace size.
`local-*.json` retains the raw samples, startup/preparation, source/build/workload
identities and process memory snapshots. `comparison.json` checks complete
blocks, identical observations/policies/compiler, and recomputed medians.

| Workload / trace | Baseline block medians (ms) | Candidate block medians (ms) |
| --- | ---: | ---: |
| Brent root / none | 51.85, 60.52 | 35.58, 36.58 |
| Brent root / summary | 46.71, 54.58 | 30.36, 31.38 |
| Bounded minimum / none | 47.50, 54.77 | 33.42, 32.41 |
| Bounded minimum / summary | 118.37, 132.32 | 102.63, 101.01 |
| Dense solve 16 / none | 1764.04, 2121.44 | 1667.11, 1667.36 |
| Dense solve 16 / summary | 1763.18, 2349.48 | 1693.47, 1667.05 |
| FFT 256 / none | 4708.95, 5735.70 | 4659.99, 4695.95 |
| FFT 256 / summary | 4715.35, 5281.31 | 4684.81, 4689.59 |
| Describe 20,000 / none | 5045.38, 5391.73 | 4828.22, 6008.46 |
| Describe 20,000 / summary | 4749.86, 5497.13 | 4935.11, 6279.27 |

The development host drifted materially during the later blocks: the unchanged
baseline slowed, and statistics timings changed substantially within the
candidate. Our local builds/tests were paused, but the host was not exclusively
ours (observed system load reached about 20). Therefore these are **not quiet-
host confirmation**, a reliable speedup ratio, or evidence of a statistical
regression/improvement. A scalar fixed-cost reduction is consistent across the
blocks and with the deterministic no-snapshot witness, but its magnitude still
needs independent confirmation. Nothing here meets a public latency target.

The large dense/FFT/statistics costs remain. Eliminating two problem hashes
does not accelerate their arithmetic, input preparation, remaining validation,
or serialization on explicit export. Initial calls and preparation are separate
observations, not isolated cold-import measurements; memory snapshots are not
worker peak-RSS or a sustained-memory qualification.

## Source-only portability

`source-linux-arm64.json` and `source-win32-x64.json` record the independent
CPython source oracles on Linux ARM64 / Python 3.12.3 and native Windows x64 /
Python 3.13.7. They include both the trace source `db7c806b` and the independent
result source `b0c532cfb`, verified against exact Git-archive and test hashes.
They do **not** qualify generated Sage.js, native/Wasm execution, npm/SEA,
browser distribution, or performance on those platforms.

The retained `qualify-sources.cjs` runs in a fresh scratch directory with these
archives, refuses to overlay an existing extracted tree, forces native off,
and requires the exact expected oracle output. Reproduce the archives using:

```sh
git archive --format=tar.gz --output=trace-source-db7c806b.tar.gz db7c806b072b6f1d181f92532b75f1d395428a42 src/lib test/numerics/performance/trace-accounting.py
git archive --format=tar.gz --output=result-source-b0c532cfb.tar.gz b0c532cfb9b0295ae444b536027231c403214bea src/lib test/numerics/performance/result-bookkeeping.py
```

Copy the archives and runner to that scratch directory, then run
`node qualify-sources.cjs`. `PYTHON` can select the CPython executable.
