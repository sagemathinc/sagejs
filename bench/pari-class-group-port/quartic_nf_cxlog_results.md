# Mixed-quartic `nf_cxlog` and class-group assembly

The authentic field `x^4 - 200000002*x - 200000002` now passes from its
seven-factor `Ge` witness through mixed-signature `(2,1)` logarithms and the
final `class_group_gen` archimedean assembly.

This exposed a real representation frontier: multiplying the integral basis
embedding matrix by the non-scalar factors produces 448-bit real components,
although the complex partner and other real place use 384 bits. The previous
prototype stopped at 384 bits. The new ordinary-Python source extends PARI's
same non-AGM logarithm/root/odd-series schedule through 448 bits and retains
the common 384-bit `precCOMPLEX` window for the complex place.

The focused checker compiles a pinned pristine PARI 2.17.4 oracle and compares:

- the split two-real/one-complex embedding matrix;
- all seven ordered non-scalar/scalar factors;
- the complete packed `Ga` result;
- Smith matrices, invariants `[24, 8]`, and class number `192`;
- final `GD`, `ga`, `M1`, and `M2` components of `clg2`.

Every packed word agrees under CPython, JavaScript exact integers, GMP packed
buffers, and tagged native integers. The checker reports
`qualifiedTiming: false`; this is a connected correctness result.

Run:

```bash
node bench/pari-class-group-port/check_quartic_nf_cxlog.cjs
```
