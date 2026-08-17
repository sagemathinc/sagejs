"""Fail-closed Buchmann--Lenstra steps over composite moduli.

This module ports the composite-modulus seam used by Hecke's
`dedekind_test_composite` and tame-overorder driver.  Arithmetic in
`ZZ/qZZ[x]` is never called a field operation: every attempted coefficient
inverse either succeeds as a unit or returns a certified factor of `q`.

The first executable slice handles an equation order.  It can discover a
zero-divisor split, construct the composite Dedekind overorder, and certify
that local work is complete when the new discriminant is coprime to `q`.
If another multiplier-ring cycle is required, the result says `enlarged`
instead of claiming local maximality.  The generic cycle driver can then
continue with a later order adapter.

The implementation is ordinary CPython source and uses only exact integer
arithmetic.  It was derived from Hecke's GPL-licensed
`NumFieldOrd/NfOrd/MaxOrd/{MaxOrd,DedekindCriterion}.jl` implementation.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.maximal_order_contracts import (
    ComponentSplit,
    DiscriminantComponent,
    LocalOrderResult,
    OrderBasis,
)


def _gcd(left: int, right: int) -> int:
    a = abs(left)
    b = abs(right)
    while b:
        a, b = b, a % b
    return a


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
            "status": "stalled",
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

    States are `complete`, `enlarged`, `split`, `stalled`, and
    `certification-error`.  Only `complete` asserts local maximality.
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
        if self.state == "split":
            return LocalOrderResult(
                "split",
                "dedekind",
                self.component,
                split=self.split,
                evidence=self.evidence,
                message=self.message,
            )
        if self.state == "complete":
            return LocalOrderResult(
                "complete",
                "dedekind",
                self.component,
                basis=self.basis,
                index=self.index,
                discriminant=self.discriminant,
                evidence=self.evidence,
                message=self.message,
            )
        common_state = (
            "certification-error"
            if self.state == "certification-error"
            else "not-applicable"
        )
        return LocalOrderResult(
            common_state,
            "dedekind",
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
    non-identity `basis` currently returns `stalled`; this explicit hook is
    where the general radical/multiplier adapter resumes the BL cycle.
    """
    coefficients = [int(value) for value in polynomial_coefficients]
    if len(coefficients) < 2 or coefficients[-1] != 1:
        raise ValueError("the defining polynomial must be monic")
    modulus = component.value
    if component.state not in ("composite", "unresolved-coprime-component"):
        return BuchmannLenstraResult(
            "certification-error",
            component,
            message="Buchmann--Lenstra composite path requires a composite component",
            evidence={"refused_state": component.state},
        )
    degree = len(coefficients) - 1
    if (
        basis is not None
        and basis.canonical_key()
        != OrderBasis(
            [
                [1 if row == column else 0 for column in range(degree)]
                for row in range(degree)
            ],
            1,
        ).canonical_key()
    ):
        return BuchmannLenstraResult(
            "stalled",
            component,
            basis=basis,
            message="general-order radical/multiplier adapter required",
            evidence={"next_stage": "q-radical-multiplier-cycle"},
        )
    data = _composite_dedekind_data(coefficients, modulus)
    if data["status"] == "split":
        return BuchmannLenstraResult(
            "split",
            component,
            split=data["split"],
            evidence={"stage": "composite-dedekind", "zero_divisor": True},
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
    equation_disc = (
        polynomial_discriminant(coefficients)
        if equation_discriminant is None
        else int(equation_discriminant)
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


def check_buchmann_lenstra_result(
    polynomial_coefficients: list[int], result: BuchmannLenstraResult
) -> bool:
    """Independently check a split, enlargement, or completed local result."""
    coefficients = [int(value) for value in polynomial_coefficients]
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
        return result.state in ("stalled", "certification-error")
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
    if not _basis_defines_order(coefficients, basis):
        return False
    remaining = _gcd(abs(result.discriminant), result.component.value)
    if result.state == "complete":
        return remaining == 1 and result.evidence.get("locally_maximal") is True
    return remaining != 1 and result.evidence.get("locally_maximal") is False


def _fraction_add(left: tuple[int, int], right: tuple[int, int]) -> tuple[int, int]:
    numerator = left[0] * right[1] + right[0] * left[1]
    denominator = left[1] * right[1]
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _fraction_multiply(
    left: tuple[int, int], right: tuple[int, int]
) -> tuple[int, int]:
    numerator = left[0] * right[0]
    denominator = left[1] * right[1]
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _fraction_negative(value: tuple[int, int]) -> tuple[int, int]:
    return -value[0], value[1]


def _inverse_fraction_matrix(
    numerator: list[list[int]], denominator: int
) -> list[list[tuple[int, int]]]:
    degree = len(numerator)
    rows: list[list[tuple[int, int]]] = []
    for row_index, row in enumerate(numerator):
        rows.append(
            [(value, denominator) for value in row]
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
    rows = [[(value, basis.denominator) for value in row] for row in basis.numerator]
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


__all__ = [
    "BuchmannLenstraResult",
    "buchmann_lenstra_overorder",
    "check_buchmann_lenstra_result",
    "polynomial_discriminant",
    "polynomial_gcd_with_split",
]
