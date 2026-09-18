# Row-11 C7 class-and-unit composition audit

This neutral C7 cut joins the two immutable row-11 authorities through
`class-unit-correspondence-result-v1`:

- terminal class owner `46d74e9b…18879`, which proves the presentation and
  both exact order-two ideal classes;
- rank-two C5/C6 owner `7419b9fa…c53ac`, which retains both exact compact
  units and the authentic terminal `LARGE` policy.

The field is

```text
x^4 - 2000010*x - 2000018
```

with signature `(2,1)`. Each JSON owner is inert input until an out-of-band
detached replay capability revalidates it. The composer is data-only: it does
not read files, launch a process, or manufacture its own replay authority.

## Exact joined result

The class owner supplies presentation `diag(2,2)`, two mapped quartic ideals,
and signed compact principal products with 336 and 330 retained-relation
factors. It has replayed all 430 exact principal relations and proved both
generator squares. The quotient enumeration proves

```text
Cl(K) = Z/2Z x Z/2Z, class number 4.
```

The unit owner supplies a `430 x 2` raw-relation provenance matrix and a
`9 x 2` kernel transform. Each compact unit has 330 signed factors. During the
join, every compact principal factor is matched to the class owner's exact
retained principal generator, each sparse vector is recomposed to the dense
provenance column, and the exact norms `[+1,+1]` and real-place signs
`[(+,+),(-,-)]` are retained.

PARI's actual terminal policy is preserved exactly:

```text
C6 status = 2
C6 state  = [2,21,0,0,0,0,0,1]
materialization = not_given(LARGE)
```

No expanded fundamental unit is claimed. The envelope retains the accepted
192-bit packed regulator and the exact compact unit representation. Since the
field has a real embedding, its torsion subgroup is `{+1,-1}`; the result
records order two and the power-basis generator `[-1,0,0,0]`.

The authenticated W0 event sequence contains
`honesty_complete(extraRequired=false)`. The neutral honesty outcome is
therefore `not-required`; factor-base bounds, GRH bounds, and PARI's
class-and-unit correspondence remain explicit assumptions.

## Boundary honesty

The raw relation logarithms still enter through pristine frozen W0
`6444c050…04165`. There is no live prepared-input root and no qualified timing
claim, so the completed internal correspondence deliberately preserves

```text
frozenW0UsedAsInput = true
inputBoundaryComplete = false
qualifiedTiming = false
correspondenceComplete = true
publicComplete = false
```

This is a complete internal class-and-unit correspondence, not a public result
adapter.

## Validation

The focused checker regenerates both committed owners when invoked without
arguments, performs their detached replays and all cross-owner joins, repeats
the full composition as publication replay, tests transactional and immutable
filesystem idempotence, rejects authority, semantic, and fraudulent-envelope
mutations, and publishes a mode-`0444` content-addressed result. The whole run
is capped at 600 seconds and 4 GiB:

```sh
node bench/pari-class-group-port/check_row11_c7_result_composer.cjs
```

Existing immutable owners may instead be supplied explicitly:

```sh
node bench/pari-class-group-port/check_row11_c7_result_composer.cjs \
  ROW11_CLASS_OWNER.json ROW11_UNIT_OWNER.json OUTPUT_DIR
```
