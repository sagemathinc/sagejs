# Authentic real-cubic successful-`getfu` honesty audit

The successful `x^3-20018*x+20034` retry is not yet an honest end-to-end
runtime path.  Its checker currently asks an instrumented pristine PARI
`bnfnewprec` call for three distinct objects and passes them into ordinary
Python:

1. six p2176 packed logarithms from `bnf_get_logfu(b)`;
2. nine packed entries of `nf_get_M(nf)`, including one p2240 entry; and
3. the 27 exact entries of `zk_multable(nf,e_i)`.

The third dependency is now eliminated.  `pari_monic_cubic_basis_tensor`
recomputes it from the resident preparation's neutral defining polynomial
`(20034,-20018,0,1)` and integral basis
`(1,x,x^2+2*x-13345)`.  It multiplies power-basis polynomials, reduces modulo
the defining polynomial, and changes coordinates back through the exact
integral-basis matrix.  All 27 entries equal both the resident `basis_table`
and pristine PARI.  No relation, class number, logarithm, embedding, unit, or
known tensor enters the computation.

## Exact remaining frontier

The p2240 embedding is mathematically determined by the same polynomial and
basis, but no current prepared-number-field leaf refines all real polynomial
roots to this precision.  The resident contains only p256/p320 entries.  The
missing leaf is a source-ordered arbitrary-precision real-root refinement,
followed by evaluation of the integral basis with PARI-compatible precision
growth under cancellation.  Reusing the p2240 PARI matrix would therefore
remain an oracle input, even though it is not answer-derived mathematically.

The p2176 logarithms need more than root refinement.  They are
`bnf_get_logfu(bnfnewprec(...))`, not merely widened versions of the resident
p256 packed values.  An honest derivation must:

1. refine the prepared embedding matrix;
2. recompute log embeddings for the resident's exact owned generator bank,
   preserving scalar-prefix metadata and source order;
3. replay the selected active-relation permutation and HNF-kernel transform;
4. replay the resident rank-two unit-lattice transform and `cleanarch`; and
5. compare the resulting six packed values and sign phases with pristine PARI.

All exact source material for steps 2--4 is present in the resident artifact
(`generators`, `relation_metadata`, `hnf_perm`, `hnf_hnf_transform`, and the
unit transform computed by `pari_cubic_unit_bridge_prepare`).  The present
`pari_prepared_log_embedding` is capped at p384, however, and the precise
active-relation-to-owned-generator indexing still needs a source-order replay
test.  Thus copying the six pristine values is not justified by existing
code, and using the final reconstructed units to calculate them would be
circular.

The next smallest honest connected cut is therefore high-precision cubic root
refinement plus integral-basis evaluation.  Once that publishes p2176/p2240
embeddings from neutral data, extend the already translated logarithm stack
and replay generator logs through the retained exact transforms.  The tensor
is no longer part of that blocker.
