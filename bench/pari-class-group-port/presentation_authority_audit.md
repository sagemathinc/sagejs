# Exact presentation authority for the authentic real cubic

This lane closes the class-presentation authenticity gap for the qualified
resident computation of

```text
x^3 - 20018*x + 20034.
```

It does **not** prove that the selected factor base generates the full ideal
class group, and it does not use PARI during replay. It proves the exact
statement which the current upstream-assumed experiment needs: the retained
relations really are principal ideal identities over the retained factor
base, and the published `8 x 15` matrix and trailing `8 x 8` HNF really arise
from those authenticated relations.

## Retained authority

[`presentation_authority.py`](presentation_authority.py) captures ordinary
JSON data from the pinned resident artifact:

- the maximal-order multiplication table;
- 66 ordered factor-base descriptors `(p,f,inert,generator)`;
- the independently reconstructed `3 x 3` HNF and norm of every factor-base
  ideal;
- all 73 factor-base exponent vectors;
- all 73 integral-basis coordinates of the corresponding principal elements
  `alpha_j`;
- the initial HNF row permutation, relation logarithms, active `8 x 15`
  relation matrix, active full HNF, and its `15 x 15` column transform.

The resident collector already owned the algebraic generators. No witness was
invented and no new PARI trace was needed.

## Detached replay

Replay begins from the captured multiplication table and prime descriptors.
For every factor-base entry it reruns the translated `pr_hnf` path and compares
the exact HNF and norm. For each relation it computes

```text
product_i P_i^e_ij
```

by exact cubic ideal multiplication, constructs the multiplication lattice of
`alpha_j`, and checks equality of the two full-rank integral lattices using an
adjugate divisibility test and equal determinants. All 73 identities pass:

```text
(alpha_j) = product_i P_i^e_ij,  1 <= j <= 73.
```

Replay then reruns the translated `hnfspec` pipeline from the authenticated
`66 x 73` relation matrix. It reproduces the active `8 x 15` matrix, the
`8 x 15` full HNF, and the `15 x 15` transform byte-for-byte. Finally the
existing relation/HNF witness leaf checks

```text
A * V = [0 | H],
A * R2P = H,
H * P2R = A.
```

Thus `H = I_8` is now backed by exact factor-base ideals and exact principal
relations rather than only by integer matrix identities.

## Honesty boundary

This evidence authenticates the finite presentation under the experiment's
explicit upstream assumptions. It does not establish a Minkowski/GRH factor
base theorem, saturation outside the selected factor base, unit completeness,
or a rigorous regulator enclosure. Those claims must remain separate.

## Reproduction

```bash
node bench/pari-class-group-port/check_presentation_authority.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```

The checker performs a serialization round trip and rejects coordinated
mutations of the multiplication table, factor descriptors and HNFs, relation
exponents and generators, initial HNF permutation, logarithms, active matrix,
HNF, and transform.
