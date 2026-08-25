"""Bounded, proof-status-aware unit computations.

This module provides complete algorithms for roots of unity, fields with unit
rank zero, and real quadratic fundamental units.  Higher-rank enumeration is
deliberately returned as a subgroup search: finding independent units is not a
saturation proof.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
from sagejs.number_fields.embeddings import (
    _exact_roots,
    archimedean_data,
    exact_norm_is_unit,
    exact_signature,
)

_ROOTS_OF_UNITY_CERTIFICATE_TOKEN = object()
_ROOTS_OF_UNITY_CERTIFICATE_SCHEMA = (
    "sagejs.number-fields/roots-of-unity-certificate-v1"
)
_MAXIMUM_ROOT_OF_UNITY_PRIME = 10_000
_FAST_ROOT_OF_UNITY_CANDIDATES = 256
_DETACHED_ROOTS_OF_UNITY_MAX_PRIME_RECORDS = 8
_DETACHED_ROOTS_OF_UNITY_MAX_CANDIDATES = 100_000


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value == 2:
        return True
    if value % 2 == 0:
        return False
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def _prime_divisors(value: int) -> tuple[int, ...]:
    value = abs(value)
    answer: list[int] = []
    divisor = 2
    while divisor * divisor <= value:
        if value % divisor == 0:
            answer.append(divisor)
            while value % divisor == 0:
                value //= divisor
        divisor = 3 if divisor == 2 else divisor + 2
    if value > 1:
        answer.append(value)
    return tuple(answer)


def _valuation(value: int, prime: int) -> int:
    exponent = 0
    while value % prime == 0:
        value //= prime
        exponent += 1
    return exponent


def _universal_torsion_prime_powers(degree: int) -> tuple[tuple[int, int], ...]:
    """Return prime-power factors of a universal exponent for `mu(K)`.

    If a primitive `m`-th root lies in a degree-`n` field, then
    `phi(m) | n`.  Thus every `p^a | m` satisfies `p - 1 | n` and
    `p^(a - 1) | n`.  This gives a finite exact exponent without a table or a
    search cutoff for inverse Euler phi.
    """
    if degree < 1:
        raise ValueError("a number-field degree must be positive")
    answer: list[tuple[int, int]] = []
    for prime in range(2, degree + 2):
        if _is_prime(prime) and degree % (prime - 1) == 0:
            exponent = _valuation(degree, prime) + 1
            answer.append((prime, prime**exponent))
    return tuple(answer)


def _universal_torsion_exponent(degree: int) -> int:
    answer = 1
    for _prime, prime_power in _universal_torsion_prime_powers(degree):
        answer *= prime_power
    return answer


def _element_key(element: Any) -> tuple[tuple[int, int], ...]:
    return tuple(
        (int(value._numerator), int(value._denominator))
        for value in list(element.list())
    )


class RootsOfUnityCertificate:
    """Authenticated exact exhaustion evidence for roots of unity.

    The fast certificate proves that the exact order of a displayed generator
    equals an upper bound obtained from certified residue fields.  The bounded
    fallback certificate exhausts an exact maximal-order coordinate box.  An
    issuance seal prevents a certificate payload from being changed after the
    producing computation; verification still replays all mathematical
    evidence from the field.
    """

    def __init__(
        self,
        kind: str,
        degree: int,
        signature: tuple[int, int],
        universal_prime_powers: tuple[tuple[int, int], ...],
        universal_exponent: int,
        generator_coordinates: tuple[tuple[int, int], ...],
        prime_records: tuple[
            tuple[int, tuple[tuple[int, int], ...], int, int], ...
        ] = (),
        coefficient_bounds: tuple[int, ...] = (),
        candidates_checked: int = 0,
        candidate_cap: int = 0,
        *,
        _issuance_token: Any = None,
    ) -> None:
        if _issuance_token is not _ROOTS_OF_UNITY_CERTIFICATE_TOKEN:
            raise ValueError("roots-of-unity certificates are producer-issued")
        if kind not in (
            "real-place",
            "imaginary-quadratic-classification",
            "residue-upper-bound",
            "embedding-box-exhaustion",
        ):
            raise ValueError("unknown roots-of-unity certificate kind")
        self.kind = kind
        self.degree = int(degree)
        self.signature = tuple(int(value) for value in signature)
        self.universal_prime_powers = tuple(
            (int(prime), int(prime_power))
            for prime, prime_power in universal_prime_powers
        )
        self.universal_exponent = int(universal_exponent)
        self.generator_coordinates = tuple(
            (int(numerator), int(denominator))
            for numerator, denominator in generator_coordinates
        )
        self.prime_records = tuple(
            (
                int(prime),
                tuple(
                    (int(ramification), int(residue_degree))
                    for ramification, residue_degree in factors
                ),
                int(upper_before),
                int(upper_after),
            )
            for prime, factors, upper_before, upper_after in prime_records
        )
        self.coefficient_bounds = tuple(int(value) for value in coefficient_bounds)
        self.candidates_checked = int(candidates_checked)
        self.candidate_cap = int(candidate_cap)
        self._issuance_seal = self._payload_tuple()

    @property
    def proof_status(self) -> str:
        """The immutable proof status of every producer-issued certificate."""
        return "exact"

    def _payload_tuple(self) -> tuple[Any, ...]:
        return (
            self.kind,
            self.degree,
            self.signature,
            self.universal_prime_powers,
            self.universal_exponent,
            self.generator_coordinates,
            self.prime_records,
            self.coefficient_bounds,
            self.candidates_checked,
            self.candidate_cap,
            self.proof_status,
        )

    def verify(self, result: RootsOfUnityResult, *, force_replay: bool = False) -> bool:
        if self._issuance_seal != self._payload_tuple():
            return False
        try:
            bool(result.complete)
            int(result.order)
            _element_key(result.generator)
            tuple(_element_key(element) for element in result.elements)
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False
        try:
            verified = _verify_roots_of_unity_certificate(result, self)
        except (
            TypeError,
            ValueError,
            ArithmeticError,
            AttributeError,
            NotImplementedError,
        ):
            return False
        return verified

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": _ROOTS_OF_UNITY_CERTIFICATE_SCHEMA,
            "kind": self.kind,
            "degree": self.degree,
            "signature": list(self.signature),
            "universal_prime_powers": [
                [prime, prime_power]
                for prime, prime_power in self.universal_prime_powers
            ],
            "universal_exponent": self.universal_exponent,
            "generator_coordinates": [
                [numerator, denominator]
                for numerator, denominator in self.generator_coordinates
            ],
            "prime_records": [
                {
                    "prime": prime,
                    "factors": [
                        {"e": ramification, "f": residue_degree}
                        for ramification, residue_degree in factors
                    ],
                    "upper_before": upper_before,
                    "upper_after": upper_after,
                }
                for prime, factors, upper_before, upper_after in self.prime_records
            ],
            "coefficient_bounds": list(self.coefficient_bounds),
            "candidates_checked": self.candidates_checked,
            "candidate_cap": self.candidate_cap,
            "proof_status": self.proof_status,
        }

    @classmethod
    def from_dict(cls, field: Any, payload: Any) -> RootsOfUnityCertificate:
        """Validate and reconstruct one detached exact certificate payload.

        Deserialization is deliberately strict: unknown fields, noncanonical
        rational coordinates, oversized replay work, and merely plausible
        evidence all fail closed.  The returned certificate has already been
        replayed against `field`; using it with a result still rechecks that
        result's exact generator and powers.
        """
        expected_keys = {
            "schema",
            "kind",
            "degree",
            "signature",
            "universal_prime_powers",
            "universal_exponent",
            "generator_coordinates",
            "prime_records",
            "coefficient_bounds",
            "candidates_checked",
            "candidate_cap",
            "proof_status",
        }
        if type(payload) is not dict or set(payload) != expected_keys:
            raise ValueError("invalid roots-of-unity certificate fields")
        if payload["schema"] != _ROOTS_OF_UNITY_CERTIFICATE_SCHEMA:
            raise ValueError("unknown roots-of-unity certificate schema")
        if payload["proof_status"] != "exact":
            raise ValueError("a roots-of-unity certificate must have exact status")

        def exact_integer(
            value: Any,
            label: str,
            *,
            minimum: int | None = None,
            maximum: int | None = None,
        ) -> int:
            if type(value) is not int:
                raise ValueError(label + " must be an exact integer")
            if minimum is not None and value < minimum:
                raise ValueError(label + " is below its minimum")
            if maximum is not None and value > maximum:
                raise ValueError(label + " exceeds its replay cap")
            return value

        kind = payload["kind"]
        if type(kind) is not str or kind not in (
            "real-place",
            "imaginary-quadratic-classification",
            "residue-upper-bound",
            "embedding-box-exhaustion",
        ):
            raise ValueError("unknown roots-of-unity certificate kind")
        degree = exact_integer(payload["degree"], "degree", minimum=1)
        if degree != int(field.degree()):
            raise ValueError("roots-of-unity certificate field degree changed")
        signature_payload = payload["signature"]
        if type(signature_payload) is not list or len(signature_payload) != 2:
            raise ValueError("invalid roots-of-unity signature payload")
        signature = (
            exact_integer(signature_payload[0], "signature entry", minimum=0),
            exact_integer(signature_payload[1], "signature entry", minimum=0),
        )
        if signature != exact_signature(field):
            raise ValueError("roots-of-unity certificate field signature changed")

        prime_power_payload = payload["universal_prime_powers"]
        exact_prime_powers = _universal_torsion_prime_powers(degree)
        if type(prime_power_payload) is not list or len(prime_power_payload) != len(
            exact_prime_powers
        ):
            raise ValueError("invalid universal prime-power payload")
        universal_prime_powers: list[tuple[int, int]] = []
        for pair in prime_power_payload:
            if type(pair) is not list or len(pair) != 2:
                raise ValueError("invalid universal prime-power entry")
            universal_prime_powers.append(
                (
                    exact_integer(pair[0], "universal prime", minimum=2),
                    exact_integer(pair[1], "universal prime power", minimum=2),
                )
            )
        if tuple(universal_prime_powers) != exact_prime_powers:
            raise ValueError("universal torsion prime powers changed")
        universal_exponent = exact_integer(
            payload["universal_exponent"], "universal exponent", minimum=1
        )
        if universal_exponent != _universal_torsion_exponent(degree):
            raise ValueError("universal torsion exponent changed")

        coordinate_payload = payload["generator_coordinates"]
        if type(coordinate_payload) is not list or len(coordinate_payload) != degree:
            raise ValueError("invalid roots-of-unity generator coordinates")
        generator_coordinates: list[tuple[int, int]] = []
        generator_coefficients: list[Any] = []
        for pair in coordinate_payload:
            if type(pair) is not list or len(pair) != 2:
                raise ValueError("invalid roots-of-unity generator coordinate")
            numerator = exact_integer(pair[0], "coordinate numerator")
            denominator = exact_integer(pair[1], "coordinate denominator", minimum=1)
            if _gcd(numerator, denominator) != 1:
                raise ValueError("a generator coordinate is not canonical")
            generator_coordinates.append((numerator, denominator))
            generator_coefficients.append(sage.QQ(numerator) / sage.QQ(denominator))
        generator = field._from_coefficients(generator_coefficients)
        if _element_key(generator) != tuple(generator_coordinates):
            raise ValueError("generator coordinate reconstruction changed")

        candidate_cap = exact_integer(
            payload["candidate_cap"],
            "candidate cap",
            minimum=0,
            maximum=_DETACHED_ROOTS_OF_UNITY_MAX_CANDIDATES,
        )
        candidates_checked = exact_integer(
            payload["candidates_checked"],
            "candidates checked",
            minimum=0,
            maximum=candidate_cap,
        )
        bounds_payload = payload["coefficient_bounds"]
        expected_bound_count = degree if kind == "embedding-box-exhaustion" else 0
        if (
            type(bounds_payload) is not list
            or len(bounds_payload) != expected_bound_count
        ):
            raise ValueError("invalid coefficient-bound payload")
        coefficient_bounds = tuple(
            exact_integer(
                value,
                "coefficient bound",
                minimum=0,
                maximum=_DETACHED_ROOTS_OF_UNITY_MAX_CANDIDATES,
            )
            for value in bounds_payload
        )

        record_payload = payload["prime_records"]
        if (
            type(record_payload) is not list
            or len(record_payload) > _DETACHED_ROOTS_OF_UNITY_MAX_PRIME_RECORDS
        ):
            raise ValueError("invalid or oversized residue-prime payload")
        prime_records: list[tuple[int, tuple[tuple[int, int], ...], int, int]] = []
        seen_primes: set[int] = set()
        for record in record_payload:
            if type(record) is not dict or set(record) != {
                "prime",
                "factors",
                "upper_before",
                "upper_after",
            }:
                raise ValueError("invalid residue-prime record fields")
            prime = exact_integer(
                record["prime"],
                "residue prime",
                minimum=2,
                maximum=_MAXIMUM_ROOT_OF_UNITY_PRIME,
            )
            if (
                not _is_prime(prime)
                or prime in seen_primes
                or universal_exponent % prime == 0
            ):
                raise ValueError("invalid residue prime")
            seen_primes.add(prime)
            factor_payload = record["factors"]
            if (
                type(factor_payload) is not list
                or len(factor_payload) < 1
                or len(factor_payload) > degree
            ):
                raise ValueError("invalid residue factor payload")
            factors: list[tuple[int, int]] = []
            for factor in factor_payload:
                if type(factor) is not dict or set(factor) != {"e", "f"}:
                    raise ValueError("invalid residue factor fields")
                factors.append(
                    (
                        exact_integer(factor["e"], "ramification index", minimum=1),
                        exact_integer(factor["f"], "residue degree", minimum=1),
                    )
                )
            if sum(e * f for e, f in factors) != degree:
                raise ValueError(
                    "residue factor degrees do not sum to the field degree"
                )
            prime_records.append(
                (
                    prime,
                    tuple(factors),
                    exact_integer(
                        record["upper_before"], "previous upper bound", minimum=1
                    ),
                    exact_integer(record["upper_after"], "next upper bound", minimum=1),
                )
            )

        if kind in ("real-place", "imaginary-quadratic-classification"):
            if (
                prime_records
                or coefficient_bounds
                or candidates_checked != 0
                or candidate_cap != 0
            ):
                raise ValueError("classification certificate has extraneous evidence")
        elif kind == "residue-upper-bound":
            if not prime_records or coefficient_bounds:
                raise ValueError("invalid residue-bound certificate shape")

        certificate = cls(
            kind,
            degree,
            signature,
            tuple(universal_prime_powers),
            universal_exponent,
            tuple(generator_coordinates),
            tuple(prime_records),
            coefficient_bounds,
            candidates_checked,
            candidate_cap,
            _issuance_token=_ROOTS_OF_UNITY_CERTIFICATE_TOKEN,
        )
        order = _exact_order_dividing(generator, universal_exponent)
        if order < 1:
            raise ValueError("the detached generator is not a root of unity")
        result = RootsOfUnityResult(
            _powers(generator, order),
            generator,
            order,
            True,
            "detached exact roots-of-unity certificate replay",
            certificate,
        )
        if not certificate.verify(result, force_replay=True):
            raise ValueError("detached roots-of-unity certificate replay failed")
        return certificate


def _isqrt(value: int) -> int:
    if value < 0:
        raise ValueError("integer square root needs a nonnegative value")
    if value < 2:
        return value
    estimate = 1 << ((value.bit_length() + 1) // 2)
    while True:
        next_estimate = (estimate + value // estimate) // 2
        if next_estimate >= estimate:
            return estimate
        estimate = next_estimate


class RootsOfUnityResult:
    """A finite torsion result with explicit completeness evidence."""

    def __init__(
        self,
        elements: list[Any],
        generator: Any,
        order: int,
        complete: bool,
        reason: str,
        certificate: RootsOfUnityCertificate | None = None,
    ) -> None:
        if order < 1:
            raise ValueError("a roots-of-unity order must be positive")
        self.elements = tuple(elements)
        self.generator = generator
        self.order = order
        self.complete = complete
        self.reason = reason
        self.certificate = certificate
        self.proof_status = "exact" if complete else "incomplete"
        if complete and len(self.elements) != order:
            raise ValueError("a complete torsion list must have the claimed order")

    def verify(self, *, force_replay: bool = False) -> bool:
        if (
            not self.complete
            or type(self.certificate) is not RootsOfUnityCertificate
            or not self.certificate.verify(self, force_replay=force_replay)
        ):
            return False
        expected = _powers(self.generator, self.order)
        if len(_unique(expected)) != self.order:
            return False
        if len(self.elements) != self.order:
            return False
        return all(
            self.elements[index] == expected[index] for index in range(self.order)
        )

    def __repr__(self) -> str:
        label = "complete" if self.complete else "incomplete"
        return "Roots of unity of known order " + str(self.order) + " (" + label + ")"


class UnitCertificate:
    """Exact order-membership and norm evidence for one unit."""

    def __init__(self, unit: Any, norm: int, integral: bool, verified: bool) -> None:
        self.unit = unit
        self.norm = norm
        self.integral = integral
        self.verified = verified
        self.proof_status = "exact" if verified else "failed"

    def verify(self, field: Any) -> bool:
        answer, norm = exact_norm_is_unit(field, self.unit)
        return answer and norm == self.norm and self.unit in field.maximal_order()


class RegulatorResult:
    """A regulator approximation tied to the subgroup used to compute it."""

    def __init__(
        self,
        value: float,
        precision: int,
        subgroup_complete: bool,
        unit_rank: int,
    ) -> None:
        self.value = value
        self.requested_precision = precision
        self.effective_precision_bits = min(53, precision)
        self.precision = self.effective_precision_bits
        self.unit_rank = unit_rank
        self.subgroup_complete = subgroup_complete
        self.status = "numerical-approximation"
        self.proof_status = (
            "complete-subgroup-numerical-regulator"
            if subgroup_complete
            else "incomplete-subgroup-numerical-regulator"
        )

    def __repr__(self) -> str:
        return str(self.value) + " (" + self.proof_status + ")"


class UnitCompletionCertificate:
    """Replay interface for a proof that a unit subgroup is saturated."""

    def __init__(self, kind: str) -> None:
        self.kind = kind
        self.proof_status = "exact"

    def verify(self, result: UnitSubgroupResult) -> bool:
        if self.kind == "rank-zero":
            r1, r2 = exact_signature(result.field)
            return (
                r1 + r2 - 1 == 0
                and result.unit_rank == 0
                and len(result.generators) == 0
                and len(result.certificates) == 0
                and result.torsion.complete
                and result.torsion.verify()
            )
        if self.kind == "real-quadratic-minimal-pell":
            if exact_signature(result.field) != (2, 0):
                return False
            try:
                unit, norm, checked = _real_quadratic_unit(
                    result.field, result.search_bound
                )
            except ValueError:
                return False
            return (
                result.unit_rank == 1
                and len(result.generators) == 1
                and len(result.certificates) == 1
                and checked == result.search_bound
                and unit == result.generators[0]
                and norm == result.certificates[0].norm
                and result.certificates[0].verify(result.field)
                and result.torsion.complete
                and result.torsion.verify()
            )
        return False


class FundamentalBoxUnitCertificate:
    """Exact saturation evidence from a logarithmic fundamental box.

    Every coset of the candidate unit subgroup has a representative whose log
    vector lies in its half-open fundamental parallelepiped.  Exact embedding
    bounds put every such representative in the recorded coefficient box.
    Exhausting that box and expressing every unit found in the candidate
    subgroup proves index one.
    """

    def __init__(
        self,
        coefficient_bounds: list[int],
        candidate_cap: int,
        exponent_cap: int,
        units_checked: list[tuple[tuple[int, ...], tuple[int, tuple[int, ...]]]],
        lattice_candidates: int,
        independence_certificate: MultiplicativeIndependenceCertificate,
    ) -> None:
        self.kind = "exact-log-fundamental-box"
        self.coefficient_bounds = tuple(coefficient_bounds)
        self.candidate_cap = candidate_cap
        self.exponent_cap = exponent_cap
        self.units_checked = tuple(units_checked)
        self.lattice_candidates = lattice_candidates
        self.independence_certificate = independence_certificate
        self.proof_status = "exact"

    def verify(self, result: UnitSubgroupResult) -> bool:
        if not result.complete:
            return False
        if not self.independence_certificate.verify(
            result.field, list(result.generators)
        ):
            return False
        try:
            replay = _fundamental_box_saturation(
                result.field,
                list(result.generators),
                result.torsion,
                self.candidate_cap,
                self.exponent_cap,
            )
        except (TypeError, ValueError, ArithmeticError):
            return False
        return (
            replay.coefficient_bounds == self.coefficient_bounds
            and replay.units_checked == self.units_checked
            and replay.lattice_candidates == self.lattice_candidates
            and replay.independence_certificate.sign_rows
            == self.independence_certificate.sign_rows
        )


class MultiplicativeIndependenceCertificate:
    """Exact full-rank evidence from absolute-value sign patterns.

    For rank one, a nonzero logarithm proves nontorsion.  For rank two, two
    embeddings whose products of logarithm signs differ rule out a nonzero
    relation: one row would require the exponents to have the same signs and
    the other would require opposite signs.  Only exact comparisons of
    algebraic absolute values with `1` are used.
    """

    def __init__(self, sign_rows: list[tuple[int, ...]]) -> None:
        self.sign_rows = tuple(sign_rows)
        self.proof_status = "exact"

    def verify(self, field: Any, generators: list[Any]) -> bool:
        replay = _embedding_log_sign_rows(field, generators)
        if replay != self.sign_rows:
            return False
        rank = len(generators)
        if rank == 1:
            return any(row[0] != 0 for row in replay)
        if rank == 2:
            products = [
                row[0] * row[1] for row in replay if row[0] != 0 and row[1] != 0
            ]
            return any(value > 0 for value in products) and any(
                value < 0 for value in products
            )
        return rank == 0


class UnitSubgroupResult:
    """Torsion plus free generators, never silently promoted to the full group."""

    def __init__(
        self,
        field: Any,
        torsion: RootsOfUnityResult,
        generators: list[Any],
        certificates: list[UnitCertificate],
        unit_rank: int,
        complete: bool,
        reason: str,
        search_bound: int,
        candidates_checked: int,
        completion_certificate: Any = None,
    ) -> None:
        self.field = field
        self.torsion = torsion
        self.generators = tuple(generators)
        self.certificates = tuple(certificates)
        self.unit_rank = unit_rank
        self.complete = complete
        self.reason = reason
        self.search_bound = search_bound
        self.candidates_checked = candidates_checked
        self.completion_certificate = completion_certificate
        self.proof_status = "exact" if complete else "incomplete"
        self.index_bound = 1 if complete else None
        if complete and len(self.generators) != unit_rank:
            raise ValueError("a complete unit result needs one generator per free rank")
        if complete and not torsion.complete:
            raise ValueError("a complete unit result needs complete torsion")
        if complete and completion_certificate is None:
            raise ValueError("a complete unit result needs a saturation certificate")

    def regulator(self, prec: int = 53) -> RegulatorResult:
        return subgroup_regulator(self, prec)

    def verify_completion(self) -> bool:
        certificate_type = type(self.completion_certificate)
        return (
            self.complete
            and self.completion_certificate is not None
            and certificate_type
            in (UnitCompletionCertificate, FundamentalBoxUnitCertificate)
            and self.completion_certificate.verify(self)
        )

    def __repr__(self) -> str:
        noun = "Unit group" if self.complete else "Unit subgroup"
        return (
            noun
            + " with torsion order "
            + str(self.torsion.order)
            + " and "
            + str(len(self.generators))
            + " free generators ("
            + self.proof_status
            + ")"
        )


def _unique(values: tuple[Any, ...] | list[Any]) -> list[Any]:
    answer = []
    for value in values:
        if not any(value == known for known in answer):
            answer.append(value)
    return answer


def _rational_parts(value: Any) -> tuple[int, int]:
    return (int(value._numerator), int(value._denominator))


def _rational_square_root(value: Any) -> Any:
    numerator, denominator = _rational_parts(value)
    if numerator < 0:
        raise ValueError("a rational square root needs a nonnegative value")
    numerator_root = _isqrt(numerator)
    denominator_root = _isqrt(denominator)
    if numerator_root * numerator_root != numerator:
        raise ArithmeticError("a required rational numerator is not a square")
    if denominator_root * denominator_root != denominator:
        raise ArithmeticError("a required rational denominator is not a square")
    return sage.QQ(numerator_root) / sage.QQ(denominator_root)


def _quadratic_square_root_element(field: Any) -> tuple[int, Any]:
    """Return squarefree `d` and the field element `sqrt(d)`."""
    if field.degree() != 2:
        raise ValueError("quadratic data requires a degree-two field")
    if getattr(field, "_kind", None) == "QuadraticField":
        squarefree = int(field._squarefree_radicand)
        square_root = field.gen() / field._root_scale
        if square_root * square_root != field(squarefree):
            raise ArithmeticError("special quadratic square-root transport failed")
        return (squarefree, square_root)
    discriminant = int(field.discriminant())
    squarefree = discriminant if discriminant % 4 == 1 else discriminant // 4
    coefficients = list(field._defining_coefficients)
    constant = coefficients[0]
    linear = coefficients[1]
    polynomial_discriminant = linear * linear - 4 * constant
    ratio = polynomial_discriminant / squarefree
    scale = _rational_square_root(ratio)
    square_root = (2 * field.gen() + field(linear)) / scale
    if square_root * square_root != field(squarefree):
        raise ArithmeticError("quadratic square-root transport failed")
    return (squarefree, square_root)


def _powers(generator: Any, order: int) -> list[Any]:
    answer = []
    value = generator.parent().one()
    for _index in range(order):
        answer.append(value)
        value *= generator
    return answer


class _RootsOfUnityResourceLimit(ValueError):
    pass


def _exact_order_dividing(element: Any, exponent: int) -> int:
    if exponent < 1 or element**exponent != element.parent().one():
        return 0
    order = exponent
    for prime in _prime_divisors(exponent):
        while order % prime == 0 and element ** (order // prime) == 1:
            order //= prime
    return order


def _issue_roots_of_unity_certificate(
    kind: str,
    field: Any,
    generator: Any,
    universal_prime_powers: tuple[tuple[int, int], ...],
    universal_exponent: int,
    *,
    prime_records: tuple[tuple[int, tuple[tuple[int, int], ...], int, int], ...] = (),
    coefficient_bounds: tuple[int, ...] = (),
    candidates_checked: int = 0,
    candidate_cap: int = 0,
) -> RootsOfUnityCertificate:
    return RootsOfUnityCertificate(
        kind,
        int(field.degree()),
        exact_signature(field),
        universal_prime_powers,
        universal_exponent,
        _element_key(generator),
        prime_records,
        coefficient_bounds,
        candidates_checked,
        candidate_cap,
        _issuance_token=_ROOTS_OF_UNITY_CERTIFICATE_TOKEN,
    )


def _append_unique_element(elements: list[Any], candidate: Any) -> None:
    if not any(candidate == known for known in elements):
        elements.append(candidate)


def _coordinate_vector_at(index: int, bounds: tuple[int, ...]) -> tuple[int, ...]:
    coordinates = [0] * len(bounds)
    for position in range(len(bounds) - 1, -1, -1):
        width = 2 * bounds[position] + 1
        coordinates[position] = index % width - bounds[position]
        index //= width
    return tuple(coordinates)


def _element_from_order_coordinates(
    field: Any, basis: tuple[Any, ...], coordinates: tuple[int, ...]
) -> Any:
    element = field.zero()
    for index in range(len(basis)):
        element += coordinates[index] * basis[index]
    return element


def _fast_torsion_candidates(field: Any, maximum_candidates: int) -> tuple[Any, ...]:
    if maximum_candidates <= 0:
        return ()
    order = field.maximal_order()
    basis = tuple(order.basis())
    answer: list[Any] = []
    generator = field.gen()
    _append_unique_element(answer, generator)
    if len(answer) < maximum_candidates:
        _append_unique_element(answer, -generator)
    for basis_element in basis:
        if len(answer) >= maximum_candidates:
            return tuple(answer)
        _append_unique_element(answer, basis_element)
        if len(answer) >= maximum_candidates:
            return tuple(answer)
        _append_unique_element(answer, -basis_element)
    bounds = tuple(1 for _index in basis)
    total = 3 ** len(basis)
    for candidate_index in range(total):
        if len(answer) >= maximum_candidates:
            break
        coordinates = _coordinate_vector_at(candidate_index, bounds)
        candidate = _element_from_order_coordinates(field, basis, coordinates)
        _append_unique_element(answer, candidate)
    return tuple(answer)


def _canonical_torsion_generator(field: Any, generator: Any, order: int) -> Any:
    """Choose the first primitive element in the producer's fixed ordering."""
    for candidate in _fast_torsion_candidates(field, _FAST_ROOT_OF_UNITY_CANDIDATES):
        if _exact_order_dividing(candidate, order) == order:
            return candidate
    primitive = [
        candidate
        for candidate in _powers(generator, order)
        if _exact_order_dividing(candidate, order) == order
    ]
    if not primitive:
        raise ArithmeticError("a finite torsion group has no primitive generator")
    primitive.sort(key=_element_key)
    return primitive[0]


def _replay_fast_torsion_candidate_count(
    field: Any, universal_exponent: int, candidate_cap: int, target_order: int
) -> int:
    """Replay the producer's two-stage deterministic fast-candidate scan."""
    candidates = _fast_torsion_candidates(
        field, min(candidate_cap, _FAST_ROOT_OF_UNITY_CANDIDATES)
    )
    best_order = 2
    checked = 0
    remaining_offset = 0
    for candidate_index in range(len(candidates)):
        candidate_order = _exact_order_dividing(
            candidates[candidate_index], universal_exponent
        )
        checked += 1
        remaining_offset = candidate_index + 1
        if candidate_order > best_order:
            best_order = candidate_order
            if best_order > 2 and best_order % 2 == 0:
                break
    if best_order != target_order:
        for candidate_index in range(remaining_offset, len(candidates)):
            candidate_order = _exact_order_dividing(
                candidates[candidate_index], universal_exponent
            )
            checked += 1
            if candidate_order > best_order:
                best_order = candidate_order
            if best_order == target_order:
                break
    if best_order != target_order:
        raise ArithmeticError("fast torsion candidate replay did not reach its target")
    return checked


def _next_congruent_prime(start: int, modulus: int) -> int:
    modulus = max(1, modulus)
    candidate = max(2, start)
    if modulus > 1:
        candidate += (1 - candidate) % modulus
    while candidate <= _MAXIMUM_ROOT_OF_UNITY_PRIME:
        if _is_prime(candidate):
            return candidate
        candidate += modulus
    return 0


def _residue_torsion_upper_bound(
    field: Any,
    initial_upper: int,
    lower_order: int,
    maximum_primes: int,
) -> tuple[
    int,
    tuple[tuple[int, tuple[tuple[int, int], ...], int, int], ...],
]:
    upper = initial_upper
    records: list[tuple[int, tuple[tuple[int, int], ...], int, int]] = []
    if maximum_primes <= 0:
        return upper, tuple(records)
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    order = field.maximal_order()
    candidate = max(2, lower_order + 1)
    attempts = 0
    while attempts < maximum_primes and upper != lower_order:
        prime = _next_congruent_prime(candidate, lower_order)
        if prime == 0:
            break
        candidate = prime + max(1, lower_order)
        if initial_upper % prime == 0:
            continue
        attempts += 1
        try:
            decomposition = prime_module.factor_rational_prime(order, prime)
        except (ValueError, ArithmeticError, NotImplementedError):
            continue
        factors = tuple(
            (
                int(prime_ideal.ramification_index()),
                int(prime_ideal.residue_class_degree()),
            )
            for prime_ideal in decomposition.prime_ideals()
        )
        if not factors:
            raise ArithmeticError("a prime decomposition has no factors")
        residue_gcd = factors[0][1]
        for _ramification, residue_degree in factors[1:]:
            residue_gcd = _gcd(residue_gcd, residue_degree)
        previous = upper
        upper = _gcd(upper, prime**residue_gcd - 1)
        if upper % lower_order != 0:
            raise ArithmeticError(
                "a residue torsion bound excludes a known root of unity"
            )
        records.append((prime, factors, previous, upper))
    return upper, tuple(records)


def _embedding_box_roots(
    field: Any, universal_exponent: int, candidate_cap: int
) -> tuple[tuple[int, ...], int, Any, int, tuple[Any, ...]]:
    degree = int(field.degree())
    # Every row of the inverse embedding matrix is nonzero, so its positive
    # l1 norm has ceiling at least one.  The eventual coordinate box therefore
    # contains at least 3^degree points.  Decline before maximal-order and
    # exact-embedding setup when that unavoidable work already exceeds policy.
    minimum_total = 3**degree
    if minimum_total > candidate_cap:
        raise _RootsOfUnityResourceLimit(
            "the exact roots-of-unity coefficient box has at least "
            + str(minimum_total)
            + " candidates, exceeding max_candidates="
            + str(candidate_cap)
        )
    order = field.maximal_order()
    basis = tuple(order.basis())
    roots = _exact_roots(field)
    embedding_matrix = []
    for root in roots:
        embedding_matrix.append(
            [
                _evaluate_coefficients(list(basis_element.list()), root)
                for basis_element in basis
            ]
        )
    inverse = _exact_matrix_inverse(embedding_matrix)
    coefficient_bounds: list[int] = []
    total = 1
    for row in inverse:
        bound = row[0].abs().parent()(0)
        for value in row:
            bound += value.abs()
        coefficient_bound = _exact_ceiling(bound)
        coefficient_bounds.append(coefficient_bound)
        total *= 2 * coefficient_bound + 1
        if total > candidate_cap:
            raise _RootsOfUnityResourceLimit(
                "the exact roots-of-unity coefficient box has "
                + str(total)
                + " candidates, exceeding max_candidates="
                + str(candidate_cap)
            )
    bounds = tuple(coefficient_bounds)
    found: list[Any] = []
    best_generator = field(-1)
    best_order = 2
    for candidate_index in range(total):
        coordinates = _coordinate_vector_at(candidate_index, bounds)
        element = _element_from_order_coordinates(field, basis, coordinates)
        element_order = _exact_order_dividing(element, universal_exponent)
        if element_order == 0:
            continue
        found.append(element)
        if element_order > best_order:
            best_generator = element
            best_order = element_order
    unique_found = _unique(found)
    best_generator = _canonical_torsion_generator(field, best_generator, best_order)
    powers = _powers(best_generator, best_order)
    if len(unique_found) != best_order or not all(
        any(power == root for root in unique_found) for power in powers
    ):
        raise ArithmeticError("the exact torsion roots did not form one cyclic group")
    return bounds, total, best_generator, best_order, tuple(unique_found)


def _verify_prime_records(
    field: Any,
    universal_exponent: int,
    records: tuple[tuple[int, tuple[tuple[int, int], ...], int, int], ...],
) -> int:
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    order = field.maximal_order()
    upper = universal_exponent
    for prime, recorded_factors, upper_before, upper_after in records:
        if prime < 2 or universal_exponent % prime == 0 or upper_before != upper:
            raise ArithmeticError("invalid residue torsion-bound record")
        decomposition = prime_module.factor_rational_prime(order, prime)
        verification = decomposition.verify()
        if verification.get("certified") is not True:
            raise ArithmeticError("a residue torsion decomposition failed replay")
        factors = tuple(
            (
                int(prime_ideal.ramification_index()),
                int(prime_ideal.residue_class_degree()),
            )
            for prime_ideal in decomposition.prime_ideals()
        )
        if factors != recorded_factors or not factors:
            raise ArithmeticError("a residue torsion decomposition changed")
        residue_gcd = factors[0][1]
        for _ramification, residue_degree in factors[1:]:
            residue_gcd = _gcd(residue_gcd, residue_degree)
        upper = _gcd(upper, prime**residue_gcd - 1)
        if upper != upper_after:
            raise ArithmeticError("a residue torsion upper bound changed")
    return upper


def _verify_roots_of_unity_certificate(
    result: RootsOfUnityResult, certificate: RootsOfUnityCertificate
) -> bool:
    if type(result) is not RootsOfUnityResult or not result.complete:
        return False
    field = result.generator.parent()
    degree = int(field.degree())
    signature = exact_signature(field)
    prime_powers = _universal_torsion_prime_powers(degree)
    universal_exponent = _universal_torsion_exponent(degree)
    if (
        certificate.degree != degree
        or certificate.signature != signature
        or certificate.universal_prime_powers != prime_powers
        or certificate.universal_exponent != universal_exponent
        or certificate.generator_coordinates != _element_key(result.generator)
    ):
        return False
    if _exact_order_dividing(result.generator, universal_exponent) != result.order:
        return False
    expected_elements = _powers(result.generator, result.order)
    if (
        len(_unique(expected_elements)) != result.order
        or len(result.elements) != result.order
        or not all(
            result.elements[index] == expected_elements[index]
            for index in range(result.order)
        )
    ):
        return False
    if certificate.kind == "real-place":
        return (
            (signature[0] > 0 or degree == 1)
            and result.order == 2
            and result.generator == field(-1)
            and not certificate.prime_records
            and not certificate.coefficient_bounds
        )
    if certificate.kind == "imaginary-quadratic-classification":
        if degree != 2 or signature != (0, 1):
            return False
        squarefree, square_root = _quadratic_square_root_element(field)
        if squarefree == -1:
            expected_generator = square_root
            expected_order = 4
        elif squarefree == -3:
            expected_generator = (field(1) + square_root) / 2
            expected_order = 6
        else:
            expected_generator = field(-1)
            expected_order = 2
        return (
            result.order == expected_order
            and result.generator == expected_generator
            and not certificate.prime_records
            and not certificate.coefficient_bounds
        )
    residue_upper = _verify_prime_records(
        field, universal_exponent, certificate.prime_records
    )
    if certificate.kind == "residue-upper-bound":
        return (
            bool(certificate.prime_records)
            and residue_upper == result.order
            and not certificate.coefficient_bounds
            and certificate.candidates_checked
            == _replay_fast_torsion_candidate_count(
                field,
                universal_exponent,
                certificate.candidate_cap,
                result.order,
            )
        )
    if certificate.kind != "embedding-box-exhaustion":
        return False
    bounds, candidates, generator, order, found = _embedding_box_roots(
        field, universal_exponent, certificate.candidate_cap
    )
    return (
        bounds == certificate.coefficient_bounds
        and candidates == certificate.candidates_checked
        and order == result.order
        and generator == result.generator
        and len(found) == result.order
    )


def roots_of_unity(
    field: Any,
    *,
    max_primes: int = 8,
    max_candidates: int = 100_000,
) -> RootsOfUnityResult:
    """Compute roots of unity with replayable exact exhaustion evidence.

    The higher-degree totally imaginary route is deterministic and bounded.
    It first tries to match an exact generator order with residue-field upper
    bounds, then exhausts an exact maximal-order embedding box.  Exceeding a
    resource cap returns honest incomplete torsion.
    """
    max_primes = int(max_primes)
    max_candidates = int(max_candidates)
    if max_primes < 0 or max_candidates < 0:
        raise ValueError("roots-of-unity resource caps must be nonnegative")
    r1, r2 = exact_signature(field)
    degree = int(field.degree())
    universal_prime_powers = _universal_torsion_prime_powers(degree)
    universal_exponent = _universal_torsion_exponent(degree)
    minus_one = field(-1)
    if r1 > 0 or degree == 1:
        # Every root of unity maps to a real root of unity under a real place.
        certificate = _issue_roots_of_unity_certificate(
            "real-place",
            field,
            minus_one,
            universal_prime_powers,
            universal_exponent,
        )
        return RootsOfUnityResult(
            [field(1), minus_one],
            minus_one,
            2,
            True,
            "a real embedding forces every root of unity to be +1 or -1",
            certificate,
        )
    if degree == 2 and r2 == 1:
        squarefree, square_root = _quadratic_square_root_element(field)
        if squarefree == -1:
            generator = square_root
            order = 4
            reason = "the field is Q(sqrt(-1))"
        elif squarefree == -3:
            generator = (field(1) + square_root) / 2
            order = 6
            reason = "the field is Q(sqrt(-3))"
        else:
            generator = minus_one
            order = 2
            reason = "classification of roots of unity in imaginary quadratic fields"
        elements = _powers(generator, order)
        certificate = _issue_roots_of_unity_certificate(
            "imaginary-quadratic-classification",
            field,
            generator,
            universal_prime_powers,
            universal_exponent,
        )
        result = RootsOfUnityResult(
            elements, generator, order, True, reason, certificate
        )
        if not result.verify(force_replay=True):
            raise ArithmeticError("roots-of-unity certificate replay failed")
        return result

    best_generator = minus_one
    best_order = 2
    fast_cap = min(max_candidates, _FAST_ROOT_OF_UNITY_CANDIDATES)
    fast_candidates = _fast_torsion_candidates(field, fast_cap)
    candidates_checked = 0
    remaining_offset = 0
    for candidate_index in range(len(fast_candidates)):
        candidate = fast_candidates[candidate_index]
        candidates_checked += 1
        remaining_offset = candidate_index + 1
        candidate_order = _exact_order_dividing(candidate, universal_exponent)
        if candidate_order > best_order:
            best_generator = candidate
            best_order = candidate_order
            # Every number field contains -1, so the full torsion order is
            # even.  An odd-order root is paired with its deterministic
            # negative candidate before residue work begins.
            if best_order > 2 and best_order % 2 == 0:
                break
    residue_upper, prime_records = _residue_torsion_upper_bound(
        field,
        universal_exponent,
        best_order,
        max_primes,
    )
    if residue_upper != best_order:
        for candidate_index in range(remaining_offset, len(fast_candidates)):
            candidate = fast_candidates[candidate_index]
            candidates_checked += 1
            candidate_order = _exact_order_dividing(candidate, universal_exponent)
            if candidate_order > best_order:
                best_generator = candidate
                best_order = candidate_order
            if best_order == residue_upper:
                break
    if residue_upper == best_order:
        best_generator = _canonical_torsion_generator(field, best_generator, best_order)
        certificate = _issue_roots_of_unity_certificate(
            "residue-upper-bound",
            field,
            best_generator,
            universal_prime_powers,
            universal_exponent,
            prime_records=prime_records,
            candidates_checked=candidates_checked,
            candidate_cap=max_candidates,
        )
        result = RootsOfUnityResult(
            _powers(best_generator, best_order),
            best_generator,
            best_order,
            True,
            "an exact generator attains a certified residue-field upper bound",
            certificate,
        )
        if not result.verify(force_replay=True):
            raise ArithmeticError("roots-of-unity certificate replay failed")
        return result

    try:
        bounds, total, generator, order, _found = _embedding_box_roots(
            field, universal_exponent, max_candidates
        )
    except _RootsOfUnityResourceLimit as error:
        return RootsOfUnityResult(
            _powers(best_generator, best_order),
            best_generator,
            best_order,
            False,
            str(error),
        )
    certificate = _issue_roots_of_unity_certificate(
        "embedding-box-exhaustion",
        field,
        generator,
        universal_prime_powers,
        universal_exponent,
        prime_records=prime_records,
        coefficient_bounds=bounds,
        candidates_checked=total,
        candidate_cap=max_candidates,
    )
    result = RootsOfUnityResult(
        _powers(generator, order),
        generator,
        order,
        True,
        "exact exhaustion of a maximal-order embedding coefficient box",
        certificate,
    )
    if not result.verify(force_replay=True):
        raise ArithmeticError("roots-of-unity certificate replay failed")
    return result


def _real_quadratic_unit(field: Any, max_y: int) -> tuple[Any, int, int]:
    if max_y < 1:
        raise ValueError("max_y must be positive")
    squarefree, square_root = _quadratic_square_root_element(field)
    if squarefree <= 0:
        raise ValueError("a real quadratic unit needs positive squarefree radicand")
    for y_value in range(1, max_y + 1):
        dy2 = squarefree * y_value * y_value
        for norm4 in (-4, 4):
            x2 = dy2 + norm4
            if x2 <= 0:
                continue
            x_value = _isqrt(x2)
            if x_value * x_value != x2 or (x_value - y_value) % 2:
                continue
            unit = (field(x_value) + field(y_value) * square_root) / 2
            verified, norm = exact_norm_is_unit(field, unit)
            if verified and unit in field.maximal_order():
                return (unit, norm, y_value)
    raise ValueError(
        "no fundamental real-quadratic unit was found through y=" + str(max_y)
    )


def real_quadratic_unit_group(field: Any, max_y: int = 1_000_000) -> UnitSubgroupResult:
    """Return the full real-quadratic unit group by bounded Pell enumeration.

    Once a solution is found, completeness is exact: every smaller positive
    `y` was checked, so the returned unit is the least unit greater than one
    modulo sign and hence is fundamental.
    """
    if field.degree() != 2 or exact_signature(field) != (2, 0):
        raise ValueError("this algorithm requires a real quadratic field")
    unit, norm, checked = _real_quadratic_unit(field, max_y)
    certificate = UnitCertificate(unit, norm, True, True)
    if not certificate.verify(field):
        raise ArithmeticError("real-quadratic unit certificate replay failed")
    return UnitSubgroupResult(
        field,
        roots_of_unity(field),
        [unit],
        [certificate],
        1,
        True,
        "least positive Pell-type solution proves a fundamental unit",
        checked,
        2 * checked,
        UnitCompletionCertificate("real-quadratic-minimal-pell"),
    )


def _coefficient_vectors(rank: int, bound: int) -> list[list[int]]:
    vectors: list[list[int]] = [[]]
    for _index in range(rank):
        next_vectors = []
        for prefix in vectors:
            for value in range(-bound, bound + 1):
                next_vectors.append(prefix + [value])
        vectors = next_vectors
    return vectors


def _bounded_coordinate_vectors(bounds: list[int]) -> list[list[int]]:
    vectors: list[list[int]] = [[]]
    for bound in bounds:
        next_vectors = []
        for prefix in vectors:
            for value in range(-bound, bound + 1):
                next_vectors.append(prefix + [value])
        vectors = next_vectors
    return vectors


def _exact_matrix_inverse(rows: list[list[Any]]) -> list[list[Any]]:
    size = len(rows)
    matrix = [
        list(row)
        + [row[0].parent()(1 if index == column else 0) for column in range(size)]
        for index, row in enumerate(rows)
    ]
    for column in range(size):
        pivot = column
        while pivot < size and matrix[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            raise ArithmeticError("the exact embedding matrix is singular")
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        pivot_value = matrix[column][column]
        matrix[column] = [value / pivot_value for value in matrix[column]]
        for row in range(size):
            if row == column:
                continue
            scalar = matrix[row][column]
            if scalar != 0:
                matrix[row] = [
                    matrix[row][index] - scalar * matrix[column][index]
                    for index in range(2 * size)
                ]
    return [row[size:] for row in matrix]


def _exact_ceiling(value: Any) -> int:
    candidate = int(float(value.n(53)))
    while value > candidate:
        candidate += 1
    while candidate > 0 and value <= candidate - 1:
        candidate -= 1
    return candidate


def _evaluate_coefficients(coefficients: list[int], root: Any) -> Any:
    value = root.parent()(0)
    for coefficient in reversed(coefficients):
        value = value * root + root.parent()(coefficient)
    return value


def _embedding_log_sign_rows(
    field: Any, generators: list[Any]
) -> tuple[tuple[int, ...], ...]:
    rows = []
    for root in _exact_roots(field):
        row = []
        for generator in generators:
            absolute_value = _evaluate_coefficients(list(generator.list()), root).abs()
            if absolute_value > 1:
                row.append(1)
            elif absolute_value < 1:
                row.append(-1)
            else:
                row.append(0)
        rows.append(tuple(row))
    return tuple(rows)


def _power_table(value: Any, bound: int) -> list[Any]:
    return [value**exponent for exponent in range(-bound, bound + 1)]


def _subgroup_witness(
    field: Any,
    unit: Any,
    generators: list[Any],
    torsion: RootsOfUnityResult,
    exponent_cap: int,
) -> tuple[int, tuple[int, ...]] | None:
    tables = [_power_table(generator, exponent_cap) for generator in generators]
    vectors = _coefficient_vectors(len(generators), exponent_cap)
    # `_coefficient_vectors` is symmetric around zero and has the desired
    # exponent range, despite its historical coefficient-oriented name.
    for torsion_index in range(len(torsion.elements)):
        for shifted in vectors:
            value = torsion.elements[torsion_index]
            for index in range(len(generators)):
                exponent = shifted[index]
                value *= tables[index][exponent + exponent_cap]
            if value == unit:
                return (torsion_index, tuple(shifted))
    return None


def _fundamental_box_saturation(
    field: Any,
    generators: list[Any],
    torsion: RootsOfUnityResult,
    candidate_cap: int,
    exponent_cap: int,
) -> FundamentalBoxUnitCertificate:
    if candidate_cap < 1 or exponent_cap < 1:
        raise ValueError("saturation resource caps must be positive")
    rank = sum(exact_signature(field)) - 1
    if len(generators) != rank:
        raise ValueError("a saturation candidate needs one generator per unit rank")
    if not torsion.complete or not torsion.verify():
        raise ValueError("unit saturation needs complete roots of unity")
    order = field.maximal_order()
    power_basis = []
    power = field.one()
    for _index in range(field.degree()):
        power_basis.append(power)
        power *= field.gen()
    if list(order.basis()) != power_basis:
        raise ValueError(
            "the exact fundamental-box slice requires a maximal power basis"
        )
    for generator in generators:
        verified, _norm = exact_norm_is_unit(field, generator)
        if not verified or generator not in order:
            raise ValueError("a proposed free generator is not an exact unit")
    independence = MultiplicativeIndependenceCertificate(
        list(_embedding_log_sign_rows(field, generators))
    )
    if not independence.verify(field, generators):
        raise ValueError("the proposed free units have no exact full-rank certificate")

    roots = _exact_roots(field)
    vandermonde = []
    for root in roots:
        row = []
        power = root.parent()(1)
        for _index in range(field.degree()):
            row.append(power)
            power *= root
        vandermonde.append(row)
    inverse = _exact_matrix_inverse(vandermonde)

    embedding_bounds = []
    for root in roots:
        bound = root.abs().parent()(1)
        for generator in generators:
            absolute_value = _evaluate_coefficients(list(generator.list()), root).abs()
            if absolute_value > 1:
                bound *= absolute_value
        embedding_bounds.append(bound)
    coefficient_bounds = []
    for row in inverse:
        bound = row[0].abs().parent()(0)
        for index in range(len(row)):
            bound += row[index].abs() * embedding_bounds[index]
        coefficient_bounds.append(_exact_ceiling(bound))
    total = 1
    for bound in coefficient_bounds:
        total *= 2 * bound + 1
        if total > candidate_cap:
            raise ValueError(
                "the exact unit coefficient box has "
                + str(total)
                + " candidates, exceeding candidate_cap="
                + str(candidate_cap)
            )

    units_checked = []
    for vector in _bounded_coordinate_vectors(coefficient_bounds):
        element = field._from_coefficients(vector)
        verified, _norm = exact_norm_is_unit(field, element)
        if not verified:
            continue
        witness = _subgroup_witness(field, element, generators, torsion, exponent_cap)
        if witness is None:
            raise ArithmeticError(
                "the proposed units are not saturated: exact unit "
                + str(element)
                + " has no subgroup witness within the certified box"
            )
        units_checked.append((tuple(vector), witness))
    return FundamentalBoxUnitCertificate(
        coefficient_bounds,
        candidate_cap,
        exponent_cap,
        units_checked,
        total,
        independence,
    )


def certified_small_cubic_unit_group(
    field: Any,
    candidate_cap: int = 1_000,
    exponent_cap: int = 8,
) -> UnitSubgroupResult:
    """Return certified full units for the two smallest cubic test fields."""
    if field.degree() != 3:
        raise ValueError("the certified small slice requires a cubic field")
    key = tuple(
        (int(value._numerator), int(value._denominator))
        for value in field._defining_coefficients
    )
    generator = field.gen()
    if key == ((-1, 1), (-1, 1), (0, 1), (1, 1)):
        generators = [generator]
    elif key == ((1, 1), (-2, 1), (-1, 1), (1, 1)):
        generators = [field.one() + generator - generator**2, generator]
    else:
        raise ValueError("this bounded certified slice does not recognize the cubic")
    torsion = roots_of_unity(field)
    saturation = _fundamental_box_saturation(
        field, generators, torsion, candidate_cap, exponent_cap
    )
    certificates = []
    for unit in generators:
        verified, norm = exact_norm_is_unit(field, unit)
        if not verified:
            raise ArithmeticError("a certified cubic generator stopped being a unit")
        certificates.append(UnitCertificate(unit, norm, True, True))
    result = UnitSubgroupResult(
        field,
        torsion,
        generators,
        certificates,
        len(generators),
        True,
        "exact exhaustion of a logarithmic fundamental-parallelepiped coefficient box",
        max(saturation.coefficient_bounds),
        saturation.lattice_candidates,
        saturation,
    )
    if not result.verify_completion():
        raise ArithmeticError("cubic unit saturation certificate replay failed")
    return result


def bounded_unit_subgroup(
    field: Any,
    coefficient_bound: int = 2,
    max_candidates: int = 100_000,
) -> UnitSubgroupResult:
    """Enumerate a bounded unit subgroup with honest completeness status."""
    if coefficient_bound < 0:
        raise ValueError("coefficient_bound must be nonnegative")
    if max_candidates < 1:
        raise ValueError("max_candidates must be positive")
    r1, r2 = exact_signature(field)
    unit_rank = r1 + r2 - 1
    torsion = roots_of_unity(field)
    if unit_rank == 0 and torsion.complete:
        return UnitSubgroupResult(
            field,
            torsion,
            [],
            [],
            0,
            True,
            "Dirichlet unit rank zero and complete torsion",
            coefficient_bound,
            0,
            UnitCompletionCertificate("rank-zero"),
        )
    if field.degree() == 2 and (r1, r2) == (2, 0):
        return real_quadratic_unit_group(field, max_candidates)
    if field.degree() == 3:
        key = tuple(
            (int(value._numerator), int(value._denominator))
            for value in field._defining_coefficients
        )
        supported = (
            ((-1, 1), (-1, 1), (0, 1), (1, 1)),
            ((1, 1), (-2, 1), (-1, 1), (1, 1)),
        )
        if key in supported:
            return certified_small_cubic_unit_group(field, max_candidates)

    order = field.maximal_order()
    basis = list(order.basis())
    total = (2 * coefficient_bound + 1) ** len(basis)
    if total > max_candidates:
        raise ValueError(
            "bounded unit box contains "
            + str(total)
            + " candidates, exceeding max_candidates="
            + str(max_candidates)
        )
    units = []
    certificates = []
    checked = 0
    for vector in _coefficient_vectors(len(basis), coefficient_bound):
        checked += 1
        element = field(0)
        for basis_index in range(len(basis)):
            element += vector[basis_index] * basis[basis_index]
        verified, norm = exact_norm_is_unit(field, element)
        if not verified:
            continue
        if any(element == torsion_element for torsion_element in torsion.elements):
            continue
        if any(element == known for known in units):
            continue
        units.append(element)
        certificates.append(UnitCertificate(element, norm, True, True))
    return UnitSubgroupResult(
        field,
        torsion,
        units,
        certificates,
        unit_rank,
        False,
        "bounded enumeration supplies units but no saturation/index certificate",
        coefficient_bound,
        checked,
        None,
    )


def _floating_determinant(rows: list[list[float]]) -> float:
    size = len(rows)
    if size == 0:
        return 1.0
    matrix = [list(row) for row in rows]
    determinant = 1.0
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(matrix[row][column]))
        if matrix[pivot][column] == 0:
            return 0.0
        if pivot != column:
            matrix[pivot], matrix[column] = matrix[column], matrix[pivot]
            determinant = -determinant
        value = matrix[column][column]
        determinant *= value
        for row in range(column + 1, size):
            factor = matrix[row][column] / value
            for index in range(column + 1, size):
                matrix[row][index] -= factor * matrix[column][index]
    return abs(determinant)


def subgroup_regulator(subgroup: UnitSubgroupResult, prec: int = 53) -> RegulatorResult:
    """Compute the weighted-log regulator of the supplied subgroup."""
    if prec < 2:
        raise ValueError("precision must be at least 2")
    if not subgroup.complete:
        raise ValueError(
            "an incomplete bounded search has no certified independent unit basis"
        )
    rank = subgroup.unit_rank
    if rank == 0:
        return RegulatorResult(1.0, prec, subgroup.complete, 0)
    if len(subgroup.generators) < rank:
        raise ValueError("not enough free generators to form a regulator")
    cached_archimedean_data = getattr(subgroup.field, "archimedean_data", None)
    data: Any = (
        cached_archimedean_data()
        if callable(cached_archimedean_data)
        else archimedean_data(subgroup.field)
    )
    columns = [
        data.logarithmic_image(unit, prec)[:-1] for unit in subgroup.generators[:rank]
    ]
    rows = [[columns[column][row] for column in range(rank)] for row in range(rank)]
    determinant = _floating_determinant(rows)
    if determinant == 0:
        raise ArithmeticError("the supplied units have zero numerical regulator")
    return RegulatorResult(determinant, prec, subgroup.complete, rank)


__all__ = [
    "FundamentalBoxUnitCertificate",
    "MultiplicativeIndependenceCertificate",
    "RegulatorResult",
    "RootsOfUnityResult",
    "UnitCertificate",
    "UnitCompletionCertificate",
    "UnitSubgroupResult",
    "bounded_unit_subgroup",
    "certified_small_cubic_unit_group",
    "real_quadratic_unit_group",
    "roots_of_unity",
    "subgroup_regulator",
]
