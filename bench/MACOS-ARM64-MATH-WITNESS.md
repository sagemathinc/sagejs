# macOS arm64 mathematical witness

This is a reproducible compatibility and performance witness for Sage.js on
native Apple silicon. It is not a collection of isolated peak numbers: every
timed mathematical result is consumed and checked, comparisons use identical
deterministic inputs, and the raw records preserve the exact host, revision,
backend trace, and timing policy.

The result is encouraging. The generated FLINT, M4RI, and FFLAS-FFPACK paths
build and run as genuine arm64 Mach-O modules. Exact `ZZ` and `QQ` matrix
algorithms are generally competitive with SageMath, while the FFLAS-FFPACK
word-prime algorithms are often dramatically faster. The clear platform-
independent weakness is not an algorithm: it is the public representation and
boundary path for general word-size prime fields.

## Reproduction

The witness was recorded on 2026-08-12 with:

- Apple M1 Max, 32 GiB RAM;
- macOS 26.4 (build 25E246), Darwin 25.4.0;
- Node.js 26.5.0 and pnpm 11.9.0;
- Apple clang 17.0.0 (`clang-1700.4.4.1`);
- FLINT 3.6.0;
- SageMath 10.9.post2;
- one OpenMP/BLAS thread.

The canonical dense audit used Sage.js revision
`7b873685f617fc0046fb9673838ff2f6588ac933`. The final companion witness used
`d6d4bb97b6ca0446f0baf3ff56eb0f253a96ed82`; that revision adds the witness,
its reporting checks, and no mathematical implementation changes.

From a clean checkout on the Mac:

```bash
pnpm parallel:cache -- prepare
pnpm build
pnpm native:precompile:production

SAGE=/path/to/sage \
  node bench/dense-matrix-public-audit.cjs \
  --full --runtime all --check

node bench/macos-arm64-math-witness.cjs \
  --runtime all \
  --sage /path/to/sage \
  --samples 5 \
  --check \
  --require-macos \
  --output macos-arm64-format-polynomial.json \
  --markdown macos-arm64-format-polynomial.md
```

The full machine-readable records are:

- `bench/results/macos-arm64-m1-max-dense-matrix-2026-08-12.json`
- `bench/results/macos-arm64-m1-max-format-polynomial-2026-08-12.json`

The production FLINT kernels were Mach-O arm64 bundles linked to `libSystem`
and `libc++`. The generated FFLAS-FFPACK kernel was also a Mach-O arm64 bundle
and used Apple's Accelerate framework. Thus these measurements do not pass
through Rosetta. The companion JSON persists the exact pnpm, clang, and FLINT
versions plus `file` identity and `otool` linkage for representative generated
FLINT and FFLAS-FFPACK artifacts; `--require-macos --check` validates that
evidence rather than relying on this prose.

## Timing definitions

The dense audit is the canonical owner of matrix construction, arithmetic,
transpose, swaps, rank, RREF, determinant, characteristic polynomial, solving,
right kernels, and backend-route evidence. Its `warm_median_ms` is the median
of verified repeated calls. Its `first_measured_ms` is order-dependent within
one domain workload and must not be interpreted as a process-isolated cold
measurement. `fresh_process_ms` includes runtime startup and the entire domain
workload.

The companion intentionally avoids duplicating those cases. Each companion
case runs in a fresh process, performs untimed setup, measures the first call,
performs two untimed warmups, and then records the median of five calls. This
separates mathematical first-use cost from process startup. The subprocess
wall time remains in the raw JSON as `process_ms`.

Sage.js serialization uses SagePack, whereas SageMath `dumps` uses Python
serialization. Serialization timings are runtime-local witnesses only: their
bytes and timings are not compared, and their raw comparison ratios are null.

## Dense matrices

All five audited domains completed their full public workloads. Selected warm
medians are below; a ratio below one favors Sage.js.

| domain | operation | Sage.js | SageMath | ratio |
| :-- | :-- | --: | --: | --: |
| `ZZ` | construct range | 17.513 ms | 44.084 ms | 0.40x |
| `ZZ` | multiply | 0.800 ms | 4.364 ms | 0.18x |
| `ZZ` | RREF | 1.072 ms | 6.235 ms | 0.17x |
| `ZZ` | characteristic polynomial | 7.897 ms | 34.811 ms | 0.23x |
| `QQ` | construct range | 19.699 ms | 88.666 ms | 0.22x |
| `QQ` | multiply | 3.878 ms | 6.596 ms | 0.59x |
| `QQ` | RREF | 1.124 ms | 1.052 ms | 1.07x |
| `QQ` | determinant | 29.299 ms | 36.325 ms | 0.81x |
| `GF(2)` | multiply | 0.406 ms | 0.294 ms | 1.38x |
| `GF(2)` | characteristic polynomial | 2.490 ms | 24.423 ms | 0.10x |
| `GF(7)` | multiply | 0.486 ms | 0.079 ms | 6.19x |
| word prime | construct range | 1105.030 ms | 71.863 ms | 15.38x |
| word prime | multiply | 6.653 ms | 3446.990 ms | 0.0019x |
| word prime | RREF | 1.629 ms | 642.211 ms | 0.0025x |
| word prime | solve right | 1.094 ms | 238.956 ms | 0.0046x |

The exact-resource architecture is a strong native-Mac result: `ZZ` and `QQ`
algorithms crossed the FFI boundary without a compatibility failure or a
macOS-specific fallback. Word-prime multiplication was about 518 times faster
than SageMath on this workload, RREF about 394 times faster, rank about 431
times faster, and solve about 218 times faster.

Small-prime `GF(2)` and `GF(7)` ratios sometimes look poor because both systems
finish in fractions of a millisecond. The differences remain worth profiling,
but they are not comparable in urgency to a one-second construction boundary.

## Formatting, serialization, and polynomials

Selected companion warm medians:

| operation | Sage.js | SageMath | ratio |
| :-- | --: | --: | --: |
| `ZZ` matrix `.str()` | 0.464 ms | 3.604 ms | 0.13x |
| `QQ` matrix `.str()` | 0.470 ms | 2.907 ms | 0.16x |
| `GF(7)` matrix `.str()` | 0.460 ms | 12.837 ms | 0.04x |
| word-prime matrix `.str()` | 103.149 ms | 7.682 ms | 13.43x |
| `ZZ[x]` construction | 1.139 ms | 0.082 ms | 13.85x |
| `QQ[x]` construction | 4.741 ms | 0.193 ms | 24.58x |
| `GF(7)[x]` multiplication | 0.109 ms | 0.021 ms | 5.31x |
| word-prime polynomial construction | 0.210 ms | 1.489 ms | 0.14x |
| word-prime polynomial factorization | 9.286 ms | 6.427 ms | — |

Every comparable summary matched. All SagePack round trips reproduced the
same public value. Exact and small-prime matrix formatting is excellent, and
polynomial resource operations are healthy on arm64. `ZZ[x]` and `QQ[x]`
construction deserve focused boundary profiling; they are slower than
SageMath even though the resulting operations are inexpensive. Factorization
is shown as two runtime-local observations because the factor summary is not a
canonical cross-runtime equivalence witness.

## Actionable findings

1. **General word-prime matrix representation is the P1 gap.** Deterministic
   construction is 15.38 times slower than SageMath, `.str()` is 13.43 times
   slower, and the runtime-local SagePack witness takes 1.37 seconds to dump
   and 0.47 seconds to load this 300 by 300 case. The same public representation
   cannot currently perform `swap_rows` or `swap_columns`. This is a boundary/
   storage problem around an exceptionally fast algorithm backend, not an
   argument against FFLAS-FFPACK. SagePack is not compared with SageMath's
   different Python serialization format.
2. **Word-prime backend observability is incomplete.** Successful random,
   arithmetic, transpose, rank, RREF, determinant, characteristic polynomial,
   solve, and kernel cases emitted no native route under `SAGEJS_NATIVE_TRACE`.
   A contributor cannot yet verify those paths from the public trace.
3. **First-use costs remain visible.** The dense audit detected large first-
   measured costs for `ZZ` random construction, `GF(2)` random construction
   and characteristic polynomial, and `GF(7)` multiplication. These should be
   measured with dedicated process-isolated probes before changing loading
   policy.
4. **Exact polynomial construction needs a lane.** `ZZ[x]` and `QQ[x]`
   construction is about 14-25 times slower on these deterministic inputs, while
   multiply/GCD remain close and SagePack round trips are fast. Bulk resource
   construction is the likely narrow target.

## Build observation

The first native precompile produced a transient node-gyp post-link error:
the arm64 `.node` file had linked successfully, but node-gyp then attempted to
`lstat` a missing `build/node_gyp_bins` path. Re-running
`pnpm native:precompile:production` reused the completed artifact and published
all twelve production kernels. This was not a runtime or mathematical failure,
but a clean-build Mac lane should make the first run deterministic.

## Conclusion

macOS arm64 is a credible native target today. This witness found no systemic
Apple-silicon incompatibility in the generated-resource approach, and the
strong algorithm numbers reproduce outside Linux x64. The highest-value next
step is to make general word-prime matrices use a uniformly efficient public
representation and observable route without sacrificing the existing
FFLAS-FFPACK performance.
