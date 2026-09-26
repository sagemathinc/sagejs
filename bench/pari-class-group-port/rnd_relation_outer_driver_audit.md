# Random-relation outer-driver audit

This lane composes the authenticated field-3 `rnd_rel` corridor with the
resident HNF/acceptance driver. It follows PARI 2.17.4 `buch2.c` around
`Buchall_param` lines 3870–4083. It does not claim the later corridor is closed.

## Closed boundary

`pari_publish_random_outer_append` publishes a successful random HNF append
transactionally, without refactoring or relogging accepted columns. It retains
the resident H/D/B/C owners, advances the accepted relation count, derives the
source search list, preserves acceptance actions 3/4/5, and performs the first
dimension-ready `small_fail`/`fail_limit` transition before setting A/R state.
A short trace owner fails before publication.

For `x^4-2000022*x-2000042`, the replay agrees with pristine PARI through
column 295 on:

- the random generator and RNG state;
- all relation rows and provenance;
- exact generators and logarithms;
- H, D, B, C, dimensions, and the mutated permutation; and
- acceptance action 5 and its one-relation retry request.

The controller has focused JavaScript and GMP native differential coverage.
Tagged storage is not applicable to the frozen 256–320-bit logarithm/HNF
owners.

## Exact remaining frontier

The immediately following source branch is the LIE `small_norm` pass at
`done_small == 1`, with W width 5 and `F.L_jid` equal to the first five entries
of the new HNF permutation. PARI appends one relation, moving 295 to 296. The
current resident closure appends three different relations, moving 295 to 298,
despite agreeing on need, `j`, fail limit, HNF state, and permutation.

Therefore the missing primitive is narrower than random relation collection or
HNF: it is the persistent `FACT`/relation-cache state passed from `rnd_rel`
into the next LIE `small_norm` call. The next lane should instrument and replay
PARI's `FACT` plus cache basis/missing state at those two boundaries, then make
that state an explicit resident owner. Terminal candidate replay must wait for
this equality; using answer-derived relations would conceal the defect.

