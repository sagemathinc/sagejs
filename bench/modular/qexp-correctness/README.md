# Exact modular-form $q$-expansion correctness corpus

This directory pins an exact differential corpus for the two Sage.js
$q$-expansion engines. It covers:

- formula/modular-symbol span equality at level $1$ and level $2$;
- honest proper spans at level $2$ and composite level $6$;
- a rational nontrivial-character modular-symbol space;
- an entirely old weight-$2$ space at level $22$;
- a quadratic coefficient field at level $23$; and
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
override them with `SAGE` and `MAGMA`. The runner fails on any coefficient,
dimension, character, old/new, or Hecke-polynomial disagreement.

Run Sage.js itself against the same pins with:

```bash
node bench/modular/qexp-correctness/sagejs-corpus.cjs
```

The corresponding integration test is `test/qexp-p0-correctness.cjs`.
