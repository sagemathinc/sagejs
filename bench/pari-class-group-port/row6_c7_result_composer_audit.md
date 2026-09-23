# Row 6 C7 correspondence-result composer

`row6_c7_result_composer.cjs` is the data-only terminal join for development
panel row 6. It does not run relation collection, HNF, class witnesses, or unit
reconstruction, and it cannot publish a public result. Instead it authenticates
and joins the independently retained outputs of those stages into the neutral
`class-unit-correspondence-result-v1` envelope.

The join requires the immutable prepared, factor-base, and Gate-C owners, the
post-1137 terminal result, the source-schedule ancestry owner, the exact class
owner, and the compact rank-two C5/C6 owner. It rejects schema, field, content
identity, and ancestry mismatches. Before sealing it also replays two important
cross-stage equations:

- each class-order witness is expanded to its dense 1,137-relation vector and
  compared exactly with the retained raw-to-presentation transform;
- the 7-by-2 compact unit transform is composed with the retained
  raw-to-kernel transform, and both resulting 1,137-relation vectors are
  checked against all 1,130 factor-base rows.

The sealed internal result retains the two generator ideals and their exact
order witnesses, factor-base ideals and norms, multiplication table, raw
relations, principal generators, logarithms, terminal matrices and states,
class and unit transforms, regulator enclosure, compact unit data, and exact
unit norm signs. Its class group is `[2, 2]`, its class number is `4`, and its
rank-two unit materialization remains honestly tagged `not_given(LARGE)`.

The result is `correspondence_complete=true` and `public_complete=false`.
PARI/GRH bounds and upstream correspondence remain explicitly assumed, and an
out-of-band replay authority is still required for publication.

## Real-data validation

The composer was run on the retained fresh row-6 artifacts under the campaign's
4 GiB cap lineage. It produced:

- envelope SHA-256
  `b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73`;
- mathematical-authority SHA-256
  `713b8d9e2b73b870faba7db43a8f618d283264b1c20b84c7d7703fa71decb2a8`;
- envelope hex length `13,492,742`;
- normalized invariants `[2, 2]`, class number `4`, unit rank `2`, and unit
  norm signs `[-1, -1]`.

No frozen W0 answer data is consumed by this join.
