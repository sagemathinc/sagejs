# Spectral backend survey and decision

The current production choice is ordinary CPython-parseable source. This is a
correct portable baseline, not a claim that handwritten Python should compete
with LAPACK or a tuned FFT library on large arrays.

## Candidates examined

### Vendored mpmath 1.3.0

Sage.js already vendors unmodified mpmath 1.3.0 under `src/lib/mpmath/` with a
BSD-3-Clause license. Its documented matrix package provides general
eigenproblems, symmetric/Hermitian eigenproblems, Schur decomposition, and
real/complex SVD. The [mpmath matrix documentation](https://www.mpmath.org/doc/current/matrices.html)
describes the returned eigenvector and reconstruction relations. It is an
important portable reference and is included in the benchmark survey.

It is not the canonical binary64 backend for this slice. mpmath matrices use
object/dictionary storage and arbitrary-precision scalar machinery, while the
product requirement is bounded binary64 execution with semantic per-iteration
events and cancellation checks. Calling one monolithic mpmath eig/SVD routine
would not provide a hard in-call cancellation boundary. The shipped code
therefore uses inspectable cyclic Jacobi, shifted QR, and one-sided Jacobi
algorithms, while the vendored mpmath source remains an independent mature
reference.

### Existing Sage.js NumPy / numpy-ts 1.6.0

`src/lib/numpy.py` already exposes `linalg.eig`, `linalg.eigh`, `linalg.svd`,
and the NumPy FFT family through the MIT-licensed `numpy-ts` 1.6.0 dependency.
The package contains portable JavaScript plus Wasm kernels and is the most
promising already-shipped acceleration candidate. Its surface mirrors the
standard operations documented by [NumPy linear algebra](https://numpy.org/doc/stable/reference/routines.linalg.html)
and [SciPy FFT](https://docs.scipy.org/doc/scipy/reference/generated/scipy.fft.fft.html).

This lane does not promote it automatically. A production backend record still
needs:

- differential execution against the same corpus on browser, Node, and SEA;
- exact algorithm/artifact identity rather than the broad `numpy` function
  name;
- cancellation or worker-termination behavior during a long kernel;
- measured conversion, cold-load, Wasm memory, and compressed payload costs;
- Windows x64, Linux x64/ARM64, and macOS ARM64 receipts; and
- the ordinary-Python fallback retained here.

Those changes cross the shared NumPy/package/capability registries and belong
to an integration or backend lane.

### NumPy/SciPy, LAPACK, pocketfft, and ARPACK

NumPy and SciPy are the primary offline differential oracles. NumPy documents
that its dense linear algebra uses BLAS/LAPACK-class implementations. Netlib's
[LAPACK driver inventory](https://www.netlib.org/lapack/double/) includes the
standard `DGEEV`, `DSYEV`, `DGESVD`, and `DGESDD` families. SciPy documents
FFT normalization and worker behavior, and its sparse linear algebra provides
CG, GMRES, ARPACK-backed eigen subsets, and related mature methods. For
example, the [SciPy GMRES contract](https://docs.scipy.org/doc/scipy/reference/generated/scipy.sparse.linalg.gmres.html)
defines convergence by the independently meaningful norm test
`norm(b - A @ x) <= max(rtol*norm(b), atol)`.

These are excellent host oracles and eventual foreign-library candidates, but
they are not shipped in browser/Node/SEA form by this lane. Adding a native
LAPACK dependency without the required Windows and Wasm strategy would violate
the repository portability policy. ARPACK-class restarted sparse subset
methods also need a larger orthogonalization, restart, and failure-semantics
contract than can honestly be inferred from the function name `eigsh`.

## Decision by operation

| Operation | Current production path | Mature reference | Why this path now |
| --- | --- | --- | --- |
| Hermitian eigen | cyclic Jacobi | SciPy `eigh`, mpmath `eigh` | inspectable unitary rotations, bounded sweeps, strong reconstruction |
| General eigen | complex shifted QR + Schur vectors | SciPy `eig`, mpmath `eig` | direct deflation trace plus Schur and independently inverted eigenbasis witnesses; unsafe bases fail closed |
| Reduced SVD | one-sided Jacobi | SciPy/NumPy SVD, mpmath SVD | avoids normal equations and exposes column-correlation convergence |
| 1-D FFT | radix-2 plus Bluestein | NumPy/SciPy FFT, numpy-ts FFT | arbitrary lengths, no added payload, stage-level cancellation |
| Convolution | direct/FFT crossover | NumPy/SciPy convolution | identical semantic result with independent coefficient checks |
| Sparse solve | CG/BiCGSTAB | SciPy sparse linear algebra | explicit operator evaluations, residual trace, no hidden direct fallback |
| Sparse eigen | one Hermitian dominant pair by power iteration | SciPy `eigsh` | narrow supportable envelope with explicit unsupported subsets |

The benchmark evidence shows large performance headroom. It justifies future
qualified acceleration work; it does not justify weakening cancellation,
fallback, or validation semantics.
