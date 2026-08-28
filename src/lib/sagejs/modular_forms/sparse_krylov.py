"""Verified sparse Krylov algorithms for exact Hecke operators.

The arithmetic in this module is deliberately ordinary Python over canonical
integer residues. It is therefore a portable reference implementation for
Node.js, browsers, and CPython. A projected Wiedemann recurrence is only a
candidate; `proof="basis"` accepts it as the operator minimal polynomial only
after applying the candidate to every standard basis vector.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_MAX_WORD_PRIME = 67108859


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _machine_integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _word_prime(value: Any) -> int:
    modulus = _machine_integer(value, "Krylov modulus")
    if modulus < 2 or modulus > _MAX_WORD_PRIME or not bool(sage.is_prime(modulus)):
        raise ValueError(
            "the Krylov modulus must be prime and at most " + str(_MAX_WORD_PRIME)
        )
    return modulus


def _positive(value: Any, label: str) -> int:
    answer = _machine_integer(value, label)
    if answer <= 0:
        raise ValueError(label + " must be positive")
    return answer


def _normalize_polynomial(values: list[int], modulus: int) -> list[int]:
    answer = [value % modulus for value in values]
    while len(answer) > 1 and answer[-1] == 0:
        answer.pop()
    if len(answer) == 0:
        return [0]
    return answer


def _monic(values: list[int], modulus: int) -> list[int]:
    answer = _normalize_polynomial(values, modulus)
    if answer == [0]:
        return answer
    inverse = pow(answer[-1], modulus - 2, modulus)
    return [(value * inverse) % modulus for value in answer]


def _polynomial_product(left: list[int], right: list[int], modulus: int) -> list[int]:
    if left == [0] or right == [0]:
        return [0]
    answer = [0 for _index in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            answer[left_index + right_index] = (
                answer[left_index + right_index] + left_value * right_value
            ) % modulus
    return _normalize_polynomial(answer, modulus)


def _polynomial_divmod(
    numerator: list[int], denominator: list[int], modulus: int
) -> tuple[list[int], list[int]]:
    source = _normalize_polynomial(numerator, modulus)
    divisor = _normalize_polynomial(denominator, modulus)
    if divisor == [0]:
        raise ZeroDivisionError("polynomial division by zero")
    if len(source) < len(divisor):
        return ([0], source)
    quotient = [0 for _index in range(len(source) - len(divisor) + 1)]
    inverse = pow(divisor[-1], modulus - 2, modulus)
    while source != [0] and len(source) >= len(divisor):
        shift = len(source) - len(divisor)
        coefficient = source[-1] * inverse % modulus
        quotient[shift] = coefficient
        for index, value in enumerate(divisor):
            source[index + shift] = (
                source[index + shift] - coefficient * value
            ) % modulus
        source = _normalize_polynomial(source, modulus)
    return (_normalize_polynomial(quotient, modulus), source)


def _polynomial_gcd(left: list[int], right: list[int], modulus: int) -> list[int]:
    first = _normalize_polynomial(left, modulus)
    second = _normalize_polynomial(right, modulus)
    while second != [0]:
        _quotient, remainder = _polynomial_divmod(first, second, modulus)
        first, second = second, remainder
    return _monic(first, modulus)


def _polynomial_lcm(left: list[int], right: list[int], modulus: int) -> list[int]:
    if left == [0] or right == [0]:
        return [0]
    common = _polynomial_gcd(left, right, modulus)
    quotient, remainder = _polynomial_divmod(left, common, modulus)
    if remainder != [0]:
        raise ArithmeticError("polynomial gcd did not divide its input")
    return _monic(_polynomial_product(quotient, right, modulus), modulus)


def _polynomial_value(values: list[int], argument: int, modulus: int) -> int:
    answer = 0
    for coefficient in reversed(values):
        answer = (answer * argument + coefficient) % modulus
    return answer


def berlekamp_massey(sequence: Any, modulus: Any) -> tuple[int, ...]:
    r"""Return the ascending monic recurrence polynomial of `sequence`.

    The input and output coefficients are canonical integer residues. If the
    answer is $a_0+\cdots+a_d x^d$, then every covered window satisfies
    $\sum_{i=0}^d a_i s_{k+i}=0$.
    """
    prime = _word_prime(modulus)
    values = [_machine_integer(value, "sequence entry") % prime for value in sequence]
    connection = [1]
    previous = [1]
    length = 0
    shift = 1
    last_discrepancy = 1
    for position in range(len(values)):
        discrepancy = values[position]
        for index in range(1, length + 1):
            discrepancy = (
                discrepancy + connection[index] * values[position - index]
            ) % prime
        if discrepancy == 0:
            shift += 1
            continue
        old_connection = list(connection)
        multiplier = discrepancy * pow(last_discrepancy, prime - 2, prime) % prime
        needed = len(previous) + shift
        while len(connection) < needed:
            connection.append(0)
        for index, value in enumerate(previous):
            connection[index + shift] = (
                connection[index + shift] - multiplier * value
            ) % prime
        if 2 * length <= position:
            length = position + 1 - length
            previous = old_connection
            last_discrepancy = discrepancy
            shift = 1
        else:
            shift += 1
    connection = connection[: length + 1]
    ascending = [connection[length - index] for index in range(length)] + [1]
    answer = _monic(ascending, prime)
    for start in range(len(values) - len(answer) + 1):
        total = 0
        for index, coefficient in enumerate(answer):
            total = (total + coefficient * values[start + index]) % prime
        if total != 0:
            raise ArithmeticError("Berlekamp--Massey recurrence failed exact replay")
    return tuple(answer)


def _deterministic_vector(
    dimension: int, modulus: int, seed: int, stream: int
) -> list[int]:
    if dimension == 0:
        return []
    state = (seed + 104729 * (stream + 1) + 1) % modulus
    answer = []
    for index in range(dimension):
        state = (48271 * state + 2 * index + 1) % modulus
        answer.append(1 + state % (modulus - 1) if modulus > 2 else 1)
    return answer


def _matvec(operator: Any, vector: list[int], modulus: int) -> list[int]:
    dimension = operator.nrows()
    if len(vector) != operator.ncols():
        raise ValueError("vector length does not match the sparse operator")
    answer = [0 for _index in range(dimension)]
    for row in range(dimension):
        total = 0
        for column, coefficient in operator.row(row):
            total = (total + coefficient * vector[column]) % modulus
        answer[row] = total
    return answer


def _dot(left: list[int], right: list[int], modulus: int) -> int:
    if len(left) != len(right):
        raise ValueError("Krylov projection vectors have different lengths")
    total = 0
    for index, left_value in enumerate(left):
        total = (total + left_value * right[index]) % modulus
    return total


def _sequence(
    operator: Any,
    left: list[int],
    right: list[int],
    length: int,
    modulus: int,
) -> list[int]:
    vector = list(right)
    answer = []
    for _index in range(length):
        answer.append(_dot(left, vector, modulus))
        vector = _matvec(operator, vector, modulus)
    return answer


def _polynomial_apply(
    operator: Any, coefficients: list[int], vector: list[int], modulus: int
) -> list[int]:
    answer = [0 for _index in range(operator.nrows())]
    for coefficient in reversed(coefficients):
        answer = _matvec(operator, answer, modulus)
        if coefficient != 0:
            for index, value in enumerate(vector):
                answer[index] = (answer[index] + coefficient * value) % modulus
    return answer


def _is_zero(vector: list[int]) -> bool:
    for value in vector:
        if value != 0:
            return False
    return True


class SparseWiedemannCertificate:
    """Immutable record of a sparse projected Krylov computation."""

    def __init__(
        self,
        modulus: int,
        dimension: int,
        seed: int,
        coefficients: list[int],
        projections: list[Any],
        replay_vectors: list[Any],
        exact_basis_vectors: int,
        matrix_vector_products: int,
    ) -> None:
        self._modulus = modulus
        self._dimension = dimension
        self._seed = seed
        self._coefficients = tuple(coefficients)
        self._projections = tuple(projections)
        self._replay_vectors = tuple(replay_vectors)
        self._exact_basis_vectors = exact_basis_vectors
        self._matrix_vector_products = matrix_vector_products
        runtime.object.freeze(self)

    def modulus(self) -> int:
        return self._modulus

    def degree(self) -> int:
        return len(self._coefficients) - 1

    def coefficients(self) -> tuple[int, ...]:
        return self._coefficients

    def is_exact(self) -> bool:
        return self._exact_basis_vectors == self._dimension

    def verification_basis_rank(self) -> int:
        return self._exact_basis_vectors

    def polynomial(self, variable: str = "x") -> Any:
        field = _global("GF")(self._modulus)
        ring = _global("PolynomialRing")(field, variable)
        return ring([field(value) for value in self._coefficients])

    def structural_data(self) -> dict[str, Any]:
        return {
            "algorithm": "deterministic-projected-wiedemann",
            "modulus": self._modulus,
            "dimension": self._dimension,
            "seed": self._seed,
            "coefficients_ascending": self._coefficients,
            "projection_records": self._projections,
            "replay_vectors": self._replay_vectors,
            "verification_basis_rank": self._exact_basis_vectors,
            "exact": self.is_exact(),
            "matrix_vector_products": self._matrix_vector_products,
        }

    def __repr__(self) -> str:
        strength = "exact" if self.is_exact() else "projection-verified candidate"
        return (
            strength
            + " sparse Wiedemann certificate of degree "
            + str(self.degree())
            + " over GF("
            + str(self._modulus)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


def sparse_wiedemann_certificate(
    operator: Any,
    modulus: Any,
    *,
    seed: Any = 0,
    projections: Any = 8,
    replay_count: Any = 2,
    proof: str = "basis",
    max_verification_work: Any = 50000000,
) -> SparseWiedemannCertificate:
    """Compute and verify a sparse Wiedemann minimal-polynomial candidate.

    With `proof="basis"` (the default), the function returns only after the
    candidate annihilates every standard basis vector, which proves that it is
    the exact operator minimal polynomial because each projected recurrence
    divides that polynomial. `proof="replay"` is an explicitly nonexact
    diagnostic mode: it checks independent deterministic vectors and labels
    the returned certificate accordingly.
    """
    prime = _word_prime(modulus)
    source_seed = _machine_integer(seed, "Krylov seed")
    projection_limit = _positive(projections, "projection count")
    replay_limit = _positive(replay_count, "replay count")
    work_limit = _positive(max_verification_work, "verification work limit")
    if proof not in ["basis", "replay"]:
        raise ValueError("Krylov proof must be 'basis' or 'replay'")
    dimension = _machine_integer(operator.nrows(), "operator dimension")
    if dimension != _machine_integer(operator.ncols(), "operator dimension"):
        raise ValueError("Wiedemann requires a square sparse operator")
    if dimension == 0:
        return SparseWiedemannCertificate(prime, 0, source_seed, [1], [], [], 0, 0)

    sequence_length = 2 * dimension + 8
    candidate = [1]
    projection_records = []
    products = 0
    exact_basis_vectors = 0
    replay_records = []
    for projection_index in range(projection_limit):
        left = _deterministic_vector(
            dimension, prime, source_seed, 2 * projection_index
        )
        right = _deterministic_vector(
            dimension, prime, source_seed, 2 * projection_index + 1
        )
        values = _sequence(operator, left, right, sequence_length, prime)
        products += sequence_length
        recurrence = list(berlekamp_massey(values, prime))
        candidate = _polynomial_lcm(candidate, recurrence, prime)
        projection_records.append(
            (
                tuple(left),
                tuple(right),
                tuple(values),
                tuple(recurrence),
            )
        )

        hecke_index = operator.hecke_index()
        if (
            hecke_index is not None
            and _polynomial_value(candidate, (int(hecke_index) + 1) % prime, prime) != 0
        ):
            continue

        replay_records = []
        replay_ok = True
        for replay_index in range(replay_limit):
            vector = _deterministic_vector(
                dimension,
                prime,
                source_seed,
                2 * projection_limit + replay_index,
            )
            residual = _polynomial_apply(operator, candidate, vector, prime)
            products += len(candidate) - 1
            replay_records.append((tuple(vector), tuple(residual)))
            if not _is_zero(residual):
                replay_ok = False
        if not replay_ok:
            continue
        if proof == "replay":
            return SparseWiedemannCertificate(
                prime,
                dimension,
                source_seed,
                candidate,
                projection_records,
                replay_records,
                0,
                products,
            )

        estimated_work = (
            dimension
            * (len(candidate) - 1)
            * max(1, _machine_integer(operator.nonzero_count(), "nonzero count"))
        )
        if estimated_work > work_limit:
            raise MemoryError(
                "exact Krylov verification needs at most "
                + str(estimated_work)
                + " sparse multiply-adds, above the explicit limit "
                + str(work_limit)
            )
        exact_basis_vectors = 0
        for basis_index in range(dimension):
            vector = [0 for _index in range(dimension)]
            vector[basis_index] = 1
            residual = _polynomial_apply(operator, candidate, vector, prime)
            products += len(candidate) - 1
            if not _is_zero(residual):
                break
            exact_basis_vectors += 1
        if exact_basis_vectors == dimension:
            return SparseWiedemannCertificate(
                prime,
                dimension,
                source_seed,
                candidate,
                projection_records,
                replay_records,
                exact_basis_vectors,
                products,
            )

    raise ArithmeticError(
        "deterministic Wiedemann projections did not recover an annihilating polynomial"
    )


__all__ = [
    "SparseWiedemannCertificate",
    "berlekamp_massey",
    "sparse_wiedemann_certificate",
]
