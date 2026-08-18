"""Fail-closed Buchmann--Lenstra steps over composite moduli.

This module ports the composite-modulus seam used by Hecke's
`dedekind_test_composite` and tame-overorder driver.  Arithmetic in
`ZZ/qZZ[x]` is never called a field operation: every attempted coefficient
inverse either succeeds as a unit or returns a certified factor of `q`.

The first executable slice handles an equation order.  It can discover a
zero-divisor split, construct the composite Dedekind overorder, and certify
that local work is complete when the new discriminant is coprime to `q`.
For a nonidentity order, the same module executes the tame q-radical and
multiplier-ring cycle using canonical integer HNF lattices.  Every modular
elimination uses unit pivots or returns a factor of `q`; no composite modulus
is silently promoted to a field.

The implementation is ordinary CPython source and uses only exact integer
arithmetic.  It was derived from Hecke commit
`eab7e5566e56d8864fe9cd7b895811ab9df2fe32`'s BSD-licensed
`NumFieldOrd/NfOrd/MaxOrd/{MaxOrd,DedekindCriterion}.jl` implementation.
"""

from __future__ import annotations

import math as _math
from typing import Any

try:
    import sagejs.runtime as _runtime
except ImportError:
    _runtime = None

from sagejs.number_fields.maximal_order_contracts import (
    ComponentSplit,
    DiscriminantComponent,
    LocalOrderResult,
    OrderBasis,
)


def _gcd(left: int, right: int) -> int:
    if _runtime is not None:
        return _runtime.bigint_gcd(_runtime.bigint(left), _runtime.bigint(right))
    return _math.gcd(left, right)


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_r, r = left, right
    old_s, s = 1, 0
    old_t, t = 0, 1
    while r:
        quotient = old_r // r
        old_r, r = r, old_r - quotient * r
        old_s, s = s, old_s - quotient * s
        old_t, t = t, old_t - quotient * t
    if old_r < 0:
        return -old_r, -old_s, -old_t
    return old_r, old_s, old_t


def _modular_inverse(value: int, modulus: int) -> int:
    """Return a unit inverse without relying on host three-argument `pow`."""
    common, coefficient, _other = _extended_gcd(value, modulus)
    if common != 1:
        raise ZeroDivisionError("a nonunit has no modular inverse")
    return coefficient % modulus


def _trim_mod(polynomial: list[int], modulus: int) -> list[int]:
    answer = [coefficient % modulus for coefficient in polynomial]
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    return answer if answer else [0]


def _derivative(polynomial: list[int]) -> list[int]:
    if len(polynomial) <= 1:
        return [0]
    return [index * polynomial[index] for index in range(1, len(polynomial))]


def _multiply(left: list[int], right: list[int]) -> list[int]:
    if left == [0] or right == [0]:
        return [0]
    answer = [0 for _index in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            answer[left_index + right_index] += left_value * right_value
    return answer


def _divide_mod(
    dividend: list[int], divisor: list[int], modulus: int
) -> dict[str, Any]:
    """Divide polynomials over `ZZ/qZZ`, splitting on a nonunit pivot."""
    current = _trim_mod(dividend, modulus)
    denominator = _trim_mod(divisor, modulus)
    if denominator == [0]:
        return {"status": "error", "message": "division by zero polynomial"}
    common = _gcd(denominator[-1], modulus)
    if common != 1:
        if common == modulus:
            return {
                "status": "error",
                "message": "a trimmed divisor has zero leading coefficient",
            }
        return {
            "status": "split",
            "divisor": common,
            "coefficient": denominator[-1],
            "operation": "polynomial-division-leading-coefficient",
        }
    inverse = _modular_inverse(denominator[-1], modulus)
    quotient_length = max(1, len(current) - len(denominator) + 1)
    quotient = [0 for _index in range(quotient_length)]
    while len(current) >= len(denominator) and current != [0]:
        shift = len(current) - len(denominator)
        scalar = current[-1] * inverse % modulus
        quotient[shift] = scalar
        for index, value in enumerate(denominator):
            current[index + shift] = (current[index + shift] - scalar * value) % modulus
        current = _trim_mod(current, modulus)
    return {
        "status": "ok",
        "quotient": _trim_mod(quotient, modulus),
        "remainder": current,
    }


def polynomial_gcd_with_split(
    left: list[int], right: list[int], modulus: int
) -> dict[str, Any]:
    """Return a monic gcd or a certified zero-divisor split of `modulus`.

    This is the semantic equivalent of Hecke's `_gcd_with_failure`: a
    composite modulus is not promoted to a prime field.  The returned split
    is exact and can be replayed from the reported nonunit coefficient.
    """
    if isinstance(modulus, bool) or not isinstance(modulus, int) or modulus <= 1:
        raise ValueError("modulus must be an integer greater than one")
    first = _trim_mod(left, modulus)
    second = _trim_mod(right, modulus)
    steps = 0
    while second != [0]:
        division = _divide_mod(first, second, modulus)
        steps += 1
        if division["status"] == "split":
            divisor = int(division["divisor"])
            return {
                "status": "split",
                "split": ComponentSplit(
                    modulus,
                    divisor,
                    modulus // divisor,
                    {
                        "operation": division["operation"],
                        "coefficient": int(division["coefficient"]),
                        "euclidean_step": steps,
                        "gcd": divisor,
                    },
                ),
                "steps": steps,
            }
        if division["status"] != "ok":
            return {
                "status": "resource-error",
                "message": str(division.get("message", "polynomial division failed")),
                "steps": steps,
            }
        first, second = second, division["remainder"]
    leading = first[-1]
    common = _gcd(leading, modulus)
    if common != 1:
        if common == modulus:
            return {
                "status": "resource-error",
                "message": "gcd normalization reached the zero polynomial",
                "steps": steps,
            }
        return {
            "status": "split",
            "split": ComponentSplit(
                modulus,
                common,
                modulus // common,
                {
                    "operation": "polynomial-gcd-normalization",
                    "coefficient": leading,
                    "euclidean_step": steps,
                    "gcd": common,
                },
            ),
            "steps": steps,
        }
    inverse = _modular_inverse(leading, modulus)
    return {
        "status": "gcd",
        "gcd": _trim_mod([coefficient * inverse for coefficient in first], modulus),
        "steps": steps,
    }


def _bareiss_determinant(rows: list[list[int]]) -> int:
    degree = len(rows)
    if degree == 0:
        return 1
    matrix = [list(row) for row in rows]
    sign = 1
    previous = 1
    for pivot_column in range(degree - 1):
        pivot_row = pivot_column
        while pivot_row < degree and matrix[pivot_row][pivot_column] == 0:
            pivot_row += 1
        if pivot_row == degree:
            return 0
        if pivot_row != pivot_column:
            matrix[pivot_column], matrix[pivot_row] = (
                matrix[pivot_row],
                matrix[pivot_column],
            )
            sign = -sign
        pivot = matrix[pivot_column][pivot_column]
        for row in range(pivot_column + 1, degree):
            for column in range(pivot_column + 1, degree):
                numerator = (
                    matrix[row][column] * pivot
                    - matrix[row][pivot_column] * matrix[pivot_column][column]
                )
                if previous != 1:
                    if numerator % previous != 0:
                        raise ArithmeticError("Bareiss exact division failed")
                    numerator //= previous
                matrix[row][column] = numerator
            matrix[row][pivot_column] = 0
        previous = pivot
    return sign * matrix[-1][-1]


def polynomial_discriminant(coefficients: list[int]) -> int:
    """Return the exact discriminant of a monic integer polynomial."""
    polynomial = list(coefficients)
    while len(polynomial) > 1 and polynomial[-1] == 0:
        polynomial.pop()
    degree = len(polynomial) - 1
    if degree <= 0 or polynomial[-1] != 1:
        raise ValueError("the defining polynomial must be monic of positive degree")
    derivative = _derivative(polynomial)
    size = degree + len(derivative) - 1
    sylvester: list[list[int]] = []
    high_polynomial = list(reversed(polynomial))
    high_derivative = list(reversed(derivative))
    for shift in range(len(derivative) - 1):
        sylvester.append(
            [0] * shift + high_polynomial + [0] * (size - shift - len(high_polynomial))
        )
    for shift in range(degree):
        sylvester.append(
            [0] * shift + high_derivative + [0] * (size - shift - len(high_derivative))
        )
    resultant = _bareiss_determinant(sylvester)
    if degree * (degree - 1) // 2 % 2:
        resultant = -resultant
    return resultant


def _row_hnf(rows: list[list[int]]) -> list[list[int]]:
    """Return a deterministic row-HNF basis of a full-rank integer lattice."""
    if not rows:
        return []
    columns = len(rows[0])
    matrix = [list(row) for row in rows]
    for row in matrix:
        if len(row) != columns:
            raise ValueError("lattice rows must have a common length")
    pivot_row = 0
    for column in range(columns):
        candidate = pivot_row
        while candidate < len(matrix) and matrix[candidate][column] == 0:
            candidate += 1
        if candidate == len(matrix):
            continue
        matrix[pivot_row], matrix[candidate] = (
            matrix[candidate],
            matrix[pivot_row],
        )
        for row_index in range(pivot_row + 1, len(matrix)):
            if matrix[row_index][column] == 0:
                continue
            upper = list(matrix[pivot_row])
            lower = list(matrix[row_index])
            common, left_coefficient, right_coefficient = _extended_gcd(
                upper[column], lower[column]
            )
            upper_scale = upper[column] // common
            lower_scale = lower[column] // common
            matrix[pivot_row] = [
                left_coefficient * upper[index] + right_coefficient * lower[index]
                for index in range(columns)
            ]
            matrix[row_index] = [
                -lower_scale * upper[index] + upper_scale * lower[index]
                for index in range(columns)
            ]
        if matrix[pivot_row][column] < 0:
            matrix[pivot_row] = [-value for value in matrix[pivot_row]]
        pivot = matrix[pivot_row][column]
        for row_index in range(pivot_row):
            quotient = matrix[row_index][column] // pivot
            matrix[row_index] = [
                matrix[row_index][index] - quotient * matrix[pivot_row][index]
                for index in range(columns)
            ]
        pivot_row += 1
        if pivot_row == len(matrix):
            break
    answer = [row for row in matrix if any(value != 0 for value in row)]
    if len(answer) < columns:
        raise ArithmeticError("lattice generators do not have full rank")
    return answer[:columns]


def _reduce_power_polynomial(
    polynomial: list[int], defining_polynomial: list[int]
) -> list[int]:
    degree = len(defining_polynomial) - 1
    current = list(polynomial)
    while len(current) < degree:
        current.append(0)
    for exponent in range(len(current) - 1, degree - 1, -1):
        leading = current[exponent]
        if leading:
            for index in range(degree):
                current[exponent - degree + index] -= (
                    leading * defining_polynomial[index]
                )
    return current[:degree]


def _multiplication_rows(
    element: list[int], defining_polynomial: list[int]
) -> list[list[int]]:
    degree = len(defining_polynomial) - 1
    return [
        _reduce_power_polynomial([0] * exponent + element, defining_polynomial)
        for exponent in range(degree)
    ]


def _composite_dedekind_data(coefficients: list[int], modulus: int) -> dict[str, Any]:
    reduced = _trim_mod(coefficients, modulus)
    first = polynomial_gcd_with_split(reduced, _derivative(reduced), modulus)
    if first["status"] != "gcd":
        return first
    repeated = first["gcd"]
    squarefree_division = _divide_mod(reduced, repeated, modulus)
    if squarefree_division["status"] != "ok":
        if squarefree_division["status"] == "split":
            divisor = int(squarefree_division["divisor"])
            return {
                "status": "split",
                "split": ComponentSplit(
                    modulus,
                    divisor,
                    modulus // divisor,
                    {
                        "operation": squarefree_division["operation"],
                        "coefficient": int(squarefree_division["coefficient"]),
                    },
                ),
            }
        return squarefree_division
    squarefree = squarefree_division["quotient"]
    lifted_product = _multiply(squarefree, repeated)
    correction_length = max(len(coefficients), len(lifted_product))
    correction: list[int] = []
    for index in range(correction_length):
        value = (coefficients[index] if index < len(coefficients) else 0) - (
            lifted_product[index] if index < len(lifted_product) else 0
        )
        if value % modulus != 0:
            return {
                "status": "certification-error",
                "message": "Dedekind correction is not integrally divisible",
            }
        correction.append(value // modulus)
    mutual = polynomial_gcd_with_split(repeated, squarefree, modulus)
    if mutual["status"] != "gcd":
        return mutual
    obstruction_result = polynomial_gcd_with_split(mutual["gcd"], correction, modulus)
    if obstruction_result["status"] != "gcd":
        return obstruction_result
    obstruction = obstruction_result["gcd"]
    if obstruction == [1]:
        return {
            "status": "complete",
            "reason": "composite-dedekind-obstruction-is-one",
            "repeated_gcd": repeated,
            "squarefree_quotient": squarefree,
            "correction": correction,
        }
    generator_division = _divide_mod(reduced, obstruction, modulus)
    if generator_division["status"] != "ok":
        if generator_division["status"] == "split":
            divisor = int(generator_division["divisor"])
            return {
                "status": "split",
                "split": ComponentSplit(
                    modulus,
                    divisor,
                    modulus // divisor,
                    {
                        "operation": generator_division["operation"],
                        "coefficient": int(generator_division["coefficient"]),
                    },
                ),
            }
        return generator_division
    if generator_division["remainder"] != [0]:
        return {
            "status": "certification-error",
            "message": "Dedekind obstruction does not divide the polynomial",
        }
    return {
        "status": "enlarge",
        "repeated_gcd": repeated,
        "squarefree_quotient": squarefree,
        "correction": correction,
        "obstruction": obstruction,
        "generator": generator_division["quotient"],
    }


def _dedekind_overorder_basis(
    coefficients: list[int], modulus: int, generator: list[int]
) -> tuple[OrderBasis, int]:
    degree = len(coefficients) - 1
    multiplication = _multiplication_rows(generator, coefficients)
    generators = []
    for index in range(degree):
        row = [0 for _column in range(degree)]
        row[index] = modulus
        generators.append(row)
    generators.extend(multiplication)
    numerator = _row_hnf(generators)
    basis = OrderBasis(numerator, modulus, canonical=True)
    determinant = abs(basis.determinant_numerator)
    denominator_power = basis.denominator**degree
    if denominator_power % determinant != 0:
        raise ArithmeticError("overorder determinant does not give an integral index")
    index = denominator_power // determinant
    if index <= 1:
        raise ArithmeticError("composite Dedekind step did not enlarge the order")
    return basis, index


class BuchmannLenstraResult:
    """One fail-closed composite local step.

    States are `complete`, `enlarged`, `split`, `stalled`, `resource-error`,
    and `certification-error`.  Only `complete` asserts local maximality.
    """

    def __init__(
        self,
        state: str,
        component: DiscriminantComponent,
        *,
        basis: OrderBasis | None = None,
        index: int = 1,
        discriminant: int | None = None,
        split: ComponentSplit | None = None,
        evidence: dict[str, Any] | None = None,
        message: str | None = None,
    ) -> None:
        if state not in (
            "complete",
            "enlarged",
            "split",
            "stalled",
            "resource-error",
            "certification-error",
        ):
            raise ValueError("unknown Buchmann--Lenstra result state")
        if state == "split" and split is None:
            raise ValueError("a split result requires ComponentSplit evidence")
        if state in ("complete", "enlarged") and basis is None:
            raise ValueError("an order result requires a basis")
        self.state = state
        self.component = component
        self.basis = basis
        self.index = index
        self.discriminant = discriminant
        self.split = split
        self.evidence = {} if evidence is None else evidence
        self.message = message

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/buchmann-lenstra-result-v1",
            "state": self.state,
            "component": self.component.to_dict(),
            "basis": None if self.basis is None else self.basis.to_dict(),
            "index": self.index,
            "discriminant": self.discriminant,
            "split": None if self.split is None else self.split.to_dict(),
            "evidence": self.evidence,
            "message": self.message,
        }

    def to_local_result(self) -> LocalOrderResult:
        """Adapt this step to the common local-result contract.

        `enlarged` is deliberately `not-applicable`: it is useful progress,
        but it is not a local-maximality assertion.
        """
        algorithm = (
            "buchmann-lenstra"
            if self.evidence.get("stage") == "q-radical-multiplier-cycle"
            else "dedekind"
        )
        if self.state == "split":
            return LocalOrderResult(
                "split",
                algorithm,
                self.component,
                split=self.split,
                evidence=self.evidence,
                message=self.message,
            )
        if self.state == "complete":
            return LocalOrderResult(
                "complete",
                algorithm,
                self.component,
                basis=self.basis,
                index=self.index,
                discriminant=self.discriminant,
                evidence=self.evidence,
                message=self.message,
            )
        if self.state == "certification-error":
            common_state = "certification-error"
        elif self.state == "resource-error":
            common_state = "resource-error"
        else:
            common_state = "not-applicable"
        return LocalOrderResult(
            common_state,
            algorithm,
            self.component,
            basis=self.basis,
            index=self.index,
            discriminant=self.discriminant,
            evidence=self.evidence,
            message=self.message,
        )


def buchmann_lenstra_overorder(
    polynomial_coefficients: list[int],
    component: DiscriminantComponent,
    *,
    basis: OrderBasis | None = None,
    equation_discriminant: int | None = None,
) -> BuchmannLenstraResult:
    """Run the equation-order composite Dedekind/BL local slice.

    Coefficients are low-to-high and the polynomial must be monic.  A
    nonidentity `basis` enters the exact q-radical/multiplier-ring cycle.
    """
    coefficients = [int(value) for value in polynomial_coefficients]
    if len(coefficients) < 2 or coefficients[-1] != 1:
        raise ValueError("the defining polynomial must be monic")
    modulus = component.value
    degree = len(coefficients) - 1
    identity_basis = OrderBasis(
        [
            [1 if row == column else 0 for column in range(degree)]
            for row in range(degree)
        ],
        1,
    )
    if basis is not None and basis.canonical_key() != identity_basis.canonical_key():
        return buchmann_lenstra_multiplier_cycle(
            coefficients,
            component,
            basis,
            equation_discriminant=equation_discriminant,
        )
    if component.state not in ("composite", "unresolved-coprime-component"):
        return BuchmannLenstraResult(
            "certification-error",
            component,
            message="Buchmann--Lenstra composite path requires a composite component",
            evidence={"refused_state": component.state},
        )
    data = _composite_dedekind_data(coefficients, modulus)
    if data["status"] == "split":
        return BuchmannLenstraResult(
            "split",
            component,
            split=data["split"],
            evidence={"stage": "composite-dedekind", "zero_divisor": True},
        )
    equation_disc = (
        polynomial_discriminant(coefficients)
        if equation_discriminant is None
        else int(equation_discriminant)
    )
    if data["status"] == "complete":
        return BuchmannLenstraResult(
            "complete",
            component,
            basis=identity_basis,
            index=1,
            discriminant=equation_disc,
            evidence={
                "stage": "composite-dedekind",
                "source": "Hecke dedekind_test_composite",
                "repeated_gcd": data["repeated_gcd"],
                "squarefree_quotient": data["squarefree_quotient"],
                "correction": data["correction"],
                "obstruction": [1],
                "locally_maximal": True,
                "certificate": "composite-dedekind-obstruction-one",
            },
        )
    if data["status"] != "enlarge":
        return BuchmannLenstraResult(
            "certification-error"
            if data["status"] == "certification-error"
            else "stalled",
            component,
            message=str(data.get("message", data.get("reason", "BL cycle stalled"))),
            evidence={
                "stage": "composite-dedekind",
                "status": data["status"],
                "next_stage": "q-radical-multiplier-cycle",
            },
        )
    overorder_basis, index = _dedekind_overorder_basis(
        coefficients, modulus, data["generator"]
    )
    if equation_disc % (index * index) != 0:
        return BuchmannLenstraResult(
            "certification-error",
            component,
            basis=overorder_basis,
            index=index,
            message="candidate index square does not divide the equation discriminant",
            evidence={"stage": "discriminant-update"},
        )
    discriminant = equation_disc // (index * index)
    locally_complete = _gcd(abs(discriminant), modulus) == 1
    evidence = {
        "stage": "composite-dedekind",
        "source": "Hecke dedekind_test_composite",
        "repeated_gcd": data["repeated_gcd"],
        "squarefree_quotient": data["squarefree_quotient"],
        "correction": data["correction"],
        "obstruction": data["obstruction"],
        "overorder_generator": data["generator"],
        "index_identity": equation_disc == discriminant * index * index,
        "remaining_component_gcd": _gcd(abs(discriminant), modulus),
        "locally_maximal": locally_complete,
        "certificate": "component-coprime-to-order-discriminant"
        if locally_complete
        else "certified-enlargement-only",
    }
    return BuchmannLenstraResult(
        "complete" if locally_complete else "enlarged",
        component,
        basis=overorder_basis,
        index=index,
        discriminant=discriminant,
        evidence=evidence,
        message=None if locally_complete else "continue q-radical/multiplier cycle",
    )


def _check_composite_dedekind_overorder_certificate(
    coefficients: list[int],
    result: BuchmannLenstraResult,
    equation_discriminant: int,
) -> bool:
    """Replay a completed equation-order composite Dedekind certificate.

    The theorem proves closure for the canonical HNF of the independently
    replayed generator lattice. Other evidence shapes use the generic checker.
    """
    if result.state != "complete" or result.basis is None:
        return False
    if result.component.state not in (
        "composite",
        "unresolved-coprime-component",
    ):
        return False
    evidence = result.evidence
    if (
        evidence.get("stage") != "composite-dedekind"
        or evidence.get("source") != "Hecke dedekind_test_composite"
        or evidence.get("certificate") != "component-coprime-to-order-discriminant"
        or evidence.get("locally_maximal") is not True
        or evidence.get("index_identity") is not True
    ):
        return False

    modulus = result.component.value
    replay = _composite_dedekind_data(coefficients, modulus)
    if replay.get("status") != "enlarge":
        return False
    for key in (
        "repeated_gcd",
        "squarefree_quotient",
        "correction",
        "obstruction",
        "generator",
    ):
        evidence_key = "overorder_generator" if key == "generator" else key
        if evidence.get(evidence_key) != replay.get(key):
            return False

    degree = len(coefficients) - 1
    generators: list[list[int]] = []
    for index in range(degree):
        row = [0 for _column in range(degree)]
        row[index] = modulus
        generators.append(row)
    generators.extend(_multiplication_rows(replay["generator"], coefficients))
    expected_basis = OrderBasis(_row_hnf(generators), modulus, canonical=True)
    if result.basis.canonical_key() != expected_basis.canonical_key():
        return False

    determinant = abs(expected_basis.determinant_numerator)
    denominator_power = expected_basis.denominator**degree
    if determinant == 0 or denominator_power % determinant != 0:
        return False
    expected_index = denominator_power // determinant
    if expected_index != result.index:
        return False
    index_square = expected_index * expected_index
    if equation_discriminant % index_square != 0:
        return False
    expected_discriminant = equation_discriminant // index_square
    if result.discriminant != expected_discriminant:
        return False
    remaining = _gcd(abs(expected_discriminant), modulus)
    return remaining == 1 and evidence.get("remaining_component_gcd") == remaining


def check_buchmann_lenstra_result(
    polynomial_coefficients: list[int], result: BuchmannLenstraResult
) -> bool:
    """Independently check a split, enlargement, or completed local result."""
    coefficients = [int(value) for value in polynomial_coefficients]
    if result.evidence.get("stage") == "q-radical-multiplier-cycle":
        events = result.evidence.get("events", [])
        if not events or "basis" not in events[0]:
            return False
        try:
            starting_basis = OrderBasis.from_dict(events[0]["basis"])
        except (KeyError, TypeError, ValueError):
            return False
        return check_buchmann_lenstra_general_result(
            coefficients,
            starting_basis,
            result,
            equation_discriminant=polynomial_discriminant(coefficients),
        )
    if result.state == "split":
        if result.split is None:
            return False
        split = result.split
        if split.source != result.component.value:
            return False
        if split.left * split.right != split.source:
            return False
        coefficient = split.evidence.get("coefficient")
        if not isinstance(coefficient, int):
            return False
        return _gcd(coefficient, split.source) in (split.left, split.right)
    if result.state not in ("complete", "enlarged") or result.basis is None:
        return result.state in ("stalled", "resource-error", "certification-error")
    basis = result.basis
    degree = len(coefficients) - 1
    if basis.degree != degree or result.discriminant is None:
        return False
    determinant = abs(basis.determinant_numerator)
    denominator_power = basis.denominator**degree
    if determinant == 0 or denominator_power % determinant != 0:
        return False
    if denominator_power // determinant != result.index:
        return False
    equation_disc = polynomial_discriminant(coefficients)
    if equation_disc != result.discriminant * result.index * result.index:
        return False
    if result.evidence.get("certificate") == "component-coprime-to-order-discriminant":
        return _check_composite_dedekind_overorder_certificate(
            coefficients,
            result,
            equation_disc,
        )
    if not _basis_defines_order(coefficients, basis):
        return False
    remaining = _gcd(abs(result.discriminant), result.component.value)
    if result.state == "complete":
        if result.evidence.get("certificate") == "composite-dedekind-obstruction-one":
            replay = _composite_dedekind_data(coefficients, result.component.value)
            return (
                result.index == 1
                and replay.get("status") == "complete"
                and replay.get("reason") == "composite-dedekind-obstruction-is-one"
                and result.evidence.get("locally_maximal") is True
            )
        return remaining == 1 and result.evidence.get("locally_maximal") is True
    return remaining != 1 and result.evidence.get("locally_maximal") is False


def _fraction_add(left: tuple[int, int], right: tuple[int, int]) -> tuple[int, int]:
    if left[0] == 0:
        return right
    if right[0] == 0:
        return left
    if left[1] == right[1]:
        return _fraction_normalize(left[0] + right[0], left[1])
    denominator_common = _gcd(left[1], right[1])
    left_scale = right[1] // denominator_common
    right_scale = left[1] // denominator_common
    numerator = left[0] * left_scale + right[0] * right_scale
    numerator_common = _gcd(numerator, denominator_common)
    return (
        numerator // numerator_common,
        right_scale * (right[1] // numerator_common),
    )


def _fraction_multiply(
    left: tuple[int, int], right: tuple[int, int]
) -> tuple[int, int]:
    if left[0] == 0 or right[0] == 0:
        return 0, 1
    if left[1] == 1 and right[1] == 1:
        return left[0] * right[0], 1
    left_common = _gcd(left[0], right[1])
    right_common = _gcd(right[0], left[1])
    return (
        (left[0] // left_common) * (right[0] // right_common),
        (left[1] // right_common) * (right[1] // left_common),
    )


def _fraction_negative(value: tuple[int, int]) -> tuple[int, int]:
    return -value[0], value[1]


def _fraction_normalize(numerator: int, denominator: int) -> tuple[int, int]:
    common = _gcd(numerator, denominator)
    normalized_numerator = numerator // common
    normalized_denominator = denominator // common
    if normalized_denominator < 0:
        return -normalized_numerator, -normalized_denominator
    return normalized_numerator, normalized_denominator


def _inverse_fraction_matrix(
    numerator: list[list[int]], denominator: int
) -> list[list[tuple[int, int]]]:
    degree = len(numerator)
    rows: list[list[tuple[int, int]]] = []
    for row_index, row in enumerate(numerator):
        rows.append(
            [_fraction_normalize(value, denominator) for value in row]
            + [(1, 1) if row_index == column else (0, 1) for column in range(degree)]
        )
    for column in range(degree):
        pivot_row = column
        while pivot_row < degree and rows[pivot_row][column][0] == 0:
            pivot_row += 1
        if pivot_row == degree:
            raise ArithmeticError("singular order basis")
        rows[column], rows[pivot_row] = rows[pivot_row], rows[column]
        pivot = rows[column][column]
        inverse_pivot = (pivot[1], pivot[0])
        if inverse_pivot[1] < 0:
            inverse_pivot = (-inverse_pivot[0], -inverse_pivot[1])
        rows[column] = [
            _fraction_multiply(value, inverse_pivot) for value in rows[column]
        ]
        for row_index in range(degree):
            if row_index == column:
                continue
            scalar = rows[row_index][column]
            if scalar[0] == 0:
                continue
            rows[row_index] = [
                _fraction_add(
                    rows[row_index][entry],
                    _fraction_negative(_fraction_multiply(scalar, rows[column][entry])),
                )
                for entry in range(2 * degree)
            ]
    return [row[degree:] for row in rows]


def _rational_product(
    left: list[tuple[int, int]],
    right: list[tuple[int, int]],
    coefficients: list[int],
) -> list[tuple[int, int]]:
    degree = len(coefficients) - 1
    product = [(0, 1) for _index in range(2 * degree - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            product[left_index + right_index] = _fraction_add(
                product[left_index + right_index],
                _fraction_multiply(left_value, right_value),
            )
    for exponent in range(len(product) - 1, degree - 1, -1):
        leading = product[exponent]
        if leading[0] == 0:
            continue
        for index in range(degree):
            product[exponent - degree + index] = _fraction_add(
                product[exponent - degree + index],
                _fraction_multiply(leading, (-coefficients[index], 1)),
            )
    return product[:degree]


def _coordinates_are_integral(
    value: list[tuple[int, int]], inverse: list[list[tuple[int, int]]]
) -> bool:
    degree = len(value)
    for column in range(degree):
        coordinate = (0, 1)
        for row in range(degree):
            coordinate = _fraction_add(
                coordinate, _fraction_multiply(value[row], inverse[row][column])
            )
        if coordinate[1] != 1:
            return False
    return True


def _basis_defines_order(coefficients: list[int], basis: OrderBasis) -> bool:
    degree = len(coefficients) - 1
    inverse = _inverse_fraction_matrix(basis.numerator, basis.denominator)
    rows = [
        [_fraction_normalize(value, basis.denominator) for value in row]
        for row in basis.numerator
    ]
    one = [(1, 1)] + [(0, 1) for _index in range(degree - 1)]
    if not _coordinates_are_integral(one, inverse):
        return False
    for exponent in range(degree):
        power = [(1, 1) if exponent == index else (0, 1) for index in range(degree)]
        if not _coordinates_are_integral(power, inverse):
            return False
    for left in rows:
        for right in rows:
            if not _coordinates_are_integral(
                _rational_product(left, right, coefficients), inverse
            ):
                return False
    return True


def _fraction_vector_times_matrix(
    vector: list[tuple[int, int]], matrix: list[list[tuple[int, int]]]
) -> list[tuple[int, int]]:
    columns = len(matrix[0]) if matrix else 0
    answer: list[tuple[int, int]] = []
    for column in range(columns):
        value = (0, 1)
        for row in range(len(vector)):
            value = _fraction_add(
                value, _fraction_multiply(vector[row], matrix[row][column])
            )
        answer.append(value)
    return answer


def _order_multiplication_table(
    coefficients: list[int], basis: OrderBasis
) -> list[list[list[int]]]:
    """Return the exact integral multiplication table in `basis`."""
    inverse = _inverse_fraction_matrix(basis.numerator, basis.denominator)
    rows = [
        [_fraction_normalize(entry, basis.denominator) for entry in row]
        for row in basis.numerator
    ]
    table: list[list[list[int]]] = []
    for left in rows:
        products: list[list[int]] = []
        for right in rows:
            coordinates = _fraction_vector_times_matrix(
                _rational_product(left, right, coefficients), inverse
            )
            if any(value[1] != 1 for value in coordinates):
                raise ArithmeticError("the supplied basis is not closed")
            products.append([value[0] for value in coordinates])
        table.append(products)
    return table


def _order_index(basis: OrderBasis) -> int:
    determinant = abs(basis.determinant_numerator)
    denominator_power = basis.denominator**basis.degree
    if determinant == 0 or denominator_power % determinant != 0:
        raise ArithmeticError("an order basis has a nonintegral equation-order index")
    return denominator_power // determinant


def _order_discriminant(equation_discriminant: int, basis: OrderBasis) -> int:
    index = _order_index(basis)
    square = index * index
    if equation_discriminant % square != 0:
        raise ArithmeticError("an order index square does not divide the discriminant")
    return equation_discriminant // square


def _trace_matrix_from_table(table: list[list[list[int]]]) -> list[list[int]]:
    degree = len(table)
    trace_vector = [
        sum(table[basis_index][column][column] for column in range(degree))
        for basis_index in range(degree)
    ]
    return [
        [
            sum(
                table[left][right][coordinate] * trace_vector[coordinate]
                for coordinate in range(degree)
            )
            for right in range(degree)
        ]
        for left in range(degree)
    ]


def _modular_kernel_with_split(rows: list[list[int]], modulus: int) -> dict[str, Any]:
    """Compute a free right kernel, or expose a nonunit pivot divisor."""
    if not rows:
        return {"state": "kernel", "rows": []}
    columns = len(rows[0])
    matrix = [[entry % modulus for entry in row] for row in rows]
    for row in matrix:
        if len(row) != columns:
            raise ValueError("modular matrix rows must have a common length")
    pivot_columns: list[int] = []
    pivot_row = 0
    for column in range(columns):
        unit_row = -1
        split_row = -1
        split_divisor = 1
        for row in range(pivot_row, len(matrix)):
            entry = matrix[row][column]
            if entry == 0:
                continue
            divisor = _gcd(entry, modulus)
            if divisor == 1:
                unit_row = row
                break
            if divisor != modulus:
                split_row = row
                split_divisor = divisor
        if unit_row < 0:
            if split_row >= 0:
                return {
                    "state": "split",
                    "divisor": split_divisor,
                    "evidence": {
                        "operation": "composite-modular-elimination",
                        "coefficient": matrix[split_row][column],
                        "row": split_row,
                        "column": column,
                    },
                }
            continue
        matrix[pivot_row], matrix[unit_row] = (
            matrix[unit_row],
            matrix[pivot_row],
        )
        inverse = _modular_inverse(matrix[pivot_row][column], modulus)
        matrix[pivot_row] = [value * inverse % modulus for value in matrix[pivot_row]]
        for row in range(len(matrix)):
            if row == pivot_row:
                continue
            scalar = matrix[row][column]
            if scalar:
                matrix[row] = [
                    (matrix[row][entry] - scalar * matrix[pivot_row][entry]) % modulus
                    for entry in range(columns)
                ]
        pivot_columns.append(column)
        pivot_row += 1
        if pivot_row == len(matrix):
            break
    free_columns = [column for column in range(columns) if column not in pivot_columns]
    kernel: list[list[int]] = []
    for free in free_columns:
        vector = [0 for _column in range(columns)]
        vector[free] = 1
        for row, pivot in enumerate(pivot_columns):
            vector[pivot] = -matrix[row][free] % modulus
        kernel.append(vector)
    return {
        "state": "kernel",
        "rows": kernel,
        "rank": len(pivot_columns),
        "free_rank": len(kernel),
    }


def _split_from_divisor(
    component: DiscriminantComponent,
    divisor: int,
    evidence: dict[str, Any],
) -> ComponentSplit:
    factor = _gcd(component.value, divisor)
    if factor in (1, component.value):
        raise ArithmeticError("a modular obstruction did not split its component")
    return ComponentSplit(
        component.value,
        factor,
        component.value // factor,
        evidence,
    )


class _CompositeIdeal:
    def __init__(self, rows: list[list[int]]) -> None:
        self.rows = _row_hnf(rows)


def _q_radical_by_trace(table: list[list[list[int]]], modulus: int) -> dict[str, Any]:
    degree = len(table)
    small_factor = 1
    for value in range(2, degree + 1):
        small_factor = _gcd(modulus, small_factor * value)
    if small_factor not in (1, modulus):
        return {
            "state": "split",
            "divisor": small_factor,
            "evidence": {
                "operation": "tame-degree-factor",
                "coefficient": small_factor,
            },
        }
    if small_factor == modulus:
        return {
            "state": "resource-error",
            "message": "trace radical requires a component tame at the order degree",
        }
    trace_matrix = _trace_matrix_from_table(table)
    kernel = _modular_kernel_with_split(trace_matrix, modulus)
    if kernel["state"] != "kernel":
        return kernel
    generators: list[list[int]] = []
    for index in range(degree):
        row = [0 for _column in range(degree)]
        row[index] = modulus
        generators.append(row)
    generators.extend(kernel["rows"])
    ideal = _CompositeIdeal(generators)
    trivial = ideal.rows == generators[:degree]
    return {
        "state": "ideal",
        "ideal": ideal,
        "trivial": trivial,
        "kernel_rank": len(kernel["rows"]),
        "trace_matrix": trace_matrix,
    }


def _integer_coordinates_in_rows(
    vector: list[int],
    rows: list[list[int]],
    inverse: list[list[tuple[int, int]]] | None = None,
) -> list[int]:
    if inverse is None:
        inverse = _inverse_fraction_matrix(rows, 1)
    coordinates = _fraction_vector_times_matrix(
        [(entry, 1) for entry in vector], inverse
    )
    if any(value[1] != 1 for value in coordinates):
        raise ArithmeticError("ideal containment has nonintegral coordinates")
    return [value[0] for value in coordinates]


def _coordinate_product(
    left: list[int], right: list[int], table: list[list[list[int]]]
) -> list[int]:
    degree = len(table)
    answer = [0 for _coordinate in range(degree)]
    for left_index, left_value in enumerate(left):
        if left_value == 0:
            continue
        for right_index, right_value in enumerate(right):
            if right_value == 0:
                continue
            scalar = left_value * right_value
            for coordinate in range(degree):
                answer[coordinate] += (
                    scalar * table[left_index][right_index][coordinate]
                )
    return answer


def _coordinate_power_mod(
    base: list[int],
    exponent: int,
    identity: list[int],
    table: list[list[list[int]]],
    modulus: int,
) -> list[int]:
    answer = [value % modulus for value in identity]
    power = [value % modulus for value in base]
    remaining = exponent
    while remaining:
        if remaining & 1:
            answer = [
                value % modulus for value in _coordinate_product(answer, power, table)
            ]
        remaining //= 2
        if remaining:
            power = [
                value % modulus for value in _coordinate_product(power, power, table)
            ]
    return answer


def _p_radical(
    basis: OrderBasis,
    table: list[list[list[int]]],
    prime: int,
) -> dict[str, Any]:
    """Return the exact `p`-radical, including the wild small-prime case."""
    degree = len(table)
    if prime > degree:
        result = _q_radical_by_trace(table, prime)
        result["method"] = "trace"
        return result
    inverse = _inverse_fraction_matrix(basis.numerator, basis.denominator)
    identity_fractions = _fraction_vector_times_matrix(
        [(1, 1)] + [(0, 1) for _index in range(degree - 1)], inverse
    )
    if any(value[1] != 1 for value in identity_fractions):
        return {
            "state": "certification-error",
            "message": "the supplied basis does not contain one",
        }
    identity = [value[0] for value in identity_fractions]
    exponent = prime
    while exponent < degree:
        exponent *= prime
    columns = []
    for basis_index in range(degree):
        vector = [0 for _coordinate in range(degree)]
        vector[basis_index] = 1
        columns.append(_coordinate_power_mod(vector, exponent, identity, table, prime))
    frobenius_power = [
        [columns[column][row] for column in range(degree)] for row in range(degree)
    ]
    kernel = _modular_kernel_with_split(frobenius_power, prime)
    if kernel["state"] != "kernel":
        return kernel
    generators: list[list[int]] = []
    for index in range(degree):
        row = [0 for _column in range(degree)]
        row[index] = prime
        generators.append(row)
    generators.extend(kernel["rows"])
    ideal = _CompositeIdeal(generators)
    return {
        "state": "ideal",
        "ideal": ideal,
        "trivial": ideal.rows == generators[:degree],
        "kernel_rank": len(kernel["rows"]),
        "method": "frobenius",
        "frobenius_exponent": exponent,
        "frobenius_matrix": frobenius_power,
    }


def _enlarge_order_basis(
    basis: OrderBasis, kernel_rows: list[list[int]], modulus: int
) -> OrderBasis:
    degree = basis.degree
    generators = [[modulus * entry for entry in row] for row in basis.numerator]
    for kernel in kernel_rows:
        generators.append(
            [
                sum(
                    kernel[basis_index] * basis.numerator[basis_index][coordinate]
                    for basis_index in range(degree)
                )
                for coordinate in range(degree)
            ]
        )
    return OrderBasis(_row_hnf(generators), basis.denominator * modulus, canonical=True)


def _multiplier_ring_step(
    basis: OrderBasis,
    ideal: _CompositeIdeal,
    table: list[list[list[int]]],
    modulus: int,
) -> dict[str, Any]:
    degree = basis.degree
    equations: list[list[int]] = []
    ideal_inverse = _inverse_fraction_matrix(ideal.rows, 1)
    for ideal_row in ideal.rows:
        relative_products: list[list[int]] = []
        for order_index in range(degree):
            basis_vector = [0 for _coordinate in range(degree)]
            basis_vector[order_index] = 1
            relative_products.append(
                _integer_coordinates_in_rows(
                    _coordinate_product(basis_vector, ideal_row, table),
                    ideal.rows,
                    ideal_inverse,
                )
            )
        for coordinate in range(degree):
            equations.append(
                [
                    relative_products[order_index][coordinate]
                    for order_index in range(degree)
                ]
            )
    kernel = _modular_kernel_with_split(equations, modulus)
    if kernel["state"] != "kernel":
        return kernel
    if not kernel["rows"]:
        return {"state": "same", "kernel_rank": 0}
    enlarged = _enlarge_order_basis(basis, kernel["rows"], modulus)
    if enlarged.canonical_key() == basis.canonical_key():
        return {"state": "same", "kernel_rank": len(kernel["rows"])}
    return {
        "state": "enlarged",
        "basis": enlarged,
        "kernel_rows": kernel["rows"],
        "kernel_rank": len(kernel["rows"]),
    }


def _ideal_multiply(
    left: _CompositeIdeal,
    right: _CompositeIdeal,
    table: list[list[list[int]]],
) -> _CompositeIdeal:
    return _CompositeIdeal(
        [
            _coordinate_product(left_row, right_row, table)
            for left_row in left.rows
            for right_row in right.rows
        ]
    )


def _ideal_add_integer(ideal: _CompositeIdeal, value: int) -> _CompositeIdeal:
    degree = len(ideal.rows)
    generators = [list(row) for row in ideal.rows]
    for index in range(degree):
        row = [0 for _column in range(degree)]
        row[index] = value
        generators.append(row)
    return _CompositeIdeal(generators)


def _colon_freeness(
    ideal: _CompositeIdeal,
    table: list[list[list[int]]],
    modulus: int,
) -> dict[str, Any]:
    degree = len(table)
    equations: list[list[int]] = []
    for ideal_row in ideal.rows:
        products = []
        for order_index in range(degree):
            unit = [0 for _coordinate in range(degree)]
            unit[order_index] = 1
            products.append(_coordinate_product(unit, ideal_row, table))
        for coordinate in range(degree):
            equations.append([products[index][coordinate] for index in range(degree)])
    kernel = _modular_kernel_with_split(equations, modulus)
    if kernel["state"] != "kernel":
        return kernel
    return {
        "state": "free",
        "quotient_rank": len(kernel["rows"]),
        "kernel_rows": kernel["rows"],
    }


def _minor_indices(size: int, count: int) -> list[list[int]]:
    answer: list[list[int]] = []

    def visit(start: int, selected: list[int]) -> None:
        if len(selected) == count:
            answer.append(list(selected))
            return
        remaining = count - len(selected)
        for value in range(start, size - remaining + 1):
            selected.append(value)
            visit(value + 1, selected)
            selected.pop()

    visit(0, [])
    return answer


def _smith_diagonal_by_minors(
    matrix: list[list[int]], max_minors: int
) -> dict[str, Any]:
    degree = len(matrix)
    previous = 1
    diagonal: list[int] = []
    visited = 0
    for size in range(1, degree + 1):
        row_sets = _minor_indices(degree, size)
        column_sets = _minor_indices(degree, size)
        divisor = 0
        for row_set in row_sets:
            for column_set in column_sets:
                visited += 1
                if visited > max_minors:
                    return {
                        "state": "resource-error",
                        "message": "Smith-minor bound exhausted",
                        "minors": visited,
                    }
                minor = [
                    [matrix[row][column] for column in column_set] for row in row_set
                ]
                divisor = _gcd(divisor, _bareiss_determinant(minor))
        if divisor == 0 or divisor % previous != 0:
            return {
                "state": "certification-error",
                "message": "relation matrix has invalid determinantal divisors",
                "minors": visited,
            }
        diagonal.append(divisor // previous)
        previous = divisor
    return {"state": "ok", "diagonal": diagonal, "minors": visited}


def _relation_freeness(
    containing: _CompositeIdeal,
    contained: _CompositeIdeal,
    modulus: int,
    max_minors: int,
) -> dict[str, Any]:
    containing_inverse = _inverse_fraction_matrix(containing.rows, 1)
    coordinates = [
        _integer_coordinates_in_rows(row, containing.rows, containing_inverse)
        for row in contained.rows
    ]
    smith = _smith_diagonal_by_minors(coordinates, max_minors)
    if smith["state"] != "ok":
        return smith
    for value in smith["diagonal"]:
        divisor = _gcd(modulus, value)
        if divisor not in (1, modulus):
            return {
                "state": "split",
                "divisor": divisor,
                "evidence": {
                    "operation": "relation-smith-divisor",
                    "coefficient": value,
                    "smith_diagonal": smith["diagonal"],
                    "minors": smith["minors"],
                },
            }
    return {
        "state": "free",
        "smith_diagonal": smith["diagonal"],
        "minors": smith["minors"],
    }


def _integer_nth_root(value: int, exponent: int) -> int:
    low = 0
    high = 1 << ((value.bit_length() + exponent - 1) // exponent)
    while low + 1 < high:
        middle = (low + high) // 2
        if middle**exponent <= value:
            low = middle
        else:
            high = middle
    return low


def _perfect_power_at_height(value: int, exponent: int) -> int | None:
    root = _integer_nth_root(value, exponent)
    return root if root > 1 and root**exponent == value else None


def perfect_power_component_split(
    component: DiscriminantComponent, exponent: int
) -> ComponentSplit | None:
    """Return exact BL perfect-power control evidence at one height."""
    if exponent < 2:
        raise ValueError("a perfect-power height must be at least two")
    root = _perfect_power_at_height(component.value, exponent)
    if root is None:
        return None
    return ComponentSplit(
        component.value,
        root,
        component.value // root,
        {
            "operation": "perfect-power-height",
            "coefficient": root,
            "base": root,
            "exponent": exponent,
        },
    )


def _general_result(
    state: str,
    component: DiscriminantComponent,
    basis: OrderBasis,
    equation_discriminant: int,
    events: list[dict[str, Any]],
    *,
    split: ComponentSplit | None = None,
    message: str | None = None,
    evidence: dict[str, Any] | None = None,
) -> BuchmannLenstraResult:
    details = {
        "stage": "q-radical-multiplier-cycle",
        "events": events,
        "locally_maximal": state == "complete",
        "certificate": "component-coprime-to-order-discriminant"
        if state == "complete"
        else "bounded-general-cycle",
    }
    if evidence is not None:
        details.update(evidence)
    return BuchmannLenstraResult(
        state,
        component,
        basis=basis if state in ("complete", "enlarged") else None,
        index=_order_index(basis),
        discriminant=_order_discriminant(equation_discriminant, basis),
        split=split,
        evidence=details,
        message=message,
    )


def buchmann_lenstra_general_overorder(
    polynomial_coefficients: list[int],
    component: DiscriminantComponent,
    basis: OrderBasis,
    *,
    equation_discriminant: int | None = None,
    max_steps: int = 128,
    max_degree: int = 16,
    max_minors: int = 100000,
) -> BuchmannLenstraResult:
    """Execute the bounded BL multiplier cycle on a nonidentity order.

    Composite components use Hecke's tame trace-radical and freeness path.
    Proven primes additionally support the wild case via a sufficiently high
    Frobenius kernel; a fixed multiplier ring then certifies `p`-maximality.
    """
    coefficients = [int(value) for value in polynomial_coefficients]
    degree = len(coefficients) - 1
    if degree < 1 or coefficients[-1] != 1 or basis.degree != degree:
        raise ValueError("the polynomial and order basis must have the same degree")
    if degree > max_degree:
        return BuchmannLenstraResult(
            "resource-error",
            component,
            message="Buchmann--Lenstra dynamic degree bound exceeded",
            evidence={"degree": degree, "max_degree": max_degree},
        )
    if max_steps < 1 or max_minors < 1:
        raise ValueError("Buchmann--Lenstra resource bounds must be positive")
    if component.state not in (
        "proven-prime",
        "composite",
        "unresolved-coprime-component",
    ):
        return BuchmannLenstraResult(
            "certification-error",
            component,
            message="general Buchmann--Lenstra requires a usable local component",
        )
    equation_disc = (
        polynomial_discriminant(coefficients)
        if equation_discriminant is None
        else int(equation_discriminant)
    )
    if not _basis_defines_order(coefficients, basis):
        return BuchmannLenstraResult(
            "certification-error",
            component,
            message="the supplied nonidentity basis does not define an order",
        )
    current = basis
    modulus = component.base
    events: list[dict[str, Any]] = []
    steps = 0
    while steps < max_steps:
        discriminant = _order_discriminant(equation_disc, current)
        active = _gcd(abs(discriminant), modulus)
        events.append(
            {
                "sequence": len(events),
                "stage": "component-reduction",
                "q": active,
                "index": _order_index(current),
                "discriminant": discriminant,
                "basis": current.to_dict(),
            }
        )
        if active == 1:
            return _general_result(
                "complete",
                component,
                current,
                equation_disc,
                events,
                evidence={
                    "remaining_component_gcd": 1,
                    "enlargement_count": sum(
                        1 for event in events if event["stage"] == "multiplier-ring"
                    ),
                },
            )
        if active != modulus:
            split = _split_from_divisor(
                component,
                active,
                {
                    "operation": "component-discriminant-gcd",
                    "coefficient": discriminant,
                    "gcd": active,
                },
            )
            return _general_result(
                "split",
                component,
                current,
                equation_disc,
                events,
                split=split,
                evidence={"split_stage": "component-reduction"},
            )
        table = _order_multiplication_table(coefficients, current)
        radical = (
            _p_radical(current, table, active)
            if component.is_proven_prime
            else _q_radical_by_trace(table, active)
        )
        steps += 1
        if radical["state"] == "split":
            split = _split_from_divisor(
                component, int(radical["divisor"]), radical["evidence"]
            )
            return _general_result(
                "split",
                component,
                current,
                equation_disc,
                events,
                split=split,
                evidence={"split_stage": "q-radical"},
            )
        if radical["state"] != "ideal":
            return _general_result(
                "resource-error",
                component,
                current,
                equation_disc,
                events,
                message=str(radical.get("message", "q-radical failed")),
            )
        radical_event = {
            "sequence": len(events),
            "stage": "q-radical",
            "q": active,
            "kernel_rank": radical["kernel_rank"],
            "ideal_hnf": radical["ideal"].rows,
            "method": radical.get("method", "trace"),
        }
        if "trace_matrix" in radical:
            radical_event["trace_matrix"] = radical["trace_matrix"]
        if "frobenius_exponent" in radical:
            radical_event["frobenius_exponent"] = radical["frobenius_exponent"]
            radical_event["frobenius_matrix"] = radical["frobenius_matrix"]
        events.append(radical_event)
        if radical["trivial"]:
            return _general_result(
                "complete",
                component,
                current,
                equation_disc,
                events,
                evidence={
                    "certificate": "trivial-q-radical",
                    "remaining_component_gcd": active,
                },
            )
        ideal = radical["ideal"]
        multiplier = _multiplier_ring_step(current, ideal, table, active)
        if multiplier["state"] == "split":
            split = _split_from_divisor(
                component, int(multiplier["divisor"]), multiplier["evidence"]
            )
            return _general_result(
                "split",
                component,
                current,
                equation_disc,
                events,
                split=split,
                evidence={"split_stage": "multiplier-ring"},
            )
        if multiplier["state"] == "enlarged":
            enlarged = multiplier["basis"]
            if not _basis_defines_order(coefficients, enlarged):
                return _general_result(
                    "certification-error",
                    component,
                    current,
                    equation_disc,
                    events,
                    message="multiplier-ring lattice is not an order",
                )
            events.append(
                {
                    "sequence": len(events),
                    "stage": "multiplier-ring",
                    "q": active,
                    "kernel_rows": multiplier["kernel_rows"],
                    "from_index": _order_index(current),
                    "to_index": _order_index(enlarged),
                    "basis": enlarged.to_dict(),
                }
            )
            current = enlarged
            continue
        if multiplier["state"] != "same":
            return _general_result(
                "resource-error",
                component,
                current,
                equation_disc,
                events,
                message=str(multiplier.get("message", "multiplier-ring failed")),
            )
        if component.is_proven_prime:
            return _general_result(
                "complete",
                component,
                current,
                equation_disc,
                events,
                evidence={
                    "certificate": "p-radical-multiplier-fixed-point",
                    "remaining_component_gcd": active,
                    "enlargement_count": sum(
                        1 for event in events if event["stage"] == "multiplier-ring"
                    ),
                },
            )
        colon = _colon_freeness(ideal, table, active)
        if colon["state"] == "split":
            split = _split_from_divisor(
                component, int(colon["divisor"]), colon["evidence"]
            )
            return _general_result(
                "split",
                component,
                current,
                equation_disc,
                events,
                split=split,
                evidence={"split_stage": "colon-freeness"},
            )
        if colon["state"] != "free":
            return _general_result(
                "resource-error",
                component,
                current,
                equation_disc,
                events,
                message="colon freeness could not be certified",
            )
        events.append(
            {
                "sequence": len(events),
                "stage": "colon-freeness",
                "q": active,
                "quotient_rank": colon["quotient_rank"],
                "kernel_rows": colon["kernel_rows"],
            }
        )
        ideal_one = ideal
        ideal_two = _ideal_multiply(ideal, ideal, table)
        ideal_three = _ideal_multiply(ideal_two, ideal, table)
        for height in range(2, degree + 1):
            if steps >= max_steps:
                break
            left = _ideal_multiply(
                _ideal_add_integer(ideal_one, active),
                _ideal_add_integer(ideal_three, active),
                table,
            )
            middle = _ideal_add_integer(ideal_two, active)
            right = _ideal_multiply(middle, middle, table)
            steps += 1
            equal = left.rows == right.rows
            events.append(
                {
                    "sequence": len(events),
                    "stage": "power-freeness",
                    "height": height,
                    "equal": equal,
                    "left_hnf": left.rows,
                    "right_hnf": right.rows,
                }
            )
            if not equal:
                relation = _relation_freeness(left, right, active, max_minors)
                if relation["state"] == "split":
                    split = _split_from_divisor(
                        component,
                        int(relation["divisor"]),
                        relation["evidence"],
                    )
                    return _general_result(
                        "split",
                        component,
                        current,
                        equation_disc,
                        events,
                        split=split,
                        evidence={"split_stage": "power-freeness"},
                    )
                if relation["state"] != "free":
                    return _general_result(
                        "resource-error",
                        component,
                        current,
                        equation_disc,
                        events,
                        message=str(
                            relation.get("message", "relation freeness failed")
                        ),
                    )
                root = _perfect_power_at_height(active, height)
                if root is not None:
                    split = _split_from_divisor(
                        component,
                        root,
                        {
                            "operation": "perfect-power-height",
                            "coefficient": root,
                            "base": root,
                            "exponent": height,
                            "smith_diagonal": relation["smith_diagonal"],
                        },
                    )
                    return _general_result(
                        "split",
                        component,
                        current,
                        equation_disc,
                        events,
                        split=split,
                        evidence={"split_stage": "perfect-power"},
                    )
                return _general_result(
                    "resource-error",
                    component,
                    current,
                    equation_disc,
                    events,
                    message="stable BL relation needs further factor discovery",
                    evidence={"relation_smith": relation["smith_diagonal"]},
                )
            ideal_one, ideal_two, ideal_three = (
                ideal_two,
                ideal_three,
                _ideal_multiply(ideal_three, ideal, table),
            )
        return _general_result(
            "resource-error",
            component,
            current,
            equation_disc,
            events,
            message="Buchmann--Lenstra freeness cycle exhausted its bound",
        )
    return _general_result(
        "resource-error",
        component,
        current,
        equation_disc,
        events,
        message="Buchmann--Lenstra multiplier cycle exhausted its bound",
    )


def buchmann_lenstra_multiplier_cycle(
    polynomial_coefficients: list[int],
    component: DiscriminantComponent,
    basis: OrderBasis,
    *,
    equation_discriminant: int | None = None,
    max_iterations: int = 128,
    max_degree: int = 16,
    max_minors: int = 100000,
) -> BuchmannLenstraResult:
    """Run the stable current-order radical/multiplier integration API.

    The input and output are canonical row-HNF `OrderBasis` records in the
    equation power basis.  This wrapper exposes the proven-prime wild-radical
    continuation as well as the existing composite Buchmann--Lenstra cycle.
    """
    canonical_basis = OrderBasis(
        _row_hnf([list(row) for row in basis.numerator]),
        basis.denominator,
        canonical=True,
    )
    return buchmann_lenstra_general_overorder(
        polynomial_coefficients,
        component,
        canonical_basis,
        equation_discriminant=equation_discriminant,
        max_steps=max_iterations,
        max_degree=max_degree,
        max_minors=max_minors,
    )


def check_buchmann_lenstra_general_result(
    polynomial_coefficients: list[int],
    starting_basis: OrderBasis,
    result: BuchmannLenstraResult,
    *,
    equation_discriminant: int | None = None,
    max_steps: int = 128,
    max_degree: int = 16,
    max_minors: int = 100000,
) -> bool:
    """Replay the bounded general cycle and compare all certificate evidence."""
    coefficients = [int(value) for value in polynomial_coefficients]
    equation_disc = (
        polynomial_discriminant(coefficients)
        if equation_discriminant is None
        else int(equation_discriminant)
    )
    if result.basis is not None:
        try:
            if _order_index(result.basis) != result.index:
                return False
            if _order_discriminant(equation_disc, result.basis) != result.discriminant:
                return False
        except ArithmeticError:
            return False
    replay = buchmann_lenstra_general_overorder(
        coefficients,
        result.component,
        starting_basis,
        equation_discriminant=equation_disc,
        max_steps=max_steps,
        max_degree=max_degree,
        max_minors=max_minors,
    )
    return replay.to_dict() == result.to_dict()


__all__ = [
    "BuchmannLenstraResult",
    "buchmann_lenstra_general_overorder",
    "buchmann_lenstra_multiplier_cycle",
    "buchmann_lenstra_overorder",
    "check_buchmann_lenstra_general_result",
    "check_buchmann_lenstra_result",
    "perfect_power_component_split",
    "polynomial_discriminant",
    "polynomial_gcd_with_split",
]
