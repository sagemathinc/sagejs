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
* an exact local-order adapter that verifies the lattice evidence, constructs
  common deep-primary orders by the Ford--Letard power-basis search, and uses
  the existing Round-2 implementation only at named unsupported boundaries.

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
from sagejs.kernels.matrix.word_prime_krylov import (
    word_prime_krylov_minimal_polynomial,
    word_prime_krylov_workspace_length,
)
from sagejs.native import is_compiled


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
        polynomial_discriminant: Any,
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
        self.polynomial_discriminant = polynomial_discriminant
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
            "polynomial_discriminant": self.polynomial_discriminant,
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


class Round4PowerBasisResult:
    """A locally monogenic order found by the modified Round-4 search."""

    def __init__(
        self,
        order: Any,
        generator_coefficients: list[Any],
        ramification_degree: int,
        residue_degree: int,
        local_index: Any,
        stages: list[Round4Stage],
        verification_algorithm: str,
        characteristic_metrics: dict[str, Any],
    ) -> None:
        self.order = order
        self.generator_coefficients = generator_coefficients
        self.ramification_degree = ramification_degree
        self.residue_degree = residue_degree
        self.local_index = local_index
        self.stages = stages
        self.verification_algorithm = verification_algorithm
        self.characteristic_metrics = characteristic_metrics

    def as_dict(self) -> dict[str, Any]:
        numerator, denominator = _basis_hnf_evidence(self.order)
        return {
            "generator_coefficients": list(self.generator_coefficients),
            "ramification_degree": self.ramification_degree,
            "residue_degree": self.residue_degree,
            "local_index": self.local_index,
            "basis_numerator": numerator,
            "basis_denominator": denominator,
            "verification_algorithm": self.verification_algorithm,
            "characteristic_polynomial_metrics": dict(self.characteristic_metrics),
            "stages": [stage.as_dict() for stage in self.stages],
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
    for factor, multiplicity in zip(irreducible_factors, multiplicities, strict=True):
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
    for refined_factor, primary_factor in zip(refined, primary_factors, strict=True):
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


def _positive_integer_bits(value: Any) -> int:
    remaining = abs(value)
    answer = 0
    while remaining:
        remaining //= 2
        answer += 1
    return answer


def _integer_sqrt_ceiling(value: Any) -> Any:
    if value < 0:
        raise ValueError("an integer square-root input must be nonnegative")
    if value <= 1:
        return value
    approximation = 1 << ((_positive_integer_bits(value) + 1) // 2)
    while True:
        improved = (approximation + value // approximation) // 2
        if improved >= approximation:
            break
        approximation = improved
    if approximation * approximation < value:
        approximation += 1
    return approximation


def _integer_multiplication_matrix_data(
    field: Any,
    element: Any,
) -> tuple[list[list[Any]], Any, list[Any]]:
    """Return a cleared integer multiplication matrix and safe bounds.

    If `B` is multiplication by `denominator*element`, the returned row
    bounds are the ceilings of the exact Euclidean norms of the rows of `B`.
    No floating-point estimate enters CRT reconstruction.
    """
    degree = field.degree()
    coefficients = list(element.list())
    coefficients += [sage.QQ(0) for _index in range(degree - len(coefficients))]
    denominator = sage.ZZ(1)
    for coefficient in coefficients:
        denominator = _integer_lcm(denominator, coefficient._denominator)
    defining = []
    for coefficient in field._defining_coefficients[:-1]:
        if coefficient._denominator != 1:
            raise Round4Unsupported(
                "modular characteristic reconstruction requires an integral monic equation"
            )
        defining.append(coefficient._numerator)
    column = [
        coefficient._numerator * (denominator // coefficient._denominator)
        for coefficient in coefficients
    ]
    columns = []
    for _column_index in range(degree):
        columns.append(list(column))
        leading = column[-1]
        next_column = [-leading * defining[0]]
        for index in range(1, degree):
            next_column.append(column[index - 1] - leading * defining[index])
        column = next_column
    rows = [[columns[column][row] for column in range(degree)] for row in range(degree)]
    row_bounds = []
    for row in range(degree):
        norm_square = sum(value * value for value in rows[row])
        row_bounds.append(_integer_sqrt_ceiling(norm_square))
    return rows, denominator, row_bounds


def _characteristic_coefficient_bounds(row_bounds: list[Any]) -> list[Any]:
    """Bound ascending characteristic coefficients by principal minors."""
    degree = len(row_bounds)
    elementary = [sage.ZZ(1)] + [sage.ZZ(0) for _index in range(degree)]
    used = 0
    for row_bound in row_bounds:
        used += 1
        for index in range(used, 0, -1):
            elementary[index] += row_bound * elementary[index - 1]
    return [elementary[degree - index] for index in range(degree + 1)]


def _modular_integer_power(base: int, exponent: int, modulus: int) -> int:
    answer = 1
    power = base % modulus
    remaining = exponent
    while remaining:
        if remaining % 2:
            answer = (answer * power) % modulus
        remaining //= 2
        if remaining:
            power = (power * power) % modulus
    return answer


def _is_prime_word(value: int) -> bool:
    """Deterministically certify a prime below `2^30`."""
    if value < 2:
        return False
    for small_prime in [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]:
        if value == small_prime:
            return True
        if value % small_prime == 0:
            return False
    odd_part = value - 1
    twos = 0
    while odd_part % 2 == 0:
        odd_part //= 2
        twos += 1
    for witness in [2, 3, 5, 7, 11]:
        if witness >= value:
            continue
        residue = _modular_integer_power(witness, odd_part, value)
        if residue == 1 or residue == value - 1:
            continue
        composite = True
        for _index in range(twos - 1):
            residue = (residue * residue) % value
            if residue == value - 1:
                composite = False
                break
        if composite:
            return False
    return True


def _next_reconstruction_prime(candidate: int) -> tuple[int, int]:
    current = candidate if candidate % 2 else candidate - 1
    while current >= 2:
        if _is_prime_word(current):
            return current, current - 2
        current -= 2
    raise Round4InvariantError("the deterministic CRT prime stream was exhausted")


def _modular_power_basis_is_cyclic(rows: list[list[Any]], prime: int) -> bool:
    """Certify modulo `prime` that the first coordinate is cyclic."""
    degree = len(rows)
    vector = [1] + [0 for _index in range(degree - 1)]
    columns = []
    for _exponent in range(degree):
        columns.append(list(vector))
        vector = [
            sum(
                runtime.number(rows[row][column] % prime) * vector[column]
                for column in range(degree)
            )
            % prime
            for row in range(degree)
        ]
    matrix_rows = [
        [columns[column][row] for column in range(degree)] for row in range(degree)
    ]
    rank = 0
    for column in range(degree):
        pivot = rank
        while pivot < degree and matrix_rows[pivot][column] == 0:
            pivot += 1
        if pivot == degree:
            continue
        matrix_rows[rank], matrix_rows[pivot] = (
            matrix_rows[pivot],
            matrix_rows[rank],
        )
        inverse = _modular_inverse(matrix_rows[rank][column], prime)
        for index in range(column, degree):
            matrix_rows[rank][index] = (matrix_rows[rank][index] * inverse) % prime
        for row in range(rank + 1, degree):
            multiplier = matrix_rows[row][column]
            if multiplier:
                for index in range(column, degree):
                    matrix_rows[row][index] = (
                        matrix_rows[row][index] - multiplier * matrix_rows[rank][index]
                    ) % prime
        rank += 1
    return rank == degree


def _annihilates_first_coordinate(
    rows: list[list[Any]],
    coefficients: list[Any],
) -> bool:
    """Check `polynomial(B)e_0 == 0` exactly by Horner evaluation."""
    degree = len(rows)
    vector = [sage.ZZ(1)] + [sage.ZZ(0) for _index in range(degree - 1)]
    for coefficient in reversed(coefficients[:-1]):
        next_vector = []
        for row in range(degree):
            value = sum(rows[row][column] * vector[column] for column in range(degree))
            if row == 0:
                value += coefficient
            next_vector.append(value)
        vector = next_vector
    return all(value == 0 for value in vector)


def _word_prime_first_coordinate_minimal_polynomial(
    rows: list[list[Any]],
    prime: int,
) -> list[int]:
    """Use the packed kernel for a first-coordinate relation modulo `prime`."""
    degree = len(rows)
    entries = [runtime.number(value % prime) for row in rows for value in row]
    workspace_length = word_prime_krylov_workspace_length(degree)
    if is_compiled(word_prime_krylov_minimal_polynomial):
        matrix = runtime.uint64_buffer(entries)
        output = runtime.uint64_buffer(degree + 1)
        workspace = runtime.uint64_buffer(workspace_length)
        modulus = runtime.integer_bigint(prime)
    else:
        matrix = entries
        output = [0 for _index in range(degree + 1)]
        workspace = [0 for _index in range(workspace_length)]
        modulus = prime
    minimal_degree = word_prime_krylov_minimal_polynomial(
        output,
        matrix,
        workspace,
        degree,
        modulus,
    )
    if minimal_degree <= 0 or minimal_degree > degree:
        raise Round4InvariantError(
            "the packed word-prime Krylov kernel returned an invalid degree"
        )
    return [runtime.number(output[index]) for index in range(minimal_degree + 1)]


def _minimal_polynomial_coefficient_bounds(
    rows: list[list[Any]],
    minimal_degree: int,
) -> list[Any]:
    """Bound minimal coefficients using the exact infinity operator norm."""
    root_bound = max(sum(abs(value) for value in row) for row in rows)
    binomial = sage.ZZ(1)
    bounds = []
    for power in range(minimal_degree, -1, -1):
        index = minimal_degree - power
        if index:
            binomial = binomial * (minimal_degree - index + 1) // index
        bounds.append(binomial * root_bound**power)
    return bounds


def _integer_polynomial_power(
    coefficients: list[Any],
    exponent: int,
) -> list[Any]:
    """Raise an ascending integer polynomial by exact convolution."""
    answer = [sage.ZZ(1)]
    for _index in range(exponent):
        product = [
            sage.ZZ(0) for _coefficient in range(len(answer) + len(coefficients) - 1)
        ]
        for left, left_coefficient in enumerate(answer):
            for right, right_coefficient in enumerate(coefficients):
                product[left + right] += left_coefficient * right_coefficient
        answer = product
    return answer


def _integer_field_element_characteristic_polynomial(
    rows: list[list[Any]],
    first_prime: int,
    first_modular_minimal: list[int],
) -> tuple[list[Any], int, int]:
    """Recover a noncyclic field element characteristic polynomial by CRT.

    The infinity norm bounds the coefficients of the element's minimal
    polynomial. A modular degree witness plus exact annihilation certifies that
    degree over `QQ`. For multiplication by `beta` on a number field `K`, the
    characteristic polynomial is then the minimal polynomial raised to
    `[K:QQ(beta)]`.
    """
    degree = len(rows)
    candidate_prime = first_prime - 2
    minimal_degree = len(first_modular_minimal) - 1
    residues = [sage.ZZ(value) for value in first_modular_minimal]
    modulus = sage.ZZ(first_prime)
    prime_count = 1
    bounds = _minimal_polynomial_coefficient_bounds(rows, minimal_degree)
    while prime_count <= 4096:
        if modulus > 2 * max(bounds):
            half_modulus = modulus // 2
            centered = [
                residue - modulus if residue > half_modulus else residue
                for residue in residues
            ]
            if _annihilates_first_coordinate(rows, centered):
                if minimal_degree <= 0 or degree % minimal_degree != 0:
                    raise Round4InvariantError(
                        "a field element has an invalid minimal-polynomial degree"
                    )
                characteristic = _integer_polynomial_power(
                    centered,
                    degree // minimal_degree,
                )
                return characteristic, prime_count, _positive_integer_bits(modulus)
        prime, candidate_prime = _next_reconstruction_prime(candidate_prime)
        modular_minimal = _word_prime_first_coordinate_minimal_polynomial(rows, prime)
        modular_degree = len(modular_minimal) - 1
        prime_count += 1
        if modular_degree > minimal_degree:
            minimal_degree = modular_degree
            residues = [sage.ZZ(value) for value in modular_minimal]
            modulus = sage.ZZ(prime)
            bounds = _minimal_polynomial_coefficient_bounds(rows, minimal_degree)
            continue
        if modular_degree < minimal_degree:
            continue
        inverse = _modular_inverse(runtime.number(modulus % prime), prime)
        for index, coefficient in enumerate(modular_minimal):
            correction = (
                (coefficient - runtime.number(residues[index] % prime)) * inverse
            ) % prime
            residues[index] += modulus * correction
        modulus *= prime
    raise Round4Unsupported(
        "exact modular minimal-polynomial reconstruction exceeded 4096 primes"
    )


def _modular_characteristic_polynomial(
    field: Any,
    element: Any,
    metrics: dict[str, Any] | None = None,
) -> list[Any]:
    """Reconstruct an exact characteristic polynomial by bounded CRT.

    The coefficient bounds are sums of Hadamard bounds for all principal
    minors.  Once the product of independently certified word primes exceeds
    twice the largest bound, centered reconstruction is unique over `ZZ`.
    Reconstruction can finish earlier when the first coordinate is proved
    cyclic modulo one CRT prime and the centered candidate annihilates it
    exactly.  Cyclicity lifts from the finite field to `QQ`; hence that monic
    degree-`n` annihilator is necessarily the characteristic polynomial.
    """
    rows, denominator, row_bounds = _integer_multiplication_matrix_data(
        field,
        element,
    )
    degree = field.degree()
    bounds = _characteristic_coefficient_bounds(row_bounds)
    largest_bound = max(bounds)
    largest_bound_bits = _positive_integer_bits(largest_bound)
    residues = [sage.ZZ(0) for _index in range(degree + 1)]
    modulus = sage.ZZ(1)
    candidate_prime = 1073741823
    prime_count = 0
    previous_centered = None
    integer_coefficients = None
    cyclic = False
    certification = "coefficient-bound"
    minimal_modulus_bits = 0
    while integer_coefficients is None:
        prime, candidate_prime = _next_reconstruction_prime(candidate_prime)
        modular_minimal = None
        if largest_bound_bits >= _ROUND4_CRT_BOUND_BITS:
            modular_minimal = _word_prime_first_coordinate_minimal_polynomial(
                rows,
                prime,
            )
            if len(modular_minimal) != degree + 1:
                (
                    integer_coefficients,
                    prime_count,
                    minimal_modulus_bits,
                ) = _integer_field_element_characteristic_polynomial(
                    rows,
                    prime,
                    modular_minimal,
                )
                certification = "field-minimal-polynomial-crt"
                break
        residue_field = _nf_global("GF")(prime)
        modular_rows = [[residue_field(value % prime) for value in row] for row in rows]
        modular_coefficients = list(
            _nf_global("matrix")(residue_field, modular_rows).charpoly().list()
        )
        modulus_mod_prime = runtime.number(modulus % prime)
        inverse = _modular_inverse(modulus_mod_prime, prime)
        for index, coefficient in enumerate(modular_coefficients):
            target = runtime.number(coefficient.lift())
            correction = (
                (target - runtime.number(residues[index] % prime)) * inverse
            ) % prime
            residues[index] += modulus * correction
        modulus *= prime
        prime_count += 1
        if modular_minimal is None:
            cyclic = cyclic or _modular_power_basis_is_cyclic(rows, prime)
        else:
            cyclic = True
        if prime_count > 4096:
            raise Round4Unsupported(
                "exact modular characteristic reconstruction exceeded 4096 primes"
            )
        half_modulus = modulus // 2
        centered_coefficients = [
            residue - modulus if residue > half_modulus else residue
            for residue in residues
        ]
        if modulus > 2 * largest_bound:
            integer_coefficients = centered_coefficients
        elif (
            cyclic
            and previous_centered == centered_coefficients
            and _annihilates_first_coordinate(rows, centered_coefficients)
        ):
            integer_coefficients = centered_coefficients
            certification = "cyclic-krylov"
        previous_centered = centered_coefficients
    for index, coefficient in enumerate(integer_coefficients):
        if abs(coefficient) > bounds[index]:
            raise Round4InvariantError(
                "a reconstructed characteristic coefficient exceeds its bound"
            )
    coefficients = []
    for index, coefficient in enumerate(integer_coefficients):
        denominator_power = denominator ** (degree - index)
        coefficients.append(sage.QQ(coefficient) / sage.QQ(denominator_power))
    if metrics is not None:
        metrics["modular_characteristic_calls"] = (
            metrics.get("modular_characteristic_calls", 0) + 1
        )
        metrics["modular_characteristic_primes"] = (
            metrics.get("modular_characteristic_primes", 0) + prime_count
        )
        metrics["modular_characteristic_max_bound_bits"] = max(
            metrics.get("modular_characteristic_max_bound_bits", 0),
            _positive_integer_bits(largest_bound),
        )
        metrics["modular_characteristic_max_modulus_bits"] = max(
            metrics.get("modular_characteristic_max_modulus_bits", 0),
            _positive_integer_bits(modulus),
            minimal_modulus_bits,
        )
        certification_counts = metrics.get("modular_characteristic_certifications")
        if certification_counts is None:
            certification_counts = {}
            metrics["modular_characteristic_certifications"] = certification_counts
        certification_counts[certification] = (
            certification_counts.get(certification, 0) + 1
        )
    return coefficients


_ROUND4_CRT_BOUND_BITS = 4096


def residue_characteristic_strategy(field: Any, element: Any) -> dict[str, Any]:
    """Choose direct or modular characteristic arithmetic from exact cost data.

    The cutoff is a measured crossover for the Round-4 corpus. Direct FLINT
    arithmetic wins for the #2510 and vector008 residue matrices, whose
    measured bounds stay below 2344 bits. Vector010's obstructing residue
    matrices exceed 5740 bits and require the modular path. The decision
    depends only on the matrix dimension and its deterministic Hadamard bound,
    never on a polynomial identity, stage label, or corpus identity.
    """
    _rows, _denominator, row_bounds = _integer_multiplication_matrix_data(
        field,
        element,
    )
    coefficient_bounds = _characteristic_coefficient_bounds(row_bounds)
    bound_bits = _positive_integer_bits(max(coefficient_bounds))
    strategy = "modular-crt" if bound_bits >= _ROUND4_CRT_BOUND_BITS else "direct-exact"
    return {
        "strategy": strategy,
        "degree": field.degree(),
        "hadamard_bound_bits": bound_bits,
        "estimated_crt_primes": (bound_bits + 29) // 30,
        "crt_bound_bits_cutoff": _ROUND4_CRT_BOUND_BITS,
    }


def _record_characteristic_strategy(
    metrics: dict[str, Any],
    metric_label: str,
    decision: dict[str, Any],
) -> None:
    strategy_counts = metrics.get("characteristic_strategy_counts")
    if strategy_counts is None:
        strategy_counts = {}
        metrics["characteristic_strategy_counts"] = strategy_counts
    strategy = decision["strategy"]
    strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
    metrics["characteristic_strategy_max_bound_bits"] = max(
        metrics.get("characteristic_strategy_max_bound_bits", 0),
        decision["hadamard_bound_bits"],
    )
    decisions = metrics.get("characteristic_strategy_decisions")
    if decisions is None:
        decisions = []
        metrics["characteristic_strategy_decisions"] = decisions
    recorded = dict(decision)
    recorded["label"] = metric_label
    decisions.append(recorded)


def _record_characteristic_input(
    element: Any,
    metrics: dict[str, Any],
    metric_label: str,
) -> None:
    input_bits = 0
    denominator_bits = 0
    for coefficient in element.list():
        numerator_size = _positive_integer_bits(coefficient._numerator)
        denominator_size = _positive_integer_bits(coefficient._denominator)
        input_bits += numerator_size + denominator_size
        denominator_bits = max(denominator_bits, denominator_size)
    metrics["characteristic_polynomial_calls"] += 1
    metrics["input_coefficient_bits_total"] += input_bits
    metrics["max_input_coefficient_bits"] = max(
        metrics["max_input_coefficient_bits"], input_bits
    )
    metrics["max_denominator_bits"] = max(
        metrics["max_denominator_bits"], denominator_bits
    )
    metrics["characteristic_polynomial_inputs"].append(
        {
            "label": metric_label,
            "coefficient_bits": input_bits,
            "denominator_bits": denominator_bits,
        }
    )
    call_limit = metrics.get("characteristic_polynomial_call_limit")
    if (
        call_limit is not None
        and metrics["characteristic_polynomial_calls"] > call_limit
    ):
        raise Round4Unsupported(
            "the diagnostic characteristic-polynomial call limit was reached"
        )


def _element_characteristic_polynomial(
    field: Any,
    element: Any,
    metrics: dict[str, Any] | None = None,
    metric_label: str = "unspecified",
) -> list[Any]:
    """Return the exact regular-representation characteristic polynomial.

    The matrix is assembled transparently from `1,x,...,x^(n-1)` and its
    columns under multiplication by `element`. Matrix characteristic
    polynomial computation then uses Sage.js's exact FLINT-backed operation
    with its dynamic fallback. The result is in ascending coefficient order.
    """
    degree = field.degree()
    if metrics is not None:
        _record_characteristic_input(element, metrics, metric_label)
    columns = []
    product = element
    generator = field.gen()
    for _column in range(degree):
        column = list(product.list())
        column += [sage.QQ(0) for _index in range(degree - len(column))]
        columns.append(column)
        product *= generator
    rows = []
    for row_index in range(degree):
        rows.append([columns[column][row_index] for column in range(degree)])
    matrix = _nf_global("matrix")(sage.QQ, rows)
    return list(matrix.charpoly().list())


def _integral_characteristic_polynomial(
    field: Any,
    element: Any,
    cache: dict[Any, list[Any]] | None = None,
    metrics: dict[str, Any] | None = None,
    metric_label: str = "unspecified",
) -> list[Any] | None:
    key = None
    if cache is not None:
        key = tuple(
            (coefficient._numerator, coefficient._denominator)
            for coefficient in element.list()
        )
        cached = cache.get(key)
        if cached is not None:
            if metrics is not None:
                metrics["characteristic_polynomial_cache_hits"] += 1
            return list(cached)
    if metric_label in ["residue-beta", "residue-root-error"]:
        if metrics is not None:
            _record_characteristic_input(element, metrics, metric_label)
        decision = residue_characteristic_strategy(field, element)
        if metrics is not None:
            _record_characteristic_strategy(metrics, metric_label, decision)
        if decision["strategy"] == "modular-crt":
            coefficients = _modular_characteristic_polynomial(
                field,
                element,
                metrics,
            )
        else:
            coefficients = _element_characteristic_polynomial(field, element)
    else:
        coefficients = _element_characteristic_polynomial(
            field,
            element,
            metrics,
            metric_label,
        )
    answer = []
    for coefficient in coefficients:
        if coefficient._denominator != 1:
            return None
        answer.append(coefficient._numerator)
    if cache is not None and key is not None:
        cache[key] = list(answer)
    return answer


def _evaluate_polynomial_element(
    coefficients: list[Any],
    element: Any,
) -> Any:
    answer = element.parent()(0)
    for coefficient in reversed(coefficients):
        answer = answer * element + coefficient
    return answer


def _vstar_characteristic(
    coefficients: list[Any],
    prime: Any,
) -> tuple[int, int]:
    """Return Ford--Letard's minimum extension valuation `L/E`."""
    degree = len(coefficients) - 1
    best_valuation = 0
    best_denominator = 1
    found = False
    for denominator in range(1, degree + 1):
        coefficient = coefficients[degree - denominator]
        if coefficient == 0:
            continue
        valuation = _valuation(coefficient, prime)
        if not found or valuation * best_denominator < best_valuation * denominator:
            best_valuation = valuation
            best_denominator = denominator
            found = True
    if not found:
        raise Round4InvariantError(
            "a characteristic polynomial supplied no finite extension valuation"
        )
    common = _integer_gcd(best_valuation, best_denominator)
    return best_valuation // common, best_denominator // common


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_remainder, remainder = left, right
    old_left, current_left = 1, 0
    old_right, current_right = 0, 1
    while remainder:
        quotient = old_remainder // remainder
        old_remainder, remainder = (
            remainder,
            old_remainder - quotient * remainder,
        )
        old_left, current_left = (
            current_left,
            old_left - quotient * current_left,
        )
        old_right, current_right = (
            current_right,
            old_right - quotient * current_right,
        )
    return old_remainder, old_left, old_right


def _round4_uniformizer(
    beta: Any,
    numerator: int,
    ramification_degree: int,
    prime: Any,
) -> tuple[Any, int, int]:
    if ramification_degree == 1:
        return beta.parent()(prime), 0, 1
    common, exponent, signed_prime_exponent = _extended_gcd(
        numerator,
        ramification_degree,
    )
    if common != 1:
        raise Round4InvariantError("a reduced extension valuation is not coprime")
    prime_exponent = -signed_prime_exponent
    while exponent <= 0:
        exponent += ramification_degree
        prime_exponent += numerator
    if prime_exponent < 0:
        raise Round4InvariantError("a Round-4 uniformizer acquired p in its numerator")
    return beta**exponent / prime**prime_exponent, exponent, prime_exponent


def _p_adic_reduce_element(
    field: Any,
    element: Any,
    prime: Any,
    precision: int,
) -> Any:
    """Choose a small global representative of one local field element.

    Odd denominator parts are units in `ZZ_p`; replacing their inverses modulo
    `p**precision` preserves every characteristic-polynomial decision made by
    the bounded Round-4 search.  The only denominator retained in the result
    is a power of `p`.
    """
    coefficients = element.list()
    denominator = sage.ZZ(1)
    for coefficient in coefficients:
        denominator = _integer_lcm(denominator, coefficient._denominator)
    denominator_valuation = _valuation(denominator, prime) if denominator != 1 else 0
    prime_denominator = prime**denominator_valuation
    unit = denominator // prime_denominator
    modulus = prime ** (precision + denominator_valuation)
    unit_inverse = _modular_inverse(unit % modulus, modulus)
    half_modulus = modulus // 2
    reduced = []
    for coefficient in coefficients:
        numerator = coefficient._numerator * (denominator // coefficient._denominator)
        value = (numerator * unit_inverse) % modulus
        if value > half_modulus:
            value -= modulus
        reduced.append(sage.QQ(value) / sage.QQ(prime_denominator))
    return field._from_coefficients(reduced)


def _single_characteristic_branch(
    coefficients: list[Any],
    prime: Any,
) -> tuple[list[Any], int]:
    polynomial_ring = _nf_global("PolynomialRing")(sage.ZZ, "z")
    polynomial = polynomial_ring(coefficients)
    factors, multiplicities = _factor_polynomial_mod_prime(polynomial, prime)
    if len(factors) != 1:
        raise Round4Unsupported(
            "the current Round-4 power-basis search requires one primary "
            "characteristic branch; use the certified decomposition path"
        )
    return factors[0], multiplicities[0]


def _quotient_polynomial_product(
    left: list[Any],
    right: list[Any],
    modulus_polynomial: list[Any],
    prime: Any,
) -> list[Any]:
    _quotient, remainder = _poly_divmod_mod(
        _poly_mul(left, right),
        modulus_polynomial,
        prime,
    )
    return remainder


def _quotient_polynomial_power(
    base: list[Any],
    exponent: int,
    modulus_polynomial: list[Any],
    prime: Any,
) -> list[Any]:
    answer: list[Any] = [1]
    power = _poly_mod(base, prime)
    remaining = exponent
    while remaining:
        if remaining % 2:
            answer = _quotient_polynomial_product(
                answer,
                power,
                modulus_polynomial,
                prime,
            )
        remaining //= 2
        if remaining:
            power = _quotient_polynomial_product(
                power,
                power,
                modulus_polynomial,
                prime,
            )
    return answer


def _quotient_polynomial_evaluate(
    polynomial: list[Any],
    value: list[Any],
    modulus_polynomial: list[Any],
    prime: Any,
) -> list[Any]:
    answer: list[Any] = [0]
    for coefficient in reversed(polynomial):
        answer = _quotient_polynomial_product(
            answer,
            value,
            modulus_polynomial,
            prime,
        )
        answer = _poly_mod(_poly_add(answer, [coefficient]), prime)
    return answer


def _bounded_residue_roots(
    polynomial: list[Any],
    residue_modulus: list[Any],
    prime: Any,
) -> list[list[Any]]:
    """Find one residue root and its Frobenius orbit, or fail closed.

    This is the source-transparent counterpart of PARI's `FpX_ffisom` for
    the modest residue fields encountered by the public deep-primary corpus.
    Enumeration is deliberately bounded; larger fields retain the named
    unsupported boundary until the native finite-field isomorphism is wired
    to this ordinary-Python specification.
    """
    residue_degree = _poly_degree(residue_modulus)
    if polynomial == residue_modulus:
        first_root = [0, 1]
    else:
        if prime > 65536:
            raise Round4Unsupported(
                "higher-residue-field root matching exceeds the bounded search"
            )
        prime_number = runtime.number(prime)
        field_size = 1
        for _index in range(residue_degree):
            field_size *= prime_number
            if field_size > 65536:
                raise Round4Unsupported(
                    "higher-residue-field root matching exceeds the bounded search"
                )
        first_root = []
        found = False
        for code in range(field_size):
            remaining = code
            candidate = []
            for _index in range(residue_degree):
                candidate.append(remaining % prime_number)
                remaining //= prime_number
            candidate = _trim(candidate)
            value = _quotient_polynomial_evaluate(
                polynomial,
                candidate,
                residue_modulus,
                prime,
            )
            if _poly_degree(value) < 0:
                first_root = candidate
                found = True
                break
        if not found:
            raise Round4InvariantError(
                "an expected finite-field embedding supplied no residue root"
            )
    roots = []
    root = first_root
    for _index in range(_poly_degree(polynomial)):
        if root not in roots:
            roots.append(root)
        root = _quotient_polynomial_power(
            root,
            runtime.number(prime),
            residue_modulus,
            prime,
        )
    return roots


def _power_basis_rows(field: Any, generator: Any) -> list[list[Any]]:
    degree = field.degree()
    rows = []
    power = field.one()
    for _exponent in range(degree):
        coefficients = list(power.list())
        coefficients += [sage.QQ(0) for _index in range(degree - len(coefficients))]
        rows.append(coefficients)
        power *= generator
    return rows


def _exact_field_element_quotient(
    field: Any,
    dividend: Any,
    divisor: Any,
    metrics: dict[str, Any] | None = None,
    metric_label: str = "exact-field-quotient",
) -> Any:
    """Return `dividend / divisor` with exact multiplication evidence.

    Direct number-field inversion forms a rational function modulo the
    defining polynomial.  During Round-4 normalization that route can create
    enormous intermediate coefficients even when the quotient itself has a
    small reduced representative.  Multiplication by a nonzero field element
    is instead an invertible `QQ`-linear map.  Solve its integer-cleared
    regular representation, then verify the exact matrix product before
    accepting the quotient.
    """
    if divisor == field.zero():
        raise Round4Unsupported("exact field-element division has zero divisor")
    degree = field.degree()
    integer_rows, denominator, _row_bounds = _integer_multiplication_matrix_data(
        field,
        divisor,
    )
    if metrics is not None:
        metrics["exact_field_quotient_calls"] = (
            metrics.get("exact_field_quotient_calls", 0) + 1
        )
    multiplication = _nf_global("matrix")(sage.ZZ, integer_rows)
    coordinates = list(dividend.list())
    coordinates += [sage.QQ(0) for _index in range(degree - len(coordinates))]
    right = _nf_global("vector")(
        sage.QQ,
        [sage.QQ(denominator) * coordinate for coordinate in coordinates],
    )
    try:
        solution = multiplication.solve_right(right)
    except (ArithmeticError, ValueError) as error:
        raise Round4Unsupported(
            "exact field-element multiplication system is not solvable"
        ) from error
    if multiplication * solution != right:
        raise Round4InvariantError(
            "exact field-element quotient failed multiplication recovery"
        )
    if metrics is not None:
        metrics["exact_field_quotient_recoveries"] = (
            metrics.get("exact_field_quotient_recoveries", 0) + 1
        )
        inputs = metrics.get("exact_field_quotient_inputs")
        if inputs is None:
            inputs = []
            metrics["exact_field_quotient_inputs"] = inputs
        inputs.append(
            {
                "label": metric_label,
                "degree": degree,
                "matrix_denominator_bits": _positive_integer_bits(denominator),
            }
        )
    return field._from_coefficients(list(solution))


def _round4_residue_refinement(
    field: Any,
    phi: Any,
    nu: list[Any],
    ramification_degree: int,
    prime: Any,
    discriminant_valuation: int,
    stages: list[Round4Stage],
    characteristic_cache: dict[Any, list[Any]],
    characteristic_metrics: dict[str, Any],
) -> tuple[Any, list[Any], int, int]:
    """Increase the residue degree by Ford--Letard beta refinement.

    This is the `loop`/`testb2` part of modified Round 4.  The implemented
    branch is the common primary case in which the current residue field is
    prime.  Higher residue-field root matching remains a precise unsupported
    boundary rather than an implicit Round-2 construction.
    """
    degree = field.degree()
    residue_degree = _poly_degree(nu)
    nu_at_phi = _evaluate_polynomial_element(nu, phi)
    # A degree-sized structural window is the inexpensive first attempt.  The
    # exact closure/fixed-point checks below make this safe: insufficient
    # precision cannot be reported as a maximal order.
    precision = max(3, min(discriminant_valuation + 2, 2 * degree + 1))
    beta = _p_adic_reduce_element(
        field,
        nu_at_phi**ramification_degree,
        prime,
        precision,
    )
    bound = 2 * discriminant_valuation + 2 * degree + 4
    refinements = []
    for iteration in range(bound):
        beta_characteristic = _integral_characteristic_polynomial(
            field,
            beta,
            characteristic_cache,
            characteristic_metrics,
            "residue-beta",
        )
        if beta_characteristic is None:
            raise Round4InvariantError("Round-4 beta ceased to be integral")
        norm = beta_characteristic[0]
        if norm == 0:
            raise Round4Unsupported("Round-4 beta has zero norm")
        norm_valuation = _valuation(norm, prime)
        quotient = norm_valuation // degree
        remainder = (
            norm_valuation * ramification_degree // degree
            - quotient * ramification_degree
        )

        gamma = beta / prime**quotient
        if remainder:
            gamma = _exact_field_element_quotient(
                field,
                gamma,
                nu_at_phi**remainder,
                characteristic_metrics,
                "residue-gamma-normalization",
            )
        gamma = _p_adic_reduce_element(field, gamma, prime, precision)
        gamma_characteristic = _integral_characteristic_polynomial(
            field,
            gamma,
            characteristic_cache,
            characteristic_metrics,
            "residue-gamma",
        )
        used_minimum_valuation = False
        if gamma_characteristic is None:
            local_numerator, local_denominator = _vstar_characteristic(
                beta_characteristic,
                prime,
            )
            quotient = local_numerator // local_denominator
            remainder = (
                local_numerator * ramification_degree // local_denominator
                - quotient * ramification_degree
            )
            gamma = beta / prime**quotient
            if remainder:
                gamma = _exact_field_element_quotient(
                    field,
                    gamma,
                    nu_at_phi**remainder,
                    characteristic_metrics,
                    "residue-gamma-minimum-valuation-normalization",
                )
            gamma = _p_adic_reduce_element(field, gamma, prime, precision)
            gamma_characteristic = _integral_characteristic_polynomial(
                field,
                gamma,
                characteristic_cache,
                characteristic_metrics,
                "residue-gamma-minimum-valuation",
            )
            used_minimum_valuation = True
        if gamma_characteristic is None:
            raise Round4Unsupported(
                "the beta normalization did not produce a locally integral element"
            )

        gamma_factor, gamma_multiplicity = _single_characteristic_branch(
            gamma_characteristic,
            prime,
        )
        gamma_residue_degree = _poly_degree(gamma_factor)
        refinements.append(
            {
                "iteration": iteration,
                "norm_valuation": norm_valuation,
                "quotient": quotient,
                "remainder": remainder,
                "used_minimum_valuation": used_minimum_valuation,
                "residue_degree": gamma_residue_degree,
                "multiplicity": gamma_multiplicity,
            }
        )

        if gamma_residue_degree > residue_degree:
            if gamma_residue_degree % residue_degree != 0:
                raise Round4Unsupported(
                    "a residue-degree increase is not divisible by the old degree"
                )
            candidate = _p_adic_reduce_element(
                field,
                gamma + phi,
                prime,
                precision,
            )
            candidate_characteristic = _integral_characteristic_polynomial(
                field,
                candidate,
                characteristic_cache,
                characteristic_metrics,
                "residue-degree-composition",
            )
            if candidate_characteristic is None:
                raise Round4Unsupported(
                    "the deterministic residue-degree composition is not integral"
                )
            candidate_factor, candidate_multiplicity = _single_characteristic_branch(
                candidate_characteristic,
                prime,
            )
            candidate_residue_degree = _poly_degree(candidate_factor)
            if candidate_residue_degree < gamma_residue_degree:
                raise Round4Unsupported(
                    "the deterministic residue-degree composition made no progress"
                )
            stages.append(
                Round4Stage(
                    "power-basis-residue-refinement",
                    {
                        "old_residue_degree": residue_degree,
                        "new_residue_degree": candidate_residue_degree,
                        "multiplicity": candidate_multiplicity,
                        "iterations": refinements,
                    },
                )
            )
            return (
                candidate,
                candidate_factor,
                ramification_degree,
                candidate_residue_degree,
            )

        if residue_degree % gamma_residue_degree != 0:
            raise Round4Unsupported(
                "incomparable residue degrees require recursive testb2 composition"
            )
        if residue_degree == 1:
            residue_roots = [[-gamma_factor[0]]]
        else:
            residue_roots = _bounded_residue_roots(
                gamma_factor,
                nu,
                prime,
            )
        error_element = None
        error_characteristic = None
        error_numerator = 0
        error_ramification = 1
        residue_root_element = None
        for residue_root in residue_roots:
            root_element = _evaluate_polynomial_element(residue_root, phi)
            trial_error = gamma - root_element
            trial_characteristic = _integral_characteristic_polynomial(
                field,
                trial_error,
                characteristic_cache,
                characteristic_metrics,
                "residue-root-error",
            )
            if trial_characteristic is None:
                continue
            trial_factor, _trial_multiplicity = _single_characteristic_branch(
                trial_characteristic,
                prime,
            )
            if trial_factor != [0, 1]:
                continue
            error_element = trial_error
            error_characteristic = trial_characteristic
            residue_root_element = root_element
            error_numerator, error_ramification = _vstar_characteristic(
                error_characteristic,
                prime,
            )
            break
        if error_element is None or residue_root_element is None:
            raise Round4Unsupported(
                "no conjugate residue root has positive local valuation"
            )
        if ramification_degree % error_ramification != 0:
            error_uniformizer, error_exponent, error_prime_exponent = (
                _round4_uniformizer(
                    error_element,
                    error_numerator,
                    error_ramification,
                    prime,
                )
            )
            error_uniformizer = _p_adic_reduce_element(
                field,
                error_uniformizer,
                prime,
                precision,
            )
            if (
                _integral_characteristic_polynomial(
                    field,
                    error_uniformizer,
                    characteristic_cache,
                    characteristic_metrics,
                    "residue-error-uniformizer",
                )
                is None
            ):
                raise Round4Unsupported(
                    "the testc2 prime element did not certify as integral"
                )
            common, error_power, old_power = _extended_gcd(
                ramification_degree,
                error_ramification,
            )
            if common <= 0:
                raise Round4InvariantError("invalid testc2 ramification gcd")
            prime_power = 0
            while error_power < 0:
                error_power += error_ramification
                prime_power += 1
            while old_power < 0:
                old_power += ramification_degree
                prime_power += 1
            composition = (
                nu_at_phi**old_power
                * error_uniformizer**error_power
                / prime**prime_power
            )
            composition = _p_adic_reduce_element(
                field,
                composition,
                prime,
                precision,
            )
            candidate = _p_adic_reduce_element(
                field,
                phi + composition,
                prime,
                precision,
            )
            candidate_characteristic = _integral_characteristic_polynomial(
                field,
                candidate,
                characteristic_cache,
                characteristic_metrics,
                "ramification-composition",
            )
            if candidate_characteristic is None:
                raise Round4Unsupported("the testc2 generator is not integral")
            candidate_factor, candidate_multiplicity = _single_characteristic_branch(
                candidate_characteristic,
                prime,
            )
            new_ramification = _integer_lcm(
                ramification_degree,
                error_ramification,
            )
            candidate_residue_degree = _poly_degree(candidate_factor)
            stages.append(
                Round4Stage(
                    "power-basis-ramification-composition",
                    {
                        "old_ramification_degree": ramification_degree,
                        "error_ramification_degree": error_ramification,
                        "new_ramification_degree": new_ramification,
                        "residue_degree": candidate_residue_degree,
                        "multiplicity": candidate_multiplicity,
                        "error_exponent": error_exponent,
                        "error_prime_exponent": error_prime_exponent,
                        "composition_old_power": old_power,
                        "composition_error_power": error_power,
                        "composition_prime_power": prime_power,
                        "iterations": refinements,
                    },
                )
            )
            return (
                candidate,
                candidate_factor,
                new_ramification,
                candidate_residue_degree,
            )
        correction = residue_root_element * prime**quotient
        if remainder:
            correction *= nu_at_phi**remainder
        beta = _p_adic_reduce_element(
            field,
            beta - correction,
            prime,
            precision,
        )
    raise Round4Unsupported("the Round-4 beta refinement exceeded its proved bound")


def round4_primary_power_basis(
    order: Any,
    prime: Any,
    plan: Round4LocalPlan | None = None,
    verify: bool = True,
    characteristic_metrics: dict[str, Any] | None = None,
) -> Round4PowerBasisResult:
    """Find a `p`-maximal locally monogenic order by modified Round 4.

    Construction uses only the exact Ford--Letard power-basis stages.  When
    `verify` is true, Round 2 is run *afterward* as an independent fixed-point
    checker; it does not supply the returned lattice or generator.  A supplied
    `characteristic_metrics` dictionary is updated in place even when the
    search fails closed.  Setting its `characteristic_polynomial_call_limit`
    key provides a deterministic diagnostic bound.
    """
    field = order.number_field()
    maximal_order = _maximal_order_module()
    if field._equation_order_cache is not order:
        raise Round4Unsupported(
            "the primary power-basis search currently starts at an equation order"
        )
    polynomial = maximal_order.integral_equation_polynomial(field)
    if plan is None:
        plan = round4_local_plan(polynomial, prime)
    if len(plan.irreducible_factors) != 1:
        raise Round4Unsupported(
            "the primary power-basis search requires one modular primary component"
        )
    degree = field.degree()
    if characteristic_metrics is None:
        characteristic_metrics = {}
    characteristic_metrics.setdefault("characteristic_polynomial_calls", 0)
    characteristic_metrics.setdefault("characteristic_polynomial_cache_hits", 0)
    characteristic_metrics.setdefault("input_coefficient_bits_total", 0)
    characteristic_metrics.setdefault("max_input_coefficient_bits", 0)
    characteristic_metrics.setdefault("max_denominator_bits", 0)
    characteristic_metrics.setdefault("characteristic_polynomial_inputs", [])
    characteristic_cache: dict[Any, list[Any]] = {}
    phi = field.gen()
    nu = list(plan.irreducible_factors[0])
    ramification_degree = 0
    previous_uniformizer: Any | None = None
    stages: list[Round4Stage] = []
    search_precision = max(
        3,
        min(plan.discriminant_valuation + 2, 2 * degree + 1),
    )
    progress_bound = 2 * plan.discriminant_valuation + 2 * degree + 4
    for iteration in range(progress_bound):
        beta = _evaluate_polynomial_element(nu, phi)
        beta_characteristic = _integral_characteristic_polynomial(
            field,
            beta,
            characteristic_cache,
            characteristic_metrics,
            "progress-beta",
        )
        if beta_characteristic is None:
            raise Round4InvariantError(
                "a Round-4 characteristic prime candidate is not integral"
            )
        numerator, candidate_ramification = _vstar_characteristic(
            beta_characteristic,
            prime,
        )
        if candidate_ramification < ramification_degree:
            # PARI's `getprime` rejects this uninteresting candidate and
            # `progress` translates phi by the last accepted prime element.
            # Replacing E by the smaller value would be mathematically wrong;
            # retaining this explicit state transition is essential on wild
            # primary inputs such as round4 vector 010.
            if previous_uniformizer is None:
                raise Round4InvariantError(
                    "Round-4 has no accepted prime element to reject an E decrease"
                )
            phi = _p_adic_reduce_element(
                field,
                phi + previous_uniformizer,
                prime,
                search_precision,
            )
            characteristic = _integral_characteristic_polynomial(
                field,
                phi,
                characteristic_cache,
                characteristic_metrics,
                "progress-reused-uniformizer",
            )
            if characteristic is None:
                raise Round4InvariantError(
                    "the translated Round-4 generator is not integral"
                )
            nu, multiplicity = _single_characteristic_branch(
                characteristic,
                prime,
            )
            stages.append(
                Round4Stage(
                    "power-basis-reuse-uniformizer",
                    {
                        "iteration": iteration,
                        "retained_ramification_degree": ramification_degree,
                        "rejected_ramification_degree": candidate_ramification,
                        "multiplicity": multiplicity,
                    },
                )
            )
            continue
        uniformizer, beta_exponent, prime_exponent = _round4_uniformizer(
            beta,
            numerator,
            candidate_ramification,
            prime,
        )
        uniformizer = _p_adic_reduce_element(
            field,
            uniformizer,
            prime,
            search_precision,
        )
        if (
            _integral_characteristic_polynomial(
                field,
                uniformizer,
                characteristic_cache,
                characteristic_metrics,
                "progress-uniformizer",
            )
            is None
        ):
            raise Round4Unsupported(
                "the Round-4 prime element did not certify as integral"
            )
        ramification_degree = candidate_ramification
        previous_uniformizer = uniformizer
        stages.append(
            Round4Stage(
                "power-basis-ramification",
                {
                    "iteration": iteration,
                    "minimum_valuation_numerator": numerator,
                    "ramification_degree": ramification_degree,
                    "beta_exponent": beta_exponent,
                    "prime_exponent": prime_exponent,
                },
            )
        )
        if numerator != 1:
            phi = _p_adic_reduce_element(
                field,
                phi + uniformizer,
                prime,
                search_precision,
            )
            characteristic = _integral_characteristic_polynomial(
                field,
                phi,
                characteristic_cache,
                characteristic_metrics,
                "progress-generator-update",
            )
            if characteristic is None:
                raise Round4InvariantError(
                    "the updated Round-4 generator is not integral"
                )
            nu, _multiplicity = _single_characteristic_branch(
                characteristic,
                prime,
            )
            continue

        residue_degree = _poly_degree(nu)
        if ramification_degree * residue_degree < degree:
            phi, nu, ramification_degree, residue_degree = _round4_residue_refinement(
                field,
                phi,
                nu,
                ramification_degree,
                prime,
                plan.discriminant_valuation,
                stages,
                characteristic_cache,
                characteristic_metrics,
            )
        if ramification_degree * residue_degree != degree:
            continue

        power_rows = _power_basis_rows(field, phi)
        for coefficient in phi.list():
            denominator = coefficient._denominator
            denominator_valuation = (
                _valuation(denominator, prime) if denominator != 1 else 0
            )
            if denominator != prime**denominator_valuation:
                raise Round4InvariantError(
                    "the local generator has a denominator away from p"
                )
        power_matrix = _nf_global("matrix")(sage.QQ, power_rows)
        if power_matrix.determinant() == 0:
            raise Round4InvariantError("the Round-4 generator is not primitive")
        containment = order.basis_matrix() * power_matrix.inverse()
        for row in containment.rows():
            for value in row:
                if value._denominator % prime == 0:
                    raise Round4InvariantError(
                        "the power basis does not locally contain the input order"
                    )
        candidate = maximal_order.NumberFieldOrder(
            field,
            list(order._basis_rows) + power_rows,
            False,
            False,
        )
        local_index = _order_index(order, candidate)
        local_index_valuation = (
            _valuation(local_index, prime) if local_index != 1 else 0
        )
        if local_index != prime**local_index_valuation:
            raise Round4InvariantError(
                "a local power-basis join changed the order away from p"
            )
        input_discriminant = plan.polynomial_discriminant
        order._discriminant_cache = runtime.normalize_integer(input_discriminant)
        output_discriminant, discriminant_remainder = divmod(
            input_discriminant,
            local_index * local_index,
        )
        if discriminant_remainder != 0:
            raise Round4InvariantError(
                "the local power-basis index does not divide the discriminant"
            )
        # The discriminant-change formula is exact for a finite-index lattice
        # inclusion.  Retaining it avoids reconstructing an O(n^3)
        # multiplication table merely to recompute the same determinant.
        candidate._discriminant_cache = runtime.normalize_integer(output_discriminant)
        verification_algorithm = "ford-letard-ef-degree-certificate"
        if verify:
            maximal_order._nf_order_multiplication_table(candidate)
            # Materialize the cache before crossing into the native verifier;
            # an unset optional attribute is represented by JavaScript `undefined`.
            candidate.discriminant()
            if prime <= 18446744073709551615:
                checked = maximal_order.maximal_overorder_native(
                    candidate,
                    [runtime.number(prime)],
                )
                verification_algorithm = "native-round2-fixed-point"
            else:
                checked = maximal_order.p_maximal_overorder_dynamic(candidate, prime)
                verification_algorithm = "dynamic-round2-fixed-point"
            if checked._basis_rows != candidate._basis_rows:
                raise Round4InvariantError(
                    "the independently checked Round-4 power basis is not p-maximal"
                )
        stages.append(
            Round4Stage(
                "assemble-power-basis-hnf",
                {
                    "ramification_degree": ramification_degree,
                    "residue_degree": residue_degree,
                    "local_index": local_index,
                    "local_index_valuation": local_index_valuation,
                    "input_discriminant": input_discriminant,
                    "output_discriminant": output_discriminant,
                    "closure_checked": True,
                    "closure_witness": (
                        "nested local orders: power basis at p and input order away from p"
                    ),
                    "p_maximality_verifier": verification_algorithm,
                    "characteristic_polynomial_metrics": dict(characteristic_metrics),
                },
            )
        )
        return Round4PowerBasisResult(
            candidate,
            list(phi.list()),
            ramification_degree,
            residue_degree,
            local_index,
            stages,
            verification_algorithm,
            dict(characteristic_metrics),
        )
    raise Round4Unsupported("the Round-4 power-basis progress loop exceeded its bound")


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
        for degree_value, multiplicity in zip(
            factor_degrees, factor_multiplicities, strict=True
        )
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
        discriminant,
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

    The implemented Round-4 portion performs local factor refinement, the
    complete Dedekind coefficient-ring enlargement, and a bounded
    Ford--Letard power-basis search on a single primary component.  Unsupported
    decomposition or higher-residue-field branches retain the named Round-2
    fallback. Set `strict=True` to reject that fallback.
    """
    maximal_order = _maximal_order_module()
    field = order.number_field()
    polynomial = maximal_order.integral_equation_polynomial(field)
    plan = round4_local_plan(polynomial, prime)
    if field._equation_order_cache is order:
        original_discriminant = plan.polynomial_discriminant
        order._discriminant_cache = runtime.normalize_integer(original_discriminant)
    else:
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
            power_basis: Round4PowerBasisResult | None = None
            power_basis_error: str | None = None
            try:
                power_basis = round4_primary_power_basis(order, prime, plan, False)
            except Round4Unsupported as error:
                power_basis_error = str(error)
            if power_basis is not None:
                final = power_basis.order
                algorithm = "modified-round4-primary-power-basis"
                witness = (
                    "Ford--Letard local power basis; "
                    + power_basis.verification_algorithm
                )
                plan.stages.extend(power_basis.stages)
            else:
                fallback_reason = (
                    "the Ford--Letard primary power-basis search stopped at a "
                    "certified unsupported branch: " + str(power_basis_error)
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
    "Round4PowerBasisResult",
    "Round4SelectorMetrics",
    "Round4Stage",
    "Round4Unsupported",
    "dedekind_integral_basis",
    "hensel_refine_primary_factors",
    "modified_round4_local_order",
    "modified_round4_hnf",
    "modified_round4_hnf_contract",
    "round4_local_plan",
    "round4_primary_power_basis",
    "round4_required_precision",
    "round4_selection_decision",
    "round4_selector_metrics",
    "round4_shared_local_result",
    "verify_round4_local_result",
]
