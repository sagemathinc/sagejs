# Hyperelliptic oracle corpus

This directory generates the compact offline fixture in
`test/data/hyperelliptic/local-data-v1.json`. Runtime tests read only that
fixture; Sage, PARI, and Magma are development oracles, not dependencies.

The normalization is fixed throughout:

```text
y^2 + h(x)y = f(x)
L_q(T) = det(1 - T Frob_q)
```

Polynomial and model coefficients are stored in ascending order. Every integer
in the fixture is a decimal string so the format is independent of JavaScript's
safe-integer limit.

## Reproduce the data

The default paths match the development machines described in the project
plan. Override them with `SAGE`, `MAGMA`, or `PYTHON` when necessary.

```sh
node bench/hyperelliptic/run-oracles.cjs --write
node --test test/hyperelliptic-oracles.cjs
```

Generation compares four independent routes before writing anything:

- `exhaustive_oracle.py` implements tiny extension fields, projective point
  counts, Newton reconstruction, Hasse--Witt matrices, and stable `p`-rank in
  ordinary Python without a mathematical package;
- `sage_oracle.py` uses Sage's hyperelliptic finite-field and Jacobian APIs;
- `pari_oracle.py` calls PARI `hyperellcharpoly` through Sage's in-process
  binding;
- `magma_oracle.cjs` generates a Magma program on stdin, checks zeta
  numerators and extension point counts, and enumerates every Jacobian element
  for an independent order histogram.

Sage's invariant factors must reproduce Magma's full element-order histogram,
not merely have the same product. PARI 2.17 does not accept the two generalized
characteristic-2 cases; the fixture records that limitation and requires the
other three oracles to agree there.

The fixture contains source, harness, and executable SHA-256 provenance. Its
own deterministic hash excludes only `generated_at_utc`, so timestamps do not
make verification flaky.

## Scope

The cases deliberately stay small enough for exhaustive reproduction while
covering genus 2 and 3, degrees 5 through 8, odd/even models, nonzero `h`,
characteristic 2, quadratic twists, bad reductions, ordinary and
supersingular examples, every possible `p`-rank, and cyclic through rank-four
Jacobian structures. Large-prime and dense-interval throughput belongs in the
benchmark harness; it does not inflate the runtime fixture.
