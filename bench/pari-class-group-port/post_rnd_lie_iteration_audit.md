# Post-random HNF and genuine LIE audit

This lane continues the authenticated field-3 forced-random trace for
`x^4-2000022*x-2000042` from column 295 through PARI 2.17.4's terminal class
candidate.  It uses the existing same-source collector, log, HNF, acceptance,
and resident publication kernels; the only new Python boundary validates and
prepares the genuine LIE iteration.

## Exact corridor

1. The first post-random `small_norm` pass, with absolute `done_small=290`,
   appends exactly one relation, generator, and logarithm: 295 to 296.
2. That row is appended to resident HNF.  `H/D/B/C` agree exactly with the
   pristine PARI `hnfadd` output and acceptance returns retry action 5.
3. Finishing the pass increments `done_small` to 291.  The new boundary
   requires the completed cache/log state, resident `A/R/W`, odd absolute
   counter, and the prior scheduler completion before reserving the next pass.
4. Since `R` is nonempty, `W` has five columns, and 291 is odd, the existing
   outer scheduler enters the real LIE branch.  It appends exactly five rows,
   taking the cache from 296 to 301.  All relations, generators, and logs match
   the source trace exactly.
5. The five rows produce exact terminal `H/D/B/C`; resident acceptance returns
   action 0.

The frozen source cache evidence also proves this is the intended changing-
FACT branch.  FACT changes from
`[(6,1),(13,2),(17,1),(19,1),(22,1),(39,1),(60,1),(11,1)]` at the preceding
entry to `[(1,24),(6,1),(16,2),(150,1),(231,1),(254,1)]` at LIE entry, while
the 288-by-288 relation basis hash remains
`b20c7ee3c3b01a4ab11bae2742f0a47569e27de9fd9df7e38dd4c8809bcbcd50`.

## Safety and provenance

The source oracle supplies scheduling/control facts only.  No relation,
generator, logarithm, HNF, or acceptance answer is passed to the Python
computation.  Their complete outputs are compared after computation.  The RNG
state remains the authenticated state after construction of the random ideal;
the deterministic post-random and LIE passes do not consume further draws.

`pari_prepare_post_random_lie` is ordinary CPython-parseable source with a
same-source dynamic fallback.  JavaScript and GMP native checks cover success
and cache-capacity retry.  The retry returns `-1` without mutating the outer or
relation state.

## Next frontier

The frozen forced-random relation/HNF loop now reaches terminal action 0.
Remaining end-to-end work is after this candidate: carry its resident
`H/D/B/C`, regulator/unit state, and acceptance result into final class/unit
construction and independent witness replay.  The relation scheduler itself
no longer has an identified gap on this field.
