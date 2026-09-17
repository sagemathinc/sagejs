# Field-3 mixed-unit suffix

This lane connects the authenticated post-`rnd_rel`/LIE field-3 owners to the
existing rank-two lattice and mixed-quartic `getfu` translations.  The field is
`x^4 - 2000022*x - 2000042`; its live terminal geometry is 301 relation-log
columns, 286 retained `B` columns, hence `A = C[:13]`.

`field3_mixed_unit_suffix.py` adds the missing source-order boundaries:

- signature `(2,1)` `cleanarchunit`, including the `2*pi` periods at the two
  real places, the `4*pi` period at the complex place, log-norm rejection, and
  the regulator discrepancy retry;
- `fixarch` and factor application feeding `pari_getfu_mixed_quartic`;
- an explicit action mapping which does not turn `getfu`'s legitimate LARGE or
  PRECI `not_given` result into a Buchall precision restart.

The replay obtains `A`, `L`, and `R` from the existing authenticated resident
producer rather than a frozen answer.  Number-field embedding and
multiplication-table owners come from a separately instrumented pristine PARI
2.17.4 `nfinit`/Buchall process and do not determine any lattice factor.  The
focused checker derives both lattice transforms live, compares exact CPython,
JavaScript, and GMP results, runs the translated mixed-quartic reconstruction,
and checks transactional rejection.  At 192 bits this field reaches a
legitimate `fupb_PRECI` (`getfu` status 3); the cleanarch phase itself succeeds
with no retry.

Run the producer-backed checker with the four prerequisite paths, or reuse an
authority JSON emitted by the replay:

```text
node bench/pari-class-group-port/check_field3_mixed_unit_suffix.cjs \
  PARI_TREE PARI_ARCHIVE INITIAL_FIXTURE ANALYTIC_FIXTURE

node bench/pari-class-group-port/check_field3_mixed_unit_suffix.cjs \
  --authority /tmp/field3-retained.json
```

This is a draft integration lane.  It deliberately does not modify the final
composer or shared integration runner.  The remaining end-to-end obstruction
is a higher-precision live producer/replay (or precision restart) capable of
crossing field 3's legitimate 192-bit `getfu` PRECI result and publishing
actual algebraic fundamental units.
