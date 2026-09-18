# Row 19 output-evidence v2 migration gap

Row 19 cannot yet publish a truthful
`sagejs.pari-class-group/class-unit-output-evidence-v2` sidecar. The blocker is
specific: the shared v2 schema requires the presentation proof to have the same
dimensions as the declared relation surface.

The fresh row-19 result retains the real raw surface:

- 424 factor-base ideals, each a 3-by-3 HNF (`[424,9]`);
- 430 relation vectors over that factor base (`[430,424]`);
- 430 principal generators in degree-three coordinates (`[430,3]`); and
- 430 raw log rows with 14 packed columns (`[430,14]`).

It also retains a 430-by-430 raw-to-terminal relation transform. That owner is
ancestry, not an authenticated Smith left transform. The corresponding full
raw Smith right transform (`[424,424]`) and diagonal (`[430,424]`) are not
retained.

Separately, the final class presentation retains exact 9-by-9 `U`, `W`, `Ui`,
and `D`, and the checker independently replays `U W Ui = D` and obtains class
number `39366`. Those matrices prove the later nine-generator class
presentation. They must not be relabelled as a proof for the 430-by-424 raw
relation matrix.

## Machine-readable assessment

`row19_class_unit_output_evidence_v2.cjs` authenticates the immutable fresh v1
result and emits a gap assessment containing typed identities and exact shapes
for the raw relation owners and the separate final presentation. It records:

- missing owners `raw-smith-left-transform-430x430`,
  `raw-smith-right-transform-424x424`, and
  `raw-smith-diagonal-430x424`;
- missing shared-schema capability `presentation-not-given-variant`;
- phase 3 false;
- phase 4 false by phase ordering, while explicitly recording that its compact
  unit and PARI-packed regulator material is retained;
- phase 5 and output-boundary completion false; and
- no qualification or timing claim.

The `buildRow19OutputEvidence` entry point deliberately fails rather than
publishing a malformed v2 result. The checker demonstrates that the shared v2
validator rejects an attempted 9-by-9 proof for the raw surface, replays the
valid final 9-by-9 Smith identity separately, and rejects source mutation.

Run:

```bash
node bench/pari-class-group-port/check_row19_class_unit_output_evidence_v2.cjs \
  /scratch/sagejs-row19-fresh-transaction-check/row19-class-unit-result-a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66.json
```
