# Authentic `h=1` authority composition

`class_group_authentic_success.py` replaces the earlier `fupb_PRECI`
frontier for `x^3 - 20018*x + 20034` with the successful p2304-capacity
real-cubic unit retry. It publishes a distinct internal correspondence result,
not a public class-and-unit computation.

The v2 live composition additionally includes:

- the resident active relation matrix `A` of shape `8 x 15`;
- the `8 x 8` presentation `H`, with replayed `A R2P = H` and
  `H P2R = A` witnesses;
- the live Smith result `D = I_8`, hence class number one and a genuinely
  empty class-generator list;
- the shaped Buchall arrays, including the mathematically zero-cell
  `M1`, `Ga`, `Ge`, and `GD` components;
- the successful `UnitComponentOutput` produced by
  `make_real_cubic_unit_component`, with two exact rank-two units of norm
  `-1`, linked packed logarithms, a nonzero dyadic regulator minor, and exact
  candidate/transform fingerprints; and
- the explicit `15 x 7` HNF kernel basis. The component's `2 x 7` unit
  provenance is composed through this basis to a `2 x 15` provenance over the
  active relations. Cold replay checks both that `A K = 0` and that the
  published full provenance is exactly this composition.
- cold replay of all 66 exact factor-base ideals, all 73 principal relations,
  the active HNF presentation and its transforms;
- exact roots-of-unity replay;
- transactional class-relation cleanarch replay;
- the independently rigorous regulator envelope; and
- an exact back-map through the retained `73 x 73` cleanup transform. Multiplying
  the 73 captured principal generators with those exponents reproduces both
  selected retry units up to the verified order-two torsion element.

The equal-bound status is retained only because the pinned resident HNF state
is exactly `[0,7,66,0,7,8,0,73,0]`, matching the unit fixture's resident
state. Cleanarch acceptance is attributed narrowly to the successful unit
component. No final-driver output exists, so the result explicitly records
`final_driver_status = not-published`.

The terminal status is `authentic-internal-authority-composition-published`.
Both `phase5_complete` and `public_complete` remain false. In particular, this
result does **not** call itself correspondence-complete: the successful unit
component still consumes a live PARI retry oracle, and its selected units are
not yet exactly identified with the separately rigorous regulator units.
These requirements remain:

- link the successful component's units to the rigorous regulator units;
- remove the live PARI unit-oracle input;
- independently certify unit saturation/index one; and
- independently certify factor-base/relation completeness.

## Focused replay

The default checker builds and runs the instrumented pristine PARI 2.17.4 unit
oracle through `check_unit_bridge_cubic.cjs`:

```bash
node bench/pari-class-group-port/check_class_group_authentic_success.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```

For a focused repeat, a previously qualified live oracle executable may be
passed as the second argument. The checker exercises concurrent idempotent
publication, cold replay under an out-of-band hash, and coordinated/rehashed
mutations of every connected boundary, including the HNF-kernel
correspondence and all incompleteness claims.
