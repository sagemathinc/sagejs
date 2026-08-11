# Dense exact-rational matrix migration

On Node, dense matrices over `QQ` canonically own a generated `FmpqMatrix`
resource. FLINT therefore owns each entry's variable-size numerator and
denominator, including highly skewed exact results for which no useful uniform
limb capacity is known in advance. The resource is declared in
`ffi/flint.ffi.py`; generated host adapters provide its unforgeable token,
deterministic `close()`, finalization fallback, and native-memory accounting.
No handwritten operation-specific N-API is part of this path.

This is intentionally a hybrid ownership boundary. Sage.js owns the
mathematical `Matrix` and its mutability, subdivisions, and cached results;
FLINT owns the dense exact storage. Copy, mutation, addition, subtraction,
negation, scalar multiplication, transpose, multiplication, rank, RREF,
inverse, solve, determinant, trace, equality, formatting, and serialization
operate directly on that resource. FLINT-to-FLINT operations neither
materialize host rationals nor copy through packed limb arrays.

The packed normalized `RationalBuffer` implementation remains the portable
fallback, differential oracle, and explicit interchange representation. It is
an aggregate of row-major tagged-integer numerator and denominator buffers;
every pair is coprime, every denominator is positive, and zero is uniquely
`0/1`. Crossing to this representation is an intentional conversion, not an
implicit step in ordinary Node operations.

Source-transparent code still participates at the resource boundary.
`src/lib/sagejs/kernels/matrix/dense_rational_flint.py` contains a compiled
typed-Python traversal that safely borrows an `FmpqMatrix` and counts nonzero
entries without an interpreter or per-entry host calls. The packed structural
kernels in `dense_rational.py` remain ordinary executable Python and compiler
input for the portable implementation. This split lets readable typed Python
express Sage.js policy while mature FLINT code retains responsibility for exact
variable-size storage and advanced algebra.

## Development-host evidence

On 2026-08-11, using Node 26.7.0, GCC, warm compiled artifacts, and the median
of five samples, the public performance ratchet reported:

| public operation | size | Sage.js |
|---|---:|---:|
| random construction | 1000 by 1000 | 55.52 ms |
| direct resource addition | 1000 by 1000 | 14.71 ms |
| flat rational-list construction | 300 by 300 | 90.79 ms |
| addition | 300 by 300 | 2.66 ms |
| subtraction | 300 by 300 | 2.66 ms |
| negation | 300 by 300 | 0.60 ms |
| scalar multiplication | 300 by 300 | 2.33 ms |
| transpose | 300 by 300 | 1.39 ms |
| equality | 300 by 300 | 0.52 ms |
| copy | 300 by 300 | 0.69 ms |
| trace | 300 by 300 | 0.17 ms |
| density through typed-Python borrow | 300 by 300 | 0.24 ms |
| native `.str()` | 50 by 50 | 6.31 ms |
| matrix multiplication | 80 by 80 | 0.95 ms |
| determinant | 60 by 60 | 1.45 ms |
| rank | 80 by 80 | 0.61 ms |
| RREF | 60 by 90 | 12.66 ms |
| inverse | 40 by 40 | 4.54 ms |
| solve | 40 by 40 with 8 columns | 1.99 ms |
| characteristic polynomial | 35 by 35 | 9.27 ms |
| right kernel | 30 by 45 | 29.30 ms |

These are development-host regression measurements, not cross-machine claims.
The gate normalizes against a direct FLINT rational
construction-and-multiplication witness to distinguish host load from a real
regression, while retaining a hard raw-time ceiling. Resource inputs are
constructed before each timed sample, and the gate separately times cold
unmaterialized resource operations so a hidden packed conversion cannot pass
as steady-state performance.

General flat-list construction still must coerce and inspect each existing
Sage rational in the host layer. Characteristic polynomial and right-kernel
construction also remain conversion-sensitive paths and are visible in the
budget rather than hidden by generous aggregate timing. Ordinary resource
arithmetic has no interpreted, uniform-capacity, or per-entry foreign-object
cliff.

## Correctness and isolation gates

`test/dense-rational-migration.cjs` compiles the typed resource traversal into
a fresh cache and exercises the complete public lifecycle with native execution
required and `SAGEJS_FORBID_QQ_MATRIX_NAPI=1`, which makes every legacy
rational-matrix constructor and packed exporter throw. The test
covers 190--320-bit values, normalization, mutation, immutability, structural
operations, multiplication, determinant, rank, RREF, inverse, solve,
characteristic polynomial, exact right kernels, bulk zero/identity/random
construction, and result construction.

The same test then disables native autoload and exercises the declared dynamic
adapter while the public legacy N-API properties remain forbidden. The public
`Matrix` owns only a generated opaque token: it cannot observe or manufacture
the underlying pointer. Native generated cores are also scanned for Node-API,
Python, JavaScript-engine, and host-callback symbols.

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

The shared FFI lifecycle gate invokes every rational resource helper for 500
allocate/compute/close cycles under AddressSanitizer, UndefinedBehaviorSanitizer,
and leak detection on supported Unix hosts. Separate tests verify idempotent
close, use-after-close rejection, garbage-collection finalization, and V8
external-memory accounting. This checks ownership independently of the public
matrix wrapper.
