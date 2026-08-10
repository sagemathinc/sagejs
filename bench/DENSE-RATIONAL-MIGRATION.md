# Dense exact-rational matrix migration

Dense matrices over `QQ` canonically own a normalized `RationalBuffer`, not a
FLINT or N-API matrix object. The buffer is an aggregate of parallel row-major
`IntegerBuffer` numerator and denominator components. Every pair is coprime,
every denominator is positive, and zero has the unique representation `0/1`.
Both components therefore retain the compiler's tagged signed-64-bit fast path
and promote only the overflowing value to GMP.

The public `RationalBuffer` fallback type documents that ownership boundary.
The matrix bootstrap layer uses the equivalent private aggregate while native
kernels currently receive its two explicit component spans. This is an ABI
detail rather than split ownership: a matrix owns both buffers, mutation
updates a normalized pair transactionally, and no raw pointer or foreign
object escapes into mathematical source.

Source-transparent structural algorithms live in
`src/lib/sagejs/kernels/dense_rational.py`. They include normalization,
cross-cancelled arithmetic, copying, indexing, mutation, elementwise
operations, scalar multiplication, transpose, selection, stacking,
augmentation, predicates, trace, and construction of a right-kernel spanning
set from RREF. The ordinary Python bodies are the executable fallback and the
actual compiler input.

Multiplication and mature exact linear algebra cross the declarations in
`src/lib/sagejs/kernels/dense_rational_flint.py`. Generated adapters construct
lexical `fmpq_mat` values from the packed pairs, preflight both result
components, copy back transactionally, and clear every temporary. FLINT never
becomes the public object's owner. This declared route currently covers
multiplication, rank, RREF, inverse, solve, determinant, and characteristic
polynomial. Exact matrix eigenvalues are then roots of that packed
characteristic polynomial; a short ordinary-Python routine preserves the
public ordering policy without restoring a matrix-specific C callback.

## Development-host evidence

On 2026-08-10, using Node 26.7.0, GCC, warm compiled artifacts, and the median
of five samples, the public performance ratchet reported:

| public operation | size | Sage.js |
|---|---:|---:|
| random construction | 500 by 500 | 8.83 ms |
| flat rational-list construction | 300 by 300 | 75.59 ms |
| addition | 300 by 300 | 3.95 ms |
| subtraction | 300 by 300 | 6.08 ms |
| negation | 300 by 300 | 1.61 ms |
| scalar multiplication | 300 by 300 | 5.21 ms |
| transpose | 300 by 300 | 2.32 ms |
| equality | 300 by 300 | 1.20 ms |
| copy | 300 by 300 | 1.67 ms |
| trace | 300 by 300 | 0.28 ms |
| density | 300 by 300 | 0.59 ms |
| matrix multiplication | 80 by 80 | 2.89 ms |
| determinant | 60 by 60 | 3.06 ms |
| rank | 80 by 80 | 1.05 ms |
| RREF | 60 by 90 | 31.66 ms |
| inverse | 40 by 40 | 6.31 ms |
| solve | 40 by 40 with 8 columns | 1.85 ms |
| characteristic polynomial | 35 by 35 | 2.74 ms |
| right kernel | 30 by 45 | 16.53 ms |

These are development-host regression measurements, not cross-machine claims.
The gate normalizes against a direct FLINT rational
construction-and-multiplication witness to distinguish host load from a real
regression, while retaining a hard raw-time ceiling. It also requires every
structural and declared-FLINT function to resolve to an isolated artifact.

The measurements identify the remaining local bottleneck clearly. General
flat-list construction must coerce and inspect each existing Sage rational in
the host layer and is much slower than integral random construction. The
matrix algorithms themselves have no interpreted or per-entry foreign-object
cliff. Future compiler-owned rational aggregate arguments can move more of
that bulk ingress behind the same checked boundary without changing the
mathematical representation.

## Correctness and isolation gates

`test/dense-rational-migration.cjs` compiles the structural and declared-FLINT
kernels into a fresh cache. It exercises the complete public lifecycle with
native execution required and `SAGEJS_FORBID_QQ_MATRIX_NAPI=1`, which makes
every legacy rational-matrix constructor and packed exporter throw. The test
covers 190--320-bit values, normalization, mutation, immutability, structural
operations, multiplication, determinant, rank, RREF, inverse, solve,
characteristic polynomial, exact right kernels, bulk zero/identity/random
construction, and result construction.

The same test then disables native autoload and exercises the declared dynamic
adapter while the public legacy N-API properties remain forbidden. The adapter
may create a lexical FLINT matrix internally, but the mathematical `Matrix`
object never obtains that handle. Native generated cores are also scanned for
Node-API, Python, JavaScript-engine, and host-callback symbols.

Run the focused gates with:

```sh
node test/dense-rational-migration.cjs
pnpm test:matrix:rational-performance
SAGEJS_NATIVE_REQUIRED=1 SAGEJS_FORBID_QQ_MATRIX_NAPI=1 ./bin/sagejs test/matrix.py
pnpm architecture:check
```

Set `SAGEJS_NATIVE_TRACE=1` in a Sage.js session to see
`typed-python-isolated` or `declared-flint-isolated` at each selected public
operation. A missing compiled artifact is labeled explicitly and is rejected
when native execution is required.

The shared FFI lifecycle gate also invokes every rational helper for 500
allocate/convert/compute/copy-back/clear cycles under AddressSanitizer,
UndefinedBehaviorSanitizer, and leak detection on supported Unix hosts. This
checks the lexical FLINT ownership protocol independently of the Node adapter.
