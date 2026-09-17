# Computed cubic T2 candidates in signed `genback`

This composition removes the last answer-derived arithmetic input from the
authenticated `x^3 - 200*x + 7` signed-genback assembly. The five reduction
candidates are now computed by ordinary CPython-parseable Sage.js source.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

## Source path

For every reduction input `I`, `pari_cubic_t2_candidate` performs PARI
2.17.4's exact untwisted path:

```text
J = (I intersect Z) * I^-1
B = rounded_t2 * J
U = ZM_lll(B, 0.99, LLL_IM)
y = J * U[:,0]
```

The implementation reuses the connected exact cubic scaled-inverse routine
and the connected full-rank FLATTER/fast/DPE LLL graph. It records `J`, `B`,
`U`, and `y` before passing `y` to the existing exact reduction tail.

The Smith transform supplies the genuine relation `[-3,-1]`. A first pass
follows its exact schedule—square, multiply, invert, invert, final multiply—to
compute the candidates from the actual intermediate ideals. The established
signed-genback and class-assembly leaf then consumes that internally produced
trace. PARI supplies no runtime candidate or factor.

## Exact witnesses

The five computed candidates are

```text
[4,0,0], [8,0,0], [8,0,0], [5,0,0], [-17,1,0].
```

The corresponding scaled inverse ideals are

```text
[4,0,2; 0,4,1; 0,0,1]
[8,0,6; 0,8,1; 0,0,1]
[8,7,4; 0,1,0; 0,0,1]
[5,3,4; 0,1,0; 0,0,1]
[40,23,4; 0,1,0; 0,0,1].
```

The checker independently asks pristine PARI 2.17.4 for every scaled inverse,
rounded-T2 product, full LLL transform, and candidate. It then verifies the
same final ideal, ordered principal factors, class invariant `24`, and
archimedean outputs in CPython and the JavaScript, GMP, and tagged backends.
Short candidate and witness owners reject before publication.

## Deliberate limits

- The relation is restricted to the authenticated two-prime `[-3,-1]` path.
  The candidate primitive itself is not field-answer-specific, but the
  surrounding schedule is.
- The connected LLL entry is full-rank degree three, untwisted `LLL_IM`, and
  rejects if its heuristic or proved fallback would be required.
- The rounded T2 matrix is prepared input. Computing `nf_get_roundG` from a
  defining polynomial remains an earlier prepared-field dependency.
- Cubic scaled inversion retains its positive word-modulus boundary below
  `2^64`.
- The composition currently performs the signed arithmetic twice: once to
  derive the authenticated candidate trace and once in the established
  transactional assembly. Direct callback-free fusion is an optimization,
  not a correctness dependency.

Run the focused oracle with:

```bash
node bench/pari-class-group-port/check_signed_genback_computed_t2.cjs
```
