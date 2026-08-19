# Number-field foundations performance report with Oscar/Hecke

This report summarizes
`number-field-foundations-dbb189c9-linux-x64.json`. Every retained value was
checked against the same reviewed mathematical digest before its timing was
accepted.

- Sage.js source: `dbb189c91d51db2dff18ac37e1225381ab7c33cf`
- Source tree at measurement time: clean
- Host: Linux x64, 16 AMD EPYC 7B13 virtual CPUs, Node.js 26.7.0
- References: SageMath 10.9.post30, Magma 2.18.5, Julia 1.12.7,
  Oscar 1.8.1, and Hecke 0.39.22
- Policy: one warmup and five retained samples; entries are median milliseconds

| Workload | Sage.js | Sage/PARI | Magma | Oscar/Hecke |
| --- | ---: | ---: | ---: | ---: |
| Compact prime splitting below 250 | 40.181 | 42.337 | 6.8 | 0.951 |
| Exact zeta coefficients through 250 | 54.053 | 0.190 | 9.0 | 1.062 |
| Exact zeta coefficients through 1000 | 123.179 | 0.537 | 16.0 | 3.534 |
| Quadratic zeta at 16 complex points | 17.437 | 12.835 | 1560 | unsupported |
| Supported cubic units, class group, and regulator | 2415.567 | 1.497 | 10.0 | 34.389 |

Magma's compact splitting and coefficient entries are calibrated averages over
100 and 10 repetitions because Magma 2.18 has a coarse timer. All other table
entries use one operation per sample. Startup and compilation are excluded
from retained timings. Raw samples, including Julia compilation outliers after
the warmup, remain in the JSON report.

## Interpretation and next targets

The preceding good-prime Dedekind--Kummer change remains a major success:
relative to the checked-in pre-optimization Sage.js baseline, compact splitting
is over 500 times faster and coefficients through 250 are nearly 400 times
faster in this run.

Oscar/Hecke makes the next low-level bottleneck unambiguous:

- Its compact split stream is about 42 times faster than Sage.js.
- Its coefficient workloads are about 51 times faster through 250 and 35 times
  faster through 1000.
- The mathematical finite-field factorization is already FLINT-backed in both
  systems. The remaining Sage.js gap is therefore dominated by repeated
  Python/host crossings, result materialization, and coefficient orchestration.

The closest bounded optimization is a packed good-prime factor-degree kernel:
send one integral polynomial and a block of primes across the native boundary,
return compact prime-major `(e,f)` data, and retain the existing certified
ideal path only at index-dividing primes. An incremental coefficient-prefix
cache and a source-transparent compiled multiplicative sieve should then reuse
that packed stream. This attacks both measured gaps without changing public
mathematical semantics.

General units/class groups are a different scale of project: Oscar/Hecke is
about 70 times faster here, but Sage.js is also producing replayable
certificates through its deliberately narrow supported cubic path. General
analytic Dedekind zeta remains a separate production-kernel project. Neither
should be disguised as a small optimization.

Sage.js's quadratic analytic path remains a strength: it is close to Sage/PARI,
about 89 times faster than Magma 2.18 on the batch, and Oscar/Hecke does not
provide the corresponding arbitrary-complex evaluator.
