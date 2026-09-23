# Row-4 C7 class-and-unit composition audit

This cut joins the three immutable row-4 authorities through the field-neutral
`class-unit-correspondence-result-v1` contract:

- presentation `122f1a…53bcfa`, giving `Cl(K) = Z/2Z`;
- class witness `dd9f39…de3a`, proving the selected ideal has exact order two;
- rank-two unit owner `81fd6b…32343`, retaining two exact factored units.

The field is the totally real cubic

```text
x^3 - 20000000010*x + 20000000018.
```

## Exact joined evidence

The class generator is the source factor-base ideal at index two.  Its square
is replayed as a signed product of 397 authenticated principal relations.  The
composer checks every compact principal factor against the corresponding
presentation generator, retains both positive and negative exponents, and
publishes the presentation `[2]`.

The unit owner supplies a `567 x 2` raw-relation provenance matrix.  Its own
replay has established `R*T = 0`, exact principal-generator products, norms
`(-1,+1)`, real signs, and the accepted regulator.  C7 retains that provenance,
the `7 x 2` kernel transform, norms, signs, and packed regulator.  PARI's
ordinary materialization policy is represented honestly as
`not_given(LARGE)` at 192-bit precision; the exact factored units remain in
authenticated storage even though expanded power-basis units are not claimed.
The torsion subgroup has order two with generator `-1`.

The frozen trace's source event is `honesty_complete(extraRequired=false)`, so
the neutral result records honesty outcome `not-required`.  Factor-base bounds,
GRH bounds, and PARI correspondence remain explicit assumptions.

## Boundary honesty

This is an internally correspondence-complete C7 result, not a public complete
result.  Raw relation logarithms still enter through the frozen W0 trace, so

```text
frozenW0UsedAsInput = true
inputBoundaryComplete = false
qualifiedTiming = false
publicComplete = false
```

No prepared-input or performance claim is made.  The component owners each
remain incomplete in isolation; `correspondenceComplete=true` is created only
after their detached replays and all cross-owner joins succeed.

The focused checker authenticates immutable inputs, repeats the full join as
an out-of-band publication replay, tests idempotent publication and conflict
handling, rejects authority and coordinated semantic mutations, rejects
fraudulent resealing, and writes a mode-0444 content-addressed result.  Run it
under its built-in 600-second/4-GiB process cap:

```bash
node bench/pari-class-group-port/check_row4_c7_result_composer.cjs \
  ROW4_PRESENTATION.json ROW4_CLASS_WITNESS.json ROW4_UNIT_OWNER.json OUTPUT_DIR
```
