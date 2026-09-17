# Exact authentic unit-to-relation authority

This lane closes the missing exact map between the successful real-cubic unit
component and the 73 principal relation generators retained by
`presentation_authority.py`. It does not call PARI during replay.

## The map

There are two consecutive column transformations:

1. Sparse relation cleanup produces a `73 x 73` unimodular transform `T`.
   Its first 15 columns are precisely the raw-relation words underlying the
   active `8 x 15` matrix `A`.
2. The active HNF computes a `15 x 15` transform `U`, with its first seven
   columns spanning `ker(A)`. The successful unit component supplies its two
   rows of coefficients over those seven kernel columns.

Thus a successful unit row `g` maps to the 73 retained principal generators
by

```text
g (2 x 7) * U_kernel^T (7 x 15) * T_active^T (15 x 73).
```

The implementation follows the repository's column-major buffer convention
rather than materializing the transposes in that notation.

For the qualified field `x^3 - 20018*x + 20034`, the two 73-entry words have
49 and 46 nonzero coefficients, respectively. Their maximum absolute
coefficients are 164 and 181. Multiplying the original principal generators
`alpha_j` to these signed powers gives the two exact units from the qualified
regulator fixture coordinate-for-coordinate in the integral basis. Both
torsion corrections are `+1`; both exact norms are `-1`.

## Independent checks

`unit_relation_authority.py`:

- replays the sparse cleanup to reconstruct `T` from the original 66-by-73
  relation matrix;
- composes the fixed two-by-seven qualified provenance through the replayed
  active HNF transform and `T`;
- checks all 66 factor-base exponents cancel for both resulting words;
- performs signed exponentiation (including exact inverses) of all involved
  `alpha_j` in ordinary Python `Fraction` arithmetic using the captured cubic
  multiplication table;
- checks integrality, exact equality with the published units up to the
  explicit real-cubic torsion sign, and unit norm; and
- retains explicit `unit_saturation_proved = false` and
  `public_completion = false` claims.

The checker mutates every map boundary, both unit coordinate systems, torsion
signs, source linkage, relation witnesses, multiplication table, and scope
claims. It also rejects a coordinated edit of a derived relation word and its
claimed output unit.

Run:

```bash
node bench/pari-class-group-port/check_unit_relation_authority.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```

This authority proves that these two published unit elements are the exact
products of the retained principal relation witnesses. It deliberately does
not prove that they generate the full unit lattice, and it does not publish a
terminal class-and-unit result.
