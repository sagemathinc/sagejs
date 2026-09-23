# Live regulator interval authority

## Boundary

`build_live_regulator_interval_authority` is the independent verifier for a
regulator produced by the timed native class-group root. It consumes:

- the live packed regulator;
- the exact ordered free units in power-basis coordinates;
- their ordered relation provenance; and
- their ordered packed logarithms.

It does **not** consume a known regulator, a serialized known interval, or an
ULP tolerance. Outside the timed root it reconstructs exact number-field
elements, proves their norms are `+/-1`, creates
`FactoredNumberFieldElement` values, and asks the production
`certified_regulator_enclosure` path to build fresh rigorous logarithm and
determinant owners. The live regulator is authoritative only when the fresh
determinant enclosure is rigorous, excludes zero, and contains it.

This placement is intentional. The native root measures correspondence with
PARI's algorithm. The independent verifier is separately timed and cannot
turn a detached known answer into an input to that measured root.

## Ordered identity

The authority binds the exact ordered unit coordinates, relation-provenance
rows, packed logarithms, and live regulator with separate SHA-256 identities.
It also verifies that provenance has full row rank, every packed logarithm lies
in the corresponding freshly generated log ball, and every exact unit's full
archimedean row satisfies the product formula.

Absolute determinant values alone do not preserve ordering: swapping units or
inverting one can leave the regulator unchanged. Consequently the hashes are
part of the authority, and the focused test demonstrates that swapping the
provenance rows changes its identity.

## Interval versus fingerprint semantics

For the frozen real cubic, the independent 128-bit enclosure is

```text
[64103376971992967867257901411463004368896871 /
 42535295865117307932921825928971026432,
 256413507887971871469031605645852017485958701 /
 170141183460469231731687303715884105728]
```

Its radius is
`10371217 / 340282366920938463463374607431768211456`. The p2,176
native determinant, the resident p192 determinant, and a one-ulp perturbation
of the latter all lie inside this enclosure. The focused negative test chooses
the first p192 grid point beyond each exact endpoint and verifies that both are
rejected.

The observed exact `+4` p192-ulp difference between the direct resident path
and rounded p2,176 path remains useful as an external diagnostic fingerprint.
It is not an acceptance corridor. The authority explicitly records
`ulp_corridor_used_for_acceptance = false`, and neither a reference regulator
nor the number four appears in its API.

## Scope

The result proves a rigorous regulator for the supplied ordered rank-many unit
lattice. It does not prove that this lattice has index one in the full unit
group. `unit_saturation_index_one` and `public_class_unit_complete` therefore
remain false. A public completion still requires independent replayable
saturation evidence and the full class-group proof payload.

## Focused validation

```bash
python3 bench/pari-class-group-port/check_regulator_interval_authority.py
node --check bench/pari-class-group-port/check_regulator_interval_authority.cjs
SAGEJS_REPLAY_RUNTIME_ROOT=/home/user/sagejs-worktrees/pari-class-group-e2e-integration \
  node bench/pari-class-group-port/check_regulator_interval_authority.cjs
```

The runtime test additionally rejects a foreign logarithm, a mutated nonunit,
and dependent provenance, while confirming that reordered provenance changes
the authority identity.
