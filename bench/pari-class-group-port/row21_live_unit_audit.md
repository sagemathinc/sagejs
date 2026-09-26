# Row 21 live exact-unit owner

This slice closes the live signature `(3, 1)` unit reconstruction cut after
the authenticated row-21 HNF/log/regulator owner. It does not read W0 while
constructing the result.

## Live dependency chain

`row21_live_unit_host.cjs` accepts only the normalized prepared-number-field
authority and the immutable live acceptance owner. It replays the committed
integer LLL, real LLL, and `cleanarchunit` continuation, derives the private
unimodular getfu factor from that live output, and invokes the ordinary
CPython-parseable native source in `row21_rank3_getfu.py`.

The live factor is

```text
[1, 0, 0,
 0, 1, 0,
 1, 0, 1]
```

The exact integral-basis units, stored columnwise, are:

```text
[-185912356865756, 11177919888470, -12184912219327,
  29412121663763, -6151255384739]
[292362773885377, -17577895736044, 19161631079059,
 -46252856669320, 9673319554961]
[41631765984982, -3295810805494, 6374855887142,
 1311546704851, -5662301906387]
```

Each inverse is reconstructed and checked using the exact multiplication
tensor. Independent exact determinants give norms `[-1, -1, -1]`; exact
dyadic evaluation at the three real embeddings gives sign rows
`[[-1, 1, 1], [1, -1, 1], [1, -1, 1]]`.

## Immutable publication

The published schema is
`sagejs.pari-class-group/row21-live-unit-owner-v1`. The canonical owner is:

```text
/scratch/sagejs-row21-live-unit-owner/
row21-live-units-8d474d9ddbcaa1d8cfca584b089e666100f143834105ce393f82f34b0140fcd9.json.gz
```

- canonical JSON SHA-256:
  `8d474d9ddbcaa1d8cfca584b089e666100f143834105ce393f82f34b0140fcd9`
- gzip SHA-256:
  `a496ca3e0d518d40c8eb745d69610dd9f6e0423298f506c415b548f9018f455a`
- authenticated predecessor SHA-256:
  `530fbd38198464fcac1285402cdb1394bdb8ce82f876198770aaef475b2749bb`

The owner carries the exact units and inverses, norms and real signs,
integer/real/getfu transforms, getfu output logs and states, the accepted
regulator and relation lattice, and the HNF ancestry. Native builds use the
lane-private `/scratch/sagejs-row21-unit-native-cache`.

`check_row21_live_unit.cjs` verifies two byte-identical publications, rejects
prepared and acceptance-owner mutations before publication, rejects a unit
mutation during exact replay, and only then opens W0 as a postcompute oracle.
The postcompute unit set agrees.

## Remaining boundary

There is no remaining blocker in the rank-three unit suffix. The next and
only row-21 boundary is final class-group/BNF assembly and public-result
correspondence. For this class-number-one row, the source-derived result must
still authenticate that the Smith/class-group generator side is empty and
assemble the trivial `clg1` and six empty `clg2` components from the live HNF,
relation records, archimedean data, and this unit owner. It must then bind the
class number `1`, empty invariants, accepted regulator, and three exact units
to the final public result. W0 `class_group_input`, `class_group_output`,
`final_state`, and `result` remain postcompute differentials only; none is an
authorized runtime input.
