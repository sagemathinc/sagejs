# Number-field foundations performance report

This is the human-readable summary of
`number-field-foundations-3a98a9e6-linux-x64.json`. Every retained result was
checked against the same reviewed mathematical digest before its timing was
accepted.

- Sage.js source: `3a98a9e68b24759eecdd2de4fe8a8972205d42f1`
- Source tree at measurement time: clean
- Host: Linux x64, 16 AMD EPYC 7B13 virtual CPUs, Node.js 26.7.0
- References: SageMath 10.9.post30 and Magma 2.18.5
- Policy: one warmup and five retained samples; table entries are medians in ms

| Workload | Sage.js | Sage/PARI | Magma |
| --- | ---: | ---: | ---: |
| Compact prime splitting, cubic, primes below 250 | 39.152 | 43.421 | 6.5 |
| Exact zeta coefficients through 250 | 43.609 | 0.209 | 8.0 |
| Exact zeta coefficients through 1000 | 119.096 | 0.573 | 16.0 |
| Quadratic zeta at 16 complex points | 16.917 | 12.431 | 1520 |
| Certified units, class group, and regulator for the supported cubic | 2257.983 | 1.464 | 10.0 |

Magma 2.18 reports time coarsely, so its compact splitting and coefficient
entries are averages over respectively 100 and 10 repetitions. The JSON
records those repetition counts. All other entries use one operation per
sample. Startup is excluded for every system.

## Before and after

The clean pre-optimization baseline is
`number-field-foundations-baseline-9409f1cc.json` on this same host and
runtime:

| Sage.js workload | Before | After | Speedup |
| --- | ---: | ---: | ---: |
| Compact prime splitting below 250 | 20273.960 ms | 39.152 ms | 517.8x |
| Exact zeta coefficients through 250 | 20822.356 ms | 43.609 ms | 477.5x |

The speedup comes from using exact Dedekind--Kummer polynomial factorization
at primes that do not divide the equation-order index, while retaining the
full certified prime-ideal path at every index-dividing prime.

## Interpretation

- Compact splitting is now slightly faster than Sage/PARI on this workload,
  though Magma remains about 6x faster.
- The batched quadratic zeta path is close to Sage/PARI and about 90x faster
  than this Magma version.
- Coefficient production still spends much more orchestration time than
  Sage/PARI. A packed native multi-prime factor-degree stream is the clearest
  next optimization.
- General units/class groups and the readable general-zeta reference are not
  competitive production kernels yet. The general-zeta workload stays
  opt-in because Sage.js takes minutes; Sage/PARI and Magma independently
  agree on its reviewed low-precision digest.
- Julia, Hecke, and Oscar were unavailable on this host, so no fabricated or
  substituted timings are reported for them.
