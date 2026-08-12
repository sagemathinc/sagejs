"""Storage-neutral resource contracts for finite-extension polynomials.

Dense univariate polynomials over `GF(p^n)` need three generated foreign
resource kinds:

- an owned `FqContext` held by the public finite-field parent;
- owned `FqElement` values that retain that exact context root; and
- owned `FqPolynomial` values that retain the same context root.

The context owns the defining modulus and its foreign precomputation.  Elements
and polynomials never own a second independently reconstructed context, expose
a raw pointer, or compare contexts merely by mathematical isomorphism.  Every
operation validates the exact context identity before entering foreign code.
Explicit context close invalidates its descendants, while ordinary garbage
collection uses the generated finalizer only as a fallback.

The portable interchange representation is a rectangular power-basis table.
Polynomial coefficients are ordered from constant to leading coefficient.
Within each coefficient, coordinates are ordered from `1` through
`a^(n - 1)`.  Thus the flat row-major offset is
`coefficient_index*n + basis_index`.  Coordinates are canonical residues in
`[0, p)`.  Polynomial zero has no coefficient rows; trailing all-zero rows are
removed during construction.

This table is an explicit bulk boundary, not canonical live storage.  A future
generated adapter validates it and crosses into FLINT once to construct an
`fq`, `fq_nmod`, or `fq_default` polynomial.  Export similarly crosses once and
returns one host-owned coordinate region.  Word-sized characteristics can use
packed unsigned words; larger characteristics can use a compiler-owned exact
integer region without changing this semantic contract.

Public Sage coercion happens before this boundary.  Sage accepts values such as
`True`, `1.0`, and `"1"` as finite-field coefficients, but the generated ABI
receives only already-coerced exact canonical coordinates.  Ambiguous or
lossy-looking values therefore fail closed here.
"""

from __future__ import annotations

from typing import Any, Callable, Sequence, TypeAlias, TypeVar

_Context = TypeVar("_Context")
_Resource = TypeVar("_Resource")

ContextDescriptor: TypeAlias = tuple[int, int, tuple[int, ...], str]
PowerBasisPayload: TypeAlias = tuple[int, Sequence[Any]]
PolynomialConstructor: TypeAlias = Callable[[_Context, Sequence[Any], int], _Resource]
PolynomialExporter: TypeAlias = Callable[
    [_Resource], tuple[_Context, Any, Sequence[Any]]
]


def _exact_index(value: Any, name: str) -> int:
    """Return an exact integer while rejecting public-layer coercions."""
    if isinstance(value, bool):
        raise TypeError(name + " must be an exact integer")
    if isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(name + " must be an exact integer") from None
    answer = method()
    if isinstance(answer, bool) or not isinstance(answer, int):
        raise TypeError(name + " __index__ returned a non-integer")
    return int(answer)


def _valid_ascii_identifier(value: str) -> bool:
    if len(value) == 0:
        return False
    first = value[0]
    if not (first == "_" or "A" <= first <= "Z" or "a" <= first <= "z"):
        return False
    for character in value[1:]:
        if not (
            character == "_"
            or "A" <= character <= "Z"
            or "a" <= character <= "z"
            or "0" <= character <= "9"
        ):
            return False
    return True


def extension_context_descriptor(
    characteristic: Any,
    degree: Any,
    modulus_coefficients: Sequence[Any],
    generator_name: Any,
) -> ContextDescriptor:
    """Return deterministic checked inputs for one generated `FqContext`.

    The modulus is low-to-high and must already be monic of exact degree.
    Primality and irreducibility remain mature-library responsibilities; this
    function deliberately does not reimplement them.

    A descriptor is suitable for cache identity and serialization metadata,
    but equal descriptors do not authorize mixing two separately owned context
    resources.  Runtime operations use `require_context_identity` as well.
    """
    prime = _exact_index(characteristic, "finite-field characteristic")
    extension_degree = _exact_index(degree, "finite-field degree")
    if prime < 2:
        raise ValueError("finite-field characteristic must be at least 2")
    if extension_degree < 2:
        raise ValueError("finite-extension degree must be at least 2")
    if not isinstance(generator_name, str) or not _valid_ascii_identifier(
        generator_name
    ):
        raise TypeError("finite-field generator must be a valid identifier")
    if len(modulus_coefficients) != extension_degree + 1:
        raise ValueError("finite-field modulus must have degree equal to the field")
    checked: list[int] = []
    for value in modulus_coefficients:
        coordinate = _exact_index(value, "finite-field modulus coefficient")
        if coordinate < 0 or coordinate >= prime:
            raise ValueError("finite-field modulus coefficient is not canonical")
        checked.append(coordinate)
    if checked[-1] != 1:
        raise ValueError("finite-field modulus must be monic")
    return prime, extension_degree, tuple(checked), generator_name


def require_context_identity(expected: _Context, actual: _Context) -> None:
    """Reject an element or polynomial owned by any other context resource."""
    if actual is not expected:
        raise TypeError("finite-field resource belongs to an incompatible context")


def checked_element_coordinates(
    characteristic: Any,
    degree: Any,
    coordinates: Sequence[Any],
) -> Sequence[Any]:
    """Validate one fixed-width element row and preserve its storage object."""
    prime = _exact_index(characteristic, "finite-field characteristic")
    extension_degree = _exact_index(degree, "finite-field degree")
    if prime < 2:
        raise ValueError("finite-field characteristic must be at least 2")
    if extension_degree < 2:
        raise ValueError("finite-extension degree must be at least 2")
    if len(coordinates) != extension_degree:
        raise ValueError("finite-field element coordinate width does not match degree")
    for value in coordinates:
        coordinate = _exact_index(value, "finite-field element coordinate")
        if coordinate < 0 or coordinate >= prime:
            raise ValueError("finite-field element coordinate is not canonical")
    return coordinates


def checked_polynomial_coordinates(
    characteristic: Any,
    degree: Any,
    coordinates: Sequence[Any],
    coefficient_count: Any,
    *,
    normalize_trailing_zeroes: bool,
) -> PowerBasisPayload:
    """Validate one flat power-basis table and return its logical row count.

    Construction uses `normalize_trailing_zeroes=True`, matching Sage's dense
    polynomial constructor.  Generated export uses `False`: a foreign backend
    must emit canonical normalized storage rather than hiding a malformed
    result at the host boundary.  The original coordinate object is preserved;
    consumers read only the prefix of `logical_count*degree` entries.
    """
    prime = _exact_index(characteristic, "finite-field characteristic")
    extension_degree = _exact_index(degree, "finite-field degree")
    count = _exact_index(coefficient_count, "polynomial coefficient count")
    if prime < 2:
        raise ValueError("finite-field characteristic must be at least 2")
    if extension_degree < 2:
        raise ValueError("finite-extension degree must be at least 2")
    if count < 0:
        raise ValueError("polynomial coefficient count must be nonnegative")
    if len(coordinates) != count * extension_degree:
        raise ValueError(
            "power-basis coordinate length does not match polynomial shape"
        )

    for value in coordinates:
        coordinate = _exact_index(value, "finite-field coordinate")
        if coordinate < 0 or coordinate >= prime:
            raise ValueError("finite-field coordinate is not canonical")

    logical_count = count
    while logical_count > 0:
        offset = (logical_count - 1) * extension_degree
        nonzero = False
        for basis_index in range(extension_degree):
            if coordinates[offset + basis_index] != 0:
                nonzero = True
                break
        if nonzero:
            break
        logical_count -= 1
    if not normalize_trailing_zeroes and logical_count != count:
        raise ValueError("exported polynomial coordinates are not normalized")
    return logical_count, coordinates


def construct_extension_polynomial(
    context: _Context,
    characteristic: Any,
    degree: Any,
    coordinates: Sequence[Any],
    coefficient_count: Any,
    construct: PolynomialConstructor[_Context, _Resource],
) -> _Resource:
    """Validate a bulk table and invoke one resource constructor callback.

    The callback is synchronous and receives the original storage plus the
    normalized logical row count.  A generated adapter roots `context` and the
    coordinate owner for the whole call, then returns a newly owned polynomial
    tagged with that same context.  It never constructs one `FqElement` per
    coefficient in the dynamic host.
    """
    logical_count, checked = checked_polynomial_coordinates(
        characteristic,
        degree,
        coordinates,
        coefficient_count,
        normalize_trailing_zeroes=True,
    )
    return construct(context, checked, logical_count)


def export_extension_polynomial(
    expected_context: _Context,
    resource: _Resource,
    characteristic: Any,
    degree: Any,
    export_coordinates: PolynomialExporter[_Resource, _Context],
) -> PowerBasisPayload:
    """Invoke one bulk exporter and validate its canonical host-owned result.

    The exporter returns `(actual_context, coefficient_count, coordinates)` in
    one call.  In generated code the context value is normally a checked owner
    root or type tag rather than another foreign-library query.  The copied
    coordinate region is safe after the polynomial resource is closed.
    """
    actual_context, coefficient_count, coordinates = export_coordinates(resource)
    require_context_identity(expected_context, actual_context)
    return checked_polynomial_coordinates(
        characteristic,
        degree,
        coordinates,
        coefficient_count,
        normalize_trailing_zeroes=False,
    )
