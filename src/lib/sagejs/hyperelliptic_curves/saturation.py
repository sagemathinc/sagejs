"""Certified finite-prime saturation of rational Jacobian subgroups.

This module deliberately separates four assertions that are often conflated:

* the supplied divisors are independent;
* they have the full algebraic Mordell--Weil rank;
* their span is saturated at specified primes;
* a proved global index bound makes those local tests globally sufficient.

The reduction obstruction is elementary and exact.  If
`D = sum(a_i P_i)` is divisible by a prime `ell` over `QQ`, its image in
every good finite-field Jacobian lies in `ell*J(F_q)`.  Certified invariant
factor coordinates turn this necessary condition into linear equations over
`F_ell`.  Full column rank rules out every nonzero coefficient vector.  A
surviving vector is only a candidate: bounded rational division searches may
find a larger subgroup, but failure to find a divisor is not a proof unless a
typed verifier certifies that the replayed search box is globally exhaustive.

No analytic-rank input is accepted here.  Full-rank claims require a supplied
proved algebraic rank/Selmer upper bound, with provenance.  The implementation
is ordinary CPython-parseable Python and has no native or host dependency; the
default reduction provider lazily uses Sage.js's existing finite-field
Jacobian and explicit abelian-group maps, which also have dynamic fallbacks.

Registered `assumption_verifiers` are an explicit caller-provided trust
root.  This module binds their decisions to the curve, ordered basis, claim
kind, and value, but it cannot authenticate a verifier chosen by the caller.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

import sagejs.runtime as runtime

SCHEMA = "sagejs.hyperelliptic.saturation-result.v2"
REDUCTION_SCHEMA = "sagejs.hyperelliptic.saturation-reduction-constraint.v1"
STEP_SCHEMA = "sagejs.hyperelliptic.saturation-basis-step.v1"
VERIFIED_REDUCTION_SCHEMA = "sagejs.hyperelliptic.verified-reduction-record.v1"
DIVISION_SEARCH_SCHEMA = "sagejs.hyperelliptic.rational-division-search.v2"
ASSUMPTION_SCHEMA = "sagejs.hyperelliptic.verified-assumption.v1"
EXHAUSTIVE_REDUCTION_GROUP_LIMIT = 512


class SaturationResourceLimitError(RuntimeError):
    """A bounded saturation operation exhausted an explicit resource limit."""

    def __init__(
        self, message: str, diagnostics: Mapping[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)


class FrozenRecord:
    """A tiny immutable mapping used by public certificate results."""

    __slots__ = ("_entries", "_frozen")
    _entries: tuple[tuple[str, Any], ...]

    def __init__(self, values: Mapping[str, Any]) -> None:
        self._entries = tuple(
            (str(key), _freeze(value)) for key, value in values.items()
        )
        self._frozen = True
        runtime.object.freeze(self)

    def __setattr__(self, name: str, value: Any) -> None:
        if getattr(self, "_frozen", False):
            raise TypeError("certificate records are immutable")
        object.__setattr__(self, name, value)

    def __getitem__(self, name: str) -> Any:
        for key, value in self._entries:
            if key == name:
                return value
        raise KeyError(name)

    def __iter__(self) -> Any:
        for key, _value in self._entries:
            yield key

    def __len__(self) -> int:
        return len(self._entries)

    def get(self, name: str, default: Any = None) -> Any:
        for key, value in self._entries:
            if key == name:
                return value
        return default

    def items(self) -> Any:
        return self._entries

    def keys(self) -> Any:
        return tuple(key for key, _value in self._entries)

    def values(self) -> Any:
        return tuple(value for _key, value in self._entries)

    def __repr__(self) -> str:
        return repr({key: value for key, value in self._entries})

    def __setitem__(self, name: str, value: Any) -> None:
        raise TypeError("certificate records are immutable")

    def __delitem__(self, name: str) -> None:
        raise TypeError("certificate records are immutable")


def _freeze(value: Any) -> Any:
    if type(value) is FrozenRecord:
        return value
    if hasattr(value, "items"):
        return FrozenRecord(value)
    if isinstance(value, tuple) or isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def _thaw(value: Any) -> Any:
    if type(value) is FrozenRecord:
        return {key: _thaw(item) for key, item in value.items()}
    if isinstance(value, tuple) or isinstance(value, list):
        return tuple(_thaw(item) for item in value)
    return value


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


def _exception_name(error: BaseException) -> str:
    """Return an exception label without depending on transpiled `type`."""
    exception_class = getattr(error, "__class__", None)
    name = (
        None if exception_class is None else getattr(exception_class, "__name__", None)
    )
    return "Exception" if name is None else str(name)


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


def _external_assumption(
    provenance: Any,
    kind: str,
    value: Any,
    verifiers: Mapping[str, Any] | None,
    context: Mapping[str, Any],
) -> dict[str, Any]:
    """Classify an external claim; bare `proved` booleans stay conditional."""
    result = _proof(provenance, kind, value)
    result["conditional"] = True
    result["verified"] = False
    result["assurance"] = "unverified-external-claim"
    if not hasattr(provenance, "get"):
        result["proved"] = False
        return result
    if provenance.get("schema") != ASSUMPTION_SCHEMA:
        result["proved"] = False
        return result
    if provenance.get("kind") != kind or _wire(provenance.get("value")) != _wire(value):
        result["proved"] = False
        result["assurance"] = "typed-assumption-binding-mismatch"
        return result
    verifier_id = provenance.get("verifier_id")
    verifier = None if verifiers is None else verifiers.get(verifier_id)
    if verifier is None:
        result["proved"] = False
        result["assurance"] = "typed-assumption-verifier-unavailable"
        return result
    verification = verifier(dict(provenance), context)
    verified = verification is True or (
        hasattr(verification, "get") and verification.get("verified") is True
    )
    result["proved"] = verified
    result["verified"] = verified
    result["conditional"] = not verified
    result["assurance"] = (
        "verified-external-certificate"
        if verified
        else "typed-assumption-verification-failed"
    )
    verification_record: Any = verification
    if verification_record is not True and hasattr(verification_record, "get"):
        result["verification"] = {
            str(key): value for key, value in verification_record.items()
        }
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


def _digest(payload: Any) -> str:
    encoded = json.dumps(_wire(payload), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _curve_payload(jacobian: Any) -> dict[str, Any]:
    curve = jacobian.curve()
    f_value, h_value = curve.hyperelliptic_polynomials()
    return {
        "genus": int(curve.genus()),
        "base_ring": str(curve.base_ring()),
        "variable": str(f_value.parent().variable_name()),
        "f_coefficients_ascending": tuple(str(value) for value in f_value.list()),
        "h_coefficients_ascending": tuple(str(value) for value in h_value.list()),
    }


def _curve_digest(jacobian: Any) -> str:
    return _digest(_curve_payload(jacobian))


def _basis_digest(jacobian: Any, basis: Any) -> str:
    return _digest(
        {
            "curve_digest": _curve_digest(jacobian),
            "ordered_basis": tuple(_divisor_wire(point) for point in basis),
        }
    )


def _execution_divisor_fingerprint(jacobian: Any, divisor: Any) -> Any:
    """Return an exact packed execution key without changing wire formats."""
    if hasattr(divisor, "uv"):
        torsion = __import__(
            "sagejs.hyperelliptic_curves.torsion",
            fromlist=["rational_mumford_fingerprint"],
        )
        return torsion.rational_mumford_fingerprint(jacobian, divisor)
    return ("opaque", str(divisor))


def _execution_basis_fingerprint(jacobian: Any, basis: Any) -> tuple[Any, ...]:
    return tuple(_execution_divisor_fingerprint(jacobian, divisor) for divisor in basis)


def _check_cancelled(cancelled: Any, stage: str) -> None:
    if cancelled is not None and bool(cancelled()):
        raise SaturationResourceLimitError(
            "rational saturation cancelled during " + stage,
            {"cancelled": True, "stage": stage},
        )


def _matrix_rank_and_nullspace(
    rows: Any, column_count: int, prime: int
) -> tuple[int, tuple[tuple[int, ...], ...]]:
    """Return rank and a canonical right-nullspace basis modulo `prime`."""
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
    verification_status: str = "conditional-unverified",
    binding: Any = None,
) -> dict[str, Any]:
    """Build one exact finite-reduction divisibility constraint.

    `point_coordinates[i]` is the invariant-factor coordinate vector of the
    reduction of the `i`-th rational generator.  Only cyclic factors whose
    order is divisible by `saturation_prime` contribute: in `Z/nZ`, an
    element is in `ell*(Z/nZ)` exactly when its coordinate is zero modulo
    `ell` when `ell` divides `n`.
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
        "verification_status": verification_status,
        "binding": binding,
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
        verification_status=str(
            certificate.get("verification_status", "conditional-unverified")
        ),
        binding=certificate.get("binding"),
    )
    for key in (
        "ell_primary_factor_indices",
        "equation_rows",
        "equation_rank",
        "kernel_basis",
        "verification_status",
        "binding",
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
    assumption_verifiers: Mapping[str, Any] | None = None,
    context: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Derive `[MW:Gamma]` from proved regulator inequalities.

    Since `Reg(Gamma) = index^2*Reg(MW)`, proved bounds
    `Reg(Gamma) <= R` and `Reg(MW) >= r` imply
    `index <= floor(sqrt(R/r))`.  This helper never upgrades unproved
    numerical estimates: a registered verifier must accept typed provenance.
    """
    proof = _external_assumption(
        provenance,
        "regulator-index-bound",
        None,
        assumption_verifiers,
        {} if context is None else context,
    )
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
    assumption_verifiers: Mapping[str, Any] | None = None,
    context: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Derive an index bound using a supplied proved Hermite inequality.

    If every nonzero Mordell--Weil vector has canonical height at least `h`
    and `gamma` is a proved upper bound for the rank-`r` Hermite constant,
    then `Reg(MW) >= (h/gamma)^r`.  The caller must provide the theorem and
    hypotheses in proved provenance; this module does not infer them from a
    floating-point height search.
    """
    rank_value = _canonical_integer(rank, "rank")
    if rank_value < 1:
        raise ValueError("the height index bound requires positive rank")
    proof = _external_assumption(
        provenance,
        "height-index-bound",
        None,
        assumption_verifiers,
        {} if context is None else context,
    )
    if not proof["proved"]:
        raise ValueError("a height index bound requires proved provenance")
    if nonzero_height_lower_bound <= 0 or hermite_constant_upper_bound <= 0:
        raise ValueError("height and Hermite bounds must be positive")
    regulator_lower = (
        nonzero_height_lower_bound / hermite_constant_upper_bound
    ) ** rank_value
    bound = _floor_square_root_ratio(subgroup_regulator_upper_bound, regulator_lower)
    if bound < 1:
        raise ArithmeticError("the height/regulator bounds imply an impossible index")
    result = dict(proof)
    result["value"] = bound
    result["kind"] = "height-index-bound"
    result["subgroup_regulator_upper_bound"] = subgroup_regulator_upper_bound
    result["full_lattice_regulator_lower_bound"] = regulator_lower
    result["formula"] = "Reg(MW) >= (height_lower/Hermite_upper)^rank"
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
            # Provider booleans are never a global negative certificate.
            "exhaustive": False,
            "provider_claimed_exhaustive": raw.get("exhaustive") is True,
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


def _bounded_rationals(
    field: Any, numerator_bound: int, denominator_bound: int
) -> tuple[Any, ...]:
    values = []
    seen = set()
    for denominator in range(1, denominator_bound + 1):
        for numerator in range(-numerator_bound, numerator_bound + 1):
            if _gcd(numerator, denominator) != 1 and numerator != 0:
                continue
            value = field(numerator) / field(denominator)
            key = str(value)
            if key not in seen:
                seen.add(key)
                values.append(value)
    return tuple(values)


def _coefficient_vectors(values: Any, length: int) -> Any:
    values = tuple(values)
    if length == 0:
        yield ()
        return
    current = [values[0] for _index in range(length)]

    def visit(index: int) -> Any:
        if index == length:
            yield tuple(current)
            return
        for value in values:
            current[index] = value
            yield from visit(index + 1)

    yield from visit(0)


def _division_search_public(certificate: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in certificate.items()
        if key not in ("point", "_target", "_jacobian")
    }


def _division_filter_contexts(
    jacobian: Any,
    target: Any,
    primes: Any,
    maximum: int,
    cancelled: Any,
    algorithm: str,
) -> tuple[Any, ...]:
    """Prepare exact finite-reduction filters for a rational division search."""
    torsion = __import__(
        "sagejs.hyperelliptic_curves.torsion",
        fromlist=[
            "PreparedRationalReductionBatch",
            "_prepared_reduced_jacobian",
            "_reduce_rational_divisors_prepared",
        ],
    )
    selected_primes = []
    seen = set()
    for raw_prime in primes:
        if len(selected_primes) >= maximum:
            break
        prime = _checked_prime(raw_prime, "division_filter_prime")
        if prime in seen:
            continue
        seen.add(prime)
        selected_primes.append(prime)
    if not selected_primes:
        return ()
    contexts = []
    _check_cancelled(cancelled, "division-filter preparation")
    try:
        rows = torsion.PreparedRationalReductionBatch(
            jacobian,
            (target,),
            cancel=cancelled,
        ).reduce_many(
            tuple(selected_primes),
            algorithm=algorithm,
            allow_nonintegral=True,
            packed=True,
        )
        for row in rows:
            reduced_target = row["divisors"][0]
            if reduced_target is None:
                continue
            contexts.append((int(row["prime"]), reduced_target))
        return tuple(contexts)
    except (ArithmeticError, NotImplementedError, ValueError, ZeroDivisionError):
        # Preserve the former prime-by-prime capability envelope if one model
        # lies outside the packed batch.  This is also the exact fallback used
        # by certificate replay.
        contexts = []
    for prime in selected_primes:
        _check_cancelled(cancelled, "division-filter preparation")
        try:
            reduced_jacobian = torsion._prepared_reduced_jacobian(jacobian, prime)
            reduced_target = torsion._reduce_rational_divisors_prepared(
                jacobian,
                (target,),
                prime,
                reduced_jacobian,
                cancel=cancelled,
            )[0]
        except (ArithmeticError, NotImplementedError, ValueError, ZeroDivisionError):
            continue
        prepared = reduced_jacobian.prepared_arithmetic(
            algorithm="auto", max_batch_items=1
        )
        contexts.append((prime, prepared.pack(reduced_target)))
    return tuple(contexts)


def _filter_division_candidates(
    jacobian: Any,
    candidates: Any,
    ell: int,
    contexts: Any,
    cancelled: Any,
    algorithm: str,
) -> tuple[tuple[Any, ...], int]:
    """Apply necessary finite-field divisibility tests to an exact batch."""
    survivors = list(candidates)
    if not survivors or not contexts:
        return tuple(survivors), 0
    filtered = 0
    torsion = __import__(
        "sagejs.hyperelliptic_curves.torsion",
        fromlist=[
            "PreparedRationalReductionBatch",
            "_packed_scalar_batch_rows",
        ],
    )
    rows = torsion.PreparedRationalReductionBatch(
        jacobian,
        tuple(survivors),
        cancel=cancelled,
    ).reduce_many(
        tuple(context[0] for context in contexts),
        algorithm=algorithm,
        allow_nonintegral=True,
        packed=True,
    )
    rows_by_prime = {int(row["prime"]): row for row in rows}
    alive = [True for _candidate in survivors]
    for _prime, packed_target in contexts:
        if not any(alive):
            break
        _check_cancelled(cancelled, "division-filter batch")
        row = rows_by_prime[int(_prime)]
        reduced_jacobian = row["reduced_jacobian"]
        reducible_indices = []
        reduced = []
        for index, reduced_candidate in enumerate(row["divisors"]):
            if alive[index] and reduced_candidate is not None:
                reducible_indices.append(index)
                reduced.append(reduced_candidate)
        multiples = torsion._packed_scalar_batch_rows(
            reduced_jacobian,
            tuple(reduced),
            tuple(ell for _candidate in reduced),
            algorithm=algorithm,
        )
        matches = tuple(value == packed_target for value in multiples)
        for index, matches_target in zip(reducible_indices, matches, strict=True):
            if not matches_target:
                alive[index] = False
                filtered += 1
    return tuple(
        candidate for index, candidate in enumerate(survivors) if alive[index]
    ), filtered


def search_rational_mumford_division(
    jacobian: Any,
    target: Any,
    prime: Any,
    *,
    numerator_bound: Any,
    denominator_bound: Any,
    max_candidate_tuples: Any = 100_000,
    filter_primes: Any = (),
    max_filter_primes: Any = 4,
    filter_chunk_size: Any = 64,
    filter_algorithm: str = "auto",
    cancelled: Any = None,
) -> dict[str, Any]:
    """Search a replayable rational Mumford coefficient box exactly.

    A positive result is unconditional after scalar verification.  A negative
    result proves only that the finite coefficient box is empty; upgrading it
    to global nondivisibility requires a separately verified height-to-
    coefficient/search-bound theorem.
    """
    ell = _checked_prime(prime, "division prime")
    if ell > 7:
        raise NotImplementedError(
            "the classical bounded division search supports ell<=7"
        )
    numerator = _canonical_integer(numerator_bound, "numerator_bound")
    denominator = _canonical_integer(denominator_bound, "denominator_bound")
    maximum = _canonical_integer(max_candidate_tuples, "max_candidate_tuples")
    maximum_filters = _canonical_integer(max_filter_primes, "max_filter_primes")
    chunk_size = _canonical_integer(filter_chunk_size, "filter_chunk_size")
    if numerator < 0 or denominator < 1 or maximum < 1:
        raise ValueError("division-search bounds must be positive")
    if maximum_filters < 0 or chunk_size < 1:
        raise ValueError("division-filter bounds must be positive")
    if cancelled is not None and not callable(cancelled):
        raise TypeError("cancelled must be callable")
    if filter_algorithm not in ("auto", "native", "reference"):
        raise ValueError("unknown division-filter algorithm " + repr(filter_algorithm))
    curve = jacobian.curve()
    genus = int(curve.genus())
    if genus not in (2, 3):
        raise NotImplementedError("bounded Mumford division supports genus 2 or 3")
    f_value, h_value = curve.hyperelliptic_polynomials()
    if max(f_value.degree(), 2 * h_value.degree()) != 2 * genus + 1:
        raise NotImplementedError("bounded division requires an odd-degree model")
    field = jacobian.base_ring()
    if str(field) != "Rational Field":
        raise NotImplementedError("bounded rational division requires QQ")
    values = _bounded_rationals(field, numerator, denominator)
    value_count = len(values)
    candidate_bound = 0
    for degree in range(genus + 1):
        candidate_bound += value_count ** (2 * degree)
    if candidate_bound > maximum:
        raise SaturationResourceLimitError(
            "Mumford division box exceeds max_candidate_tuples=" + str(maximum),
            {
                "prime": ell,
                "numerator_bound": numerator,
                "denominator_bound": denominator,
                "rational_value_count": value_count,
                "candidate_bound": candidate_bound,
                "max_candidate_tuples": maximum,
            },
        )
    ring = jacobian.polynomial_ring()
    one = field(1)
    requested_filter_primes = tuple(
        sorted(
            {_checked_prime(value, "division_filter_prime") for value in filter_primes}
        )
    )
    filter_contexts = _division_filter_contexts(
        jacobian,
        target,
        requested_filter_primes,
        maximum_filters,
        cancelled,
        filter_algorithm,
    )
    checked = 0
    valid = 0
    found = None
    pending = []
    filtered = 0
    exact_tests = 0

    def test_pending() -> Any:
        nonlocal filtered, exact_tests
        survivors, removed = _filter_division_candidates(
            jacobian,
            pending,
            ell,
            filter_contexts,
            cancelled,
            filter_algorithm,
        )
        filtered += removed
        for candidate in survivors:
            _check_cancelled(cancelled, "exact division verification")
            exact_tests += 1
            if _scalar_multiple(candidate, ell) == target:
                return candidate
        return None

    for degree in range(genus + 1):
        for u_coefficients in _coefficient_vectors(values, degree):
            u_value = ring(list(u_coefficients) + [one])
            for v_coefficients in _coefficient_vectors(values, degree):
                if checked % 256 == 0:
                    _check_cancelled(cancelled, "division-box enumeration")
                checked += 1
                try:
                    candidate = jacobian([u_value, ring(v_coefficients)])
                except (ArithmeticError, ValueError, ZeroDivisionError):
                    continue
                valid += 1
                pending.append(candidate)
                if len(pending) >= chunk_size:
                    found = test_pending()
                    pending = []
                    if found is not None:
                        break
            if found is not None:
                break
        if found is not None:
            break
    if found is None and pending:
        found = test_pending()
    certificate = {
        "schema": DIVISION_SEARCH_SCHEMA,
        "algorithm": "classical-odd-degree-mumford-coefficient-box.v1",
        "curve_digest": _curve_digest(jacobian),
        "target_digest": _digest(_divisor_wire(target)),
        "prime": ell,
        "genus": genus,
        "numerator_bound": numerator,
        "denominator_bound": denominator,
        "rational_value_count": value_count,
        "candidate_bound": candidate_bound,
        "checked_candidate_tuples": checked,
        "valid_mumford_divisors": valid,
        "requested_filter_primes": requested_filter_primes,
        "used_filter_primes": tuple(context[0] for context in filter_contexts),
        "max_filter_primes": maximum_filters,
        "filter_chunk_size": chunk_size,
        "filtered_candidate_divisors": filtered,
        "exact_division_tests": exact_tests,
        "box_complete": found is None and checked == candidate_bound,
        "global_complete": False,
        "status": "found" if found is not None else "not_found_in_box",
        "point": found,
        "point_data": None if found is None else _divisor_wire(found),
        "_target": target,
        "_jacobian": jacobian,
    }
    return certificate


def verify_division_search_certificate(
    jacobian: Any, target: Any, certificate: Mapping[str, Any]
) -> bool:
    """Replay a bounded rational Mumford search certificate exactly."""
    if certificate.get("schema") != DIVISION_SEARCH_SCHEMA:
        raise ValueError("unknown rational-division search schema")
    if certificate.get("curve_digest") != _curve_digest(jacobian):
        raise ValueError("the division search belongs to a different Jacobian")
    if certificate.get("target_digest") != _digest(_divisor_wire(target)):
        raise ValueError("the division search belongs to a different target")
    rebuilt = search_rational_mumford_division(
        jacobian,
        target,
        certificate["prime"],
        numerator_bound=certificate["numerator_bound"],
        denominator_bound=certificate["denominator_bound"],
        max_candidate_tuples=certificate["candidate_bound"],
        filter_primes=certificate.get("requested_filter_primes", ()),
        max_filter_primes=certificate.get("max_filter_primes", 4),
        filter_chunk_size=certificate.get("filter_chunk_size", 64),
        filter_algorithm="reference",
    )
    if _wire(_division_search_public(rebuilt)) != _wire(
        _division_search_public(certificate)
    ):
        raise ArithmeticError("a rational-division search certificate is incorrect")
    return True


def division_search_exhaustion_value(
    jacobian: Any, target: Any, certificate: Mapping[str, Any]
) -> dict[str, Any]:
    """Return the exact binding required by a global search-bound theorem."""
    verify_division_search_certificate(jacobian, target, certificate)
    public_certificate = _division_search_public(certificate)
    if public_certificate.get("box_complete") is not True:
        raise ValueError("a nonempty search box cannot support exhaustion provenance")
    return {
        "prime": _checked_prime(public_certificate["prime"], "division prime"),
        "target_digest": _digest(_divisor_wire(target)),
        "search_certificate_digest": _digest(public_certificate),
    }


def _division_answer(
    jacobian: Any,
    target: Any,
    prime: int,
    division_search: Any,
    division_candidates: Any,
    division_search_bound: Any,
    maximum: int,
    filter_primes: Any = (),
    cancelled: Any = None,
) -> dict[str, Any]:
    raw = None
    if division_search is not None:
        raw = division_search(target, prime, maximum)
    elif division_candidates is not None:
        if hasattr(division_candidates, "get"):
            raw = division_candidates.get(prime, ())
        else:
            raw = division_candidates
    elif division_search_bound is not None:
        if not hasattr(division_search_bound, "get"):
            raise TypeError("division_search_bound must be a mapping")
        requested_maximum = _canonical_integer(
            division_search_bound.get("max_candidate_tuples", maximum),
            "max_candidate_tuples",
        )
        raw = search_rational_mumford_division(
            jacobian,
            target,
            prime,
            numerator_bound=division_search_bound.get("numerator_bound"),
            denominator_bound=division_search_bound.get("denominator_bound"),
            max_candidate_tuples=min(maximum, requested_maximum),
            filter_primes=division_search_bound.get("filter_primes", filter_primes),
            max_filter_primes=division_search_bound.get("max_filter_primes", 4),
            filter_chunk_size=division_search_bound.get("filter_chunk_size", 64),
            cancelled=cancelled,
        )
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
    search_certificate: Any = raw
    if (
        search_certificate is not None
        and hasattr(search_certificate, "get")
        and search_certificate.get("schema") == DIVISION_SEARCH_SCHEMA
    ):
        verify_division_search_certificate(jacobian, target, search_certificate)
        answer["certificate"] = _division_search_public(search_certificate)
        answer["box_exhaustive"] = search_certificate.get("box_complete") is True
    candidates = answer["candidates"]
    if len(candidates) > maximum:
        raise SaturationResourceLimitError(
            "rational division exceeds max_division_candidates=" + str(maximum),
            {"prime": prime, "candidate_count": len(candidates)},
        )
    checked = 0
    seen = []
    for candidate in candidates:
        _check_cancelled(cancelled, "division-candidate verification")
        checked += 1
        try:
            candidate = jacobian(candidate)
        except (TypeError, ValueError):
            pass
        fingerprint = _execution_divisor_fingerprint(jacobian, candidate)
        if any(fingerprint == previous for previous in seen):
            continue
        seen.append(fingerprint)
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


class VerifiedReductionRecord:
    """A curve/basis-bound reduction record replayed from an explicit group map."""

    def __init__(self, data: Mapping[str, Any]) -> None:
        self._data = dict(data)

    def __getitem__(self, name: str) -> Any:
        return self._data[name]

    def get(self, name: str, default: Any = None) -> Any:
        return self._data.get(name, default)

    def to_dict(self) -> dict[str, Any]:
        return {
            key: value
            for key, value in self._data.items()
            if key not in ("_homomorphism", "_group", "_reduced_jacobian")
        }


def _reduce_points(
    points: Any, reduced_jacobian: Any, reduction_prime: int
) -> tuple[Any, ...]:
    field = reduced_jacobian.base_ring()
    ring = reduced_jacobian.polynomial_ring()
    reduced_points = []
    for point in points:
        if not hasattr(point, "uv"):
            raise NotImplementedError(
                "the verified reduction provider requires Mumford divisors"
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
        reduced_points.append(reduced_jacobian([reduced_u, reduced_v]))
    return tuple(reduced_points)


def certify_reduction_record(
    jacobian: Any,
    points: Any,
    reduction_prime: Any,
    reduced_jacobian: Any,
    group: Any,
    homomorphism: Any,
    *,
    map_certificate: Any = None,
) -> VerifiedReductionRecord:
    """Replay and bind one finite group map to a rational curve and basis."""
    prime = _checked_prime(reduction_prime, "reduction_prime")
    frobenius = __import__(
        "sagejs.hyperelliptic_curves.frobenius", fromlist=["_rational_reduction"]
    )
    jacobian_module = __import__(
        "sagejs.hyperelliptic_curves.jacobian", fromlist=["Jacobian"]
    )
    expected_curve = frobenius._rational_reduction(jacobian.curve(), prime)
    expected_jacobian = jacobian_module.Jacobian(expected_curve)
    if _curve_payload(reduced_jacobian) != _curve_payload(expected_jacobian):
        raise ValueError("a reduction record is bound to the wrong reduced model")
    if (
        homomorphism.domain() is not group
        or homomorphism.codomain() is not reduced_jacobian
    ):
        raise ValueError("the finite abelian map has the wrong domain or codomain")
    if tuple(group.invariants()) != tuple(homomorphism.domain().invariants()):
        raise ArithmeticError("the finite group invariants and map disagree")
    if not homomorphism.verify():
        raise ArithmeticError("the finite abelian-group map did not verify")
    reduced_points = _reduce_points(points, reduced_jacobian, prime)
    coordinates = tuple(tuple(homomorphism.preimage(point)) for point in reduced_points)
    for point, coordinate in zip(reduced_points, coordinates, strict=True):
        if homomorphism(group(coordinate)) != point:
            raise ArithmeticError("a finite inverse coordinate did not replay")
    if map_certificate is not None and hasattr(
        reduced_jacobian, "verify_group_structure_certificate"
    ):
        if not reduced_jacobian.verify_group_structure_certificate(map_certificate):
            raise ArithmeticError("the finite group certificate did not replay")
    reduced_payload = _curve_payload(reduced_jacobian)
    data = {
        "schema": VERIFIED_REDUCTION_SCHEMA,
        "verification_status": "internally-replayed",
        "curve_digest": _curve_digest(jacobian),
        "basis_digest": _basis_digest(jacobian, points),
        "reduction_prime": prime,
        "reduced_model": reduced_payload,
        "reduced_model_digest": _digest(reduced_payload),
        "good_reduction_certificate": {
            "method": "checked-smooth-hyperelliptic-reduction",
            "prime": prime,
            "replayed": True,
        },
        "invariants": tuple(group.invariants()),
        "point_coordinates": coordinates,
        "reduced_points": tuple(_divisor_wire(point) for point in reduced_points),
        "map_certificate": map_certificate,
        "finite_map_verified": True,
        "_homomorphism": homomorphism,
        "_group": group,
        "_reduced_jacobian": reduced_jacobian,
    }
    return VerifiedReductionRecord(data)


def _verify_reduction_record(
    jacobian: Any, points: Any, record: Any
) -> VerifiedReductionRecord:
    if type(record) is not VerifiedReductionRecord:
        raise TypeError("a verified reduction must be a VerifiedReductionRecord")
    if record.get("schema") != VERIFIED_REDUCTION_SCHEMA:
        raise ValueError("unknown verified-reduction schema")
    return certify_reduction_record(
        jacobian,
        points,
        record["reduction_prime"],
        record["_reduced_jacobian"],
        record["_group"],
        record["_homomorphism"],
        map_certificate=record.get("map_certificate"),
    )


def _default_reduction_data(
    jacobian: Any,
    points: Any,
    reduction_prime: int,
    *,
    max_group_operations: int,
    max_baby_steps: int,
    max_memory_bytes: int,
    seed: Any,
) -> VerifiedReductionRecord:
    frobenius = __import__(
        "sagejs.hyperelliptic_curves.frobenius",
        fromlist=["_rational_reduction"],
    )
    jacobian_module = __import__(
        "sagejs.hyperelliptic_curves.jacobian", fromlist=["Jacobian"]
    )
    reduced_curve = frobenius._rational_reduction(jacobian.curve(), reduction_prime)
    reduced_jacobian = jacobian_module.Jacobian(reduced_curve)
    if int(reduced_jacobian.order()) <= EXHAUSTIVE_REDUCTION_GROUP_LIMIT:
        group, homomorphism = _exhaustive_reduction_group_map(
            reduced_jacobian,
            max_group_operations=max_group_operations,
            max_baby_steps=max_baby_steps,
            max_memory_bytes=max_memory_bytes,
        )
    else:
        group, homomorphism = reduced_jacobian.abelian_group(
            max_group_operations=max_group_operations,
            max_baby_steps=max_baby_steps,
            max_memory_bytes=max_memory_bytes,
            seed=seed,
        )
    certificate = None
    try:
        certificate = reduced_jacobian.group_structure_certificate(seed=seed)
    except (NotImplementedError, RuntimeError, TypeError):
        # The explicit map has already verified its group basis.  Retaining the
        # larger serialized certificate is useful but not required twice.
        certificate = None
    return certify_reduction_record(
        jacobian,
        points,
        reduction_prime,
        reduced_jacobian,
        group,
        homomorphism,
        map_certificate=certificate,
    )


def _exhaustive_reduction_group_map(
    reduced_jacobian: Any,
    *,
    max_group_operations: int,
    max_baby_steps: int,
    max_memory_bytes: int,
) -> tuple[Any, Any]:
    """Build a deterministic exact map for genuinely small residue groups."""
    order = int(reduced_jacobian.order())
    if order > EXHAUSTIVE_REDUCTION_GROUP_LIMIT:
        raise SaturationResourceLimitError(
            "exhaustive reduction map exceeds the fixed small-group envelope",
            {
                "group_order": order,
                "max_group_order": EXHAUSTIVE_REDUCTION_GROUP_LIMIT,
            },
        )
    elements = tuple(
        reduced_jacobian.points(
            max_elements=EXHAUSTIVE_REDUCTION_GROUP_LIMIT,
            max_candidates=max(10_000, 100 * EXHAUSTIVE_REDUCTION_GROUP_LIMIT),
        )
    )
    if len(elements) != order:
        raise ArithmeticError("finite Jacobian enumeration has the wrong order")
    structure = __import__(
        "sagejs.hyperelliptic_curves.group_structure",
        fromlist=[
            "GroupOperationBudget",
            "basis_from_generators",
            "factor_integer_bounded",
        ],
    )
    abelian = __import__(
        "sagejs.hyperelliptic_curves.abelian_group",
        fromlist=["FiniteAbelianGroup", "JacobianAbelianMap"],
    )
    factors = structure.factor_integer_bounded(order, 1_000_000)
    element_orders = tuple(point.order() for point in elements)
    budget = structure.GroupOperationBudget(
        max_group_operations,
        max_baby_steps,
        max_memory_bytes,
        "reference",
    )
    descending_generators, descending_orders = structure.basis_from_generators(
        elements,
        element_orders,
        factors,
        budget,
    )
    generators = tuple(reversed(descending_generators))
    invariants = tuple(reversed(descending_orders))
    if _product(invariants) != order:
        raise ArithmeticError("the exhaustive finite basis has the wrong order")
    group = abelian.FiniteAbelianGroup(invariants)
    homomorphism = abelian.JacobianAbelianMap(
        group,
        reduced_jacobian,
        generators,
        factorization=factors,
        max_group_operations=max_group_operations,
        max_baby_steps=max_baby_steps,
        max_memory_bytes=max_memory_bytes,
    )
    if not homomorphism.verify():
        raise ArithmeticError("the exhaustive finite group map did not verify")
    return group, homomorphism


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
    jacobian: Any,
    points: Any,
    supplied: Any,
    use_height_pairing: bool,
    assumption_verifiers: Mapping[str, Any] | None,
) -> dict[str, Any]:
    if len(tuple(points)) == 0:
        return {
            "kind": "independence",
            "proved": True,
            "source": "empty-basis",
            "rank": 0,
        }
    context = {
        "curve_digest": _curve_digest(jacobian),
        "basis_digest": _basis_digest(jacobian, points),
    }
    proof = _external_assumption(
        supplied,
        "independence",
        len(tuple(points)),
        assumption_verifiers,
        context,
    )
    if proof["proved"] or not use_height_pairing:
        return proof
    method = getattr(jacobian, "height_pairing", None)
    verifier = getattr(jacobian, "verify_height_pairing_independence", None)
    if method is None or verifier is None:
        return proof
    pairing = method(tuple(points))
    proved = verifier(tuple(points), pairing) is True
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
    assumption_verifiers: Mapping[str, Any] | None,
    context: Mapping[str, Any],
) -> dict[str, Any]:
    claims = []
    exact_rank = None
    rank_upper = None
    rank_verified = False
    selmer_verified = False
    if algebraic_rank is not None:
        value = _canonical_integer(algebraic_rank, "algebraic_rank")
        if value < 0:
            raise ValueError("algebraic_rank must be nonnegative")
        claim = _external_assumption(
            algebraic_rank_provenance,
            "algebraic-rank",
            value,
            assumption_verifiers,
            context,
        )
        claims.append(claim)
        if claim["proved"]:
            rank_verified = True
            exact_rank = value
            rank_upper = value
    if selmer_rank_upper_bound is not None:
        value = _canonical_integer(selmer_rank_upper_bound, "selmer_rank_upper_bound")
        if value < 0:
            raise ValueError("selmer_rank_upper_bound must be nonnegative")
        claim = _external_assumption(
            selmer_provenance,
            "selmer-rank-upper-bound",
            value,
            assumption_verifiers,
            context,
        )
        claims.append(claim)
        if claim["proved"] and (rank_upper is None or value < rank_upper):
            selmer_verified = True
            rank_upper = value
    if algebraic_rank is not None and selmer_rank_upper_bound is not None:
        supplied_rank = _canonical_integer(algebraic_rank, "algebraic_rank")
        supplied_upper = _canonical_integer(
            selmer_rank_upper_bound, "selmer_rank_upper_bound"
        )
        rank_claimed_proved = bool(
            hasattr(algebraic_rank_provenance, "get")
            and algebraic_rank_provenance.get("proved") is True
        )
        selmer_claimed_proved = bool(
            hasattr(selmer_provenance, "get")
            and selmer_provenance.get("proved") is True
        )
        if (
            supplied_rank > supplied_upper
            and (rank_claimed_proved or rank_verified)
            and (selmer_claimed_proved or selmer_verified)
        ):
            raise ArithmeticError(
                "the supplied proved algebraic rank exceeds the Selmer upper bound"
            )
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

    __slots__ = (
        "jacobian",
        "input_basis",
        "basis",
        "independence",
        "rank_status",
        "prime_results",
        "basis_steps",
        "index_factor_from_input",
        "index_bound",
        "global_status",
        "diagnostics",
        "_raw_inputs",
        "_assumption_verifiers",
        "s_saturated_primes",
        "free_quotient_saturated_primes",
        "ell_division_relations_ruled_out_primes",
        "global_saturation_proved",
        "global_free_quotient_saturation_proved",
        "full_mordell_weil_group_proved",
        "_frozen",
    )
    index_factor_from_input: int
    s_saturated_primes: tuple[int, ...]
    free_quotient_saturated_primes: tuple[int, ...]
    ell_division_relations_ruled_out_primes: tuple[int, ...]
    global_saturation_proved: bool
    global_free_quotient_saturation_proved: bool
    full_mordell_weil_group_proved: bool

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
        raw_inputs: Any,
        assumption_verifiers: Mapping[str, Any] | None,
    ) -> None:
        self.jacobian = jacobian
        self.input_basis = tuple(input_basis)
        self.basis = tuple(basis)
        self.independence = _freeze(independence)
        self.rank_status = _freeze(rank_status)
        self.prime_results = _freeze(tuple(prime_results))
        self.basis_steps = _freeze(tuple(basis_steps))
        self.index_bound = None if index_bound is None else _freeze(index_bound)
        self.global_status = _freeze(global_status)
        self.diagnostics = _freeze(diagnostics)
        self._raw_inputs = _freeze(raw_inputs)
        self._assumption_verifiers = (
            None
            if assumption_verifiers is None
            else _freeze(dict(assumption_verifiers))
        )
        for name, value in self._computed_promoted_aliases().items():
            setattr(self, name, value)
        self._frozen = True
        runtime.object.freeze(self)

    def __setattr__(self, name: str, value: Any) -> None:
        if getattr(self, "_frozen", False):
            raise TypeError("saturation results are immutable")
        object.__setattr__(self, name, value)

    def _computed_promoted_aliases(self) -> dict[str, Any]:
        free_quotient_primes = tuple(
            row["prime"]
            for row in self.prime_results
            if row["free_quotient_saturated"] is True
        )
        relation_primes = tuple(
            row["prime"]
            for row in self.prime_results
            if row["ell_division_relations_ruled_out"] is True
        )
        global_saturation = self.global_status.get("global_saturation_proved") is True
        full_group = (
            global_saturation
            and self.rank_status.get("full_rank_proved") is True
            and self.global_status.get("torsion_subgroup_included") is True
        )
        return {
            "index_factor_from_input": _product(
                step["index_factor"] for step in self.basis_steps
            ),
            "s_saturated_primes": free_quotient_primes,
            "free_quotient_saturated_primes": free_quotient_primes,
            "ell_division_relations_ruled_out_primes": relation_primes,
            "global_saturation_proved": global_saturation,
            "global_free_quotient_saturation_proved": global_saturation,
            "full_mordell_weil_group_proved": full_group,
        }

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

    def _derived_dict(self) -> dict[str, Any]:
        public_steps = []
        for step in self.basis_steps:
            public_steps.append(
                {
                    key: _thaw(value)
                    for key, value in step.items()
                    if not key.startswith("_")
                }
            )
        return {
            "basis": tuple(_divisor_wire(point) for point in self.basis),
            "independence": _wire(_thaw(self.independence)),
            "rank_status": _wire(_thaw(self.rank_status)),
            "prime_results": _wire(_thaw(self.prime_results)),
            "basis_steps": _wire(public_steps),
            "index_factor_from_input": str(self.index_factor_from_input),
            "index_bound": _wire(_thaw(self.index_bound)),
            "global_status": _wire(_thaw(self.global_status)),
            "diagnostics": _wire(_thaw(self.diagnostics)),
            "s_saturated_primes": tuple(
                str(value) for value in self.s_saturated_primes
            ),
            "free_quotient_saturated_primes": tuple(
                str(value) for value in self.free_quotient_saturated_primes
            ),
            "ell_division_relations_ruled_out_primes": tuple(
                str(value) for value in self.ell_division_relations_ruled_out_primes
            ),
            "global_saturation_proved": self.global_saturation_proved,
            "global_free_quotient_saturation_proved": (
                self.global_free_quotient_saturation_proved
            ),
            "full_mordell_weil_group_proved": self.full_mordell_weil_group_proved,
        }

    def to_dict(self) -> dict[str, Any]:
        """Return an immutable-state, replayable JSON/SQLite record."""
        return {
            "schema": SCHEMA,
            "curve": _curve_payload(self.jacobian),
            "curve_digest": _curve_digest(self.jacobian),
            "input_basis": tuple(_divisor_wire(point) for point in self.input_basis),
            "raw": _wire(_thaw(self._raw_inputs)),
            "derived": self._derived_dict(),
        }

    @classmethod
    def from_dict(
        cls,
        jacobian: Any,
        payload: Mapping[str, Any],
        *,
        assumption_verifiers: Mapping[str, Any] | None = None,
    ) -> Any:
        """Replay a serialized result and reject every derived-field forgery."""
        return _saturation_from_dict(
            jacobian, payload, assumption_verifiers=assumption_verifiers
        )

    def verify(self) -> bool:
        """Recheck every finite reduction and exact basis transformation."""
        for name, value in self._computed_promoted_aliases().items():
            if getattr(self, name) != value:
                raise ArithmeticError("a promoted saturation field was forged: " + name)
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
        replayed = _saturation_from_dict(
            self.jacobian,
            self.to_dict(),
            assumption_verifiers=self._assumption_verifiers,
        )
        if _wire(replayed._derived_dict()) != _wire(self._derived_dict()):
            raise ArithmeticError("saturation result replay changed derived fields")
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
    division_search_bound: Any = None,
    division_exhaustion_provenance: Any = None,
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
    assumption_verifiers: Mapping[str, Any] | None = None,
    torsion_ell_control: Any = None,
    max_division_vectors: int = 10_000,
    max_division_candidates: int = 100_000,
    max_enlargements: int = 64,
    max_global_primes: int = 10_000,
    max_group_operations: int = 10_000_000,
    max_baby_steps: int = 1_000_000,
    max_memory_bytes: int = 256 * 1024 * 1024,
    seed: Any = 0,
    cancelled: Any = None,
) -> SaturationResult:
    """Saturate a supplied rational subgroup within explicit proof boundaries.

    The returned object can prove finite-prime saturation using only reduction
    maps.  Full rank and a global index are independent claims.  Bare supplied
    rank/index numbers are recorded but are used as proofs only when their
    typed provenance is accepted by a registered verifier.
    """
    basis = tuple(points)
    if cancelled is not None and not callable(cancelled):
        raise TypeError("cancelled must be callable")
    _check_cancelled(cancelled, "setup")
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
    if _canonical_integer(max_memory_bytes, "max_memory_bytes") < 1:
        raise ValueError("max_memory_bytes must be positive")

    assumption_context = {
        "curve_digest": _curve_digest(jacobian),
        "basis_digest": _basis_digest(jacobian, basis),
    }
    independence = _obtain_independence(
        jacobian,
        basis,
        independence_certificate,
        use_height_pairing,
        assumption_verifiers,
    )
    rank_status = _rank_status(
        len(basis),
        independence,
        algebraic_rank,
        algebraic_rank_provenance,
        selmer_rank_upper_bound,
        selmer_provenance,
        assumption_verifiers,
        assumption_context,
    )
    torsion_value = _canonical_integer(torsion_order, "torsion_order")
    if torsion_value < 1:
        raise ValueError("torsion_order must be positive")
    torsion_proof = _external_assumption(
        torsion_provenance,
        "rational-torsion-order",
        torsion_value,
        assumption_verifiers,
        assumption_context,
    )
    torsion_inclusion = _external_assumption(
        torsion_inclusion_provenance,
        "torsion-subgroup-included",
        bool(torsion_subgroup_included),
        assumption_verifiers,
        assumption_context,
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
        bound_record = _external_assumption(
            exact_subgroup_index_provenance,
            "exact-subgroup-index",
            exact_value,
            assumption_verifiers,
            assumption_context,
        )
        bound_record["exact"] = True
    elif global_index_bound is not None:
        bound_value = _canonical_integer(global_index_bound, "global_index_bound")
        if bound_value < 1:
            raise ValueError("global_index_bound must be positive")
        bound_record = _external_assumption(
            global_index_bound_provenance,
            "global-index-upper-bound",
            bound_value,
            assumption_verifiers,
            assumption_context,
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
            assumption_verifiers=assumption_verifiers,
            context=assumption_context,
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
            assumption_verifiers=assumption_verifiers,
            context=assumption_context,
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
        "reduction_cache_hits": 0,
        "reduction_cache_misses": 0,
        "reduction_cache_invalidations": 0,
        "reduction_failures": [],
        "division_vectors": 0,
        "division_candidates_checked": 0,
        "resource_limits": [],
    }
    reduction_cache: dict[Any, Any] = {}
    cached_basis_fingerprint = _execution_basis_fingerprint(jacobian, basis)
    residue_count = max(1, len(residue_primes))
    per_reduction_memory_bytes = max(1, int(max_memory_bytes) // residue_count)

    requested_index = 0
    while requested_index < len(prime_values):
        _check_cancelled(cancelled, "saturation-prime iteration")
        prime = prime_values[requested_index]
        requested_index += 1
        reductions = []
        conditional_reductions = []
        failures = []
        for reduction_index, residue_prime in enumerate(residue_primes):
            diagnostics["reduction_attempts"] += 1
            try:
                _check_cancelled(cancelled, "finite reduction")
                cache_key = (cached_basis_fingerprint, residue_prime)
                cached = reduction_cache.get(cache_key)
                if cached is not None:
                    diagnostics["reduction_cache_hits"] += 1
                    data, verified, binding = cached
                else:
                    diagnostics["reduction_cache_misses"] += 1
                    if reduction_provider is None:
                        data = _default_reduction_data(
                            jacobian,
                            basis,
                            residue_prime,
                            max_group_operations=max_group_operations,
                            max_baby_steps=max_baby_steps,
                            max_memory_bytes=per_reduction_memory_bytes,
                            seed=(
                                None if seed is None else int(seed) + reduction_index
                            ),
                        )
                    else:
                        data = reduction_provider(jacobian, basis, residue_prime)
                    verified = type(data) is VerifiedReductionRecord
                    if verified:
                        data = _verify_reduction_record(jacobian, basis, data)
                        binding = data.to_dict()
                    else:
                        binding = {
                            "curve_digest": data.get("curve_digest"),
                            "basis_digest": data.get("basis_digest"),
                            "claimed_good_reduction": data.get(
                                "good_reduction_certificate"
                            ),
                            "reason": (
                                "injected coordinates lack a replayed reduced model, "
                                "good-reduction proof, and verified finite group map"
                            ),
                        }
                    reduction_cache[cache_key] = (data, verified, binding)
                certificate = reduction_constraint(
                    prime,
                    residue_prime,
                    data["invariants"],
                    data["point_coordinates"],
                    map_certificate=data.get("map_certificate"),
                    verification_status=(
                        "internally-replayed"
                        if verified
                        else "conditional-unverified-provider"
                    ),
                    binding=binding,
                )
                if verified:
                    reductions.append(certificate)
                else:
                    conditional_reductions.append(certificate)
            except (
                ArithmeticError,
                NotImplementedError,
                RuntimeError,
                TypeError,
                ValueError,
            ) as error:
                diagnostic_error: Any = error
                if (
                    hasattr(error, "diagnostics")
                    and diagnostic_error.diagnostics.get("cancelled") is True
                ):
                    raise
                failure = {
                    "prime": residue_prime,
                    "type": _exception_name(error),
                    "reason": str(error),
                }
                if hasattr(error, "diagnostics"):
                    failure["diagnostics"] = diagnostic_error.diagnostics
                failures.append(failure)
                diagnostics["reduction_failures"].append(failure)
        rank, kernel, combined_rows = _combined_constraint(prime, basis, reductions)
        conditional_rank, conditional_kernel, conditional_rows = _combined_constraint(
            prime, basis, tuple(reductions) + tuple(conditional_reductions)
        )
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
                        division_search_bound,
                        max_division_candidates,
                        residue_primes,
                        cancelled,
                    )
                    exhaustion_proof = None
                    search_certificate = answer.get("certificate")
                    if (
                        search_certificate is not None
                        and search_certificate.get("schema") == DIVISION_SEARCH_SCHEMA
                        and search_certificate.get("box_complete") is True
                    ):
                        exhaustion_value = {
                            "prime": prime,
                            "target_digest": _digest(_divisor_wire(target)),
                            "search_certificate_digest": _digest(search_certificate),
                        }
                        exhaustion_source = division_exhaustion_provenance
                        if (
                            hasattr(exhaustion_source, "get")
                            and exhaustion_source.get("schema") != ASSUMPTION_SCHEMA
                        ):
                            exhaustion_source = exhaustion_source.get(
                                exhaustion_value["target_digest"]
                            )
                        exhaustion_proof = _external_assumption(
                            exhaustion_source,
                            "global-division-search-bound",
                            exhaustion_value,
                            assumption_verifiers,
                            assumption_context,
                        )
                        answer["exhaustive"] = exhaustion_proof.get("proved") is True
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
                            "exhaustion_status": exhaustion_proof,
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
                if error.diagnostics.get("cancelled") is True:
                    raise
                resource = {
                    "type": _exception_name(error),
                    "reason": str(error),
                    "diagnostics": error.diagnostics,
                }
                diagnostics["resource_limits"].append(resource)
                exhaustive_not_found = False
        if enlarged:
            # The new basis has index ell less in the input basis.  Re-run the
            # same prime from fresh reductions until no further enlargement is
            # found or a proof/resource result terminates it.
            reduction_cache = {}
            diagnostics["reduction_cache_invalidations"] += 1
            cached_basis_fingerprint = _execution_basis_fingerprint(jacobian, basis)
            requested_index -= 1
            continue
        relation_obstruction = rank == len(basis)
        exact_search_proof = bool(kernel) and exhaustive_not_found and resource is None
        ell_relations_ruled_out = independence.get("proved") is True and (
            relation_obstruction or exact_search_proof
        )
        ell_torsion_source = None
        if hasattr(torsion_ell_control, "get"):
            ell_torsion_source = torsion_ell_control.get(prime)
            if ell_torsion_source is None:
                ell_torsion_source = torsion_ell_control.get(str(prime))
        ell_torsion_proof = _external_assumption(
            ell_torsion_source,
            "ell-torsion-control",
            prime,
            assumption_verifiers,
            assumption_context,
        )
        torsion_controlled = torsion_proof.get("proved") is True and (
            _gcd(torsion_value, prime) == 1 or ell_torsion_proof.get("proved") is True
        )
        free_quotient_saturated = ell_relations_ruled_out and torsion_controlled
        if free_quotient_saturated:
            status = "free_quotient_saturated"
        elif ell_relations_ruled_out:
            status = "ell_division_relations_ruled_out_torsion_uncontrolled"
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
                "ell_division_relations_ruled_out": ell_relations_ruled_out,
                "free_quotient_saturated": free_quotient_saturated,
                "constraint_rank": rank,
                "generator_count": len(basis),
                "kernel_basis": kernel,
                "combined_equation_rows": combined_rows,
                "reduction_certificates": tuple(reductions),
                "conditional_reduction_constraints": tuple(conditional_reductions),
                "conditional_constraint_rank": conditional_rank,
                "conditional_kernel_basis": conditional_kernel,
                "conditional_equation_rows": conditional_rows,
                "reduction_failures": tuple(failures),
                "division_searches": tuple(search_records),
                "resource_limit": resource,
                "torsion_coprime": _gcd(torsion_value, prime) == 1,
                "torsion_controlled": torsion_controlled,
                "ell_torsion_control_status": ell_torsion_proof,
            }
        )

    factor_from_input = _product(step["index_factor"] for step in steps)
    possible_prime_values = None
    possible_prime_proof = None
    if possible_index_primes is not None:
        possible_prime_values = tuple(possible_index_primes)
        possible_prime_proof = _external_assumption(
            possible_index_primes_provenance,
            "possible-index-primes",
            possible_prime_values,
            assumption_verifiers,
            assumption_context,
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
                        "type": _exception_name(error),
                        "reason": str(error),
                        "diagnostics": error.diagnostics,
                    }
                    diagnostics["resource_limits"].append(resource)
                    global_status["reason"] = "global prime enumeration resource limit"
                    global_status["resource_limit"] = resource

    raw_inputs = {
        "primes": prime_values,
        "reduction_primes": residue_primes,
        "reduction_provider_mode": (
            "default-internal" if reduction_provider is None else "injected-conditional"
        ),
        "division_provider_mode": (
            "classical-bounded"
            if division_search_bound is not None
            else (
                "injected-search"
                if division_search is not None
                else (
                    "injected-candidates"
                    if division_candidates is not None
                    else "jacobian-hook-or-unavailable"
                )
            )
        ),
        "division_search_bound": division_search_bound,
        "division_exhaustion_provenance": division_exhaustion_provenance,
        "independence_certificate": independence_certificate,
        "use_height_pairing": use_height_pairing,
        "algebraic_rank": algebraic_rank,
        "algebraic_rank_provenance": algebraic_rank_provenance,
        "selmer_rank_upper_bound": selmer_rank_upper_bound,
        "selmer_provenance": selmer_provenance,
        "torsion_order": torsion_order,
        "torsion_provenance": torsion_provenance,
        "torsion_subgroup_included": torsion_subgroup_included,
        "torsion_inclusion_provenance": torsion_inclusion_provenance,
        "torsion_ell_control": torsion_ell_control,
        "global_index_bound": global_index_bound,
        "global_index_bound_provenance": global_index_bound_provenance,
        "exact_subgroup_index": exact_subgroup_index,
        "exact_subgroup_index_provenance": exact_subgroup_index_provenance,
        "possible_index_primes": possible_prime_values,
        "possible_index_primes_provenance": possible_index_primes_provenance,
        "regulator_upper_bound": regulator_upper_bound,
        "full_lattice_regulator_lower_bound": full_lattice_regulator_lower_bound,
        "height_lower_bound": height_lower_bound,
        "hermite_constant_upper_bound": hermite_constant_upper_bound,
        "index_bound_provenance": index_bound_provenance,
        "resources": {
            "max_division_vectors": max_division_vectors,
            "max_division_candidates": max_division_candidates,
            "max_enlargements": max_enlargements,
            "max_global_primes": max_global_primes,
            "max_group_operations": max_group_operations,
            "max_baby_steps": max_baby_steps,
            "max_memory_bytes": max_memory_bytes,
            "seed": seed,
        },
    }
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
        raw_inputs,
        assumption_verifiers,
    )


def _divisor_from_wire(jacobian: Any, payload: Mapping[str, Any]) -> Any:
    if payload.get("representation") != "mumford":
        raise ValueError("serialized saturation bases require Mumford divisors")
    ring = jacobian.polynomial_ring()
    field = jacobian.base_ring()
    u_value = ring(
        [
            _field_element_from_wire(field, value)
            for value in payload["u_coefficients_ascending"]
        ]
    )
    v_value = ring(
        [
            _field_element_from_wire(field, value)
            for value in payload["v_coefficients_ascending"]
        ]
    )
    return jacobian([u_value, v_value])


def _field_element_from_wire(field: Any, value: Any) -> Any:
    """Rebuild the canonical rational strings emitted by `_divisor_wire`."""
    if not isinstance(value, str):
        return field(value)
    pieces = value.split("/")
    if len(pieces) == 1:
        return field(_canonical_integer(pieces[0], "serialized coefficient"))
    if len(pieces) != 2:
        raise ValueError("a serialized coefficient is not rational")
    numerator = _canonical_integer(pieces[0], "serialized numerator")
    denominator = _canonical_integer(pieces[1], "serialized denominator")
    if denominator <= 0 or _gcd(numerator, denominator) != 1:
        raise ValueError("a serialized rational coefficient is not canonical")
    return field(numerator) / field(denominator)


def _serialized_conditional_provider(derived: Mapping[str, Any]) -> Any:
    records: dict[int, dict[str, Any]] = {}
    verified_count = 0
    conditional_count = 0
    for prime_result in derived.get("prime_results", ()):
        verified_count += len(tuple(prime_result.get("reduction_certificates", ())))
        for certificate in prime_result.get("conditional_reduction_constraints", ()):
            conditional_count += 1
            residue_prime = _canonical_integer(
                certificate["reduction_prime"], "reduction_prime"
            )
            records[residue_prime] = {
                "invariants": certificate["invariant_factors"],
                "point_coordinates": certificate["point_coordinates"],
                "map_certificate": certificate.get("map_certificate"),
                "curve_digest": certificate.get("binding", {}).get("curve_digest"),
                "basis_digest": certificate.get("binding", {}).get("basis_digest"),
                "good_reduction_certificate": certificate.get("binding", {}).get(
                    "claimed_good_reduction"
                ),
            }
    if verified_count and conditional_count:
        raise ValueError("mixed verified/conditional reduction replay is unsupported")
    if verified_count:
        return None

    def provider(_jacobian: Any, _basis: Any, prime: int) -> Any:
        if prime not in records:
            raise NotImplementedError("serialized conditional reduction is unavailable")
        return records[prime]

    return provider


def _saturation_from_dict(
    jacobian: Any,
    payload: Mapping[str, Any],
    *,
    assumption_verifiers: Mapping[str, Any] | None,
) -> SaturationResult:
    if payload.get("schema") != SCHEMA:
        raise ValueError("unknown saturation-result schema")
    if payload.get("curve_digest") != _curve_digest(jacobian):
        raise ValueError("the saturation result belongs to a different Jacobian")
    if _digest(payload.get("curve")) != _digest(_curve_payload(jacobian)):
        raise ValueError("the serialized curve model is incorrect")
    input_basis = tuple(
        _divisor_from_wire(jacobian, item) for item in payload["input_basis"]
    )
    raw: Any = payload.get("raw")
    derived: Any = payload.get("derived")
    if not hasattr(raw, "get") or not hasattr(derived, "get"):
        raise ValueError("a saturation result must contain raw and derived records")
    resources = raw.get("resources", {})
    reduction_provider = None
    if raw.get("reduction_provider_mode") != "default-internal":
        reduction_provider = _serialized_conditional_provider(derived)
    division_candidates: dict[int, list[Any]] = {}
    provider_mode = raw.get("division_provider_mode")
    # A classical bounded search is itself a replayable raw computation.  Feeding
    # the roots recorded in the derived basis chain back as candidates would
    # bypass that computation and silently change its certificate on replay.
    if provider_mode != "classical-bounded":
        for step in derived.get("basis_steps", ()):
            prime = _canonical_integer(step["prime"], "basis-step prime")
            root = _divisor_from_wire(jacobian, step["division_point"])
            division_candidates.setdefault(prime, []).append(root)
    if not division_candidates:
        division_candidates_value = None
    else:
        division_candidates_value = division_candidates
    result = saturate_subgroup(
        jacobian,
        input_basis,
        primes=raw.get("primes", ()),
        reduction_primes=raw.get("reduction_primes", ()),
        reduction_provider=reduction_provider,
        division_candidates=division_candidates_value,
        division_search_bound=raw.get("division_search_bound"),
        division_exhaustion_provenance=raw.get("division_exhaustion_provenance"),
        independence_certificate=raw.get("independence_certificate"),
        use_height_pairing=raw.get("use_height_pairing") is True,
        algebraic_rank=raw.get("algebraic_rank"),
        algebraic_rank_provenance=raw.get("algebraic_rank_provenance"),
        selmer_rank_upper_bound=raw.get("selmer_rank_upper_bound"),
        selmer_provenance=raw.get("selmer_provenance"),
        torsion_order=raw.get("torsion_order", 1),
        torsion_provenance=raw.get("torsion_provenance"),
        torsion_subgroup_included=raw.get("torsion_subgroup_included") is True,
        torsion_inclusion_provenance=raw.get("torsion_inclusion_provenance"),
        torsion_ell_control=raw.get("torsion_ell_control"),
        global_index_bound=raw.get("global_index_bound"),
        global_index_bound_provenance=raw.get("global_index_bound_provenance"),
        exact_subgroup_index=raw.get("exact_subgroup_index"),
        exact_subgroup_index_provenance=raw.get("exact_subgroup_index_provenance"),
        possible_index_primes=raw.get("possible_index_primes"),
        possible_index_primes_provenance=raw.get("possible_index_primes_provenance"),
        regulator_upper_bound=raw.get("regulator_upper_bound"),
        full_lattice_regulator_lower_bound=raw.get(
            "full_lattice_regulator_lower_bound"
        ),
        height_lower_bound=raw.get("height_lower_bound"),
        hermite_constant_upper_bound=raw.get("hermite_constant_upper_bound"),
        index_bound_provenance=raw.get("index_bound_provenance"),
        assumption_verifiers=assumption_verifiers,
        max_division_vectors=_canonical_integer(
            resources.get("max_division_vectors", 10_000), "max_division_vectors"
        ),
        max_division_candidates=_canonical_integer(
            resources.get("max_division_candidates", 100_000),
            "max_division_candidates",
        ),
        max_enlargements=_canonical_integer(
            resources.get("max_enlargements", 64), "max_enlargements"
        ),
        max_global_primes=_canonical_integer(
            resources.get("max_global_primes", 10_000), "max_global_primes"
        ),
        max_group_operations=_canonical_integer(
            resources.get("max_group_operations", 10_000_000),
            "max_group_operations",
        ),
        max_baby_steps=_canonical_integer(
            resources.get("max_baby_steps", 1_000_000), "max_baby_steps"
        ),
        max_memory_bytes=_canonical_integer(
            resources.get("max_memory_bytes", 256 * 1024 * 1024),
            "max_memory_bytes",
        ),
        seed=resources.get("seed", 0),
    )
    if _wire(result._derived_dict()) != _wire(derived):
        raise ArithmeticError("serialized saturation derived fields do not replay")
    return result


__all__ = [
    "REDUCTION_SCHEMA",
    "SCHEMA",
    "STEP_SCHEMA",
    "ASSUMPTION_SCHEMA",
    "DIVISION_SEARCH_SCHEMA",
    "SaturationResourceLimitError",
    "SaturationResult",
    "VerifiedReductionRecord",
    "certify_reduction_record",
    "division_search_exhaustion_value",
    "index_bound_from_height",
    "index_bound_from_regulator",
    "reduction_constraint",
    "search_rational_mumford_division",
    "saturate_subgroup",
    "verify_division_search_certificate",
    "verify_reduction_constraint",
]
