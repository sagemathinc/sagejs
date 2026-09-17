# Random-relation collector corridor audit

This lane ports one frozen PARI 2.17.4 `rnd_rel` corridor for
`x^4 - 2000022*x - 2000042`. It is diagnostic source work, not a public class
group API or a completeness claim.

## Source mapping

- `buch2.c:get_random_ideal` (2631–2645) is the existing authenticated
  `pari_random_subfactor_ideal` implementation.
- `buch2.c:rnd_rel` (2648–2678) supplies the factor-base search order, computes
  `R * P[j]`, and calls `Fincke_Pohst_ideal` with `RND_REL_RELPID`, the random
  exponent vector, and `j`.
- `buch2.c:bnfinit0` around 3950–4040 schedules `rnd_rel`, extracts new cache
  columns, computes their logarithms, and calls `hnfadd_i`.
- `pari_construct_random_search_ideal` closes the previously missing
  `idealHNF_mul(nf, R, P[j])` edge. The established unreduced-ideal collector,
  relation inserter, log-embedding kernel, and `pari_hnfadd` retain the other
  operations without duplicating them.

The checker builds a pristine release-tarball oracle with instrumentation only.
Its declared control forces the first post-HNF relation collection through the
literal source `rnd_rel` branch; it does not supply relations, generators,
logs, or HNF answers. The compact fixture authenticates the archive, the
77-MiB initial resident-state fixture, and hashes of every full PARI state
boundary.

## Frozen result

The genuine source branch starts at relation 293, uses search ideals `[2, 11]`,
subfactor IDs `[4, 6, 2, 8]`, and random exponents `[3, 5, 5, 7]`. It inserts
two relations and reaches relation 295. The HNF state changes from 4 to 5 rows
and from 282 to 283 `B` columns. CPython replay agrees exactly on RNG state,
random ideal, relation rows, generator coordinates, serialized logarithms,
permutation, and the complete resident `H`, `D`, `B`, and `C` arrays.

Capacity is checked before scheduler or RNG mutation. Malformed search-ideal
construction and insufficient relation capacity are tested transactionally.

## Remaining boundary

This closes the frozen random-relation arithmetic and insertion corridor, but
not the general scheduler loop. Repeated random attempts, cache duplicate
pressure, subfactor changes after this branch, factor-base enlargement, and
unit/final-result reconstruction remain outside this lane.
