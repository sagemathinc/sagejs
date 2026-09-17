# Mixed-real exact torsion authority

`mixed_real_torsion_authority.py` derives the field3 roots-of-unity authority
from neutral prepared data only: ascending polynomial coefficients and the
signature `(2, 1)`. It accepts no class number, regulator, unit, or expected
torsion input.

The monic polynomial `x^4 - 2000022*x - 2000042` reduces modulo 23 to
`x^4 - 11*x - 8`. The source exhausts all 23 possible linear roots and all
529 monic quadratic divisors. Their absence proves the reduction irreducible,
and therefore proves the original quartic irreducible over `Q`.

The prepared signature has two real embeddings. Any field root of unity maps
injectively under a real embedding and is consequently `+1` or `-1`.
Multiplication by `-1` squares exactly to one and has determinant/norm
`(-1)^4 = +1`, so the exact torsion group has order two with power-basis
generator `[-1, 0, 0, 0]`.

Publication is transactional. Reducible reductions and unsupported prepared
shapes leave order and generator owners unchanged. The focused checker runs
the same ordinary source under CPython, JavaScript, GMP, and tagged native
execution; it includes no answer fixture.

Run:

```bash
node bench/pari-class-group-port/check_mixed_real_torsion_authority.cjs
```
