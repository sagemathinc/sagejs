# No-oracle unit/regulator completion

## Result

For the qualified resident computation of
`x^3 - 20018*x + 20034`, the focused checker now reaches an internal
unit/regulator correspondence without running PARI and without reading
answer-derived unit coordinates, logarithms, or embeddings.

The replay has three independently checked leaves:

1. `derive_relation_unit_leaf` verifies the qualified resident presentation,
   composes the seven HNF-kernel factors back through all 73 principal
   relations, reads only the accepted 2-by-7 compact exponent handoff, and
   materializes two exact units. The compact fixture's legacy
   `archimedean`, `expected_materialized_units`, and `replay_factor_pool`
   fields are not read.
2. The checker refines the three resident roots to 2,176 bits, reconstructs
   the integral-basis embedding, evaluates all 73 exact principal generators,
   and applies the exact 2-by-73 relation transform. This uses the ordinary
   Python sources in `cubic_embedding_precision_rebuild.py` and
   `cubic_precision_rebuild.py`, compiled through the normal native compiler.
3. `regulator_acceptance_replay.py` independently reconstructs the two exact
   number-field elements, proves their norms are `-1`, recomputes outward
   rounded logarithm balls, checks all six rebuilt packed logarithms, and
   rigorously separates the rank-two regulator determinant.

The sealed composition reports:

- two exact relation-derived units;
- a 2,176-bit rebuilt embedding and six 2,176-bit rebuilt logs;
- a rigorous, full-rank regulator enclosure;
- `correspondence_complete = true` within the explicit PARI 2.17.4
  correspondence assumptions;
- `public_complete = false` and `unit_saturation_certified = false`.

## Important boundary

This does **not** prove that the selected rank-two lattice has index one in the
full unit group. PARI's heuristic bounds and acceptance decisions remain an
explicit internal-correspondence assumption. Public completion still requires
a replayable unit-saturation/index-one certificate and the standard class-unit
proof payload with its factor-base bound and proof stage.

The first attempted direct evaluation of the two very large final units also
identified a real representation boundary: the low-level atom evaluator does
not implement a multiword-integer times packed-real product. The authentic
representation avoids that primitive. It evaluates the 73 small principal
generators and then applies the exact integer relation transform, matching the
intended PARI data flow and preserving readable source.

## Focused replay

```sh
SAGEJS_REPLAY_RUNTIME_ROOT=/home/user/sagejs-worktrees/pari-class-group-e2e-integration \
  node bench/pari-class-group-port/check_no_oracle_unit_regulator_completion.cjs
```

The checker cold-replays the sealed envelope and rejects coordinated changes
to exact unit coordinates, source scope, packed logs, producer identity,
authority links, rigorous containment, and public saturation claims.
