"""Generated safe FFI surface for m4ri; do not edit by hand."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = (
    "m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f"
)


class M4riMatrix:
    """Opaque owned m4ri:matrix resource."""

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
        )

    def __enter__(self) -> M4riMatrix:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


class M4riByteRegion:
    """Opaque owned m4ri:byte_region resource."""

    @classmethod
    def from_bytes(cls, source: Any) -> M4riByteRegion:
        """Copy host bytes into a newly owned resource."""
        return cls(
            _runtime.ffi_resource_create(
                __sagejs_ffi_declaration__ + ":__resource_byte_region_from_bytes",
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
                "@sagemath/sagejs-m4ri",
                "ffiM4riByteRegionFromBytes",
                "ffiM4riByteRegionClose",
                [source],
                ["ByteBuffer"],
                [None],
                "none",
                "ValueError",
                "unable to copy bytes into FFI resource",
            )
        )

    def __init__(self, token: Any) -> None:
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self) -> Any:
        return _runtime.ffi_resource_borrow(
            self._token,
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
        )

    def __enter__(self) -> M4riByteRegion:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def copy_bytes(self) -> Any:
        """Copy this resource's byte payload into host-owned storage."""
        return _runtime.ffi_resource_copy_bytes(
            self._token,
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
            "ffiM4riByteRegionCopyBytes",
        )

    def take_bytes(self) -> Any:
        """Copy the byte payload and deterministically close this resource."""
        try:
            return self.copy_bytes()
        finally:
            self.close()


def available() -> bool:
    """Call declared m4ri:available."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":available",
        "@sagemath/sagejs-m4ri",
        "ffiM4riAvailable",
        [],
        [],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def matrix(rows: int, columns: int) -> M4riMatrix:
    """Call declared m4ri:matrix."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixCreate",
            "ffiM4riMatrixClose",
            [rows, columns],
            ["uint64", "uint64"],
            [None, None],
            "zero_is_error",
            "OverflowError",
            "M4RI matrix dimensions are too large or unavailable",
        )
    )


def matrix_nrows(matrix: M4riMatrix) -> int:
    """Call declared m4ri:matrix_nrows."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":matrix_nrows",
        "@sagemath/sagejs-m4ri",
        "ffiM4riMatrixNrows",
        [matrix._ffi_borrow()],
        [
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def matrix_ncols(matrix: M4riMatrix) -> int:
    """Call declared m4ri:matrix_ncols."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":matrix_ncols",
        "@sagemath/sagejs-m4ri",
        "ffiM4riMatrixNcols",
        [matrix._ffi_borrow()],
        [
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def matrix_set_entry(matrix: M4riMatrix, row: int, column: int, value: int) -> bool:
    """Call declared m4ri:matrix_set_entry."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":matrix_set_entry",
        "@sagemath/sagejs-m4ri",
        "ffiM4riMatrixSetEntry",
        [matrix._ffi_borrow(), row, column, value],
        [
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "M4RI matrix entry or index is invalid",
        [],
    )


def matrix_entry_code(matrix: M4riMatrix, row: int, column: int) -> int:
    """Call declared m4ri:matrix_entry_code."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":matrix_entry_code",
        "@sagemath/sagejs-m4ri",
        "ffiM4riMatrixEntryCode",
        [matrix._ffi_borrow(), row, column],
        [
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "uint64",
            "uint64",
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def matrix_copy(source: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_copy."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_copy",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixCopy",
            "ffiM4riMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "M4RI matrix copy failed",
        )
    )


def matrix_equal(left: M4riMatrix, right: M4riMatrix) -> bool:
    """Call declared m4ri:matrix_equal."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":matrix_equal",
        "@sagemath/sagejs-m4ri",
        "ffiM4riMatrixEqual",
        [left._ffi_borrow(), right._ffi_borrow()],
        [
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
        ],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def matrix_add(left: M4riMatrix, right: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_add."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_add",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixAdd",
            "ffiM4riMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "M4RI matrix dimensions are incompatible for addition",
        )
    )


def matrix_mul(left: M4riMatrix, right: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_mul."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_mul",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixMul",
            "ffiM4riMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "M4RI matrix dimensions are incompatible for multiplication",
        )
    )


def matrix_transpose(source: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_transpose."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_transpose",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixTranspose",
            "ffiM4riMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "M4RI transpose failed",
        )
    )


def matrix_rank(source: M4riMatrix) -> int:
    """Call declared m4ri:matrix_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":matrix_rank",
        "@sagemath/sagejs-m4ri",
        "ffiM4riMatrixRank",
        [source._ffi_borrow()],
        [
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def matrix_rref(source: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_rref."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_rref",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixRref",
            "ffiM4riMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "M4RI RREF failed",
        )
    )


def matrix_determinant_code(source: M4riMatrix) -> int:
    """Call declared m4ri:matrix_determinant_code."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":matrix_determinant_code",
        "@sagemath/sagejs-m4ri",
        "ffiM4riMatrixDeterminantCode",
        [source._ffi_borrow()],
        [
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def matrix_inverse(source: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_inverse."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_inverse",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixInverse",
            "ffiM4riMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "ValueError",
            "M4RI matrix is not invertible",
        )
    )


def matrix_solve(left: M4riMatrix, right: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_solve."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_solve",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixSolve",
            "ffiM4riMatrixClose",
            [left._ffi_borrow(), right._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            ],
            [None, None],
            "zero_is_error",
            "ValueError",
            "M4RI matrix equation has incompatible dimensions or no solution",
        )
    )


def matrix_right_kernel(source: M4riMatrix) -> M4riMatrix:
    """Call declared m4ri:matrix_right_kernel."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_right_kernel",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixRightKernel",
            "ffiM4riMatrixClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "M4RI right kernel failed",
        )
    )


def matrix_logical_words(source: M4riMatrix) -> M4riByteRegion:
    """Call declared m4ri:matrix_logical_words."""
    return M4riByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_logical_words",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixLogicalWords",
            "ffiM4riByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "M4RI logical-word export failed",
        )
    )


def matrix_from_logical_words(
    source: M4riByteRegion, rows: int, columns: int
) -> M4riMatrix:
    """Call declared m4ri:matrix_from_logical_words."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_from_logical_words",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixFromLogicalWords",
            "ffiM4riMatrixClose",
            [source._ffi_borrow(), rows, columns],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid canonical M4RI logical-word data",
        )
    )


def matrix_sagepack_bytes(source: M4riMatrix) -> M4riByteRegion:
    """Call declared m4ri:matrix_sagepack_bytes."""
    return M4riByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_sagepack_bytes",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixSagepackBytes",
            "ffiM4riByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "M4RI SagePack byte export failed",
        )
    )


def matrix_from_sagepack_bytes(
    source: M4riByteRegion, rows: int, columns: int
) -> M4riMatrix:
    """Call declared m4ri:matrix_from_sagepack_bytes."""
    return M4riMatrix(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_from_sagepack_bytes",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixFromSagepackBytes",
            "ffiM4riMatrixClose",
            [source._ffi_borrow(), rows, columns],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
                "uint64",
                "uint64",
            ],
            [None, None, None],
            "zero_is_error",
            "ValueError",
            "invalid GF(2) SagePack bytes",
        )
    )


def matrix_format(source: M4riMatrix) -> M4riByteRegion:
    """Call declared m4ri:matrix_format."""
    return M4riByteRegion(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":matrix_format",
            "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:byte_region",
            "@sagemath/sagejs-m4ri",
            "ffiM4riMatrixFormat",
            "ffiM4riByteRegionClose",
            [source._ffi_borrow()],
            [
                "resource:m4ri@7e5dfaf4037c613fa2279b77496e6736c0b0ab1a1ed86f553c0db9b302e2237f:matrix"
            ],
            [None],
            "zero_is_error",
            "RuntimeError",
            "M4RI matrix formatting failed",
        )
    )
