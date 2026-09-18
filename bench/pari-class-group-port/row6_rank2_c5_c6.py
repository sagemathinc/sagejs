"""Totally-real cubic C5/C6 suffix for prepared panel row 6.

This is a row-specific authenticated adapter around the reusable cubic unit
bridge.  It deliberately stops at PARI's flag-zero `not_given(LARGE)`
boundary while retaining the exact seven-by-two factored-unit transform.
"""

from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from .unit_bridge_cubic import (
    pari_cubic_getfu_factor_rank_two,
    pari_cubic_unit_bridge_prepare,
    pari_cubic_unit_compose_provenance,
)
from .unit_reconstruction_signed import pari_getfu_signed_real_cubic


OUTPUT_SCHEMA = "sagejs.pari-class-group/row6-rank2-c5-c6-v1"
GATE_SCHEMA = "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1"
POST_SCHEMA = "sagejs.pari-class-group/row6-post1137-terminal-v1"
UNIT_COLUMNS = 7
PRECISION = 192


class Row6Rank2Failure(ValueError):
    """The authenticated row-6 unit suffix failed closed."""


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row6Rank2Failure(label + " is not an object")
    return value


def _integers(value: Any, length: int, label: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise Row6Rank2Failure(label + " has the wrong shape")
    result = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row6Rank2Failure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row6Rank2Failure(label + " is not canonical integer data")
        result.append(number)
    return result


def _zeros(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def _sha(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()


def _semantic_sha(value: Any) -> str:
    projected = copy.deepcopy(value)
    projected.pop("ownerSha256", None)
    execution = projected.get("execution")
    if isinstance(execution, dict):
        execution.pop("elapsedNs", None)
        execution.pop("maxRssKiB", None)
    return _sha(projected)


def _embedding(prepared: Mapping[str, Any]) -> list[int]:
    # Prepared storage is place-major; getfu expects column-major 3 by 3.
    source = _integers(prepared.get("preparation_embedding"), 27, "prepared embedding")
    output = _zeros(27)
    for basis in range(3):
        for place in range(3):
            output[3 * (3 * basis + place) : 3 * (3 * basis + place) + 3] = source[
                3 * (3 * place + basis) : 3 * (3 * place + basis) + 3
            ]
    return output


def _prepare(
    accepted_arch: list[int],
    accepted_signs: list[int],
    phase_pi: list[int],
    lattice: list[int],
    regulator: list[int],
) -> dict[str, Any]:
    # HNF additions retain correct multiples of pi, but row 6 reaches
    # coefficients beyond 2**53.  Re-materialize the independently replayed
    # F_2 sign image as bounded 0/pi representatives before the cubic bridge.
    accepted_arch = list(accepted_arch)
    for column in range(UNIT_COLUMNS):
        for place in range(3):
            at = 21 * column + 7 * place + 4
            accepted_arch[at : at + 3] = (
                phase_pi if accepted_signs[3 * column + place] else [0, -1, 0]
            )
    c, square = UNIT_COLUMNS, UNIT_COLUMNS * UNIT_COLUMNS
    args = [
        accepted_arch,
        lattice,
        c,
        regulator,
        _zeros(2 * c),
        _zeros(4),
        _zeros(2 * c),
        _zeros(42),
        _zeros(18),
        _zeros(42),
        _zeros(18),
        _zeros(6),
        _zeros(5),
        _floats(5),
        _zeros(5),
        _zeros(2 * c),
        _zeros(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(c),
        _zeros(c),
        _floats(2 * c),
        _floats(square),
        _zeros(c),
        _zeros(c),
        _zeros(c),
        _floats(c),
        _floats(c),
        _floats(c),
        _zeros(c),
        _zeros(6),
        _zeros(3),
        _zeros(6),
        _zeros(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(2),
        _zeros(2),
        _floats(6),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(3),
        _floats(3),
        _floats(3),
        _floats(3),
        _zeros(3),
        _zeros(2),
    ]
    status = pari_cubic_unit_bridge_prepare(*args)
    if status != 0 or args[12] != [0, 0, 0, 2, 7]:
        raise Row6Rank2Failure("cubic unit bridge failed: " + str(args[12]))
    return {
        "u": args[6],
        "clean": args[10],
        "phases": args[11],
        "state": args[12],
        "trace": args[13],
    }


def _factor(clean: list[int]) -> tuple[list[int], list[int]]:
    args = [
        clean,
        _zeros(4),
        _zeros(18),
        _zeros(6),
        _zeros(4),
        _zeros(2),
        _floats(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(2),
        _zeros(2),
        _floats(6),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(2),
        _floats(3),
        _floats(3),
        _zeros(4),
    ]
    if pari_cubic_getfu_factor_rank_two(*args) != 0:
        raise Row6Rank2Failure("cubic getfu factor failed: " + str(args[5]))
    return args[1], args[5]


def _getfu(
    clean: list[int], phases: list[int], factor: list[int], prepared: Mapping[str, Any]
) -> tuple[int, list[int]]:
    args = [
        clean,
        phases,
        factor,
        _embedding(prepared),
        _integers(prepared.get("basis_table"), 27, "multiplication tensor"),
        PRECISION,
        PRECISION,
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(6),
        _zeros(18),
        _zeros(27),
        _zeros(18),
        _zeros(18),
        _zeros(6),
        _zeros(9),
        _zeros(3),
        _zeros(6),
        _zeros(4),
        _zeros(6),
        _zeros(18),
        _zeros(6),
        _zeros(4),
        _zeros(8),
        _zeros(3),
        _zeros(64),
        _zeros(64),
        _zeros(64),
        _zeros(64),
        _zeros(64),
        _zeros(128),
    ]
    status = pari_getfu_signed_real_cubic(*args)
    if status != 2 or args[24][0] != 2:
        raise Row6Rank2Failure("row-6 getfu did not return LARGE: " + str(args[24]))
    if any(
        args[index] != _zeros(length)
        for index, length in ((20, 6), (21, 18), (22, 6), (23, 4))
    ):
        raise Row6Rank2Failure("LARGE getfu published expanded output")
    return status, args[24]


def compose_row6_rank2_c5_c6(
    gate: Mapping[str, Any],
    post: Mapping[str, Any],
    metadata_receipt: Mapping[str, Any],
    ancestry: Mapping[str, Any],
) -> dict[str, Any]:
    gate, post = _mapping(gate, "gate owner"), _mapping(post, "post1137 owner")
    metadata_receipt, ancestry = (
        _mapping(metadata_receipt, "metadata receipt"),
        _mapping(ancestry, "ancestry"),
    )
    if (
        gate.get("schema") != GATE_SCHEMA
        or post.get("schema") != POST_SCHEMA
        or post.get("status") != 0
    ):
        raise Row6Rank2Failure("wrong or unsuccessful input owner")
    gate_sha = _semantic_sha(gate)
    if ancestry.get("gateOwnerSha256") != gate_sha or post.get(
        "gateOwnerSha256"
    ) != ancestry.get("gateContentSha256"):
        raise Row6Rank2Failure("gate ancestry changed")
    metadata = _mapping(metadata_receipt.get("metadata", metadata_receipt), "metadata")
    metadata_sha = _sha(metadata)
    if ancestry.get("metadataSha256") != metadata_sha:
        raise Row6Rank2Failure("metadata ancestry changed")
    if (
        ancestry.get("sourceSha256")
        != hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    ):
        raise Row6Rank2Failure("unit source ancestry changed")
    # Unlike the mixed-quartic rows, the first seven physical C columns are
    # not the seven unit-kernel columns for row 6.  The exact-image ancestry
    # owner must therefore publish the selected logarithm image explicitly;
    # silently taking a physical prefix fails PARI's real-sign test.
    accepted_arch_data = ancestry.get("acceptedArch", ancestry.get("unitAcceptedArch"))
    accepted_arch = _integers(accepted_arch_data, 147, "ancestry accepted unit logs")
    accepted_signs = _integers(ancestry.get("acceptedSigns"), 21, "accepted signs")
    if any(value not in (0, 1) for value in accepted_signs):
        raise Row6Rank2Failure("accepted signs are not bits")
    phase_pi = _integers(ancestry.get("phasePi"), 3, "packed pi")
    if (
        ancestry.get("acceptedArchSha256")
        != _sha([str(value) for value in accepted_arch])
        or ancestry.get("acceptedSignsSha256") != _sha(accepted_signs)
        or ancestry.get("phasePiSha256") != _sha([str(value) for value in phase_pi])
    ):
        raise Row6Rank2Failure("unit ancestry digest changed")
    lattice = _integers(post.get("unitRelations"), 14, "unit relations")
    regulator = _integers(post.get("regulator"), 3, "regulator")
    if (
        post.get("unitRelationsSha256")
        != hashlib.sha256(
            json.dumps([str(x) for x in lattice], separators=(",", ":")).encode()
        ).hexdigest()
    ):
        raise Row6Rank2Failure("unit relation digest changed")
    prepared = _mapping(
        metadata.get("prepared", metadata.get("data", metadata)), "prepared data"
    )
    c5 = _prepare(accepted_arch, accepted_signs, phase_pi, lattice, regulator)
    factor, factor_state = _factor(c5["clean"])
    status, getfu_state = _getfu(c5["clean"], c5["phases"], factor, prepared)
    final_transform = _zeros(14)
    pari_cubic_unit_compose_provenance(c5["u"], UNIT_COLUMNS, factor, final_transform)
    return {
        "schema": OUTPUT_SCHEMA,
        "field": {
            "polynomial": list(gate.get("field", {}).get("polynomial", [])),
            "degree": 3,
            "signature": [3, 0],
            "unitRank": 2,
        },
        "precision": PRECISION,
        "status": "not_given",
        "reason": "LARGE",
        "materialization": "not_given(LARGE)",
        "matchedFlagZero": True,
        "exactUnitsPublished": False,
        "compactFactoredUnitsRetained": True,
        "correspondenceComplete": True,
        "compact": {
            "unitTransformShape": [7, 2],
            "unitTransform": [str(x) for x in final_transform],
            "bridgeTransform": [str(x) for x in c5["u"]],
            "getfuFactorShape": [2, 2],
            "getfuFactor": [str(x) for x in factor],
            "cleanLogShape": [3, 2],
            "cleanLogs": [str(x) for x in c5["clean"]],
            "signPhases": c5["phases"],
            "relationLatticeShape": [7, 2],
            "relationLattice": [str(x) for x in lattice],
            "regulator": [str(x) for x in regulator],
        },
        "c5State": c5["state"],
        "c5Trace": c5["trace"],
        "factorState": factor_state,
        "c6Status": status,
        "c6State": getfu_state,
        "ancestry": dict(ancestry),
        "provenance": {
            "frozenW0RuntimeInput": False,
            "postcomputeDifferentialOnly": True,
        },
    }


__all__ = ["OUTPUT_SCHEMA", "Row6Rank2Failure", "compose_row6_rank2_c5_c6"]
