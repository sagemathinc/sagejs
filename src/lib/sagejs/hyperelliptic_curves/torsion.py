"""Certified rational torsion for hyperelliptic Jacobians over `QQ`.

For good reduction at `p`, reduction is injective on rational torsion of
order prime to `p`.  Consequently the `ell`-primary part of rational torsion
is bounded by

```text
min(v_ell(#J(F_p)) : p is a chosen good prime and p != ell).
```

It is important not to take the unqualified gcd of the finite-field orders:
the reduction with residue characteristic `ell` cannot by itself bound the
`ell`-primary part.  The certificate below records the distinct good primes,
their full local polynomials, and every residue-characteristic correction.

The module also computes all rational 2-torsion on an odd-degree model from
the irreducible factors of `h^2 + 4*f`, and verifies supplied rational Mumford
divisors by exact factor-and-strip scalar multiplication.  It claims an exact
torsion subgroup only when the explicit generated lower bound equals the
reduction upper bound.
"""

from __future__ import annotations

from typing import Any, Mapping

import sagejs as sage
from sagejs.hyperelliptic_curves.group_structure import (
    GroupOperationBudget,
    basis_from_generators,
    factor_integer_bounded,
    validate_factorization,
)
from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_integer_buffer,
    kernel_uint64_buffer,
    kernel_uint64_zeros,
)

TORSION_BOUND_SCHEMA = "sagejs.hyperelliptic-rational-torsion-bound/v1"
TORSION_RESULT_SCHEMA = "sagejs.hyperelliptic-rational-torsion/v1"
TWO_TORSION_SCHEMA = "sagejs.hyperelliptic-rational-two-torsion/v1"
QQ_DIVISOR_SCHEMA = "sagejs.hyperelliptic-rational-mumford-divisor/v1"
QQ_ORDER_SCHEMA = "sagejs.hyperelliptic-rational-mumford-order/v1"
RATIONAL_REDUCTION_BATCH_ALGORITHM = "prepared-many-prime-mumford-reduction/v1"

TORSION_BOUND_THEOREM = (
    "for good p, reduction injects on prime-to-p rational torsion; "
    "each ell-primary exponent excludes the p=ell reduction"
)
TORSION_BOUND_ALGORITHM = "distinct-good-reduction-primary-bound/v1"
TORSION_ORDER_THEOREM = (
    "exact rational scalar multiplication proves the order; at good p the "
    "specialization kernel on torsion is p-primary"
)
TORSION_ORDER_ALGORITHM = "exact-annihilation-and-prime-factor-strip/v1"
TORSION_BASIS_ALGORITHM = "deterministic-primary-basis-from-input-generators/v1"


class RationalTorsionCapabilityError(NotImplementedError):
    """The requested torsion proof lies outside the implemented envelope."""

    def __init__(self, message: str, diagnostics: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)


class _RationalDivisorNonintegralError(ArithmeticError):
    """A fixed Mumford representative has a denominator divisible by `p`."""


class RationalReductionCancelledError(RuntimeError):
    """A bounded many-prime rational reduction batch was cancelled."""


def _check_cancel(cancel: Any, stage: str) -> None:
    if cancel is not None and bool(cancel()):
        raise RationalReductionCancelledError(
            "rational Mumford reduction cancelled during " + stage
        )


def _frobenius() -> Any:
    return __import__(
        "sagejs.hyperelliptic_curves.frobenius",
        fromlist=["rational_local_lpolynomial"],
    )


def _is_rational_field(base: Any) -> bool:
    return base is sage.QQ or getattr(base, "_kind", None) == "QQ"


def _require_rational_jacobian(jacobian: Any) -> None:
    required = (
        "base_ring",
        "curve",
        "dimension",
        "f",
        "h",
        "polynomial_ring",
        "zero",
    )
    if any(not hasattr(jacobian, name) for name in required):
        raise TypeError("expected a hyperelliptic Jacobian")
    if not _is_rational_field(jacobian.base_ring()):
        raise TypeError("rational torsion requires a Jacobian over QQ")
    genus = int(jacobian.dimension())
    if genus not in (2, 3):
        raise RationalTorsionCapabilityError(
            "rational torsion currently supports genus 2 or 3"
        )
    model_degree = max(jacobian.f().degree(), 2 * jacobian.h().degree())
    if model_degree != 2 * genus + 1:
        raise RationalTorsionCapabilityError(
            "rational torsion currently requires an odd-degree model"
        )


def _checked_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    try:
        exact = value == answer
    except Exception:
        exact = False
    if exact is not True:
        raise ValueError(name + " must be an exact integer")
    return answer


def _canonical_positive_integer(value: Any, name: str) -> int:
    text = str(value)
    try:
        answer = int(text)
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError(name + " is not a canonical decimal integer") from error
    if str(answer) != text or answer <= 0:
        raise ValueError(name + " is not a canonical positive decimal integer")
    return answer


def _gcd(left: int, right: int) -> int:
    while right:
        left, right = right, left % right
    return left if left >= 0 else -left


def _valuation(value: int, prime: int) -> int:
    answer = 0
    while value and value % prime == 0:
        value //= prime
        answer += 1
    return answer


def _rational_data(value: Any) -> dict[str, str]:
    rational = sage.QQ(value)
    numerator = rational.numerator()
    denominator = rational.denominator()
    return {"numerator": str(numerator), "denominator": str(denominator)}


def _rational_pair(value: Any) -> tuple[int, int]:
    """Return the canonical packed numerator/denominator pair for `value`."""
    rational = sage.QQ(value)
    return int(rational.numerator()), int(rational.denominator())


def rational_mumford_fingerprint(jacobian: Any, divisor: Any) -> tuple[Any, ...]:
    """Return a collision-free canonical packed fingerprint.

    This is an internal execution key, not a display-string hash.  Every
    rational coefficient is represented by its lowest-terms signed numerator
    and positive denominator.  Tuple equality therefore resolves ordinary
    hash-table collisions by exact coefficient equality.
    """
    _require_rational_jacobian(jacobian)
    checked = jacobian(divisor, check=True)
    u_value, v_value = checked.uv()
    return (
        QQ_DIVISOR_SCHEMA,
        int(jacobian.dimension()),
        tuple(_rational_pair(value) for value in jacobian.f().list()),
        tuple(_rational_pair(value) for value in jacobian.h().list()),
        tuple(_rational_pair(value) for value in u_value.list()),
        tuple(_rational_pair(value) for value in v_value.list()),
    )


def _rational_from_data(data: Any) -> Any:
    if not hasattr(data, "get"):
        raise TypeError("rational coefficient data must be a mapping")
    numerator = int(str(data.get("numerator")))
    denominator = int(str(data.get("denominator")))
    if str(numerator) != str(data.get("numerator")):
        raise ValueError("a rational numerator is not canonical")
    if str(denominator) != str(data.get("denominator")) or denominator <= 0:
        raise ValueError("a rational denominator is not canonical positive data")
    answer = sage.QQ(numerator) / sage.QQ(denominator)
    if _rational_data(answer) != dict(data):
        raise ValueError("a rational coefficient is not in lowest terms")
    return answer


def _polynomial_data(polynomial: Any) -> tuple[dict[str, str], ...]:
    return tuple(_rational_data(value) for value in polynomial.list())


def _polynomial_from_data(ring: Any, values: Any) -> Any:
    return ring([_rational_from_data(value) for value in values])


def _curve_data(jacobian: Any) -> dict[str, Any]:
    ring = jacobian.polynomial_ring()
    return {
        "genus": int(jacobian.dimension()),
        "variable": str(ring.variable_name()),
        "f_coefficients_ascending": _polynomial_data(jacobian.f()),
        "h_coefficients_ascending": _polynomial_data(jacobian.h()),
    }


def rational_mumford_data(jacobian: Any, divisor: Any) -> dict[str, Any]:
    """Return canonical exact `QQ` data for one checked Mumford divisor."""
    _require_rational_jacobian(jacobian)
    candidate = jacobian(divisor, check=True)
    u_value, v_value = candidate.uv()
    checked = jacobian([u_value, v_value], check=True)
    u_value, v_value = checked.uv()
    return {
        "schema": QQ_DIVISOR_SCHEMA,
        "curve": _curve_data(jacobian),
        "u_coefficients_ascending": _polynomial_data(u_value),
        "v_coefficients_ascending": _polynomial_data(v_value),
    }


def rational_mumford_from_data(jacobian: Any, data: Mapping[str, Any]) -> Any:
    """Reconstruct and exactly validate canonical rational Mumford data."""
    _require_rational_jacobian(jacobian)
    if not hasattr(data, "get") or not hasattr(data, "__getitem__"):
        raise TypeError("rational Mumford data must be a mapping")
    if data.get("schema") != QQ_DIVISOR_SCHEMA:
        raise ValueError("unknown rational Mumford-divisor schema")
    if data.get("curve") != _curve_data(jacobian):
        raise ValueError("the rational Mumford divisor belongs to another Jacobian")
    ring = jacobian.polynomial_ring()
    u_value = _polynomial_from_data(ring, data["u_coefficients_ascending"])
    v_value = _polynomial_from_data(ring, data["v_coefficients_ascending"])
    divisor = jacobian([u_value, v_value], check=True)
    if rational_mumford_data(jacobian, divisor) != dict(data):
        raise ValueError("the rational Mumford divisor is not canonically reduced")
    return divisor


def verify_rational_mumford_divisor(jacobian: Any, divisor: Any) -> Any:
    """Return the canonical divisor after exact equation and reduction checks."""
    if hasattr(divisor, "get"):
        return rational_mumford_from_data(jacobian, divisor)
    checked = jacobian(divisor, check=True)
    # Round-tripping also rejects noncanonical or host-dependent coefficient data.
    return rational_mumford_from_data(
        jacobian, rational_mumford_data(jacobian, checked)
    )


def _factorization_data(factors: Any) -> tuple[tuple[str, int], ...]:
    return tuple((str(prime), int(exponent)) for prime, exponent in factors)


def _parse_factorization_data(value: int, data: Any) -> list[tuple[int, int]]:
    factors: list[Any] = []
    for prime, exponent in data:
        factors.append(
            (
                _canonical_positive_integer(prime, "factor prime"),
                _checked_integer(exponent, "factor exponent"),
            )
        )
    return validate_factorization(value, factors)


def _factorization(
    value: int,
    supplied: Any,
    max_trial_divisions: int,
) -> list[tuple[Any, int]]:
    if supplied is None:
        return factor_integer_bounded(value, max_trial_divisions)
    return validate_factorization(value, list(supplied))


def _good_reduction_row(jacobian: Any, prime: int, algorithm: str) -> dict[str, Any]:
    curve = jacobian.curve()
    frobenius = _frobenius()
    # This constructs and smoothness-checks the actual reduced model.  A local
    # factor alone is not accepted as a good-reduction assertion.
    reduced_curve = frobenius._rational_reduction(curve, prime)
    if int(reduced_curve.genus()) != int(jacobian.dimension()):
        raise ArithmeticError("good reduction changed the genus")
    selected = frobenius._select_rational_algorithm(curve, algorithm, prime, prime)
    polynomial = curve.local_lpolynomial(prime, algorithm=selected)
    coefficients = [int(value) for value in polynomial.list()]
    genus = int(jacobian.dimension())
    if len(coefficients) != 2 * genus + 1 or coefficients[0] != 1:
        raise ArithmeticError("the good local polynomial has invalid degree")
    order = sum(coefficients)
    if order <= 0:
        raise ArithmeticError("the finite Jacobian order is not positive")
    return {
        "prime": str(prime),
        "algorithm": selected,
        "lpolynomial_coefficients_ascending": tuple(
            str(value) for value in coefficients
        ),
        "jacobian_order": str(order),
    }


def _corrected_reduction_bound(rows: Any) -> tuple[int, int, tuple[Any, ...]]:
    values = list(rows)
    if len(values) < 2:
        raise ValueError("a torsion bound needs at least two good reductions")
    orders = [int(row["jacobian_order"]) for row in values]
    common = orders[0]
    for order in orders[1:]:
        common = _gcd(common, order)
    upper = common
    corrections = []
    for index, row in enumerate(values):
        prime = int(row["prime"])
        other_exponent = min(
            _valuation(order, prime)
            for other_index, order in enumerate(orders)
            if other_index != index
        )
        common_exponent = _valuation(common, prime)
        added = other_exponent - common_exponent
        if added < 0:
            raise ArithmeticError("a residue-characteristic correction is negative")
        upper *= prime**added
        corrections.append(
            {
                "prime": str(prime),
                "gcd_valuation": common_exponent,
                "other_reductions_minimum_valuation": other_exponent,
                "added_exponent": added,
            }
        )
    return upper, common, tuple(corrections)


def _default_prime_candidates(max_prime: int) -> list[int]:
    answer = []
    for value in range(3, max_prime + 1, 2):
        if sage.is_prime(value):
            answer.append(value)
    return answer


def _normalize_primes(primes: Any) -> list[int]:
    answer = []
    seen: set[int] = set()
    for value in primes:
        prime = _checked_integer(value, "reduction prime")
        if prime < 2 or not sage.is_prime(prime):
            raise ValueError("every reduction prime must be prime")
        if prime in seen:
            raise ValueError("reduction primes must be distinct")
        answer.append(prime)
        seen.add(prime)
    return sorted(answer)


def _checked_algorithm(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise TypeError("the local-factor algorithm must be a nonempty string")
    return value


def _skipped_reduction_row(prime: int, error: Exception) -> dict[str, str]:
    return {
        "prime": str(prime),
        "status": "unsupported_good_reduction",
        "reason": str(error),
    }


def _scan_good_reductions(
    jacobian: Any,
    candidates: Any,
    requested_count: int,
    automatic: bool,
    algorithm: str,
) -> tuple[list[Any], list[Any]]:
    rows = []
    skipped = []
    for prime in candidates:
        try:
            rows.append(_good_reduction_row(jacobian, int(prime), algorithm))
        except (ArithmeticError, NotImplementedError, ValueError) as error:
            skipped.append(_skipped_reduction_row(int(prime), error))
            if not automatic:
                break
            continue
        if automatic and len(rows) >= requested_count:
            break
    return rows, skipped


def _prime_search_certificate(
    automatic: bool,
    candidates: Any,
    requested_count: int,
    max_prime: int,
    algorithm: str,
) -> dict[str, Any]:
    return {
        "mode": "automatic" if automatic else "explicit",
        "requested_algorithm": algorithm,
        "candidate_primes": tuple(str(prime) for prime in candidates),
        "requested_good_reduction_count": requested_count if automatic else None,
        "maximum_prime": str(max_prime) if automatic else None,
    }


class RationalTwoTorsionData:
    """The exact rational 2-torsion obtained from branch-factor orbits."""

    def __init__(
        self,
        jacobian: Any,
        factors: Any,
        generators: Any,
    ) -> None:
        self.jacobian = jacobian
        self.factor_degrees = tuple(int(factor.degree()) for factor in factors)
        self.dimension = max(0, len(self.factor_degrees) - 1)
        self.order = sage.ZZ(2) ** self.dimension
        self.invariants = tuple(sage.ZZ(2) for _index in range(self.dimension))
        self.generators = tuple(generators)
        self.exact = True
        self.status = "exact"
        self.certificate = {
            "schema": TWO_TORSION_SCHEMA,
            "theorem": (
                "odd-degree rational 2-torsion is the even-subset module on "
                "branch-point Galois orbits modulo complement"
            ),
            "curve": _curve_data(jacobian),
            "completed_branch_factor_coefficients": tuple(
                _polynomial_data(factor) for factor in factors
            ),
            "factor_degrees": self.factor_degrees,
            "dimension": self.dimension,
            "order": str(self.order),
            "generators": tuple(
                rational_mumford_data(jacobian, divisor) for divisor in self.generators
            ),
        }

    def to_dict(self) -> dict[str, Any]:
        return dict(self.certificate)

    def __repr__(self) -> str:
        return (
            "RationalTwoTorsionData(dimension="
            + str(self.dimension)
            + ", order="
            + str(self.order)
            + ")"
        )


def rational_two_torsion(jacobian: Any) -> RationalTwoTorsionData:
    """Return the exact rational 2-torsion for an odd-degree model over `QQ`."""
    _require_rational_jacobian(jacobian)
    completed = jacobian.h() * jacobian.h() + sage.QQ(4) * jacobian.f()
    raw_factors = list(completed.factor())
    factors = []
    for raw_factor, raw_exponent in raw_factors:
        exponent = int(raw_exponent)
        if exponent != 1:
            raise ArithmeticError("the completed branch polynomial is not squarefree")
        leading = raw_factor[raw_factor.degree()]
        factors.append(raw_factor * (sage.QQ(1) / leading))

    def factor_key(factor: Any) -> tuple[int, str]:
        return int(factor.degree()), str(factor)

    factors.sort(key=factor_key)
    generators = []
    half_h = sage.QQ(-1) / sage.QQ(2) * jacobian.h()
    # The sum of all finite branch-factor classes is principal, and these are
    # the only relations.  Omitting one factor gives a canonical basis.
    for factor in factors[:-1]:
        _quotient, remainder = half_h.quo_rem(factor)
        divisor = jacobian([factor, remainder], check=True)
        if divisor.is_zero() or not (2 * divisor).is_zero():
            raise ArithmeticError("branch factor did not define nonzero 2-torsion")
        generators.append(divisor)
    return RationalTwoTorsionData(jacobian, factors, generators)


def verify_two_torsion_certificate(
    jacobian: Any, certificate: Mapping[str, Any]
) -> bool:
    """Recompute and compare a rational 2-torsion certificate."""
    if certificate.get("schema") != TWO_TORSION_SCHEMA:
        raise ValueError("unknown rational 2-torsion certificate schema")
    expected = rational_two_torsion(jacobian).certificate
    if dict(certificate) != expected:
        raise ArithmeticError("the rational 2-torsion certificate is inconsistent")
    return True


class RationalTorsionData:
    """Certified lower/upper data for one rational Jacobian torsion subgroup."""

    def __init__(
        self,
        jacobian: Any,
        upper_certificate: Mapping[str, Any],
        *,
        generators: Any = (),
        invariants: Any = (),
        generator_certificates: Any = (),
        two_torsion: RationalTwoTorsionData | None = None,
        upper_factorization: Any = None,
        supplied_generators: Any = (),
        input_generator_certificates: Any = (),
        basis_derivation: Mapping[str, Any] | None = None,
    ) -> None:
        self.jacobian = jacobian
        self.upper_bound = sage.ZZ(
            _canonical_positive_integer(
                upper_certificate["upper_bound"], "torsion upper bound"
            )
        )
        self.generators = tuple(generators)
        self.invariants = tuple(sage.ZZ(value) for value in invariants)
        self.generator_certificates = tuple(generator_certificates)
        self.supplied_generators = tuple(supplied_generators)
        self.input_generator_certificates = tuple(input_generator_certificates)
        self.basis_derivation = (
            None if basis_derivation is None else dict(basis_derivation)
        )
        lower = sage.ZZ(1)
        for invariant in self.invariants:
            lower *= invariant
        self.lower_bound = lower
        if self.upper_bound % self.lower_bound != 0:
            raise ArithmeticError(
                "the torsion lower bound does not divide its upper bound"
            )
        self.exact = self.lower_bound == self.upper_bound
        self.status = "exact" if self.exact else "bounded"
        self.two_torsion = two_torsion
        self.upper_bound_certificate = dict(upper_certificate)
        self.certificate = {
            "schema": TORSION_RESULT_SCHEMA,
            "curve": _curve_data(jacobian),
            "status": self.status,
            "lower_bound": str(self.lower_bound),
            "upper_bound": str(self.upper_bound),
            "exact": self.exact,
            "invariants": tuple(str(value) for value in self.invariants),
            "generators": tuple(
                rational_mumford_data(jacobian, divisor) for divisor in self.generators
            ),
            "generator_order_certificates": self.generator_certificates,
            "supplied_generators": self.supplied_generators,
            "input_generator_order_certificates": self.input_generator_certificates,
            "basis_derivation": self.basis_derivation,
            "upper_bound_factorization": (
                None
                if upper_factorization is None
                else _factorization_data(upper_factorization)
            ),
            "two_torsion_certificate": (
                None if two_torsion is None else two_torsion.certificate
            ),
            "upper_bound_certificate": self.upper_bound_certificate,
        }

    def bounds(self) -> tuple[Any, Any]:
        return self.lower_bound, self.upper_bound

    def order(self) -> Any:
        if not self.exact:
            raise ValueError("the rational torsion order is not certified exactly")
        return self.upper_bound

    def to_dict(self) -> dict[str, Any]:
        return dict(self.certificate)

    def __repr__(self) -> str:
        if self.exact:
            return (
                "RationalTorsionData(exact_order="
                + str(self.upper_bound)
                + ", invariants="
                + repr(self.invariants)
                + ")"
            )
        return (
            "RationalTorsionData(lower_bound="
            + str(self.lower_bound)
            + ", upper_bound="
            + str(self.upper_bound)
            + ")"
        )


def torsion_bound(
    jacobian: Any,
    primes: Any = None,
    *,
    count: Any = 3,
    max_prime: Any = 47,
    algorithm: str = "auto",
    include_two_torsion: bool = True,
) -> RationalTorsionData:
    """Prove a rational-torsion upper bound from distinct good reductions.

    When `primes` is omitted, bad and nonintegral primes are skipped within the
    deterministic odd-prime search through `max_prime`.  Explicitly supplied
    primes are all required to be good so that a typo cannot silently weaken a
    requested certificate.
    """
    _require_rational_jacobian(jacobian)
    requested_count = _checked_integer(count, "good reduction count")
    checked_maximum = _checked_integer(max_prime, "maximum reduction prime")
    requested_algorithm = _checked_algorithm(algorithm)
    if requested_count < 2:
        raise ValueError("at least two good reductions are required")
    if checked_maximum < 3:
        raise ValueError("max_prime must be at least 3")
    automatic = primes is None
    candidates = (
        _default_prime_candidates(checked_maximum)
        if automatic
        else _normalize_primes(primes)
    )
    if not automatic and len(candidates) < 2:
        raise ValueError("at least two distinct reduction primes are required")

    rows, skipped = _scan_good_reductions(
        jacobian,
        candidates,
        requested_count,
        automatic,
        requested_algorithm,
    )
    if not automatic and skipped:
        failed = skipped[0]
        raise RationalTorsionCapabilityError(
            "the supplied reduction prime p="
            + str(failed["prime"])
            + " is not a certified supported good prime",
            {"prime": int(failed["prime"]), "error": failed["reason"]},
        )
    if len(rows) < 2:
        raise RationalTorsionCapabilityError(
            "fewer than two supported good reductions were found",
            {
                "max_prime": checked_maximum,
                "good_reductions": tuple(rows),
                "skipped": tuple(skipped),
            },
        )
    upper, common, corrections = _corrected_reduction_bound(rows)
    history = []
    for length in range(2, len(rows) + 1):
        partial_upper, _partial_common, _partial_corrections = (
            _corrected_reduction_bound(rows[:length])
        )
        history.append(
            {
                "primes": tuple(row["prime"] for row in rows[:length]),
                "upper_bound": str(partial_upper),
            }
        )
    upper_certificate = {
        "schema": TORSION_BOUND_SCHEMA,
        "curve": _curve_data(jacobian),
        "theorem": TORSION_BOUND_THEOREM,
        "proof_algorithm": TORSION_BOUND_ALGORITHM,
        "prime_search": _prime_search_certificate(
            automatic,
            candidates,
            requested_count,
            checked_maximum,
            requested_algorithm,
        ),
        "good_reductions": tuple(rows),
        "raw_gcd": str(common),
        "residue_characteristic_corrections": corrections,
        "bound_history": tuple(history),
        "upper_bound": str(upper),
        "skipped_candidates": tuple(skipped),
    }
    verify_torsion_bound_certificate(jacobian, upper_certificate)

    two_torsion = rational_two_torsion(jacobian) if include_two_torsion else None
    generators = () if two_torsion is None else two_torsion.generators
    invariants = () if two_torsion is None else two_torsion.invariants
    if two_torsion is not None and upper % int(two_torsion.order) != 0:
        raise ArithmeticError("good reductions contradict rational 2-torsion")
    result = RationalTorsionData(
        jacobian,
        upper_certificate,
        generators=generators,
        invariants=invariants,
        two_torsion=two_torsion,
    )
    verify_torsion_result_certificate(jacobian, result.certificate)
    return result


def verify_torsion_bound_certificate(
    jacobian: Any, certificate: Mapping[str, Any]
) -> bool:
    """Recompute all local orders and replay a reduction-bound certificate."""
    _require_rational_jacobian(jacobian)
    if certificate.get("schema") != TORSION_BOUND_SCHEMA:
        raise ValueError("unknown rational torsion-bound certificate schema")
    expected_certificate_keys = {
        "schema",
        "curve",
        "theorem",
        "proof_algorithm",
        "prime_search",
        "good_reductions",
        "raw_gcd",
        "residue_characteristic_corrections",
        "bound_history",
        "upper_bound",
        "skipped_candidates",
    }
    if set(certificate.keys()) != expected_certificate_keys:
        raise ValueError("a torsion-bound certificate has noncanonical fields")
    if certificate.get("curve") != _curve_data(jacobian):
        raise ValueError("the torsion-bound certificate belongs to another Jacobian")
    if certificate.get("theorem") != TORSION_BOUND_THEOREM:
        raise ValueError("the torsion-bound theorem is not canonical")
    if certificate.get("proof_algorithm") != TORSION_BOUND_ALGORITHM:
        raise ValueError("the torsion-bound proof algorithm is not canonical")

    search_value = certificate.get("prime_search")
    if search_value is None or not hasattr(search_value, "get"):
        raise ValueError("the torsion-bound prime search is not canonical")
    search: Mapping[str, Any] = search_value
    if set(search.keys()) != {
        "mode",
        "requested_algorithm",
        "candidate_primes",
        "requested_good_reduction_count",
        "maximum_prime",
    }:
        raise ValueError("the torsion-bound prime search is not canonical")
    mode = search.get("mode")
    if mode not in ("automatic", "explicit"):
        raise ValueError("unknown torsion-bound prime-search mode")
    requested_algorithm = _checked_algorithm(search.get("requested_algorithm"))
    candidate_primes = tuple(
        _canonical_positive_integer(value, "candidate reduction prime")
        for value in search.get("candidate_primes", ())
    )
    if tuple(_normalize_primes(candidate_primes)) != candidate_primes:
        raise ValueError("candidate reduction primes are not canonical")
    automatic = mode == "automatic"
    if automatic:
        requested_count = _checked_integer(
            search.get("requested_good_reduction_count"),
            "requested good reduction count",
        )
        maximum = _canonical_positive_integer(
            search.get("maximum_prime"), "maximum reduction prime"
        )
        if requested_count < 2 or maximum < 3:
            raise ValueError("the automatic prime search has invalid limits")
        if candidate_primes != tuple(_default_prime_candidates(maximum)):
            raise ValueError("the automatic candidate-prime list is inconsistent")
    else:
        if (
            search.get("requested_good_reduction_count") is not None
            or search.get("maximum_prime") is not None
        ):
            raise ValueError("an explicit prime search has automatic-only limits")
        requested_count = len(candidate_primes)
        if requested_count < 2:
            raise ValueError("an explicit prime search needs two candidates")

    expected_rows, expected_skipped = _scan_good_reductions(
        jacobian,
        candidate_primes,
        requested_count,
        automatic,
        requested_algorithm,
    )
    if not automatic and expected_skipped:
        raise ArithmeticError("an explicit certified reduction prime is unsupported")
    claimed_rows = list(certificate.get("good_reductions", ()))
    if len(claimed_rows) < 2:
        raise ValueError("a torsion-bound certificate needs two good reductions")
    if tuple(dict(row) for row in claimed_rows) != tuple(expected_rows):
        raise ArithmeticError("the certified good-reduction scan is inconsistent")
    if tuple(certificate.get("skipped_candidates", ())) != tuple(expected_skipped):
        raise ArithmeticError("the certified skipped-prime scan is inconsistent")
    primes = []
    recomputed = []
    for row, expected in zip(claimed_rows, expected_rows, strict=True):
        prime = _canonical_positive_integer(row.get("prime"), "reduction prime")
        if prime in primes or not sage.is_prime(prime):
            raise ValueError("certificate reduction primes must be distinct primes")
        expected_keys = {
            "prime",
            "algorithm",
            "lpolynomial_coefficients_ascending",
            "jacobian_order",
        }
        if set(row.keys()) != expected_keys:
            raise ValueError("a good-reduction row has noncanonical fields")
        if dict(row) != expected:
            raise ArithmeticError("a certified finite-field order is inconsistent")
        primes.append(prime)
        recomputed.append(dict(row))
    if primes != sorted(primes):
        raise ValueError("certificate reduction primes must be sorted")
    upper, common, corrections = _corrected_reduction_bound(recomputed)
    if str(common) != str(certificate.get("raw_gcd")):
        raise ArithmeticError("the claimed raw reduction gcd is inconsistent")
    if corrections != tuple(certificate.get("residue_characteristic_corrections", ())):
        raise ArithmeticError("the residue-characteristic corrections are inconsistent")
    expected_history = []
    for length in range(2, len(recomputed) + 1):
        partial_upper, _partial_common, _partial_corrections = (
            _corrected_reduction_bound(recomputed[:length])
        )
        expected_history.append(
            {
                "primes": tuple(row["prime"] for row in recomputed[:length]),
                "upper_bound": str(partial_upper),
            }
        )
    if tuple(expected_history) != tuple(certificate.get("bound_history", ())):
        raise ArithmeticError("the progressive torsion-bound history is inconsistent")
    claimed_upper = _canonical_positive_integer(
        certificate.get("upper_bound"), "torsion upper bound"
    )
    if upper != claimed_upper:
        raise ArithmeticError("the claimed torsion upper bound is inconsistent")
    return True


def _prepared_reduced_jacobian(jacobian: Any, prime: int) -> Any:
    frobenius = _frobenius()
    reduced_curve = frobenius._rational_reduction(jacobian.curve(), prime)
    return reduced_curve.jacobian()


def _reduce_rational_divisors_prepared(
    jacobian: Any,
    divisors: Any,
    prime: int,
    reduced_jacobian: Any,
    *,
    cancel: Any = None,
) -> tuple[Any, ...]:
    field = reduced_jacobian.base_ring()
    ring = reduced_jacobian.polynomial_ring()

    def reduced_coefficients(polynomial: Any) -> list[Any]:
        values = []
        for coefficient in polynomial.list():
            rational = sage.QQ(coefficient)
            denominator = int(rational.denominator())
            if denominator % prime == 0:
                raise _RationalDivisorNonintegralError(
                    "the Mumford representative has a denominator divisible by p="
                    + str(prime)
                )
            values.append(field(int(rational.numerator())) / field(denominator % prime))
        return values

    answer = []
    for index, divisor in enumerate(divisors):
        if index % 32 == 0:
            _check_cancel(cancel, "basis reduction")
        u_value, v_value = divisor.uv()
        answer.append(
            reduced_jacobian(
                [
                    ring(reduced_coefficients(u_value)),
                    ring(reduced_coefficients(v_value)),
                ],
                check=True,
            )
        )
    return tuple(answer)


def _reduce_rational_divisor(jacobian: Any, divisor: Any, prime: int) -> Any:
    reduced_jacobian = _prepared_reduced_jacobian(jacobian, prime)
    return _reduce_rational_divisors_prepared(
        jacobian, (divisor,), prime, reduced_jacobian
    )[0]


class _PackedFiniteMumfordRows:
    """A bounded lazy view of canonical rows in one native output buffer."""

    def __init__(
        self,
        output: Any,
        statuses: Any,
        output_cache: Any,
        start: int,
        count: int,
        cancel: Any,
    ) -> None:
        self._output = output
        self._statuses = statuses
        self._output_cache = output_cache
        self._start = start
        self._count = count
        self._cancel = cancel

    def __len__(self) -> int:
        return self._count

    def __getitem__(self, raw_index: Any) -> Any:
        index = int(raw_index)
        if index < 0:
            index += self._count
        if index < 0 or index >= self._count:
            raise IndexError("packed finite Mumford row index out of range")
        if index % 256 == 0:
            _check_cancel(self._cancel, "packed finite row materialization")
        pair_index = self._start + index
        if int(self._statuses[pair_index]) != 1:
            return None
        values = self._output_cache[0]
        if values is None:
            values = integer_buffer_values(self._output)
            self._output_cache[0] = values
        offset = pair_index * 8
        return tuple(int(values[offset + word]) for word in range(8))

    def __iter__(self) -> Any:
        index = 0
        while index < self._count:
            yield self[index]
            index += 1


class PreparedRationalReductionBatch:
    """Prepared, bounded reduction of one rational Mumford basis.

    The rational coefficients are validated and packed once. One native call
    fills canonical rows for every divisor/prime pair, and one reduced curve
    context is retained per requested prime. Pair and peak-memory limits make
    that retention explicit; `iter_chunks` bounds it independently of a long
    prime stream.
    """

    def __init__(
        self,
        jacobian: Any,
        divisors: Any,
        *,
        max_memory_bytes: Any = 256 * 1024 * 1024,
        max_kernel_pairs: Any = 1_000_000,
        cancel: Any = None,
    ) -> None:
        _require_rational_jacobian(jacobian)
        if cancel is not None and not callable(cancel):
            raise TypeError("cancel must be callable")
        maximum = _checked_integer(max_memory_bytes, "max_memory_bytes")
        maximum_pairs = _checked_integer(max_kernel_pairs, "max_kernel_pairs")
        if maximum < 1:
            raise ValueError("max_memory_bytes must be positive")
        if maximum_pairs < 1:
            raise ValueError("max_kernel_pairs must be positive")
        checked = tuple(
            verify_rational_mumford_divisor(jacobian, divisor) for divisor in divisors
        )
        # This deliberately charges arbitrary-precision integer storage by
        # magnitude, not merely by coefficient count.
        bit_count = 0
        fingerprints = []
        degrees = []
        numerators = []
        denominators = []
        for divisor in checked:
            fingerprint = rational_mumford_fingerprint(jacobian, divisor)
            fingerprints.append(fingerprint)
            u_value, v_value = divisor.uv()
            degrees.append(int(u_value.degree()))
            for polynomial, capacity in ((u_value, 4), (v_value, 3)):
                coefficients = polynomial.list()
                for index in range(capacity):
                    coefficient = (
                        coefficients[index] if index < len(coefficients) else 0
                    )
                    numerator, denominator = _rational_pair(coefficient)
                    numerators.append(numerator)
                    denominators.append(denominator)
                    bit_count += max(1, abs(numerator).bit_length())
                    bit_count += max(1, denominator.bit_length())
        estimated_bytes = 512 + len(checked) * 256 + (bit_count + 7) // 8
        if estimated_bytes > maximum:
            raise RationalTorsionCapabilityError(
                "prepared rational Mumford basis exceeds max_memory_bytes="
                + str(maximum),
                {
                    "estimated_bytes": estimated_bytes,
                    "max_memory_bytes": maximum,
                    "divisor_count": len(checked),
                },
            )
        self.jacobian = jacobian
        self.divisors = checked
        self.fingerprints = tuple(fingerprints)
        self.max_memory_bytes = maximum
        self.max_kernel_pairs = maximum_pairs
        self.estimated_bytes = estimated_bytes
        self.cancel = cancel
        self.algorithm = RATIONAL_REDUCTION_BATCH_ALGORITHM
        self._degrees = tuple(degrees)
        self._numerators = tuple(numerators)
        self._denominators = tuple(denominators)
        self._native_input_cache: tuple[Any, Any, Any, Any] | None = None

    def _kernel(self) -> Any:
        module = __import__(
            "sagejs.hyperelliptic_curves.rational_reduction_kernels",
            fromlist=["reduce_rational_mumford_many_primes"],
        )
        return module.reduce_rational_mumford_many_primes

    def _kernel_inputs(self, kernel: Any) -> tuple[Any, Any, Any]:
        cached = self._native_input_cache
        if cached is not None and cached[0] is kernel:
            return cached[1], cached[2], cached[3]
        degrees = kernel_uint64_buffer(kernel, self._degrees)
        numerators = kernel_integer_buffer(kernel, self._numerators)
        denominators = kernel_integer_buffer(kernel, self._denominators)
        self._native_input_cache = (kernel, degrees, numerators, denominators)
        return degrees, numerators, denominators

    def _reduction_batch_bytes(self, prime_count: int) -> int:
        # Eight uint64 words and one status word for every prime/divisor pair.
        return int(prime_count) * len(self.divisors) * 9 * 8

    def _materialized_batch_bytes(self, prime_count: int) -> int:
        # Lazy row consumption may additionally materialize the eight output
        # words as exact host integers.  Charge that peak before the kernel.
        return int(prime_count) * len(self.divisors) * 8 * 8

    def reduce_many(
        self,
        primes: Any,
        *,
        algorithm: str = "auto",
        allow_nonintegral: bool = False,
        packed: bool = False,
        diagnostics: bool = False,
    ) -> Any:
        """Reduce the prepared basis across many primes in one kernel call.

        Native output is retained in the finite prepared context's canonical
        packed representation.  The source rational divisors were exactly
        validated before packing, and each reduced curve is independently
        smoothness-checked before a row is published.  Certificate verification
        continues to reconstruct every divisor through the reference path.
        """
        if algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown rational reduction algorithm " + repr(algorithm))
        values = tuple(_normalize_primes(primes))
        if not values:
            return ((), {"selected": "reference", "count": 0}) if diagnostics else ()
        _check_cancel(self.cancel, "many-prime kernel preparation")
        pair_count = len(values) * len(self.divisors)
        if pair_count > self.max_kernel_pairs:
            raise RationalTorsionCapabilityError(
                "packed rational reduction exceeds max_kernel_pairs="
                + str(self.max_kernel_pairs),
                {
                    "prime_count": len(values),
                    "divisor_count": len(self.divisors),
                    "pair_count": pair_count,
                    "max_kernel_pairs": self.max_kernel_pairs,
                },
            )
        batch_bytes = self._reduction_batch_bytes(len(values))
        materialized_bytes = self._materialized_batch_bytes(len(values))
        if (
            self.estimated_bytes + batch_bytes + materialized_bytes
            > self.max_memory_bytes
        ):
            raise RationalTorsionCapabilityError(
                "packed rational reduction output exceeds max_memory_bytes="
                + str(self.max_memory_bytes),
                {
                    "estimated_input_bytes": self.estimated_bytes,
                    "estimated_output_bytes": batch_bytes,
                    "estimated_materialized_bytes": materialized_bytes,
                    "prime_count": len(values),
                    "divisor_count": len(self.divisors),
                },
            )
        if algorithm == "reference":
            rows = []
            for prime in values:
                reduced_jacobian = _prepared_reduced_jacobian(self.jacobian, prime)
                reduced_values = []
                for divisor in self.divisors:
                    try:
                        reduced = _reduce_rational_divisors_prepared(
                            self.jacobian,
                            (divisor,),
                            prime,
                            reduced_jacobian,
                            cancel=self.cancel,
                        )[0]
                    except _RationalDivisorNonintegralError:
                        if not allow_nonintegral:
                            raise
                        reduced = None
                    if reduced is None or not packed:
                        reduced_values.append(reduced)
                    else:
                        prepared = reduced_jacobian.prepared_arithmetic(
                            algorithm="auto", max_batch_items=1
                        )
                        reduced_values.append(prepared.pack(reduced))
                rows.append(
                    {
                        "prime": prime,
                        "algorithm": self.algorithm,
                        "reduced_jacobian": reduced_jacobian,
                        "divisors": tuple(reduced_values),
                        "fingerprints": self.fingerprints,
                    }
                )
            answer = tuple(rows)
            record = {
                "requested": algorithm,
                "selected": "reference",
                "prime_count": len(values),
                "divisor_count": len(self.divisors),
                "kernel_crossings": 0,
                "packed_output_bytes": batch_bytes,
                "packed_results": packed,
            }
            return (answer, record) if diagnostics else answer

        native_domain = all(3 <= prime <= 4_294_967_295 for prime in values)
        if algorithm == "native" and not native_domain:
            raise NotImplementedError(
                "packed rational reduction requires odd primes at most 2^32-1"
            )
        if not native_domain:
            return self.reduce_many(
                values,
                algorithm="reference",
                allow_nonintegral=allow_nonintegral,
                packed=packed,
                diagnostics=diagnostics,
            )
        kernel = self._kernel()
        compiled = is_compiled(kernel)
        if algorithm == "native" and not compiled:
            raise NotImplementedError(
                "the packed rational many-prime reduction kernel is unavailable"
            )
        if not compiled:
            return self.reduce_many(
                values,
                algorithm="reference",
                allow_nonintegral=allow_nonintegral,
                packed=packed,
                diagnostics=diagnostics,
            )
        degrees, numerators, denominators = self._kernel_inputs(kernel)
        output = kernel_uint64_zeros(kernel, pair_count * 8)
        statuses = kernel_uint64_zeros(kernel, pair_count)
        accepted = kernel(
            output,
            statuses,
            degrees,
            numerators,
            denominators,
            kernel_uint64_buffer(kernel, values),
            len(self.divisors),
            len(values),
        )
        if not accepted:
            raise ArithmeticError("packed rational many-prime reduction failed closed")
        _check_cancel(self.cancel, "many-prime kernel publication")
        status_values = integer_buffer_values(statuses)
        output_cache = [None]
        if not allow_nonintegral:
            for pair_index, status in enumerate(status_values):
                if int(status) != 1:
                    prime = values[pair_index // len(self.divisors)]
                    raise _RationalDivisorNonintegralError(
                        "the Mumford representative has a denominator divisible by p="
                        + str(prime)
                    )
        rows = []
        for prime_index, prime in enumerate(values):
            reduced_jacobian = _prepared_reduced_jacobian(self.jacobian, prime)
            prepared = reduced_jacobian.prepared_arithmetic(
                algorithm="auto", max_batch_items=max(1, len(self.divisors))
            )
            publisher = getattr(prepared, "_new_packed_divisor", None)
            if not packed and publisher is None:
                raise NotImplementedError(
                    "the finite prepared context cannot retain proved packed rows"
                )
            if packed:
                reduced = _PackedFiniteMumfordRows(
                    output,
                    status_values,
                    output_cache,
                    prime_index * len(self.divisors),
                    len(self.divisors),
                    self.cancel,
                )
                rows.append(
                    {
                        "prime": prime,
                        "algorithm": self.algorithm,
                        "reduced_jacobian": reduced_jacobian,
                        "divisors": reduced,
                        "fingerprints": self.fingerprints,
                    }
                )
                continue
            if publisher is None:
                raise NotImplementedError(
                    "the finite prepared context cannot publish proved packed rows"
                )
            reduced = []
            for divisor_index in range(len(self.divisors)):
                pair_index = prime_index * len(self.divisors) + divisor_index
                if int(status_values[pair_index]) != 1:
                    if not allow_nonintegral:
                        raise _RationalDivisorNonintegralError(
                            "the Mumford representative has a denominator divisible by p="
                            + str(prime)
                        )
                    reduced.append(None)
                    continue
                offset = pair_index * 8
                row = tuple(int(output[offset + index]) for index in range(8))
                reduced.append(publisher(row))
            rows.append(
                {
                    "prime": prime,
                    "algorithm": self.algorithm,
                    "reduced_jacobian": reduced_jacobian,
                    "divisors": tuple(reduced),
                    "fingerprints": self.fingerprints,
                }
            )
        answer = tuple(rows)
        record = {
            "requested": algorithm,
            "selected": "native",
            "prime_count": len(values),
            "divisor_count": len(self.divisors),
            "kernel_crossings": 1,
            "packed_output_bytes": batch_bytes,
            "max_retained_and_materialized_bytes": batch_bytes + materialized_bytes,
            "packed_results": packed,
        }
        return (answer, record) if diagnostics else answer

    def reduce_prime(self, prime: Any) -> dict[str, Any]:
        """Reduce the entire prepared basis at one checked good prime."""
        checked_prime = _checked_integer(prime, "reduction prime")
        if checked_prime < 2 or not sage.is_prime(checked_prime):
            raise ValueError("reduction prime must be prime")
        return self.reduce_many((checked_prime,))[0]

    def iter_chunks(self, primes: Any, *, chunk_size: Any = 8) -> Any:
        """Yield bounded tuples of reduction rows in canonical prime order."""
        size = _checked_integer(chunk_size, "chunk_size")
        if size < 1:
            raise ValueError("chunk_size must be positive")
        values = _normalize_primes(primes)
        chunk = []
        for prime in values:
            _check_cancel(self.cancel, "prime iteration")
            chunk.append(prime)
            if len(chunk) >= size:
                yield self.reduce_many(tuple(chunk))
                chunk = []
        if chunk:
            yield self.reduce_many(tuple(chunk))


def _is_power_of_prime(value: int, prime: int) -> bool:
    remaining = value
    while remaining > 1 and remaining % prime == 0:
        remaining //= prime
    return remaining == 1


def _reduction_order_witness(
    jacobian: Any,
    divisor: Any,
    order: int,
    order_factors: Any,
    row: Mapping[str, Any],
) -> dict[str, Any]:
    prime = _canonical_positive_integer(row.get("prime"), "reduction prime")
    try:
        reduced = _reduce_rational_divisor(jacobian, divisor, prime)
        return _reduction_order_witness_from_reduced(reduced, order, order_factors, row)
    except _RationalDivisorNonintegralError as error:
        return {
            "prime": str(prime),
            "status": "nonintegral",
            "reason": str(error),
        }
    except NotImplementedError as error:
        return {
            "prime": str(prime),
            "status": "unsupported",
            "reason": str(error),
        }


def _reduction_order_witness_from_reduced(
    reduced: Any,
    order: int,
    order_factors: Any,
    row: Mapping[str, Any],
) -> dict[str, Any]:
    """Factor-and-strip one already reduced point on the reference path."""
    prime = _canonical_positive_integer(row.get("prime"), "reduction prime")
    if not reduced.scalar_multiple(order, algorithm="reference").is_zero():
        raise ArithmeticError(
            "the rational divisor order does not annihilate its reduction"
        )
    reduced_order = order
    for factor_prime, exponent in order_factors:
        for _index in range(int(exponent)):
            candidate = reduced_order // int(factor_prime)
            if not reduced.scalar_multiple(candidate, algorithm="reference").is_zero():
                break
            reduced_order = candidate
    finite_order = _canonical_positive_integer(
        row.get("jacobian_order"), "finite Jacobian order"
    )
    if order % reduced_order != 0:
        raise ArithmeticError("a reduced divisor order does not divide its QQ order")
    if finite_order % reduced_order != 0:
        raise ArithmeticError("a reduced divisor order does not divide #J(F_p)")
    kernel_quotient = order // reduced_order
    if not _is_power_of_prime(kernel_quotient, prime):
        raise ArithmeticError(
            "the specialization order quotient is not residue-characteristic primary"
        )
    return {
        "prime": str(prime),
        "status": "verified",
        "finite_jacobian_order": str(finite_order),
        "reduction_order": str(reduced_order),
        "specialization_kernel_quotient": str(kernel_quotient),
    }


def _scalar_zero_batch(
    reduced_jacobian: Any,
    divisors: Any,
    scalars: Any,
    *,
    algorithm: str,
) -> tuple[bool, ...]:
    """Test varying scalar multiples with a prepared context when available."""
    points = tuple(divisors)
    values = tuple(int(value) for value in scalars)
    if len(points) != len(values):
        raise ValueError("a scalar batch has inconsistent lengths")
    if not points:
        return ()
    if algorithm != "reference":
        prepared_method = getattr(reduced_jacobian, "prepared_arithmetic", None)
        if prepared_method is not None:
            try:
                prepared = prepared_method(
                    algorithm=algorithm, max_batch_items=max(1, len(points))
                )
                results = prepared.scalar_batch(points, values)
                return tuple(result.is_zero() for result in results)
            except (ArithmeticError, NotImplementedError, RuntimeError, TypeError):
                if algorithm != "auto":
                    raise
    return tuple(
        point.scalar_multiple(value, algorithm="reference").is_zero()
        for point, value in zip(points, values, strict=True)
    )


def _packed_scalar_batch_rows(
    reduced_jacobian: Any,
    packed_divisors: Any,
    scalars: Any,
    *,
    algorithm: str,
) -> tuple[tuple[int, ...], ...]:
    """Multiply packed finite rows without publishing intermediate divisors."""
    rows = tuple(tuple(int(word) for word in row) for row in packed_divisors)
    values = tuple(int(value) for value in scalars)
    if len(rows) != len(values):
        raise ValueError("a packed scalar batch has inconsistent lengths")
    if not rows:
        return ()
    if any(value < 0 for value in values):
        raise ValueError("packed finite order tests require nonnegative scalars")
    if algorithm != "reference":
        module = __import__(
            "sagejs.hyperelliptic_curves.jacobian_kernels",
            fromlist=["packed_cantor_scalar_batch"],
        )
        kernel = module.packed_cantor_scalar_batch
        if is_compiled(kernel):
            prepared = reduced_jacobian.prepared_arithmetic(
                algorithm="native", max_batch_items=max(1, len(rows))
            )
            maximum_bits = max((value.bit_length() for value in values), default=0)
            words_per_scalar = max(1, (maximum_bits + 63) // 64)
            scalar_words = []
            for value in values:
                magnitude = value
                for _index in range(words_per_scalar):
                    scalar_words.append(magnitude % (1 << 64))
                    magnitude //= 1 << 64
            output = kernel_uint64_zeros(kernel, len(rows) * 8)
            statuses = kernel_uint64_zeros(kernel, len(rows))
            accepted = kernel(
                output,
                statuses,
                kernel_uint64_buffer(kernel, prepared.model_coefficients),
                kernel_uint64_buffer(
                    kernel, tuple(word for row in rows for word in row)
                ),
                kernel_uint64_buffer(kernel, scalar_words),
                kernel_uint64_buffer(kernel, (0 for _row in rows)),
                len(rows),
                words_per_scalar,
                int(reduced_jacobian.genus()),
                int(reduced_jacobian.base_ring().characteristic()),
            )
            if not accepted:
                raise ArithmeticError(
                    "the packed finite scalar kernel rejected a torsion witness batch"
                )
            status_values = integer_buffer_values(statuses)
            if any(int(value) == 0 for value in status_values):
                raise ArithmeticError(
                    "the packed finite scalar kernel returned a failed witness item"
                )
            output_values = integer_buffer_values(output)
            return tuple(
                tuple(int(output_values[8 * index + offset]) for offset in range(8))
                for index in range(len(rows))
            )
        if algorithm != "auto":
            raise NotImplementedError("the packed finite scalar kernel is unavailable")
    prepared = reduced_jacobian.prepared_arithmetic(
        algorithm="auto", max_batch_items=max(1, len(rows))
    )
    points = tuple(prepared.unpack(row) for row in rows)
    products = tuple(
        point.scalar_multiple(value, algorithm="reference")
        for point, value in zip(points, values, strict=True)
    )
    return tuple(prepared.pack(product) for product in products)


def _packed_scalar_zero_batch(
    reduced_jacobian: Any,
    packed_divisors: Any,
    scalars: Any,
    *,
    algorithm: str,
) -> tuple[bool, ...]:
    """Test scalar zeroes without publishing intermediate finite divisors."""
    products = _packed_scalar_batch_rows(
        reduced_jacobian, packed_divisors, scalars, algorithm=algorithm
    )
    return tuple(row[0] == 0 for row in products)


def _reduction_order_witnesses_batch_from_reduced(
    reduced_jacobian: Any,
    reduced_points: Any,
    exact_orders: Any,
    row: Mapping[str, Any],
    *,
    algorithm: str = "auto",
    packed: bool = False,
) -> tuple[dict[str, Any], ...]:
    """Batch annihilation and factor stripping for one residue field."""
    points = tuple(reduced_points)
    exact = tuple(exact_orders)
    if len(points) != len(exact):
        raise ValueError("a reduced order batch has inconsistent lengths")
    orders = [int(value[0]) for value in exact]
    zero_batch = _packed_scalar_zero_batch if packed else _scalar_zero_batch
    annihilated = zero_batch(reduced_jacobian, points, orders, algorithm=algorithm)
    if not all(annihilated):
        raise ArithmeticError(
            "a rational divisor order does not annihilate its reduction"
        )
    factor_primes = []
    for _order, factors in exact:
        for factor_prime, _exponent in factors:
            prime = int(factor_prime)
            if prime not in factor_primes:
                factor_primes.append(prime)
    for factor_prime in factor_primes:
        blocked: set[int] = set()
        while True:
            indices = [
                index
                for index, value in enumerate(orders)
                if index not in blocked and value % factor_prime == 0
            ]
            if not indices:
                break
            candidates = [orders[index] // factor_prime for index in indices]
            zeroes = zero_batch(
                reduced_jacobian,
                tuple(points[index] for index in indices),
                candidates,
                algorithm=algorithm,
            )
            changed = False
            for index, candidate, is_zero in zip(
                indices, candidates, zeroes, strict=True
            ):
                if is_zero:
                    orders[index] = candidate
                    changed = True
                else:
                    blocked.add(index)
            # Points which fail at q never become q-divisible after stripping
            # other primes.  Avoid repeating the same failed scalar test.
            if not changed:
                break
    finite_order = _canonical_positive_integer(
        row.get("jacobian_order"), "finite Jacobian order"
    )
    residue_prime = _canonical_positive_integer(row.get("prime"), "reduction prime")
    answer = []
    for (rational_order, _factors), reduced_order in zip(exact, orders, strict=True):
        rational_value = int(rational_order)
        if rational_value % reduced_order != 0:
            raise ArithmeticError(
                "a reduced divisor order does not divide its QQ order"
            )
        if finite_order % reduced_order != 0:
            raise ArithmeticError("a reduced divisor order does not divide #J(F_p)")
        quotient = rational_value // reduced_order
        if not _is_power_of_prime(quotient, residue_prime):
            raise ArithmeticError(
                "the specialization order quotient is not residue-characteristic primary"
            )
        answer.append(
            {
                "prime": str(residue_prime),
                "status": "verified",
                "finite_jacobian_order": str(finite_order),
                "reduction_order": str(reduced_order),
                "specialization_kernel_quotient": str(quotient),
            }
        )
    return tuple(answer)


def _exact_order_without_reductions(
    jacobian: Any,
    divisor: Any,
    upper_bound: int,
    factors: Any,
) -> tuple[int, tuple[tuple[int, int], ...]]:
    if not divisor.scalar_multiple(upper_bound, algorithm="reference").is_zero():
        raise ValueError(
            "a supplied rational divisor is not torsion within the certified bound"
        )
    order = upper_bound
    for prime, exponent in factors:
        for _index in range(int(exponent)):
            candidate = order // int(prime)
            if not divisor.scalar_multiple(candidate, algorithm="reference").is_zero():
                break
            order = candidate
    order_factors = []
    remaining = order
    for prime, _exponent in factors:
        exponent = _valuation(remaining, int(prime))
        if exponent:
            order_factors.append((int(prime), exponent))
            remaining //= int(prime) ** exponent
    if remaining != 1:
        raise ArithmeticError("the divisor order has an unknown prime factor")
    return order, tuple(order_factors)


def _order_certificates_batch(
    jacobian: Any,
    divisors: Any,
    upper_bound: int,
    factors: Any,
    reduction_rows: Any,
    *,
    cancel: Any = None,
) -> tuple[dict[str, Any], ...]:
    """Build factor-and-strip certificates while sharing prime preparation.

    Rational scalar arithmetic remains on the ordinary reference path.  Exact
    coefficient reduction crosses the packed kernel once for all supported
    prime/divisor pairs, while finite-field order tests consume the retained
    packed rows.  Certificate verification reconstructs and replays each
    reduction independently through the reference path.
    """
    checked = tuple(divisors)
    exact = []
    for index, divisor in enumerate(checked):
        if index % 8 == 0:
            _check_cancel(cancel, "rational order stripping")
        order, order_factors = _exact_order_without_reductions(
            jacobian, divisor, upper_bound, factors
        )
        exact.append((order, order_factors))

    witnesses: list[list[Any]] = [[] for _divisor in checked]
    packed_rows = {}
    if checked:
        reduction_primes = tuple(
            _canonical_positive_integer(row.get("prime"), "reduction prime")
            for row in reduction_rows
        )
        try:
            prepared_reductions = PreparedRationalReductionBatch(
                jacobian, checked, cancel=cancel
            ).reduce_many(
                reduction_primes,
                algorithm="auto",
                allow_nonintegral=True,
                packed=True,
            )
            packed_rows = {
                int(prepared["prime"]): prepared for prepared in prepared_reductions
            }
        except (ArithmeticError, NotImplementedError, ValueError, ZeroDivisionError):
            # An unsupported model or prime must not make certificate creation
            # less capable.  The per-prime reference path below preserves the
            # prior unsupported/nonintegral witness semantics.
            packed_rows = {}
    for row in reduction_rows:
        _check_cancel(cancel, "finite order witnesses")
        prime = _canonical_positive_integer(row.get("prime"), "reduction prime")
        packed_row = packed_rows.get(prime)
        if packed_row is None:
            try:
                reduced_jacobian = _prepared_reduced_jacobian(jacobian, prime)
            except NotImplementedError as error:
                for values in witnesses:
                    values.append(
                        {
                            "prime": str(prime),
                            "status": "unsupported",
                            "reason": str(error),
                        }
                    )
                continue
            packed_divisors = None
        else:
            reduced_jacobian = packed_row["reduced_jacobian"]
            packed_divisors = packed_row["divisors"]
        valid_indices = []
        valid_reduced = []
        for index, divisor in enumerate(checked):
            try:
                reduced = (
                    _reduce_rational_divisors_prepared(
                        jacobian,
                        (divisor,),
                        prime,
                        reduced_jacobian,
                        cancel=cancel,
                    )[0]
                    if packed_divisors is None
                    else packed_divisors[index]
                )
                if reduced is None:
                    raise _RationalDivisorNonintegralError(
                        "the Mumford representative has a denominator divisible by p="
                        + str(prime)
                    )
                valid_indices.append(index)
                valid_reduced.append(reduced)
                witness = None
            except _RationalDivisorNonintegralError as error:
                witness = {
                    "prime": str(prime),
                    "status": "nonintegral",
                    "reason": str(error),
                }
            except NotImplementedError as error:
                witness = {
                    "prime": str(prime),
                    "status": "unsupported",
                    "reason": str(error),
                }
            if witness is not None:
                witnesses[index].append(witness)
        valid_witnesses = _reduction_order_witnesses_batch_from_reduced(
            reduced_jacobian,
            valid_reduced,
            tuple(exact[index] for index in valid_indices),
            row,
            algorithm="auto",
            packed=packed_divisors is not None,
        )
        for index, witness in zip(valid_indices, valid_witnesses, strict=True):
            witnesses[index].append(witness)

    answer = []
    for index, divisor in enumerate(checked):
        order, order_factors = exact[index]
        answer.append(
            {
                "schema": QQ_ORDER_SCHEMA,
                "theorem": TORSION_ORDER_THEOREM,
                "proof_algorithm": TORSION_ORDER_ALGORITHM,
                "divisor": rational_mumford_data(jacobian, divisor),
                "annihilating_upper_bound": str(upper_bound),
                "order": str(order),
                "order_factorization": _factorization_data(order_factors),
                "reduction_witnesses": tuple(witnesses[index]),
            }
        )
    return tuple(answer)


def _verify_order_certificate(
    jacobian: Any,
    certificate: Mapping[str, Any],
    upper_bound: int,
    reduction_rows: Any,
) -> tuple[Any, int]:
    if certificate.get("schema") != QQ_ORDER_SCHEMA:
        raise ValueError("unknown rational Mumford order-certificate schema")
    if set(certificate.keys()) != {
        "schema",
        "theorem",
        "proof_algorithm",
        "divisor",
        "annihilating_upper_bound",
        "order",
        "order_factorization",
        "reduction_witnesses",
    }:
        raise ValueError("a rational Mumford order certificate has noncanonical fields")
    if certificate.get("theorem") != TORSION_ORDER_THEOREM:
        raise ValueError("the rational Mumford order theorem is not canonical")
    if certificate.get("proof_algorithm") != TORSION_ORDER_ALGORITHM:
        raise ValueError("the rational Mumford order algorithm is not canonical")
    if str(upper_bound) != str(certificate.get("annihilating_upper_bound")):
        raise ValueError("a generator certificate has the wrong upper bound")
    divisor = rational_mumford_from_data(jacobian, certificate["divisor"])
    order = _canonical_positive_integer(certificate.get("order"), "divisor order")
    if upper_bound % order != 0:
        raise ValueError("a divisor order does not divide the upper bound")
    factors = _parse_factorization_data(
        order, certificate.get("order_factorization", ())
    )
    if not divisor.scalar_multiple(order, algorithm="reference").is_zero():
        raise ArithmeticError("the claimed divisor order does not annihilate")
    for prime, _exponent in factors:
        if divisor.scalar_multiple(order // prime, algorithm="reference").is_zero():
            raise ArithmeticError("the claimed divisor order is not minimal")

    witnesses = tuple(certificate.get("reduction_witnesses", ()))
    expected_witnesses = tuple(
        _reduction_order_witness(jacobian, divisor, order, factors, row)
        for row in reduction_rows
    )
    if witnesses != expected_witnesses:
        raise ArithmeticError("a divisor reduction-order witness is inconsistent")
    return divisor, order


def certify_supplied_torsion(
    jacobian: Any,
    generators: Any,
    bound: RationalTorsionData | None = None,
    *,
    primes: Any = None,
    count: Any = 3,
    max_prime: Any = 47,
    algorithm: str = "auto",
    factorization: Any = None,
    max_trial_divisions: Any = 1_000_000,
    max_group_operations: Any = 10_000_000,
    max_baby_steps: Any = 1_000_000,
    max_memory_bytes: Any = 256 * 1024 * 1024,
    cancel: Any = None,
) -> RationalTorsionData:
    """Verify supplied rational torsion and certify its generated subgroup.

    The returned result is exact precisely when the generated subgroup order
    equals the independently proved reduction upper bound.
    """
    _require_rational_jacobian(jacobian)
    if cancel is not None and not callable(cancel):
        raise TypeError("cancel must be callable")
    _check_cancel(cancel, "torsion setup")
    upper_data = (
        torsion_bound(
            jacobian,
            primes,
            count=count,
            max_prime=max_prime,
            algorithm=algorithm,
            include_two_torsion=True,
        )
        if bound is None
        else bound
    )
    if upper_data.jacobian is not jacobian:
        raise ValueError("the supplied torsion bound belongs to another Jacobian")
    verify_torsion_bound_certificate(jacobian, upper_data.upper_bound_certificate)
    upper = int(upper_data.upper_bound)
    trial_limit = _checked_integer(max_trial_divisions, "max_trial_divisions")
    factors = _factorization(upper, factorization, trial_limit)

    supplied_checked = tuple(
        verify_rational_mumford_divisor(jacobian, divisor)
        for divisor in list(generators)
    )
    supplied_data = tuple(
        rational_mumford_data(jacobian, divisor) for divisor in supplied_checked
    )
    checked_generators = []
    two_torsion = rational_two_torsion(jacobian)
    for divisor in list(two_torsion.generators) + list(supplied_checked):
        checked = verify_rational_mumford_divisor(jacobian, divisor)
        if checked not in checked_generators and not checked.is_zero():
            checked_generators.append(checked)

    reduction_rows = upper_data.upper_bound_certificate["good_reductions"]
    certificates = list(
        _order_certificates_batch(
            jacobian,
            checked_generators,
            upper,
            factors,
            reduction_rows,
            cancel=cancel,
        )
    )
    orders = [int(certificate["order"]) for certificate in certificates]

    budget = GroupOperationBudget(
        max_group_operations=max_group_operations,
        max_baby_steps=max_baby_steps,
        max_memory_bytes=max_memory_bytes,
        scalar_algorithm="reference",
    )
    basis, descending_orders = basis_from_generators(
        checked_generators, orders, factors, budget
    )
    canonical_generators = tuple(reversed(basis))
    invariants = tuple(reversed(descending_orders))
    certificate_cache = [
        (rational_mumford_fingerprint(jacobian, divisor), certificate)
        for divisor, certificate in zip(checked_generators, certificates, strict=True)
    ]

    def cached_certificate(divisor: Any) -> Any:
        fingerprint = rational_mumford_fingerprint(jacobian, divisor)
        for key, certificate in certificate_cache:
            if key == fingerprint:
                return certificate
        return None

    missing = tuple(
        divisor
        for divisor in canonical_generators
        if cached_certificate(divisor) is None
    )
    missing_certificates = _order_certificates_batch(
        jacobian,
        missing,
        upper,
        factors,
        reduction_rows,
        cancel=cancel,
    )
    for divisor, certificate in zip(missing, missing_certificates, strict=True):
        certificate_cache.append(
            (rational_mumford_fingerprint(jacobian, divisor), certificate)
        )

    basis_certificates = []
    for divisor, order in zip(canonical_generators, invariants, strict=True):
        certificate = cached_certificate(divisor)
        if certificate is None:
            raise ArithmeticError("a torsion-basis certificate was not cached")
        if int(certificate["order"]) != int(order):
            raise ArithmeticError("a subgroup basis order is inconsistent")
        basis_certificates.append(certificate)

    result = RationalTorsionData(
        jacobian,
        upper_data.upper_bound_certificate,
        generators=canonical_generators,
        invariants=invariants,
        generator_certificates=tuple(basis_certificates),
        two_torsion=two_torsion,
        upper_factorization=factors,
        supplied_generators=supplied_data,
        input_generator_certificates=tuple(certificates),
        basis_derivation={
            "algorithm": TORSION_BASIS_ALGORITHM,
            "input_policy": (
                "canonical rational 2-torsion first, then supplied generators; "
                "remove zeroes and exact duplicates"
            ),
            "two_torsion_generator_count": len(two_torsion.generators),
            "supplied_generator_count": len(supplied_checked),
            "deduplicated_nonzero_input_count": len(checked_generators),
        },
    )
    verify_torsion_result_certificate(jacobian, result.certificate)
    return result


def verify_torsion_result_certificate(
    jacobian: Any, certificate: Mapping[str, Any]
) -> bool:
    """Replay upper-bound, exact-order, and subgroup-independence proofs."""
    _require_rational_jacobian(jacobian)
    if certificate.get("schema") != TORSION_RESULT_SCHEMA:
        raise ValueError("unknown rational torsion-result certificate schema")
    if set(certificate.keys()) != {
        "schema",
        "curve",
        "status",
        "lower_bound",
        "upper_bound",
        "exact",
        "invariants",
        "generators",
        "generator_order_certificates",
        "supplied_generators",
        "input_generator_order_certificates",
        "basis_derivation",
        "upper_bound_factorization",
        "two_torsion_certificate",
        "upper_bound_certificate",
    }:
        raise ValueError(
            "a rational torsion-result certificate has noncanonical fields"
        )
    if certificate.get("curve") != _curve_data(jacobian):
        raise ValueError("the torsion-result certificate belongs to another Jacobian")
    upper_certificate = certificate["upper_bound_certificate"]
    verify_torsion_bound_certificate(jacobian, upper_certificate)
    upper = _canonical_positive_integer(
        certificate.get("upper_bound"), "torsion upper bound"
    )
    if str(upper) != str(upper_certificate.get("upper_bound")):
        raise ValueError("the result and reduction upper bounds disagree")
    two_certificate = certificate.get("two_torsion_certificate")
    if two_certificate is not None:
        verify_two_torsion_certificate(jacobian, two_certificate)

    claimed_invariants = tuple(
        _canonical_positive_integer(value, "torsion invariant")
        for value in certificate.get("invariants", ())
    )
    previous = 1
    lower = 1
    for invariant in claimed_invariants:
        if invariant % previous != 0:
            raise ValueError("torsion invariants are not in divisibility order")
        lower *= invariant
        previous = invariant
    if str(lower) != str(certificate.get("lower_bound")) or upper % lower != 0:
        raise ValueError("the claimed torsion lower bound is inconsistent")

    generator_certificates = tuple(certificate.get("generator_order_certificates", ()))
    supplied_generator_data = tuple(certificate.get("supplied_generators", ()))
    input_generator_certificates = tuple(
        certificate.get("input_generator_order_certificates", ())
    )
    basis_derivation = certificate.get("basis_derivation")
    reduction_rows = upper_certificate["good_reductions"]
    generators = []
    orders = []
    if not generator_certificates and two_certificate is not None:
        if tuple(certificate.get("generators", ())) != tuple(
            two_certificate.get("generators", ())
        ) or claimed_invariants != tuple(
            2 for _index in range(int(two_certificate.get("dimension")))
        ):
            raise ValueError("the lower bound does not match its 2-torsion proof")
        for data in certificate.get("generators", ()):
            generators.append(rational_mumford_from_data(jacobian, data))
            orders.append(2)
    else:
        if len(generator_certificates) != len(claimed_invariants):
            raise ValueError(
                "the torsion basis and invariant lists have different sizes"
            )
        for item, invariant in zip(
            generator_certificates, claimed_invariants, strict=True
        ):
            divisor, order = _verify_order_certificate(
                jacobian, item, upper, reduction_rows
            )
            if order != invariant:
                raise ArithmeticError(
                    "a certified basis order differs from its invariant"
                )
            generators.append(divisor)
            orders.append(order)
    if tuple(
        rational_mumford_data(jacobian, divisor) for divisor in generators
    ) != tuple(certificate.get("generators", ())):
        raise ValueError("the serialized torsion basis is inconsistent")

    # A supplied-subgroup certificate retains the original input, proves each
    # deduplicated input order, and deterministically replays the change to an
    # independent invariant-factor basis.  This proves that the returned basis
    # generates the subgroup that was actually supplied, rather than merely
    # proving that some unrelated rational torsion points have the same order.
    if basis_derivation is None:
        if supplied_generator_data or input_generator_certificates:
            raise ValueError("supplied generators have no basis derivation proof")
        if (
            generator_certificates
            or certificate.get("upper_bound_factorization") is not None
        ):
            raise ValueError("a derived torsion basis has no derivation certificate")
    else:
        if two_certificate is None:
            raise ValueError("a supplied basis derivation omits rational 2-torsion")
        supplied_generators = tuple(
            rational_mumford_from_data(jacobian, data)
            for data in supplied_generator_data
        )
        two_data = rational_two_torsion(jacobian)
        input_generators = []
        for divisor in list(two_data.generators) + list(supplied_generators):
            if divisor not in input_generators and not divisor.is_zero():
                input_generators.append(divisor)
        expected_derivation = {
            "algorithm": TORSION_BASIS_ALGORITHM,
            "input_policy": (
                "canonical rational 2-torsion first, then supplied generators; "
                "remove zeroes and exact duplicates"
            ),
            "two_torsion_generator_count": len(two_data.generators),
            "supplied_generator_count": len(supplied_generators),
            "deduplicated_nonzero_input_count": len(input_generators),
        }
        if dict(basis_derivation) != expected_derivation:
            raise ValueError("the supplied-generator derivation is inconsistent")
        if len(input_generator_certificates) != len(input_generators):
            raise ValueError("the input-generator proof list has the wrong length")
        input_orders = []
        for expected_divisor, item in zip(
            input_generators, input_generator_certificates, strict=True
        ):
            checked_divisor, checked_order = _verify_order_certificate(
                jacobian, item, upper, reduction_rows
            )
            if checked_divisor != expected_divisor:
                raise ArithmeticError(
                    "an input-generator order proof belongs to another divisor"
                )
            input_orders.append(checked_order)

        factor_data = certificate.get("upper_bound_factorization")
        if factor_data is None:
            raise ValueError("a supplied basis derivation has no ambient factorization")
        upper_factors = _parse_factorization_data(upper, factor_data)
        budget = GroupOperationBudget(scalar_algorithm="reference")
        derived_basis, derived_orders = basis_from_generators(
            input_generators, input_orders, upper_factors, budget
        )
        derived_generators = tuple(reversed(derived_basis))
        derived_invariants = tuple(reversed(derived_orders))
        if derived_invariants != claimed_invariants or tuple(
            rational_mumford_data(jacobian, divisor) for divisor in derived_generators
        ) != tuple(certificate.get("generators", ())):
            raise ArithmeticError(
                "the claimed torsion basis is not derived from the supplied subgroup"
            )
    exact = lower == upper
    if bool(certificate.get("exact")) != exact:
        raise ValueError("the exact torsion status is inconsistent")
    expected_status = "exact" if exact else "bounded"
    if certificate.get("status") != expected_status:
        raise ValueError("the torsion status label is inconsistent")
    return True


__all__ = [
    "PreparedRationalReductionBatch",
    "QQ_DIVISOR_SCHEMA",
    "QQ_ORDER_SCHEMA",
    "RATIONAL_REDUCTION_BATCH_ALGORITHM",
    "RationalReductionCancelledError",
    "RationalTorsionCapabilityError",
    "RationalTorsionData",
    "RationalTwoTorsionData",
    "certify_supplied_torsion",
    "rational_mumford_data",
    "rational_mumford_from_data",
    "rational_mumford_fingerprint",
    "rational_two_torsion",
    "torsion_bound",
    "verify_rational_mumford_divisor",
    "verify_torsion_bound_certificate",
    "verify_torsion_result_certificate",
    "verify_two_torsion_certificate",
]
