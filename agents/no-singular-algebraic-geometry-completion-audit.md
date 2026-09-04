# No-Singular algebraic geometry completion audit

- Status: complete and review-ready
- Date: 2026-09-04
- Branch: `agent/no-singular-algebraic-geometry`
- Qualified integration candidate: `1d1319786ae673ad6a02d2209ff2bbf37d8aaf0d`
- Algebraic-geometry runtime freeze: `51cd06edd4cef224efe502f633f2d19c0777cbd2`
- Four-platform runtime candidate: `b656c2cb91e072a26a408c7b68b77d61fc5e163f`
- Integrated `origin/main`: `83111cf0509994fb31a3509b6141e90f0bfbbe67`
- Governing plan: [no-singular-algebraic-geometry-plan.md](no-singular-algebraic-geometry-plan.md)
- Deferred coefficient work: [no-singular-extension-fields-plan.md](no-singular-extension-fields-plan.md)

## Decision

The easy, small, and moderate portions of the no-Singular roadmap are
implemented. The result is an exact portable algebraic-geometry layer over
`QQ` and prime `GF(p)`, with common affine, projective, morphism, Jacobian,
plane-curve, Hilbert, and zero-dimensional decomposition operations. Singular,
CoCoA, Macaulay2, Oscar, and Julia were used only as design references and
independent oracles; none is an algebraic-geometry build or runtime dependency.

The public geometry layer is coefficient-domain neutral. It operates through
polynomial, ideal, quotient, and exact-field interfaces and contains no
FLINT/msolve handles or concrete `QQ`/prime-field routing. Backend selection,
proof state, exact field identity, monomial order, and resource policy remain
below that layer and are represented in descriptors and cache keys. This is the
boundary required by the separate `GF(p^d)` and number-field program.

## Delivered phases

| Phase | Delivered boundary |
| --- | --- |
| 0 | Machine-readable capability and provenance contracts, independent oracle fixtures, architecture enforcement, and explicit extension-field deferral |
| 1 | Exact substitution, evaluation, derivatives, homogenization/dehomogenization, and canonical quotient rings with quotient bases and linear-algebra tools |
| 2 | Exact ideal sum, containment, membership, elimination, intersection, colon, and saturation with resource envelopes |
| 3 | Hilbert numerator/series/polynomial, h-vector, Krull dimension, codimension, multiplicity, and projective degree in the documented graded scope |
| 4 | Sage-compatible affine spaces, hashable points, closed subschemes, coordinate rings, unions/intersections, containment, and bounded prime-field points |
| 5 | Projective spaces, normalized points, homogeneous subschemes, saturated `Proj` equality, affine patches, and saturated projective closure |
| 6 | Affine/projective polynomial morphisms, evaluation, composition, graphs, fibers, inverse images, and supported scheme-theoretic image closures |
| 7 | Jacobian matrices, tangent spaces, point smoothness, and singular subschemes for hypersurfaces and certified complete intersections |
| 8 | Affine/projective plane curves, degree, closure/patches, tangents, singular computations, bounded points, and arithmetic genus |
| 9 | Exact zero-dimensional radical, associated primes, and primary decomposition over `QQ` and prime fields, with deterministic ordering and recomposition checks |
| 10 | User guide, API/reference integration, browser example, readable capability errors, npm/browser/Wasm smoke, architecture checks, benchmark receipt, and four-platform qualification |

## Validation evidence

### Final integrated candidate

| Check | Result |
| --- | --- |
| Eight-stage root build | Passed at `1d1319786` in 8m54s; five native adapters current and 41 production kernel families published |
| Focused algebraic geometry | Complete nine-file Python fixture harness passed in 28.1s; the polynomial regression fixture also passed during qualification |
| Strict Python | 376 modules; CPython parse, Ruff 0.16.0, and Pyright all passed with zero errors or warnings |
| Generated documentation | Exact generated-reference consistency passed; the full verifier recorded 223 passes, 2 expected failures, 4 skips, and 0 failures, plus 66/66 long examples |
| Main-merge regressions | 36/36 tests passed for cubic-frontier portability, resident HNF, hardlink-safe numerical-product handoff, and startup budgets |
| Architecture | Passed: 4 FFI declarations, 463 compiled functions, 1,315 native boundaries, 1,080 reviewed Wasm capabilities, and 307 production-closure entries |
| Unit | 126/126 files passed in 1m27s |
| Portable | 114/114 addon-free files passed after correcting the AG aggregate's tier metadata; the aggregate remains in unit/full integration and platform/browser qualification |
| Full integration | 366/366 files passed in 42m28s at `fee8f7865`; subsequent changes were generated receipts, a cold-only timing calibration, and reviewed release-infrastructure updates from `main` |

### WebAssembly and browser

The canonical Linux x64 production Wasm build published 287 kernels with zero
unsupported kernels and aggregate SHA-256
`d0f85796a38a7e7c673f8122f02b74b89ac8fc44deb9da75f73d7aa9d2d5fcdb`.
All 15 reviewed ABI modules verified. Node-Wasm ran 203 tests: 201 passed, two
expected missing-browser-engine checks skipped, and none failed. A Chromium Web
Worker smoke passed mathematics, plotting, the no-Singular algebraic-geometry
tour, msolve Gröbner bases, `prime_pi`, partitions, numerical functions, and
live examples.

The two skips are the explicitly unavailable Firefox and WebKit engines on the
Linux qualification host; the Chromium browser path ran. A noncanonical
supported-Node gzip-verifier defect remains tracked as
[issue #108](https://github.com/sagemathinc/sagejs/issues/108). It does not
change the canonical production artifact or its ABI, but it is not disguised as
a passing alternate-host Wasm qualification.

### Persistent platform qualification

The algebraic-geometry runtime candidate was checked in isolated worktrees on
all four supported platforms. Each host prepared platform-native dependencies,
ran the root build, the focused algebraic-geometry and polynomial fixtures, the
algebraic-geometry architecture checker, and strict Python.

| Platform | Environment | Root build | Result |
| --- | --- | ---: | --- |
| Linux x64 | Ubuntu, Node v26.8.1 | 12m04s | Passed |
| Linux ARM64 | Ubuntu, Node v26.5.1 | 19m25s | Passed |
| macOS ARM64 | macOS 26.4, official Node v26.8.1 | 23m33s | Passed |
| Windows x64 | Windows Server 2022, Node v26.5.1 | 25m06s | Passed |

The final integrated candidate only adds evidence/test calibration and reviewed
0.8 release-infrastructure changes after that runtime candidate; it does not
alter the qualified algebraic-geometry implementation. Linux x64 was rebuilt
and reran the focused, strict, architecture, unit, portable, and product gates
at the final integrated candidate.

The macOS native aggregate at the evidence tip additionally passed 81 tests
(79 passes and two declared skips), lifecycle/resource accounting, canonical production
autoload and FFI checks, sanitizers, exact msolve finite-field/rational Gröbner
bases, and all finite-field/integer/rational/polynomial performance budgets.

## Product and dependency audit

A fresh Linux x64 product build at `1d1319786` created and installed the root
and platform npm tarballs, then exercised CommonJS and ESM embedding,
`AffineSpace`, version reporting, integer factorization, lazy numerical
resources, and relocated `sagejs`/`sagepython` executables.

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| Root npm tarball | 58,225,540 bytes | `8df8d80f1c8435e8550b6bf9df70c55f47f8fa89c8bf6d804e7634e5204e853a` |
| Linux x64 platform tarball | 179,475,371 bytes | `ef02d2b421a66816432870b3782da2c9d09e37f0a8878cb2b52a63c1e91a4340` |
| `sagejs` SEA executable | — | `d2986f6f1783d10a6a401fcc35f354a6fd64eb430576ee8f745aa7ab8c48a984` |
| `sagepython` SEA executable | — | `6729663e8609cd31b74bf1280ad7097398a68d2d6d3fd914da6700e7757a06a1` |

Tarball-name and dynamic-link audits found no Singular, libSingular, CoCoA,
Oscar, Julia, or Macaulay2 executable or library. The root source package does
include pre-existing foreign-language frontend/parser assets and an unrelated
Julia worker source file; these are not an algebraic-geometry computational
runtime. Linux SEA dependencies are the expected system C/C++/atomic/thread/
dynamic-loader libraries. The package graph is valid and acyclic.

## Performance receipt

The tracked receipt is
[`bench/algebraic-geometry-baseline.json`](../bench/algebraic-geometry-baseline.json).
It records three isolated warm samples after one warmup on Linux x64, Node
v26.8.1, AMD EPYC 7B13. Peak RSS includes the complete Sage.js child runtime.

| Workload | Median | Peak RSS | Stable result |
| --- | ---: | ---: | --- |
| Ideal intersection and saturation | 368.384 ms | 281.2 MiB | `(2, 1, 2, 2)` |
| Sparse Hilbert series/data | 69.982 ms | 217.4 MiB | `((1, 4, 8, 10, 8, 4, 1), 1, 36)` |
| Projective closure and image | 736.949 ms | 305.9 MiB | `(1, 3, 1)` |
| Plane-curve Jacobian geometry | 50.663 ms | 234.5 MiB | `(0, 2, 2)` |
| Zero-dimensional decomposition | 1,913.802 ms | 382.1 MiB | `(2, 4, 2)` |

These are evidence baselines, not unstable microbenchmark gates.

## Qualification incidents

Qualification found and corrected three integration defects rather than
waiving them:

- a stale deterministic plotting-source receipt after merging current `main`;
- a Linux x64 cold-start matrix threshold that did not account for measured
  host contention while all steady arithmetic budgets remained green; and
- a stale local NLopt Wasm artifact after an earlier merge, corrected by a
  canonical production Wasm rebuild and complete Node/browser rerun.

Concurrent builds had also invalidated one early `dist` receipt. All final
public gates were consequently run sequentially against explicit commits.

## Honest limitations

This milestone deliberately rejects rather than guesses:

- `GF(p^d)` for `d > 1` and number-field base fields; they belong to the
  separate extension-field plan;
- `AffineSpace(K, 0)`, until Sage.js has a genuine zero-variable polynomial
  parent (`ProjectiveSpace(K, 0)` is supported);
- positive-dimensional radical, primary, irreducible, or equidimensional
  decomposition;
- mixed-dimensional global singular loci without certified component data;
- rational maps with base loci, local rings/orders, local multiplicities,
  blowups, and gluing;
- modules, syzygies, resolutions, Betti tables, and coherent sheaves; and
- normalization, general curve function fields, divisors, Riemann--Roch,
  general Jacobians, and geometric genus of singular curves.

Auxiliary variables, generator counts, saturation iterations, Jacobian
minors, graph size, quotient dimension, and separator search have explicit
resource envelopes. Exceeding an envelope raises an operation-specific
`OverflowError`; unsupported mathematics raises a concise
`NotImplementedError`, never a backend stack trace or partial result.
