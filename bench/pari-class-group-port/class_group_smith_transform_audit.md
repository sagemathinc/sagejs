# Class-group Smith transformations

This checkpoint closes the exact matrix portion of PARI 2.17.4
`class_group_gen` from an accepted square positive HNF through `M1` and `M2`.
It does **not** construct reduced ideal generators, archimedean corrections, or
prove that the supplied HNF presents the complete class group.

## Source correspondence

- `hnf_snf.c:ZM_snfall_i` supplies the descending Smith loop, divisibility
  repairs, determinant-modulus reductions, and tracked left transformation.
- `alglin1.c:ZM_inv` is used upstream only on matrices already known to be
  unimodular here. The translation uses checked fraction-free Gauss--Jordan
  elimination on reusable exact owners. Since an inverse is unique, this is an
  explicit arithmetic-backend substitution rather than a changed result.
- `ZV.c:ZM_hnfdivrem` is the existing source translation in `hnf_divrem.py`.
  Its actual source identity is `R = X + H Q`; this yields
  `Ur = U + D Y` and `Uir = Ui + W X`.
- `buch2.c:class_group_gen` supplies the ordering: compute full `M2`, shorten
  `V` and `D` to non-unit Smith columns, then compute rectangular `M1`.

Tracking the visible Smith column operations is not enough to reconstruct
`V`: `ZM_redpart` changes entries modulo the determinant without a tracked
elementary operation. The implementation therefore follows PARI's post-loop
reconstruction. It forms `T = D^-1 U W` and publishes `V = T^-1`.

## Owners and identities

`class_group_smith_transform.py` is ordinary CPython-parseable Python. The
compiled root receives disjoint reusable `IntegerBuffer` owners for

```text
D, U, Ui, V, Ur, Y, Uir, X, M1, M2
```

and scratch for one column, one square product, and one augmented inverse.
Only the leading `n * c` entries of `M1` are live, where `c` is the number of
non-unit invariant factors. No Python or JavaScript callback occurs inside the
compiled graph.

The differential checker independently verifies

```text
U W V = D
U Ui = Ui U = I
Ur = U + D Y
Uir = Ui + W X
M1 = V[:, :c] + X D[:, :c]
M2 = X Ur + V Y
```

as well as exact elementwise agreement with pristine PARI for every published
matrix.

## Evidence

Run:

```bash
node bench/pari-class-group-port/check_class_group_smith_transform.cjs \
  /home/user/upstream/pari-2.17.4 \
  /home/user/upstream/pari-2.17.4.tar.gz
```

The frozen archive has SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
The checker compiles a UBSan PARI oracle and exercises 189 controls:

- dimensions zero through eight with positive upper HNFs;
- nontrivial off-diagonal and divisibility-repair paths;
- the determinant-equal but group-distinct `C4` and `C2 x C2` controls;
- 65-, 129-, 257-, and 513-bit diagonal storage/inversion controls.

CPython, compiled JavaScript, GMP, and tagged execution agree. The pristine
trace SHA-256 is
`cc321867221eaf86e689d76678996fe3d40d7ee0f74f21cf1f1e24616aea2f8e`.
The generated native core is callback-free. This is correctness evidence, not
a qualified timing result.

Passing `--collector-fixtures PATH` additionally imports every actual GMP HNF
from the existing collector fixture format, so the integration lane can bind
this checkpoint to freshly generated accepted presentations without copying a
class answer into the implementation.

## Deliberate limitation

`hnf_bezout.py` already documents an arithmetic-backend substitution for
multiword extended gcd. PARI/GMP may choose different valid Bézout
coefficients, which can change `U` and `V` without changing `D` or any exact
identity. The exact-transform corpus therefore uses word-sized nontrivial
Bézout paths and multiword diagonal controls. An authentic collector fixture
that enters multiword transform-producing Bézout must either qualify the
result by identities/provenance or first add a source-matched GMP coefficient
convention; it must not silently claim elementwise PARI generator equality.
