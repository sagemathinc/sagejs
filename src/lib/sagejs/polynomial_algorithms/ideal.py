"""Lazy exact algorithms for multivariate polynomial ideals.

The public ideal class lives in the arithmetic bootstrap, but substantial
Gröbner, quotient-ring, elimination, FGLM, and solving code belongs here so
ordinary Sage.js startup does not parse algorithms that it has not requested.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_STANDARD_MONOMIAL_LIMIT = 1000000
_FGLM_DIMENSION_LIMIT = 256


def _polynomial_api() -> Any:
    return __import__(
        "sagejs._baselib.polynomial",
        fromlist=["PolynomialSequence"],
    )


def _sequence(values: list[Any], ring: Any) -> Any:
    return _polynomial_api().PolynomialSequence(values, ring)


def _element(ring: Any, native: Any) -> Any:
    return _polynomial_api().MultivariatePolynomialElement(ring, native)


def _monomial_precedes(left: Any, right: Any, order: str) -> bool:
    if order != "lex":
        left_degree = sum(left)
        right_degree = sum(right)
        if left_degree != right_degree:
            return left_degree < right_degree
    if order == "degrevlex":
        index = len(left) - 1
        while index >= 0:
            if left[index] != right[index]:
                return left[index] > right[index]
            index -= 1
        return False
    for index in range(len(left)):
        if left[index] != right[index]:
            return left[index] < right[index]
    return False


def _sort_monomial_exponents(values: list[Any], order: str) -> list[Any]:
    answer = []
    for value in values:
        position = 0
        while position < len(answer) and not _monomial_precedes(
            value, answer[position], order
        ):
            position += 1
        answer.insert(position, value)
    return answer


def _monomial_divides(left: Any, right: Any) -> bool:
    for index in range(len(left)):
        if left[index] > right[index]:
            return False
    return True


def _minimum_monomial_support_cover(supports: list[Any]) -> int:
    if len(supports) == 0:
        return 0
    selected = supports[0]
    for support in supports[1:]:
        if len(support) < len(selected):
            selected = support
    best = len(supports) + 1
    for variable in selected:
        remaining = []
        for support in supports:
            if variable not in support:
                remaining.append(support)
        candidate = 1 + _minimum_monomial_support_cover(remaining)
        if candidate < best:
            best = candidate
    return best


def _groebner_contract() -> Any:
    return __import__(
        "sagejs.polynomial_algorithms.groebner_contract",
        fromlist=["GroebnerRing"],
    )


def _groebner_contract_ring(ring: Any) -> Any:
    if ring.base_ring()._kind == "GF_EXTENSION":
        from sagejs.polynomial_algorithms.extension_ideal import contract_ring

        return contract_ring(ring)
    from sagejs.polynomial_algorithms.field_capabilities import packed_v1_characteristic

    characteristic = packed_v1_characteristic(ring.base_ring(), ring._order)
    return _groebner_contract().GroebnerRing(ring.ngens(), ring._order, characteristic)


def _pack_groebner_polynomial(polynomial: Any) -> Any:
    if polynomial.parent().base_ring()._kind == "GF_EXTENSION":
        from sagejs.polynomial_algorithms.extension_ideal import sparse_terms

        return sparse_terms(polynomial)
    from sagejs.polynomial_algorithms.field_capabilities import packed_v1_characteristic

    base = polynomial.parent().base_ring()
    characteristic = packed_v1_characteristic(base, polynomial.parent()._order)
    packed = []
    for coefficient, exponents in polynomial.terms():
        if characteristic == 0:
            scalar = runtime.math_tuple(
                [
                    runtime.normalize_integer(coefficient._numerator),
                    runtime.normalize_integer(coefficient._denominator),
                ]
            )
        else:
            scalar = runtime.normalize_integer(coefficient._value)
        packed.append(runtime.math_tuple([scalar, runtime.math_tuple(exponents)]))
    return runtime.math_tuple(packed)


def _permute_polynomial(
    polynomial: Any,
    target: Any,
    permutation: list[int],
) -> Any:
    terms = []
    for coefficient, exponents in polynomial.terms():
        mapped = []
        for source_index in permutation:
            mapped.append(exponents[source_index])
        terms.append(runtime.math_tuple([coefficient, runtime.math_tuple(mapped)]))
    return target._from_sparse_terms(terms)


def _inverse_permutation(permutation: list[int]) -> list[int]:
    answer = [0] * len(permutation)
    for target_index, source_index in enumerate(permutation):
        answer[source_index] = target_index
    return answer


def _field_vector_dependence(
    columns: list[Any],
    target: list[Any],
    field: Any,
) -> Any:
    zero = field(0)
    column_count = len(columns)
    if column_count == 0:
        return runtime.math_tuple(
            [all(value == zero for value in target), runtime.math_tuple([])]
        )
    rows = []
    for row_index in range(len(target)):
        row = []
        for column in columns:
            row.append(field(column[row_index]))
        row.append(field(target[row_index]))
        rows.append(row)
    pivot_row = 0
    pivots = []
    for column_index in range(column_count):
        selected = -1
        for row_index in range(pivot_row, len(rows)):
            if rows[row_index][column_index] != zero:
                selected = row_index
                break
        if selected == -1:
            raise ArithmeticError("FGLM quotient vectors lost independence")
        if selected != pivot_row:
            rows[pivot_row], rows[selected] = rows[selected], rows[pivot_row]
        scale = field(1) / rows[pivot_row][column_index]
        for index in range(column_index, column_count + 1):
            rows[pivot_row][index] *= scale
        for row_index in range(len(rows)):
            if row_index == pivot_row:
                continue
            scale = rows[row_index][column_index]
            if scale == zero:
                continue
            for index in range(column_index, column_count + 1):
                rows[row_index][index] -= scale * rows[pivot_row][index]
        pivots.append(pivot_row)
        pivot_row += 1
    for row_index in range(len(rows)):
        if all(rows[row_index][index] == zero for index in range(column_count)):
            if rows[row_index][column_count] != zero:
                return runtime.math_tuple([False, runtime.math_tuple([])])
    coefficients = [zero] * column_count
    for column_index, row_index in enumerate(pivots):
        coefficients[column_index] = rows[row_index][column_count]
    return runtime.math_tuple([True, runtime.math_tuple(coefficients)])


def _evaluate_sparse_polynomial(polynomial: Any, values: list[Any]) -> Any:
    base = polynomial.parent().base_ring()
    result = base(0)
    for coefficient, exponents in polynomial.terms():
        term = coefficient
        for index in range(len(exponents)):
            if exponents[index]:
                term *= values[index] ** exponents[index]
        result += term
    return result


def _specialize_univariate(
    polynomial: Any,
    variable: int,
    assignments: list[Any],
) -> Any:
    base = polynomial.parent().base_ring()
    degree = polynomial.degree(polynomial.parent().gen(variable))
    if degree < 0:
        return sage.PolynomialRing(base, "_solve")(0)
    coefficients = [base(0) for _index in range(degree + 1)]
    for coefficient, exponents in polynomial.terms():
        for index in range(variable):
            if exponents[index]:
                return None
        scalar = coefficient
        for index in range(variable + 1, len(exponents)):
            if exponents[index]:
                if assignments[index] is None:
                    return None
                scalar *= assignments[index] ** exponents[index]
        coefficients[exponents[variable]] += scalar
    return sage.PolynomialRing(base, "_solve")(coefficients)


def _base_field_roots(polynomial: Any, field: Any) -> list[Any]:
    if polynomial.is_zero():
        raise ArithmeticError("the zero polynomial does not constrain a variable")
    if polynomial.degree() <= 0:
        return []
    if field._kind == "GF":
        return polynomial.roots(False)
    roots = []
    for factor, _multiplicity in polynomial.factor():
        if factor.degree() == 1:
            coefficients = factor.coefficients()
            root = -coefficients[0] / coefficients[1]
            if root not in roots:
                roots.append(root)
    return roots


def _descending_polynomials(polynomials: list[Any], order: str) -> list[Any]:
    answer = []
    for polynomial in polynomials:
        leading = polynomial.terms()[0][1]
        position = 0
        while position < len(answer) and _monomial_precedes(
            leading, answer[position].terms()[0][1], order
        ):
            position += 1
        answer.insert(position, polynomial)
    return answer


def groebner_basis(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    """Return a reduced Gröbner basis using reviewed public dispatch."""
    if not isinstance(algorithm, str):
        raise TypeError("Gröbner basis algorithm must be a string")
    proof_module = __import__(
        "sagejs._baselib.proof", fromlist=["resolve_polynomial_proof"]
    )
    proof_required = proof_module.resolve_polynomial_proof(proof)
    ring = ideal._ring
    base = ring.base_ring()
    from sagejs.polynomial_algorithms.field_capabilities import require_field_operation

    require_field_operation(base, "ideal", ring._order, proof_required)
    if base._kind == "GF_EXTENSION":
        from sagejs.polynomial_algorithms.extension_ideal import (
            groebner_basis as extension_groebner_basis,
        )

        return extension_groebner_basis(ideal, algorithm, proof_required)
    if base._kind == "GF":
        if algorithm not in ["auto", "msolve", "buchberger"]:
            raise ValueError("unknown prime-field Gröbner basis algorithm")
        use_buchberger = algorithm == "buchberger" or (
            algorithm == "auto"
            and (
                ring._order != "degrevlex"
                or base._modulus >= runtime.bigint(2147483648)
            )
        )
        if use_buchberger:
            backend = "python:groebner-reference-with-provenance-v1"
        elif ring._order != "degrevlex":
            raise NotImplementedError(
                "msolve F4 currently requires degree reverse lexicographic order"
            )
        elif base._modulus >= runtime.bigint(2147483648):
            raise NotImplementedError(
                "msolve F4 currently requires characteristic below 2^31"
            )
        else:
            backend = "msolve:f4-prime-field-v1"
    else:
        if algorithm not in ["auto", "flint", "msolve", "buchberger"]:
            raise ValueError("unknown rational Gröbner basis algorithm")
        wasm_runtime = (
            runtime.reflect.get(
                runtime.global_object,
                "__sagejs_wasm_native_resolver__",
            )
            is not runtime.undefined
        )
        use_msolve = algorithm == "msolve" or (
            algorithm == "auto" and not proof_required and ring._order == "degrevlex"
        )
        if algorithm == "buchberger" or (
            algorithm == "auto" and proof_required and wasm_runtime
        ):
            backend = "python:groebner-reference-with-provenance-v1"
        elif use_msolve:
            if ring._order != "degrevlex":
                raise NotImplementedError(
                    "msolve modular QQ currently requires degree reverse lexicographic order"
                )
            if proof_required:
                raise NotImplementedError(
                    "proof=True awaits exported msolve transformation provenance"
                )
            backend = "msolve:modular-qq-v1"
        else:
            backend = "flint:bounded-buchberger-v1"
    key = backend + (":proof" if proof_required else ":candidate")
    if key not in ideal._groebner_cache:
        if backend.startswith("python:"):
            contract = _groebner_contract()
            contract_ring = _groebner_contract_ring(ring)
            packed_generators = tuple(
                _pack_groebner_polynomial(generator) for generator in ideal._generators
            )
            packed_basis, transformation = contract.groebner_basis_reference(
                packed_generators, contract_ring
            )
            verification = contract.verify_groebner_certificate(
                packed_generators,
                packed_basis,
                transformation,
                contract_ring,
            )
            if not verification.valid:
                raise ArithmeticError("exact Buchberger certificate failed")
            values = []
            for packed in packed_basis:
                values.append(ring._from_sparse_terms(packed))
            ideal._groebner_transform_cache[key] = transformation
        else:
            native_generators = [generator._native for generator in ideal._generators]
            if backend.startswith("msolve:"):
                native = runtime.flint_backend().mpolyGroebnerMsolve(native_generators)
            else:
                native = runtime.flint_backend().mpolyGroebner(native_generators)
            values = []
            for value in native:
                values.append(_element(ring, value))
        ideal._groebner_cache[key] = _sequence(values, ring)
    ideal._groebner_metadata = {
        "backend": backend,
        "domain": "GF(p)" if base._kind == "GF" else "QQ",
        "characteristic": (
            runtime.normalize_integer(base._modulus) if base._kind == "GF" else 0
        ),
        "order": ring._order,
        "proof": backend != "msolve:modular-qq-v1",
        "proof_requested": proof_required,
        "deterministic": backend != "msolve:modular-qq-v1",
        "probabilistic": backend == "msolve:modular-qq-v1",
    }
    return ideal._groebner_cache[key]


def groebner_basis_metadata(ideal: Any) -> dict[str, Any]:
    if len(ideal._groebner_metadata) == 0:
        groebner_basis(ideal)
    return dict(ideal._groebner_metadata)


def elimination_ideal(
    ideal: Any,
    variables: Any,
    algorithm: str = "buchberger",
    proof: Any = None,
) -> Any:
    ring = ideal._ring
    if not isinstance(variables, (list, tuple)):
        variables = [variables]
    eliminated = []
    for variable in variables:
        index = ring._generator_index(variable)
        if index not in eliminated:
            eliminated.append(index)
    if len(eliminated) == 0:
        return ring.ideal(ideal._generators)
    retained = []
    for index in range(ring.ngens()):
        if index not in eliminated:
            retained.append(index)
    permutation = eliminated + retained
    names = ring.variable_names()
    temporary_names = [names[index] for index in permutation]
    temporary = _polynomial_api().PolynomialRing(
        ring.base_ring(), names=temporary_names, order="lex"
    )
    mapped_generators = []
    for generator in ideal._generators:
        mapped_generators.append(_permute_polynomial(generator, temporary, permutation))
    basis = temporary.ideal(mapped_generators).groebner_basis(
        algorithm=algorithm, proof=proof
    )
    inverse = _inverse_permutation(permutation)
    answer = []
    for polynomial in basis:
        survives = True
        for _coefficient, exponents in polynomial.terms():
            for index in range(len(eliminated)):
                if exponents[index] != 0:
                    survives = False
                    break
            if not survives:
                break
        if survives:
            answer.append(_permute_polynomial(polynomial, ring, inverse))
    return ring.ideal(answer)


def leading_exponents(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> list[Any]:
    basis = ideal.groebner_basis(algorithm=algorithm, proof=proof)
    generators = ideal._ring.gens()
    exponents = []
    for polynomial in basis:
        leading = _element(
            ideal._ring,
            ideal._ring._backend.mpolyLeadingMonomial(polynomial._native),
        )
        exponents.append(tuple(leading.degree(variable) for variable in generators))
    return exponents


def dimension(ideal: Any, algorithm: str = "auto", proof: Any = None) -> int:
    leading = leading_exponents(ideal, algorithm=algorithm, proof=proof)
    if any(all(exponent == 0 for exponent in value) for value in leading):
        return -1
    supports = []
    for value in leading:
        support = tuple(index for index in range(len(value)) if value[index] != 0)
        if len(support) == 0:
            continue
        if support not in supports:
            supports.append(support)
    minimal = []
    for index, support in enumerate(supports):
        if any(
            other != index and all(variable in support for variable in candidate)
            for other, candidate in enumerate(supports)
        ):
            continue
        minimal.append(support)
    height = _minimum_monomial_support_cover(minimal)
    return ideal._ring.ngens() - height


def standard_monomial_exponents(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> list[Any]:
    leading = leading_exponents(ideal, algorithm=algorithm, proof=proof)
    if any(all(exponent == 0 for exponent in value) for value in leading):
        return []
    bounds = [0] * ideal._ring.ngens()
    for value in leading:
        active = [index for index in range(len(value)) if value[index] != 0]
        if len(active) == 1:
            index = active[0]
            if bounds[index] == 0 or value[index] < bounds[index]:
                bounds[index] = value[index]
    if any(bound == 0 for bound in bounds):
        raise ValueError("normal basis requires a zero-dimensional ideal")
    box_size = 1
    for bound in bounds:
        box_size *= bound
        if box_size > _STANDARD_MONOMIAL_LIMIT:
            raise OverflowError(
                "standard monomial search exceeds the 1,000,000-element limit"
            )
    answer = []
    current = [0] * len(bounds)
    for _position in range(box_size):
        value = tuple(current)
        if not any(_monomial_divides(generator, value) for generator in leading):
            answer.append(value)
        index = len(current) - 1
        while index >= 0:
            current[index] += 1
            if current[index] < bounds[index]:
                break
            current[index] = 0
            index -= 1
    return _sort_monomial_exponents(answer, ideal._ring._order)


def _monomial(ideal: Any, exponents: Any) -> Any:
    answer = ideal._ring(1)
    generators = ideal._ring.gens()
    for index in range(len(exponents)):
        if exponents[index] != 0:
            answer *= generators[index] ** exponents[index]
    return answer


def normal_basis(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    return _sequence(
        [
            _monomial(ideal, exponents)
            for exponents in standard_monomial_exponents(ideal, algorithm, proof)
        ],
        ideal._ring,
    )


def quotient_coordinates(
    ideal: Any,
    value: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    exponents = standard_monomial_exponents(ideal, algorithm, proof)
    base = ideal._ring.base_ring()
    coordinates = [base(0) for _index in exponents]
    remainder = ideal.normal_form(value, algorithm=algorithm, proof=proof)
    for coefficient, monomial in remainder.terms():
        if monomial not in exponents:
            raise ArithmeticError("normal form contains a nonstandard monomial")
        index = exponents.index(monomial)
        coordinates[index] = coefficient
    return runtime.math_tuple(coordinates)


def multiplication_matrix(
    ideal: Any,
    variable: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    variable = ideal._ring(variable)
    basis = normal_basis(ideal, algorithm=algorithm, proof=proof)
    columns = []
    for monomial in basis:
        columns.append(
            quotient_coordinates(
                ideal,
                variable * monomial,
                algorithm=algorithm,
                proof=proof,
            )
        )
    rows = []
    for row_index in range(len(basis)):
        rows.append([column[row_index] for column in columns])
    matrix_module = __import__("sagejs._baselib.matrix", fromlist=["matrix"])
    return matrix_module.matrix(ideal._ring.base_ring(), rows)


def fglm(
    ideal: Any,
    order: str = "lex",
    algorithm: str = "auto",
    proof: Any = None,
    other_ring: Any = None,
) -> Any:
    if other_ring is None:
        target = _polynomial_api().PolynomialRing(
            ideal._ring.base_ring(),
            names=ideal._ring.variable_names(),
            order=order,
        )
    else:
        target = other_ring
        if not isinstance(target, _polynomial_api().MultivariatePolynomialRingParent):
            raise TypeError("FGLM target must be a multivariate polynomial ring")
        if target._order != order:
            raise ValueError("FGLM target ring has a different monomial order")
        if (
            target.base_ring() is not ideal._ring.base_ring()
            or target.variable_names() != ideal._ring.variable_names()
        ):
            raise TypeError("FGLM target must have the same field and variables")
    if ideal.is_one(algorithm=algorithm, proof=proof):
        return _sequence([target(1)], target)
    if dimension(ideal, algorithm=algorithm, proof=proof) != 0:
        raise ValueError("FGLM requires a zero-dimensional ideal")
    quotient_dimension = vector_space_dimension(ideal, algorithm=algorithm, proof=proof)
    if quotient_dimension > _FGLM_DIMENSION_LIMIT:
        raise OverflowError("FGLM quotient dimension exceeds the 256 limit")
    field = ideal._ring.base_ring()
    zero_exponents = tuple(0 for _index in range(ideal._ring.ngens()))
    candidates = [zero_exponents]
    processed = []
    standard = []
    vectors = []
    leading = []
    relations = []
    while candidates:
        monomial = candidates.pop(0)
        if monomial in processed or any(
            _monomial_divides(divisor, monomial) for divisor in leading
        ):
            continue
        processed.append(monomial)
        vector = list(
            quotient_coordinates(
                ideal,
                _monomial(ideal, monomial),
                algorithm=algorithm,
                proof=proof,
            )
        )
        dependent, coefficients = _field_vector_dependence(vectors, vector, field)
        if dependent:
            relation = target._from_sparse_terms([(field(1), monomial)])
            for index in range(len(coefficients)):
                if coefficients[index] != field(0):
                    relation -= coefficients[index] * target._from_sparse_terms(
                        [(field(1), standard[index])]
                    )
            relations.append(relation)
            leading.append(monomial)
            continue
        standard.append(monomial)
        vectors.append(vector)
        if len(standard) > quotient_dimension:
            raise ArithmeticError("FGLM exceeded the quotient dimension")
        for variable in range(ideal._ring.ngens()):
            successor = list(monomial)
            successor[variable] += 1
            successor_tuple = tuple(successor)
            if successor_tuple not in processed and successor_tuple not in candidates:
                candidates.append(successor_tuple)
        candidates = _sort_monomial_exponents(candidates, target._order)
    if len(standard) != quotient_dimension:
        raise ArithmeticError("FGLM did not recover the quotient basis")
    ordered = _descending_polynomials(relations, target._order)
    contract = _groebner_contract()
    contract_ring = _groebner_contract_ring(target)
    packed = tuple(_pack_groebner_polynomial(value) for value in ordered)
    for right in range(len(packed)):
        for left in range(right):
            pair = contract.s_polynomial(packed[left], packed[right], contract_ring)
            if contract.normal_form(pair, packed, contract_ring):
                raise ArithmeticError("FGLM result failed Buchberger's criterion")
    return _sequence(ordered, target)


def transformed_basis(
    ideal: Any,
    other_ring: Any = None,
    algorithm: str = "fglm",
    proof: Any = None,
) -> Any:
    if algorithm != "fglm":
        raise ValueError("only algorithm='fglm' is currently supported")
    order = "lex" if other_ring is None else other_ring._order
    return fglm(ideal, order=order, proof=proof, other_ring=other_ring)


def variety(
    ideal: Any,
    ring: Any = None,
    algorithm: str = "fglm",
    proof: Any = None,
) -> list[Any]:
    field = ideal._ring.base_ring()
    if ring is not None and ring is not field:
        raise NotImplementedError(
            "variety currently solves only over the ideal's base field"
        )
    if algorithm != "fglm":
        raise ValueError("only algorithm='fglm' is currently supported")
    basis = fglm(ideal, order="lex", proof=proof)
    target = basis.universe()
    assignments = [None] * target.ngens()
    solutions = []

    def descend(variable: int) -> None:
        if variable < 0:
            values = list(assignments)
            if all(
                _evaluate_sparse_polynomial(generator, values) == field(0)
                for generator in ideal._generators
            ):
                solution = {}
                for index in range(ideal._ring.ngens()):
                    solution[ideal._ring.gen(index)] = values[index]
                solutions.append(solution)
            return
        equations = []
        for polynomial in basis:
            specialized = _specialize_univariate(polynomial, variable, assignments)
            if specialized is None or specialized.is_zero():
                continue
            if specialized.degree() == 0:
                return
            equations.append(specialized)
        if len(equations) == 0:
            raise ArithmeticError(
                "lexicographic basis did not constrain every variable"
            )
        selected = equations[0]
        for equation in equations[1:]:
            if equation.degree() < selected.degree():
                selected = equation
        for root in _base_field_roots(selected, field):
            if all(equation(root) == field(0) for equation in equations):
                assignments[variable] = root
                descend(variable - 1)
        assignments[variable] = None

    descend(target.ngens() - 1)
    return solutions


def vector_space_dimension(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    ideal_dimension = dimension(ideal, algorithm=algorithm, proof=proof)
    if ideal_dimension == -1:
        return 0
    if ideal_dimension != 0:
        symbolic = __import__("sagejs._baselib.symbolic", fromlist=["oo"])
        return symbolic.oo
    return len(standard_monomial_exponents(ideal, algorithm, proof))


def degree(ideal: Any, algorithm: str = "auto", proof: Any = None) -> int:
    value = dimension(ideal, algorithm=algorithm, proof=proof)
    if value == -1:
        return 0
    if value != 0:
        raise NotImplementedError(
            "degree currently supports zero-dimensional polynomial ideals"
        )
    return len(standard_monomial_exponents(ideal, algorithm, proof))
