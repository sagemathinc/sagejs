# Row-19 live rank-one compact unit

Status: live exact compact-unit owner derived from the committed terminal
continuation; no W0 runtime input and no expanded-element claim.

`row19_live_rank1_unit.py` consumes the authenticated immutable terminal owner
published by `row19_terminal_continuation_host.cjs`.  The coordinator binds the
terminal owner and its compressed envelope by SHA-256, requires the successful
430-relation/HNF/acceptance states, and hashes the live relation, raw-log,
principal-generator, and regulator projections independently.  The Python
suffix recomputes those projection hashes before doing mathematics.

The suffix computes the saturated integer kernel of the live 424-by-430
relation matrix using PARI `matkerint` through the already installed `cypari2`.
Its rank is six.  Pairing that kernel with the live raw real logarithms and
accepted regulator gives exact rounded multiples

```text
[0, 0, 1, 1, -1, 1]
```

with dyadic residuals below `2^-120` and gcd one.  Deterministic Bezout cleanup
selects the sixth saturated-kernel column.  It has 352 nonzero relation
coefficients, maximum magnitude 571332, and maximum bit length 20.  Direct
424-row replay proves that this vector annihilates the live relation matrix.

The published unit is exact in PARI's compact factored representation: the
terminal owner's 430 principal generators together with the 430 exponents.
Its inverse is the same factor list with every exponent negated.  The row-19
maximal-order multiplication tensor determines each principal generator's
exact algebraic norm sign; relation dependency proves absolute norm one.  The
unit and inverse both have exact norm `+1`, and their factored product is the
identity.  Expansion is deliberately false: it would construct enormous
intermediate algebraic integers and is unnecessary for an exact compact unit.

The immutable live owner is:

```text
/scratch/sagejs-row19-live-rank1-unit/row19-live-rank1-unit-d0537e45fc9ecb8c89e7252325f612262363df1d84dbe0c507f0e47ea6ac4116.json.gz
owner sha256       d0537e45fc9ecb8c89e7252325f612262363df1d84dbe0c507f0e47ea6ac4116
compressed sha256  5807069dfc9ff429659d6204f3d01335541893a811ef9405c4fa2c28ca956f5b
```

Its exponent digest is
`d16c6852208fe906d02547b408e8957af9f7417c35fba8e1044b98b62b851420`.
This independently matches the earlier frozen-state reconnaissance, but that
receipt is not read by the live implementation or checker.

Reproduce with the lane-private bytecode cache:

```sh
PYTHONPYCACHEPREFIX=/scratch/sagejs-row19-live-rank1-unit-cache/pycache \
  node bench/pari-class-group-port/check_row19_live_rank1_unit.cjs
```

The checker replays the full relation dependency, authenticates immutable
publication, and rejects mutations to each of the live relation, log,
regulator, and principal-generator projections.
