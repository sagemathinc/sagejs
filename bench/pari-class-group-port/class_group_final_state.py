"""Connected, transactional final-state assembly for the PARI port experiment.

This module joins live outputs from the relation, Smith-transform, unit, class-
generator, and final-driver stages.  It publishes only after all source-required
components and provenance links validate.  The assembled state remains a
partial experiment result: neither Phase-5 nor public completeness is claimed.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from threading import Lock
from collections.abc import Mapping as MappingABC, Sequence as SequenceABC
from typing import Any, Mapping, Sequence

from .class_group_internal_result import (
    AtomicResultPublisher,
    ImmutableInternalResult,
    PreparedCandidateLayout,
    ReplayAuthority,
    ReplayFailure,
    cold_replay,
    make_internal_payload,
    snapshot_prepared_candidate,
)


CONNECTED_SCHEMA = "sagejs.pari-class-group/connected-final-state-v3"
_MAX_CONNECTED_BYTES = 64 * 1024 * 1024
_MAX_SOURCE_VECTOR = 1_000_000
_FINAL_ARRAY_NAMES = ("Ur", "M1", "M2", "Ga", "Ge", "GD", "ga")
_CLG2_COMPONENTS = ("Ur", "ga", "GD", "Ge", "M1", "M2")
_UNVERIFIED_REQUIREMENTS = (
    "exact-ideal-arithmetic-replay",
    "exact-unit-principality-and-norm-replay",
    "factor-base-authentication",
    "rigorous-regulator-enclosure-and-acceptance",
)


class AssemblyFailure(ValueError):
    """Connected source outputs are absent, stale, or mutually inconsistent."""


class AssemblyConflict(RuntimeError):
    """A different connected terminal state was already published."""


@dataclass(frozen=True)
class RelationComponentOutput:
    run_id: str
    field_id: str
    owner_generation: int
    terminal_status: str
    state: Mapping[str, Any]
    layout: PreparedCandidateLayout


@dataclass(frozen=True)
class TransformComponentOutput:
    run_id: str
    owner_generation: int
    terminal_status: str
    candidate_sha256: str
    evidence: Mapping[str, Any]


@dataclass(frozen=True)
class UnitComponentOutput:
    run_id: str
    owner_generation: int
    terminal_status: str
    candidate_sha256: str
    transforms_sha256: str
    evidence: Mapping[str, Any]


@dataclass(frozen=True)
class ClassGeneratorComponentOutput:
    run_id: str
    owner_generation: int
    terminal_status: str
    candidate_sha256: str
    transforms_sha256: str
    evidence: Mapping[str, Any]


@dataclass(frozen=True)
class FinalDriverComponentOutput:
    run_id: str
    owner_generation: int
    terminal_status: str
    honesty_status: str
    cleanarch_status: str
    candidate_sha256: str
    transforms_sha256: str
    units_sha256: str
    generators_sha256: str
    source_state: Mapping[str, Any]


@dataclass(frozen=True)
class ConnectedReplayAuthority:
    field_id: str
    assumptions: tuple[str, ...]
    run_id: str
    owner_generation: int
    expected_connected_sha256: str | None = None


@dataclass(frozen=True)
class ImmutableConnectedFinalState:
    canonical_json: bytes
    sha256: str
    partial_result: ImmutableInternalResult


def _canonical(value: Any) -> bytes:
    try:
        raw = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise AssemblyFailure(
            "connected state is not canonical-JSON encodable"
        ) from error
    if len(raw) > _MAX_CONNECTED_BYTES:
        raise AssemblyFailure("connected state exceeds its byte limit")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_CONNECTED_BYTES:
        raise AssemblyFailure("connected state exceeds its byte limit")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise AssemblyFailure("duplicate connected-state key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise AssemblyFailure("connected state is not strict JSON") from error
    if not isinstance(value, dict):
        raise AssemblyFailure("connected state must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical_component_sha256(value: Mapping[str, Any]) -> str:
    """Return the source-facing fingerprint used for component handoffs."""
    if not isinstance(value, MappingABC):
        raise AssemblyFailure("component fingerprint input must be a mapping")
    return _sha256(_canonical(dict(value)))


def _decimal_vector(value: Any, name: str, length: int | None = None) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, SequenceABC)
        or len(value) > _MAX_SOURCE_VECTOR
        or (length is not None and len(value) != length)
    ):
        raise AssemblyFailure(name + " has the wrong bounded shape")
    return [int(_decimal(entry, name + " entry")) for entry in value]


def _determinant(entries: list[int], size: int) -> int:
    """Bounded fraction-free determinant for independently derived rationals."""
    if size < 0 or size > 64 or len(entries) != size * size:
        raise AssemblyFailure("derived unit minor exceeds the replay bound")
    if size == 0:
        return 1
    work = [entries[index * size : (index + 1) * size] for index in range(size)]
    previous = 1
    sign = 1
    for pivot_index in range(size - 1):
        pivot_row = next(
            (row for row in range(pivot_index, size) if work[row][pivot_index]),
            None,
        )
        if pivot_row is None:
            return 0
        if pivot_row != pivot_index:
            work[pivot_index], work[pivot_row] = work[pivot_row], work[pivot_index]
            sign = -sign
        pivot = work[pivot_index][pivot_index]
        for row in range(pivot_index + 1, size):
            for column in range(pivot_index + 1, size):
                numerator = (
                    work[row][column] * pivot
                    - work[row][pivot_index] * work[pivot_index][column]
                )
                if numerator % previous:
                    raise AssemblyFailure("derived unit Bareiss division was not exact")
                work[row][column] = numerator // previous
        previous = pivot
    return sign * work[-1][-1]


def _validate_linked_units(
    evidence: Any, candidate: Mapping[str, Any]
) -> dict[str, Any]:
    """Validate exact source linkage without interpreting packed real words.

    The packed words are retained exactly and authenticated to the candidate.
    A separately derived rational minor is checked internally, but this replay
    deliberately does *not* claim to decode PARI's packed-real representation.
    """
    value = _exact_keys(
        evidence,
        {
            "rank",
            "factor_norms",
            "factor_exponent_shape",
            "factor_exponents",
            "claimed_norms",
            "packed_log_ranges",
            "packed_log_words",
            "derived_log_minor_shape",
            "derived_log_minor_numerators",
            "derived_log_denominator",
            "derived_from_packed_sha256",
            "derivation_method",
            "regulator_determinant_numerator",
            "regulator_determinant_denominator",
            "candidate_regulator_triplet",
            "torsion_order",
            "torsion_coordinates",
            "torsion_norm",
        },
        "linked units",
    )
    rank = int(_decimal(value["rank"], "unit rank"))
    expected_rank = int(
        _decimal(candidate["expected_unit_rank"], "candidate unit rank")
    )
    if rank != expected_rank or rank < 0 or rank > 64:
        raise AssemblyFailure("unit rank disagrees with the candidate")
    factor_norms = _decimal_vector(value["factor_norms"], "unit factor norms")
    if any(norm not in (-1, 1) for norm in factor_norms):
        raise AssemblyFailure("unit factor norms must be signs")
    exponent_shape = _decimal_vector(
        value["factor_exponent_shape"], "unit exponent shape", 2
    )
    if exponent_shape != [rank, len(factor_norms)]:
        raise AssemblyFailure("unit factor exponent shape is inconsistent")
    exponents = _decimal_vector(
        value["factor_exponents"],
        "unit factor exponents",
        rank * len(factor_norms),
    )
    claimed_norms = _decimal_vector(value["claimed_norms"], "unit norms", rank)
    for row in range(rank):
        norm = 1
        for column, factor_norm in enumerate(factor_norms):
            if factor_norm == -1 and exponents[row * len(factor_norms) + column] % 2:
                norm = -norm
        if claimed_norms[row] != norm:
            raise AssemblyFailure("factored unit norm does not replay")

    ranges_raw = value["packed_log_ranges"]
    if not isinstance(ranges_raw, list) or len(ranges_raw) != rank * rank:
        raise AssemblyFailure("packed log ranges have the wrong count")
    candidate_words = _decimal_vector(candidate["transformed_logs"], "candidate logs")
    selected: list[int] = []
    canonical_ranges: list[list[str]] = []
    for index, raw_range in enumerate(ranges_raw):
        start_length = _decimal_vector(raw_range, f"packed log range {index}", 2)
        start, length = start_length
        if start < 0 or length <= 0 or start + length > len(candidate_words):
            raise AssemblyFailure("packed log range is outside the candidate")
        selected.extend(candidate_words[start : start + length])
        canonical_ranges.append([str(start), str(length)])
    packed_words = _decimal_vector(value["packed_log_words"], "packed log words")
    if packed_words != selected:
        raise AssemblyFailure("packed unit logs are detached from the candidate")
    packed_link = {
        "ranges": canonical_ranges,
        "words": [str(word) for word in packed_words],
    }
    packed_sha256 = canonical_component_sha256(packed_link)
    if value["derived_from_packed_sha256"] != packed_sha256:
        raise AssemblyFailure("derived unit minor is stale for its packed source")
    if value["derivation_method"] != "independent-rational-enclosure-v1":
        raise AssemblyFailure("unit rational derivation method is not authorized")

    minor_shape = _decimal_vector(
        value["derived_log_minor_shape"], "unit minor shape", 2
    )
    if minor_shape != [rank, rank]:
        raise AssemblyFailure("derived unit minor must be rank by rank")
    minor = _decimal_vector(
        value["derived_log_minor_numerators"], "derived unit minor", rank * rank
    )
    denominator = int(_decimal(value["derived_log_denominator"], "unit denominator"))
    regulator_numerator = int(
        _decimal(value["regulator_determinant_numerator"], "regulator numerator")
    )
    regulator_denominator = int(
        _decimal(value["regulator_determinant_denominator"], "regulator denominator")
    )
    if denominator <= 0 or regulator_numerator <= 0 or regulator_denominator <= 0:
        raise AssemblyFailure("unit regulator denominators must be positive")
    determinant = abs(_determinant(minor, rank))
    expected_denominator = denominator**rank
    from math import gcd

    common = gcd(determinant, expected_denominator)
    if (
        regulator_numerator != determinant // common
        or regulator_denominator != expected_denominator // common
    ):
        raise AssemblyFailure("derived rational regulator determinant does not replay")
    if _decimal_vector(
        value["candidate_regulator_triplet"], "candidate regulator", 3
    ) != _decimal_vector(candidate["regulator_triplet"], "accepted regulator", 3):
        raise AssemblyFailure("unit regulator source is detached from the candidate")
    torsion_order = int(_decimal(value["torsion_order"], "torsion order"))
    torsion_coordinates = _decimal_vector(
        value["torsion_coordinates"], "torsion coordinates"
    )
    torsion_norm = int(_decimal(value["torsion_norm"], "torsion norm"))
    if torsion_order <= 0 or not torsion_coordinates or torsion_norm not in (-1, 1):
        raise AssemblyFailure("torsion evidence is malformed")
    return json.loads(_canonical(value))


def _exact_keys(value: Any, keys: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise AssemblyFailure(name + " has the wrong fields")
    return value


def _bounded_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 65536:
        raise AssemblyFailure(name + " must be a nonempty bounded string")
    return value


def _generation(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise AssemblyFailure("owner generation must be a positive integer")
    return value


def _decimal(value: Any, name: str) -> str:
    if isinstance(value, bool):
        raise AssemblyFailure(name + " must be an exact integer")
    if isinstance(value, str):
        if not value or len(value) > 4096:
            raise AssemblyFailure(name + " must be a canonical decimal integer")
        try:
            integer = int(value)
        except (ValueError, OverflowError) as error:
            raise AssemblyFailure(
                name + " must be a canonical decimal integer"
            ) from error
        if str(integer) != value:
            raise AssemblyFailure(name + " must be a canonical decimal integer")
        return value
    if isinstance(value, (float, bytes, bytearray)):
        raise AssemblyFailure(name + " must be an exact integer")
    try:
        integer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise AssemblyFailure(name + " must be an exact integer") from error
    if integer != value:
        raise AssemblyFailure(name + " must be an exact integer")
    return str(integer)


def _snapshot_shaped_array(value: Any, name: str) -> dict[str, list[str]]:
    shaped = _exact_keys(value, {"shape", "entries"}, name)
    shape = _decimal_vector(shaped["shape"], name + " shape")
    if not shape or len(shape) > 4 or any(dimension < 0 for dimension in shape):
        raise AssemblyFailure(name + " shape is invalid")
    cells = 1
    for dimension in shape:
        cells *= dimension
        if cells > _MAX_SOURCE_VECTOR:
            raise AssemblyFailure(name + " shape exceeds its cell bound")
    entries = _decimal_vector(shaped["entries"], name + " entries", cells)
    return {
        "shape": [str(dimension) for dimension in shape],
        "entries": [str(entry) for entry in entries],
    }


def _snapshot_final_source_state(source_state: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(source_state, MappingABC) or set(source_state) != {
        *_FINAL_ARRAY_NAMES,
        "clg2",
    }:
        raise AssemblyFailure("final driver source state is incomplete")
    answer: dict[str, Any] = {
        name: _snapshot_shaped_array(source_state[name], name)
        for name in _FINAL_ARRAY_NAMES
    }
    clg2 = _exact_keys(source_state["clg2"], {"components"}, "clg2 manifest")
    if clg2["components"] != list(_CLG2_COMPONENTS):
        raise AssemblyFailure("clg2 component order changed")
    answer["clg2"] = {"components": list(_CLG2_COMPONENTS)}

    ur_shape = [int(entry) for entry in answer["Ur"]["shape"]]
    m1_shape = [int(entry) for entry in answer["M1"]["shape"]]
    m2_shape = [int(entry) for entry in answer["M2"]["shape"]]
    ga_shape = [int(entry) for entry in answer["Ga"]["shape"]]
    ge_shape = [int(entry) for entry in answer["Ge"]["shape"]]
    gd_shape = [int(entry) for entry in answer["GD"]["shape"]]
    generator_arch_shape = [int(entry) for entry in answer["ga"]["shape"]]
    if len(m2_shape) != 2 or m2_shape[0] != m2_shape[1]:
        raise AssemblyFailure("M2 must be square")
    dimension = m2_shape[0]
    if ur_shape != [dimension, dimension]:
        raise AssemblyFailure("Ur shape disagrees with M2")
    if len(m1_shape) != 2 or m1_shape[0] != dimension:
        raise AssemblyFailure("M1 shape disagrees with M2")
    active = m1_shape[1]
    if ga_shape != [active, 3, 7] or gd_shape != [active, 3, 7]:
        raise AssemblyFailure("Ga/GD shapes disagree with active generators")
    if not ge_shape or ge_shape[0] != active:
        raise AssemblyFailure("Ge shape disagrees with active generators")
    if generator_arch_shape != [dimension, 3, 7]:
        raise AssemblyFailure("ga shape disagrees with M2")
    return answer


def snapshot_final_source_state(source_state: Mapping[str, Any]) -> dict[str, Any]:
    """Detach and validate shaped `buchall` source arrays.

    Zero-cell arrays are legal only when their declared shape has zero
    product. This public bridge lets a precision-frontier publisher retain the
    exact same source-state representation that a later connected publication
    will consume.
    """
    return _snapshot_final_source_state(source_state)


def _require_component(component: Any | None, name: str) -> Any:
    if component is None:
        raise AssemblyFailure("source-required component is absent: " + name)
    return component


def _validate_common_provenance(
    run_id: str,
    generation: int,
    components: Sequence[Any],
) -> None:
    for component in components:
        if component.run_id != run_id:
            raise AssemblyFailure("component outputs came from different source runs")
        if component.owner_generation != generation:
            raise AssemblyFailure(
                "component outputs came from different owner generations"
            )


def _build_connected_payload(
    relation: RelationComponentOutput,
    transforms: TransformComponentOutput,
    units: UnitComponentOutput,
    generators: ClassGeneratorComponentOutput,
    final_driver: FinalDriverComponentOutput,
    assumptions: Sequence[str],
) -> tuple[dict[str, Any], ImmutableInternalResult]:
    run_id = _bounded_string(relation.run_id, "source run id")
    field_id = _bounded_string(relation.field_id, "field id")
    generation = _generation(relation.owner_generation)
    _validate_common_provenance(
        run_id, generation, (transforms, units, generators, final_driver)
    )
    expected_statuses = (
        (relation.terminal_status, "candidate-accepted"),
        (transforms.terminal_status, "smith-and-hnf-complete"),
        (units.terminal_status, "getfu-and-cleanarch-complete"),
        (generators.terminal_status, "class-group-gen-complete"),
        (final_driver.terminal_status, "buchall-end-assembled"),
    )
    if any(actual != expected for actual, expected in expected_statuses):
        raise AssemblyFailure(
            "a source component is not at its required terminal state"
        )
    if final_driver.honesty_status not in ("verified", "equal-bound-source-skip"):
        raise AssemblyFailure(
            "honesty did not reach a source-authorized terminal state"
        )
    if final_driver.cleanarch_status != "accepted":
        raise AssemblyFailure("cleanarch did not accept the final state")

    candidate = snapshot_prepared_candidate(relation.state, relation.layout, field_id)
    candidate_hash = canonical_component_sha256(candidate)
    transform_evidence = dict(transforms.evidence)
    unit_evidence = _validate_linked_units(units.evidence, candidate)
    generator_evidence = dict(generators.evidence)
    transform_hash = canonical_component_sha256(transform_evidence)
    unit_hash = canonical_component_sha256(unit_evidence)
    generator_hash = canonical_component_sha256(generator_evidence)
    if transforms.candidate_sha256 != candidate_hash:
        raise AssemblyFailure("transform output is stale for the candidate")
    if units.candidate_sha256 != candidate_hash:
        raise AssemblyFailure("unit output is stale for the candidate")
    if units.transforms_sha256 != transform_hash:
        raise AssemblyFailure("unit output is stale for the Smith transforms")
    if generators.candidate_sha256 != candidate_hash:
        raise AssemblyFailure("generator output is stale for the candidate")
    if generators.transforms_sha256 != transform_hash:
        raise AssemblyFailure("generator output is stale for the Smith transforms")
    if (
        final_driver.candidate_sha256 != candidate_hash
        or final_driver.transforms_sha256 != transform_hash
        or final_driver.units_sha256 != unit_hash
        or final_driver.generators_sha256 != generator_hash
    ):
        raise AssemblyFailure("final driver source fingerprints are stale")

    try:
        partial_payload = make_internal_payload(
            candidate,
            assumptions,
            transforms=transform_evidence,
            generators=generator_evidence,
            # v1's unit schema incorrectly interpreted raw packed-real words as
            # rational numerators.  v2 keeps its linked unit evidence outside
            # that schema and never asks v1 to validate units.
            units=None,
        )
        partial_authority = ReplayAuthority(
            field_id=field_id,
            assumptions=tuple(sorted(set(assumptions))),
        )
        # This publisher is intentionally local.  Nothing is exposed if later
        # final-driver validation fails.
        partial_result = AtomicResultPublisher(partial_authority).publish(
            partial_payload
        )
    except ReplayFailure as error:
        raise AssemblyFailure(
            "partial result replay rejected a source output"
        ) from error

    final_state = _snapshot_final_source_state(final_driver.source_state)
    payload = {
        "partial_result": _strict_loads(partial_result.canonical_json),
        "unit_evidence": unit_evidence,
        "provenance": {
            "run_id": run_id,
            "field_id": field_id,
            "owner_generation": str(generation),
            "candidate_sha256": candidate_hash,
            "transforms_sha256": transform_hash,
            "units_sha256": unit_hash,
            "generators_sha256": generator_hash,
        },
        "driver": {
            "terminal_status": final_driver.terminal_status,
            "honesty_status": final_driver.honesty_status,
            "cleanarch_status": final_driver.cleanarch_status,
            "source_state": final_state,
        },
        "terminal": {
            "status": "connected-source-state-published",
            "all_source_components_present": True,
            "phase5_complete": False,
            "public_complete": False,
            "unverified_requirements": list(_UNVERIFIED_REQUIREMENTS),
        },
    }
    return payload, partial_result


def _validate_connected_payload(
    payload: Any, authority: ConnectedReplayAuthority
) -> ImmutableInternalResult:
    value = _exact_keys(
        payload,
        {"partial_result", "unit_evidence", "provenance", "driver", "terminal"},
        "connected payload",
    )
    provenance = _exact_keys(
        value["provenance"],
        {
            "run_id",
            "field_id",
            "owner_generation",
            "candidate_sha256",
            "transforms_sha256",
            "units_sha256",
            "generators_sha256",
        },
        "connected provenance",
    )
    if provenance["run_id"] != authority.run_id:
        raise AssemblyFailure("connected source run authority changed")
    if provenance["field_id"] != authority.field_id:
        raise AssemblyFailure("connected field authority changed")
    if provenance["owner_generation"] != str(authority.owner_generation):
        raise AssemblyFailure("connected owner generation changed")
    partial_raw = _canonical(value["partial_result"])
    try:
        partial = cold_replay(
            partial_raw,
            ReplayAuthority(authority.field_id, authority.assumptions),
        )
    except ReplayFailure as error:
        raise AssemblyFailure("embedded partial result failed cold replay") from error
    partial_payload = partial.detached_payload()
    partial_terminal = partial_payload.get("terminal")
    if not isinstance(partial_terminal, dict):
        raise AssemblyFailure("embedded partial terminal is absent")
    # The v2 embedded partial intentionally contains transforms and generators
    # but omits v1's unsound unit representation.
    if partial_terminal.get("schema_components_present") is not False:
        raise AssemblyFailure("embedded partial made an unsupported completeness claim")
    if partial_payload.get("units") is not None:
        raise AssemblyFailure("embedded v1 partial must not contain unit evidence")
    if not isinstance(partial_payload.get("transforms"), MappingABC) or not isinstance(
        partial_payload.get("generators"), MappingABC
    ):
        raise AssemblyFailure("embedded partial lacks transforms or generators")
    candidate_hash = canonical_component_sha256(partial_payload["candidate"])
    transform_hash = canonical_component_sha256(partial_payload["transforms"])
    linked_units = _validate_linked_units(
        value["unit_evidence"], partial_payload["candidate"]
    )
    unit_hash = canonical_component_sha256(linked_units)
    generator_hash = canonical_component_sha256(partial_payload["generators"])
    if (
        provenance["candidate_sha256"] != candidate_hash
        or provenance["transforms_sha256"] != transform_hash
        or provenance["units_sha256"] != unit_hash
        or provenance["generators_sha256"] != generator_hash
    ):
        raise AssemblyFailure("connected component fingerprint changed")
    driver = _exact_keys(
        value["driver"],
        {"terminal_status", "honesty_status", "cleanarch_status", "source_state"},
        "connected driver",
    )
    if driver["terminal_status"] != "buchall-end-assembled":
        raise AssemblyFailure("connected driver is not terminal")
    if driver["honesty_status"] not in ("verified", "equal-bound-source-skip"):
        raise AssemblyFailure("connected honesty status changed")
    if driver["cleanarch_status"] != "accepted":
        raise AssemblyFailure("connected cleanarch status changed")
    _snapshot_final_source_state(driver["source_state"])
    terminal = _exact_keys(
        value["terminal"],
        {
            "status",
            "all_source_components_present",
            "phase5_complete",
            "public_complete",
            "unverified_requirements",
        },
        "connected terminal",
    )
    if terminal["status"] != "connected-source-state-published":
        raise AssemblyFailure("connected state is not published")
    if terminal["all_source_components_present"] is not True:
        raise AssemblyFailure("connected source-component presence changed")
    if (
        terminal["phase5_complete"] is not False
        or terminal["public_complete"] is not False
    ):
        raise AssemblyFailure(
            "connected partial state claimed unsupported completeness"
        )
    if terminal["unverified_requirements"] != list(_UNVERIFIED_REQUIREMENTS):
        raise AssemblyFailure("connected unverified requirements changed")
    return partial


class ConnectedFinalStateAssembler:
    """Validate all connected outputs, then atomically publish one final state."""

    def __init__(self, authority: ConnectedReplayAuthority):
        self._authority = authority
        self._lock = Lock()
        self._published: ImmutableConnectedFinalState | None = None

    def assemble_and_publish(
        self,
        relation: RelationComponentOutput | None,
        transforms: TransformComponentOutput | None,
        units: UnitComponentOutput | None,
        generators: ClassGeneratorComponentOutput | None,
        final_driver: FinalDriverComponentOutput | None,
        assumptions: Sequence[str],
    ) -> ImmutableConnectedFinalState:
        relation_output = _require_component(relation, "relations")
        transform_output = _require_component(transforms, "transforms")
        unit_output = _require_component(units, "units")
        generator_output = _require_component(generators, "class generators")
        driver_output = _require_component(final_driver, "final driver")
        payload, partial = _build_connected_payload(
            relation_output,
            transform_output,
            unit_output,
            generator_output,
            driver_output,
            assumptions,
        )
        _validate_connected_payload(payload, self._authority)
        payload_raw = _canonical(payload)
        envelope = {
            "schema": CONNECTED_SCHEMA,
            "payload": payload,
            "payload_sha256": _sha256(payload_raw),
        }
        encoded = _canonical(envelope)
        candidate = ImmutableConnectedFinalState(encoded, _sha256(encoded), partial)
        if (
            self._authority.expected_connected_sha256 is not None
            and candidate.sha256 != self._authority.expected_connected_sha256
        ):
            raise AssemblyFailure("connected publication hash is not authorized")
        with self._lock:
            if self._published is None:
                self._published = candidate
            elif self._published != candidate:
                raise AssemblyConflict(
                    "a different connected terminal state is already published"
                )
            return self._published

    def current(self) -> ImmutableConnectedFinalState | None:
        with self._lock:
            return self._published


def cold_replay_connected_final_state(
    raw: bytes | str | ImmutableConnectedFinalState,
    authority: ConnectedReplayAuthority,
) -> ImmutableConnectedFinalState:
    """Replay a detached connected result without live component owners."""
    if authority.expected_connected_sha256 is None:
        raise AssemblyFailure(
            "cold replay requires an out-of-band connected publication hash"
        )
    encoded = (
        raw.canonical_json if isinstance(raw, ImmutableConnectedFinalState) else raw
    )
    envelope = _exact_keys(
        _strict_loads(encoded),
        {"schema", "payload", "payload_sha256"},
        "connected envelope",
    )
    if envelope["schema"] != CONNECTED_SCHEMA:
        raise AssemblyFailure("wrong connected result schema")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise AssemblyFailure("connected payload hash changed")
    partial = _validate_connected_payload(envelope["payload"], authority)
    canonical_envelope = _canonical(envelope)
    digest = _sha256(canonical_envelope)
    if digest != authority.expected_connected_sha256:
        raise AssemblyFailure("connected result hash is not authorized")
    return ImmutableConnectedFinalState(canonical_envelope, digest, partial)


__all__ = [
    "AssemblyConflict",
    "AssemblyFailure",
    "CONNECTED_SCHEMA",
    "ClassGeneratorComponentOutput",
    "ConnectedFinalStateAssembler",
    "ConnectedReplayAuthority",
    "FinalDriverComponentOutput",
    "ImmutableConnectedFinalState",
    "RelationComponentOutput",
    "TransformComponentOutput",
    "UnitComponentOutput",
    "canonical_component_sha256",
    "cold_replay_connected_final_state",
    "snapshot_final_source_state",
]
