# Sage Days P1: Matrix and Vector API foundation

This audit fixes a reproducible baseline for the public dense `Matrix` and
`Vector` surface over `ZZ`, `QQ`, and a representative small prime field,
`GF(7)`. It is deliberately diagnostic: it adds no mathematical algorithms
and changes no shared registry.

The machine-readable snapshot is
[`audits/linear-algebra-api.json`](audits/linear-algebra-api.json). Run the
deterministic audit with:

```sh
pnpm build
node test/linear-algebra-api-audit.js
```

Measure the representative warm workloads, or enforce their coarse
cross-platform budgets, with:

```sh
node bench/linear-algebra-api-audit.cjs --json
node bench/linear-algebra-api-audit.cjs --check
```

## Result

The exact matrix foundation is substantially stronger than the public-name
coverage suggests. All three target matrix families own packed,
host-independent storage. Common structural operations use source-transparent
typed Python, and mature algorithms use generated packed FLINT declarations.
The most valuable P1 work is therefore filling ordinary Sage API seams,
especially for vectors, indexing/mutation, and predicates—not replacing the
working exact arithmetic.

The public-name snapshot against SageMath 10.9.post1 is:

| Object | Ring | Sage names | Common names | Name coverage |
|---|---:|---:|---:|---:|
| `Matrix` | `ZZ` | 296 | 67 | 22.6% |
| `Matrix` | `QQ` | 286 | 67 | 23.4% |
| `Matrix` | `GF(7)` | 283 | 67 | 23.7% |
| `Vector` | `ZZ` | 95 | 8 | 8.4% |
| `Vector` | `QQ` | 95 | 8 | 8.4% |
| `Vector` | `GF(7)` | 96 | 8 | 8.3% |

These percentages are intentionally strict name comparisons of `dir()`.
Sage's category inheritance contributes many specialized methods, so this is
not a claim that only 23% of everyday matrix computation works. Sage.js
currently exposes 69 public `Matrix` names and 9 public `Vector` names; the
audit stores the exact sorted-surface hashes and operational witnesses so name
and behavior drift are separate facts.

## Execution-path inventory

`Matrix` storage and algorithms have four relevant tiers:

| Ring | Public storage | Typed structural kernels | Generated packed FLINT functions | Generated owned matrix resources |
|---|---|---:|---:|---:|
| `ZZ` | `IntegerBuffer` | 19 | 8 | 0 |
| `QQ` | normalized numerator/denominator `IntegerBuffer` pair | 25 | 7 | 0 |
| `GF(7)` | row-major `UInt64Buffer`; borrowed `DensePrimeMatrix` record in compiled calls | 22 | 9 | 0 |

The zero in the final column matters. Matrix calls do not pass an owned FLINT
resource through the public object. The generated declarations use
`packed_fmpz_matrix` and `packed_nmod_matrix` aggregate adapters to construct
lexical FLINT values around caller-owned buffers. In dynamic execution, those
generated wrappers cross the N-API host adapter. When the same wrapper is
compiled, the call is inside the host-isolated kernel core.

Legacy opaque N-API matrices remain useful differential oracles in the three
dense-migration tests. They are not a production representation or fallback:
asking a target-ring `Matrix` for `_native` raises, and the deterministic audit
ratchets that boundary.

Vectors are the conspicuous exception. Across all three rings they are
ordinary Python lists of scalar elements. Addition, subtraction, negation,
scalar multiplication, dot products, and row/column conversion are correct
dynamic Python loops. There is no packed vector kernel, generated FFI path, or
N-API state. That is acceptable for correctness, but it explains both the
small public surface and the different scaling profile.

Representative path groups are:

- Packed structural: construction, get/set, add/subtract, negate, scalar
  multiply, transpose, equality, zero/one tests, density, trace, stack,
  augment, row/column selection, and copy.
- Generated packed FLINT: multiplication, determinant, rank, and
  characteristic polynomial on all target rings; `ZZ` normal forms and
  kernel; `QQ` RREF/inverse/solve; and `GF(7)` RREF/kernel/minpoly/inverse/solve.
- Mixed public composition: `ZZ` RREF/inverse/solve through `QQ`, `QQ` kernel
  from RREF plus a typed basis constructor, and the optional typed `modp`
  rank/RREF path over small prime fields.
- Dynamic public composition: dimensions, row/column/list views, powers,
  pivots, row/column spaces, and exact minimal polynomials outside the prime
  field specialization.

## Performance snapshot

The following is the median of three warm samples on the audit host on
2026-08-12. It records the uncompiled production selection: structural
kernels ran their explicit dynamic fallback, generated FLINT declarations ran
through their generated host adapter, and vectors ran dynamic Python. Times
are milliseconds per operation and are evidence of scale, not portable
benchmark promises.

| Workload | `ZZ` | `QQ` | `GF(7)` |
|---|---:|---:|---:|
| Matrix construct, 80x80 (`GF(7)`: 100x100) | 1.22 | 5.08 | 0.52 |
| Matrix add, same sizes | 7.89 | 18.48 | 14.49 |
| Matrix multiply, 40x40 (`QQ`: 30, `GF(7)`: 60) | 1.02 | 1.18 | 0.27 |
| Matrix rank, same square sizes | 1.32 | 1.77 | 0.16 |
| Vector add, length 4000 (`QQ`: 3000) | 7.23 | 7.76 | 7.10 |
| Vector dot product, same lengths | 0.82 | 9.61 | 2.45 |

The checked ratchets are intentionally loose enough for Linux, Windows, and
macOS builders. Peak dense-matrix regressions remain governed by
`check-integer-matrix-budget.cjs`, `check-rational-matrix-budget.cjs`, and
`check-finite-matrix-budget.cjs`; this audit adds comparable API-level coverage
for all three rings and for vectors.

## Priority gaps

The first missing Matrix seams are not exotic algorithms. They are selection
and mutation (`submatrix`, combined row/column selection, swaps, setters,
deletion/insertion), inexpensive predicates (`is_diagonal`, `is_symmetric`,
`is_triangular`, `is_scalar`, `is_nilpotent`), and inspection helpers
(`nonzero_positions`, `nonpivots`). Standard decompositions (`LU`, `QR`,
`gram_schmidt`) follow. Minors, permanent, tensor products, and NumPy export
are useful but less foundational.

The first missing Vector seams are even clearer: `is_zero`, mutability,
support/nonzero positions, pairwise and outer products, norm/normalization,
and interchange. These should be implemented before a broad sweep through
the remaining inherited polynomial/category names.

## Write-disjoint follow-on lanes

The preparation lanes below are designed to run independently. Each owns a
new helper module and focused tests, and none edits `src/baselib/matrix.py`,
FFI declarations, package manifests, or shared registries. A short integration
lane wires reviewed helpers into the public classes after each batch. This
keeps the high-contention public module under one owner.

| Priority / lane | Exclusive implementation claim | Completed outcome | Oracle and performance witness | Dependency |
|---|---|---|---|---|
| P1.1 `linear-vector-contract` | `src/lib/sagejs/linear_algebra/vector_contract.py` | Ordinary CPython-parseable semantics for zero/support, mutability transitions, pairwise/outer products, norm, and normalization over all three rings | Sage 10.9 examples plus length-10k add/dot/norm benchmark | none |
| P1.2 `linear-matrix-selection` | `src/lib/sagejs/kernels/matrix/selection.py` | Source-transparent packed kernels for combined selection, submatrices, row/column swaps, setters, deletion, and insertion | differential Sage examples, negative indices, empty shapes, alias safety; 500x500 selection/edit benchmark | none |
| P1.3 `linear-matrix-predicates` | `src/lib/sagejs/kernels/matrix/predicates.py` | Source-transparent predicates and support/nonpivot scans with identical `ZZ`/`QQ`/`GF(p)` semantics | exhaustive small matrices and sparse/dense 1000x1000 witnesses | none |
| P1.4 `linear-decomposition-contract` | `src/lib/sagejs/linear_algebra/decompositions.py` | Dynamic reference contracts for `LU`, exact `QR`/Gram–Schmidt where defined, including shape and singular-case semantics | Sage tuple shapes and reconstruction identities; representative 40x40 benchmark | none |
| P2.1 `linear-combinatorial-invariants` | `src/lib/sagejs/linear_algebra/combinatorial.py` | Minors and permanent with explicit size policy and correct dynamic fallback | Sage exhaustive matrices through 5x5 and a stated exponential budget | P1.3 helpers only if reused |
| P2.2 `linear-interchange` | `src/lib/sagejs/linear_algebra/interchange.py` | Tensor/outer-product shape rules and host-neutral nested-list interchange; NumPy capability behavior specified separately | Sage shapes/dtypes and round trips on every target ring | P1.1 for vector outer product |
| Integration `linear-api-wiring` | `src/baselib/matrix.py` and dedicated public API tests | Expose one reviewed helper batch at a time, preserve the packed/N-API boundary, update this audit snapshot | `test/linear-algebra-api-audit.js`, relevant dense migration tests and budget gate | the corresponding preparation lane |

The decomposition lane should remain ordinary Python until its reference
semantics are stable. Mature library calls can then be declared through the
existing packed FFI model. No follow-on lane needs an owned matrix resource,
an opaque public handle, or a function-name-based native replacement.

## Ratchet policy

The deterministic test rejects:

- loss or unreviewed drift of the current Sage.js public-name snapshot;
- a lower Sage-name intersection;
- loss of typed kernels or generated packed declarations;
- accidental target-ring N-API public state;
- confusing packed aggregate declarations with generated owned resources;
- missing operational witnesses for any object/ring pair; or
- a performance file that omits one of the three path families for a ring.

Adding a public method is expected to update the exact snapshot, its Sage
oracle evidence, and at least one operational witness. Timing changes update a
budget only with a fresh measurement and an explanation; they do not redefine
the implementation path.
