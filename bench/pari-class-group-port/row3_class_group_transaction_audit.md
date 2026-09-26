# Row 3 authenticated `class_group_gen` transaction

This transaction joins two independently immutable row-3 owners:

- the retained source-derived presentation with digest
  `200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b`;
- the computed reduced-`genback` owner with digest
  `5e690a14cee61e849559eaf0a6fa3ca491d919d43fec1ab65e1fbb6c7dec4ce9`.

Both authorities replay before either payload enters Python.  The Python
transaction then recomputes the Smith transformation of `diag(3,2)` and checks
that its active `Uir` column `(1,-1)` is exactly the signed request completed by
the reduced owner.  No PARI generator, `Ga`, `GD`, `ga`, `clg2`, invariant, or
terminal class object is a runtime input.

## Completed arithmetic

The transaction replays all 675 retained principal-generator logarithms from
the exact embedding owner and verifies their aggregate digest.  Multiplying
those columns by the authenticated raw-to-class map reconstructs the two
terminal `C` columns.  It then computes:

- `D`, `U`, `U^-1`, `V`, `Ur`, `Y`, `Uir`, `X`, `M1`, and `M2`;
- the invariant `6` and class number `6`;
- `Ge = [(1/349)^1]` from the reduced-genback compact factor;
- `Ga`, using translated `nfV_cxlog` semantics;
- `GD = C*M1 - diag(6)*Ga`; and
- `ga = C*M2 - Ga*Ur`.

The positive rational factor is invisible to PARI's archimedean class log, so
`Ga` is the exact zero column.  The generic all-integer dispatch rejected by
the older narrow `class_group_assembly` wrapper is therefore handled here by
the source-equivalent identities `GD=C*M1` and `ga=C*M2`; no numerical value is
invented or imported.  The internal PARI tuple

```text
clg2 = [Ur, Ga, GD, Ge, M1, M2]
```

is complete, along with the reduced generator ideal

```text
[3839,0,2150; 0,349,30; 0,0,1].
```

Its exact principal and order-six witnesses are inherited from—and joined to—
the authenticated reduced-genback owner.

## Honest stop

This is a complete retained-presentation `class_group_gen` result, not a fresh
prepared-field computation.  It retains
`freshPreparedInputComplete=false` and `qualifiedTiming=false`.  It stops
before claiming a public class-and-unit result because an authenticated
class-and-unit correspondence/publication authority is not part of this
transaction.  Unit reconstruction, correspondence, and public completion all
remain false.

Run the focused deterministic and mutation checker with:

```bash
node bench/pari-class-group-port/check_row3_class_group_transaction.cjs \
  ROW3_PRESENTATION_OWNER.json ROW3_REDUCED_GENBACK_OWNER.json
```
