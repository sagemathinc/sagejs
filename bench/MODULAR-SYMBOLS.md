# Modular-symbol correctness and performance dashboard

Run the human-readable dashboard with:

```sh
pnpm bench:modular-symbols
```

Agents and automation can request stable structured output:

```sh
pnpm bench:modular-symbols -- --json
```

The dashboard separates the following operations because conflating them
would give misleading performance numbers:

- canonical construction and indexing of `P1List(N)`;
- the weight-2 `Gamma0(N)` Manin `S`/`R` relation quotient over the
  machine-word field `GF(65521)`;
- construction of the full weight-2 rational modular-symbol space;
- construction of the full, cuspidal, plus, and plus-cuspidal spaces at
  level 5077;
- restriction of `T_2` to the level-5077 plus-cuspidal space;
- construction of the exact dense weight-2 `T_3` matrix, checked by trace.

The presentation cases include prime level 389 and composite level 1000. The
Hecke matrix cases additionally include composite level 10000 and prime level
20011. Their respective exact modular-symbol dimensions are 3001 and 3335, so
the dashboard constructs roughly 9-million- and 11-million-entry matrices
instead of measuring only tiny examples.

Hecke timings use an initialized modular-symbol space but force matrix
recomputation rather than timing a cached lookup. SageMath's operator and
ambient-space matrix caches are explicitly cleared between samples. The
reported answer is the basis-independent trace; regression tests also compare
traces of the second and third powers with PARI.

Sage.js and SageMath run the same `.sage` benchmark source. PARI/GP is used
for its public `msinit`/`msdim` rational modular-symbol interface when `gp` is
installed. Magma is included when `MAGMA` (or `/home/user/bin/magma`) is
available. eclib is reported explicitly but is not assigned a synthetic
timing: its public modular-symbol programs specialize in weight-2 newform and
elliptic-curve workflows rather than exposing these same operations.

Set `SAGELITE_SAGE`, `PARI_GP`, or `MAGMA` to compare specific installations.
Unavailable tools are reported as such rather than silently omitted.

## Implementation lineage

The native Sage.js `P1List` follows Sage-compatible canonical representatives
and ordering. Its allocation and indexing strategy was informed by:

- William Stein's original Sage Cython implementation,
  `src/sage/modular/modsym/p1list.pyx`;
- William Stein's later JSage/Zig experiment,
  `lib/src/modular/p1list.zig`, especially its preallocation strategy;
- Manin's two-term and three-term presentation of modular symbols.

The native implementation first computes
`#P1(Z/NZ) = N product_(p | N) (1 + 1/p)`, allocates the representative array
once, and builds a fixed-size open-addressed lookup table. The sparse relation
builder likewise counts relation orbits and allocates compressed-row storage
once.

PARI/GP provides an independent correctness and performance reference through
its `msinit` implementation for even-weight `Gamma0(N)` modular symbols. Its
weight-2 path constructs a connected fundamental domain and eliminates paired
interior and boundary edges structurally; it does not compute the rank of the
full Manin relation matrix. Sage.js now implements this Pollack--Stevens/PARI
strategy natively using preallocated C arrays and integer indices. For
characteristic greater than 3, dimension and rank queries use the minimal
presentation; dense FLINT rank remains the independent small-level oracle and
the characteristic-2/3 fallback.

Exact weight-2 Hecke matrices use the minimal `E1` basis directly. For every
basis path, Sage.js applies the standard `T_p` (or `U_p`) representatives,
reduces the resulting rational paths by continued fractions, and expands
fundamental-domain paths through a precomputed boundary reduction. The entire
operation is a single native batch returning a FLINT integer matrix. The
fundamental-domain, path-reduction, and Hecke-assembly code lives in
`packages/flint/src/modsym_core.c`, which has no Node-API dependency; the
Node adapter supplies only a projective-coset lookup callback and wraps the
finished row-major buffer. This is the intended boundary for a WASM adapter.

Higher-weight `Gamma0(N)` spaces use the classical triple presentation
`(i,u,v) = [X^i Y^(k-2-i),(u,v)]`.  The conventions and regression corpus
were checked independently against:

- William Stein, *Modular Forms, a Computational Approach*, the chapter
  [Computing with Modular Symbols](https://wstein.org/books/modform/modform/modular_symbols.html);
- SageMath's `sage.modular.modsym.manin_symbol_list` and
  `relation_matrix` implementations;
- the original Magma `Geometry/ModSym` implementation written by William
  Stein, especially `core.m` and `operators.m`.

The native implementation does not form a large sign-zero space and then
take a dense star eigenspace.  It first eliminates the monomial two-term
relations

```text
x + x*S = 0,                 x - sign*x*I = 0
```

with a signed union/find.  It then expands only the order-three relation
`x + x*T + x*T^2 = 0` using exact binomial coefficients and applies FLINT's
sparse rational elimination.  The retained reduction matrix sends every
triple generator to the quotient basis. Prime Hecke operators generate
Cremona's continued-fraction Heilbronn representatives once, then apply the
entire batch natively, including non-primitive-image zero terms at bad primes.
Composite indices use Hecke multiplicativity and the exact weight-`k`
prime-power recurrence. Levels 3, 11, 12, and 37, weights 4 and 6, and all
three signs are tested against Sage using complete factorizations of the
`T_2` characteristic polynomial, not only dimensions or traces.

Higher-weight boundary maps lift only the two extreme monomials to cusp
classes, as in the original Magma implementation: `X^(k-2)` contributes the
image of infinity and `Y^(k-2)` subtracts the image of zero. Cremona's cusp
equivalence criterion and the sign relation produce the correct boundary
quotient even at nonsquarefree levels. Its exact kernel is the cuspidal
subspace, and the native Hecke matrices restrict to that kernel. Arbitrary
rational paths with polynomial coefficients remain an explicit unsupported
operation; Sage.js raises `NotImplementedError` rather than silently applying
the weight-2 path reducer.

Dirichlet-character spaces use the same triple presentation, with the
normalization scalar from the character included in every projective-coset
lookup. A weighted union/find eliminates monomial two-term and signed-star
relations while storing root-of-unity exponents, so these relations require
no general algebraic-number arithmetic. The surviving order-three relations
are reduced exactly by FLINT's generic-ring matrix layer over a cyclotomic
field. The retained reduction map then drives exact prime Hecke matrices;
composite operators use multiplicativity and

```text
T_(p^r) = T_p T_(p^(r-1)) - chi(p) p^(k-1) T_(p^(r-2)).
```

Boundary classification follows the character-sensitive cusp equivalence
test in SageMath and the original Magma modular-symbol implementation. It
records both the equivalence scalar and cusps killed by a stabilizer on which
the character is nontrivial. The kernel gives the exact cuspidal subspace.
Regression cases cover quadratic, cubic, quartic, and sextic characters,
both parities, weights 2 through 4, all three signs, bad-prime and composite
Hecke operators, and characteristic polynomials over exact cyclotomic fields.
These were compared directly with SageMath, including the diamond-operator
normalization convention. The remaining important character-space API gap is
exposing the full star matrix on a sign-zero space; signed spaces themselves
are constructed directly and have exact star action.

The same retained E1 endpoints now define the exact boundary map. Rational
cusps are classified under `Gamma0(N)` using Cremona's equivalence criterion,
and each basis path maps to its endpoint divisor.  Since this is an oriented
graph-incidence matrix, the native cuspidal algorithm chooses a
reverse-lexicographically maximal spanning forest and writes down a sparse
integral fundamental-cycle basis directly.  It therefore avoids dense
rational kernel computation entirely while returning an RREF basis.

Complex conjugation negates both path endpoints and passes through the same
native continued-fraction reducer. Signed spaces use the sparse projection
`1 + sign*star`. The native E1 star matrix has only linearly many nonzero
entries (4,794 at level 10,000, versus 9,006,001 possible entries), so Sage.js
keeps projector rows sparse throughout exact elimination. A machine-integer
fast path primitive-normalizes unit-pivot rows; a sparse `fmpq` path handles
nonunit pivots without sacrificing exactness. Only the final Sage-compatible
RREF basis is materialized as a matrix. This replaces the former dense
word-prime rank profile and dense rational RREF, whose cubic scaling dominated
signed-space construction.

Restricting the boundary map to that signed basis computes signed-cuspidal
spaces without a generic large-subspace intersection. Sparse-left exact
products skip the overwhelmingly zero coefficient entries. The resulting
boundary matrices are thin and sparse (at level 10,000 the plus boundary has
1504 rows, 180 columns, and about 1.3% density), so the matrix kernel layer
selects an exact sparse `fmpq` RREF instead of applying dense rational RREF
twice. This is a general matrix optimization, not a modular-symbol heuristic;
dense inputs continue to use FLINT's dense algorithms. Signed subspaces also
avoid constructing the full ambient cuspidal cycle basis, since only their
restricted boundary kernel is needed.

Native pivot extraction and row/column selection keep large restricted Hecke
matrices inside FLINT instead of transferring each entry through the language
boundary. Arbitrary rational paths can also be reduced to genuine coordinate
elements, on which boundary, star, and Hecke actions agree with the row-action
matrices exposed by Sage.

At the high-level boundary, matrix and subspace representations are lazy.
Large matrices print a Sage-compatible dimension/base-ring summary; `.str()`
is the explicit request for every entry.  Ordinary levels also bypass the
level-11-only change-of-basis conjugation rather than constructing large
rational identity matrices.

The algorithmic reference is PARI/GP's GPL-2.0-or-later
`src/basemath/modsym.c`, copyright 2011 The PARI Group, inspected at
development revision `0f5a08ee7e` on 2026-07-31. That source cites Robert
Pollack and Glenn Stevens, *Overconvergent modular symbols and p-adic
L-functions*, Annales scientifiques de l'École Normale Supérieure 44 (2011),
1–42. eclib remains an important reference for the specialized
weight-2/newform pipeline and its linear algebra.
