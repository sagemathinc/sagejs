# Dense matrices and vectors over exact and approximate Sage rings.
#
# The Python-visible object model follows SageMath. Native hosts use FLINT
# matrices, including Arb/ACB for approximate real and complex arithmetic;
# browser hosts use the portable exact-matrix backend where available.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime

_dense_prime_kernel_module_cache = runtime.undefined
_dense_prime_flint_module_cache = runtime.undefined
_dense_prime_fflas_module_cache = runtime.undefined
_dense_word_prime_flint_module_cache = runtime.undefined
_dense_binary_m4ri_kernel_module_cache = runtime.undefined
_dense_integer_flint_module_cache = runtime.undefined
_dense_rational_kernel_module_cache = runtime.undefined
_dense_rational_flint_module_cache = runtime.undefined
_flint_ffi_module_cache = runtime.undefined
_m4ri_ffi_module_cache = runtime.undefined
_m4ri_available_cache = runtime.undefined
_FFLAS_DOUBLE_MAX_MODULUS = 94906266
_PACKED_PRIME_MAX_MODULUS = 256
_matrix_selection_module_cache = runtime.undefined
_matrix_selection_plans_module_cache = runtime.undefined
_matrix_vector_public_module_cache = runtime.undefined
_exact_vector_public_module_cache = runtime.undefined
_sparse_random_module_cache = runtime.undefined
_sparse_random_public_module_cache = runtime.undefined


class _FmpzMatrixResourceStorage:
    """Own one generated FLINT integer-matrix resource.

    The optional compatibility buffer is materialized only at an explicitly
    audited packed boundary. It is never the canonical public representation.
    """

    def __init__(self, resource: Any) -> None:
        self.resource = resource
        self.entries: Any = runtime.undefined


class _PackedRationalStorage:
    """Compiler-owned normalized numerator and denominator buffers."""

    def __init__(self, numerators: Any, denominators: Any) -> None:
        if _integer_buffer_length(numerators) != _integer_buffer_length(denominators):
            raise ValueError("rational buffer component lengths differ")
        self.numerators = numerators
        self.denominators = denominators


class _FmpqMatrixResourceStorage:
    """Own one generated FLINT resource and optional compatibility buffers."""

    def __init__(self, resource: Any) -> None:
        self.resource = resource
        self.numerators: Any = runtime.undefined
        self.denominators: Any = runtime.undefined


class _M4riMatrixResourceStorage:
    """Own one generated M4RI binary-matrix resource.

    A row-major residue buffer may be materialized lazily for an explicitly
    requested alternative backend or a general host view.  The M4RI resource
    remains the canonical public representation.
    """

    def __init__(self, resource: Any) -> None:
        self.resource = resource


class _NmodMatrixResourceStorage:
    """Own one generated FLINT word-prime matrix resource.

    A row-major residue buffer is materialized only for a public host view or
    an explicitly selected packed algorithm. The FLINT resource remains the
    canonical representation.
    """

    def __init__(self, resource: Any) -> None:
        self.resource = resource


def _dense_integer_flint_module() -> Any:
    """Load declared-FLINT packed integer algorithms lazily."""
    global _dense_integer_flint_module_cache
    if _dense_integer_flint_module_cache is runtime.undefined:
        _dense_integer_flint_module_cache = __import__(
            "sagejs.kernels.matrix.dense_integer_flint",
            fromlist=["dense_integer_flint"],
        )
    return _dense_integer_flint_module_cache


def _dense_rational_kernel_module() -> Any:
    """Load source-transparent dense `QQ` structural kernels lazily."""
    global _dense_rational_kernel_module_cache
    if _dense_rational_kernel_module_cache is runtime.undefined:
        _dense_rational_kernel_module_cache = __import__(
            "sagejs.kernels.matrix.dense_rational", fromlist=["dense_rational"]
        )
    return _dense_rational_kernel_module_cache


def _dense_rational_flint_module() -> Any:
    """Load declared-FLINT packed rational algorithms lazily."""
    global _dense_rational_flint_module_cache
    if _dense_rational_flint_module_cache is runtime.undefined:
        _dense_rational_flint_module_cache = __import__(
            "sagejs.kernels.matrix.dense_rational_flint",
            fromlist=["dense_rational_flint"],
        )
    return _dense_rational_flint_module_cache


def _flint_ffi_module() -> Any:
    """Load generated safe FLINT resources without exposing package handles."""
    global _flint_ffi_module_cache
    if _flint_ffi_module_cache is runtime.undefined:
        _flint_ffi_module_cache = __import__("sagejs.ffi.flint", fromlist=["flint"])
    return _flint_ffi_module_cache


def _m4ri_ffi_module() -> Any:
    """Load generated safe M4RI resources without exposing package handles."""
    global _m4ri_ffi_module_cache
    if _m4ri_ffi_module_cache is runtime.undefined:
        _m4ri_ffi_module_cache = __import__("sagejs.ffi.m4ri", fromlist=["m4ri"])
    return _m4ri_ffi_module_cache


def _m4ri_available() -> bool:
    """Return the stable process capability for generated M4RI resources."""
    global _m4ri_available_cache
    if _m4ri_available_cache is runtime.undefined:
        try:
            _m4ri_available_cache = bool(_m4ri_ffi_module().available())
        except Exception:
            _m4ri_available_cache = False
    return bool(_m4ri_available_cache)


def _dense_prime_kernel_module() -> Any:
    """Load the source-transparent dense `GF(p)` kernel lazily."""
    # ``matrix.py`` is part of the bootstrap baselib, which is evaluated
    # before public library modules.  Calling Python's import protocol here
    # delays that dependency without exposing a JavaScript loader to this
    # mathematical module. Standalone workers embed this named dependency.
    global _dense_prime_kernel_module_cache
    if _dense_prime_kernel_module_cache is runtime.undefined:
        _dense_prime_kernel_module_cache = __import__(
            "sagejs.kernels.matrix.dense_prime_field",
            fromlist=["dense_prime_field"],
        )
    return _dense_prime_kernel_module_cache


def _dense_prime_flint_module() -> Any:
    """Load declared-FLINT packed matrix functions lazily."""
    global _dense_prime_flint_module_cache
    if _dense_prime_flint_module_cache is runtime.undefined:
        _dense_prime_flint_module_cache = __import__(
            "sagejs.kernels.matrix.dense_prime_field_flint",
            fromlist=["dense_prime_field_flint"],
        )
    return _dense_prime_flint_module_cache


def _dense_prime_fflas_module() -> Any:
    """Load optional declared-FFLAS packed matrix accelerators lazily."""
    global _dense_prime_fflas_module_cache
    if _dense_prime_fflas_module_cache is runtime.undefined:
        _dense_prime_fflas_module_cache = __import__(
            "sagejs.kernels.matrix.dense_prime_field_fflas",
            fromlist=["dense_prime_field_fflas"],
        )
    return _dense_prime_fflas_module_cache


def _dense_word_prime_flint_module() -> Any:
    """Load typed kernels that borrow generated word-prime resources."""
    global _dense_word_prime_flint_module_cache
    if _dense_word_prime_flint_module_cache is runtime.undefined:
        _dense_word_prime_flint_module_cache = __import__(
            "sagejs.kernels.matrix.dense_word_prime_flint",
            fromlist=["dense_word_prime_flint"],
        )
    return _dense_word_prime_flint_module_cache


def _dense_binary_m4ri_kernel_module() -> Any:
    """Load source-transparent kernels that borrow M4RI resources."""
    global _dense_binary_m4ri_kernel_module_cache
    if _dense_binary_m4ri_kernel_module_cache is runtime.undefined:
        _dense_binary_m4ri_kernel_module_cache = __import__(
            "sagejs.kernels.matrix.dense_binary_m4ri",
            fromlist=["dense_binary_m4ri"],
        )
    return _dense_binary_m4ri_kernel_module_cache


def _matrix_selection_module() -> Any:
    """Load public matrix selection execution lazily."""
    global _matrix_selection_module_cache
    if _matrix_selection_module_cache is runtime.undefined:
        _matrix_selection_module_cache = __import__(
            "sagejs.linear_algebra.matrix_selection_public",
            fromlist=["matrix_selection_public"],
        )
    return _matrix_selection_module_cache


def _matrix_selection_plans_module() -> Any:
    """Load host-neutral matrix selection plans lazily."""
    global _matrix_selection_plans_module_cache
    if _matrix_selection_plans_module_cache is runtime.undefined:
        _matrix_selection_plans_module_cache = __import__(
            "sagejs.linear_algebra.matrix_selection",
            fromlist=["matrix_selection"],
        )
    return _matrix_selection_plans_module_cache


def _matrix_vector_public_module() -> Any:
    """Load representation-aware matrix-vector execution lazily."""
    global _matrix_vector_public_module_cache
    if _matrix_vector_public_module_cache is runtime.undefined:
        _matrix_vector_public_module_cache = __import__(
            "sagejs.linear_algebra.matrix_vector_public",
            fromlist=["matrix_vector_public"],
        )
    return _matrix_vector_public_module_cache


def _exact_vector_public_module() -> Any:
    """Load generated-resource public exact-vector execution lazily."""
    global _exact_vector_public_module_cache
    if _exact_vector_public_module_cache is runtime.undefined:
        _exact_vector_public_module_cache = __import__(
            "sagejs.linear_algebra.exact_vector_public",
            fromlist=["exact_vector_public"],
        )
    return _exact_vector_public_module_cache


def _sparse_random_module() -> Any:
    """Load storage-neutral sparse random construction policy lazily."""
    global _sparse_random_module_cache
    if _sparse_random_module_cache is runtime.undefined:
        _sparse_random_module_cache = __import__(
            "sagejs.linear_algebra.sparse_random",
            fromlist=["sparse_random"],
        )
    return _sparse_random_module_cache


def _sparse_random_public_module() -> Any:
    """Load isolated sparse random storage executors lazily."""
    global _sparse_random_public_module_cache
    if _sparse_random_public_module_cache is runtime.undefined:
        _sparse_random_public_module_cache = __import__(
            "sagejs.linear_algebra.sparse_random_public",
            fromlist=["sparse_random_public"],
        )
    return _sparse_random_public_module_cache


def _native_kernel_available(kernel_function: Any) -> bool:
    return bool(getattr(kernel_function, "nativeAvailable", False))


def _declared_ffi_kernel(kernel_function: Any) -> bool:
    """Return whether a same-source fallback still crosses the packed FFI.

    Structural kernels intentionally use ordinary lists when machine code is
    unavailable. Declared-library wrappers are different: their Python body
    merely forwards to the checked FFI declaration, whose semantic contract
    requires the same packed buffers in both native and dynamic execution.
    """
    module = str(getattr(kernel_function, "__module__", ""))
    return module.startswith("sagejs.kernels.matrix.") and (
        module.endswith("_flint") or module.endswith("_fflas")
    )


def _fflas_packed_prime_available(modulus: int) -> bool:
    """Return whether exact Givaro `Modular<double>` supports this field."""
    if modulus >= _FFLAS_DOUBLE_MAX_MODULUS:
        return False
    try:
        kernel = _dense_prime_fflas_module().fflas_dense_prime_field_available
        return bool(kernel())
    except Exception:
        return False


def _use_fflas_matrix_mul(
    left_rows: int,
    inner: int,
    right_columns: int,
    modulus: int,
) -> bool:
    """Select FFLAS only beyond its measured small-prime crossover."""
    return min(left_rows, inner, right_columns) >= 32 and _fflas_packed_prime_available(
        modulus
    )


def _use_fflas_matrix_rref(rows: int, columns: int, modulus: int) -> bool:
    """Select FFPACK only beyond its measured small-prime crossover."""
    return min(rows, columns) >= 32 and _fflas_packed_prime_available(modulus)


def _use_fflas_matrix_rank(rows: int, columns: int, modulus: int) -> bool:
    """Select FFPACK rank only beyond its measured crossover with FLINT."""
    return min(rows, columns) >= 64 and _fflas_packed_prime_available(modulus)


def _use_fflas_matrix_right_nullspace(rows: int, columns: int, modulus: int) -> bool:
    """Select FFPACK beyond its measured canonical-nullspace crossover."""
    return min(rows, columns) >= 24 and _fflas_packed_prime_available(modulus)


def _typed_python_implementation(kernel_function: Any) -> str:
    return (
        "typed-python-isolated"
        if _native_kernel_available(kernel_function)
        else "dynamic-python-explicit"
    )


def _trace_dense_prime_selection(
    operation: str,
    implementation: str,
    rows: int,
    columns: int,
    modulus: int,
) -> None:
    """Report an explicitly requested production-kernel selection."""
    if (
        runtime.reflect.get(
            runtime.global_object,
            "__sagejs_native_trace_enabled__",
        )
        is True
    ):
        print(
            f"[sagejs native] Matrix.{operation} GF({modulus}) "
            f"{rows}x{columns} -> {implementation}"
        )


def _trace_dense_integer_selection(
    operation: str,
    implementation: str,
    rows: int,
    columns: int,
) -> None:
    if (
        runtime.reflect.get(
            runtime.global_object,
            "__sagejs_native_trace_enabled__",
        )
        is True
    ):
        print(
            f"[sagejs native] Matrix.{operation} ZZ "
            f"{rows}x{columns} -> {implementation}"
        )


def _trace_dense_rational_selection(
    operation: str,
    implementation: str,
    rows: int,
    columns: int,
) -> None:
    if (
        runtime.reflect.get(
            runtime.global_object,
            "__sagejs_native_trace_enabled__",
        )
        is True
    ):
        print(
            f"[sagejs native] Matrix.{operation} QQ "
            f"{rows}x{columns} -> {implementation}"
        )


def _is_packed_dense_prime_base(base: sage.Parent) -> bool:
    """Return whether canonical packed storage supports this prime field."""
    return (
        getattr(base, "_kind", None) == "GF"
        and int(_untyped(base).characteristic()) < _PACKED_PRIME_MAX_MODULUS
    )


def _is_word_prime_resource_base(base: sage.Parent) -> bool:
    """Return whether generated FLINT resource storage supports `GF(p)`."""
    if getattr(base, "_kind", None) != "GF":
        return False
    modulus = int(_untyped(base).characteristic())
    # Byte-sized prime fields keep compiler-owned packed storage, the fast
    # exact Modular<float> input for FFLAS/FFPACK. General word primes use
    # FLINT's mature canonical nmod_mat representation; merely fitting exactly
    # in Modular<double> is not sufficient to make conversion competitive.
    # The Node adapter and FLINT resources in this release are 64-bit. Wasm32
    # FLINT has 32-bit `ulong`; large moduli must remain on the portable packed
    # path until an arbitrary-prime matrix resource is available there.
    process = runtime.reflect.get(runtime.global_object, "process")
    versions = (
        runtime.undefined
        if process is runtime.undefined
        else runtime.reflect.get(process, "versions")
    )
    node = (
        runtime.undefined
        if versions is runtime.undefined
        else runtime.reflect.get(versions, "node")
    )
    return (
        node is not runtime.undefined
        and _PACKED_PRIME_MAX_MODULUS <= modulus <= 0xFFFFFFFFFFFFFFFF
    )


def _is_dense_prime_base(base: sage.Parent) -> bool:
    return _is_packed_dense_prime_base(base) or _is_word_prime_resource_base(base)


def _is_dense_binary_base(base: sage.Parent) -> bool:
    """Return whether `base` is the prime field `GF(2)`."""
    return (
        _is_packed_dense_prime_base(base) and int(_untyped(base).characteristic()) == 2
    )


def _uses_m4ri_resource(base: sage.Parent) -> bool:
    """Return whether canonical M4RI storage is available for this base."""
    return _is_dense_binary_base(base) and _m4ri_available()


def _uses_dense_prime_kernel(base: sage.Parent) -> bool:
    """Return whether the packed compiler ABI supports this prime field."""
    return _is_packed_dense_prime_base(base)


def _dense_prime_buffer(kernel_function: Any, source: Any) -> Any:
    """Return the public packed buffer expected by a compiled kernel."""
    if _native_kernel_available(kernel_function):
        adapter = getattr(kernel_function, "asUInt64Buffer", None)
        if callable(adapter):
            return adapter(source)
        factory = getattr(kernel_function, "createUInt64Buffer", None)
        if callable(factory):
            return factory(source)
    if _declared_ffi_kernel(kernel_function):
        return runtime.uint64_buffer(source)
    return list(source)


def _dense_prime_zeros(kernel_function: Any, length: int) -> Any:
    """Allocate caller-owned packed output or dynamic fallback storage."""
    if _native_kernel_available(kernel_function):
        factory = getattr(kernel_function, "createUInt64Buffer", None)
        if callable(factory):
            return factory(length)
    if _declared_ffi_kernel(kernel_function):
        return runtime.uint64_buffer(length)
    return [0 for _index in range(length)]


def _dense_signed_zeros(kernel_function: Any, length: int) -> Any:
    """Allocate packed signed output for an exact borrowed-resource kernel."""
    if _native_kernel_available(kernel_function):
        factory = getattr(kernel_function, "createInt64Buffer", None)
        if callable(factory):
            return factory(length)
    return [0 for _index in range(length)]


def _dense_signed_buffer(kernel_function: Any, source: Any) -> Any:
    """Pack signed machine values for one source-transparent call."""
    if _native_kernel_available(kernel_function):
        factory = getattr(kernel_function, "createInt64Buffer", None)
        if callable(factory):
            return factory(source)
    return [int(value) for value in source]


def _matrix_integer_word_capacity(source: Any) -> int:
    capacity = runtime.reflect.get(source, "wordCapacity")
    if capacity is not runtime.undefined:
        return int(capacity)
    maximum = 1
    for value in source:
        magnitude = abs(int(value))
        words = max(1, (magnitude.bit_length() + 63) // 64)
        maximum = max(maximum, words)
    return maximum


def _integer_used_word_capacity(source: Any) -> int:
    """Return the largest limb count actually occupied by any entry."""
    sizes = runtime.reflect.get(source, "sizes")
    if sizes is runtime.undefined:
        return _matrix_integer_word_capacity(source)
    return runtime.integer_buffer_used_word_capacity(source)


def _integer_buffer_length(source: Any) -> int:
    length = runtime.reflect.get(source, "length")
    return len(source) if length is runtime.undefined else int(length)


def _integer_value_capacity(value: Any) -> int:
    magnitude = abs(int(value))
    return max(1, (magnitude.bit_length() + 63) // 64)


def _dense_integer_buffer(
    kernel_function: Any,
    source: Any,
    minimum_word_capacity: int = 1,
) -> Any:
    """Return the representation expected by this kernel implementation."""
    if _native_kernel_available(kernel_function):
        return runtime.integer_buffer(source, minimum_word_capacity)
    if _declared_ffi_kernel(kernel_function):
        return runtime.integer_buffer(source, minimum_word_capacity)
    return [int(value) for value in _integer_buffer_values(source)]


def _owned_integer_buffer(source: Any, minimum_word_capacity: int = 1) -> Any:
    """Return canonical compiler-owned storage independent of kernel choice."""
    capacity = runtime.reflect.get(source, "wordCapacity")
    if capacity is not runtime.undefined and int(capacity) >= minimum_word_capacity:
        return source
    return runtime.integer_buffer(source, minimum_word_capacity)


def _dense_integer_zeros(
    kernel_function: Any,
    length: int,
    word_capacity: int = 1,
) -> Any:
    if _native_kernel_available(kernel_function):
        factory = getattr(kernel_function, "createIntegerBuffer", None)
        if callable(factory):
            return runtime.reflect.apply(
                factory,
                runtime.undefined,
                [
                    length,
                    word_capacity,
                ],
            )
    if _declared_ffi_kernel(kernel_function):
        return runtime.integer_buffer([0 for _index in range(length)], word_capacity)
    return [0 for _index in range(length)]


def _compact_integer_buffer(source: Any) -> Any:
    """Shrink spare per-entry limbs without decoding exact values."""
    current = runtime.reflect.get(source, "wordCapacity")
    if current is runtime.undefined:
        source = _owned_integer_buffer(source)
        current = runtime.reflect.get(source, "wordCapacity")
    used = _integer_used_word_capacity(source)
    if used >= int(current) or int(current) < 8:
        return source
    return runtime.integer_buffer(source, used)


def _integer_buffer_values(source: Any) -> list[Any]:
    converter = runtime.reflect.get(source, "toArray")
    if runtime.jstype(converter) == "function":
        values = runtime.reflect.apply(converter, source, [])
    else:
        values = list(source)
    return [runtime.normalize_integer(value) for value in values]


def _integer_capacity_error(error: Exception) -> bool:
    return "IntegerBuffer word capacity exceeded" in str(error)


def _run_rational_output(
    kernel_function: Any,
    length: int,
    invoke: Any,
    initial_capacity: int,
) -> _PackedRationalStorage:
    """Retry a transactional rational result with wider component limbs."""
    capacity = max(1, initial_capacity)
    while True:
        numerators = _dense_integer_zeros(kernel_function, length, capacity)
        denominators = _dense_integer_zeros(kernel_function, length, capacity)
        try:
            invoke(numerators, denominators)
            return _PackedRationalStorage(
                _compact_integer_buffer(numerators),
                _compact_integer_buffer(denominators),
            )
        except Exception as error:
            if not _integer_capacity_error(error):
                raise
            capacity *= 2
            if capacity > 1048576:
                raise OverflowError(  # noqa: B904
                    "rational matrix output requires excessive limb capacity"
                )


def _packed_uint64(source: Any) -> Any:
    """Return canonical caller-owned packed storage on this host."""
    return runtime.uint64_buffer(source)


def _copy_packed_uint64(source: Any) -> Any:
    return runtime.uint64_buffer(source)


def _packed_uint64_prefix(source: Any, length: int) -> Any:
    if _is_packed_uint64(source):
        return runtime.uint64_buffer_prefix(source, length)
    return _packed_uint64([source[index] for index in range(length)])


def _packed_uint8(length: int) -> Any:
    constructor = runtime.reflect.get(runtime.global_object, "Uint8Array")
    return runtime.reflect.construct(constructor, [length])


def _packed_uint8_suffix(source: Any, offset: int) -> Any:
    """Return a copied `Uint8Array` suffix without a Python byte loop."""
    subarray = runtime.reflect.get(source, "subarray")
    view = runtime.reflect.apply(subarray, source, [offset])
    constructor = runtime.reflect.get(runtime.global_object, "Uint8Array")
    return runtime.reflect.construct(constructor, [view])


def _is_packed_uint64(value: Any) -> bool:
    constructor = runtime.reflect.get(runtime.global_object, "BigUint64Array")
    return runtime.instance_of(value, constructor)


def _untyped(value: Any) -> Any:
    return value


def _is_modular_base(value: object) -> bool:
    return getattr(value, "_kind", None) in ["GF", "ZMOD"]


def _is_extension_field_base(value: object) -> bool:
    return getattr(value, "_kind", None) == "GF_EXTENSION"


def _is_algebraic_base(value: object) -> bool:
    return getattr(value, "_kind", None) in ["AA", "QQBAR", "CyclotomicField"]


def _is_approximate_base(value: object) -> bool:
    return getattr(value, "_kind", None) in [
        "RDF",
        "RealField",
        "ComplexDoubleField",
        "ComplexField",
    ]


def _is_complex_base(value: object) -> bool:
    return getattr(value, "_kind", None) in [
        "ComplexDoubleField",
        "ComplexField",
    ]


def _is_base_ring(value: object) -> bool:
    return (
        value is sage.ZZ
        or value is sage.QQ
        or getattr(value, "_kind", None) == "ZZ"
        or getattr(value, "_kind", None) == "QQ"
        or _is_modular_base(value)
        or _is_extension_field_base(value)
        or _is_algebraic_base(value)
        or _is_approximate_base(value)
    )


def _cyclotomic_order(value: Any) -> Any:
    return value.zeta_order()


def _canonical_base(base: sage.Parent) -> sage.Parent:
    if base is sage.ZZ or getattr(base, "_kind", None) == "ZZ":
        return sage.ZZ
    if base is sage.QQ or getattr(base, "_kind", None) == "QQ":
        return sage.QQ
    return base


def _base_for_values(values: list[Any]) -> sage.Parent:
    for value in values:
        if isinstance(value, sage.Rational):
            return sage.QQ
        parent = getattr(value, "_parent", None)
        if _is_algebraic_base(parent):
            return runtime.reflect.get(value, "_parent")
        if _is_approximate_base(parent):
            return runtime.reflect.get(value, "_parent")
        if _is_modular_base(parent) or _is_extension_field_base(parent):
            return _canonical_base(runtime.reflect.get(value, "_parent"))
        if runtime.jstype(value) == "number" and not runtime.number.isSafeInteger(
            value
        ):
            return runtime.reflect.get(runtime.global_object, "RDF")
    return sage.ZZ


def _approximate_precision(base: sage.Parent) -> int:
    return int(_untyped(base).precision())


def _complex_field(precision: int) -> sage.Parent:
    constructor = runtime.reflect.get(runtime.global_object, "ComplexField")
    return constructor(precision)


def _complex_result_base(base: sage.Parent) -> sage.Parent:
    if getattr(base, "_kind", None) == "RDF":
        return runtime.reflect.get(runtime.global_object, "CDF")
    return _complex_field(_approximate_precision(base))


def _coerce_values(
    base: sage.Parent,
    values: list[Any],
) -> list[Any]:
    answer = []
    for value in values:
        answer.append(base(value))
    return answer


def _matrix_row_values(row: Any) -> list[Any]:
    """Materialize one row after the outer nested-row check."""
    return list(row)


def _prime_residue_values(
    base: sage.Parent,
    values: Any,
) -> Any:
    """Coerce values once into canonical caller-owned `uint64` storage."""
    modulus = int(_untyped(base).characteristic())
    packed = runtime.uint64_residue_buffer(values, modulus)
    if packed is not runtime.undefined:
        return packed
    residues = []
    for value in values:
        if runtime.is_exact_integer(value):
            residue = int(value) % modulus
        elif getattr(value, "_parent", None) is base:
            residue = int(_untyped(value)._value)
        else:
            residue = int(_untyped(base(value))._value)
        residues.append(residue)
    return _packed_uint64(residues)


def _prime_residue_value(base: sage.Parent, value: Any) -> int:
    """Coerce one value to a canonical residue without temporary storage."""
    if getattr(value, "_parent", None) is base:
        return int(_untyped(value)._value)
    modulus = int(_untyped(base)._modulus)
    if runtime.is_exact_integer(value):
        return int(value) % modulus
    return int(_untyped(base(value))._value)


def _native_matrix(
    base: sage.Parent,
    rows: int,
    cols: int,
    values: list[Any],
) -> Any:
    backend = runtime.flint_backend()
    if base is sage.ZZ:
        raise RuntimeError(
            "dense ZZ matrices must use compiler-owned IntegerBuffer storage"
        )
    if base is sage.QQ:
        raise RuntimeError(
            "dense QQ matrices must use compiler-owned RationalBuffer storage"
        )
    if _is_algebraic_base(base):
        entries = []
        for value in values:
            entries.append(runtime.reflect.get(base(value), "_native"))
        return backend.qqbarMatrix(
            rows,
            cols,
            entries,
            getattr(base, "_kind", None) == "AA",
        )
    if _is_extension_field_base(base):
        entries = []
        for value in values:
            entries.append(runtime.reflect.get(base(value), "_native"))
        return backend.fqMatrix(
            runtime.reflect.get(base, "_nativeContext"),
            rows,
            cols,
            entries,
        )
    if _is_modular_base(base):
        entries = []
        for value in values:
            entries.append(base(value)._value)
        if getattr(base, "_kind", None) == "ZMOD":
            return backend.zmodMatrix(rows, cols, entries, base._modulus)
        return backend.nmodMatrix(rows, cols, entries, base._modulus)
    if _is_approximate_base(base):
        field = _complex_field(_approximate_precision(base))
        entries = []
        for value in values:
            entries.append(runtime.reflect.get(field(value), "_native"))
        return backend.acbMatrix(
            rows,
            cols,
            entries,
            _approximate_precision(base),
        )
    raise TypeError(
        "matrices currently require ZZ, QQ, AA, QQbar, GF, Zmod, "
        "or a real/complex field"
    )


def _rational_result(value: Any) -> sage.Rational:
    return runtime.rational_class(
        runtime.reflect.get(value, "numerator"),
        runtime.reflect.get(value, "denominator"),
    )


def _compare_exact_eigenvalues(left: Any, right: Any) -> int:
    """Compare exact eigenvalues in Sage.js's presentation order.

    Eigenvalues are roots of the declared packed characteristic polynomial.
    Ordering is host-level presentation policy rather than part of the FLINT
    matrix ABI: real values come first in decreasing order, followed by
    complex values ordered by decreasing real part, increasing absolute
    imaginary part, and then imaginary sign.
    """
    left_real = left.is_real()
    right_real = right.is_real()
    if left_real != right_real:
        if left_real:
            return -1
        return 1
    left_part = left.real()
    right_part = right.real()
    if left_part > right_part:
        return -1
    if left_part < right_part:
        return 1
    left_imaginary = left.imag()
    right_imaginary = right.imag()
    left_absolute = abs(left_imaginary)
    right_absolute = abs(right_imaginary)
    if left_absolute < right_absolute:
        return -1
    if left_absolute > right_absolute:
        return 1
    if left_imaginary < right_imaginary:
        return -1
    if left_imaginary > right_imaginary:
        return 1
    return 0


def _order_exact_eigenvalues(values: list[Any]) -> list[Any]:
    """Stable insertion sort for the small exact algebraic result list."""
    answer = []
    for value in values:
        position = len(answer)
        while (
            position > 0 and _compare_exact_eigenvalues(value, answer[position - 1]) < 0
        ):
            position -= 1
        answer.insert(position, value)
    return answer


def _entry_from_native(base: sage.Parent, value: Any) -> Any:
    if base is sage.ZZ:
        return runtime.normalize_integer(value)
    if _is_algebraic_base(base):
        return _untyped(base)._from_native(value)
    if _is_extension_field_base(base):
        return _untyped(base)._from_native(value)
    if _is_modular_base(base):
        return base(value)
    if _is_approximate_base(base):
        field = _complex_field(_approximate_precision(base))
        complex_value = _untyped(field)._fromNative(value)
        if _is_complex_base(base):
            return _untyped(base)._fromNative(value)
        if getattr(base, "_kind", None) == "RDF":
            return float(complex_value.real())
        return complex_value.real()
    return _rational_result(value)


def _common_base(
    left: sage.Parent,
    right: sage.Parent,
) -> sage.Parent:
    if left is right:
        return left
    if _is_algebraic_base(left) or _is_algebraic_base(right):
        if left is sage.ZZ or left is sage.QQ:
            return right
        if right is sage.ZZ or right is sage.QQ:
            return left
        if _is_algebraic_base(left) and _is_algebraic_base(right):
            if getattr(left, "_kind", None) == "QQBAR":
                return left
            if getattr(right, "_kind", None) == "QQBAR":
                return right
            return left
    if _is_approximate_base(left) or _is_approximate_base(right):
        if left is sage.ZZ or left is sage.QQ:
            return right
        if right is sage.ZZ or right is sage.QQ:
            return left
        if _is_approximate_base(left) and _is_approximate_base(right):
            precision = max(
                _approximate_precision(left),
                _approximate_precision(right),
            )
            if _is_complex_base(left) or _is_complex_base(right):
                if (
                    precision == 53
                    and getattr(left, "_kind", None) == "ComplexDoubleField"
                    and getattr(right, "_kind", None) == "ComplexDoubleField"
                ):
                    return left
                return _complex_field(precision)
            if (
                precision == 53
                and getattr(left, "_kind", None) == "RDF"
                and getattr(right, "_kind", None) == "RDF"
            ):
                return left
            real_field = runtime.reflect.get(runtime.global_object, "RealField")
            return real_field(precision)
    if (left is sage.ZZ and right is sage.QQ) or (left is sage.QQ and right is sage.ZZ):
        return sage.QQ
    if _is_modular_base(left):
        if right is sage.ZZ:
            return left
        if _is_modular_base(right) and left is right:
            return left
    if _is_modular_base(right) and left is sage.ZZ:
        return right
    if _is_extension_field_base(left):
        if right is sage.ZZ:
            return left
        if _is_extension_field_base(right) and left is right:
            return left
    if _is_extension_field_base(right) and left is sage.ZZ:
        return right
    raise TypeError(
        "no canonical coercion between matrix base rings "
        + str(left)
        + " and "
        + str(right)
    )


def _scalar_parts(value: Any) -> tuple[sage.Parent, int, int]:
    if isinstance(value, sage.Rational):
        return (sage.QQ, value._numerator, value._denominator)
    if runtime.is_exact_integer(value):
        return (sage.ZZ, runtime.integer_bigint(value), runtime.bigint(1))
    rational = sage.QQ(value)
    return (sage.QQ, rational._numerator, rational._denominator)


def _matrix_scalar_parts(
    base: sage.Parent,
    value: Any,
) -> tuple[sage.Parent, int, int]:
    if _is_modular_base(base):
        scalar = base(value)
        return (base, scalar._value, runtime.bigint(1))
    if _is_extension_field_base(base):
        return (base, 0, 1)
    if _is_algebraic_base(base):
        return (base, 0, 1)
    if _is_approximate_base(base):
        return (base, 0, 1)
    parent = getattr(value, "_parent", None)
    if _is_extension_field_base(parent):
        return (runtime.reflect.get(value, "_parent"), 0, 1)
    if _is_algebraic_base(parent):
        return (runtime.reflect.get(value, "_parent"), 0, 1)
    return _scalar_parts(value)


def _normalize_index(index: int, length: int) -> int:
    if index < 0:
        index += length
    if index < 0 or index >= length:
        raise IndexError("matrix index out of range")
    return index


def _normalize_named_index(
    index: int,
    length: int,
    kind: str,
) -> int:
    if index < 0:
        index += length
    if index < 0 or index >= length:
        raise IndexError(kind + " index out of range")
    return index


def _approximate_value_from_native(
    base: sage.Parent,
    native_value: Any,
    force_complex: bool = False,
) -> Any:
    precision = _approximate_precision(base)
    complex_field = _complex_field(precision)
    value = _untyped(complex_field)._fromNative(native_value)
    if not force_complex and float(value.imag()) == 0 and not _is_complex_base(base):
        if getattr(base, "_kind", None) == "RDF":
            return float(value.real())
        return value.real()
    if _is_complex_base(base):
        return _untyped(base)._fromNative(native_value)
    return _untyped(_complex_result_base(base))._fromNative(native_value)


def _approximate_vector_from_native(
    base: sage.Parent,
    native_values: list[Any],
    force_complex: bool,
) -> Vector:
    values = [
        _approximate_value_from_native(base, value, force_complex)
        for value in native_values
    ]
    vector_base = base
    if force_complex and not _is_complex_base(vector_base):
        vector_base = _complex_result_base(vector_base)
    return VectorSpace(vector_base, len(values))(values)


@runtime.callable_instance_class
class MatrixSpaceParent(sage.Parent):
    def __init__(
        self,
        base: sage.Parent,
        rows: int,
        cols: int,
        sparse: bool = False,
    ) -> None:
        self._base = base
        self._rows = rows
        self._cols = cols
        self._sparse = sparse
        self._name = (
            "Full MatrixSpace of "
            + str(rows)
            + " by "
            + str(cols)
            + (" sparse matrices over " if sparse else " dense matrices over ")
            + str(base)
        )
        self._construction = {
            "kind": "matrix",
            "base": base,
            "rows": rows,
            "cols": cols,
            "sparse": sparse,
        }

    def base_ring(self) -> sage.Parent:
        return self._base

    def nrows(self) -> int:
        return self._rows

    def ncols(self) -> int:
        return self._cols

    def zero_matrix(self) -> Matrix:
        return self(0)

    zero = zero_matrix

    def _from_native(self, native_value: Any) -> Matrix:
        """Construct an element from a trusted native matrix handle."""
        if (
            self._base is sage.ZZ
            or self._base is sage.QQ
            or _is_word_prime_resource_base(self._base)
        ):
            raise RuntimeError(
                "dense exact matrices cannot be constructed from N-API handles"
            )
        return Matrix(self, native_value)

    def _from_packed_residues(
        self,
        entries: Any,
        width: int,
    ) -> Matrix:
        """Construct a modular matrix from packed little-endian residues."""
        if _is_dense_prime_base(self._base):
            count = self._rows * self._cols
            if width not in [1, 2, 4, 8]:
                raise ValueError("unsupported packed residue width")
            if len(entries) != count * width:
                raise ValueError(
                    "packed matrix residue count does not match dimensions"
                )
            if _uses_m4ri_resource(self._base) and width == 1:
                ffi = _m4ri_ffi_module()
                region = ffi.M4riByteRegion.from_bytes(entries)
                try:
                    resource = ffi.matrix_from_sagepack_bytes(
                        region,
                        self._rows,
                        self._cols,
                    )
                finally:
                    region.close()
                return self._from_m4ri_matrix_resource(resource)
            values = runtime.uint64_unpack_le(entries, width, count)
            return self._from_uint64_residues(values)
        backend = runtime.flint_backend()
        if getattr(self._base, "_kind", None) == "ZMOD":
            native = backend.zmodMatrixPacked(
                self._rows,
                self._cols,
                entries,
                width,
                self._base._modulus,
            )
        else:
            native = backend.nmodMatrixPacked(
                self._rows,
                self._cols,
                entries,
                width,
                self._base._modulus,
            )
        return Matrix(self, native)

    def _from_uint64_residues(self, entries: Any) -> Matrix:
        """Construct `GF(p)` storage from canonical row-major residues."""
        if not _is_dense_prime_base(self._base):
            raise TypeError("uint64 residues require a prime field")
        if len(entries) != self._rows * self._cols:
            raise ValueError("matrix residue count does not match dimensions")
        storage = _prime_residue_values(self._base, entries)
        if _is_word_prime_resource_base(self._base):
            resource = _flint_ffi_module().nmod_matrix_from_entries(
                storage,
                len(storage),
                self._rows,
                self._cols,
                int(_untyped(self._base).characteristic()),
            )
            return self._from_nmod_matrix_resource(resource)
        return self._from_canonical_uint64_residues(storage)

    def _from_canonical_uint64_residues(self, entries: Any) -> Matrix:
        """Take ownership of trusted canonical packed prime-field entries."""
        if not _is_packed_dense_prime_base(self._base):
            raise TypeError("uint64 residues require a small prime field")
        if len(entries) != self._rows * self._cols:
            raise ValueError("matrix residue count does not match dimensions")
        if not _is_packed_uint64(entries):
            entries = _packed_uint64(entries)
        if _uses_m4ri_resource(self._base):
            ffi = _m4ri_ffi_module()
            region = ffi.M4riByteRegion.from_bytes(runtime.uint64_pack_le(entries, 1))
            try:
                resource = ffi.matrix_from_sagepack_bytes(
                    region,
                    self._rows,
                    self._cols,
                )
            finally:
                region.close()
            return self._from_m4ri_matrix_resource(resource)
        return Matrix(self, entries)

    def _from_nmod_matrix_resource(self, resource: Any) -> Matrix:
        """Take ownership of a checked generated word-prime matrix."""
        if not _is_word_prime_resource_base(self._base):
            resource.close()
            raise TypeError("FLINT nmod matrix storage requires a word prime field")
        ffi = _flint_ffi_module()
        if (
            int(ffi.nmod_matrix_nrows(resource)) != self._rows
            or int(ffi.nmod_matrix_ncols(resource)) != self._cols
            or int(ffi.nmod_matrix_modulus(resource))
            != int(_untyped(self._base).characteristic())
        ):
            resource.close()
            raise ValueError("word-prime matrix resource parent does not agree")
        return Matrix(self, _NmodMatrixResourceStorage(resource))

    def _from_m4ri_matrix_resource(self, resource: Any) -> Matrix:
        """Take ownership of a checked generated M4RI matrix resource."""
        if not _is_dense_binary_base(self._base):
            resource.close()
            raise TypeError("M4RI matrix storage requires GF(2)")
        ffi = _m4ri_ffi_module()
        if (
            runtime.number(ffi.matrix_nrows(resource)) != self._rows
            or runtime.number(ffi.matrix_ncols(resource)) != self._cols
        ):
            resource.close()
            raise ValueError("M4RI matrix resource dimensions do not agree")
        return Matrix(self, _M4riMatrixResourceStorage(resource))

    def _from_packed_integers(self, entries: Any) -> Matrix:
        """Construct an integer matrix from packed signed magnitudes."""
        if self._base is not sage.ZZ:
            raise TypeError("packed integer storage requires ZZ")
        ffi = _flint_ffi_module()
        region = ffi.FlintByteRegion.from_bytes(entries)
        try:
            resource = ffi.fmpz_matrix_deserialize_entries(
                region,
                self._rows,
                self._cols,
            )
            try:
                return Matrix(self, _FmpzMatrixResourceStorage(resource))
            except Exception:
                resource.close()
                raise
        finally:
            region.close()

    def _from_integer_values(self, entries: Any) -> Matrix:
        """Coerce row-major entries into an owned `FmpzMatrix` resource."""
        if self._base is not sage.ZZ:
            raise TypeError("integer storage requires ZZ")
        if len(entries) != self._rows * self._cols:
            raise ValueError("matrix entry count does not match dimensions")
        values = runtime.undefined
        try:
            packed = runtime.exact_integer_values_to_packed_bytes(entries)
        except Exception:
            # General Sage coercion remains the semantic fallback for
            # rationals, ring elements, and arbitrary iterable entries.
            packed = runtime.undefined
        if packed is runtime.undefined:
            values = [sage.ZZ(entries[index]) for index in range(len(entries))]
            packed = runtime.exact_integer_values_to_packed_bytes(values)
        return self._from_packed_integers(packed)

    def _from_canonical_integer_entries(self, entries: Any) -> Matrix:
        """Bulk-import trusted exact entries into an owned FLINT resource."""
        if self._base is not sage.ZZ:
            raise TypeError("integer storage requires ZZ")
        if _integer_buffer_length(entries) != self._rows * self._cols:
            raise ValueError("matrix entry count does not match dimensions")
        ffi = _flint_ffi_module()
        kernel = _dense_integer_flint_module().flint_dense_integer_resource_import
        resource = ffi.fmpz_matrix(self._rows, self._cols)
        try:
            if _native_kernel_available(kernel):
                source = _dense_integer_buffer(kernel, entries, 1)
                if not kernel(resource, source, self._rows, self._cols):
                    raise ValueError("invalid integer matrix entry data")
            else:
                # Native-disabled execution is a correctness fallback. Keep
                # the normal production path bulk and host-isolated, while
                # making the explicit diagnostic mode independent of compiled
                # resource/aggregate lowering.
                values = _integer_buffer_values(entries)
                for row in range(self._rows):
                    for column in range(self._cols):
                        ffi.fmpz_matrix_set_entry(
                            resource,
                            row,
                            column,
                            values[row * self._cols + column],
                        )
            return Matrix(self, _FmpzMatrixResourceStorage(resource))
        except Exception:
            resource.close()
            raise

    def _from_fmpz_matrix_resource(self, resource: Any) -> Matrix:
        """Take ownership of a checked generated FLINT matrix resource."""
        if self._base is not sage.ZZ:
            resource.close()
            raise TypeError("FLINT integer matrix storage requires ZZ")
        ffi = _flint_ffi_module()
        if (
            runtime.number(ffi.fmpz_matrix_nrows(resource)) != self._rows
            or runtime.number(ffi.fmpz_matrix_ncols(resource)) != self._cols
        ):
            resource.close()
            raise ValueError("integer matrix resource dimensions do not agree")
        return Matrix(self, _FmpzMatrixResourceStorage(resource))

    def _from_same_shape_fmpz_matrix_resource(self, resource: Any) -> Matrix:
        """Adopt a generated result whose declaration preserves dimensions."""
        if self._base is not sage.ZZ:
            resource.close()
            raise TypeError("FLINT integer matrix storage requires ZZ")
        try:
            return Matrix(self, _FmpzMatrixResourceStorage(resource))
        except Exception:
            resource.close()
            raise

    def _from_packed_rationals(self, entries: Any) -> Matrix:
        """Construct a rational matrix from packed numerator/denominator data."""
        if self._base is not sage.QQ:
            raise TypeError("packed rational storage requires QQ")
        ffi = _flint_ffi_module()
        region = ffi.FlintByteRegion.from_bytes(entries)
        try:
            resource = ffi.fmpq_matrix_deserialize(
                region,
                self._rows,
                self._cols,
            )
            try:
                return Matrix(self, _FmpqMatrixResourceStorage(resource))
            except Exception:
                resource.close()
                raise
        finally:
            region.close()

    def _from_rational_values(self, entries: Any) -> Matrix:
        """Coerce and pack row-major entries for a dense `QQ` matrix."""
        if self._base is not sage.QQ:
            raise TypeError("rational storage requires QQ")
        if len(entries) != self._rows * self._cols:
            raise ValueError("matrix entry count does not match dimensions")
        if type(entries) is list:
            try:
                packed_integers = runtime.exact_integer_values_to_packed_bytes(entries)
            except TypeError:
                packed_integers = runtime.undefined
            if packed_integers is not runtime.undefined:
                ffi = _flint_ffi_module()
                region = ffi.FlintByteRegion.from_bytes(packed_integers)
                integer_resource = runtime.undefined
                try:
                    integer_resource = ffi.fmpz_matrix_deserialize_entries(
                        region,
                        self._rows,
                        self._cols,
                    )
                    rational_resource = ffi.fmpq_matrix_from_fmpz(integer_resource)
                    try:
                        return self._from_fmpq_matrix_resource(rational_resource)
                    except Exception:
                        rational_resource.close()
                        raise
                finally:
                    if integer_resource is not runtime.undefined:
                        integer_resource.close()
                    region.close()
            packed_rationals = runtime.canonical_rational_values_to_packed_bytes(
                entries,
                _untyped(sage.Rational),
                sage.QQ,
            )
            if packed_rationals is not runtime.undefined:
                return self._from_packed_rationals(packed_rationals)
        parts = []
        for entry in entries:
            if runtime.is_exact_integer(entry):
                parts.append(entry)
                parts.append(1)
            elif getattr(entry, "_parent", None) is sage.QQ:
                parts.append(_untyped(entry)._numerator)
                parts.append(_untyped(entry)._denominator)
            else:
                rational = sage.QQ(entry)
                parts.append(rational._numerator)
                parts.append(rational._denominator)
        return self._from_packed_rationals(
            runtime.exact_integer_values_to_packed_bytes(parts)
        )

    def _from_rational_parts(
        self,
        numerators: Any,
        denominators: Any,
    ) -> Matrix:
        """Normalize and own explicit rational numerator/denominator parts."""
        if self._base is not sage.QQ:
            raise TypeError("rational storage requires QQ")
        count = self._rows * self._cols
        if len(numerators) != count or len(denominators) != count:
            raise ValueError("rational matrix component lengths differ")
        parts = []
        for index in range(count):
            rational = _untyped(sage.QQ)(numerators[index], denominators[index])
            parts.append(rational._numerator)
            parts.append(rational._denominator)
        return self._from_packed_rationals(
            runtime.exact_integer_values_to_packed_bytes(parts)
        )

    def _from_canonical_rational_entries(
        self,
        numerators: Any,
        denominators: Any,
    ) -> Matrix:
        """Take ownership of trusted normalized rational component buffers."""
        if self._base is not sage.QQ:
            raise TypeError("rational storage requires QQ")
        count = self._rows * self._cols
        if (
            _integer_buffer_length(numerators) != count
            or _integer_buffer_length(denominators) != count
        ):
            raise ValueError("rational matrix component lengths differ")
        ffi = _flint_ffi_module()
        kernel = _dense_rational_flint_module().flint_dense_rational_matrix_import
        resource = ffi.fmpq_matrix(self._rows, self._cols)
        try:
            if _native_kernel_available(kernel):
                numerator_buffer = _dense_integer_buffer(kernel, numerators, 1)
                denominator_buffer = _dense_integer_buffer(kernel, denominators, 1)
            else:
                numerator_buffer = _integer_buffer_values(numerators)
                denominator_buffer = _integer_buffer_values(denominators)
            if not kernel(
                resource,
                numerator_buffer,
                denominator_buffer,
                self._rows,
                self._cols,
            ):
                raise ValueError("invalid rational matrix component data")
            return Matrix(self, _FmpqMatrixResourceStorage(resource))
        except Exception:
            resource.close()
            raise

    def _from_fmpq_matrix_resource(self, resource: Any) -> Matrix:
        """Take ownership of a checked generated FLINT matrix resource."""
        if self._base is not sage.QQ:
            resource.close()
            raise TypeError("FLINT rational matrix storage requires QQ")
        ffi = _flint_ffi_module()
        if (
            runtime.number(ffi.fmpq_matrix_nrows(resource)) != self._rows
            or runtime.number(ffi.fmpq_matrix_ncols(resource)) != self._cols
        ):
            resource.close()
            raise ValueError("rational matrix resource dimensions do not agree")
        return Matrix(self, _FmpqMatrixResourceStorage(resource))

    def _from_same_shape_fmpq_matrix_resource(self, resource: Any) -> Matrix:
        """Adopt a generated result whose declaration preserves dimensions."""
        if self._base is not sage.QQ:
            resource.close()
            raise TypeError("FLINT rational matrix storage requires QQ")
        try:
            return Matrix(self, _FmpqMatrixResourceStorage(resource))
        except Exception:
            resource.close()
            raise

    def identity_matrix(self) -> Matrix:
        if self._rows != self._cols:
            raise TypeError("identity matrix must be square")
        return identity_matrix(self._base, self._rows)

    one = identity_matrix

    def basis(self) -> MatrixBasis:
        return MatrixBasis(self)

    def random_element(
        self,
        density: float = 1.0,
        x: int = -2,
        y: int = 2,
    ) -> Matrix:
        probability = float(density)
        if probability < 0 or probability > 1:
            raise ValueError("density must be between 0 and 1")
        if probability == 1 and not self._sparse:
            count = self._rows * self._cols
            if _is_word_prime_resource_base(self._base):
                seed1 = _random_int(0, 4294967295)
                seed2 = _random_int(0, 4294967295)
                resource = _flint_ffi_module().nmod_matrix_random(
                    self._rows,
                    self._cols,
                    int(_untyped(self._base).characteristic()),
                    seed1,
                    seed2,
                )
                result = self._from_nmod_matrix_resource(resource)
                result._trace_word_prime_resource("random_element")
                return result
            if _is_packed_dense_prime_base(self._base):
                kernel = _dense_prime_kernel_module().dense_prime_field_matrix_space_random_fill
                storage = _dense_prime_zeros(kernel, count)
                if count != 0:
                    initial_state = runtime.normalize_integer(
                        _random_int(0, 4294967295)
                    )
                    final_state = kernel(
                        storage,
                        runtime.normalize_integer(
                            runtime.reflect.get(self._base, "_modulus")
                        ),
                        initial_state,
                    )
                    _set_random_word_state(final_state)
                _trace_dense_prime_selection(
                    "random_element",
                    _typed_python_implementation(kernel),
                    self._rows,
                    self._cols,
                    int(_untyped(self._base).characteristic()),
                )
                return self._from_canonical_uint64_residues(storage)
            if self._base is sage.ZZ or self._base is sage.QQ:
                resource = _matrix_space_full_density_integer_resource(
                    self._rows,
                    self._cols,
                    x,
                    y,
                )
                if resource is not runtime.undefined:
                    if self._base is sage.ZZ:
                        return self._from_fmpz_matrix_resource(resource)
                    ffi = _flint_ffi_module()
                    try:
                        rational_resource = ffi.fmpq_matrix_from_fmpz(resource)
                    finally:
                        resource.close()
                    _trace_dense_rational_selection(
                        "random_element",
                        "generated-fmpz-resource-promotion",
                        self._rows,
                        self._cols,
                    )
                    return self._from_fmpq_matrix_resource(rational_resource)
        entries = []
        for _index in range(self._rows * self._cols):
            if _random_float() > probability:
                entries.append(0)
            elif getattr(self._base, "_kind", None) in ["GF", "GF_EXTENSION", "ZMOD"]:
                entries.append(_random_int(0, int(_untyped(self._base).order()) - 1))
            else:
                entries.append(_random_int(x, y))
        return self(entries)

    def matrix_space(
        self,
        rows: Any = None,
        cols: Any = None,
    ) -> MatrixSpaceParent:
        rows = self._rows if rows is None else int(rows)
        cols = self._cols if cols is None else int(cols)
        return MatrixSpace(self._base, rows, cols)

    def __call__(self, entries: Any = 0) -> Matrix:
        if isinstance(entries, Matrix):
            if entries.nrows() != self._rows or entries.ncols() != self._cols:
                raise ValueError("matrix dimensions do not agree")
            return entries.change_ring(self._base)
        if runtime.is_exact_integer(entries) and entries == 0:
            if self._base is sage.ZZ:
                return self._from_fmpz_matrix_resource(
                    _flint_ffi_module().fmpz_matrix(self._rows, self._cols)
                )
            if self._base is sage.QQ:
                return self._from_fmpq_matrix_resource(
                    _flint_ffi_module().fmpq_matrix(self._rows, self._cols)
                )
            if _uses_m4ri_resource(self._base):
                return self._from_m4ri_matrix_resource(
                    _m4ri_ffi_module().matrix(self._rows, self._cols)
                )
            if _is_word_prime_resource_base(self._base):
                storage = _packed_uint64(self._rows * self._cols)
                return self._from_uint64_residues(storage)
            values = [0 for _ in range(self._rows * self._cols)]
        elif isinstance(entries, list):
            values = entries
        else:
            values = list(entries)
        if (
            len(values) == self._rows
            and len(values) > 0
            and isinstance(values[0], (list, tuple, Vector))
        ):
            flattened = []
            for row in values:
                row_values = _matrix_row_values(row)
                if len(row_values) != self._cols:
                    raise ValueError("matrix row length does not match its dimensions")
                flattened.extend(row_values)
            values = flattened
        if len(values) != self._rows * self._cols:
            raise ValueError("matrix entry count does not match its dimensions")
        if _is_dense_prime_base(self._base):
            storage = _prime_residue_values(self._base, values)
            return self._from_uint64_residues(storage)
        if self._base is sage.ZZ:
            return self._from_integer_values(values)
        if self._base is sage.QQ:
            return self._from_rational_values(values)
        coerced = _coerce_values(self._base, values)
        result = Matrix(
            self,
            _native_matrix(self._base, self._rows, self._cols, coerced),
        )
        return result


@runtime.callable_instance_class
class VectorSpaceParent(sage.Parent):
    def __init__(self, base: sage.Parent, degree: int) -> None:
        self._base = base
        self._degree = degree
        self._name = "Ambient free module of rank " + str(degree) + " over " + str(base)
        self._construction = {
            "kind": "vector",
            "base": base,
            "degree": degree,
        }

    def base_ring(self) -> sage.Parent:
        return self._base

    def degree(self) -> int:
        return self._degree

    def dimension(self) -> int:
        return self._degree

    def subspace(self, generators: Any) -> VectorSubspaceParent:
        rows = [self(generator) for generator in generators]
        entries = []
        for row in rows:
            entries.extend(row)
        source = matrix(
            self._base,
            len(rows),
            self._degree,
            entries,
        )
        return VectorSubspaceParent(
            self,
            _canonical_row_basis(source),
        )

    def __call__(self, entries: Any = 0) -> Vector:
        if isinstance(entries, Vector):
            if len(entries) != self._degree:
                raise ValueError("vector dimensions do not agree")
            return entries.change_ring(self._base)
        if runtime.is_exact_integer(entries) and entries == 0:
            values = [0 for _ in range(self._degree)]
        else:
            values = list(entries)
        if len(values) != self._degree:
            raise ValueError("vector entry count does not match its dimension")
        if self._base is sage.ZZ:
            coerced = _coerce_values(self._base, values)
            return self._from_fmpz_vector_resource(
                _exact_vector_public_module().integer_from_values(coerced)
            )
        if self._base is sage.QQ:
            coerced = _coerce_values(self._base, values)
            return self._from_fmpq_vector_resource(
                _exact_vector_public_module().rational_from_values(coerced)
            )
        return Vector(self, _coerce_values(self._base, values))

    def _from_fmpz_vector_resource(self, resource: Any) -> Vector:
        """Take ownership of a generated exact-integer vector resource."""
        if self._base is not sage.ZZ:
            resource.close()
            raise TypeError("FLINT integer vector storage requires ZZ")
        try:
            if (
                runtime.number(_exact_vector_public_module().integer_length(resource))
                != self._degree
            ):
                raise ValueError("integer vector resource dimension does not agree")
            return Vector(self, runtime.undefined, resource)
        except Exception:
            resource.close()
            raise

    def _from_fmpq_vector_resource(self, resource: Any) -> Vector:
        """Take ownership of a generated exact-rational vector resource."""
        if self._base is not sage.QQ:
            resource.close()
            raise TypeError("FLINT rational vector storage requires QQ")
        try:
            if (
                runtime.number(_exact_vector_public_module().rational_length(resource))
                != self._degree
            ):
                raise ValueError("rational vector resource dimension does not agree")
            return Vector(self, runtime.undefined, resource)
        except Exception:
            resource.close()
            raise


@runtime.sequence_class
@runtime.lightweight_math_class
class Vector(sage.Element):
    def __init__(
        self,
        parent: VectorSpaceParent,
        entries: Any,
        native_value: Any = runtime.undefined,
    ) -> None:
        self._parent = parent
        self._entries = entries
        self._native_value = native_value
        self._immutable = False

    def _has_fmpz_vector_resource(self) -> bool:
        return (
            self.base_ring() is sage.ZZ and self._native_value is not runtime.undefined
        )

    def _has_fmpq_vector_resource(self) -> bool:
        return (
            self.base_ring() is sage.QQ and self._native_value is not runtime.undefined
        )

    def _exact_vector_resource(self) -> Any:
        if self._native_value is runtime.undefined:
            raise TypeError("vector does not own an exact FLINT resource")
        return self._native_value

    def _from_exact_vector_resource(self, resource: Any) -> Vector:
        if self.base_ring() is sage.ZZ:
            return self._parent._from_fmpz_vector_resource(resource)
        if self.base_ring() is sage.QQ:
            return self._parent._from_fmpq_vector_resource(resource)
        resource.close()
        raise TypeError("exact vector resource requires ZZ or QQ")

    def _exact_values(self) -> list[Any]:
        exact = _exact_vector_public_module()
        if self._has_fmpz_vector_resource():
            return exact.integer_values(self._exact_vector_resource(), len(self))
        if self._has_fmpq_vector_resource():
            return exact.rational_values(self._exact_vector_resource(), len(self))
        return list(self._entries)

    def base_ring(self) -> sage.Parent:
        return self._parent.base_ring()

    def __len__(self) -> int:
        return self._parent.degree()

    def degree(self) -> int:
        return len(self)

    def dimension(self) -> int:
        return len(self)

    def __iter__(self) -> Iterator[Any]:
        return iter(self.list())

    def __getitem__(self, index: int) -> Any:
        if isinstance(index, slice):
            start, stop, step = index.indices(len(self))
            # Exact vector slice ABIs are not declared yet. Materialize once
            # through the bulk presentation boundary rather than making one
            # scalar foreign call per selected entry.
            source = self.list()
            values = []
            for position in range(start, stop, step):
                values.append(source[position])
            return VectorSpace(self.base_ring(), len(values))(values)
        if self._native_value is runtime.undefined:
            return self._entries[index]
        position = _normalize_index(int(index), len(self))
        exact = _exact_vector_public_module()
        if self._has_fmpz_vector_resource():
            return exact.integer_entry(self._exact_vector_resource(), position)
        return exact.rational_entry(self._exact_vector_resource(), position)

    def __setitem__(self, index: int, value: Any) -> None:
        if self._immutable:
            raise ValueError("vector is immutable; change a copy instead")
        if self._native_value is runtime.undefined:
            self._entries[index] = self.base_ring()(value)
            return
        position = _normalize_index(int(index), len(self))
        coerced = self.base_ring()(value)
        exact = _exact_vector_public_module()
        if self._has_fmpz_vector_resource():
            exact.integer_set(self._exact_vector_resource(), position, coerced)
        else:
            exact.rational_set(self._exact_vector_resource(), position, coerced)

    def is_immutable(self) -> bool:
        return self._immutable

    def is_mutable(self) -> bool:
        return not self._immutable

    def set_immutable(self) -> None:
        self._immutable = True

    def list(self) -> list[Any]:
        return self._exact_values()

    def __copy__(self) -> Vector:
        if self._native_value is runtime.undefined:
            return Vector(self._parent, list(self._entries))
        resource = _exact_vector_public_module().copy(
            self._exact_vector_resource(),
            self.base_ring() is sage.QQ,
        )
        return self._from_exact_vector_resource(resource)

    def __deepcopy__(self, memo: dict[int, Any]) -> Vector:
        answer = self.__copy__()
        if self._immutable:
            answer.set_immutable()
        memo[id(self)] = answer
        return answer

    def change_ring(self, base: sage.Parent) -> Vector:
        base = _canonical_base(base)
        if base is self.base_ring():
            return self
        if self.base_ring() is sage.ZZ and (
            base is sage.QQ
            or _is_modular_base(base)
            or _is_extension_field_base(base)
            or _is_algebraic_base(base)
            or _is_approximate_base(base)
        ):
            return VectorSpace(base, len(self))(_coerce_values(base, self.list()))
        if base is not sage.QQ or self.base_ring() is not sage.ZZ:
            if _is_algebraic_base(base) and (
                self.base_ring() is sage.QQ or _is_algebraic_base(self.base_ring())
            ):
                return VectorSpace(base, len(self))(_coerce_values(base, self.list()))
            raise TypeError("unsupported vector base-ring conversion")
        raise TypeError("unsupported vector base-ring conversion")

    def _pair(self, other: object) -> tuple[Vector, Vector]:
        if not isinstance(other, Vector) or len(self) != len(other):
            raise TypeError("vector dimensions must agree")
        base = _common_base(self.base_ring(), other.base_ring())
        return self.change_ring(base), other.change_ring(base)

    def __add__(self, other: object) -> Vector:
        left, right = self._pair(other)
        if left._native_value is not runtime.undefined:
            resource = _exact_vector_public_module().add(
                left._exact_vector_resource(),
                right._exact_vector_resource(),
                left.base_ring() is sage.QQ,
            )
            return left._from_exact_vector_resource(resource)
        values = []
        for index in range(len(left)):
            values.append(left._entries[index] + right._entries[index])
        return VectorSpace(left.base_ring(), len(left))(values)

    def __sub__(self, other: object) -> Vector:
        left, right = self._pair(other)
        if left._native_value is not runtime.undefined:
            resource = _exact_vector_public_module().sub(
                left._exact_vector_resource(),
                right._exact_vector_resource(),
                left.base_ring() is sage.QQ,
            )
            return left._from_exact_vector_resource(resource)
        values = []
        for index in range(len(left)):
            values.append(left._entries[index] - right._entries[index])
        return VectorSpace(left.base_ring(), len(left))(values)

    def __neg__(self) -> Vector:
        if self._native_value is not runtime.undefined:
            resource = _exact_vector_public_module().scalar_mul(
                self._exact_vector_resource(),
                self.base_ring()(-1),
                self.base_ring() is sage.QQ,
            )
            return self._from_exact_vector_resource(resource)
        return VectorSpace(self.base_ring(), len(self))(
            [-value for value in self._entries]
        )

    def __mul__(self, other: object) -> Any:
        if isinstance(other, Vector):
            left, right = self._pair(other)
            if left._native_value is not runtime.undefined:
                return _exact_vector_public_module().dot(
                    left._exact_vector_resource(),
                    right._exact_vector_resource(),
                    left.base_ring() is sage.QQ,
                )
            total = left.base_ring()(0)
            for index in range(len(left)):
                total += left._entries[index] * right._entries[index]
            return total
        if isinstance(other, Matrix):
            return other._vector_product(self, "left")
        if _is_extension_field_base(self.base_ring()):
            scalar = self.base_ring()(other)
            return VectorSpace(self.base_ring(), len(self))(
                [value * scalar for value in self]
            )
        if _is_approximate_base(self.base_ring()):
            scalar = self.base_ring()(other)
            return VectorSpace(self.base_ring(), len(self))(
                [value * scalar for value in self]
            )
        scalar_base, _numerator, _denominator = _matrix_scalar_parts(
            self.base_ring(), other
        )
        base = _common_base(self.base_ring(), scalar_base)
        source = self.change_ring(base)
        scalar = base(other)
        if source._native_value is not runtime.undefined:
            resource = _exact_vector_public_module().scalar_mul(
                source._exact_vector_resource(),
                scalar,
                base is sage.QQ,
            )
            return source._from_exact_vector_resource(resource)
        return VectorSpace(base, len(source))([value * scalar for value in source])

    def __rmul__(self, other: object) -> Vector:
        return self * other

    def _sage_binop_(
        self,
        operator: str,
        other: object,
        reflected: bool,
    ) -> Any:
        if operator == "add" and not reflected:
            return self.__add__(other)
        if operator == "sub" and not reflected:
            return self.__sub__(other)
        if operator == "mul":
            if reflected:
                return self.__rmul__(other)
            return self.__mul__(other)
        raise TypeError("operation " + operator + " is not defined for vectors")

    def dot_product(self, other: Vector) -> Any:
        return self * other

    def column(self) -> Matrix:
        return matrix(self.base_ring(), len(self), 1, self.list())

    def row(self) -> Matrix:
        return matrix(self.base_ring(), 1, len(self), self.list())

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Vector) or len(self) != len(other):
            return False
        try:
            left, right = self._pair(other)
        except TypeError:
            return False
        if left._native_value is not runtime.undefined:
            return _exact_vector_public_module().equal(
                left._exact_vector_resource(),
                right._exact_vector_resource(),
                left.base_ring() is sage.QQ,
            )
        for index in range(len(left)):
            if left._entries[index] != right._entries[index]:
                return False
        return True

    def __repr__(self) -> str:
        return "(" + ", ".join([str(value) for value in self.list()]) + ")"

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class VectorSubspaceParent(sage.Parent):
    __sagejs_sequence_proxy__ = True

    def __init__(
        self,
        ambient: VectorSpaceParent,
        basis: Matrix,
        defining_matrix: Any = None,
        left_kernel: bool = True,
    ) -> None:
        self._ambient = ambient
        self._basis_matrix = basis
        self._defining_matrix = defining_matrix
        self._left_kernel = left_kernel
        self._enumeration_elements: Any = None
        self._construction = {
            "kind": "vector-subspace",
            "ambient": ambient,
            "basis": self._basis_matrix,
        }

    def base_ring(self) -> sage.Parent:
        return self._ambient.base_ring()

    def ambient_module(self) -> VectorSpaceParent:
        return self._ambient

    def ambient_vector_space(self) -> VectorSpaceParent:
        return self._ambient

    def degree(self) -> int:
        return self._ambient.degree()

    def dimension(self) -> int:
        return self._basis_matrix.nrows()

    rank = dimension

    def basis_matrix(self) -> Matrix:
        return self._basis_matrix

    def basis(self) -> list[Vector]:
        return self._basis_matrix.rows()

    gens = basis

    def gen(self, index: int = 0) -> Vector:
        return self._basis_matrix.row(index)

    def zero(self) -> Vector:
        return self._ambient(0)

    def _finite_field_order(self) -> int:
        if getattr(self.base_ring(), "_kind", None) not in ["GF", "GF_EXTENSION"]:
            raise TypeError("vector-space enumeration requires a finite base field")
        return int(_untyped(self.base_ring()).order())

    def _finite_field_elements(self) -> list[Any]:
        self._finite_field_order()
        if self._enumeration_elements is None:
            self._enumeration_elements = list(_untyped(self.base_ring()))
        return self._enumeration_elements

    def cardinality(self) -> int:
        return self._finite_field_order() ** self.dimension()

    order = cardinality

    def __len__(self) -> int:
        return self.cardinality()

    def _finite_element(self, index: int) -> Vector:
        if not runtime.is_exact_integer(index):
            raise TypeError("vector-space indices must be integers or slices")
        index = int(index)
        size = self.cardinality()
        if index < 0:
            index += size
        if index < 0 or index >= size:
            raise IndexError("vector-space index out of range")
        if self.dimension() == 0:
            return self.zero()

        coefficients = self._finite_field_elements()
        radix = len(coefficients)
        entries = [
            _untyped(self.base_ring()).zero() for _position in range(self.degree())
        ]
        position = index
        for basis_index in range(self.dimension()):
            coefficient = coefficients[position % radix]
            position //= radix
            if coefficient == 0:
                continue
            basis_vector = self._basis_matrix.row(basis_index)
            for entry_index in range(self.degree()):
                entries[entry_index] += basis_vector[entry_index] * coefficient
        return self._ambient(entries)

    def __iter__(self) -> Iterator[Vector]:
        for index in range(self.cardinality()):
            yield self._finite_element(index)

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, "__sagejs_slice__"):
            start, stop, step = index.indices(self.cardinality())
            return [
                self._finite_element(position) for position in range(start, stop, step)
            ]
        return self._finite_element(index)

    def __contains__(self, value: object) -> bool:
        try:
            element = self._ambient(value)
        except Exception:
            return False
        if self._defining_matrix is not None:
            if self._left_kernel:
                image = element * self._defining_matrix
            else:
                image = self._defining_matrix * element
            for entry in image:
                if entry != 0:
                    return False
            return True
        extended = self._basis_matrix.stack(element)
        return _canonical_row_basis(extended) == self._basis_matrix

    def __call__(self, entries: Any = 0) -> Vector:
        element = self._ambient(entries)
        if element not in self:
            raise ValueError("vector is not in the subspace")
        return element

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, VectorSubspaceParent)
            and self._ambient is other._ambient
            and self._basis_matrix == other._basis_matrix
        )

    def _compatible_space(
        self,
        other: object,
    ) -> VectorSubspaceParent:
        if (
            not isinstance(other, VectorSubspaceParent)
            or self._ambient is not other._ambient
        ):
            raise TypeError("vector subspaces must have the same ambient space")
        return other

    def __add__(self, other: object) -> VectorSubspaceParent:
        right = self._compatible_space(other)
        combined = self._basis_matrix.stack(right._basis_matrix)
        return VectorSubspaceParent(
            self._ambient,
            _canonical_row_basis(combined),
        )

    def intersection(
        self,
        other: object,
    ) -> VectorSubspaceParent:
        right = self._compatible_space(other)
        if self.dimension() == 0 or right.dimension() == 0:
            return VectorSubspaceParent(
                self._ambient,
                zero_matrix(self.base_ring(), 0, self.degree()),
            )
        relations = (
            self._basis_matrix.stack(-right._basis_matrix).left_kernel().basis_matrix()
        )
        coefficient_entries = []
        for row in range(relations.nrows()):
            for col in range(self.dimension()):
                coefficient_entries.append(relations[row, col])
        left_coefficients = matrix(
            self.base_ring(),
            relations.nrows(),
            self.dimension(),
            coefficient_entries,
        )
        common_vectors = left_coefficients * self._basis_matrix
        return VectorSubspaceParent(
            self._ambient,
            _canonical_row_basis(common_vectors),
        )

    def __repr__(self) -> str:
        degree = self.degree()
        dimension = self.dimension()
        if (
            self.base_ring() is sage.ZZ
            or getattr(self.base_ring(), "_kind", None) == "ZMOD"
        ):
            return (
                "Free module of degree "
                + str(degree)
                + " and rank "
                + str(dimension)
                + " over "
                + str(self.base_ring())
                + "\nEchelon basis matrix:\n"
                + str(self._basis_matrix)
            )
        return (
            "Vector space of degree "
            + str(degree)
            + " and dimension "
            + str(dimension)
            + " over "
            + str(self.base_ring())
            + "\nBasis matrix:\n"
            + str(self._basis_matrix)
        )

    __str__ = __repr__
    toString = __repr__


@runtime.sequence_class
@runtime.lightweight_math_class
class Matrix(sage.Element):
    def __init__(
        self,
        parent: Any,
        native_value: Any = runtime.undefined,
        *constructor_args: Any,
    ) -> None:
        if (
            not isinstance(parent, MatrixSpaceParent)
            or native_value is runtime.undefined
            or len(constructor_args) != 0
        ):
            values = [parent]
            if native_value is not runtime.undefined:
                values.append(native_value)
            values.extend(constructor_args)
            source = matrix(*values)
            parent = source._parent
            if source._has_m4ri_matrix_resource():
                native_value = _M4riMatrixResourceStorage(
                    _m4ri_ffi_module().matrix_copy(source._m4ri_resource())
                )
            elif source._has_nmod_matrix_resource():
                native_value = _NmodMatrixResourceStorage(
                    _flint_ffi_module().nmod_matrix_copy(source._nmod_resource())
                )
            elif source._has_packed_prime_storage():
                native_value = _copy_packed_uint64(source._prime_residues())
            elif source._has_integer_storage():
                native_value = _FmpzMatrixResourceStorage(
                    _flint_ffi_module().fmpz_matrix_copy(source._integer_resource())
                )
            elif source._has_packed_rational_storage():
                native_value = _FmpqMatrixResourceStorage(
                    _flint_ffi_module().fmpq_matrix_copy(source._rational_resource())
                )
            else:
                native_value = source._native
        if parent.base_ring() is sage.ZZ and not isinstance(
            native_value, _FmpzMatrixResourceStorage
        ):
            # Legacy mathematical producers outside the dense-matrix slice
            # may still return an opaque FLINT matrix.  Convert at this single
            # audited ingress and discard the handle immediately: no public
            # ZZ Matrix may own, cache, or later recover it.
            packed_bytes = runtime.flint_backend().zzMatrixExportPacked(native_value)
            packed_matrix = parent._from_packed_integers(packed_bytes)
            # Transfer the generated resource wrapper; copying here would
            # create a second owner and leave the temporary to GC finalization.
            native_value = packed_matrix._integer_storage_cache
        if parent.base_ring() is sage.QQ and not isinstance(
            native_value, (_PackedRationalStorage, _FmpqMatrixResourceStorage)
        ):
            # A few audited legacy producers (notably modular-symbol
            # presentation builders) still return a temporary FLINT matrix.
            # Serialize it at this single compatibility ingress, reconstruct a
            # generated resource, and immediately discard the legacy handle.
            # New algorithms must return generated resources directly instead
            # of relying on this bridge.
            packed_bytes = runtime.flint_backend().qqMatrixExportPacked(native_value)
            packed_matrix = parent._from_packed_rationals(packed_bytes)
            native_value = _FmpqMatrixResourceStorage(
                _flint_ffi_module().fmpq_matrix_copy(packed_matrix._rational_resource())
            )
        self._parent = parent
        self._native_handle: Any = runtime.undefined
        self._m4ri_storage_cache: Any = runtime.undefined
        self._nmod_storage_cache: Any = runtime.undefined
        self._prime_residues_cache: Any = runtime.undefined
        self._prime_host_values_cache: Any = runtime.undefined
        self._integer_entries_cache: Any = runtime.undefined
        self._integer_storage_cache: Any = runtime.undefined
        self._rational_storage_cache: Any = runtime.undefined
        self._exact_host_values_cache: Any = runtime.undefined
        if _is_packed_uint64(native_value):
            self._prime_residues_cache = native_value
        elif isinstance(native_value, _M4riMatrixResourceStorage):
            self._m4ri_storage_cache = native_value
        elif isinstance(native_value, _NmodMatrixResourceStorage):
            self._nmod_storage_cache = native_value
        elif isinstance(native_value, _FmpzMatrixResourceStorage):
            self._integer_storage_cache = native_value
        elif isinstance(native_value, _PackedRationalStorage):
            self._rational_storage_cache = native_value
        elif isinstance(native_value, _FmpqMatrixResourceStorage):
            self._rational_storage_cache = native_value
        else:
            self._native_handle = native_value
        self._immutable = False
        self._row_subdivisions = []
        self._col_subdivisions = []
        self._determinant_cache = runtime.undefined
        self._rank_cache = runtime.undefined
        self._inverse_cache = runtime.undefined
        self._rref_cache = runtime.undefined
        self._hermite_cache = runtime.undefined
        self._howell_cache = runtime.undefined
        self._hermite_transform_cache = runtime.undefined
        self._smith_cache = runtime.undefined
        self._right_kernel_cache = runtime.undefined
        self._left_kernel_cache = runtime.undefined
        self._pivots_cache = runtime.undefined
        self._charpoly_cache = runtime.map()
        self._minpoly_cache = runtime.map()
        self._row_vectors_cache: Any = runtime.undefined
        self._column_vectors_cache: Any = runtime.undefined

    @property
    def _native(self) -> Any:
        """Return a legacy handle only for matrix representations that own it.

        Packed `GF(p)` and generated exact matrix resources have no
        conversion escape hatch here. Tests that compare with the former
        N-API implementation construct a separate oracle explicitly;
        production code cannot accidentally make a host object canonical.
        """
        if self._has_packed_prime_storage() or self._has_nmod_matrix_resource():
            raise RuntimeError("dense GF(p) matrices have no N-API matrix handle")
        if self._has_integer_storage():
            raise RuntimeError("generated ZZ matrices have no N-API matrix handle")
        if self._has_packed_rational_storage():
            raise RuntimeError("QQ matrices expose no N-API matrix handle")
        return self._native_handle

    @_native.setter
    def _native(self, value: Any) -> None:
        self._native_handle = value

    def _has_packed_prime_storage(self) -> bool:
        return (
            self._prime_residues_cache is not runtime.undefined
            or self._has_m4ri_matrix_resource()
        ) and _is_packed_dense_prime_base(self.base_ring())

    def _has_nmod_matrix_resource(self) -> bool:
        return isinstance(self._nmod_storage_cache, _NmodMatrixResourceStorage)

    def _nmod_resource(self) -> Any:
        if not self._has_nmod_matrix_resource():
            raise TypeError("matrix does not own a FLINT nmod resource")
        return self._nmod_storage_cache.resource

    def _has_m4ri_matrix_resource(self) -> bool:
        return isinstance(self._m4ri_storage_cache, _M4riMatrixResourceStorage)

    def _m4ri_resource(self) -> Any:
        if not self._has_m4ri_matrix_resource():
            raise TypeError("binary matrix does not own an M4RI resource")
        return self._m4ri_storage_cache.resource

    def _has_integer_storage(self) -> bool:
        return self.base_ring() is sage.ZZ and isinstance(
            self._integer_storage_cache, _FmpzMatrixResourceStorage
        )

    def _has_fmpz_matrix_resource(self) -> bool:
        return isinstance(self._integer_storage_cache, _FmpzMatrixResourceStorage)

    def _integer_resource(self) -> Any:
        if not self._has_fmpz_matrix_resource():
            raise TypeError("integer matrix does not own a FLINT resource")
        return self._integer_storage_cache.resource

    def _materialize_integer_compatibility_buffer(self) -> None:
        """Decode variable-size storage only for an audited packed boundary."""
        if not self._has_fmpz_matrix_resource():
            return
        storage = self._integer_storage_cache
        if storage.entries is not runtime.undefined:
            return
        storage.entries = runtime.integer_buffer_from_packed_bytes(
            self._packed_integers(),
            self.nrows() * self.ncols(),
        )
        self._integer_entries_cache = storage.entries

    def _has_packed_rational_storage(self) -> bool:
        return (
            self.base_ring() is sage.QQ
            and self._rational_storage_cache is not runtime.undefined
        )

    def _has_fmpq_matrix_resource(self) -> bool:
        return isinstance(
            self._rational_storage_cache,
            _FmpqMatrixResourceStorage,
        )

    def _rational_resource(self) -> Any:
        if not self._has_fmpq_matrix_resource():
            raise TypeError("rational matrix does not own a FLINT resource")
        return self._rational_storage_cache.resource

    def _materialize_rational_compatibility_buffers(self) -> None:
        """Decode a variable-size export only for legacy packed algorithms."""
        if not self._has_fmpq_matrix_resource():
            return
        storage = self._rational_storage_cache
        if storage.numerators is not runtime.undefined:
            return
        buffers = runtime.rational_buffers_from_packed_bytes(
            self._packed_rationals(),
            self.nrows() * self.ncols(),
        )
        storage.numerators = buffers[0]
        storage.denominators = buffers[1]

    def _integer_entries(self) -> Any:
        if not self._has_integer_storage():
            raise TypeError("packed exact storage requires a ZZ matrix")
        self._materialize_integer_compatibility_buffer()
        return self._integer_entries_cache

    def _rational_numerators(self) -> Any:
        if not self._has_packed_rational_storage():
            raise TypeError("packed rational storage requires a QQ matrix")
        self._materialize_rational_compatibility_buffers()
        return self._rational_storage_cache.numerators

    def _rational_denominators(self) -> Any:
        if not self._has_packed_rational_storage():
            raise TypeError("packed rational storage requires a QQ matrix")
        self._materialize_rational_compatibility_buffers()
        return self._rational_storage_cache.denominators

    def _rational_capacity(self) -> int:
        return max(
            _matrix_integer_word_capacity(self._rational_numerators()),
            _matrix_integer_word_capacity(self._rational_denominators()),
        )

    def _rational_kernel_parts(
        self,
        kernel_function: Any,
    ) -> tuple[Any, Any]:
        numerators = self._rational_numerators()
        denominators = self._rational_denominators()
        if _native_kernel_available(kernel_function) or _declared_ffi_kernel(
            kernel_function
        ):
            numerator_capacity = runtime.reflect.get(numerators, "wordCapacity")
            denominator_capacity = runtime.reflect.get(denominators, "wordCapacity")
            if (
                numerator_capacity is not runtime.undefined
                and denominator_capacity is not runtime.undefined
            ):
                return numerators, denominators
        return (
            _integer_buffer_values(numerators),
            _integer_buffer_values(denominators),
        )

    def _new(self, native_value: Any) -> Matrix:
        return Matrix(self._parent, native_value)

    def _new_shape(
        self,
        native_value: Any,
        rows: int,
        columns: int,
    ) -> Matrix:
        """Wrap a native matrix whose dimensions differ from `self`."""
        return Matrix(
            self._parent.matrix_space(rows, columns),
            native_value,
        )

    def _trace_word_prime_resource(self, operation: str) -> None:
        _trace_dense_prime_selection(
            operation,
            "generated-flint-resource",
            self.nrows(),
            self.ncols(),
            int(_untyped(self.base_ring()).characteristic()),
        )

    def _packed_residues(self, width: int) -> Any:
        """Return modular entries as packed little-endian residues."""
        if self._has_nmod_matrix_resource():
            if width not in [1, 2, 4, 8]:
                raise ValueError("unsupported packed residue width")
            if int(_untyped(self.base_ring()).characteristic()) - 1 >= 1 << (8 * width):
                raise OverflowError("a matrix residue does not fit the requested width")
            region = _flint_ffi_module().nmod_matrix_serialize(
                self._nmod_resource(), width
            )
            return region.take_bytes()
        if self._has_packed_prime_storage():
            if width not in [1, 2, 4, 8]:
                raise ValueError("unsupported packed residue width")
            if self._has_m4ri_matrix_resource() and width == 1:
                region = _m4ri_ffi_module().matrix_sagepack_bytes(self._m4ri_resource())
                return region.take_bytes()
            return runtime.uint64_pack_le(self._prime_residues(), width)
        return runtime.flint_backend().matrixExportPacked(self._native, width)

    def _prime_residues(self) -> Any:
        """Return canonical row-major residues for a prime field."""
        if not (
            _uses_dense_prime_kernel(self.base_ring())
            or self._has_nmod_matrix_resource()
        ):
            raise TypeError("packed dense-prime storage requires GF(p)")
        if self._prime_residues_cache is runtime.undefined:
            if self._has_m4ri_matrix_resource():
                width = 1
            elif self._has_nmod_matrix_resource():
                width = 8
            else:
                width = (
                    1 if int(_untyped(self.base_ring()).characteristic()) < 256 else 4
                )
            packed = self._packed_residues(width)
            self._prime_residues_cache = runtime.uint64_unpack_le(
                packed,
                width,
                self.nrows() * self.ncols(),
            )
        return self._prime_residues_cache

    def _prime_host_values(self) -> list[Any]:
        """Materialize ordinary immutable field elements once per matrix."""
        if not (self._has_packed_prime_storage() or self._has_nmod_matrix_resource()):
            raise TypeError("bulk prime-field host views require packed storage")
        if self._prime_host_values_cache is runtime.undefined:
            base = self.base_ring()
            self._prime_host_values_cache = runtime.uint64_residue_elements(
                self._prime_residues(),
                base,
                runtime.reflect.get(base, "_elementType"),
            )
        return self._prime_host_values_cache

    def _prime_kernel_buffer(self, kernel_function: Any) -> Any:
        """Materialize canonical packed storage once per matrix."""
        return _dense_prime_buffer(kernel_function, self._prime_residues())

    def _packed_integers(self) -> Any:
        """Return ZZ entries as packed signed little-endian magnitudes."""
        if not self._has_integer_storage():
            raise TypeError("packed integer export requires a ZZ matrix")
        if self._has_fmpz_matrix_resource():
            region = _flint_ffi_module().fmpz_matrix_serialize(self._integer_resource())
            # The generated resource serialization has a 24-byte SJZM header;
            # SagePack's established `fmpz-le-v1` payload is exactly the same
            # canonical row-major entry stream without that matrix envelope.
            return _packed_uint8_suffix(region.take_bytes(), 24)
        return runtime.integer_buffer_to_packed_bytes(self._integer_entries())

    def _packed_rationals(self) -> Any:
        """Return QQ entries as packed numerator/denominator magnitudes."""
        if not self._has_packed_rational_storage():
            raise TypeError("packed rational export requires a QQ matrix")
        if self._has_fmpq_matrix_resource():
            region = _flint_ffi_module().fmpq_matrix_serialize(
                self._rational_resource()
            )
            return region.take_bytes()
        numerators = _integer_buffer_values(self._rational_numerators())
        denominators = _integer_buffer_values(self._rational_denominators())
        byte_length = 0
        for index in range(len(numerators)):
            for value in [numerators[index], denominators[index]]:
                magnitude = abs(int(value))
                byte_length += 4 + (magnitude.bit_length() + 7) // 8
        output = _packed_uint8(byte_length)
        offset = 0
        for index in range(len(numerators)):
            for part, value in enumerate(
                [
                    numerators[index],
                    denominators[index],
                ]
            ):
                exact = int(value)
                magnitude = abs(exact)
                byte_count = (magnitude.bit_length() + 7) // 8
                header = byte_count
                if part == 0 and exact < 0:
                    header += 2147483648
                for byte_index in range(4):
                    output[offset + byte_index] = header % 256
                    header //= 256
                offset += 4
                for byte_index in range(byte_count):
                    output[offset + byte_index] = magnitude % 256
                    magnitude //= 256
                offset += byte_count
        return output

    def _exact_host_values(self) -> list[Any]:
        """Decode one variable-size resource export into ordinary values.

        This is the canonical host-view boundary for generated dense `ZZ` and
        `QQ` resources.  It deliberately does not populate the uniform-limb
        compatibility buffers used by a few legacy compiled kernels.
        """
        if self._exact_host_values_cache is runtime.undefined:
            count = self.nrows() * self.ncols()
            if self._has_fmpz_matrix_resource():
                region = _flint_ffi_module().fmpz_matrix_serialize(
                    self._integer_resource()
                )
                values = runtime.exact_integer_values_from_packed_bytes(
                    region.take_bytes(), count, 24
                )
                self._exact_host_values_cache = [
                    runtime.normalize_integer(value) for value in values
                ]
            elif self._has_fmpq_matrix_resource():
                parts = runtime.exact_integer_values_from_packed_bytes(
                    self._packed_rationals(),
                    2 * count,
                )
                self._exact_host_values_cache = (
                    runtime.reduced_rational_values_from_parts(
                        parts, _untyped(sage.Rational), sage.QQ
                    )
                )
            else:
                raise TypeError(
                    "bulk exact host views require a generated matrix resource"
                )
        return self._exact_host_values_cache

    def _exact_host_sequence(
        self,
        start: int,
        stride: int,
        count: int,
    ) -> list[Any]:
        """Decode one affine entry sequence through a generated bulk export."""
        ffi = _flint_ffi_module()
        if self._has_fmpz_matrix_resource():
            region = ffi.fmpz_matrix_serialize_sequence(
                self._integer_resource(), start, stride, count
            )
            values = runtime.exact_integer_values_from_packed_bytes(
                region.take_bytes(), count
            )
            return [runtime.normalize_integer(value) for value in values]
        if self._has_fmpq_matrix_resource():
            region = ffi.fmpq_matrix_serialize_sequence(
                self._rational_resource(), start, stride, count
            )
            parts = runtime.exact_integer_values_from_packed_bytes(
                region.take_bytes(), 2 * count
            )
            return runtime.reduced_rational_values_from_parts(
                parts, _untyped(sage.Rational), sage.QQ
            )
        raise TypeError("bulk exact selection requires a generated matrix resource")

    def _cached_row_vectors(self) -> list[Vector]:
        """Return the canonical cached immutable row vectors."""
        if self._row_vectors_cache is runtime.undefined:
            if self._column_vectors_cache is runtime.undefined:
                if self._has_packed_prime_storage() or self._has_nmod_matrix_resource():
                    values = self._prime_host_values()
                    width = self.ncols()
                    nested = [
                        values[row * width : (row + 1) * width]
                        for row in range(self.nrows())
                    ]
                elif (
                    self._has_fmpz_matrix_resource() or self._has_fmpq_matrix_resource()
                ):
                    values = self._exact_host_values()
                    width = self.ncols()
                    nested = [
                        values[row * width : (row + 1) * width]
                        for row in range(self.nrows())
                    ]
                else:
                    nested = [
                        [self._entry(row, column) for column in range(self.ncols())]
                        for row in range(self.nrows())
                    ]
            else:
                nested = runtime.reference_matrix_transpose(
                    [value.list() for value in self._column_vectors_cache],
                    self.ncols(),
                    self.nrows(),
                )
            parent = VectorSpace(self.base_ring(), self.ncols())
            vectors = [parent(entries) for entries in nested]
            for value in vectors:
                value.set_immutable()
            self._row_vectors_cache = vectors
        return self._row_vectors_cache

    def _cached_column_vectors(self) -> list[Vector]:
        """Return the canonical cached immutable column vectors."""
        if self._column_vectors_cache is runtime.undefined:
            if self._row_vectors_cache is runtime.undefined:
                if self._has_packed_prime_storage() or self._has_nmod_matrix_resource():
                    values = self._prime_host_values()
                    width = self.ncols()
                    nested_rows = [
                        values[row * width : (row + 1) * width]
                        for row in range(self.nrows())
                    ]
                elif (
                    self._has_fmpz_matrix_resource() or self._has_fmpq_matrix_resource()
                ):
                    values = self._exact_host_values()
                    width = self.ncols()
                    nested_rows = [
                        values[row * width : (row + 1) * width]
                        for row in range(self.nrows())
                    ]
                else:
                    nested_rows = [
                        [self._entry(row, column) for column in range(self.ncols())]
                        for row in range(self.nrows())
                    ]
            else:
                nested_rows = [value.list() for value in self._row_vectors_cache]
            nested = runtime.reference_matrix_transpose(
                nested_rows, self.nrows(), self.ncols()
            )
            parent = VectorSpace(self.base_ring(), self.nrows())
            vectors = [parent(entries) for entries in nested]
            for value in vectors:
                value.set_immutable()
            self._column_vectors_cache = vectors
        return self._column_vectors_cache

    def base_ring(self) -> sage.Parent:
        return self._parent.base_ring()

    def nrows(self) -> int:
        return self._parent.nrows()

    def ncols(self) -> int:
        return self._parent.ncols()

    def dimensions(self) -> tuple[int, int]:
        return runtime.math_tuple([self.nrows(), self.ncols()])

    def is_square(self) -> bool:
        return self.nrows() == self.ncols()

    def is_zero(self) -> bool:
        if self._has_packed_rational_storage():
            if self._has_fmpq_matrix_resource():
                result = bool(
                    _flint_ffi_module().fmpq_matrix_is_zero(self._rational_resource())
                )
                _trace_dense_rational_selection(
                    "is_zero",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
                return result
            kernel = _dense_rational_kernel_module().dense_rational_matrix_is_zero
            numerators, _denominators = self._rational_kernel_parts(kernel)
            result = bool(kernel(numerators))
            _trace_dense_rational_selection(
                "is_zero",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return result
        if self._has_integer_storage():
            result = bool(
                _flint_ffi_module().fmpz_matrix_is_zero(self._integer_resource())
            )
            _trace_dense_integer_selection(
                "is_zero",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return result
        if self._has_m4ri_matrix_resource():
            kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_nonzero_count
            result = runtime.number(kernel(self._m4ri_resource())) == 0
            _trace_dense_prime_selection(
                "is_zero",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                2,
            )
            return result
        if self._has_nmod_matrix_resource():
            result = bool(
                _flint_ffi_module().nmod_matrix_is_zero(self._nmod_resource())
            )
            self._trace_word_prime_resource("is_zero")
            return result
        if self._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_is_zero
            result = bool(
                kernel(
                    self._prime_kernel_buffer(kernel),
                    int(_untyped(self.base_ring()).characteristic()),
                )
            )
            _trace_dense_prime_selection(
                "is_zero",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                int(_untyped(self.base_ring()).characteristic()),
            )
            return result
        return runtime.flint_backend().matrixIsZero(self._native)

    def __bool__(self) -> bool:
        return not self.is_zero()

    def is_one(self) -> bool:
        if self._has_packed_rational_storage():
            if self._has_fmpq_matrix_resource():
                result = bool(
                    _flint_ffi_module().fmpq_matrix_is_one(self._rational_resource())
                )
                _trace_dense_rational_selection(
                    "is_one",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
                return result
            kernel = _dense_rational_kernel_module().dense_rational_matrix_is_one
            numerators, denominators = self._rational_kernel_parts(kernel)
            result = bool(kernel(numerators, denominators, self.nrows(), self.ncols()))
            _trace_dense_rational_selection(
                "is_one",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return result
        if self._has_integer_storage():
            result = bool(
                _flint_ffi_module().fmpz_matrix_is_one(self._integer_resource())
            )
            _trace_dense_integer_selection(
                "is_one",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return result
        if self._has_m4ri_matrix_resource():
            kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_is_one
            result = bool(kernel(self._m4ri_resource()))
            _trace_dense_prime_selection(
                "is_one",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                2,
            )
            return result
        if self._has_nmod_matrix_resource():
            result = bool(_flint_ffi_module().nmod_matrix_is_one(self._nmod_resource()))
            self._trace_word_prime_resource("is_one")
            return result
        if self._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_is_one
            result = bool(
                kernel(
                    self._prime_kernel_buffer(kernel),
                    self.nrows(),
                    self.ncols(),
                    int(_untyped(self.base_ring()).characteristic()),
                )
            )
            _trace_dense_prime_selection(
                "is_one",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                int(_untyped(self.base_ring()).characteristic()),
            )
            return result
        if not self.is_square():
            return False
        for row in range(self.nrows()):
            for col in range(self.ncols()):
                expected = 1 if row == col else 0
                if self._entry(row, col) != expected:
                    return False
        return True

    def __len__(self) -> int:
        return self.nrows()

    def _entry(self, row: int, col: int) -> Any:
        # Exact generated resources are the common scalar-access path.  Test
        # their concrete storage directly before the more general matrix
        # representation predicates: those predicates intentionally answer
        # broader architectural questions and each performs base-ring and
        # storage dispatch that is unnecessary once the concrete owner is
        # already known.
        rows = self.nrows()
        columns = self.ncols()
        row = _normalize_index(row, rows)
        col = _normalize_index(col, columns)
        integer_storage = self._integer_storage_cache
        if isinstance(integer_storage, _FmpzMatrixResourceStorage):
            return runtime.normalize_integer(
                _flint_ffi_module().fmpz_matrix_entry(
                    integer_storage.resource,
                    row,
                    col,
                )
            )
        rational_storage = self._rational_storage_cache
        if isinstance(rational_storage, _FmpqMatrixResourceStorage):
            parts = _dense_rational_flint_module().flint_dense_rational_matrix_entry(
                rational_storage.resource,
                row,
                col,
            )
            # FLINT owns the canonical fmpq representation and the declared
            # getter returns its already coprime parts with a positive
            # denominator.  Revalidating them through QQ would compute an
            # avoidable gcd on every scalar read.
            return _untyped(sage.Rational)._from_reduced(parts[0], parts[1])
        m4ri_storage = self._m4ri_storage_cache
        nmod_storage = self._nmod_storage_cache
        prime_storage = self._prime_residues_cache
        if isinstance(m4ri_storage, _M4riMatrixResourceStorage):
            flat_index = row * columns + col
            if self._prime_host_values_cache is not runtime.undefined:
                return self._prime_host_values_cache[flat_index]
            kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_entry
            residue = runtime.number(kernel(m4ri_storage.resource, row, col))
            if residue not in [0, 1]:
                raise RuntimeError("M4RI returned an invalid matrix entry")
            return _untyped(self.base_ring())._from_reduced(residue)
        if isinstance(nmod_storage, _NmodMatrixResourceStorage):
            flat_index = row * columns + col
            if self._prime_host_values_cache is not runtime.undefined:
                return self._prime_host_values_cache[flat_index]
            residue = int(
                _flint_ffi_module().nmod_matrix_entry(nmod_storage.resource, row, col)
            )
            if residue == 0xFFFFFFFFFFFFFFFF:
                raise IndexError("matrix index out of range")
            return _untyped(self.base_ring())._from_reduced(residue)
        if _is_packed_uint64(prime_storage) and _is_packed_dense_prime_base(
            self.base_ring()
        ):
            flat_index = row * columns + col
            if self._prime_host_values_cache is not runtime.undefined:
                return self._prime_host_values_cache[flat_index]
            residue = int(prime_storage[flat_index])
            return _untyped(self.base_ring())._from_reduced(residue)
        if self._has_packed_rational_storage():
            kernel = _dense_rational_kernel_module().dense_rational_matrix_get
            numerators, denominators = self._rational_kernel_parts(kernel)
            parts = kernel(
                numerators,
                denominators,
                row * columns + col,
            )
            return _untyped(sage.Rational)._from_reduced(parts[0], parts[1])
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            native_value = backend.fqMatrixEntry(
                self._native, runtime.number(row), runtime.number(col)
            )
        else:
            native_value = backend.matrixEntry(
                self._native, runtime.number(row), runtime.number(col)
            )
        return _entry_from_native(
            self.base_ring(),
            native_value,
        )

    def __getitem__(self, index: Any) -> Any:
        # Compiler output can represent a multi-index as a native array when
        # tuple preservation is disabled for a lightweight embedding.
        if isinstance(index, tuple) or runtime.array.isArray(index):
            if len(index) != 2:
                raise IndexError("matrix index must have two components")
            return self._entry(index[0], index[1])
        return self.row(index)

    def __setitem__(self, index: Any, value: Any) -> None:
        if self._immutable:
            raise ValueError("matrix is immutable; change a copy instead")
        if not (isinstance(index, tuple) or runtime.array.isArray(index)):
            raise IndexError("matrix assignment requires a row and column")
        if len(index) != 2:
            raise IndexError("matrix index must have two components")
        row = _normalize_index(index[0], self.nrows())
        col = _normalize_index(index[1], self.ncols())
        integer_storage = self._integer_storage_cache
        if isinstance(integer_storage, _FmpzMatrixResourceStorage):
            exact = sage.ZZ(value)
            _flint_ffi_module().fmpz_matrix_set_entry(
                integer_storage.resource,
                row,
                col,
                exact,
            )
            integer_storage.entries = runtime.undefined
            self._integer_entries_cache = runtime.undefined
            self._clear_cache()
            return
        rational_storage = self._rational_storage_cache
        if isinstance(rational_storage, _FmpqMatrixResourceStorage):
            rational = sage.QQ(value)
            _flint_ffi_module().fmpq_matrix_set_entry(
                rational_storage.resource,
                row,
                col,
                rational._numerator,
                rational._denominator,
            )
            rational_storage.numerators = runtime.undefined
            rational_storage.denominators = runtime.undefined
            self._clear_cache()
            return
        m4ri_storage = self._m4ri_storage_cache
        nmod_storage = self._nmod_storage_cache
        prime_storage = self._prime_residues_cache
        if isinstance(nmod_storage, _NmodMatrixResourceStorage):
            residue = _prime_residue_value(self.base_ring(), value)
            _flint_ffi_module().nmod_matrix_set_entry(
                nmod_storage.resource, row, col, residue
            )
            self._prime_residues_cache = runtime.undefined
            self._native_handle = runtime.undefined
            self._clear_cache()
            return
        if (
            isinstance(m4ri_storage, _M4riMatrixResourceStorage)
            or _is_packed_uint64(prime_storage)
        ) and _is_packed_dense_prime_base(self.base_ring()):
            residue = _prime_residue_value(self.base_ring(), value)
            if isinstance(m4ri_storage, _M4riMatrixResourceStorage):
                kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_set_entry
                kernel(m4ri_storage.resource, row, col, residue)
                self._prime_residues_cache = runtime.undefined
            else:
                prime_storage[row * self.ncols() + col] = runtime.bigint(residue)
            self._native_handle = runtime.undefined
            self._clear_cache()
            return
        if self._has_packed_rational_storage():
            kernel = _dense_rational_kernel_module().dense_rational_matrix_set
            rational = sage.QQ(value)
            required_capacity = max(
                _integer_value_capacity(rational._numerator),
                _integer_value_capacity(rational._denominator),
            )
            if self._rational_capacity() < required_capacity:
                self._rational_storage_cache = _PackedRationalStorage(
                    _dense_integer_buffer(
                        kernel,
                        self._rational_numerators(),
                        required_capacity,
                    ),
                    _dense_integer_buffer(
                        kernel,
                        self._rational_denominators(),
                        required_capacity,
                    ),
                )
            while True:
                try:
                    numerators, denominators = self._rational_kernel_parts(kernel)
                    kernel(
                        numerators,
                        denominators,
                        row * self.ncols() + col,
                        rational._numerator,
                        rational._denominator,
                    )
                    if not _native_kernel_available(kernel):
                        self._rational_storage_cache = _PackedRationalStorage(
                            numerators, denominators
                        )
                    break
                except Exception as error:
                    if not _integer_capacity_error(error):
                        raise
                    capacity = self._rational_capacity() * 2
                    if capacity > 1048576:
                        raise OverflowError(  # noqa: B904
                            "rational matrix entry requires excessive limb capacity"
                        )
                    self._rational_storage_cache = _PackedRationalStorage(
                        _dense_integer_buffer(
                            kernel, self._rational_numerators(), capacity
                        ),
                        _dense_integer_buffer(
                            kernel, self._rational_denominators(), capacity
                        ),
                    )
            self._clear_cache()
            return
        raise NotImplementedError(
            "matrix mutation is currently implemented for packed GF(p), "
            "ZZ, and QQ matrices"
        )

    def _check_batch_mutability(self) -> None:
        if self._immutable:
            raise ValueError("matrix is immutable; change a copy instead")

    def _set_dense_prime_sequence(
        self,
        values: Any,
        start: int,
        stride: int,
        operation: str,
    ) -> None:
        """Commit one already-coerced affine sequence in one kernel call."""
        if len(values) == 0:
            return
        modulus = int(_untyped(self.base_ring()).characteristic())
        if self._has_m4ri_matrix_resource():
            kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_set_sequence
            start_row = start // self.ncols()
            start_column = start % self.ncols()
            row_stride = 0
            column_stride = 1
            if stride != 1:
                row_stride = 1
                column_stride = 0
            valid = kernel(
                self._m4ri_resource(),
                _dense_signed_buffer(kernel, values),
                runtime.bigint(len(values)),
                runtime.bigint(start_row),
                runtime.bigint(start_column),
                runtime.bigint(row_stride),
                runtime.bigint(column_stride),
            )
            if not valid:
                raise RuntimeError("M4RI batch mutation validation failed")
            self._prime_residues_cache = runtime.undefined
        elif _is_packed_uint64(self._prime_residues_cache):
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_set_sequence
            target = self._prime_kernel_buffer(kernel)
            valid = kernel(
                target,
                _dense_prime_buffer(kernel, values),
                self.nrows(),
                self.ncols(),
                start,
                stride,
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime batch mutation validation failed")
            self._prime_residues_cache = _packed_uint64(target)
        else:
            raise NotImplementedError("batch mutation requires packed GF(p) storage")
        self._native_handle = runtime.undefined
        self._clear_cache()
        _trace_dense_prime_selection(
            operation,
            _typed_python_implementation(kernel),
            self.nrows(),
            self.ncols(),
            modulus,
        )

    def _swap_dense_prime_axis(
        self,
        first: int,
        second: int,
        swap_columns: bool,
        plan: Any,
    ) -> None:
        """Swap one checked packed-prime axis without copying the matrix."""
        modulus = int(_untyped(self.base_ring()).characteristic())
        operation = "swap_columns" if swap_columns else "swap_rows"
        if self._has_m4ri_matrix_resource():
            kernel_module = _dense_binary_m4ri_kernel_module()
            kernel = (
                kernel_module.m4ri_dense_matrix_swap_columns
                if swap_columns
                else kernel_module.m4ri_dense_matrix_swap_rows
            )
            valid = kernel(
                self._m4ri_resource(),
                runtime.bigint(first),
                runtime.bigint(second),
            )
            if not valid:
                raise RuntimeError("M4RI matrix swap validation failed")
            self._prime_residues_cache = runtime.undefined
        elif _is_packed_uint64(self._prime_residues_cache):
            kernel_module = _dense_prime_kernel_module()
            kernel = (
                kernel_module.dense_prime_field_matrix_swap_columns
                if swap_columns
                else kernel_module.dense_prime_field_matrix_swap_rows
            )
            if _native_kernel_available(kernel):
                target = self._prime_kernel_buffer(kernel)
                valid = kernel(
                    target,
                    self.nrows(),
                    self.ncols(),
                    first,
                    second,
                    modulus,
                )
                if not valid:
                    raise RuntimeError("dense prime matrix swap validation failed")
            else:
                # The checked semantic plan works directly on the canonical
                # typed array.  Sending it through `_dense_prime_buffer`
                # would copy and repack all `rows * columns` entries merely
                # to exchange one axis when native execution is disabled.
                _matrix_selection_plans_module().apply_swap(
                    self._prime_residues_cache,
                    plan,
                )
        else:
            raise NotImplementedError("matrix swap requires packed GF(p) storage")
        self._native_handle = runtime.undefined
        self._clear_cache()
        _trace_dense_prime_selection(
            operation,
            _typed_python_implementation(kernel),
            self.nrows(),
            self.ncols(),
            modulus,
        )

    def set_row(self, row: int, values: Any) -> None:
        """Set one row after staging and coercing every source entry."""
        _matrix_selection_module().set_row(self, row, values)

    def set_column(self, column: int, values: Any) -> None:
        """Set one column after staging and coercing every source entry."""
        _matrix_selection_module().set_column(self, column, values)

    def set_block(self, row: int, column: int, block: Any) -> None:
        """Set a checked matrix window through one canonical storage update."""
        self._check_batch_mutability()
        if not isinstance(block, Matrix):
            raise TypeError("block must be a matrix")
        temporary = runtime.undefined
        if block.base_ring() is not self.base_ring():
            block = block.change_ring(self.base_ring())
            temporary = block
        try:
            self._set_same_base_block(row, column, block)
        finally:
            if temporary is not runtime.undefined:
                if temporary._has_fmpz_matrix_resource():
                    temporary._integer_resource().close()
                elif temporary._has_fmpq_matrix_resource():
                    temporary._rational_resource().close()
                elif temporary._has_m4ri_matrix_resource():
                    temporary._m4ri_resource().close()
                elif temporary._has_nmod_matrix_resource():
                    temporary._nmod_resource().close()

    def _set_same_base_block(self, row: int, column: int, block: Matrix) -> None:
        """Set a same-base block whose temporary ownership is external."""
        if (
            row < 0
            or column < 0
            or row + block.nrows() > self.nrows()
            or column + block.ncols() > self.ncols()
        ):
            raise IndexError("matrix window index out of range")
        if block.nrows() == 0 or block.ncols() == 0:
            return
        if block is self:
            return
        if self._has_fmpz_matrix_resource() and block._has_fmpz_matrix_resource():
            _flint_ffi_module().fmpz_matrix_set_block(
                self._integer_resource(),
                row,
                column,
                block._integer_resource(),
            )
            self._integer_storage_cache.entries = runtime.undefined
            self._integer_entries_cache = runtime.undefined
            self._clear_cache()
            return
        if self._has_fmpq_matrix_resource() and block._has_fmpq_matrix_resource():
            _flint_ffi_module().fmpq_matrix_set_block(
                self._rational_resource(),
                row,
                column,
                block._rational_resource(),
            )
            self._rational_storage_cache.numerators = runtime.undefined
            self._rational_storage_cache.denominators = runtime.undefined
            self._clear_cache()
            return
        if self._has_nmod_matrix_resource() and block._has_nmod_matrix_resource():
            _flint_ffi_module().nmod_matrix_set_block(
                self._nmod_resource(), row, column, block._nmod_resource()
            )
            self._prime_residues_cache = runtime.undefined
            self._clear_cache()
            self._trace_word_prime_resource("set_block")
            return
        if not self._has_packed_prime_storage():
            raise NotImplementedError(
                "set_block requires generated exact or packed GF(p) storage"
            )
        modulus = int(_untyped(self.base_ring()).characteristic())
        if self._has_m4ri_matrix_resource() and block._has_m4ri_matrix_resource():
            kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_set_block
            valid = kernel(
                self._m4ri_resource(),
                runtime.number(self.nrows()),
                runtime.number(self.ncols()),
                runtime.bigint(row),
                runtime.bigint(column),
                block._m4ri_resource(),
                runtime.number(block.nrows()),
                runtime.number(block.ncols()),
            )
            if not valid:
                raise RuntimeError("M4RI block mutation validation failed")
            self._prime_residues_cache = runtime.undefined
        elif (
            _is_packed_uint64(self._prime_residues_cache)
            and block._has_packed_prime_storage()
        ):
            kernel_module = _dense_prime_kernel_module()
            kernel = kernel_module.dense_prime_field_matrix_set_block
            target_entries = self._prime_kernel_buffer(kernel)
            target = kernel_module.DensePrimeMatrix(
                target_entries,
                self.nrows(),
                self.ncols(),
                modulus,
            )
            source = kernel_module.DensePrimeMatrix(
                block._prime_kernel_buffer(kernel),
                block.nrows(),
                block.ncols(),
                modulus,
            )
            valid = kernel(target, row, column, source)
            if not valid:
                raise RuntimeError("dense prime block mutation validation failed")
            self._prime_residues_cache = _packed_uint64(target_entries)
        else:
            raise RuntimeError("dense prime block storage representations disagree")
        self._native_handle = runtime.undefined
        self._clear_cache()
        _trace_dense_prime_selection(
            "set_block",
            _typed_python_implementation(kernel),
            self.nrows(),
            self.ncols(),
            modulus,
        )

    def list(self) -> list[Any]:
        if self._has_packed_prime_storage() or self._has_nmod_matrix_resource():
            return list(self._prime_host_values())
        if self._has_fmpz_matrix_resource() or self._has_fmpq_matrix_resource():
            if self._row_vectors_cache is not runtime.undefined:
                return runtime.reference_matrix_flatten(
                    [row.list() for row in self._row_vectors_cache],
                    self.nrows(),
                    self.ncols(),
                )
            if self._column_vectors_cache is not runtime.undefined:
                return runtime.reference_matrix_flatten(
                    [row.list() for row in self._cached_row_vectors()],
                    self.nrows(),
                    self.ncols(),
                )
            return list(self._exact_host_values())
        if self._has_packed_rational_storage():
            numerators = _integer_buffer_values(self._rational_numerators())
            denominators = _integer_buffer_values(self._rational_denominators())
            return [
                _untyped(sage.QQ)(numerators[index], denominators[index])
                for index in range(len(numerators))
            ]
        answer = []
        for row in range(self.nrows()):
            for col in range(self.ncols()):
                answer.append(self._entry(row, col))
        return answer

    def row(
        self,
        index: int,
        from_list: bool = False,
    ) -> Any:
        index = _normalize_named_index(index, self.nrows(), "row")
        if (
            self._has_packed_prime_storage() or self._has_nmod_matrix_resource()
        ) and self._prime_host_values_cache is not runtime.undefined:
            start = index * self.ncols()
            entries = self._prime_host_values()[start : start + self.ncols()]
            answer = VectorSpace(self.base_ring(), self.ncols())(entries)
        elif self._has_fmpz_matrix_resource() or self._has_fmpq_matrix_resource():
            entries = self._exact_host_sequence(index * self.ncols(), 1, self.ncols())
            answer = VectorSpace(self.base_ring(), self.ncols())(entries)
        else:
            answer = vector(
                self.base_ring(),
                [self._entry(index, col) for col in range(self.ncols())],
            )
        if (
            from_list
            and self.base_ring() is not sage.ZZ
            and self.base_ring() is not sage.QQ
        ):
            return runtime.math_tuple(answer.list())
        return answer

    def rows(self, copy: bool = True) -> list[Vector]:
        if copy not in [True, False]:
            raise ValueError("'copy' must be True or False")
        cached = self._cached_row_vectors()
        return list(cached) if copy else cached

    def column(
        self,
        index: int,
        from_list: bool = False,
    ) -> Any:
        index = _normalize_named_index(index, self.ncols(), "column")
        if (
            self._has_packed_prime_storage() or self._has_nmod_matrix_resource()
        ) and self._prime_host_values_cache is not runtime.undefined:
            values = self._prime_host_values()
            entries = [
                values[row * self.ncols() + index] for row in range(self.nrows())
            ]
            answer = VectorSpace(self.base_ring(), self.nrows())(entries)
        elif self._has_fmpz_matrix_resource() or self._has_fmpq_matrix_resource():
            entries = self._exact_host_sequence(index, self.ncols(), self.nrows())
            answer = VectorSpace(self.base_ring(), self.nrows())(entries)
        else:
            answer = vector(
                self.base_ring(),
                [self._entry(row, index) for row in range(self.nrows())],
            )
        if (
            from_list
            and self.base_ring() is not sage.ZZ
            and self.base_ring() is not sage.QQ
        ):
            return runtime.math_tuple(answer.list())
        return answer

    def columns(self, copy: bool = True) -> list[Vector]:
        if copy not in [True, False]:
            raise ValueError("'copy' must be True or False")
        cached = self._cached_column_vectors()
        return list(cached) if copy else cached

    def change_ring(self, base: sage.Parent) -> Matrix:
        base = _canonical_base(base)
        if base is self.base_ring():
            return self
        if base is sage.QQ and self.base_ring() is sage.ZZ:
            if self._has_integer_storage():
                return MatrixSpace(
                    base,
                    self.nrows(),
                    self.ncols(),
                )._from_fmpq_matrix_resource(
                    _flint_ffi_module().fmpq_matrix_from_fmpz(self._integer_resource())
                )
            return matrix(base, self.nrows(), self.ncols(), self.list())
        if base is sage.ZZ and self.base_ring() is sage.QQ:
            if self._has_packed_rational_storage():
                if self._has_fmpq_matrix_resource():
                    try:
                        resource = _flint_ffi_module().fmpz_matrix_from_fmpq_integral(
                            self._rational_resource()
                        )
                    except ValueError:
                        raise TypeError("no conversion of this rational matrix to ZZ")  # noqa: B904
                    return MatrixSpace(
                        base,
                        self.nrows(),
                        self.ncols(),
                    )._from_fmpz_matrix_resource(resource)
                denominators = _integer_buffer_values(self._rational_denominators())
                if any(denominator != 1 for denominator in denominators):
                    raise TypeError("no conversion of this rational matrix to ZZ")
                return MatrixSpace(
                    base,
                    self.nrows(),
                    self.ncols(),
                )._from_integer_values(self._rational_numerators())
            return matrix(base, self.nrows(), self.ncols(), self.list())
        if (
            self.base_ring() is sage.ZZ
            and _is_dense_prime_base(base)
            and self._has_fmpz_matrix_resource()
        ):
            modulus = int(_untyped(base).characteristic())
            # The declared bulk reducer currently accepts every prime that
            # fits in a 32-bit residue. Small fields publish packed/M4RI
            # storage; larger fields feed the same bytes into the generated
            # nmod resource constructor. Wider word primes retain the correct
            # scalar fallback until the reducer's portable ABI grows to 64 bits.
            if modulus <= 0xFFFFFFFF:
                width = 1 if modulus <= 0x100 else 2 if modulus <= 0x10000 else 4
                region = _flint_ffi_module().fmpz_matrix_export_mod_ui(
                    self._integer_resource(),
                    modulus,
                    width,
                )
                return MatrixSpace(
                    base,
                    self.nrows(),
                    self.ncols(),
                )._from_packed_residues(region.take_bytes(), width)
        if self.base_ring() is sage.ZZ and (
            _is_modular_base(base)
            or _is_extension_field_base(base)
            or _is_algebraic_base(base)
            or _is_approximate_base(base)
        ):
            return matrix(base, self.nrows(), self.ncols(), self.list())
        if _is_algebraic_base(base) and (
            self.base_ring() is sage.QQ or _is_algebraic_base(self.base_ring())
        ):
            return matrix(base, self.nrows(), self.ncols(), self.list())
        if _is_approximate_base(base) and (
            self.base_ring() is sage.QQ or _is_approximate_base(self.base_ring())
        ):
            return matrix(base, self.nrows(), self.ncols(), self.list())
        raise TypeError("unsupported matrix base-ring conversion")

    def _pair(self, other: object) -> tuple[Matrix, Matrix]:
        if not isinstance(other, Matrix) or self.dimensions() != other.dimensions():
            raise TypeError("matrix dimensions must agree")
        base = _common_base(self.base_ring(), other.base_ring())
        return self.change_ring(base), other.change_ring(base)

    def __add__(self, other: object) -> Matrix:
        left, right = self._pair(other)
        if left._has_packed_rational_storage() and right._has_packed_rational_storage():
            if left._has_fmpq_matrix_resource() and right._has_fmpq_matrix_resource():
                resource = _flint_ffi_module().fmpq_matrix_add(
                    left._rational_resource(),
                    right._rational_resource(),
                )
                _trace_dense_rational_selection(
                    "add",
                    "generated-flint-resource",
                    left.nrows(),
                    left.ncols(),
                )
                return left._parent._from_fmpq_matrix_resource(resource)
            kernel = _dense_rational_kernel_module().dense_rational_matrix_add
            left_numerators, left_denominators = left._rational_kernel_parts(kernel)
            right_numerators, right_denominators = right._rational_kernel_parts(kernel)

            def invoke_rational_add(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    left_numerators,
                    left_denominators,
                    right_numerators,
                    right_denominators,
                ):
                    raise RuntimeError("dense rational addition mismatch")

            storage = _run_rational_output(
                kernel,
                left.nrows() * left.ncols(),
                invoke_rational_add,
                left._rational_capacity() + right._rational_capacity() + 1,
            )
            _trace_dense_rational_selection(
                "add",
                _typed_python_implementation(kernel),
                left.nrows(),
                left.ncols(),
            )
            return left._parent._from_canonical_rational_entries(
                storage.numerators, storage.denominators
            )
        if left._has_integer_storage() and right._has_integer_storage():
            resource = _flint_ffi_module().fmpz_matrix_add(
                left._integer_resource(), right._integer_resource()
            )
            _trace_dense_integer_selection(
                "add",
                "generated-flint-resource",
                left.nrows(),
                left.ncols(),
            )
            return left._parent._from_fmpz_matrix_resource(resource)
        if left._has_m4ri_matrix_resource() and right._has_m4ri_matrix_resource():
            resource = _m4ri_ffi_module().matrix_add(
                left._m4ri_resource(), right._m4ri_resource()
            )
            _trace_dense_prime_selection(
                "add", "generated-m4ri-resource", left.nrows(), left.ncols(), 2
            )
            return left._parent._from_m4ri_matrix_resource(resource)
        if left._has_nmod_matrix_resource() and right._has_nmod_matrix_resource():
            resource = _flint_ffi_module().nmod_matrix_add(
                left._nmod_resource(), right._nmod_resource()
            )
            left._trace_word_prime_resource("add")
            return left._parent._from_nmod_matrix_resource(resource)
        if left._has_packed_prime_storage() and right._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_add
            modulus = int(_untyped(left.base_ring()).characteristic())
            entries = _dense_prime_zeros(kernel, left.nrows() * left.ncols())
            valid = kernel(
                entries,
                left._prime_kernel_buffer(kernel),
                right._prime_kernel_buffer(kernel),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime addition buffer mismatch")
            _trace_dense_prime_selection(
                "add",
                _typed_python_implementation(kernel),
                left.nrows(),
                left.ncols(),
                modulus,
            )
            return left._parent._from_canonical_uint64_residues(entries)
        backend = runtime.flint_backend()
        if _is_extension_field_base(left.base_ring()):
            native_value = backend.fqMatrixAdd(left._native, right._native)
        else:
            native_value = backend.matrixAdd(left._native, right._native)
        return Matrix(
            left._parent,
            native_value,
        )

    def __sub__(self, other: object) -> Matrix:
        left, right = self._pair(other)
        if left._has_packed_rational_storage() and right._has_packed_rational_storage():
            if left._has_fmpq_matrix_resource() and right._has_fmpq_matrix_resource():
                resource = _flint_ffi_module().fmpq_matrix_sub(
                    left._rational_resource(),
                    right._rational_resource(),
                )
                _trace_dense_rational_selection(
                    "subtract",
                    "generated-flint-resource",
                    left.nrows(),
                    left.ncols(),
                )
                return left._parent._from_fmpq_matrix_resource(resource)
            kernel = _dense_rational_kernel_module().dense_rational_matrix_subtract
            left_numerators, left_denominators = left._rational_kernel_parts(kernel)
            right_numerators, right_denominators = right._rational_kernel_parts(kernel)

            def invoke_rational_subtract(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    left_numerators,
                    left_denominators,
                    right_numerators,
                    right_denominators,
                ):
                    raise RuntimeError("dense rational subtraction mismatch")

            storage = _run_rational_output(
                kernel,
                left.nrows() * left.ncols(),
                invoke_rational_subtract,
                left._rational_capacity() + right._rational_capacity() + 1,
            )
            _trace_dense_rational_selection(
                "subtract",
                _typed_python_implementation(kernel),
                left.nrows(),
                left.ncols(),
            )
            return left._parent._from_canonical_rational_entries(
                storage.numerators, storage.denominators
            )
        if left._has_integer_storage() and right._has_integer_storage():
            resource = _flint_ffi_module().fmpz_matrix_sub(
                left._integer_resource(), right._integer_resource()
            )
            _trace_dense_integer_selection(
                "subtract",
                "generated-flint-resource",
                left.nrows(),
                left.ncols(),
            )
            return left._parent._from_fmpz_matrix_resource(resource)
        if left._has_m4ri_matrix_resource() and right._has_m4ri_matrix_resource():
            resource = _m4ri_ffi_module().matrix_add(
                left._m4ri_resource(), right._m4ri_resource()
            )
            _trace_dense_prime_selection(
                "subtract",
                "generated-m4ri-resource",
                left.nrows(),
                left.ncols(),
                2,
            )
            return left._parent._from_m4ri_matrix_resource(resource)
        if left._has_nmod_matrix_resource() and right._has_nmod_matrix_resource():
            resource = _flint_ffi_module().nmod_matrix_sub(
                left._nmod_resource(), right._nmod_resource()
            )
            left._trace_word_prime_resource("subtract")
            return left._parent._from_nmod_matrix_resource(resource)
        if left._has_packed_prime_storage() and right._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_subtract
            modulus = int(_untyped(left.base_ring()).characteristic())
            entries = _dense_prime_zeros(kernel, left.nrows() * left.ncols())
            valid = kernel(
                entries,
                left._prime_kernel_buffer(kernel),
                right._prime_kernel_buffer(kernel),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime subtraction buffer mismatch")
            _trace_dense_prime_selection(
                "subtract",
                _typed_python_implementation(kernel),
                left.nrows(),
                left.ncols(),
                modulus,
            )
            return left._parent._from_canonical_uint64_residues(entries)
        backend = runtime.flint_backend()
        if _is_extension_field_base(left.base_ring()):
            native_value = backend.fqMatrixSub(left._native, right._native)
        else:
            native_value = backend.matrixSub(left._native, right._native)
        return Matrix(
            left._parent,
            native_value,
        )

    def __neg__(self) -> Matrix:
        if self._has_fmpz_matrix_resource():
            resource = _flint_ffi_module().fmpz_matrix_neg(self._integer_resource())
            _trace_dense_integer_selection(
                "negate",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_same_shape_fmpz_matrix_resource(resource)
        if self._has_fmpq_matrix_resource():
            resource = _flint_ffi_module().fmpq_matrix_neg(self._rational_resource())
            _trace_dense_rational_selection(
                "negate",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_same_shape_fmpq_matrix_resource(resource)
        if self._has_packed_rational_storage():
            kernel = _dense_rational_kernel_module().dense_rational_matrix_negate
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_negate(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                ):
                    raise RuntimeError("dense rational negation mismatch")

            storage = _run_rational_output(
                kernel,
                self.nrows() * self.ncols(),
                invoke_rational_negate,
                self._rational_capacity(),
            )
            _trace_dense_rational_selection(
                "negate",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_canonical_rational_entries(
                storage.numerators, storage.denominators
            )
        if self._has_m4ri_matrix_resource():
            resource = _m4ri_ffi_module().matrix_copy(self._m4ri_resource())
            _trace_dense_prime_selection(
                "negate", "generated-m4ri-resource", self.nrows(), self.ncols(), 2
            )
            return self._parent._from_m4ri_matrix_resource(resource)
        if self._has_nmod_matrix_resource():
            resource = _flint_ffi_module().nmod_matrix_neg(self._nmod_resource())
            self._trace_word_prime_resource("negate")
            return self._parent._from_nmod_matrix_resource(resource)
        if self._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_negate
            modulus = int(_untyped(self.base_ring()).characteristic())
            entries = _dense_prime_zeros(kernel, self.nrows() * self.ncols())
            valid = kernel(
                entries,
                self._prime_kernel_buffer(kernel),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime negation buffer mismatch")
            _trace_dense_prime_selection(
                "negate",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            return self._parent._from_canonical_uint64_residues(entries)
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            native_value = backend.fqMatrixNeg(self._native)
        else:
            native_value = backend.matrixNeg(self._native)
        return Matrix(
            self._parent,
            native_value,
        )

    def _scalar_mul(self, scalar: object) -> Matrix:
        scalar_parent = getattr(scalar, "_parent", None)
        if _is_algebraic_base(scalar_parent) and not _is_algebraic_base(
            self.base_ring()
        ):
            return self.change_ring(_untyped(scalar_parent))._scalar_mul(scalar)
        if self._has_fmpz_matrix_resource() and runtime.is_exact_integer(scalar):
            resource = _flint_ffi_module().fmpz_matrix_scalar_mul(
                self._integer_resource(), scalar
            )
            _trace_dense_integer_selection(
                "scalar_multiply",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_same_shape_fmpz_matrix_resource(resource)
        if self._has_fmpq_matrix_resource() and (
            runtime.is_exact_integer(scalar) or isinstance(scalar, sage.Rational)
        ):
            if isinstance(scalar, sage.Rational):
                numerator = scalar._numerator
                denominator = scalar._denominator
            else:
                numerator = runtime.integer_bigint(scalar)
                denominator = runtime.bigint(1)
            resource = _flint_ffi_module().fmpq_matrix_scalar_mul(
                self._rational_resource(), numerator, denominator
            )
            _trace_dense_rational_selection(
                "scalar_multiply",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_same_shape_fmpq_matrix_resource(resource)
        if _is_extension_field_base(self.base_ring()):
            value = self.base_ring()(scalar)
            native_value = runtime.flint_backend().fqMatrixScalarMul(
                self._native, runtime.reflect.get(value, "_native")
            )
            return Matrix(self._parent, native_value)
        if _is_algebraic_base(self.base_ring()):
            value = self.base_ring()(scalar)
            return Matrix(
                self._parent,
                runtime.flint_backend().qqbarMatrixScalarMul(
                    self._native,
                    runtime.reflect.get(value, "_native"),
                ),
            )
        if _is_approximate_base(self.base_ring()):
            field = _complex_field(_approximate_precision(self.base_ring()))
            value = field(scalar)
            return Matrix(
                self._parent,
                runtime.flint_backend().acbMatrixScalarMul(
                    self._native,
                    runtime.reflect.get(value, "_native"),
                ),
            )
        if self._has_m4ri_matrix_resource():
            factor = int(_untyped(self.base_ring()(scalar))._value)
            if factor == 0:
                resource = _m4ri_ffi_module().matrix(self.nrows(), self.ncols())
            else:
                resource = _m4ri_ffi_module().matrix_copy(self._m4ri_resource())
            _trace_dense_prime_selection(
                "scalar_multiply",
                "generated-m4ri-resource",
                self.nrows(),
                self.ncols(),
                2,
            )
            return self._parent._from_m4ri_matrix_resource(resource)
        if self._has_nmod_matrix_resource():
            factor = int(_untyped(self.base_ring()(scalar))._value)
            resource = _flint_ffi_module().nmod_matrix_scalar_mul(
                self._nmod_resource(), factor
            )
            self._trace_word_prime_resource("scalar_multiply")
            return self._parent._from_nmod_matrix_resource(resource)
        if self._has_packed_prime_storage():
            kernel = (
                _dense_prime_kernel_module().dense_prime_field_matrix_scalar_multiply
            )
            modulus = int(_untyped(self.base_ring()).characteristic())
            factor = int(_untyped(self.base_ring()(scalar))._value)
            entries = _dense_prime_zeros(kernel, self.nrows() * self.ncols())
            valid = kernel(
                entries,
                self._prime_kernel_buffer(kernel),
                factor,
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime scalar-multiplication buffer mismatch")
            _trace_dense_prime_selection(
                "scalar_multiply",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            return self._parent._from_canonical_uint64_residues(entries)
        if self._has_integer_storage():
            scalar_base, _numerator, _denominator = _matrix_scalar_parts(
                self.base_ring(), scalar
            )
            if scalar_base is not sage.ZZ:
                result_base = _common_base(self.base_ring(), scalar_base)
                return self.change_ring(result_base)._scalar_mul(scalar)
            factor = sage.ZZ(scalar)
            resource = _flint_ffi_module().fmpz_matrix_scalar_mul(
                self._integer_resource(), factor
            )
            _trace_dense_integer_selection(
                "scalar_multiply",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_same_shape_fmpz_matrix_resource(resource)
        if self._has_packed_rational_storage():
            rational = sage.QQ(scalar)
            if self._has_fmpq_matrix_resource():
                resource = _flint_ffi_module().fmpq_matrix_scalar_mul(
                    self._rational_resource(),
                    rational._numerator,
                    rational._denominator,
                )
                _trace_dense_rational_selection(
                    "scalar_multiply",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
                return self._parent._from_same_shape_fmpq_matrix_resource(resource)
            kernel = (
                _dense_rational_kernel_module().dense_rational_matrix_scalar_multiply
            )
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_scalar(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    rational._numerator,
                    rational._denominator,
                ):
                    raise RuntimeError("dense rational scalar multiplication mismatch")

            storage = _run_rational_output(
                kernel,
                self.nrows() * self.ncols(),
                invoke_rational_scalar,
                self._rational_capacity()
                + max(
                    _integer_value_capacity(rational._numerator),
                    _integer_value_capacity(rational._denominator),
                ),
            )
            _trace_dense_rational_selection(
                "scalar_multiply",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_canonical_rational_entries(
                storage.numerators, storage.denominators
            )
        scalar_base, numerator, denominator = _matrix_scalar_parts(
            self.base_ring(), scalar
        )
        base = _common_base(self.base_ring(), scalar_base)
        source = self.change_ring(base)
        return Matrix(
            source._parent,
            runtime.flint_backend().matrixScalarMul(
                source._native, numerator, denominator
            ),
        )

    def _vector_product(self, vector_value: Vector, side: str) -> Vector:
        """Return one oriented dense product through a bulk storage boundary."""
        base = _common_base(self.base_ring(), vector_value.base_ring())
        return _matrix_vector_public_module().matrix_vector_product(
            self,
            vector_value,
            side,
            base,
            VectorSpace(
                base,
                self.nrows() if side == "right" else self.ncols(),
            ),
        )

    def __mul__(self, other: object) -> Any:
        if isinstance(other, Vector):
            return self._vector_product(other, "right")
        if isinstance(other, Matrix):
            if self.ncols() != other.nrows():
                raise ValueError(
                    "matrix dimensions are incompatible for multiplication"
                )
            base = _common_base(self.base_ring(), other.base_ring())
            left = self.change_ring(base)
            right = other.change_ring(base)
            if left._has_m4ri_matrix_resource() and right._has_m4ri_matrix_resource():
                resource = _m4ri_ffi_module().matrix_mul(
                    left._m4ri_resource(), right._m4ri_resource()
                )
                _trace_dense_prime_selection(
                    "multiply",
                    "generated-m4ri-resource",
                    left.nrows(),
                    right.ncols(),
                    2,
                )
                return MatrixSpace(
                    base, left.nrows(), right.ncols()
                )._from_m4ri_matrix_resource(resource)
            if left._has_nmod_matrix_resource() and right._has_nmod_matrix_resource():
                resource = _flint_ffi_module().nmod_matrix_mul(
                    left._nmod_resource(), right._nmod_resource()
                )
                left._trace_word_prime_resource("multiply")
                return MatrixSpace(
                    base, left.nrows(), right.ncols()
                )._from_nmod_matrix_resource(resource)
            if left._has_packed_prime_storage() and right._has_packed_prime_storage():
                modulus = int(_untyped(base).characteristic())
                if _use_fflas_matrix_mul(
                    left.nrows(), left.ncols(), right.ncols(), modulus
                ):
                    kernel_function = (
                        _dense_prime_fflas_module().fflas_dense_prime_field_matrix_mul
                    )
                    implementation = (
                        "declared-fflas-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-fflas-adapter"
                    )
                else:
                    kernel_function = (
                        _dense_prime_flint_module().flint_dense_prime_field_matrix_mul
                    )
                    implementation = (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-flint-adapter"
                    )
                output = _dense_prime_zeros(
                    kernel_function,
                    left.nrows() * right.ncols(),
                )
                kernel_function(
                    output,
                    left._prime_kernel_buffer(kernel_function),
                    right._prime_kernel_buffer(kernel_function),
                    left.nrows(),
                    left.ncols(),
                    right.ncols(),
                    modulus,
                )
                _trace_dense_prime_selection(
                    "multiply",
                    implementation,
                    left.nrows(),
                    right.ncols(),
                    modulus,
                )
                return MatrixSpace(
                    base,
                    left.nrows(),
                    right.ncols(),
                )._from_canonical_uint64_residues(output)
            if left._has_integer_storage() and right._has_integer_storage():
                resource = _flint_ffi_module().fmpz_matrix_mul(
                    left._integer_resource(), right._integer_resource()
                )
                _trace_dense_integer_selection(
                    "multiply",
                    "generated-flint-resource",
                    left.nrows(),
                    right.ncols(),
                )
                return MatrixSpace(
                    base, left.nrows(), right.ncols()
                )._from_fmpz_matrix_resource(resource)
            if (
                left._has_packed_rational_storage()
                and right._has_packed_rational_storage()
            ):
                if (
                    left._has_fmpq_matrix_resource()
                    and right._has_fmpq_matrix_resource()
                ):
                    resource = _flint_ffi_module().fmpq_matrix_mul(
                        left._rational_resource(),
                        right._rational_resource(),
                    )
                    _trace_dense_rational_selection(
                        "multiply",
                        "generated-flint-resource",
                        left.nrows(),
                        right.ncols(),
                    )
                    return MatrixSpace(
                        base,
                        left.nrows(),
                        right.ncols(),
                    )._from_fmpq_matrix_resource(resource)
                kernel = _dense_rational_flint_module().flint_dense_rational_matrix_mul
                left_numerators, left_denominators = left._rational_kernel_parts(kernel)
                right_numerators, right_denominators = right._rational_kernel_parts(
                    kernel
                )

                def invoke_rational_multiply(
                    output_numerators: Any,
                    output_denominators: Any,
                ) -> None:
                    kernel(
                        output_numerators,
                        output_denominators,
                        left_numerators,
                        left_denominators,
                        right_numerators,
                        right_denominators,
                        left.nrows(),
                        left.ncols(),
                        right.ncols(),
                    )

                storage = _run_rational_output(
                    kernel,
                    left.nrows() * right.ncols(),
                    invoke_rational_multiply,
                    (left._rational_capacity() + right._rational_capacity() + 4),
                )
                _trace_dense_rational_selection(
                    "multiply",
                    (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel)
                        else "declared-flint-adapter"
                    ),
                    left.nrows(),
                    right.ncols(),
                )
                return MatrixSpace(
                    base,
                    left.nrows(),
                    right.ncols(),
                )._from_canonical_rational_entries(
                    storage.numerators, storage.denominators
                )
            backend = runtime.flint_backend()
            if _is_extension_field_base(base):
                native_value = backend.fqMatrixMul(left._native, right._native)
            else:
                native_value = backend.matrixMul(left._native, right._native)
            return Matrix(
                MatrixSpace(base, left.nrows(), right.ncols()),
                native_value,
            )
        return self._scalar_mul(other)

    def __matmul__(self, other: object) -> Any:
        return self * other

    def _sparse_left_multiply(self, other: Matrix) -> Matrix:
        """Multiply while skipping zero entries in the left exact matrix."""
        if not isinstance(other, Matrix):
            raise TypeError("right operand must be a matrix")
        if self.ncols() != other.nrows():
            raise ValueError("matrix and matrix dimensions are incompatible")
        base = _common_base(self.base_ring(), other.base_ring())
        if base not in [sage.ZZ, sage.QQ] and not _is_algebraic_base(base):
            return self * other
        left = self.change_ring(base)
        right = other.change_ring(base)
        if base is sage.ZZ or base is sage.QQ:
            return left * right
        native_value = runtime.flint_backend().matrixSparseLeftMul(
            left._native, right._native
        )
        return Matrix(
            MatrixSpace(base, left.nrows(), right.ncols()),
            native_value,
        )

    def __rmul__(self, other: object) -> Matrix:
        return self._scalar_mul(other)

    def _sage_binop_(
        self,
        operator: str,
        other: object,
        reflected: bool,
    ) -> Any:
        if operator == "add" and not reflected:
            return self.__add__(other)
        if operator == "sub" and not reflected:
            return self.__sub__(other)
        if operator == "mul":
            if reflected:
                return self.__rmul__(other)
            return self.__mul__(other)
        if operator == "truediv" and not reflected:
            return self.__truediv__(other)
        raise TypeError("operation " + operator + " is not defined for matrices")

    def __truediv__(self, scalar: object) -> Matrix:
        if (
            _is_modular_base(self.base_ring())
            or _is_extension_field_base(self.base_ring())
            or _is_algebraic_base(self.base_ring())
        ):
            value = self.base_ring()(scalar)
            if value.is_zero():
                raise ZeroDivisionError("matrix division by zero")
            return self._scalar_mul(value ** runtime.bigint(-1))
        if _is_approximate_base(self.base_ring()):
            value = self.base_ring()(scalar)
            if value == 0:
                raise ZeroDivisionError("matrix division by zero")
            return self._scalar_mul(self.base_ring()(1) / value)
        _base, numerator, denominator = _scalar_parts(scalar)
        if numerator == 0:
            raise ZeroDivisionError("matrix division by zero")
        if self._has_fmpq_matrix_resource():
            resource = _flint_ffi_module().fmpq_matrix_scalar_mul(
                self._rational_resource(), denominator, numerator
            )
            _trace_dense_rational_selection(
                "scalar_divide",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_same_shape_fmpq_matrix_resource(resource)
        reciprocal = runtime.rational_class(denominator, numerator)
        return self._scalar_mul(reciprocal)

    def __pow__(self, exponent: int) -> Matrix:
        if not runtime.is_exact_integer(exponent):
            raise NotImplementedError("the given exponent is not supported")
        exponent = int(exponent)
        if not self.is_square():
            raise ArithmeticError("matrix must be square")
        if exponent < 0:
            return self.inverse() ** (-exponent)
        if self._has_fmpz_matrix_resource() and exponent <= 18446744073709551615:
            resource = _flint_ffi_module().fmpz_matrix_pow(
                self._integer_resource(), runtime.normalize_integer(exponent)
            )
            _trace_dense_integer_selection(
                "power",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._parent._from_fmpz_matrix_resource(resource)
        if exponent == 0:
            return identity_matrix(self.base_ring(), self.nrows())
        answer = None
        power = self
        while exponent:
            if exponent % 2:
                answer = power if answer is None else answer * power
            exponent //= 2
            if exponent:
                power = power * power
        assert answer is not None
        return answer

    def __rpow__(self, base: Any) -> Matrix:
        if base is None:
            raise TypeError(
                "Cannot convert NoneType to "
                "sage.matrix.matrix_integer_dense.Matrix_integer_dense"
            )
        raise NotImplementedError("the given exponent is not supported")

    def transpose(self) -> Matrix:
        if self._has_packed_rational_storage():
            if self._has_fmpq_matrix_resource():
                resource = _flint_ffi_module().fmpq_matrix_transpose(
                    self._rational_resource()
                )
                answer = MatrixSpace(
                    self.base_ring(),
                    self.ncols(),
                    self.nrows(),
                )._from_fmpq_matrix_resource(resource)
                answer._row_subdivisions = list(self._col_subdivisions)
                answer._col_subdivisions = list(self._row_subdivisions)
                _trace_dense_rational_selection(
                    "transpose",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
                return answer
            kernel = _dense_rational_kernel_module().dense_rational_matrix_transpose
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_transpose(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    self.nrows(),
                    self.ncols(),
                ):
                    raise RuntimeError("dense rational transpose mismatch")

            storage = _run_rational_output(
                kernel,
                self.nrows() * self.ncols(),
                invoke_rational_transpose,
                self._rational_capacity(),
            )
            answer = MatrixSpace(
                self.base_ring(),
                self.ncols(),
                self.nrows(),
            )._from_canonical_rational_entries(storage.numerators, storage.denominators)
            answer._row_subdivisions = list(self._col_subdivisions)
            answer._col_subdivisions = list(self._row_subdivisions)
            _trace_dense_rational_selection(
                "transpose",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return answer
        if self._has_integer_storage():
            resource = _flint_ffi_module().fmpz_matrix_transpose(
                self._integer_resource()
            )
            answer = MatrixSpace(
                self.base_ring(), self.ncols(), self.nrows()
            )._from_fmpz_matrix_resource(resource)
            answer._row_subdivisions = list(self._col_subdivisions)
            answer._col_subdivisions = list(self._row_subdivisions)
            _trace_dense_integer_selection(
                "transpose",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return answer
        if self._has_m4ri_matrix_resource():
            resource = _m4ri_ffi_module().matrix_transpose(self._m4ri_resource())
            answer = MatrixSpace(
                self.base_ring(), self.ncols(), self.nrows()
            )._from_m4ri_matrix_resource(resource)
            answer._row_subdivisions = list(self._col_subdivisions)
            answer._col_subdivisions = list(self._row_subdivisions)
            _trace_dense_prime_selection(
                "transpose",
                "generated-m4ri-resource",
                self.nrows(),
                self.ncols(),
                2,
            )
            return answer
        if self._has_nmod_matrix_resource():
            resource = _flint_ffi_module().nmod_matrix_transpose(self._nmod_resource())
            answer = MatrixSpace(
                self.base_ring(), self.ncols(), self.nrows()
            )._from_nmod_matrix_resource(resource)
            answer._row_subdivisions = list(self._col_subdivisions)
            answer._col_subdivisions = list(self._row_subdivisions)
            self._trace_word_prime_resource("transpose")
            return answer
        if self._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_transpose
            entries = _dense_prime_zeros(kernel, self.nrows() * self.ncols())
            modulus = int(_untyped(self.base_ring()).characteristic())
            valid = kernel(
                entries,
                self._prime_kernel_buffer(kernel),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime transpose buffer mismatch")
            _trace_dense_prime_selection(
                "transpose",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            answer = MatrixSpace(
                self.base_ring(), self.ncols(), self.nrows()
            )._from_canonical_uint64_residues(entries)
            answer._row_subdivisions = list(self._col_subdivisions)
            answer._col_subdivisions = list(self._row_subdivisions)
            return answer
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            native_value = backend.fqMatrixTranspose(self._native)
        else:
            native_value = backend.matrixTranspose(self._native)
        answer = Matrix(
            MatrixSpace(self.base_ring(), self.ncols(), self.nrows()),
            native_value,
        )
        answer._row_subdivisions = list(self._col_subdivisions)
        answer._col_subdivisions = list(self._row_subdivisions)
        return answer

    @property
    def T(self) -> Matrix:
        return self.transpose()

    def determinant(
        self,
        algorithm: Any = None,
        proof: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ValueError("determinant is only defined for square matrices")
        if algorithm == "linbox" and proof is not False:
            raise RuntimeError(
                "you must pass the proof=False option to the "
                "determinant command to use LinBox's det algorithm"
            )
        if algorithm not in [
            None,
            "m4ri",
            "flint",
            "linbox",
            "ntl",
            "padic",
            "pari",
            "lift",
            "charpoly",
        ]:
            raise ValueError("unknown determinant algorithm")
        if algorithm == "m4ri" and not self._has_m4ri_matrix_resource():
            raise ValueError("M4RI determinant requires an available GF(2) backend")
        if self._determinant_cache is not runtime.undefined:
            return self._determinant_cache
        if self._has_packed_rational_storage():
            if self._has_fmpq_matrix_resource():
                ffi = _flint_ffi_module()
                value = ffi.fmpq_matrix_det(self._rational_resource())
                try:
                    numerator = ffi.fmpq_value_numerator(value)
                    denominator = ffi.fmpq_value_denominator(value)
                finally:
                    value.close()
                self._determinant_cache = _untyped(sage.QQ)(
                    numerator,
                    denominator,
                )
                _trace_dense_rational_selection(
                    "determinant",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
                return self._determinant_cache
            kernel = (
                _dense_rational_flint_module().flint_dense_rational_matrix_determinant
            )
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_determinant(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    self.nrows(),
                    1,
                )

            storage = _run_rational_output(
                kernel,
                1,
                invoke_rational_determinant,
                self._rational_capacity() + 1,
            )
            numerator = _integer_buffer_values(storage.numerators)[0]
            denominator = _integer_buffer_values(storage.denominators)[0]
            self._determinant_cache = _untyped(sage.QQ)(numerator, denominator)
            _trace_dense_rational_selection(
                "determinant",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel)
                    else "declared-flint-adapter"
                ),
                self.nrows(),
                self.ncols(),
            )
            return self._determinant_cache
        if self._has_integer_storage():
            self._determinant_cache = runtime.normalize_integer(
                _flint_ffi_module().fmpz_matrix_det(self._integer_resource())
            )
            _trace_dense_integer_selection(
                "determinant",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._determinant_cache
        if self._has_m4ri_matrix_resource() and algorithm in [None, "m4ri"]:
            code = runtime.number(
                _m4ri_ffi_module().matrix_determinant_code(self._m4ri_resource())
            )
            if code not in [0, 1]:
                raise RuntimeError("M4RI determinant returned an invalid value")
            self._determinant_cache = self.base_ring()(code)
            _trace_dense_prime_selection(
                "determinant",
                "generated-m4ri-resource",
                self.nrows(),
                self.ncols(),
                2,
            )
            return self._determinant_cache
        if self._has_nmod_matrix_resource():
            self._determinant_cache = self.base_ring()(
                _flint_ffi_module().nmod_matrix_det(self._nmod_resource())
            )
            self._trace_word_prime_resource("determinant")
            return self._determinant_cache
        if self._has_packed_prime_storage():
            kernel = (
                _dense_prime_flint_module().flint_dense_prime_field_matrix_determinant
            )
            modulus = int(_untyped(self.base_ring()).characteristic())
            residue = kernel(
                self._prime_kernel_buffer(kernel),
                self.nrows(),
                modulus,
            )
            self._determinant_cache = self.base_ring()(residue)
            _trace_dense_prime_selection(
                "determinant",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel)
                    else "declared-flint-adapter"
                ),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            return self._determinant_cache
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            value = backend.fqMatrixDet(self._native)
        else:
            value = backend.matrixDet(self._native)
        self._determinant_cache = _entry_from_native(self.base_ring(), value)
        return self._determinant_cache

    det = determinant

    def _clear_cache(self) -> None:
        self._determinant_cache = runtime.undefined
        self._rank_cache = runtime.undefined
        self._inverse_cache = runtime.undefined
        self._rref_cache = runtime.undefined
        self._hermite_cache = runtime.undefined
        self._howell_cache = runtime.undefined
        self._hermite_transform_cache = runtime.undefined
        self._smith_cache = runtime.undefined
        self._right_kernel_cache = runtime.undefined
        self._left_kernel_cache = runtime.undefined
        self._pivots_cache = runtime.undefined
        # Scalar construction may invalidate an already empty matrix thousands
        # of times. Reuse these two identity-insensitive lookup tables rather
        # than allocate fresh maps for every successful write.
        self._charpoly_cache.clear()
        self._minpoly_cache.clear()
        self._prime_host_values_cache = runtime.undefined
        self._exact_host_values_cache = runtime.undefined
        self._row_vectors_cache = runtime.undefined
        self._column_vectors_cache = runtime.undefined

    def rank(self, algorithm: Any = None) -> int:
        if algorithm not in [None, "m4ri", "fflas", "flint", "linbox", "modp"]:
            raise ValueError(
                "algorithm must be one of 'm4ri', 'fflas', 'modp', 'flint' or 'linbox'"
            )
        if algorithm == "fflas" and not self._has_packed_prime_storage():
            raise ValueError("FFLAS rank requires a dense matrix over GF(p)")
        if algorithm == "m4ri" and not self._has_m4ri_matrix_resource():
            raise ValueError("M4RI rank requires an available GF(2) backend")
        if self._rank_cache is runtime.undefined:
            backend = runtime.flint_backend()
            if self._has_packed_rational_storage():
                if self._has_fmpq_matrix_resource():
                    self._rank_cache = runtime.number(
                        _flint_ffi_module().fmpq_matrix_rank(self._rational_resource())
                    )
                    _trace_dense_rational_selection(
                        "rank",
                        "generated-flint-resource",
                        self.nrows(),
                        self.ncols(),
                    )
                    return self._rank_cache
                kernel_function = (
                    _dense_rational_flint_module().flint_dense_rational_matrix_rank
                )
                numerators, denominators = self._rational_kernel_parts(kernel_function)
                rank_output = _dense_integer_zeros(kernel_function, 1, 1)
                kernel_function(
                    rank_output,
                    numerators,
                    denominators,
                    self.nrows(),
                    self.ncols(),
                    1,
                )
                self._rank_cache = runtime.number(
                    _integer_buffer_values(rank_output)[0]
                )
                _trace_dense_rational_selection(
                    "rank",
                    (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-flint-adapter"
                    ),
                    self.nrows(),
                    self.ncols(),
                )
            elif self._has_integer_storage():
                ffi = _flint_ffi_module()
                resource = self._integer_resource()
                maximum_rank = min(self.nrows(), self.ncols())
                if algorithm in ["flint", "linbox"]:
                    rank = ffi.fmpz_matrix_rank(resource)
                    implementation = "generated-flint-resource-exact"
                else:
                    rank = ffi.fmpz_matrix_rank_mod_46337(resource)
                    if rank == maximum_rank:
                        implementation = "generated-flint-resource-modular-certificate"
                    else:
                        rank = ffi.fmpz_matrix_rank(resource)
                        implementation = (
                            "generated-flint-resource-modular-inconclusive-exact"
                        )
                self._rank_cache = runtime.number(rank)
                _trace_dense_integer_selection(
                    "rank",
                    implementation,
                    self.nrows(),
                    self.ncols(),
                )
            elif self._has_m4ri_matrix_resource() and algorithm in [None, "m4ri"]:
                self._rank_cache = runtime.number(
                    _m4ri_ffi_module().matrix_rank(self._m4ri_resource())
                )
                _trace_dense_prime_selection(
                    "rank",
                    "generated-m4ri-resource",
                    self.nrows(),
                    self.ncols(),
                    2,
                )
            elif self._has_nmod_matrix_resource():
                self._rank_cache = runtime.number(
                    _flint_ffi_module().nmod_matrix_rank(self._nmod_resource())
                )
                self._trace_word_prime_resource("rank")
            elif self._has_packed_prime_storage() and algorithm != "modp":
                modulus = int(_untyped(self.base_ring()).characteristic())
                if algorithm == "fflas" or (
                    algorithm is None
                    and _use_fflas_matrix_rank(self.nrows(), self.ncols(), modulus)
                ):
                    if not _fflas_packed_prime_available(modulus):
                        raise ValueError(
                            "FFLAS rank requires an available backend and p < 256"
                        )
                    kernel_function = (
                        _dense_prime_fflas_module().fflas_dense_prime_field_matrix_rank
                    )
                    implementation = (
                        "declared-fflas-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-fflas-adapter"
                    )
                    rank_output = _dense_prime_zeros(kernel_function, 1)
                    kernel_function(
                        rank_output,
                        self._prime_kernel_buffer(kernel_function),
                        self.nrows(),
                        self.ncols(),
                        modulus,
                    )
                    self._rank_cache = runtime.number(rank_output[0])
                else:
                    ffi_module = _dense_prime_flint_module()
                    kernel_function = ffi_module.flint_dense_prime_field_matrix_rank
                    implementation = (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-flint-adapter"
                    )
                    self._rank_cache = runtime.number(
                        kernel_function(
                            self._prime_kernel_buffer(kernel_function),
                            self.nrows(),
                            self.ncols(),
                            modulus,
                        )
                    )
                _trace_dense_prime_selection(
                    "rank",
                    implementation,
                    self.nrows(),
                    self.ncols(),
                    modulus,
                )
            elif _is_extension_field_base(self.base_ring()):
                self._rank_cache = backend.fqMatrixRank(self._native)
            elif algorithm == "modp" and _uses_dense_prime_kernel(self.base_ring()):
                kernel_module = _dense_prime_kernel_module()
                kernel_function = kernel_module.dense_prime_field_matrix_rank
                count = self.nrows() * self.ncols()
                source = self._prime_kernel_buffer(kernel_function)
                workspace = _dense_prime_zeros(kernel_function, count)
                source_record = kernel_module.DensePrimeMatrix(
                    source,
                    self.nrows(),
                    self.ncols(),
                    int(_untyped(self.base_ring()).characteristic()),
                )
                self._rank_cache = runtime.number(
                    kernel_function(source_record, workspace)
                )
                _trace_dense_prime_selection(
                    "rank",
                    (
                        "typed-python"
                        if _native_kernel_available(kernel_function)
                        else "dynamic-python-explicit"
                    ),
                    self.nrows(),
                    self.ncols(),
                    int(_untyped(self.base_ring()).characteristic()),
                )
            else:
                self._rank_cache = backend.matrixRank(self._native)
                if _uses_dense_prime_kernel(self.base_ring()):
                    _trace_dense_prime_selection(
                        "rank",
                        "legacy-flint",
                        self.nrows(),
                        self.ncols(),
                        int(_untyped(self.base_ring()).characteristic()),
                    )
        return self._rank_cache

    def nullity(self) -> int:
        return self.nrows() - self.rank()

    def right_nullity(self) -> int:
        return self.ncols() - self.rank()

    def density(self) -> float:
        if self.nrows() == 0 or self.ncols() == 0:
            return 0.0
        if self._has_m4ri_matrix_resource():
            kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_nonzero_count
            nonzero = runtime.number(kernel(self._m4ri_resource()))
            _trace_dense_prime_selection(
                "density",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                2,
            )
            return nonzero / (self.nrows() * self.ncols())
        if self._has_nmod_matrix_resource():
            kernel = (
                _dense_word_prime_flint_module().flint_word_prime_matrix_nonzero_count
            )
            if _native_kernel_available(kernel):
                nonzero = runtime.number(kernel(self._nmod_resource()))
                implementation = "typed-python-isolated"
            else:
                nonzero = runtime.number(
                    _flint_ffi_module().nmod_matrix_nonzero_count(self._nmod_resource())
                )
                implementation = "generated-flint-resource"
            _trace_dense_prime_selection(
                "density",
                implementation,
                self.nrows(),
                self.ncols(),
                int(_untyped(self.base_ring()).characteristic()),
            )
            return nonzero / (self.nrows() * self.ncols())
        if self._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_nonzero_count
            modulus = int(_untyped(self.base_ring()).characteristic())
            nonzero = runtime.number(kernel(self._prime_kernel_buffer(kernel), modulus))
            _trace_dense_prime_selection(
                "density",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            return nonzero / (self.nrows() * self.ncols())
        if self._has_integer_storage():
            kernel = (
                _dense_integer_flint_module().flint_dense_integer_resource_nonzero_count
            )
            nonzero = runtime.number(kernel(self._integer_resource()))
            _trace_dense_integer_selection(
                "density",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return nonzero / (self.nrows() * self.ncols())
        if self._has_packed_rational_storage():
            if self._has_fmpq_matrix_resource():
                nonzero = runtime.number(
                    _flint_ffi_module().fmpq_matrix_nonzero_count(
                        self._rational_resource()
                    )
                )
                _trace_dense_rational_selection(
                    "density",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
                return nonzero / (self.nrows() * self.ncols())
            kernel = _dense_rational_kernel_module().dense_rational_matrix_nonzero_count
            numerators, _denominators = self._rational_kernel_parts(kernel)
            nonzero = runtime.number(kernel(numerators))
            _trace_dense_rational_selection(
                "density",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return nonzero / (self.nrows() * self.ncols())
        nonzero = 0
        for value in self.list():
            if value != 0:
                nonzero += 1
        return nonzero / (self.nrows() * self.ncols())

    def is_sparse(self) -> bool:
        return False

    def rref(self, algorithm: Any = None) -> Matrix:
        if algorithm not in [None, "m4ri", "fflas", "flint", "modp"]:
            raise ValueError("algorithm must be 'm4ri', 'fflas', 'flint', or 'modp'")
        if algorithm == "fflas" and not self._has_packed_prime_storage():
            raise ValueError("FFLAS RREF requires a dense matrix over GF(p)")
        if algorithm == "m4ri" and not self._has_m4ri_matrix_resource():
            raise ValueError("M4RI RREF requires an available GF(2) backend")
        if self._rref_cache is runtime.undefined:
            if self._has_integer_storage():
                self._rref_cache = self.change_ring(sage.QQ).rref(algorithm)
                self._rref_cache.set_immutable()
                return self._rref_cache
            if self._has_packed_rational_storage():
                if self._has_fmpq_matrix_resource():
                    ffi = _flint_ffi_module()
                    resource = ffi.fmpq_matrix_rref(self._rational_resource())
                    self._rank_cache = runtime.number(ffi.fmpq_matrix_rank(resource))
                    self._rref_cache = self._parent._from_fmpq_matrix_resource(resource)
                    self._rref_cache._rank_cache = self._rank_cache
                    self._rref_cache._rref_cache = self._rref_cache
                    self._rref_cache.set_immutable()
                    _trace_dense_rational_selection(
                        "rref",
                        "generated-flint-resource",
                        self.nrows(),
                        self.ncols(),
                    )
                    return self._rref_cache
                kernel = _dense_rational_flint_module().flint_dense_rational_matrix_rref
                source_numerators, source_denominators = self._rational_kernel_parts(
                    kernel
                )
                rank_output = _dense_integer_zeros(kernel, 1, 1)

                def invoke_rational_rref(
                    output_numerators: Any,
                    output_denominators: Any,
                ) -> None:
                    kernel(
                        rank_output,
                        output_numerators,
                        output_denominators,
                        source_numerators,
                        source_denominators,
                        self.nrows(),
                        self.ncols(),
                        1,
                    )

                storage = _run_rational_output(
                    kernel,
                    self.nrows() * self.ncols(),
                    invoke_rational_rref,
                    self._rational_capacity() + 1,
                )
                self._rank_cache = runtime.number(
                    _integer_buffer_values(rank_output)[0]
                )
                self._rref_cache = self._parent._from_canonical_rational_entries(
                    storage.numerators, storage.denominators
                )
                self._rref_cache._rank_cache = self._rank_cache
                self._rref_cache._rref_cache = self._rref_cache
                self._rref_cache.set_immutable()
                _trace_dense_rational_selection(
                    "rref",
                    (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel)
                        else "declared-flint-adapter"
                    ),
                    self.nrows(),
                    self.ncols(),
                )
                return self._rref_cache
            if self._has_m4ri_matrix_resource() and algorithm in [None, "m4ri"]:
                resource = _m4ri_ffi_module().matrix_rref(self._m4ri_resource())
                self._rref_cache = self._parent._from_m4ri_matrix_resource(resource)
                # The RREF resource retains the rank returned by this same
                # M4RI elimination, so this declared query is O(1).
                self._rank_cache = runtime.number(
                    _m4ri_ffi_module().matrix_rank(self._rref_cache._m4ri_resource())
                )
                self._rref_cache._rank_cache = self._rank_cache
                self._rref_cache._rref_cache = self._rref_cache
                self._rref_cache.set_immutable()
                _trace_dense_prime_selection(
                    "rref",
                    "generated-m4ri-resource",
                    self.nrows(),
                    self.ncols(),
                    2,
                )
                return self._rref_cache
            if self._has_nmod_matrix_resource():
                ffi = _flint_ffi_module()
                resource = ffi.nmod_matrix_rref(self._nmod_resource())
                self._rref_cache = self._parent._from_nmod_matrix_resource(resource)
                self._rank_cache = runtime.number(
                    ffi.nmod_matrix_rank(self._rref_cache._nmod_resource())
                )
                self._rref_cache._rank_cache = self._rank_cache
                self._rref_cache._rref_cache = self._rref_cache
                self._rref_cache.set_immutable()
                self._trace_word_prime_resource("rref")
                return self._rref_cache
            base = sage.QQ
            if _is_approximate_base(self.base_ring()):
                base = self.base_ring()
            if _is_algebraic_base(self.base_ring()) or getattr(
                self.base_ring(), "_kind", None
            ) in ["GF", "GF_EXTENSION"]:
                base = self.base_ring()
            backend = runtime.flint_backend()
            if self._has_packed_prime_storage():
                modulus = int(_untyped(self.base_ring()).characteristic())
                if algorithm == "modp":
                    kernel_module = _dense_prime_kernel_module()
                    kernel_function = kernel_module.dense_prime_field_matrix_rref
                    implementation = (
                        "typed-python"
                        if _native_kernel_available(kernel_function)
                        else "dynamic-python-explicit"
                    )
                    source = self._prime_kernel_buffer(kernel_function)
                    output = _dense_prime_zeros(
                        kernel_function, self.nrows() * self.ncols()
                    )
                    source_record = kernel_module.DensePrimeMatrix(
                        source,
                        self.nrows(),
                        self.ncols(),
                        modulus,
                    )
                    rank = runtime.number(kernel_function(source_record, output))
                elif algorithm == "fflas" or (
                    algorithm is None
                    and _use_fflas_matrix_rref(self.nrows(), self.ncols(), modulus)
                ):
                    if not _fflas_packed_prime_available(modulus):
                        raise ValueError(
                            "FFLAS RREF requires an available backend and p < 256"
                        )
                    kernel_function = (
                        _dense_prime_fflas_module().fflas_dense_prime_field_matrix_rref
                    )
                    implementation = (
                        "declared-fflas-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-fflas-adapter"
                    )
                    output = _dense_prime_zeros(
                        kernel_function, self.nrows() * self.ncols()
                    )
                    rank_output = _dense_prime_zeros(kernel_function, 1)
                    kernel_function(
                        output,
                        rank_output,
                        self._prime_kernel_buffer(kernel_function),
                        self.nrows(),
                        self.ncols(),
                        modulus,
                    )
                    rank = runtime.number(rank_output[0])
                else:
                    ffi_module = _dense_prime_flint_module()
                    kernel_function = ffi_module.flint_dense_prime_field_matrix_rref
                    implementation = (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-flint-adapter"
                    )
                    output = _dense_prime_zeros(
                        kernel_function, self.nrows() * self.ncols()
                    )
                    rank = runtime.number(
                        kernel_function(
                            output,
                            self._prime_kernel_buffer(kernel_function),
                            self.nrows(),
                            self.ncols(),
                            modulus,
                        )
                    )
                self._rank_cache = rank
                result_parent = MatrixSpace(
                    self.base_ring(), self.nrows(), self.ncols()
                )
                self._rref_cache = result_parent._from_canonical_uint64_residues(output)
                self._rref_cache._rank_cache = rank
                self._rref_cache._rref_cache = self._rref_cache
                self._rref_cache.set_immutable()
                _trace_dense_prime_selection(
                    "rref",
                    implementation,
                    self.nrows(),
                    self.ncols(),
                    int(_untyped(self.base_ring()).characteristic()),
                )
                return self._rref_cache
            if _is_extension_field_base(self.base_ring()):
                native_value = backend.fqMatrixRref(self._native)
            else:
                native_value = backend.matrixRref(self._native)
                if _uses_dense_prime_kernel(self.base_ring()):
                    _trace_dense_prime_selection(
                        "rref",
                        "legacy-flint",
                        self.nrows(),
                        self.ncols(),
                        int(_untyped(self.base_ring()).characteristic()),
                    )
            self._rref_cache = Matrix(
                MatrixSpace(base, self.nrows(), self.ncols()),
                native_value,
            )
        return self._rref_cache

    def hermite_form(
        self,
        algorithm: Any = None,
        include_zero_rows: bool = True,
        transformation: bool = False,
    ) -> Any:
        if self.base_ring() is not sage.ZZ:
            raise TypeError("Hermite form currently requires an integer matrix")
        if algorithm not in [
            None,
            "default",
            "flint",
            "ntl",
            "padic",
            "pari",
            "pari0",
            "pari4",
        ]:
            raise ValueError("unknown Hermite form algorithm")
        if algorithm == "ntl" and (not self.is_square() or self.rank() != self.nrows()):
            raise ValueError("ntl only computes HNF for square matrices of full rank.")
        if transformation:
            if self._hermite_transform_cache is runtime.undefined:
                ffi = _flint_ffi_module()
                hermite_resource = ffi.fmpz_matrix(self.nrows(), self.ncols())
                transform_resource = runtime.undefined
                try:
                    transform_resource = ffi.fmpz_matrix(self.nrows(), self.nrows())
                    ffi.fmpz_matrix_hnf_transform(
                        hermite_resource,
                        transform_resource,
                        self._integer_resource(),
                    )
                    self._hermite_cache = self._parent._from_fmpz_matrix_resource(
                        hermite_resource
                    )
                    self._hermite_transform_cache = MatrixSpace(
                        sage.ZZ, self.nrows(), self.nrows()
                    )._from_fmpz_matrix_resource(transform_resource)
                except Exception:
                    hermite_resource.close()
                    if transform_resource is not runtime.undefined:
                        transform_resource.close()
                    raise
                self._hermite_cache.set_immutable()
                _trace_dense_integer_selection(
                    "hermite_form",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
            hermite = self._hermite_cache
            transform = self._hermite_transform_cache
            if not include_zero_rows:
                indices = range(self.rank())
                hermite = hermite.matrix_from_rows(indices)
                transform = transform.matrix_from_rows(indices)
            return runtime.math_tuple([hermite, transform])
        if self._hermite_cache is runtime.undefined:
            resource = _flint_ffi_module().fmpz_matrix_hnf(self._integer_resource())
            self._hermite_cache = self._parent._from_fmpz_matrix_resource(resource)
            self._hermite_cache.set_immutable()
            _trace_dense_integer_selection(
                "hermite_form",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
        if not include_zero_rows:
            return self._hermite_cache.matrix_from_rows(range(self.rank()))
        return self._hermite_cache

    def smith_form(self) -> Any:
        if self.base_ring() is not sage.ZZ:
            raise TypeError("Smith form currently requires an integer matrix")
        if self._smith_cache is runtime.undefined:
            ffi = _flint_ffi_module()
            smith_resource = ffi.fmpz_matrix(self.nrows(), self.ncols())
            left_resource = runtime.undefined
            right_resource = runtime.undefined
            try:
                left_resource = ffi.fmpz_matrix(self.nrows(), self.nrows())
                right_resource = ffi.fmpz_matrix(self.ncols(), self.ncols())
                ffi.fmpz_matrix_snf_transform(
                    smith_resource,
                    left_resource,
                    right_resource,
                    self._integer_resource(),
                )
                self._smith_cache = runtime.math_tuple(
                    [
                        MatrixSpace(
                            sage.ZZ, self.nrows(), self.ncols()
                        )._from_fmpz_matrix_resource(smith_resource),
                        MatrixSpace(
                            sage.ZZ, self.nrows(), self.nrows()
                        )._from_fmpz_matrix_resource(left_resource),
                        MatrixSpace(
                            sage.ZZ, self.ncols(), self.ncols()
                        )._from_fmpz_matrix_resource(right_resource),
                    ]
                )
            except Exception:
                smith_resource.close()
                if left_resource is not runtime.undefined:
                    left_resource.close()
                if right_resource is not runtime.undefined:
                    right_resource.close()
                raise
            _trace_dense_integer_selection(
                "smith_form",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
        return self._smith_cache

    def howell_form(self) -> Matrix:
        if getattr(self.base_ring(), "_kind", None) != "ZMOD":
            raise TypeError("Howell form requires a residue-ring matrix")
        if self._howell_cache is runtime.undefined:
            rows = max(self.nrows(), self.ncols())
            self._howell_cache = Matrix(
                MatrixSpace(self.base_ring(), rows, self.ncols()),
                runtime.flint_backend().matrixHowell(self._native),
            )
        return self._howell_cache

    def elementary_divisors(self, algorithm: Any = None) -> list[Any]:
        diagonal = self.smith_form()[0].diagonal()
        while len(diagonal) < self.nrows():
            diagonal.append(0)
        return diagonal

    def echelon_form(
        self,
        algorithm: Any = None,
        include_zero_rows: bool = True,
        transformation: bool = False,
    ) -> Any:
        if self.base_ring() is sage.ZZ:
            return self.hermite_form(
                algorithm,
                include_zero_rows,
                transformation,
            )
        if getattr(self.base_ring(), "_kind", None) == "ZMOD":
            if transformation:
                raise NotImplementedError(
                    "Howell transformations are not available yet"
                )
            return self.howell_form()
        if transformation:
            raise NotImplementedError(
                "rational echelon transformations are not available"
            )
        return self.rref()

    def is_immutable(self) -> bool:
        return self._immutable

    def is_mutable(self) -> bool:
        return not self._immutable

    def set_immutable(self) -> None:
        self._immutable = True

    def set_mutable(self) -> None:
        self._immutable = False

    def pivots(self) -> Any:
        if self._pivots_cache is not runtime.undefined:
            return self._pivots_cache
        echelon = self.echelon_form()
        if (
            echelon._has_packed_prime_storage()
            or echelon._has_nmod_matrix_resource()
            or echelon._has_integer_storage()
            or echelon._has_packed_rational_storage()
        ):
            exact_entries = None
            pivot_count = 0
            pivot_output = None
            if echelon._has_m4ri_matrix_resource():
                kernel = _dense_binary_m4ri_kernel_module().m4ri_dense_matrix_pivots
                pivot_output = _dense_signed_zeros(
                    kernel, min(echelon.nrows(), echelon.ncols())
                )
                pivot_count = runtime.number(
                    kernel(pivot_output, echelon._m4ri_resource())
                )
            elif echelon._has_nmod_matrix_resource():
                kernel = _dense_word_prime_flint_module().flint_word_prime_matrix_pivots
                pivot_output = _dense_signed_zeros(
                    kernel, min(echelon.nrows(), echelon.ncols())
                )
                pivot_count = runtime.number(
                    kernel(pivot_output, echelon._nmod_resource())
                )
                if pivot_count < 0:
                    raise ValueError("word-prime pivot output is too small")
            elif _is_packed_uint64(echelon._prime_residues_cache):
                kernel_module = _dense_prime_kernel_module()
                kernel = kernel_module.dense_prime_field_matrix_pivots
                pivot_output = _dense_prime_zeros(
                    kernel, min(echelon.nrows(), echelon.ncols())
                )
                source = kernel_module.DensePrimeMatrix(
                    echelon._prime_kernel_buffer(kernel),
                    echelon.nrows(),
                    echelon.ncols(),
                    int(_untyped(echelon.base_ring()).characteristic()),
                )
                pivot_count = runtime.number(kernel(pivot_output, source))
            if pivot_output is not None:
                answer = runtime.math_tuple(
                    [
                        runtime.number(pivot_output[index])
                        for index in range(pivot_count)
                    ]
                )
                self._pivots_cache = answer
                echelon._pivots_cache = answer
                return answer
            if (
                echelon._has_fmpz_matrix_resource()
                or echelon._has_fmpq_matrix_resource()
            ):
                exact_entries = echelon._exact_host_values()
            pivots = []
            previous = -1
            for row in range(echelon.nrows()):
                pivot = None
                for column in range(previous + 1, echelon.ncols()):
                    if exact_entries is not None:
                        value = exact_entries[row * echelon.ncols() + column]
                    else:
                        value = echelon[row, column]
                    if value != 0:
                        pivot = column
                        break
                if pivot is not None:
                    pivots.append(pivot)
                    previous = pivot
            answer = runtime.math_tuple(pivots)
            self._pivots_cache = answer
            echelon._pivots_cache = answer
            return answer
        answer = runtime.flint_backend().matrixPivots(echelon._native)
        self._pivots_cache = runtime.math_tuple(
            [runtime.number(index) for index in answer]
        )
        return self._pivots_cache

    def row_space(self) -> VectorSubspaceParent:
        return VectorSubspaceParent(
            VectorSpace(self.base_ring(), self.ncols()),
            _canonical_row_basis(self),
        )

    row_module = row_space
    image = row_space

    def column_space(self) -> VectorSubspaceParent:
        return VectorSubspaceParent(
            VectorSpace(self.base_ring(), self.nrows()),
            _canonical_row_basis(self.transpose()),
        )

    column_module = column_space

    def right_kernel(self) -> VectorSubspaceParent:
        if self._right_kernel_cache is runtime.undefined:
            backend = runtime.flint_backend()
            native_value = runtime.undefined
            basis = None
            if self._has_integer_storage():
                columns = int(self.ncols())
                resource = _flint_ffi_module().fmpz_matrix_right_kernel(
                    self._integer_resource()
                )
                nullity = runtime.number(
                    _flint_ffi_module().fmpz_matrix_nrows(resource)
                )
                self._rank_cache = columns - nullity
                basis = MatrixSpace(
                    sage.ZZ, nullity, columns
                )._from_fmpz_matrix_resource(resource)
                _trace_dense_integer_selection(
                    "right_kernel",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
            elif self._has_fmpq_matrix_resource():
                columns = int(self.ncols())
                ffi = _flint_ffi_module()
                resource = ffi.fmpq_matrix_right_kernel(self._rational_resource())
                nullity = runtime.number(ffi.fmpq_matrix_nrows(resource))
                self._rank_cache = columns - nullity
                basis = MatrixSpace(
                    sage.QQ,
                    nullity,
                    columns,
                )._from_fmpq_matrix_resource(resource)
                _trace_dense_rational_selection(
                    "right_kernel",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
            elif self._has_m4ri_matrix_resource():
                columns = int(self.ncols())
                ffi = _m4ri_ffi_module()
                resource = ffi.matrix_right_kernel(self._m4ri_resource())
                nullity = runtime.number(ffi.matrix_nrows(resource))
                self._rank_cache = columns - nullity
                basis = MatrixSpace(
                    self.base_ring(), nullity, columns
                )._from_m4ri_matrix_resource(resource)
                basis._rank_cache = nullity
                _trace_dense_prime_selection(
                    "right_kernel",
                    "generated-m4ri-resource",
                    self.nrows(),
                    self.ncols(),
                    2,
                )
            elif self._has_nmod_matrix_resource():
                columns = int(self.ncols())
                ffi = _flint_ffi_module()
                resource = ffi.nmod_matrix_right_kernel(self._nmod_resource())
                nullity = runtime.number(ffi.nmod_matrix_nrows(resource))
                self._rank_cache = columns - nullity
                basis = MatrixSpace(
                    self.base_ring(), nullity, columns
                )._from_nmod_matrix_resource(resource)
                basis._rank_cache = nullity
                self._trace_word_prime_resource("right_kernel")
            elif self._has_packed_rational_storage():
                columns = int(self.ncols())
                reduced = self.rref()
                kernel_function = _dense_rational_kernel_module().dense_rational_matrix_kernel_from_rref
                reduced_numerators, reduced_denominators = (
                    reduced._rational_kernel_parts(kernel_function)
                )
                captured_nullity = [0]

                def invoke_rational_kernel(
                    output_numerators: Any,
                    output_denominators: Any,
                ) -> None:
                    captured_nullity[0] = runtime.number(
                        kernel_function(
                            output_numerators,
                            output_denominators,
                            reduced_numerators,
                            reduced_denominators,
                            self.nrows(),
                            columns,
                            1,
                        )
                    )

                storage = _run_rational_output(
                    kernel_function,
                    columns * columns,
                    invoke_rational_kernel,
                    reduced._rational_capacity() + 1,
                )
                nullity = captured_nullity[0]
                self._rank_cache = columns - nullity
                numerator_values = _integer_buffer_values(storage.numerators)
                denominator_values = _integer_buffer_values(storage.denominators)
                spanning = MatrixSpace(
                    sage.QQ,
                    nullity,
                    columns,
                )._from_rational_parts(
                    numerator_values[: nullity * columns],
                    denominator_values[: nullity * columns],
                )
                # The transparent kernel constructs the mathematically natural
                # free-variable basis. Canonicalize its row space through the
                # same declared packed FLINT boundary as every other RREF.
                basis = spanning.rref()
                _trace_dense_rational_selection(
                    "right_kernel",
                    (
                        "typed-python+declared-flint-isolated"
                        if _native_kernel_available(kernel_function)
                        else "dynamic-python+declared-flint-adapter"
                    ),
                    self.nrows(),
                    self.ncols(),
                )
            elif self._has_packed_prime_storage():
                columns = int(self.ncols())
                modulus = int(_untyped(self.base_ring()).characteristic())
                if _use_fflas_matrix_right_nullspace(self.nrows(), columns, modulus):
                    kernel_function = _dense_prime_fflas_module().fflas_dense_prime_field_matrix_right_nullspace
                    implementation = (
                        "declared-fflas-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-fflas-adapter"
                    )
                    output = _dense_prime_zeros(kernel_function, columns * columns)
                    nullity_output = _dense_prime_zeros(kernel_function, 1)
                    kernel_function(
                        output,
                        nullity_output,
                        self._prime_kernel_buffer(kernel_function),
                        self.nrows(),
                        columns,
                        modulus,
                    )
                    nullity = runtime.number(nullity_output[0])
                else:
                    kernel_function = _dense_prime_flint_module().flint_dense_prime_field_matrix_right_kernel
                    implementation = (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel_function)
                        else "declared-flint-adapter"
                    )
                    output = _dense_prime_zeros(kernel_function, columns * columns)
                    nullity = runtime.number(
                        kernel_function(
                            output,
                            self._prime_kernel_buffer(kernel_function),
                            self.nrows(),
                            columns,
                            modulus,
                        )
                    )
                self._rank_cache = columns - nullity
                basis_entries = _packed_uint64_prefix(output, nullity * columns)
                basis = MatrixSpace(
                    self.base_ring(), nullity, columns
                )._from_canonical_uint64_residues(basis_entries)
                _trace_dense_prime_selection(
                    "right_kernel",
                    implementation,
                    self.nrows(),
                    self.ncols(),
                    modulus,
                )
            elif _is_extension_field_base(self.base_ring()):
                nullity = self.ncols() - self.rank()
                native_value = backend.fqMatrixRightKernel(self._native)
            elif getattr(self.base_ring(), "_kind", None) == "CyclotomicField":
                cyclotomic_order = int(_cyclotomic_order(self.base_ring()))
                if cyclotomic_order in [3, 4, 6]:
                    # FLINT's direct qqbar elimination is already effective
                    # in quadratic fields and avoids translating legacy
                    # order-3 character presentations through a larger
                    # cyclotomic coordinate cache.
                    nullity = self.ncols() - self.rank()
                    native_value = backend.matrixRightKernel(self._native)
                else:
                    native_result = backend.cyclotomicMatrixRightKernel(
                        self._native,
                        runtime.integer_bigint(cyclotomic_order),
                    )
                    native_value = native_result[0]
                    nullity = int(native_result[1])
                    self._rank_cache = self.ncols() - nullity
            else:
                nullity = self.ncols() - self.rank()
                native_value = backend.matrixRightKernel(self._native)
                if _uses_dense_prime_kernel(self.base_ring()):
                    _trace_dense_prime_selection(
                        "right_kernel",
                        "legacy-flint",
                        self.nrows(),
                        self.ncols(),
                        int(_untyped(self.base_ring()).characteristic()),
                    )
            if (
                not self._has_packed_prime_storage()
                and not self._has_nmod_matrix_resource()
                and not self._has_integer_storage()
                and not self._has_packed_rational_storage()
            ):
                basis = Matrix(
                    MatrixSpace(self.base_ring(), nullity, self.ncols()),
                    native_value,
                )
            assert basis is not None
            # Native kernel constructors return the canonical RREF basis.
            # Recording that fact avoids recomputing an expensive echelon
            # form merely to discover its pivot columns when this basis is
            # used to define a modular-symbol subspace.
            basis._rref_cache = basis
            basis.set_immutable()
            self._right_kernel_cache = VectorSubspaceParent(
                VectorSpace(self.base_ring(), self.ncols()),
                basis,
                self,
                False,
            )
        return self._right_kernel_cache

    def right_kernel_matrix(
        self,
        *args: Any,
        **kwds: Any,
    ) -> Matrix:
        # Over a field the computed and echelon bases are both represented by
        # our canonical RREF basis matrix. Integer matrices likewise expose
        # their canonical saturated kernel basis.
        return self.right_kernel().basis_matrix()

    def left_kernel(self) -> VectorSubspaceParent:
        if self._left_kernel_cache is runtime.undefined:
            basis = self.transpose().right_kernel().basis_matrix()
            self._left_kernel_cache = VectorSubspaceParent(
                VectorSpace(self.base_ring(), self.nrows()),
                basis,
                self,
                True,
            )
        return self._left_kernel_cache

    def left_kernel_matrix(
        self,
        *args: Any,
        **kwds: Any,
    ) -> Matrix:
        return self.left_kernel().basis_matrix()

    kernel = left_kernel

    def _approximate_eigensystem(self) -> Any:
        if not self.is_square():
            raise ArithmeticError("only valid for square matrix")
        if not _is_approximate_base(self.base_ring()):
            raise TypeError("approximate eigensystems require a real or complex matrix")
        return runtime.flint_backend().matrixApproxEigensystem(self._native)

    def eigenvalues(
        self,
        extend: bool = True,
    ) -> list[Any]:
        if not self.is_square():
            raise ArithmeticError("only valid for square matrix")
        if _is_approximate_base(self.base_ring()):
            raw = self._approximate_eigensystem()
            values = runtime.reflect.get(raw, "values")
            answer = []
            for value in values:
                answer.append(_approximate_value_from_native(self.base_ring(), value))
            return answer
        if self.base_ring() not in [sage.ZZ, sage.QQ]:
            raise NotImplementedError(
                "eigenvalues are currently implemented for "
                "integer, rational, real, and complex matrices"
            )
        if not extend:
            raise NotImplementedError(
                "eigenvalues with extend=False are not available yet"
            )
        if self._has_integer_storage():
            return self.change_ring(sage.QQ).eigenvalues(extend)
        algebraic_field = runtime.reflect.get(runtime.global_object, "QQbar")
        values = []
        for value, multiplicity in self.charpoly().roots(algebraic_field):
            for _ in range(multiplicity):
                values.append(value)
        return _order_exact_eigenvalues(values)

    def _exact_eigenspaces_data(
        self,
        left: bool,
    ) -> list[Any]:
        values = self.eigenvalues()
        answer = []
        index = 0
        while index < len(values):
            value = values[index]
            multiplicity = 1
            while (
                index + multiplicity < len(values)
                and values[index + multiplicity] == value
            ):
                multiplicity += 1
            scalar_parent = runtime.reflect.get(value, "_parent")
            scalar = value
            if _is_algebraic_base(
                scalar_parent
            ) and runtime.flint_backend().qqbarIsRational(
                runtime.reflect.get(value, "_native")
            ):
                text = str(value)
                pieces = text.split("/")
                scalar_parent = sage.QQ
                scalar = runtime.rational_class(
                    int(pieces[0]),
                    int(pieces[1]) if len(pieces) == 2 else 1,
                )
                value = scalar
            elif not _is_algebraic_base(scalar_parent):
                scalar_parent = sage.QQ
                scalar = scalar_parent(value)
            source = self.change_ring(scalar_parent)
            shifted = source - identity_matrix(scalar_parent, self.nrows()) * scalar
            if left:
                space = shifted.left_kernel()
            else:
                space = shifted.right_kernel()
            answer.append(
                runtime.math_tuple(
                    [
                        value,
                        space,
                        multiplicity,
                    ]
                )
            )
            index += multiplicity
        return answer

    def _exact_eigenvectors(
        self,
        left: bool,
    ) -> list[Any]:
        answer = []
        for value, space, multiplicity in self._exact_eigenspaces_data(left):
            answer.append(
                runtime.math_tuple(
                    [
                        value,
                        space.basis(),
                        multiplicity,
                    ]
                )
            )
        return answer

    def _approximate_eigenvectors(
        self,
        left: bool,
    ) -> list[Any]:
        raw = self._approximate_eigensystem()
        raw_values = runtime.reflect.get(raw, "values")
        raw_vectors = runtime.reflect.get(
            raw,
            "leftVectors" if left else "rightVectors",
        )
        answer = []
        for index in range(len(raw_values)):
            value = _approximate_value_from_native(self.base_ring(), raw_values[index])
            force_complex = _is_complex_base(self.base_ring()) or _is_complex_base(
                getattr(value, "_parent", None)
            )
            vector_value = _approximate_vector_from_native(
                self.base_ring(),
                list(raw_vectors[index]),
                force_complex,
            )
            answer.append(
                runtime.math_tuple(
                    [
                        value,
                        [vector_value],
                        1,
                    ]
                )
            )
        return answer

    def eigenvectors_left(self) -> list[Any]:
        if _is_approximate_base(self.base_ring()):
            return self._approximate_eigenvectors(True)
        return self._exact_eigenvectors(True)

    def eigenvectors_right(self) -> list[Any]:
        if _is_approximate_base(self.base_ring()):
            return self._approximate_eigenvectors(False)
        return self._exact_eigenvectors(False)

    def _eigenspaces(self, left: bool) -> list[Any]:
        if not _is_approximate_base(self.base_ring()):
            answer = []
            for value, space, _multiplicity in self._exact_eigenspaces_data(left):
                answer.append(runtime.math_tuple([value, space]))
            return answer
        if left:
            vectors = self.eigenvectors_left()
        else:
            vectors = self.eigenvectors_right()
        answer = []
        for value, basis, _multiplicity in vectors:
            base = runtime.coercion_model.parentOf(value)
            basis_matrix = matrix(base, 1, self.nrows(), list(basis))
            answer.append(
                runtime.math_tuple(
                    [
                        value,
                        VectorSubspaceParent(
                            VectorSpace(base, self.nrows()),
                            basis_matrix,
                        ),
                    ]
                )
            )
        return answer

    def eigenspaces_left(self) -> list[Any]:
        return self._eigenspaces(True)

    def eigenspaces_right(self) -> list[Any]:
        return self._eigenspaces(False)

    def is_diagonalizable(
        self,
        base_field: Any = None,
    ) -> bool:
        if not self.is_square():
            return False
        if base_field is None and self.base_ring() is sage.ZZ:
            source = self.change_ring(sage.QQ)
        elif base_field is None:
            source = self
        else:
            source = self.change_ring(base_field)
        dimension = 0
        if not _is_approximate_base(source.base_ring()):
            spaces = source._exact_eigenspaces_data(False)
            for value, space, _multiplicity in spaces:
                if runtime.coercion_model.parentOf(value) is not source.base_ring():
                    return False
                dimension += space.dimension()
            return dimension == source.nrows()
        for value, basis, _multiplicity in source.eigenvectors_right():
            if runtime.coercion_model.parentOf(value) is not source.base_ring():
                return False
            dimension += len(basis)
        return dimension == source.nrows()

    def diagonalization(
        self,
        base_field: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ArithmeticError("only valid for square matrix")
        if base_field is None and self.base_ring() is sage.ZZ:
            source = self.change_ring(sage.QQ)
        elif base_field is None:
            source = self
        else:
            source = self.change_ring(base_field)
        values = []
        columns = []
        if _is_approximate_base(source.base_ring()):
            raise NotImplementedError(
                "approximate matrix diagonalization is not implemented"
            )
        for value, space, _multiplicity in source._exact_eigenspaces_data(False):
            if runtime.coercion_model.parentOf(value) is not source.base_ring():
                raise ValueError("matrix is not diagonalizable over its base field")
            basis_matrix = space.basis_matrix()
            for basis_index in range(basis_matrix.nrows()):
                values.append(value)
                columns.append(
                    [
                        basis_matrix[basis_index, coordinate]
                        for coordinate in range(basis_matrix.ncols())
                    ]
                )
        if len(columns) != source.nrows():
            raise ValueError("matrix is not diagonalizable over its base field")
        entries = []
        for row in range(source.nrows()):
            for col in range(source.ncols()):
                entries.append(columns[col][row])
        change = matrix(source.base_ring(), source.nrows(), source.ncols(), entries)
        diagonal = diagonal_matrix(source.base_ring(), values)
        return runtime.math_tuple([diagonal, change])

    def charpoly(
        self,
        variable: str = "x",
        algorithm: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ArithmeticError("only valid for square matrix")
        if algorithm not in [
            None,
            "flint",
            "generic",
            "linbox",
            "pari",
            "crt",
            "lift",
            "hessenberg",
            "df",
        ]:
            raise ValueError("unknown characteristic polynomial algorithm")
        cached = self._charpoly_cache.get(variable)
        if cached is not runtime.undefined:
            return cached
        ring = sage.PolynomialRing(self.base_ring(), variable)
        if self._has_fmpz_matrix_resource():
            resource = _flint_ffi_module().fmpz_matrix_charpoly(
                self._integer_resource()
            )
            answer = ring._from_fmpz_polynomial_resource(resource)
            self._charpoly_cache.set(variable, answer)
            _trace_dense_integer_selection(
                "charpoly",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return answer
        if self._has_fmpq_matrix_resource():
            resource = _flint_ffi_module().fmpq_matrix_charpoly(
                self._rational_resource()
            )
            answer = ring._from_fmpq_polynomial_resource(resource)
            self._charpoly_cache.set(variable, answer)
            _trace_dense_rational_selection(
                "charpoly",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return answer
        if self._has_nmod_matrix_resource():
            region = _flint_ffi_module().nmod_matrix_charpoly(self._nmod_resource())
            coefficients = runtime.uint64_unpack_le(
                region.take_bytes(), 8, self.nrows() + 1
            )
            answer = ring._from_coefficients(
                [self.base_ring()(coefficient) for coefficient in coefficients]
            )
            self._charpoly_cache.set(variable, answer)
            self._trace_word_prime_resource("charpoly")
            return answer
        if self._has_packed_rational_storage():
            kernel = _dense_rational_flint_module().flint_dense_rational_matrix_charpoly
            coefficient_count = self.nrows() + 1
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_charpoly(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    coefficient_count,
                    self.nrows(),
                    1,
                )

            storage = _run_rational_output(
                kernel,
                coefficient_count,
                invoke_rational_charpoly,
                self._rational_capacity() + 1,
            )
            numerators = _integer_buffer_values(storage.numerators)
            denominators = _integer_buffer_values(storage.denominators)
            answer = ring._from_coefficients(
                [
                    _untyped(sage.QQ)(numerators[index], denominators[index])
                    for index in range(coefficient_count)
                ]
            )
            self._charpoly_cache.set(variable, answer)
            _trace_dense_rational_selection(
                "charpoly",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel)
                    else "declared-flint-adapter"
                ),
                self.nrows(),
                self.ncols(),
            )
            return answer
        if self._has_packed_prime_storage():
            kernel = _dense_prime_flint_module().flint_dense_prime_field_matrix_charpoly
            modulus = int(_untyped(self.base_ring()).characteristic())
            coefficient_count = self.nrows() + 1
            source_count = self.nrows() * self.ncols()
            output = _dense_prime_zeros(kernel, coefficient_count)
            valid = kernel(
                output,
                self._prime_kernel_buffer(kernel),
                coefficient_count,
                source_count,
                self.nrows(),
                modulus,
            )
            if not valid:
                raise RuntimeError(
                    "dense prime characteristic-polynomial buffer mismatch"
                )
            answer = ring._from_coefficients(
                [self.base_ring()(output[index]) for index in range(coefficient_count)]
            )
            self._charpoly_cache.set(variable, answer)
            _trace_dense_prime_selection(
                "charpoly",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel)
                    else "declared-flint-adapter"
                ),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            return answer
        backend = runtime.flint_backend()
        if _is_extension_field_base(self.base_ring()):
            answer = ring._from_native(backend.fqMatrixCharpoly(self._native))
            self._charpoly_cache.set(variable, answer)
            return answer
        generator = ring.gen()
        power = ring(1)
        answer = ring(0)
        coefficients = backend.matrixCharpoly(self._native)
        for raw_coefficient in coefficients:
            coefficient = _entry_from_native(self.base_ring(), raw_coefficient)
            answer += ring(coefficient) * power
            power *= generator
        self._charpoly_cache.set(variable, answer)
        return answer

    characteristic_polynomial = charpoly

    def minpoly(
        self,
        variable: str = "x",
        algorithm: Any = None,
        proof: Any = None,
    ) -> Any:
        if not self.is_square():
            raise ArithmeticError("only valid for square matrix")
        cached = self._minpoly_cache.get(variable)
        if cached is not runtime.undefined:
            return cached
        if self._has_fmpz_matrix_resource():
            ring = sage.PolynomialRing(sage.ZZ, variable)
            resource = _flint_ffi_module().fmpz_matrix_minpoly(self._integer_resource())
            answer = ring._from_fmpz_polynomial_resource(resource)
            self._minpoly_cache.set(variable, answer)
            _trace_dense_integer_selection(
                "minpoly",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return answer
        if self._has_fmpq_matrix_resource():
            ring = sage.PolynomialRing(sage.QQ, variable)
            resource = _flint_ffi_module().fmpq_matrix_minpoly(
                self._rational_resource()
            )
            answer = ring._from_fmpq_polynomial_resource(resource)
            self._minpoly_cache.set(variable, answer)
            _trace_dense_rational_selection(
                "minpoly",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return answer
        if self._has_nmod_matrix_resource():
            ring = sage.PolynomialRing(self.base_ring(), variable)
            region = _flint_ffi_module().nmod_matrix_minpoly(self._nmod_resource())
            payload = region.take_bytes()
            coefficient_count = len(payload) // 8
            coefficients = runtime.uint64_unpack_le(payload, 8, coefficient_count)
            answer = ring._from_coefficients(
                [self.base_ring()(coefficient) for coefficient in coefficients]
            )
            self._minpoly_cache.set(variable, answer)
            self._trace_word_prime_resource("minpoly")
            return answer
        if self._has_packed_prime_storage():
            ring = sage.PolynomialRing(self.base_ring(), variable)
            kernel = _dense_prime_flint_module().flint_dense_prime_field_matrix_minpoly
            modulus = int(_untyped(self.base_ring()).characteristic())
            coefficient_count = self.nrows() + 1
            source_count = self.nrows() * self.ncols()
            output = _dense_prime_zeros(kernel, coefficient_count)
            valid = kernel(
                output,
                self._prime_kernel_buffer(kernel),
                coefficient_count,
                source_count,
                self.nrows(),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime minimal-polynomial buffer mismatch")
            while coefficient_count > 1 and output[coefficient_count - 1] == 0:
                coefficient_count -= 1
            answer = ring._from_coefficients(
                [self.base_ring()(output[index]) for index in range(coefficient_count)]
            )
            self._minpoly_cache.set(variable, answer)
            _trace_dense_prime_selection(
                "minpoly",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel)
                    else "declared-flint-adapter"
                ),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            return answer
        size = self.nrows()
        powers = [identity_matrix(self.base_ring(), size)]
        power_entries = [powers[0].list()]
        entries_per_power = size * size
        for degree in range(size + 1):
            entries = []
            for entry_index in range(entries_per_power):
                for power_index in range(degree + 1):
                    entries.append(power_entries[power_index][entry_index])
            relations = matrix(
                self.base_ring(),
                entries_per_power,
                degree + 1,
                entries,
            ).right_kernel()
            for relation in relations.basis():
                leading = relation[-1]
                if leading == 0:
                    continue
                finite_coefficients = getattr(self.base_ring(), "_kind", None) in [
                    "GF",
                    "GF_EXTENSION",
                ]
                if finite_coefficients:
                    coefficients = [coefficient / leading for coefficient in relation]
                    base = self.base_ring()
                else:
                    coefficients = [
                        sage.QQ(coefficient) / sage.QQ(leading)
                        for coefficient in relation
                    ]
                    base = sage.ZZ
                integer_coefficients = []
                if not finite_coefficients:
                    for coefficient in coefficients:
                        try:
                            integer_coefficients.append(sage.ZZ(coefficient))
                        except Exception:
                            base = sage.QQ
                            break
                if base is sage.ZZ:
                    coefficients = integer_coefficients
                ring = sage.PolynomialRing(base, variable)
                generator = ring.gen()
                answer = ring(0)
                power = ring(1)
                for coefficient in coefficients:
                    answer += ring(base(coefficient)) * power
                    power *= generator
                self._minpoly_cache.set(variable, answer)
                return answer
            powers.append(powers[-1] * self)
            power_entries.append(powers[-1].list())
        raise ArithmeticError("could not determine the minimal polynomial")

    minimal_polynomial = minpoly

    def _cache_inverse_result(self, answer: Matrix) -> Matrix:
        """Cache an immutable inverse and return a mutable Sage-style copy."""
        answer.set_immutable()
        self._inverse_cache = answer
        return answer.__copy__()

    def inverse(self) -> Matrix:
        if not self.is_square():
            raise ArithmeticError("matrix must be square")
        if self._inverse_cache is not runtime.undefined:
            return self._inverse_cache.__copy__()
        if self._has_fmpq_matrix_resource():
            try:
                resource = _flint_ffi_module().fmpq_matrix_inv(
                    self._rational_resource()
                )
            except Exception:
                raise ZeroDivisionError(  # noqa: B904
                    "matrix must be nonsingular"
                )
            answer = self._parent._from_fmpq_matrix_resource(resource)
            _trace_dense_rational_selection(
                "inverse",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return self._cache_inverse_result(answer)
        if self._has_packed_rational_storage():
            kernel = _dense_rational_flint_module().flint_dense_rational_matrix_inverse
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_inverse(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    self.nrows(),
                )

            try:
                storage = _run_rational_output(
                    kernel,
                    self.nrows() * self.ncols(),
                    invoke_rational_inverse,
                    self._rational_capacity() + 1,
                )
            except Exception:
                raise ZeroDivisionError(  # noqa: B904
                    "matrix must be nonsingular"
                )
            answer = self._parent._from_canonical_rational_entries(
                storage.numerators, storage.denominators
            )
            _trace_dense_rational_selection(
                "inverse",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel)
                    else "declared-flint-adapter"
                ),
                self.nrows(),
                self.ncols(),
            )
            return self._cache_inverse_result(answer)
        if self._has_integer_storage():
            return self._cache_inverse_result(self.change_ring(sage.QQ).inverse())
        if self._has_m4ri_matrix_resource():
            try:
                resource = _m4ri_ffi_module().matrix_inverse(self._m4ri_resource())
            except Exception:
                raise ZeroDivisionError("matrix must be nonsingular")  # noqa: B904
            answer = self._parent._from_m4ri_matrix_resource(resource)
            _trace_dense_prime_selection(
                "inverse",
                "generated-m4ri-resource",
                self.nrows(),
                self.ncols(),
                2,
            )
            return self._cache_inverse_result(answer)
        if self._has_nmod_matrix_resource():
            try:
                resource = _flint_ffi_module().nmod_matrix_inv(self._nmod_resource())
            except Exception:
                raise ZeroDivisionError("matrix must be nonsingular")  # noqa: B904
            answer = self._parent._from_nmod_matrix_resource(resource)
            self._trace_word_prime_resource("inverse")
            return self._cache_inverse_result(answer)
        if self._has_packed_prime_storage():
            ffi_module = _dense_prime_flint_module()
            kernel_function = ffi_module.flint_dense_prime_field_matrix_inverse
            output = _dense_prime_zeros(kernel_function, self.nrows() * self.ncols())
            try:
                kernel_function(
                    output,
                    self._prime_kernel_buffer(kernel_function),
                    self.nrows(),
                    int(_untyped(self.base_ring()).characteristic()),
                )
            except Exception:
                raise ZeroDivisionError(  # noqa: B904
                    "matrix must be nonsingular"
                )
            answer = self._parent._from_canonical_uint64_residues(output)
            _trace_dense_prime_selection(
                "inverse",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel_function)
                    else "declared-flint-adapter"
                ),
                self.nrows(),
                self.ncols(),
                int(_untyped(self.base_ring()).characteristic()),
            )
            return self._cache_inverse_result(answer)
        native_value = runtime.undefined
        try:
            backend = runtime.flint_backend()
            if _is_extension_field_base(self.base_ring()):
                native_value = backend.fqMatrixInverse(self._native)
            else:
                native_value = backend.matrixInverse(self._native)
        except Exception:
            pass
        if native_value is runtime.undefined:
            raise ZeroDivisionError("matrix must be nonsingular")
        inverse_base = sage.QQ
        if (
            _is_modular_base(self.base_ring())
            or _is_extension_field_base(self.base_ring())
            or _is_algebraic_base(self.base_ring())
            or _is_approximate_base(self.base_ring())
        ):
            inverse_base = self.base_ring()
        answer = Matrix(
            MatrixSpace(
                inverse_base,
                self.nrows(),
                self.ncols(),
            ),
            native_value,
        )
        return self._cache_inverse_result(answer)

    def inverse_of_unit(self, algorithm: Any = None) -> Matrix:
        if algorithm not in [
            None,
            "flint",
            "linbox",
            "lift",
            "crt",
        ]:
            raise ValueError("unknown matrix inverse algorithm")
        return self.inverse()

    def is_invertible(self) -> bool:
        return self.is_square() and self.rank() == self.nrows()

    is_unit = is_invertible

    def __invert__(self) -> Matrix:
        return self.inverse()

    def solve_right(self, right: object) -> Any:
        if isinstance(right, Vector):
            vector_result = True
            right_matrix = right.column()
        elif isinstance(right, Matrix):
            vector_result = False
            right_matrix = matrix(right)
        else:
            right_matrix = vector(right).column()
            vector_result = True
        if right_matrix.nrows() != self.nrows():
            raise ValueError("matrix and right side dimensions disagree")
        if (
            self.base_ring() is sage.ZZ
            and right_matrix.base_ring() is sage.ZZ
            and self._has_fmpz_matrix_resource()
            and right_matrix._has_fmpz_matrix_resource()
            and self.is_square()
        ):
            ffi = _flint_ffi_module()
            rational_left = runtime.undefined
            rational_right = runtime.undefined
            try:
                rational_left = ffi.fmpq_matrix_from_fmpz(self._integer_resource())
                rational_right = ffi.fmpq_matrix_from_fmpz(
                    right_matrix._integer_resource()
                )
                try:
                    resource = ffi.fmpq_matrix_solve(
                        rational_left,
                        rational_right,
                    )
                except ValueError:
                    raise ValueError(  # noqa: B904
                        "matrix equation has no solutions"
                    )
                solution = MatrixSpace(
                    sage.QQ,
                    self.ncols(),
                    right_matrix.ncols(),
                )._from_fmpq_matrix_resource(resource)
                _trace_dense_integer_selection(
                    "solve_right",
                    "generated-flint-resource",
                    self.nrows(),
                    right_matrix.ncols(),
                )
                return solution.column(0) if vector_result else solution
            finally:
                if rational_left is not runtime.undefined:
                    rational_left.close()
                if rational_right is not runtime.undefined:
                    rational_right.close()
        base = _common_base(self.base_ring(), right_matrix.base_ring())
        left_matrix = self.change_ring(base)
        right_matrix = right_matrix.change_ring(base)
        if (
            left_matrix._has_fmpq_matrix_resource()
            and right_matrix._has_fmpq_matrix_resource()
        ):
            try:
                resource = _flint_ffi_module().fmpq_matrix_solve(
                    left_matrix._rational_resource(),
                    right_matrix._rational_resource(),
                )
                solution = MatrixSpace(
                    base,
                    left_matrix.ncols(),
                    right_matrix.ncols(),
                )._from_fmpq_matrix_resource(resource)
                _trace_dense_rational_selection(
                    "solve_right",
                    "generated-flint-resource",
                    left_matrix.nrows(),
                    right_matrix.ncols(),
                )
                return solution.column(0) if vector_result else solution
            except Exception:
                raise ValueError(  # noqa: B904
                    "matrix equation has no solutions"
                )
        if (
            left_matrix._has_packed_rational_storage()
            and right_matrix._has_packed_rational_storage()
            and left_matrix.is_square()
        ):
            kernel = _dense_rational_flint_module().flint_dense_rational_matrix_solve
            left_numerators, left_denominators = left_matrix._rational_kernel_parts(
                kernel
            )
            right_numerators, right_denominators = right_matrix._rational_kernel_parts(
                kernel
            )

            def invoke_rational_solve(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                kernel(
                    output_numerators,
                    output_denominators,
                    left_numerators,
                    left_denominators,
                    right_numerators,
                    right_denominators,
                    left_matrix.nrows(),
                    right_matrix.ncols(),
                )

            try:
                storage = _run_rational_output(
                    kernel,
                    left_matrix.ncols() * right_matrix.ncols(),
                    invoke_rational_solve,
                    max(
                        left_matrix._rational_capacity(),
                        right_matrix._rational_capacity(),
                    )
                    + 1,
                )
                solution = MatrixSpace(
                    base,
                    left_matrix.ncols(),
                    right_matrix.ncols(),
                )._from_canonical_rational_entries(
                    storage.numerators, storage.denominators
                )
                _trace_dense_rational_selection(
                    "solve_right",
                    (
                        "declared-flint-isolated"
                        if _native_kernel_available(kernel)
                        else "declared-flint-adapter"
                    ),
                    left_matrix.nrows(),
                    right_matrix.ncols(),
                )
                return solution.column(0) if vector_result else solution
            except Exception:
                pass
        if (
            left_matrix._has_m4ri_matrix_resource()
            and right_matrix._has_m4ri_matrix_resource()
        ):
            try:
                resource = _m4ri_ffi_module().matrix_solve(
                    left_matrix._m4ri_resource(), right_matrix._m4ri_resource()
                )
            except Exception:
                raise ValueError("matrix equation has no solutions")  # noqa: B904
            solution = MatrixSpace(
                base,
                left_matrix.ncols(),
                right_matrix.ncols(),
            )._from_m4ri_matrix_resource(resource)
            _trace_dense_prime_selection(
                "solve_right",
                "generated-m4ri-resource",
                left_matrix.nrows(),
                right_matrix.ncols(),
                2,
            )
            return solution.column(0) if vector_result else solution
        if (
            left_matrix._has_nmod_matrix_resource()
            and right_matrix._has_nmod_matrix_resource()
            and left_matrix.is_square()
        ):
            try:
                resource = _flint_ffi_module().nmod_matrix_solve(
                    left_matrix._nmod_resource(), right_matrix._nmod_resource()
                )
            except Exception:
                raise ValueError("matrix equation has no solutions")  # noqa: B904
            solution = MatrixSpace(
                base,
                left_matrix.ncols(),
                right_matrix.ncols(),
            )._from_nmod_matrix_resource(resource)
            left_matrix._trace_word_prime_resource("solve_right")
            return solution.column(0) if vector_result else solution
        if (
            left_matrix._has_packed_prime_storage()
            and right_matrix._has_packed_prime_storage()
            and left_matrix.is_square()
        ):
            ffi_module = _dense_prime_flint_module()
            kernel_function = ffi_module.flint_dense_prime_field_matrix_solve
            output = _dense_prime_zeros(
                kernel_function,
                left_matrix.ncols() * right_matrix.ncols(),
            )
            solved = bool(
                kernel_function(
                    output,
                    left_matrix._prime_kernel_buffer(kernel_function),
                    right_matrix._prime_kernel_buffer(kernel_function),
                    left_matrix.nrows(),
                    right_matrix.ncols(),
                    int(_untyped(base).characteristic()),
                )
            )
            _trace_dense_prime_selection(
                "solve_right",
                (
                    "declared-flint-isolated"
                    if _native_kernel_available(kernel_function)
                    else "declared-flint-adapter"
                ),
                left_matrix.nrows(),
                right_matrix.ncols(),
                int(_untyped(base).characteristic()),
            )
            if solved:
                result = MatrixSpace(
                    base,
                    left_matrix.ncols(),
                    right_matrix.ncols(),
                )._from_canonical_uint64_residues(output)
                return result.column(0) if vector_result else result
        if (
            left_matrix._has_packed_prime_storage()
            and right_matrix._has_packed_prime_storage()
        ):
            reduced = left_matrix.augment(right_matrix).rref()
            kernel_module = _dense_prime_kernel_module()
            kernel_function = kernel_module.dense_prime_field_matrix_solution_from_rref
            output = _dense_prime_zeros(
                kernel_function,
                left_matrix.ncols() * right_matrix.ncols(),
            )
            reduced_record = kernel_module.DensePrimeMatrix(
                reduced._prime_kernel_buffer(kernel_function),
                reduced.nrows(),
                reduced.ncols(),
                int(_untyped(base).characteristic()),
            )
            solved = bool(
                kernel_function(
                    reduced_record,
                    left_matrix.ncols(),
                    right_matrix.ncols(),
                    output,
                )
            )
            _trace_dense_prime_selection(
                "solve_right",
                _typed_python_implementation(kernel_function),
                left_matrix.nrows(),
                right_matrix.ncols(),
                int(_untyped(base).characteristic()),
            )
            if not solved:
                raise ValueError("matrix equation has no solutions")
            result = MatrixSpace(
                base,
                left_matrix.ncols(),
                right_matrix.ncols(),
            )._from_canonical_uint64_residues(output)
            return result.column(0) if vector_result else result
        native_value = runtime.undefined
        if (
            not left_matrix._has_packed_prime_storage()
            and not left_matrix._has_nmod_matrix_resource()
            and not left_matrix._has_integer_storage()
            and not left_matrix._has_packed_rational_storage()
        ):
            try:
                backend = runtime.flint_backend()
                if _is_extension_field_base(base):
                    native_value = backend.fqMatrixSolve(
                        left_matrix._native, right_matrix._native
                    )
                else:
                    native_value = backend.matrixSolve(
                        left_matrix._native, right_matrix._native
                    )
            except Exception:
                pass
        if native_value is runtime.undefined:
            solve_base = sage.QQ if base is sage.ZZ else base
            augmented = left_matrix.change_ring(solve_base).augment(
                right_matrix.change_ring(solve_base)
            )
            reduced = augmented.echelon_form()
            solution_entries = [
                solve_base(0) for _entry in range(self.ncols() * right_matrix.ncols())
            ]
            for row in range(reduced.nrows()):
                pivot = None
                for col in range(self.ncols()):
                    if reduced[row, col] != 0:
                        pivot = col
                        break
                if pivot is None:
                    for col in range(right_matrix.ncols()):
                        if reduced[row, self.ncols() + col] != 0:
                            raise ValueError("matrix equation has no solutions")
                else:
                    for col in range(right_matrix.ncols()):
                        solution_entries[pivot * right_matrix.ncols() + col] = reduced[
                            row, self.ncols() + col
                        ]
            solution = matrix(
                solve_base,
                self.ncols(),
                right_matrix.ncols(),
                solution_entries,
            )
            if vector_result:
                return solution.column(0)
            return solution
        result_base = sage.QQ
        if (
            _is_modular_base(base)
            or _is_extension_field_base(base)
            or _is_algebraic_base(base)
            or _is_approximate_base(base)
        ):
            result_base = base
        result = Matrix(
            MatrixSpace(
                result_base,
                self.ncols(),
                right_matrix.ncols(),
            ),
            native_value,
        )
        return result.column(0) if vector_result else result

    def solve_left(self, left: object) -> Any:
        if isinstance(left, Vector):
            return self.transpose().solve_right(left).row()
        if not isinstance(left, Matrix):
            left = matrix(left)
        return self.transpose().solve_right(left.transpose()).transpose()

    def stack(
        self,
        other: object,
        subdivide: bool = False,
    ) -> Matrix:
        if isinstance(other, Vector):
            other = other.row()
        if not isinstance(other, Matrix):
            other = matrix(other)
        if self.ncols() != other.ncols():
            raise TypeError("number of columns must agree for stacking")
        base = _common_base(self.base_ring(), other.base_ring())
        top = self.change_ring(base)
        bottom = other.change_ring(base)
        if top._has_fmpq_matrix_resource() and bottom._has_fmpq_matrix_resource():
            resource = _flint_ffi_module().fmpq_matrix_stack(
                top._rational_resource(), bottom._rational_resource()
            )
            answer = MatrixSpace(
                base,
                top.nrows() + bottom.nrows(),
                top.ncols(),
            )._from_fmpq_matrix_resource(resource)
            if subdivide:
                answer._row_subdivisions = [top.nrows()]
            _trace_dense_rational_selection(
                "stack",
                "generated-flint-resource",
                answer.nrows(),
                answer.ncols(),
            )
            return answer
        if top._has_packed_rational_storage() and bottom._has_packed_rational_storage():
            kernel = _dense_rational_kernel_module().dense_rational_matrix_stack
            top_numerators, top_denominators = top._rational_kernel_parts(kernel)
            bottom_numerators, bottom_denominators = bottom._rational_kernel_parts(
                kernel
            )

            def invoke_rational_stack(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    top_numerators,
                    top_denominators,
                    bottom_numerators,
                    bottom_denominators,
                ):
                    raise RuntimeError("dense rational stack mismatch")

            storage = _run_rational_output(
                kernel,
                (top.nrows() + bottom.nrows()) * top.ncols(),
                invoke_rational_stack,
                max(top._rational_capacity(), bottom._rational_capacity()),
            )
            answer = MatrixSpace(
                base,
                top.nrows() + bottom.nrows(),
                top.ncols(),
            )._from_canonical_rational_entries(storage.numerators, storage.denominators)
            if subdivide:
                answer._row_subdivisions = [top.nrows()]
            _trace_dense_rational_selection(
                "stack",
                _typed_python_implementation(kernel),
                answer.nrows(),
                answer.ncols(),
            )
            return answer
        if top._has_integer_storage() and bottom._has_integer_storage():
            resource = _flint_ffi_module().fmpz_matrix_stack(
                top._integer_resource(), bottom._integer_resource()
            )
            answer = MatrixSpace(
                base,
                top.nrows() + bottom.nrows(),
                top.ncols(),
            )._from_fmpz_matrix_resource(resource)
            if subdivide:
                answer._row_subdivisions = [top.nrows()]
            _trace_dense_integer_selection(
                "stack",
                "generated-flint-resource",
                answer.nrows(),
                answer.ncols(),
            )
            return answer
        if top._has_nmod_matrix_resource() and bottom._has_nmod_matrix_resource():
            resource = _flint_ffi_module().nmod_matrix_stack(
                top._nmod_resource(), bottom._nmod_resource()
            )
            answer = MatrixSpace(
                base, top.nrows() + bottom.nrows(), top.ncols()
            )._from_nmod_matrix_resource(resource)
            if subdivide:
                answer._row_subdivisions = [top.nrows()]
            answer._trace_word_prime_resource("stack")
            return answer
        if top._has_packed_prime_storage() and bottom._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_stack
            modulus = int(_untyped(base).characteristic())
            output = _dense_prime_zeros(
                kernel,
                (top.nrows() + bottom.nrows()) * top.ncols(),
            )
            valid = kernel(
                output,
                top._prime_kernel_buffer(kernel),
                bottom._prime_kernel_buffer(kernel),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime stack buffer mismatch")
            answer = MatrixSpace(
                base,
                top.nrows() + bottom.nrows(),
                top.ncols(),
            )._from_canonical_uint64_residues(output)
            if subdivide:
                answer._row_subdivisions = [top.nrows()]
            _trace_dense_prime_selection(
                "stack",
                _typed_python_implementation(kernel),
                answer.nrows(),
                answer.ncols(),
                modulus,
            )
            return answer
        if base is sage.ZZ or base is sage.QQ:
            answer = Matrix(
                MatrixSpace(
                    base,
                    top.nrows() + bottom.nrows(),
                    top.ncols(),
                ),
                runtime.flint_backend().matrixStack(top._native, bottom._native),
            )
            if subdivide:
                answer._row_subdivisions = [top.nrows()]
            return answer
        answer = matrix(
            base,
            top.nrows() + bottom.nrows(),
            top.ncols(),
            top.list() + bottom.list(),
        )
        if subdivide:
            answer._row_subdivisions = [top.nrows()]
        return answer

    def augment(
        self,
        other: object,
        subdivide: bool = False,
    ) -> Matrix:
        if isinstance(other, Vector):
            other = other.column()
        if not isinstance(other, Matrix):
            other = matrix(other)
        if self.nrows() != other.nrows():
            raise TypeError(
                "number of rows must be the same, not "
                + str(self.nrows())
                + " != "
                + str(other.nrows())
            )
        base = _common_base(self.base_ring(), other.base_ring())
        left = self.change_ring(base)
        right = other.change_ring(base)
        if left._has_fmpq_matrix_resource() and right._has_fmpq_matrix_resource():
            resource = _flint_ffi_module().fmpq_matrix_augment(
                left._rational_resource(), right._rational_resource()
            )
            answer = MatrixSpace(
                base,
                left.nrows(),
                left.ncols() + right.ncols(),
            )._from_fmpq_matrix_resource(resource)
            if subdivide:
                answer._col_subdivisions = [left.ncols()]
            _trace_dense_rational_selection(
                "augment",
                "generated-flint-resource",
                answer.nrows(),
                answer.ncols(),
            )
            return answer
        if left._has_packed_rational_storage() and right._has_packed_rational_storage():
            kernel = _dense_rational_kernel_module().dense_rational_matrix_augment
            left_numerators, left_denominators = left._rational_kernel_parts(kernel)
            right_numerators, right_denominators = right._rational_kernel_parts(kernel)

            def invoke_rational_augment(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    left_numerators,
                    left_denominators,
                    right_numerators,
                    right_denominators,
                    left.nrows(),
                    left.ncols(),
                    right.ncols(),
                ):
                    raise RuntimeError("dense rational augment mismatch")

            storage = _run_rational_output(
                kernel,
                left.nrows() * (left.ncols() + right.ncols()),
                invoke_rational_augment,
                max(left._rational_capacity(), right._rational_capacity()),
            )
            answer = MatrixSpace(
                base,
                left.nrows(),
                left.ncols() + right.ncols(),
            )._from_canonical_rational_entries(storage.numerators, storage.denominators)
            if subdivide:
                answer._col_subdivisions = [left.ncols()]
            _trace_dense_rational_selection(
                "augment",
                _typed_python_implementation(kernel),
                answer.nrows(),
                answer.ncols(),
            )
            return answer
        if left._has_integer_storage() and right._has_integer_storage():
            resource = _flint_ffi_module().fmpz_matrix_augment(
                left._integer_resource(), right._integer_resource()
            )
            answer = MatrixSpace(
                base,
                left.nrows(),
                left.ncols() + right.ncols(),
            )._from_fmpz_matrix_resource(resource)
            if subdivide:
                answer._col_subdivisions = [left.ncols()]
            _trace_dense_integer_selection(
                "augment",
                "generated-flint-resource",
                answer.nrows(),
                answer.ncols(),
            )
            return answer
        if left._has_nmod_matrix_resource() and right._has_nmod_matrix_resource():
            resource = _flint_ffi_module().nmod_matrix_augment(
                left._nmod_resource(), right._nmod_resource()
            )
            answer = MatrixSpace(
                base, left.nrows(), left.ncols() + right.ncols()
            )._from_nmod_matrix_resource(resource)
            if subdivide:
                answer._col_subdivisions = [left.ncols()]
            answer._trace_word_prime_resource("augment")
            return answer
        if left._has_packed_prime_storage() and right._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_augment
            modulus = int(_untyped(base).characteristic())
            output = _dense_prime_zeros(
                kernel,
                left.nrows() * (left.ncols() + right.ncols()),
            )
            valid = kernel(
                output,
                left._prime_kernel_buffer(kernel),
                right._prime_kernel_buffer(kernel),
                left.nrows(),
                left.ncols(),
                right.ncols(),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime augment buffer mismatch")
            answer = MatrixSpace(
                base,
                left.nrows(),
                left.ncols() + right.ncols(),
            )._from_canonical_uint64_residues(output)
            if subdivide:
                answer._col_subdivisions = [left.ncols()]
            _trace_dense_prime_selection(
                "augment",
                _typed_python_implementation(kernel),
                answer.nrows(),
                answer.ncols(),
                modulus,
            )
            return answer
        if base is sage.ZZ or base is sage.QQ:
            answer = Matrix(
                MatrixSpace(
                    base,
                    left.nrows(),
                    left.ncols() + right.ncols(),
                ),
                runtime.flint_backend().matrixAugment(left._native, right._native),
            )
            if subdivide:
                answer._col_subdivisions = [left.ncols()]
            return answer
        entries = []
        for row in range(left.nrows()):
            entries.extend(left.row(row))
            entries.extend(right.row(row))
        answer = matrix(
            base,
            left.nrows(),
            left.ncols() + right.ncols(),
            entries,
        )
        if subdivide:
            answer._col_subdivisions = [left.ncols()]
        return answer

    def subdivide(
        self,
        row_lines: Any = None,
        col_lines: Any = None,
    ) -> None:
        if self._immutable:
            raise ValueError("matrix is immutable; change a copy instead")

        def lines(value: Any) -> list[int]:
            if value is None:
                return []
            if runtime.is_exact_integer(value):
                return [int(value)]
            return [int(index) for index in value]

        row_values = lines(row_lines)
        column_values = lines(col_lines)
        self._row_subdivisions = row_values
        self._col_subdivisions = column_values
        self._clear_cache()

    def matrix_from_rows(self, rows: Any) -> Matrix:
        indices = _matrix_selection_module().row_indices(
            (int(index) for index in rows),
            self.nrows(),
        )
        if self._has_fmpq_matrix_resource():
            resource = _flint_ffi_module().fmpq_matrix_select_rows(
                self._rational_resource(),
                _packed_uint64(indices),
                len(indices),
            )
            _trace_dense_rational_selection(
                "matrix_from_rows",
                "generated-flint-resource",
                len(indices),
                self.ncols(),
            )
            return MatrixSpace(
                self.base_ring(),
                len(indices),
                self.ncols(),
            )._from_fmpq_matrix_resource(resource)
        if self._has_packed_rational_storage():
            kernel = _dense_rational_kernel_module().dense_rational_matrix_select_rows
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)
            index_buffer = _dense_integer_buffer(kernel, indices, 1)

            def invoke_rational_rows(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    index_buffer,
                    self.nrows(),
                    self.ncols(),
                ):
                    raise RuntimeError("dense rational row selection mismatch")

            storage = _run_rational_output(
                kernel,
                len(indices) * self.ncols(),
                invoke_rational_rows,
                self._rational_capacity(),
            )
            _trace_dense_rational_selection(
                "matrix_from_rows",
                _typed_python_implementation(kernel),
                len(indices),
                self.ncols(),
            )
            return MatrixSpace(
                self.base_ring(),
                len(indices),
                self.ncols(),
            )._from_canonical_rational_entries(storage.numerators, storage.denominators)
        if self._has_integer_storage():
            target = _flint_ffi_module().fmpz_matrix_select_rows(
                self._integer_resource(),
                _packed_uint64(indices),
                len(indices),
            )
            _trace_dense_integer_selection(
                "matrix_from_rows",
                "generated-flint-resource",
                len(indices),
                self.ncols(),
            )
            return MatrixSpace(
                self.base_ring(), len(indices), self.ncols()
            )._from_fmpz_matrix_resource(target)
        if self._has_nmod_matrix_resource():
            target = _flint_ffi_module().nmod_matrix_select_rows(
                self._nmod_resource(), _packed_uint64(indices), len(indices)
            )
            answer = MatrixSpace(
                self.base_ring(), len(indices), self.ncols()
            )._from_nmod_matrix_resource(target)
            answer._trace_word_prime_resource("matrix_from_rows")
            return answer
        if self._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_select_rows
            modulus = int(_untyped(self.base_ring()).characteristic())
            entries = _dense_prime_zeros(kernel, len(indices) * self.ncols())
            valid = kernel(
                entries,
                self._prime_kernel_buffer(kernel),
                _dense_prime_buffer(kernel, indices),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime row-selection buffer mismatch")
            _trace_dense_prime_selection(
                "matrix_from_rows",
                _typed_python_implementation(kernel),
                len(indices),
                self.ncols(),
                modulus,
            )
            return MatrixSpace(
                self.base_ring(), len(indices), self.ncols()
            )._from_canonical_uint64_residues(entries)
        native = runtime.flint_backend().matrixSelectRows(self._native, indices)
        return Matrix(
            MatrixSpace(self.base_ring(), len(indices), self.ncols()),
            native,
        )

    def matrix_from_columns(self, columns: Any) -> Matrix:
        indices = _matrix_selection_module().column_indices(
            (int(index) for index in columns),
            self.ncols(),
        )
        if self._has_fmpq_matrix_resource():
            resource = _flint_ffi_module().fmpq_matrix_select_columns(
                self._rational_resource(),
                _packed_uint64(indices),
                len(indices),
            )
            _trace_dense_rational_selection(
                "matrix_from_columns",
                "generated-flint-resource",
                self.nrows(),
                len(indices),
            )
            return MatrixSpace(
                self.base_ring(),
                self.nrows(),
                len(indices),
            )._from_fmpq_matrix_resource(resource)
        if self._has_packed_rational_storage():
            kernel = (
                _dense_rational_kernel_module().dense_rational_matrix_select_columns
            )
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)
            index_buffer = _dense_integer_buffer(kernel, indices, 1)

            def invoke_rational_columns(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    index_buffer,
                    self.nrows(),
                    self.ncols(),
                ):
                    raise RuntimeError("dense rational column selection mismatch")

            storage = _run_rational_output(
                kernel,
                self.nrows() * len(indices),
                invoke_rational_columns,
                self._rational_capacity(),
            )
            _trace_dense_rational_selection(
                "matrix_from_columns",
                _typed_python_implementation(kernel),
                self.nrows(),
                len(indices),
            )
            return MatrixSpace(
                self.base_ring(),
                self.nrows(),
                len(indices),
            )._from_canonical_rational_entries(storage.numerators, storage.denominators)
        if self._has_integer_storage():
            target = _flint_ffi_module().fmpz_matrix_select_columns(
                self._integer_resource(),
                _packed_uint64(indices),
                len(indices),
            )
            _trace_dense_integer_selection(
                "matrix_from_columns",
                "generated-flint-resource",
                self.nrows(),
                len(indices),
            )
            return MatrixSpace(
                self.base_ring(), self.nrows(), len(indices)
            )._from_fmpz_matrix_resource(target)
        if self._has_nmod_matrix_resource():
            target = _flint_ffi_module().nmod_matrix_select_columns(
                self._nmod_resource(), _packed_uint64(indices), len(indices)
            )
            answer = MatrixSpace(
                self.base_ring(), self.nrows(), len(indices)
            )._from_nmod_matrix_resource(target)
            answer._trace_word_prime_resource("matrix_from_columns")
            return answer
        if self._has_packed_prime_storage():
            kernel = (
                _dense_prime_kernel_module().dense_prime_field_matrix_select_columns
            )
            modulus = int(_untyped(self.base_ring()).characteristic())
            entries = _dense_prime_zeros(kernel, self.nrows() * len(indices))
            valid = kernel(
                entries,
                self._prime_kernel_buffer(kernel),
                _dense_prime_buffer(kernel, indices),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            if not valid:
                raise RuntimeError("dense prime column-selection buffer mismatch")
            _trace_dense_prime_selection(
                "matrix_from_columns",
                _typed_python_implementation(kernel),
                self.nrows(),
                len(indices),
                modulus,
            )
            return MatrixSpace(
                self.base_ring(), self.nrows(), len(indices)
            )._from_canonical_uint64_residues(entries)
        native = runtime.flint_backend().matrixSelectColumns(self._native, indices)
        return Matrix(
            MatrixSpace(self.base_ring(), self.nrows(), len(indices)),
            native,
        )

    def matrix_from_rows_and_columns(self, rows: Any, columns: Any) -> Matrix:
        """Return the matrix selected by ordered row and column indices."""
        return _matrix_selection_module().matrix_from_rows_and_columns(
            self, rows, columns
        )

    def submatrix(
        self,
        row: int = 0,
        col: int = 0,
        nrows: int = -1,
        ncols: int = -1,
    ) -> Matrix:
        """Return a half-open rectangular submatrix."""
        return _matrix_selection_module().submatrix(self, row, col, nrows, ncols)

    def delete_rows(self, rows: Any, check: bool = True) -> Matrix:
        """Return a copy with the specified rows removed."""
        return _matrix_selection_module().delete_rows(self, rows, check)

    def delete_columns(self, columns: Any, check: bool = True) -> Matrix:
        """Return a copy with the specified columns removed."""
        return _matrix_selection_module().delete_columns(self, columns, check)

    def swap_rows(self, first: int, second: int) -> None:
        """Swap two rows transactionally."""
        _matrix_selection_module().swap_rows(self, first, second)

    def swap_columns(self, first: int, second: int) -> None:
        """Swap two columns transactionally."""
        _matrix_selection_module().swap_columns(self, first, second)

    def with_swapped_rows(self, first: int, second: int) -> Matrix:
        """Return a mutable copy with two rows swapped."""
        return _matrix_selection_module().with_swapped_rows(self, first, second)

    def with_swapped_columns(self, first: int, second: int) -> Matrix:
        """Return a mutable copy with two columns swapped."""
        return _matrix_selection_module().with_swapped_columns(self, first, second)

    def insert_row(self, index: int, values: Any) -> Matrix:
        """Insert one row into a dense integer matrix."""
        return _matrix_selection_module().insert_row(self, index, values)

    def diagonal(self, offset: int = 0) -> list[Any]:
        offset = int(offset)
        if offset >= 0:
            count = min(self.nrows(), max(0, self.ncols() - offset))
            start = offset if count != 0 else 0
        else:
            start_row = -offset
            count = min(max(0, self.nrows() - start_row), self.ncols())
            start = start_row * self.ncols() if count != 0 else 0
        if self._has_fmpz_matrix_resource() or self._has_fmpq_matrix_resource():
            return self._exact_host_sequence(start, self.ncols() + 1, count)
        if offset >= 0:
            return [self._entry(index, index + offset) for index in range(count)]
        return [self._entry(index - offset, index) for index in range(count)]

    def trace(self) -> Any:
        if not self.is_square():
            raise ValueError("trace is only defined for square matrices")
        if self._has_nmod_matrix_resource():
            residue = _flint_ffi_module().nmod_matrix_trace(self._nmod_resource())
            self._trace_word_prime_resource("trace")
            return self.base_ring()(residue)
        if self._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_trace
            modulus = int(_untyped(self.base_ring()).characteristic())
            residue = kernel(self._prime_kernel_buffer(kernel), self.nrows(), modulus)
            _trace_dense_prime_selection(
                "trace",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
                modulus,
            )
            return self.base_ring()(residue)
        if self._has_integer_storage():
            value = _flint_ffi_module().fmpz_matrix_trace(self._integer_resource())
            _trace_dense_integer_selection(
                "trace",
                "generated-flint-resource",
                self.nrows(),
                self.ncols(),
            )
            return runtime.normalize_integer(value)
        if self._has_packed_rational_storage():
            if self._has_fmpq_matrix_resource():
                ffi = _flint_ffi_module()
                value = ffi.fmpq_matrix_trace(self._rational_resource())
                try:
                    numerator = ffi.fmpq_value_numerator(value)
                    denominator = ffi.fmpq_value_denominator(value)
                finally:
                    value.close()
                _trace_dense_rational_selection(
                    "trace",
                    "generated-flint-resource",
                    self.nrows(),
                    self.ncols(),
                )
                return _untyped(sage.QQ)(numerator, denominator)
            kernel = _dense_rational_kernel_module().dense_rational_matrix_trace
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_trace(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                    self.nrows(),
                ):
                    raise RuntimeError("dense rational trace mismatch")

            storage = _run_rational_output(
                kernel,
                1,
                invoke_rational_trace,
                self._rational_capacity() + 1,
            )
            numerator = _integer_buffer_values(storage.numerators)[0]
            denominator = _integer_buffer_values(storage.denominators)[0]
            _trace_dense_rational_selection(
                "trace",
                _typed_python_implementation(kernel),
                self.nrows(),
                self.ncols(),
            )
            return _untyped(sage.QQ)(numerator, denominator)
        return sum(self.diagonal(), self.base_ring()(0))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Matrix):
            if other == 0:
                return self.is_zero()
            if not self.is_square():
                return False
            try:
                return self == (identity_matrix(self.base_ring(), self.nrows()) * other)
            except Exception:
                return False
        if self.dimensions() != other.dimensions():
            return False
        try:
            base = _common_base(self.base_ring(), other.base_ring())
        except TypeError:
            return False
        left = self.change_ring(base)
        right = other.change_ring(base)
        if left._has_packed_rational_storage() and right._has_packed_rational_storage():
            if left._has_fmpq_matrix_resource() and right._has_fmpq_matrix_resource():
                result = bool(
                    _flint_ffi_module().fmpq_matrix_equal(
                        left._rational_resource(),
                        right._rational_resource(),
                    )
                )
                _trace_dense_rational_selection(
                    "equal",
                    "generated-flint-resource",
                    left.nrows(),
                    left.ncols(),
                )
                return result
            kernel = _dense_rational_kernel_module().dense_rational_matrix_equal
            left_numerators, left_denominators = left._rational_kernel_parts(kernel)
            right_numerators, right_denominators = right._rational_kernel_parts(kernel)
            result = bool(
                kernel(
                    left_numerators,
                    left_denominators,
                    right_numerators,
                    right_denominators,
                )
            )
            _trace_dense_rational_selection(
                "equal",
                _typed_python_implementation(kernel),
                left.nrows(),
                left.ncols(),
            )
            return result
        if left._has_integer_storage() and right._has_integer_storage():
            result = bool(
                _flint_ffi_module().fmpz_matrix_equal(
                    left._integer_resource(), right._integer_resource()
                )
            )
            _trace_dense_integer_selection(
                "equal",
                "generated-flint-resource",
                left.nrows(),
                left.ncols(),
            )
            return result
        if left._has_m4ri_matrix_resource() and right._has_m4ri_matrix_resource():
            result = bool(
                _m4ri_ffi_module().matrix_equal(
                    left._m4ri_resource(), right._m4ri_resource()
                )
            )
            _trace_dense_prime_selection(
                "equal",
                "generated-m4ri-resource",
                left.nrows(),
                left.ncols(),
                2,
            )
            return result
        if left._has_nmod_matrix_resource() and right._has_nmod_matrix_resource():
            result = bool(
                _flint_ffi_module().nmod_matrix_equal(
                    left._nmod_resource(), right._nmod_resource()
                )
            )
            left._trace_word_prime_resource("equal")
            return result
        if left._has_packed_prime_storage() and right._has_packed_prime_storage():
            kernel = _dense_prime_kernel_module().dense_prime_field_matrix_equal
            modulus = int(_untyped(base).characteristic())
            result = bool(
                kernel(
                    left._prime_kernel_buffer(kernel),
                    right._prime_kernel_buffer(kernel),
                    modulus,
                )
            )
            _trace_dense_prime_selection(
                "equal",
                _typed_python_implementation(kernel),
                left.nrows(),
                left.ncols(),
                modulus,
            )
            return result
        backend = runtime.flint_backend()
        if _is_extension_field_base(base):
            return backend.fqMatrixEqual(left._native, right._native)
        return backend.matrixEqual(left._native, right._native)

    def __copy__(self) -> Matrix:
        if self._has_nmod_matrix_resource():
            answer = self._parent._from_nmod_matrix_resource(
                _flint_ffi_module().nmod_matrix_copy(self._nmod_resource())
            )
            answer._row_subdivisions = list(self._row_subdivisions)
            answer._col_subdivisions = list(self._col_subdivisions)
            self._trace_word_prime_resource("copy")
            return answer
        if self._has_m4ri_matrix_resource():
            answer = self._parent._from_m4ri_matrix_resource(
                _m4ri_ffi_module().matrix_copy(self._m4ri_resource())
            )
            answer._row_subdivisions = list(self._row_subdivisions)
            answer._col_subdivisions = list(self._col_subdivisions)
            return answer
        if self._has_packed_rational_storage():
            if self._has_fmpq_matrix_resource():
                answer = self._parent._from_fmpq_matrix_resource(
                    _flint_ffi_module().fmpq_matrix_copy(self._rational_resource())
                )
                answer._row_subdivisions = list(self._row_subdivisions)
                answer._col_subdivisions = list(self._col_subdivisions)
                return answer
            kernel = _dense_rational_kernel_module().dense_rational_matrix_copy
            source_numerators, source_denominators = self._rational_kernel_parts(kernel)

            def invoke_rational_copy(
                output_numerators: Any,
                output_denominators: Any,
            ) -> None:
                if not kernel(
                    output_numerators,
                    output_denominators,
                    source_numerators,
                    source_denominators,
                ):
                    raise RuntimeError("dense rational copy mismatch")

            storage = _run_rational_output(
                kernel,
                self.nrows() * self.ncols(),
                invoke_rational_copy,
                self._rational_capacity(),
            )
            answer = self._parent._from_canonical_rational_entries(
                storage.numerators, storage.denominators
            )
            answer._row_subdivisions = list(self._row_subdivisions)
            answer._col_subdivisions = list(self._col_subdivisions)
            return answer
        if self._has_integer_storage():
            answer = self._parent._from_fmpz_matrix_resource(
                _flint_ffi_module().fmpz_matrix_copy(self._integer_resource())
            )
            answer._row_subdivisions = list(self._row_subdivisions)
            answer._col_subdivisions = list(self._col_subdivisions)
            return answer
        if self._has_packed_prime_storage():
            answer = self._parent._from_canonical_uint64_residues(
                _copy_packed_uint64(self._prime_residues_cache)
            )
            answer._row_subdivisions = list(self._row_subdivisions)
            answer._col_subdivisions = list(self._col_subdivisions)
            return answer
        if _is_extension_field_base(self.base_ring()):
            # Extension-field matrices use a dedicated FLINT handle rather
            # than the generic matrix handle accepted by matrixSelectRows.
            # Reconstructing from entries is the existing safe public copy
            # boundary for this still-legacy representation.
            answer = matrix(
                self.base_ring(),
                self.nrows(),
                self.ncols(),
                self.list(),
            )
            answer._row_subdivisions = list(self._row_subdivisions)
            answer._col_subdivisions = list(self._col_subdivisions)
            return answer
        answer = self.matrix_from_rows(range(self.nrows()))
        answer._row_subdivisions = list(self._row_subdivisions)
        answer._col_subdivisions = list(self._col_subdivisions)
        return answer

    def str(self) -> str:
        """Return the full entry-by-entry matrix representation."""
        if self.nrows() == 0:
            return "[]"
        if (
            self._has_nmod_matrix_resource()
            and len(self._row_subdivisions) == 0
            and len(self._col_subdivisions) == 0
        ):
            region = _flint_ffi_module().nmod_matrix_format(self._nmod_resource())
            self._trace_word_prime_resource("str")
            return bytes(region.take_bytes()).decode("ascii")
        if (
            self._has_m4ri_matrix_resource()
            and len(self._row_subdivisions) == 0
            and len(self._col_subdivisions) == 0
        ):
            region = _m4ri_ffi_module().matrix_format(self._m4ri_resource())
            return bytes(region.take_bytes()).decode("ascii")
        if (
            self._has_packed_prime_storage()
            and len(self._row_subdivisions) == 0
            and len(self._col_subdivisions) == 0
        ):
            return runtime.uint64_matrix_format(
                self._prime_residues(), self.nrows(), self.ncols()
            )
        text_rows = []
        width = 0
        if self._has_packed_rational_storage():
            if (
                self._has_fmpq_matrix_resource()
                and len(self._row_subdivisions) == 0
                and len(self._col_subdivisions) == 0
            ):
                region = _flint_ffi_module().fmpq_matrix_format(
                    self._rational_resource()
                )
                return bytes(region.take_bytes()).decode("ascii")
            # The buffers already contain normalized pairs. Decode each one
            # once instead of crossing a kernel boundary and allocating a
            # Rational object for every displayed entry.
            numerators = _integer_buffer_values(self._rational_numerators())
            denominators = _integer_buffer_values(self._rational_denominators())
            for row in range(self.nrows()):
                text_row = []
                for col in range(self.ncols()):
                    index = row * self.ncols() + col
                    numerator_text = str(numerators[index])
                    denominator = denominators[index]
                    text = (
                        numerator_text
                        if denominator == 1
                        else numerator_text + "/" + str(denominator)
                    )
                    text_row.append(text)
                    width = max(width, len(text))
                text_rows.append(text_row)
        elif self._has_integer_storage():
            if (
                self._has_fmpz_matrix_resource()
                and len(self._row_subdivisions) == 0
                and len(self._col_subdivisions) == 0
            ):
                region = _flint_ffi_module().fmpz_matrix_format(
                    self._integer_resource()
                )
                return bytes(region.take_bytes()).decode("ascii")
            # As above, bulk decoding avoids one kernel call per entry.
            values = _integer_buffer_values(self._integer_entries())
            for row in range(self.nrows()):
                text_row = []
                for col in range(self.ncols()):
                    text = str(values[row * self.ncols() + col])
                    text_row.append(text)
                    width = max(width, len(text))
                text_rows.append(text_row)
        else:
            for row in range(self.nrows()):
                text_row = []
                for col in range(self.ncols()):
                    text = str(self._entry(row, col))
                    text_row.append(text)
                    width = max(width, len(text))
                text_rows.append(text_row)
        lines = []
        for row, text_row in enumerate(text_rows):
            if row in self._row_subdivisions:
                lines.append("[" + "-" * (len(lines[-1]) - 2) + "]")
            entries = []
            for col in range(self.ncols()):
                entries.append(text_row[col].rjust(width))
            inner = ""
            for col, entry in enumerate(entries):
                if col != 0:
                    inner += "|" if col in self._col_subdivisions else " "
                inner += entry
            lines.append("[" + inner + "]")
        return "\n".join(lines)

    def __repr__(self) -> str:
        if self.nrows() >= 20 or self.ncols() >= 20:
            return (
                str(self.nrows())
                + " x "
                + str(self.ncols())
                + (
                    " sparse matrix over "
                    if self.is_sparse()
                    else " dense matrix over "
                )
                + str(self.base_ring())
                + " (use the '.str()' method to see the entries)"
            )
        return self.str()

    __str__ = __repr__
    toString = __repr__


@runtime.sequence_class
class MatrixBasis:
    def __init__(self, space: MatrixSpaceParent) -> None:
        self._space = space

    def __len__(self) -> int:
        return self._space.nrows() * self._space.ncols()

    def __iter__(self) -> Iterator[Matrix]:
        return iter([self[index] for index in range(len(self))])

    def __getitem__(self, index: Any) -> Matrix:
        if isinstance(index, (list, tuple)):
            if len(index) != 2:
                raise IndexError("matrix basis index must have two entries")
            row = _normalize_named_index(int(index[0]), self._space.nrows(), "row")
            col = _normalize_named_index(int(index[1]), self._space.ncols(), "column")
        else:
            position = _normalize_index(int(index), len(self))
            row = position // self._space.ncols()
            col = position % self._space.ncols()
        entries = [0 for _entry in range(self._space.nrows() * self._space.ncols())]
        entries[row * self._space.ncols() + col] = 1
        return self._space(entries)

    def __repr__(self) -> str:
        return "Basis of " + str(self._space)

    __str__ = __repr__
    toString = __repr__


def _canonical_row_basis(source: Matrix) -> Matrix:
    echelon = source.echelon_form()
    rows = []
    for row in echelon.rows():
        if any(entry != 0 for entry in row):
            rows.append(row)
    entries = []
    for row in rows:
        entries.extend(row)
    return matrix(
        source.base_ring(),
        len(rows),
        source.ncols(),
        entries,
    )


_matrix_space_cache = runtime.map()
_vector_space_cache = runtime.map()


def MatrixSpace(
    base: sage.Parent,
    rows: int,
    cols: Any = None,
    sparse: bool = False,
) -> MatrixSpaceParent:
    base = _canonical_base(base)
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and not _is_modular_base(base)
        and not _is_extension_field_base(base)
        and not _is_algebraic_base(base)
        and not _is_approximate_base(base)
    ):
        raise TypeError(
            "matrices currently require ZZ, QQ, AA, QQbar, GF, Zmod, "
            "or a real/complex field"
        )
    rows = int(rows)
    cols = rows if cols is None else int(cols)
    if rows < 0 or cols < 0:
        raise ValueError("matrix dimensions must be nonnegative")
    by_dimensions = _matrix_space_cache.get(base)
    if by_dimensions is runtime.undefined:
        by_dimensions = runtime.map()
        _matrix_space_cache.set(base, by_dimensions)
    key = str(rows) + "x" + str(cols) + ("-sparse" if sparse else "-dense")
    parent = by_dimensions.get(key)
    if parent is runtime.undefined:
        parent = MatrixSpaceParent(base, rows, cols, sparse)
        by_dimensions.set(key, parent)
    return parent


def VectorSpace(
    base: sage.Parent,
    degree: int,
) -> VectorSpaceParent:
    base = _canonical_base(base)
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and not _is_modular_base(base)
        and not _is_extension_field_base(base)
        and not _is_algebraic_base(base)
        and not _is_approximate_base(base)
    ):
        raise TypeError(
            "vectors currently require ZZ, QQ, AA, QQbar, GF, Zmod, "
            "or a real/complex field"
        )
    degree = int(degree)
    if degree < 0:
        raise ValueError("vector dimension must be nonnegative")
    by_degree = _vector_space_cache.get(base)
    if by_degree is runtime.undefined:
        by_degree = runtime.map()
        _vector_space_cache.set(base, by_degree)
    parent = by_degree.get(degree)
    if parent is runtime.undefined:
        parent = VectorSpaceParent(base, degree)
        by_degree.set(degree, parent)
    return parent


def _matrix_data(value: Any) -> tuple[int, int, list[Any]]:
    rows = list(value)
    if len(rows) == 0:
        return 0, 0, []
    if not isinstance(rows[0], (list, tuple, Vector)):
        return 1, len(rows), rows
    first = list(rows[0])
    cols = len(first)
    values = []
    for row in rows:
        entries = list(row)
        if len(entries) != cols:
            raise ValueError("matrix rows must all have the same length")
        values.extend(entries)
    return len(rows), cols, values


def matrix(*args: Any) -> Matrix:
    r"""
    Construct a dense matrix, optionally over an explicit base ring.

    Sage's common row-list, flat-list, dimension, and entry-function forms are
    supported. Exact matrices use FLINT on native hosts; `RDF`/`CDF` and
    arbitrary-precision real/complex matrices use FLINT, Arb, and ACB.

    ### Examples

    ```sage
    sage: A = matrix(ZZ, 2, [1, 2, 3, 4])
    sage: A.det()
    -2
    sage: A.rref()
    [1 0]
    [0 1]
    ```
    """
    if not args:
        raise TypeError("matrix() requires entries or dimensions")
    values = list(args)
    base = None
    if _is_base_ring(values[0]):
        base = _canonical_base(values.pop(0))
    if len(values) == 1:
        if isinstance(values[0], Matrix):
            source = values[0]
            return source if base is None else source.change_ring(base)
        if base is not None and runtime.is_exact_integer(values[0]):
            rows = int(values[0])
            cols = rows
            entries = [0 for _ in range(rows * cols)]
        else:
            rows, cols, entries = _matrix_data(values[0])
    elif len(values) == 2:
        rows = int(values[0])
        if runtime.is_exact_integer(values[1]):
            cols = int(values[1])
            entries = [0 for _ in range(rows * cols)]
        else:
            source = values[1]
            # An exact built-in list is already the canonical materialized
            # row-major input. MatrixSpace copies it into owned storage, so a
            # second host-list copy here only increases construction time and
            # peak memory. Keep list subclasses and general iterables on the
            # normal `list()` path: their iteration may have observable
            # Python semantics that must not be bypassed.
            entries = source if type(source) is list else list(source)
            if rows == 0:
                cols = 0
            elif len(entries) % rows != 0:
                raise ValueError("matrix entry count is not divisible by row count")
            else:
                cols = len(entries) // rows
    elif len(values) == 3:
        rows = int(values[0])
        cols = int(values[1])
        source = values[2]
        if callable(source):
            entries = []
            entry_function = source
            for row in range(rows):
                for col in range(cols):
                    entries.append(entry_function(row, col))
        elif runtime.is_exact_integer(source) and source == 0:
            entries = [0 for _ in range(rows * cols)]
        elif isinstance(source, list):
            entries = source
        else:
            entries = list(source)
    else:
        raise TypeError("unsupported matrix() constructor signature")
    if rows < 0 or cols < 0:
        raise ValueError("matrix dimensions must be nonnegative")
    if len(entries) != rows * cols:
        raise ValueError("matrix entry count does not match its dimensions")
    if base is None:
        base = _base_for_values(entries)
    return MatrixSpace(base, rows, cols)(entries)


def vector(*args: Any) -> Vector:
    if not args:
        raise TypeError("vector() requires entries")
    values = list(args)
    base = None
    if _is_base_ring(values[0]):
        base = _canonical_base(values.pop(0))
    if len(values) == 2:
        degree = int(values[0])
        entries = list(values[1])
        if len(entries) != degree:
            raise ValueError("vector entry count does not match its dimension")
    elif len(values) == 1:
        entries = list(values[0])
    else:
        raise TypeError("unsupported vector() constructor signature")
    if isinstance(values[0], Vector):
        source = values[0]
        return source if base is None else source.change_ring(base)
    if base is None:
        base = _base_for_values(entries)
    return VectorSpace(base, len(entries))(entries)


def sudoku(puzzle: Matrix) -> Matrix:
    r"""
    Solve a 9-by-9 Sudoku puzzle represented by a matrix.

    Entries from 1 through 9 are fixed clues and zero denotes an empty cell.
    The input matrix is not modified.  A `ValueError` is raised if the clues
    are inconsistent or the puzzle has no solution.

    ### Examples

    ```sage
    sage: A = matrix(ZZ, 9, [
    ....:     5,0,0,0,8,0,0,4,9, 0,0,0,5,0,0,0,3,0,
    ....:     0,6,7,3,0,0,0,0,1, 1,5,0,0,0,0,0,0,0,
    ....:     0,0,0,2,0,8,0,0,0, 0,0,0,0,0,0,0,1,8,
    ....:     7,0,0,0,0,4,1,5,0, 0,3,0,0,0,2,0,0,0,
    ....:     4,9,0,0,5,0,0,0,3])
    sage: sudoku(A)[0]
    (5, 1, 3, 6, 8, 7, 2, 4, 9)
    ```
    """
    if not isinstance(puzzle, Matrix):
        raise TypeError("sudoku puzzle must be a matrix")
    if puzzle.nrows() != 9 or puzzle.ncols() != 9:
        raise ValueError("sudoku puzzle must be a 9 by 9 matrix")
    values = []
    for row in range(9):
        for column in range(9):
            value = int(puzzle[row, column])
            if value < 0 or value > 9:
                raise ValueError("sudoku entries must be between 0 and 9")
            values.append(value)

    def allowed(position: int, digit: int) -> bool:
        row = position // 9
        column = position % 9
        for index in range(9):
            if values[row * 9 + index] == digit:
                return False
            if values[index * 9 + column] == digit:
                return False
        row_start = (row // 3) * 3
        column_start = (column // 3) * 3
        for row_offset in range(3):
            for column_offset in range(3):
                index = (row_start + row_offset) * 9 + column_start + column_offset
                if values[index] == digit:
                    return False
        return True

    def fill(position: int) -> bool:
        while position < 81 and values[position] != 0:
            position += 1
        if position == 81:
            return True
        for digit in range(1, 10):
            if allowed(position, digit):
                values[position] = digit
                if fill(position + 1):
                    return True
                values[position] = 0
        return False

    if not fill(0):
        raise ValueError("sudoku puzzle has no solution")
    return matrix(sage.ZZ, 9, 9, values)


def kernel(value: Any) -> Any:
    return value.kernel()


def zero_matrix(
    base: sage.Parent,
    rows: int,
    cols: Any = None,
) -> Matrix:
    cols = rows if cols is None else cols
    return MatrixSpace(base, rows, cols)(0)


def identity_matrix(base: sage.Parent, size: int) -> Matrix:
    base = _canonical_base(base)
    size = int(size)
    if size < 0:
        raise ValueError("matrix dimensions must be nonnegative")
    if base is sage.ZZ:
        ffi = _flint_ffi_module()
        zero = ffi.fmpz_matrix(size, size)
        try:
            resource = ffi.fmpz_matrix_pow(zero, 0)
        finally:
            zero.close()
        return MatrixSpace(sage.ZZ, size, size)._from_fmpz_matrix_resource(resource)
    if base is sage.QQ:
        ffi = _flint_ffi_module()
        zero = ffi.fmpz_matrix(size, size)
        try:
            integer_resource = ffi.fmpz_matrix_pow(zero, 0)
        finally:
            zero.close()
        try:
            rational_resource = ffi.fmpq_matrix_from_fmpz(integer_resource)
        finally:
            integer_resource.close()
        return MatrixSpace(sage.QQ, size, size)._from_fmpq_matrix_resource(
            rational_resource
        )
    if _is_packed_dense_prime_base(base):
        kernel = _dense_prime_kernel_module().dense_prime_field_matrix_identity
        storage = _dense_prime_zeros(kernel, size * size)
        if not kernel(
            storage,
            size,
            runtime.normalize_integer(runtime.reflect.get(base, "_modulus")),
        ):
            raise RuntimeError("dense prime-field identity buffer mismatch")
        return MatrixSpace(base, size, size)._from_canonical_uint64_residues(storage)
    entries = []
    for row in range(size):
        for col in range(size):
            entries.append(1 if row == col else 0)
    return matrix(base, size, size, entries)


def diagonal_matrix(
    base: Any,
    diagonal: Any = None,
) -> Matrix:
    if diagonal is None:
        diagonal = base
        values = list(diagonal)
        base = _base_for_values(values)
    else:
        values = list(diagonal)
    size = len(values)
    base = _canonical_base(base)
    if base is sage.ZZ:
        ffi = _flint_ffi_module()
        kernel = _dense_integer_flint_module().flint_dense_integer_resource_set_diagonal
        entries = [sage.ZZ(value) for value in values]
        resource = ffi.fmpz_matrix(size, size)
        try:
            if _native_kernel_available(kernel):
                packed = _dense_integer_buffer(kernel, entries, 1)
                if not kernel(resource, packed, size):
                    raise RuntimeError("dense integer diagonal buffer mismatch")
            else:
                for index in range(size):
                    ffi.fmpz_matrix_set_entry(
                        resource,
                        index,
                        index,
                        entries[index],
                    )
            return MatrixSpace(sage.ZZ, size, size)._from_fmpz_matrix_resource(resource)
        except Exception:
            resource.close()
            raise
    if base is sage.QQ:
        ffi = _flint_ffi_module()
        kernel = _dense_rational_flint_module().flint_dense_rational_matrix_set_diagonal
        numerators = []
        denominators = []
        for value in values:
            rational = sage.QQ(value)
            numerators.append(_untyped(rational)._numerator)
            denominators.append(_untyped(rational)._denominator)
        resource = ffi.fmpq_matrix(size, size)
        try:
            if _native_kernel_available(kernel):
                numerator_buffer = _dense_integer_buffer(kernel, numerators, 1)
                denominator_buffer = _dense_integer_buffer(kernel, denominators, 1)
                if not kernel(resource, numerator_buffer, denominator_buffer, size):
                    raise RuntimeError("dense rational diagonal buffer mismatch")
            else:
                for index in range(size):
                    ffi.fmpq_matrix_set_entry(
                        resource,
                        index,
                        index,
                        numerators[index],
                        denominators[index],
                    )
            return MatrixSpace(sage.QQ, size, size)._from_fmpq_matrix_resource(resource)
        except Exception:
            resource.close()
            raise
    if _is_packed_dense_prime_base(base):
        kernel = _dense_prime_kernel_module().dense_prime_field_matrix_set_diagonal
        diagonal_storage = _prime_residue_values(base, values)
        target = _dense_prime_zeros(kernel, size * size)
        source = _dense_prime_buffer(kernel, diagonal_storage)
        if not kernel(
            target,
            source,
            size,
            runtime.normalize_integer(runtime.reflect.get(base, "_modulus")),
        ):
            raise RuntimeError("dense prime-field diagonal buffer mismatch")
        return MatrixSpace(base, size, size)._from_canonical_uint64_residues(target)
    entries = []
    for row in range(size):
        for col in range(size):
            entries.append(values[row] if row == col else 0)
    return matrix(base, size, size, entries)


def _random_float() -> float:
    state = runtime.reflect.get(runtime.global_object, "__sagejs_random_state__")
    if state is runtime.undefined:
        state = runtime.math.floor(runtime.math.random() * 4294967296)
    state = runtime.native_mod(
        runtime.native_add(
            runtime.native_mul(1664525, state),
            1013904223,
        ),
        4294967296,
    )
    runtime.reflect.set(runtime.global_object, "__sagejs_random_state__", state)
    return runtime.native_div(state, 4294967296)


def _random_int(start: int, stop: int) -> int:
    start = runtime.integer_bigint(start)
    stop = runtime.integer_bigint(stop)
    width = stop - start + runtime.bigint(1)
    if width <= 0:
        raise ValueError("empty random integer range")
    word_base = runtime.bigint(4294967296)
    span = runtime.bigint(1)
    words = 0
    while span < width:
        span *= word_base
        words += 1
    while True:
        value = runtime.bigint(0)
        for _index in range(words):
            word = runtime.integer_bigint(
                runtime.math.floor(_random_float() * 4294967296)
            )
            value = value * word_base + word
        limit = span - span % width
        if value < limit:
            return start + value % width


def _set_random_word_state(state: int) -> None:
    """Update the shared deterministic random stream after a bulk kernel."""
    runtime.reflect.set(
        runtime.global_object,
        "__sagejs_random_state__",
        runtime.number(state),
    )


def _matrix_space_full_density_integer_resource(
    rows: int,
    columns: int,
    lower: Any,
    upper: Any,
) -> Any:
    """Construct the exact integral payload for full-density random elements.

    The optimized kernel supports every inclusive interval spanning at most
    one 32-bit random word. Wider and nonintegral arguments return
    `runtime.undefined` so the public method retains its general semantic
    fallback.
    """
    count = rows * columns
    if count == 0:
        return _flint_ffi_module().fmpz_matrix(rows, columns)
    if not runtime.is_exact_integer(lower) or not runtime.is_exact_integer(upper):
        return runtime.undefined
    exact_lower = runtime.integer_bigint(lower)
    exact_upper = runtime.integer_bigint(upper)
    span = exact_upper - exact_lower + runtime.bigint(1)
    if span <= 0 or span > runtime.bigint(4294967296):
        return runtime.undefined

    kernel = _dense_integer_flint_module().flint_dense_integer_matrix_space_random_fill
    resource = _flint_ffi_module().fmpz_matrix(rows, columns)
    try:
        initial_state = _random_int(0, 4294967295)
        valid, final_state = kernel(
            resource,
            exact_lower,
            runtime.normalize_integer(span),
            initial_state,
            runtime.bigint(4294967296),
            runtime.bigint(1664525),
            runtime.bigint(1013904223),
        )
        if not valid:
            raise ValueError("invalid full-density matrix random parameters")
        _set_random_word_state(final_state)
        _trace_dense_integer_selection(
            "random_element",
            _typed_python_implementation(kernel),
            rows,
            columns,
        )
        return resource
    except Exception:
        resource.close()
        raise


def _random_integer(
    distribution: Any,
    lower: Any,
    upper: Any,
    nonzero: bool,
) -> int:
    while True:
        if lower is not None:
            if upper is None:
                value = _random_int(0, int(lower) - 1)
            else:
                value = _random_int(int(lower), int(upper) - 1)
        elif distribution == "uniform":
            value = _random_int(-2, 2)
        else:
            first = float(_random_float())
            if first < 0.2:
                value = 0
            else:
                tail = float(_random_float())
                while tail == 0:
                    tail = float(_random_float())
                magnitude = int(1 / tail)
                value = magnitude if float(_random_float()) < 0.5 else -magnitude
        if not nonzero or value != 0:
            return value


def _random_extension_field_element(
    base: sage.Parent,
    nonzero: bool,
) -> Any:
    while True:
        value = base(0)
        power = base(1)
        degree = _untyped(base).degree()
        characteristic = _untyped(base).characteristic()
        generator = _untyped(base).gen()
        for _index in range(degree):
            coefficient = _random_int(0, characteristic - 1)
            value += base(coefficient) * power
            power *= generator
        if not nonzero or not value.is_zero():
            return value


def _bulk_sparse_random_matrix(
    base: sage.Parent,
    rows: int,
    columns: int,
    density: float,
    distribution: Any,
    lower: Any,
    upper: Any,
    numerator_bound: Any,
    denominator_bound: Any,
    require_nonzero: bool,
) -> Any:
    """Construct one exact random matrix through one storage-level boundary.

    `require_nonzero` distinguishes numeric density from Sage's omitted/None
    full-density policy. Unsupported domains return `runtime.undefined` so the
    general semantic fallback remains available.
    """
    policy = _sparse_random_module()
    executors = _sparse_random_public_module()
    word_base = runtime.normalize_integer(4294967296)
    multiplier = runtime.normalize_integer(1664525)
    increment = runtime.normalize_integer(1013904223)

    def portable(spec: Any, draw_nonzero: Any = None, one: Any = 1) -> Matrix:
        """Materialize the same policy when native execution is disabled."""

        def draw_column(bound: int) -> int:
            return _random_int(0, bound - 1)

        sampling = spec[2]
        if sampling == "entry-bernoulli":
            writes = policy.sample_sparse_random_spec(
                spec,
                draw_unit=_random_float,
                one=one,
            )
        else:
            writes = policy.sample_sparse_random_spec(
                spec,
                draw_index=draw_column,
                draw_nonzero=draw_nonzero,
            )
        values = policy.materialize_sparse_random_writes(writes, 0)
        return matrix(base, rows, columns, values)

    def portable_full(draw_value: Any) -> Matrix:
        """Materialize a full row-major distribution which may produce zero."""
        return matrix(
            base,
            rows,
            columns,
            [draw_value() for _index in range(rows * columns)],
        )

    if _uses_m4ri_resource(base) and lower is None:
        spec = policy.sage_binary_sparse_random_spec(rows, columns, density)
        normalized_density = float(spec[3])
        if rows == 0 or columns == 0 or normalized_density <= 0:
            return MatrixSpace(base, rows, columns)(0)
        if normalized_density != normalized_density:
            return portable(spec)
        kernel = executors.sparse_random_m4ri
        if not _native_kernel_available(kernel):
            return portable(spec)
        final_state = _dense_integer_zeros(kernel, 1)
        resource = _m4ri_ffi_module().matrix(rows, columns)
        try:
            initial_state = runtime.normalize_integer(_random_int(0, 4294967295))
            threshold = runtime.normalize_integer(
                runtime.math.floor(normalized_density * 4294967296)
            )
            if not kernel(
                resource,
                threshold,
                initial_state,
                final_state,
                word_base,
                multiplier,
                increment,
            ):
                raise RuntimeError("invalid sparse binary random parameters")
            _set_random_word_state(_integer_buffer_values(final_state)[0])
            _trace_dense_prime_selection(
                "random_matrix",
                _typed_python_implementation(kernel) + "-sparse",
                rows,
                columns,
                2,
            )
            return MatrixSpace(base, rows, columns)._from_m4ri_matrix_resource(resource)
        except Exception:
            resource.close()
            raise

    if _is_dense_binary_base(base) and lower is None:
        spec = policy.sage_binary_sparse_random_spec(rows, columns, density)
        normalized_density = float(spec[3])
        target = _packed_uint64(rows * columns)
        if rows == 0 or columns == 0 or normalized_density <= 0:
            return MatrixSpace(base, rows, columns)._from_canonical_uint64_residues(
                target
            )
        if normalized_density != normalized_density:
            return portable(spec)
        kernel = executors.sparse_random_binary
        if not _native_kernel_available(kernel):
            return portable(spec)
        target = _dense_prime_zeros(kernel, rows * columns)
        final_state = _dense_prime_zeros(kernel, 1)
        initial_state = runtime.normalize_integer(_random_int(0, 4294967295))
        threshold = runtime.normalize_integer(
            runtime.math.floor(normalized_density * 4294967296)
        )
        if not kernel(
            target,
            rows,
            columns,
            runtime.normalize_integer(2),
            threshold,
            initial_state,
            final_state,
            word_base,
            multiplier,
            increment,
        ):
            raise RuntimeError("invalid sparse binary random parameters")
        _set_random_word_state(final_state[0])
        _trace_dense_prime_selection(
            "random_matrix",
            _typed_python_implementation(kernel) + "-sparse-portable",
            rows,
            columns,
            2,
        )
        return MatrixSpace(base, rows, columns)._from_canonical_uint64_residues(target)

    if _is_packed_dense_prime_base(base) and lower is None:
        modulus = runtime.normalize_integer(runtime.reflect.get(base, "_modulus"))
        if modulus <= 2:
            return runtime.undefined
        spec = policy.sage_row_sparse_random_spec(
            rows,
            columns,
            density,
            collision="replace",
        )
        draws_per_row = int(spec[4])
        if draws_per_row == 0:
            return MatrixSpace(base, rows, columns)(0)
        kernel = executors.sparse_random_prime
        if not _native_kernel_available(kernel):
            return portable(
                spec,
                draw_nonzero=lambda: _random_int(1, modulus - 1),
            )
        target = _dense_prime_zeros(kernel, rows * columns)
        final_state = _dense_prime_zeros(kernel, 1)
        initial_state = runtime.normalize_integer(_random_int(0, 4294967295))
        if not kernel(
            target,
            rows,
            columns,
            modulus,
            modulus - 1,
            draws_per_row,
            1 if float(spec[3]) == 1 else 0,
            initial_state,
            final_state,
            word_base,
            multiplier,
            increment,
        ):
            raise RuntimeError("invalid sparse prime-field random parameters")
        _set_random_word_state(final_state[0])
        _trace_dense_prime_selection(
            "random_matrix",
            _typed_python_implementation(kernel) + "-sparse",
            rows,
            columns,
            int(_untyped(base).characteristic()),
        )
        return MatrixSpace(base, rows, columns)._from_canonical_uint64_residues(target)

    if base is sage.ZZ:
        spec = policy.sage_row_sparse_random_spec(
            rows,
            columns,
            density,
            collision="keep-first",
        )
        draws_per_row = int(spec[4])
        if draws_per_row == 0:
            return MatrixSpace(sage.ZZ, rows, columns)(0)
        if lower is not None:
            value_lower = 0 if upper is None else int(lower)
            value_width = int(lower) if upper is None else int(upper) - int(lower)
            value_mode = 0
        elif distribution == "uniform":
            value_lower = -2
            value_width = 5
            value_mode = 1
        else:
            value_lower = 0
            value_width = 1
            value_mode = 2
        if value_width <= 0 or value_width > 4294967296:
            return runtime.undefined
        kernel = executors.sparse_random_fmpz
        if not _native_kernel_available(kernel):
            return portable(
                spec,
                draw_nonzero=lambda: _random_integer(
                    distribution,
                    lower,
                    upper,
                    True,
                ),
            )
        final_state = _dense_integer_zeros(kernel, 1)
        resource = _flint_ffi_module().fmpz_matrix(rows, columns)
        try:
            initial_state = runtime.normalize_integer(_random_int(0, 4294967295))
            if not kernel(
                resource,
                draws_per_row,
                1 if float(spec[3]) == 1 else 0,
                value_mode,
                value_lower,
                value_width,
                initial_state,
                final_state,
                word_base,
                multiplier,
                increment,
                runtime.normalize_integer(858993460),
                runtime.normalize_integer(2147483648),
            ):
                raise RuntimeError("invalid sparse integer random parameters")
            _set_random_word_state(_integer_buffer_values(final_state)[0])
            _trace_dense_integer_selection(
                "random_matrix",
                _typed_python_implementation(kernel) + "-sparse",
                rows,
                columns,
            )
            return MatrixSpace(sage.ZZ, rows, columns)._from_fmpz_matrix_resource(
                resource
            )
        except Exception:
            resource.close()
            raise

    if base is sage.QQ:
        spec = policy.sage_row_sparse_random_spec(
            rows,
            columns,
            density,
            collision="replace",
        )
        draws_per_row = int(spec[4])
        if float(spec[3]) <= 0:
            return MatrixSpace(sage.QQ, rows, columns)(0)

        # Sage evaluates and coerces both `bound + 1` expressions before it
        # inspects the distribution or starts any loop. This is observable for
        # hostile coercion objects even when a positive density rounds to no
        # row draws or one matrix axis is empty.
        numerator_width = int(numerator_bound + 1)
        denominator_width = int(denominator_bound + 1)
        if numerator_width <= 1:
            raise ValueError("num_bound must be positive")
        if denominator_width <= 0:
            raise ValueError("den_bound must be nonnegative")
        if draws_per_row == 0:
            return MatrixSpace(sage.QQ, rows, columns)(0)

        if distribution == "1/n":

            def draw_reciprocal_uniform() -> Any:
                """Model Sage's reciprocal-uniform rational draw."""
                numerator = 0
                denominator = 1
                retry = True
                while retry:
                    centered = _random_int(0, 2147483647) - 1073741823
                    if centered == 0:
                        centered = 1
                    magnitude = 858993458 // abs(centered)
                    numerator = magnitude if centered > 0 else -magnitude
                    denominator_word = _random_int(0, 2147483647)
                    if denominator_word == 0:
                        denominator_word = 1
                    denominator = 2147483647 // denominator_word
                    retry = require_nonzero and numerator == 0
                return sage.QQ(numerator) / sage.QQ(denominator)

            # This distribution has variable-sized control flow and no native
            # executor yet. Keep both execution modes on the explicit portable
            # implementation instead of falling into the integer generator.
            if require_nonzero:
                return portable(spec, draw_nonzero=draw_reciprocal_uniform)
            return portable_full(draw_reciprocal_uniform)

        def draw_rational() -> Any:
            numerator = 0
            denominator = 1
            retry = True
            while retry:
                numerator = _random_int(0, numerator_width - 1)
                denominator = _random_int(0, denominator_width - 1)
                if denominator == 0:
                    denominator = 1
                if _random_int(0, 1) != 0:
                    numerator = -numerator
                retry = require_nonzero and numerator == 0
            return sage.QQ(numerator) / sage.QQ(denominator)

        if numerator_width > 4294967296 or denominator_width > 4294967296:
            if require_nonzero:
                return portable(spec, draw_nonzero=draw_rational)
            return portable_full(draw_rational)
        kernel = executors.sparse_random_fmpq
        if not _native_kernel_available(kernel):
            if require_nonzero:
                return portable(spec, draw_nonzero=draw_rational)
            return portable_full(draw_rational)
        final_state = _dense_integer_zeros(kernel, 1)
        resource = _flint_ffi_module().fmpq_matrix(rows, columns)
        try:
            initial_state = runtime.normalize_integer(_random_int(0, 4294967295))
            if not kernel(
                resource,
                draws_per_row,
                1 if float(spec[3]) == 1 else 0,
                1 if require_nonzero else 0,
                numerator_width,
                denominator_width,
                initial_state,
                final_state,
                word_base,
                multiplier,
                increment,
            ):
                raise RuntimeError("invalid sparse rational random parameters")
            _set_random_word_state(_integer_buffer_values(final_state)[0])
            _trace_dense_rational_selection(
                "random_matrix",
                _typed_python_implementation(kernel) + "-sparse",
                rows,
                columns,
            )
            return MatrixSpace(sage.QQ, rows, columns)._from_fmpq_matrix_resource(
                resource
            )
        except Exception:
            resource.close()
            raise

    return runtime.undefined


def random_matrix(
    base: sage.Parent,
    nrows: int,
    ncols: Any = None,
    algorithm: str = "randomize",
    implementation: Any = None,
    *args: Any,
    **kwds: Any,
) -> Matrix:
    r"""
    Construct a random dense matrix over `base`.

    The dimensions are `nrows` by `ncols`; omitting `ncols` constructs
    a square matrix. The common Sage keywords `density`, `x`, `y`, and
    `distribution='uniform'` are supported where meaningful. Full-density
    matrices over `QQ` use FLINT's two-bit rational distribution and are
    constructed directly in their owned FLINT resource. This intentionally
    differs from SageMath's bounded default rational distribution.

    ### Examples

    ```sage
    sage: A = random_matrix(ZZ, 3, 5, x=-10, y=11)
    sage: A.nrows(), A.ncols(), A.base_ring()
    (3, 5, Integer Ring)
    sage: random_matrix(GF(9, 'a'), 2).base_ring() is GF(9, 'a')
    True
    ```

    Sparse matrices and alternate construction algorithms are not yet
    implemented.
    """

    def keyword(name: str, fallback: Any) -> Any:
        value = runtime.reflect.get(kwds, name)
        return fallback if value is runtime.undefined else value

    base = _canonical_base(base)
    modular_ring = _is_modular_base(base)
    extension_field = _is_extension_field_base(base)
    approximate_field = _is_approximate_base(base)
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and not modular_ring
        and not extension_field
        and not approximate_field
    ):
        raise TypeError(
            "random_matrix currently requires ZZ, QQ, GF, Zmod, or a real/complex field"
        )
    if algorithm != "randomize":
        raise NotImplementedError(
            "random_matrix algorithm '" + algorithm + "' is not implemented yet"
        )
    if implementation is not None:
        raise NotImplementedError("alternate matrix implementations are not available")
    if len(args) != 0:
        raise TypeError("unexpected positional random_matrix arguments")
    if keyword("sparse", False):
        raise NotImplementedError("sparse matrices are not available")
    rows = int(nrows)
    cols = rows if ncols is None else int(ncols)
    if rows < 0 or cols < 0:
        raise ValueError("matrix dimensions must be nonnegative")
    density_supplied = runtime.reflect.has(kwds, "density")
    raw_density = keyword("density", None)
    # Sage treats an explicit `density=None` exactly like an omitted density:
    # it selects full density and permits zero entries. Only a numeric density
    # requests the explicit-density `nonzero=True` policy.
    if raw_density is None:
        density_supplied = False
        raw_density = 1.0
    # Sage's dense GF(2) implementation returns before coercing density when
    # either axis is empty. This is observable for hostile coercion objects.
    if density_supplied and _is_dense_binary_base(base) and (rows == 0 or cols == 0):
        return MatrixSpace(base, rows, cols)(0)
    density = float(raw_density)
    if density > 1:
        density = 1.0
    distribution = keyword("distribution", None)
    if base is not sage.QQ and distribution is not None and distribution != "uniform":
        raise ValueError("unknown random integer distribution")
    lower = keyword("x", None)
    upper = keyword("y", None)
    if upper is not None and lower is None:
        raise TypeError("y requires x")
    if base is sage.QQ and lower is not None:
        raise TypeError("QQ random matrices do not accept x or y")
    if lower is not None:
        lower = int(lower)
        if upper is not None:
            upper = int(upper)
            if upper <= lower:
                raise ValueError("y must be greater than x")
        elif lower <= 0:
            raise ValueError("x must be positive when y is omitted")

    rational_options_supplied = base is sage.QQ and (
        runtime.reflect.has(kwds, "distribution")
        or runtime.reflect.has(kwds, "num_bound")
        or runtime.reflect.has(kwds, "den_bound")
    )
    if density_supplied or rational_options_supplied:
        sparse_result = _bulk_sparse_random_matrix(
            base,
            rows,
            cols,
            density,
            distribution,
            lower,
            upper,
            keyword("num_bound", 2),
            keyword("den_bound", 2),
            density_supplied,
        )
        if sparse_result is not runtime.undefined:
            return sparse_result

    if (
        modular_ring
        and not _is_packed_dense_prime_base(base)
        and not _is_word_prime_resource_base(base)
        and lower is None
        and density == 1
        and distribution in (None, "uniform")
    ):
        backend = runtime.flint_backend()
        method_name = (
            "zmodMatrixRandom"
            if getattr(base, "_kind", None) == "ZMOD"
            else "nmodMatrixRandom"
        )
        random_method = runtime.reflect.get(backend, method_name)
        if runtime.jstype(random_method) == "function":
            seed1 = _random_int(0, 4294967295)
            seed2 = _random_int(0, 4294967295)
            native_value = runtime.reflect.apply(
                random_method,
                backend,
                [rows, cols, base._modulus, seed1, seed2],
            )
            return Matrix(MatrixSpace(base, rows, cols), native_value)

    if (
        _is_word_prime_resource_base(base)
        and lower is None
        and density == 1
        and distribution in (None, "uniform")
    ):
        seed1 = _random_int(0, 4294967295)
        seed2 = _random_int(0, 4294967295)
        resource = _flint_ffi_module().nmod_matrix_random(
            rows,
            cols,
            int(_untyped(base).characteristic()),
            seed1,
            seed2,
        )
        result = MatrixSpace(base, rows, cols)._from_nmod_matrix_resource(resource)
        result._trace_word_prime_resource("random_matrix")
        return result

    if (
        _is_packed_dense_prime_base(base)
        and lower is None
        and density == 1
        and distribution in (None, "uniform")
    ):
        count = rows * cols
        storage = _packed_uint64(count)
        if count != 0:
            kernel = _dense_prime_kernel_module()
            filler = kernel.dense_prime_field_matrix_random_fill
            native_filler = _native_kernel_available(filler)
            _trace_dense_prime_selection(
                "random_matrix",
                (
                    "typed-python-isolated"
                    if native_filler
                    else "typed-python-dynamic-fallback"
                ),
                rows,
                cols,
                int(_untyped(base).characteristic()),
            )
            initial_state = runtime.normalize_integer(_random_int(0, 4294967295))
            target = storage if native_filler else [0 for _index in range(count)]
            final_state = filler(
                target,
                runtime.normalize_integer(runtime.reflect.get(base, "_modulus")),
                initial_state,
            )
            if not native_filler:
                storage = _packed_uint64(target)
            _set_random_word_state(final_state)
        return MatrixSpace(base, rows, cols)._from_canonical_uint64_residues(storage)

    integer_fast_lower = None
    integer_fast_upper = None
    if base is sage.ZZ and density == 1:
        if lower is not None:
            integer_fast_lower = 0 if upper is None else int(lower)
            integer_fast_upper = int(lower) if upper is None else int(upper)
        elif distribution == "uniform":
            integer_fast_lower = -2
            integer_fast_upper = 3
    if integer_fast_lower is not None and integer_fast_upper is not None:
        span = integer_fast_upper - integer_fast_lower
        if span <= 4294967296:
            kernel = (
                _dense_integer_flint_module().flint_dense_integer_resource_random_fill
            )
            resource = _flint_ffi_module().fmpz_matrix(rows, cols)
            try:
                if rows * cols != 0:
                    state = _random_int(0, 4294967295)
                    valid, final_state = kernel(
                        resource,
                        runtime.normalize_integer(integer_fast_lower),
                        runtime.normalize_integer(span),
                        state,
                        runtime.bigint(4294967296),
                        runtime.bigint(1664525),
                        runtime.bigint(1013904223),
                    )
                    if not valid:
                        raise ValueError("invalid dense integer random parameters")
                    _set_random_word_state(final_state)
                _trace_dense_integer_selection(
                    "random_matrix",
                    _typed_python_implementation(kernel),
                    rows,
                    cols,
                )
                return MatrixSpace(sage.ZZ, rows, cols)._from_fmpz_matrix_resource(
                    resource
                )
            except Exception:
                resource.close()
                raise

    if base is sage.ZZ and density == 1 and lower is None and distribution is None:
        kernel = _dense_integer_flint_module().flint_dense_integer_resource_random_fill_default
        resource = _flint_ffi_module().fmpz_matrix(rows, cols)
        try:
            if rows * cols != 0:
                state = _random_int(0, 4294967295)
                valid, final_state = kernel(
                    resource,
                    state,
                    runtime.bigint(4294967296),
                    runtime.bigint(858993459),
                    runtime.bigint(2147483648),
                    runtime.bigint(1664525),
                    runtime.bigint(1013904223),
                )
                if not valid:
                    raise ValueError("invalid dense integer random parameters")
                _set_random_word_state(final_state)
            _trace_dense_integer_selection(
                "random_matrix",
                _typed_python_implementation(kernel),
                rows,
                cols,
            )
            return MatrixSpace(sage.ZZ, rows, cols)._from_fmpz_matrix_resource(resource)
        except Exception:
            resource.close()
            raise

    if base is sage.QQ and density == 1 and lower is None and distribution is None:
        ffi = _flint_ffi_module()
        if rows * cols == 0:
            resource = ffi.fmpq_matrix(rows, cols)
        else:
            seed1 = _random_int(0, 4294967295)
            seed2 = _random_int(0, 4294967295)
            resource = ffi.fmpq_matrix_randbits(rows, cols, 2, seed1, seed2)
        _trace_dense_rational_selection(
            "random_matrix",
            "generated-flint-resource",
            rows,
            cols,
        )
        return MatrixSpace(sage.QQ, rows, cols)._from_fmpq_matrix_resource(resource)

    values = [0 for _ in range(rows * cols)]
    if density == 1:
        for index in range(len(values)):
            if extension_field and lower is None:
                values[index] = _random_extension_field_element(base, False)
                continue
            if modular_ring and lower is None:
                value = _random_int(
                    0,
                    runtime.normalize_integer(runtime.reflect.get(base, "_modulus"))
                    - 1,
                )
            else:
                value = _random_integer(distribution, lower, upper, False)
            values[index] = value if _is_packed_dense_prime_base(base) else base(value)
    else:
        choices_per_row = int(density * cols)
        for row in range(rows):
            for _ in range(choices_per_row):
                column = _random_int(0, cols - 1)
                if modular_ring and lower is None:
                    value = _random_int(
                        1,
                        runtime.normalize_integer(runtime.reflect.get(base, "_modulus"))
                        - 1,
                    )
                elif extension_field and lower is None:
                    values[row * cols + column] = _random_extension_field_element(
                        base, True
                    )
                    continue
                else:
                    value = _random_integer(distribution, lower, upper, True)
                values[row * cols + column] = (
                    value if _is_packed_dense_prime_base(base) else base(value)
                )
    return matrix(base, rows, cols, values)


runtime.set_class_repr(Matrix, "<class 'Matrix'>")
runtime.set_class_repr(Vector, "<class 'Vector'>")
runtime.set_class_repr(MatrixSpaceParent, "<class 'MatrixSpace'>")
runtime.set_class_repr(VectorSpaceParent, "<class 'VectorSpace'>")
runtime.set_class_repr(VectorSubspaceParent, "<class 'VectorSubspace'>")
runtime.reflect.set(matrix, "random", random_matrix)
Mat = MatrixSpace


def _matrix_doc(
    tags: list[str],
    compatibility_notes: str,
    limitations: Any = None,
) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ["linear algebra", "matrices"],
        [tags],
    )
    return {
        "kind": "function",
        "module": "sage.matrix.constructor",
        "tags": all_tags,
        "backends": ["FLINT", "Arb", "ACB"],
        "sage_compatibility": {
            "status": "partial",
            "notes": compatibility_notes,
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath matrix API",
                "url": ("https://doc.sagemath.org/html/en/reference/matrices/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "FLINT, Arb, and ACB",
                "url": "https://flintlib.org/doc/",
            },
        ],
        "references": [
            {
                "id": "flint",
                "type": "software",
                "title": "FLINT: Fast Library for Number Theory",
                "authors": ["The FLINT contributors"],
                "url": "https://flintlib.org/",
            },
        ],
        "implementation": {
            "algorithm": (
                "Native FLINT dense matrices, including Arb/ACB approximate arithmetic"
            ),
        },
        "limitations": [] if limitations is None else limitations,
    }


runtime.register_doc(
    "matrix",
    matrix,
    _matrix_doc(
        ["construction", "exact arithmetic", "numerical linear algebra"],
        (
            "Common dense constructors and implemented matrix methods are "
            "Sage-compatible; sparse matrices are not yet available."
        ),
        ["Sparse matrix construction is not implemented."],
    ),
)
runtime.register_doc(
    "random_matrix",
    random_matrix,
    _matrix_doc(
        ["random generation", "benchmarking"],
        (
            "The randomize algorithm and common density/range options are "
            "compatible; specialized SageMath algorithms are not available."
        ),
        [
            "Only algorithm=randomize is supported.",
            "Sparse output is not implemented.",
        ],
    ),
)
runtime.register_doc(
    "sudoku",
    sudoku,
    _matrix_doc(
        ["constraint solving", "games"],
        "Solves Sage-compatible 9 by 9 integer Sudoku matrices.",
    ),
)
