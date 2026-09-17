# High-precision complex AGM logarithm

## Qualified source cut

`high_precision_complex_agm_log.py` is ordinary CPython-parseable Python. It
translates PARI 2.17.4's `trans1.c:agm1cx` and `logagmcx`, including the
principal complex square root, the stagnating-gap termination rule, quadrant
rotation, the scaled `Pi / (2 AGM(1, 4/q))` evaluation, and the final `log(2)`
correction. It reuses the previously qualified packed-real full products,
division, square root, pi, and log(2) branches. There is no handwritten C
mathematical implementation, answer-derived transform, unit, or regulator.

The public batch is intentionally narrow: non-axis finite complex values,
component precision at most 154,112 bits, and a target of exactly 153,088 bits.
It validates the complete batch and all storage before calculation, computes
into scratch storage, and publishes only after all entries succeed.

## Exact differential

The focused checker compiles a pristine PARI 2.17.4 oracle and compares both
packed component triples bit-for-bit:

- neutral `3 + 4 I`;
- the authentic complex `x` embedding at row 3, column 2 of the field-3
  `nf_get_M` owner for `x^4 - 2000022*x - 2000042`.

All twelve output fields agree. The oracle trace SHA-256 is
`f556963758bed14aeda2071525b197b2f70f08a855471d3f5ade0569e8799d59`,
and the output SHA-256 is
`7416d6007a77800fd989a60a363fc3a072015fba6d86edbec5d9099de198fc05`.
The authentic embedding is tied to owner SHA-256
`e515b1795d3973f3cebf1e195993fdf1941891ab07670a182488f38c38788b17`.
One complete neutral result also agrees through ordinary CPython, generated
JavaScript, and generated GMP from the same Python source.

The two-entry GMP batch took 98.804 seconds. Complete monitored wall time was
110.099 seconds and peak aggregate RSS was 1,262,884 KiB. The probe aborts at
3.5 GiB, has a hard 4 GiB address-space ceiling, and times out after 600
seconds. Generated C visibly contains `mpz_mul`, `mpz_sqrt`, and
`mpz_fdiv_qr`. Wrong target precision and undersized splitting storage reject
without modifying output or state.

Reproduce on Linux with:

```bash
node bench/pari-class-group-port/check_high_precision_complex_agm_log.cjs
```

## Consumer boundary and next cut

The returned real component is exactly `log(abs(z))`. The field-3
`get_log_embed` join must multiply that real triple by two for its single
complex-place weighted row; it need not discard or recompute the imaginary
component. The returned imaginary triple is the principal branch argument and
is retained for later `getfu` reconstruction.

This result does not yet qualify axis inputs, arbitrary complex precision, or
the surrounding 301-column replay. The next exact cut is the bounded
`get_log_embed` join: feed the two qualified real logs and twice this qualified
complex real component into the raw 3-by-301 logarithm owner, while preserving
the imaginary triples separately for `getfu`. After that join, the first
missing complex-log surface is PARI's axis dispatch around `logagmcx`, not the
non-axis complex AGM kernel qualified here.
