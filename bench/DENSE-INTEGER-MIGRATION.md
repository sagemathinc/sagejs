# Dense exact-integer matrix migration

Dense matrices over `ZZ` canonically own a row-major `IntegerBuffer`, not a
FLINT or N-API matrix object. Each entry has a signed limb count and a fixed
capacity slice of 64-bit magnitude limbs. Small entries stay on the compiler's
tagged signed-64-bit path; an overflowing value promotes exactly to GMP at the
current operation. Capacity growth is transactional: a kernel either writes a
complete result or raises before changing the caller-owned output, after which
the public matrix layer retries with a larger buffer.

The source-transparent structural algorithms are in
`src/lib/sagejs/kernels/dense_integer.py`. Multiplication and mature exact
linear-algebra algorithms cross the declarations in
`src/lib/sagejs/kernels/dense_integer_flint.py`. Generated adapters construct
lexical FLINT matrices from packed input, preflight output capacity, copy the
result, and clear every temporary. FLINT never becomes the public object's
owner.

## Development-host evidence

On 2026-08-10, using Node 26.7.0, GCC, warm compiled artifacts, and the median
of five samples, the public performance ratchet reported:

| public operation | size | Sage.js |
|---|---:|---:|
| random construction | 500 by 500 | 6.59 ms |
| flat-list construction | 500 by 500 | 40.04 ms |
| addition | 500 by 500 | 4.32 ms |
| subtraction | 500 by 500 | 4.09 ms |
| negation | 500 by 500 | 3.89 ms |
| scalar multiplication | 500 by 500 | 4.09 ms |
| transpose | 500 by 500 | 2.42 ms |
| equality | 500 by 500 | 1.93 ms |
| copy | 500 by 500 | 1.97 ms |
| trace | 500 by 500 | 0.18 ms |
| density | 500 by 500 | 1.43 ms |
| matrix multiplication | 150 by 150 | 2.29 ms |
| determinant | 150 by 150 | 11.07 ms |
| rank | 150 by 150 | 2.25 ms |
| characteristic polynomial | 60 by 60 | 4.87 ms |
| Hermite form | 35 by 35 | 1.30 ms |
| Smith form | 25 by 25 | 1.34 ms |
| right kernel | 40 by 60 | 27.83 ms |

These are development-host regression measurements, not cross-machine claims.
The gate normalizes against a direct FLINT construction-and-multiplication
witness to distinguish a real regression from host load, while retaining a
separate hard raw-time ceiling. It also requires every structural and declared
FLINT function to resolve to an isolated compiled artifact.

A same-machine SageMath/FLINT spot comparison found broadly similar absolute
times for construction and the mature asymptotic algorithms. Sage.js was
slower by several milliseconds for some elementwise operations and faster in
that run for characteristic polynomial, Smith form, and density. This is the
right remaining optimization profile: there is no interpreted or
object-conversion cliff, and compiler improvements can benefit every readable
typed-Python loop at once.

## Correctness and isolation gates

`test/dense-integer-migration.cjs` compiles both kernel modules into a fresh
cache and runs the complete public lifecycle with
`SAGEJS_NATIVE_REQUIRED=1` and `SAGEJS_FORBID_ZZ_MATRIX_NAPI=1`. It checks
190--320-bit entries, overflow growth, mutation and immutability, structural
operations, multiplication, determinant, rank, characteristic polynomial,
Hermite and Smith transforms, and exact kernels. The same test forces the
dynamic fallback/declared-adapter route while the legacy integer-matrix N-API
properties remain forbidden.

The general native-kernel test compiles `kernel_core.c` as a standalone C
program and, when the local toolchain is present, as WebAssembly. It passes a
190-bit `Integer` through the public ABI and checks the exact result. This is a
direct regression for host isolation and for safe tagged/GMP conversion; the
Node adapter cannot mask a failure there.

Run the focused gates with:

```sh
node test/dense-integer-migration.cjs
pnpm test:matrix:integer-performance
pnpm test:matrix:corpus
pnpm architecture:check
```

Set `SAGEJS_NATIVE_TRACE=1` in a Sage.js session to see
`typed-python-isolated` or `declared-flint-isolated` at each selected public
operation. A missing compiled artifact is labeled explicitly; it is never
reported as native performance.
