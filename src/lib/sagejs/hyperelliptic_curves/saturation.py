"""Certified finite-prime saturation of rational Jacobian subgroups.

This module deliberately separates four assertions that are often conflated:

* the supplied divisors are independent;
* they have the full algebraic Mordell--Weil rank;
* their span is saturated at specified primes;
* a proved global index bound makes those local tests globally sufficient.

The reduction obstruction is elementary and exact.  If
``D = sum(a_i P_i)`` is divisible by a prime ``ell`` over ``QQ``, its image in
every good finite-field Jacobian lies in ``ell*J(F_q)``.  Certified invariant
factor coordinates turn this necessary condition into linear equations over
``F_ell``.  Full column rank rules out every nonzero coefficient vector.  A
surviving vector is only a candidate: bounded rational division searches may
find a larger subgroup, but failure to find a divisor is not a proof unless an
explicit exhaustive provider certifies it.

No analytic-rank input is accepted here.  Full-rank claims require a supplied
proved algebraic rank/Selmer upper bound, with provenance.  The implementation
is ordinary CPython-parseable Python and has no native or host dependency; the
default reduction provider lazily uses Sage.js's existing finite-field
Jacobian and explicit abelian-group maps, which also have dynamic fallbacks.
"""

from __future__ import annotations

from typing import Any, Mapping


SCHEMA = "sagejs.hyperelliptic.saturation-result.v1"
REDUCTION_SCHEMA = "sagejs.hyperelliptic.saturation-reduction-constraint.v1"
STEP_SCHEMA = "sagejs.hyperelliptic.saturation-basis-step.v1"


class SaturationResourceLimitError(RuntimeError):
    """A bounded saturation operation exhausted an explicit resource limit."""

    def __init__(self, message: str, diagnostics: Mapping[str, Any] | None = None):
        super().__init__(message)
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)


def _canonical_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    if isinstance(value, str):
        try:
            integer = int(value)
        except ValueError as error:
            raise TypeError(name + " must be an integer") from error
        if str(integer) != value:
            raise TypeError(name + " must be a canonical decimal integer")
        return integer
    try:
        integer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    if integer != value:
        raise TypeError(name + " must be an integer")
    return integer


def _is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value % 2 == 0:
        return value == 2
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def _checked_prime(value: Any, name: str = "prime") -> int:
    prime = _canonical_integer(value, name)
    if not _is_prime(prime):
        raise ValueError(name + " must be prime")
    return prime


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _product(values: Any) -> int:
    answer = 1
    for value in values:
        answer *= int(value)
    return answer


def _proof(provenance: Any, kind: str, value: Any) -> dict[str, Any]:
    if provenance is None:
        return {"kind": kind, "value": value, "proved": False, "source": None}
    if not hasattr(provenance, "get"):
        return {
            "kind": kind,
            "value": value,
            "proved": False,
            "source": str(provenance),
        }
    result = dict(provenance)
    result["kind"] = kind
    result["value"] = value
    result["proved"] = provenance.get("proved") is True
    if "source" not in result:
        result["source"] = None
    return result


def _wire(value: Any) -> Any:
    if value is None or isinstance(value, (bool, float, str)):
        return value
    if isinstance(value, int):
        return str(value)
    if isinstance(value, tuple) or isinstance(value, list):
        return tuple(_wire(item) for item in value)
    if hasattr(value, "items"):
        return {str(key): _wire(item) for key, item in value.items()}
    return str(value)


def _matrix_rank_and_nullspace(
    rows: Any, column_count: int, prime: int
) -> tuple[int, tuple[tuple[int, ...], ...]]:
    """Return rank and a canonical right-nullspace basis modulo ``prime``."""
    matrix = []
    for raw_row in rows:
        row = [int(value) % prime for value in raw_row]
        if len(row) != column_count:
            raise ValueError("a reduction-constraint row has the wrong length")
        if any(row):
            matrix.append(row)
    pivot_columns: list[int] = []
    pivot_row = 0
    for column in range(column_count):
        found = None
        for row_index in range(pivot_row, len(matrix)):
            if matrix[row_index][column] % prime:
                found = row_index
                break
        if found is None:
            continue
        matrix[pivot_row], matrix[found] = matrix[found], matrix[pivot_row]
        inverse = pow(matrix[pivot_row][column], prime - 2, prime)
        matrix[pivot_row] = [value * inverse % prime for value in matrix[pivot_row]]
        for row_index in range(len(matrix)):
            if row_index == pivot_row:
                continue
            scalar = matrix[row_index][column] % prime
            if scalar:
                matrix[row_index] = [
                    (matrix[row_index][index] - scalar * matrix[pivot_row][index])
                    % prime
                    for index in range(column_count)
                ]
        pivot_columns.append(column)
        pivot_row += 1
        if pivot_row == len(matrix):
            break
    free_columns = [
        column for column in range(column_count) if column not in pivot_columns
    ]
    basis = []
    for free_column in free_columns:
        vector = [0 for _index in range(column_count)]
        vector[free_column] = 1
        for row_index, pivot_column in enumerate(pivot_columns):
            vector[pivot_column] = -matrix[row_index][free_column] % prime
        basis.append(tuple(vector))
    return len(pivot_columns), tuple(basis)


def reduction_constraint(
    saturation_prime: Any,
    reduction_prime: Any,
    invariants: Any,
    point_coordinates: Any,
    *,
    map_certificate: Any = None,
) -> dict[str, Any]:
    """Build one exact finite-reduction divisibility constraint.

    ``point_coordinates[i]`` is the invariant-factor coordinate vector of the
    reduction of the ``i``-th rational generator.  Only cyclic factors whose
    order is divisible by ``saturation_prime`` contribute: in ``Z/nZ``, an
    element is in ``ell*(Z/nZ)`` exactly when its coordinate is zero modulo
    ``ell`` when ``ell`` divides ``n``.
    """
    prime = _checked_prime(saturation_prime, "saturation_prime")
    residue_prime = _checked_prime(reduction_prime, "reduction_prime")
    invariant_values = tuple(
        _canonical_integer(value, "invariant factor") for value in invariants
    )
    previous = 1
    for value in invariant_values:
        if value <= 1 or value % previous != 0:
            raise ValueError("invariant factors must be canonical")
        previous = value
    coordinates = tuple(
        tuple(_canonical_integer(value, "finite coordinate") for value in row)
        for row in point_coordinates
    )
    for row in coordinates:
        if len(row) != len(invariant_values):
            raise ValueError("a finite coordinate vector has the wrong length")
    equation_rows = []
    factor_indices = []
    for factor_index, invariant in enumerate(invariant_values):
        if invariant % prime == 0:
            equation_rows.append(
                tuple(row[factor_index] % prime for row in coordinates)
            )
            factor_indices.append(factor_index)
    rank, kernel = _matrix_rank_and_nullspace(equation_rows, len(coordinates), prime)
    certificate = {
        "schema": REDUCTION_SCHEMA,
        "saturation_prime": prime,
        "reduction_prime": residue_prime,
        "invariant_factors": invariant_values,
        "point_coordinates": coordinates,
        "ell_primary_factor_indices": tuple(factor_indices),
        "equation_rows": tuple(equation_rows),
        "equation_rank": rank,
        "kernel_basis": kernel,
        "map_certificate": map_certificate,
        "proof": (
            "reduction of an ell-divisible rational class lies in "
            "ell*J(F_q); invariant coordinates test membership in ell*J(F_q)"
        ),
    }
    return certificate


def verify_reduction_constraint(certificate: Mapping[str, Any]) -> bool:
    """Independently recheck a serialized reduction-constraint certificate."""
    if certificate.get("schema") != REDUCTION_SCHEMA:
        raise ValueError("unknown reduction-constraint schema")
    rebuilt = reduction_constraint(
        certificate["saturation_prime"],
        certificate["reduction_prime"],
        certificate["invariant_factors"],
        certificate["point_coordinates"],
        map_certificate=certificate.get("map_certificate"),
    )
    for key in (
        "ell_primary_factor_indices",
        "equation_rows",
        "equation_rank",
        "kernel_basis",
    ):
        if _wire(rebuilt[key]) != _wire(certificate[key]):
            raise ArithmeticError("reduction constraint has incorrect " + key)
    return True


def _floor_square_root_ratio(numerator: Any, denominator: Any) -> int:
    if numerator <= 0 or denominator <= 0:
        raise ValueError("regulator bounds must be positive")
    low = 0
    high = 1
    while high * high * denominator <= numerator:
        high *= 2
    while high - low > 1:
        middle = (low + high) // 2
        if middle * middle * denominator <= numerator:
            low = middle
        else:
            high = middle
    return low


def index_bound_from_regulator(
    subgroup_regulator_upper_bound: Any,
    full_lattice_regulator_lower_bound: Any,
    *,
    provenance: Any,
) -> dict[str, Any]:
    """Derive ``[MW:Gamma]`` from proved regulator inequalities.

    Since ``Reg(Gamma) = index^2*Reg(MW)``, proved bounds
    ``Reg(Gamma) <= R`` and ``Reg(MW) >= r`` imply
    ``index <= floor(sqrt(R/r))``.  This helper never upgrades unproved
    numerical estimates: ``provenance['proved']`` must be exactly ``True``.
    """
    proof = _proof(provenance, "regulator-index-bound", None)
    if not proof["proved"]:
        raise ValueError("a regulator index bound requires proved provenance")
    bound = _floor_square_root_ratio(
        subgroup_regulator_upper_bound, full_lattice_regulator_lower_bound
    )
    if bound < 1:
        raise ArithmeticError("the regulator bounds imply an impossible index")
    proof["value"] = bound
    proof["subgroup_regulator_upper_bound"] = subgroup_regulator_upper_bound
    proof["full_lattice_regulator_lower_bound"] = full_lattice_regulator_lower_bound
    proof["formula"] = "index^2 = Reg(Gamma)/Reg(MW)"
    return proof


def index_bound_from_height(
    subgroup_regulator_upper_bound: Any,
    nonzero_height_lower_bound: Any,
    rank: Any,
    hermite_constant_upper_bound: Any,
    *,
    provenance: Any,
) -> dict[str, Any]:
    """Derive an index bound using a supplied proved Hermite inequality.

    If every nonzero Mordell--Weil vector has canonical height at least ``h``
    and ``gamma`` is a proved upper bound for the rank-``r`` Hermite constant,
    then ``Reg(MW) >= (h/gamma)^r``.  The caller must provide the theorem and
    hypotheses in proved provenance; this module does not infer them from a
    floating-point height search.
    """
    rank_value = _canonical_integer(rank, "rank")
    if rank_value < 1:
        raise ValueError("the height index bound requires positive rank")
    proof = _proof(provenance, "height-index-bound", None)
    if not proof["proved"]:
        raise ValueError("a height index bound requires proved provenance")
    if nonzero_height_lower_bound <= 0 or hermite_constant_upper_bound <= 0:
        raise ValueError("height and Hermite bounds must be positive")
    regulator_lower = (
        nonzero_height_lower_bound / hermite_constant_upper_bound
    ) ** rank_value
    result = index_bound_from_regulator(
        subgroup_regulator_upper_bound,
        regulator_lower,
        provenance=proof,
    )
    result["kind"] = "height-index-bound"
    result["nonzero_height_lower_bound"] = nonzero_height_lower_bound
    result["hermite_constant_upper_bound"] = hermite_constant_upper_bound
    result["rank"] = rank_value
    return result


def _divisor_wire(divisor: Any) -> dict[str, Any]:
    if hasattr(divisor, "uv"):
        u_value, v_value = divisor.uv()
        return {
            "representation": "mumford",
            "u_coefficients_ascending": tuple(str(value) for value in u_value.list()),
            "v_coefficients_ascending": tuple(str(value) for value in v_value.list()),
        }
    return {"representation": "opaque", "value": str(divisor)}


def _linear_combination(points: Any, coefficients: Any, zero: Any) -> Any:
    answer = zero
    for point, coefficient in zip(points, coefficients, strict=True):
        if coefficient:
            answer = _add_points(answer, _scalar_multiple(point, coefficient))
    return answer


def _add_points(left: Any, right: Any) -> Any:
    method = getattr(left, "_add_", None)
    if method is not None:
        return method(right)
    method = getattr(left, "__add__", None)
    if method is not None:
        return method(right)
    return left + right


def _scalar_multiple(point: Any, scalar: int) -> Any:
    method = getattr(point, "scalar_multiple", None)
    if method is not None:
        return method(scalar)
    method = getattr(point, "__rmul__", None)
    if method is not None:
        return method(scalar)
    return scalar * point


def _basis_enlargement(
    basis: Any, coefficients: Any, prime: int, root: Any, zero: Any
) -> tuple[tuple[Any, ...], dict[str, Any]]:
    old_basis = tuple(basis)
    raw = tuple(int(value) % prime for value in coefficients)
    pivot = None
    for index, value in enumerate(raw):
        if value:
            pivot = index
            break
    if pivot is None:
        raise ValueError("a division relation must be nonzero modulo ell")
    target = _linear_combination(old_basis, raw, zero)
    if _scalar_multiple(root, prime) != target:
        raise ArithmeticError("a proposed division point does not divide the target")
    inverse = pow(raw[pivot], prime - 2, prime)
    scaled = tuple(inverse * value for value in raw)
    normalized = tuple(value % prime for value in scaled)
    corrections = tuple(
        (scaled[index] - normalized[index]) // prime for index in range(len(old_basis))
    )
    new_point = _scalar_multiple(root, inverse)
    for point, correction in zip(old_basis, corrections, strict=True):
        if correction:
            new_point = _add_points(new_point, -_scalar_multiple(point, correction))
    normalized_target = _linear_combination(old_basis, normalized, zero)
    if _scalar_multiple(new_point, prime) != normalized_target:
        raise ArithmeticError("failed to normalize an exact division relation")
    new_basis = list(old_basis)
    new_basis[pivot] = new_point
    old_from_new = []
    for row_index in range(len(old_basis)):
        row = [0 for _index in old_basis]
        if row_index == pivot:
            for column, value in enumerate(normalized):
                if column != pivot:
                    row[column] = -value
            row[pivot] = prime
        else:
            row[row_index] = 1
        old_from_new.append(tuple(row))
    for row_index, old_point in enumerate(old_basis):
        rebuilt = _linear_combination(new_basis, old_from_new[row_index], zero)
        if rebuilt != old_point:
            raise ArithmeticError("the basis-change matrix failed exact verification")
    step = {
        "schema": STEP_SCHEMA,
        "prime": prime,
        "raw_relation_coefficients": raw,
        "normalized_relation_coefficients": normalized,
        "pivot": pivot,
        "old_basis_from_new": tuple(old_from_new),
        "index_factor": prime,
        "target": _divisor_wire(target),
        "division_point": _divisor_wire(root),
        "new_generator": _divisor_wire(new_point),
        "proof": "exactly verified ell*Q=sum(a_i*P_i)",
        "_old_basis": old_basis,
        "_new_basis": tuple(new_basis),
    }
    return tuple(new_basis), step


def _projective_kernel_vectors(
    kernel_basis: Any, prime: int, maximum: int
) -> tuple[tuple[int, ...], ...]:
    basis = tuple(tuple(int(value) % prime for value in row) for row in kernel_basis)
    if not basis:
        return ()
    total = prime ** len(basis) - 1
    if total > maximum * (prime - 1):
        raise SaturationResourceLimitError(
            "candidate division space exceeds max_division_vectors=" + str(maximum),
            {
                "prime": prime,
                "kernel_dimension": len(basis),
                "raw_nonzero_vectors": total,
                "max_division_vectors": maximum,
            },
        )
    answer = []
    seen = set()
    for encoded in range(1, prime ** len(basis)):
        value = encoded
        coefficients = []
        for _index in basis:
            coefficients.append(value % prime)
            value //= prime
        vector = [0 for _entry in basis[0]]
        for scalar, basis_vector in zip(coefficients, basis, strict=True):
            for index in range(len(vector)):
                vector[index] = (vector[index] + scalar * basis_vector[index]) % prime
        pivot_value = next(entry for entry in vector if entry)
        inverse = pow(pivot_value, prime - 2, prime)
        canonical = tuple(entry * inverse % prime for entry in vector)
        if canonical not in seen:
            seen.add(canonical)
            answer.append(canonical)
            if len(answer) > maximum:
                raise SaturationResourceLimitError(
                    "candidate division space exceeds max_division_vectors="
                    + str(maximum)
                )
    return tuple(answer)


def _normalize_division_answer(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {
            "status": "unavailable",
            "candidates": (),
            "exhaustive": False,
            "certificate": None,
        }
    if hasattr(raw, "get"):
        status = str(raw.get("status", "candidates"))
        candidate = raw.get("point", raw.get("root"))
        candidates = raw.get("candidates", ())
        if candidate is not None:
            candidates = (candidate,)
        return {
            "status": status,
            "candidates": tuple(candidates),
            "exhaustive": raw.get("exhaustive") is True
            and raw.get("certified") is True,
            "certificate": raw.get("certificate"),
        }
    if isinstance(raw, tuple) or isinstance(raw, list):
        return {
            "status": "candidates",
            "candidates": tuple(raw),
            "exhaustive": False,
            "certificate": None,
        }
    return {
        "status": "candidates",
        "candidates": (raw,),
        "exhaustive": False,
        "certificate": None,
    }


def _division_answer(
    jacobian: Any,
    target: Any,
    prime: int,
    division_search: Any,
    division_candidates: Any,
    maximum: int,
) -> dict[str, Any]:
    raw = None
    if division_search is not None:
        raw = division_search(target, prime, maximum)
    elif division_candidates is not None:
        if hasattr(division_candidates, "get"):
            raw = division_candidates.get(prime, ())
        else:
            raw = division_candidates
    else:
        for name in (
            "division_points",
            "preimages_under_multiplication",
            "divide_by_prime",
        ):
            method = getattr(jacobian, name, None)
            if method is not None:
                raw = method(target, prime, max_candidates=maximum)
                break
    answer = _normalize_division_answer(raw)
    candidates = answer["candidates"]
    if len(candidates) > maximum:
        raise SaturationResourceLimitError(
            "rational division exceeds max_division_candidates=" + str(maximum),
            {"prime": prime, "candidate_count": len(candidates)},
        )
    checked = 0
    for candidate in candidates:
        checked += 1
        try:
            candidate = jacobian(candidate)
        except (TypeError, ValueError):
            pass
        if _scalar_multiple(candidate, prime) == target:
            return {
                "status": "found",
                "point": candidate,
                "checked_candidates": checked,
                "exhaustive": answer["exhaustive"],
                "certificate": answer["certificate"],
            }
    return {
        "status": "not_found" if candidates or answer["exhaustive"] else "unavailable",
        "point": None,
        "checked_candidates": checked,
        "exhaustive": answer["exhaustive"],
        "certificate": answer["certificate"],
    }


def _reduce_coefficient(field: Any, value: Any, prime: int) -> Any:
    denominator: Any = getattr(value, "_denominator", None)
    if denominator is None and hasattr(value, "denominator"):
        denominator_value = value.denominator
        denominator = (
            denominator_value() if callable(denominator_value) else denominator_value
        )
    if denominator is None:
        denominator = 1
    if int(denominator) % prime == 0:
        raise ArithmeticError("a divisor is not integral at the reduction prime")
    return field(value)


def _default_reduction_data(
    jacobian: Any,
    points: Any,
    reduction_prime: int,
    *,
    max_group_operations: int,
    max_baby_steps: int,
    max_memory_bytes: int,
    seed: Any,
) -> dict[str, Any]:
    frobenius = __import__(
        "sagejs.hyperelliptic_curves.frobenius",
        fromlist=["_rational_reduction"],
    )
    jacobian_module = __import__(
        "sagejs.hyperelliptic_curves.jacobian", fromlist=["Jacobian"]
    )
    reduced_curve = frobenius._rational_reduction(jacobian.curve(), reduction_prime)
    reduced_jacobian = jacobian_module.Jacobian(reduced_curve)
    group, homomorphism = reduced_jacobian.abelian_group(
        max_group_operations=max_group_operations,
        max_baby_steps=max_baby_steps,
        max_memory_bytes=max_memory_bytes,
        seed=seed,
    )
    field = reduced_jacobian.base_ring()
    ring = reduced_jacobian.polynomial_ring()
    coordinate_rows = []
    reduced_points = []
    for point in points:
        if not hasattr(point, "uv"):
            raise NotImplementedError(
                "the default reduction provider requires Mumford divisors"
            )
        u_value, v_value = point.uv()
        reduced_u = ring(
            [
                _reduce_coefficient(field, value, reduction_prime)
                for value in u_value.list()
            ]
        )
        reduced_v = ring(
            [
                _reduce_coefficient(field, value, reduction_prime)
                for value in v_value.list()
            ]
        )
        reduced_point = reduced_jacobian([reduced_u, reduced_v])
        reduced_points.append(reduced_point)
        coordinate_rows.append(tuple(homomorphism.preimage(reduced_point)))
    certificate = None
    try:
        certificate = reduced_jacobian.group_structure_certificate(seed=seed)
    except (NotImplementedError, RuntimeError):
        # The explicit map has already verified its group basis.  Retaining the
        # larger serialized certificate is useful but not required twice.
        certificate = {"map_verified": bool(homomorphism.verify())}
    return {
        "reduction_prime": reduction_prime,
        "invariants": tuple(group.invariants()),
        "point_coordinates": tuple(coordinate_rows),
        "map_certificate": certificate,
        "reduced_points": tuple(_divisor_wire(point) for point in reduced_points),
    }


def _combined_constraint(
    saturation_prime: int,
    basis: Any,
    reductions: Any,
) -> tuple[int, tuple[tuple[int, ...], ...], tuple[tuple[int, ...], ...]]:
    rows = []
    for certificate in reductions:
        rows.extend(certificate["equation_rows"])
    rank, kernel = _matrix_rank_and_nullspace(rows, len(tuple(basis)), saturation_prime)
    return rank, kernel, tuple(rows)


def _obtain_independence(
    jacobian: Any, points: Any, supplied: Any, use_height_pairing: bool
) -> dict[str, Any]:
    if len(tuple(points)) == 0:
        return {
            "kind": "independence",
            "proved": True,
            "source": "empty-basis",
            "rank": 0,
        }
    proof = _proof(supplied, "independence", len(tuple(points)))
    if proof["proved"] or not use_height_pairing:
        return proof
    method = getattr(jacobian, "height_pairing", None)
    if method is None:
        return proof
    pairing = method(tuple(points))
    proved = bool(
        getattr(pairing, "independence_proved", False)
        or getattr(pairing, "certified_positive_definite", False)
    )
    if hasattr(pairing, "get"):
        proved = (
            pairing.get("independence_proved") is True
            or pairing.get("certified_positive_definite") is True
        )
    if proved:
        return {
            "kind": "independence",
            "proved": True,
            "source": "certified-height-pairing",
            "rank": len(tuple(points)),
            "certificate": getattr(pairing, "certificate", pairing),
        }
    return proof


def _rank_status(
    point_count: int,
    independence: Mapping[str, Any],
    algebraic_rank: Any,
    algebraic_rank_provenance: Any,
    selmer_rank_upper_bound: Any,
    selmer_provenance: Any,
) -> dict[str, Any]:
    claims = []
    exact_rank = None
    rank_upper = None
    if algebraic_rank is not None:
        value = _canonical_integer(algebraic_rank, "algebraic_rank")
        if value < 0:
            raise ValueError("algebraic_rank must be nonnegative")
        claim = _proof(algebraic_rank_provenance, "algebraic-rank", value)
        claims.append(claim)
        if claim["proved"]:
            exact_rank = value
            rank_upper = value
    if selmer_rank_upper_bound is not None:
        value = _canonical_integer(selmer_rank_upper_bound, "selmer_rank_upper_bound")
        if value < 0:
            raise ValueError("selmer_rank_upper_bound must be nonnegative")
        claim = _proof(selmer_provenance, "selmer-rank-upper-bound", value)
        claims.append(claim)
        if claim["proved"] and (rank_upper is None or value < rank_upper):
            rank_upper = value
    if independence.get("proved") is True and rank_upper is not None:
        if rank_upper < point_count:
            raise ArithmeticError(
                "the proved rank upper bound contradicts the independent subgroup"
            )
    full = independence.get("proved") is True and rank_upper == point_count
    return {
        "supplied_generator_count": point_count,
        "independence_proved": independence.get("proved") is True,
        "exact_algebraic_rank": exact_rank,
        "proved_rank_upper_bound": rank_upper,
        "full_rank_proved": full,
        "claims": tuple(claims),
        "analytic_rank_used": False,
    }


def _primes_up_to(bound: int, maximum_count: int) -> tuple[int, ...]:
    answer = []
    for candidate in range(2, bound + 1):
        if _is_prime(candidate):
            answer.append(candidate)
            if len(answer) > maximum_count:
                raise SaturationResourceLimitError(
                    "global index bound requires more than max_global_primes="
                    + str(maximum_count),
                    {"index_bound": bound, "max_global_primes": maximum_count},
                )
    return tuple(answer)


class SaturationResult:
    """An honest subgroup/saturation result with independently labeled claims."""

    def __init__(
        self,
        jacobian: Any,
        input_basis: Any,
        basis: Any,
        independence: Any,
        rank_status: Any,
        prime_results: Any,
        basis_steps: Any,
        index_bound: Any,
        global_status: Any,
        diagnostics: Any,
    ) -> None:
        self.jacobian = jacobian
        self.input_basis = tuple(input_basis)
        self.basis = tuple(basis)
        self.independence = dict(independence)
        self.rank_status = dict(rank_status)
        self.prime_results = tuple(prime_results)
        self.basis_steps = tuple(basis_steps)
        self.index_factor_from_input = _product(
            step["index_factor"] for step in self.basis_steps
        )
        self.index_bound = None if index_bound is None else dict(index_bound)
        self.global_status = dict(global_status)
        self.diagnostics = dict(diagnostics)
        self.s_saturated_primes = tuple(
            row["prime"]
            for row in self.prime_results
            if row["ambient_subgroup_saturated"] is True
        )
        self.free_quotient_saturated_primes = tuple(
            row["prime"]
            for row in self.prime_results
            if row["free_quotient_saturated"] is True
        )
        self.ambient_saturated_primes = self.s_saturated_primes
        self.global_saturation_proved = (
            self.global_status.get("global_saturation_proved") is True
        )
        self.global_free_quotient_saturation_proved = self.global_saturation_proved
        self.full_mordell_weil_group_proved = (
            self.global_saturation_proved
            and self.rank_status.get("full_rank_proved") is True
            and self.global_status.get("torsion_subgroup_included") is True
        )

    def __repr__(self) -> str:
        return (
            "SaturationResult(S="
            + repr(self.s_saturated_primes)
            + ", index_factor="
            + str(self.index_factor_from_input)
            + ", full_rank_proved="
            + str(self.rank_status.get("full_rank_proved") is True)
            + ", global_saturation_proved="
            + str(self.global_saturation_proved)
            + ")"
        )

    def to_dict(self) -> dict[str, Any]:
        """Return a deterministic JSON/SQLite-friendly certificate record."""
        public_steps = []
        for step in self.basis_steps:
            public_steps.append(
                {key: value for key, value in step.items() if not key.startswith("_")}
            )
        return {
            "schema": SCHEMA,
            "input_basis": tuple(_divisor_wire(point) for point in self.input_basis),
            "basis": tuple(_divisor_wire(point) for point in self.basis),
            "independence": _wire(self.independence),
            "rank_status": _wire(self.rank_status),
            "prime_results": _wire(self.prime_results),
            "basis_steps": _wire(public_steps),
            "index_factor_from_input": str(self.index_factor_from_input),
            "index_bound": _wire(self.index_bound),
            "global_status": _wire(self.global_status),
            "diagnostics": _wire(self.diagnostics),
        }

    def verify(self) -> bool:
        """Recheck every finite reduction and exact basis transformation."""
        for prime_result in self.prime_results:
            for certificate in prime_result["reduction_certificates"]:
                verify_reduction_constraint(certificate)
        basis = tuple(self.input_basis)
        for step in self.basis_steps:
            if step.get("schema") != STEP_SCHEMA:
                raise ValueError("unknown saturation basis-step schema")
            if tuple(step.get("_old_basis", ())) != basis:
                raise ArithmeticError("a basis-step chain is discontinuous")
            new_basis = tuple(step.get("_new_basis", ()))
            matrix = step["old_basis_from_new"]
            prime = int(step["prime"])
            if abs(_determinant_integer(matrix)) != prime:
                raise ArithmeticError("a basis step has the wrong determinant")
            zero = self.jacobian.zero()
            for row_index, old_point in enumerate(basis):
                if _linear_combination(new_basis, matrix[row_index], zero) != old_point:
                    raise ArithmeticError("a basis transformation is not exact")
            basis = new_basis
        if basis != self.basis:
            raise ArithmeticError("the basis-step chain has the wrong final basis")
        return True


def _determinant_integer(matrix: Any) -> int:
    rows = [list(int(value) for value in row) for row in matrix]
    size = len(rows)
    if any(len(row) != size for row in rows):
        raise ValueError("a basis matrix must be square")
    if size == 0:
        return 1
    sign = 1
    denominator = 1
    for column in range(size - 1):
        pivot = column
        while pivot < size and rows[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            return 0
        if pivot != column:
            rows[column], rows[pivot] = rows[pivot], rows[column]
            sign = -sign
        pivot_value = rows[column][column]
        for row_index in range(column + 1, size):
            for target in range(column + 1, size):
                numerator = (
                    rows[row_index][target] * pivot_value
                    - rows[row_index][column] * rows[column][target]
                )
                if numerator % denominator:
                    raise ArithmeticError("fraction-free determinant was not exact")
                rows[row_index][target] = numerator // denominator
            rows[row_index][column] = 0
        denominator = pivot_value
    return sign * rows[-1][-1]


def saturate_subgroup(
    jacobian: Any,
    points: Any,
    *,
    primes: Any = (),
    reduction_primes: Any = (),
    reduction_provider: Any = None,
    division_search: Any = None,
    division_candidates: Any = None,
    independence_certificate: Any = None,
    use_height_pairing: bool = True,
    algebraic_rank: Any = None,
    algebraic_rank_provenance: Any = None,
    selmer_rank_upper_bound: Any = None,
    selmer_provenance: Any = None,
    torsion_order: Any = 1,
    torsion_provenance: Any = None,
    torsion_subgroup_included: bool = False,
    torsion_inclusion_provenance: Any = None,
    global_index_bound: Any = None,
    global_index_bound_provenance: Any = None,
    exact_subgroup_index: Any = None,
    exact_subgroup_index_provenance: Any = None,
    possible_index_primes: Any = None,
    possible_index_primes_provenance: Any = None,
    regulator_upper_bound: Any = None,
    full_lattice_regulator_lower_bound: Any = None,
    height_lower_bound: Any = None,
    hermite_constant_upper_bound: Any = None,
    index_bound_provenance: Any = None,
    max_division_vectors: int = 10_000,
    max_division_candidates: int = 100_000,
    max_enlargements: int = 64,
    max_global_primes: int = 10_000,
    max_group_operations: int = 10_000_000,
    max_baby_steps: int = 1_000_000,
    max_memory_bytes: int = 256 * 1024 * 1024,
    seed: Any = 0,
) -> SaturationResult:
    """Saturate a supplied rational subgroup within explicit proof boundaries.

    The returned object can prove finite-prime saturation using only reduction
    maps.  Full rank and a global index are independent claims.  Bare supplied
    rank/index numbers are recorded but are used as proofs only when their
    provenance mapping contains ``proved=True``.
    """
    basis = tuple(points)
    zero = jacobian.zero()
    for point in basis:
        if hasattr(point, "parent") and point.parent() is not jacobian:
            raise ValueError("every supplied point must lie in this Jacobian")
    prime_values = tuple(sorted({_checked_prime(value) for value in primes}))
    residue_primes = tuple(
        sorted({_checked_prime(value, "reduction_prime") for value in reduction_primes})
    )
    for name, value in (
        ("max_division_vectors", max_division_vectors),
        ("max_division_candidates", max_division_candidates),
        ("max_enlargements", max_enlargements),
        ("max_global_primes", max_global_primes),
    ):
        if _canonical_integer(value, name) < 0:
            raise ValueError(name + " must be nonnegative")

    independence = _obtain_independence(
        jacobian, basis, independence_certificate, use_height_pairing
    )
    rank_status = _rank_status(
        len(basis),
        independence,
        algebraic_rank,
        algebraic_rank_provenance,
        selmer_rank_upper_bound,
        selmer_provenance,
    )
    torsion_value = _canonical_integer(torsion_order, "torsion_order")
    if torsion_value < 1:
        raise ValueError("torsion_order must be positive")
    torsion_proof = _proof(torsion_provenance, "rational-torsion-order", torsion_value)
    torsion_inclusion = _proof(
        torsion_inclusion_provenance,
        "torsion-subgroup-included",
        bool(torsion_subgroup_included),
    )
    torsion_complete = torsion_proof.get("proved") is True and (
        torsion_value == 1
        or (
            torsion_subgroup_included is True
            and torsion_inclusion.get("proved") is True
        )
    )
    bound_record = None
    if exact_subgroup_index is not None:
        exact_value = _canonical_integer(exact_subgroup_index, "exact_subgroup_index")
        if exact_value < 1:
            raise ValueError("exact_subgroup_index must be positive")
        bound_record = _proof(
            exact_subgroup_index_provenance, "exact-subgroup-index", exact_value
        )
        bound_record["exact"] = True
    elif global_index_bound is not None:
        bound_value = _canonical_integer(global_index_bound, "global_index_bound")
        if bound_value < 1:
            raise ValueError("global_index_bound must be positive")
        bound_record = _proof(
            global_index_bound_provenance, "global-index-upper-bound", bound_value
        )
        bound_record["exact"] = False
    elif (
        regulator_upper_bound is not None
        and full_lattice_regulator_lower_bound is not None
    ):
        bound_record = index_bound_from_regulator(
            regulator_upper_bound,
            full_lattice_regulator_lower_bound,
            provenance=index_bound_provenance,
        )
        bound_record["exact"] = False
    elif (
        regulator_upper_bound is not None
        and height_lower_bound is not None
        and hermite_constant_upper_bound is not None
    ):
        bound_record = index_bound_from_height(
            regulator_upper_bound,
            height_lower_bound,
            len(basis),
            hermite_constant_upper_bound,
            provenance=index_bound_provenance,
        )
        bound_record["exact"] = False
    elif hasattr(jacobian, "subgroup_index_bound"):
        raw_bound = jacobian.subgroup_index_bound(basis)
        if hasattr(raw_bound, "get"):
            bound_record = dict(raw_bound)
            if "value" not in bound_record:
                bound_record = None

    steps = []
    prime_results = []
    diagnostics: dict[str, Any] = {
        "reduction_attempts": 0,
        "reduction_failures": [],
        "division_vectors": 0,
        "division_candidates_checked": 0,
        "resource_limits": [],
    }

    requested_index = 0
    while requested_index < len(prime_values):
        prime = prime_values[requested_index]
        requested_index += 1
        reductions = []
        failures = []
        for reduction_index, residue_prime in enumerate(residue_primes):
            diagnostics["reduction_attempts"] += 1
            try:
                if reduction_provider is None:
                    data = _default_reduction_data(
                        jacobian,
                        basis,
                        residue_prime,
                        max_group_operations=max_group_operations,
                        max_baby_steps=max_baby_steps,
                        max_memory_bytes=max_memory_bytes,
                        seed=(None if seed is None else int(seed) + reduction_index),
                    )
                else:
                    data = reduction_provider(jacobian, basis, residue_prime)
                certificate = reduction_constraint(
                    prime,
                    residue_prime,
                    data["invariants"],
                    data["point_coordinates"],
                    map_certificate=data.get("map_certificate"),
                )
                reductions.append(certificate)
            except (ArithmeticError, NotImplementedError, RuntimeError) as error:
                failure = {
                    "prime": residue_prime,
                    "type": type(error).__name__,
                    "reason": str(error),
                }
                if hasattr(error, "diagnostics"):
                    failure["diagnostics"] = getattr(error, "diagnostics")
                failures.append(failure)
                diagnostics["reduction_failures"].append(failure)
        rank, kernel, combined_rows = _combined_constraint(prime, basis, reductions)
        search_records = []
        resource = None
        enlarged = False
        exhaustive_not_found = True
        if kernel:
            try:
                vectors = _projective_kernel_vectors(
                    kernel, prime, max_division_vectors
                )
                diagnostics["division_vectors"] += len(vectors)
                for vector in vectors:
                    target = _linear_combination(basis, vector, zero)
                    answer = _division_answer(
                        jacobian,
                        target,
                        prime,
                        division_search,
                        division_candidates,
                        max_division_candidates,
                    )
                    diagnostics["division_candidates_checked"] += answer[
                        "checked_candidates"
                    ]
                    search_records.append(
                        {
                            "relation": vector,
                            "status": answer["status"],
                            "checked_candidates": answer["checked_candidates"],
                            "exhaustive": answer["exhaustive"],
                            "certificate": answer["certificate"],
                        }
                    )
                    if answer["status"] == "found":
                        if len(steps) >= max_enlargements:
                            raise SaturationResourceLimitError(
                                "saturation exceeds max_enlargements="
                                + str(max_enlargements)
                            )
                        basis, step = _basis_enlargement(
                            basis, vector, prime, answer["point"], zero
                        )
                        steps.append(step)
                        enlarged = True
                        break
                    if not answer["exhaustive"]:
                        exhaustive_not_found = False
            except SaturationResourceLimitError as error:
                resource = {
                    "type": type(error).__name__,
                    "reason": str(error),
                    "diagnostics": error.diagnostics,
                }
                diagnostics["resource_limits"].append(resource)
                exhaustive_not_found = False
        if enlarged:
            # The new basis has index ell less in the input basis.  Re-run the
            # same prime from fresh reductions until no further enlargement is
            # found or a proof/resource result terminates it.
            requested_index -= 1
            continue
        relation_obstruction = rank == len(basis)
        exact_search_proof = bool(kernel) and exhaustive_not_found and resource is None
        ambient_saturated = independence.get("proved") is True and (
            relation_obstruction or exact_search_proof
        )
        free_quotient_saturated = (
            ambient_saturated
            and torsion_proof.get("proved") is True
            and _gcd(torsion_value, prime) == 1
        )
        if free_quotient_saturated:
            status = "free_quotient_saturated"
        elif ambient_saturated:
            status = "ambient_subgroup_saturated_torsion_unresolved"
        elif resource is not None:
            status = "resource_limit"
        elif independence.get("proved") is not True and relation_obstruction:
            status = "relation_obstruction_only_independence_unproved"
        elif kernel:
            status = "unresolved_division_candidates"
        else:
            status = "unsupported_no_reduction_constraints"
        prime_results.append(
            {
                "prime": prime,
                "status": status,
                "ambient_subgroup_saturated": ambient_saturated,
                "free_quotient_saturated": free_quotient_saturated,
                "constraint_rank": rank,
                "generator_count": len(basis),
                "kernel_basis": kernel,
                "combined_equation_rows": combined_rows,
                "reduction_certificates": tuple(reductions),
                "reduction_failures": tuple(failures),
                "division_searches": tuple(search_records),
                "resource_limit": resource,
                "torsion_coprime": _gcd(torsion_value, prime) == 1,
            }
        )

    factor_from_input = _product(step["index_factor"] for step in steps)
    possible_prime_values = None
    possible_prime_proof = None
    if possible_index_primes is not None:
        possible_prime_values = tuple(possible_index_primes)
        possible_prime_proof = _proof(
            possible_index_primes_provenance,
            "possible-index-primes",
            possible_prime_values,
        )
    global_status: dict[str, Any] = {
        "global_saturation_proved": False,
        "full_rank_proved": rank_status["full_rank_proved"],
        "required_primes": (),
        "missing_primes": (),
        "remaining_index_bound": None,
        "torsion_subgroup_included": torsion_complete,
        "torsion_status": torsion_proof,
        "torsion_inclusion_status": torsion_inclusion,
        "possible_index_primes_status": possible_prime_proof,
        "reason": "no proved global index bound",
    }
    if bound_record is not None:
        if bound_record.get("proved") is not True:
            global_status["reason"] = "the supplied index bound is not proved"
        else:
            original_bound = _canonical_integer(bound_record["value"], "index bound")
            if bound_record.get("exact") is True:
                if original_bound % factor_from_input:
                    raise ArithmeticError(
                        "the exact subgroup index is incompatible with enlargements"
                    )
                remaining_bound = original_bound // factor_from_input
            else:
                remaining_bound = original_bound // factor_from_input
                if remaining_bound < 1:
                    raise ArithmeticError(
                        "the proved index bound is incompatible with enlargements"
                    )
            global_status["remaining_index_bound"] = remaining_bound
            if bound_record.get("exact") is True and remaining_bound != 1:
                global_status["reason"] = "a proved nontrivial exact index remains"
            elif not rank_status["full_rank_proved"]:
                global_status["reason"] = "full algebraic rank is not proved"
            else:
                try:
                    if remaining_bound == 1:
                        required_primes = ()
                    elif (
                        possible_prime_values is not None
                        and possible_prime_proof is not None
                        and possible_prime_proof.get("proved") is True
                    ):
                        required_primes = tuple(
                            sorted(
                                {
                                    _checked_prime(value, "possible index prime")
                                    for value in possible_prime_values
                                    if int(value) <= remaining_bound
                                }
                            )
                        )
                    else:
                        required_primes = _primes_up_to(
                            remaining_bound, max_global_primes
                        )
                    saturated = {
                        row["prime"]
                        for row in prime_results
                        if row["free_quotient_saturated"] is True
                    }
                    missing = tuple(
                        prime for prime in required_primes if prime not in saturated
                    )
                    global_status["required_primes"] = required_primes
                    global_status["missing_primes"] = missing
                    global_status["global_saturation_proved"] = not missing
                    global_status["reason"] = (
                        "proved index bound and finite-prime saturation"
                        if not missing
                        else "required saturation primes remain"
                    )
                except SaturationResourceLimitError as error:
                    resource = {
                        "type": type(error).__name__,
                        "reason": str(error),
                        "diagnostics": error.diagnostics,
                    }
                    diagnostics["resource_limits"].append(resource)
                    global_status["reason"] = "global prime enumeration resource limit"
                    global_status["resource_limit"] = resource

    return SaturationResult(
        jacobian,
        points,
        basis,
        independence,
        rank_status,
        prime_results,
        steps,
        bound_record,
        global_status,
        diagnostics,
    )


__all__ = [
    "REDUCTION_SCHEMA",
    "SCHEMA",
    "STEP_SCHEMA",
    "SaturationResourceLimitError",
    "SaturationResult",
    "index_bound_from_height",
    "index_bound_from_regulator",
    "reduction_constraint",
    "saturate_subgroup",
    "verify_reduction_constraint",
]
