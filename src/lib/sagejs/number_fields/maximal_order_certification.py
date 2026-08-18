"""Independent checker contracts for certified number-field orders.

The production maximal-order algorithms construct evidence; this module checks
that evidence without trusting their control flow.  Matrix containment and
multiplicative closure are recomputed over exact rational pairs.  Local
maximality evidence is deliberately checked by an injected independent local
checker, so a method name or matching discriminant alone can never certify an
order.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.discriminant_components import (
    PROVEN_PRIME,
    CertificationError,
    check_decomposition_certificate,
    integer_gcd,
)


def _scaled_integral_inverse(
    rows: list[list[int]], scale: int
) -> list[list[int]] | None:
    """Return `scale * rows^-1` when it is integral.

    Lower-triangular row-HNF uses exact forward substitution.  The general
    fallback uses fraction-free Gauss--Jordan elimination to turn `[rows | I]`
    into `[det(rows) I | adj(rows)]`.  Both paths avoid normalizing a rational
    number after every scalar operation.  A `None` result covers both a
    singular matrix and a nonintegral scaled inverse.

    This is not a probabilistic or algorithm-produced shortcut: every Bareiss
    division is checked and every entry of the claimed integral inverse is
    reconstructed from the input matrix.
    """
    degree = len(rows)
    if degree == 0 or any(len(row) != degree for row in rows):
        return None
    lower_triangular = all(
        int(rows[row][column]) == 0
        for row in range(degree)
        for column in range(row + 1, degree)
    )
    if lower_triangular:
        # Certified order bases are emitted in lower row-HNF.  Forward
        # substitution computes d*B^-1 directly, so its intermediate values
        # remain at the size of the result instead of growing to det(B).
        answer = [[0 for _column in range(degree)] for _row in range(degree)]
        for row in range(degree):
            diagonal = int(rows[row][row])
            if diagonal == 0:
                return None
            for column in range(degree):
                numerator = int(scale) if row == column else 0
                for index in range(row):
                    numerator -= int(rows[row][index]) * answer[index][column]
                if numerator % diagonal != 0:
                    return None
                answer[row][column] = numerator // diagonal
        return answer

    augmented: list[list[int]] = []
    for row_index in range(degree):
        row = [int(value) for value in rows[row_index]]
        row.extend([1 if row_index == column else 0 for column in range(degree)])
        augmented.append(row)
    previous_pivot = 1
    for column in range(degree):
        pivot = column
        while pivot < degree and augmented[pivot][column] == 0:
            pivot += 1
        if pivot == degree:
            return None
        if pivot != column:
            augmented[pivot], augmented[column] = augmented[column], augmented[pivot]
        pivot_value = augmented[column][column]
        for row_index in range(degree):
            if row_index == column:
                continue
            factor = augmented[row_index][column]
            for index in range(2 * degree):
                if index == column:
                    continue
                numerator = (
                    pivot_value * augmented[row_index][index]
                    - factor * augmented[column][index]
                )
                if numerator % previous_pivot != 0:
                    raise ArithmeticError(
                        "fraction-free inverse division was not exact"
                    )
                augmented[row_index][index] = numerator // previous_pivot
            augmented[row_index][column] = 0
        previous_pivot = pivot_value

    determinant = augmented[0][0]
    if determinant == 0 or any(
        augmented[index][index] != determinant for index in range(degree)
    ):
        raise ArithmeticError("fraction-free inverse has inconsistent diagonal")
    answer = []
    for row_index in range(degree):
        row = []
        for column in range(degree):
            numerator = int(scale) * augmented[row_index][degree + column]
            if numerator % determinant != 0:
                return None
            row.append(numerator // determinant)
        answer.append(row)
    return answer


def _sparse_power_basis_product(
    left_support: list[tuple[int, int]],
    right_support: list[tuple[int, int]],
    polynomial_support: list[tuple[int, int]],
    degree: int,
) -> list[int]:
    """Multiply prepared sparse vectors modulo a monic polynomial."""
    product = [0 for _index in range(2 * degree - 1)]
    largest_exponent = 0
    for left_index, left_value in left_support:
        for right_index, right_value in right_support:
            exponent = left_index + right_index
            product[exponent] += left_value * right_value
            if exponent > largest_exponent:
                largest_exponent = exponent
    exponent = largest_exponent
    while exponent >= degree:
        leading = product[exponent]
        if leading:
            offset = exponent - degree
            for index, coefficient in polynomial_support:
                product[offset + index] -= leading * coefficient
        exponent -= 1
    return product[:degree]


def check_order_lattice(
    defining_polynomial: list[int],
    basis_numerator: list[list[int]],
    basis_denominator: int,
) -> dict[str, Any]:
    """Recompute nonsingularity, equation-order containment, and closure."""
    denominator = int(basis_denominator)
    coefficients = [int(value) for value in defining_polynomial]
    degree = len(coefficients) - 1
    if (
        degree < 1
        or coefficients[-1] != 1
        or denominator < 1
        or len(basis_numerator) != degree
    ):
        return {"valid": False, "reason": "basis-shape"}
    rows = [[int(value) for value in row] for row in basis_numerator]
    if denominator == 1 and all(
        rows[row][column] == (1 if row == column else 0)
        for row in range(degree)
        for column in range(degree)
    ):
        # A monic integral defining polynomial makes the power basis an order
        # by construction.  This is a proof shortcut, not a trusted algorithm
        # flag: shape, monicity, and every identity entry were checked here.
        return {"valid": True, "reason": "checked-equation-power-basis"}
    # The equation order is contained in the row lattice B/d precisely when
    # A = d*B^-1 is integral.  Compute A directly with fraction-free integer
    # elimination rather than constructing and repeatedly normalizing n^2
    # rational pairs.
    scaled_inverse = _scaled_integral_inverse(rows, denominator)
    if scaled_inverse is None:
        return {"valid": False, "reason": "equation-order-not-contained"}

    # For d=1, integrality of B^-1 and B itself imply det(B) is a unit.  The
    # candidate lattice is therefore exactly the equation order, whose closure
    # follows from the independently checked monic defining polynomial.
    if denominator == 1:
        return {"valid": True, "reason": "checked-equation-order-lattice"}

    # The product of numerator rows represents product/d^2.  It belongs to
    # B/d exactly when product*(d*B^-1) is divisible by d^2.  Commutativity
    # means only the upper triangle of pairs needs checking.
    denominator_squared = denominator * denominator
    row_supports = [
        [
            (column, rows[row][column])
            for column in range(degree)
            if rows[row][column] != 0
        ]
        for row in range(degree)
    ]
    polynomial_support = [
        (index, coefficients[index])
        for index in range(degree)
        if coefficients[index] != 0
    ]
    inverse_column_supports = [
        [
            (row, scaled_inverse[row][column])
            for row in range(degree)
            if scaled_inverse[row][column] != 0
        ]
        for column in range(degree)
    ]
    for left_index in range(degree):
        for right_index in range(left_index, degree):
            product = _sparse_power_basis_product(
                row_supports[left_index],
                row_supports[right_index],
                polynomial_support,
                degree,
            )
            for column in range(degree):
                coordinate_numerator = 0
                for index, inverse_value in inverse_column_supports[column]:
                    coordinate_numerator += product[index] * inverse_value
                if coordinate_numerator % denominator_squared != 0:
                    return {"valid": False, "reason": "not-multiplicatively-closed"}
    return {"valid": True, "reason": "checked"}


def make_local_maximality_witness(
    prime: int,
    method: str,
    equation_valuation: int,
    order_valuation: int,
    local_index_valuation: int,
    proof: dict[str, Any],
) -> dict[str, Any]:
    """Create the host-neutral input expected by an independent local checker."""
    return {
        "prime": int(prime),
        "method": str(method),
        "equation_valuation": int(equation_valuation),
        "order_valuation": int(order_valuation),
        "local_index_valuation": int(local_index_valuation),
        "proof": proof,
    }


def make_composite_local_maximality_witness(
    component_value: int,
    method: str,
    proof: dict[str, Any],
) -> dict[str, Any]:
    """Create evidence for a component proof that never assumes primality.

    Buchmann--Lenstra radical/multiplier/freeness cycles may certify an entire
    coprime composite component.  Their independent checker owns the
    mathematical proof; this schema makes the no-primality assumption explicit.
    """
    return {
        "component_value": abs(int(component_value)),
        "method": str(method),
        "assumes_prime": False,
        "proof": proof,
    }


def check_discriminant_coprime_component_witness(
    order_discriminant: int,
    component: dict[str, Any],
    witness: dict[str, Any],
) -> bool:
    """Check a composite local proof using discriminant coprimality.

    This check assumes only that the separately checked candidate is an order
    containing the equation order.  If its discriminant is coprime to the
    support of an unresolved component, it is maximal at every prime in that
    component: a proper overorder of local index divisible by `p` would divide
    the order discriminant by `p^2`, which is impossible when `p` does not
    divide that discriminant.

    The component record remains composite throughout; no primality claim is
    inferred from this witness.
    """
    if component.get("state") == PROVEN_PRIME:
        return False
    component_value = abs(int(component.get("value", 0)))
    support = abs(int(component.get("base", 0)))
    if component_value < 2 or support < 2:
        return False
    if abs(int(witness.get("component_value", 0))) != component_value:
        return False
    if witness.get("assumes_prime") is not False:
        return False
    proof = witness.get("proof", {})
    if proof.get("theorem") != "order-discriminant-coprime-component":
        return False
    if abs(int(proof.get("support", 0))) != support:
        return False
    return integer_gcd(abs(int(order_discriminant)), support) == 1


def make_maximal_order_certificate(
    defining_polynomial: list[int],
    basis_numerator: list[list[int]],
    basis_denominator: int,
    equation_discriminant: int,
    order_discriminant: int,
    index: int,
    component_certificate: dict[str, Any],
    local_witnesses: list[dict[str, Any]],
    scope: str = "global",
    requested_primes: list[int] | None = None,
    merge_denominator_primes: list[int] | None = None,
) -> dict[str, Any]:
    """Assemble a versioned certificate without asserting that it is valid."""
    return {
        "version": 1,
        "scope": scope,
        "defining_polynomial": list(defining_polynomial),
        "basis_numerator": [list(row) for row in basis_numerator],
        "basis_denominator": int(basis_denominator),
        "equation_discriminant": int(equation_discriminant),
        "order_discriminant": int(order_discriminant),
        "index": int(index),
        "component_certificate": component_certificate,
        "local_witnesses": list(local_witnesses),
        "requested_primes": [] if requested_primes is None else list(requested_primes),
        "merge_denominator_primes": []
        if merge_denominator_primes is None
        else list(merge_denominator_primes),
    }


def _valuation(value: int, prime: int) -> int:
    number = abs(int(value))
    answer = 0
    while number and number % prime == 0:
        number //= prime
        answer += 1
    return answer


def check_maximal_order_certificate(
    certificate: dict[str, Any], local_checker: Any = None
) -> dict[str, Any]:
    """Check global or explicitly scoped local maximality evidence.

    `local_checker(witness, certificate)` must independently validate the
    method-specific proof (Dedekind, Round 2, Round 4, polygon, or OM).  It is
    mandatory whenever a relevant local branch exists.  This prevents the
    orchestration layer from certifying itself merely by emitting a method
    label and expected valuation.
    """
    if int(certificate.get("version", 0)) != 1:
        return {"valid": False, "certified": False, "reason": "version"}
    lattice = check_order_lattice(
        certificate.get("defining_polynomial", []),
        certificate.get("basis_numerator", []),
        int(certificate.get("basis_denominator", 0)),
    )
    if not lattice["valid"]:
        return {"valid": False, "certified": False, "reason": lattice["reason"]}

    equation_discriminant = int(certificate.get("equation_discriminant", 0))
    order_discriminant = int(certificate.get("order_discriminant", 0))
    index = int(certificate.get("index", 0))
    if index < 1 or equation_discriminant != order_discriminant * index * index:
        return {"valid": False, "certified": False, "reason": "discriminant-index"}

    scope = certificate.get("scope")
    if scope not in ("global", "local"):
        return {"valid": False, "certified": False, "reason": "scope"}
    components = certificate.get("component_certificate", {})
    if abs(equation_discriminant) != int(components.get("original", 0)):
        return {"valid": False, "certified": False, "reason": "component-discriminant"}
    if not check_decomposition_certificate(components, require_proven=False):
        return {"valid": False, "certified": False, "reason": "components-unresolved"}

    witness_by_prime = {}
    witness_by_component = {}
    for witness in certificate.get("local_witnesses", []):
        if "component_value" in witness:
            component_value = abs(int(witness.get("component_value", 0)))
            if component_value < 2 or component_value in witness_by_component:
                return {
                    "valid": False,
                    "certified": False,
                    "reason": "duplicate-component-witness",
                }
            witness_by_component[component_value] = witness
            continue
        prime = int(witness.get("prime", 0))
        if prime < 2 or prime in witness_by_prime:
            return {
                "valid": False,
                "certified": False,
                "reason": "duplicate-local-witness",
            }
        witness_by_prime[prime] = witness

    if scope == "global":
        needed = []
        composite_needed = []
        for component in components.get("components", []):
            if component.get("state") == PROVEN_PRIME:
                prime = int(component["base"])
                if _valuation(equation_discriminant, prime) >= 2:
                    needed.append(prime)
            else:
                # Without factoring a component we cannot prove that no prime
                # square divides it.  Requiring a collective proof is the
                # conservative, fail-closed choice.
                composite_needed.append(int(component["value"]))
    else:
        composite_needed = []
        needed = sorted(
            [int(value) for value in certificate.get("requested_primes", [])]
        )
        proven_bases = []
        for component in components.get("components", []):
            if component.get("state") == PROVEN_PRIME:
                proven_bases.append(int(component.get("base", 0)))
        for prime in needed:
            if prime not in proven_bases:
                return {
                    "valid": False,
                    "certified": False,
                    "reason": "requested-prime-unproved",
                }

    denominator_primes = sorted(
        [int(value) for value in certificate.get("merge_denominator_primes", [])]
    )
    for prime in denominator_primes:
        supported_by_composite = False
        for component_value in composite_needed:
            if component_value % prime == 0:
                supported_by_composite = True
        if prime not in needed and not supported_by_composite:
            return {
                "valid": False,
                "certified": False,
                "reason": "merge-introduced-prime",
            }

    for component_value in composite_needed:
        witness = witness_by_component.get(component_value)
        if witness is None:
            return {
                "valid": False,
                "certified": False,
                "reason": "missing-component-witness",
            }
        if witness.get("assumes_prime") is not False:
            return {
                "valid": False,
                "certified": False,
                "reason": "composite-proof-assumes-prime",
            }
        if local_checker is None:
            return {
                "valid": True,
                "certified": False,
                "reason": "local-checker-required",
            }
        if not bool(local_checker(witness, certificate)):
            return {"valid": False, "certified": False, "reason": "component-proof"}

    for prime in needed:
        witness = witness_by_prime.get(prime)
        if witness is None:
            return {
                "valid": False,
                "certified": False,
                "reason": "missing-local-witness",
            }
        equation_valuation = _valuation(equation_discriminant, prime)
        order_valuation = _valuation(order_discriminant, prime)
        index_valuation = _valuation(index, prime)
        if int(witness.get("equation_valuation", -1)) != equation_valuation:
            return {
                "valid": False,
                "certified": False,
                "reason": "local-equation-valuation",
            }
        if int(witness.get("order_valuation", -1)) != order_valuation:
            return {
                "valid": False,
                "certified": False,
                "reason": "local-order-valuation",
            }
        if int(witness.get("local_index_valuation", -1)) != index_valuation:
            return {
                "valid": False,
                "certified": False,
                "reason": "local-index-valuation",
            }
        if equation_valuation != order_valuation + 2 * index_valuation:
            return {
                "valid": False,
                "certified": False,
                "reason": "local-discriminant-index",
            }
        if local_checker is None:
            return {
                "valid": True,
                "certified": False,
                "reason": "local-checker-required",
            }
        if not bool(local_checker(witness, certificate)):
            return {"valid": False, "certified": False, "reason": "local-proof"}
    return {"valid": True, "certified": True, "reason": "checked"}


def require_maximal_order_certificate(
    certificate: dict[str, Any], local_checker: Any = None
) -> None:
    """Raise a certification error unless the independent checker succeeds."""
    result = check_maximal_order_certificate(certificate, local_checker)
    if not result["certified"]:
        raise CertificationError(
            "maximal-order certification failed: " + result["reason"]
        )


def _adapter_operation(adapter: Any, name: str) -> Any:
    if isinstance(adapter, dict):
        operation = adapter.get(name)
    else:
        operation = getattr(adapter, name, None)
    if operation is None:
        raise TypeError("the maximal-order adapter does not provide " + name)
    return operation


def certify_global_order(
    adapter: Any,
    candidate: Any,
    decomposition: dict[str, Any],
    local_evidence: list[dict[str, Any]],
    *,
    scope: str = "global",
    requested_primes: list[int] | None = None,
    merge_denominator_primes: list[int] | None = None,
) -> dict[str, Any]:
    """Construct and independently certify an order through a small adapter.

    The adapter supplies `defining_polynomial(candidate)`,
    `basis_data(candidate) -> (integer_rows, denominator)`,
    `equation_discriminant(candidate)`, `order_discriminant(candidate)`,
    `index(candidate)`, and `verify_local_witness(witness, certificate)`.
    These operations are deliberately representation-neutral, so the same
    checker works with CPython fixture objects and Sage.js number-field orders.
    """
    polynomial = _adapter_operation(adapter, "defining_polynomial")(candidate)
    basis_numerator, basis_denominator = _adapter_operation(adapter, "basis_data")(
        candidate
    )
    certificate = make_maximal_order_certificate(
        list(polynomial),
        [list(row) for row in basis_numerator],
        int(basis_denominator),
        int(_adapter_operation(adapter, "equation_discriminant")(candidate)),
        int(_adapter_operation(adapter, "order_discriminant")(candidate)),
        int(_adapter_operation(adapter, "index")(candidate)),
        decomposition,
        local_evidence,
        scope,
        requested_primes,
        merge_denominator_primes,
    )
    local_checker = _adapter_operation(adapter, "verify_local_witness")
    require_maximal_order_certificate(certificate, local_checker)
    certificate["certified"] = True
    return certificate


def check_certificate(
    certificate: dict[str, Any], local_checker: Any = None
) -> dict[str, Any]:
    """Stable short name for the independent maximal-order checker."""
    return check_maximal_order_certificate(certificate, local_checker)


__all__ = [
    "certify_global_order",
    "check_certificate",
    "check_discriminant_coprime_component_witness",
    "check_maximal_order_certificate",
    "check_order_lattice",
    "make_composite_local_maximality_witness",
    "make_local_maximality_witness",
    "make_maximal_order_certificate",
    "require_maximal_order_certificate",
]
