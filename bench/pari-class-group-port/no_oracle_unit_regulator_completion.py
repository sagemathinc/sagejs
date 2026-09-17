"""No-oracle composition of the authentic cubic unit and regulator leaves.

The exact units are reconstructed from the qualified resident principal
relations.  Their archimedean values are rebuilt from resident roots, and the
regulator is then independently enclosed with Sage.js balls.  PARI is not an
input to this composition.  The result is correspondence authority under the
explicit pinned-PARI assumptions, not a unit-saturation certificate.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence


SCHEMA = "sagejs.pari-class-group/no-oracle-unit-regulator-completion-v1"
ENVELOPE_SCHEMA = "sagejs.pari-class-group/no-oracle-unit-regulator-envelope-v1"
FIELD_ID = "x^3-20018*x+20034"
_MAX_BYTES = 32 * 1024 * 1024


class NoOracleCompletionFailure(ValueError):
    """A resident, archimedean, or rigorous leaf failed closed."""


@dataclass(frozen=True)
class NoOracleCompletionAuthority:
    envelope_sha256: str

    def __post_init__(self) -> None:
        _digest(self.envelope_sha256, "completion envelope hash")


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
        raise NoOracleCompletionFailure("completion is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise NoOracleCompletionFailure("completion exceeds its byte bound")
    return raw


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _digest(value: Any, name: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise NoOracleCompletionFailure(name + " is not a SHA-256 digest")
    return value


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise NoOracleCompletionFailure(name + " is not an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise NoOracleCompletionFailure(name + " is not an integer") from error
    if str(answer) != str(value):
        raise NoOracleCompletionFailure(name + " is not canonical decimal")
    return answer


def _integers(value: Any, count: int, name: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != count
    ):
        raise NoOracleCompletionFailure(name + " has the wrong shape")
    return [_integer(entry, name + " entry") for entry in value]


def _mapping(value: Any, keys: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != keys:
        raise NoOracleCompletionFailure(name + " has the wrong fields")
    return value


def derive_relation_unit_leaf(
    resident_output: str | Path, live_unit_kernel_provenance: Sequence[Any]
) -> dict[str, Any]:
    """Materialize both units from resident relations and a live 2-by-7 map."""

    from .live_exact_units_cubic import reconstruct_live_cubic_units
    from .presentation_authority import (
        capture_presentation_authority,
        replay_presentation_authority,
    )

    provenance = _integers(
        live_unit_kernel_provenance, 14, "live unit kernel provenance"
    )
    resident = json.loads(Path(resident_output).read_text(encoding="utf-8"))
    packed_regulator = _integers(
        resident.get("accept_regulator", ())[:3], 3, "resident regulator"
    )
    presentation = capture_presentation_authority(resident_output)
    presentation_summary = replay_presentation_authority(presentation)
    tensor = _integers(
        presentation["field"]["multiplication_table"],
        27,
        "field multiplication table",
    )
    generators = [
        _integers(relation["alpha"], 3, "principal generator")
        for relation in presentation["relations"]
    ]
    cleanup = _integers(
        resident.get("hnf_transform", ())[: 73 * 73],
        73 * 73,
        "cleanup transform",
    )
    active = _integers(
        presentation["hnf"]["transform"], 15 * 15, "active HNF transform"
    )
    component = reconstruct_live_cubic_units(
        [value for generator in generators for value in generator],
        cleanup,
        active,
        provenance,
        tensor,
    )
    integral_units = component.exact_units
    retained_provenance = component.retained_relation_provenance
    power_units = [
        [str(a - 13345 * c), str(b + 2 * c), str(c)] for a, b, c in integral_units
    ]
    polynomial = [str(value) for value in presentation["field"]["polynomial"]]
    basis = ["1", "0", "0", "0", "1", "0", "-13345", "2", "1"]
    return {
        "schema": "sagejs.pari-class-group/relation-derived-unit-leaf-v1",
        "field": FIELD_ID,
        "resident_sha256": presentation["source"]["resident_sha256"],
        "presentation_sha256": presentation_summary["active_sha256"],
        "live_unit_output_sha256": component.output_sha256,
        "live_transform_sha256": component.transforms_sha256,
        "relation_provenance": [str(value) for value in provenance],
        "retained_relation_provenance": [str(value) for value in retained_provenance],
        "principal_generators_integral_basis": [
            [str(value) for value in generator] for generator in generators
        ],
        "exact_units_integral_basis": [
            [str(value) for value in unit] for unit in integral_units
        ],
        "exact_units_power_basis": power_units,
        "exact_units_sha256": _sha256(power_units),
        "polynomial_ascending": polynomial,
        "polynomial_sha256": _sha256(polynomial),
        "integral_basis_column_major": basis,
        "integral_basis_sha256": _sha256(basis),
        "resident_packed_regulator": [str(value) for value in packed_regulator],
        "authority": {
            "answer_coordinates_read": False,
            "answer_derived_factor_pool_read": False,
            "answer_derived_archimedean_read": False,
            "live_unit_transform": True,
            "principal_relation_materialization": True,
            "unit_saturation_proved": False,
            "public_complete": False,
        },
    }


def build_no_oracle_unit_regulator_completion(
    relation_leaf: Mapping[str, Any],
    archimedean_leaf: Mapping[str, Any],
    regulator_payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Compose three replayed leaves without consulting PARI."""

    relation = _mapping(
        relation_leaf,
        {
            "schema",
            "field",
            "resident_sha256",
            "presentation_sha256",
            "live_unit_output_sha256",
            "live_transform_sha256",
            "relation_provenance",
            "retained_relation_provenance",
            "principal_generators_integral_basis",
            "exact_units_integral_basis",
            "exact_units_power_basis",
            "exact_units_sha256",
            "polynomial_ascending",
            "polynomial_sha256",
            "integral_basis_column_major",
            "integral_basis_sha256",
            "resident_packed_regulator",
            "authority",
        },
        "relation-derived unit leaf",
    )
    arch = _mapping(
        archimedean_leaf,
        {
            "schema",
            "field",
            "resident_sha256",
            "polynomial_sha256",
            "integral_basis_sha256",
            "exact_units_sha256",
            "relation_transform_sha256",
            "principal_generators_sha256",
            "embedding_precision_bits",
            "log_precision_bits",
            "embedding",
            "packed_logs",
            "phases",
            "embedding_sha256",
            "packed_logs_sha256",
            "producer",
        },
        "rebuilt archimedean leaf",
    )
    if relation["schema"] != "sagejs.pari-class-group/relation-derived-unit-leaf-v1":
        raise NoOracleCompletionFailure("wrong relation-derived unit leaf")
    if arch["schema"] != "sagejs.pari-class-group/rebuilt-archimedean-leaf-v1":
        raise NoOracleCompletionFailure("wrong rebuilt archimedean leaf")
    if relation["field"] != FIELD_ID or arch["field"] != FIELD_ID:
        raise NoOracleCompletionFailure("completion field changed")
    for key in (
        "resident_sha256",
        "presentation_sha256",
        "live_unit_output_sha256",
        "live_transform_sha256",
    ):
        _digest(relation[key], key)
    if arch["resident_sha256"] != relation["resident_sha256"]:
        raise NoOracleCompletionFailure("rebuilt embedding left resident authority")
    if arch["polynomial_sha256"] != relation["polynomial_sha256"]:
        raise NoOracleCompletionFailure("rebuilt embedding used another polynomial")
    if arch["integral_basis_sha256"] != relation["integral_basis_sha256"]:
        raise NoOracleCompletionFailure("rebuilt embedding used another integral basis")
    units = relation["exact_units_power_basis"]
    if relation["exact_units_sha256"] != _sha256(units):
        raise NoOracleCompletionFailure("relation-derived unit hash changed")
    if arch["exact_units_sha256"] != relation["exact_units_sha256"]:
        raise NoOracleCompletionFailure("rebuilt logs belong to other units")
    retained = _integers(
        relation["retained_relation_provenance"],
        146,
        "retained relation provenance",
    )
    generators = relation["principal_generators_integral_basis"]
    if (
        not isinstance(generators, Sequence)
        or len(generators) != 73
        or any(
            isinstance(row, (str, bytes))
            or not isinstance(row, Sequence)
            or len(row) != 3
            for row in generators
        )
    ):
        raise NoOracleCompletionFailure("principal generators have the wrong shape")
    canonical_generators = [
        [str(value) for value in _integers(row, 3, "principal generator")]
        for row in generators
    ]
    if arch["relation_transform_sha256"] != _sha256([str(value) for value in retained]):
        raise NoOracleCompletionFailure("rebuilt logs used another relation transform")
    if arch["principal_generators_sha256"] != _sha256(canonical_generators):
        raise NoOracleCompletionFailure("rebuilt logs used other principal generators")
    if arch["embedding_sha256"] != _sha256(arch["embedding"]):
        raise NoOracleCompletionFailure("rebuilt embedding hash changed")
    if arch["packed_logs_sha256"] != _sha256(arch["packed_logs"]):
        raise NoOracleCompletionFailure("rebuilt log hash changed")
    if arch["producer"] != {
        "pari_invoked": False,
        "answer_derived_logs_read": False,
        "answer_derived_embedding_read": False,
        "source": "ordinary-python-exact-polynomial-cubic-rebuild",
    }:
        raise NoOracleCompletionFailure("archimedean producer is not oracle-free")
    if _integer(arch["embedding_precision_bits"], "embedding precision") != 2176:
        raise NoOracleCompletionFailure("unexpected embedding precision")
    if _integer(arch["log_precision_bits"], "log precision") != 2176:
        raise NoOracleCompletionFailure("unexpected log precision")
    _integers(arch["packed_logs"], 18, "rebuilt packed logs")
    phases = _integers(arch["phases"], 6, "rebuilt phases")
    if any(phase not in (0, 1) for phase in phases):
        raise NoOracleCompletionFailure("invalid rebuilt phase")
    relation_authority = relation["authority"]
    if relation_authority != {
        "answer_coordinates_read": False,
        "answer_derived_factor_pool_read": False,
        "answer_derived_archimedean_read": False,
        "live_unit_transform": True,
        "principal_relation_materialization": True,
        "unit_saturation_proved": False,
        "public_complete": False,
    }:
        raise NoOracleCompletionFailure("relation authority scope changed")

    if regulator_payload.get("schema") != (
        "sagejs.pari-class-group.regulator-acceptance-replay.v1"
    ):
        raise NoOracleCompletionFailure("wrong regulator replay payload")
    inputs = regulator_payload["inputs"]
    evidence = regulator_payload["evidence"]
    assumptions = regulator_payload["assumptions"]
    if inputs["exact_units_power_coordinates"] != units:
        raise NoOracleCompletionFailure("regulator used different exact units")
    if inputs["resident"]["packed_logs"] != arch["packed_logs"]:
        raise NoOracleCompletionFailure("regulator used different rebuilt logs")
    if inputs["retry"]["packed_logs_sha256"] != arch["packed_logs_sha256"]:
        raise NoOracleCompletionFailure("regulator log authority changed")
    if evidence["exact_unit_coordinate_sha256"] != _sha256(units):
        raise NoOracleCompletionFailure("regulator unit hash changed")
    if evidence["packed_log_matches"] != [True] * 6:
        raise NoOracleCompletionFailure("rebuilt logs left rigorous balls")
    enclosure = evidence["regulator"]
    if (
        enclosure["rigorous"] is not True
        or enclosure["full_rank_certified"] is not True
    ):
        raise NoOracleCompletionFailure("regulator was not rigorously separated")
    if assumptions["pari_correspondence"]["assumed"] is not True:
        raise NoOracleCompletionFailure("PARI correspondence assumption disappeared")
    public = assumptions["public_certification"]
    if (
        public["unit_saturation_index_one"] is not False
        or public["class_unit_complete"] is not False
    ):
        raise NoOracleCompletionFailure("regulator leaf overclaimed completion")

    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "polynomial_ascending": ["20034", "-20018", "0", "1"],
        },
        "authorities": {
            "resident_sha256": relation["resident_sha256"],
            "presentation_sha256": relation["presentation_sha256"],
            "live_unit_output_sha256": relation["live_unit_output_sha256"],
            "live_transform_sha256": relation["live_transform_sha256"],
            "relation_leaf_sha256": _sha256(relation),
            "archimedean_leaf_sha256": _sha256(arch),
            "regulator_payload_sha256": _sha256(regulator_payload),
        },
        "unit_group_correspondence": {
            "rank": "2",
            "exact_units_power_coordinates": copy.deepcopy(units),
            "relation_provenance": copy.deepcopy(relation["relation_provenance"]),
            "rebuilt_packed_logs": copy.deepcopy(arch["packed_logs"]),
            "rebuilt_phases": copy.deepcopy(arch["phases"]),
            "regulator_enclosure": copy.deepcopy(enclosure),
        },
        "assumptions": {
            "scope": "internal-PARI-2.17.4-correspondence-only",
            "pari_heuristics_and_acceptance_assumed": True,
            "independent_unit_index_one": False,
        },
        "terminal": {
            "status": "no-oracle-unit-regulator-correspondence-complete",
            "no_pari_or_answer_oracle": True,
            "correspondence_complete": True,
            "public_complete": False,
            "class_unit_computation_complete": False,
            "standard_public_adapter_eligible": False,
            "unit_saturation_certified": False,
            "missing_public_evidence": [
                "replayable-unit-saturation-index-one-certificate",
                "standard-class-unit-proof-payload-with-factor-base-bound-and-proof-stage",
            ],
        },
    }


def seal_no_oracle_unit_regulator_completion(
    payload: Mapping[str, Any],
) -> tuple[bytes, NoOracleCompletionAuthority]:
    if payload.get("schema") != SCHEMA:
        raise NoOracleCompletionFailure("unsupported completion payload")
    envelope = {
        "schema": ENVELOPE_SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256(payload),
    }
    raw = _canonical(envelope)
    return raw, NoOracleCompletionAuthority(hashlib.sha256(raw).hexdigest())


def cold_replay_no_oracle_unit_regulator_completion(
    raw: bytes,
    authority: NoOracleCompletionAuthority,
    relation_leaf: Mapping[str, Any],
    archimedean_leaf: Mapping[str, Any],
    regulator_payload: Mapping[str, Any],
) -> dict[str, Any]:
    if not isinstance(raw, bytes) or type(authority) is not NoOracleCompletionAuthority:
        raise TypeError("cold replay needs bytes and explicit authority")
    if hashlib.sha256(raw).hexdigest() != authority.envelope_sha256:
        raise NoOracleCompletionFailure("completion envelope lacks authority")
    try:
        envelope = json.loads(raw.decode("ascii"))
    except (UnicodeError, ValueError) as error:
        raise NoOracleCompletionFailure("completion envelope is not JSON") from error
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise NoOracleCompletionFailure("completion envelope has wrong fields")
    if envelope["schema"] != ENVELOPE_SCHEMA:
        raise NoOracleCompletionFailure("wrong completion envelope schema")
    payload = envelope["payload"]
    if envelope["payload_sha256"] != _sha256(payload):
        raise NoOracleCompletionFailure("completion payload hash changed")
    replayed = build_no_oracle_unit_regulator_completion(
        relation_leaf, archimedean_leaf, regulator_payload
    )
    if _canonical(replayed) != _canonical(payload):
        raise NoOracleCompletionFailure("completion changed under cold replay")
    return replayed


__all__ = [
    "ENVELOPE_SCHEMA",
    "FIELD_ID",
    "NoOracleCompletionAuthority",
    "NoOracleCompletionFailure",
    "SCHEMA",
    "build_no_oracle_unit_regulator_completion",
    "cold_replay_no_oracle_unit_regulator_completion",
    "derive_relation_unit_leaf",
    "seal_no_oracle_unit_regulator_completion",
]
