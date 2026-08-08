# Native Kernel v8: dense prime-field matrices

Native Kernel v8 lowers four ordinary annotated Python/Sage functions to
compiled dense linear algebra over prime fields:

- rank;
- determinant;
- reduced row-echelon form;
- solving `A X = B` for one or more right sides.

The readable source and fallback are in
[`native_prime_field_matrix.py`](native_prime_field_matrix.py). The compiler
recognizes its checked operation contracts and emits classical elimination
over one private flat workspace. Inputs are immutable. Results use the shared
`nmod_mat` ABI and pass directly to the normal Sage.js FLINT addon without a
JavaScript copy.

Two arithmetic paths are selected from the modulus:

- primes through 32 bits use direct 64-bit products for scalar work and
  precomputed Shoup multiplication for row updates;
- larger word-size primes use FLINT's header-only preinverse multiplication
  and the same Shoup row specialization.

Pivot inversion uses modular extended Euclid. The generated addon does not
statically link FLINT: it is about 22.7 KB with either GCC or Clang. An
earlier implementation accidentally pulled FLINT's merged static
matrix object into every kernel and was 12 MB; the artifact-size regression
test prevents that from returning.

## Dedicated-host comparison

These measurements were made on 2026-08-08 on the otherwise idle 16-vCPU,
64-GB AMD EPYC 7B13 `bench-1` VM. All systems received the same dense Cauchy
matrix `A[i,j] = 1/(i+j+1)` and the same four-column right side. Setup and
compilation were excluded.

- Native Kernel and direct FLINT rows are medians of seven warmed samples.
- Nemo 0.56.1 under Julia 1.12.6 is likewise warmed and reports seven-sample
  medians.
- The available Magma binary is version 2.18, so its rows are useful historical
  user-facing comparisons, not claims about current Magma. Magma caches matrix
  decompositions; each timed call therefore receives a separately constructed
  matrix, with construction outside the timer.
- Times are milliseconds per operation. `FLINT` is the direct C-backed Sage.js
  addon and is the relevant implementation ceiling, not another compiler.

### Rank

| Prime path | Size | Native v8 | FLINT | Nemo | Magma 2.18 |
|---|---:|---:|---:|---:|---:|
| u32 | 16 | 0.0051 | 0.0031 | 0.0159 | 0.0090 |
| u32 | 64 | 0.1796 | 0.0674 | 0.2424 | 0.2000 |
| u32 | 256 | 9.9844 | 2.6751 | 6.3044 | 5.0000 |
| u61 | 16 | 0.0062 | 0.0032 | 0.0169 | 0.0730 |
| u61 | 64 | 0.1942 | 0.1045 | 0.3130 | 2.9000 |
| u61 | 256 | 10.3838 | 5.4949 | 10.7098 | 64.0000 |

### Determinant

| Prime path | Size | Native v8 | FLINT | Nemo | Magma 2.18 |
|---|---:|---:|---:|---:|---:|
| u32 | 16 | 0.0049 | 0.0028 | 0.0208 | 0.0090 |
| u32 | 64 | 0.1791 | 0.0663 | 0.2750 | 0.2000 |
| u32 | 256 | 10.0875 | 2.7120 | 7.1291 | 5.0000 |
| u61 | 16 | 0.0061 | 0.0039 | 0.0199 | 0.0720 |
| u61 | 64 | 0.1972 | 0.1076 | 0.3263 | 2.9000 |
| u61 | 256 | 10.3521 | 5.6794 | 10.3174 | 65.0000 |

### Echelon form and four-column solve

| Prime path | Size | Operation | Native v8 | FLINT | Nemo | Magma 2.18 |
|---|---:|---|---:|---:|---:|---:|
| u32 | 16 | echelon | 0.0082 | 0.0046 | 0.0028 | 0.0110 |
| u32 | 16 | solve | 0.0096 | 0.0060 | 0.0067 | 0.0180 |
| u32 | 64 | echelon | 0.2789 | 0.0860 | 0.0617 | 0.2000 |
| u32 | 64 | solve | 0.2896 | 0.0790 | 0.0852 | 0.3200 |
| u32 | 256 | echelon | 15.4601 | 3.1496 | 3.4922 | 5.0000 |
| u32 | 256 | solve | 15.6256 | 2.8877 | 3.5646 | 7.0000 |
| u61 | 16 | echelon | 0.0083 | 0.0056 | 0.0039 | 0.0800 |
| u61 | 16 | solve | 0.0104 | 0.0077 | 0.0086 | 0.1420 |
| u61 | 64 | echelon | 0.2911 | 0.1275 | 0.1159 | 2.9600 |
| u61 | 64 | solve | 0.2984 | 0.1278 | 0.1446 | 3.9600 |
| u61 | 256 | echelon | 15.9975 | 5.9912 | 6.0848 | 66.0000 |
| u61 | 256 | solve | 16.0011 | 5.7835 | 6.5437 | 80.0000 |

The result is already competitive where v8 was intended to be convincing:
small and medium classical rank/determinant. It beats the user-facing Nemo and
Magma rows at 16 and 64 over both primes. At 256 over a 61-bit prime it remains
essentially tied with Nemo for rank and determinant, and is about six times
faster than the available Magma. Direct FLINT remains 1.6--2.7 times faster in
that range.

The larger u32 echelon/solve gap is also informative. FLINT and Nemo use
decomposition and triangular-solve algorithms rather than v8's full
Gauss--Jordan elimination. Native Kernel v9 should lower reusable PLE/LU
decompositions, then implement echelon form and solve through triangular
kernels. The current table makes that work measurable.

At size 16 the identical readable Sage.js/Python fallback took 13--25 ms,
versus 0.005--0.010 ms for the generated GCC kernel: a 2,000--4,900-fold AOT
speedup. This is the central compiler result; comparison with direct FLINT
shows how much lower-level algorithmic headroom remains.

## Reproduction

```sh
pnpm run bench:native:prime-field

CC=clang CXX=clang++ \
  SAGEJS_NATIVE_PRIME_FIELD_CACHE_ROOT=/tmp/sagejs-prime-clang \
  pnpm run bench:native:prime-field

JULIA_DEPOT_PATH=/path/with/Nemo julia \
  bench/prime-field-matrix-comparison.jl

magma -b bench/prime-field-matrix-comparison.m
```

Clang was 13--21% faster than GCC on the larger u32 echelon/solve rows. GCC
was up to 8% faster on the larger u61 rows. The compiler and effective flags
are part of the native cache identity, so these builds cannot silently reuse
one another's artifacts.
