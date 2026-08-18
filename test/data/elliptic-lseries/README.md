# Elliptic `L`-series oracle corpus

`corpus-spec.json` is the exact, reviewable input. `sage-pari-oracles.json` is
generated in one Sage process by:

```sh
/home/user/sagelite/sage -python upstream-tests/sage/elliptic-lseries.sage \
  test/data/elliptic-lseries/corpus-spec.json \
  test/data/elliptic-lseries/sage-pari-oracles.json
```

The generator constructs one PARI `lfuninit` object per curve at the maximum
working precision and evaluates every requested point without starting a
process per point. Values at 53, 100, and 200 bits are rounded into their stated
Sage complex fields before serialization.

For elliptic input with PARI gamma data `[0,1]`, `lfunlambda` uses a completion
which is twice the canonical completion in the project plan. The generator
therefore stores `lfunlambda/2`, namely
`(sqrt(N)/(2*pi))^s*Gamma(s)*L(E,s)`, and records that factor in provenance.

The canonical coefficient-probe byte string is the UTF-8 encoding of all
`a_0,...,a_256` as base-ten integers joined by commas and terminated by one
newline. Its SHA-256 hash detects curve/model/indexing drift without committing
the full coefficient prefix.

`magma-oracles.json` is an optional independent raw-value comparison generated
with the installed Magma by:

```sh
node bench/elliptic-lseries/capture-magma.cjs
```

The committed data are offline fixtures. Ordinary tests never invoke Sage,
PARI, Magma, a network service, or any standalone `L`-function program.
The old installed Magma is used for representative conductors through
`1008811`; its complex `LSeries` evaluation for the `430250329` example is too
slow to be a practical corpus-regeneration step and remains in the separate
manual benchmark.

The stored analytic ranks are corpus classifications inherited from the
analytic-rank oracle set. In particular, rank 4 and rank 5 labels are numerical
expectations, not unconditional proofs of those analytic ranks.

The large-conductor public curve also includes the exact point
`s=-1048575/1048576=-1+2^-20`. Its large nonzero value guards against an
implementation snapping a point near a trivial zero to the exact integer.
