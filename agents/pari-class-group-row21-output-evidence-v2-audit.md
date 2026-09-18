# Row 21 output-evidence-v2 projection

`row21_output_evidence_v2_adapter.cjs` projects the authenticated retained
row-21 final source envelope into the additive field-neutral
`class-unit-output-evidence-v2` contract.  It does not rerun the computation,
replace the fresh prepared-input transaction, or claim qualification.

The source is pinned by its canonical-envelope SHA-256
`92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03`
and payload SHA-256
`b933bc7e6861b0073c0cff355c7be5e3c0cc6ff695a683040b46f9e399ab569f`.
That envelope was retained by the genuine prepared-input row-21 transaction.
The sidecar separately binds the resulting neutral v1 correspondence digest
`df3dddcf96d6cb77c6f9f4003eaeff4c68485d9c1cb48b4e39f7f23a0eab1c8a`;
it does not substitute the source-envelope digest for the correspondence
result identity.

## Evidence retained

The v2 projection binds content digests for all 24 factor-base ideals, the
32-by-24 relation matrix, 32 exact principal generators, 32-by-3 packed real
logs, and the exact trivial-presentation identity.  Its dependency evidence
also binds the retained 32-by-24 integral right inverse, full unimodular
transform, and determinant.  Thus `trivial_identity` is a description of the
resulting presentation, not an assertion made without the source witness.

The output records all three compact units and all three exact units.  Each
exact unit has a five-coordinate digest and exact norm digest.  Compact
evidence retains its relation transform, packed real and imaginary logs,
`cleanarch`/`getfu` provenance, and the source's accepted packed regulator,
precision, analytic acceptance, and retry/reconstruction states.  The
regulator is truthfully tagged `pari_packed_accepted`, not
`rigorous_enclosure`.

## Deliberately incomplete boundary

The row-21 correspondence was freshly computed and its phases 3 and 4 reached
the retained terminal state. The relation presentation is published with its
exact integral left inverse (the source calls the transposed object a right
inverse), and the checker independently replays the resulting identity.
Nevertheless
`outputBoundaryComplete = false`.  The explicit missing list contains:

- the omitted lazy factor, reduce, and combine map materializations;
- an independent regulator enclosure;
- an independent saturation certificate;
- an independently proved factor-base bound; and
- integration with the public API.

All three map records are consequently unready and publish no map evidence.
Because the campaign plan includes these maps in Phase 5, `phase5Complete` is
also false even though the row-specific final `buchall_end` assembly completed.
This preserves the distinction between a complete upstream-assumed PARI
correspondence and a complete public/certified output boundary.

The focused checker authenticates and projects the retained envelope, checks
selected evidence digests independently against source subobjects, roundtrips
canonical v2 bytes, and rejects eight source or claim mutations.  It makes no
timing, public-result, reserve, or qualification claim.

Reproduce with:

```sh
node bench/pari-class-group-port/check_row21_output_evidence_v2.cjs \
  /scratch/sagejs-row21-final-owner-v2/row21-final-92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03.json.gz
```
