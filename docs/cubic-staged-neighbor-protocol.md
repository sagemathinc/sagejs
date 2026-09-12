# Pre-registered neighbors for staged complex-cubic certification

Recorded 2026-09-05 before executing the new cohort in Sage.js. The selected
implementation is not yet frozen. These are benchmark-unseen fields in the
audited campaign artifacts, not a claim about every unlabeled computation in
every other development session.

## Target and selection rule

This protocol is conditional on retaining the provisional target
[3.1.12716.2](https://www.lmfdb.org/NumberField/3.1.12716.2),
$x^3-x^2-11x-63$, from the previous completed performance frontier.
The frozen `f7f00552` timing run is still pending. If its results select a
different structural bottleneck, register a new protocol before running that
new cohort; do not relabel this one as a posteriori evidence.

Select complex cubic fields with class group $C_3$, equation-order index $3$,
$10{,}000\leq |D_K|\leq100{,}000$, recorded regulator, and unconditional
LMFDB class-group metadata (`used_grh=false`). Derive the equation index from
$[\mathcal O_K:\mathbf Z[\alpha]]^2=\operatorname{disc}(f)/D_K$ using exact
integer arithmetic. The [LMFDB field index](https://www.lmfdb.org/knowledge/show/nf.zk_index)
is a different quantity and must not be substituted for the polynomial's index.

Remove the authenticated exclusions below. Sort the remaining fields by
$\bigl||D_K|-12{,}716\bigr|$, then numeric $|D_K|$, then ASCII label; take 20.
Neither Sage.js success, timings, nor regulator size enters selection.
There were 395 index-three candidates and 387 after exclusions.

Freeze the candidate commit/runtime closure before executing these neighbors.
Retain every decline, disagreement and slow result. No substitutions are
permitted. Compare exact class numbers and invariant factors under matching
conditional-GRH computation settings; unconditional database metadata does not
change the explicitly conditional semantics of the timed algorithms.

## Selected fields

Coefficients are ascending for $d+cx+bx^2+x^3$. All expected class numbers and
invariant factors are $3$ and $(3)$, respectively. These expectations are
benchmark oracles only and must not enter algorithm dispatch or computation.

| Order | LMFDB label | $(d,c,b,1)$ |
| --- | --- | --- |
| 1 | 3.1.12663.2 | $(-65,-3,0,1)$ |
| 2 | 3.1.12663.3 | $(-61,15,0,1)$ |
| 3 | 3.1.12771.1 | $(-47,24,0,1)$ |
| 4 | 3.1.12771.2 | $(-65,6,0,1)$ |
| 5 | 3.1.12300.1 | $(27,27,-1,1)$ |
| 6 | 3.1.12300.2 | $(-63,-3,-1,1)$ |
| 7 | 3.1.12131.4 | $(64,-1,-1,1)$ |
| 8 | 3.1.13484.3 | $(-81,-29,-1,1)$ |
| 9 | 3.1.11800.1 | $(42,22,-1,1)$ |
| 10 | 3.1.11583.1 | $(-63,-9,0,1)$ |
| 11 | 3.1.11532.1 | $(-62,0,0,1)$ |
| 12 | 3.1.14499.1 | $(-63,18,0,1)$ |
| 13 | 3.1.14703.2 | $(51,22,-1,1)$ |
| 14 | 3.1.10700.3 | $(67,-13,-1,1)$ |
| 15 | 3.1.14792.1 | $(78,-14,-1,1)$ |
| 16 | 3.1.10584.1 | $(-70,-21,0,1)$ |
| 17 | 3.1.10571.1 | $(-54,21,-1,1)$ |
| 18 | 3.1.14892.1 | $(-54,24,0,1)$ |
| 19 | 3.1.14892.3 | $(-71,17,-1,1)$ |
| 20 | 3.1.10476.1 | $(-38,24,0,1)$ |

The ordered labels, each followed by LF, have SHA-256
`973b48a42465656382ad900a5452b9b900739f7f764bf5e5ee7b66189f6f96ed`.

## Exclusions and source identity

The 3,220-label exclusion is exactly the union of:

- The original 1,815 exclusions in the frozen frontier manifest's
  `exposed(label)` SQL block. Sorted labels plus LF have SHA-256
  `3aaa2fd01a009d87d40f9f21a83db42b00f3f578827e2ae36d3e0025bdf610d8`.
- All 1,412 original survey, control and holdout labels. The original records
  digest is `d69cd492a3297d5aed9e8b318fbf5248d87e471856f00e6da57fa421bbf33627`.
- Three additional exposed or synthetic labels: `3.1.101.1`, `3.1.84591.1`
  and `3.1.999999999.1`.

Sorted unique exclusion labels plus LF have SHA-256
`cb091fdc2c65683922457b0745cc069d820fb84aa7f4c0bd9a9b77c0b7de8bf0`.
The original [corpus release](https://github.com/sagemathinc/sagejs/releases/tag/optimization-corpus-complex-cubic-v1)
publishes only the survey. The recovered local `holdout-corpus.jsonl.gz` has
gzip SHA-256 `990cf8d3d58a7aa84a7ae525a21e1823f0715dd5d7cc5f4e7a250ac69710e566`
and logical JSONL SHA-256
`bfc6f5dd69556014156cd75f13890a9bd6de5608546109b363472c7b72e1d4fa`.

The read-only LMFDB query was:

```sql
SELECT row_to_json(t) FROM (SELECT label, ARRAY(SELECT c::text FROM unnest(coeffs) c) AS coefficients, (-disc_abs)::text AS discriminant, class_number::text AS class_number,class_group,regulator::text AS regulator,index::text AS lmfdb_field_index,used_grh FROM nf_fields WHERE degree=3 AND r2=1 AND disc_sign=-1 AND disc_abs BETWEEN 10000 AND 100000 AND class_number=3 AND class_group='[3]'::jsonb AND regulator IS NOT NULL AND used_grh IS FALSE ORDER BY disc_abs,label) t;
```

The exact query digest is
`7e253d6057f39743cd5b922e4197c8ca214b437108d440cfbb434b7e6f5e274b`.
Its 1,913 source rows have canonical-array SHA-256
`fc8ec006c8595af0909254197c083653e0406a66ad3bc4c779d9a9199049fcbf`;
the 20 selected complete source rows, in selection order, have canonical-array
SHA-256 `74019cefc3d877a1e3344ed8622aa16e406bb13a8d998ae5c2b0edc6591aec77`.
Archive those raw source/exclusion assets with the eventual campaign evidence;
do not depend on a mutable database query for permanent reproduction.
