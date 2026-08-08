# Native Kernel v9: dense prime-field linear algebra

Native Kernel v9 compiles a small ordinary Python/Sage interface to a reusable
dense decomposition over word-size prime fields:

```python
@native
def prime_field_factor(
    source: PrimeFieldMatrix,
) -> PrimeFieldDecomposition:
    return _prime_field_factor_fallback(source)
```

The resulting immutable object supports `rank()`, `determinant()`,
`echelon()`, and any number of `solve(right)` calls. The four v8 one-shot
functions remain available and use the same decomposition engine. With no
matching native artifact, the source remains normal CPython-parseable Sage
code and returns a readable Python fallback object.

## Algorithm and representation

The native value owns a private packed row-pivoted factorization, its row
permutation, pivot columns, rank, swap parity, modulus metadata, and arithmetic
policy. It is a snapshot: later mutation of the source matrix cannot invalidate
it. Inputs are borrowed through the shared `nmod_mat` ABI and results return
through that ABI without copying through JavaScript.

Two exact factorization paths share this representation:

- general rectangular or rank-deficient matrices use classical row-pivoted
  elimination;
- dense nonsingular square matrices use panel factorization, delayed trailing
  updates, and cache-sized column tiles.

The narrow-prime block kernel packs each `U` panel by columns. It then computes
short dot products with as many unreduced products as a proven `uint64` bound
allows. Packing prevents the severe cache-set conflict that otherwise occurs
at power-of-two matrix strides. The full-word path uses FLINT's header-only
preinverse arithmetic and Shoup multiplication. A failed blocked pivot attempt
restores the original workspace and runs the general path, so singularity never
changes semantics.

Operations consume the factorization as follows:

- rank is stored metadata;
- determinant is swap parity times the product of pivots;
- a nonsingular square echelon form is immediately the identity, while the
  general case back-reduces the packed upper rows;
- solve applies the stored permutation and performs forward and backward
  triangular substitution for all right-side columns together.

Dedicated-host sweeps selected separate dispatch policies:

| Arithmetic | Block crossover | Panel | Column tile |
|---|---:|---:|---:|
| up to 32-bit primes | 32 | 20 | 512 |
| larger word-size primes | 320 | 48 | 512 |

Shoup row updates begin at four entries. Every value is an overridable build
parameter, and each effective value is part of the content-addressed cache key.
The defaults are evidence from one architecture, not universal constants.

The GCC addon is 27,440 bytes and the Clang addon is 30,896 bytes. Generated C
is about 38 KB. Neither artifact statically links FLINT; the test suite retains
a one-megabyte upper bound to catch accidental linkage regressions.

## Dedicated-host comparison

Measurements were made on 2026-08-08 on the otherwise idle 16-vCPU, 64-GB AMD
EPYC 7B13 `bench-1` VM. Every system received the same dense Cauchy matrix
`A[i,j] = 1/(i+j+1)` and four-column right sides. Setup, construction, startup,
and compilation were excluded.

- Native Kernel and direct FLINT numbers are medians of nine warmed samples
  from the GCC build.
- Nemo 0.56.1 ran under Julia 1.12.6 with seven warmed samples.
- The available Magma is the historical version 2.18; it is useful as a
  user-facing comparison, not a claim about current Magma.
- Times are milliseconds. Direct FLINT is the C-backed Sage.js addon and is the
  relevant implementation ceiling.

### Fresh operations at 256 by 256

| Field path | Operation | Native v9 | FLINT | Nemo | Magma 2.18 |
|---|---|---:|---:|---:|---:|
| u32 | rank | 5.087 | 2.814 | 5.291 | 5.000 |
| u32 | determinant | 5.250 | 2.816 | 5.521 | 4.500 |
| u32 | echelon | 5.600 | 3.205 | 2.910 | 5.000 |
| u32 | solve, 4 columns | 5.826 | 3.004 | 3.065 | 6.500 |
| u61 | rank | 9.617 | 5.274 | 8.374 | 60.500 |
| u61 | determinant | 9.515 | 5.298 | 8.368 | 63.000 |
| u61 | echelon | 10.163 | 5.418 | 5.027 | 63.500 |
| u61 | solve, 4 columns | 10.472 | 5.545 | 5.414 | 78.000 |

All fresh native operations are within 1.75--1.94 times direct FLINT. Rank and
determinant are close to Nemo, the u32 one-shot solve beats the available
Magma, and the u61 path is roughly six times faster than it.

### Reusing a decomposition at 256 by 256

| Field path | Workload | Native v9 | FLINT fresh | Nemo context | Magma same matrix |
|---|---|---:|---:|---:|---:|
| u32 | build factor | 5.370 | 2.706 | 2.874 | -- |
| u32 | solve 4 columns | 0.795 | 2.866 | 11.348 | 7.000 |
| u32 | eight 4-column solves | 7.707 | 24.271 | 119.500 | -- |
| u61 | build factor | 9.863 | 5.068 | 5.051 | -- |
| u61 | solve 4 columns | 0.769 | 5.491 | 6.114 | 77.500 |
| u61 | eight 4-column solves | 6.082 | 41.714 | 54.158 | -- |

The direct-FLINT comparison intentionally refactorizes because the current
Sage.js FLINT API has no retained solve context. Nemo uses `solve_init`, and
Magma repeatedly receives the same matrix object. This is therefore an API and
algorithm comparison, not a claim that triangular substitution itself is
faster than FLINT internals. It demonstrates why exposing decomposition as a
first-class mathematical value matters: v9 is 3.6 times faster than the fresh
FLINT call over the u32 field and 7.1 times faster over the u61 field.

### Improvement over v8

| Field path | Operation, n=256 | Native v8 | Native v9 | Speedup |
|---|---|---:|---:|---:|
| u32 | rank | 9.984 | 5.087 | 1.96x |
| u32 | echelon | 15.460 | 5.600 | 2.76x |
| u32 | solve | 15.626 | 5.826 | 2.68x |
| u61 | rank | 10.384 | 9.617 | 1.08x |
| u61 | echelon | 15.998 | 10.163 | 1.57x |
| u61 | solve | 16.001 | 10.472 | 1.53x |

At size 16, the identical readable Sage.js/Python fallback takes roughly
11--24 ms per operation. Generated calls take about 0.005--0.014 ms. The AOT
speedup remains in the thousands even though the maintained input is compact
Python rather than handwritten C.

## Reproduction and tuning

```sh
pnpm run bench:native:prime-field

CC=clang CXX=clang++ \
  SAGEJS_NATIVE_PRIME_FIELD_CACHE_ROOT=/tmp/sagejs-prime-clang \
  pnpm run bench:native:prime-field

JULIA_DEPOT_PATH=/path/with/Nemo julia \
  bench/prime-field-matrix-comparison.jl

magma -b bench/prime-field-matrix-comparison.m
```

The benchmark accepts `SAGEJS_NATIVE_PRIME_FIELD_SIZES`,
`SAGEJS_NATIVE_PRIME_FIELD_SAMPLES`, and
`SAGEJS_NATIVE_PRIME_FIELD_OPERATIONS`. Compiler tuning overrides are:

- `SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U32`;
- `SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U64`;
- `SAGEJS_NATIVE_PRIME_PANEL_U32`;
- `SAGEJS_NATIVE_PRIME_PANEL_U64`;
- `SAGEJS_NATIVE_PRIME_COLUMN_TILE`;
- `SAGEJS_NATIVE_PRIME_SHOUP_THRESHOLD`.

GCC produced faster factorizations on this host. Clang was competitive on
triangular solve: at size 256 its retained four-column solve took 0.687 ms over
the u32 field and 0.750 ms over the u61 field. Toolchain identity, flags, and
all tuning values are cache inputs, so incompatible artifacts cannot collide.
