"""Validated dense binary64 numerical linear algebra."""

from .diagnostics import SingularValueDiagnostics, singular_value_diagnostics
from .factorizations import (
    CholeskyFactorization,
    LinearAlgebraError,
    LUFactorization,
    QRFactorization,
)
from .operations import (
    LinearAlgebraResult,
    cholesky,
    condition_number,
    determinant,
    inverse,
    least_squares,
    lu,
    matrix_rank,
    qr,
    solve,
)
from .storage import DenseMatrix, DenseVector, as_matrix, as_vector
from .validation import (
    independent_residual,
    least_squares_stationarity,
    minimum_norm_row_space_error,
    normwise_backward_error,
    validate_cholesky,
    validate_inverse,
    validate_least_squares,
    validate_lu,
    validate_qr,
    validate_solve,
)

__all__ = [
    "CholeskyFactorization",
    "DenseMatrix",
    "DenseVector",
    "LUFactorization",
    "LinearAlgebraError",
    "LinearAlgebraResult",
    "QRFactorization",
    "SingularValueDiagnostics",
    "as_matrix",
    "as_vector",
    "cholesky",
    "condition_number",
    "determinant",
    "independent_residual",
    "inverse",
    "least_squares",
    "least_squares_stationarity",
    "lu",
    "matrix_rank",
    "minimum_norm_row_space_error",
    "normwise_backward_error",
    "qr",
    "singular_value_diagnostics",
    "solve",
    "validate_cholesky",
    "validate_inverse",
    "validate_least_squares",
    "validate_lu",
    "validate_qr",
    "validate_solve",
]
