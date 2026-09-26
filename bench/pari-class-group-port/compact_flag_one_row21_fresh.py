#!/usr/bin/env python3
"""Fresh compact-only row-21 unit-lattice computation.

This diagnostic intentionally stops before reference-unit access and before
the signature-(3,1) getfu reconstruction/expansion boundary.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
W0 = Path("/scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json")
W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a"
EXPECTED_TRANSFORM = [
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    3,
    1,
    0,
    0,
    0,
    0,
    0,
    -1,
    1,
    0,
]

sys.path[:0] = [str(ROOT), str(ROOT / "src/lib")]

from importlib import import_module  # noqa: E402


unit = import_module("bench.pari-class-group-port.row21_rank3_unit_lattice")
logs = import_module("bench.pari-class-group-port.log_matrix_transform")


def event(bundle: dict, name: str) -> dict:
    matches = [item for item in bundle["events"] if item.get("event") == name]
    if len(matches) != 1:
        raise ValueError(f"row-21 {name} event count changed")
    return matches[0]


def zeros(length: int) -> list[int]:
    return [0] * length


def floats(length: int) -> list[float]:
    return [0.0] * length


def compute(bundle: dict, w0_sha256: str = W0_SHA256) -> dict:
    if set(bundle) != {"events", "field"}:
        raise ValueError("compact row-21 input has unexpected owners")
    field = bundle.get("field", {})
    if (
        field.get("panelIndex") != 21
        or field.get("id") != "5.3.1009349859375.3"
        or field.get("degree") != 5
        or field.get("signature") != [3, 1]
        or field.get("unitRank") != 3
    ):
        raise ValueError("wrong row-21 field identity")

    # Deliberately retain only the compact cut's inputs. In particular there is
    # no fundamental_units event or prepared multiplication tensor in scope.
    hnf = event(bundle, "hnf")
    acceptance = event(bundle, "acceptance")
    relation_lattice = unit._integer_matrix(acceptance["lattice"])
    if len(relation_lattice) != 24:
        raise ValueError("row-21 accepted lattice shape changed")

    columns = 8
    square = columns * columns
    u1 = zeros(24)
    integer_state = zeros(5)
    status = unit.pari_unit_integer_lattice_rank_three(
        relation_lattice,
        columns,
        u1,
        integer_state,
        zeros(24),
        zeros(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(columns),
        zeros(columns),
        floats(24),
        floats(square),
        zeros(columns),
        zeros(columns),
        zeros(columns),
        floats(columns),
        floats(columns),
        floats(columns),
        zeros(columns),
    )
    if status != 0 or integer_state != [5, 5, 3, 0, 0]:
        raise ValueError("integer compact lattice reduction failed")

    packed_logs = unit._packed_matrix(hnf["exactC"])
    if len(packed_logs) != 32 * 4 * 7:
        raise ValueError("row-21 exact-log shape changed")
    packed_logs = packed_logs[: columns * 4 * 7]
    first_logs = zeros(4 * 3 * 7)
    logs.pari_log_matrix_transform(packed_logs, u1, 4, columns, 3, False, first_logs)
    triples = zeros(36)
    for row in range(4):
        for column in range(3):
            source = 7 * (column * 4 + row) + 1
            target = 3 * (row * 3 + column)
            triples[target : target + 3] = first_logs[source : source + 3]

    u2 = zeros(9)
    real_state = zeros(2)
    status = unit.pari_unit_real_lattice_rank_three(
        triples,
        4,
        zeros(12),
        u2,
        zeros(12),
        zeros(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(3),
        zeros(3),
        floats(12),
        floats(9),
        zeros(3),
        zeros(4),
        zeros(4),
        floats(4),
        floats(4),
        floats(4),
        zeros(4),
        real_state,
    )
    if status != 0 or real_state != [0, 0]:
        raise ValueError("real compact lattice reduction failed")

    transform = zeros(24)
    unit.pari_unit_compose_rank_three(u1, columns, u2, transform)
    unit_logs = zeros(84)
    logs.pari_log_matrix_transform(
        packed_logs, transform, 4, columns, 3, False, unit_logs
    )
    regulator = unit._packed_real(acceptance["exactR"])
    clean = zeros(84)
    clean_state = zeros(7)
    status = unit.pari_cleanarchunit_31_quintic(
        unit_logs,
        regulator,
        192,
        zeros(3),
        zeros(1024),
        zeros(1024),
        zeros(1024),
        zeros(1024),
        zeros(2048),
        zeros(84),
        clean,
        clean_state,
    )
    if status != 0 or clean_state != [0, 3, 3, -183, -174, -1, -1]:
        raise ValueError("compact cleanarchunit failed")

    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    matep, arch, candidate = zeros(84), zeros(84), zeros(84)
    real_parts = [zeros(36) for _ in range(4)]
    unit.pari_prepare_getfu_31_quintic(
        clean, identity, matep, arch, candidate, *real_parts
    )
    getfu_triples = zeros(36)
    for row in range(4):
        for column in range(3):
            source = 7 * (column * 4 + row) + 1
            target = 3 * (row * 3 + column)
            getfu_triples[target : target + 3] = matep[source : source + 3]
    getfu_u2, getfu_state = zeros(9), zeros(2)
    status = unit.pari_unit_real_lattice_rank_three(
        getfu_triples,
        4,
        zeros(12),
        getfu_u2,
        zeros(12),
        zeros(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(9),
        zeros(9),
        floats(3),
        zeros(3),
        floats(12),
        floats(9),
        zeros(3),
        zeros(4),
        zeros(4),
        floats(4),
        floats(4),
        floats(4),
        zeros(4),
        getfu_state,
    )
    if status != 0 or getfu_state != [0, 0]:
        raise ValueError("private compact getfu-factor selection failed")
    getfu_factor = [
        getfu_u2[3 * row + column] for column in range(3) for row in range(3)
    ]
    unit.pari_prepare_getfu_31_quintic(
        clean, getfu_factor, matep, arch, candidate, *real_parts
    )

    if transform != EXPECTED_TRANSFORM:
        raise ValueError(
            "fresh compact transform disagrees with frozen oracle: " + repr(transform)
        )
    return {
        "schema": "sagejs.pari-class-group/compact-flag-one-row21-fresh-cut-v1",
        "diagnosticOnly": True,
        "publishable": False,
        "qualifiedTiming": False,
        "frozenW0RuntimeInput": True,
        "tier": "compact-flag-one",
        "boundary": "fresh-frozen-w0-unit-lattice-computation",
        "fieldId": field["id"],
        "input": {
            "w0Sha256": w0_sha256,
            "freshPreparedInput": False,
            "frozenHnfLogAcceptanceInput": True,
        },
        "execution": {
            "integerLllExecuted": True,
            "realLllExecuted": True,
            "compactTransformCompositionExecuted": True,
            "cleanarchExecuted": True,
            "privateGetfuFactorSelectionExecuted": True,
            "pariFlagOneCallExecuted": False,
            "fundamentalUnitsEventAccessible": False,
            "eagerUnitExpansionExecuted": False,
            "exactFieldUnitMaterializationExecuted": False,
        },
        "result": {
            "unitRank": "3",
            "integerState": integer_state,
            "realState": real_state,
            "cleanarchState": clean_state,
            "privateGetfuRealState": getfu_state,
            "compactTransformShape": [8, 3],
            "compactTransform": [str(value) for value in transform],
            "privateGetfuFactor": [str(value) for value in getfu_factor],
            "candidatePackedLogCells": len(candidate),
        },
        "dependencyCut": {
            "requiredFreshUpstream": [
                "connected row-21 relation/HNF owner",
                "connected row-21 exact raw-log owner",
                "connected accepted-regulator owner",
            ],
            "requiredFreshDownstream": [
                "signature-(3,1) three-RHS getfu reconstruction",
                "live exact unit/norm/sign publication",
            ],
        },
    }


def main() -> None:
    if len(sys.argv) == 1:
        w0, w0_sha256 = W0, W0_SHA256
    elif len(sys.argv) == 5 and sys.argv[1] == "--w0" and sys.argv[3] == "--w0-sha256":
        w0, w0_sha256 = Path(sys.argv[2]), sys.argv[4]
    else:
        raise ValueError(
            "usage: compact_flag_one_row21_fresh.py [--w0 FILE --w0-sha256 HEX]"
        )
    raw = w0.read_bytes()
    if hashlib.sha256(raw).hexdigest() != w0_sha256:
        raise ValueError("row-21 W0 digest changed")
    original = json.loads(raw)
    compact_bundle = {
        "field": original["field"],
        "events": [
            item
            for item in original["events"]
            if item.get("event") in {"hnf", "acceptance"}
        ],
    }
    receipt = compute(compact_bundle, w0_sha256)
    print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
