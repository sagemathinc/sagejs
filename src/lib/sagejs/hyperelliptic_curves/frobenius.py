"""Exact exhaustive Frobenius arithmetic for hyperelliptic curves."""

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime

MAX_EXHAUSTIVE_FIELD_ORDER = 2_000_000
MAX_LOCAL_FACTOR_CHUNK_SIZE = 65_536
MAX_LOCAL_FACTOR_STREAM_CACHE_SIZE = 256
_LPOLYNOMIAL_BACKENDS: dict[str, Any] = {}
_smalljac_capability_cache: Any = runtime.undefined
_lpolynomial_ring_cache: Any = runtime.undefined
_frobenius_ring_cache: Any = runtime.undefined
_zeta_ring_cache: Any = runtime.undefined
_polynomial_module_cache: Any = runtime.undefined


def _property(value: Any, name: str) -> Any:
    return runtime.reflect.get(value, name)


def _smalljac_capabilities() -> Any:
    """Return the checked native capability object, or `None` if absent."""
    global _smalljac_capability_cache
    if _smalljac_capability_cache is not runtime.undefined:
        return _smalljac_capability_cache
    try:
        backend = runtime.flint_backend()
        function = _property(backend, "smalljacCapabilities")
        if function is runtime.undefined:
            _smalljac_capability_cache = None
            return None
        capability = runtime.reflect.apply(function, backend, [])
        if (
            not bool(_property(capability, "available"))
            or _property(capability, "normalization") != "det(1-T*Frob)"
            or int(_property(capability, "maxGenus")) < 2
        ):
            _smalljac_capability_cache = None
            return None
        full_genera = _property(capability, "fullLpolynomialGenus")
        supports_genus_two = False
        for index in range(len(full_genera)):
            if int(full_genera[index]) == 2:
                supports_genus_two = True
        if not supports_genus_two:
            _smalljac_capability_cache = None
            return None
        bound = _property(_property(capability, "primeUpperBounds"), "lpolynomial")
        if runtime.integer_bigint(bound) < runtime.bigint(3):
            _smalljac_capability_cache = None
            return None
        _smalljac_capability_cache = capability
        return capability
    except Exception:
        _smalljac_capability_cache = None
        return None


def _smalljac_prime_bound() -> Any:
    capability = _smalljac_capabilities()
    if capability is None:
        return runtime.bigint(0)
    bounds = _property(capability, "primeUpperBounds")
    return runtime.integer_bigint(_property(bounds, "lpolynomial"))


def _smalljac_group_prime_bound() -> Any:
    capability = _smalljac_capabilities()
    if capability is None:
        return runtime.bigint(0)
    bounds = _property(capability, "primeUpperBounds")
    return runtime.integer_bigint(_property(bounds, "groupStructure"))


def _smalljac_supports_finite_curve(curve: Any) -> bool:
    base = curve.base_ring()
    return (
        _smalljac_capabilities() is not None
        and curve.genus() == 2
        and getattr(base, "_kind", None) == "GF"
        and int(base.characteristic()) != 2
        and runtime.integer_bigint(base.order()) <= _smalljac_prime_bound()
    )


def smalljac_supports_group_structure(curve: Any) -> bool:
    """Whether the checked native invariant-factor boundary accepts `curve`."""
    if not _smalljac_supports_finite_curve(curve):
        return False
    f_value, h_value = curve.hyperelliptic_polynomials()
    effective_degree = max(int(f_value.degree()), 2 * int(h_value.degree()))
    return (
        effective_degree == 2 * int(curve.genus()) + 1
        and runtime.integer_bigint(curve.base_ring().order())
        <= _smalljac_group_prime_bound()
    )


def _integer_polynomial_text(coefficients: list[Any]) -> str:
    values = [runtime.integer_bigint(value) for value in coefficients]
    while len(values) != 0 and values[-1] == 0:
        values.pop()
    if len(values) == 0:
        return "0"
    pieces = []
    for exponent in range(len(values) - 1, -1, -1):
        coefficient = values[exponent]
        if coefficient == 0:
            continue
        negative = coefficient < 0
        magnitude = -coefficient if negative else coefficient
        if exponent == 0:
            body = str(magnitude)
        elif exponent == 1:
            body = "x" if magnitude == 1 else str(magnitude) + "*x"
        else:
            power = "x^" + str(exponent)
            body = power if magnitude == 1 else str(magnitude) + "*" + power
        if len(pieces) == 0:
            pieces.append(("-" if negative else "") + body)
        else:
            pieces.append(("-" if negative else "+") + body)
    return "".join(pieces)


def _smalljac_curve_text(f_coefficients: list[Any], h_coefficients: list[Any]) -> str:
    f_text = _integer_polynomial_text(f_coefficients)
    h_text = _integer_polynomial_text(h_coefficients)
    curve_text = f_text if h_text == "0" else "[" + f_text + "," + h_text + "]"
    if len(curve_text) == 0 or len(curve_text) > 1023:
        raise ValueError("the checked smalljac curve text is too large")
    return curve_text


def _finite_smalljac_curve_text(curve: Any) -> str:
    f_value, h_value = curve.hyperelliptic_polynomials()

    def lifts(polynomial: Any) -> list[Any]:
        answer = []
        for coefficient in polynomial.list():
            lift = getattr(coefficient, "lift", None)
            if not callable(lift):
                raise TypeError("smalljac requires prime-field coefficients")
            answer.append(sage.ZZ(lift()))
        return answer

    return _smalljac_curve_text(lifts(f_value), lifts(h_value))


def rational_smalljac_model(curve: Any) -> dict[str, Any]:
    """Return private curve text plus exact transform diagnostics over `QQ`."""
    data = curve._smalljac_integral_model_data()
    return {
        "curve_text": _smalljac_curve_text(
            list(data["f_coefficients"]), list(data["h_coefficients"])
        ),
        "excluded_denominator": data["excluded_denominator"],
        "transform_scale": data["transform_scale"],
        "y_weight": data["y_weight"],
        "transform": data["transform"],
    }


def _smalljac_status(name: str) -> int:
    capability = _smalljac_capabilities()
    if capability is None:
        raise NotImplementedError(
            "the native smalljac L-polynomial backend is unavailable"
        )
    statuses = _property(capability, "statuses")
    value = _property(statuses, name)
    if value is runtime.undefined:
        raise RuntimeError("the native smalljac status contract is incomplete")
    return int(value)


def _raise_smalljac_batch_error(status: int, status_name: str) -> None:
    message = "smalljac L-polynomial batch failed with status " + repr(status_name)
    if status == _smalljac_status("UNAVAILABLE"):
        raise NotImplementedError("the native smalljac backend is unavailable")
    if status == _smalljac_status("UNSUPPORTED_CURVE"):
        raise NotImplementedError("smalljac does not support this curve model")
    if status == _smalljac_status("SINGULAR_CURVE"):
        raise ArithmeticError("smalljac rejected a singular curve model")
    if status in [
        _smalljac_status("INVALID_ARGUMENT"),
        _smalljac_status("INVALID_INTERVAL"),
        _smalljac_status("PARSE_ERROR"),
    ]:
        raise ValueError(message)
    if status == _smalljac_status("ALLOCATION_FAILED"):
        raise MemoryError(message)
    if status == _smalljac_status("COEFFICIENT_RANGE"):
        raise OverflowError(message)
    raise RuntimeError(message)


def _smalljac_lpoly_batch(curve_text: str, start: Any, stop: Any, max_rows: int) -> Any:
    capability = _smalljac_capabilities()
    if capability is None:
        raise NotImplementedError(
            "the native smalljac L-polynomial backend is unavailable"
        )
    start_exact = runtime.integer_bigint(start)
    stop_exact = runtime.integer_bigint(stop)
    if start_exact < runtime.bigint(2) or stop_exact < start_exact:
        raise ValueError("smalljac needs a nonempty closed interval starting at 2")
    if stop_exact > _smalljac_prime_bound():
        raise OverflowError("the prime interval exceeds the smalljac range")
    if max_rows < 0:
        raise ValueError("max_rows must be nonnegative")

    backend = runtime.flint_backend()
    function = _property(backend, "smalljacLpolyBatch")
    if function is runtime.undefined:
        raise NotImplementedError(
            "the native smalljac L-polynomial backend is unavailable"
        )
    arguments: list[Any] = [curve_text, start_exact, stop_exact]
    if max_rows != 0:
        options = runtime.object.create(None)
        runtime.reflect.set(options, "maxRows", max_rows)
        arguments.append(options)
    batch = runtime.reflect.apply(function, backend, arguments)
    status = int(_property(batch, "status"))
    status_name = str(_property(batch, "statusName"))
    allowed = [_smalljac_status("OK"), _smalljac_status("TRUNCATED")]
    if status not in allowed:
        _raise_smalljac_batch_error(status, status_name)
    expected_status_name = "truncated" if status == allowed[1] else "ok"
    if status_name != expected_status_name:
        raise RuntimeError("smalljac returned an inconsistent status name")
    truncated = bool(_property(batch, "truncated"))
    if (status == _smalljac_status("TRUNCATED")) != truncated:
        raise RuntimeError("inconsistent smalljac truncation status")
    if int(_property(batch, "genus")) != 2:
        raise RuntimeError("smalljac returned an unexpected genus")
    if _property(batch, "normalization") != "det(1-T*Frob)":
        raise RuntimeError("smalljac returned an unexpected normalization")
    if _property(batch, "backendVersion") != _property(capability, "backendVersion"):
        raise RuntimeError("smalljac returned an unexpected backend version")
    row_count = int(_property(batch, "rowCount"))
    required_rows = int(_property(batch, "requiredRows"))
    if row_count < 0 or required_rows < row_count:
        raise RuntimeError("smalljac returned inconsistent row counts")
    if (truncated and required_rows <= row_count) or (
        not truncated and required_rows != row_count
    ):
        raise RuntimeError("smalljac returned inconsistent required row counts")
    if truncated and (max_rows == 0 or row_count != max_rows):
        raise RuntimeError("smalljac violated the requested row bound")
    arrays = [
        _property(batch, "primes"),
        _property(batch, "good"),
        _property(batch, "coefficientCounts"),
        _property(batch, "coefficients"),
        _property(batch, "rowStatus"),
    ]
    expected_lengths = [row_count, row_count, row_count, 2 * row_count, row_count]
    for array, expected in zip(arrays, expected_lengths, strict=True):
        if len(array) != expected:
            raise RuntimeError("smalljac returned a malformed packed batch")
    return batch


def _full_genus_two_coefficients(prime: Any, c1: Any, c2: Any) -> list[int]:
    p_value = sage.ZZ(runtime.integer_bigint(prime))
    first = sage.ZZ(runtime.integer_bigint(c1))
    second = sage.ZZ(runtime.integer_bigint(c2))
    result = [sage.ZZ(1), first, second, p_value * first, p_value * p_value]
    _validate_lpolynomial(int(p_value), 2, result, [])
    return result


def _smalljac_rows(
    curve_text: str, start: Any, stop: Any, max_rows: int = 0
) -> tuple[list[tuple[int, list[int] | None]], bool]:
    batch = _smalljac_lpoly_batch(curve_text, start, stop, max_rows)
    row_count = int(_property(batch, "rowCount"))
    primes = _property(batch, "primes")
    good = _property(batch, "good")
    counts = _property(batch, "coefficientCounts")
    packed = _property(batch, "coefficients")
    row_status = _property(batch, "rowStatus")
    rows: list[tuple[int, list[int] | None]] = []
    previous = runtime.bigint(0)
    start_exact = runtime.integer_bigint(start)
    stop_exact = runtime.integer_bigint(stop)
    for index in range(row_count):
        prime_exact = runtime.integer_bigint(primes[index])
        if (
            prime_exact < start_exact
            or prime_exact > stop_exact
            or prime_exact <= previous
            or not sage.is_prime(int(prime_exact))
        ):
            raise RuntimeError("smalljac returned an invalid prime stream")
        previous = prime_exact
        is_good = int(good[index])
        coefficient_count = int(counts[index])
        status = int(row_status[index])
        if is_good not in [0, 1]:
            raise RuntimeError("smalljac returned an invalid good-reduction flag")
        if is_good == 1:
            if coefficient_count != 2 or status != _smalljac_status("ROW_GOOD"):
                raise RuntimeError("smalljac returned an inconsistent good row")
            coefficients = _full_genus_two_coefficients(
                prime_exact, packed[2 * index], packed[2 * index + 1]
            )
        else:
            if (
                coefficient_count != 0
                or status != _smalljac_status("ROW_BAD_REDUCTION")
                or runtime.integer_bigint(packed[2 * index]) != runtime.bigint(0)
                or runtime.integer_bigint(packed[2 * index + 1]) != runtime.bigint(0)
            ):
                raise RuntimeError("smalljac returned an inconsistent bad row")
            coefficients = None
        rows.append((int(prime_exact), coefficients))
    return rows, bool(_property(batch, "truncated"))


def _smalljac_finite_lpolynomial_coefficients(curve: Any) -> list[int]:
    if not _smalljac_supports_finite_curve(curve):
        raise NotImplementedError(
            "smalljac supports genus-2 curves over odd prime fields in its checked range"
        )
    prime = int(curve.base_ring().order())
    rows, truncated = _smalljac_rows(
        _finite_smalljac_curve_text(curve), prime, prime, 1
    )
    if truncated or len(rows) != 1 or rows[0][0] != prime:
        raise RuntimeError("smalljac did not return the requested prime")
    coefficients = rows[0][1]
    if coefficients is None:
        raise ArithmeticError("the curve has bad reduction at " + str(prime))
    return coefficients


def smalljac_group_invariants(curve: Any) -> tuple[Any, ...]:
    """Return checked smalljac invariant factors for one finite-field curve."""
    if not smalljac_supports_group_structure(curve):
        raise NotImplementedError(
            "smalljac group structure requires an odd-degree genus-2 curve "
            "over a supported odd prime field"
        )
    prime = runtime.integer_bigint(curve.base_ring().order())
    backend = runtime.flint_backend()
    function = _property(backend, "smalljacGroupBatch")
    if function is runtime.undefined:
        raise NotImplementedError("the native smalljac group backend is unavailable")
    batch = runtime.reflect.apply(
        function,
        backend,
        [_finite_smalljac_curve_text(curve), prime, prime],
    )
    status = int(_property(batch, "status"))
    status_name = str(_property(batch, "statusName"))
    if status != _smalljac_status("OK"):
        _raise_smalljac_batch_error(status, status_name)
    if (
        status_name != "ok"
        or bool(_property(batch, "truncated"))
        or int(_property(batch, "genus")) != 2
        or int(_property(batch, "rowCount")) != 1
        or int(_property(batch, "requiredRows")) != 1
        or _property(batch, "normalization") != "det(1-T*Frob)"
        or _property(batch, "backendVersion")
        != _property(_smalljac_capabilities(), "backendVersion")
    ):
        raise RuntimeError("smalljac returned inconsistent group metadata")
    primes = _property(batch, "primes")
    good = _property(batch, "good")
    counts = _property(batch, "invariantCounts")
    offsets = _property(batch, "invariantOffsets")
    invariants = _property(batch, "invariants")
    row_status = _property(batch, "rowStatus")
    if (
        len(primes) != 1
        or len(good) != 1
        or len(counts) != 1
        or len(offsets) != 2
        or len(row_status) != 1
        or runtime.integer_bigint(primes[0]) != prime
        or int(good[0]) != 1
        or int(row_status[0]) != _smalljac_status("ROW_GOOD")
        or int(offsets[0]) != 0
        or int(offsets[1]) != len(invariants)
        or int(counts[0]) != len(invariants)
    ):
        raise RuntimeError("smalljac returned a malformed packed group row")
    if len(invariants) < 1 or len(invariants) > 4:
        raise RuntimeError("smalljac returned an invalid Jacobian group rank")
    answer = tuple(sage.ZZ(runtime.integer_bigint(value)) for value in invariants)
    product = sage.ZZ(1)
    previous = sage.ZZ(1)
    for value in answer:
        if value <= 0 or value % previous != 0:
            raise RuntimeError("smalljac returned invalid invariant factors")
        product *= value
        previous = value
    coefficients = _smalljac_finite_lpolynomial_coefficients(curve)
    if product != sum(coefficients):
        raise RuntimeError("smalljac group factors disagree with the local polynomial")
    return answer


def register_lpolynomial_backend(name: str, backend: Any) -> None:
    """Register one exact accelerator behind an explicit algorithm name.

    This is an internal integration hook. A backend returns the full ascending
    Euler-numerator coefficient list; registration alone does not make it the
    `auto` backend unless it is named `smalljac` and accepts the curve.
    """
    if not isinstance(name, str) or name in ["auto", "exhaustive"]:
        raise ValueError("invalid hyperelliptic L-polynomial backend name")
    if not callable(backend):
        raise TypeError("a hyperelliptic L-polynomial backend must be callable")
    _LPOLYNOMIAL_BACKENDS[name] = backend


def select_lpolynomial_algorithm(curve: Any, algorithm: str) -> str:
    if algorithm == "auto":
        if _smalljac_supports_finite_curve(curve):
            return "smalljac"
        smalljac = _LPOLYNOMIAL_BACKENDS.get("smalljac")
        supports = getattr(smalljac, "supports", None)
        if smalljac is not None and (not callable(supports) or supports(curve)):
            return "smalljac"
        return "exhaustive"
    if algorithm == "smalljac" and _smalljac_supports_finite_curve(curve):
        return "smalljac"
    if algorithm == "exhaustive" or algorithm in _LPOLYNOMIAL_BACKENDS:
        return algorithm
    if algorithm == "smalljac":
        if _smalljac_capabilities() is None:
            raise NotImplementedError(
                "the native smalljac L-polynomial backend is unavailable"
            )
        raise NotImplementedError(
            "smalljac supports genus-2 curves over odd prime fields in its checked range"
        )
    raise ValueError("unknown hyperelliptic L-polynomial algorithm " + repr(algorithm))


def lpolynomial_coefficients(curve: Any, algorithm: str) -> list[int]:
    """Dispatch to an exact ascending-coefficient implementation."""
    if algorithm == "exhaustive":
        return reference_lpolynomial_coefficients(curve)
    if algorithm == "smalljac" and _smalljac_supports_finite_curve(curve):
        return _smalljac_finite_lpolynomial_coefficients(curve)
    backend = _LPOLYNOMIAL_BACKENDS.get(algorithm)
    if backend is None:
        raise NotImplementedError(
            "the "
            + repr(algorithm)
            + " hyperelliptic L-polynomial backend is unavailable"
        )
    result = list(backend(curve))
    q_value = _field_order(curve.base_ring())
    _validate_lpolynomial(q_value, curve.genus(), result, [])
    return result


def _field_characteristic(field: Any) -> int:
    return int(field.characteristic())


def _field_order(field: Any) -> int:
    return int(field.order())


def _absolute_degree(field: Any) -> int:
    characteristic = _field_characteristic(field)
    order = _field_order(field)
    degree = 0
    value = order
    while value > 1 and value % characteristic == 0:
        value //= characteristic
        degree += 1
    if value != 1:
        raise ValueError("finite-field order is not a power of its characteristic")
    return degree


def _sage_field_elements(field: Any) -> list[Any]:
    """Enumerate a Sage.js finite field without assuming its generator is primitive."""
    order = _field_order(field)
    characteristic = _field_characteristic(field)
    degree = _absolute_degree(field)
    if degree == 1:
        return [field(value) for value in range(order)]
    generator = field.gen()
    powers = [field(1)]
    for _index in range(1, degree):
        powers.append(powers[-1] * generator)
    answer = []
    for encoded in range(order):
        value = field(0)
        digits = encoded
        for index in range(degree):
            value += field(digits % characteristic) * powers[index]
            digits //= characteristic
        answer.append(value)
    return answer


def _tuples(values: list[Any], length: int) -> Iterator[list[Any]]:
    if length == 0:
        yield []
        return
    for prefix in _tuples(values, length - 1):
        for value in values:
            yield prefix + [value]


def _evaluate_coefficients(coefficients: list[Any], value: Any, zero: Any) -> Any:
    answer = zero
    for coefficient in reversed(coefficients):
        answer = answer * value + coefficient
    return answer


def _irreducible_modulus(base: Any, degree: int) -> list[Any]:
    if degree not in [2, 3]:
        raise NotImplementedError("the exhaustive field tower supports degrees 2 and 3")
    elements = _sage_field_elements(base)
    zero = base(0)
    one = base(1)
    for lower in _tuples(elements, degree):
        coefficients = lower + [one]
        has_root = False
        for value in elements:
            if _evaluate_coefficients(coefficients, value, zero) == zero:
                has_root = True
                break
        if not has_root:
            return coefficients
    raise RuntimeError("failed to construct a finite-field extension")


class _ReferenceExtensionElement:
    def __init__(self, parent: _ReferenceExtensionField, coefficients: Any) -> None:
        values = list(coefficients)
        zero = parent._base(0)
        if len(values) < parent._degree:
            values += [zero for _index in range(parent._degree - len(values))]
        self._parent = parent
        self._coefficients = tuple(values[: parent._degree])

    def _coerce(self, other: Any) -> _ReferenceExtensionElement:
        return self._parent(other)

    def _add_(self, other: Any) -> _ReferenceExtensionElement:
        right = self._coerce(other)
        return self._parent(
            [
                self._coefficients[index] + right._coefficients[index]
                for index in range(self._parent._degree)
            ]
        )

    def __add__(self, other: Any) -> _ReferenceExtensionElement:
        return self._add_(other)

    __radd__ = __add__

    def __neg__(self) -> _ReferenceExtensionElement:
        return self._parent([-value for value in self._coefficients])

    def _sub_(self, other: Any) -> _ReferenceExtensionElement:
        return self._add_(-self._coerce(other))

    def __sub__(self, other: Any) -> _ReferenceExtensionElement:
        return self._sub_(other)

    def __rsub__(self, other: Any) -> _ReferenceExtensionElement:
        return self._coerce(other) - self

    def _mul_(self, other: Any) -> _ReferenceExtensionElement:
        right = self._coerce(other)
        degree = self._parent._degree
        zero = self._parent._base(0)
        product = [zero for _index in range(2 * degree - 1)]
        for left_index in range(degree):
            for right_index in range(degree):
                product[left_index + right_index] += (
                    self._coefficients[left_index] * right._coefficients[right_index]
                )
        modulus = self._parent._modulus
        for position in range(2 * degree - 2, degree - 1, -1):
            leading = product[position]
            if leading != zero:
                for index in range(degree):
                    product[position - degree + index] -= leading * modulus[index]
        return self._parent(product[:degree])

    def __mul__(self, other: Any) -> _ReferenceExtensionElement:
        return self._mul_(other)

    __rmul__ = __mul__

    def __pow__(self, exponent: int) -> _ReferenceExtensionElement:
        exponent = int(exponent)
        if exponent < 0:
            return (self ** (self._parent._order - 2)) ** (-exponent)
        result = self._parent(1)
        base = self
        while exponent:
            if exponent & 1:
                result = result * base
            base = base * base
            exponent //= 2
        return result

    def _truediv_(self, other: Any) -> _ReferenceExtensionElement:
        right = self._coerce(other)
        if right == self._parent(0):
            raise ZeroDivisionError("finite field division by zero")
        return self * right ** (self._parent._order - 2)

    def __truediv__(self, other: Any) -> _ReferenceExtensionElement:
        return self._truediv_(other)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, _ReferenceExtensionElement):
            try:
                other = self._coerce(other)
            except (TypeError, ValueError):
                return False
        return (
            self._parent is other._parent and self._coefficients == other._coefficients
        )

    def __hash__(self) -> int:
        return hash(
            (id(self._parent), tuple(repr(value) for value in self._coefficients))
        )

    def __repr__(self) -> str:
        return repr(self._coefficients)


class _ReferenceExtensionField:
    def __init__(self, base: Any, degree: int) -> None:
        self._base = base
        self._degree = degree
        self._order = _field_order(base) ** degree
        self._characteristic = _field_characteristic(base)
        self._absolute_degree = _absolute_degree(base) * degree
        self._modulus = _irreducible_modulus(base, degree)
        self._base_elements = _sage_field_elements(base)

    def __call__(self, value: Any = 0) -> _ReferenceExtensionElement:
        if isinstance(value, _ReferenceExtensionElement):
            if value._parent is not self:
                raise TypeError("incompatible reference finite fields")
            return value
        if isinstance(value, (list, tuple)):
            return _ReferenceExtensionElement(self, value)
        return _ReferenceExtensionElement(self, [self._base(value)])

    def zero(self) -> _ReferenceExtensionElement:
        return self(0)

    def one(self) -> _ReferenceExtensionElement:
        return self(1)

    def characteristic(self) -> int:
        return self._characteristic

    def order(self) -> int:
        return self._order

    def absolute_degree(self) -> int:
        return self._absolute_degree

    def __iter__(self) -> Iterator[_ReferenceExtensionElement]:
        for coefficients in _tuples(self._base_elements, self._degree):
            yield self(coefficients)


def _count_quadratic_solutions(field: Any, linear: Any, constant: Any) -> int:
    """Count solutions of `y^2 + linear*y = constant`."""
    zero = field(0)
    if _field_characteristic(field) != 2:
        discriminant = linear * linear + field(4) * constant
        if discriminant == zero:
            return 1
        symbol = discriminant ** ((_field_order(field) - 1) // 2)
        return 2 if symbol == field(1) else 0
    if linear == zero:
        return 1
    reduced = constant / (linear * linear)
    trace = zero
    value = reduced
    absolute_degree = (
        field.absolute_degree()
        if isinstance(field, _ReferenceExtensionField)
        else _absolute_degree(field)
    )
    for _index in range(absolute_degree):
        trace += value
        value = value * value
    return 2 if trace == zero else 0


def _coefficient_in_field(field: Any, coefficient: Any) -> Any:
    if isinstance(field, _ReferenceExtensionField):
        return field(coefficient)
    try:
        return field(coefficient)
    except TypeError:
        lift = getattr(coefficient, "lift", None)
        if not callable(lift):
            raise
        return field(lift())


def _extension_field_for_counting(base: Any, degree: int) -> Any:
    """Choose the fastest exact extension that preserves coefficient embeddings.

    A prime-field coefficient has a canonical embedding in Sage.js's native
    FLINT field of order `p^degree`. Curves over an extension base need a
    compatible relative embedding, so they retain the small ordinary-Python
    reference tower until that embedding is part of the public field API.
    """
    if getattr(base, "_kind", None) == "GF":
        finite_fields = __import__(
            "sagejs._baselib.finite_fields",
            fromlist=["GF"],
        )
        return finite_fields.GF(_field_order(base) ** degree, "a")
    return _ReferenceExtensionField(base, degree)


def _evaluate_curve_polynomial(polynomial: Any, x_value: Any, field: Any) -> Any:
    answer = field(0)
    for coefficient in reversed(polynomial.list()):
        answer = answer * x_value + _coefficient_in_field(field, coefficient)
    return answer


def _infinity_data(curve: Any, field: Any) -> tuple[Any, Any, bool]:
    f_value, h_value = curve.hyperelliptic_polynomials()
    genus = curve.genus()
    branch_degree = (
        (h_value * h_value + 4 * f_value).degree()
        if _field_characteristic(field) != 2
        else max(f_value.degree(), 2 * h_value.degree())
    )
    if branch_degree == 2 * genus + 1:
        return field(0), field(0), True
    f_leading = f_value[2 * genus + 2]
    h_leading = h_value[genus + 1]
    return (
        _coefficient_in_field(field, h_leading),
        _coefficient_in_field(field, f_leading),
        False,
    )


def _infinity_count(curve: Any, field: Any) -> int:
    linear, constant, unique = _infinity_data(curve, field)
    if unique:
        return 1
    return _count_quadratic_solutions(field, linear, constant)


def infinity_values(curve: Any) -> list[Any]:
    field = curve.base_ring()
    linear, constant, unique = _infinity_data(curve, field)
    if unique:
        return [field(0)]
    return [
        value
        for value in _sage_field_elements(field)
        if value * value + linear * value == constant
    ]


def exhaustive_cardinality(curve: Any, extension_degree: int = 1) -> int:
    """Count points directly over one finite extension."""
    base = curve.base_ring()
    if getattr(base, "_kind", None) not in ["GF", "GF_EXTENSION"]:
        raise TypeError("exhaustive point counting requires a finite field")
    if extension_degree < 1:
        raise ValueError("extension_degree must be positive")
    field: Any = base
    if extension_degree > 1:
        field = _extension_field_for_counting(base, extension_degree)
    order = _field_order(field)
    if order > MAX_EXHAUSTIVE_FIELD_ORDER:
        raise ValueError(
            "the exhaustive reference field is too large (order " + str(order) + ")"
        )
    f_value, h_value = curve.hyperelliptic_polynomials()
    count = _infinity_count(curve, field)
    elements = (
        list(field)
        if isinstance(field, _ReferenceExtensionField)
        else _sage_field_elements(field)
    )
    for x_value in elements:
        f_at_x = _evaluate_curve_polynomial(f_value, x_value, field)
        h_at_x = _evaluate_curve_polynomial(h_value, x_value, field)
        count += _count_quadratic_solutions(field, h_at_x, f_at_x)
    return count


def rational_points(curve: Any) -> list[Any]:
    """Enumerate all rational points over a modest finite base field."""
    field = curve.base_ring()
    if getattr(field, "_kind", None) not in ["GF", "GF_EXTENSION"]:
        raise TypeError("point enumeration requires a finite field")
    if _field_order(field) > 4096:
        raise ValueError("the finite field is too large to enumerate points")
    answer = [curve([1, value, 0]) for value in infinity_values(curve)]
    elements = _sage_field_elements(field)
    f_value, h_value = curve.hyperelliptic_polynomials()
    for x_value in elements:
        f_at_x = _evaluate_curve_polynomial(f_value, x_value, field)
        h_at_x = _evaluate_curve_polynomial(h_value, x_value, field)
        for y_value in elements:
            if y_value * y_value + h_at_x * y_value == f_at_x:
                answer.append(curve([x_value, y_value]))
    return answer


def _power_sum(coefficients: list[int], degree: int, known: list[int]) -> int:
    polynomial_degree = len(coefficients) - 1
    limit = min(degree - 1, polynomial_degree)
    total = 0
    for index in range(1, limit + 1):
        total += coefficients[index] * known[degree - index]
    if degree <= polynomial_degree:
        total += degree * coefficients[degree]
    return -total


def cardinality_from_lpolynomial(
    q_value: int,
    coefficients: list[int],
    extension_degree: int,
) -> int:
    """Derive `#C(F_(q^n))` from an exact Euler numerator."""
    if extension_degree < 1:
        raise ValueError("extension_degree must be positive")
    sums = [0]
    for degree in range(1, extension_degree + 1):
        sums.append(_power_sum(coefficients, degree, sums))
    return q_value**extension_degree + 1 - sums[extension_degree]


def _validate_lpolynomial(
    q_value: int,
    genus: int,
    coefficients: list[int],
    point_counts: list[int],
) -> None:
    if len(coefficients) != 2 * genus + 1 or coefficients[0] != 1:
        raise ArithmeticError("invalid local L-polynomial degree or constant term")
    if coefficients[-1] != q_value**genus:
        raise ArithmeticError("invalid local L-polynomial leading coefficient")
    for index in range(genus):
        if (
            coefficients[2 * genus - index]
            != q_value ** (genus - index) * coefficients[index]
        ):
            raise ArithmeticError("local L-polynomial is not reciprocal")
    for index in range(1, genus + 1):
        binomial = 1
        for factor in range(1, index + 1):
            binomial = binomial * (2 * genus - factor + 1) // factor
        coefficient = coefficients[index]
        if index % 2 == 0:
            if abs(coefficient) > binomial * q_value ** (index // 2):
                raise ArithmeticError("local L-polynomial violates the Weil bound")
        elif coefficient * coefficient > binomial * binomial * q_value**index:
            raise ArithmeticError("local L-polynomial violates the Weil bound")
    for degree, expected in enumerate(point_counts, start=1):
        observed = cardinality_from_lpolynomial(q_value, coefficients, degree)
        if observed != expected:
            raise ArithmeticError("Newton reconstruction failed its point-count check")
    if sum(coefficients) <= 0:
        raise ArithmeticError("the reconstructed Jacobian order is not positive")


def reference_lpolynomial_coefficients(curve: Any) -> list[int]:
    """Reconstruct the full Euler numerator from the first `g` point counts."""
    base = curve.base_ring()
    if getattr(base, "_kind", None) not in ["GF", "GF_EXTENSION"]:
        raise TypeError("Frobenius reconstruction requires a finite field")
    genus = curve.genus()
    q_value = _field_order(base)
    point_counts = [
        exhaustive_cardinality(curve, degree) for degree in range(1, genus + 1)
    ]
    independent = [1]
    power_sums = [0]
    for degree, count in enumerate(point_counts, start=1):
        power_sums.append(q_value**degree + 1 - count)
        numerator = 0
        for index in range(1, degree + 1):
            numerator += independent[degree - index] * power_sums[index]
        if numerator % degree != 0:
            raise ArithmeticError("Newton identity did not divide exactly")
        independent.append(-(numerator // degree))

    coefficients = [0 for _index in range(2 * genus + 1)]
    for index in range(genus + 1):
        coefficients[index] = independent[index]
    for index in range(genus):
        coefficients[2 * genus - index] = (
            q_value ** (genus - index) * independent[index]
        )
    _validate_lpolynomial(q_value, genus, coefficients, point_counts)
    return coefficients


def lpolynomial(coefficients: list[int]) -> Any:
    global _lpolynomial_ring_cache
    if _lpolynomial_ring_cache is runtime.undefined:
        _lpolynomial_ring_cache = sage.PolynomialRing(sage.ZZ, "T")
    return _lpolynomial_ring_cache(coefficients)


def _packed_lpolynomial(coefficients: Any) -> Any:
    """Return a genuine public `ZZ[T]` polynomial with packed lazy storage.

    Exact polynomial construction normally publishes a sealed FLINT resource.
    That is the right representation for arithmetic, but allocating one
    resource for every row in a research stream overwhelms the already-packed
    smalljac traversal.  A local factor is only degree four or six, and most
    stream consumers first inspect coefficients.  Keep those exact integers in
    the ordinary public polynomial's packed storage until an operation actually
    needs its FLINT resource.

    The private baselib constructor is a representation boundary, not a second
    polynomial type: callers still receive the standard `PolynomialElement`,
    with the standard parent and exact behavior.  CPython and hosts without the
    packed baselib representation retain the ordinary constructor fallback.
    """
    global _lpolynomial_ring_cache
    global _polynomial_module_cache
    if _lpolynomial_ring_cache is runtime.undefined:
        _lpolynomial_ring_cache = sage.PolynomialRing(sage.ZZ, "T")
    values = [runtime.integer_bigint(value) for value in coefficients]
    try:
        if _polynomial_module_cache is runtime.undefined:
            _polynomial_module_cache = __import__(
                "sagejs._baselib.polynomial",
                fromlist=["PolynomialElement"],
            )
        storage = _polynomial_module_cache._PackedIntegerPolynomialStorage(
            runtime.integer_buffer(values, 1)
        )
        return _polynomial_module_cache.PolynomialElement(
            _lpolynomial_ring_cache, storage
        )
    except (ImportError, AttributeError):
        return _lpolynomial_ring_cache(values)


def frobenius_polynomial(coefficients: list[int]) -> Any:
    global _frobenius_ring_cache
    if _frobenius_ring_cache is runtime.undefined:
        _frobenius_ring_cache = sage.PolynomialRing(sage.ZZ, "x")
    return _frobenius_ring_cache(list(reversed(coefficients)))


def zeta_function(q_value: int, coefficients: list[int]) -> Any:
    global _zeta_ring_cache
    if _zeta_ring_cache is runtime.undefined:
        _zeta_ring_cache = sage.PolynomialRing(sage.QQ, "x")
    ring = _zeta_ring_cache
    fraction_field = ring.fraction_field()
    numerator = fraction_field(ring(coefficients))
    denominator = fraction_field(ring([1, -(q_value + 1), q_value]))
    return numerator / denominator


def _reduce_rational_coefficient(field: Any, value: Any, prime: int) -> Any:
    denominator = getattr(value, "_denominator", 1)
    if int(denominator) % prime == 0:
        raise ArithmeticError("the curve model is not integral at this prime")
    return field(value)


def _checked_prime(prime: Any) -> int:
    original_prime = prime
    prime = int(original_prime)
    if prime != original_prime:
        raise ValueError("p must be prime")
    if prime < 2 or not sage.is_prime(prime):
        raise ValueError("p must be prime")
    return prime


def _rational_reduction(curve: Any, prime: int) -> Any:
    """Return the checked reduction of one rational model."""
    finite_fields = __import__(
        "sagejs._baselib.finite_fields",
        fromlist=["GF"],
    )
    field = finite_fields.GF(prime)
    f_value, h_value = curve.hyperelliptic_polynomials()
    ring = sage.PolynomialRing(field, f_value.parent().variable_name())
    reduced_f = ring(
        [_reduce_rational_coefficient(field, value, prime) for value in f_value.list()]
    )
    reduced_h = ring(
        [_reduce_rational_coefficient(field, value, prime) for value in h_value.list()]
    )
    model = __import__(
        "sagejs.hyperelliptic_curves.model",
        fromlist=["HyperellipticCurve_generic"],
    )
    try:
        return model.HyperellipticCurve_generic(reduced_f, reduced_h)
    except ValueError as error:
        raise ArithmeticError("the curve has bad reduction at " + str(prime)) from error


def _rational_smalljac_supported(curve: Any, start: int, stop: int) -> bool:
    return (
        _smalljac_capabilities() is not None
        and curve.genus() == 2
        and start >= 3
        and stop >= start
        and runtime.integer_bigint(stop) <= _smalljac_prime_bound()
    )


def _rational_rforest_supported(curve: Any, start: int, stop: int) -> bool:
    if curve.genus() != 3:
        return False
    certified = __import__(
        "sagejs.hyperelliptic_curves.certified_genus3",
        fromlist=["rforest_genus3_auto_supported"],
    )
    return bool(certified.rforest_genus3_auto_supported(curve, start, stop))


def _select_rational_algorithm(
    curve: Any, algorithm: str, start: int, stop: int
) -> str:
    if algorithm == "auto":
        if _rational_smalljac_supported(curve, start, stop):
            return "smalljac"
        if _rational_rforest_supported(curve, start, stop):
            return "rforest"
        return "exhaustive"
    if algorithm == "smalljac":
        if _smalljac_capabilities() is None:
            raise NotImplementedError(
                "the native smalljac L-polynomial backend is unavailable"
            )
        if curve.genus() != 2:
            raise NotImplementedError(
                "smalljac full L-polynomials are only supported in genus 2"
            )
        if start < 3:
            raise NotImplementedError(
                "smalljac L-polynomials require odd primes; use exhaustive at 2"
            )
        if runtime.integer_bigint(stop) > _smalljac_prime_bound():
            raise OverflowError("the prime interval exceeds the smalljac range")
        return "smalljac"
    if algorithm == "rforest":
        if curve.genus() != 3:
            raise NotImplementedError(
                "certified rforest local polynomials are only supported in genus 3"
            )
        return "rforest"
    if algorithm == "exhaustive" or algorithm in _LPOLYNOMIAL_BACKENDS:
        return algorithm
    raise ValueError("unknown hyperelliptic L-polynomial algorithm " + repr(algorithm))


def _local_cache(curve: Any) -> dict[tuple[str, int], list[int]]:
    cache = getattr(curve, "_local_lpolynomial_cache", None)
    if cache is None:
        raise RuntimeError("the hyperelliptic curve has no local-factor cache")
    return cache


def _cached_local_coefficients(
    curve: Any, prime: int, algorithm: str
) -> list[int] | None:
    cached = _local_cache(curve).get((algorithm, prime))
    return None if cached is None else list(cached)


def _store_local_coefficients(
    curve: Any, prime: int, algorithm: str, coefficients: list[int]
) -> None:
    _local_cache(curve)[(algorithm, prime)] = list(coefficients)


def rational_local_lpolynomial(curve: Any, prime: Any, algorithm: str = "auto") -> Any:
    """Compute one good local factor over `QQ`.

    `auto` uses the native genus-2 smalljac stream and the measured certified
    odd-degree genus-3 rforest pipeline where their complete capability checks
    pass. Other inputs retain exact exhaustive reduction and counting.
    """
    prime = _checked_prime(prime)
    selected = _select_rational_algorithm(curve, algorithm, prime, prime)
    cached = _cached_local_coefficients(curve, prime, selected)
    if cached is not None:
        return lpolynomial(cached)

    if selected == "smalljac":
        data = rational_smalljac_model(curve)
        if int(data["excluded_denominator"]) % prime == 0:
            raise ArithmeticError("the curve model is not integral at this prime")
        rows, truncated = _smalljac_rows(data["curve_text"], prime, prime, 1)
        if truncated or len(rows) != 1 or rows[0][0] != prime:
            raise RuntimeError("smalljac did not return the requested prime")
        coefficients = rows[0][1]
        if coefficients is None:
            raise ArithmeticError("the curve has bad reduction at " + str(prime))
    elif selected == "rforest":
        certified = __import__(
            "sagejs.hyperelliptic_curves.certified_genus3",
            fromlist=["rforest_genus3_local_factor"],
        )
        result = certified.rforest_genus3_local_factor(curve, prime)
        coefficients = list(result["coefficients"])
    else:
        reduced_curve = _rational_reduction(curve, prime)
        coefficients = reduced_curve._lpolynomial_coefficients(selected)
    _store_local_coefficients(curve, prime, selected, coefficients)
    return lpolynomial(coefficients)


def _checked_interval(start: Any, stop: Any, chunk_size: Any) -> tuple[int, int, int]:
    original_start = start
    original_stop = stop
    original_chunk_size = chunk_size
    start = int(original_start)
    stop = int(original_stop)
    chunk_size = int(original_chunk_size)
    if start != original_start or stop != original_stop:
        raise ValueError("prime interval bounds must be integers")
    if chunk_size != original_chunk_size or chunk_size < 1:
        raise ValueError("chunk_size must be a positive integer")
    if start < 2 or stop < start:
        raise ValueError("prime interval must be a nonempty closed interval from 2")
    return start, stop, min(chunk_size, MAX_LOCAL_FACTOR_CHUNK_SIZE)


def rational_local_coefficient_chunks(
    curve: Any,
    start: Any,
    stop: Any,
    algorithm: str = "auto",
    chunk_size: Any = 100_000,
) -> Iterator[list[Any]]:
    """Yield bounded chunks of exact good local-factor coefficient rows.

    Each row is the immutable triple `(p, coefficients, backend)`, with exact
    ascending coefficients and the backend which actually produced them.  No
    public polynomial is constructed, and this traversal does not populate the
    curve's result cache.  It is the packed internal contract for statistics,
    Euler products, and analytic `L`-function coefficient consumers.

    The interval is closed. Bad-reduction primes and primes excluded by the
    checked rational-to-integral transformation are deliberately omitted.
    """
    start, stop, chunk_size = _checked_interval(start, stop, chunk_size)
    native_after_two = (
        algorithm == "auto"
        and start == 2
        and _rational_smalljac_supported(curve, 3, stop)
    )
    selected = _select_rational_algorithm(
        curve, algorithm, 3 if native_after_two else start, stop
    )
    if native_after_two:
        try:
            reduced = _rational_reduction(curve, 2)
            coefficients_at_two = reduced._lpolynomial_coefficients("exhaustive")
        except ArithmeticError:
            pass
        else:
            yield [
                runtime.math_tuple(
                    [
                        sage.ZZ(2),
                        runtime.math_tuple(list(coefficients_at_two)),
                        "exhaustive",
                    ]
                )
            ]
        start = 3
    if selected == "rforest":
        certified = __import__(
            "sagejs.hyperelliptic_curves.certified_genus3",
            fromlist=["rforest_genus3_local_factors"],
        )
        chunk = []
        for prime, result in certified.rforest_genus3_local_factors(curve, start, stop):
            if result["status"] == "omitted":
                continue
            coefficients = list(result["coefficients"])
            backend = "exhaustive" if result["status"] == "fallback" else "rforest"
            chunk.append(
                runtime.math_tuple(
                    [
                        sage.ZZ(prime),
                        runtime.math_tuple(coefficients),
                        backend,
                    ]
                )
            )
            if len(chunk) == chunk_size:
                yield chunk
                chunk = []
        if len(chunk) != 0:
            yield chunk
        return

    if selected != "smalljac":
        chunk = []
        for prime in range(start, stop + 1):
            if not sage.is_prime(prime):
                continue
            try:
                reduced = _rational_reduction(curve, prime)
                coefficients = reduced._lpolynomial_coefficients(selected)
            except ArithmeticError:
                continue
            chunk.append(
                runtime.math_tuple(
                    [
                        sage.ZZ(prime),
                        runtime.math_tuple(list(coefficients)),
                        selected,
                    ]
                )
            )
            if len(chunk) == chunk_size:
                yield chunk
                chunk = []
        if len(chunk) != 0:
            yield chunk
        return

    data = rational_smalljac_model(curve)
    excluded = int(data["excluded_denominator"])
    cursor = start
    while cursor <= stop:
        # Apart from 2, primes are odd.  An inclusive interval containing at
        # most `2*chunk_size-1` integers therefore contains at most
        # `chunk_size` primes.  Split by value rather than repeatedly asking a
        # truncated smalljac traversal to scan the entire remaining suffix.
        window_stop = min(stop, cursor + 2 * chunk_size - 2)
        rows, truncated = _smalljac_rows(data["curve_text"], cursor, window_stop, 0)
        if truncated:
            raise RuntimeError("an unbounded smalljac window was truncated")
        output = []
        for prime, coefficients in rows:
            if excluded % prime == 0 or coefficients is None:
                continue
            output.append(
                runtime.math_tuple(
                    [
                        sage.ZZ(prime),
                        runtime.math_tuple(coefficients),
                        "smalljac",
                    ]
                )
            )
        if len(output) != 0:
            yield output
        cursor = window_stop + 1


def rational_local_lpolynomial_chunks(
    curve: Any,
    start: Any,
    stop: Any,
    algorithm: str = "auto",
    chunk_size: Any = 100_000,
) -> Iterator[list[Any]]:
    """Yield bounded ordered chunks of good `(p, L_p(T))` pairs.

    The coefficient stream remains canonical until this explicit public
    polynomial boundary.  Published factors are ordinary `PolynomialElement`
    instances backed by exact packed coefficients, so indexing, formatting,
    and coefficient statistics do not allocate one FLINT resource per row.
    """
    checked_start, checked_stop, _checked_chunk = _checked_interval(
        start, stop, chunk_size
    )
    native_after_two = (
        algorithm == "auto"
        and checked_start == 2
        and _rational_smalljac_supported(curve, 3, checked_stop)
    )
    selected = _select_rational_algorithm(
        curve,
        algorithm,
        3 if native_after_two else checked_start,
        checked_stop,
    )
    cache_remaining = max(
        0,
        MAX_LOCAL_FACTOR_STREAM_CACHE_SIZE - len(_local_cache(curve)),
    )
    for coefficient_chunk in rational_local_coefficient_chunks(
        curve, start, stop, algorithm, chunk_size
    ):
        output = []
        for prime, coefficients, _backend in coefficient_chunk:
            prime_value = int(prime)
            cache_algorithm = (
                "exhaustive" if native_after_two and prime_value == 2 else selected
            )
            values = list(coefficients)
            if cache_remaining > 0:
                _store_local_coefficients(curve, prime_value, cache_algorithm, values)
                cache_remaining -= 1
            output.append(runtime.math_tuple([prime, _packed_lpolynomial(values)]))
        if len(output) != 0:
            yield output


def rational_local_lpolynomials(
    curve: Any,
    start: Any,
    stop: Any,
    algorithm: str = "auto",
    chunk_size: Any = 100_000,
) -> list[Any]:
    """Return good local factors in the closed interval `[start, stop]`."""
    answer = []
    for chunk in rational_local_lpolynomial_chunks(
        curve, start, stop, algorithm, chunk_size
    ):
        answer.extend(chunk)
    return answer
