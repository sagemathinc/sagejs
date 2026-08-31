# Validated spectral numerical methods

This package is the ordinary-Python, backend-neutral spectral slice of the
Sage.js numerical laboratory. It runs from both CPython and Sage.js and returns
the shared `NumericalResult` envelope. A solver termination is never sufficient
for success: every successful result has independent residual, reconstruction,
or orthogonality evidence appropriate to the operation.

```python
from sagejs.numerics.spectral import eigh, fft, svd

eigensystem = eigh([[2.0, 1.0], [1.0, 2.0]])
assert eigensystem.success
assert eigensystem.validation.passed

decomposition = svd([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
spectrum = fft([1.0, 0.0, 0.0, 0.0])
```

The complete public surface is:

- `symmetric_eigen` / `eigh`: cyclic Jacobi for finite real-symmetric or
  complex-Hermitian matrices;
- `general_eigen` / `eig`: complex shifted QR, right eigenvectors, and the
  complex Schur form;
- `singular_value_decomposition` / `svd`: reduced one-sided-Jacobi SVD;
- `fourier_transform`, `fft`, and `ifft`: one-dimensional radix-2 or
  Bluestein FFTs with NumPy/SciPy normalization names;
- `convolve`: direct or FFT convolution with `full`, `same`, and `valid`
  modes;
- `CSRMatrix` and `sparse_solve`: canonical explicit CSR storage with CG when
  strict Hermitian diagonal dominance plus positive diagonal independently
  certifies positive definiteness, or BiCGSTAB otherwise; and
- `sparse_eigen` / `eigsh`: one dominant-magnitude eigenpair of an explicit
  Hermitian CSR matrix when separated Gershgorin intervals independently
  certify a unique dominant magnitude.

Complex values in `NumericalResult.value`, traces, and serialized problem data
use a JSON representation: effectively real numbers remain JSON numbers and a
nonreal value is `[real, imaginary]`. The algorithm works internally with
Python complex numbers; the encoding keeps `to_json()` deterministic and
portable.

All algorithms normalize their finite inputs before forming norms, squared
energies, residuals, Hermitian checks, or iterative thresholds. Results are
rescaled with exponent-aware arithmetic. If a finite mathematical output
overflows or underflows binary64, the operation returns `validation_failed`,
no value, and a failed `finite_binary64_output` check; it never serializes an
infinity or NaN. This is distinct from rejecting non-finite inputs.

## Evidence carried by results

Dense Hermitian results independently re-evaluate every eigenpair, check
eigenvector orthogonality, and reconstruct `A = V diag(w) V*`. General dense
results re-evaluate every right eigenpair; independently invert the candidate
basis with pivoting; reject a small reciprocal condition witness; reconstruct
`A = V diag(w) V^-1`; and check both `Q*Q = I` and `A = Q T Q*` for the
returned Schur factors. A defective or near-defective basis therefore returns
`validation_failed` with no eigensystem value, even when individual residuals
and Schur reconstruction are small. SVD checks `A = U diag(s) Vh` and both
reduced orthogonality relations.

FFT validation does not merely call the FFT in reverse. It reconstructs all
small transforms, or a deterministic set of samples for large transforms,
using the direct DFT formula and separately checks Parseval scaling.
Convolution coefficients are independently recomputed by their defining sum.
Sparse solve and eigen results reapply the normalized CSR operator outside the
iteration and report residual/backward-error or Rayleigh evidence. Automatic
solve selection does not infer positive definiteness from symmetry: it selects
CG only with the documented sufficient SPD certificate, otherwise BiCGSTAB.
Power iteration similarly fails closed before iteration when its independent
dominant-magnitude certificate is unavailable, including equal-magnitude and
zero spectra.

Every iterative public call accepts hard iteration and elapsed-time limits,
trace event/byte limits, an explicit allocation or nonzero-count cap, and a
`cancel` callback. Sparse calls additionally cap operator evaluations.
Elapsed-time exhaustion uses the exact `maximum_elapsed_time` status, distinct
from `maximum_evaluations`.

## Scope and classifications

[`support-matrix.json`](support-matrix.json) is the exhaustive machine-readable
surface. Every implemented result repeats its `faithful`, `translated`, or
`extension` classification in the plan capability, provenance, and domain
payload. Unsupported operations include generalized eigenvalue pencils,
defective or numerically near-defective general eigenvector bases, left general
eigenvectors, full SVD factors, multidimensional FFTs, nonsymmetric sparse
eigenproblems, and multiple/interior sparse eigenpairs. These requests are not
silently approximated by a different method.

The public API deliberately accepts ordinary nested sequences rather than
inventing another matrix class. Shared Sage matrix/vector integration belongs
to the integration lane; `CSRMatrix` is a narrow explicit sparse storage type,
not a replacement public matrix hierarchy.

## Reproducing correctness and performance evidence

```text
node --test test/numerics/spectral/spectral-laboratory.cjs
python3 -I test/numerics/spectral/numpy_scipy_oracle.py
python3 -I bench/numerics/spectral/benchmark.py
```

The corpus includes clustered Hermitian eigenvalues, complex conjugate pairs,
nonnormal and clustered triangular matrices, wide and rank-deficient SVDs,
power-of-two and prime-length transforms, complex convolution, SPD,
nonsymmetric, and indefinite-Hermitian sparse solves, cancellation, resource
exhaustion, trace truncation, invalid structure, exponent-extreme scale
equivariance, representability failures, and explicitly unsupported sparse
subsets.
