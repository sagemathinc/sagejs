"""Matched flag-zero boundary for the prepared real-cubic `h = 1` run.

This module deliberately stops at the boundary used by PARI's flag-zero
`Buchall_param` call.  The resident relation/HNF computation and the p192
compact-unit bridge are existing owners.  This root authenticates those
owners and performs exactly one p192 `getfu` attempt.  PARI's
`not_given(fupb_PRECI)` outcome is a successful *matched-boundary* result:
flag zero returns the compact class/unit data and does not enter Sage.js's
stronger p192-to-p2304 exact-unit replay.

The retrying exact-unit suffix remains separately callable as
`pari_live_retrying_h1_suffix` in `unified_full_h1_root.py`.  Nothing in
this module imports or calls it.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .unit_reconstruction_signed import pari_getfu_signed_real_cubic


RELATION_PREFIX_SCHEMA = "sagejs.pari-class-group/h1-pre-hnf-relation-prefix-v1"
COMPACT_FLAG_ZERO_SCHEMA = "sagejs.pari-class-group/h1-compact-flag-zero-v1"
_MAX_SERIALIZED_CELLS = 4_000_000


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(name + " must be an exact integer")
    if isinstance(value, str):
        if not value or value == "-0" or len(value) > 65536:
            raise ValueError(name + " is not a canonical integer")
        try:
            answer = int(value)
        except (ValueError, OverflowError) as error:
            raise ValueError(name + " must be an exact integer") from error
        if str(answer) != value:
            raise ValueError(name + " is not a canonical integer")
        return answer
    if isinstance(value, (float, bytes, bytearray)):
        raise ValueError(name + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError(name + " must be an exact integer") from error
    if answer != value:
        raise ValueError(name + " must be an exact integer")
    return answer


def _integers(values: Sequence[Any], length: int, name: str) -> list[int]:
    if isinstance(values, (str, bytes)) or not isinstance(values, Sequence):
        raise ValueError(name + " must be an integer sequence")
    if length < 0 or length > _MAX_SERIALIZED_CELLS or len(values) < length:
        raise ValueError(name + " has the wrong bounded length")
    return [_integer(values[index], f"{name}[{index}]") for index in range(length)]


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


def serialize_pre_hnf_relation_prefix(
    *,
    field_id: str,
    run_id: str,
    relation_count: int,
    relation_width: int,
    relations: Sequence[Any],
    generator_count: int,
    generator_degree: int,
    generators: Sequence[Any],
    counters: Mapping[str, Any],
    terminal_rng_state: Sequence[Any],
) -> dict[str, Any]:
    """Return the canonical logical pre-HNF relation prefix.

    Capacity padding is excluded.  Row order is intentionally preserved: it
    is part of the seeded PARI relation search.  Counters are named and sorted,
    and the terminal RNG owner is mandatory, so equal hashes mean equal work
    rather than merely equal class-group answers.
    """
    if not isinstance(field_id, str) or not field_id:
        raise ValueError("field_id must be nonempty")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError("run_id must be nonempty")
    relation_count = _integer(relation_count, "relation_count")
    relation_width = _integer(relation_width, "relation_width")
    generator_count = _integer(generator_count, "generator_count")
    generator_degree = _integer(generator_degree, "generator_degree")
    if min(relation_count, relation_width, generator_count, generator_degree) < 1:
        raise ValueError("relation-prefix dimensions must be positive")
    relation_cells = relation_count * relation_width
    generator_cells = generator_count * generator_degree
    if relation_cells + generator_cells > _MAX_SERIALIZED_CELLS:
        raise ValueError("relation prefix exceeds its cell cap")
    relation_values = _integers(relations, relation_cells, "relations")
    generator_values = _integers(generators, generator_cells, "generators")
    if not isinstance(counters, Mapping) or not counters:
        raise ValueError("relation counters must be a nonempty mapping")
    canonical_counters: dict[str, str] = {}
    for key in sorted(counters):
        if not isinstance(key, str) or not key:
            raise ValueError("relation counter names must be nonempty strings")
        canonical_counters[key] = str(_integer(counters[key], "counter " + key))
    if len(terminal_rng_state) == 0:
        raise ValueError("terminal RNG state is required")
    rng = _integers(terminal_rng_state, len(terminal_rng_state), "terminal_rng_state")
    payload = {
        "schema": RELATION_PREFIX_SCHEMA,
        "field_id": field_id,
        "run_id": run_id,
        "relation_shape": [str(relation_count), str(relation_width)],
        "relation_layout": "column-major",
        "relations": [
            [str(value) for value in relation_values[start : start + relation_width]]
            for start in range(0, relation_cells, relation_width)
        ],
        "generator_shape": [str(generator_count), str(generator_degree)],
        "generator_layout": "relation-major",
        "generators": [
            [str(value) for value in generator_values[start : start + generator_degree]]
            for start in range(0, generator_cells, generator_degree)
        ],
        "counters": canonical_counters,
        "terminal_rng_state": [str(value) for value in rng],
    }
    return {"payload": payload, "sha256": _sha256(payload)}


def serialize_compact_flag_zero_output(
    *,
    field_id: str,
    run_id: str,
    relation_prefix_sha256: str,
    compact_factor_count: int,
    compact_provenance: Sequence[Any],
    clean_logs: Sequence[Any],
    clean_phases: Sequence[Any],
    getfu_factor: Sequence[Any],
    getfu_state: Sequence[Any],
    root_state: Sequence[Any],
    terminal_rng_state: Sequence[Any],
) -> dict[str, Any]:
    """Serialize the p192 compact owner and its single `getfu` result."""
    if not isinstance(field_id, str) or not field_id:
        raise ValueError("field_id must be nonempty")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError("run_id must be nonempty")
    if (
        not isinstance(relation_prefix_sha256, str)
        or len(relation_prefix_sha256) != 64
        or any(ch not in "0123456789abcdef" for ch in relation_prefix_sha256)
    ):
        raise ValueError("relation prefix hash must be lowercase SHA-256")
    factors = _integer(compact_factor_count, "compact_factor_count")
    if factors < 1 or factors > 198:
        raise ValueError("compact factor count is outside the matched corridor")
    provenance = _integers(compact_provenance, 2 * factors, "compact_provenance")
    logs = _integers(clean_logs, 18, "clean_logs")
    phases = _integers(clean_phases, 6, "clean_phases")
    if any(phase not in (0, 1) for phase in phases):
        raise ValueError("clean phases must be characteristic-two bits")
    factor = _integers(getfu_factor, 4, "getfu_factor")
    state = _integers(getfu_state, 8, "getfu_state")
    root = _integers(root_state, 12, "root_state")
    rng = _integers(terminal_rng_state, len(terminal_rng_state), "terminal_rng_state")
    if len(rng) == 0:
        raise ValueError("terminal RNG state is required")
    if root[0] != 0 or root[1] != 1 or root[2] != state[0]:
        raise ValueError("compact flag-zero root did not publish atomically")
    if root[3] != 192 or root[4] != 1 or root[5] != 0 or root[6] != 0:
        raise ValueError("compact flag-zero attempt/retry/suffix counters changed")
    if (
        root[7] != factors
        or root[8] != 73
        or root[9] != 8
        or root[10] != 0
        or root[11] != 1
    ):
        raise ValueError("compact H1 authority or publication state changed")
    if state[0] not in (0, 3):
        raise ValueError("getfu result is neither success nor PRECI")
    payload = {
        "schema": COMPACT_FLAG_ZERO_SCHEMA,
        "field_id": field_id,
        "run_id": run_id,
        "relation_prefix_sha256": relation_prefix_sha256,
        "precision_bits": "192",
        "unit_rank": "2",
        "compact_factor_count": str(factors),
        "compact_provenance": [
            [str(value) for value in provenance[:factors]],
            [str(value) for value in provenance[factors : 2 * factors]],
        ],
        "clean_logs": [str(value) for value in logs],
        "clean_phases": [str(value) for value in phases],
        "getfu_factor": [str(value) for value in factor],
        "getfu": {
            "status": "success" if state[0] == 0 else "not_given(PRECI)",
            "state": [str(value) for value in state],
        },
        "counters": {
            "getfu_attempts": "1",
            "precision_retries": "0",
            "stronger_exact_suffix_calls": "0",
        },
        "terminal_rng_state": [str(value) for value in rng],
        "assumptions": {
            "pari_correspondence_assumed": True,
            "public_complete": False,
        },
    }
    return {"payload": payload, "sha256": _sha256(payload)}


@native
def pari_h1_compact_flag_zero_root(
    unified_state: Int64Buffer,
    bridge_state: Int64Buffer,
    hnf_state: Int64Buffer,
    hnf_assembly_state: Int64Buffer,
    preparation_embedding: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    clean_logs: IntegerBuffer,
    clean_phases: Int64Buffer,
    getfu_factor: IntegerBuffer,
    compact_provenance: IntegerBuffer,
    embedding_packed: IntegerBuffer,
    matep: IntegerBuffer,
    transformed_arch: IntegerBuffer,
    transformed_clean: IntegerBuffer,
    transformed_phases: Int64Buffer,
    exponential_values: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    candidate_units: IntegerBuffer,
    normalized_factor: IntegerBuffer,
    output_units: IntegerBuffer,
    output_logs: IntegerBuffer,
    output_phases: Int64Buffer,
    output_factor: IntegerBuffer,
    getfu_state: Int64Buffer,
    pivots: Int64Buffer,
    exp_cache: IntegerBuffer,
    exp_a: IntegerBuffer,
    exp_b: IntegerBuffer,
    exp_p: IntegerBuffer,
    exp_q: IntegerBuffer,
    exp_stack: IntegerBuffer,
    root_state: Int64Buffer,
) -> int:
    """Run exactly one authenticated p192 `getfu` attempt.

    `root_state` is status, authenticated-prefix bit, getfu status,
    precision, attempt count, retry count, stronger-suffix call count, compact
    factor count, relation count, HNF rank, public-complete, and publication
    bit.  Status zero accepts either exact getfu success or PARI's
    `not_given(PRECI)`.  The latter does not publish exact units.
    """
    if (
        len(unified_state) < 12
        or len(bridge_state) < 16
        or len(hnf_state) < 9
        or len(hnf_assembly_state) < 6
        or len(preparation_embedding) < 27
        or len(multiplication_tensor) < 27
        or len(compact_provenance) < 2
        or len(root_state) < 12
    ):
        raise ValueError("short matched flag-zero owner")
    for i in range(12):
        root_state[i] = 0
    root_state[0] = -1
    root_state[3] = 192
    root_state[10] = 0

    relation_count = hnf_state[7]
    class_rows = hnf_assembly_state[0]
    dependent_rows = hnf_assembly_state[1]
    active_columns = hnf_assembly_state[2]
    b_rows = hnf_assembly_state[3]
    deferred_columns = hnf_assembly_state[4]
    compact_factor_count = hnf_state[1]
    if (
        unified_state[0] != 0
        or unified_state[3] != 1
        or unified_state[4] != 0
        or bridge_state[0] != 0
        or bridge_state[15] != 0
        or hnf_state[0] != 0
        or relation_count < 1
        or class_rows < 1
        or dependent_rows < 0
        or active_columns < class_rows
        or deferred_columns < 0
        or compact_factor_count < 1
        or hnf_assembly_state[5] != 0
        or class_rows + dependent_rows != hnf_state[5]
        or b_rows != hnf_state[5]
        or active_columns + deferred_columns != relation_count
        or hnf_state[2] + compact_factor_count != relation_count
        or bridge_state[5] != compact_factor_count
        or bridge_state[8] != relation_count
        or bridge_state[9] != hnf_state[5]
        or bridge_state[12] != 2
        or bridge_state[13] != compact_factor_count
        or unified_state[5] != compact_factor_count
        or unified_state[6] != relation_count
        or unified_state[7] != hnf_state[5]
        or unified_state[10] != bridge_state[12]
        or unified_state[11] != compact_factor_count
        or len(compact_provenance) < 2 * compact_factor_count
    ):
        root_state[0] = 1
        return 1
    root_state[1] = 1
    root_state[7] = compact_factor_count
    root_state[8] = relation_count
    root_state[9] = hnf_state[5]

    # The prepared owner is embedding-row major. PARI's M/getfu matrix is
    # basis-column major. Preserve every packed p192 triple while transposing.
    for basis_column in range(3):
        for embedding_row in range(3):
            source = 3 * (3 * embedding_row + basis_column)
            target = 3 * (3 * basis_column + embedding_row)
            embedding_packed[target] = preparation_embedding[source]
            embedding_packed[target + 1] = preparation_embedding[source + 1]
            embedding_packed[target + 2] = preparation_embedding[source + 2]

    root_state[4] = 1
    status = pari_getfu_signed_real_cubic(
        clean_logs,
        clean_phases,
        getfu_factor,
        embedding_packed,
        multiplication_tensor,
        192,
        192,
        matep,
        transformed_arch,
        transformed_clean,
        transformed_phases,
        exponential_values,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        multiplication,
        inverse,
        candidate_units,
        normalized_factor,
        output_units,
        output_logs,
        output_phases,
        output_factor,
        getfu_state,
        pivots,
        exp_cache,
        exp_a,
        exp_b,
        exp_p,
        exp_q,
        exp_stack,
    )
    root_state[2] = status
    if status != 0 and status != 3:
        root_state[0] = 2
        return 2
    root_state[11] = 1
    root_state[0] = 0
    return 0
