# Exact modular-form $q$-expansion correctness corpus

This directory pins an exact differential corpus for the two Sage.js
$q$-expansion engines. It covers:

- formula/modular-symbol span equality at level $1$ and level $2$;
- honest proper spans at level $2$ and composite level $6$;
- a rational nontrivial-character modular-symbol space;
- old/new decompositions at prime level, prime-square level, two-prime level,
  and a level with several degeneracy sources;
- a repeated anemic eigensystem at level $22$ which is separated by $U_2$;
- quadratic and cubic coefficient fields at levels $23$ and $41$; and
- prime-power Hecke recurrences beyond the relevant Sturm bounds.

`pinned-corpus.json` stores dimensions, exact polynomial invariants, and
SHA-256 hashes of a documented canonical exact-matrix encoding. The complete
coefficients are reproducible from the independent scripts rather than being
copied from Sage.js.

Run the independent oracles with:

```bash
node bench/modular/qexp-correctness/run-oracles.cjs
```

The defaults are `/home/user/sagelite/sage` and `/home/user/bin/magma`;
override them with `SAGE` and `MAGMA`. PARI is called through the independent
`cypari2` shipped with the SageMath oracle environment. The runner fails on
any coefficient, dimension, character, old/new, or Hecke-polynomial
disagreement. In particular, the rational bases underlying both
coefficient-field examples are compared at a precision strictly beyond their
Sturm bounds; selected eigenvalue minimal polynomials are additional checks,
not substitutes for coefficient comparison.

Run Sage.js itself against the same pins with:

```bash
node bench/modular/qexp-correctness/sagejs-corpus.cjs
```

The corresponding integration test is `test/qexp-p0-correctness.cjs`.
`source-freeze.json` then hashes the exact implementation, corpus, oracle,
test, and documentation sources exercised by the cross-platform freeze.
