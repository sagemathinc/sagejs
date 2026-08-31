r"""Certified exact eta products for classical modular forms.

For an exponent vector $(r_d)_{d\mid N}$ this module constructs

$$
\prod_{d\mid N}\eta(dz)^{r_d}
 = q^{\sum d r_d/24}\prod_{d\mid N}\prod_{n\geq1}(1-q^{dn})^{r_d}.
$$

Publication as a modular form is guarded by the Newman congruences and every
Ligozat cusp order.  Negative exponents are allowed when the resulting eta
quotient is holomorphic at every cusp.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

from .qexp_algebra import (
    CertifiedModularForm,
    ExactNebentypus,
    _global,
    _integer,
    _lcm,
    _nonnegative,
    _positive,
)

ETA_REGISTRY_MAX_LEVEL = 128
ETA_REGISTRY_MAX_WEIGHT = 24
ETA_REGISTRY_MAX_DIVISORS = 4
ETA_REGISTRY_MAX_CANDIDATES = 256
ETA_REGISTRY_MAX_VECTORS = 25000


def _normalize_exponents(
    exponents: Any,
    level: Any = None,
) -> tuple[int, tuple[tuple[int, int], ...]]:
    if hasattr(exponents, "items"):
        raw_items = list(exponents.items())
    else:
        raw_items = list(exponents)
    combined: dict[int, int] = {}
    inferred_level = 1
    for raw_divisor, raw_exponent in raw_items:
        divisor = _positive(raw_divisor, "eta-product divisor")
        exponent = _integer(raw_exponent, "eta-product exponent")
        inferred_level = _lcm(inferred_level, divisor)
        combined[divisor] = combined.get(divisor, 0) + exponent
    normalized_level = (
        inferred_level if level is None else _positive(level, "eta-product level")
    )
    normalized = []
    for divisor in sorted(combined):
        exponent = combined[divisor]
        if normalized_level % divisor:
            raise ValueError(
                "eta-product divisor "
                + str(divisor)
                + " does not divide level "
                + str(normalized_level)
            )
        if exponent:
            normalized.append((divisor, exponent))
    return normalized_level, runtime.math_tuple(normalized)


def _gcd(left: int, right: int) -> int:
    return _positive(_global("gcd")(left, right), "gcd")


def _character_discriminant(
    weight: int,
    exponents: tuple[tuple[int, int], ...],
) -> int:
    parity: dict[int, int] = {}
    factor = _global("factor")
    for divisor, exponent in exponents:
        if exponent % 2 == 0:
            continue
        for raw_prime, raw_power in factor(divisor):
            prime = _positive(raw_prime, "prime divisor")
            power = _positive(raw_power, "prime exponent")
            if power % 2:
                parity[prime] = 1 - parity.get(prime, 0)
    square_class = -1 if weight % 2 else 1
    for prime in sorted(parity):
        if parity[prime]:
            square_class *= prime
    if square_class % 4 == 1:
        return square_class
    return 4 * square_class


def _cusp_order(
    level: int,
    exponents: tuple[tuple[int, int], ...],
    denominator: int,
) -> Any:
    common = 24 * _gcd(denominator, level // denominator) * denominator
    answer = sage.QQ(0)
    for divisor, exponent in exponents:
        gcd_value = _gcd(denominator, divisor)
        numerator = level * gcd_value * gcd_value * exponent
        answer += sage.QQ(numerator) / (common * divisor)
    return answer


def _integral_rational(value: Any, label: str) -> int:
    """Return an exactly integral rational as a machine integer."""
    if value.denominator() != 1:
        raise ArithmeticError(label + " is not integral")
    return _integer(value.numerator(), label)


def _multiply_euler_factor(
    coefficients: list[Any],
    step: int,
    exponent: int,
) -> list[Any]:
    length = len(coefficients)
    max_power = (length - 1) // step
    binomial = _global("binomial")
    factor = []
    if exponent >= 0:
        for index in range(min(exponent, max_power) + 1):
            value = sage.QQ(binomial(exponent, index))
            factor.append(-value if index % 2 else value)
    else:
        positive = -exponent
        for index in range(max_power + 1):
            factor.append(sage.QQ(binomial(positive + index - 1, index)))
    answer = [sage.QQ(0) for _ in range(length)]
    for left_index, left in enumerate(coefficients):
        if left == 0:
            continue
        for right_index, right in enumerate(factor):
            target = left_index + right_index * step
            if target >= length:
                break
            answer[target] += left * right
    return answer


def _eta_product_series(
    exponents: tuple[tuple[int, int], ...],
    shift: int,
    precision: int,
    variable: str = "q",
) -> Any:
    ring = _global("PowerSeriesRing")(
        sage.QQ,
        variable,
        default_prec=max(1, precision),
    )
    if shift >= precision:
        return ring([sage.QQ(0) for _ in range(precision)]).add_bigoh(precision)
    unit_precision = precision - shift
    coefficients = [sage.QQ(1)] + [
        sage.QQ(0) for _ in range(max(0, unit_precision - 1))
    ]
    for divisor, exponent in exponents:
        last_index = (unit_precision - 1) // divisor
        for index in range(1, last_index + 1):
            coefficients = _multiply_euler_factor(
                coefficients,
                divisor * index,
                exponent,
            )
    padded = [sage.QQ(0) for _ in range(shift)] + coefficients
    return ring(padded[:precision]).add_bigoh(precision)


@runtime.lightweight_math_class
class EtaProductCertificate:
    r"""A replayable Newman--Ligozat certificate for one eta product."""

    def __init__(
        self,
        level: Any,
        exponents: Any,
        form: Any = None,
    ) -> None:
        normalized_level, normalized = _normalize_exponents(exponents, level)
        self._level = normalized_level
        self._exponents = normalized
        self._sum_r = sum(exponent for _divisor, exponent in normalized)
        self._sum_dr = sum(divisor * exponent for divisor, exponent in normalized)
        self._sum_ndr = sum(
            (normalized_level // divisor) * exponent for divisor, exponent in normalized
        )
        self._weight = self._sum_r // 2 if self._sum_r % 2 == 0 else None
        divisors = [
            _positive(value, "level divisor")
            for value in sage.divisors(normalized_level)
        ]
        self._cusp_orders = runtime.math_tuple(
            [
                (
                    denominator,
                    _cusp_order(normalized_level, normalized, denominator),
                )
                for denominator in divisors
            ]
        )
        self._character_discriminant = (
            None
            if self._weight is None
            else _character_discriminant(self._weight, normalized)
        )
        self._character = None
        if (
            self._character_discriminant is not None
            and normalized_level % abs(self._character_discriminant) == 0
        ):
            if self._character_discriminant == 1:
                self._character = ExactNebentypus.trivial(normalized_level)
            else:
                primitive = _global("kronecker_character")(self._character_discriminant)
                self._character = ExactNebentypus.from_character(
                    primitive,
                    normalized_level,
                )
        self._form = form
        runtime.object.freeze(self)

    def level(self) -> int:
        return self._level

    def exponents(self) -> tuple[tuple[int, int], ...]:
        return self._exponents

    def exponent(self, divisor: Any) -> int:
        target = _positive(divisor, "eta-product divisor")
        for candidate, exponent in self._exponents:
            if candidate == target:
                return exponent
        return 0

    def weight(self) -> Any:
        return self._weight

    def newman_sums(self) -> tuple[int, int]:
        return self._sum_dr, self._sum_ndr

    def newman_residues(self) -> tuple[int, int]:
        return self._sum_dr % 24, self._sum_ndr % 24

    def newman_congruences_hold(self) -> bool:
        return self._sum_r % 2 == 0 and self.newman_residues() == (0, 0)

    def cusp_orders(self) -> tuple[tuple[int, Any], ...]:
        return self._cusp_orders

    def cusp_order(self, denominator: Any) -> Any:
        target = _positive(denominator, "cusp denominator")
        for candidate, order in self._cusp_orders:
            if candidate == target:
                return order
        raise ValueError("cusp denominator must divide the eta-product level")

    def order_at_infinity(self) -> Any:
        return self.cusp_order(self._level)

    def order_at_zero(self) -> Any:
        return self.cusp_order(1)

    def is_holomorphic_at_cusps(self) -> bool:
        return all(order >= 0 for _denominator, order in self._cusp_orders)

    def is_cuspidal(self) -> bool:
        return self.verify() and all(
            order > 0 for _denominator, order in self._cusp_orders
        )

    def character_discriminant(self) -> Any:
        return self._character_discriminant

    def character(self) -> ExactNebentypus:
        if self._character is None:
            raise ValueError(
                "the eta-product character conductor does not divide its level"
            )
        return self._character

    nebentypus = character

    def failure_reason(self) -> str:
        if self._sum_r % 2:
            return "the eta-product weight is not integral"
        if self._weight is None or self._weight < 0:
            return "the eta-product weight is negative"
        if self._sum_dr % 24:
            return "sum d*r_d is not divisible by 24"
        if self._sum_ndr % 24:
            return "sum (N/d)*r_d is not divisible by 24"
        if self._character is None:
            return "the Kronecker character conductor does not divide the level"
        if not self.is_holomorphic_at_cusps():
            return "the eta product has a pole at a cusp"
        return ""

    def verify(self) -> bool:
        if self.failure_reason():
            return False
        if self._form is None:
            return True
        if (
            self._form.level() != self._level
            or self._form.weight() != self._weight
            or self._form.character() != self._character
            or self._form.is_cuspidal()
            != all(order > 0 for _denominator, order in self._cusp_orders)
        ):
            return False
        replay = _eta_product_series(
            self._exponents,
            _integral_rational(
                self.order_at_infinity(),
                "eta-product q-order",
            ),
            self._form.precision(),
            self._form.q_expansion().parent().variable_name(),
        )
        return replay == self._form.q_expansion()

    def __repr__(self) -> str:
        status = "Verified" if self.verify() else "Failed"
        weight = "nonintegral" if self._weight is None else str(self._weight)
        return (
            status
            + " Newman-Ligozat eta-product certificate of weight "
            + weight
            + " and level "
            + str(self._level)
        )

    __str__ = __repr__
    toString = __repr__


class CertifiedEtaProduct(CertifiedModularForm):
    """A holomorphic eta product with exact modular-form metadata."""

    def __init__(
        self,
        level: Any,
        exponents: Any,
        prec: Any = 10,
        variable: str = "q",
    ) -> None:
        precision = _nonnegative(prec, "eta-product precision")
        certificate = EtaProductCertificate(level, exponents)
        if not certificate.verify():
            raise ValueError(certificate.failure_reason())
        shift = _integral_rational(
            certificate.order_at_infinity(),
            "eta-product q-order",
        )
        self._eta_exponents = certificate.exponents()
        self._eta_variable = str(variable)
        series = _eta_product_series(
            self._eta_exponents,
            shift,
            precision,
            self._eta_variable,
        )
        super().__init__(
            series,
            certificate.weight(),
            certificate.level(),
            certificate.character(),
            certificate.is_cuspidal(),
            ("eta-product", certificate.level(), certificate.exponents()),
            "newman-ligozat-certified-eta-product",
        )

    def exponents(self) -> tuple[tuple[int, int], ...]:
        return self._eta_exponents

    def exponent(self, divisor: Any) -> int:
        target = _positive(divisor, "eta-product divisor")
        for candidate, exponent in self._eta_exponents:
            if candidate == target:
                return exponent
        return 0

    def certificate(self) -> EtaProductCertificate:
        return EtaProductCertificate(self.level(), self._eta_exponents, self)

    def cusp_orders(self) -> tuple[tuple[int, Any], ...]:
        return self.certificate().cusp_orders()

    def __repr__(self) -> str:
        pieces = []
        for divisor, exponent in self._eta_exponents:
            piece = "eta(" + str(divisor) + "*z)"
            if exponent != 1:
                piece += "^" + str(exponent)
            pieces.append(piece)
        product = "1" if not pieces else "*".join(pieces)
        return (
            "Certified eta product "
            + product
            + " of weight "
            + str(self.weight())
            + " and level "
            + str(self.level())
        )

    __str__ = __repr__
    toString = __repr__


def eta_product_certificate(
    level: Any,
    exponents: Any,
) -> EtaProductCertificate:
    """Return the Newman--Ligozat certificate, including failed conditions."""
    return EtaProductCertificate(level, exponents)


def eta_product(
    level: Any,
    exponents: Any,
    prec: Any = 10,
    variable: str = "q",
) -> CertifiedEtaProduct:
    r"""Return the certified product $\prod_{d\mid N}\eta(dz)^{r_d}$."""
    return CertifiedEtaProduct(level, exponents, prec, variable)


def eta_product_candidates(
    level: Any,
    weight: Any,
    prec: Any = 10,
    min_exponent: Any = 0,
    max_exponent: Any = None,
    candidate_limit: Any = ETA_REGISTRY_MAX_CANDIDATES,
    vector_limit: Any = ETA_REGISTRY_MAX_VECTORS,
    require_cuspidal: bool = True,
    trivial_character: Any = None,
    strict: bool = True,
) -> list[CertifiedEtaProduct]:
    """Enumerate a deterministic bounded family of certified eta products.

    The exponent sum is fixed to twice `weight`; `min_exponent` and
    `max_exponent` bound every coordinate.  `strict=True` raises if either
    work limit truncates the search.  The formula registry uses `strict=False`:
    its returned span remains exact even when the candidate search is partial.
    """
    normalized_level = _positive(level, "eta-product level")
    normalized_weight = _nonnegative(weight, "eta-product weight")
    precision = _nonnegative(prec, "eta-product precision")
    lower = _integer(min_exponent, "minimum eta exponent")
    upper = (
        2 * normalized_weight
        if max_exponent is None
        else _integer(max_exponent, "maximum eta exponent")
    )
    if upper < lower:
        raise ValueError("maximum eta exponent must be at least the minimum")
    maximum_candidates = _positive(candidate_limit, "eta candidate limit")
    maximum_vectors = _positive(vector_limit, "eta vector limit")
    divisors = [
        _positive(value, "level divisor") for value in sage.divisors(normalized_level)
    ]
    target_sum = 2 * normalized_weight
    candidates: list[CertifiedEtaProduct] = []
    signatures: set[tuple[Any, ...]] = set()
    current = [0 for _ in divisors]
    tested = 0
    truncated = False

    def visit(index: int, remaining: int) -> None:
        nonlocal tested, truncated
        if truncated:
            return
        slots_after = len(divisors) - index - 1
        if index == len(divisors) - 1:
            value = remaining
            if value < lower or value > upper:
                return
            if tested >= maximum_vectors:
                truncated = True
                return
            tested += 1
            current[index] = value
            vector = tuple(
                (divisor, current[position])
                for position, divisor in enumerate(divisors)
                if current[position]
            )
            certificate = EtaProductCertificate(normalized_level, vector)
            if not certificate.verify():
                return
            if require_cuspidal and not certificate.is_cuspidal():
                return
            if trivial_character is not None and (
                certificate.character().is_trivial() != bool(trivial_character)
            ):
                return
            form = CertifiedEtaProduct(normalized_level, vector, precision)
            signature = tuple(form[position] for position in range(precision))
            if signature in signatures:
                return
            if len(candidates) >= maximum_candidates:
                truncated = True
                return
            signatures.add(signature)
            candidates.append(form)
            return
        smallest = max(lower, remaining - upper * slots_after)
        largest = min(upper, remaining - lower * slots_after)
        for value in range(smallest, largest + 1):
            current[index] = value
            visit(index + 1, remaining - value)
            if truncated:
                return

    visit(0, target_sum)
    if truncated and strict:
        raise OverflowError(
            "eta-product enumeration reached its candidate or vector limit"
        )
    return candidates


def registry_eta_product_candidates(
    space: Any,
    precision: int,
) -> list[CertifiedEtaProduct]:
    """Return the bounded eta-product slice used by the formula registry."""
    level = _positive(space.level(), "eta registry level")
    weight = _nonnegative(space.weight(), "eta registry weight")
    divisors = list(sage.divisors(level))
    if (
        level > ETA_REGISTRY_MAX_LEVEL
        or weight > ETA_REGISTRY_MAX_WEIGHT
        or len(divisors) > ETA_REGISTRY_MAX_DIVISORS
    ):
        return []
    return eta_product_candidates(
        level,
        weight,
        precision,
        min_exponent=0,
        max_exponent=2 * weight,
        candidate_limit=ETA_REGISTRY_MAX_CANDIDATES,
        vector_limit=ETA_REGISTRY_MAX_VECTORS,
        require_cuspidal=True,
        trivial_character=True,
        strict=False,
    )


__all__ = [
    "CertifiedEtaProduct",
    "ETA_REGISTRY_MAX_CANDIDATES",
    "ETA_REGISTRY_MAX_DIVISORS",
    "ETA_REGISTRY_MAX_LEVEL",
    "ETA_REGISTRY_MAX_VECTORS",
    "ETA_REGISTRY_MAX_WEIGHT",
    "EtaProductCertificate",
    "eta_product",
    "eta_product_candidates",
    "eta_product_certificate",
    "registry_eta_product_candidates",
]
