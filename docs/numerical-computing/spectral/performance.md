# Spectral performance and payload evidence

This is a development receipt, not four-platform release qualification. It was
captured on 2026-08-31 on Linux x86_64 with CPython 3.14.4, NumPy 2.5.1,
SciPy 1.18.0, and mpmath 1.3.0 by:

```text
python3 -I bench/numerics/spectral/benchmark.py
```

The benchmark performs one warmup and reports the median of three samples for
dense/sparse methods or five for FFT/convolution. Sage.js times include input
conversion, algorithm execution, trace bookkeeping at the default summary
level, and independent validation. NumPy/SciPy times are optimized oracle
kernel calls and do not include Sage.js result construction, so the table is
diagnostic rather than a like-for-like product contest.

| Workload | Ordinary Python + validation (ms) | NumPy/SciPy oracle (ms) |
| --- | ---: | ---: |
| Hermitian eigen, 24×24 | 69.62 | 0.19 |
| General eigen, 10×10 | 14.85 | 0.05 |
| Reduced SVD, 30×18 | 59.90 | 0.06 |
| Complex FFT, 4096 | 83.49 | 0.05 |
| FFT convolution, 512×512 | 9.72 | 0.10 |
| CG tridiagonal solve, 400×400 | 17.74 | 0.58 |
| Dominant sparse eigenpair, 400×400 | 12.61 | 0.82 |

On small survey cases, system mpmath 1.3.0 took 21.30 ms for a 6×6 general
eigensystem and 5.24 ms for an 8×5 SVD. The values characterize this host only.

The five first-party Python files were 110,507 uncompressed bytes and 19,982
bytes when concatenated and gzip-compressed at level 9. Their SHA-256 was
`f8be3f4206a5d85b87b89e35bbced598666969cd3899d1567b7459e99dd0f316`.
This change adds zero native or Wasm bytes and no new dependency. Rerun the
benchmark after edits rather than treating an earlier payload hash as current.

The result is clear: this milestone establishes semantics, validation, failure
behavior, and portability. Large dense arrays and high-throughput transforms
need a qualified `numpy-ts`/Wasm or LAPACK-class backend before release-level
performance claims. The fallback remains useful for teaching, small problems,
offline verification, and runtimes where an accelerated capability is absent.
