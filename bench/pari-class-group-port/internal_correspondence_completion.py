"""Compose the authentic cubic leaves into one internal correspondence result.

The result in this module is deliberately *not* a public class/unit result.
It says that the qualified `h = 1` computation has reproduced the complete
PARI 2.17.4 state under the experiment's recorded PARI/GRH assumptions.  It
does not say that the selected unit lattice is independently known to have
index one in the full unit group.

The distinction is enforced structurally: `correspondence_complete` is true,
while every public-completion and saturation field is false.  Cold replay
requires all four independently replayable source authorities again.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Any, Callable, Mapping, Sequence

from .class_group_authentic_success import (
    AuthenticSuccessAuthority,
    AuthenticSuccessPublisher,
    cold_replay_authentic_success,
)
from .presentation_authority import replay_presentation_authority
from .torsion_authority import (
    ImmutableTorsionResult,
    TorsionReplayAuthority,
    cold_replay_torsion,
)


SCHEMA = "sagejs.pari-class-group/internal-correspondence-completion-v1"
ENVELOPE_SCHEMA = "sagejs.pari-class-group/internal-correspondence-envelope-v1"
FIELD_ID = "x^3-20018*x+20034"
CONNECTED_FIELD_ID = "pari-2.17.4:" + FIELD_ID
_MAX_BYTES = 4 * 1024 * 1024

_ASSUMPTIONS = (
    "GRH-dependent factor-base policy inherited from PARI 2.17.4",
    "PARI 2.17.4 heuristic bounds and floating acceptance are assumed",
)

_PUBLIC_MISSING = (
    "replayable-unit-saturation-index-one-certificate",
    "standard-class-unit-proof-payload-with-factor-base-bound-and-proof-stage",
)


class InternalCorrespondenceFailure(ValueError):
    """A leaf authority or its composition failed closed."""


@dataclass(frozen=True)
class InternalCorrespondenceAuthority:
    """Out-of-band authority for one immutable completion envelope."""

    expected_sha256: str

    def __post_init__(self) -> None:
        digest = self.expected_sha256
        if len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest):
            raise ValueError("internal correspondence authority needs a SHA-256 digest")


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
        raise InternalCorrespondenceFailure(
            "internal correspondence is not canonical JSON"
        ) from error
    if len(raw) > _MAX_BYTES:
        raise InternalCorrespondenceFailure(
            "internal correspondence exceeds its byte bound"
        )
    return raw


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise InternalCorrespondenceFailure(
            "internal correspondence exceeds its byte bound"
        )

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise InternalCorrespondenceFailure(
                    "duplicate internal correspondence key: " + key
                )
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise InternalCorrespondenceFailure(
            "internal correspondence is not strict JSON"
        ) from error
    if not isinstance(value, dict):
        raise InternalCorrespondenceFailure("completion envelope must be an object")
    return value


def _mapping(value: Any, keys: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise InternalCorrespondenceFailure(name + " has the wrong fields")
    return value


def _integers(values: Any, length: int, name: str) -> list[int]:
    if (
        isinstance(values, (str, bytes))
        or not isinstance(values, Sequence)
        or len(values) != length
    ):
        raise InternalCorrespondenceFailure(name + " has the wrong shape")
    answer: list[int] = []
    for value in values:
        if isinstance(value, bool):
            raise InternalCorrespondenceFailure(name + " contains a boolean")
        try:
            integer = int(value)
        except (TypeError, ValueError, OverflowError) as error:
            raise InternalCorrespondenceFailure(
                name + " contains a non-integer"
            ) from error
        if str(integer) != str(value):
            raise InternalCorrespondenceFailure(
                name + " contains a noncanonical integer"
            )
        answer.append(integer)
    return answer


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _inverse_power_basis(unit: Sequence[Any], polynomial: Sequence[int]) -> list[str]:
    """Invert one integral cubic unit by exact Cramer's rule."""

    a, b, c = _integers(unit, 3, "exact cubic unit")
    p0, p1, p2, leading = polynomial
    if leading != 1:
        raise InternalCorrespondenceFailure("unit inversion needs a monic cubic")
    # Rows are output coefficients; columns multiply 1, x, and x^2.
    matrix = [
        a,
        -p0 * c,
        p0 * (p2 * c - b),
        b,
        a - p1 * c,
        -p0 * c - p1 * b + p1 * p2 * c,
        c,
        b - p2 * c,
        a - p2 * b + (p2 * p2 - p1) * c,
    ]
    determinant = _determinant3(matrix)
    if determinant not in (-1, 1):
        raise InternalCorrespondenceFailure("selected element is not an integral unit")
    inverse: list[int] = []
    for column in range(3):
        replaced = list(matrix)
        replaced[column] = 1
        replaced[3 + column] = 0
        replaced[6 + column] = 0
        numerator = _determinant3(replaced)
        inverse.append(numerator // determinant)
    product = [
        sum(matrix[3 * row + column] * inverse[column] for column in range(3))
        for row in range(3)
    ]
    if product != [1, 0, 0]:
        raise InternalCorrespondenceFailure("exact cubic unit inverse failed replay")
    return [str(value) for value in inverse]


def _validate_and_hash_authentic(payload: Mapping[str, Any]) -> str:
    publisher = AuthenticSuccessPublisher()
    published = publisher.publish(payload)
    authority = AuthenticSuccessAuthority(published.sha256)
    if cold_replay_authentic_success(published, authority) != published:
        raise InternalCorrespondenceFailure("authentic success did not cold replay")
    return published.sha256


def _validate_and_hash_torsion(result: ImmutableTorsionResult) -> dict[str, Any]:
    if type(result) is not ImmutableTorsionResult:
        raise InternalCorrespondenceFailure("torsion input is not an immutable result")
    payload = result.detached_payload()
    field = _mapping(
        payload.get("field"),
        {
            "polynomial_ascending",
            "polynomial_sha256",
            "degree",
            "discriminant",
            "real_places",
            "complex_places",
        },
        "torsion field",
    )
    authority = TorsionReplayAuthority(field["polynomial_sha256"], result.sha256)
    if cold_replay_torsion(result, authority) != result:
        raise InternalCorrespondenceFailure("torsion authority did not cold replay")
    return payload


def build_internal_correspondence_completion(
    authentic_payload: Mapping[str, Any],
    presentation_payload: Mapping[str, Any],
    regulator_payload: Mapping[str, Any],
    torsion_result: ImmutableTorsionResult,
    regulator_verifier: Callable[[Mapping[str, Any]], str],
) -> dict[str, Any]:
    """Replay and compose the four authentic leaves for the qualified cubic.

    The regulator uses Sage.js field/Arb objects and therefore crosses a
    caller-supplied replay boundary.  The verifier must cold-replay the supplied
    payload and return its envelope digest; the focused driver supplies the
    production `regulator_acceptance_replay` implementation.  A digest-only
    callback is not sufficient evidence and is never installed by this module.
    """

    try:
        authentic_sha256 = _validate_and_hash_authentic(authentic_payload)
        presentation_summary = replay_presentation_authority(presentation_payload)
        presentation_sha256 = _sha256(presentation_payload)
        regulator_sha256 = str(regulator_verifier(regulator_payload))
        if len(regulator_sha256) != 64 or any(
            ch not in "0123456789abcdef" for ch in regulator_sha256
        ):
            raise InternalCorrespondenceFailure(
                "regulator verifier did not return replay authority"
            )
        torsion_payload = _validate_and_hash_torsion(torsion_result)
    except InternalCorrespondenceFailure:
        raise
    except (ArithmeticError, KeyError, TypeError, ValueError) as error:
        raise InternalCorrespondenceFailure(
            "a source authority failed replay"
        ) from error

    source = authentic_payload["source"]
    candidate = authentic_payload["candidate"]
    component = authentic_payload["unit_component"]
    correspondence = authentic_payload["correspondence"]
    terminal = authentic_payload["terminal"]
    regulator_inputs = regulator_payload["inputs"]
    regulator_evidence = regulator_payload["evidence"]
    regulator_assumptions = regulator_payload["assumptions"]

    if (
        source["field_id"] != CONNECTED_FIELD_ID
        or presentation_summary["field"] != FIELD_ID
        or regulator_inputs["source"]["field_id"] != FIELD_ID
        or source["pari_version"] != "2.17.4"
        or regulator_inputs["source"]["pari_version"] != "2.17.4"
    ):
        raise InternalCorrespondenceFailure("source field or PARI identity changed")
    if source["resident_sha256"] != presentation_payload["source"]["resident_sha256"]:
        raise InternalCorrespondenceFailure("presentation and class state diverged")
    if (
        source["unit_fixture_sha256"]
        != regulator_inputs["source"]["unit_bridge_fixture_sha256"]
    ):
        raise InternalCorrespondenceFailure("unit and regulator fixtures diverged")

    polynomial = _integers(
        presentation_payload["field"]["polynomial"], 4, "presentation polynomial"
    )
    if (
        polynomial != [20034, -20018, 0, 1]
        or _integers(
            regulator_inputs["field"]["defining_polynomial_coefficients"],
            4,
            "regulator polynomial",
        )
        != polynomial
    ):
        raise InternalCorrespondenceFailure("prepared polynomial changed")
    if (
        _integers(
            torsion_payload["field"]["polynomial_ascending"], 4, "torsion polynomial"
        )
        != polynomial
    ):
        raise InternalCorrespondenceFailure("torsion belongs to another field")

    active = [str(value) for value in presentation_payload["hnf"]["active_relation"]]
    full_hnf = [str(value) for value in presentation_payload["hnf"]["full_hnf"]]
    if candidate["active_relation_matrix"] != active:
        raise InternalCorrespondenceFailure("class result left presentation authority")
    if candidate["presentation_matrix"] != full_hnf[56:120]:
        raise InternalCorrespondenceFailure("Smith input left the replayed HNF")
    if (
        candidate["class_number"] != "1"
        or candidate["invariant_factors"] != []
        or authentic_payload["generators"] != {"entries": []}
        or presentation_summary["factor_base_size"] != 66
        or presentation_summary["principal_relations"] != 73
    ):
        raise InternalCorrespondenceFailure("qualified h=1 class state changed")

    unit_evidence = component["evidence"]
    selected_lattice = regulator_inputs["selected_lattice"]
    authentic_provenance = _integers(
        correspondence["unit_kernel_provenance"], 14, "authentic unit provenance"
    )
    selected_provenance = _integers(
        selected_lattice["unit_transform"], 14, "selected unit provenance"
    )
    orientation: list[int] = []
    for unit in range(2):
        authentic_row = authentic_provenance[7 * unit : 7 * (unit + 1)]
        selected_row = selected_provenance[7 * unit : 7 * (unit + 1)]
        if authentic_row == selected_row:
            orientation.append(1)
        elif authentic_row == [-value for value in selected_row]:
            orientation.append(-1)
        else:
            raise InternalCorrespondenceFailure(
                "exact units left their signed HNF provenance"
            )
    if selected_lattice["unit_transform"] != selected_lattice["relation_provenance"]:
        raise InternalCorrespondenceFailure("selected unit provenance changed")
    if unit_evidence["claimed_norms"] != regulator_evidence["exact_unit_norms"]:
        raise InternalCorrespondenceFailure("exact unit norms diverged")
    if (
        unit_evidence["candidate_regulator_triplet"]
        != regulator_inputs["resident"]["packed_regulator"]
        or candidate["regulator_triplet"]
        != regulator_inputs["resident"]["packed_regulator"]
    ):
        raise InternalCorrespondenceFailure("resident regulator linkage changed")
    selected_units = regulator_inputs["exact_units_power_coordinates"]
    if regulator_evidence["exact_unit_coordinate_sha256"] != _sha256(selected_units):
        raise InternalCorrespondenceFailure("exact unit coordinate hash changed")
    units = [
        list(selected_units[index])
        if orientation[index] == 1
        else _inverse_power_basis(selected_units[index], polynomial)
        for index in range(2)
    ]
    rigorous_regulator = regulator_evidence["regulator"]
    if (
        regulator_evidence["packed_log_matches"] != [True] * 6
        or regulator_evidence["packed_regulator_matches"] is not True
        or rigorous_regulator["rigorous"] is not True
        or rigorous_regulator["full_rank_certified"] is not True
        or regulator_assumptions["pari_correspondence"]["assumed"] is not True
        or regulator_assumptions["public_certification"]["class_unit_complete"]
        is not False
    ):
        raise InternalCorrespondenceFailure("regulator acceptance boundary changed")

    torsion = torsion_payload["torsion"]
    if (
        torsion["order"] != unit_evidence["torsion_order"]
        or torsion["generator_power_basis"] != unit_evidence["torsion_coordinates"]
        or torsion["generator_norm"] != unit_evidence["torsion_norm"]
    ):
        raise InternalCorrespondenceFailure("torsion authorities diverged")
    if (
        correspondence["final_driver_status"] != "not-published"
        or terminal["phase5_complete"] is not False
        or terminal["public_complete"] is not False
    ):
        raise InternalCorrespondenceFailure("source leaf overstated completion")

    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "polynomial_ascending": [str(value) for value in polynomial],
        },
        "source_authorities": {
            "authentic_success_sha256": authentic_sha256,
            "presentation_sha256": presentation_sha256,
            "regulator_envelope_sha256": regulator_sha256,
            "torsion_sha256": torsion_result.sha256,
            "resident_sha256": source["resident_sha256"],
            "unit_fixture_sha256": source["unit_fixture_sha256"],
        },
        "class_group": {
            "class_number": "1",
            "invariant_factors": [],
            "generator_ideals": [],
            "factor_base_size": "66",
            "principal_relation_count": "73",
            "presentation_sha256": presentation_summary["active_sha256"],
        },
        "unit_group_correspondence": {
            "rank": "2",
            "exact_units_power_coordinates": units,
            "selected_regulator_units_power_coordinates": selected_units,
            "selected_to_correspondence_basis": [
                str(orientation[0]),
                "0",
                "0",
                str(orientation[1]),
            ],
            "exact_unit_norms": regulator_evidence["exact_unit_norms"],
            "selected_relation_provenance": selected_lattice["unit_transform"],
            "torsion_order": torsion["order"],
            "torsion_generator_power_coordinates": torsion["generator_power_basis"],
            "regulator_enclosure": rigorous_regulator,
        },
        "assumptions": {
            "items": list(_ASSUMPTIONS),
            "scope": "internal-PARI-correspondence-only",
            "pari_correspondence_assumed": True,
            "independent_unit_index_one": False,
        },
        "terminal": {
            "status": "pari-correspondence-complete-internal-h1",
            "correspondence_complete": True,
            "composition_driver_published": True,
            "source_leaf_final_driver_published": False,
            "public_complete": False,
            "class_unit_computation_complete": False,
            "standard_public_adapter_eligible": False,
            "unit_saturation_certified": False,
            "missing_public_evidence": list(_PUBLIC_MISSING),
        },
    }


def seal_internal_correspondence_completion(
    payload: Mapping[str, Any],
) -> tuple[bytes, InternalCorrespondenceAuthority]:
    """Seal a composed payload without granting public proof authority."""

    if not isinstance(payload, dict) or payload.get("schema") != SCHEMA:
        raise InternalCorrespondenceFailure("unsupported completion payload")
    payload_raw = _canonical(payload)
    envelope = {
        "schema": ENVELOPE_SCHEMA,
        "payload": payload,
        "payload_sha256": hashlib.sha256(payload_raw).hexdigest(),
    }
    raw = _canonical(envelope)
    return raw, InternalCorrespondenceAuthority(hashlib.sha256(raw).hexdigest())


def cold_replay_internal_correspondence_completion(
    raw: bytes,
    authority: InternalCorrespondenceAuthority,
    authentic_payload: Mapping[str, Any],
    presentation_payload: Mapping[str, Any],
    regulator_payload: Mapping[str, Any],
    torsion_result: ImmutableTorsionResult,
    regulator_verifier: Callable[[Mapping[str, Any]], str],
) -> dict[str, Any]:
    """Rebuild the completion from all external leaf authorities."""

    if (
        not isinstance(raw, bytes)
        or type(authority) is not InternalCorrespondenceAuthority
    ):
        raise TypeError("cold correspondence replay needs bytes and explicit authority")
    if hashlib.sha256(raw).hexdigest() != authority.expected_sha256:
        raise InternalCorrespondenceFailure("completion envelope lacks authority")
    envelope = _strict_loads(raw)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise InternalCorrespondenceFailure("completion envelope has wrong fields")
    if envelope["schema"] != ENVELOPE_SCHEMA:
        raise InternalCorrespondenceFailure("unsupported completion envelope")
    payload = envelope["payload"]
    if (
        not isinstance(payload, dict)
        or hashlib.sha256(_canonical(payload)).hexdigest() != envelope["payload_sha256"]
    ):
        raise InternalCorrespondenceFailure("completion payload hash changed")
    replayed = build_internal_correspondence_completion(
        authentic_payload,
        presentation_payload,
        regulator_payload,
        torsion_result,
        regulator_verifier,
    )
    if _canonical(replayed) != _canonical(payload):
        raise InternalCorrespondenceFailure("completion changed under cold replay")
    return replayed


__all__ = [
    "ENVELOPE_SCHEMA",
    "FIELD_ID",
    "InternalCorrespondenceAuthority",
    "InternalCorrespondenceFailure",
    "SCHEMA",
    "build_internal_correspondence_completion",
    "cold_replay_internal_correspondence_completion",
    "seal_internal_correspondence_completion",
]
