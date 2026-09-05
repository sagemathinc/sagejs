# First single-thread LU alternative comparison

On persistent `bench-1`, the actual generated typed-source LU core and Eigen
5.0.0 run in the same executable with alternating sample blocks and retained
workspaces. Each includes input copying, a small alternating diagonal update,
factorization and an observed output. Neither includes public Python/JS
marshalling, independent validation, or result construction. Source dimensions
remain within its qualified 128-row/column ceiling.

| Square size | Typed source (ms) | Eigen (ms) | SciPy baseline (ms) |
| --- | ---: | ---: | ---: |
| 16 | 0.00187 | 0.00081 | 0.00918 |
| 32 | 0.01292 | 0.00782 | 0.01480 |
| 64 | 0.09458 | 0.03759 | 0.03326 |
| 128 | 0.72872 | 0.18082 | 0.12337 |

Seven samples follow three warmups. SciPy 1.18.0 / NumPy 2.5.2 use verified
single-thread pools. **SciPy is a later block with a Python boundary and fresh
returned arrays, not an identical retained-workspace API.** Its small-size
figures do not establish that Eigen is faster than LAPACK. The source core
also includes its explicit finite/range guards; Eigen receives trusted finite
test matrices. These are workload-specific development measurements, not a
backend promotion or general speed claim.

NumPy independently reconstructs the typed-source and Eigen factors using their
returned row permutations. Both pass `64 * eps * n` relative infinity-norm
thresholds for these inputs; SciPy's separately computed factorization also
passes. The matrices are deterministic and well behaved, not an ill-conditioned
or singular corpus. Raw returned factors and inputs are retained compressed in
`native-output.json.gz`; timings, tool commands, source/core/header hashes and
threadpool details are in `linux-x64.json`.

The result supports testing a guarded Eigen dense backend: it already has a
four-platform/browser closure witness and beats this elementary typed kernel
on these sizes. It does **not** yet justify adding a separate tuned LAPACK
dependency, changing defaults, extrapolating to large matrices, or treating
kernel timings as public Sage.js timings. Full public LU currently spends far
more time outside this kernel. Packed ownership, independent validation and
the generic floating foreign boundary remain critical-path work.

To reproduce, generate `_packed_lu.py` through the canonical native compiler,
then supply its unedited `kernel_core.c` and `kernel_core.h` directory:

```sh
python eigen-lu-comparison.py EIGEN_SOURCE GENERATED_CORE NEW_OUTPUT
```

The benchmark environment requires SciPy, NumPy and threadpoolctl; these are
isolated measurement dependencies, not Sage.js runtime dependencies. The current
runner targets Unix `cc`/`c++`; native Windows remains covered by the separate
closure probe, not this performance comparison.
