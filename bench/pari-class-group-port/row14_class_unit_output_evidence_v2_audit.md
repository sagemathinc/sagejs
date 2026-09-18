# Row 14 output-evidence-v2 assessment

This adapter projects the immutable fresh row-14 neutral result
`edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2`
into a complete internal shared-v2 evidence payload. The claim is limited to
the authenticated retained-prime support and remains an internal PARI-
correspondence result rather than a public certified computation.

The actual relation boundary is:

- 799 quartic factor-base ideals (`799 x 16`);
- 806 relations (`806 x 799`);
- 806 principal generators (`806 x 4`); and
- 21 packed logarithm cells per relation (`806 x 21`).

The result retains the genuine dimension-compatible composite presentation:

```text
T(3 x 806) R(806 x 799) = P(3 x 3) F(3 x 799).
```

The complete production ancestry replay now also supplies the raw `806 x 806`
left transform, `799 x 799` right transform, and `806 x 799` diagonal. An
independent checker proves all 643,994 cells of `U R V = D`, verifies
`det(U) = det(V) = -1`, and recovers Smith invariants `[8, 24]` and class number
192. The smaller composite presentation remains a separately checked bridge to
the published class ideals.

The exact class ideals/order coefficients, rank-two factored and compact unit
material, accepted regulator, and torsion generator remain authenticated. The
general supported-ideal map accepts arbitrary integral column-HNF ideals whose
complete prime support lies in the 799 retained descriptors. It admits
fractional rational denominators only when their complete decomposition is
retained, derives valuations from the authenticated descriptor `tau` data, and
uses the full Smith identity to return exact class coordinates and signed
806-relation principality witnesses. Factor, reduce, and combine fail closed
outside this domain. All 799 factor-base prime ideals, arbitrary integral and
fractional products, and the combine law replay; mutations of `tau` and Smith
`V` reject.

Phases 3, 4, and 5 and the internal output-evidence boundary are therefore true
for this explicit supported domain. This does not assert a public API, a
qualified timing, or an unconditional/global factor-base theorem beyond the
upstream-assumed correspondence experiment.

Run the independent assessment with:

```bash
node bench/pari-class-group-port/check_row14_class_unit_output_evidence_v2.cjs \
  /scratch/sagejs-row14-fresh-registry-7wM3U3/row14-prepared-complete-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json
```

The check contains no timing or qualification claim.
