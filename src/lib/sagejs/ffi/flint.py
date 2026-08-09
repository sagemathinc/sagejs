"""Generated safe FFI surface for flint; do not edit by hand."""

from __future__ import annotations

import sagejs.runtime as _runtime
from sagejs.native import UInt64Buffer

__sagejs_ffi_declaration__ = "flint@25ad578af2e34d44ad4dbd8c97404dd59bcfbbcf140cf15a68dd85f451a79881"


class DirichletGroup:
    """Opaque owned flint:dirichlet_group resource."""

    def __init__(self, token):
        self._token = token

    @property
    def closed(self) -> bool:
        return _runtime.ffi_resource_closed(self._token)

    def close(self) -> None:
        _runtime.ffi_resource_close(self._token)

    def _ffi_borrow(self):
        return _runtime.ffi_resource_borrow(
            self._token, "resource:flint@25ad578af2e34d44ad4dbd8c97404dd59bcfbbcf140cf15a68dd85f451a79881:dirichlet_group"
        )

    def __enter__(self):
        self._ffi_borrow()
        return self

    def __exit__(self, exception_type, exception, traceback) -> bool:
        self.close()
        return False



def dirichlet_group(modulus: int) -> DirichletGroup:
    """Call declared flint:dirichlet_group_init."""
    return DirichletGroup(_runtime.ffi_resource_create(
        __sagejs_ffi_declaration__ + ":dirichlet_group_init",
        "resource:flint@25ad578af2e34d44ad4dbd8c97404dd59bcfbbcf140cf15a68dd85f451a79881:dirichlet_group",
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
        ["resource:flint@25ad578af2e34d44ad4dbd8c97404dd59bcfbbcf140cf15a68dd85f451a79881:dirichlet_group"],
        "uint64",
        "none",
        None,
        None,
    )


def dirichlet_group_num_primitive(group: DirichletGroup) -> int:
    """Call declared flint:dirichlet_group_num_primitive."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":dirichlet_group_num_primitive",
        "@sagemath/sagejs-flint",
        "ffiDirichletGroupNumPrimitive",
        [group._ffi_borrow()],
        ["resource:flint@25ad578af2e34d44ad4dbd8c97404dd59bcfbbcf140cf15a68dd85f451a79881:dirichlet_group"],
        "uint64",
        "none",
        None,
        None,
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
        "none",
        None,
        None,
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
        "none",
        None,
        None,
    )


def nmod_mat_rank(entries: UInt64Buffer, rows: int, columns: int, modulus: int) -> int:
    """Call declared flint:nmod_mat_rank."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_rank",
        "@sagemath/sagejs-flint",
        "ffiNmodMatRank",
        [entries, rows, columns, modulus],
        ["UInt64Buffer", "uint64", "uint64", "uint64"],
        "uint64",
        "none",
        None,
        None,
    )


def nmod_mat_inv(output: UInt64Buffer, source: UInt64Buffer, size: int, modulus: int) -> bool:
    """Call declared flint:nmod_mat_inv."""
    return _runtime.ffi_call(
        __sagejs_ffi_declaration__ + ":nmod_mat_inv",
        "@sagemath/sagejs-flint",
        "ffiNmodMatInv",
        [output, source, size, modulus],
        ["UInt64Buffer", "UInt64Buffer", "uint64", "uint64"],
        "bool",
        "zero_is_error",
        "ValueError",
        "matrix is singular",
    )
