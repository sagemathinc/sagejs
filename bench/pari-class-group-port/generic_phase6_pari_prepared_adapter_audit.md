# Generic Phase-6 pristine-PARI prepared adapter

[`generic_phase6_pari_prepared_adapter.c`](generic_phase6_pari_prepared_adapter.c)
and
[`generic_phase6_pari_prepared_adapter.cjs`](generic_phase6_pari_prepared_adapter.cjs)
provide one reusable Linux adapter for development rows 8, 10, 11, 18, and
20. The wrapper admits only an exact structured match for one of the five
reviewed frozen field specifications. It authenticates the pristine PARI
2.17.4 archive, `buch2.c`, and shared library before compiling the helper.
In particular, row 10 retains its frozen panel identity
`generated-sha256-984793770b4a15a79fbc9984fe352fbc867491917733c78bdba3b1856c18e3a7`;
the older polynomial-derived label is not accepted. The C helper treats that
wrapper-authenticated identity as opaque and returns it unchanged.

The helper prepares

```c
nf = nfinit0(polynomial, 0, nbits2prec(192));
```

before printing `READY`. Every `RUN seed` then restores the saved `avma`, calls
`setrand(seed)`, and times exactly

```c
bnfinit0(nf, 0, NULL, nbits2prec(192));
```

with `CLOCK_MONOTONIC`. Class/unit inspection, terminal-RNG inspection, and
JSON serialization occur only after that clock stops. Seeds are canonical
positive decimal integers; zero and noncanonical forms are rejected before a
command reaches the helper. The emitted neutral
projection contains exact field identity, canonical invariant factors, class
number, class-generator count, unit rank, torsion order, and the fact that a
nonzero regulator was returned. It deliberately omits PARI's flag-zero
fundamental-unit materialization tag because that implementation detail is not
the same mathematical datum as the Sage.js `PRECI`/`LARGE` staging status.

This adapter is only a mechanism. It does not register a row, enable a timing
campaign, open a reserve field, qualify a host, or publish a speed ratio.

## Focused check

```sh
node --test test/pari-class-group-generic-pari-prepared-adapter.cjs
```

The check rejects a mutated frozen specification and seed zero, inspects the
clock boundary, and computes all five exact projections with pristine PARI.
Every row is repeated with the same seed in one resident process; both its
exact projection and its 66-word terminal RNG record must replay identically.
