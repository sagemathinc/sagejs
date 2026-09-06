"""Exact radicals and primary decomposition of zero-dimensional ideals.

The radical construction uses the classical zero-dimensional perfect-field
criterion: adjoining the square-free parts of one annihilating polynomial for
each coordinate gives the radical. Primary components are split by coprime
factors of multiplication minimal polynomials and exactly recomposed.
"""

from __future__ import annotations

from typing import Any, Iterator

_MAX_RECURSION = 64
_MAX_SEPARATOR_CANDIDATES = 65536


def _canonical(ideal: Any, algorithm: str, proof: Any) -> Any:
    return ideal.ring().ideal(
        list(ideal.groebner_basis(algorithm=algorithm, proof=proof))
    )


def _require_zero_dimensional(ideal: Any, algorithm: str, proof: Any) -> int:
    dimension = ideal.dimension(algorithm=algorithm, proof=proof)
    if dimension == -1:
        return 0
    if dimension != 0:
        raise NotImplementedError(
            "radical and primary decomposition currently support only "
            "zero-dimensional ideals over QQ and prime GF(p)"
        )
    return int(ideal.vector_space_dimension(algorithm=algorithm, proof=proof))


def _factor_records(polynomial: Any) -> list[Any]:
    records = []
    for factor, multiplicity in polynomial.factor():
        records.append((factor, int(multiplicity)))
    records.sort(key=_factor_key)
    return records


def _factor_key(record: Any) -> str:
    return repr(record[0])


def _evaluate_univariate(polynomial: Any, value: Any) -> Any:
    ring = value.parent()
    answer = ring(0)
    for coefficient in reversed(polynomial.coefficients()):
        answer = answer * value + ring(coefficient)
    return answer


def _squarefree_annihilator(polynomial: Any, value: Any) -> Any:
    answer = value.parent()(1)
    for factor, _multiplicity in _factor_records(polynomial):
        answer *= _evaluate_univariate(factor, value)
    return answer


def radical(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    """Return the radical of a zero-dimensional ideal over a perfect field."""
    quotient_dimension = _require_zero_dimensional(ideal, algorithm, proof)
    if quotient_dimension == 0:
        return ideal.ring().ideal(1)
    ring = ideal.ring()
    quotient = ideal.quotient_ring(algorithm=algorithm, proof=proof)
    generators = list(ideal.gens())
    for index, variable in enumerate(ring.gens()):
        minimum = quotient.minimal_polynomial(
            quotient(variable), "_sagejs_radical_t" + str(index)
        )
        generators.append(_squarefree_annihilator(minimum, variable))
    result = _canonical(ring.ideal(generators), algorithm, proof)
    if not ideal.is_subset(result, algorithm=algorithm, proof=proof):
        raise ArithmeticError("radical construction lost the input ideal")
    return result


def is_radical(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> bool:
    return ideal.is_equal(radical(ideal, algorithm, proof), algorithm, proof)


def _initial_candidate_values(ideal: Any, algorithm: str, proof: Any) -> Iterator[Any]:
    ring = ideal.ring()
    yield from ring.gens()
    basis = list(ideal.normal_basis(algorithm=algorithm, proof=proof))
    nonconstant = [value for value in basis if value != ring(1)]
    yield from nonconstant
    for left in range(len(nonconstant)):
        for right in range(left + 1, len(nonconstant)):
            for coefficient in [1, -1, 2, -2, 3]:
                yield nonconstant[left] + coefficient * nonconstant[right]


def _initial_candidates(ideal: Any, algorithm: str, proof: Any) -> Iterator[Any]:
    seen: set[str] = set()
    for value in _initial_candidate_values(ideal, algorithm, proof):
        key = repr(value)
        if key not in seen:
            seen.add(key)
            yield value
            if len(seen) >= 512:
                return


def _finite_candidates(
    ideal: Any,
    algorithm: str,
    proof: Any,
) -> Iterator[Any]:
    ring = ideal.ring()
    field = ring.base_ring()
    if field.characteristic() == 0:
        return
    order = int(field.cardinality())
    if order != int(field.characteristic()):
        raise NotImplementedError(
            "finite separator enumeration currently supports only prime GF(p)"
        )
    basis = list(ideal.normal_basis(algorithm=algorithm, proof=proof))
    count = 1
    for _basis_value in basis:
        if count > _MAX_SEPARATOR_CANDIDATES // order:
            raise OverflowError(
                "exact separator search exceeds 65536 finite quotient elements"
            )
        count *= order
    for encoded in range(1, count):
        value = encoded
        polynomial = ring(0)
        for basis_value in basis:
            polynomial += field(value % order) * basis_value
            value //= order
        # Coordinate encoding in a quotient basis is injective: no quadratic
        # repr-based deduplication or eager list of every element is needed.
        yield polynomial


def _rational_candidates(
    ideal: Any,
    algorithm: str,
    proof: Any,
) -> Iterator[Any]:
    ring = ideal.ring()
    field = ring.base_ring()
    if field.characteristic() != 0:
        return
    basis = list(ideal.normal_basis(algorithm=algorithm, proof=proof))
    nonconstant = [value for value in basis if value != ring(1)]
    seen: set[str] = set()
    if len(nonconstant) == 0:
        return
    for seed in range(1, 2049):
        state = seed
        candidate = ring(0)
        nonzero = False
        for basis_value in nonconstant:
            state = (1103515245 * state + 12345) % 2147483648
            coefficient = state % 7 - 3
            if coefficient:
                nonzero = True
                candidate += coefficient * basis_value
        if nonzero:
            key = repr(candidate)
            if key not in seen:
                seen.add(key)
                yield candidate


def _separator_status(
    radical_ideal: Any,
    algorithm: str,
    proof: Any,
) -> tuple[str, Any, list[Any]]:
    dimension = int(
        radical_ideal.vector_space_dimension(algorithm=algorithm, proof=proof)
    )
    quotient = radical_ideal.quotient_ring(algorithm=algorithm, proof=proof)
    seen: set[str] = set()
    for candidates in (
        _initial_candidates(radical_ideal, algorithm, proof),
        _rational_candidates(radical_ideal, algorithm, proof),
        _finite_candidates(radical_ideal, algorithm, proof),
    ):
        for candidate in candidates:
            key = repr(candidate)
            if key in seen:
                continue
            seen.add(key)
            minimum = quotient.minimal_polynomial(
                quotient(candidate), "_sagejs_split_t"
            )
            factors = _factor_records(minimum)
            if len(factors) > 1:
                return "split", candidate, factors
            if (
                len(factors) == 1
                and factors[0][1] == 1
                and factors[0][0].degree() == dimension
            ):
                return "field", candidate, factors
    raise OverflowError(
        "could not certify a separating element within the deterministic "
        "zero-dimensional resource envelope"
    )


def _decompose(
    ideal: Any,
    algorithm: str,
    proof: Any,
    depth: int,
) -> list[Any]:
    if depth > _MAX_RECURSION:
        raise OverflowError("primary decomposition exceeds recursion depth 64")
    radical_ideal = radical(ideal, algorithm, proof)
    status, separator, factors = _separator_status(radical_ideal, algorithm, proof)
    if status == "field":
        return [_canonical(ideal, algorithm, proof)]
    dimension = _require_zero_dimensional(ideal, algorithm, proof)
    children = []
    for factor, _multiplicity in factors:
        equation = _evaluate_univariate(factor, separator) ** dimension
        child = _canonical(
            ideal.ring().ideal(list(ideal.gens()) + [equation]),
            algorithm,
            proof,
        )
        if child.is_equal(ideal, algorithm, proof):
            raise ArithmeticError("primary splitter did not refine the ideal")
        children.extend(_decompose(child, algorithm, proof, depth + 1))
    return children


def _component_key(component: Any, algorithm: str, proof: Any) -> str:
    return "|".join(
        repr(value)
        for value in component.groebner_basis(algorithm=algorithm, proof=proof)
    )


def primary_decomposition(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> list[Any]:
    """Return exactly verified primary components of a zero-dimensional ideal."""
    dimension = _require_zero_dimensional(ideal, algorithm, proof)
    if dimension == 0:
        return []
    components = _decompose(ideal, algorithm, proof, 0)
    keyed = [(_component_key(value, algorithm, proof), value) for value in components]
    keyed.sort(key=_component_record_key)
    components = [record[1] for record in keyed]
    recomposed = components[0]
    for component in components[1:]:
        recomposed = recomposed.intersection(
            component, algorithm="buchberger", proof=proof
        )
    if not recomposed.is_equal(ideal, algorithm="buchberger", proof=proof):
        raise ArithmeticError("primary components failed exact recomposition")
    for component in components:
        component_radical = radical(component, algorithm, proof)
        status, _separator, _factors = _separator_status(
            component_radical, algorithm, proof
        )
        if status != "field":
            raise ArithmeticError("a returned primary component has nonmaximal radical")
    return components


def _component_record_key(record: Any) -> str:
    return record[0]


def associated_primes(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> list[Any]:
    return [
        radical(component, algorithm, proof)
        for component in primary_decomposition(ideal, algorithm, proof)
    ]
