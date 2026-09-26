# Random-relation cache resumption audit

This lane closes the field-3 discrepancy immediately after the authenticated
PARI 2.17.4 `rnd_rel` append.  The source references are
`src/basemath/buch2.c`'s `rnd_rel` return and the following `small_norm` loop
in `Buchall_param`.

## Finding

The discrepancy was not a missing relation-basis or FACT primitive.  Pristine
source instrumentation freezes the following state:

- at `rnd_rel` return: `last=end=295`, `chk=293`, `missing=relsup=0`;
- at the next `small_norm` entry: `last=295`, `end=296`, `chk=295`, and the
  identical 288-by-288 basis and FACT list;
- `done_small=290`, so LIE is false although the selected ideal is
  `290 mod 289 = 1`.

The earlier composition retained only the equivalent selected index in an
outer frame whose absolute counter was 1.  That changed parity, incorrectly
entered LIE, and widened the cache target from 296 to 300; three relations
were accepted before the collector returned at 298.  Publishing the source's
absolute counter while retaining every resident owner gives exactly one row,
295 to 296.

`pari_resume_after_random_relations` restores only this lost scalar fact.  It
requires congruence modulo `KC+1`, validates the fully published resident
cache, mirrors `last/end/missing`, and cannot touch FACT, the cache basis,
relations, generators, or logs.  Validation is transactional.

## Evidence

`check_rnd_lie_cache_resume.cjs` rebuilds an instrumented pristine PARI source
oracle, checks the frozen hashes, and composes the existing ordinary-Python
random corridor with the new boundary.  CPython reproduces the exact PARI
relation, generator, and logarithm at column 296; the random-prefix HNF is
also unchanged.  The boundary itself is differentially replayed through the
JavaScript and GMP native backends, including a malformed-counter transaction
test.

The fixture is control-only: no relation or HNF answer is passed to the Python
implementation.  The 290 counter is an authenticated scheduler state from the
source trace, not an answer-derived arithmetic input.

## Next frontier

After column 296, `done_small` becomes 291 and pristine PARI genuinely enters
LIE with cache `last=296,end=297,chk=296`.  FACT changes to
`[(1,24),(6,1),(16,2),(150,1),(231,1),(254,1)]`; the relation basis remains
unchanged.  The next lane should publish column 296 through resident HNF and
acceptance, then connect this genuine LIE iteration.  No additional cache
basis implementation is justified by the present trace.
