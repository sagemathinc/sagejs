"""Validated spectral numerical methods for dense, transform, and sparse work."""

from __future__ import annotations

from typing import Any

from .dense import (
    eig,
    eigh,
    general_eigen,
    singular_value_decomposition,
    svd,
    symmetric_eigen,
)
from .planning import plan, supports
from .result import SPECTRAL_EXPLANATION_SCHEMA_VERSION, SpectralResult
from .sparse import CSRMatrix, cg, eigsh, sparse_eigen, sparse_solve
from .transforms import convolve, fft, fourier_transform, ifft
from .visualization import spectral_animation, spectral_plot

SPECTRAL_CAPABILITY_SCHEMA_VERSION = 1

_OPERATIONS: dict[str, dict[str, Any]] = {
    "symmetric_eigen": {
        "status": "implemented",
        "classification": "translated",
        "methods": ["cyclic_jacobi"],
        "envelope": "finite real symmetric or complex Hermitian binary64 matrices under the explicit element budget",
        "validation": [
            "eigenpair_backward_residual",
            "eigenvector_orthogonality",
            "spectral_reconstruction",
        ],
        "visualization": ["eigenvalues", "convergence"],
    },
    "general_eigen": {
        "status": "implemented",
        "classification": "extension",
        "methods": ["complex_shifted_qr"],
        "envelope": "finite square complex binary64 matrices under the explicit element and QR-iteration budgets",
        "validation": [
            "eigenpair_backward_residual",
            "eigenbasis_reciprocal_condition",
            "eigenbasis_inverse_residual",
            "eigenbasis_reconstruction",
            "schur_vector_orthogonality",
            "schur_reconstruction",
        ],
        "visualization": ["eigenvalues", "conditioning", "convergence"],
    },
    "singular_value_decomposition": {
        "status": "implemented",
        "classification": "translated",
        "methods": ["one_sided_jacobi"],
        "envelope": "finite rectangular complex binary64 matrices, reduced SVD only, under the explicit element budget",
        "validation": [
            "svd_reconstruction",
            "left_singular_vector_orthogonality",
            "right_singular_vector_orthogonality",
        ],
        "visualization": ["singular_values", "conditioning", "convergence"],
    },
    "fourier_transform": {
        "status": "implemented",
        "classification": "translated",
        "methods": ["radix2_cooley_tukey", "bluestein_radix2"],
        "envelope": "finite nonempty one-dimensional complex binary64 sequences under the explicit workspace budget",
        "validation": [
            "independent_direct_reconstruction",
            "parseval_energy",
            "orthogonality_scaling",
        ],
        "visualization": ["spectrum", "aliasing", "convergence"],
    },
    "inverse_fourier_transform": {
        "status": "implemented",
        "classification": "translated",
        "methods": ["radix2_cooley_tukey", "bluestein_radix2"],
        "envelope": "finite nonempty one-dimensional complex binary64 sequences under the explicit workspace budget",
        "validation": [
            "independent_direct_reconstruction",
            "parseval_energy",
            "orthogonality_scaling",
        ],
        "visualization": ["spectrum", "aliasing", "convergence"],
    },
    "convolution": {
        "status": "implemented",
        "classification": "translated",
        "methods": ["direct", "fft"],
        "envelope": "finite nonempty one-dimensional complex sequences with full, same, or valid mode",
        "validation": [
            "independent_direct_convolution",
            "convolution_reconstruction",
        ],
        "visualization": ["coefficients", "aliasing", "convergence"],
    },
    "sparse_linear_solve": {
        "status": "implemented",
        "classification": "extension",
        "methods": ["cg", "bicgstab"],
        "envelope": "explicit finite square CSR matrices; CG requires a strict Hermitian diagonal-dominance positive-definiteness certificate",
        "validation": ["independent_linear_residual", "normwise_backward_error"],
        "visualization": ["convergence"],
    },
    "sparse_dominant_eigen": {
        "status": "implemented",
        "classification": "extension",
        "methods": ["power_iteration"],
        "envelope": "one dominant-magnitude eigenpair of an explicit finite Hermitian CSR matrix with separated Gershgorin intervals certifying uniqueness",
        "validation": [
            "eigenpair_backward_residual",
            "eigenvector_orthogonality",
            "rayleigh_reconstruction",
            "dominant_magnitude_uniqueness_certificate",
        ],
        "visualization": ["eigenvalues", "convergence"],
    },
}

_UNSUPPORTED: list[dict[str, Any]] = [
    {
        "operation": "generalized_eigenvalue_pencil",
        "classification": "unsupported",
        "reason": "no QZ implementation or qualified portable backend is present",
        "alternative": "formulate a standard problem only when a validated solve is mathematically safe",
    },
    {
        "operation": "general_eigen_defective_or_near_defective_basis",
        "classification": "unsupported",
        "reason": "a numerically singular right-eigenvector basis cannot support a trustworthy eigensystem",
        "alternative": "use the validated complex Schur form from a qualified backend or reformulate the requested invariant subspace",
    },
    {
        "operation": "general_eigen_left_vectors",
        "classification": "unsupported",
        "reason": "the current complex Schur path returns right eigenvectors only",
        "alternative": "transpose/conjugate and solve separately, then validate biorthogonality",
    },
    {
        "operation": "full_svd",
        "classification": "unsupported",
        "reason": "only reduced factors needed for reconstruction are generated",
        "alternative": "request the reduced SVD",
    },
    {
        "operation": "multidimensional_fft",
        "classification": "unsupported",
        "reason": "axis, shape, and storage contracts are not yet integrated",
        "alternative": "apply the one-dimensional transform explicitly along each intended axis",
    },
    {
        "operation": "sparse_cg_without_spd_certificate",
        "classification": "unsupported",
        "reason": "Hermitian symmetry alone does not certify positive definiteness for CG",
        "alternative": "use auto/BiCGSTAB or provide an operator satisfying the documented strict diagonal-dominance certificate",
    },
    {
        "operation": "sparse_dominant_eigen_without_gap_certificate",
        "classification": "unsupported",
        "reason": "power iteration cannot identify a unique dominant-magnitude eigenpair without an independent gap certificate",
        "alternative": "use a qualified restarted Hermitian eigensolver or an operator with separated Gershgorin intervals",
    },
    {
        "operation": "sparse_multiple_or_interior_eigenpairs",
        "classification": "unsupported",
        "reason": "restarted Lanczos/Arnoldi and robust reorthogonalization are not yet implemented",
        "alternative": "request k=1, which='largest_magnitude', or use SciPy ARPACK externally",
    },
    {
        "operation": "sparse_nonsymmetric_eigenproblem",
        "classification": "unsupported",
        "reason": "the bounded sparse eigen path currently requires an explicit Hermitian operator",
        "alternative": "use the dense general path when the explicit matrix fits its allocation budget",
    },
]


def capabilities(operation: str | None = None) -> dict[str, Any]:
    """Return detached implemented and unsupported spectral capability records."""
    operations = {
        name: {
            key: list(value) if isinstance(value, list) else value
            for key, value in _OPERATIONS[name].items()
        }
        for name in sorted(_OPERATIONS)
        if operation is None or name == operation
    }
    unsupported = [
        dict(record)
        for record in _UNSUPPORTED
        if operation is None or record["operation"] == operation
    ]
    if operation is not None and not operations and not unsupported:
        raise ValueError("unknown spectral operation: " + operation)
    return {
        "schema_version": SPECTRAL_CAPABILITY_SCHEMA_VERSION,
        "domain": "spectral",
        "operations": operations,
        "unsupported": unsupported,
    }


__all__ = [
    "CSRMatrix",
    "SPECTRAL_CAPABILITY_SCHEMA_VERSION",
    "SPECTRAL_EXPLANATION_SCHEMA_VERSION",
    "SpectralResult",
    "capabilities",
    "cg",
    "convolve",
    "eig",
    "eigh",
    "eigsh",
    "fft",
    "fourier_transform",
    "general_eigen",
    "ifft",
    "plan",
    "singular_value_decomposition",
    "sparse_eigen",
    "sparse_solve",
    "spectral_animation",
    "spectral_plot",
    "supports",
    "svd",
    "symmetric_eigen",
]
