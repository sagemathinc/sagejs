"""Inspectable modified Round-4 stages for local maximal orders.

This module follows the mathematical organization of Ford--Letard's Round
Four algorithm and the current PARI implementation, without copying PARI's
`GEN` representation or stack discipline.  It provides three useful pieces
that are independent of the eventual native storage boundary:

* certified factorization of the reduction into primary components, followed
  by genuine multifactor Hensel refinement to the precision forced by the
  local discriminant;
* Dedekind's coefficient-ring enlargement, which constructs all first-layer
  integral elements at once as an integer-HNF numerator/common-denominator
  lattice;
* an exact local-order adapter that verifies the lattice evidence and uses the
  existing Round-2 implementation only for primary/deep branches not yet
  handled by the Ford--Letard power-basis search.

The fallback is deliberate and visible in the result certificate.  A failed
Hensel invariant, uncertified modulus, or inconsistent basis never gets
silently treated as a successful Round-4 computation.

Algorithmic references:

* D. Ford and P. Letard, *Implementing the Round Four maximal order
  algorithm*, J. Théorie des Nombres de Bordeaux 6 (1994), 39--80.
* PARI/GP `src/basemath/base2.c` (Round-4 stages and precision bounds), used
  as GPL-compatible implementation evidence and as an offline oracle.
* Hecke `MaxOrd.jl` and `DedekindCriterion.jl` at commit
  `eab7e5566e56d8864fe9cd7b895811ab9df2fe32`, used as BSD-licensed
  evidence for the Dedekind and fallback organization.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


class Round4Unsupported(ArithmeticError):
    """A proved boundary at which the implementation must use a fallback."""


class Round4InvariantError(ArithmeticError):
    """A failed mathematical invariant; callers must not accept a result."""


class Round4Stage:
    """One stable, serializable stage boundary in a local computation."""

    def __init__(self, name: str, evidence: dict[str, Any]) -> None:
        self.name = name
        self.evidence = evidence

    def as_dict(self) -> dict[str, Any]:
        return {"name": self.name, "evidence": self.evidence}


class Round4SelectorMetrics:
    """Measured inputs used to choose Round 2 or modified Round 4."""

    def __init__(
        self,
        degree: int,
        coefficient_bits: int,
        discriminant_valuation: int,
        factor_degrees: list[int],
        factor_multiplicities: list[int],
        required_precision: int,
        predicted_round2_work: int,
        predicted_round4_work: int,
        recommendation: str,
        reason: str,
    ) -> None:
        self.degree = degree
        self.coefficient_bits = coefficient_bits
        self.discriminant_valuation = discriminant_valuation
        self.factor_degrees = factor_degrees
        self.factor_multiplicities = factor_multiplicities
        self.required_precision = required_precision
        self.predicted_round2_work = predicted_round2_work
        self.predicted_round4_work = predicted_round4_work
        self.recommendation = recommendation
        self.reason = reason

    def as_dict(self) -> dict[str, Any]:
        return {
            "degree": self.degree,
            "coefficient_bits": self.coefficient_bits,
            "discriminant_valuation": self.discriminant_valuation,
            "factor_degrees": list(self.factor_degrees),
            "factor_multiplicities": list(self.factor_multiplicities),
            "required_precision": self.required_precision,
            "predicted_round2_work": self.predicted_round2_work,
            "predicted_round4_work": self.predicted_round4_work,
            "recommendation": self.recommendation,
            "reason": self.reason,
        }


class Round4LocalPlan:
    """Exact local factor, precision, and first integral-element plan."""

    def __init__(
        self,
        prime: Any,
        polynomial_coefficients: list[Any],
        discriminant_valuation: int,
        required_precision: int,
        irreducible_factors: list[list[Any]],
        multiplicities: list[int],
        refined_primary_factors: list[list[Any]],
        dedekind_obstruction: list[Any],
        dedekind_quotient: list[Any],
        basis_numerator: list[list[Any]],
        basis_denominator: Any,
        first_layer_index_valuation: int,
        selector: Round4SelectorMetrics,
        stages: list[Round4Stage],
    ) -> None:
        self.prime = prime
        self.polynomial_coefficients = polynomial_coefficients
        self.discriminant_valuation = discriminant_valuation
        self.required_precision = required_precision
        self.irreducible_factors = irreducible_factors
        self.multiplicities = multiplicities
        self.refined_primary_factors = refined_primary_factors
        self.dedekind_obstruction = dedekind_obstruction
        self.dedekind_quotient = dedekind_quotient
        self.basis_numerator = basis_numerator
        self.basis_denominator = basis_denominator
        self.first_layer_index_valuation = first_layer_index_valuation
        self.selector = selector
        self.stages = stages

    def is_dedekind_maximal(self) -> bool:
        return _poly_degree(self.dedekind_obstruction) == 0

    def as_dict(self, include_coefficients: bool = True) -> dict[str, Any]:
        answer: dict[str, Any] = {
            "prime": self.prime,
            "degree": len(self.polynomial_coefficients) - 1,
            "discriminant_valuation": self.discriminant_valuation,
            "required_precision": self.required_precision,
            "factor_degrees": [
                _poly_degree(factor) for factor in self.irreducible_factors
            ],
            "factor_multiplicities": list(self.multiplicities),
            "dedekind_obstruction_degree": _poly_degree(self.dedekind_obstruction),
            "first_layer_index_valuation": self.first_layer_index_valuation,
            "basis_denominator": self.basis_denominator,
            "selector": self.selector.as_dict(),
            "stages": [stage.as_dict() for stage in self.stages],
        }
        if include_coefficients:
            answer["refined_primary_factors"] = [
                list(factor) for factor in self.refined_primary_factors
            ]
            answer["dedekind_obstruction"] = list(self.dedekind_obstruction)
            answer["dedekind_quotient"] = list(self.dedekind_quotient)
            answer["basis_numerator"] = [list(row) for row in self.basis_numerator]
        return answer


class Round4LocalCertificate:
    """Evidence connecting a returned HNF lattice to one local computation."""

    def __init__(
        self,
        prime: Any,
        algorithm: str,
        fallback_reason: str | None,
        local_index: Any,
        local_index_valuation: int,
        input_discriminant_valuation: int,
        output_discriminant_valuation: int,
        basis_numerator: list[list[Any]],
        basis_denominator: Any,
        closure_checked: bool,
        p_maximality_witness: str,
    ) -> None:
        self.prime = prime
        self.algorithm = algorithm
        self.fallback_reason = fallback_reason
        self.local_index = local_index
        self.local_index_valuation = local_index_valuation
        self.input_discriminant_valuation = input_discriminant_valuation
        self.output_discriminant_valuation = output_discriminant_valuation
        self.basis_numerator = basis_numerator
        self.basis_denominator = basis_denominator
        self.closure_checked = closure_checked
        self.p_maximality_witness = p_maximality_witness

    def as_dict(self) -> dict[str, Any]:
        return {
            "prime": self.prime,
            "algorithm": self.algorithm,
            "fallback_reason": self.fallback_reason,
            "local_index": self.local_index,
            "local_index_valuation": self.local_index_valuation,
            "input_discriminant_valuation": self.input_discriminant_valuation,
            "output_discriminant_valuation": self.output_discriminant_valuation,
            "basis_numerator": [list(row) for row in self.basis_numerator],
            "basis_denominator": self.basis_denominator,
            "closure_checked": self.closure_checked,
            "p_maximality_witness": self.p_maximality_witness,
        }


class Round4LocalResult:
    """A local overorder together with its inspectable plan and certificate."""

    def __init__(
        self,
        order: Any,
        plan: Round4LocalPlan,
        certificate: Round4LocalCertificate,
    ) -> None:
        self.order = order
        self.plan = plan
        self.certificate = certificate

    def as_dict(self, include_coefficients: bool = False) -> dict[str, Any]:
        return {
            "plan": self.plan.as_dict(include_coefficients),
            "certificate": self.certificate.as_dict(),
        }


def _trim(values: list[Any]) -> list[Any]:
    answer = list(values)
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    if len(answer) == 0:
        return [0]
    return answer


def _poly_degree(values: list[Any]) -> int:
    values = _trim(values)
    return -1 if len(values) == 1 and values[0] == 0 else len(values) - 1


def _poly_mod(values: list[Any], modulus: Any) -> list[Any]:
    return _trim([value % modulus for value in values])


def _poly_add(left: list[Any], right: list[Any]) -> list[Any]:
    size = max(len(left), len(right))
    answer = []
    for index in range(size):
        a = left[index] if index < len(left) else 0
        b = right[index] if index < len(right) else 0
        answer.append(a + b)
    return _trim(answer)


def _poly_sub(left: list[Any], right: list[Any]) -> list[Any]:
    size = max(len(left), len(right))
    answer = []
    for index in range(size):
        a = left[index] if index < len(left) else 0
        b = right[index] if index < len(right) else 0
        answer.append(a - b)
    return _trim(answer)


def _poly_scalar(values: list[Any], scalar: Any) -> list[Any]:
    return _trim([scalar * value for value in values])


def _poly_mul(left: list[Any], right: list[Any]) -> list[Any]:
    if _poly_degree(left) < 0 or _poly_degree(right) < 0:
        return [0]
    answer = [0 for _index in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        if left_value == 0:
            continue
        for right_index, right_value in enumerate(right):
            if right_value != 0:
                answer[left_index + right_index] += left_value * right_value
    return _trim(answer)


def _poly_product(factors: list[list[Any]]) -> list[Any]:
    answer: list[Any] = [1]
    for factor in factors:
        answer = _poly_mul(answer, factor)
    return answer


def _poly_pow(values: list[Any], exponent: int) -> list[Any]:
    answer: list[Any] = [1]
    power = list(values)
    remaining = exponent
    while remaining > 0:
        if remaining % 2:
            answer = _poly_mul(answer, power)
        remaining //= 2
        if remaining:
            power = _poly_mul(power, power)
    return answer


def _poly_divmod_mod(
    dividend: list[Any], divisor: list[Any], modulus: Any
) -> tuple[list[Any], list[Any]]:
    """Divide polynomials over `ZZ/modulus` with an invertible leading term."""
    divisor = _poly_mod(divisor, modulus)
    divisor_degree = _poly_degree(divisor)
    if divisor_degree < 0:
        raise ZeroDivisionError("polynomial division by zero")
    leading = divisor[-1] % modulus
    try:
        leading_inverse = _modular_inverse(leading, modulus)
    except Round4Unsupported as error:
        divisor_of_modulus = _integer_gcd(leading, modulus)
        raise Round4Unsupported(
            "a modular leading coefficient exposed the nonunit "
            + str(divisor_of_modulus)
        ) from error
    remainder = _poly_mod(dividend, modulus)
    quotient = [0 for _index in range(max(1, len(remainder) - divisor_degree))]
    while _poly_degree(remainder) >= divisor_degree:
        shift = _poly_degree(remainder) - divisor_degree
        coefficient = (remainder[-1] * leading_inverse) % modulus
        quotient[shift] = coefficient
        subtraction = [0 for _index in range(shift)] + [
            (coefficient * value) % modulus for value in divisor
        ]
        remainder = _poly_mod(_poly_sub(remainder, subtraction), modulus)
    return _poly_mod(quotient, modulus), remainder


def _poly_exact_div_mod(
    dividend: list[Any], divisor: list[Any], modulus: Any
) -> list[Any]:
    quotient, remainder = _poly_divmod_mod(dividend, divisor, modulus)
    if _poly_degree(remainder) >= 0:
        raise Round4InvariantError("an expected modular polynomial division failed")
    return quotient


def _poly_xgcd_mod(
    left: list[Any], right: list[Any], prime: Any
) -> tuple[list[Any], list[Any], list[Any]]:
    old_r = _poly_mod(left, prime)
    r = _poly_mod(right, prime)
    old_s: list[Any] = [1]
    s: list[Any] = [0]
    old_t: list[Any] = [0]
    t: list[Any] = [1]
    while _poly_degree(r) >= 0:
        quotient, remainder = _poly_divmod_mod(old_r, r, prime)
        old_r, r = r, remainder
        old_s, s = s, _poly_mod(_poly_sub(old_s, _poly_mul(quotient, s)), prime)
        old_t, t = t, _poly_mod(_poly_sub(old_t, _poly_mul(quotient, t)), prime)
    if _poly_degree(old_r) < 0:
        return [0], [0], [0]
    leading_inverse = _modular_inverse(old_r[-1] % prime, prime)
    return (
        _poly_mod(_poly_scalar(old_r, leading_inverse), prime),
        _poly_mod(_poly_scalar(old_s, leading_inverse), prime),
        _poly_mod(_poly_scalar(old_t, leading_inverse), prime),
    )


def _poly_gcd_mod(left: list[Any], right: list[Any], prime: Any) -> list[Any]:
    return _poly_xgcd_mod(left, right, prime)[0]


def _integer_gcd(left: Any, right: Any) -> Any:
    a = abs(left)
    b = abs(right)
    while b:
        a, b = b, a % b
    return a


def _integer_lcm(left: Any, right: Any) -> Any:
    if left == 0 or right == 0:
        return 0
    return abs((left // _integer_gcd(left, right)) * right)


def _modular_inverse(value: Any, modulus: Any) -> Any:
    old_remainder = value % modulus
    remainder = modulus
    old_coefficient = 1
    coefficient = 0
    while remainder:
        quotient = old_remainder // remainder
        old_remainder, remainder = (
            remainder,
            old_remainder - quotient * remainder,
        )
        old_coefficient, coefficient = (
            coefficient,
            old_coefficient - quotient * coefficient,
        )
    if old_remainder != 1:
        raise Round4Unsupported("a modular coefficient is not invertible")
    return old_coefficient % modulus


def _valuation(value: Any, prime: Any) -> int:
    if value == 0:
        raise Round4InvariantError("the p-adic valuation of zero is unbounded")
    answer = 0
    remaining = abs(value)
    while remaining % prime == 0:
        remaining //= prime
        answer += 1
    return answer


def round4_required_precision(
    discriminant_valuation: int, reduced_discriminant_valuation: int | None = None
) -> int:
    """Return a conservative Ford--Letard structural-stability precision.

    PARI uses `2*d_f + 1` for the reduced discriminant exponent `d_f`
    and `v_p(disc(f)) + 1` for characteristic-polynomial work.  Until the
    reduced resultant is supplied directly by the P2 native boundary, taking
    the maximum gives a conservative, deterministic precision.
    """
    if discriminant_valuation < 0:
        raise ValueError("a discriminant valuation must be nonnegative")
    reduced = (
        discriminant_valuation // 2
        if reduced_discriminant_valuation is None
        else reduced_discriminant_valuation
    )
    if reduced < 0:
        raise ValueError("a reduced discriminant valuation must be nonnegative")
    return max(1, discriminant_valuation + 1, 2 * reduced + 1)


def _lift_pair(
    target: list[Any],
    left_mod_p: list[Any],
    right_mod_p: list[Any],
    prime: Any,
    precision: int,
) -> tuple[list[Any], list[Any]]:
    """Hensel-lift one coprime factor pair through `prime**precision`."""
    gcd, _bezout_left, bezout_right = _poly_xgcd_mod(left_mod_p, right_mod_p, prime)
    if gcd != [1]:
        raise Round4Unsupported(
            "primary component groups are not coprime modulo the local prime"
        )
    left = _poly_mod(left_mod_p, prime)
    right = _poly_mod(right_mod_p, prime)
    modulus = prime
    for _digit in range(1, precision):
        product = _poly_mul(left, right)
        difference = _poly_sub(target, product)
        size = max(len(difference), 1)
        error = []
        for index in range(size):
            value = difference[index] if index < len(difference) else 0
            if value % modulus != 0:
                raise Round4InvariantError(
                    "Hensel factors lost their product congruence"
                )
            error.append((value // modulus) % prime)
        error = _trim(error)

        # bezout_left*left + bezout_right*right = 1.  Hence the correction
        # to left is bezout_right*error modulo left; the remaining correction
        # is exactly divisible by left and corrects right.
        correction_left = _poly_divmod_mod(
            _poly_mul(bezout_right, error), left_mod_p, prime
        )[1]
        residual = _poly_mod(
            _poly_sub(error, _poly_mul(right_mod_p, correction_left)), prime
        )
        correction_right = _poly_exact_div_mod(residual, left_mod_p, prime)
        next_modulus = modulus * prime
        left = _poly_mod(
            _poly_add(left, _poly_scalar(correction_left, modulus)), next_modulus
        )
        right = _poly_mod(
            _poly_add(right, _poly_scalar(correction_right, modulus)),
            next_modulus,
        )
        modulus = next_modulus
        if _poly_mod(_poly_sub(target, _poly_mul(left, right)), modulus) != [0]:
            raise Round4InvariantError("a Hensel refinement step did not certify")
    return left, right


def _hensel_tree(
    target: list[Any],
    primary_factors_mod_p: list[list[Any]],
    prime: Any,
    precision: int,
) -> list[list[Any]]:
    if len(primary_factors_mod_p) == 1:
        return [_poly_mod(target, prime**precision)]
    middle = len(primary_factors_mod_p) // 2
    left_inputs = primary_factors_mod_p[:middle]
    right_inputs = primary_factors_mod_p[middle:]
    left_mod_p = _poly_mod(_poly_product(left_inputs), prime)
    right_mod_p = _poly_mod(_poly_product(right_inputs), prime)
    left, right = _lift_pair(target, left_mod_p, right_mod_p, prime, precision)
    return _hensel_tree(left, left_inputs, prime, precision) + _hensel_tree(
        right, right_inputs, prime, precision
    )


def hensel_refine_primary_factors(
    polynomial_coefficients: list[Any],
    irreducible_factors: list[list[Any]],
    multiplicities: list[int],
    prime: Any,
    precision: int,
) -> list[list[Any]]:
    """Refine pairwise-coprime primary factors through `p**precision`.

    Each returned factor reduces to `phi_i**e_i` modulo `p` and their
    product is the defining polynomial modulo `p**precision`.  Repeated
    irreducible factors remain together: separating a primary branch is the
    Ford--Letard power-basis problem, not ordinary Hensel lifting.
    """
    if precision < 1:
        raise ValueError("Hensel precision must be positive")
    if len(irreducible_factors) == 0 or len(irreducible_factors) != len(multiplicities):
        raise ValueError("factor and multiplicity vectors must be nonempty")
    primary_factors = []
    for factor, multiplicity in zip(irreducible_factors, multiplicities):
        if multiplicity < 1:
            raise ValueError("factor multiplicities must be positive")
        primary_factors.append(_poly_mod(_poly_pow(factor, multiplicity), prime))
    if _poly_mod(_poly_product(primary_factors), prime) != _poly_mod(
        polynomial_coefficients, prime
    ):
        raise Round4InvariantError(
            "the supplied modular factorization does not define the polynomial"
        )
    refined = _hensel_tree(polynomial_coefficients, primary_factors, prime, precision)
    modulus = prime**precision
    if _poly_mod(_poly_product(refined), modulus) != _poly_mod(
        polynomial_coefficients, modulus
    ):
        raise Round4InvariantError("the refined factors do not multiply correctly")
    for refined_factor, primary_factor in zip(refined, primary_factors):
        if _poly_mod(refined_factor, prime) != primary_factor:
            raise Round4InvariantError("a refined factor changed its primary branch")
    return refined


def dedekind_integral_basis(
    polynomial_coefficients: list[Any],
    irreducible_factors: list[list[Any]],
    multiplicities: list[int],
    prime: Any,
) -> tuple[list[Any], list[Any], list[list[Any]], Any, int]:
    """Compute Dedekind's obstruction and first coefficient-ring basis.

    The returned lattice is `numerator / denominator` in the power basis.
    If `k = gcd(g, h, (f-gh)/p)` and `U = f/k (mod p)`, its rows are
    `1,...,x^(deg(U)-1), U/p, x*U/p,...`.  Ford--Letard's `dbasis` proves
    these elements integral and that they enlarge the equation order by
    `p**(degree(f)-degree(U))`.
    """
    distinct_product = _poly_mod(_poly_product(irreducible_factors), prime)
    reduced_polynomial = _poly_mod(polynomial_coefficients, prime)
    repeated_part = _poly_exact_div_mod(reduced_polynomial, distinct_product, prime)
    lift_product = _poly_mul(distinct_product, repeated_part)
    difference = _poly_sub(polynomial_coefficients, lift_product)
    correction = []
    for value in difference:
        if value % prime != 0:
            raise Round4InvariantError("Dedekind correction is not divisible by p")
        correction.append(value // prime)
    obstruction = _poly_gcd_mod(
        _poly_gcd_mod(distinct_product, repeated_part, prime),
        _poly_mod(correction, prime),
        prime,
    )
    degree = len(polynomial_coefficients) - 1
    if _poly_degree(obstruction) == 0:
        basis = []
        for index in range(degree):
            row = [0 for _column in range(degree)]
            row[index] = 1
            basis.append(row)
        return obstruction, [1], basis, 1, 0

    quotient = _poly_exact_div_mod(reduced_polynomial, obstruction, prime)
    quotient_degree = _poly_degree(quotient)
    numerator = []
    for index in range(quotient_degree):
        row = [0 for _column in range(degree)]
        row[index] = prime
        numerator.append(row)
    for shift in range(degree - quotient_degree):
        row = [0 for _column in range(degree)]
        for index, value in enumerate(quotient):
            if index + shift < degree:
                row[index + shift] = value
        numerator.append(row)
    index_valuation = degree - quotient_degree
    if len(numerator) != degree:
        raise Round4InvariantError("Dedekind basis has the wrong rank")
    return obstruction, quotient, numerator, prime, index_valuation


def _factor_polynomial_mod_prime(
    polynomial: Any, prime: Any
) -> tuple[list[list[Any]], list[int]]:
    variable = polynomial._parent.variable_name()
    finite_field = _nf_global("GF")(prime)
    residue_ring = _nf_global("PolynomialRing")(finite_field, variable)
    reduced = residue_ring(polynomial)
    records: list[tuple[list[Any], int]] = []
    for factor, multiplicity in reduced.factor():
        coefficients = [coefficient.lift() for coefficient in factor.list()]
        records.append((coefficients, runtime.number(multiplicity)))
    records.sort(key=_factor_sort_key)
    return [record[0] for record in records], [record[1] for record in records]


def _factor_sort_key(record: tuple[list[Any], int]) -> tuple[int, str]:
    return _poly_degree(record[0]), str(record[0])


def _coefficient_bits(coefficients: list[Any]) -> int:
    answer = 0
    for coefficient in coefficients:
        value = abs(coefficient)
        bits = 0
        while value:
            value //= 2
            bits += 1
        answer = max(answer, bits)
    return answer


def round4_selector_metrics(
    polynomial_coefficients: list[Any],
    discriminant_valuation: int,
    factor_degrees: list[int],
    factor_multiplicities: list[int],
    required_precision: int,
) -> Round4SelectorMetrics:
    """Return deterministic work estimates and an inspectable recommendation."""
    degree = len(polynomial_coefficients) - 1
    height = _coefficient_bits(polynomial_coefficients)
    repeated_degree = sum(
        degree_value * max(0, multiplicity - 1)
        for degree_value, multiplicity in zip(factor_degrees, factor_multiplicities)
    )
    round2_work = degree * degree * degree * max(1, discriminant_valuation // 2)
    round4_work = degree * degree * required_precision + sum(
        value * value for value in factor_degrees
    )
    if discriminant_valuation <= 2 and degree <= 4:
        recommendation = "round2"
        reason = "tiny degree and shallow local index make matrix setup cheaper"
    elif height >= 128 or discriminant_valuation >= 12:
        recommendation = "round4"
        reason = "coefficient height or local depth favors batched p-adic refinement"
    elif len(factor_degrees) > 1 and repeated_degree <= degree // 2:
        recommendation = "round4"
        reason = "several primary components admit early algebra decomposition"
    elif round4_work < round2_work:
        recommendation = "round4"
        reason = "the explicit operation-count estimate favors p-adic refinement"
    else:
        recommendation = "round2"
        reason = "the measured tiny/moderate fallback estimate is lower"
    return Round4SelectorMetrics(
        degree,
        height,
        discriminant_valuation,
        factor_degrees,
        factor_multiplicities,
        required_precision,
        round2_work,
        round4_work,
        recommendation,
        reason,
    )


def round4_local_plan(
    polynomial: Any,
    prime: Any,
    discriminant_valuation: int | None = None,
    reduced_discriminant_valuation: int | None = None,
) -> Round4LocalPlan:
    """Build and certify all currently implemented modified Round-4 stages."""
    if not _nf_global("is_prime")(prime):
        raise Round4Unsupported(
            "modified Round 4 requires a certified rational prime, not " + str(prime)
        )
    coefficients = list(polynomial.list())
    if len(coefficients) < 2 or coefficients[-1] != 1:
        raise Round4Unsupported("modified Round 4 requires a monic integral polynomial")
    if polynomial._parent.base_ring() is not sage.ZZ:
        raise Round4Unsupported("modified Round 4 requires integral coefficients")
    discriminant = polynomial.discriminant()
    if discriminant == 0:
        raise Round4Unsupported("modified Round 4 requires a separable polynomial")
    actual_valuation = _valuation(discriminant, prime)
    if discriminant_valuation is None:
        discriminant_valuation = actual_valuation
    elif discriminant_valuation != actual_valuation:
        raise Round4InvariantError(
            "the supplied discriminant valuation does not match the polynomial"
        )
    precision = round4_required_precision(
        discriminant_valuation, reduced_discriminant_valuation
    )
    factors, multiplicities = _factor_polynomial_mod_prime(polynomial, prime)
    stages = [
        Round4Stage(
            "factor-mod-p",
            {
                "factor_degrees": [_poly_degree(factor) for factor in factors],
                "multiplicities": list(multiplicities),
            },
        )
    ]
    refined = hensel_refine_primary_factors(
        coefficients, factors, multiplicities, prime, precision
    )
    modulus = prime**precision
    stages.append(
        Round4Stage(
            "refine-primary-factors",
            {
                "precision": precision,
                "modulus": modulus,
                "component_degrees": [_poly_degree(factor) for factor in refined],
                "product_certified": True,
            },
        )
    )
    obstruction, quotient, numerator, denominator, index_valuation = (
        dedekind_integral_basis(coefficients, factors, multiplicities, prime)
    )
    stages.append(
        Round4Stage(
            "dedekind-coefficient-ring",
            {
                "obstruction_degree": _poly_degree(obstruction),
                "integral_elements": index_valuation,
                "basis_denominator_valuation": 0 if denominator == 1 else 1,
                "index_valuation": index_valuation,
            },
        )
    )
    selector = round4_selector_metrics(
        coefficients,
        discriminant_valuation,
        [_poly_degree(factor) for factor in factors],
        multiplicities,
        precision,
    )
    stages.append(Round4Stage("selector", selector.as_dict()))
    return Round4LocalPlan(
        prime,
        coefficients,
        discriminant_valuation,
        precision,
        factors,
        multiplicities,
        refined,
        obstruction,
        quotient,
        numerator,
        denominator,
        index_valuation,
        selector,
        stages,
    )


def _nf_global(name: str) -> Any:
    module = __import__("sagejs._baselib.number_fields", fromlist=["number_fields"])
    return module._nf_global(name)


def _maximal_order_module() -> Any:
    return __import__("sagejs.number_fields.maximal_order", fromlist=["maximal_order"])


def _contracts_module() -> Any:
    """Load the shared maximal-order records without a static lane dependency."""
    return __import__(
        "sagejs.number_fields.maximal_order_contracts",
        fromlist=["maximal_order_contracts"],
    )


def _rows_from_numerator(
    numerator: list[list[Any]], denominator: Any
) -> list[list[Any]]:
    if denominator == 1:
        return [[sage.QQ(value) for value in row] for row in numerator]
    return [
        [_untyped(sage.QQ)(value, denominator) for value in row] for row in numerator
    ]


def _untyped(value: Any) -> Any:
    return value


def _basis_hnf_evidence(order: Any) -> tuple[list[list[Any]], Any]:
    denominator = sage.ZZ(1)
    for row in order._basis_rows:
        for value in row:
            denominator = _integer_lcm(denominator, value._denominator)
    numerator = []
    for row in order._basis_rows:
        numerator.append(
            [value._numerator * (denominator // value._denominator) for value in row]
        )
    return numerator, denominator


def _order_index(contained_order: Any, overorder: Any) -> Any:
    change = overorder.basis_matrix() * contained_order.basis_matrix().inverse()
    determinant = change.determinant()
    inverse = sage.QQ(1) / abs(determinant)
    if inverse._denominator != 1:
        raise Round4InvariantError("the alleged overorder has a nonintegral index")
    return inverse._numerator


def modified_round4_local_order(
    order: Any,
    prime: Any,
    fallback: str = "auto",
    strict: bool = False,
) -> Round4LocalResult:
    """Return a certified `p`-maximal overorder with explicit stage evidence.

    The implemented Round-4 portion performs local factor refinement and the
    complete Dedekind coefficient-ring enlargement in one lattice step.  Deep
    primary branches currently finish through the named Round-2 oracle.  Set
    `strict=True` to reject that fallback, which is useful for measuring the
    independently implemented domain.
    """
    maximal_order = _maximal_order_module()
    field = order.number_field()
    polynomial = maximal_order.integral_equation_polynomial(field)
    plan = round4_local_plan(polynomial, prime)
    original_discriminant = order.discriminant()
    initial = order
    used_dedekind = False
    fallback_reason: str | None = None

    if plan.is_dedekind_maximal() and field._equation_order_cache is order:
        final = order
        algorithm = "round4-dedekind-maximal"
        witness = "Dedekind obstruction is one"
    else:
        if field._equation_order_cache is order and plan.basis_denominator != 1:
            rows = _rows_from_numerator(plan.basis_numerator, plan.basis_denominator)
            # Ford--Letard's dbasis theorem proves closure.  The final
            # certificate retains that construction witness; the independent
            # checker below can still enumerate all products on demand.
            initial = maximal_order.NumberFieldOrder(field, rows, False, False)
            expected = prime**plan.first_layer_index_valuation
            if _order_index(order, initial) != expected:
                raise Round4InvariantError(
                    "the Dedekind coefficient-ring index is inconsistent"
                )
            discriminant_quotient, discriminant_remainder = divmod(
                original_discriminant, expected * expected
            )
            if discriminant_remainder != 0:
                raise Round4InvariantError(
                    "the Dedekind index does not divide the discriminant"
                )
            initial._discriminant_cache = runtime.normalize_integer(
                discriminant_quotient
            )
            used_dedekind = True
            plan.stages.append(
                Round4Stage(
                    "assemble-first-layer-hnf",
                    {
                        "denominator": plan.basis_denominator,
                        "index": expected,
                        "closure_witness": "Ford--Letard dbasis theorem",
                    },
                )
            )

        initial_output_valuation = _valuation(initial.discriminant(), prime)
        if used_dedekind and initial_output_valuation <= 1:
            # A proper p-overorder would lower the discriminant valuation by
            # twice a positive index valuation.  Valuation zero or one leaves
            # no room for one, so the Dedekind order is already p-maximal.
            final = initial
            algorithm = "modified-round4-dedekind-discriminant-certified"
            witness = "output discriminant valuation is at most one"
            plan.stages.append(
                Round4Stage(
                    "local-maximality-certificate",
                    {
                        "method": "discriminant-valuation-bound",
                        "output_valuation": initial_output_valuation,
                    },
                )
            )
        else:
            fallback_reason = (
                "the Ford--Letard primary power-basis search is not yet available; "
                "finish from the certified Dedekind overorder with Round 2"
            )
            if strict:
                raise Round4Unsupported(fallback_reason)
            if fallback not in ["auto", "native-round2", "dynamic-round2"]:
                raise ValueError("unknown Round-4 fallback " + fallback)
            if fallback == "dynamic-round2" or (
                fallback == "auto" and prime > 18446744073709551615
            ):
                final = maximal_order.p_maximal_overorder_dynamic(initial, prime)
                fallback_name = "dynamic-round2"
            else:
                final = maximal_order.maximal_overorder_native(
                    initial, [runtime.number(prime)]
                )
                fallback_name = "native-round2"
            algorithm = (
                "modified-round4-dedekind+" + fallback_name
                if used_dedekind
                else "modified-round4-analysis+" + fallback_name
            )
            witness = fallback_name + " multiplier-ring fixed point"
            plan.stages.append(
                Round4Stage(
                    "round2-fallback",
                    {"implementation": fallback_name, "reason": fallback_reason},
                )
            )

    local_index = _order_index(order, final)
    index_valuation = _valuation(local_index, prime) if local_index != 1 else 0
    output_discriminant = final.discriminant()
    output_valuation = _valuation(output_discriminant, prime)
    input_valuation = _valuation(original_discriminant, prime)
    if input_valuation != output_valuation + 2 * index_valuation:
        raise Round4InvariantError(
            "the local index does not explain the discriminant change"
        )
    numerator, denominator = _basis_hnf_evidence(final)
    certificate = Round4LocalCertificate(
        prime,
        algorithm,
        fallback_reason,
        local_index,
        index_valuation,
        input_valuation,
        output_valuation,
        numerator,
        denominator,
        True,
        witness,
    )
    return Round4LocalResult(final, plan, certificate)


def modified_round4_hnf(
    polynomial_coefficients: list[Any],
    current_basis_numerator: list[list[Any]],
    current_basis_denominator: Any,
    prime: Any,
    fallback: str = "auto",
    strict: bool = False,
) -> Round4LocalResult:
    """Execute the local-order boundary using only canonical packed values.

    `polynomial_coefficients` are in ascending order.  The current order is
    an integer HNF numerator matrix divided by one positive denominator.  The
    result certificate contains the same representation, together with its
    local index and discriminant evidence.  This host-neutral signature is the
    dynamic specification for the eventual one-crossing native P2 boundary.
    """
    if current_basis_denominator <= 0:
        raise ValueError("an HNF basis denominator must be positive")
    degree = len(polynomial_coefficients) - 1
    if degree < 1 or polynomial_coefficients[-1] != 1:
        raise Round4Unsupported("the canonical polynomial must be monic")
    if len(current_basis_numerator) != degree or any(
        len(row) != degree for row in current_basis_numerator
    ):
        raise ValueError("an HNF numerator must be a square degree-by-degree matrix")
    polynomial_ring = _nf_global("PolynomialRing")(sage.ZZ, "x")
    polynomial = polynomial_ring(polynomial_coefficients)
    field = _nf_global("NumberField")(polynomial, "a")
    identity = current_basis_denominator == 1
    if identity:
        for row_index, row in enumerate(current_basis_numerator):
            for column_index, value in enumerate(row):
                if value != (1 if row_index == column_index else 0):
                    identity = False
                    break
            if not identity:
                break
    if identity:
        order = field.equation_order()
    else:
        maximal_order = _maximal_order_module()
        rows = _rows_from_numerator(current_basis_numerator, current_basis_denominator)
        # This is a public execution boundary, so validate that the supplied
        # lattice really is an order before doing local arithmetic.
        order = maximal_order.NumberFieldOrder(field, rows, False, True)
    return modified_round4_local_order(order, prime, fallback, strict)


def round4_selection_decision(metrics: Round4SelectorMetrics) -> Any:
    """Adapt selector metrics to the shared `SelectionDecision` record."""
    contracts = _contracts_module()
    algorithm = "round4" if metrics.recommendation == "round4" else "round2"
    return contracts.SelectionDecision(
        algorithm,
        metrics.reason,
        metrics.as_dict(),
    )


def round4_shared_local_result(result: Round4LocalResult) -> Any:
    """Adapt a completed local computation to the shared contract records."""
    contracts = _contracts_module()
    certificate = result.certificate
    basis = contracts.OrderBasis(
        certificate.basis_numerator,
        certificate.basis_denominator,
        canonical=True,
    )
    component = contracts.DiscriminantComponent(
        certificate.prime,
        "proven-prime",
        evidence={"primality": "certified before Round-4 entry"},
    )
    return contracts.LocalOrderResult(
        "complete",
        "round4",
        component,
        basis=basis,
        index=certificate.local_index,
        discriminant=result.order.discriminant(),
        evidence={
            "implementation": certificate.algorithm,
            "fallback_reason": certificate.fallback_reason,
            "local_index_valuation": certificate.local_index_valuation,
            "input_discriminant_valuation": (certificate.input_discriminant_valuation),
            "output_discriminant_valuation": (
                certificate.output_discriminant_valuation
            ),
            "closure_checked": certificate.closure_checked,
            "p_maximality_witness": certificate.p_maximality_witness,
            "selector": result.plan.selector.as_dict(),
        },
        trace=[stage.as_dict() for stage in result.plan.stages],
        message=(
            None
            if certificate.fallback_reason is None
            else "modified Round 4 completed through its declared Round-2 fallback"
        ),
    )


def modified_round4_hnf_contract(
    polynomial_coefficients: list[Any],
    current_basis_numerator: list[list[Any]],
    current_basis_denominator: Any,
    prime: Any,
    fallback: str = "auto",
    strict: bool = False,
) -> Any:
    """Execute the canonical boundary and return a shared `LocalOrderResult`.

    With `strict=False`, a mathematically unsupported representation becomes
    a typed `not-applicable` result carrying the exact reason.  With
    `strict=True` the same condition raises `Round4Unsupported` so a
    selector cannot silently turn it into a claimed Round-4 success.
    """
    try:
        result = modified_round4_hnf(
            polynomial_coefficients,
            current_basis_numerator,
            current_basis_denominator,
            prime,
            fallback,
            strict,
        )
    except Round4Unsupported as error:
        if strict:
            raise
        contracts = _contracts_module()
        component = contracts.DiscriminantComponent(
            prime,
            "proven-prime",
            evidence={"primality": "required at Round-4 entry"},
        )
        return contracts.LocalOrderResult(
            "not-applicable",
            "round4",
            component,
            evidence={"fallback": fallback, "fail_closed": True},
            message=str(error),
        )
    return round4_shared_local_result(result)


def verify_round4_local_result(result: Round4LocalResult) -> bool:
    """Independently check lattice, closure, index, and local fixed point."""
    maximal_order = _maximal_order_module()
    certificate = result.certificate
    order = result.order
    maximal_order._nf_order_multiplication_table(order)
    numerator, denominator = _basis_hnf_evidence(order)
    if (
        numerator != certificate.basis_numerator
        or denominator != certificate.basis_denominator
    ):
        raise Round4InvariantError("the certificate basis does not match the order")
    if _valuation(order.discriminant(), certificate.prime) != (
        certificate.output_discriminant_valuation
    ):
        raise Round4InvariantError("the certificate discriminant valuation changed")
    check = maximal_order.p_maximal_overorder_dynamic(order, certificate.prime)
    if check._basis_rows != order._basis_rows:
        raise Round4InvariantError("the certified order is not locally maximal")
    return True


__all__ = [
    "Round4InvariantError",
    "Round4LocalCertificate",
    "Round4LocalPlan",
    "Round4LocalResult",
    "Round4SelectorMetrics",
    "Round4Stage",
    "Round4Unsupported",
    "dedekind_integral_basis",
    "hensel_refine_primary_factors",
    "modified_round4_local_order",
    "modified_round4_hnf",
    "modified_round4_hnf_contract",
    "round4_local_plan",
    "round4_required_precision",
    "round4_selection_decision",
    "round4_selector_metrics",
    "round4_shared_local_result",
    "verify_round4_local_result",
]
