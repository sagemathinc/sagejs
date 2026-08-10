"""Generated safe FFI surface for flint; do not edit by hand."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as _runtime

__sagejs_ffi_declaration__ = "flint@875d307463bfedb74ccb869ca7494d77b7a99baf1bebd8e3cf94c3c999b8147c"


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
            self._token, "resource:flint@875d307463bfedb74ccb869ca7494d77b7a99baf1bebd8e3cf94c3c999b8147c:dirichlet_group"
        )

    def __enter__(self) -> DirichletGroup:
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False



def dirichlet_group(modulus: int) -> DirichletGroup:
    """Call declared flint:dirichlet_group_init."""
    return DirichletGroup(_runtime.ffi_resource_create(
        __sagejs_ffi_declaration__ + ":dirichlet_group_init",
        "resource:flint@875d307463bfedb74ccb869ca7494d77b7a99baf1bebd8e3cf94c3c999b8147c:dirichlet_group",
        "@sagemath/sagejs-flint",
        "ffiDirichletGroupCreate",
        "ffiDirichletGroupClose",
        [modulus],
        ["uint64"],
        ["1"],
        "zero_is_error",
        "ValueError",
        "FLINT could not initialize this Dirichlet modulus",
    ))


def dirichlet_group_size(group: DirichletGroup) -> int:
    """Call declared flint:dirichlet_group_size."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":dirichlet_group_size",
        "@sagemath/sagejs-flint",
        "ffiDirichletGroupSize",
        [group._ffi_borrow()],
        ["resource:flint@875d307463bfedb74ccb869ca7494d77b7a99baf1bebd8e3cf94c3c999b8147c:dirichlet_group"],
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
        ["resource:flint@875d307463bfedb74ccb869ca7494d77b7a99baf1bebd8e3cf94c3c999b8147c:dirichlet_group"],
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
        [["buffer_length","entries",["rows","columns"],["entries","rows","columns","modulus"]]],
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
        [["buffer_length","source",["size","size"],["source","size","modulus"]]],
    )


def nmod_mat_charpoly(output: list[int], source: list[int], output_length: int, source_length: int, size: int, modulus: int) -> bool:
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
        [["buffer_length","output",["output_length"],["output","source","output_length","source_length","size","modulus"]],["buffer_length","source",["source_length"],["output","source","output_length","source_length","size","modulus"]]],
    )


def nmod_mat_minpoly(output: list[int], source: list[int], output_length: int, source_length: int, size: int, modulus: int) -> bool:
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
        [["buffer_length","output",["output_length"],["output","source","output_length","source_length","size","modulus"]],["buffer_length","source",["source_length"],["output","source","output_length","source_length","size","modulus"]]],
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
        [["buffer_length","output",["size","size"],["output","source","size","modulus"]],["buffer_length","source",["size","size"],["output","source","size","modulus"]]],
    )


def nmod_mat_rref(output: list[int], source: list[int], rows: int, columns: int, modulus: int) -> int:
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
        [["buffer_length","output",["rows","columns"],["output","source","rows","columns","modulus"]],["buffer_length","source",["rows","columns"],["output","source","rows","columns","modulus"]]],
    )


def nmod_mat_mul(output: list[int], left: list[int], right: list[int], left_rows: int, inner: int, right_columns: int, modulus: int) -> bool:
    """Call declared flint:nmod_mat_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_mul",
        "@sagemath/sagejs-flint",
        "ffiNmodMatMul",
        [output, left, right, left_rows, inner, right_columns, modulus],
        ["UInt64Buffer", "UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "FLINT matrix multiplication failed",
        [["buffer_length","output",["left_rows","right_columns"],["output","left","right","left_rows","inner","right_columns","modulus"]],["buffer_length","left",["left_rows","inner"],["output","left","right","left_rows","inner","right_columns","modulus"]],["buffer_length","right",["inner","right_columns"],["output","left","right","left_rows","inner","right_columns","modulus"]]],
    )


def nmod_mat_right_kernel(output: list[int], source: list[int], rows: int, columns: int, modulus: int) -> int:
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
        [["buffer_length","output",["columns","columns"],["output","source","rows","columns","modulus"]],["buffer_length","source",["rows","columns"],["output","source","rows","columns","modulus"]]],
    )


def nmod_mat_solve(output: list[int], left: list[int], right: list[int], size: int, right_columns: int, modulus: int) -> bool:
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
        [["buffer_length","output",["size","right_columns"],["output","left","right","size","right_columns","modulus"]],["buffer_length","left",["size","size"],["output","left","right","size","right_columns","modulus"]],["buffer_length","right",["size","right_columns"],["output","left","right","size","right_columns","modulus"]]],
    )


def nmod_poly_mul(output: list[int], left: list[int], right: list[int], output_length: int, left_length: int, right_length: int, modulus: int) -> bool:
    """Call declared flint:nmod_poly_mul."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_poly_mul",
        "@sagemath/sagejs-flint",
        "ffiNmodPolyMul",
        [output, left, right, output_length, left_length, right_length, modulus],
        ["UInt64Buffer", "UInt64Buffer", "UInt64Buffer", "uint64", "uint64", "uint64", "uint64"],
        "bool",
        ["status", [1], None],
        "ValueError",
        "invalid packed polynomial multiplication",
        [["buffer_length","output",["output_length"],["output","left","right","output_length","left_length","right_length","modulus"]],["buffer_length","left",["left_length"],["output","left","right","output_length","left_length","right_length","modulus"]],["buffer_length","right",["right_length"],["output","left","right","output_length","left_length","right_length","modulus"]]],
    )
