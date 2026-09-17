# Independent regulator and acceptance replay

## Result

The authentic totally real cubic `x^3 - 20018*x + 20034` now has an
independent, cold regulator replay for the two exact units selected by the
ported PARI path.  The replay is deliberately narrower than a class-and-unit
certificate:

- both reconstructed algebraic integers have exact norm `-1`;
- their exact selected relation vectors are independent;
- Sage.js's existing QQbar/Arb outward-rounding logarithmic embeddings enclose
  all six packed 192-bit PARI logarithms;
- the standard `certified_regulator_enclosure` path proves that the weighted
  rank-two determinant excludes zero;
- its interval contains PARI's independently packed accepted regulator; and
- both rigorous logarithm rows contain zero after summing all three real
  places, as required by the product formula.

At 128 bits, the resulting regulator enclosure is

```text
[64103376971992967867257901411463004368896871 /
 42535295865117307932921825928971026432,
 256413507887971871469031605645852017485958701 /
 170141183460469231731687303715884105728]
```

The determinant radius is
`10371217 / 340282366920938463463374607431768211456`.  The requested
128-bit initial precision already meets the 96-bit absolute tolerance, so the
rigorous precision history is exactly `[128]`.

## Authentic input link

The frozen fixture records all data used by the replay rather than a decimal
regulator answer:

- the defining polynomial and exact integral basis
  `[1, x, x^2 + 2*x - 13345]`;
- both exact reconstructed units in power-basis coordinates;
- the exact `2 x 7` selected unit transform and identical relation-provenance
  transform;
- all six selected resident packed logarithms and the resident packed
  regulator;
- SHA-256 identities for the accepted archimedean relation matrix and relation
  lattice; and
- SHA-256 identities for the successful 2176-bit retry logarithms and
  regulator, together with the 2240-bit embedding and 2304-bit working-capacity
  decisions.

The large successful-retry values are not duplicated a second time: their
hashes bind this replay to the authentic retry artifact, while the exact units
and the resident packed values are independently re-evaluated here.  The unit
bridge fixture is pinned by SHA-256, as are the PARI 2.17.4 archive and
`buch2.c`.

The intended integration companion is the authentic cubic unit-retry change
`06f104f788c875bce15251c6be266a7b8de75992`.  That change records the same
successful 2176-bit source-oracle values and the accepted retry link
`[6, 12, 1]`; this replay independently binds those values by digest and then
recomputes the mathematical evidence from the exact selected units.

## Replay boundary

`regulator_acceptance_replay.py` is ordinary CPython-parseable Python.  It
constructs standard `FactoredNumberFieldElement` values, asks the existing
production analytic machinery for rigorous log balls, and calls the standard
`certified_regulator_enclosure`.  It contains no replacement floating-point
determinant and no handwritten native mathematics.

The sealed envelope contains the normalized inputs, rigorous evidence, exact
precision decisions, and three explicitly separated statuses:

1. `pari_correspondence.assumed` records that selection, scheduling, and
   heuristic acceptance follow the pinned PARI 2.17.4 path.
2. `rigorous_local_replay` records only what is independently established here:
   unit norms, rank of the selected lattice, product formula, regulator
   enclosure, and containment of packed values.
3. `public_certification` remains false.  No independent saturation/index-one
   certificate or complete authenticated class presentation is introduced by
   this replay.

Cold replay reconstructs the field elements and every evidence field from the
sealed inputs.  Merely recomputing the outer hashes cannot bless altered
mathematics.  The focused test rejects coordinated, rehashed mutations of an
exact unit coefficient, packed log, selected lattice, regulator interval,
precision history, and public-completion flag.

This distinction is essential: a rigorous regulator of the **selected** unit
lattice proves rank two, not that the selected lattice has index one in the
full unit group.  Promotion to `UnitGroupComputation(complete=True)` still
requires `UnitSaturationIndexCertificate` or equivalent replayable index-one
evidence.  Full class-and-unit completion additionally needs the authenticated
factor base, relation presentation, generator witnesses, torsion authority,
and the plan's proof payload.

## Reproduction

From a built integration worktree:

```bash
python3 bench/pari-class-group-port/check_regulator_acceptance_replay.py
node bench/pari-class-group-port/check_regulator_acceptance_replay.cjs
```

During isolated-lane development the JavaScript checker can reuse an already
built runtime without changing its mathematical inputs:

```bash
SAGEJS_REPLAY_RUNTIME_ROOT=/home/user/sagejs-worktrees/pari-class-group-e2e-integration \
  node bench/pari-class-group-port/check_regulator_acceptance_replay.cjs
```

The focused cold replay takes about four seconds on the development host and
rejects all six mutations.  The envelope digest in that run was
`7d6d75c1de98a836714d87aac7f75ef73089173baa6c0f33a4b8fb7493439654`.
It is an evidence identity, not a public certification token.
