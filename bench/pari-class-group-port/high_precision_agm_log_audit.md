# High-precision real AGM logarithm

## Qualified source cut

`high_precision_agm_log.py` is ordinary CPython-parseable Python translating
PARI 2.17.4 `trans1.c:logagmr_abs` and its positive-real `agm1r_abs`
dependency. It composes the already qualified packed-real reciprocal,
addition, product, square root, division, pi, and log(2) primitives. No
handwritten C mathematical implementation or answer-derived unit/regulator
data is used.

The public real entry also reproduces `logr_abs`'s high-precision dispatch so
the boundary is tested honestly. The two declared boundary inputs are
`1 + 2^-512`, which pristine PARI sends through AGM, and `1 + 2^-576`, which
it sends through the odd-power series. An important source detail exposed by
the first differential is that `affrr_fixlg` preserves the shortened result
after cancellation; the Python translation therefore does not append invented
zero words when the AGM result has fewer than 153,088 meaningful bits.

## Exact differential

The focused checker compares seven packed triples bit-for-bit with a pristine
PARI 2.17.4 build whose archive SHA-256 is
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`:

- four neutral values: `3/2`, `5/4`, and the same mantissas shifted by
  exponents `+10000` and `-10000`;
- the two dispatch-boundary values above;
- the positive real root of `x^4 - 2000022*x - 2000042`, resized directly
  from the predeclared
  `pari-2.17.4:nfinit192->nfnewprec153088:field3` owner. Its owner SHA-256 is
  `e515b1795d3973f3cebf1e195993fdf1941891ab07670a182488f38c38788b17`.

All seven agree. The oracle trace SHA-256 is
`19bf90fc207b4ad69c85ae8656e029cff1c56503557fe3d0607c84a0efef5f73`;
the packed output SHA-256 is
`b74dc66b5ccc47f289fed53279067a1e1e4ee36219d0d8f3d0034cfa33436e29`.
One representative triple also agrees through ordinary CPython and generated
JavaScript before the GMP batch runs.

The GMP batch took 94.427 seconds; complete monitored wall time, including
oracle construction, compilation/cache loading, CPython, and JavaScript, was
121.781 seconds. Peak aggregate RSS was 1,304,476 KiB. The checker enforces a
4 GiB address-space limit, aborts above 3.5 GiB, and has a 600-second timeout.
The 6,401,510-byte generated core visibly contains `mpz_mul`, `mpz_sqrt`, and
`mpz_fdiv_qr`. Wrong target precision and undersized splitting storage reject
before changing caller-visible output or state.

Reproduce on Linux with:

```bash
node bench/pari-class-group-port/check_high_precision_agm_log.cjs
```

## Exact next complex-log cut

This result does **not** qualify complex AGM. The next cut should remain
separate and start at PARI's `logagmcx`/`agm1cx` branch for one predeclared
non-axis complex embedding. It needs:

1. the already exact real AGM loop generalized to paired packed components;
2. PARI's principal-square-root sign/rotation choice retained explicitly;
3. the `Pi/2` rotation correction and final branch argument checked against
   pristine PARI;
4. one neutral value sufficiently far from cancellation, followed by one
   authentic field-3 complex embedding;
5. the same transactional storage validation and 4 GiB/600-second limits.

No complex path should be admitted from this real result alone.
