# Row 14 output-evidence-v2 assessment

This adapter projects the immutable fresh row-14 neutral result
`edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2`.
It does not claim a shared-v2 payload where the retained evidence cannot support
one.

The actual relation boundary is:

- 799 quartic factor-base ideals (`799 x 16`);
- 806 relations (`806 x 799`);
- 806 principal generators (`806 x 4`); and
- 21 packed logarithm cells per relation (`806 x 21`).

The result retains a genuine dimension-compatible composite presentation proof:

```text
T(3 x 806) R(806 x 799) = P(3 x 3) F(3 x 799).
```

The focused checker independently recomputes all 2,397 scalar equalities.  The
terminal presentation has determinant 192 and Smith invariants `[8,24]`.
This is useful proof material, but it is not the full raw Smith identity required
by output-evidence-v2.  In particular, no retained owners provide the raw
`806 x 806` left transform, `799 x 799` right transform, or `806 x 799`
diagonal.  The adapter therefore refuses to substitute the 3-by-3 terminal
presentation into those shapes and reports `not-publishable-under-v2`.

The exact class ideals/order coefficients, rank-two factored and compact unit
material, accepted regulator, and torsion generator remain authenticated.
Phase 4 material is retained for the matched `not_given(LARGE)` output, but the
shared-v2 phase-4 completion bit remains false because its phase-3 prerequisite
cannot be published.  Phase 3 is false because its required full Smith envelope
is absent.  Phase 5 and the output boundary are false: the retained `factor-map` is
a three-column class-presentation projection, not a general arbitrary-ideal
factor operation, and the result has no general factor/reduce/combine maps.

Run the independent assessment with:

```bash
node bench/pari-class-group-port/check_row14_class_unit_output_evidence_v2.cjs \
  /scratch/sagejs-row14-fresh-registry-7wM3U3/row14-prepared-complete-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json
```

The check contains no timing or qualification claim.
