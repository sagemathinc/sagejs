# Number-field zeta performance after packed coefficient acceleration

This report summarizes
`number-field-foundations-bae339db-linux-x64.json`. Every retained value was
checked against the same reviewed mathematical digest before its timing was
accepted.

- Sage.js source: `bae339db4215fef12c881c288eae12d34fbe2649`
- Source tree at measurement time: clean
- Host: Linux x64, 16 AMD EPYC 7B13 virtual CPUs, Node.js 26.7.0
- Workers: SageMath 10.9.post1, Magma 2.18.5, Julia 1.12.7,
  Oscar 1.8.1, and Hecke 0.39.22
- Policy: two warmups and seven retained samples; entries are median
  milliseconds

| Workload | Sage.js | Sage/PARI | Magma | Oscar/Hecke |
| --- | ---: | ---: | ---: | ---: |
| Compact prime splitting below 250 | 3.178 | 41.862 | 6.4 | 0.698 |
| Exact zeta coefficients through 250 | 1.950 | 0.141 | 8.0 | 0.730 |
| Exact zeta coefficients through 1000 | 3.567 | 0.462 | 16.0 | 2.922 |
| Quadratic zeta at 16 complex points | 17.003 | 12.591 | 1490 | unsupported |

Magma's compact splitting and coefficient entries are calibrated averages over
100 and 10 repetitions because Magma 2.18 has a coarse timer. All other table
entries use one operation per sample. Persistent-process startup and
compilation are excluded. The JSON report retains every sample and exact
version string.

## Result

Relative to the immediately preceding clean report at `dbb189c9`, Sage.js is:

- 12.6 times faster for the compact prime stream;
- 27.7 times faster for coefficients through 250; and
- 34.5 times faster for coefficients through 1000.

The new implementation batches all good-prime polynomial factorizations behind
one bounded FLINT adapter. It retains the certified prime-ideal path at
index-dividing primes. A source-transparent exact-integer kernel then assembles
the multiplicative coefficients, with the same source as the portable dynamic
fallback. The packed provider records its complete prime interval; FLINT still
checks primality, factor multiplicities, residue degrees, and the local-degree
identity before any coefficient is used.

This reaches the intended competitive range. Sage.js is faster than Magma on
all four measured workloads, is within about 22 percent of Hecke through 1000,
and is about 35 percent slower than Sage/PARI for the arbitrary-complex
quadratic batch. Sage/PARI remains 8--14 times faster for coefficient prefixes,
where its direct PARI path is the strongest remaining baseline. At bound 1000,
roughly half of Sage.js's time is now the unavoidable public exact-list
materialization rather than factorization or coefficient arithmetic.

The compact stream remains 4.6 times slower than Hecke because the public
versioned dictionaries are intentionally materialized. A packed expert API
could remove that cost, but changing the ordinary public return type would be a
semantic regression and is not justified by this benchmark.
