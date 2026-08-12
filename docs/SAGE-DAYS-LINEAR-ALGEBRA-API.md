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
coverage suggests. Public `ZZ` and `QQ` matrices now own generated safe FLINT
resources, while `GF(7)` matrices own packed, host-independent residue storage.
The generated resource API covers both structural operations and mature exact
algorithms; prime-field structural operations use source-transparent typed
Python and mature algorithms use packed declarations. The most valuable P1
work is therefore filling ordinary Sage API seams, especially for vectors,
indexing/mutation, and predicates—not replacing the working exact arithmetic.

The public-name snapshot against SageMath 10.9.post1 is:

| Object | Ring | Sage names | Common names | Name coverage |
|---|---:|---:|---:|---:|
| `Matrix` | `ZZ` | 296 | 67 | 22.6% |
| `Matrix` | `QQ` | 286 | 67 | 23.4% |
| `Matrix` | `GF(7)` | 283 | 67 | 23.7% |
| `Vector` | `ZZ` | 95 | 11 | 11.6% |
| `Vector` | `QQ` | 95 | 11 | 11.6% |
| `Vector` | `GF(7)` | 96 | 11 | 11.5% |

These percentages are intentionally strict name comparisons of `dir()`.
Sage's category inheritance contributes many specialized methods, so this is
not a claim that only 23% of everyday matrix computation works. Sage.js
currently exposes 69 public `Matrix` names and 12 public `Vector` names; the
audit stores the exact sorted-surface hashes and operational witnesses so name
and behavior drift are separate facts.

## Execution-path inventory

`Matrix` storage and algorithms have five relevant tiers:

| Ring | Canonical public storage | Typed kernels | Generated resource functions | Packed aggregate functions | Owned matrix resources |
|---|---|---:|---:|---:|---:|
| `ZZ` | generated `FmpzMatrix` resource | 19 | 40 | 8 | 1 |
| `QQ` | generated `FmpqMatrix` resource | 25 | 38 | 7 | 1 |
| `GF(7)` | row-major `UInt64Buffer`; borrowed `DensePrimeMatrix` record in compiled calls | 27 | 0 | 9 | 0 |

The two resources are canonical public state, but they are safe generated
wrappers rather than raw N-API handles. The wrapper owns cleanup and exposes
the same resource ABI to dynamic, native-compiled, and WebAssembly targets.
Dynamic execution crosses its generated N-API host adapter; native and browser
compilation use the generated resource lowering. Compatibility
`IntegerBuffer` and numerator/denominator buffers are materialized lazily only
at explicitly audited packed boundaries.

The older `fmpz_mat_*` and `fmpq_mat_*` packed aggregate declarations remain
for isolated compatibility paths. The `nmod_mat_*` group is still the mature
library path for `GF(7)`, whose public object has no owned FLINT resource.

Legacy opaque N-API matrices remain useful differential oracles in the three
dense-migration tests. They are not a production representation or fallback:
asking a target-ring `Matrix` for `_native` raises, and the deterministic audit
separately ratchets the safe generated-resource state and raw-handle boundary.

Vectors are the conspicuous exception. Across all three rings they are
ordinary Python lists of scalar elements. Addition, subtraction, negation,
scalar multiplication, dot products, and row/column conversion are correct
dynamic Python loops. There is no packed vector kernel, generated FFI path, or
N-API state. That is acceptable for correctness, but it explains both the
small public surface and the different scaling profile.

Representative path groups are:

- Generated owned resource: `ZZ` and `QQ` construction, get/set,
  add/subtract, negate, scalar multiply, transpose, multiplication, equality,
  zero/one tests, density, trace, rank, determinant, row/column selection,
  stack, augment, characteristic/minimal polynomials, and the ring-specific
  normal-form, kernel, RREF, inverse, and solve algorithms.
- Packed structural: `GF(7)` construction, get/set, add/subtract, negate,
  scalar multiply, transpose, equality, zero/one tests, density, trace, stack,
  augment, row/column selection, and copy.
- Generated packed library calls: `GF(7)` multiplication, determinant, rank,
  RREF, kernel, characteristic/minimal polynomials, inverse, and solve; the
  exact packed groups are retained compatibility routes rather than canonical
  public storage.
- Mixed public composition: `ZZ` RREF/inverse/solve through the `QQ` resource,
  plus optional FFLAS and typed `modp` paths over small prime fields.
- Dynamic public composition: dimensions, row/column/list views, powers,
  pivots, row/column spaces, and exact minimal polynomials outside the prime
  field specialization.

## Performance snapshot

The following is the median of five warm samples on the audit host on
2026-08-12. It records the uncompiled production selection: exact matrices ran
through generated resource host adapters, prime structural kernels ran their
explicit dynamic fallback, prime packed declarations ran through their
generated host adapter, and vectors ran dynamic Python. Times are milliseconds
per operation and are evidence of scale, not portable benchmark promises.

| Workload | `ZZ` | `QQ` | `GF(7)` |
|---|---:|---:|---:|
| Matrix construct, 80x80 (`GF(7)`: 100x100) | 0.43 | 2.43 | 0.36 |
| Matrix add, same sizes | 0.19 | 0.33 | 0.19 |
| Matrix multiply, 40x40 (`QQ`: 30, `GF(7)`: 60) | 0.25 | 0.34 | 0.25 |
| Matrix rank, same square sizes | 0.36 | 0.24 | 0.32 |
| Vector add, length 4000 (`QQ`: 3000) | 17.69 | 20.17 | 17.52 |
| Vector dot product, same lengths | 2.69 | 28.18 | 6.09 |

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

The first missing Vector seams are even clearer: `is_zero`, support/nonzero
positions, pairwise and outer products, norm/normalization, and interchange.
Basic mutability inspection and `set_immutable` are already present. These
remaining seams should be implemented before a broad sweep through the
remaining inherited polynomial/category names.

## Write-disjoint follow-on lanes

The preparation lanes below are designed to run independently. Each owns a
new helper module and focused tests, and none edits `src/baselib/matrix.py`,
FFI declarations, package manifests, or shared registries. A short integration
lane wires reviewed helpers into the public classes after each batch. This
keeps the high-contention public module under one owner.

| Priority / lane | Exclusive implementation claim | Completed outcome | Oracle and performance witness | Dependency |
|---|---|---|---|---|
| P1.1 `linear-vector-contract` | `src/lib/sagejs/linear_algebra/vector_contract.py` | Ordinary CPython-parseable semantics for zero/support, pairwise/outer products, norm, and normalization over all three rings, preserving the existing mutability contract | Sage 10.9 examples plus length-10k add/dot/norm benchmark | none |
| P1.2 `linear-matrix-selection` | `src/lib/sagejs/linear_algebra/matrix_selection.py` | Storage-neutral selection and mutation contracts; integration reuses generated exact-resource selection/block operations and adds source-transparent packed prime kernels only where needed | differential Sage examples, negative indices, empty shapes, alias safety; 500x500 selection/edit benchmark | none |
| P1.3 `linear-matrix-predicates` | `src/lib/sagejs/kernels/matrix/predicates.py` | Source-transparent predicates and support/nonpivot scans with identical `ZZ`/`QQ`/`GF(p)` semantics | exhaustive small matrices and sparse/dense 1000x1000 witnesses | none |
| P1.4 `linear-decomposition-contract` | `src/lib/sagejs/linear_algebra/decompositions.py` | Dynamic reference contracts for `LU`, exact `QR`/Gram–Schmidt where defined, including shape and singular-case semantics | Sage tuple shapes and reconstruction identities; representative 40x40 benchmark | none |
| P2.1 `linear-combinatorial-invariants` | `src/lib/sagejs/linear_algebra/combinatorial.py` | Minors and permanent with explicit size policy and correct dynamic fallback | Sage exhaustive matrices through 5x5 and a stated exponential budget | P1.3 helpers only if reused |
| P2.2 `linear-interchange` | `src/lib/sagejs/linear_algebra/interchange.py` | Tensor/outer-product shape rules and host-neutral nested-list interchange; NumPy capability behavior specified separately | Sage shapes/dtypes and round trips on every target ring | P1.1 for vector outer product |
| Integration `linear-api-wiring` | `src/baselib/matrix.py` and dedicated public API tests | Expose one reviewed helper batch at a time, preserve the packed/N-API boundary, update this audit snapshot | `test/linear-algebra-api-audit.js`, relevant dense migration tests and budget gate | the corresponding preparation lane |

The decomposition lane should remain ordinary Python until its reference
semantics are stable. Mature exact-library calls should extend the existing
generated resources; prime-field calls can use the packed declaration model.
No follow-on lane needs another owned matrix resource, an opaque public handle,
or a function-name-based native replacement.

## Ratchet policy

The deterministic test rejects:

- loss or unreviewed drift of the current Sage.js public-name snapshot;
- a lower Sage-name intersection;
- loss of typed kernels, generated resource operations, or packed declarations;
- accidental target-ring N-API public state;
- loss of either canonical exact-matrix resource, or confusing its safe wrapper
  with an exposed raw N-API handle;
- missing operational witnesses for any object/ring pair; or
- a performance file that omits the applicable path families for a ring.

Adding a public method is expected to update the exact snapshot, its Sage
oracle evidence, and at least one operational witness. Timing changes update a
budget only with a fresh measurement and an explanation; they do not redefine
the implementation path.
