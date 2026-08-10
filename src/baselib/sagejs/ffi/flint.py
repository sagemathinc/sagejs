"""Generated safe FFI surface for flint; do not edit by hand."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = (
    "flint@1caef6d72fb3f99477eb4f6181ed5d3ebc83c01dea66d50a8b0a1c171fcbceef"
)


class DirichletGroup:
    """Opaque owned flint:dirichlet_group resource."""

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
            "resource:flint@1caef6d72fb3f99477eb4f6181ed5d3ebc83c01dea66d50a8b0a1c171fcbceef:dirichlet_group",
        )

    def __enter__(self) -> DirichletGroup:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False


def dirichlet_group(modulus: int) -> DirichletGroup:
    """Call declared flint:dirichlet_group_init."""
    return DirichletGroup(
        _runtime.ffi_resource_create(
            __sagejs_ffi_declaration__ + ":dirichlet_group_init",
            "resource:flint@1caef6d72fb3f99477eb4f6181ed5d3ebc83c01dea66d50a8b0a1c171fcbceef:dirichlet_group",
            "@sagemath/sagejs-flint",
            "ffiDirichletGroupCreate",
            "ffiDirichletGroupClose",
            [modulus],
            ["uint64"],
            ["1"],
            "zero_is_error",
            "ValueError",
            "FLINT could not initialize this Dirichlet modulus",
        )
    )


def dirichlet_group_size(group: DirichletGroup) -> int:
    """Call declared flint:dirichlet_group_size."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":dirichlet_group_size",
        "@sagemath/sagejs-flint",
        "ffiDirichletGroupSize",
        [group._ffi_borrow()],
        [
            "resource:flint@1caef6d72fb3f99477eb4f6181ed5d3ebc83c01dea66d50a8b0a1c171fcbceef:dirichlet_group"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def dirichlet_group_num_primitive(group: DirichletGroup) -> int:
    """Call declared flint:dirichlet_group_num_primitive."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":dirichlet_group_num_primitive",
        "@sagemath/sagejs-flint",
        "ffiDirichletGroupNumPrimitive",
        [group._ffi_borrow()],
        [
            "resource:flint@1caef6d72fb3f99477eb4f6181ed5d3ebc83c01dea66d50a8b0a1c171fcbceef:dirichlet_group"
        ],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [],
    )


def n_is_prime(value: int) -> bool:
    """Call declared flint:n_is_prime."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":n_is_prime",
        "@sagemath/sagejs-flint",
        "wordIsPrime",
        [value],
        ["uint64"],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_gcd(left: int, right: int) -> int:
    """Call declared flint:fmpz_gcd."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_gcd",
        "@sagemath/sagejs-flint",
        "gcd",
        [left, right],
        ["Integer", "Integer"],
        "Integer",
        ["direct", [], None],
        None,
        None,
        [],
    )


def fmpz_mat_rank(entries: list[int], rows: int, columns: int) -> int:
    """Call declared flint:fmpz_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatRank",
        [entries, rows, columns],
        ["IntegerBuffer", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "entries",
                ["rows", "columns"],
                ["entries", "rows", "columns"],
            ]
        ],
    )


def fmpz_mat_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    left_rows: int,
    inner: int,
    right_columns: int,
) -> bool:
    """Call declared flint:fmpz_mat_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_mul",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatMul",
        [output, left, right, left_rows, inner, right_columns],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer matrix multiplication failed",
        [
            [
                "buffer_length",
                "output",
                ["left_rows", "right_columns"],
                ["output", "left", "right", "left_rows", "inner", "right_columns"],
            ],
            [
                "buffer_length",
                "left",
                ["left_rows", "inner"],
                ["output", "left", "right", "left_rows", "inner", "right_columns"],
            ],
            [
                "buffer_length",
                "right",
                ["inner", "right_columns"],
                ["output", "left", "right", "left_rows", "inner", "right_columns"],
            ],
        ],
    )


def fmpz_mat_det(output: list[int], source: list[int], size: int, one: int) -> bool:
    """Call declared flint:fmpz_mat_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_det",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatDet",
        [output, source, size, one],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer determinant failed",
        [
            [
                "buffer_length",
                "output",
                ["one", "one"],
                ["output", "source", "size", "one"],
            ],
            [
                "buffer_length",
                "source",
                ["size", "size"],
                ["output", "source", "size", "one"],
            ],
        ],
    )


def fmpz_mat_charpoly(
    output: list[int], source: list[int], output_length: int, size: int, one: int
) -> bool:
    """Call declared flint:fmpz_mat_charpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_charpoly",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatCharpoly",
        [output, source, output_length, size, one],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer characteristic polynomial failed",
        [
            [
                "buffer_length",
                "output",
                ["one", "output_length"],
                ["output", "source", "output_length", "size", "one"],
            ],
            [
                "buffer_length",
                "source",
                ["size", "size"],
                ["output", "source", "output_length", "size", "one"],
            ],
        ],
    )


def fmpz_mat_hnf(output: list[int], source: list[int], rows: int, columns: int) -> bool:
    """Call declared flint:fmpz_mat_hnf."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_hnf",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatHnf",
        [output, source, rows, columns],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer Hermite form failed",
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                ["output", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns"],
            ],
        ],
    )


def fmpz_mat_hnf_transform(
    output: list[int], transform: list[int], source: list[int], rows: int, columns: int
) -> bool:
    """Call declared flint:fmpz_mat_hnf_transform."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_hnf_transform",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatHnfTransform",
        [output, transform, source, rows, columns],
        ["IntegerBuffer", "IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer Hermite transformation failed",
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                ["output", "transform", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "transform",
                ["rows", "rows"],
                ["output", "transform", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "transform", "source", "rows", "columns"],
            ],
        ],
    )


def fmpz_mat_snf_transform(
    output: list[int],
    left_transform: list[int],
    right_transform: list[int],
    source: list[int],
    rows: int,
    columns: int,
) -> bool:
    """Call declared flint:fmpz_mat_snf_transform."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_snf_transform",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatSnfTransform",
        [output, left_transform, right_transform, source, rows, columns],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT integer Smith transformation failed",
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
            [
                "buffer_length",
                "left_transform",
                ["rows", "rows"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
            [
                "buffer_length",
                "right_transform",
                ["columns", "columns"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                [
                    "output",
                    "left_transform",
                    "right_transform",
                    "source",
                    "rows",
                    "columns",
                ],
            ],
        ],
    )


def fmpz_mat_right_kernel(
    output: list[int], source: list[int], rows: int, columns: int
) -> int:
    """Call declared flint:fmpz_mat_right_kernel."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpz_mat_right_kernel",
        "@sagemath/sagejs-flint",
        "ffiFmpzMatRightKernel",
        [output, source, rows, columns],
        ["IntegerBuffer", "IntegerBuffer", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["columns", "columns"],
                ["output", "source", "rows", "columns"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns"],
            ],
        ],
    )


def fmpq_mat_rank(
    rank: list[int],
    numerators: list[int],
    denominators: list[int],
    rows: int,
    columns: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatRank",
        [rank, numerators, denominators, rows, columns, one],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational matrix rank failed",
        [
            [
                "buffer_length",
                "rank",
                ["one", "one"],
                ["rank", "numerators", "denominators", "rows", "columns", "one"],
            ],
            [
                "buffer_length",
                "numerators",
                ["rows", "columns"],
                ["rank", "numerators", "denominators", "rows", "columns", "one"],
            ],
            [
                "buffer_length",
                "denominators",
                ["rows", "columns"],
                ["rank", "numerators", "denominators", "rows", "columns", "one"],
            ],
        ],
    )


def fmpq_mat_mul(
    output_numerators: list[int],
    output_denominators: list[int],
    left_numerators: list[int],
    left_denominators: list[int],
    right_numerators: list[int],
    right_denominators: list[int],
    left_rows: int,
    inner: int,
    right_columns: int,
) -> bool:
    """Call declared flint:fmpq_mat_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_mul",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatMul",
        [
            output_numerators,
            output_denominators,
            left_numerators,
            left_denominators,
            right_numerators,
            right_denominators,
            left_rows,
            inner,
            right_columns,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational matrix multiplication failed",
        [
            [
                "buffer_length",
                "output_numerators",
                ["left_rows", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["left_rows", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_numerators",
                ["left_rows", "inner"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_denominators",
                ["left_rows", "inner"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_numerators",
                ["inner", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_denominators",
                ["inner", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "left_rows",
                    "inner",
                    "right_columns",
                ],
            ],
        ],
    )


def fmpq_mat_rref(
    rank: list[int],
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    rows: int,
    columns: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_rref."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_rref",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatRref",
        [
            rank,
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            rows,
            columns,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational matrix RREF failed",
        [
            [
                "buffer_length",
                "rank",
                ["one", "one"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_numerators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["rows", "columns"],
                [
                    "rank",
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "rows",
                    "columns",
                    "one",
                ],
            ],
        ],
    )


def fmpq_mat_inv(
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    size: int,
) -> bool:
    """Call declared flint:fmpq_mat_inv."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_inv",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatInv",
        [
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            size,
        ],
        ["IntegerBuffer", "IntegerBuffer", "IntegerBuffer", "IntegerBuffer", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "matrix is singular",
        [
            [
                "buffer_length",
                "output_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                ],
            ],
        ],
    )


def fmpq_mat_solve(
    output_numerators: list[int],
    output_denominators: list[int],
    left_numerators: list[int],
    left_denominators: list[int],
    right_numerators: list[int],
    right_denominators: list[int],
    size: int,
    right_columns: int,
) -> bool:
    """Call declared flint:fmpq_mat_solve."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_solve",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatSolve",
        [
            output_numerators,
            output_denominators,
            left_numerators,
            left_denominators,
            right_numerators,
            right_denominators,
            size,
            right_columns,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "matrix is singular",
        [
            [
                "buffer_length",
                "output_numerators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "left_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_numerators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
            [
                "buffer_length",
                "right_denominators",
                ["size", "right_columns"],
                [
                    "output_numerators",
                    "output_denominators",
                    "left_numerators",
                    "left_denominators",
                    "right_numerators",
                    "right_denominators",
                    "size",
                    "right_columns",
                ],
            ],
        ],
    )


def fmpq_mat_det(
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    size: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_det",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatDet",
        [
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            size,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational determinant failed",
        [
            [
                "buffer_length",
                "output_numerators",
                ["one", "one"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["one", "one"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "size",
                    "one",
                ],
            ],
        ],
    )


def fmpq_mat_charpoly(
    output_numerators: list[int],
    output_denominators: list[int],
    source_numerators: list[int],
    source_denominators: list[int],
    coefficient_count: int,
    size: int,
    one: int,
) -> bool:
    """Call declared flint:fmpq_mat_charpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":fmpq_mat_charpoly",
        "@sagemath/sagejs-flint",
        "ffiFmpqMatCharpoly",
        [
            output_numerators,
            output_denominators,
            source_numerators,
            source_denominators,
            coefficient_count,
            size,
            one,
        ],
        [
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "IntegerBuffer",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT rational characteristic polynomial failed",
        [
            [
                "buffer_length",
                "output_numerators",
                ["one", "coefficient_count"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "output_denominators",
                ["one", "coefficient_count"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_numerators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
            [
                "buffer_length",
                "source_denominators",
                ["size", "size"],
                [
                    "output_numerators",
                    "output_denominators",
                    "source_numerators",
                    "source_denominators",
                    "coefficient_count",
                    "size",
                    "one",
                ],
            ],
        ],
    )


def nmod_mat_rank(entries: list[int], rows: int, columns: int, modulus: int) -> int:
    """Call declared flint:nmod_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRank",
        [entries, rows, columns, modulus],
        ["UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "entries",
                ["rows", "columns"],
                ["entries", "rows", "columns", "modulus"],
            ]
        ],
    )


def nmod_mat_det(source: list[int], size: int, modulus: int) -> int:
    """Call declared flint:nmod_mat_det."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_det",
        "@sagemath/sagejs-flint",
        "ffiNmodMatDet",
        [source, size, modulus],
        ["UInt64Buffer", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [["buffer_length", "source", ["size", "size"], ["source", "size", "modulus"]]],
    )


def nmod_mat_charpoly(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    size: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_charpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_charpoly",
        "@sagemath/sagejs-flint",
        "ffiNmodMatCharpoly",
        [output, source, output_length, source_length, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT characteristic polynomial failed",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_mat_minpoly(
    output: list[int],
    source: list[int],
    output_length: int,
    source_length: int,
    size: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_minpoly."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_minpoly",
        "@sagemath/sagejs-flint",
        "ffiNmodMatMinpoly",
        [output, source, output_length, source_length, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT minimal polynomial failed",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "output",
                    "source",
                    "output_length",
                    "source_length",
                    "size",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_mat_inv(output: list[int], source: list[int], size: int, modulus: int) -> bool:
    """Call declared flint:nmod_mat_inv."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_inv",
        "@sagemath/sagejs-flint",
        "ffiNmodMatInv",
        [output, source, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "matrix is singular",
        [
            [
                "buffer_length",
                "output",
                ["size", "size"],
                ["output", "source", "size", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["size", "size"],
                ["output", "source", "size", "modulus"],
            ],
        ],
    )


def nmod_mat_rref(
    output: list[int], source: list[int], rows: int, columns: int, modulus: int
) -> int:
    """Call declared flint:nmod_mat_rref."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_rref",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRref",
        [output, source, rows, columns, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
        ],
    )


def nmod_mat_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    left_rows: int,
    inner: int,
    right_columns: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_mul",
        "@sagemath/sagejs-flint",
        "ffiNmodMatMul",
        [output, left, right, left_rows, inner, right_columns, modulus],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT matrix multiplication failed",
        [
            [
                "buffer_length",
                "output",
                ["left_rows", "right_columns"],
                [
                    "output",
                    "left",
                    "right",
                    "left_rows",
                    "inner",
                    "right_columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["left_rows", "inner"],
                [
                    "output",
                    "left",
                    "right",
                    "left_rows",
                    "inner",
                    "right_columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["inner", "right_columns"],
                [
                    "output",
                    "left",
                    "right",
                    "left_rows",
                    "inner",
                    "right_columns",
                    "modulus",
                ],
            ],
        ],
    )


def nmod_mat_right_kernel(
    output: list[int], source: list[int], rows: int, columns: int, modulus: int
) -> int:
    """Call declared flint:nmod_mat_right_kernel."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_right_kernel",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRightKernel",
        [output, source, rows, columns, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["columns", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
            [
                "buffer_length",
                "source",
                ["rows", "columns"],
                ["output", "source", "rows", "columns", "modulus"],
            ],
        ],
    )


def nmod_mat_solve(
    output: list[int],
    left: list[int],
    right: list[int],
    size: int,
    right_columns: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_mat_solve."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_solve",
        "@sagemath/sagejs-flint",
        "ffiNmodMatSolve",
        [output, left, right, size, right_columns, modulus],
        ["UInt64Buffer", "UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64"],
        "bool",
        ["direct", [], None],
        None,
        None,
        [
            [
                "buffer_length",
                "output",
                ["size", "right_columns"],
                ["output", "left", "right", "size", "right_columns", "modulus"],
            ],
            [
                "buffer_length",
                "left",
                ["size", "size"],
                ["output", "left", "right", "size", "right_columns", "modulus"],
            ],
            [
                "buffer_length",
                "right",
                ["size", "right_columns"],
                ["output", "left", "right", "size", "right_columns", "modulus"],
            ],
        ],
    )


def nmod_poly_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    modulus: int,
) -> bool:
    """Call declared flint:nmod_poly_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_mul",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyMul",
        [output, left, right, output_length, left_length, right_length, modulus],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid packed polynomial multiplication",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "left",
                ["left_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "right",
                ["right_length"],
                [
                    "output",
                    "left",
                    "right",
                    "output_length",
                    "left_length",
                    "right_length",
                    "modulus",
                ],
            ],
        ],
    )
