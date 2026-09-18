# Row 0 output-evidence-v2 gap assessment

`row0_class_unit_output_evidence_v2.cjs` is an authenticated, non-publishable
gap assessment over the immutable result of the fresh prepared row-0
computation. It does not produce a `class-unit-output-evidence-v2` payload.
The adapter accepts only the canonical v1 envelope with
SHA-256
`dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58`.

This row has unusually strong retained source state. In
particular, the v1 envelope contains all 66 factor-base ideals, 73 relation
rows and principal generators, their archimedean data, HNF and presentation
transforms, two compact relation transforms, two exact units and norms, the
exact order-two torsion generator, equal-bound honesty state, and an
independently constructed rigorous regulator enclosure. The assessment hashes
those original owners rather than substituting answer-derived fixtures.

However, the class-presentation dimensions do not close. The actual relation
matrix is 73 by 66, so a `right_inverse` v2 proof needs a retained 66 by 73
integer right inverse (and a 66 by 66 identity). The retained terminal
presentation matrices are only 8 by 8, while the two retained relation maps
are 15 by 8. They are meaningful internal state, but they are not a
dimension-compatible proof for the 73 by 66 matrix. Synthesizing a 66 by 66
identity merely from the accepted `h=1` terminal would be circular, so this
assessment explicitly sets `v2Payload=null`.

The completion claims are deliberately asymmetric:

- the upstream-assumed fresh correspondence is complete;
- phase 4's exact-unit and rigorous-regulator evidence is retained, but phase 4
  is not complete because the independent unit-saturation certificate is absent;
- phases 3 and 5 are also **not** complete under the plan because the compatible
  presentation proof and lazy maps are absent;
- the factor, reduce, and combine lazy maps were not retained and are all
  marked unready;
- the factor-base bound and unit-saturation policies remain explicit PARI
  assumptions; and
- public API integration is absent.

Consequently `outputBoundaryComplete` remains false. The adapter makes no timing,
qualification, or public-result claim.

`check_row0_class_unit_output_evidence_v2.cjs` independently decodes the v1
owners, binds every major typed digest to its source bytes, recomputes the two
exact cubic norms, checks the rigorous regulator authority, and invokes the
detached raw-owner replay. That replay verifies the internal relation, HNF,
compact-unit, and terminal state, but is not reinterpreted as the missing
dimension-compatible public presentation proof. The checker rejects changed
source bytes, confirms that the assessment cannot pass the v2 validator, and
confirms that changing its completion claims changes its authenticated digest.

Run it against the durable fresh result:

```sh
node bench/pari-class-group-port/check_row0_class_unit_output_evidence_v2.cjs \
  /path/to/row0-class-unit-result-dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58.json
```
