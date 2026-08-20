"""Bounded exact algorithms for finite hyperelliptic Jacobian groups.

The algorithms in this module use only the public additive-group operations.
They deliberately have explicit resource limits: exhaustive enumeration is a
useful correctness fallback for small finite fields, but it is not a disguised
large-scale discrete-log algorithm.

The sampled primary-basis implementation follows Andrew Sutherland's
Algorithms 9.1/9.2 and recursive finite-abelian-p-group discrete logarithm.
Its organization is also informed by SageMath's GPL implementation in
`sage.groups.additive_abelian.additive_abelian_wrapper`.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage


class JacobianResourceLimitError(RuntimeError):
    """A requested exact group computation exceeded its declared budget."""

    def __init__(
        self,
        message: str,
        *,
        known_structure: Any = None,
        partial_generators: Any = None,
        diagnostics: Any = None,
    ) -> None:
        super().__init__(message)
        self.known_structure = known_structure
        self.partial_generators = partial_generators
        self.diagnostics = diagnostics


def _checked_integer(value: Any, name: str) -> int:
    """Return one exact ordinary integer, rejecting lossy coercions."""
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


def _valuation(value: int, prime: int) -> int:
    exponent = 0
    while value and value % prime == 0:
        value //= prime
        exponent += 1
    return exponent


def _integer_xgcd(left: int, right: int) -> tuple[int, int, int]:
    old_r, current_r = left, right
    old_s, current_s = 1, 0
    old_t, current_t = 0, 1
    while current_r:
        quotient = old_r // current_r
        old_r, current_r = current_r, old_r - quotient * current_r
        old_s, current_s = current_s, old_s - quotient * current_s
        old_t, current_t = current_t, old_t - quotient * current_t
    if old_r < 0:
        return -old_r, -old_s, -old_t
    return old_r, old_s, old_t


class GroupOperationBudget:
    """Deterministic accounting for bounded generic-group computations."""

    def __init__(
        self,
        max_group_operations: Any = 10_000_000,
        max_baby_steps: Any = 1_000_000,
        max_memory_bytes: Any = 256 * 1024 * 1024,
        scalar_algorithm: str = "auto",
    ) -> None:
        self.max_group_operations = _checked_integer(
            max_group_operations, "max_group_operations"
        )
        self.max_baby_steps = _checked_integer(max_baby_steps, "max_baby_steps")
        self.max_memory_bytes = _checked_integer(max_memory_bytes, "max_memory_bytes")
        if (
            self.max_group_operations < 0
            or self.max_baby_steps < 0
            or self.max_memory_bytes < 0
        ):
            raise ValueError("group resource limits must be nonnegative")
        if scalar_algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown scalar algorithm " + repr(scalar_algorithm))
        self.scalar_algorithm = scalar_algorithm
        self.group_operations = 0
        self.baby_steps = 0
        self.peak_table_entries = 0

    def diagnostics(self) -> dict[str, int]:
        return {
            "group_operations": self.group_operations,
            "baby_steps": self.baby_steps,
            "peak_table_entries": self.peak_table_entries,
            "max_group_operations": self.max_group_operations,
            "max_baby_steps": self.max_baby_steps,
            "max_memory_bytes": self.max_memory_bytes,
        }

    def _consume(self, count: int) -> None:
        if count < 0 or self.group_operations + count > self.max_group_operations:
            raise JacobianResourceLimitError(
                "group computation exceeds max_group_operations="
                + str(self.max_group_operations),
                diagnostics=self.diagnostics(),
            )
        self.group_operations += count

    def reserve_table(self, entries: int) -> None:
        if entries < 0 or self.baby_steps + entries > self.max_baby_steps:
            raise JacobianResourceLimitError(
                "vector discrete log exceeds max_baby_steps="
                + str(self.max_baby_steps),
                diagnostics=self.diagnostics(),
            )
        # A canonical Mumford key, coordinate vector, and dictionary overhead
        # are conservatively accounted as 512 bytes per entry.
        if entries * 512 > self.max_memory_bytes:
            raise JacobianResourceLimitError(
                "vector discrete log exceeds max_memory_bytes="
                + str(self.max_memory_bytes),
                diagnostics=self.diagnostics(),
            )
        self.baby_steps += entries
        if entries > self.peak_table_entries:
            self.peak_table_entries = entries

    def add(self, left: Any, right: Any) -> Any:
        self._consume(1)
        return left + right

    def negate(self, value: Any) -> Any:
        return -value

    def scalar(self, scalar: Any, element: Any) -> Any:
        integer = _checked_integer(scalar, "group scalar")
        magnitude = -integer if integer < 0 else integer
        bits = 0
        work = magnitude
        while work:
            work //= 2
            bits += 1
        estimate = max(1, 2 * bits)
        self._consume(estimate)
        if hasattr(element, "scalar_multiple"):
            return element.scalar_multiple(
                integer,
                algorithm=self.scalar_algorithm,
                max_group_operations=max(2, estimate),
            )
        return integer * element


def factor_integer_bounded(
    value: Any,
    max_trial_divisions: int = 1_000_000,
) -> list[tuple[Any, int]]:
    """Factor a positive integer by trial division within an explicit budget.

    This is intended for small fallback workloads. Production-sized orders
    should be factored by Sage.js's integer-factorization service and passed to
    the group algorithms explicitly.
    """
    value = _checked_integer(value, "the integer to factor")
    max_trial_divisions = _checked_integer(max_trial_divisions, "max_trial_divisions")
    if value <= 0:
        raise ValueError("the integer to factor must be positive")
    if max_trial_divisions < 0:
        raise ValueError("max_trial_divisions must be nonnegative")

    remaining = value
    divisor = 2
    trials = 0
    answer: list[tuple[Any, int]] = []
    while divisor * divisor <= remaining:
        if trials >= max_trial_divisions:
            raise JacobianResourceLimitError(
                "integer factorization exceeded max_trial_divisions="
                + str(max_trial_divisions)
            )
        trials += 1
        exponent = 0
        while remaining % divisor == 0:
            remaining //= divisor
            exponent += 1
        if exponent:
            answer.append((divisor, exponent))
        divisor = 3 if divisor == 2 else divisor + 2
    if remaining > 1:
        answer.append((remaining, 1))
    return answer


def validate_factorization(
    value: Any,
    factorization: list[tuple[Any, int]],
) -> list[tuple[Any, int]]:
    """Validate prime bases, exponents, ordering, and the exact product."""
    value = _checked_integer(value, "factorization target")
    product = 1
    previous = 1
    normalized: list[tuple[Any, int]] = []
    for raw_prime, raw_exponent in factorization:
        prime = _checked_integer(raw_prime, "factorization prime")
        exponent = _checked_integer(raw_exponent, "factorization exponent")
        if prime <= 1 or exponent <= 0:
            raise ValueError(
                "factorization entries must have prime > 1 and exponent > 0"
            )
        if not sage.is_prime(prime):
            raise ValueError("factorization bases must be prime")
        if prime <= previous:
            raise ValueError("factorization primes must be strictly increasing")
        power = 1
        for _index in range(exponent):
            power *= prime
        product *= power
        previous = prime
        normalized.append((prime, exponent))
    if product != value:
        raise ValueError("factorization does not multiply to the supplied integer")
    return normalized


def element_order_from_multiple(
    element: Any,
    multiple: Any,
    factorization: list[tuple[Any, int]] | None = None,
    max_trial_divisions: int = 1_000_000,
    scalar_algorithm: str = "auto",
) -> Any:
    """Return the exact order of `element`, given a known annihilating multiple."""
    if multiple <= 0:
        raise ValueError("the annihilating multiple must be positive")
    if not element.scalar_multiple(multiple, algorithm=scalar_algorithm).is_zero():
        raise ValueError("the supplied multiple does not annihilate the element")
    factors = (
        factor_integer_bounded(multiple, max_trial_divisions)
        if factorization is None
        else validate_factorization(multiple, factorization)
    )
    order = multiple
    for prime, exponent in factors:
        for _index in range(exponent):
            candidate = order // prime
            if not element.scalar_multiple(
                candidate, algorithm=scalar_algorithm
            ).is_zero():
                break
            order = candidate
    return order


def _p_adic_log_of_count(count: int, prime: Any, maximum: int) -> int:
    """Return `log_prime(count)` and reject a count that is not a prime power."""
    value = count
    exponent = 0
    while value > 1 and value % prime == 0:
        value //= prime
        exponent += 1
    if value != 1 or exponent > maximum:
        raise ArithmeticError(
            "enumerated torsion count is not the expected prime power"
        )
    return exponent


def invariant_factors_from_elements(
    elements: list[Any],
    order: Any,
    factorization: list[tuple[Any, int]] | None = None,
    max_trial_divisions: int = 1_000_000,
) -> tuple[Any, ...]:
    """Determine invariant factors from a complete enumeration of a group.

    For each prime `p`, the sizes of the kernels of multiplication by `p^k`
    determine the elementary divisors. The primary invariant lists are then
    right-aligned and multiplied to obtain `m_1 | ... | m_r`.
    """
    if len(elements) != order:
        raise ArithmeticError(
            "the enumerated group size does not equal its known order"
        )
    factors = (
        factor_integer_bounded(order, max_trial_divisions)
        if factorization is None
        else validate_factorization(order, factorization)
    )
    primary: list[list[Any]] = []
    for prime, exponent in factors:
        kernel_logs = [0]
        images = list(elements)
        for _level in range(1, exponent + 1):
            killed = 0
            next_images = []
            for image in images:
                image = prime * image
                next_images.append(image)
                if image.is_zero():
                    killed += 1
            images = next_images
            kernel_logs.append(
                _p_adic_log_of_count(killed, prime, exponent * len(elements))
            )

        ranks: list[int] = []
        for level in range(1, exponent + 1):
            ranks.append(kernel_logs[level] - kernel_logs[level - 1])
        ranks.append(0)

        powers: list[Any] = []
        for level in range(1, exponent + 1):
            multiplicity = ranks[level - 1] - ranks[level]
            prime_power = 1
            for _index in range(level):
                prime_power *= prime
            for _index in range(multiplicity):
                powers.append(prime_power)
        primary.append(powers)

    rank = 0
    for powers in primary:
        rank = max(rank, len(powers))
    invariants: list[Any] = [1 for _index in range(rank)]
    for powers in primary:
        offset = rank - len(powers)
        for index, power in enumerate(powers):
            invariants[offset + index] *= power

    product = 1
    previous = 1
    for invariant in invariants:
        if invariant % previous != 0:
            raise ArithmeticError(
                "computed group invariants do not form a divisibility chain"
            )
        product *= invariant
        previous = invariant
    if product != order:
        raise ArithmeticError(
            "computed group invariants do not multiply to the group order"
        )
    return tuple(invariants)


def _cartesian_ranges(ranges: list[Any]) -> Any:
    """Yield integer tuples from a product without importing compiler helpers."""
    if not ranges:
        yield ()
        return
    prefix = [0 for _value in ranges]

    def visit(position: int) -> Any:
        if position == len(ranges):
            yield tuple(prefix)
            return
        for value in ranges[position]:
            prefix[position] = value
            yield from visit(position + 1)

    yield from visit(0)


def _linear_combination(
    coefficients: Any,
    elements: Any,
    budget: GroupOperationBudget,
) -> Any:
    element_list = list(elements)
    coefficient_list = list(coefficients)
    if len(element_list) != len(coefficient_list):
        raise ValueError("a linear combination has mismatched lengths")
    if not element_list:
        raise ValueError("a generic-group linear combination needs a parent")
    answer = element_list[0].parent().zero()
    for coefficient, element in zip(coefficient_list, element_list, strict=True):
        integer = _checked_integer(coefficient, "linear-combination coefficient")
        if integer:
            answer = budget.add(answer, budget.scalar(integer, element))
    return answer


def discrete_log_pgroup(
    prime: Any,
    valuations: Any,
    basis: Any,
    target: Any,
    budget: GroupOperationBudget,
) -> tuple[int, ...]:
    """Express `target` in an independent finite abelian `p`-group basis.

    This is the recursive Sutherland vector-DLP algorithm used by SageMath's
    additive abelian wrapper. A `ValueError` means that `target` is outside the
    supplied subgroup; resource exhaustion remains distinguishable.
    """
    p = _checked_integer(prime, "p-group prime")
    vals = [_checked_integer(value, "p-group valuation") for value in valuations]
    generators = list(basis)
    if not sage.is_prime(p):
        raise ValueError("the p-group base must be prime")
    if len(vals) != len(generators) or not generators:
        raise ValueError("a p-group basis and valuation list must be nonempty")
    if any(value <= 0 for value in vals):
        raise ValueError("p-group basis valuations must be positive")
    parent = generators[0].parent()
    if target.parent() is not parent or any(
        generator.parent() is not parent for generator in generators
    ):
        raise ValueError("p-group elements must have the same parent")

    def q_values(j: int, k: int) -> list[int]:
        return [p ** (j + max(0, value - k)) for value in vals]

    def subbasis(j: int, k: int) -> list[Any]:
        return [
            budget.scalar(multiplier, generator)
            for multiplier, generator in zip(q_values(j, k), generators, strict=True)
        ]

    def base_case(j: int, k: int, value: Any) -> tuple[int, ...]:
        if k - j != 1:
            raise ArithmeticError("invalid p-group DLP base interval")
        layer = subbasis(j, k)
        active = [index for index, element in enumerate(layer) if element]
        left_ranges: list[Any] = [[0] for _element in layer]
        right_ranges: list[Any] = [[0] for _element in layer]
        for position, index in enumerate(active):
            if position % 2:
                left_ranges[index] = range(p)
            else:
                right_ranges[index] = range(p)
        if len(active) % 2:
            root = 1
            while root * root < p:
                root += 1
            index = active[-1]
            left_ranges[index] = range(0, p, root)
            right_ranges[index] = range(root)

        table_entries = 1
        for item in left_ranges:
            table_entries *= len(item)
        budget.reserve_table(table_entries)
        table: dict[Any, tuple[int, ...]] = {}
        for coordinates in _cartesian_ranges(left_ranges):
            key = _linear_combination(coordinates, layer, budget)
            table[key] = coordinates
        for coordinates in _cartesian_ranges(right_ranges):
            part = _linear_combination(coordinates, layer, budget)
            key = budget.add(value, budget.negate(part))
            if key in table:
                left = table[key]
                return tuple(
                    left[index] + coordinates[index] for index in range(len(generators))
                )
        raise ValueError("the target is not in the p-group subgroup")

    def recurse(j: int, k: int, value: Any) -> tuple[int, ...]:
        if not 0 <= j < k:
            raise ArithmeticError("invalid p-group DLP recursion interval")
        if k - j <= 1:
            return base_case(j, k, value)
        midpoint = j + (k - j + 1) // 2
        boundaries = [j, midpoint, k]
        coordinates = [0 for _generator in generators]
        for position in (1, 0):
            left = boundaries[position]
            right = boundaries[position + 1]
            scaled_target = budget.scalar(p ** (left - j), value)
            correction_basis = subbasis(left, k)
            correction = _linear_combination(coordinates, correction_basis, budget)
            gamma = budget.add(scaled_target, budget.negate(correction))
            local = recurse(left, right, gamma)
            q_short = q_values(left, right)
            q_long = q_values(left, k)
            for index in range(len(generators)):
                if q_short[index] % q_long[index] != 0:
                    raise ArithmeticError("inconsistent p-group DLP scaling")
                coordinates[index] += (q_short[index] // q_long[index]) * local[index]
        return tuple(coordinates)

    answer = recurse(0, max(vals), target)
    reconstructed = _linear_combination(answer, generators, budget)
    if reconstructed != target:
        raise ArithmeticError("the vector discrete log failed reconstruction")
    return answer


def _expand_basis_pgroup(
    prime: int,
    basis: list[Any],
    valuations: list[int],
    beta: Any,
    beta_valuation: int,
    relation: list[int],
    budget: GroupOperationBudget,
) -> None:
    """Apply Sutherland Algorithm 9.2 to one `p`-group basis in place."""
    if len(basis) != len(valuations) or len(relation) != len(basis) + 1:
        raise ValueError("the p-group expansion relation has the wrong length")
    if any(value < 0 for value in relation):
        raise ValueError("p-group expansion relations must be nonnegative")

    if not any(relation):
        raise ValueError("a p-group expansion relation must be nonzero")
    minimum = relation[-1] if relation[-1] else None
    for index in range(len(basis)):
        value = relation[index]
        if not value:
            continue
        primary = prime ** _valuation(value, prime)
        basis[index] = budget.scalar(value // primary, basis[index])
        relation[index] = primary
        if minimum is None or primary < minimum:
            minimum = primary
    if minimum is None:
        raise ValueError("a p-group expansion relation must involve the basis")
    last_valuation = _valuation(relation[-1], prime)

    if relation[-1] == minimum:
        adjusted = beta
        for index in range(len(basis)):
            adjusted = budget.add(
                adjusted,
                budget.scalar(relation[index] // relation[-1], basis[index]),
            )
        basis.append(adjusted)
        valuations.append(last_valuation)
        return

    pivot = next(index for index, value in enumerate(relation) if value == minimum)
    new_basis = list(basis) + [beta]
    basis[pivot] = _linear_combination(
        [value // relation[pivot] for value in relation],
        new_basis,
        budget,
    )
    valuations[pivot] = _valuation(relation[pivot], prime)

    if not basis[pivot]:
        del basis[pivot]
        del valuations[pivot]
        if not basis:
            basis.append(beta)
            valuations.append(beta_valuation)
            return

    beta_power = beta
    for exponent in range(1, beta_valuation):
        beta_power = budget.scalar(prime, beta_power)
        try:
            coordinates = discrete_log_pgroup(
                prime,
                valuations,
                basis,
                budget.negate(beta_power),
                budget,
            )
        except ValueError:
            continue
        _expand_basis_pgroup(
            prime,
            basis,
            valuations,
            beta,
            beta_valuation,
            list(coordinates) + [prime**exponent],
            budget,
        )
        break
    else:
        basis.append(beta)
        valuations.append(beta_valuation)


def basis_from_generators(
    generators: Any,
    orders: Any,
    factorization: Any,
    budget: GroupOperationBudget,
) -> tuple[tuple[Any, ...], tuple[int, ...]]:
    """Return an independent basis for the subgroup generated by `generators`.

    This adapts Sutherland Algorithms 9.1 and 9.2, as used by SageMath. The
    returned orders are in descending divisibility order; callers presenting
    Sage invariant factors should reverse both tuples.
    """
    gens = list(generators)
    ords = [_checked_integer(value, "generator order") for value in orders]
    if len(gens) != len(ords):
        raise ValueError("generator and order lists must have the same length")
    if not gens:
        return (), ()
    if any(order <= 0 for order in ords):
        raise ValueError("generator orders must be positive")
    raw_factors = list(factorization)
    group_order = 1
    for prime, exponent in raw_factors:
        group_order *= int(prime) ** int(exponent)
    factors = validate_factorization(group_order, raw_factors)
    if any(group_order % order != 0 for order in ords):
        raise ValueError("every generator order must divide the ambient order")

    global_basis: list[Any] = []
    global_orders: list[int] = []
    for raw_prime, _ambient_exponent in factors:
        prime = int(raw_prime)
        primary_generators: list[tuple[Any, int]] = []
        for generator, order in zip(gens, ords, strict=True):
            exponent = _valuation(order, prime)
            if exponent:
                primary_order = prime**exponent
                primary_generators.append(
                    (budget.scalar(order // primary_order, generator), primary_order)
                )
        if not primary_generators:
            continue
        primary_generators.sort(key=lambda item: item[1])
        alpha, alpha_order = primary_generators.pop()
        primary_basis = [alpha]
        valuations = [_valuation(alpha_order, prime)]

        while primary_generators:
            beta, beta_order = primary_generators.pop()
            try:
                discrete_log_pgroup(prime, valuations, primary_basis, beta, budget)
            except ValueError:
                pass
            else:
                continue

            beta_valuation = _valuation(beta_order, prime)
            beta_power = beta
            for exponent in range(1, beta_valuation):
                beta_power = budget.scalar(prime, beta_power)
                try:
                    coordinates = discrete_log_pgroup(
                        prime,
                        valuations,
                        primary_basis,
                        budget.negate(beta_power),
                        budget,
                    )
                except ValueError:
                    continue
                _expand_basis_pgroup(
                    prime,
                    primary_basis,
                    valuations,
                    beta,
                    beta_valuation,
                    list(coordinates) + [prime**exponent],
                    budget,
                )
                break
            else:
                primary_basis.append(beta)
                valuations.append(beta_valuation)

        ordered = sorted(
            zip(valuations, primary_basis, strict=True),
            key=lambda item: item[0],
            reverse=True,
        )
        for index, (exponent, element) in enumerate(ordered):
            primary_order = prime**exponent
            if index < len(global_basis):
                global_basis[index] = budget.add(global_basis[index], element)
                global_orders[index] *= primary_order
            else:
                global_basis.append(element)
                global_orders.append(primary_order)

    product = 1
    previous = None
    for order in global_orders:
        product *= order
        if previous is not None and previous % order != 0:
            raise ArithmeticError("the generic group basis is not in canonical order")
        previous = order
    if product > group_order or group_order % product != 0:
        raise ArithmeticError("the generated subgroup order is inconsistent")
    return tuple(global_basis), tuple(global_orders)


def coordinates_in_basis(
    target: Any,
    basis: Any,
    orders: Any,
    factorization: Any,
    budget: GroupOperationBudget,
) -> tuple[int, ...]:
    """Return exact invariant coordinates using primary vector discrete logs."""
    generators = list(basis)
    moduli = [_checked_integer(value, "basis order") for value in orders]
    if len(generators) != len(moduli):
        raise ValueError("basis and order lists must have the same length")
    if not generators:
        if target.is_zero():
            return ()
        raise ValueError("the target is not in the trivial subgroup")
    order = 1
    for modulus in moduli:
        order *= modulus
    factors = validate_factorization(order, list(factorization))
    residues = [0 for _modulus in moduli]
    residue_moduli = [1 for _modulus in moduli]

    for raw_prime, exponent in factors:
        prime = int(raw_prime)
        primary_order = prime**exponent
        cofactor = order // primary_order
        indices = [
            index for index, modulus in enumerate(moduli) if modulus % prime == 0
        ]
        valuations = [_valuation(moduli[index], prime) for index in indices]
        primary_basis = [
            budget.scalar(cofactor, generators[index]) for index in indices
        ]
        primary_target = budget.scalar(cofactor, target)
        local = discrete_log_pgroup(
            prime, valuations, primary_basis, primary_target, budget
        )
        for position, index in enumerate(indices):
            modulus = prime ** valuations[position]
            value = local[position] % modulus
            old_modulus = residue_moduli[index]
            gcd, inverse, _other = _integer_xgcd(old_modulus, modulus)
            if gcd != 1:
                raise ArithmeticError("primary coordinate moduli are not coprime")
            correction = ((value - residues[index]) * inverse) % modulus
            residues[index] += old_modulus * correction
            residue_moduli[index] *= modulus
            residues[index] %= residue_moduli[index]

    for index, modulus in enumerate(moduli):
        if residue_moduli[index] != modulus:
            raise ArithmeticError("a basis coordinate omitted a primary component")
    reconstructed = _linear_combination(residues, generators, budget)
    if reconstructed != target:
        raise ArithmeticError("invariant coordinates failed reconstruction")
    return tuple(residues)
