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


class SparseCharacteristicPolynomialCertificate:
    """An exact integer characteristic polynomial reconstructed sparsely.

    A modular record uses the fast full-degree Wiedemann proof when the action
    is cyclic.  Otherwise it obtains all power traces by sparse basis-vector
    propagation and applies Newton's identities over a prime larger than the
    dimension.  The latter route is slower but proves the characteristic
    polynomial for arbitrary multiplicities without dense materialization.
    CRT reconstruction is unique once the product of the recorded primes
    exceeds twice the rigorous row-norm coefficient bound.
    """

    def __init__(
        self,
        dimension: int,
        row_norm_bound: int,
        coefficient_bound: Any,
        modulus_product: Any,
        coefficients: list[Any],
        prime_records: list[Any],
        prime_trials: int,
        matrix_vector_products: int,
    ) -> None:
        self._dimension = dimension
        self._row_norm_bound = row_norm_bound
        self._coefficient_bound = sage.ZZ(coefficient_bound)
        self._modulus_product = sage.ZZ(modulus_product)
        self._coefficients = tuple(sage.ZZ(value) for value in coefficients)
        self._prime_records = tuple(prime_records)
        self._prime_trials = prime_trials
        self._matrix_vector_products = matrix_vector_products
        runtime.object.freeze(self)

    def degree(self) -> int:
        return self._dimension

    def coefficients(self) -> tuple[Any, ...]:
        return self._coefficients

    def is_exact(self) -> bool:
        return True

    def polynomial(self, variable: str = "x") -> Any:
        ring = _global("PolynomialRing")(sage.ZZ, variable)
        return ring(list(self._coefficients))

    def modulus_product(self) -> Any:
        return self._modulus_product

    def coefficient_bound(self) -> Any:
        return self._coefficient_bound

    def verify(self, operator: Any) -> bool:
        """Replay every modular recurrence and the exact CRT reconstruction."""
        dimension = _machine_integer(operator.nrows(), "operator dimension")
        if dimension != self._dimension or dimension != _machine_integer(
            operator.ncols(), "operator dimension"
        ):
            return False
        row_norm = _operator_row_norm_bound(operator)
        if row_norm != self._row_norm_bound:
            return False
        if sage.ZZ(1 + row_norm) ** dimension != self._coefficient_bound:
            return False
        residues = [0 for _index in range(dimension + 1)]
        modulus_product = 1
        for record in self._prime_records:
            prime, seed, projection_count, method, expected = record
            if method == "cyclic-wiedemann":
                coefficients, _products = _full_degree_modular_characteristic(
                    operator,
                    int(prime),
                    int(seed),
                    int(projection_count),
                    None,
                )
            elif method == "trace-newton":
                coefficients, _products = _trace_newton_modular_characteristic(
                    operator, int(prime), None
                )
            else:
                return False
            if coefficients is None or tuple(coefficients) != expected:
                return False
            residues, modulus_product = _crt_polynomial_update(
                residues, modulus_product, coefficients, int(prime)
            )
        if sage.ZZ(modulus_product) != self._modulus_product:
            return False
        if self._modulus_product <= 2 * self._coefficient_bound:
            return False
        reconstructed = _symmetric_crt_coefficients(residues, modulus_product)
        if tuple(sage.ZZ(value) for value in reconstructed) != self._coefficients:
            return False
        if len(self._coefficients) != dimension + 1:
            return False
        if self._coefficients[-1] != 1:
            return False
        if any(abs(value) > self._coefficient_bound for value in self._coefficients):
            return False
        row_sums = operator.row_sums()
        if len(row_sums) != 0 and all(value == row_sums[0] for value in row_sums):
            if _integer_polynomial_value(self._coefficients, row_sums[0]) != 0:
                return False
        return True

    def structural_data(self) -> dict[str, Any]:
        return {
            "algorithm": "hybrid-wiedemann-trace-newton-crt",
            "dimension": self._dimension,
            "row_norm_bound": self._row_norm_bound,
            "coefficient_bound": self._coefficient_bound,
            "modulus_product": self._modulus_product,
            "coefficients_ascending": self._coefficients,
            "prime_records": self._prime_records,
            "prime_trials": self._prime_trials,
            "matrix_vector_products": self._matrix_vector_products,
            "exact": True,
        }

    def __repr__(self) -> str:
        return (
            "exact sparse characteristic-polynomial certificate of degree "
            + str(self._dimension)
            + " from "
            + str(len(self._prime_records))
            + " CRT primes"
        )

    __str__ = __repr__
    toString = __repr__


def _operator_row_norm_bound(operator: Any) -> int:
    bound = 0
    for row_index in range(operator.nrows()):
        total = 0
        for _column, value in operator.row(row_index):
            total += abs(int(value))
        bound = max(bound, total)
    return bound


def _integer_polynomial_value(coefficients: tuple[Any, ...], argument: int) -> Any:
    answer = sage.ZZ(0)
    value = sage.ZZ(argument)
    for coefficient in reversed(coefficients):
        answer = answer * value + coefficient
    return answer


def _next_word_prime(at_least: int) -> int:
    candidate = max(3, int(at_least))
    if candidate % 2 == 0:
        candidate += 1
    while candidate <= _MAX_WORD_PRIME:
        if bool(sage.is_prime(candidate)):
            return candidate
        candidate += 2
    raise MemoryError("the sparse CRT prime range was exhausted")


def _full_degree_modular_characteristic(
    operator: Any,
    prime: int,
    seed: int,
    projection_limit: int,
    product_limit: int | None,
) -> tuple[list[int] | None, int]:
    """Return the modular characteristic polynomial when full degree is proved."""
    dimension = int(operator.nrows())
    sequence_length = 2 * dimension + 8
    candidate = [1]
    products = 0
    for projection_index in range(projection_limit):
        if product_limit is not None and products + sequence_length > product_limit:
            raise MemoryError("sparse characteristic-polynomial work limit exceeded")
        left = _deterministic_vector(dimension, prime, seed, 2 * projection_index)
        right = _deterministic_vector(dimension, prime, seed, 2 * projection_index + 1)
        sequence = _sequence(operator, left, right, sequence_length, prime)
        products += sequence_length
        recurrence = list(berlekamp_massey(sequence, prime))
        candidate = _polynomial_lcm(candidate, recurrence, prime)
        if len(candidate) - 1 == dimension:
            return (candidate, products)
    return (None, products)


def _trace_newton_modular_characteristic(
    operator: Any,
    prime: int,
    product_limit: int | None,
) -> tuple[list[int], int]:
    """Prove the modular characteristic polynomial from sparse power traces."""
    dimension = int(operator.nrows())
    if prime <= dimension:
        raise ValueError(
            "trace--Newton characteristic primes must exceed the dimension"
        )
    required_products = dimension * dimension
    if product_limit is not None and required_products > product_limit:
        raise MemoryError("sparse characteristic-polynomial work limit exceeded")

    traces = [0 for _index in range(dimension + 1)]
    for basis_index in range(dimension):
        vector = [0 for _index in range(dimension)]
        vector[basis_index] = 1
        for power in range(1, dimension + 1):
            vector = _matvec(operator, vector, prime)
            traces[power] = (traces[power] + vector[basis_index]) % prime

    # If det(xI-A)=x^n+c_1*x^(n-1)+...+c_n and s_k=tr(A^k),
    # Newton's identities give k*c_k + sum(c_(k-i)*s_i)=0.
    descending = [1]
    for degree in range(1, dimension + 1):
        total = 0
        for power in range(1, degree + 1):
            total = (total + descending[degree - power] * traces[power]) % prime
        descending.append((-total * pow(degree, prime - 2, prime)) % prime)
    return (list(reversed(descending)), required_products)


def _crt_polynomial_update(
    residues: list[int],
    modulus_product: int,
    coefficients: list[int],
    prime: int,
) -> tuple[list[int], int]:
    if len(residues) != len(coefficients):
        raise ValueError("CRT polynomial degrees differ")
    inverse = pow(modulus_product % prime, prime - 2, prime)
    answer = []
    for index, residue in enumerate(residues):
        correction = (coefficients[index] - residue % prime) % prime
        answer.append(residue + modulus_product * (correction * inverse % prime))
    return (answer, modulus_product * prime)


def _symmetric_crt_coefficients(residues: list[int], modulus_product: int) -> list[Any]:
    midpoint = modulus_product // 2
    return [
        sage.ZZ(value - modulus_product if value > midpoint else value)
        for value in residues
    ]


def sparse_characteristic_polynomial_certificate(
    operator: Any,
    *,
    seed: Any = 0,
    projections_per_prime: Any = 4,
    first_prime: Any = 1000003,
    max_prime_trials: Any = 64,
    max_matrix_vector_products: Any = 10000000,
) -> SparseCharacteristicPolynomialCertificate:
    """Return an exact integer characteristic polynomial from sparse matvecs.

    At each modular prime, deterministic projected Wiedemann first attempts a
    full-degree recurrence.  If multiplicities prevent a cyclic proof, sparse
    power traces and Newton's identities provide a universal exact fallback.
    The result fails closed if the explicit prime or matvec budget expires
    before the CRT modulus exceeds twice the rigorous coefficient bound.
    """
    dimension = _machine_integer(operator.nrows(), "operator dimension")
    if dimension != _machine_integer(operator.ncols(), "operator dimension"):
        raise ValueError("a characteristic polynomial requires a square operator")
    source_seed = _machine_integer(seed, "characteristic-polynomial seed")
    projection_limit = _positive(projections_per_prime, "projections per CRT prime")
    trial_limit = _positive(max_prime_trials, "CRT prime trial limit")
    product_limit = _positive(max_matrix_vector_products, "matrix-vector product limit")
    initial_prime = _positive(first_prime, "first CRT prime")
    row_norm = _operator_row_norm_bound(operator)
    coefficient_bound = sage.ZZ(1 + row_norm) ** dimension
    if dimension == 0:
        return SparseCharacteristicPolynomialCertificate(
            0, row_norm, coefficient_bound, 3, [1], [], 0, 0
        )

    residues = [0 for _index in range(dimension + 1)]
    modulus_product = 1
    prime_records = []
    products = 0
    trials = 0
    next_candidate = max(initial_prime, dimension + 2)
    while modulus_product <= 2 * coefficient_bound and trials < trial_limit:
        prime = _next_word_prime(next_candidate)
        next_candidate = prime + 2
        trial_seed = source_seed + 1000003 * trials
        remaining_products = product_limit - products
        if remaining_products <= 0:
            raise MemoryError("sparse characteristic-polynomial work limit exceeded")
        coefficients, used = _full_degree_modular_characteristic(
            operator,
            prime,
            trial_seed,
            projection_limit,
            remaining_products,
        )
        products += used
        trials += 1
        if coefficients is None:
            remaining_products = product_limit - products
            coefficients, used = _trace_newton_modular_characteristic(
                operator, prime, remaining_products
            )
            products += used
            method = "trace-newton"
        else:
            method = "cyclic-wiedemann"
        residues, modulus_product = _crt_polynomial_update(
            residues, modulus_product, coefficients, prime
        )
        prime_records.append(
            (prime, trial_seed, projection_limit, method, tuple(coefficients))
        )
    if modulus_product <= 2 * coefficient_bound:
        raise ArithmeticError(
            "full-degree modular recurrences did not provide enough CRT precision"
        )
    coefficients = _symmetric_crt_coefficients(residues, modulus_product)
    certificate = SparseCharacteristicPolynomialCertificate(
        dimension,
        row_norm,
        coefficient_bound,
        modulus_product,
        coefficients,
        prime_records,
        trials,
        products,
    )
    if not certificate.verify(operator):
        raise ArithmeticError(
            "sparse characteristic-polynomial certificate failed replay"
        )
    return certificate


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
    "SparseCharacteristicPolynomialCertificate",
    "SparseWiedemannCertificate",
    "berlekamp_massey",
    "sparse_characteristic_polynomial_certificate",
    "sparse_wiedemann_certificate",
]
