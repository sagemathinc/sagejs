"""Live final-driver status adapter for the authentic equal-bound cubic.

The native leaf derives PARI's equal-bound honesty skip and class-relation
`cleanarch` acceptance from resident owners. The host adapter then constructs
the existing `FinalDriverComponentOutput` with hashes from the connected
authentic h=1 payload. It does not claim Phase 5 or public completeness.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any, Mapping

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .class_group_final_state import (
    FinalDriverComponentOutput,
    canonical_component_sha256,
    snapshot_final_source_state,
)
from .class_relation_cleanarch import pari_cleanarch_totally_real_cubic


STATUS_SCHEMA = "sagejs.pari-class-group/live-final-driver-status-v1"


class FinalDriverStatusFailure(ValueError):
    """Live driver state or detached replay is inconsistent."""


@native
def pari_equal_bound_cleanarch_driver_status(
    prep_base_state: IntegerBuffer,
    prep_state: IntegerBuffer,
    hnf_state: Int64Buffer,
    acceptance_state: Int64Buffer,
    class_logs: IntegerBuffer,
    columns: int,
    precision: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_output: IntegerBuffer,
    clean_state: Int64Buffer,
    driver_state: Int64Buffer,
) -> int:
    """Derive equal-bound honesty and cleanup status from resident owners.

    `driver_state` is status, honesty code, cleanup code, KCZ, KCZ2, source
    columns, published columns, accepted relation count, HNF rank, and public
    completion. Honesty code one is the source-authorized `KCZ == KCZ2` skip;
    cleanup code one is a successful transactional `cleanarch` publication.
    """
    if (
        columns < 1
        or len(prep_base_state) < 7
        or len(prep_state) < 8
        or len(hnf_state) < 9
        or len(acceptance_state) < 3
        or len(driver_state) < 10
    ):
        raise ValueError("short final-driver status input")
    for i in range(10):
        driver_state[i] = 0
    driver_state[0] = -1
    kc = prep_base_state[2]
    kcz = prep_base_state[3]
    kcz2 = prep_base_state[4]
    if (
        kc <= 0
        or kcz <= 0
        or kcz != kcz2
        or prep_state[0] != 7
        or prep_state[2] != kc
        or prep_state[3] != kcz
        or prep_state[7] != kc
    ):
        driver_state[0] = 2
        return 2
    driver_state[1] = 1
    driver_state[3] = kcz
    driver_state[4] = kcz2
    if (
        hnf_state[0] != 0
        or hnf_state[1] != columns
        or hnf_state[2] != kc
        or hnf_state[5] <= 0
        or hnf_state[7] != kc + columns
        or acceptance_state[0] != 2
        or acceptance_state[1] != 0
        or acceptance_state[2] != 0
    ):
        driver_state[0] = 3
        return 3
    driver_state[5] = columns
    driver_state[7] = hnf_state[7]
    driver_state[8] = hnf_state[5]
    status = pari_cleanarch_totally_real_cubic(
        class_logs,
        columns,
        precision,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
        clean_scratch,
        clean_output,
        clean_state,
    )
    if status != 0:
        driver_state[0] = 4
        return 4
    if clean_state[0] != 0 or clean_state[1] != columns or clean_state[2] != columns:
        driver_state[0] = 5
        return 5
    driver_state[2] = 1
    driver_state[6] = clean_state[2]
    driver_state[9] = 0
    driver_state[0] = 0
    return 0


@dataclass(frozen=True)
class LiveFinalDriverStatus:
    schema: str
    source_sha256: str
    cleaned_sha256: str
    native_state: tuple[str, ...]
    final_driver: FinalDriverComponentOutput
    phase5_complete: bool = False
    public_complete: bool = False


def _canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def build_live_final_driver_status(
    resident: Mapping[str, Any], authentic: Mapping[str, Any]
) -> LiveFinalDriverStatus:
    """Replay the live status leaf and construct an incomplete driver output."""
    try:
        candidate = authentic["candidate"]
        transforms = authentic["transforms"]
        unit_component = authentic["unit_component"]
        generators = authentic["generators"]
        source_state = snapshot_final_source_state(authentic["buchall"])
        columns = int(candidate["equal_bound_state"][1])
        precision = int(resident["precision"])
        class_logs = [int(value) for value in resident["hnf_result_c"][: 21 * columns]]
        if [str(value) for value in class_logs] != candidate["transformed_logs"]:
            raise FinalDriverStatusFailure(
                "candidate logs are detached from resident C"
            )
        prep_base_state = [int(value) for value in resident["prep_base_state"][:7]]
        prep_state = [int(value) for value in resident["prep_state"][:8]]
        hnf_state = [int(value) for value in resident["hnf_state"][:9]]
        acceptance = [int(value) for value in resident["accept_acceptance_state"][:3]]
    except (KeyError, TypeError, ValueError, IndexError) as error:
        if isinstance(error, FinalDriverStatusFailure):
            raise
        raise FinalDriverStatusFailure("missing live final-driver owner") from error
    size = 21 * columns
    integer = lambda length: [0] * length
    clean_state = [0] * 4
    driver_state = [0] * 10
    cleaned = integer(size)
    status = pari_equal_bound_cleanarch_driver_status(
        prep_base_state,
        prep_state,
        hnf_state,
        acceptance,
        class_logs,
        columns,
        precision,
        integer(3),
        integer(512),
        integer(512),
        integer(512),
        integer(512),
        integer(1024),
        integer(size),
        cleaned,
        clean_state,
        driver_state,
    )
    honesty_status = {1: "equal-bound-source-skip"}.get(driver_state[1])
    cleanarch_status = {1: "accepted"}.get(driver_state[2])
    if (
        status != 0
        or honesty_status is None
        or cleanarch_status is None
        or driver_state != [0, 1, 1, 48, 48, 7, 7, 73, 8, 0]
    ):
        raise FinalDriverStatusFailure("live final-driver status did not terminate")
    run_id = unit_component["run_id"]
    generation = int(unit_component["owner_generation"])
    candidate_hash = canonical_component_sha256(candidate)
    transform_hash = canonical_component_sha256(transforms)
    if (
        unit_component["candidate_sha256"] != candidate_hash
        or unit_component["transforms_sha256"] != transform_hash
    ):
        raise FinalDriverStatusFailure("unit component hashes are detached")
    final_driver = FinalDriverComponentOutput(
        run_id,
        generation,
        "buchall-end-assembled",
        honesty_status,
        cleanarch_status,
        candidate_hash,
        transform_hash,
        canonical_component_sha256(unit_component["evidence"]),
        canonical_component_sha256(generators),
        source_state,
    )
    source = {
        "prep_base_state": [str(value) for value in prep_base_state],
        "prep_state": [str(value) for value in prep_state],
        "hnf_state": [str(value) for value in hnf_state],
        "acceptance_state": [str(value) for value in acceptance],
        "class_logs": [str(value) for value in class_logs],
    }
    return LiveFinalDriverStatus(
        STATUS_SCHEMA,
        _sha256(source),
        _sha256([str(value) for value in cleaned]),
        tuple(str(value) for value in driver_state),
        final_driver,
    )


def detached_status_payload(status: LiveFinalDriverStatus) -> dict[str, Any]:
    """Return canonical JSON material for mutation and cold-replay tests."""
    answer = asdict(status)
    answer["native_state"] = list(status.native_state)
    return answer


def replay_live_final_driver_status(
    payload: Mapping[str, Any],
    resident: Mapping[str, Any],
    authentic: Mapping[str, Any],
) -> LiveFinalDriverStatus:
    """Recompute every live decision and reject detached status mutations."""
    expected = build_live_final_driver_status(resident, authentic)
    if dict(payload) != detached_status_payload(expected):
        raise FinalDriverStatusFailure("detached final-driver status changed")
    return expected
