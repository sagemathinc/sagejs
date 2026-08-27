"""Abstract finite class groups with exact maps to and from ideals.

`IdealClassGroup.from_context(context)` is the integration boundary.  The
context is duck typed and supplies:

- `order` and immutable `proof_state` or `proof_status`;
- `class_group_presentation` or `presentation`, whose `invariants` are the
  Smith invariant factors and whose optional `verify()` replays the exact
  relation-matrix transforms;
- `class_group_generator_ideals` or `generator_ideals`;
- `class_group_relation_witnesses` or `relation_witnesses`, one exact
  principal-ideal witness for each Smith generator raised to its invariant;
- `ideal_class_log(ideal)` or `ideal_log(ideal)`, returning coordinates plus a
  principal witness for `ideal / representative(coordinates)`;
- optional proof, algorithm, theorem, relation-count, and saturation metadata.

This module imports no concrete context or matrix implementation.  In
particular, a matrix lane can expose transformations without the map lane
depending on its class names, and factored elements can prove principal ideals
through `verify_principal_ideal(ideal)` or `principal_ideal()` without being
expanded.  The engine adapter additionally consumes a verified
`saturation_record`.  Unconditional upgrade results expose authenticated
`proof_progress` with strided partitions; direct Minkowski discoveries retain
the exact factor base and presentation from which the adapter independently
rebuilds that progress.  Both routes bind independently computed
`proof_dependency_hashes` for `relations`, `presentation`, `generators`, and
`saturation`.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sagejs.number_fields.class_group_proof import (
    COMPLETE_PROOF_LABELS,
    EXACT_RELATIONS_CONDITIONAL_GRH,
    EXACT_UNCONDITIONAL,
    ConditionalGRHProofRecord,
    MinkowskiPrimeClassRecord,
    SaturationProofRecord,
    UnconditionalMinkowskiProofRecord,
    proof_label,
)

_PROGRESS_SCHEMA = "sagejs.number-fields.minkowski-proof-progress.v1"
_PARTITION_SCHEMA = "sagejs.number-fields.minkowski-proof-partition.v1"
_PROGRESS_RECORD_SCHEMA = "sagejs.number-fields.minkowski-proof-progress-record.v1"
_SATURATION_SCHEMA = "sagejs.number-fields/class-unit-saturation-v1"
_CONDITIONAL_EVIDENCE_SCHEMA = (
    "sagejs.number-fields/conditional-class-group-evidence-v1"
)
_CONDITIONAL_MAX_BOUND = 100_000
_CONDITIONAL_MAX_RATIONAL_PRIMES = 1_000_000
_CONDITIONAL_MAX_FACTOR_BASE = 4_096
_CONDITIONAL_MAX_RELATIONS = 2_048
_CONDITIONAL_MAX_MEMORY_BYTES = 512 * 1024 * 1024
_CONDITIONAL_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024
_CONDITIONAL_MAX_DEGREE = 256
_CONDITIONAL_MAX_DEPTH = 64
_CONDITIONAL_MAX_NODES = 8_000_000
_CONDITIONAL_MAX_STRING_BYTES = 1 << 16
_CONDITIONAL_MAX_INTEGER_BITS = 4_096
_CONDITIONAL_MAX_CONTAINER_LENGTH = 8_192
_CONDITIONAL_MAX_MATRIX_ENTRIES = 2_000_000
_WORK_CAP = 100_000_000
_CONDITIONAL_MAX_MATRIX_INTEGER_BITS = 1_024
_CONDITIONAL_MAX_IDEAL_EXPONENT = 4_096
_CONDITIONAL_MAX_IDEAL_ROW_WORK = 262_144
_CONDITIONAL_MAX_IDEAL_REPLAY_WORK = 4_000_000
_CONDITIONAL_MAX_WITNESS_EXPONENT = 256
_CONDITIONAL_MAX_WITNESS_WORK = 4_096


def _integer(value: Any, purpose: str) -> int:
    if isinstance(value, (bool, float, str, bytes, bytearray)):
        raise TypeError(purpose + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(purpose + " must be an exact integer") from error
    if answer != value:
        raise TypeError(purpose + " must be an exact integer")
    return answer


def _gcd(left: int, right: int) -> int:
    while right:
        left, right = right, left % right
    return left if left >= 0 else -left


def _value(owner: Any, names: tuple[str, ...], default: Any = None) -> Any:
    for name in names:
        if hasattr(owner, name):
            answer = getattr(owner, name)
            # Sage parents and rings are themselves callable values.  Invoke
            # only a method bound to the object being inspected.
            if getattr(answer, "__self__", None) is owner:
                return answer()
            return answer
    return default


def _call(owner: Any, names: tuple[str, ...]) -> Any:
    for name in names:
        answer = getattr(owner, name, None)
        if callable(answer):
            return answer
    return None


def _same_order(ideal: Any, order: Any) -> bool:
    ring = getattr(ideal, "ring", None)
    return callable(ring) and ring() is order


def _nonzero_ideal(ideal: Any, order: Any) -> None:
    if not _same_order(ideal, order):
        raise TypeError("an ideal-class map requires an ideal in its exact order")
    is_zero = getattr(ideal, "is_zero", None)
    if not callable(is_zero):
        raise TypeError("an ideal-class map requires an exact fractional ideal")
    if is_zero():
        raise ValueError("the zero ideal has no ideal class")


def _ideal_power(ideal: Any, exponent: int) -> Any:
    try:
        return ideal**exponent
    except (TypeError, AttributeError, NotImplementedError):
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_power"]
        )
        return arithmetic.ideal_power(ideal, exponent)


def _ideal_quotient(numerator: Any, denominator: Any) -> Any:
    try:
        return numerator / denominator
    except (TypeError, AttributeError, NotImplementedError):
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_quotient"]
        )
        return arithmetic.ideal_quotient(numerator, denominator)


def _principal_ideal(generator: Any, order: Any) -> Any:
    for name in ("principal_ideal", "associated_ideal", "ideal"):
        constructor = getattr(generator, name, None)
        if callable(constructor):
            try:
                return constructor()
            except TypeError:
                return constructor(order)
    return order.ideal(generator)


def _stage(result: Any, name: str) -> Any:
    for stage in getattr(result, "stages", ()):
        if getattr(stage, "name", None) == name:
            return stage
    return None


def _canonical_payload(value: Any, purpose: str) -> dict[str, Any]:
    serializer = getattr(value, "to_dict", None)
    if callable(serializer):
        value = serializer()
    if not isinstance(value, dict):
        raise TypeError(purpose + " must serialize to a dictionary")
    try:
        text = _canonical_json(value)
        payload = json.loads(text)
    except (TypeError, ValueError) as error:
        raise TypeError(purpose + " must be JSON-safe") from error
    if not isinstance(payload, dict):
        raise TypeError(purpose + " must serialize to a dictionary")
    return payload


def _payload_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def _authenticated_payload(payload: dict[str, Any]) -> bool:
    expected = payload.get("content_sha256")
    if not isinstance(expected, str):
        return False
    body = dict(payload)
    del body["content_sha256"]
    return _payload_hash(body) == expected


def _cancelled(cancelled: Any) -> bool:
    return callable(cancelled) and cancelled() is True


def _conditional_payload_within_caps(value: Any, cancelled: Any = None) -> bool:
    """Bound detached JSON before hashing or constructing arithmetic objects."""
    stack = [(value, 0)]
    nodes = 0
    estimated_bytes = 0
    while stack:
        if nodes % 1_024 == 0 and _cancelled(cancelled):
            return False
        item, depth = stack.pop()
        nodes += 1
        if nodes > _CONDITIONAL_MAX_NODES or depth > _CONDITIONAL_MAX_DEPTH:
            return False
        estimated_bytes += 16
        if estimated_bytes > _CONDITIONAL_MAX_PAYLOAD_BYTES:
            return False
        if item is None or isinstance(item, bool):
            continue
        if isinstance(item, int):
            bits = item.bit_length()
            if bits > _CONDITIONAL_MAX_INTEGER_BITS:
                return False
            estimated_bytes += max(1, (bits + 7) // 8)
            continue
        if isinstance(item, str):
            if len(item) > _CONDITIONAL_MAX_STRING_BYTES:
                return False
            try:
                size = len(item.encode("utf-8"))
            except UnicodeError:
                return False
            if size > _CONDITIONAL_MAX_STRING_BYTES:
                return False
            estimated_bytes += size
            continue
        if isinstance(item, list):
            if len(item) > _CONDITIONAL_MAX_CONTAINER_LENGTH:
                return False
            stack.extend((entry, depth + 1) for entry in item)
            continue
        if isinstance(item, dict):
            if len(item) > 256 or any(not isinstance(key, str) for key in item):
                return False
            stack.extend((key, depth + 1) for key in item)
            stack.extend((entry, depth + 1) for entry in item.values())
            continue
        return False
    return estimated_bytes <= _CONDITIONAL_MAX_PAYLOAD_BYTES


def _conditional_matrix_within_caps(
    payload: dict[str, Any], relation_count: int, column_count: int
) -> bool:
    try:
        if (
            _integer(payload.get("columns"), "presentation column count")
            != column_count
        ):
            return False
        rows = payload.get("rows")
        if not isinstance(rows, list) or len(rows) != relation_count:
            return False
        for row in rows:
            if (
                not isinstance(row, dict)
                or _integer(row.get("columns"), "sparse row width") != column_count
                or not isinstance(row.get("entries"), list)
                or len(row["entries"]) > column_count
            ):
                return False
            seen_columns: set[int] = set()
            for entry in row["entries"]:
                if not isinstance(entry, list) or len(entry) != 2:
                    return False
                column = _integer(entry[0], "sparse row column")
                value = _integer(entry[1], "sparse row entry")
                if (
                    column < 0
                    or column >= column_count
                    or column in seen_columns
                    or abs(value) > _CONDITIONAL_MAX_IDEAL_EXPONENT
                ):
                    return False
                seen_columns.add(column)
        shapes = {
            "hnf": (relation_count, column_count),
            "hnf_left": (relation_count, relation_count),
            "smith": (relation_count, column_count),
            "smith_left": (relation_count, relation_count),
            "smith_right": (column_count, column_count),
            "smith_right_inverse": (column_count, column_count),
        }
        entries = 0
        integer_bit_work = 0
        for name, (row_count, width) in shapes.items():
            matrix = payload.get(name)
            entries += row_count * width
            if (
                entries > _CONDITIONAL_MAX_MATRIX_ENTRIES
                or not isinstance(matrix, list)
                or len(matrix) != row_count
                or any(not isinstance(row, list) or len(row) != width for row in matrix)
            ):
                return False
            for row in matrix:
                for value in row:
                    integer = _integer(value, name + " matrix entry")
                    bits = abs(integer).bit_length()
                    if bits > _CONDITIONAL_MAX_MATRIX_INTEGER_BITS:
                        return False
                    integer_bit_work += max(1, bits)
                    if integer_bit_work > _CONDITIONAL_MAX_PAYLOAD_BYTES * 8:
                        return False
        arithmetic_work = (
            4 * relation_count * relation_count * max(1, column_count)
            + 2 * relation_count * column_count * column_count
            + 2 * relation_count * relation_count * relation_count
            + 4 * column_count * column_count * column_count
        )
        if arithmetic_work > _WORK_CAP:
            return False
        return True
    except (TypeError, ValueError, ArithmeticError, AttributeError):
        return False


def _conditional_ideal_row_work(
    row: Any, norm_bit_costs: tuple[int, ...]
) -> int | None:
    """Bound ideal exponentiation before constructing any ideal powers."""
    if not isinstance(row, (list, tuple)) or len(row) != len(norm_bit_costs):
        return None
    work = 0
    for value, cost in zip(row, norm_bit_costs, strict=True):
        exponent = _integer(value, "conditional ideal exponent")
        if abs(exponent) > _CONDITIONAL_MAX_IDEAL_EXPONENT:
            return None
        work += abs(exponent) * cost
        if work > _CONDITIONAL_MAX_IDEAL_ROW_WORK:
            return None
    return work


def _portable_ideal_fingerprint(ideal: Any) -> dict[str, Any]:
    arithmetic = __import__(
        "sagejs.number_fields.ideal_arithmetic", fromlist=["serialize_ideal"]
    )
    payload = arithmetic.serialize_ideal(ideal)
    return {
        "field_order_fingerprint": payload["field_order_fingerprint"],
        "basis": payload["basis"],
    }


def _decode_factored_generator(field: Any, payload: dict[str, Any]) -> Any:
    factored = __import__(
        "sagejs.number_fields.factored_elements",
        fromlist=["FactoredNumberFieldElement"],
    )
    schema = payload.get("schema")
    if schema == getattr(factored, "SERIALIZATION_SCHEMA", None):
        return factored.FactoredNumberFieldElement.from_dict(field, payload)
    relations = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["FactoredPrincipalWitness"],
    )
    return relations.FactoredPrincipalWitness.from_dict(field, payload)


def _engine_material(engine_group: Any, result: Any) -> tuple[Any, Any]:
    """Read the public adapter surface, with the current engine as fallback."""
    order = _value(engine_group, ("ideal_order", "number_field_order"), None)
    if order is None:
        order = getattr(engine_group, "_order", None)
    if order is None:
        field = getattr(result, "field", None)
        maximal_order = getattr(field, "maximal_order", None)
        if callable(maximal_order):
            order = maximal_order()
    presentation = _value(
        engine_group,
        ("presentation", "relation_presentation", "class_group_presentation"),
        None,
    )
    if presentation is None:
        presentation = getattr(engine_group, "_presentation", None)
    return order, presentation


def _conditional_factor_base_plan(
    order: Any, theorem: str, bound: int
) -> tuple[Any, Any, dict[str, Any]]:
    """Rebuild a GRH plan under immutable verifier-owned resource caps."""
    module = __import__(
        "sagejs.number_fields.class_group_factor_base",
        fromlist=["build_factor_base", "factor_base_plan"],
    )
    degree = _integer(order.degree(), "conditional field degree")
    if (
        degree < 1
        or degree > _CONDITIONAL_MAX_DEGREE
        or bound < 1
        or bound > _CONDITIONAL_MAX_BOUND
    ):
        raise ArithmeticError("conditional factor-base plan exceeds replay caps")
    selected_theorem = theorem
    if "friedman" in theorem.lower():
        selected_theorem = "bdf"
    plan = module.factor_base_plan(
        order,
        proof=False,
        theorem=selected_theorem,
        max_bound=_CONDITIONAL_MAX_BOUND,
        max_rational_primes=_CONDITIONAL_MAX_RATIONAL_PRIMES,
        max_prime_ideals=_CONDITIONAL_MAX_FACTOR_BASE,
        max_memory_bytes=_CONDITIONAL_MAX_MEMORY_BYTES,
    )
    plan.require_feasible()
    if (
        str(plan.theorem) != theorem
        or _integer(plan.bound, "conditional theorem bound") != bound
        or tuple(plan.assumptions) != ("GRH for the Dedekind zeta function",)
    ):
        raise ArithmeticError("conditional theorem metadata failed exact replay")
    return module, plan, _canonical_payload(plan, "conditional factor-base plan")


def _producer_conditional_evidence(
    result: Any,
    engine_group: Any,
    order: Any,
    *,
    theorem: str,
    bound: int,
    relation_count: int,
) -> dict[str, Any]:
    """Detach the exact relation lattice used by a conditional result."""
    factor_base = getattr(result, "conditional_factor_base", None)
    relations = getattr(result, "conditional_relation_records", None)
    presentation = getattr(result, "conditional_presentation_evidence", None)
    # These fallbacks cover engine objects produced before the result-level
    # adapter fields were attached.  Serialized proof replay never uses them.
    if factor_base is None:
        factor_base = getattr(engine_group, "_factor_base", None)
    if relations is None:
        relations = getattr(engine_group, "_relations", None)
    if presentation is None:
        presentation = getattr(engine_group, "_presentation", None)
    if factor_base is None or relations is None or presentation is None:
        raise ArithmeticError(
            "a conditional engine result has no detached relation evidence"
        )
    factor_base = tuple(factor_base)
    relations = tuple(relations)
    if len(relations) != relation_count:
        raise ArithmeticError("conditional relation evidence has the wrong count")
    _module, _plan, plan_payload = _conditional_factor_base_plan(order, theorem, bound)
    retained: Any = None
    context = getattr(result, "context", None)
    consume = getattr(context, "_consume_live_public_generation_payload", None)
    if callable(consume):
        context_module = __import__(
            "sagejs.number_fields.class_unit_context",
            fromlist=["class_unit_context"],
        )
        token = getattr(context_module, "_LIVE_CLASS_UNIT_CONTEXT_TOKEN", None)
        retained = consume(token, result) if token is not None else None
    retained_payload: dict[str, Any] = retained if isinstance(retained, dict) else {}
    retained_matches = bool(
        retained_payload
        and retained_payload.get("proof_status") == EXACT_RELATIONS_CONDITIONAL_GRH
        and retained_payload.get("theorem") == theorem
        and retained_payload.get("bound") == bound
        and tuple(retained_payload.get("assumptions", ()))
        == ("GRH for the Dedekind zeta function",)
        and isinstance(retained_payload.get("factor_base"), list)
        and len(retained_payload["factor_base"]) == len(factor_base)
        and isinstance(retained_payload.get("relations"), list)
        and len(retained_payload["relations"]) == len(relations)
        and isinstance(retained_payload.get("presentation"), dict)
    )
    body = {
        "schema": _CONDITIONAL_EVIDENCE_SCHEMA,
        "proof_status": EXACT_RELATIONS_CONDITIONAL_GRH,
        "field_order_fingerprint": _portable_ideal_fingerprint(order.ideal(1))[
            "field_order_fingerprint"
        ],
        "theorem": theorem,
        "bound": [bound, 1],
        "assumption": "GRH for the Dedekind zeta function",
        "relation_count": relation_count,
        "factor_base_plan": plan_payload,
        "factor_base": (
            list(retained_payload["factor_base"])
            if retained_matches
            else [
                _canonical_payload(prime, "conditional factor-base prime")
                for prime in factor_base
            ]
        ),
        "relations": (
            list(retained_payload["relations"])
            if retained_matches
            else [
                _canonical_payload(record, "conditional relation record")
                for record in relations
            ]
        ),
        "presentation": (
            retained_payload["presentation"]
            if retained_matches
            else _canonical_payload(presentation, "conditional relation presentation")
        ),
    }
    if not _conditional_payload_within_caps(body):
        raise ArithmeticError("conditional relation evidence exceeds replay caps")
    body["content_sha256"] = _payload_hash(body)
    return body


def _residue(value: Any, shape: tuple[int, ...], prime: int) -> Any:
    if not shape:
        answer = _integer(value, "residue entry")
        if answer < 0 or answer >= prime:
            raise ValueError("invalid residue")
        return answer
    if not isinstance(value, list) or len(value) != shape[0]:
        raise ValueError("invalid residue")
    return [_residue(item, shape[1:], prime) for item in value]


def _verify_prime(
    prime_module: Any,
    order: Any,
    ideal: Any,
    expected: dict[str, Any],
    payload: Any,
    replay: list[Any],
    cancelled: Any,
) -> bool:
    if not isinstance(payload, dict) or set(payload) != set(expected):
        return False
    if any(
        _canonical_json(payload[name]) != _canonical_json(expected[name])
        for name in expected
        if name != "residue"
    ):
        return False
    residue = payload.get("residue")
    if not isinstance(residue, dict) or set(residue) != {
        "primitive",
        "quotient_matrix",
        "power_inverse",
        "modulus",
    }:
        return False
    prime = _integer(ideal.rational_prime(), "rational prime")
    degree = _integer(order.degree(), "field degree")
    residue_degree = _integer(ideal.residue_class_degree(), "residue degree")
    if not 1 <= residue_degree <= degree:
        return False
    table = replay[2] if replay[1] == prime else None
    work = degree**3 * (residue_degree + 1) + residue_degree**3 * (
        prime.bit_length() + 1
    )
    if table is None:
        work += degree**3
    replay[0] += work
    if replay[0] > _WORK_CAP or _cancelled(cancelled):
        return False
    primitive = _residue(residue.get("primitive"), (degree,), prime)
    quotient = _residue(residue.get("quotient_matrix"), (degree, residue_degree), prime)
    power_inverse = _residue(
        residue.get("power_inverse"), (residue_degree, residue_degree), prime
    )
    modulus = _residue(residue.get("modulus"), (residue_degree + 1,), prime)
    if modulus[-1] != 1:
        return False
    relative = ideal.basis_matrix() * order._basis_inverse_matrix()
    rows = relative.rows()
    if any(value._denominator != 1 for row in rows for value in row):
        return False
    kernel = prime_module._row_basis(
        [[int(value._numerator) % prime for value in row] for row in rows],
        degree,
        prime,
    )
    if (
        prime_module._rank(kernel, degree, prime) != degree - residue_degree
        or prime_module._rank(quotient, residue_degree, prime) != residue_degree
        or any(
            any(prime_module._row_times_matrix(row, quotient, prime)) for row in kernel
        )
    ):
        return False
    if table is None:
        table = prime_module._modular_table(order, prime)
        replay[1:] = [prime, table]
    if _cancelled(cancelled):
        return False
    one = [value % prime for value in prime_module._order_one_coordinates(order)]
    powers: list[Any] = []
    power = list(one)
    for _exponent in range(residue_degree):
        if _cancelled(cancelled):
            return False
        powers.append(prime_module._row_times_matrix(power, quotient, prime))
        power = prime_module._modular_product(power, primitive, table, prime)
    if _cancelled(cancelled):
        return False
    if prime_module._matrix_inverse(powers, prime) != power_inverse:
        return False
    next_image = prime_module._row_times_matrix(power, quotient, prime)
    coefficients = prime_module._row_times_matrix(next_image, power_inverse, prime)
    if modulus != [(-value) % prime for value in coefficients] + [1]:
        return False
    if _cancelled(cancelled):
        return False
    return (
        prime_module._presentation_modulus_is_irreducible(
            residue, prime, residue_degree
        )
        is True
    )


def _producer_saturation(result: Any) -> tuple[Any, dict[str, Any]]:
    raw = getattr(result, "saturation_record", None)
    if raw is None:
        diagnostics = getattr(result, "diagnostics", None)
        if isinstance(diagnostics, dict):
            raw = diagnostics.get("saturation_record")
    if raw is None:
        raise ArithmeticError(
            "a completed engine result has no replayable saturation evidence"
        )
    payload = None
    live_payload = False
    context = getattr(result, "context", None)
    consume = getattr(context, "_consume_live_public_saturation_payload", None)
    if callable(consume):
        context_module = __import__(
            "sagejs.number_fields.class_unit_context",
            fromlist=["class_unit_context"],
        )
        token = getattr(context_module, "_LIVE_CLASS_UNIT_CONTEXT_TOKEN", None)
        receipt = consume(token, result) if token is not None else None
        if (
            isinstance(receipt, tuple)
            and len(receipt) == 3
            and isinstance(receipt[0], dict)
            and isinstance(receipt[1], str)
            and isinstance(receipt[2], str)
        ):
            candidate = dict(receipt[0])
            candidate["content_sha256"] = receipt[2]
            payload = candidate
            live_payload = True
    if payload is None:
        payload = _canonical_payload(raw, "engine saturation evidence")
    if payload.get("schema") != _SATURATION_SCHEMA:
        raise ValueError("engine saturation evidence has the wrong schema")
    if not live_payload and not _authenticated_payload(payload):
        raise ArithmeticError("engine saturation evidence failed authentication")
    for name in ("rigorous", "complete", "saturated"):
        if payload.get(name) is not True:
            raise ArithmeticError("engine saturation evidence is not " + name)
    remaining = _integer(
        payload.get("remaining_index_bound"), "remaining saturation index bound"
    )
    if remaining != 1:
        raise ArithmeticError("engine saturation evidence leaves a nontrivial index")
    return raw, payload


def _saturation_record(payload: dict[str, Any]) -> SaturationProofRecord:
    class_primes = tuple(
        _integer(value, "class saturation prime")
        for value in payload.get("class_primes", ())
    )
    unit_primes = tuple(
        _integer(value, "unit saturation prime")
        for value in payload.get("unit_primes", payload.get("required_primes", ()))
    )
    required = {
        _integer(value, "required saturation prime")
        for value in payload.get("required_primes", ())
    }
    if not required.issubset(set(class_primes) | set(unit_primes)):
        raise ArithmeticError("required saturation-prime coverage is incomplete")
    initial_bound = _integer(
        payload.get("initial_index_bound", payload.get("index_bound")),
        "initial saturation index bound",
    )
    return SaturationProofRecord(
        class_primes,
        unit_primes,
        index_bound=initial_bound,
        complete=True,
        evidence=payload,
    )


def _producer_proof_progress(result: Any) -> tuple[Any, dict[str, Any]]:
    raw = getattr(result, "proof_progress", None)
    if raw is None:
        diagnostics = getattr(result, "diagnostics", None)
        if isinstance(diagnostics, dict):
            raw = diagnostics.get("proof_progress")
    if raw is None:
        raise ArithmeticError(
            "an unconditional engine result has no authenticated proof progress"
        )
    payload = _canonical_payload(raw, "Minkowski proof progress")
    if payload.get("schema") != _PROGRESS_SCHEMA:
        raise ValueError("Minkowski proof progress has the wrong schema")
    if not _authenticated_payload(payload):
        raise ArithmeticError("Minkowski proof progress failed authentication")
    if payload.get("complete") is not True:
        raise ArithmeticError("incomplete proof progress cannot prove a class group")
    return raw, payload


def _producer_dependency_hashes(result: Any) -> dict[str, str]:
    raw = getattr(result, "proof_dependency_hashes", None)
    if raw is None:
        diagnostics = getattr(result, "diagnostics", None)
        if isinstance(diagnostics, dict):
            raw = diagnostics.get("proof_dependency_hashes")
    if not isinstance(raw, dict):
        raise ArithmeticError("Minkowski proof dependencies are unavailable")
    answer: dict[str, str] = {}
    for name in ("relations", "presentation", "generators", "saturation"):
        value = raw.get(name)
        if (
            not isinstance(value, str)
            or len(value) != 64
            or any(character not in "0123456789abcdef" for character in value)
        ):
            raise ValueError("Minkowski proof dependency hash is missing: " + name)
        answer[name] = value
    return answer


class PrincipalIdealWitness:
    """Exact, optionally factored witness that one ideal is principal."""

    def __init__(
        self,
        ideal: Any,
        generator: Any,
        *,
        source: str = "exact principal-ideal relation",
    ) -> None:
        if not isinstance(source, str) or source == "":
            raise ValueError("a principal witness must describe its source")
        self._ideal = ideal
        self._generator = generator
        self._source = source

    @property
    def ideal(self) -> Any:
        return self._ideal

    @property
    def generator(self) -> Any:
        return self._generator

    @property
    def source(self) -> str:
        return self._source

    @property
    def factored(self) -> bool:
        return hasattr(self._generator, "factors") or hasattr(
            self._generator, "principal_ideal"
        )

    def verify(self, order: Any = None) -> bool:
        try:
            if order is None:
                ring = getattr(self._ideal, "ring", None)
                if not callable(ring):
                    return False
                order = ring()
            if not _same_order(self._ideal, order):
                return False
            verifier = getattr(self._generator, "verify_principal_ideal", None)
            if callable(verifier):
                try:
                    verified = verifier(self._ideal)
                except TypeError:
                    verified = verifier()
                if verified is not True:
                    return False
            return _principal_ideal(self._generator, order) == self._ideal
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False

    def to_dict(self, encode_ideal: Any, encode_generator: Any) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.principal-ideal-witness.v1",
            "ideal": encode_ideal(self._ideal),
            "generator": encode_generator(self._generator),
            "source": self._source,
            "factored": self.factored,
        }

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        decode_ideal: Any,
        decode_generator: Any,
    ) -> PrincipalIdealWitness:
        if data.get("schema") != "sagejs.number-fields.principal-ideal-witness.v1":
            raise ValueError("unsupported principal-ideal witness schema")
        source = data.get("source")
        if not isinstance(source, str):
            raise ValueError("a serialized principal witness has no source")
        witness = cls(
            decode_ideal(data.get("ideal")),
            decode_generator(data.get("generator")),
            source=source,
        )
        if data.get("factored") is not witness.factored:
            raise ValueError("a serialized principal witness changed representation")
        return witness


def _coerce_principal_witness(ideal: Any, witness: Any) -> PrincipalIdealWitness:
    if isinstance(witness, PrincipalIdealWitness):
        return witness
    for name in ("principal_witness", "witness"):
        nested = getattr(witness, name, None)
        if nested is not None:
            if callable(nested) and getattr(nested, "__self__", None) is witness:
                nested = nested()
            return _coerce_principal_witness(ideal, nested)
    generator = getattr(witness, "generator", None)
    if generator is not None:
        if callable(generator) and getattr(generator, "__self__", None) is witness:
            generator = generator()
        return PrincipalIdealWitness(ideal, generator)
    if callable(getattr(witness, "principal_ideal", None)):
        return PrincipalIdealWitness(ideal, witness)
    raise TypeError("a principal relation must retain an exact generator witness")


class IdealClassDiscreteLog:
    """Invariant coordinates plus an exact quotient-principality witness."""

    def __init__(
        self, coordinates: Any, principal_witness: PrincipalIdealWitness
    ) -> None:
        if not isinstance(principal_witness, PrincipalIdealWitness):
            raise TypeError("an ideal discrete log needs a principal witness")
        self._coordinates = tuple(
            _integer(value, "ideal-class coordinate") for value in coordinates
        )
        self._principal_witness = principal_witness

    @property
    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    @property
    def principal_witness(self) -> PrincipalIdealWitness:
        return self._principal_witness

    def verify(self, ideal: Any, group: Any) -> bool:
        try:
            element = group.from_coordinates(self._coordinates)
            quotient = group.ideal_quotient(ideal, element.ideal())
            return (
                self._principal_witness.ideal == quotient
                and self._principal_witness.verify(group.ideal_order())
            )
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False


class PrincipalityResult:
    """Boolean principality answer with an optional exact generator witness."""

    def __init__(
        self,
        is_principal: bool,
        witness: PrincipalIdealWitness | None,
        proof_status: Any,
    ) -> None:
        label = proof_label(proof_status)
        if label not in COMPLETE_PROOF_LABELS:
            raise ValueError("an incomplete proof state cannot decide principality")
        if is_principal and witness is None:
            raise ValueError("a principal result must retain its exact witness")
        if not is_principal and witness is not None:
            raise ValueError("a nonprincipal result cannot carry a principal witness")
        self._is_principal = is_principal is True
        self._witness = witness
        self._proof_status = label

    def __bool__(self) -> bool:
        return self._is_principal

    @property
    def is_principal(self) -> bool:
        return self._is_principal

    @property
    def witness(self) -> PrincipalIdealWitness | None:
        return self._witness

    @property
    def generator(self) -> Any:
        return None if self._witness is None else self._witness.generator

    @property
    def proof_status(self) -> str:
        return self._proof_status

    def verify(self, order: Any = None) -> bool:
        if not self._is_principal:
            return self._witness is None
        return self._witness is not None and self._witness.verify(order)


class IdealClassElement:
    """One ideal class in invariant-factor coordinates."""

    def __init__(self, parent: Any, coordinates: Any) -> None:
        values = tuple(coordinates)
        invariants = parent.invariants()
        if len(values) != len(invariants):
            raise ValueError("the ideal-class coordinate vector has the wrong length")
        self._parent = parent
        self._coordinates = tuple(
            _integer(value, "ideal-class coordinate") % invariants[index]
            for index, value in enumerate(values)
        )

    def parent(self) -> Any:
        return self._parent

    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    exponents = coordinates

    def __iter__(self) -> Any:
        yield from self._coordinates

    def __repr__(self) -> str:
        if self.is_one():
            return "Trivial principal fractional ideal class"
        return "Fractional ideal class with coordinates " + str(self._coordinates)

    def __hash__(self) -> int:
        return hash((id(self._parent), self._coordinates))

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, IdealClassElement)
            and other._parent is self._parent
            and other._coordinates == self._coordinates
        )

    def _same_parent(self, other: Any) -> None:
        if (
            not isinstance(other, IdealClassElement)
            or other._parent is not self._parent
        ):
            raise TypeError("ideal classes must belong to the same class group")

    def __mul__(self, other: Any) -> Any:
        self._same_parent(other)
        return self._parent.from_coordinates(
            [
                left + right
                for left, right in zip(
                    self._coordinates, other._coordinates, strict=False
                )
            ]
        )

    def __truediv__(self, other: Any) -> Any:
        self._same_parent(other)
        return self * other.inverse()

    def inverse(self) -> Any:
        return self._parent.from_coordinates([-value for value in self._coordinates])

    __invert__ = inverse

    def __pow__(self, exponent: Any) -> Any:
        value = _integer(exponent, "ideal-class exponent")
        return self._parent.from_coordinates(
            [value * item for item in self._coordinates]
        )

    def is_one(self) -> bool:
        return all(value == 0 for value in self._coordinates)

    is_principal = is_one

    def order(self) -> int:
        answer = 1
        for value, modulus in zip(
            self._coordinates, self._parent.invariants(), strict=False
        ):
            component = modulus // _gcd(modulus, value)
            answer = answer // _gcd(answer, component) * component
        return answer

    def ideal(self) -> Any:
        return self._parent.representative_ideal(self._coordinates)

    value = ideal


class IdealClassMap:
    """The explicit bidirectional map between coordinates and ideal classes."""

    def __init__(self, group: Any) -> None:
        self._group = group

    def domain(self) -> Any:
        return self._group

    def codomain(self) -> Any:
        return self._group.ideal_order()

    def __call__(self, element: Any) -> Any:
        if (
            not isinstance(element, IdealClassElement)
            or element.parent() is not self._group
        ):
            raise TypeError("the class-group map received an element of another group")
        return element.ideal()

    def preimage(self, ideal: Any) -> IdealClassElement:
        return self._group(ideal)

    inverse = preimage

    def discrete_log(self, ideal: Any) -> IdealClassDiscreteLog:
        return self._group.discrete_log(ideal)


class IdealClassGroup:
    """A complete finite abelian presentation represented by exact ideals."""

    Element = IdealClassElement

    def __init__(
        self,
        order: Any,
        invariants: Any,
        generator_ideals: Any,
        relation_witnesses: Any,
        ideal_log: Any,
        *,
        proof_status: Any,
        algorithm: str = "auto",
        factor_base_theorem: str | None = None,
        factor_base_bound: Any = None,
        presentation_evidence: Any = None,
        proof_record: Any = None,
        proof_context: Any = None,
        relation_count: Any = None,
    ) -> None:
        label = proof_label(proof_status)
        if label not in COMPLETE_PROOF_LABELS:
            raise ValueError(
                "an incomplete or heuristic state has no complete class group"
            )
        values = tuple(_integer(value, "class-group invariant") for value in invariants)
        previous = 1
        for value in values:
            if value <= 1 or value % previous != 0:
                raise ValueError(
                    "class-group invariants must exceed one and divide successively"
                )
            previous = value
        ideals = tuple(generator_ideals)
        raw_witnesses = tuple(relation_witnesses)
        if len(ideals) != len(values) or len(raw_witnesses) != len(values):
            raise ValueError(
                "each invariant needs one generator ideal and relation witness"
            )
        if not callable(ideal_log):
            raise TypeError("a class group needs an exact ideal discrete-log callback")
        if not isinstance(algorithm, str) or algorithm == "":
            raise ValueError("a class-group presentation must name its algorithm")
        if label == EXACT_RELATIONS_CONDITIONAL_GRH and (
            not isinstance(factor_base_theorem, str) or factor_base_theorem == ""
        ):
            raise ValueError(
                "a GRH-conditional group must name its factor-base theorem"
            )
        for ideal in ideals:
            _nonzero_ideal(ideal, order)
        witnesses = tuple(
            _coerce_principal_witness(_ideal_power(ideal, invariant), witness)
            for invariant, ideal, witness in zip(
                values, ideals, raw_witnesses, strict=False
            )
        )
        self._order = order
        self._invariants = values
        self._generator_ideals = ideals
        self._relation_witnesses = witnesses
        self._ideal_log = ideal_log
        self._proof_status = label
        self._algorithm = algorithm
        self._factor_base_theorem = factor_base_theorem
        self._factor_base_bound = factor_base_bound
        self._presentation_evidence = presentation_evidence
        self._proof_record = proof_record
        self._proof_context = proof_context
        self._projection_core: Any = None
        self._projection_ideals_materialized = True
        self._relation_count = (
            None
            if relation_count is None
            else _integer(relation_count, "relation count")
        )
        if self._relation_count is not None and self._relation_count < 0:
            raise ValueError("relation count must be nonnegative")
        self._generators = tuple(
            IdealClassElement(
                self, [1 if index == position else 0 for index in range(len(values))]
            )
            for position in range(len(values))
        )
        self._one = IdealClassElement(self, [0 for _value in values])
        self._map = IdealClassMap(self)
        if not self._verify_relations():
            raise ArithmeticError("a class-group defining relation witness failed")
        if (
            presentation_evidence is not None
            and not self._verify_presentation_evidence()
        ):
            raise ArithmeticError(
                "the exact relation-matrix presentation failed replay"
            )

    @classmethod
    def from_context(cls, context: Any) -> IdealClassGroup:
        """Build a group from the documented context/matrix duck interface."""
        order = _value(context, ("order",))
        state = _value(context, ("proof_state", "proof_status"))
        presentation = _value(context, ("class_group_presentation", "presentation"))
        if presentation is None:
            raise ValueError("the context has no class-group matrix presentation")
        invariants = _value(presentation, ("invariants", "invariant_factors"))
        if invariants is None:
            raise ValueError("the matrix presentation has no invariant factors")
        generators = _value(
            context,
            ("class_group_generator_ideals", "generator_ideals"),
        )
        witnesses = _value(
            context,
            ("class_group_relation_witnesses", "relation_witnesses"),
        )
        resolver = _call(context, ("ideal_class_log", "ideal_log"))
        if generators is None or witnesses is None or resolver is None:
            raise ValueError("the context is missing class-group map material")
        return cls(
            order,
            invariants,
            generators,
            witnesses,
            resolver,
            proof_status=state,
            algorithm=_value(context, ("class_group_algorithm", "algorithm"), "auto"),
            factor_base_theorem=_value(context, ("factor_base_theorem",), None),
            factor_base_bound=_value(context, ("factor_base_bound",), None),
            presentation_evidence=presentation,
            proof_record=_value(
                context, ("class_group_proof_record", "proof_record"), None
            ),
            proof_context=context,
            relation_count=_value(context, ("relation_count",), None),
        )

    def __repr__(self) -> str:
        return (
            "Class group of order "
            + str(self.cardinality())
            + " with invariants "
            + str(self._invariants)
        )

    @property
    def proof_status(self) -> str:
        return self._proof_status

    @property
    def algorithm(self) -> str:
        return self._algorithm

    @property
    def factor_base_theorem(self) -> str | None:
        return self._factor_base_theorem

    @property
    def factor_base_bound(self) -> Any:
        return self._factor_base_bound

    @property
    def relation_count(self) -> int | None:
        return self._relation_count

    @property
    def proof_record(self) -> Any:
        projection = self._projection_core
        if projection is not None:
            return projection.proof_record()
        return self._proof_record

    def ideal_order(self) -> Any:
        return self._order

    number_field_order = ideal_order

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def order(self) -> int:
        answer = 1
        for value in self._invariants:
            answer *= value
        return answer

    cardinality = order

    def one(self) -> IdealClassElement:
        return self._one

    def gen(self, index: int = 0) -> IdealClassElement:
        if index < 0 or index >= len(self._generators):
            raise IndexError("class-group generator index out of range")
        return self._generators[index]

    def gens(self) -> tuple[IdealClassElement, ...]:
        return self._generators

    def gens_ideals(self) -> tuple[Any, ...]:
        projection = self._projection_core
        if projection is not None:
            projection.materialize_view_ideals(self)
        return self._generator_ideals

    def from_coordinates(self, coordinates: Any) -> IdealClassElement:
        return IdealClassElement(self, coordinates)

    def __call__(self, ideal: Any) -> IdealClassElement:
        if isinstance(ideal, IdealClassElement):
            if ideal.parent() is not self:
                raise TypeError("the ideal class belongs to another class group")
            return ideal
        return self.from_coordinates(self.discrete_log(ideal).coordinates)

    def representative_ideal(self, coordinates: Any) -> Any:
        projection = self._projection_core
        if projection is not None:
            projection.materialize_view_ideals(self)
        element = IdealClassElement(self, coordinates)
        answer = self._order.ideal(1)
        for coordinate, ideal in zip(
            element.coordinates(), self._generator_ideals, strict=False
        ):
            if coordinate:
                answer = answer * _ideal_power(ideal, coordinate)
        return answer

    def ideal_quotient(self, numerator: Any, denominator: Any) -> Any:
        _nonzero_ideal(numerator, self._order)
        _nonzero_ideal(denominator, self._order)
        return _ideal_quotient(numerator, denominator)

    def _log_parts(self, result: Any) -> tuple[Any, Any]:
        if isinstance(result, IdealClassDiscreteLog):
            return result.coordinates, result.principal_witness
        if isinstance(result, dict):
            return (
                result.get("coordinates"),
                result.get("principal_witness", result.get("witness")),
            )
        coordinates = getattr(result, "coordinates", None)
        if callable(coordinates):
            coordinates = coordinates()
        witness = getattr(result, "principal_witness", None)
        if callable(witness):
            witness = witness()
        if coordinates is not None and witness is not None:
            return coordinates, witness
        if isinstance(result, (tuple, list)) and len(result) == 2:
            return result[0], result[1]
        raise TypeError(
            "an ideal discrete log must include coordinates and an exact witness"
        )

    def discrete_log(self, ideal: Any) -> IdealClassDiscreteLog:
        _nonzero_ideal(ideal, self._order)
        coordinates, raw_witness = self._log_parts(self._ideal_log(ideal))
        normalized = IdealClassElement(self, coordinates).coordinates()
        quotient = self.ideal_quotient(ideal, self.representative_ideal(normalized))
        witness = _coerce_principal_witness(quotient, raw_witness)
        result = IdealClassDiscreteLog(normalized, witness)
        if not result.verify(ideal, self):
            raise ArithmeticError("the ideal discrete-log witness failed exact replay")
        return result

    ideal_class_log = discrete_log

    def principality(self, ideal: Any) -> PrincipalityResult:
        result = self.discrete_log(ideal)
        if any(result.coordinates):
            return PrincipalityResult(False, None, self._proof_status)
        return PrincipalityResult(True, result.principal_witness, self._proof_status)

    def is_principal(self, ideal: Any, proof: Any = True) -> bool:
        requested = True if proof is None else bool(proof)
        if requested and self._proof_status != EXACT_UNCONDITIONAL:
            raise ValueError(
                "proof=True requires an unconditionally complete class group"
            )
        return bool(self.principality(ideal))

    def proof_payload(self) -> dict[str, Any]:
        """Serialize the attached conditional or unconditional proof record."""
        projection = self._projection_core
        if projection is not None:
            return projection.proof_payload()
        if self._proof_record is None:
            raise ValueError("the class group has no attached completeness proof")
        class_groups = __import__(
            "sagejs.number_fields.class_groups", fromlist=["class_groups"]
        )
        if (
            type(self._proof_record)
            is class_groups.MinkowskiPrincipalFactorBaseCertificate
        ):
            return self._proof_record.to_dict()
        if isinstance(self._proof_record, ConditionalGRHProofRecord):
            payload = self._proof_record.to_dict()
            evidence = getattr(
                self._proof_context, "conditional_evidence_payload", None
            )
            if not callable(evidence):
                raise TypeError("the GRH replay context has no relation evidence")
            payload["conditional_evidence"] = evidence()
            return payload
        if isinstance(self._proof_record, UnconditionalMinkowskiProofRecord):
            encoder = getattr(self._proof_context, "encode_prime_record", None)
            if not callable(encoder):
                raise TypeError("the Minkowski replay context has no prime encoder")
            payload = self._proof_record.to_dict(encoder)
            progress = getattr(self._proof_context, "proof_progress_payload", None)
            if callable(progress):
                payload["proof_progress"] = progress()
            return payload
        raise TypeError("unknown class-group completeness proof record")

    def verify_proof_payload(
        self, payload: dict[str, Any], *, cancelled: Any = None
    ) -> bool:
        """Decode and independently replay one serialized completeness proof."""
        projection = self._projection_core
        if projection is not None:
            return projection.verify_proof_payload(self, payload, cancelled=cancelled)
        try:
            if _cancelled(cancelled):
                return False
            schema = payload.get("schema")
            class_groups = __import__(
                "sagejs.number_fields.class_groups", fromlist=["class_groups"]
            )
            if (
                schema
                == class_groups.MINKOWSKI_PRINCIPAL_FACTOR_BASE_CERTIFICATE_SCHEMA
            ):
                if (
                    type(self._proof_record)
                    is not class_groups.MinkowskiPrincipalFactorBaseCertificate
                ):
                    return False
                record = class_groups.MinkowskiPrincipalFactorBaseCertificate.from_dict(
                    self._order.number_field(),
                    payload,
                    group=self,
                    cancelled=cancelled,
                )
                return record.to_dict() == payload
            if schema == "sagejs.number-fields.class-group.grh-proof.v1":
                expected_fields = {
                    "schema",
                    "proof_status",
                    "theorem",
                    "bound",
                    "relation_count",
                    "assumption",
                    "saturation",
                    "analytic_index_one",
                    "conditional_evidence",
                }
                if (
                    not _conditional_payload_within_caps(payload, cancelled)
                    or set(payload) != expected_fields
                ):
                    return False
                record: Any = ConditionalGRHProofRecord.from_dict(payload)
                verifier = getattr(
                    self._proof_context,
                    "verify_conditional_evidence_payload",
                    None,
                )
                if (
                    not callable(verifier)
                    or verifier(payload, record, self, cancelled=cancelled) is not True
                ):
                    return False
            elif schema == "sagejs.number-fields.class-group.minkowski-proof.v1":
                preflight = getattr(
                    self._proof_context, "preflight_unconditional_payload", None
                )
                if (
                    not callable(preflight)
                    or preflight(payload, self, cancelled=cancelled) is not True
                ):
                    return False
                decoder = getattr(self._proof_context, "decode_prime_record", None)
                if not callable(decoder):
                    return False
                decoded_primes = []
                for index, raw in enumerate(payload["prime_records"]):
                    if index % 16 == 0 and _cancelled(cancelled):
                        return False
                    decoded_primes.append(decoder(raw))
                record = UnconditionalMinkowskiProofRecord(
                    field_order_fingerprint=payload["field_order_fingerprint"],
                    discriminant=payload["discriminant"],
                    bound=payload["bound"],
                    prime_records=decoded_primes,
                    saturation=SaturationProofRecord.from_dict(payload["saturation"]),
                    theorem=payload["theorem"],
                )
                progress = getattr(
                    self._proof_context, "verify_proof_progress_payload", None
                )
                if (
                    callable(progress)
                    and progress(payload, record, cancelled=cancelled) is not True
                ):
                    return False
            else:
                return False
            return record.verify(self, self._proof_context) is True
        except (TypeError, ValueError, ArithmeticError, AttributeError, IndexError):
            return False

    def map(self) -> IdealClassMap:
        return self._map

    def _verify_relations(self) -> bool:
        try:
            for invariant, ideal, witness in zip(
                self._invariants,
                self._generator_ideals,
                self._relation_witnesses,
                strict=False,
            ):
                if witness.ideal != _ideal_power(ideal, invariant):
                    return False
                if not witness.verify(self._order):
                    return False
            return True
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False

    def _verify_presentation_evidence(self) -> bool:
        evidence = self._presentation_evidence
        checker = _call(evidence, ("verify_class_group_presentation", "verify"))
        if checker is None:
            return True
        try:
            answer = checker(self)
        except TypeError:
            answer = checker()
        if answer is not True:
            return False
        invariants = _value(evidence, ("invariants", "invariant_factors"), None)
        if (
            invariants is not None
            and tuple(int(value) for value in invariants) != self._invariants
        ):
            return False
        presentation_order = _value(evidence, ("order",), None)
        if presentation_order is not None and int(presentation_order) != self.order():
            return False
        free_rank = _value(evidence, ("free_rank",), None)
        return free_rank is None or int(free_rank) == 0

    def verify(self) -> bool:
        projection = self._projection_core
        if projection is not None:
            return projection.verify_view(self)
        try:
            if proof_label(self._proof_status) not in COMPLETE_PROOF_LABELS:
                return False
            if not self._verify_relations() or not self._verify_presentation_evidence():
                return False
            for index, generator in enumerate(self._generators):
                if generator.order() != self._invariants[index]:
                    return False
                if self(generator.ideal()) != generator:
                    return False
            if self._proof_record is not None:
                if proof_label(self._proof_record.proof_status) != self._proof_status:
                    return False
                if self._proof_record.verify(self, self._proof_context) is not True:
                    return False
            return True
        except (TypeError, ValueError, ArithmeticError, AttributeError, IndexError):
            return False


class _IdealClassGroupProjectionView:
    __slots__ = (
        "_generation_verifier",
        "_generator_payloads",
        "_ideal_log",
        "_presentation_json",
        "_proof_payload_json",
        "_metadata",
        "_witness_generators",
        "_sealed",
    )

    def __init__(
        self,
        generator_payloads: tuple[str, ...],
        witness_generators: tuple[tuple[Any, str, str], ...],
        presentation_json: str,
        proof_payload_json: str,
        metadata: tuple[Any, ...],
        ideal_log: Any,
        generation_verifier: Any,
    ) -> None:
        object.__setattr__(self, "_generator_payloads", generator_payloads)
        object.__setattr__(self, "_witness_generators", witness_generators)
        object.__setattr__(self, "_presentation_json", presentation_json)
        object.__setattr__(self, "_proof_payload_json", proof_payload_json)
        object.__setattr__(self, "_metadata", metadata)
        object.__setattr__(self, "_ideal_log", ideal_log)
        object.__setattr__(self, "_generation_verifier", generation_verifier)
        object.__setattr__(self, "_sealed", True)

    def __setattr__(self, name: str, value: Any) -> None:
        if getattr(self, "_sealed", False):
            raise AttributeError("a public class-group projection is immutable")
        object.__setattr__(self, name, value)

    def _ideals(self) -> tuple[Any, ...]:
        ideal_module = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        return tuple(
            ideal_module.ideal_from_dict(self._metadata[0], json.loads(payload))
            for payload in self._generator_payloads
        )

    def proof_record(self) -> Any:
        payload = self.proof_payload()
        if payload.get("schema") == "sagejs.number-fields.class-group.grh-proof.v1":
            return ConditionalGRHProofRecord.from_dict(payload)
        return _decode_unconditional_proof_record(self._metadata[0], payload)

    def proof_payload(self) -> dict[str, Any]:
        return json.loads(self._proof_payload_json)

    def new_view(self) -> IdealClassGroup:
        order, invariants, status, algorithm, theorem, bound, count = self._metadata
        answer = IdealClassGroup.__new__(IdealClassGroup)
        answer._order = order
        answer._invariants = invariants
        answer._generator_ideals = ()
        answer._relation_witnesses = ()
        answer._ideal_log = self._ideal_log
        answer._proof_status = status
        answer._algorithm = algorithm
        answer._factor_base_theorem = theorem
        answer._factor_base_bound = bound
        answer._presentation_evidence = None
        answer._proof_record = None
        answer._proof_context = None
        answer._relation_count = count
        answer._generators = tuple(
            IdealClassElement(
                answer,
                [1 if index == position else 0 for index in range(len(invariants))],
            )
            for position in range(len(invariants))
        )
        answer._one = IdealClassElement(answer, [0 for _value in invariants])
        answer._map = IdealClassMap(answer)
        answer._projection_core = self
        answer._projection_ideals_materialized = False
        return answer

    def materialize_view_ideals(self, view: IdealClassGroup) -> None:
        if view._projection_core is not self:
            raise ArithmeticError("a projected class group changed its receipt")
        if not view._projection_ideals_materialized:
            view._generator_ideals = self._ideals()
            view._projection_ideals_materialized = True

    def _full_group(self) -> IdealClassGroup:
        matrix_module = __import__(
            "sagejs.number_fields.class_group_matrix", fromlist=["class_group_matrix"]
        )
        order, invariants, status, algorithm, theorem, bound, count = self._metadata
        ideals = self._ideals()
        witnesses = []
        field = order.number_field()
        for invariant, ideal, (generator_type, payload, source) in zip(
            invariants, ideals, self._witness_generators, strict=True
        ):
            generator = generator_type.from_dict(field, json.loads(payload))
            witnesses.append(
                PrincipalIdealWitness(
                    _ideal_power(ideal, invariant), generator, source=source
                )
            )
        presentation = matrix_module.RelationPresentation.from_dict(
            json.loads(self._presentation_json)
        )
        context, proof_record = _detached_public_replay_context(
            order,
            invariants,
            ideals,
            self._proof_payload_json,
            self._generation_verifier,
        )
        return IdealClassGroup(
            order,
            invariants,
            ideals,
            witnesses,
            self._ideal_log,
            proof_status=status,
            algorithm=algorithm,
            factor_base_theorem=theorem,
            factor_base_bound=bound,
            presentation_evidence=presentation,
            proof_record=proof_record,
            proof_context=context,
            relation_count=count,
        )

    def _matches_view(self, view: IdealClassGroup) -> bool:
        try:
            self.materialize_view_ideals(view)
            ideal_module = __import__(
                "sagejs.number_fields.ideal_arithmetic",
                fromlist=["ideal_arithmetic"],
            )
            payloads = tuple(
                _canonical_json(ideal_module.serialize_ideal(ideal))
                for ideal in view._generator_ideals
            )
            order, invariants, status, algorithm, theorem, bound, count = self._metadata
            return bool(
                view._order is order
                and view._invariants == invariants
                and view._proof_status == status
                and view._algorithm == algorithm
                and view._factor_base_theorem == theorem
                and view._factor_base_bound == bound
                and view._relation_count == count
                and view._ideal_log is self._ideal_log
                and payloads == self._generator_payloads
                and len(view._generators) == len(invariants)
                and all(generator.parent() is view for generator in view._generators)
                and view._one.parent() is view
                and view._map.domain() is view
            )
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False

    def verify_view(self, view: IdealClassGroup) -> bool:
        if not self._matches_view(view):
            return False
        try:
            return self._full_group().verify() is True
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False

    def verify_proof_payload(
        self,
        view: IdealClassGroup,
        payload: dict[str, Any],
        *,
        cancelled: Any = None,
    ) -> bool:
        if _cancelled(cancelled) or not self._matches_view(view):
            return False
        try:
            return self._full_group().verify_proof_payload(payload, cancelled=cancelled)
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False


class _SealedIdealClassGroupProjection:
    __slots__ = (
        "_generation_verifier",
        "_generator_payloads",
        "_ideal_log",
        "_metadata",
        "_presentation_json",
        "_proof_payload_json",
        "_sealed",
        "_witness_generators",
    )

    def __init__(self, source: IdealClassGroup) -> None:
        if type(source) is not IdealClassGroup:
            raise TypeError("a public projection needs an ordinary exact group")
        if IdealClassGroup.verify(source) is not True:
            raise ArithmeticError("a public projection source failed exact replay")
        self._initialize(source)

    def _initialize(
        self,
        source: IdealClassGroup,
        *,
        proof_payload: dict[str, Any] | None = None,
    ) -> None:
        if type(source) is not IdealClassGroup:
            raise TypeError("a public projection needs an ordinary exact group")
        if not isinstance(
            source._proof_record,
            (ConditionalGRHProofRecord, UnconditionalMinkowskiProofRecord),
        ):
            raise TypeError("a public projection needs a replayable proof record")
        context = source._proof_context
        if type(context) is not _EngineProofReplayContext:
            raise TypeError("a public projection needs the standard replay context")
        saturation = context._saturation_producer
        generation_verifier = getattr(saturation, "_analytic_generation_verifier", None)
        if not callable(generation_verifier):
            raise TypeError("a public projection needs exact generation replay")
        ideal_module = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        generator_payloads = tuple(
            _canonical_json(ideal_module.serialize_ideal(ideal))
            for ideal in source._generator_ideals
        )
        witness_generators = []
        for witness in source._relation_witnesses:
            generator = witness.generator
            encoder = getattr(generator, "to_dict", None)
            decoder = getattr(type(generator), "from_dict", None)
            if not callable(encoder) or not callable(decoder):
                raise TypeError(
                    "a projected principal witness needs canonical serialization"
                )
            witness_generators.append(
                (type(generator), _canonical_json(encoder()), witness.source)
            )
        presentation_encoder = getattr(source._presentation_evidence, "to_dict", None)
        if not callable(presentation_encoder):
            raise TypeError("a public projection needs a replayable presentation")
        object.__setattr__(self, "_generator_payloads", generator_payloads)
        object.__setattr__(self, "_witness_generators", tuple(witness_generators))
        object.__setattr__(
            self, "_presentation_json", _canonical_json(presentation_encoder())
        )
        object.__setattr__(
            self,
            "_proof_payload_json",
            _canonical_json(
                source.proof_payload() if proof_payload is None else proof_payload
            ),
        )
        object.__setattr__(
            self,
            "_metadata",
            (
                source._order,
                source._invariants,
                source._proof_status,
                source._algorithm,
                source._factor_base_theorem,
                source._factor_base_bound,
                source._relation_count,
            ),
        )
        object.__setattr__(self, "_ideal_log", source._ideal_log)
        object.__setattr__(self, "_generation_verifier", generation_verifier)
        object.__setattr__(self, "_sealed", True)

    def __setattr__(self, name: str, value: Any) -> None:
        if getattr(self, "_sealed", False):
            raise AttributeError("a public class-group projection is immutable")
        object.__setattr__(self, name, value)

    def new_view(self) -> IdealClassGroup:
        # The context-owned projection never escapes.  Every public wrapper
        # gets its own immutable capsule, so mutating one view cannot alter the
        # replay state used by a later observation.
        capsule = _IdealClassGroupProjectionView(
            self._generator_payloads,
            self._witness_generators,
            self._presentation_json,
            self._proof_payload_json,
            self._metadata,
            self._ideal_log,
            self._generation_verifier,
        )
        return capsule.new_view()


def seal_public_class_group_projection(
    source: IdealClassGroup,
) -> _SealedIdealClassGroupProjection:
    return _SealedIdealClassGroupProjection(source)


def public_class_group_projection_view(projection: Any) -> IdealClassGroup:
    if type(projection) is not _SealedIdealClassGroupProjection:
        raise ArithmeticError("the public class-group projection changed type")
    return projection.new_view()


def class_group_from_context(context: Any) -> IdealClassGroup:
    """Public functional constructor for context-producing orchestration code."""
    return IdealClassGroup.from_context(context)


def class_group_from_minkowski_result(result: Any) -> IdealClassGroup:
    """Build a public group proved by a bounded Minkowski result."""
    class_groups = __import__(
        "sagejs.number_fields.class_groups", fromlist=["class_groups"]
    )
    if type(result) is not class_groups.ClassGroupSearchResult or not result.complete:
        raise TypeError("a complete bounded class-group result is required")
    certificate = result.certificate
    if type(certificate) is not class_groups.ClassGroupCertificate:
        raise TypeError("the bounded result has the wrong certificate type")
    arithmetic = certificate.arithmetic_certificate
    if type(arithmetic) is not class_groups.MinkowskiPrincipalFactorBaseCertificate:
        raise TypeError("the bounded result has no Minkowski principal-factor proof")
    if (
        result.group is not certificate.group
        or result.field is not arithmetic.field
        or result.order() != 1
        or result.invariants() != ()
        or certificate.invariants != ()
        or certificate.enumerated_order != 1
    ):
        raise ArithmeticError(
            "the bounded trivial class group changed before adaptation"
        )
    order = result.field.maximal_order()
    relations = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["class_group_relations"],
    )

    def ideal_log(ideal: Any) -> Any:
        return relations.reduce_ideal_over_base(ideal, ())

    answer = IdealClassGroup(
        order,
        (),
        (),
        (),
        ideal_log,
        proof_status=EXACT_UNCONDITIONAL,
        algorithm="minkowski-principal-factor-base",
        factor_base_theorem="Minkowski ideal-class theorem",
        factor_base_bound=(int(result.minkowski_bound), 1),
        proof_record=arithmetic,
        relation_count=len(arithmetic.factor_base),
    )
    if answer.verify() is not True:
        raise ArithmeticError("the bounded public class group failed exact replay")
    return answer


class _EngineProofReplayContext:
    """Independent replay hooks for one completed engine result."""

    def __init__(
        self,
        result: Any,
        engine_group: Any,
        order: Any,
        saturation: SaturationProofRecord,
        saturation_producer: Any,
        saturation_payload: dict[str, Any],
        bound: int,
        proof_progress: Any = None,
        proof_progress_payload: dict[str, Any] | None = None,
        dependency_hashes: dict[str, str] | None = None,
        conditional_evidence_payload: dict[str, Any] | None = None,
    ) -> None:
        self.result = result
        self.engine_group = engine_group
        self.order = order
        self.field = order.number_field()
        try:
            arithmetic = __import__(
                "sagejs.number_fields.ideal_arithmetic", fromlist=["serialize_ideal"]
            )
            identity_payload = arithmetic.serialize_ideal(order.ideal(1))
            self.field_order_fingerprint = identity_payload["field_order_fingerprint"]
        except (AttributeError, TypeError, ValueError, KeyError):
            self.field_order_fingerprint = _value(
                order, ("field_order_fingerprint",), None
            )
        self.discriminant = int(order.discriminant())
        self.minkowski_bound = (int(bound), 1)
        self.saturation_record = saturation
        self._saturation_producer = saturation_producer
        self._saturation_payload = saturation_payload
        self._proof_progress = proof_progress
        self._proof_progress_payload = proof_progress_payload
        self._dependency_hashes = dependency_hashes
        self._conditional_evidence_payload = conditional_evidence_payload
        self._conditional_plan_cache: Any = None
        self._receipt = None

    def verify_saturation_record(self, record: Any) -> bool:
        if (
            record.to_dict() != self.saturation_record.to_dict()
            or record.evidence != self._saturation_payload
        ):
            return False
        checker = getattr(self.result, "verify_saturation_record", None)
        if callable(checker):
            return checker(self._saturation_payload) is True
        checker = getattr(self._saturation_producer, "verify", None)
        if not callable(checker):
            return False
        original_units = getattr(self.result, "saturation_original_units", None)
        if original_units is None:
            original_units = _value(self.result, ("units",), ())
        analytic_validation = getattr(self.result, "analytic_validation", None)
        try:
            return (
                checker(
                    self.field,
                    self.order,
                    tuple(original_units),
                    analytic_validation=analytic_validation,
                )
                is True
            )
        except TypeError:
            try:
                return checker(self.field, self.order, tuple(original_units)) is True
            except TypeError:
                return checker() is True

    def proof_progress_payload(self) -> dict[str, Any]:
        if self._proof_progress_payload is None:
            raise ValueError("the proof has no authenticated partition progress")
        if not _conditional_payload_within_caps(self._proof_progress_payload):
            raise ArithmeticError("Minkowski proof progress exceeds replay caps")
        return _canonical_payload(
            self._proof_progress_payload, "Minkowski proof progress"
        )

    def preflight_unconditional_payload(
        self,
        payload: Any,
        group: Any,
        *,
        cancelled: Any = None,
    ) -> bool:
        try:
            expected_fields = {
                "schema",
                "proof_status",
                "theorem",
                "field_order_fingerprint",
                "discriminant",
                "bound",
                "prime_records",
                "saturation",
                "proof_progress",
            }
            if (
                not isinstance(payload, dict)
                or not _conditional_payload_within_caps(payload, cancelled)
                or set(payload) != expected_fields
                or self._proof_progress_payload is None
                or payload.get("proof_progress") != self._proof_progress_payload
                or _cancelled(cancelled)
            ):
                return False
            degree = _integer(self.order.degree(), "unconditional field degree")
            bound = payload.get("bound")
            progress = payload.get("proof_progress")
            records = payload.get("prime_records")
            if (
                degree < 1
                or degree > _CONDITIONAL_MAX_DEGREE
                or not isinstance(bound, list)
                or len(bound) != 2
                or _integer(bound[0], "Minkowski bound") < 0
                or _integer(bound[0], "Minkowski bound") > _CONDITIONAL_MAX_BOUND
                or _integer(bound[1], "Minkowski bound denominator") != 1
                or not isinstance(progress, dict)
                or not isinstance(records, list)
            ):
                return False
            fingerprints = progress.get("prime_fingerprints")
            if (
                not isinstance(fingerprints, list)
                or len(fingerprints) > _CONDITIONAL_MAX_FACTOR_BASE
                or len(records) != len(fingerprints)
            ):
                return False
            coordinate_count = len(tuple(group.invariants()))
            for index, item in enumerate(records):
                if index % 32 == 0 and _cancelled(cancelled):
                    return False
                if not isinstance(item, dict) or set(item) != {
                    "ideal",
                    "fingerprint",
                    "norm",
                    "coordinates",
                    "principal_witness",
                }:
                    return False
                coordinates = item.get("coordinates")
                if (
                    not isinstance(item.get("ideal"), dict)
                    or not isinstance(item.get("principal_witness"), dict)
                    or not isinstance(coordinates, list)
                    or len(coordinates) != coordinate_count
                ):
                    return False
            return True
        except (TypeError, ValueError, ArithmeticError, AttributeError, KeyError):
            return False

    def conditional_evidence_payload(self) -> dict[str, Any]:
        if self._conditional_evidence_payload is None:
            raise ValueError("the proof has no detached conditional evidence")
        return _canonical_payload(
            self._conditional_evidence_payload, "conditional relation evidence"
        )

    def _conditional_plan_material(
        self, theorem: str, bound: int, cancelled: Any = None
    ) -> tuple[dict[str, Any], tuple[Any, ...], list[dict[str, Any]]]:
        key = (theorem, bound)
        cached = self._conditional_plan_cache
        if cached is not None and cached[0] == key:
            return cached[1], cached[2], cached[3]
        if _cancelled(cancelled):
            raise ArithmeticError("conditional proof replay was cancelled")
        module, plan, plan_payload = _conditional_factor_base_plan(
            self.order, theorem, bound
        )
        records = module.build_factor_base(plan)
        if _cancelled(cancelled):
            raise ArithmeticError("conditional proof replay was cancelled")
        factor_base = tuple(
            _value(item, ("prime_ideal", "ideal"), None) for item in records
        )
        if any(prime is None for prime in factor_base):
            raise ArithmeticError("a rebuilt factor-base record lost its prime ideal")
        prime_payloads = [
            _canonical_payload(prime, "conditional factor-base prime")
            for prime in factor_base
        ]
        self._conditional_plan_cache = (
            key,
            plan_payload,
            factor_base,
            prime_payloads,
        )
        return plan_payload, factor_base, prime_payloads

    def _verify_conditional_evidence(
        self, evidence: Any, record: Any, group: Any, cancelled: Any = None
    ) -> bool:
        if (
            not isinstance(evidence, dict)
            or not _conditional_payload_within_caps(evidence, cancelled)
            or _cancelled(cancelled)
        ):
            return False
        expected_fields = {
            "schema",
            "proof_status",
            "field_order_fingerprint",
            "theorem",
            "bound",
            "assumption",
            "relation_count",
            "factor_base_plan",
            "factor_base",
            "relations",
            "presentation",
            "content_sha256",
        }
        if (
            set(evidence) != expected_fields
            or evidence.get("schema") != _CONDITIONAL_EVIDENCE_SCHEMA
            or evidence.get("proof_status") != EXACT_RELATIONS_CONDITIONAL_GRH
            or not _authenticated_payload(evidence)
            or evidence.get("field_order_fingerprint") != self.field_order_fingerprint
            or evidence.get("theorem") != record.theorem
            or evidence.get("bound") != list(record.bound)
            or evidence.get("assumption") != record.assumption
            or _integer(evidence.get("relation_count"), "conditional relation count")
            != record.relation_count
        ):
            return False
        prime_payloads = evidence.get("factor_base")
        plan_payload = evidence.get("factor_base_plan")
        relation_payloads = evidence.get("relations")
        presentation_payload = evidence.get("presentation")
        if (
            not isinstance(prime_payloads, list)
            or not isinstance(plan_payload, dict)
            or not isinstance(relation_payloads, list)
            or not isinstance(presentation_payload, dict)
            or len(relation_payloads) != record.relation_count
            or len(relation_payloads) > _CONDITIONAL_MAX_RELATIONS
            or len(prime_payloads) > _CONDITIONAL_MAX_FACTOR_BASE
            or record.relation_count > _CONDITIONAL_MAX_RELATIONS
        ):
            return False
        column_count = len(prime_payloads)
        relation_module = __import__(
            "sagejs.number_fields.class_group_relations",
            fromlist=[
                "FactorBaseIdealReconstructor",
                "RelationRecord",
                "reconstruct_factor_base_ideal",
                "verify_relation_records",
            ],
        )
        matrix_module = __import__(
            "sagejs.number_fields.class_group_matrix",
            fromlist=["RelationPresentation"],
        )
        rebuilt_plan_payload, factor_base, rebuilt_prime_payloads = (
            self._conditional_plan_material(
                record.theorem,
                _integer(record.bound[0], "conditional factor-base bound"),
                cancelled,
            )
        )
        if rebuilt_plan_payload != plan_payload:
            return False
        if _cancelled(cancelled):
            return False
        prime_module = __import__(
            "sagejs.number_fields.prime_ideals", fromlist=["NumberFieldPrimeIdeal"]
        )
        residue_replay = [0, None, None]
        if len(rebuilt_prime_payloads) != len(prime_payloads):
            return False
        for rebuilt_prime, rebuilt_payload, payload in zip(
            factor_base, rebuilt_prime_payloads, prime_payloads, strict=True
        ):
            if _cancelled(cancelled) or not _verify_prime(
                prime_module,
                self.order,
                rebuilt_prime,
                rebuilt_payload,
                payload,
                residue_replay,
                cancelled,
            ):
                return False
        for payload in relation_payloads:
            if not isinstance(payload, dict):
                return False
            for name in ("row", "quotient_row", "source_row"):
                value = payload.get(name)
                if not isinstance(value, list) or len(value) != column_count:
                    return False
        if not _conditional_matrix_within_caps(
            presentation_payload, len(relation_payloads), column_count
        ):
            return False
        canonical_primes = tuple(
            json.dumps(payload, sort_keys=True, separators=(",", ":"))
            for payload in prime_payloads
        )
        if len(set(canonical_primes)) != len(canonical_primes):
            return False
        bound = _integer(record.bound[0], "conditional factor-base bound")
        norm_bit_costs: list[int] = []
        for prime in factor_base:
            rational_prime = _integer(
                prime.rational_prime(), "conditional rational prime"
            )
            residue_degree = _integer(
                prime.residue_class_degree(), "conditional residue degree"
            )
            prime_norm = rational_prime**residue_degree
            if prime_norm > bound:
                return False
            norm_bit_costs.append(max(1, prime_norm.bit_length()))
        ideal_replay_work = 0
        witness_replay_work = 0
        exact_norm_costs = tuple(norm_bit_costs)
        for payload in relation_payloads:
            for name in ("source_row", "quotient_row", "row"):
                row_work = _conditional_ideal_row_work(
                    payload.get(name), exact_norm_costs
                )
                if row_work is None:
                    return False
                ideal_replay_work += row_work
                if ideal_replay_work > _CONDITIONAL_MAX_IDEAL_REPLAY_WORK:
                    return False
            witness = payload.get("witness")
            factors = witness.get("factors") if isinstance(witness, dict) else None
            if not isinstance(factors, list):
                return False
            for factor in factors:
                if not isinstance(factor, dict) or set(factor) != {
                    "element",
                    "exponent",
                }:
                    return False
                exponent = _integer(
                    factor.get("exponent"), "conditional witness exponent"
                )
                if abs(exponent) > _CONDITIONAL_MAX_WITNESS_EXPONENT:
                    return False
                witness_replay_work += abs(exponent)
                if witness_replay_work > _CONDITIONAL_MAX_WITNESS_WORK:
                    return False
        # This cache belongs only to this detached replay.  It does not trust
        # or inherit the engine collector, and every cached ideal is still
        # checked against the independently decoded relation witnesses below.
        reconstructor = relation_module.FactorBaseIdealReconstructor(
            self.order, factor_base
        )
        decoded_relations = []
        for index, payload in enumerate(relation_payloads):
            if index % 32 == 0 and _cancelled(cancelled):
                return False
            relation = relation_module.RelationRecord.from_dict(payload)
            if relation.to_dict() != payload:
                return False
            decoded_relations.append(relation)
        relations = tuple(decoded_relations)
        if not relation_module.verify_relation_records(
            self.order,
            factor_base,
            relations,
            reconstructor=reconstructor,
            cancelled=cancelled,
        ):
            return False
        if _cancelled(cancelled):
            return False
        presentation = matrix_module.RelationPresentation.from_dict(
            presentation_payload
        )
        if _cancelled(cancelled):
            return False
        if (
            presentation.to_dict() != presentation_payload
            or presentation.verify() is not True
        ):
            return False
        rows = tuple(tuple(row.dense()) for row in presentation.relation_rows)
        if (
            presentation.column_count != len(factor_base)
            or rows != tuple(relation.row for relation in relations)
            or presentation.free_rank != 0
            or tuple(presentation.invariants) != tuple(group.invariants())
            or _integer(presentation.order, "conditional presentation order")
            != _integer(group.order(), "conditional class-group order")
        ):
            return False
        generator_ideals = tuple(group.gens_ideals())
        if len(presentation.generator_transforms) != len(generator_ideals):
            return False
        for transform, ideal in zip(
            presentation.generator_transforms, generator_ideals, strict=True
        ):
            row_work = _conditional_ideal_row_work(transform, exact_norm_costs)
            if row_work is None:
                return False
            ideal_replay_work += row_work
            if ideal_replay_work > _CONDITIONAL_MAX_IDEAL_REPLAY_WORK:
                return False
            reconstructed = reconstructor.reconstruct(transform)
            if reconstructed != ideal:
                return False
        return True

    def verify_conditional_evidence_payload(
        self,
        proof_payload: dict[str, Any],
        record: Any,
        group: Any,
        *,
        cancelled: Any = None,
    ) -> bool:
        try:
            self._receipt = None
            answer = self._verify_conditional_evidence(
                proof_payload.get("conditional_evidence"), record, group, cancelled
            )
            self._receipt = record if answer else None
            return answer
        except (
            TypeError,
            ValueError,
            ArithmeticError,
            AttributeError,
            IndexError,
            KeyError,
        ):
            return False

    def _progress_records(self, payload: dict[str, Any]) -> tuple[dict[str, Any], ...]:
        count = _integer(payload.get("partition_count"), "proof partition count")
        fingerprints = payload.get("prime_fingerprints")
        partitions = payload.get("partitions")
        if (
            count < 1
            or not isinstance(fingerprints, list)
            or not isinstance(partitions, list)
        ):
            raise ValueError("Minkowski proof progress has invalid coverage metadata")
        if len(partitions) != count:
            raise ValueError("Minkowski proof progress lost a partition")
        total = len(fingerprints)
        if (
            _integer(payload.get("completed_items"), "completed proof item count")
            != total
        ):
            raise ValueError("Minkowski proof progress is not complete")
        indexed: dict[int, dict[str, Any]] = {}
        plan_hash = payload.get("plan_sha256")
        if (
            not isinstance(plan_hash, str)
            or len(plan_hash) != 64
            or any(character not in "0123456789abcdef" for character in plan_hash)
        ):
            raise ValueError("Minkowski proof progress has no plan hash")
        for expected_partition, partition in enumerate(partitions):
            if (
                not isinstance(partition, dict)
                or partition.get("schema") != _PARTITION_SCHEMA
                or not _authenticated_payload(partition)
            ):
                raise ValueError("a Minkowski proof partition failed authentication")
            if (
                _integer(partition.get("partition_index"), "proof partition index")
                != expected_partition
                or _integer(partition.get("partition_count"), "proof partition count")
                != count
                or _integer(partition.get("total_items"), "proof item count") != total
                or partition.get("plan_sha256") != plan_hash
            ):
                raise ValueError("a Minkowski proof partition has stale plan metadata")
            records = partition.get("records")
            if not isinstance(records, list):
                raise TypeError("a Minkowski proof partition has no record list")
            previous = expected_partition - count
            for entry in records:
                if not isinstance(entry, dict):
                    raise TypeError("a Minkowski proof partition record is not a map")
                index = _integer(entry.get("index"), "proof-prime global index")
                if (
                    index < 0
                    or index >= total
                    or index % count != expected_partition
                    or index <= previous
                    or index in indexed
                ):
                    raise ValueError(
                        "Minkowski proof partition coverage is invalid: "
                        + str((index, total, count, expected_partition, previous))
                    )
                schema = entry.get("schema")
                if schema == _PROGRESS_RECORD_SCHEMA:
                    if (
                        not _authenticated_payload(entry)
                        or entry.get("prime_fingerprint") != fingerprints[index]
                        or not isinstance(entry.get("evidence"), dict)
                    ):
                        raise ValueError(
                            "a wrapped proof-prime record failed authentication"
                        )
                    raw = dict(entry["evidence"])
                    evidence_index = raw.get("index")
                    if (
                        evidence_index is not None
                        and _integer(evidence_index, "proof evidence global index")
                        != index
                    ):
                        raise ValueError("proof evidence has the wrong global index")
                    raw["index"] = index
                else:
                    raw = entry
                indexed[index] = raw
                previous = index
        if tuple(sorted(indexed)) != tuple(range(total)):
            raise ValueError("Minkowski proof partitions are not complete")
        return tuple(indexed[index] for index in range(total))

    def verify_proof_progress_payload(
        self,
        proof_payload: dict[str, Any],
        record: UnconditionalMinkowskiProofRecord,
        *,
        cancelled: Any = None,
    ) -> bool:
        try:
            progress = proof_payload.get("proof_progress")
            if not isinstance(progress, dict) or self._proof_progress_payload is None:
                return False
            if not _conditional_payload_within_caps(progress, cancelled) or _cancelled(
                cancelled
            ):
                return False
            if _canonical_payload(progress, "Minkowski proof progress") != (
                self._proof_progress_payload
            ):
                return False
            if not _authenticated_payload(progress):
                return False
            if progress.get("bound") != list(record.bound):
                return False
            if progress.get("theorem") != proof_payload.get("theorem"):
                return False
            fingerprints = progress.get("prime_fingerprints")
            if fingerprints != [item.fingerprint for item in record.prime_records]:
                return False
            dependencies = progress.get("dependency_hashes")
            if (
                not isinstance(dependencies, dict)
                or self._dependency_hashes is None
                or dependencies != self._dependency_hashes
            ):
                return False
            saturation_hash = self._saturation_payload.get("content_sha256")
            if not isinstance(saturation_hash, str):
                saturation_hash = _payload_hash(self._saturation_payload)
            if dependencies.get("saturation") != saturation_hash:
                return False
            raw_records = self._progress_records(progress)
            public_records = proof_payload.get("prime_records")
            if not isinstance(public_records, list) or len(public_records) != len(
                raw_records
            ):
                return False
            for index, (raw, public) in enumerate(
                zip(raw_records, public_records, strict=True)
            ):
                if index % 32 == 0 and _cancelled(cancelled):
                    return False
                witness = public.get("principal_witness")
                if (
                    raw.get("ideal") != public.get("ideal")
                    or raw.get("norm") != public.get("norm")
                    or raw.get("coordinates") != public.get("coordinates")
                    or not isinstance(witness, dict)
                    or raw.get("witness") != witness.get("generator")
                ):
                    return False
            return True
        except (TypeError, ValueError, ArithmeticError, AttributeError, IndexError):
            return False

    def verify_conditional_grh_record(self, record: Any) -> bool:
        proof_stage = _stage(self.result, "proof")
        diagnostics = self.result.diagnostics
        accepted = self._receipt is record
        self._receipt = None
        return (
            self.result.complete is True
            and proof_stage is not None
            and proof_stage.state == "complete"
            and proof_stage.details.get("proof_status")
            == EXACT_RELATIONS_CONDITIONAL_GRH
            and record.theorem == self.engine_group.factor_base_theorem
            and record.bound == (int(diagnostics.get("factor_base_bound")), 1)
            and record.relation_count == int(diagnostics.get("relations"))
            and "GRH" in record.assumption.upper()
            and self._conditional_evidence_payload is not None
            and (
                accepted
                or self._verify_conditional_evidence(
                    self._conditional_evidence_payload, record, self.engine_group
                )
            )
        )

    def iter_minkowski_prime_ideals(self) -> Any:
        factor_base = __import__(
            "sagejs.number_fields.class_group_factor_base",
            fromlist=["factor_base_plan"],
        )
        degree = _integer(self.order.degree(), "unconditional field degree")
        bound = _integer(self.minkowski_bound[0], "Minkowski replay bound")
        if (
            degree < 1
            or degree > _CONDITIONAL_MAX_DEGREE
            or bound < 0
            or bound > _CONDITIONAL_MAX_BOUND
            or bound > _CONDITIONAL_MAX_RATIONAL_PRIMES
        ):
            raise ArithmeticError("Minkowski factor-base replay exceeds verifier caps")
        plan = factor_base.factor_base_plan(
            self.order,
            proof=True,
            theorem="minkowski",
            max_bound=_CONDITIONAL_MAX_BOUND,
            max_rational_primes=_CONDITIONAL_MAX_RATIONAL_PRIMES,
            max_prime_ideals=_CONDITIONAL_MAX_FACTOR_BASE,
            max_memory_bytes=_CONDITIONAL_MAX_MEMORY_BYTES,
        )
        plan.require_feasible()
        if (
            _integer(plan.bound, "rebuilt Minkowski bound") != bound
            or "Minkowski" not in str(plan.theorem)
            or tuple(plan.assumptions)
        ):
            raise ArithmeticError("Minkowski factor-base replay changed its theorem")
        for record in factor_base.prime_ideal_norm_stream(plan):
            yield record.prime_ideal

    def ideal_fingerprint(self, ideal: Any) -> dict[str, Any]:
        return _portable_ideal_fingerprint(ideal)

    def encode_ideal(self, ideal: Any) -> dict[str, Any]:
        prime_module = __import__(
            "sagejs.number_fields.prime_ideals",
            fromlist=["NumberFieldPrimeIdeal", "serialize_prime_ideal"],
        )
        if isinstance(ideal, prime_module.NumberFieldPrimeIdeal):
            return prime_module.serialize_prime_ideal(ideal)
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["serialize_ideal"]
        )
        return arithmetic.serialize_ideal(ideal)

    def decode_ideal(self, payload: dict[str, Any]) -> Any:
        if not isinstance(payload, dict):
            raise TypeError("a serialized proof ideal must be a dictionary")
        schema = payload.get("schema")
        if schema == "sagejs.number-fields.prime-ideal.v1":
            prime_module = __import__(
                "sagejs.number_fields.prime_ideals",
                fromlist=["prime_ideal_from_dict"],
            )
            return prime_module.prime_ideal_from_dict(self.order, payload)
        if schema != "sagejs.number-fields.ideal.v1":
            raise ValueError("unsupported proof-ideal serialization schema")
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_from_dict"]
        )
        return arithmetic.ideal_from_dict(self.order, payload)

    def encode_witness(self, witness: PrincipalIdealWitness) -> dict[str, Any]:
        return witness.to_dict(self.encode_ideal, self.encode_generator)

    def encode_generator(self, value: Any) -> dict[str, Any]:
        payload: Any = value.to_dict()
        if not isinstance(payload, dict):
            raise TypeError("a factored generator did not serialize to a dictionary")
        return payload

    def decode_generator(self, value: dict[str, Any]) -> Any:
        return _decode_factored_generator(self.field, value)

    def decode_witness(
        self, payload: dict[str, Any], _ideal: Any
    ) -> PrincipalIdealWitness:
        return PrincipalIdealWitness.from_dict(
            payload,
            self.decode_ideal,
            self.decode_generator,
        )

    def encode_prime_record(self, record: MinkowskiPrimeClassRecord) -> dict[str, Any]:
        return record.to_dict(self.encode_ideal, self.encode_witness)

    def decode_prime_record(self, payload: dict[str, Any]) -> MinkowskiPrimeClassRecord:
        return MinkowskiPrimeClassRecord.from_dict(
            payload, self.decode_ideal, self.decode_witness
        )


class _DetachedReplayStage:
    __slots__ = ("details", "name", "state")

    def __init__(self, name: str, state: str, details: dict[str, Any]) -> None:
        self.name = name
        self.state = state
        self.details = dict(details)


class _DetachedReplayEngineGroup:
    __slots__ = (
        "_generator_ideals",
        "_invariants",
        "factor_base_theorem",
        "proof_status",
    )

    def __init__(
        self,
        invariants: tuple[int, ...],
        generator_ideals: tuple[Any, ...],
        theorem: str,
        proof_status: str,
    ) -> None:
        self._invariants = tuple(invariants)
        self._generator_ideals = tuple(generator_ideals)
        self.factor_base_theorem = theorem
        self.proof_status = proof_status

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def order(self) -> int:
        answer = 1
        for value in self._invariants:
            answer *= value
        return answer

    def gens_ideals(self) -> tuple[Any, ...]:
        return self._generator_ideals


class _DetachedReplayResult:
    __slots__ = (
        "complete",
        "diagnostics",
        "proof_status",
        "saturation_original_units",
        "saturation_record",
        "stages",
    )

    def __init__(
        self,
        saturation_record: Any,
        *,
        proof_status: str,
        bound: int,
        relation_count: int,
    ) -> None:
        self.complete = True
        self.proof_status = proof_status
        self.saturation_record = saturation_record
        self.saturation_original_units = tuple(saturation_record.original_units)
        self.diagnostics = {
            "factor_base_bound": bound,
            "relations": relation_count,
        }
        self.stages = (
            _DetachedReplayStage(
                "proof",
                "complete",
                {"proof_status": proof_status},
            ),
        )

    def verify_saturation_record(self, payload: Any) -> bool:
        try:
            return bool(
                _canonical_payload(payload, "detached saturation evidence")
                == _canonical_payload(
                    self.saturation_record, "detached saturation evidence"
                )
                and self.saturation_record.verify(
                    self.saturation_record._field,
                    self.saturation_record._order,
                    self.saturation_original_units,
                )
            )
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False


def _clone_detached_conditional_saturation(
    order: Any,
    payload: dict[str, Any],
    generation_verifier: Any,
) -> Any:
    if payload.get("schema") != _SATURATION_SCHEMA or not _authenticated_payload(
        payload
    ):
        raise ArithmeticError("detached saturation evidence failed authentication")
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    analytic = __import__(
        "sagejs.number_fields.class_unit_analytic", fromlist=["class_unit_analytic"]
    )
    factored = __import__(
        "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
    )
    field = order.number_field()
    original_units = tuple(
        factored.FactoredNumberFieldElement.from_dict(field, value)
        for value in payload.get("original_units", ())
    )
    units = tuple(
        factored.FactoredNumberFieldElement.from_dict(field, value)
        for value in payload.get("units", ())
    )
    certificate = analytic.UnitSaturationIndexCertificate.from_dict(
        payload.get("analytic_certificate")
    )
    answer = groups.ClassUnitSaturationRecord(
        field,
        order,
        original_units,
        units,
        index_bound=_integer(payload.get("index_bound"), "detached index bound"),
        required_primes=payload.get("required_primes", ()),
        remaining_index_bound=_integer(
            payload.get("remaining_index_bound"), "detached remaining index"
        ),
        attempts=payload.get("attempts", ()),
        analytic_validation=payload.get("analytic_validation", {}),
        analytic_certificate=certificate,
        analytic_generation_verifier=generation_verifier,
        analytic_module=analytic,
        analytic_workspace=None,
        reason=str(payload.get("reason")),
    )
    if _canonical_payload(answer, "detached saturation evidence") != payload:
        raise ArithmeticError("detached saturation reconstruction changed payload")
    return answer


def _detached_conditional_replay_context(
    order: Any,
    invariants: tuple[int, ...],
    generator_ideals: tuple[Any, ...],
    proof_payload_json: str,
    generation_verifier: Any,
) -> tuple[_EngineProofReplayContext, ConditionalGRHProofRecord]:
    payload = json.loads(proof_payload_json)
    if not _conditional_payload_within_caps(payload):
        raise ArithmeticError("detached conditional proof exceeds replay caps")
    record = ConditionalGRHProofRecord.from_dict(payload)
    evidence = payload.get("conditional_evidence")
    saturation_payload = record.saturation.evidence
    if not isinstance(evidence, dict) or not isinstance(saturation_payload, dict):
        raise TypeError("detached conditional proof lost exact evidence")
    saturation = _clone_detached_conditional_saturation(
        order,
        _canonical_payload(saturation_payload, "detached saturation evidence"),
        generation_verifier,
    )
    engine_group = _DetachedReplayEngineGroup(
        tuple(invariants),
        tuple(generator_ideals),
        record.theorem,
        EXACT_RELATIONS_CONDITIONAL_GRH,
    )
    result = _DetachedReplayResult(
        saturation,
        proof_status=EXACT_RELATIONS_CONDITIONAL_GRH,
        bound=_integer(record.bound[0], "detached conditional bound"),
        relation_count=record.relation_count,
    )
    replay = _EngineProofReplayContext(
        result,
        engine_group,
        order,
        record.saturation,
        saturation,
        _canonical_payload(saturation_payload, "detached saturation evidence"),
        _integer(record.bound[0], "detached conditional bound"),
        conditional_evidence_payload=_canonical_payload(
            evidence, "detached conditional evidence"
        ),
    )
    return replay, record


def _decode_unconditional_proof_record(
    order: Any, payload: dict[str, Any]
) -> UnconditionalMinkowskiProofRecord:
    field = order.number_field()

    def decode_ideal(value: dict[str, Any]) -> Any:
        if not isinstance(value, dict):
            raise TypeError("a serialized proof ideal must be a dictionary")
        if value.get("schema") == "sagejs.number-fields.prime-ideal.v1":
            prime_module = __import__(
                "sagejs.number_fields.prime_ideals",
                fromlist=["prime_ideal_from_dict"],
            )
            return prime_module.prime_ideal_from_dict(order, value)
        ideal_module = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_from_dict"]
        )
        return ideal_module.ideal_from_dict(order, value)

    def decode_generator(value: dict[str, Any]) -> Any:
        return _decode_factored_generator(field, value)

    def decode_witness(value: dict[str, Any], _ideal: Any) -> PrincipalIdealWitness:
        return PrincipalIdealWitness.from_dict(value, decode_ideal, decode_generator)

    def decode_prime(value: dict[str, Any]) -> MinkowskiPrimeClassRecord:
        return MinkowskiPrimeClassRecord.from_dict(value, decode_ideal, decode_witness)

    return UnconditionalMinkowskiProofRecord.from_dict(payload, decode_prime)


def _detached_unconditional_replay_context(
    order: Any,
    invariants: tuple[int, ...],
    generator_ideals: tuple[Any, ...],
    proof_payload_json: str,
    generation_verifier: Any,
) -> tuple[_EngineProofReplayContext, UnconditionalMinkowskiProofRecord]:
    payload = json.loads(proof_payload_json)
    if not _conditional_payload_within_caps(payload):
        raise ArithmeticError("detached Minkowski proof exceeds replay caps")
    record = _decode_unconditional_proof_record(order, payload)
    saturation_payload = record.saturation.evidence
    progress_payload = payload.get("proof_progress")
    if not isinstance(saturation_payload, dict) or not isinstance(
        progress_payload, dict
    ):
        raise TypeError("detached Minkowski proof lost exact evidence")
    dependencies = progress_payload.get("dependency_hashes")
    if not isinstance(dependencies, dict):
        raise TypeError("detached Minkowski proof lost dependency hashes")
    canonical_saturation = _canonical_payload(
        saturation_payload, "detached saturation evidence"
    )
    canonical_progress = _canonical_payload(
        progress_payload, "detached Minkowski proof progress"
    )
    saturation = _clone_detached_conditional_saturation(
        order, canonical_saturation, generation_verifier
    )
    engine_group = _DetachedReplayEngineGroup(
        tuple(invariants),
        tuple(generator_ideals),
        str(payload.get("theorem")),
        EXACT_UNCONDITIONAL,
    )
    bound = _integer(record.bound[0], "detached Minkowski bound")
    result = _DetachedReplayResult(
        saturation,
        proof_status=EXACT_UNCONDITIONAL,
        bound=bound,
        relation_count=0,
    )
    replay = _EngineProofReplayContext(
        result,
        engine_group,
        order,
        record.saturation,
        saturation,
        canonical_saturation,
        bound,
        canonical_progress,
        canonical_progress,
        dict(dependencies),
    )
    return replay, record


def _detached_public_replay_context(
    order: Any,
    invariants: tuple[int, ...],
    generator_ideals: tuple[Any, ...],
    proof_payload_json: str,
    generation_verifier: Any,
) -> tuple[_EngineProofReplayContext, Any]:
    payload = json.loads(proof_payload_json)
    if payload.get("schema") == "sagejs.number-fields.class-group.grh-proof.v1":
        return _detached_conditional_replay_context(
            order,
            invariants,
            generator_ideals,
            proof_payload_json,
            generation_verifier,
        )
    if payload.get("schema") == "sagejs.number-fields.class-group.minkowski-proof.v1":
        return _detached_unconditional_replay_context(
            order,
            invariants,
            generator_ideals,
            proof_payload_json,
            generation_verifier,
        )
    raise ValueError("unsupported projected class-group proof schema")


def _engine_unconditional_records(
    engine_group: Any,
    replay: _EngineProofReplayContext,
    raw_records: Any,
) -> tuple[MinkowskiPrimeClassRecord, ...]:
    answer = []
    for raw in raw_records:
        ideal = replay.decode_ideal(raw["ideal"])
        coordinates = tuple(
            _integer(value, "an unconditional proof coordinate")
            for value in raw["coordinates"]
        )
        representative = engine_group.representative_ideal(coordinates)
        quotient = _ideal_quotient(ideal, representative)
        generator = _decode_factored_generator(replay.field, raw["witness"])
        witness = PrincipalIdealWitness(
            quotient,
            generator,
            source="unconditional Minkowski proof-prime discrete log",
        )
        answer.append(
            MinkowskiPrimeClassRecord(
                ideal,
                replay.ideal_fingerprint(ideal),
                raw["norm"],
                coordinates,
                witness,
            )
        )
    return tuple(answer)


def _direct_minkowski_evidence(
    result: Any,
    engine_group: Any,
    replay: _EngineProofReplayContext,
    bound: int,
    dependency_hashes: dict[str, str],
) -> tuple[
    tuple[MinkowskiPrimeClassRecord, ...],
    dict[str, Any],
    dict[str, Any],
]:
    """Authenticate a direct Minkowski discovery from retained exact material."""
    factor_base_stage = _stage(result, "factor-base")
    diagnostics = getattr(result, "diagnostics", None)
    retained = getattr(engine_group, "_factor_base", None)
    if (
        factor_base_stage is None
        or factor_base_stage.state != "complete"
        or not isinstance(diagnostics, dict)
        or retained is None
    ):
        raise ArithmeticError(
            "a direct unconditional result has no completed factor-base evidence"
        )
    details = factor_base_stage.details
    theorem = details.get("theorem")
    assumptions = details.get("assumptions")
    retained_factor_base = tuple(retained)
    degree = _integer(replay.order.degree(), "direct Minkowski field degree")
    if (
        degree < 1
        or degree > _CONDITIONAL_MAX_DEGREE
        or bound < 0
        or bound > _CONDITIONAL_MAX_BOUND
        or bound > _CONDITIONAL_MAX_RATIONAL_PRIMES
        or not isinstance(theorem, str)
        or "Minkowski" not in theorem
        or not isinstance(assumptions, (list, tuple))
        or tuple(assumptions)
        or _integer(details.get("bound"), "direct Minkowski bound") != bound
        or _integer(diagnostics.get("factor_base_bound"), "factor-base bound") != bound
        or _integer(details.get("size"), "factor-base stage size")
        != len(retained_factor_base)
        or _integer(diagnostics.get("factor_base_size"), "factor-base size")
        != len(retained_factor_base)
        or len(retained_factor_base) > _CONDITIONAL_MAX_FACTOR_BASE
    ):
        raise ArithmeticError("direct Minkowski factor-base authority is inconsistent")

    rebuilt_primes = tuple(replay.iter_minkowski_prime_ideals())
    rebuilt_fingerprints = tuple(
        replay.ideal_fingerprint(prime) for prime in rebuilt_primes
    )
    retained_fingerprints = tuple(
        replay.ideal_fingerprint(prime) for prime in retained_factor_base
    )
    if retained_fingerprints != rebuilt_fingerprints:
        raise ArithmeticError(
            "the retained factor base differs from the exact Minkowski stream"
        )

    records: list[MinkowskiPrimeClassRecord] = []
    progress_records: list[dict[str, Any]] = []
    direct_log: Any = getattr(engine_group, "_factor_base_discrete_log", None)
    if not callable(direct_log):
        raise TypeError("a direct Minkowski group has no factor-base logarithm")
    for index, (prime, fingerprint) in enumerate(
        zip(rebuilt_primes, rebuilt_fingerprints, strict=True)
    ):
        resolved = direct_log(index, prime)
        if not isinstance(resolved, tuple) or len(resolved) != 2:
            raise TypeError("a direct factor-base logarithm has invalid evidence")
        coordinates, generator = resolved
        checked_coordinates = tuple(
            _integer(value, "a direct Minkowski proof coordinate")
            for value in coordinates
        )
        representative = engine_group.representative_ideal(checked_coordinates)
        quotient = _ideal_quotient(prime, representative)
        witness = PrincipalIdealWitness(
            quotient,
            generator,
            source="direct Minkowski factor-base discrete log",
        )
        if not witness.verify(replay.order):
            raise ArithmeticError(
                "a direct Minkowski proof-prime discrete log failed exact replay"
            )
        norm = prime.norm()
        numerator = _integer(
            getattr(norm, "_numerator", norm), "direct Minkowski proof-prime norm"
        )
        denominator = _integer(
            getattr(norm, "_denominator", 1),
            "direct Minkowski proof-prime norm denominator",
        )
        if denominator != 1 or numerator < 2 or numerator > bound:
            raise ArithmeticError("a direct Minkowski proof prime has an invalid norm")
        raw = {
            "index": index,
            "norm": numerator,
            "coordinates": checked_coordinates,
            "ideal": replay.encode_ideal(prime),
            "witness": replay.encode_generator(generator),
        }
        progress_entry = {
            "schema": _PROGRESS_RECORD_SCHEMA,
            "index": index,
            "prime_fingerprint": fingerprint,
            "evidence": raw,
        }
        progress_entry["content_sha256"] = _payload_hash(progress_entry)
        progress_records.append(progress_entry)
        records.append(
            MinkowskiPrimeClassRecord(
                prime,
                fingerprint,
                numerator,
                checked_coordinates,
                witness,
            )
        )
    progress_plan = {
        "theorem": "Minkowski ideal-class theorem",
        "bound": [bound, 1],
        "prime_fingerprints": list(rebuilt_fingerprints),
        "dependency_hashes": dict(dependency_hashes),
        "partition_count": 1,
    }
    plan_hash = _payload_hash(progress_plan)
    partition = {
        "schema": _PARTITION_SCHEMA,
        "plan_sha256": plan_hash,
        "partition_index": 0,
        "partition_count": 1,
        "total_items": len(progress_records),
        "records": progress_records,
    }
    partition["content_sha256"] = _payload_hash(partition)
    progress_body = {
        "schema": _PROGRESS_SCHEMA,
        **progress_plan,
        "plan_sha256": plan_hash,
        "partitions": [partition],
        "completed_items": len(progress_records),
        "complete": True,
    }
    progress_body["content_sha256"] = _payload_hash(progress_body)
    progress_payload = _canonical_payload(
        progress_body, "direct Minkowski proof progress"
    )
    if not _authenticated_payload(progress_payload):
        raise ArithmeticError("direct Minkowski proof progress failed authentication")
    if replay._progress_records(progress_payload) != tuple(
        _canonical_payload(entry["evidence"], "direct Minkowski proof-prime evidence")
        for entry in progress_records
    ):
        raise ArithmeticError("direct Minkowski proof progress failed exact replay")
    return tuple(records), progress_payload, progress_payload


def _class_group_from_engine_result(result: Any, verify_group: Any) -> IdealClassGroup:
    """Adapt one complete class/unit engine result to the public map contract."""
    if getattr(result, "complete", None) is not True:
        raise ValueError("an incomplete engine result has no public class group")
    engine_group = result.class_group()
    if isinstance(engine_group, IdealClassGroup):
        return engine_group
    order, presentation = _engine_material(engine_group, result)
    if order is None or presentation is None:
        raise TypeError("the engine class group has no exact presentation material")
    invariants = tuple(int(value) for value in engine_group.invariants())
    generator_ideals = tuple(engine_group.gens_ideals())
    generic_ideal_log = engine_group.discrete_log
    direct_factor_base_log: Any = getattr(
        engine_group, "_factor_base_discrete_log", None
    )
    retained_factor_base = tuple(getattr(engine_group, "_factor_base", ()))

    def public_ideal_log(ideal: Any) -> Any:
        if callable(direct_factor_base_log):
            for position, prime in enumerate(retained_factor_base):
                if ideal == prime:
                    return direct_factor_base_log(position, prime)
        return generic_ideal_log(ideal)

    relation_witnesses = []
    for invariant, ideal in zip(invariants, generator_ideals, strict=False):
        relation_ideal = _ideal_power(ideal, invariant)
        coordinates, generator = engine_group.discrete_log(relation_ideal)
        if any(int(value) for value in coordinates):
            raise ArithmeticError("an engine generator has the wrong claimed order")
        relation_witnesses.append(
            PrincipalIdealWitness(
                relation_ideal,
                generator,
                source="engine Smith-generator order relation",
            )
        )
    proof_status = proof_label(result.proof_status)
    proof_stage = _stage(result, "proof")
    if proof_stage is None or proof_stage.state != "complete":
        raise ArithmeticError("the engine result has no completed proof stage")
    diagnostics = result.diagnostics
    relation_count = _integer(diagnostics.get("relations"), "engine relation count")
    if (
        proof_stage.details.get("proof_status") != proof_status
        or _integer(
            proof_stage.details.get("exact_relations"), "proof-stage relation count"
        )
        != relation_count
    ):
        raise ArithmeticError("the proof stage has the wrong exact relation count")
    saturation_producer, saturation_payload = _producer_saturation(result)
    saturation = _saturation_record(saturation_payload)
    unconditional_stage = None
    proof_progress = None
    progress_payload = None
    dependency_hashes = None
    conditional_evidence = None
    if proof_status == EXACT_UNCONDITIONAL:
        unconditional_stage = _stage(result, "unconditional-proof")
        if unconditional_stage is not None:
            if unconditional_stage.state != "complete":
                raise ArithmeticError(
                    "an unconditional engine result has an incomplete Minkowski stage"
                )
            if "Minkowski" not in str(unconditional_stage.details.get("theorem")):
                raise ArithmeticError("the unconditional stage does not name Minkowski")
            bound = _integer(
                unconditional_stage.details.get("bound"), "Minkowski proof bound"
            )
            proof_progress, progress_payload = _producer_proof_progress(result)
        else:
            factor_base_stage = _stage(result, "factor-base")
            if factor_base_stage is None or factor_base_stage.state != "complete":
                raise ArithmeticError(
                    "an unconditional engine result has no completed Minkowski stage"
                )
            bound = _integer(
                factor_base_stage.details.get("bound"), "direct Minkowski bound"
            )
        dependency_hashes = _producer_dependency_hashes(result)
    else:
        bound = int(diagnostics.get("factor_base_bound"))
        if proof_status == EXACT_RELATIONS_CONDITIONAL_GRH:
            conditional_evidence = _producer_conditional_evidence(
                result,
                engine_group,
                order,
                theorem=str(engine_group.factor_base_theorem),
                bound=bound,
                relation_count=relation_count,
            )
    replay = _EngineProofReplayContext(
        result,
        engine_group,
        order,
        saturation,
        saturation_producer,
        saturation_payload,
        bound,
        proof_progress,
        progress_payload,
        dependency_hashes,
        conditional_evidence,
    )
    if proof_status == EXACT_UNCONDITIONAL:
        if progress_payload is not None:
            if unconditional_stage is None:
                raise ArithmeticError("the unconditional proof stage disappeared")
            raw_prime_records = replay._progress_records(progress_payload)
            if _integer(
                unconditional_stage.details.get("prime_ideals"),
                "unconditional proof-prime count",
            ) != len(raw_prime_records) or _integer(
                proof_stage.details.get("minkowski_primes"),
                "completed proof-prime count",
            ) != len(raw_prime_records):
                raise ArithmeticError("the proof stages have the wrong Minkowski count")
            prime_records = _engine_unconditional_records(
                engine_group,
                replay,
                raw_prime_records,
            )
        else:
            if unconditional_stage is not None or dependency_hashes is None:
                raise ArithmeticError("the unconditional proof evidence disappeared")
            if (
                _integer(
                    proof_stage.details.get("minkowski_primes"),
                    "direct proof-prime upgrade count",
                )
                != 0
            ):
                raise ArithmeticError(
                    "a direct Minkowski result claims an unrecorded proof upgrade"
                )
            prime_records, proof_progress, progress_payload = (
                _direct_minkowski_evidence(
                    result,
                    engine_group,
                    replay,
                    bound,
                    dependency_hashes,
                )
            )
            replay = _EngineProofReplayContext(
                result,
                engine_group,
                order,
                saturation,
                saturation_producer,
                saturation_payload,
                bound,
                proof_progress,
                progress_payload,
                dependency_hashes,
                conditional_evidence,
            )
        proof_record: Any = UnconditionalMinkowskiProofRecord(
            field_order_fingerprint=replay.field_order_fingerprint,
            discriminant=replay.discriminant,
            bound=(bound, 1),
            prime_records=prime_records,
            saturation=saturation,
        )
        theorem = "Minkowski ideal-class theorem"
    elif proof_status == EXACT_RELATIONS_CONDITIONAL_GRH:
        theorem = str(engine_group.factor_base_theorem)
        proof_record = ConditionalGRHProofRecord(
            theorem,
            (bound, 1),
            relation_count=relation_count,
            assumption="GRH for the Dedekind zeta function",
            saturation=saturation,
            analytic_index_one=True,
        )
    else:
        raise ValueError("an incomplete proof label cannot expose a class group")
    answer = IdealClassGroup(
        order,
        invariants,
        generator_ideals,
        tuple(relation_witnesses),
        public_ideal_log,
        proof_status=proof_status,
        algorithm=str(result.algorithm),
        factor_base_theorem=theorem,
        factor_base_bound=(bound, 1),
        presentation_evidence=presentation,
        proof_record=proof_record,
        proof_context=replay,
        relation_count=relation_count,
    )
    if verify_group(answer) is not True:
        raise ArithmeticError("the adapted public class group failed proof replay")
    return answer


def _standard_public_class_group_adapter(implementation: Any, verify_group: Any) -> Any:
    """Bind the exact verifier inside the public engine adapter."""

    def class_group_from_engine_result(result: Any) -> IdealClassGroup:
        """Adapt one complete class/unit engine result to the public map contract."""
        return implementation(result, verify_group)

    return class_group_from_engine_result


class_group_from_engine_result = _standard_public_class_group_adapter(
    _class_group_from_engine_result, IdealClassGroup.verify
)


def _standard_adapt_and_seal_public_class_group_projection(
    adapter: Any,
    projection_type: Any,
    initialize: Any,
    allocate: Any,
    proof_payload: Any,
) -> Any:
    """Capture every authority-bearing operation across verify and sealing."""

    def adapt_and_seal_public_class_group_projection(
        result: Any,
    ) -> _SealedIdealClassGroupProjection:
        """Run the standard verified adapter and seal its local result atomically."""
        source = adapter(result)
        if type(source) is not IdealClassGroup:
            raise TypeError("the standard adapter changed its exact result type")
        expected_metadata = (
            source._order,
            source._invariants,
            source._proof_status,
            source._algorithm,
            source._factor_base_theorem,
            source._factor_base_bound,
            source._relation_count,
        )
        exact_proof_payload = proof_payload(source)
        if expected_metadata != (
            source._order,
            source._invariants,
            source._proof_status,
            source._algorithm,
            source._factor_base_theorem,
            source._factor_base_bound,
            source._relation_count,
        ):
            raise ArithmeticError(
                "the verified class group changed while its proof was serialized"
            )
        answer = allocate(projection_type)
        initialize(answer, source, proof_payload=exact_proof_payload)
        if (
            type(answer) is not projection_type
            or answer._sealed is not True
            or answer._metadata != expected_metadata
        ):
            raise ArithmeticError(
                "the verified class group changed while its projection was sealed"
            )
        return answer

    return adapt_and_seal_public_class_group_projection


adapt_and_seal_public_class_group_projection = (
    _standard_adapt_and_seal_public_class_group_projection(
        class_group_from_engine_result,
        _SealedIdealClassGroupProjection,
        _SealedIdealClassGroupProjection._initialize,
        object.__new__,
        IdealClassGroup.proof_payload,
    )
)


__all__ = [
    "IdealClassDiscreteLog",
    "IdealClassElement",
    "IdealClassGroup",
    "IdealClassMap",
    "PrincipalIdealWitness",
    "PrincipalityResult",
    "adapt_and_seal_public_class_group_projection",
    "class_group_from_engine_result",
    "class_group_from_context",
    "class_group_from_minkowski_result",
    "public_class_group_projection_view",
    "seal_public_class_group_projection",
]
