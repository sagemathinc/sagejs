"""Bind the trivial class state directly to live presentation/Smith owners.

The exact leaf proves that the live square presentation has Smith quotient
zero.  The host adapter then publishes the ordinary final-state generator
component with genuinely empty generator and order-witness lists.  The one
remaining mathematical step -- that PARI's selected factor base generates the
full ideal class group -- is recorded as an upstream assumption and is never
accepted as a computation input.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .class_group_final_state import (
    ClassGeneratorComponentOutput,
    TransformComponentOutput,
    canonical_component_sha256,
)


SCHEMA = "sagejs.pari-class-group/live-h1-class-binding-v1"
ASSUMPTION_SCHEMA = "sagejs.pari-class-group/upstream-class-assumptions-v1"
PROOF_TIER = "upstream-assumed-pari-correspondence"
UPSTREAM_ASSUMPTIONS = (
    "PARI-2.17.4 prepared maximal-order state is assumed correct",
    "PARI-2.17.4 selected factor-base ideals generate the full ideal class group",
    "PARI-2.17.4 factor-bound, honesty, and analytic-index policy is assumed correct",
    "GRH plus upstream undocumented bounds and heuristics is assumed",
)
PUBLIC_GAPS = (
    "certified-maximal-order-authority",
    "proved-factor-base-generation-bound",
    "replayable-global-class-saturation-record",
    "completed-public-proof-stage-and-theorem-payload",
)


class LiveH1ClassBindingFailure(ValueError):
    """A live presentation/Smith owner failed exact binding."""


@native
def pari_bind_live_h1_class_state(
    presentation: IntegerBuffer,
    dimension: int,
    smith: IntegerBuffer,
    left: IntegerBuffer,
    left_inverse: IntegerBuffer,
    right: IntegerBuffer,
    right_inverse: IntegerBuffer,
    smith_state: Int64Buffer,
    binding_state: Int64Buffer,
) -> int:
    """Prove the live Smith quotient is trivial and publish its class state.

    All matrices use column-major storage.  `binding_state` is status,
    dimension, checked presentation cells, checked Smith cells, checked
    transform/inverse product cells, non-unit invariant count, class number,
    class-generator count, and generator-order-witness count.  It is changed
    only after every exact identity has succeeded.
    """
    n = dimension
    if n < 1:
        raise ValueError("invalid live Smith dimension")
    size = n * n
    if (
        len(presentation) < size
        or len(smith) < size
        or len(left) < size
        or len(left_inverse) < size
        or len(right) < size
        or len(right_inverse) < size
        or len(smith_state) < 7
        or len(binding_state) < 9
    ):
        raise ValueError("short live h1 class owner")
    if smith_state[0] != 0 or smith_state[1] != 0 or smith_state[6] != 3 * size:
        return -1

    for column in range(n):
        for row in range(n):
            expected = 0
            if row == column:
                expected = 1
            if smith[column * n + row] != expected:
                return -1

            left_product = 0
            left_reverse = 0
            right_product = 0
            right_reverse = 0
            transformed = 0
            for k in range(n):
                left_product += left[k * n + row] * left_inverse[column * n + k]
                left_reverse += left_inverse[k * n + row] * left[column * n + k]
                right_product += right[k * n + row] * right_inverse[column * n + k]
                right_reverse += right_inverse[k * n + row] * right[column * n + k]
                for j in range(n):
                    transformed += (
                        left[k * n + row]
                        * presentation[j * n + k]
                        * right[column * n + j]
                    )
            if (
                left_product != expected
                or left_reverse != expected
                or right_product != expected
                or right_reverse != expected
                or transformed != expected
            ):
                return -1

    binding_state[0] = 0
    binding_state[1] = n
    binding_state[2] = size
    binding_state[3] = size
    binding_state[4] = 5 * size
    binding_state[5] = 0
    binding_state[6] = 1
    binding_state[7] = 0
    binding_state[8] = 0
    return 0


@dataclass(frozen=True)
class LiveH1ClassBinding:
    """Final internal class state plus its explicit proof boundary."""

    schema: str
    assumption_schema: str
    proof_tier: str
    upstream_assumptions: tuple[str, ...]
    owner_sha256: str
    native_state: tuple[str, ...]
    class_generators: ClassGeneratorComponentOutput
    class_correspondence_complete: bool
    public_class_complete: bool
    public_class_unit_complete: bool
    unverified_public_requirements: tuple[str, ...]


def _canonical(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise LiveH1ClassBindingFailure(
            "class binding is not canonical JSON"
        ) from error


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _integers(values: Sequence[Any], length: int, name: str) -> list[int]:
    if isinstance(values, (str, bytes)) or len(values) != length:
        raise LiveH1ClassBindingFailure(name + " has the wrong exact shape")
    answer: list[int] = []
    for value in values:
        if isinstance(value, bool):
            raise LiveH1ClassBindingFailure(name + " contains a boolean")
        try:
            integer = int(value)
        except (TypeError, ValueError, OverflowError) as error:
            raise LiveH1ClassBindingFailure(name + " contains a non-integer") from error
        if integer != value:
            raise LiveH1ClassBindingFailure(name + " contains a non-integer")
        answer.append(integer)
    return answer


def _row_major(values: Sequence[int], dimension: int) -> list[str]:
    return [
        str(values[column * dimension + row])
        for row in range(dimension)
        for column in range(dimension)
    ]


def _digest(value: Any, name: str) -> str:
    digest = str(value)
    if len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest):
        raise LiveH1ClassBindingFailure(name + " is not a SHA-256 digest")
    return digest


def _owner_snapshot(
    dimension: int,
    presentation: Sequence[Any],
    smith: Sequence[Any],
    left: Sequence[Any],
    left_inverse: Sequence[Any],
    right: Sequence[Any],
    right_inverse: Sequence[Any],
    smith_state: Sequence[Any],
) -> dict[str, Any]:
    size = dimension * dimension
    return {
        "dimension": str(dimension),
        "presentation": [
            str(value) for value in _integers(presentation, size, "presentation")
        ],
        "smith": [str(value) for value in _integers(smith, size, "Smith diagonal")],
        "left": [str(value) for value in _integers(left, size, "left transform")],
        "left_inverse": [
            str(value) for value in _integers(left_inverse, size, "left inverse")
        ],
        "right": [str(value) for value in _integers(right, size, "right transform")],
        "right_inverse": [
            str(value) for value in _integers(right_inverse, size, "right inverse")
        ],
        "smith_state": [
            str(value) for value in _integers(smith_state, 7, "Smith state")
        ],
    }


def build_live_h1_class_binding(
    transforms: TransformComponentOutput,
    *,
    presentation: Sequence[Any],
    smith: Sequence[Any],
    left: Sequence[Any],
    left_inverse: Sequence[Any],
    right: Sequence[Any],
    right_inverse: Sequence[Any],
    smith_state: Sequence[Any],
) -> LiveH1ClassBinding:
    """Build the final trivial-class component from live exact owners only."""
    if type(transforms) is not TransformComponentOutput:
        raise LiveH1ClassBindingFailure("Smith transform component is absent")
    if transforms.terminal_status != "smith-and-hnf-complete":
        raise LiveH1ClassBindingFailure("Smith transform component is not terminal")
    if transforms.owner_generation < 0 or not transforms.run_id:
        raise LiveH1ClassBindingFailure("Smith transform provenance is invalid")
    candidate_sha256 = _digest(transforms.candidate_sha256, "candidate fingerprint")
    transform_sha256 = canonical_component_sha256(transforms.evidence)
    _digest(transform_sha256, "transform fingerprint")

    try:
        dimension = int(transforms.evidence["shape"][0])
        if transforms.evidence["shape"] != [str(dimension), str(dimension)]:
            raise LiveH1ClassBindingFailure("Smith transform shape is not square")
    except (KeyError, TypeError, ValueError, IndexError) as error:
        if isinstance(error, LiveH1ClassBindingFailure):
            raise
        raise LiveH1ClassBindingFailure("Smith transform shape is missing") from error
    if dimension < 1:
        raise LiveH1ClassBindingFailure("Smith transform dimension is invalid")

    owner = _owner_snapshot(
        dimension,
        presentation,
        smith,
        left,
        left_inverse,
        right,
        right_inverse,
        smith_state,
    )
    exact = {
        name: [int(value) for value in owner[name]]
        for name in (
            "presentation",
            "smith",
            "left",
            "left_inverse",
            "right",
            "right_inverse",
        )
    }
    expected_evidence = {
        "presentation": _row_major(exact["presentation"], dimension),
        "diagonal": _row_major(exact["smith"], dimension),
        "left": _row_major(exact["left"], dimension),
        "left_inverse": _row_major(exact["left_inverse"], dimension),
        "right": _row_major(exact["right"], dimension),
        "right_inverse": _row_major(exact["right_inverse"], dimension),
    }
    for name, expected in expected_evidence.items():
        if transforms.evidence.get(name) != expected:
            raise LiveH1ClassBindingFailure(name + " is detached from its live owner")

    binding_state = [77] * 9
    if (
        pari_bind_live_h1_class_state(
            exact["presentation"],
            dimension,
            exact["smith"],
            exact["left"],
            exact["left_inverse"],
            exact["right"],
            exact["right_inverse"],
            [int(value) for value in owner["smith_state"]],
            binding_state,
        )
        != 0
    ):
        raise LiveH1ClassBindingFailure(
            "live presentation does not have trivial quotient"
        )
    component = ClassGeneratorComponentOutput(
        transforms.run_id,
        transforms.owner_generation,
        "class-group-gen-complete",
        candidate_sha256,
        transform_sha256,
        {"entries": []},
    )
    return LiveH1ClassBinding(
        SCHEMA,
        ASSUMPTION_SCHEMA,
        PROOF_TIER,
        UPSTREAM_ASSUMPTIONS,
        _sha256(owner),
        tuple(str(value) for value in binding_state),
        component,
        True,
        False,
        False,
        PUBLIC_GAPS,
    )


def detached_live_h1_class_binding(binding: LiveH1ClassBinding) -> dict[str, Any]:
    """Return canonical detached material for mutation tests and receipts."""
    if type(binding) is not LiveH1ClassBinding:
        raise LiveH1ClassBindingFailure("class binding has the wrong type")
    value = asdict(binding)
    value["upstream_assumptions"] = list(binding.upstream_assumptions)
    value["native_state"] = list(binding.native_state)
    value["unverified_public_requirements"] = list(
        binding.unverified_public_requirements
    )
    return value


def replay_live_h1_class_binding(
    payload: Mapping[str, Any],
    transforms: TransformComponentOutput,
    *,
    presentation: Sequence[Any],
    smith: Sequence[Any],
    left: Sequence[Any],
    left_inverse: Sequence[Any],
    right: Sequence[Any],
    right_inverse: Sequence[Any],
    smith_state: Sequence[Any],
) -> LiveH1ClassBinding:
    """Rebind detached state to the current live owners and reject drift."""
    expected = build_live_h1_class_binding(
        transforms,
        presentation=presentation,
        smith=smith,
        left=left,
        left_inverse=left_inverse,
        right=right,
        right_inverse=right_inverse,
        smith_state=smith_state,
    )
    if not isinstance(payload, Mapping) or dict(
        payload
    ) != detached_live_h1_class_binding(expected):
        raise LiveH1ClassBindingFailure("detached live h1 class binding changed")
    return expected


__all__ = [
    "ASSUMPTION_SCHEMA",
    "LiveH1ClassBinding",
    "LiveH1ClassBindingFailure",
    "PUBLIC_GAPS",
    "PROOF_TIER",
    "SCHEMA",
    "UPSTREAM_ASSUMPTIONS",
    "build_live_h1_class_binding",
    "detached_live_h1_class_binding",
    "pari_bind_live_h1_class_state",
    "replay_live_h1_class_binding",
]
