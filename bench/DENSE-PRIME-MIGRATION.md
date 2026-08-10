# Dense prime-field migration benchmark

This benchmark compares two isolated kernel implementations that consume the
same caller-owned row-major `UInt64Buffer`:

- the actual typed-Python bodies in
  `src/lib/sagejs/kernels/matrix/dense_prime_field.py`; and
- generated FFI calls to mature FLINT in
  `src/lib/sagejs/kernels/matrix/dense_prime_field_flint.py`.

The declared-FLINT timing includes reconstructing transient FLINT matrices from
packed storage. The legacy N-API timing starts with an already constructed
opaque FLINT matrix. Consequently the table measures the implementation
crossover after the public matrix already owns canonical packed storage. That
is now the production representation for dense matrices over prime fields of
characteristic at most 32 bits.

## Dedicated-host result

Measured on `bench-1`, a dedicated 16-vCPU AMD EPYC 7B13 VM with 64 GiB RAM,
Node 26.7.0, GCC 13.3.0, modulus 65521, two warmups, and the median of 11
samples. Times below include caller-owned output/workspace allocation for both
packed implementations.

| n | rank Python/FFI | RREF Python/FFI | right kernel Python/FFI | solve Python/FFI |
|---:|---:|---:|---:|---:|
| 1 | 1.50/1.00 us | 1.50/1.70 us | 1.60/1.80 us | 2.10/1.90 us |
| 2 | 1.20/0.80 us | 1.20/1.30 us | 1.40/1.70 us | 1.80/1.80 us |
| 4 | 1.60/0.90 us | 1.70/1.70 us | 2.00/2.50 us | 2.50/2.80 us |
| 8 | 2.30/1.40 us | 2.80/2.60 us | 3.70/4.00 us | 3.20/3.70 us |
| 16 | 7.50/4.00 us | 9.20/6.40 us | 10.70/18.70 us | 8.10/7.80 us |
| 32 | 26.0/17.0 us | 26.0/19.9 us | 48.6/39.4 us | 40.4/21.5 us |
| 64 | 137/77 us | 137/107 us | 336/196 us | 217/94 us |
| 128 | 0.663/0.441 ms | 0.659/0.524 ms | 2.390/1.050 ms | 1.595/0.503 ms |
| 256 | 4.017/2.985 ms | 4.394/3.378 ms | 18.457/7.013 ms | 12.161/3.157 ms |

Within an already-packed kernel pipeline, the measured crossover is:

- rank uses declared FLINT whenever that isolated artifact is available;
- RREF uses typed Python through size 4;
- right kernel uses typed Python through size 16; and
- solve uses typed Python through size 8.

These thresholds are kernel tuning evidence. Production currently chooses the
declared-FLINT isolated route by default because it is the robust winner beyond
very small matrices; typed Python remains available explicitly and supplies an
independent same-ABI oracle.

## End-to-end migration

On 2026-08-10, a public `random_matrix(GF(97), 200).rref()` exposed that the
then-current `Matrix` canonically owned a native FLINT object. Automatic
dispatch had to export and decode 40,000 residues in the dynamic host before
entering the packed kernel. On the development host, labeled fresh-process
measurements were approximately 189 ms for typed Python, 271 ms for declared
FLINT through the packed ABI, and 2 ms for the existing FLINT operation after
module warmup. An absent artifact was worse: it silently interpreted the cubic
Python body and took about 1.9 seconds. That was a representation failure, not
evidence against the generated kernel.

The public small-prime matrix now owns a `BigUint64Array` from construction
onward. Entry mutation changes that buffer directly and invalidates cached
mathematical results. RREF enters the declared FFI with the canonical buffer
and constructs its immutable packed result without creating a persistent
N-API object. A typed-Python bulk random filler writes that same final storage
without 250,000 dynamic calls.

The completed surface also routes arithmetic, scalar multiplication,
transpose, equality, zero/identity tests, density, trace, stack, augment, row
and column selection through source-transparent typed Python. Multiplication,
rank, RREF, right kernel, solve, inverse, determinant, characteristic
polynomial, and minimal polynomial enter FLINT only through declarations over
the same packed ABI. A hard integration run sets both
`SAGEJS_NATIVE_REQUIRED=1` and `SAGEJS_FORBID_MATRIX_NAPI=1` and exercises this
entire lifecycle.

On the development host, after one warmup and using the median of nine fresh
matrices, the public benchmark measured:

| operation | 200 by 200 | 500 by 500 |
|---|---:|---:|
| `random_matrix(GF(97), n)` | 0.28 ms | 0.78 ms |
| `.rref()` on a fresh random matrix | 4.81 ms | 19.00 ms |

The pre-migration 200-by-200 RREF took about 1.9 seconds, so the meaningful
result is the disappearance of the dynamic representation cliff. The host's
reported SageMath/FLINT 200-by-200 RREF was about 0.8 ms; Sage.js is therefore
still roughly six times slower in this particular public comparison, leaving
useful adapter and packing optimization work rather than concealing it. The
reported SageMath 500-by-500 random construction was 14.3 ms, but PRNG and
random-element policies differ, so that construction ratio is not a general
linear-algebra claim. Fresh-process startup is measured separately. Precise
ratios require dedicated-host repetitions, so these development-host numbers
are evidence and regression targets rather than cross-machine constants.

`SAGEJS_NATIVE_TRACE=1` must report `declared-flint-isolated` for a compiled
foreign route and `typed-python-isolated` for a compiled source route. With
native autoload deliberately disabled it reports an explicit dynamic fallback
or declared adapter; it never silently interprets a cubic typed-Python
algorithm as the default.

The pre-existing `random_matrix(GF(7),300)^2` performance ratchet also covers
the next packed result boundary. Before multiplication migrated, it lazily
materialized two N-API oracle objects and measured 147 ms raw (94 ms normalized)
on the development host. Declared `nmod_mat_mul` now consumes both canonical
buffers and writes a canonical result. The gate now builds both artifacts into
a fresh cache, requires both isolated implementations, warms them, and reports
min/median/max separately for the mathematical expression and the complete
session request. One noisy development-host run measured the expression at
3.2/4.4/31.4 ms, the complete request at 5.6/9.0/37.6 ms, and the direct
FLINT/N-API reference at 1.4/1.5/1.7 ms. Thus a REPL report near 3 ms is real,
but one such sample is not a stable estimate. The unchanged regression limit
is the normalized median of seven warm expression samples, with an independent
catastrophic raw ceiling.

The ratchet now additionally times 31 public operations independently. On the
development host after warmup, construction of a 500-by-500 matrix from flat
integer residues fell from 108 ms to about 1.0 ms by packing primitive exact
integers directly while preserving the ordinary Sage coercion fallback.
Right-kernel result construction fell from about 10--12 ms to 3.2 ms by
copying the significant packed prefix without a Python list. Representative
medians were 0.2--1.7 ms for structural operations, 1.5 ms for a 200-by-200
determinant, 1.8 ms for 200-by-200 RREF, 3.2 ms for a 150-by-200 right kernel,
and 3--6 ms for polynomial and 300-by-300 multiplication workloads. The
checked normalized budgets are operation-specific: 5--15 ms for the primary
surface and 25--45 ms for the larger asymptotic witnesses. A separate raw
ceiling catches catastrophic fallback behavior under load. In a five-sample
larger-size check, 500-by-500 rank, determinant, and RREF were about 18--20 ms,
500-by-500 multiplication over `GF(7)` was 5.8 ms, and a 300-by-400 right
kernel was 20.9 ms.

Run the standard comparison with:

```sh
pnpm bench:native:dense-prime
```

Run the host-independent public storage path directly with:

```sh
./bin/sagejs bench/packed-dense-prime-public.sage
```

Run the complete public operation matrix with:

```sh
./bin/sagejs bench/dense-prime-v2.sage
pnpm test:matrix:performance
```

Override `SAGEJS_DENSE_PRIME_SIZES`, `SAGEJS_DENSE_PRIME_SAMPLES`, and
`SAGEJS_DENSE_PRIME_MODULUS` for larger or cross-platform measurements. Add
`--json` for the full core/production/FFI/legacy-N-API result.
