# Public maximal-order retained-timeout delta at 56ea43a8

This checked delta reruns exactly the 31 timeout IDs retained by the prior c1b31206 artifact. Each uniform-policy case uses a newly spawned Sage.js worker, a fresh public number field, no warmup, one sample, a five-second request bound, and independent exact-lattice verification. Timeouts remain bounded outcomes rather than correctness failures. The JSON companion preserves all raw adapter records and status/timing comparisons.

## Identity and policy

- Sage.js commit: `56ea43a81750da2259e9f121252ff6487663d7d1`
- Baseline artifact commit: `c1b3120639048c19e0a527584032b6de5f69df80`
- Baseline artifact SHA-256: `9fde8029c8a10f0d65b0b2f3a2d94562eaca1be7c8fe22de51f808dbc975cbfe`
- Generated: 2026-08-17T23:33:18.857Z
- Host/OS: project-52d00914-04c1-4c7a-83d6-69240c2570f1; Linux 6.17.0-1022-gcp (linux-x64)
- CPU: AMD EPYC 7B13; 16 logical CPUs
- Node: v26.7.0
- Native addon SHA-256: `8ecf5828e4ef4e0e02167a605f60e16a81555a6e4612e019c4138593bdc5d352`
- Corpus manifest: `cf66e794684801d794410cd982dcac220f1fbb415ff04c9d6f65705153eadb2d`
- Policy: fresh worker and field per case, 0 warmups, 1 sample, 5000 ms/request, 4096 MiB

## Checked result

- Prior timeout cases selected: **31**
- Recovered with independently verified exact lattices: **16**
- Still timed out at five seconds: **15**
- Other terminal states: **0**
- Wrong/invalid lattices: **0**
- Dropped cases: **0**

Recovered cases and current timings:

| Case | Maximal-order median (ms) | Request wall (ms) | Exact lattice verified |
|---|---:|---:|---|
| `pari-round4-vector-152` | 2816.147 | 3315.609 | yes |
| `pari-round4-vector-168` | 4494.283 | 4952.161 | yes |
| `pari-round4-vector-169` | 2442.554 | 2901.592 | yes |
| `pari-round4-vector-174` | 2352.364 | 2892.922 | yes |
| `pari-round4-vector-180` | 2364.247 | 2781.521 | yes |
| `pari-round4-vector-188` | 2873.291 | 3308.373 | yes |
| `pari-round4-vector-200` | 2155.128 | 2573.107 | yes |
| `pari-round4-vector-250` | 2099.018 | 2509.775 | yes |
| `pari-round4-vector-267` | 2223.783 | 2730.985 | yes |
| `pari-round4-vector-273` | 1803.581 | 2261.462 | yes |
| `pari-round4-vector-280` | 2536.262 | 3008.304 | yes |
| `pari-round4-vector-285` | 2078.732 | 2566.329 | yes |
| `pari-round4-vector-286` | 1580.041 | 2110.093 | yes |
| `pari-round4-vector-307` | 2126.891 | 2659.626 | yes |
| `pari-round4-vector-314` | 2489.664 | 2929.369 | yes |
| `pari-round4-vector-365` | 3179.077 | 3690.876 | yes |

Still-timeout case IDs:

`pari-round4-vector-007`, `pari-round4-vector-010`, `pari-round4-vector-104`, `pari-round4-vector-139`, `pari-round4-vector-419`, `pari-round4-vector-420`, `pari-round4-vector-421`, `pari-round4-vector-422`, `pari-round4-vector-423`, `pari-round4-vector-424`, `pari-round4-vector-425`, `pari-round4-vector-426`, `pari-round4-vector-429`, `hecke-degree-90`, `hecke-precision-degree-12`

## Prior comparison

Every selected baseline row had status `timeout` at 5000 ms and therefore no accepted maximal-order median. The JSON records each exact `timeout->...` transition, current timing when available, and an explicit null speedup ratio when the baseline exposes no timing. No longer-bound diagnostic is substituted into this fixed-policy partition.

## Vector 139 timeout reconciliation

The raw uniform sweep row for vector 139 remains **timeout**. An immediate controlled rerun used the same commit, polynomial and certificate digests, native addon, fresh-worker public adapter, and 5000 ms request policy. It completed in **1843.770 ms** and independently verified the exact frozen lattice. Its trace contains the native word-prime batch and leaves only `165737651359214206423` in `local_primes`, excluding stale native routing. The request timeout begins after worker readiness, and each uniform case already had its own worker, excluding startup charging and timeout-recovery state.

This classifies the original bounded miss as transient shared-host runtime contention during the uniform sweep. The controlled result is retained separately in JSON and does **not** replace or silently reclassify the raw uniform timeout.

## Vector 010 diagnostic

Vector 010 was separately rerun in another fresh worker at 30000 ms. Diagnostic state: **timeout**; maximal-order median: **not available**; exact lattice verified: **not available**.

## Interpretation

Every recovered row passed independent containment, closure, discriminant/index, and frozen canonical-lattice checks. A still-timeout row means only that the fixed resource budget expired. All 31 selected IDs have one and only one raw uniform-policy record.
