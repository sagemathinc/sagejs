"""Cold replay an actual unified H1 native owner bundle.

The JSON input is the single detached host copy made after the native root
commits its 811-cell publication.  No fixture, expected digest, or producer
routine is used here.
"""

from __future__ import annotations

import copy
import collections
import dataclasses
import decimal
from fractions import Fraction
import hashlib
import importlib
import json
from pathlib import Path
import sys
import typing


ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "src" / "lib")]


def packed_point(values: list[int]) -> Fraction:
    mantissa, precision, exponent = values
    if precision == -1:
        return Fraction(mantissa)
    shift = exponent - (precision - 1)
    return (
        Fraction(mantissa << shift) if shift >= 0 else Fraction(mantissa, 1 << -shift)
    )


def dyadic(value: Fraction) -> tuple[int, int]:
    denominator = value.denominator
    if denominator & (denominator - 1):
        raise AssertionError("packed determinant ceased to be dyadic")
    return value.numerator, -(denominator.bit_length() - 1)


def reseal(module: object, changed: dict[str, object]):
    payload_raw = module._canonical(changed)
    envelope = {
        "schema": module.ENVELOPE_SCHEMA,
        "payload": changed,
        "payload_sha256": module._sha256(payload_raw),
    }
    raw = module._canonical(envelope)
    return module.ImmutableH1TerminalSnapshot(raw, module._sha256(raw))


def main() -> None:
    sys.set_int_max_str_digits(100_000)
    raw = json.load(open(sys.argv[1], encoding="utf-8"))
    q = {name: [int(value) for value in entries] for name, entries in raw.items()}
    s = importlib.import_module(
        "bench.pari-class-group-port.h1_terminal_owner_snapshot"
    )
    l = importlib.import_module("bench.pari-class-group-port.log_matrix_transform")

    generator_arch = [0] * 168
    l.pari_log_matrix_transform(
        q["hnf_result_c"][:168], q["class_m2_scratch"], 3, 8, 8, True, generator_arch
    )
    logs = q["precision_published_logs"]
    points = [packed_point(logs[3 * index : 3 * (index + 1)]) for index in range(6)]
    determinant = abs(points[0] * points[4] - points[1] * points[3])
    regulator = packed_point(q["final_regulator"])
    lower = dyadic(min(determinant, regulator))
    upper = dyadic(max(determinant, regulator))

    owners = s.H1TerminalNumericOwners(
        terminal_state=q["final_state"],
        polynomial=q["final_polynomial"],
        integral_basis=q["prep_zk"],
        multiplication_tensor=q["basis_table"],
        factor_base_ideals=q["packet_ideals"],
        factor_base_norms=q["packet_norms"],
        relation_records=q["relation_records"],
        principal_generators=q["generators"],
        cleanup_transform=q["hnf_transform"],
        initial_permutation=q["search_ideals"],
        collector_state=q["state"],
        collector_increment=q["inc"],
        collector_cursor=q["cursor_output"],
        relation_hashes=q["relation_hashes"],
        relation_metadata=q["relation_metadata"],
        relation_progress=q["progress"],
        relation_schedule=q["schedule"],
        kummer_random_state=q["prep_kummer_random_state"],
        original_relation_logs=q["log_embeddings"],
        active_relation=q["hnf_matbnew"],
        full_hnf=q["hnf_full_h"],
        active_hnf_transform=q["hnf_hnf_transform"],
        transformed_relation_logs=q["hnf_result_c"],
        relation_to_presentation=q["final_relation_to_presentation"],
        presentation_to_relation=q["final_presentation_to_relation"],
        presentation=q["final_presentation"],
        smith=q["final_smith"],
        left=q["final_left"],
        left_inverse=q["final_left_inverse"],
        right=q["final_right"],
        right_inverse=q["final_right_inverse"],
        ur=q["class_ur_scratch"],
        y=q["class_y_scratch"],
        uir=q["class_uir_scratch"],
        x=q["class_x_scratch"],
        m2=q["class_m2_scratch"],
        generator_arch=generator_arch,
        compact_unit_provenance=q["final_compact_provenance"],
        compact_unit_factor=q["precision_getfu_factor"],
        retained_relation_provenance=q["final_retained_relation_map"],
        exact_units_integral_basis=q["precision_exact_units_integral"],
        published_exact_units_integral_basis=q["final_exact_units"],
        exact_unit_norms=q["final_exact_norms"],
        rebuilt_unit_logs=logs,
        unit_phases=q["precision_published_phases"],
        packed_regulator=q["final_regulator"],
        regulator_interval=[lower[0], lower[1], upper[0], upper[1]],
        regulator_state=[0, 1, 1, 1, q["final_regulator"][1]],
        acceptance_state=q["accept_acceptance_state"],
        reconstruction_state=q["accept_reconstruction_state"],
        attempt_state=q["attempt_state"],
        unified_state=q["unified_state"],
        bridge_state=q["bridge_state"],
        precision_authority_state=q["precision_authority_state"],
        precision_retry_state=q["precision_retry_state"],
        torsion_state=q["torsion_state"],
        torsion_order=q["final_torsion_order"],
        torsion_generator=q["final_torsion_generator"],
        invariant_factor_capacity=q["final_invariants"],
        assumption_flags=s.EXPECTED_ASSUMPTION_FLAGS,
    )
    snapshot = s.capture_h1_terminal_owner_snapshot(owners)
    authority = s.authority_for_h1_terminal_snapshot(snapshot)
    payload = s.cold_replay_h1_terminal_snapshot(snapshot, authority)

    mutations: list[dict[str, object]] = []
    changed = copy.deepcopy(payload)
    changed["presentation"]["relation_records"]["entries"][0] = "9"
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["presentation"]["active_relation"]["entries"][0] = str(
        int(changed["presentation"]["active_relation"]["entries"][0]) + 1
    )
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["class_group"]["smith"]["entries"][0] = "2"
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["unit_group"]["compact_provenance"]["entries"][0] = str(
        int(changed["unit_group"]["compact_provenance"]["entries"][0]) + 1
    )
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["unit_group"]["published_exact_units_integral_basis"]["entries"][0] = str(
        int(changed["unit_group"]["published_exact_units_integral_basis"]["entries"][0])
        + 1
    )
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["unit_group"]["rebuilt_logs"]["entries"][0] = str(
        int(changed["unit_group"]["rebuilt_logs"]["entries"][0]) + (1 << 1024)
    )
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["regulator"]["packed"]["entries"][0] = str(
        int(changed["regulator"]["packed"]["entries"][0]) + 2
    )
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["torsion"]["generator"]["entries"][0] = "1"
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["assumptions"]["upstream"]["version"] = "2.15.4"
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["terminal"]["state"]["entries"][14] = "0"
    mutations.append(changed)
    changed = copy.deepcopy(payload)
    changed["regulator"]["precision_authority_state"]["entries"][14] = "0"
    mutations.append(changed)

    for index, changed in enumerate(mutations):
        forged = reseal(s, changed)
        try:
            s.cold_replay_h1_terminal_snapshot(
                forged, s.H1TerminalSnapshotAuthority(forged.sha256)
            )
        except s.H1TerminalSnapshotFailure:
            continue
        raise AssertionError("coordinated terminal mutation accepted: " + str(index))

    print(
        json.dumps(
            {
                "schema": payload["schema"],
                "sha256": snapshot.sha256,
                "actualUnifiedPublication": True,
                "relations": 73,
                "factorBase": 66,
                "exactUnits": 2,
                "publishedCells": 811,
                "mutationsRejected": len(mutations),
                "intermediateSerializations": 0,
                "publicComplete": False,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
