"""Exact, storage-neutral contracts for commutative Gröbner bases.

The production Sage.js backends use packed msolve/FLINT representations.  This
module is the deliberately small ordinary-Python oracle that defines their
mathematical contract.  It is independent of FLINT and msolve memory layouts,
works unchanged in CPython, and records complete transformation provenance.

A polynomial is a tuple of `(coefficient, exponent_vector)` terms.  Prime
field coefficients are integers; rational coefficients are `(numerator,
denominator)` pairs.  Terms are canonical, nonzero, and sorted from greatest
to least in the selected global monomial order.

The reference Buchberger implementation is intentionally for verification and
small fallbacks, not a replacement for msolve's F4 engine.  In particular, a
proof certificate contains a matrix `T` satisfying `G = T F`.  The verifier
also checks reverse ideal inclusion, every Buchberger S-pair, monicity, and
reducedness.  Merely checking that the inputs and S-pairs reduce to zero is not
an ideal-equality proof.
"""

from __future__ import annotations

from typing import Any, Iterable, TypeAlias

Exponent: TypeAlias = tuple[int, ...]
Rational: TypeAlias = tuple[int, int]
Coefficient: TypeAlias = int | Rational
Term: TypeAlias = tuple[Coefficient, Exponent]
Polynomial: TypeAlias = tuple[Term, ...]
Transformation: TypeAlias = tuple[tuple[Polynomial, ...], ...]

SUPPORTED_ORDERS = ("lex", "deglex", "degrevlex")
PACKED_ABI = "sagejs.groebner.sparse/v1"


class GroebnerRing:
    """Exact coefficient and monomial-order metadata for the packed contract."""

    def __init__(
        self,
        variables: int,
        order: str = "degrevlex",
        characteristic: int = 0,
    ) -> None:
        if not isinstance(variables, int) or variables <= 0:
            raise ValueError("a polynomial ring needs a positive variable count")
        if order not in SUPPORTED_ORDERS:
            raise ValueError("unsupported global monomial order: " + str(order))
        if not isinstance(characteristic, int) or characteristic < 0:
            raise ValueError("characteristic must be a nonnegative integer")
        if characteristic == 1:
            raise ValueError("characteristic one is not a field")
        self.variables = variables
        self.order = order
        self.characteristic = characteristic
        # Packed v1 remains specialized. Generic v2 supplies an actual field
        # adapter and a budget, while sharing only the monomial algorithms.
        self.coefficient_field: Any = None
        self.budget: Any = None

    @property
    def domain(self) -> str:
        return "QQ" if self.characteristic == 0 else "GF(p)"

    def descriptor(self) -> dict[str, Any]:
        """Return stable JSON-compatible metadata for dispatch receipts."""
        return {
            "abi": PACKED_ABI,
            "domain": self.domain,
            "characteristic": self.characteristic,
            "variables": self.variables,
            "order": self.order,
        }


class GroebnerVerification:
    """Inspectable result of exact candidate certification."""

    def __init__(
        self,
        ideal_containment: bool,
        reverse_containment: bool,
        buchberger: bool,
        reduced: bool,
    ) -> None:
        self.ideal_containment = ideal_containment
        self.reverse_containment = reverse_containment
        self.buchberger = buchberger
        self.reduced = reduced

    @property
    def valid(self) -> bool:
        return (
            self.ideal_containment
            and self.reverse_containment
            and self.buchberger
            and self.reduced
        )

    def descriptor(self) -> dict[str, bool]:
        return {
            "valid": self.valid,
            "ideal_containment": self.ideal_containment,
            "reverse_containment": self.reverse_containment,
            "buchberger": self.buchberger,
            "reduced": self.reduced,
        }


REFERENCE_CAPABILITY: dict[str, Any] = {
    "id": "python:groebner-reference-with-provenance-v1",
    "abi": PACKED_ABI,
    "domains": ["QQ", "GF(p)"],
    "orders": list(SUPPORTED_ORDERS),
    "operations": [
        "reduced_basis",
        "leading_ideal",
        "normal_form",
        "change_matrix",
        "verify",
    ],
    "proof": "deterministic-exact",
    "role": "small fallback and independent oracle",
}

MSOLVE_F4_CAPABILITY: dict[str, Any] = {
    "id": "msolve:f4-prime-field-v1",
    "abi": PACKED_ABI,
    "domains": ["GF(p), p < 2^31"],
    "orders": ["degrevlex"],
    "operations": ["reduced_basis", "leading_ideal", "normal_form"],
    "proof": "candidate-requires-independent-verification",
}

MSOLVE_QQ_CAPABILITY: dict[str, Any] = {
    "id": "msolve:modular-qq-v1",
    "abi": PACKED_ABI,
    "domains": ["QQ"],
    "orders": ["degrevlex"],
    "operations": ["reduced_basis", "leading_ideal", "normal_form"],
    "proof": "candidate-requires-independent-verification",
}


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _modular_inverse(value: int, modulus: int) -> int:
    """Return the inverse without relying on host three-argument `pow`."""
    value %= modulus
    old_remainder, remainder = modulus, value
    old_coefficient, coefficient = 0, 1
    while remainder:
        quotient = old_remainder // remainder
        old_remainder, remainder = remainder, old_remainder - quotient * remainder
        old_coefficient, coefficient = (
            coefficient,
            old_coefficient - quotient * coefficient,
        )
    if old_remainder != 1:
        raise ZeroDivisionError("coefficient is not invertible")
    return old_coefficient % modulus


def _coefficient(value: Coefficient, ring: GroebnerRing) -> Coefficient:
    if ring.coefficient_field is not None:
        ring.budget.charge()
        return ring.coefficient_field.coerce(value)
    if ring.characteristic:
        if isinstance(value, tuple):
            numerator, denominator = value
            return (
                (numerator % ring.characteristic)
                * _modular_inverse(
                    denominator % ring.characteristic, ring.characteristic
                )
                % ring.characteristic
            )
        return int(value) % ring.characteristic
    if isinstance(value, tuple):
        numerator, denominator = value
    else:
        numerator, denominator = int(value), 1
    if denominator == 0:
        raise ZeroDivisionError("rational coefficient denominator is zero")
    if denominator < 0:
        numerator = -numerator
        denominator = -denominator
    divisor = _gcd(numerator, denominator)
    return (numerator // divisor, denominator // divisor)


def _zero(ring: GroebnerRing) -> Coefficient:
    if ring.coefficient_field is not None:
        return ring.coefficient_field.zero()
    return 0 if ring.characteristic else (0, 1)


def _one(ring: GroebnerRing) -> Coefficient:
    if ring.coefficient_field is not None:
        return ring.coefficient_field.one()
    return 1 if ring.characteristic else (1, 1)


def _prime_coefficient(value: Coefficient) -> int:
    if isinstance(value, tuple):
        raise TypeError("prime-field coefficient was not normalized")
    return value


def _coefficient_add(
    left: Coefficient, right: Coefficient, ring: GroebnerRing
) -> Coefficient:
    if ring.coefficient_field is not None:
        ring.budget.charge()
        return ring.coefficient_field.add(left, right)
    if ring.characteristic:
        return (
            _prime_coefficient(left) + _prime_coefficient(right)
        ) % ring.characteristic
    left_q = _coefficient(left, ring)
    right_q = _coefficient(right, ring)
    assert isinstance(left_q, tuple) and isinstance(right_q, tuple)
    return _coefficient(
        (left_q[0] * right_q[1] + right_q[0] * left_q[1], left_q[1] * right_q[1]),
        ring,
    )


def _coefficient_negate(value: Coefficient, ring: GroebnerRing) -> Coefficient:
    if ring.coefficient_field is not None:
        ring.budget.charge()
        return ring.coefficient_field.negate(value)
    if ring.characteristic:
        return (-_prime_coefficient(value)) % ring.characteristic
    rational = _coefficient(value, ring)
    assert isinstance(rational, tuple)
    return (-rational[0], rational[1])


def _coefficient_multiply(
    left: Coefficient, right: Coefficient, ring: GroebnerRing
) -> Coefficient:
    if ring.coefficient_field is not None:
        ring.budget.charge()
        return ring.coefficient_field.multiply(left, right)
    if ring.characteristic:
        return (
            _prime_coefficient(left) * _prime_coefficient(right)
        ) % ring.characteristic
    left_q = _coefficient(left, ring)
    right_q = _coefficient(right, ring)
    assert isinstance(left_q, tuple) and isinstance(right_q, tuple)
    return _coefficient((left_q[0] * right_q[0], left_q[1] * right_q[1]), ring)


def _coefficient_inverse(value: Coefficient, ring: GroebnerRing) -> Coefficient:
    if ring.coefficient_field is not None:
        ring.budget.charge()
        return ring.coefficient_field.inverse(value)
    value = _coefficient(value, ring)
    if value == _zero(ring):
        raise ZeroDivisionError("division by zero coefficient")
    if ring.characteristic:
        return _modular_inverse(_prime_coefficient(value), ring.characteristic)
    assert isinstance(value, tuple)
    return _coefficient((value[1], value[0]), ring)


def _coefficient_divide(
    left: Coefficient, right: Coefficient, ring: GroebnerRing
) -> Coefficient:
    return _coefficient_multiply(left, _coefficient_inverse(right, ring), ring)


def _compare_monomials(left: Exponent, right: Exponent, ring: GroebnerRing) -> int:
    if ring.budget is not None:
        ring.budget.charge()
    if ring.order != "lex":
        degree_difference = sum(left) - sum(right)
        if degree_difference:
            return 1 if degree_difference > 0 else -1
    if ring.order == "degrevlex":
        for index in range(ring.variables - 1, -1, -1):
            if left[index] != right[index]:
                return 1 if left[index] < right[index] else -1
        return 0
    for index in range(ring.variables):
        if left[index] != right[index]:
            return 1 if left[index] > right[index] else -1
    return 0


def _sort_terms(terms: list[Term], ring: GroebnerRing) -> list[Term]:
    # Insertion sort keeps this oracle independent of host-specific comparator
    # adapters and is entirely adequate for its deliberately small workloads.
    answer: list[Term] = []
    for term in terms:
        position = 0
        while (
            position < len(answer)
            and _compare_monomials(answer[position][1], term[1], ring) > 0
        ):
            position += 1
        answer.insert(position, term)
    return answer


def canonical_polynomial(terms: Iterable[Term], ring: GroebnerRing) -> Polynomial:
    """Combine like terms and return canonical descending sparse storage."""
    combined: dict[Exponent, Coefficient] = {}
    for raw_coefficient, raw_exponents in terms:
        if ring.budget is not None:
            ring.budget.check_exponents(raw_exponents, ring.variables)
        exponents = tuple(int(value) for value in raw_exponents)
        if len(exponents) != ring.variables or any(value < 0 for value in exponents):
            raise ValueError("invalid multivariate exponent vector")
        coefficient = _coefficient(raw_coefficient, ring)
        if coefficient == _zero(ring):
            continue
        # The coefficient is already normalized. Only duplicate monomials
        # need addition; adding a first coefficient to zero otherwise creates
        # an unnecessary foreign-field resource on every canonicalization.
        if exponents in combined:
            combined[exponents] = _coefficient_add(
                combined[exponents], coefficient, ring
            )
        else:
            combined[exponents] = coefficient
        if ring.budget is not None:
            ring.budget.check_terms(len(combined))
    return tuple(
        _sort_terms(
            [
                (coefficient, exponents)
                for exponents, coefficient in combined.items()
                if coefficient != _zero(ring)
            ],
            ring,
        )
    )


def polynomial_add(
    left: Polynomial, right: Polynomial, ring: GroebnerRing
) -> Polynomial:
    return canonical_polynomial(tuple(left) + tuple(right), ring)


def polynomial_negate(source: Polynomial, ring: GroebnerRing) -> Polynomial:
    return canonical_polynomial(
        (
            (_coefficient_negate(coefficient, ring), exponents)
            for coefficient, exponents in source
        ),
        ring,
    )


def polynomial_subtract(
    left: Polynomial, right: Polynomial, ring: GroebnerRing
) -> Polynomial:
    return polynomial_add(left, polynomial_negate(right, ring), ring)


def monomial_multiply(
    source: Polynomial,
    coefficient: Coefficient,
    exponents: Exponent,
    ring: GroebnerRing,
) -> Polynomial:
    coefficient = _coefficient(coefficient, ring)
    return canonical_polynomial(
        (
            (
                _coefficient_multiply(coefficient, term_coefficient, ring),
                tuple(
                    term_exponents[index] + exponents[index]
                    for index in range(ring.variables)
                ),
            )
            for term_coefficient, term_exponents in source
        ),
        ring,
    )


def polynomial_multiply(
    left: Polynomial, right: Polynomial, ring: GroebnerRing
) -> Polynomial:
    terms: list[Term] = []
    for coefficient, exponents in right:
        if ring.budget is not None:
            ring.budget.check_terms(len(terms) + len(left))
        terms.extend(monomial_multiply(left, coefficient, exponents, ring))
    return canonical_polynomial(terms, ring)


def _divides(left: Exponent, right: Exponent) -> bool:
    return all(left[index] <= right[index] for index in range(len(left)))


def _quotient_exponent(dividend: Exponent, divisor: Exponent) -> Exponent:
    return tuple(dividend[index] - divisor[index] for index in range(len(dividend)))


def normal_form_with_quotients(
    source: Polynomial,
    basis: Iterable[Polynomial],
    ring: GroebnerRing,
) -> tuple[tuple[Polynomial, ...], Polynomial]:
    """Return multivariate division quotients and exact normal form."""
    divisors = tuple(canonical_polynomial(value, ring) for value in basis)
    quotients: list[Polynomial] = [tuple() for _value in divisors]
    pending = canonical_polynomial(source, ring)
    remainder: Polynomial = tuple()
    while pending:
        coefficient, exponents = pending[0]
        reduced = False
        for index, divisor in enumerate(divisors):
            if not divisor or not _divides(divisor[0][1], exponents):
                continue
            quotient_coefficient = _coefficient_divide(coefficient, divisor[0][0], ring)
            quotient_exponents = _quotient_exponent(exponents, divisor[0][1])
            quotient_term = canonical_polynomial(
                ((quotient_coefficient, quotient_exponents),), ring
            )
            quotients[index] = polynomial_add(quotients[index], quotient_term, ring)
            pending = polynomial_subtract(
                pending,
                monomial_multiply(
                    divisor, quotient_coefficient, quotient_exponents, ring
                ),
                ring,
            )
            reduced = True
            break
        if not reduced:
            leading = canonical_polynomial((pending[0],), ring)
            remainder = polynomial_add(remainder, leading, ring)
            pending = polynomial_subtract(pending, leading, ring)
    return tuple(quotients), remainder


def normal_form(
    source: Polynomial, basis: Iterable[Polynomial], ring: GroebnerRing
) -> Polynomial:
    return normal_form_with_quotients(source, basis, ring)[1]


def _s_data(
    left: Polynomial, right: Polynomial, ring: GroebnerRing
) -> tuple[Coefficient, Exponent, Coefficient, Exponent]:
    lcm = tuple(max(left[0][1][i], right[0][1][i]) for i in range(ring.variables))
    return (
        _coefficient_inverse(left[0][0], ring),
        _quotient_exponent(lcm, left[0][1]),
        _coefficient_inverse(right[0][0], ring),
        _quotient_exponent(lcm, right[0][1]),
    )


def s_polynomial(left: Polynomial, right: Polynomial, ring: GroebnerRing) -> Polynomial:
    left_coefficient, left_exponents, right_coefficient, right_exponents = _s_data(
        left, right, ring
    )
    return polynomial_subtract(
        monomial_multiply(left, left_coefficient, left_exponents, ring),
        monomial_multiply(right, right_coefficient, right_exponents, ring),
        ring,
    )


def _zero_row(width: int) -> list[Polynomial]:
    return [tuple() for _index in range(width)]


def _row_add(
    left: list[Polynomial], right: list[Polynomial], ring: GroebnerRing
) -> list[Polynomial]:
    return [polynomial_add(left[i], right[i], ring) for i in range(len(left))]


def _row_negate(source: list[Polynomial], ring: GroebnerRing) -> list[Polynomial]:
    return [polynomial_negate(value, ring) for value in source]


def _row_monomial_multiply(
    source: list[Polynomial],
    coefficient: Coefficient,
    exponents: Exponent,
    ring: GroebnerRing,
) -> list[Polynomial]:
    return [monomial_multiply(value, coefficient, exponents, ring) for value in source]


def _make_monic_with_row(
    polynomial: Polynomial,
    row: list[Polynomial],
    ring: GroebnerRing,
) -> tuple[Polynomial, list[Polynomial]]:
    scale = _coefficient_inverse(polynomial[0][0], ring)
    zero_exponents = tuple(0 for _index in range(ring.variables))
    return (
        monomial_multiply(polynomial, scale, zero_exponents, ring),
        _row_monomial_multiply(row, scale, zero_exponents, ring),
    )


def groebner_basis_reference(
    generators: Iterable[Polynomial], ring: GroebnerRing
) -> tuple[tuple[Polynomial, ...], Transformation]:
    """Compute a reduced basis and a complete exact change matrix.

    This is deterministic Buchberger with the first applicable reducer.  It is
    intended for small fallbacks, certification, and differential oracles.
    """
    input_list = []
    for value in generators:
        if ring.budget is not None:
            ring.budget.check_generators(len(input_list) + 1)
        input_list.append(canonical_polynomial(value, ring))
    inputs = tuple(input_list)
    basis: list[Polynomial] = []
    rows: list[list[Polynomial]] = []
    zero_exponents = tuple(0 for _index in range(ring.variables))
    one_polynomial = canonical_polynomial(((_one(ring), zero_exponents),), ring)
    for input_index, value in enumerate(inputs):
        if not value:
            continue
        row = _zero_row(len(inputs))
        row[input_index] = one_polynomial
        value, row = _make_monic_with_row(value, row, ring)
        basis.append(value)
        rows.append(row)

    if ring.budget is not None:
        ring.budget.check_pairs(len(basis) * (len(basis) - 1) // 2)
    pairs = [(left, right) for right in range(len(basis)) for left in range(right)]
    cursor = 0
    while cursor < len(pairs):
        left_index, right_index = pairs[cursor]
        cursor += 1
        left_coefficient, left_exponents, right_coefficient, right_exponents = _s_data(
            basis[left_index], basis[right_index], ring
        )
        source = polynomial_subtract(
            monomial_multiply(
                basis[left_index], left_coefficient, left_exponents, ring
            ),
            monomial_multiply(
                basis[right_index], right_coefficient, right_exponents, ring
            ),
            ring,
        )
        source_row = _row_add(
            _row_monomial_multiply(
                rows[left_index], left_coefficient, left_exponents, ring
            ),
            _row_negate(
                _row_monomial_multiply(
                    rows[right_index], right_coefficient, right_exponents, ring
                ),
                ring,
            ),
            ring,
        )
        quotients, remainder = normal_form_with_quotients(source, basis, ring)
        for index, quotient in enumerate(quotients):
            source_row = _row_add(
                source_row,
                _row_negate(
                    [
                        polynomial_multiply(quotient, value, ring)
                        for value in rows[index]
                    ],
                    ring,
                ),
                ring,
            )
        if not remainder:
            continue
        remainder, source_row = _make_monic_with_row(remainder, source_row, ring)
        new_index = len(basis)
        if ring.budget is not None:
            ring.budget.check_pairs(len(pairs) + new_index)
        for old_index in range(new_index):
            pairs.append((old_index, new_index))
        basis.append(remainder)
        rows.append(source_row)

    # Remove redundant leading monomials, then reduce every survivor by all
    # other survivors.  A Gröbner basis makes this a canonical reduced basis.
    keep: list[int] = []
    for index, value in enumerate(basis):
        if any(
            other != index
            and _divides(basis[other][0][1], value[0][1])
            and (basis[other][0][1] != value[0][1] or other < index)
            for other in range(len(basis))
        ):
            continue
        keep.append(index)
    reduced_basis: list[Polynomial] = []
    reduced_rows: list[list[Polynomial]] = []
    for position, index in enumerate(keep):
        other_indices = keep[:position] + keep[position + 1 :]
        other_basis = [basis[other] for other in other_indices]
        quotients, remainder = normal_form_with_quotients(
            basis[index], other_basis, ring
        )
        row = list(rows[index])
        for quotient, other_index in zip(quotients, other_indices, strict=True):
            row = _row_add(
                row,
                _row_negate(
                    [
                        polynomial_multiply(quotient, value, ring)
                        for value in rows[other_index]
                    ],
                    ring,
                ),
                ring,
            )
        if remainder:
            remainder, row = _make_monic_with_row(remainder, row, ring)
            reduced_basis.append(remainder)
            reduced_rows.append(row)

    ordering = list(range(len(reduced_basis)))
    for index in range(1, len(ordering)):
        position = index
        while (
            position > 0
            and _compare_monomials(
                reduced_basis[ordering[position - 1]][0][1],
                reduced_basis[ordering[position]][0][1],
                ring,
            )
            < 0
        ):
            ordering[position - 1], ordering[position] = (
                ordering[position],
                ordering[position - 1],
            )
            position -= 1
    return (
        tuple(reduced_basis[index] for index in ordering),
        tuple(tuple(reduced_rows[index]) for index in ordering),
    )


def _linear_combination(
    row: Iterable[Polynomial],
    generators: tuple[Polynomial, ...],
    ring: GroebnerRing,
) -> Polynomial:
    result: Polynomial = tuple()
    for multiplier, generator in zip(row, generators, strict=True):
        result = polynomial_add(
            result, polynomial_multiply(multiplier, generator, ring), ring
        )
    return result


def leading_ideal(
    basis: Iterable[Polynomial], ring: GroebnerRing
) -> tuple[Exponent, ...]:
    """Return the minimal monomial generators of the leading ideal."""
    leading = [canonical_polynomial(value, ring)[0][1] for value in basis if value]
    return tuple(
        value
        for index, value in enumerate(leading)
        if not any(
            other != index and _divides(candidate, value)
            for other, candidate in enumerate(leading)
        )
    )


def verify_groebner_certificate(
    generators: Iterable[Polynomial],
    basis: Iterable[Polynomial],
    transformation: Iterable[Iterable[Polynomial]],
    ring: GroebnerRing,
) -> GroebnerVerification:
    """Verify ideal equality, Buchberger's criterion, and reducedness."""
    inputs = tuple(canonical_polynomial(value, ring) for value in generators)
    candidate = tuple(canonical_polynomial(value, ring) for value in basis)
    rows = tuple(tuple(value for value in row) for row in transformation)
    if any(not value for value in candidate):
        return GroebnerVerification(False, False, False, False)
    ideal_containment = len(rows) == len(candidate) and all(
        len(row) == len(inputs)
        and _linear_combination(row, inputs, ring) == candidate[index]
        for index, row in enumerate(rows)
    )
    reverse_containment = all(
        not normal_form(value, candidate, ring) for value in inputs
    )
    buchberger = all(
        not normal_form(
            s_polynomial(candidate[left], candidate[right], ring), candidate, ring
        )
        for right in range(len(candidate))
        for left in range(right)
    )
    reduced = all(value and value[0][0] == _one(ring) for value in candidate)
    if reduced:
        for index, value in enumerate(candidate):
            if any(
                other != index and _divides(divisor[0][1], value[0][1])
                for other, divisor in enumerate(candidate)
            ):
                reduced = False
                break
            for _coefficient_value, exponents in value[1:]:
                if any(
                    other != index and _divides(divisor[0][1], exponents)
                    for other, divisor in enumerate(candidate)
                ):
                    reduced = False
                    break
            if not reduced:
                break
    return GroebnerVerification(
        ideal_containment, reverse_containment, buchberger, reduced
    )
