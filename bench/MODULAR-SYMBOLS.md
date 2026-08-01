# Modular-symbol correctness and performance dashboard

Run the human-readable dashboard with:

```sh
pnpm bench:modular-symbols
```

Agents and automation can request stable structured output:

```sh
pnpm bench:modular-symbols -- --json
```

For differential exploration across level, weight, sign, Hecke prime, and
each construction stage, run the four-system parameter grid:

```sh
pnpm bench:modular-symbols:grid
pnpm bench:modular-symbols:grid -- --large
pnpm bench:modular-symbols:grid -- --seed 20260801 --count 12 --json
pnpm bench:modular-symbols:grid -- --seed 20260801 --count 12 --stress
pnpm bench:modular-symbols:grid -- \
  --case 1000,6,1,2,false --case 1000,6,-1,2,false \
  --runtimes sagejs,pari,magma --timeout-ms 120000
```

The core profile deliberately mixes prime, composite, and squareful levels;
weights 2 through 8; all three signs; and several Hecke primes. The large
profile adds levels 5077, 10000, and 20011 plus larger higher-weight spaces.
Its most expensive characteristic polynomials are disabled so that the grid
continues to measure the named stage instead of becoming a charpoly-only
benchmark. A seeded run selects a reproducible sample from a wider Cartesian
product. By default, seeded selection caps the rough level-times-weight work
parameter at 2000. `--stress` removes that guard and records per-case failures
instead of aborting the remaining sweep. Small and medium seeded cases include
charpolys; large ones stop at the trace-checked Hecke matrix. Repeated
`--case N,K,SIGN,P[,CHARPOLY]` options make a discovered cliff an exact,
reproducible probe. `--runtimes` can omit a reference system known to be
pathological in that region, and `--timeout-ms` prevents one runtime from
blocking the remainder of a sweep. Timeout reports distinguish agreement of
completed rows from completeness of the requested grid.

Every row is checked against SageMath using a basis-independent integer:
dimensions for spaces, the Hecke trace modulo 1000000007, or the value at 2
of the exact characteristic polynomial modulo 1000000007. PARI/GP and Magma
run independently generated programs with the same parameters. Use `--json`
to retain results for later performance-cliff analysis.

A core-grid snapshot from 2026-08-01 (milliseconds, one warm-process sample
per stage) shows both the gains and the remaining higher-weight boundary:

| case | stage | Sage.js | SageMath | PARI/GP | Magma |
| --- | ---: | ---: | ---: | ---: | ---: |
| level 1000, weight 2, plus | space | 5 | 144 | 124 | 60 |
| level 1000, weight 2, plus | cusp | 6 | 198 | 171 | 40 |
| level 1000, weight 2, plus | `T_2` | 11 | 190 | 75 | 20 |
| level 1000, weight 2, plus | charpoly | 51 | 37 | 32 | 20 |
| level 97, weight 8, full | space | 113 | 509 | 5 | 90 |
| level 97, weight 8, full | cusp | 66 | 539 | 117 | <1 |
| level 97, weight 8, full | `T_2` | 7 | 64 | 47 | 180 |

All 120 rows in that eight-case, four-runtime snapshot agreed. A separate
12-case seeded run also produced 192 agreeing rows. The stress version of the
same seed originally found a dense-allocation cliff at full weight 6 and level
1000. Higher-weight presentations now accept their order-three relations as
sparse integer CSR data and retain a factorized quotient, so this case is
supported without constructing the generator-by-quotient reduction matrix.

A signed weight-6, level-1000 snapshot after that change gives:

| case | stage | Sage.js | PARI/GP | Magma |
| --- | ---: | ---: | ---: | ---: |
| plus | space | 9.00 s | 25.52 s | 39.05 s |
| plus | cusp | 0.167 s | timeout | 0.09 s |
| plus | `T_2` | 0.085 s | timeout | 9.62 s |
| minus | space | 17.54 s | timeout | 46.19 s |
| minus | cusp | 0.141 s | timeout | 0.08 s |
| minus | `T_2` | 0.072 s | timeout | 7.58 s |

Every completed dimension and trace fingerprint agreed. PARI/GP exceeded the
two-minute per-runtime budget before finishing the first case. For sign zero,
level 1000 and weight 4 improved from over one minute and roughly 750 MB to
8.1 seconds for the ambient space, 3.3 seconds for its cuspidal subspace, and
86 ms for `T_2`. Full weight 6 now completes instead of raising an allocation
error, but its 113-second construction shows the next boundary: the quotient
RREF itself becomes large and dense even though its input and retained maps
are sparse.

The cuspidal timings above include a subsequent ambient-space optimization:
the higher-weight path now takes the kernel of the boundary matrix directly.
Previously it first constructed a large identity basis and multiplied that
identity by the boundary matrix, which accounted for about 2.2 seconds at
level 1000. A further scaling probe gave 16.86 seconds for the level-1201,
weight-8 plus space and 88 ms for `T_2`, versus Magma's 34.91 and 55.20
seconds. At prime level 2003 and weight 4, Magma still constructs the signed
spaces 3--5 times faster, while Sage.js computes the tested Hecke operators
roughly 150 times faster. These results identify presentation construction,
not Hecke assembly, as the next signed-space optimization target.

Dirichlet-character spaces have a separate three-system dashboard:

```sh
pnpm bench:character-modular-symbols
pnpm bench:character-modular-symbols -- --large
pnpm bench:character-modular-symbols -- --large --json
```

The default character profile compares quadratic and order-5 characters at
prime level 1201. The intentionally expensive `--large` profile adds prime
level 4001. Both profiles also include the full-order character modulo 37 in
weight 5. This deliberately small-level, degree-12 coefficient-field case
times space construction, its cuspidal kernel, `T_2`, and the characteristic
polynomial independently. It catches coefficient-field complexity that the
larger-level low-order characters do not expose. The `T_2` answer is a
Galois-invariant fingerprint: the rational trace for quadratic characters,
or the value at 2 of the trace's minimal polynomial for non-real characters,
reduced modulo 1000000007. Thus inverse character choices compare correctly
across the three systems.

One level-4001 snapshot from 2026-08-01 (seconds, one warm-process sample per
stage) illustrates the current performance boundary:

| character | stage | Sage.js | SageMath | Magma |
| --- | ---: | ---: | ---: | ---: |
| quadratic | space | 0.12 | 0.40 | 0.36 |
| quadratic | cuspidal | 0.004 | 0.67 | 0.03 |
| quadratic | `T_2` | 0.05 | 0.10 | 0.29 |
| order 5 | space | 0.74 | 8.03 | 0.41 |
| order 5 | cuspidal | 0.03 | 55.42 | 0.06 |
| order 5 | `T_2` | 0.39 | 15.47 | 0.80 |

The degree-12 coefficient-field case added after that snapshot currently
gives the following on the same development machine:

| character | stage | Sage.js | SageMath | Magma |
| --- | ---: | ---: | ---: | ---: |
| order 36, weight 5, level 37 | space | 0.30 | 0.07 | 0.04 |
| order 36, weight 5, level 37 | cuspidal | 0.001 | 0.06 | <0.01 |
| order 36, weight 5, level 37 | `T_2` | 0.093 | 0.37 | 0.01 |
| order 36, weight 5, level 37 | charpoly | 0.64 | 0.20 | 2.37 |

All rows passed the independent dimension or trace-fingerprint checks. These
numbers are a reproducible development snapshot, not portable performance
claims. Sage.js retains the exact native character presentation behind the
high-level presentation object, so `T_2` reuses its basis and reduction map
instead of reconstructing them. Quadratic presentations convert their
root-of-unity terms directly to sparse integer CSR, use the fraction-free
rational reducer, and retain the quotient map lazily. They never construct the
former dense `qqbar` relation matrix or scan it back into rationals; at level
4001 this reduced space construction from about 0.86 seconds to 0.12 seconds.
Non-real presentations use
certified multimodular cyclotomic RREF and retain its factorized native result;
the full generator-to-basis matrix is materialized only when explicitly
requested. Sage.js's exact order-5 construction is within a factor of two of
Magma here. Its complete cuspidal step is now faster than Magma in this
snapshot and over 1,600 times faster than SageMath. Exact order-5 Hecke
assembly is about twice as fast as Magma and 39 times faster than SageMath.

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
sparse rational elimination. The order-three relations are emitted directly
as integer CSR rows; no dense generator-by-two-term relation matrix is formed.
The resulting RREF, signed union/find map, pivots, and free columns are retained
as a factorized quotient. Prime Hecke operators generate
Cremona's continued-fraction Heilbronn representatives once, then apply the
entire batch natively, including non-primitive-image zero terms at bad primes.
The presentation is retained in a finalizable, type-tagged native object, so
the first Hecke operator reuses the already-computed basis and factorized map
instead of repeating relation construction and sparse elimination. In the
core snapshot this reduces the level-97, weight-8 `T_2` stage from 117 ms to
7 ms; the seeded level-389, weight-4 minus case takes 11 ms.
The much larger generator-to-basis reduction matrix is materialized lazily
only when `reduction_matrix()` is explicitly requested, subject to a dense
allocation guard.
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
no general algebraic-number arithmetic. For non-real characters, the surviving
order-three relations are evaluated at every finite-field embedding for primes
that split completely in the character field. Sparse machine-word RREFs must
have a common pivot profile; their entries are interpolated into the
cyclotomic power basis, combined by CRT, and rationally reconstructed. A
coefficient-height test certifies the result. Unsupported character orders or
an unsuccessful certificate fall back to sparse exact `qqbar` elimination.
Real-valued characters replace their root-of-unity exponents by exact signs
and feed integer CSR directly to the fraction-free sparse rational reducer.

The reconstructed RREF, weighted union/find data, pivots, and free columns form
a compact factorized reduction map. Hecke assembly consumes that form directly.
The much larger public generator-to-basis matrix is produced lazily by
`reduction_matrix()`. The native presentation is owned by a finalizable opaque
Node object and validated by level, weight, sign, and character on reuse.
Certified RREF power-basis coordinates remain attached to non-real character
Hecke matrices. Column selection and rational sparse-left multiplication retain
those coordinates through cuspidal restriction. Characteristic polynomials
then run in FLINT's number-field matrix context and convert only the final
coefficients back to Sage.js algebraic values; they do not perform elimination
with generic `qqbar` entries.
Composite Hecke operators use multiplicativity and

```text
T_(p^r) = T_p T_(p^(r-1)) - chi(p) p^(k-1) T_(p^(r-2)).
```

Boundary classification follows the character-sensitive cusp equivalence
test in SageMath and the original Magma modular-symbol implementation. It
records both the equivalence scalar and cusps killed by a stabilizer on which
the character is nontrivial. Projective-coset lifting, signed cusp
classification, character normalization, and exact boundary-matrix assembly
now run in one native batch instead of crossing the JavaScript boundary once
per basis generator. The exact lift and cusp-equivalence-scalar primitives
live in the portable C modular-symbol core; the Node adapter currently owns
the character-valued matrix assembly while WASM retains the exact high-level
fallback. At level 4001 this reduced the quadratic boundary phase from about
0.14 seconds to 0.003 seconds. The kernel gives the exact cuspidal subspace.
Composite levels 8, 12, 15, 16, 20, and 24, including imprimitive characters,
were exhaustively cross-checked against SageMath for weights 2 through 4 and
all signs.
For a thin boundary matrix, algebraic kernel reduction scans columns in reverse
and chooses the rightmost independent columns. The corresponding free-variable
vectors are already in canonical RREF after reversing back, avoiding a second
large algebraic RREF. Ambient spaces also bypass identity-matrix products.
Restriction of Hecke operators keeps this RREF basis sparse and selects only
the ambient pivot columns needed for subspace coordinates. The native algebraic
sparse product then scales with the nonzero entries in the basis instead of
treating the nearly-identity basis as a dense cyclotomic matrix.
Regression cases cover quadratic, cubic, quartic, and sextic characters,
both parities, weights 2 through 4, all three signs, bad-prime and composite
Hecke operators, and characteristic polynomials over exact cyclotomic fields.
These were compared directly with SageMath, including the diamond-operator
normalization convention. The remaining important character-space API gap is
exposing the full star matrix on a sign-zero space; signed spaces themselves
are constructed directly and have exact star action.

The multimodular implementation follows SageMath's
[`Matrix_cyclo_dense`](https://doc.sagemath.org/html/en/reference/matrices/sage/matrix/matrix_cyclo_dense.html)
lineage (William Stein and Craig Citro) and the Balakrishnan--Stein work on
linear algebra over cyclotomic fields: choose primes that split completely,
evaluate at every finite-field embedding, perform machine-word linear algebra,
and reconstruct the cyclotomic answer by CRT and rational reconstruction. The
Sage.js implementation additionally preserves the sparse Manin relation rows
through the finite-field phase and keeps the reconstructed quotient map
factorized. Before exact sparse elimination, it processes the shortest
relations first, breaking ties by their first nonzero column. This simple
fill-in heuristic reduced construction of the level-625, weight-4 sign-zero
space from about 0.80 seconds to 0.094 seconds on the reference machine; the
plus and minus spaces take about 0.029 and 0.037 seconds. A 20-case seeded
cross-check (156 timed stages across Sage.js and Magma) retained complete
agreement.

The rational presentation reducer first attempts fraction-free sparse
elimination in machine integers. A row with leading coefficient `a` is
cancelled against a pivot with leading coefficient `b` using `b*row-a*pivot`,
then primitive-normalized; every multiply and subtraction is overflow-checked.
If coefficients outgrow a machine word, reduction restarts through the general
FLINT `fmpq` path. Pivot-column incidence lists ensure that backward reduction
visits only rows containing the relevant pivot, and the final dense matrix has
exactly `rank` rows rather than reserving the square worst case. This second
layer reduced level-10,000, weight-4 plus-space construction from about 17.3
seconds before the sparse improvements to 5.8 seconds, level-5,003 weight 4
from 1.64 to 0.54 seconds, and level-625 weight 4 from 0.80 to 0.041 seconds.
Inputs that trigger the rational fallback retain the same exact result and
roughly their former performance.

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
