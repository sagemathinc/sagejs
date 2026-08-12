"""Lazy representation-aware execution of dense matrix-vector products.

The bootstrap `Matrix` class owns Sage coercion and passes the common base and
fresh result parent here.  This module then crosses exactly one complete
storage boundary: generated FLINT resources for `ZZ` and `QQ`, a borrowed M4RI
resource for compiled `GF(2)`, or compiler-owned residue buffers for other
small prime fields.  Extension and approximate fields retain the existing
matrix-product fallback until they acquire a declared vector ABI.
"""

from __future__ import annotations

from typing import Any, Literal

import sagejs.runtime as runtime
from sagejs.ffi import flint
from sagejs.linear_algebra import matrix_vector as contract


def _native_available(kernel: Any) -> bool:
    return bool(getattr(kernel, "nativeAvailable", False))


def _uint64_buffer(kernel: Any, source: Any) -> Any:
    factory = getattr(kernel, "createUInt64Buffer", None)
    if _native_available(kernel) and callable(factory):
        return factory(source)
    return list(source)


def _uint64_zeros(kernel: Any, length: int) -> Any:
    factory = getattr(kernel, "createUInt64Buffer", None)
    if _native_available(kernel) and callable(factory):
        return factory(length)
    return [0 for _index in range(length)]


def _int64_buffer(kernel: Any, source: Any) -> Any:
    factory = getattr(kernel, "createInt64Buffer", None)
    if _native_available(kernel) and callable(factory):
        return factory(source)
    return [int(value) for value in source]


def _int64_zeros(kernel: Any, length: int) -> Any:
    factory = getattr(kernel, "createInt64Buffer", None)
    if _native_available(kernel) and callable(factory):
        return factory(length)
    return [0 for _index in range(length)]


def _prime_residues(base: Any, entries: Any) -> Any:
    modulus = int(base.characteristic())
    packed = runtime.uint64_residue_buffer(entries, modulus)
    if packed is not runtime.undefined:
        return packed
    residues = []
    for value in entries:
        if runtime.is_exact_integer(value):
            residue = int(value) % modulus
        elif getattr(value, "_parent", None) is base:
            residue = int(value._value)
        else:
            residue = int(base(value)._value)
        residues.append(residue)
    return runtime.uint64_buffer(residues)


def _prime_entries(base: Any, output: Any) -> Any:
    packed = runtime.uint64_buffer(output)
    return runtime.uint64_residue_elements(
        packed,
        base,
        runtime.reflect.get(base, "_elementType"),
    )


def _trace(
    operation: str,
    base: Any,
    rows: int,
    columns: int,
    implementation: str,
) -> None:
    if (
        runtime.reflect.get(
            runtime.global_object,
            "__sagejs_native_trace_enabled__",
        )
        is not True
    ):
        return
    print(
        "[sagejs native] Matrix."
        + operation
        + " "
        + str(base)
        + " "
        + str(rows)
        + "x"
        + str(columns)
        + " -> "
        + implementation
    )


def _prime_product(
    matrix_value: Any,
    vector_value: Any,
    side: str,
    base: Any,
    plan: Any,
) -> Any:
    kernels = __import__(
        "sagejs.kernels.matrix.dense_prime_field",
        fromlist=["dense_prime_field"],
    )
    if side == "right":
        kernel = kernels.dense_prime_field_matrix_mul_vector
    else:
        kernel = kernels.dense_prime_field_vector_mul_matrix
    matrix_storage = matrix_value._prime_kernel_buffer(kernel)
    vector_storage = _uint64_buffer(
        kernel,
        _prime_residues(base, vector_value._entries),
    )

    def operation(
        packed_matrix: Any,
        packed_vector: Any,
        rows: int,
        columns: int,
    ) -> Any:
        output = _uint64_zeros(kernel, plan.result_length)
        if side == "right":
            valid = kernel(
                output,
                packed_matrix,
                packed_vector,
                rows,
                columns,
                int(base.characteristic()),
            )
        else:
            valid = kernel(
                output,
                packed_vector,
                packed_matrix,
                rows,
                columns,
                int(base.characteristic()),
            )
        if not valid:
            raise ValueError("packed matrix-vector storage shape mismatch")
        return output

    output = contract.execute_bulk_matrix_vector_product(
        plan,
        matrix_storage,
        vector_storage,
        operation,
    )
    implementation = (
        "typed-python-isolated"
        if _native_available(kernel)
        else "dynamic-python-explicit"
    )
    _trace(
        "matrix_vector" if side == "right" else "vector_matrix",
        base,
        plan.rows,
        plan.columns,
        implementation,
    )
    return _prime_entries(base, output)


def _m4ri_product(
    matrix_value: Any,
    vector_value: Any,
    side: str,
    base: Any,
    plan: Any,
) -> Any:
    kernels = __import__(
        "sagejs.kernels.matrix.dense_binary_m4ri",
        fromlist=["dense_binary_m4ri"],
    )
    if side == "right":
        kernel = kernels.m4ri_dense_matrix_mul_vector
    else:
        kernel = kernels.m4ri_dense_vector_mul_matrix
    vector_storage = _int64_buffer(
        kernel,
        _prime_residues(base, vector_value._entries),
    )

    def operation(
        matrix_resource: Any,
        packed_vector: Any,
        _rows: int,
        _columns: int,
    ) -> Any:
        output = _int64_zeros(kernel, plan.result_length)
        if side == "right":
            valid = kernel(output, matrix_resource, packed_vector)
        else:
            valid = kernel(output, packed_vector, matrix_resource)
        if not valid:
            raise ValueError("M4RI matrix-vector storage shape mismatch")
        return output

    output = contract.execute_bulk_matrix_vector_product(
        plan,
        matrix_value._m4ri_resource(),
        vector_storage,
        operation,
    )
    _trace(
        "matrix_vector" if side == "right" else "vector_matrix",
        base,
        plan.rows,
        plan.columns,
        "typed-python-isolated",
    )
    return _prime_entries(base, output)


def _integer_product(
    matrix_value: Any,
    vector_value: Any,
    side: str,
    plan: Any,
) -> Any:
    exact = __import__(
        "sagejs.linear_algebra.exact_vector_public",
        fromlist=["exact_vector_public"],
    )
    vector_region = exact.serialize_integer(vector_value._exact_vector_resource())
    try:

        def operation(
            matrix_resource: Any,
            input_region: Any,
            _rows: int,
            _columns: int,
        ) -> Any:
            if side == "right":
                return flint.fmpz_matrix_mul_vector(matrix_resource, input_region)
            return flint.fmpz_vector_mul_matrix(input_region, matrix_resource)

        output_region = contract.execute_bulk_matrix_vector_product(
            plan,
            matrix_value._integer_resource(),
            vector_region,
            operation,
        )
        try:
            return exact.integer_from_region(output_region, plan.result_length)
        finally:
            output_region.close()
    finally:
        vector_region.close()


def _rational_product(
    matrix_value: Any,
    vector_value: Any,
    side: str,
    plan: Any,
) -> Any:
    exact = __import__(
        "sagejs.linear_algebra.exact_vector_public",
        fromlist=["exact_vector_public"],
    )
    vector_region = exact.serialize_rational(vector_value._exact_vector_resource())
    try:

        def operation(
            matrix_resource: Any,
            input_region: Any,
            _rows: int,
            _columns: int,
        ) -> Any:
            if side == "right":
                return flint.fmpq_matrix_mul_vector(matrix_resource, input_region)
            return flint.fmpq_vector_mul_matrix(input_region, matrix_resource)

        output_region = contract.execute_bulk_matrix_vector_product(
            plan,
            matrix_value._rational_resource(),
            vector_region,
            operation,
        )
        try:
            return exact.rational_from_region(output_region, plan.result_length)
        finally:
            output_region.close()
    finally:
        vector_region.close()


def _nmod_product(
    matrix_value: Any,
    vector_value: Any,
    side: str,
    base: Any,
    plan: Any,
) -> Any:
    residues = runtime.uint64_residue_buffer(
        vector_value._entries, int(base.characteristic())
    )
    if residues is runtime.undefined:
        residues = _prime_residues(base, vector_value._entries)
    if side == "right":
        region = flint.nmod_matrix_mul_vector(
            matrix_value._nmod_resource(), residues, len(residues)
        )
    else:
        region = flint.nmod_vector_mul_matrix(
            residues, len(residues), matrix_value._nmod_resource()
        )
    output = runtime.uint64_unpack_le(region.take_bytes(), 8, plan.result_length)
    return _prime_entries(base, output)


def matrix_vector_product(
    matrix_value: Any,
    vector_value: Any,
    side: Literal["right", "left"],
    base: Any,
    result_parent: Any,
) -> Any:
    """Return `matrix * vector` or `vector * matrix` as a fresh vector."""
    plan = contract.prepare_matrix_vector_product(
        matrix_value.nrows(),
        matrix_value.ncols(),
        len(vector_value),
        side,
    )
    matrix_value = matrix_value.change_ring(base)
    vector_value = vector_value.change_ring(base)

    if matrix_value._has_m4ri_matrix_resource():
        kernels = __import__(
            "sagejs.kernels.matrix.dense_binary_m4ri",
            fromlist=["dense_binary_m4ri"],
        )
        if _native_available(kernels.m4ri_dense_matrix_mul_vector):
            entries = _m4ri_product(matrix_value, vector_value, side, base, plan)
            return result_parent(entries)

    if matrix_value._has_packed_prime_storage():
        entries = _prime_product(matrix_value, vector_value, side, base, plan)
        return result_parent(entries)

    if matrix_value._has_nmod_matrix_resource():
        entries = _nmod_product(matrix_value, vector_value, side, base, plan)
        _trace(
            "matrix_vector" if side == "right" else "vector_matrix",
            base,
            plan.rows,
            plan.columns,
            "generated-flint-resource",
        )
        return result_parent(entries)

    if matrix_value._has_fmpz_matrix_resource():
        resource = _integer_product(matrix_value, vector_value, side, plan)
        _trace(
            "matrix_vector" if side == "right" else "vector_matrix",
            base,
            plan.rows,
            plan.columns,
            "generated-flint-resource",
        )
        return result_parent._from_fmpz_vector_resource(resource)

    if matrix_value._has_fmpq_matrix_resource():
        resource = _rational_product(matrix_value, vector_value, side, plan)
        _trace(
            "matrix_vector" if side == "right" else "vector_matrix",
            base,
            plan.rows,
            plan.columns,
            "generated-flint-resource",
        )
        return result_parent._from_fmpq_vector_resource(resource)

    # Extension and approximate fields have not yet acquired a packed vector
    # ABI. Keep their semantically correct matrix-product fallback explicit.
    if side == "right":
        return (matrix_value * vector_value.column()).column(0)
    return (vector_value.row() * matrix_value).row(0)
