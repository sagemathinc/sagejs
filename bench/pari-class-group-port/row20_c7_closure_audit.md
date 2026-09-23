# Row 20 C7 exact closure

Status: internally correspondence-complete and deliberately not public-complete.

The producer authenticates pristine W0 SHA-256
`6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468`
and immutable C6 owner SHA-256
`5449d3812514fa9aad06364e6b5ba0c18d10ee66225d0baa4fc5ea7d39f7ea1d`.
It does not read W0's `class_group_output`, `final_state`, `result`, or
`fundamental_units` events. The final class/unit answers are therefore not
producer inputs. C6 supplies only the already independently computed exact
unit materialization that this tier must connect to the raw relation closure.

`row20_c7_closure.py` replays the original `7 x 14` `hnfspec_i` computation
from the raw relation records and raw packed logarithms. Reversing the source
column operations gives a `14 x 7` raw-to-kernel transform `T` and an
independently ordered `14 x 7` right inverse `Q`. Exact multiplication proves

```text
R T = 0,    R Q = I_7.
```

Thus the relation map is onto `ZZ^7`; its presentation is the identity, its
Smith factors are all one, and the class group has `h = 1` with invariant
factors `[]`. This witness is derived before and without consulting the final
class answer in W0. The replay also proves that the raw packed logarithms map
to all seven retained compact generators, not merely to the two ultimately
selected unit columns.

All seven degree-five factor-base ideals are rebuilt from their prime,
residue-degree, and integral-generator descriptors using the prepared `5^3`
multiplication tensor. For each of the 14 retained relations, the producer
enumerates an exact generating set for the product ideal, proves every
generator belongs to the asserted principal lattice, and proves equal index
from the independently computed principal determinant and factor-base norms.
Inclusion plus equal finite index proves exact ideal equality. This also
replays all 14 principal norms.

C6's compact transform is multiplied through `T`. The private getfu swap and
inverse-mask bit are then applied explicitly, yielding a `14 x 2` transform
in final materialized-unit order. Exact rational field arithmetic multiplies
the 14 raw principal generators, including negative powers, and recovers the
two C6 integral-basis units exactly. Their multiplication determinants are
`-1`, and the C6 inverse coordinates are multiplied back to one. Torsion order
two and generator `-1` come from the authenticated prepared roots-of-unity
owner.

The field-neutral envelope records class number one, no invariant factors,
unit rank two, exact unit coordinates and norms, torsion order two, and
`correspondence_complete=true`, `public_complete=false`. It explicitly labels
PARI 2.17.4 correspondence, factor-base selection, GRH, and relation bounds as
assumptions. The output is content-addressed, atomically published,
idempotent, and mode `0444`:

```text
/scratch/sagejs-runtime/pari-class-group-e2e-20260917/row20-authority/
  row20-c7-class-unit-3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052.json
```

The owner is 7,290 bytes with SHA-256
`3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052`.
Every Python replay is limited to 600 seconds and 4 GiB address space.

`check_row20_c7_closure.cjs` performs repeated cold composition, detached cold
replay of the final neutral envelope, independent `R T` and `R Q` equations,
and persistent immutable publication. It rejects raw-log, principal-generator,
and exact-unit mutations. It also rejects a direct false public-completion
promotion and a coordinated mutation/reseal in which both envelope digests
are recomputed: detached replay still disagrees with the authentic inputs.
