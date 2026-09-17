"""Authentic h=1 correspondence after the successful cubic unit retry.

This remains an internal, incomplete result.  It connects the active
relation/HNF and Smith witnesses to the successful `UnitComponentOutput`, and
records the HNF-kernel map that places both reconstructed units in the active
relation lattice.  It does not invent a final-driver completion record.
"""

from __future__ import annotations

from collections.abc import Mapping as MappingABC, Sequence as SequenceABC
from dataclasses import dataclass
from fractions import Fraction
import hashlib
import json
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Sequence

from .class_group_authentic_final_state import (
    FIELD_ID,
    FIXTURE_SHA256,
    RESIDENT_SHA256,
    _run_relation_and_smith,
)
from .class_group_final_state import (
    AssemblyFailure,
    UnitComponentOutput,
    _validate_linked_units,
    canonical_component_sha256,
    snapshot_final_source_state,
)
from .class_relation_cleanarch import (
    pari_cleanarch_retry_action,
    pari_cleanarch_totally_real_cubic,
)
from .presentation_authority import (
    capture_presentation_authority,
    replay_presentation_authority,
)
from .torsion_authority import (
    TorsionReplayAuthority,
    cold_replay_torsion,
    derive_real_cubic_torsion,
    prepared_polynomial_sha256,
)
from .unit_relation_authority import (
    capture_unit_relation_authority,
    replay_unit_relation_authority,
)
from .unit_bridge_cubic import (
    pari_cubic_getfu_factor_rank_two,
    pari_cubic_unit_bridge_prepare,
    pari_cubic_unit_compose_provenance,
    pari_cubic_unit_retry_link,
)
from .unit_component_cubic import make_real_cubic_unit_component
from .unit_reconstruction_signed import pari_getfu_signed_real_cubic


SUCCESS_SCHEMA = "sagejs.pari-class-group/authentic-authority-composition-v2"
RUN_ID = "authentic-real-cubic-h1-p2304"
OWNER_GENERATION = 1
CONNECTED_FIELD_ID = "pari-2.17.4:" + FIELD_ID
_MAX_BYTES = 64 * 1024 * 1024
_INTERNAL_UNVERIFIED_REQUIREMENTS = ("remove-live-pari-unit-oracle-input",)
_PUBLIC_UNVERIFIED_REQUIREMENTS = (
    "independent-unit-saturation-index-one-certificate",
    "independent-factor-base-relation-completeness-certificate",
)

_CLEANARCH_PRECISION = 192
_CLEANARCH_COLUMNS = 7
_CLEANARCH_RETRY = [1, 192, 256, 64, 10, 64]
_REGULATOR_FIXTURE = "regulator-acceptance-replay-fixture.json"


class AuthenticSuccessFailure(ValueError):
    """Authentic successful composition or detached replay failed closed."""


class AuthenticSuccessConflict(RuntimeError):
    """A different authentic success result was already published."""


@dataclass(frozen=True)
class AuthenticSuccessAuthority:
    expected_sha256: str


@dataclass(frozen=True)
class ImmutableAuthenticSuccess:
    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        return dict(_strict_loads(self.canonical_json)["payload"])


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
        raise AuthenticSuccessFailure("success result is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise AuthenticSuccessFailure("success result exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise AuthenticSuccessFailure("success result exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise AuthenticSuccessFailure("duplicate success key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise AuthenticSuccessFailure("success result is not strict JSON") from error
    if not isinstance(value, dict):
        raise AuthenticSuccessFailure("success envelope must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_dict(value: Any, fields: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise AuthenticSuccessFailure(name + " has the wrong fields")
    return value


def _integers(value: Any, name: str, length: int | None = None) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, SequenceABC):
        raise AuthenticSuccessFailure(name + " must be an exact sequence")
    if length is not None and len(value) != length:
        raise AuthenticSuccessFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise AuthenticSuccessFailure(name + " contains a non-integer")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise AuthenticSuccessFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise AuthenticSuccessFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _column_product(
    left: Sequence[int], rows: int, inner: int, right: Sequence[int], columns: int
) -> list[int]:
    if len(left) != rows * inner or len(right) != inner * columns:
        raise AuthenticSuccessFailure("matrix replay has the wrong shape")
    return [
        sum(left[k * rows + row] * right[column * inner + k] for k in range(inner))
        for column in range(columns)
        for row in range(rows)
    ]


def _identity(size: int) -> list[int]:
    return [int(row == column) for column in range(size) for row in range(size)]


def _read_inputs(
    resident_output: str | Path, fixture_path: str | Path
) -> tuple[dict[str, Any], dict[str, Any]]:
    resident_raw = Path(resident_output).read_bytes()
    fixture_raw = Path(fixture_path).read_bytes()
    if _sha256(resident_raw) != RESIDENT_SHA256:
        raise AuthenticSuccessFailure("resident output is not the qualified artifact")
    if _sha256(fixture_raw) != FIXTURE_SHA256:
        raise AuthenticSuccessFailure("unit fixture is not the qualified artifact")
    resident = _strict_loads(resident_raw)
    fixture_root = _strict_loads(fixture_raw)
    cases = fixture_root.get("cases")
    if not isinstance(cases, list) or len(cases) != 1 or not isinstance(cases[0], dict):
        raise AuthenticSuccessFailure("unit fixture must contain one case")
    fixture = cases[0]
    if fixture.get("polynomial") != FIELD_ID:
        raise AuthenticSuccessFailure("unit fixture field changed")
    if resident.get("hnf_state", [])[:9] != fixture["resident_state"]["hnf_state"]:
        raise AuthenticSuccessFailure("resident HNF state and unit fixture diverged")
    if (
        resident.get("accept_acceptance_state")
        != fixture["resident_state"]["acceptance"]
    ):
        raise AuthenticSuccessFailure("resident acceptance state and fixture diverged")
    if resident.get("hnf_result_c", [])[:147] != fixture["accepted_arch"]:
        raise AuthenticSuccessFailure("accepted unit columns are not resident columns")
    if resident.get("accept_regulator", [])[:3] != fixture["regulator"]:
        raise AuthenticSuccessFailure("accepted regulator and unit fixture diverged")
    return resident, fixture


def _unit_retry(
    fixture: Mapping[str, Any], oracle: Mapping[str, Any]
) -> tuple[list[int], list[int], list[int], list[int], list[int], list[int]]:
    def zeros(length: int) -> list[int]:
        return [0] * length

    def floats(length: int) -> list[float]:
        return [0.0] * length

    columns = int(fixture["columns"])
    square = columns * columns
    prepare = [
        _integers(fixture["accepted_arch"], "accepted unit logs"),
        _integers(fixture["relation_lattice"], "unit relation lattice"),
        columns,
        _integers(fixture["regulator"], "accepted regulator", 3),
        zeros(2 * columns),
        zeros(4),
        zeros(2 * columns),
        zeros(42),
        zeros(18),
        zeros(42),
        zeros(18),
        zeros(6),
        zeros(5),
        floats(5),
        zeros(5),
        zeros(2 * columns),
        zeros(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(columns),
        zeros(columns),
        floats(2 * columns),
        floats(square),
        zeros(columns),
        zeros(columns),
        zeros(columns),
        floats(columns),
        floats(columns),
        floats(columns),
        zeros(columns),
        zeros(6),
        zeros(3),
        zeros(6),
        zeros(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(2),
        zeros(2),
        floats(6),
        floats(4),
        zeros(2),
        zeros(3),
        zeros(3),
        floats(3),
        floats(3),
        floats(3),
        zeros(3),
        zeros(2),
    ]
    if pari_cubic_unit_bridge_prepare(*prepare) != 0:
        raise AuthenticSuccessFailure("resident unit preparation rejected")
    retry_input = _integers(
        [value for triple in oracle["input"] for value in triple],
        "retry input",
        18,
    )
    retry_link = zeros(3)
    if pari_cubic_unit_retry_link(prepare[10], retry_input, retry_link) != 0:
        raise AuthenticSuccessFailure("resident-to-retry linkage rejected")
    factor = [
        retry_input,
        zeros(4),
        zeros(18),
        zeros(6),
        zeros(4),
        zeros(2),
        floats(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(2),
        zeros(2),
        floats(6),
        floats(4),
        zeros(2),
        zeros(3),
        zeros(2),
        floats(3),
        floats(3),
        zeros(4),
    ]
    if pari_cubic_getfu_factor_rank_two(*factor) != 0:
        raise AuthenticSuccessFailure("retry factor rejected")
    tensor = _integers(
        [value for row in oracle["tensor"] for value in row],
        "multiplication tensor",
        27,
    )
    retry = [
        retry_input,
        _integers(oracle["inputPhases"], "retry input phases", 6),
        factor[1],
        _integers(
            [value for triple in oracle["embedding"] for value in triple],
            "retry embedding",
            27,
        ),
        tensor,
        2048,
        2048,
        zeros(18),
        zeros(18),
        zeros(18),
        zeros(6),
        zeros(18),
        zeros(27),
        zeros(18),
        zeros(18),
        zeros(6),
        zeros(9),
        zeros(3),
        zeros(6),
        zeros(4),
        zeros(6),
        zeros(18),
        zeros(6),
        zeros(4),
        zeros(8),
        zeros(3),
        zeros(320),
        zeros(320),
        zeros(320),
        zeros(320),
        zeros(320),
        zeros(128),
    ]
    if pari_getfu_signed_real_cubic(*retry) != 0 or retry[24][0] != 0:
        raise AuthenticSuccessFailure("p2304 unit retry did not succeed")
    units = retry[20]
    logs = retry[21]
    getfu_factor = retry[23]
    if units != _integers(
        [value for row in oracle["units"] for value in row], "oracle units", 6
    ):
        raise AuthenticSuccessFailure("retry units disagree with PARI")
    if logs != _integers(
        [value for triple in oracle["logs"] for value in triple], "oracle logs", 18
    ):
        raise AuthenticSuccessFailure("retry logs disagree with PARI")
    if getfu_factor != _integers(oracle["factor"], "oracle factor", 4):
        raise AuthenticSuccessFailure("retry factor disagrees with PARI")
    provenance = zeros(2 * columns)
    if (
        pari_cubic_unit_compose_provenance(
            prepare[6], columns, getfu_factor, provenance
        )
        != 0
    ):
        raise AuthenticSuccessFailure("unit provenance composition rejected")
    return units, logs, tensor, provenance, retry_link, getfu_factor


def _full_relation_provenance(
    resident: Mapping[str, Any], unit_provenance: Sequence[int]
) -> tuple[list[int], list[int]]:
    transform = _integers(
        resident["hnf_hnf_transform"][:225], "resident HNF transform", 225
    )
    provenance = _integers(unit_provenance, "seven-column unit provenance", 14)
    answer = [0] * 30
    for unit in range(2):
        for relation in range(15):
            answer[15 * unit + relation] = sum(
                provenance[7 * unit + kernel] * transform[15 * kernel + relation]
                for kernel in range(7)
            )
    active = _integers(resident["hnf_matbnew"][:120], "active A", 120)
    for unit in range(2):
        for row in range(8):
            if sum(
                active[8 * column + row] * answer[15 * unit + column]
                for column in range(15)
            ):
                raise AuthenticSuccessFailure("unit provenance is not in ker(A)")
    return transform[: 15 * 7], answer


def _candidate(
    class_state: Mapping[str, Any],
    fixture: Mapping[str, Any],
    resident: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "field_id": CONNECTED_FIELD_ID,
        "class_number": "1",
        "invariant_factors": [],
        "active_relation_shape": ["8", "15"],
        "active_relation_matrix": list(class_state["relation"]["entries"]),
        "presentation_shape": ["8", "8"],
        "presentation_matrix": list(class_state["presentation"]["entries"]),
        "transformed_logs": [str(value) for value in fixture["accepted_arch"]],
        "regulator_triplet": [str(value) for value in fixture["regulator"]],
        "expected_unit_rank": "2",
        "equal_bound_state": [str(value) for value in resident["hnf_state"][:9]],
        "acceptance_state": [
            str(value) for value in resident["accept_acceptance_state"]
        ],
    }


def _component_record(component: UnitComponentOutput) -> dict[str, Any]:
    return {
        "run_id": component.run_id,
        "owner_generation": str(component.owner_generation),
        "terminal_status": component.terminal_status,
        "candidate_sha256": component.candidate_sha256,
        "transforms_sha256": component.transforms_sha256,
        "evidence": json.loads(_canonical(component.evidence)),
    }


def _cleanarch_authority(fixture: Mapping[str, Any]) -> dict[str, Any]:
    source = _integers(fixture["accepted_arch"], "cleanarch source", 147)
    scratch = [0] * 147
    output = [0] * 147
    state = [0] * 6
    status = pari_cleanarch_totally_real_cubic(
        source,
        _CLEANARCH_COLUMNS,
        _CLEANARCH_PRECISION,
        [0] * 3,
        [0] * 512,
        [0] * 512,
        [0] * 512,
        [0] * 512,
        [0] * 1024,
        scratch,
        output,
        state,
    )
    retry = [0] * 6
    retry_status = pari_cleanarch_retry_action(
        source, 3 * _CLEANARCH_COLUMNS, _CLEANARCH_PRECISION, retry
    )
    if status != 0 or state[:3] != [0, 7, 7]:
        raise AuthenticSuccessFailure("class-relation cleanarch did not replay")
    if retry_status != 1 or retry != _CLEANARCH_RETRY:
        raise AuthenticSuccessFailure("class-relation cleanarch retry changed")
    return {
        "source": [str(value) for value in source],
        "output": [str(value) for value in output],
        "state": [str(value) for value in state],
        "retry": [str(value) for value in retry],
        "precision": str(_CLEANARCH_PRECISION),
        "columns": str(_CLEANARCH_COLUMNS),
    }


def _torsion_authority() -> dict[str, Any]:
    polynomial = [20034, -20018, 0, 1]
    result = derive_real_cubic_torsion(polynomial)
    replayed = cold_replay_torsion(
        result,
        TorsionReplayAuthority(prepared_polynomial_sha256(polynomial), result.sha256),
    )
    return {
        "envelope": _strict_loads(replayed.canonical_json),
        "sha256": replayed.sha256,
    }


def _regulator_authority(authority: Mapping[str, Any]) -> dict[str, Any]:
    value = _exact_dict(dict(authority), {"envelope", "sha256"}, "regulator authority")
    if _sha256(_canonical(value["envelope"])) != value["sha256"]:
        raise AuthenticSuccessFailure("regulator authority digest changed")
    return json.loads(_canonical(value))


def _cubic_multiply(
    left: Sequence[Fraction], right: Sequence[Fraction]
) -> tuple[Fraction, Fraction, Fraction]:
    product = [Fraction(0)] * 5
    for i in range(3):
        for j in range(3):
            product[i + j] += left[i] * right[j]
    for degree in (4, 3):
        leading = product[degree]
        product[degree] = 0
        product[degree - 3] -= 20034 * leading
        product[degree - 2] += 20018 * leading
    return product[0], product[1], product[2]


def _determinant3(entries: Sequence[Fraction]) -> Fraction:
    return (
        entries[0] * (entries[4] * entries[8] - entries[5] * entries[7])
        - entries[1] * (entries[3] * entries[8] - entries[5] * entries[6])
        + entries[2] * (entries[3] * entries[7] - entries[4] * entries[6])
    )


def _cubic_inverse(value: Sequence[Fraction]) -> tuple[Fraction, Fraction, Fraction]:
    columns = [
        _cubic_multiply(value, basis) for basis in ((1, 0, 0), (0, 1, 0), (0, 0, 1))
    ]
    matrix = [columns[column][row] for row in range(3) for column in range(3)]
    determinant = _determinant3(matrix)
    if determinant == 0:
        raise AuthenticSuccessFailure("principal generator is zero")
    answer = []
    for column in range(3):
        changed = list(matrix)
        for row in range(3):
            changed[3 * row + column] = Fraction(int(row == 0))
        answer.append(_determinant3(changed) / determinant)
    return answer[0], answer[1], answer[2]


def _cubic_power(
    value: Sequence[int], exponent: int
) -> tuple[Fraction, Fraction, Fraction]:
    base = tuple(Fraction(entry) for entry in value)
    if exponent < 0:
        base = _cubic_inverse(base)
        exponent = -exponent
    answer = (Fraction(1), Fraction(0), Fraction(0))
    while exponent:
        if exponent & 1:
            answer = _cubic_multiply(answer, base)
        base = _cubic_multiply(base, base)
        exponent >>= 1
    return answer


def _integral_to_power(coordinates: Sequence[int]) -> list[int]:
    return [
        coordinates[0] - 13345 * coordinates[2],
        coordinates[1] + 2 * coordinates[2],
        coordinates[2],
    ]


def _compose_retry_units(
    integral_factors: Sequence[int], getfu_factor: Sequence[int]
) -> list[int]:
    factors = [
        _integral_to_power(integral_factors[3 * index : 3 * (index + 1)])
        for index in range(2)
    ]
    answer: list[int] = []
    for unit in range(2):
        value = (Fraction(1), Fraction(0), Fraction(0))
        for factor in range(2):
            value = _cubic_multiply(
                value,
                _cubic_power(factors[factor], getfu_factor[2 * unit + factor]),
            )
        if any(coordinate.denominator != 1 for coordinate in value):
            raise AuthenticSuccessFailure("composed retry unit is not integral")
        answer.extend(coordinate.numerator for coordinate in value)
    return answer


def _exact_relation_unit_authority(
    resident: Mapping[str, Any],
    presentation: Mapping[str, Any],
    full_provenance: Sequence[int],
    exact_units: Sequence[int],
) -> dict[str, Any]:
    """Map the active 15-column unit kernel back to all 73 principal rows."""
    cleanup = _integers(
        resident["hnf_transform"][: 73 * 73], "cleanup transform", 73 * 73
    )
    active = _integers(full_provenance, "active unit provenance", 30)
    relation_exponents: list[int] = []
    torsion_signs: list[int] = []
    relations = presentation["relations"]
    for unit_index in range(2):
        coefficients = active[15 * unit_index : 15 * (unit_index + 1)] + [0] * 58
        exponents = [
            sum(
                coefficients[column] * cleanup[73 * column + row]
                for column in range(73)
            )
            for row in range(73)
        ]
        product = (Fraction(1), Fraction(0), Fraction(0))
        for exponent, relation in zip(exponents, relations):
            if exponent:
                alpha = _integers(relation["alpha"], "principal generator", 3)
                # Relation generators use the captured integral basis
                # [1, a, -13345 + 2*a + a^2].
                product = _cubic_multiply(
                    product,
                    _cubic_power(
                        [
                            alpha[0] - 13345 * alpha[2],
                            alpha[1] + 2 * alpha[2],
                            alpha[2],
                        ],
                        exponent,
                    ),
                )
        power_unit = _integral_to_power(
            exact_units[3 * unit_index : 3 * (unit_index + 1)]
        )
        wanted = tuple(Fraction(entry) for entry in power_unit)
        if product == wanted:
            torsion_signs.append(1)
        elif product == tuple(-entry for entry in wanted):
            torsion_signs.append(-1)
        else:
            torsion_signs.append(0)
        relation_exponents.extend(exponents)
    return {
        "cleanup_transform_shape": ["73", "73"],
        "cleanup_transform": [str(value) for value in cleanup],
        "relation_exponent_shape": ["2", "73"],
        "relation_exponents": [str(value) for value in relation_exponents],
        "torsion_signs": [str(value) for value in torsion_signs],
        "selected_exact_units_shape": ["2", "3"],
        "selected_exact_units": [
            str(value)
            for unit_index in range(2)
            for value in _integral_to_power(
                exact_units[3 * unit_index : 3 * (unit_index + 1)]
            )
        ],
        "status": "exact-principal-relation-product-equals-selected-unit-up-to-torsion",
    }


def build_authentic_success_payload(
    resident_output: str | Path,
    fixture_path: str | Path,
    unit_oracle: Mapping[str, Any],
    regulator_authority: Mapping[str, Any],
) -> dict[str, Any]:
    """Execute live class/unit leaves and join their exact correspondence."""
    if not isinstance(unit_oracle, MappingABC):
        raise AuthenticSuccessFailure("unit oracle is not a mapping")
    resident, fixture = _read_inputs(resident_output, fixture_path)
    class_state = _run_relation_and_smith(resident)
    transforms = {
        key: class_state[key]
        for key in (
            "relation",
            "presentation",
            "relation_to_presentation",
            "presentation_to_relation",
            "smith",
            "states",
        )
    }
    candidate = _candidate(class_state, fixture, resident)
    units, logs, tensor, provenance, retry_link, getfu_factor = _unit_retry(
        fixture, unit_oracle
    )
    unit_component = make_real_cubic_unit_component(
        RUN_ID,
        OWNER_GENERATION,
        candidate,
        canonical_component_sha256(transforms),
        units,
        logs,
        tensor,
        provenance,
        7,
        retry_link,
        ((0, 7), (7, 7), (21, 7), (28, 7)),
    )
    kernel_basis, full_provenance = _full_relation_provenance(resident, provenance)
    presentation = capture_presentation_authority(resident_output)
    replay_presentation_authority(presentation)
    relation_unit = capture_unit_relation_authority(
        resident_output,
        Path(fixture_path).with_name(_REGULATOR_FIXTURE),
    )
    replay_unit_relation_authority(relation_unit, presentation)
    composed_retry_units = _compose_retry_units(units, getfu_factor)
    published_units = _integers(
        relation_unit["published_units_power_basis"]["entries"],
        "relation authority units",
        6,
    )
    if composed_retry_units != published_units:
        raise AuthenticSuccessFailure(
            "successful retry units are detached from relation/regulator authority"
        )
    retry_units = {
        "factor_integral_basis_shape": ["2", "3"],
        "factor_integral_basis": [str(value) for value in units],
        "getfu_factor_shape": ["2", "2"],
        "getfu_factor": [str(value) for value in getfu_factor],
        "selected_power_basis_shape": ["2", "3"],
        "selected_power_basis": [str(value) for value in composed_retry_units],
        "relation_authority_orientation": ["1", "-1"],
        "source": "live-pari-2.17.4-unit-oracle",
    }
    authorities = {
        "presentation": presentation,
        "torsion": _torsion_authority(),
        "cleanarch": _cleanarch_authority(fixture),
        "regulator": _regulator_authority(regulator_authority),
        "relation_unit": relation_unit,
        "retry_units": retry_units,
    }
    payload = {
        "source": {
            "field_id": CONNECTED_FIELD_ID,
            "resident_sha256": RESIDENT_SHA256,
            "unit_fixture_sha256": FIXTURE_SHA256,
            "pari_version": "2.17.4",
        },
        "candidate": candidate,
        "transforms": transforms,
        "unit_component": _component_record(unit_component),
        "generators": {"entries": []},
        "buchall": class_state["buchall"],
        "authorities": authorities,
        "correspondence": {
            "status": "cold-replayed-exact-unit-correspondence-live-oracle-blocked",
            "active_relation_shape": ["8", "15"],
            "hnf_kernel_shape": ["15", "7"],
            "hnf_kernel_basis": [str(value) for value in kernel_basis],
            "unit_kernel_provenance_shape": ["2", "7"],
            "unit_kernel_provenance": [str(value) for value in provenance],
            "active_relation_provenance_shape": ["2", "15"],
            "active_relation_provenance": [str(value) for value in full_provenance],
            "equal_bound_honesty": "equal-bound-source-skip",
            "cleanarch_status": "cold-replayed-class-relation-cleanarch",
            "final_driver_status": "not-published",
        },
        "terminal": {
            "status": "authentic-internal-authority-composition-published",
            "phase5_complete": False,
            "public_complete": False,
            "internal_unverified_requirements": list(_INTERNAL_UNVERIFIED_REQUIREMENTS),
            "public_unverified_requirements": list(_PUBLIC_UNVERIFIED_REQUIREMENTS),
        },
    }
    _validate_payload(payload)
    return payload


def _validate_class_state(payload: Mapping[str, Any]) -> None:
    candidate = payload["candidate"]
    transforms = payload["transforms"]
    relation_record = _exact_dict(
        transforms["relation"],
        {"shape", "entries", "accepted_relation_count"},
        "active relation record",
    )
    presentation_record = _exact_dict(
        transforms["presentation"], {"shape", "entries"}, "presentation record"
    )
    r2p_record = _exact_dict(
        transforms["relation_to_presentation"],
        {"shape", "entries"},
        "R2P record",
    )
    p2r_record = _exact_dict(
        transforms["presentation_to_relation"],
        {"shape", "entries"},
        "P2R record",
    )
    if (
        relation_record["shape"] != ["8", "15"]
        or relation_record["accepted_relation_count"] != "73"
        or presentation_record["shape"] != ["8", "8"]
        or r2p_record["shape"] != ["15", "8"]
        or p2r_record["shape"] != ["8", "15"]
    ):
        raise AuthenticSuccessFailure("class witness shape or count changed")
    relation = _integers(candidate["active_relation_matrix"], "active A", 120)
    presentation = _integers(candidate["presentation_matrix"], "active H", 64)
    if candidate["active_relation_shape"] != ["8", "15"]:
        raise AuthenticSuccessFailure("active relation shape changed")
    if candidate["presentation_shape"] != ["8", "8"]:
        raise AuthenticSuccessFailure("active presentation shape changed")
    if relation_record["entries"] != candidate["active_relation_matrix"]:
        raise AuthenticSuccessFailure("candidate and transform relation diverged")
    if presentation_record["entries"] != candidate["presentation_matrix"]:
        raise AuthenticSuccessFailure("candidate and transform presentation diverged")
    r2p = _integers(r2p_record["entries"], "R2P", 120)
    p2r = _integers(p2r_record["entries"], "P2R", 120)
    if _column_product(relation, 8, 15, r2p, 8) != presentation:
        raise AuthenticSuccessFailure("A*R2P != H")
    if _column_product(presentation, 8, 8, p2r, 15) != relation:
        raise AuthenticSuccessFailure("H*P2R != A")
    smith = _exact_dict(
        transforms["smith"],
        {
            "diagonal",
            "left",
            "left_inverse",
            "right",
            "right_inverse",
            "invariants",
            "class_number",
        },
        "Smith record",
    )
    left = _integers(smith["left"], "Smith U", 64)
    left_inverse = _integers(smith["left_inverse"], "Smith Ui", 64)
    right = _integers(smith["right"], "Smith V", 64)
    right_inverse = _integers(smith["right_inverse"], "Smith Vi", 64)
    identity = _identity(8)
    if (
        _integers(smith["diagonal"], "Smith D", 64) != identity
        or smith["invariants"] != []
        or smith["class_number"] != "1"
        or _column_product(left, 8, 8, left_inverse, 8) != identity
        or _column_product(left_inverse, 8, 8, left, 8) != identity
        or _column_product(right, 8, 8, right_inverse, 8) != identity
        or _column_product(right_inverse, 8, 8, right, 8) != identity
        or _column_product(_column_product(left, 8, 8, presentation, 8), 8, 8, right, 8)
        != identity
    ):
        raise AuthenticSuccessFailure("Smith witnesses changed")
    if transforms["states"] != {
        "witness": ["0", "8", "15", "7", "120", "450", "120", "120"],
        "smith": ["0", "0", "0", "0", "0", "0", "192"],
    }:
        raise AuthenticSuccessFailure("class checker states changed")


def _validate_authorities(value: Mapping[str, Any]) -> None:
    authorities = _exact_dict(
        value["authorities"],
        {
            "presentation",
            "torsion",
            "cleanarch",
            "regulator",
            "relation_unit",
            "retry_units",
        },
        "independent authorities",
    )
    presentation = authorities["presentation"]
    replay_presentation_authority(presentation)
    hnf = presentation["hnf"]
    candidate = value["candidate"]
    correspondence = value["correspondence"]
    if hnf["active_relation"] != candidate["active_relation_matrix"]:
        raise AuthenticSuccessFailure("presentation authority is detached from A")
    if hnf["full_hnf"][56:] != candidate["presentation_matrix"]:
        raise AuthenticSuccessFailure("presentation authority is detached from H")
    if hnf["transform"][:105] != correspondence["hnf_kernel_basis"]:
        raise AuthenticSuccessFailure("presentation authority is detached from ker(A)")
    if hnf["transformed_logs"][:147] != candidate["transformed_logs"]:
        raise AuthenticSuccessFailure("presentation authority is detached from logs")

    torsion = _exact_dict(
        authorities["torsion"], {"envelope", "sha256"}, "torsion authority"
    )
    torsion_raw = _canonical(torsion["envelope"])
    replayed_torsion = cold_replay_torsion(
        torsion_raw,
        TorsionReplayAuthority(
            prepared_polynomial_sha256([20034, -20018, 0, 1]),
            str(torsion["sha256"]),
        ),
    )
    if replayed_torsion.sha256 != torsion["sha256"]:
        raise AuthenticSuccessFailure("torsion authority digest changed")
    torsion_payload = torsion["envelope"]["payload"]["torsion"]
    evidence = value["unit_component"]["evidence"]
    if (
        torsion_payload["order"] != evidence["torsion_order"]
        or torsion_payload["generator_power_basis"] != evidence["torsion_coordinates"]
        or torsion_payload["generator_norm"] != evidence["torsion_norm"]
    ):
        raise AuthenticSuccessFailure("torsion authority is detached from unit output")

    cleanarch = _exact_dict(
        authorities["cleanarch"],
        {"source", "output", "state", "retry", "precision", "columns"},
        "cleanarch authority",
    )
    source = _integers(cleanarch["source"], "cleanarch source", 147)
    expected = _integers(cleanarch["output"], "cleanarch output", 147)
    if source != _integers(candidate["transformed_logs"], "candidate logs", 147):
        raise AuthenticSuccessFailure("cleanarch source is detached from candidate")
    if cleanarch["precision"] != "192" or cleanarch["columns"] != "7":
        raise AuthenticSuccessFailure("cleanarch dimensions changed")
    scratch, output, state = [0] * 147, [0] * 147, [0] * 6
    if (
        pari_cleanarch_totally_real_cubic(
            source,
            7,
            192,
            [0] * 3,
            [0] * 512,
            [0] * 512,
            [0] * 512,
            [0] * 512,
            [0] * 1024,
            scratch,
            output,
            state,
        )
        != 0
        or output != expected
        or state != _integers(cleanarch["state"], "cleanarch state", 6)
    ):
        raise AuthenticSuccessFailure("cleanarch authority did not replay")
    retry = [0] * 6
    if pari_cleanarch_retry_action(source, 21, 192, retry) != 1 or retry != _integers(
        cleanarch["retry"], "cleanarch retry", 6
    ):
        raise AuthenticSuccessFailure("cleanarch retry authority did not replay")

    regulator = _exact_dict(
        authorities["regulator"], {"envelope", "sha256"}, "regulator authority"
    )
    regulator_raw = _canonical(regulator["envelope"])
    if _sha256(regulator_raw) != regulator["sha256"]:
        raise AuthenticSuccessFailure("regulator authority digest changed")
    regulator_payload = regulator["envelope"].get("payload")
    if not isinstance(regulator_payload, dict):
        raise AuthenticSuccessFailure("regulator payload is absent")
    if regulator_payload["evidence"]["exact_unit_norms"] != evidence["claimed_norms"]:
        raise AuthenticSuccessFailure("regulator authority is detached from unit norms")
    if not regulator_payload["evidence"]["regulator"]["rigorous"]:
        raise AuthenticSuccessFailure("regulator authority is not rigorous")

    relation_unit = authorities["relation_unit"]
    replay_unit_relation_authority(relation_unit, presentation)
    rigorous_units = regulator_payload["inputs"]["exact_units_power_coordinates"]
    if relation_unit["published_units_power_basis"]["entries"] != [
        str(entry) for row in rigorous_units for entry in row
    ]:
        raise AuthenticSuccessFailure(
            "relation units are detached from regulator units"
        )

    retry_units = _exact_dict(
        authorities["retry_units"],
        {
            "factor_integral_basis_shape",
            "factor_integral_basis",
            "getfu_factor_shape",
            "getfu_factor",
            "selected_power_basis_shape",
            "selected_power_basis",
            "relation_authority_orientation",
            "source",
        },
        "retry-unit link",
    )
    if (
        retry_units["factor_integral_basis_shape"] != ["2", "3"]
        or retry_units["getfu_factor_shape"] != ["2", "2"]
        or retry_units["selected_power_basis_shape"] != ["2", "3"]
        or retry_units["source"] != "live-pari-2.17.4-unit-oracle"
    ):
        raise AuthenticSuccessFailure("retry-unit link shape changed")
    retry_factors = _integers(retry_units["factor_integral_basis"], "retry factors", 6)
    retry_factor = _integers(retry_units["getfu_factor"], "getfu factor", 4)
    selected = _integers(retry_units["selected_power_basis"], "selected units", 6)
    orientation = _integers(
        retry_units["relation_authority_orientation"],
        "relation-authority orientation",
        2,
    )
    if orientation != [1, -1]:
        raise AuthenticSuccessFailure("relation-authority orientation changed")
    component_kernel = _integers(
        correspondence["unit_kernel_provenance"], "component kernel provenance", 14
    )
    authority_kernel = _integers(
        relation_unit["unit_kernel_provenance"]["entries"],
        "authority kernel provenance",
        14,
    )
    component_active = _integers(
        correspondence["active_relation_provenance"], "component active provenance", 30
    )
    authority_active = _integers(
        relation_unit["active_relation_provenance"]["entries"],
        "authority active provenance",
        30,
    )
    if authority_kernel != [
        orientation[unit] * component_kernel[7 * unit + column]
        for unit in range(2)
        for column in range(7)
    ]:
        raise AuthenticSuccessFailure("relation authority kernel provenance changed")
    if authority_active != [
        orientation[unit] * component_active[15 * unit + column]
        for unit in range(2)
        for column in range(15)
    ]:
        raise AuthenticSuccessFailure("relation authority active provenance changed")
    if _compose_retry_units(retry_factors, retry_factor) != selected:
        raise AuthenticSuccessFailure("retry-unit composition changed")
    if selected != _integers(
        relation_unit["published_units_power_basis"]["entries"],
        "published authority units",
        6,
    ):
        raise AuthenticSuccessFailure("retry units are detached from rigorous units")


def _validate_payload_unchecked(payload: Any) -> None:
    value = _exact_dict(
        payload,
        {
            "source",
            "candidate",
            "transforms",
            "unit_component",
            "generators",
            "buchall",
            "authorities",
            "correspondence",
            "terminal",
        },
        "success payload",
    )
    if value["source"] != {
        "field_id": CONNECTED_FIELD_ID,
        "resident_sha256": RESIDENT_SHA256,
        "unit_fixture_sha256": FIXTURE_SHA256,
        "pari_version": "2.17.4",
    }:
        raise AuthenticSuccessFailure("source authority changed")
    candidate = _exact_dict(
        value["candidate"],
        {
            "field_id",
            "class_number",
            "invariant_factors",
            "active_relation_shape",
            "active_relation_matrix",
            "presentation_shape",
            "presentation_matrix",
            "transformed_logs",
            "regulator_triplet",
            "expected_unit_rank",
            "equal_bound_state",
            "acceptance_state",
        },
        "candidate",
    )
    if (
        candidate["field_id"] != CONNECTED_FIELD_ID
        or candidate["class_number"] != "1"
        or candidate["invariant_factors"] != []
        or candidate["expected_unit_rank"] != "2"
        or candidate["equal_bound_state"]
        != ["0", "7", "66", "0", "7", "8", "0", "73", "0"]
        or candidate["acceptance_state"] != ["2", "0", "0"]
    ):
        raise AuthenticSuccessFailure("candidate terminal state changed")
    _integers(candidate["transformed_logs"], "candidate transformed logs", 147)
    regulator = _integers(candidate["regulator_triplet"], "candidate regulator", 3)
    if regulator[0] <= 0 or regulator[1] != 192:
        raise AuthenticSuccessFailure("candidate regulator changed")
    transforms = _exact_dict(
        value["transforms"],
        {
            "relation",
            "presentation",
            "relation_to_presentation",
            "presentation_to_relation",
            "smith",
            "states",
        },
        "transforms",
    )
    _validate_class_state(value)
    if value["generators"] != {"entries": []}:
        raise AuthenticSuccessFailure("trivial class group gained a generator")
    try:
        if snapshot_final_source_state(value["buchall"]) != value["buchall"]:
            raise AuthenticSuccessFailure("Buchall arrays are noncanonical")
    except AssemblyFailure as error:
        raise AuthenticSuccessFailure("Buchall arrays are invalid") from error
    component = _exact_dict(
        value["unit_component"],
        {
            "run_id",
            "owner_generation",
            "terminal_status",
            "candidate_sha256",
            "transforms_sha256",
            "evidence",
        },
        "unit component",
    )
    if (
        component["run_id"] != RUN_ID
        or component["owner_generation"] != str(OWNER_GENERATION)
        or component["terminal_status"] != "getfu-and-cleanarch-complete"
        or component["candidate_sha256"] != canonical_component_sha256(candidate)
        or component["transforms_sha256"] != canonical_component_sha256(transforms)
    ):
        raise AuthenticSuccessFailure("unit component provenance changed")
    try:
        if (
            _validate_linked_units(component["evidence"], candidate)
            != component["evidence"]
        ):
            raise AuthenticSuccessFailure("unit evidence is noncanonical")
    except AssemblyFailure as error:
        raise AuthenticSuccessFailure("unit evidence replay failed") from error
    correspondence = _exact_dict(
        value["correspondence"],
        {
            "status",
            "active_relation_shape",
            "hnf_kernel_shape",
            "hnf_kernel_basis",
            "unit_kernel_provenance_shape",
            "unit_kernel_provenance",
            "active_relation_provenance_shape",
            "active_relation_provenance",
            "equal_bound_honesty",
            "cleanarch_status",
            "final_driver_status",
        },
        "correspondence",
    )
    fixed = {
        "status": "cold-replayed-exact-unit-correspondence-live-oracle-blocked",
        "active_relation_shape": ["8", "15"],
        "hnf_kernel_shape": ["15", "7"],
        "unit_kernel_provenance_shape": ["2", "7"],
        "active_relation_provenance_shape": ["2", "15"],
        "equal_bound_honesty": "equal-bound-source-skip",
        "cleanarch_status": "cold-replayed-class-relation-cleanarch",
        "final_driver_status": "not-published",
    }
    if any(correspondence[name] != wanted for name, wanted in fixed.items()):
        raise AuthenticSuccessFailure("correspondence status or shape changed")
    kernel = _integers(correspondence["hnf_kernel_basis"], "HNF kernel", 105)
    unit_kernel = _integers(
        correspondence["unit_kernel_provenance"], "kernel provenance", 14
    )
    full = _integers(
        correspondence["active_relation_provenance"], "active provenance", 30
    )
    relation = _integers(candidate["active_relation_matrix"], "active A", 120)
    if _column_product(relation, 8, 15, kernel, 7) != [0] * 56:
        raise AuthenticSuccessFailure("published HNF kernel is not in ker(A)")
    expected_full = [
        sum(
            unit_kernel[7 * unit + index] * kernel[15 * index + relation_index]
            for index in range(7)
        )
        for unit in range(2)
        for relation_index in range(15)
    ]
    if full != expected_full:
        raise AuthenticSuccessFailure("active provenance is detached from HNF kernel")
    for unit in range(2):
        for row in range(8):
            if sum(
                relation[8 * column + row] * full[15 * unit + column]
                for column in range(15)
            ):
                raise AuthenticSuccessFailure("unit provenance left ker(A)")
    _validate_authorities(value)
    if value["terminal"] != {
        "status": "authentic-internal-authority-composition-published",
        "phase5_complete": False,
        "public_complete": False,
        "internal_unverified_requirements": list(_INTERNAL_UNVERIFIED_REQUIREMENTS),
        "public_unverified_requirements": list(_PUBLIC_UNVERIFIED_REQUIREMENTS),
    }:
        raise AuthenticSuccessFailure("terminal claim changed")


def _validate_payload(payload: Any) -> None:
    try:
        _validate_payload_unchecked(payload)
    except AuthenticSuccessFailure:
        raise
    except (IndexError, KeyError, TypeError, ValueError, ArithmeticError) as error:
        raise AuthenticSuccessFailure(
            "success payload is structurally invalid"
        ) from error


class AuthenticSuccessPublisher:
    """Publish one authentic correspondence atomically and idempotently."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._published: ImmutableAuthenticSuccess | None = None

    def publish(self, payload: Mapping[str, Any]) -> ImmutableAuthenticSuccess:
        detached = json.loads(_canonical(payload))
        _validate_payload(detached)
        payload_raw = _canonical(detached)
        envelope = {
            "schema": SUCCESS_SCHEMA,
            "payload": detached,
            "payload_sha256": _sha256(payload_raw),
        }
        raw = _canonical(envelope)
        result = ImmutableAuthenticSuccess(raw, _sha256(raw))
        with self._lock:
            if self._published is None:
                self._published = result
            elif self._published != result:
                raise AuthenticSuccessConflict(
                    "a different authentic correspondence is already published"
                )
            return self._published

    def current(self) -> ImmutableAuthenticSuccess | None:
        with self._lock:
            return self._published


def cold_replay_authentic_success(
    raw: bytes | str | ImmutableAuthenticSuccess,
    authority: AuthenticSuccessAuthority,
) -> ImmutableAuthenticSuccess:
    """Replay detached correspondence under an out-of-band publication hash."""
    encoded = raw.canonical_json if isinstance(raw, ImmutableAuthenticSuccess) else raw
    envelope = _strict_loads(encoded)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise AuthenticSuccessFailure("success envelope has the wrong fields")
    if envelope["schema"] != SUCCESS_SCHEMA:
        raise AuthenticSuccessFailure("success schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise AuthenticSuccessFailure("success payload hash changed")
    _validate_payload(envelope["payload"])
    canonical = _canonical(envelope)
    digest = _sha256(canonical)
    if digest != authority.expected_sha256:
        raise AuthenticSuccessFailure("success publication is not authorized")
    return ImmutableAuthenticSuccess(canonical, digest)


__all__ = [
    "AuthenticSuccessAuthority",
    "AuthenticSuccessConflict",
    "AuthenticSuccessFailure",
    "AuthenticSuccessPublisher",
    "CONNECTED_FIELD_ID",
    "ImmutableAuthenticSuccess",
    "OWNER_GENERATION",
    "RUN_ID",
    "SUCCESS_SCHEMA",
    "build_authentic_success_payload",
    "cold_replay_authentic_success",
]
