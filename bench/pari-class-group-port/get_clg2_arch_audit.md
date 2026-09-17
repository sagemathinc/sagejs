# Packed `get_clg2` archimedean assembly audit

## Boundary

`get_clg2_arch.py` translates only the two floating identities in pristine
PARI 2.17.4 `src/basemath/buch2.c:get_clg2`:

```text
GD = act_arch(M1, C) - diag(cyc) Ga
ga = act_arch(M2, C) - act_arch(Ur, Ga)
```

It reuses `pari_log_matrix_transform`, whose special (`generic=False`)
coefficient-zero skip rule is the one selected by these exact integer matrices.
The two small packed subtraction functions preserve the entry order of PARI's
`gsub`: negate the right entry exactly, then call the existing `gadd` leaf.

The exported assembly interface is:

```python
pari_get_clg2_arch(
    c_entries, m1, cyc, generator_logs, m2, ur,
    rows, inner, active,
    gd_output, ga_output,
    gd_work, cm2_work, urga_work,
) -> int
```

All logarithm matrices use seven-word column-major entries. `C` and `Ga` have
shape `rows x inner`, `M1` is `inner x active`, and `M2` and `Ur` are square
`inner x inner`. `GD` has shape `rows x active`; `ga` has shape
`rows x inner`.

All three transforms finish in reusable work owners before either result is
published. Therefore `GD` may alias `C` and `ga` may alias `Ga`, as exercised
on every runtime. The two output owners and the three work owners remain a
caller-disjointness contract.

## Authentic fixture and oracle

`check_get_clg2_arch.cjs` builds an oracle against a caller-supplied pristine
PARI 2.17.4 tree and archive. It verifies the archive SHA-256
`02651d99...a4b53` and exact `buch2.c` SHA-256 `904ced80...d1ac` before use.

The fixture is not a hand-constructed floating matrix. The oracle runs
`bnfinit(x^3 - 10*x^2 - 30*x - 195, 1)` at 192-bit requested precision,
extracts `cyc`, `Ur`, `Ge`, `M1`, `M2`, and the stored `GD`/`ga`, and rebuilds
each `Ga` column by calling pristine `nf_cxlog` on the corresponding stored
`Ge` factorization. A literal copy of the short pristine `act_arch` and
`diagact_arch` bodies then recomputes both formulas and must compare `gequal`
to PARI's stored result before the fixture is emitted.

The BNF's final `C` has columns appended during later unit processing. The
original `get_clg2` call consumed the leading prefix selected by the row count
of `M1`; the oracle explicitly authenticates and emits that prefix rather than
mistaking the enlarged final owner for the earlier matrix shape.

The emitted fixture has `(rows, inner, active) = (2, 1, 1)` and exercises
nonzero complex logarithm entries, integer scale by the class invariant, and
both subtraction identities.

## Differential coverage

One invocation checks exact packed output on:

- pristine PARI 2.17.4;
- ordinary CPython source;
- JavaScript integers;
- GMP integer buffers; and
- tagged integer buffers.

Each runtime also checks result/input aliasing. Five malformed dimension or
owner cases per runtime reject before changing either public output. The
checker records source, archive, upstream source, oracle binary, and trace
hashes in its JSON receipt.

Run:

```bash
node bench/pari-class-group-port/check_get_clg2_arch.cjs \
  /home/user/upstream/pari-2.17.4 \
  /home/user/upstream/pari-2.17.4.tar.gz
```

## Deliberate limits

This is a prepared-state leaf, not a class-group computation or certificate.
It does not run `genback`, choose class generators, prove relation
completeness, reconstruct units, or publish a BNF. The native call permits
`active <= inner`, but only the authentic accepted cubic shape
`active == inner == 1` is presently qualified. Owner disjointness across the
two results and three scratch buffers is not dynamically discoverable from
separate `IntegerBuffer` arguments and remains explicit.
