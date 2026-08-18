# Maximal-order production-parallel public receipt

This receipt closes the production many-prime parallel crossover gate on
`pari-round4-vector-001`. The boundary is a fresh public
`NumberField.maximal_order(trace=True)` call. The benchmark deliberately makes
the complete native resource unavailable, then compares the exact sequential
fallback with the production precompiled worker graph. No cached order is
timed.

| mode | fresh samples (s) | median (s) | median peak RSS |
| --- | --- | ---: | ---: |
| sequential public | 67.033, 67.165, 65.879 | 67.033 | 684 MB |
| parallel public | 63.789, 63.531, 63.067 | 63.531 | 1.266 GB |

The median speedup is **1.0551×**. All three parallel samples are faster than
all three sequential samples. Every one of the six fresh processes returned
the same basis SHA-256 (`abc9ec14…95669`), field discriminant, and
equation-order index.

The parallel trace reports four workers, seven useful independent branches,
`measured-native-fallback-crossover`, an available content-bound worker graph,
and a 1.611 GB predicted peak under the explicit 4 GiB measurement budget.
The sequential control sees the same available runtime graph but explicitly
declines it through the capability input.

The implementation change is general scheduler dataflow: jobs are submitted
in deterministic longest-predicted-job-first order and the bounded pool pulls
the next branch as soon as any worker becomes free. Canonical result ordering,
parent-side CRT/HNF assembly, memory gates, and fatal-result cancellation are
unchanged. The profile justifying it records 2- and 3-adic branches near 14 and
19 seconds, a 641-adic branch near 7 seconds, and four much smaller tails;
canonical-key wave barriers therefore left workers idle.

Focused validation covers exact sequential/parallel equality, randomized
completion order, content-bound graph capability, native-first suppression,
fatal worker errors, and prompt cancellation of a deliberately sleeping
sibling. The raw structured values and scoped source digests are in the JSON
receipt. The measurement commit was rebased onto integration `55465aca`; all
four scoped source files are byte-identical across the rebase.
