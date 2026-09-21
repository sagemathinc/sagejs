# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

"""Certified, answer-free preparation for the experimental Rust class core.

This module is a narrow serialization boundary, not a class-group algorithm.
It converts a public Sage.js number field into the exact cubic data consumed by
the Rust qualification engine.  No relations, units, class numbers, retry
schedules, or expected answers cross this boundary.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import sagejs as sage

_SCHEMA = "sagejs.rust-class-group.neutral-input/v1"
_RESULT_SCHEMA = "sagejs.rust-class-group/prepared-cubic-class-unit-v1"
_RESULT_QUALIFICATION_STATUS = "grh-conditional-class-unit-index-one"
_RESULT_BOUNDARY = "replay-validated-prepared-cubic-to-complete-class-and-unit-result"
_PUBLIC_RESULT_EVIDENCE_GAPS = (
    "no Sage.js RelationPresentation replay accepted by the public class-map adapter",
    "no arbitrary-ideal discrete-log and principality callback with exact quotient witnesses",
    "no Sage.js class-group proof record replaying the conditional factor-base theorem",
    "compact unit factors have not been reconstructed as live exact Sage.js unit objects",
    "no RootsOfUnityResult and rigorous RegulatorEnclosure bound to those live units",
    "no UnitSaturationIndexCertificate or ClassUnitSaturationRecord accepted by Sage.js",
)
_SMALL_PRIMES = (
    2,
    3,
    5,
    7,
    11,
    13,
    17,
    19,
    23,
    29,
    31,
    37,
    41,
    43,
    47,
    53,
    59,
    61,
    67,
    71,
    73,
    79,
    83,
    89,
    97,
)


def _maximal_order_module() -> Any:
    return __import__(
        "sagejs.number_fields.maximal_order",
        fromlist=["maximal_order"],
    )


def _integer_prime_divisors(value: int) -> list[int]:
    if value < 1:
        raise ValueError("an equation-order index must be positive")
    if value == 1:
        return []
    answer = []
    for prime, _exponent in sage.factor(value):
        answer.append(int(prime))
    product = 1
    remaining = value
    for prime in answer:
        product *= prime
        while remaining % prime == 0:
            remaining //= prime
    if remaining != 1 or product < 2:
        raise ArithmeticError("failed to certify equation-order index support")
    return answer


def _irreducibility_prime(polynomial: Any) -> int:
    finite_fields = __import__("sagejs._baselib.finite_fields", fromlist=["GF"])
    variable = polynomial._parent.variable_name()
    for prime in _SMALL_PRIMES:
        residue_ring = sage.PolynomialRing(finite_fields.GF(prime), variable)
        if residue_ring(polynomial).is_irreducible():
            return prime
    raise NotImplementedError(
        "no irreducibility witness was found among the first 25 rational primes"
    )


def _determinant_3(matrix: list[list[int]]) -> int:
    return (
        matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
        - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
        + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
    )


def _multiply_3(left: list[list[int]], right: list[list[int]]) -> list[list[int]]:
    return [
        [
            sum(left[row][middle] * right[middle][column] for middle in range(3))
            for column in range(3)
        ]
        for row in range(3)
    ]


def _inverse_unimodular_3(matrix: list[list[int]]) -> list[list[int]]:
    determinant = _determinant_3(matrix)
    if determinant not in (-1, 1):
        raise ArithmeticError("an integral basis change must be unimodular")
    answer = []
    for row in range(3):
        inverse_row = []
        for column in range(3):
            minor_rows = [index for index in range(3) if index != column]
            minor_columns = [index for index in range(3) if index != row]
            cofactor = (
                matrix[minor_rows[0]][minor_columns[0]]
                * matrix[minor_rows[1]][minor_columns[1]]
                - matrix[minor_rows[0]][minor_columns[1]]
                * matrix[minor_rows[1]][minor_columns[0]]
            )
            if (row + column) % 2 != 0:
                cofactor = -cofactor
            inverse_row.append(cofactor // determinant)
        answer.append(inverse_row)
    return answer


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_remainder = abs(left)
    remainder = abs(right)
    old_left_coefficient = 1
    left_coefficient = 0
    old_right_coefficient = 0
    right_coefficient = 1
    while remainder != 0:
        quotient = old_remainder // remainder
        old_remainder, remainder = (
            remainder,
            old_remainder - quotient * remainder,
        )
        old_left_coefficient, left_coefficient = (
            left_coefficient,
            old_left_coefficient - quotient * left_coefficient,
        )
        old_right_coefficient, right_coefficient = (
            right_coefficient,
            old_right_coefficient - quotient * right_coefficient,
        )
    if left < 0:
        old_left_coefficient = -old_left_coefficient
    if right < 0:
        old_right_coefficient = -old_right_coefficient
    return old_remainder, old_left_coefficient, old_right_coefficient


def _unit_first_change(
    numerator: list[list[int]], denominator: int
) -> tuple[list[list[int]], list[list[int]]]:
    determinant = _determinant_3(numerator)
    cofactors = [
        numerator[1][1] * numerator[2][2] - numerator[1][2] * numerator[2][1],
        numerator[0][2] * numerator[2][1] - numerator[0][1] * numerator[2][2],
        numerator[0][1] * numerator[1][2] - numerator[0][2] * numerator[1][1],
    ]
    scaled = [denominator * value for value in cofactors]
    if determinant == 0 or any(value % determinant != 0 for value in scaled):
        raise ArithmeticError("one is not integral in the certified order basis")
    unit_coordinates = [value // determinant for value in scaled]

    current = list(unit_coordinates)
    right_change = [
        [1 if row == column else 0 for column in range(3)] for row in range(3)
    ]
    for column in (1, 2):
        divisor, first, second = _extended_gcd(current[0], current[column])
        if divisor == 0:
            continue
        step = [[1 if row == other else 0 for other in range(3)] for row in range(3)]
        step[0][0] = first
        step[0][column] = -(current[column] // divisor)
        step[column][0] = second
        step[column][column] = current[0] // divisor
        current = [
            sum(current[index] * step[index][target] for index in range(3))
            for target in range(3)
        ]
        right_change = _multiply_3(right_change, step)
    if current[0] == -1:
        for row in range(3):
            right_change[row][0] = -right_change[row][0]
        current[0] = 1
    if current != [1, 0, 0]:
        raise ArithmeticError("the certified order does not contain one primitively")
    left_change = _inverse_unimodular_3(right_change)
    if left_change[0] != unit_coordinates:
        raise ArithmeticError("failed to place one first in the integral basis")
    return left_change, right_change


def _integral_basis_projection(
    order: Any, scale: int
) -> tuple[list[list[int]], int, list[list[int]], list[list[int]]]:
    """Express a unit-first certified basis in the integral generator."""
    rational_rows = []
    denominator = 1
    for row in order._basis_rows:
        transformed = []
        power = sage.ZZ(1)
        for value in row:
            coordinate = value / power
            transformed.append(coordinate)
            denominator = _positive_lcm(denominator, int(coordinate._denominator))
            power *= scale
        rational_rows.append(transformed)
    numerator = []
    for row in rational_rows:
        numerator_row = []
        for value in row:
            scaled = value * denominator
            if scaled._denominator != 1:
                raise ArithmeticError("failed to project the integral basis exactly")
            numerator_row.append(int(scaled._numerator))
        numerator.append(numerator_row)
    left_change, right_change = _unit_first_change(numerator, denominator)
    return (
        _multiply_3(left_change, numerator),
        int(denominator),
        left_change,
        right_change,
    )


def _transform_multiplication_table(
    table: Any,
    left_change: list[list[int]],
    right_change: list[list[int]],
) -> list[list[list[int]]]:
    answer = []
    for left in range(3):
        left_products = []
        for right in range(3):
            old_coordinates = [0, 0, 0]
            for old_left in range(3):
                for old_right in range(3):
                    coefficient = (
                        left_change[left][old_left] * left_change[right][old_right]
                    )
                    for coordinate in range(3):
                        old_coordinates[coordinate] += coefficient * int(
                            table[old_left][old_right][coordinate]
                        )
            new_coordinates = [
                sum(
                    old_coordinates[coordinate] * right_change[coordinate][target]
                    for coordinate in range(3)
                )
                for target in range(3)
            ]
            left_products.append(new_coordinates)
        answer.append(left_products)
    return answer


def _exact_integer(value: Any) -> dict[str, str]:
    return {"numerator": str(int(value)), "denominator": "1"}


def _positive_lcm(left: int, right: int) -> int:
    if left < 1 or right < 1:
        raise ValueError("LCM operands must be positive")
    a = left
    b = right
    while b != 0:
        a, b = b, a % b
    return (left // a) * right


def prepare_cubic_for_rust(
    field: Any,
    *,
    proof: str = "conditional-grh",
    precision_bits: int = 192,
) -> dict[str, Any]:
    """Return a certified neutral cubic input for the Rust qualification core.

    The returned dictionary is JSON-serializable and contains no class-group
    answers.  Sage.js certifies the maximal order before any basis is exported;
    the Rust consumer independently replays the polynomial, basis, table,
    discriminant, signature, equation-order index support, and irreducibility
    witness before starting relation collection.
    """
    if field.degree() != 3:
        raise NotImplementedError(
            "the Rust qualification boundary currently needs degree 3"
        )
    if proof != "conditional-grh":
        raise NotImplementedError(
            "the Rust qualification boundary currently needs proof='conditional-grh'"
        )
    if precision_bits < 64:
        raise ValueError("precision_bits must be at least 64")

    maximal = _maximal_order_module()
    polynomial = maximal.integral_equation_polynomial(field)
    coefficients = list(polynomial.list())
    if len(coefficients) != 4 or coefficients[-1] != 1:
        raise ValueError("the integral equation polynomial must be monic cubic")
    scale = int(field._integral_equation_scale_cache)
    order = field.maximal_order()
    if not order.is_maximal():
        raise ArithmeticError("Sage.js did not certify the exported maximal order")
    # Materialize and retain the public proof authority before serializing its
    # consequences.  The dictionary itself remains internal to Sage.js.
    certificate = order.maximality_certificate()
    if certificate.get("certified") is not True:
        raise ArithmeticError("the maximal-order certificate did not replay")

    basis_rows, basis_denominator, left_change, right_change = (
        _integral_basis_projection(order, scale)
    )
    basis_numerators = [value for row in basis_rows for value in row]
    table = _transform_multiplication_table(
        maximal._nf_order_multiplication_table_frozen(order),
        left_change,
        right_change,
    )
    multiplication_table = [
        [[_exact_integer(value) for value in product] for product in left]
        for left in table
    ]
    index = int(maximal.equation_order_index(order))
    signature = field.signature()
    preparation_payload = {
        "basisNumeratorsRowMajor": [str(value) for value in basis_numerators],
        "basisDenominator": str(basis_denominator),
        "discriminant": str(int(order.discriminant())),
        "signature": {
            "realPlaces": int(signature[0]),
            "complexPairs": int(signature[1]),
        },
        "multiplicationTable": multiplication_table,
        "irreducibilityPrime": _irreducibility_prime(polynomial),
        "indexPrimes": [str(prime) for prime in _integer_prime_divisors(index)],
    }
    canonical = json.dumps(
        {
            "polynomial": [str(int(value)) for value in coefficients],
            "preparation": preparation_payload,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    source_sha256 = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    preparation_payload.update(
        {
            "kind": "neutral-prepared-field",
            "authority": "sagejs-certified-preparation",
            "maximalOrderCertified": True,
            "sourceSha256": source_sha256,
        }
    )
    return {
        "schema": _SCHEMA,
        "inputId": "sha256:" + source_sha256,
        "fieldId": "sagejs-cubic-" + source_sha256[:16],
        "field": {
            "variable": polynomial._parent.variable_name(),
            "coefficientsAscending": [str(int(value)) for value in coefficients],
            "degree": 3,
            "monic": True,
            "irreducible": True,
        },
        "preparation": preparation_payload,
        "request": {
            "proof": proof,
            "output": "class-and-unit-group",
            "mapPolicy": "construct-eagerly",
            "unitPolicy": "compact-complete",
            "limits": {
                "wallMilliseconds": "60000",
                "memoryBytes": "1073741824",
                "relationCandidates": "5000000",
                "precisionBits": precision_bits,
                "continuationPasses": 16,
            },
        },
        "randomness": {"algorithm": "pari-compatible-seed-one", "seed": "1"},
        "containsOracleAnswers": False,
    }


def _input_integer(value: Any) -> Any:
    """Parse a canonical JSON integer without passing a string to `ZZ`."""
    return sage.ZZ(int(str(value)))


def _prepared_basis_elements(field: Any, prepared_input: dict[str, Any]) -> list[Any]:
    preparation = prepared_input["preparation"]
    numerator = [
        _input_integer(value) for value in preparation["basisNumeratorsRowMajor"]
    ]
    denominator = _input_integer(preparation["basisDenominator"])
    if len(numerator) != 9 or denominator <= 0:
        raise ValueError("the prepared cubic basis must be a 3 by 3 rational matrix")
    scale = sage.ZZ(field._integral_equation_scale_cache)
    integral_generator = scale * field.gen()
    basis = []
    for row in range(3):
        element = field(0)
        for column in range(3):
            element += (
                numerator[3 * row + column] * integral_generator**column / denominator
            )
        basis.append(element)
    return basis


def _element_from_prepared_coordinates(
    field: Any, basis: list[Any], coordinates: Any
) -> Any:
    if len(coordinates) != 3:
        raise ValueError("an integral-basis coordinate row must have length three")
    answer = field(0)
    for index in range(3):
        answer += _input_integer(coordinates[index]) * basis[index]
    return answer


def _ideal_from_prepared_descriptor(
    field: Any,
    order: Any,
    basis: list[Any],
    descriptor: dict[str, Any],
) -> Any:
    prime = _input_integer(descriptor["prime"])
    hnf = descriptor["hnf"]
    if len(hnf) != 9:
        raise ValueError("a prime ideal HNF must have nine entries")
    hnf_generators = []
    for row in range(3):
        hnf_generators.append(
            _element_from_prepared_coordinates(
                field,
                basis,
                hnf[3 * row : 3 * row + 3],
            )
        )
    prime_ideal = order.ideal(hnf_generators)
    raw_generator = descriptor.get("generator")
    if raw_generator is not None:
        generator = _element_from_prepared_coordinates(field, basis, raw_generator)
        if order.ideal(prime, generator) != prime_ideal:
            raise ArithmeticError("a prime ideal HNF does not replay")
    if prime_ideal.norm() != _input_integer(descriptor["norm"]):
        raise ArithmeticError("a prime ideal norm does not replay")
    return prime_ideal


def _prime_descriptor_identity(descriptor: dict[str, Any]) -> tuple[Any, ...]:
    generator = descriptor["generator"]
    return (
        str(descriptor["prime"]),
        str(descriptor["norm"]),
        None if generator is None else tuple(str(value) for value in generator),
        tuple(str(value) for value in descriptor["hnf"]),
    )


def _determinant_three_by_three(entries: list[Any]) -> Any:
    if len(entries) != 9:
        raise ValueError("a cubic ideal lattice must have nine entries")
    return (
        entries[0] * (entries[4] * entries[8] - entries[5] * entries[7])
        - entries[1] * (entries[3] * entries[8] - entries[5] * entries[6])
        + entries[2] * (entries[3] * entries[7] - entries[4] * entries[6])
    )


def _coordinates_in_row_lattice(coordinates: list[Any], row_basis: list[Any]) -> bool:
    """Test membership in a full-rank cubic row lattice by Cramer's rule."""
    if len(coordinates) != 3 or len(row_basis) != 9:
        raise ValueError("a cubic lattice membership check has invalid dimensions")
    determinant = _determinant_three_by_three(row_basis)
    if determinant == 0:
        raise ArithmeticError("an ideal HNF is singular")
    for row in range(3):
        replaced = list(row_basis)
        replaced[3 * row : 3 * row + 3] = coordinates
        if _determinant_three_by_three(replaced) % determinant != 0:
            return False
    return True


def _norm_from_multiplication_table(
    coordinates: list[Any], multiplication_table: list[list[list[Any]]]
) -> Any:
    """Compute an integral-basis element norm as a 3 by 3 determinant."""
    multiplication_matrix = [
        sum(
            coordinates[left] * multiplication_table[left][right][output]
            for left in range(3)
        )
        for right in range(3)
        for output in range(3)
    ]
    return _determinant_three_by_three(multiplication_matrix)


def _multiply_prepared_coordinates(
    left: list[Any],
    right: list[Any],
    multiplication_table: list[list[list[Any]]],
) -> list[Any]:
    return [
        sum(
            left[i] * right[j] * multiplication_table[i][j][output]
            for i in range(3)
            for j in range(3)
        )
        for output in range(3)
    ]


def _is_prime_integer(value: Any) -> bool:
    candidate = int(str(value))
    if candidate < 2:
        return False
    small_primes = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
    for prime in small_primes:
        if candidate % prime == 0:
            return candidate == prime
    if candidate >= 1 << 64:
        raise OverflowError("the exact factor-base primality check is limited to u64")
    odd_part = candidate - 1
    two_valuation = 0
    while odd_part % 2 == 0:
        odd_part //= 2
        two_valuation += 1
    # This base set is deterministic for every unsigned 64-bit integer.
    for base in (2, 325, 9375, 28178, 450775, 9780504, 1795265022):
        reduced_base = base % candidate
        if reduced_base == 0:
            continue
        residue = pow(reduced_base, odd_part, candidate)
        if residue in (1, candidate - 1):
            continue
        for _ in range(two_valuation - 1):
            residue = residue * residue % candidate
            if residue == candidate - 1:
                break
        else:
            return False
    return True


def _validate_prime_hnf_lattice(
    descriptor: dict[str, Any],
    multiplication_table: list[list[list[Any]]],
    validated_rational_primes: set[int] | None = None,
) -> tuple[list[Any], list[int] | None]:
    prime = _input_integer(descriptor["prime"])
    norm = _input_integer(descriptor["norm"])
    residue_degree = int(str(descriptor.get("residueDegree", 1)))
    hnf = [_input_integer(value) for value in descriptor["hnf"]]
    prime_integer = int(str(prime))
    if (
        validated_rational_primes is None
        or prime_integer not in validated_rational_primes
    ):
        if not _is_prime_integer(prime):
            raise ArithmeticError("a factor-base descriptor is not degree-one prime")
        if validated_rational_primes is not None:
            validated_rational_primes.add(prime_integer)
    if residue_degree < 1 or norm != prime**residue_degree:
        raise ArithmeticError("a factor-base descriptor has the wrong residue degree")
    if abs(_determinant_three_by_three(hnf)) != norm:
        raise ArithmeticError("a prime ideal HNF has the wrong index")
    if residue_degree != 1:
        # Higher residue-degree primes use the independently factored Sage.js
        # ideal path below.  The linear character is specific to index-p
        # lattices and must not be fabricated for index-p^f lattices.
        return hnf, None
    modulus = int(str(prime))
    rows_modulo_prime = [
        [int(str(hnf[3 * row + column])) % modulus for column in range(3)]
        for row in range(3)
    ]
    character: list[int] | None = None
    for first in range(3):
        for second in range(first + 1, 3):
            left = rows_modulo_prime[first]
            right = rows_modulo_prime[second]
            candidate = [
                (left[1] * right[2] - left[2] * right[1]) % modulus,
                (left[2] * right[0] - left[0] * right[2]) % modulus,
                (left[0] * right[1] - left[1] * right[0]) % modulus,
            ]
            if any(candidate):
                character = candidate
                break
        if character is not None:
            break
    if character is None or any(
        sum(row[column] * character[column] for column in range(3)) % modulus != 0
        for row in rows_modulo_prime
    ):
        raise ArithmeticError("a prime ideal HNF has the wrong residue kernel")
    for row in range(3):
        generator = rows_modulo_prime[row]
        # Multiplication by 1 is tautological. Multiplication by the two
        # remaining integral-basis generators proves closure under the order.
        for basis_index in range(1, 3):
            product = [
                sum(
                    generator[left]
                    * (
                        int(str(multiplication_table[left][basis_index][output]))
                        % modulus
                    )
                    for left in range(3)
                )
                % modulus
                for output in range(3)
            ]
            if sum(product[i] * character[i] for i in range(3)) % modulus != 0:
                raise ArithmeticError("a prime ideal HNF is not an ideal")
    raw_generator = descriptor.get("generator")
    if raw_generator is not None:
        exported_generator = [_input_integer(value) for value in raw_generator]
        if (
            sum(int(str(exported_generator[i])) * character[i] for i in range(3))
            % modulus
            != 0
        ):
            raise ArithmeticError("a prime ideal generator is not in its HNF")
    return hnf, character


def _validate_prime_power_hnf_lattice(
    prime_hnf: list[Any],
    power_hnf: list[Any],
    prime_norm: Any,
    exponent: int,
    multiplication_table: list[list[list[Any]]],
) -> None:
    if (
        exponent <= 1
        or abs(_determinant_three_by_three(power_hnf)) != prime_norm**exponent
    ):
        raise ArithmeticError("a prime-power HNF has the wrong index")
    products = [[sage.ZZ(1), sage.ZZ(0), sage.ZZ(0)]]
    prime_generators = [prime_hnf[3 * row : 3 * row + 3] for row in range(3)]
    for _ in range(exponent):
        products = [
            _multiply_prepared_coordinates(product, generator, multiplication_table)
            for product in products
            for generator in prime_generators
        ]
    if not all(_coordinates_in_row_lattice(product, power_hnf) for product in products):
        raise ArithmeticError("a claimed prime-power HNF does not contain the power")


def verify_rust_class_generator_orders(
    field: Any,
    prepared_input: dict[str, Any],
    result: dict[str, Any],
) -> dict[str, Any]:
    """Independently replay Rust class-generator order witnesses in Sage.js.

    This verifier deliberately does not trust Rust's relation-coordinate replay.
    It reconstructs each selected prime ideal twice—from `(p, alpha)` and from
    the exported HNF.  For each integral source relation it checks membership
    in every claimed prime-ideal power and equality of absolute norms.  Since
    distinct prime ideals are coprime, containment plus equal norm proves the
    principal-ideal equality without repeatedly canonicalizing large ideal
    products.

    The result remains only a generator-order certificate.  It does not prove
    relation-lattice completeness, unit saturation, or arbitrary ideal maps.
    """
    authoritative = prepare_cubic_for_rust(field)
    if not _prepared_input_matches_authoritative(prepared_input, authoritative):
        raise ValueError("the Rust input does not match this certified Sage.js field")
    if result.get("inputId") != prepared_input["inputId"]:
        raise ValueError("the Rust result does not identify the prepared input")

    order = field.maximal_order()
    basis = _prepared_basis_elements(field, prepared_input)
    multiplication_table = [
        [
            [
                _input_integer(entry["numerator"])
                // _input_integer(entry["denominator"])
                for entry in product
            ]
            for product in left
        ]
        for left in prepared_input["preparation"]["multiplicationTable"]
    ]
    class_map = result["classMap"]
    selected_indices = class_map["selectedGeneratorIndicesZeroBased"]
    selected_ideals = class_map["selectedGeneratorPrimeIdeals"]
    # Early trivial-group bundles predate the explicit empty generator-order
    # catalogs.  Their absence is equivalent to an empty catalog only after
    # the independently parsed invariant list below is also empty.
    relations = class_map.get("generatorOrderRelations", [])
    factor_base_catalog: dict[int, dict[str, Any]] = {}
    for descriptor in class_map.get("generatorOrderFactorBaseCatalog", []):
        index = int(str(descriptor["factorBaseIndexZeroBased"]))
        if index in factor_base_catalog:
            raise ValueError("the generator-order factor-base catalog repeats an index")
        factor_base_catalog[index] = descriptor
    exported_power_hnfs: dict[tuple[int, int], list[Any]] = {}
    for descriptor in class_map.get("generatorOrderPrimePowerHnfs", []):
        key = (
            int(str(descriptor["factorBaseIndexZeroBased"])),
            int(str(descriptor["exponent"])),
        )
        if key in exported_power_hnfs:
            raise ValueError("the generator-order prime-power catalog repeats a key")
        if key[1] <= 1:
            raise ValueError(
                "the generator-order prime-power catalog has exponent <= 1"
            )
        exported_power_hnfs[key] = [
            _input_integer(value) for value in descriptor["hnf"]
        ]
    invariants = [
        _input_integer(value)
        for value in result["analyticCompletion"]["candidateInvariantFactors"]
    ]
    if not (
        len(selected_indices)
        == len(selected_ideals)
        == len(relations)
        == len(invariants)
    ):
        raise ValueError("the Rust class-generator evidence has inconsistent lengths")

    verified = []
    seen_coordinates: set[int] = set()
    factor_ideal_cache: dict[int, Any] = {}
    factor_hnf_cache: dict[int, list[Any]] = {}
    factor_character_cache: dict[int, list[int] | None] = {}
    factor_identity_cache: dict[int, tuple[Any, ...]] = {}
    validated_rational_primes: set[int] = set()
    factored_rational_primes: dict[int, list[Any]] = {}
    validated_factor_power_hnfs: dict[tuple[int, int], list[Any]] = {}
    fallback_factor_powers: dict[tuple[int, int], Any] = {}
    source_relation_cache: dict[int, tuple[Any, ...]] = {}
    for relation in relations:
        coordinate = int(str(relation["generatorCoordinateZeroBased"]))
        if coordinate < 0 or coordinate >= len(invariants):
            raise ValueError("a class-generator coordinate is out of range")
        if coordinate in seen_coordinates:
            raise ValueError("a class-generator coordinate is duplicated")
        seen_coordinates.add(coordinate)
        factor_base_index = int(str(relation["factorBaseIndexZeroBased"]))
        if factor_base_index != int(str(selected_indices[coordinate])):
            raise ArithmeticError("the class generator and order relation disagree")
        claimed_order = _input_integer(relation["order"])
        if claimed_order != invariants[coordinate] or claimed_order <= 1:
            raise ArithmeticError("the class-generator order is not normalized")

        selected = selected_ideals[coordinate]
        prime = _input_integer(selected["prime"])
        prime_ideal = _ideal_from_prepared_descriptor(field, order, basis, selected)
        factor_ideal_cache[factor_base_index] = prime_ideal
        selected_hnf, selected_character = _validate_prime_hnf_lattice(
            selected, multiplication_table, validated_rational_primes
        )
        if factor_base_index not in factor_base_catalog:
            raise ValueError(
                "the selected generator is absent from the factor-base catalog"
            )
        if _prime_descriptor_identity(factor_base_catalog[factor_base_index]) != (
            _prime_descriptor_identity(selected)
        ):
            raise ArithmeticError("the selected generator changed catalog identity")
        factor_hnf_cache[factor_base_index] = selected_hnf
        factor_character_cache[factor_base_index] = selected_character
        factor_identity_cache[factor_base_index] = _prime_descriptor_identity(selected)

        coordinate_contributions: dict[int, Any] = {}
        factors = relation["factors"]
        for factor in factors:
            source_relation_index = int(str(factor["relationIndexZeroBased"]))
            source_relation_identity = (
                tuple(str(value) for value in factor["integralBasisCoordinates"]),
                tuple(
                    (
                        int(str(descriptor["factorBaseIndexZeroBased"])),
                        str(descriptor["exponent"]),
                    )
                    for descriptor in factor["primeIdealFactors"]
                ),
            )
            verify_source_relation = source_relation_index not in source_relation_cache
            if not verify_source_relation:
                if (
                    source_relation_cache[source_relation_index]
                    != source_relation_identity
                ):
                    raise ArithmeticError("a source relation changed identity")
            element_coordinates = [
                _input_integer(value) for value in factor["integralBasisCoordinates"]
            ]
            if all(coordinate == 0 for coordinate in element_coordinates):
                raise ArithmeticError("a class-generator witness factor is zero")
            outer_exponent = _input_integer(factor["exponent"])
            relation_norm = _input_integer(1)
            relation_indices: set[int] = set()
            for factor_reference in factor["primeIdealFactors"]:
                index = int(str(factor_reference["factorBaseIndexZeroBased"]))
                if index in relation_indices:
                    raise ValueError("a relation repeats a factor-base coordinate")
                relation_indices.add(index)
                inner_exponent = _input_integer(factor_reference["exponent"])
                if inner_exponent <= 0:
                    raise ValueError("an integral principal relation is not positive")
                if index not in factor_base_catalog:
                    raise ValueError(
                        "a relation references an unknown factor-base index"
                    )
                factor_descriptor = factor_base_catalog[index]
                identity = _prime_descriptor_identity(factor_descriptor)
                if index in factor_identity_cache:
                    if factor_identity_cache[index] != identity:
                        raise ArithmeticError(
                            "a factor-base descriptor changed identity"
                        )
                else:
                    factor_hnf, factor_character = _validate_prime_hnf_lattice(
                        factor_descriptor,
                        multiplication_table,
                        validated_rational_primes,
                    )
                    factor_hnf_cache[index] = factor_hnf
                    factor_character_cache[index] = factor_character
                    factor_identity_cache[index] = identity
                    if factor_character is None:
                        factor_ideal = _ideal_from_prepared_descriptor(
                            field, order, basis, factor_descriptor
                        )
                        factor_ideal_cache[index] = factor_ideal
                        rational_prime = int(str(factor_descriptor["prime"]))
                        if rational_prime not in factored_rational_primes:
                            factored_rational_primes[rational_prime] = list(
                                order.ideal(rational_prime).factor()
                            )
                        ramification = int(
                            str(factor_descriptor.get("ramification", 1))
                        )
                        if not any(
                            candidate == factor_ideal
                            and int(str(candidate_ramification)) == ramification
                            for candidate, candidate_ramification in factored_rational_primes[
                                rational_prime
                            ]
                        ):
                            raise ArithmeticError(
                                "a higher-degree factor-base descriptor is not prime"
                            )
                if verify_source_relation:
                    if inner_exponent == 1:
                        character = factor_character_cache[index]
                        if character is None:
                            in_factor_power = (
                                _element_from_prepared_coordinates(
                                    field,
                                    basis,
                                    factor["integralBasisCoordinates"],
                                )
                                in factor_ideal_cache[index]
                            )
                        else:
                            modulus = int(str(factor_descriptor["prime"]))
                            in_factor_power = (
                                sum(
                                    int(str(element_coordinates[i])) * character[i]
                                    for i in range(3)
                                )
                                % modulus
                                == 0
                            )
                    else:
                        power_key = (index, int(str(inner_exponent)))
                        if power_key not in exported_power_hnfs:
                            if index not in factor_ideal_cache:
                                factor_ideal_cache[index] = (
                                    _ideal_from_prepared_descriptor(
                                        field,
                                        order,
                                        basis,
                                        factor_descriptor,
                                    )
                                )
                            if power_key not in fallback_factor_powers:
                                fallback_factor_powers[power_key] = (
                                    factor_ideal_cache[index] ** inner_exponent
                                )
                            in_factor_power = (
                                _element_from_prepared_coordinates(
                                    field,
                                    basis,
                                    factor["integralBasisCoordinates"],
                                )
                                in fallback_factor_powers[power_key]
                            )
                        else:
                            power_hnf = exported_power_hnfs[power_key]
                            if power_key in validated_factor_power_hnfs:
                                if validated_factor_power_hnfs[power_key] != power_hnf:
                                    raise ArithmeticError(
                                        "a prime-power HNF changed identity"
                                    )
                            else:
                                _validate_prime_power_hnf_lattice(
                                    factor_hnf_cache[index],
                                    power_hnf,
                                    _input_integer(factor_descriptor["norm"]),
                                    int(str(inner_exponent)),
                                    multiplication_table,
                                )
                                validated_factor_power_hnfs[power_key] = power_hnf
                            in_factor_power = _coordinates_in_row_lattice(
                                element_coordinates,
                                validated_factor_power_hnfs[power_key],
                            )
                    if not in_factor_power:
                        raise ArithmeticError(
                            "a principal relation element is not in a claimed ideal power"
                        )
                    relation_norm *= (
                        _input_integer(factor_descriptor["norm"]) ** inner_exponent
                    )
                contribution = outer_exponent * inner_exponent
                if index not in coordinate_contributions:
                    coordinate_contributions[index] = contribution
                else:
                    coordinate_contributions[index] += contribution
            if verify_source_relation:
                if (
                    abs(
                        _norm_from_multiplication_table(
                            element_coordinates, multiplication_table
                        )
                    )
                    != relation_norm
                ):
                    raise ArithmeticError("an exported principal relation is false")
                source_relation_cache[source_relation_index] = source_relation_identity
        nonzero_contributions = {
            index: exponent
            for index, exponent in coordinate_contributions.items()
            if exponent != 0
        }
        if nonzero_contributions != {factor_base_index: claimed_order}:
            raise ArithmeticError("a class-generator principal relation is false")
        verified.append(
            {
                "generatorCoordinateZeroBased": coordinate,
                "factorBaseIndexZeroBased": factor_base_index,
                "order": int(str(claimed_order)),
                "prime": int(str(prime)),
                "norm": int(str(prime_ideal.norm())),
                "factorCount": len(factors),
                "hnfReplayed": True,
                "principalIdealEquality": True,
            }
        )
    if len(seen_coordinates) != len(invariants):
        raise ArithmeticError("not every invariant factor has an order witness")
    return {
        "schema": "sagejs.rust-class-group/generator-order-verification-v1",
        "inputId": prepared_input["inputId"],
        "authority": "independent-sagejs-ideal-arithmetic",
        "verifiedGeneratorCount": len(verified),
        "generators": verified,
    }


def _required_mapping(container: Any, key: str, owner: str) -> dict[str, Any]:
    if not isinstance(container, dict):
        raise TypeError(owner + " must be a dictionary")
    value = container.get(key)
    if not isinstance(value, dict):
        raise TypeError(owner + "." + key + " must be a dictionary")
    return value


def _required_sequence(container: Any, key: str, owner: str) -> list[Any]:
    if not isinstance(container, dict):
        raise TypeError(owner + " must be a dictionary")
    value = container.get(key)
    if not isinstance(value, list):
        raise TypeError(owner + "." + key + " must be a list")
    return value


def _prepared_input_matches_authoritative(
    prepared_input: dict[str, Any], authoritative: dict[str, Any]
) -> bool:
    supplied_preparation = _required_mapping(
        prepared_input, "preparation", "prepared input"
    )
    canonical_preparation = _required_mapping(
        authoritative, "preparation", "canonical prepared input"
    )
    # Early retained bundles used a different canonical JSON hashing pass and
    # a corpus label for `fieldId`.  Neither is mathematical authority: compare
    # every field and preparation value directly, excluding only the derived
    # source digest.  The Rust result is separately bound to the retained input
    # ID, so it cannot exchange evidence between retained bundles.
    supplied_preparation_body = {
        key: value
        for key, value in supplied_preparation.items()
        if key != "sourceSha256"
    }
    canonical_preparation_body = {
        key: value
        for key, value in canonical_preparation.items()
        if key != "sourceSha256"
    }
    return bool(
        prepared_input.get("schema") == authoritative["schema"]
        and prepared_input.get("field") == authoritative["field"]
        and supplied_preparation_body == canonical_preparation_body
        and prepared_input.get("containsOracleAnswers") is False
    )


def _nonnegative_json_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(str(value))
    except (TypeError, ValueError) as error:
        raise TypeError(name + " must be an integer") from error
    if str(answer) != str(value) or answer < 0:
        raise ValueError(name + " must be a canonical nonnegative integer")
    return answer


def _sha256_identifier(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.startswith("sha256:"):
        raise ValueError(name + " must be a sha256 identifier")
    digest = value[7:]
    if len(digest) != 64 or any(
        character not in "0123456789abcdef" for character in digest
    ):
        raise ValueError(name + " must contain a lowercase SHA-256 digest")
    return value


def _rust_result_digest(result: dict[str, Any]) -> str:
    try:
        canonical = json.dumps(
            result, sort_keys=True, separators=(",", ":"), allow_nan=False
        )
    except (TypeError, ValueError) as error:
        raise TypeError("the Rust result must be canonical JSON data") from error
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _validate_rust_candidate_shape(
    prepared_input: dict[str, Any], result: dict[str, Any]
) -> tuple[tuple[int, ...], dict[str, Any]]:
    """Validate lossless candidate data without accepting completion labels."""
    if not isinstance(prepared_input, dict) or not isinstance(result, dict):
        raise TypeError("prepared input and Rust result must be dictionaries")
    if prepared_input.get("schema") != _SCHEMA:
        raise ValueError("the prepared input has the wrong schema")
    if result.get("schema") != _RESULT_SCHEMA:
        raise ValueError("the Rust class/unit result has the wrong schema")
    prepared_input_id = _sha256_identifier(
        prepared_input.get("inputId"), "prepared input ID"
    )
    if result.get("inputId") != prepared_input_id:
        raise ValueError("the Rust result does not identify the prepared input")
    if result.get("usesOracleAsInput") is not False:
        raise ValueError("a Rust public candidate must not use an oracle as input")
    if result.get("usesClassGroupAnswersAsInput") is not False:
        raise ValueError(
            "a Rust public candidate must not use class-group answers as input"
        )
    for key in ("complete", "publicComplete", "public_complete"):
        if key in result:
            raise ValueError(
                "a producer cannot supply public completion state through " + key
            )
    if result.get("qualificationStatus") != _RESULT_QUALIFICATION_STATUS:
        raise ValueError("the Rust result has an unknown qualification status")
    if result.get("mathematicalBoundary") != _RESULT_BOUNDARY:
        raise ValueError("the Rust result has an unknown mathematical boundary")

    field_data = _required_mapping(prepared_input, "field", "prepared input")
    polynomial = _required_sequence(
        field_data, "coefficientsAscending", "prepared input.field"
    )
    result_polynomial = _required_sequence(result, "polynomialAscending", "result")
    if tuple(str(value) for value in result_polynomial) != tuple(
        str(value) for value in polynomial
    ):
        raise ArithmeticError("the Rust result changed the defining polynomial")

    analytic = _required_mapping(result, "analyticCompletion", "result")
    raw_invariants = _required_sequence(
        analytic, "candidateInvariantFactors", "result.analyticCompletion"
    )
    invariants = tuple(
        _nonnegative_json_integer(value, "candidate invariant")
        for value in raw_invariants
    )
    previous = 1
    for invariant in invariants:
        if invariant <= 1 or invariant % previous != 0:
            raise ValueError(
                "candidate invariants must exceed one and divide successively"
            )
        previous = invariant
    candidate_class_number = _nonnegative_json_integer(
        analytic.get("candidateClassNumber"), "candidate class number"
    )
    expected_class_number = 1
    for invariant in invariants:
        expected_class_number *= invariant
    if candidate_class_number != expected_class_number:
        raise ArithmeticError("candidate invariant factors have the wrong product")

    relations = _required_mapping(result, "relations", "result")
    relation_rows = _nonnegative_json_integer(relations.get("rows"), "relation rows")
    relation_columns = _nonnegative_json_integer(
        relations.get("columns"), "relation columns"
    )
    class_map = _required_mapping(result, "classMap", "result")
    coordinates = _required_sequence(
        class_map, "generatorMajorCoordinates", "result.classMap"
    )
    if len(coordinates) != relation_columns:
        raise ValueError("the class-map coordinate matrix has the wrong row count")
    for row in coordinates:
        if not isinstance(row, list) or len(row) != len(invariants):
            raise ValueError("a class-map coordinate row has the wrong width")
        for coordinate, invariant in zip(row, invariants, strict=True):
            normalized = _nonnegative_json_integer(coordinate, "class coordinate")
            if normalized >= invariant:
                raise ValueError("a class-map coordinate is not normalized")
    selected_indices = _required_sequence(
        class_map, "selectedGeneratorIndicesZeroBased", "result.classMap"
    )
    selected_ideals = _required_sequence(
        class_map, "selectedGeneratorPrimeIdeals", "result.classMap"
    )
    if len(selected_indices) != len(invariants) or len(selected_ideals) != len(
        invariants
    ):
        raise ValueError("the candidate does not have one ideal per invariant factor")
    seen_selected_indices: set[int] = set()
    for coordinate, (raw_index, _ideal) in enumerate(
        zip(selected_indices, selected_ideals, strict=True)
    ):
        index = _nonnegative_json_integer(raw_index, "selected generator index")
        if index >= relation_columns:
            raise ValueError("a selected class generator is outside the factor base")
        if index in seen_selected_indices:
            raise ValueError("the selected class-generator indices are not distinct")
        seen_selected_indices.add(index)
        expected_row = [
            1 if position == coordinate else 0 for position in range(len(invariants))
        ]
        actual_row = [
            _nonnegative_json_integer(value, "selected generator coordinate")
            for value in coordinates[index]
        ]
        if actual_row != expected_row:
            raise ArithmeticError(
                "a selected ideal is not the normalized standard invariant generator"
            )

    return invariants, {
        "artifactSha256": _rust_result_digest(result),
        "candidateClassNumber": candidate_class_number,
        "candidateInvariantFactors": list(invariants),
        "relationRows": relation_rows,
        "relationColumns": relation_columns,
    }


def adapt_rust_prepared_cubic_class_unit_result(
    field: Any,
    prepared_input: dict[str, Any],
    result: dict[str, Any],
) -> Any:
    """Return the narrow honest public record for a prepared-cubic bundle.

    The Rust bundle is treated as an untrusted candidate.  This adapter binds it
    to a freshly prepared representation of `field`, independently replays all
    available class-generator order witnesses, and checks the lossless finite
    presentation metadata.  The current bundle still lacks evidence required
    by the existing complete public class and unit types, so the result is an
    ordinary incomplete `ClassUnitComputation`; no parallel result hierarchy or
    weaker `IdealClassGroup` is introduced.
    """
    authoritative = prepare_cubic_for_rust(field)
    if not _prepared_input_matches_authoritative(prepared_input, authoritative):
        raise ValueError("the prepared Rust input is not the canonical field export")
    invariants, diagnostics = _validate_rust_candidate_shape(prepared_input, result)
    generator_verification = verify_rust_class_generator_orders(
        field, prepared_input, result
    )
    if (
        generator_verification.get("schema")
        != "sagejs.rust-class-group/generator-order-verification-v1"
        or generator_verification.get("inputId") != prepared_input["inputId"]
        or generator_verification.get("authority")
        != "independent-sagejs-ideal-arithmetic"
        or generator_verification.get("verifiedGeneratorCount") != len(invariants)
    ):
        raise ArithmeticError("the independent class-generator replay is incomplete")
    verified_generators = generator_verification.get("generators")
    if not isinstance(verified_generators, list) or len(verified_generators) != len(
        invariants
    ):
        raise ArithmeticError("the independent class-generator receipt is malformed")
    seen_coordinates: set[int] = set()
    for generator in verified_generators:
        if not isinstance(generator, dict):
            raise TypeError("an independently verified generator must be a dictionary")
        coordinate = _nonnegative_json_integer(
            generator.get("generatorCoordinateZeroBased"),
            "verified generator coordinate",
        )
        if coordinate >= len(invariants) or coordinate in seen_coordinates:
            raise ArithmeticError(
                "the independent generator coordinates are incomplete"
            )
        seen_coordinates.add(coordinate)
        if (
            _nonnegative_json_integer(
                generator.get("order"), "verified generator order"
            )
            != (invariants[coordinate])
        ):
            raise ArithmeticError("an independent generator order changed")
        if (
            generator.get("hnfReplayed") is not True
            or generator.get("principalIdealEquality") is not True
        ):
            raise ArithmeticError("an independent generator relation did not replay")

    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    gaps = list(_PUBLIC_RESULT_EVIDENCE_GAPS)
    diagnostics.update(
        {
            "schema": "sagejs.rust-class-group/public-adapter-diagnostics-v1",
            "inputId": authoritative["inputId"],
            "producerInputId": prepared_input["inputId"],
            "candidateOnly": True,
            "producerQualificationStatus": result["qualificationStatus"],
            "generatorOrderVerification": generator_verification,
            "remainingEvidenceGaps": gaps,
        }
    )
    stages = (
        groups.ClassUnitStage(
            "rust-prepared-cubic-candidate",
            "complete",
            {
                "inputId": authoritative["inputId"],
                "producerInputId": prepared_input["inputId"],
                "artifactSha256": diagnostics["artifactSha256"],
                "verifiedGeneratorCount": len(invariants),
            },
        ),
        groups.ClassUnitStage(
            "public-class-unit-certification",
            "incomplete",
            {"missingEvidence": gaps},
        ),
    )
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason=(
            "the Rust prepared-cubic candidate replayed, but the standard Sage.js "
            "class-map and unit-saturation completion evidence is absent"
        ),
        algorithm="rust-prepared-cubic-experimental",
        stages=stages,
        tentative_invariants=invariants,
        diagnostics=diagnostics,
    )


__all__ = [
    "adapt_rust_prepared_cubic_class_unit_result",
    "prepare_cubic_for_rust",
    "verify_rust_class_generator_orders",
]
