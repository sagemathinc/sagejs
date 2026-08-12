"""Generated safe FFI surface for fflas; do not edit by hand."""

from __future__ import annotations

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = (
    "fflas@e5fbcb0e6838ef808cdeaba79342898d2a608f2fda60680bfb2b1e638b8ce049"
)


def modular_float_available() -> bool:
    """Call declared fflas:modular_float_available."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":modular_float_available",
        "@sagemath/sagejs-fflas",
        "ffiFflasModularFloatAvailable",
        [],
        [],
        "bool",
        ["direct", [], None],
        None,
        None,
        [],
    )


def modular_float_mul(
    output: list[int],
    left: list[int],
    right: list[int],
    output_length: int,
    left_length: int,
    right_length: int,
    left_rows: int,
    inner: int,
    right_columns: int,
    modulus: int,
) -> bool:
    """Call declared fflas:modular_float_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":modular_float_mul",
        "@sagemath/sagejs-fflas",
        "ffiFflasModularFloatMul",
        [
            output,
            left,
            right,
            output_length,
            left_length,
            right_length,
            left_rows,
            inner,
            right_columns,
            modulus,
        ],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FFLAS matrix multiplication failed or is unavailable",
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
                    "left_rows",
                    "inner",
                    "right_columns",
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
                    "left_rows",
                    "inner",
                    "right_columns",
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
                    "left_rows",
                    "inner",
                    "right_columns",
                    "modulus",
                ],
            ],
        ],
    )


def modular_float_rank(
    rank_output: list[int],
    source: list[int],
    rank_length: int,
    source_length: int,
    rows: int,
    columns: int,
    modulus: int,
) -> bool:
    """Call declared fflas:modular_float_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":modular_float_rank",
        "@sagemath/sagejs-fflas",
        "ffiFflasModularFloatRank",
        [rank_output, source, rank_length, source_length, rows, columns, modulus],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FFPACK matrix rank failed or is unavailable",
        [
            [
                "buffer_length",
                "rank_output",
                ["rank_length"],
                [
                    "rank_output",
                    "source",
                    "rank_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "rank_output",
                    "source",
                    "rank_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
        ],
    )


def modular_float_rref(
    output: list[int],
    rank_output: list[int],
    source: list[int],
    output_length: int,
    rank_length: int,
    source_length: int,
    rows: int,
    columns: int,
    modulus: int,
) -> bool:
    """Call declared fflas:modular_float_rref."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":modular_float_rref",
        "@sagemath/sagejs-fflas",
        "ffiFflasModularFloatRref",
        [
            output,
            rank_output,
            source,
            output_length,
            rank_length,
            source_length,
            rows,
            columns,
            modulus,
        ],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FFPACK matrix RREF failed or is unavailable",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "rank_output",
                    "source",
                    "output_length",
                    "rank_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "rank_output",
                ["rank_length"],
                [
                    "output",
                    "rank_output",
                    "source",
                    "output_length",
                    "rank_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "output",
                    "rank_output",
                    "source",
                    "output_length",
                    "rank_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
        ],
    )


def modular_float_right_nullspace(
    output: list[int],
    nullity_output: list[int],
    source: list[int],
    output_length: int,
    nullity_length: int,
    source_length: int,
    rows: int,
    columns: int,
    modulus: int,
) -> bool:
    """Call declared fflas:modular_float_right_nullspace."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":modular_float_right_nullspace",
        "@sagemath/sagejs-fflas",
        "ffiFflasModularFloatRightNullspace",
        [
            output,
            nullity_output,
            source,
            output_length,
            nullity_length,
            source_length,
            rows,
            columns,
            modulus,
        ],
        [
            "UInt64Buffer",
            "UInt64Buffer",
            "UInt64Buffer",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
            "uint64",
        ],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FFPACK right nullspace failed or is unavailable",
        [
            [
                "buffer_length",
                "output",
                ["output_length"],
                [
                    "output",
                    "nullity_output",
                    "source",
                    "output_length",
                    "nullity_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "nullity_output",
                ["nullity_length"],
                [
                    "output",
                    "nullity_output",
                    "source",
                    "output_length",
                    "nullity_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
            [
                "buffer_length",
                "source",
                ["source_length"],
                [
                    "output",
                    "nullity_output",
                    "source",
                    "output_length",
                    "nullity_length",
                    "source_length",
                    "rows",
                    "columns",
                    "modulus",
                ],
            ],
        ],
    )
