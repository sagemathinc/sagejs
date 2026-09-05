# Modular abelian variety differential corpus

The initial weight-$2$, $Gamma_0(N)/\mathbf Q$ object layer is checked against
two independent systems:

```sh
/home/user/bin/sage bench/modular/abelian-varieties/sage-oracle.py
/home/user/bin/magma -b bench/modular/abelian-varieties/magma-oracle.m
```

Both scripts report the dimension of $J_0(N)$ and the characteristic
polynomials of $T_2$ and $T_3$ on weight-$2$ cusp forms for
$N=11,33,37,43,67,97$.  Their common exact output is normalized in
`test/fixtures/modular-abelian-varieties-sage-magma.json` and checked through
the public Sage.js API by `test/modular-abelian-varieties.cjs`.

Sage additionally supplies decomposition dimensions.  At level $33$, Sage.js
reports dimensions $1+2$ rather than Sage's $1+1+1$: the two old copies form
one rational full-Hecke isotypic component in the current implementation.
The total dimension and the full $T_2,T_3$ polynomials agree exactly.  This is
an explicit decomposition-granularity distinction, not an oracle mismatch.

The fixture is provenance, not runtime delegation.  Sage.js performs every
construction using its own exact modular-symbol and FLINT lattice code.
