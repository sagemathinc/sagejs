"""Fresh prepared-only row-10 post-HNF acceptance boundary.

This module deliberately accepts only HNF checkpoints produced in the same
invocation.  It owns every acceptance workspace privately and accepts no
precomputed acceptance result.
"""

from .post_hnf_acceptance import pari_post_hnf_acceptance
from .analytic_inverse_hr import pari_analytic_inverse_hr
from .discriminant_log import pari_discriminant_log
from .class_invariant_output import pari_class_invariant_output


FACTOR_COUNT = 288
PLACES = 3
DEGREE = 4
UNIT_COLUMNS = 15


def _checked_checkpoint(
    checkpoint: dict,
) -> tuple[int, int, int, list[int], list[int]]:
    columns = int(checkpoint["columns"])
    if columns not in (293, 295, 299, 300, 303):
        raise ValueError("row-10 checkpoint has an unexpected column count")
    state = [int(value) for value in checkpoint["state"]]
    h_rows = state[0]
    b_columns = state[2]
    if (
        h_rows < 0
        or b_columns < 0
        or h_rows + b_columns > FACTOR_COUNT
        or state[7] != columns
    ):
        raise ValueError("row-10 checkpoint state changed")
    h = [int(value) for value in checkpoint["h"]]
    if len(h) != h_rows * h_rows:
        raise ValueError("row-10 class-presentation owner has the wrong shape")
    c = [int(value) for value in checkpoint["c"]]
    if len(c) != 7 * PLACES * columns:
        raise ValueError("row-10 transformed-log owner has the wrong shape")
    return columns, h_rows, b_columns, h, c


def _private_owners(inverse_hr: list[int]) -> dict:
    if len(inverse_hr) != 3:
        raise ValueError("inverse-hR owner has the wrong shape")

    rows = FACTOR_COUNT
    size = rows * (UNIT_COLUMNS + 1)
    square = rows * rows
    reconstruction = (rows - 1) * UNIT_COLUMNS

    def z(n: int) -> list[int]:
        return [0] * n

    values = {
        "factor_count": FACTOR_COUNT,
        "h_rows": 0,
        "b_columns": FACTOR_COUNT,
        "c_columns": 0,
        "places": PLACES,
        "degree": DEGREE,
        "h": [],
        "c": [],
        "inverse_hr": [int(value) for value in inverse_hr],
        "logs": z(3 * rows * UNIT_COLUMNS),
        "class_number": z(1),
        "zeta_factor": z(3),
        "post_hnf_state": z(3),
        "prepared": z(3 * size),
        "selected": z(UNIT_COLUMNS + 1),
        "prep_state": z(3),
        "rank_work": z(3 * size),
        "rank_occupied": z(rows),
        "rank_pivots": z(UNIT_COLUMNS + 1),
        "rank_state": z(3),
        "integer_input": z(size),
        "integer_work": z(size),
        "integer_occupied": z(rows),
        "integer_pivots": z(UNIT_COLUMNS + 1),
        "integer_best": z(UNIT_COLUMNS + 1),
        "integer_state": z(10),
        "basis": z(3 * square),
        "minor": z(3 * square),
        "det_work": z(3 * square),
        "det_result": z(3),
        "det_pivots": z(rows),
        "det_state": z(5),
        "inverse_work": z(3 * square),
        "inverse_rhs": z(3 * square),
        "inverse": z(3 * square),
        "inverse_pivots": z(rows),
        "inverse_state": z(3),
        "product": z(3 * square),
        "inverse_slice": z(3 * square),
        "multiple": z(3),
        "coordinates": z(3 * reconstruction),
        "multiple_state": z(4),
        "rational_work": z(3 * reconstruction),
        "lattice": z(reconstruction),
        "hnf_work": z(reconstruction),
        "hnf_column": z(rows - 1),
        "hnf_output": z(reconstruction),
        "hnf_state": z(15),
        "regulator": z(3),
        "relations": z(reconstruction),
        "denominator": z(1),
        "reconstruction_state": z(4),
        "hnf_row_pivots": z(rows - 1),
        "hnf_heights": z(UNIT_COLUMNS),
        "acceptance_state": z(3),
    }
    return values


def _published(status: int, columns: int, values: dict) -> dict:
    return {
        "status": status,
        "columns": columns,
        "postHnfState": values["post_hnf_state"][:],
        "multipleState": values["multiple_state"][:],
        "acceptanceState": values["acceptance_state"][:],
        "reconstructionState": values["reconstruction_state"][:],
        "classNumber": str(values["class_number"][0]),
        "regulator": [str(value) for value in values["regulator"][:3]],
        "relationLattice": [
            str(value) for value in values["relations"][: 2 * UNIT_COLUMNS]
        ],
        "packedLogs": [str(value) for value in values["logs"]],
    }


def accept_fresh_row10_checkpoints(
    checkpoints: list[dict], inverse_hr: list[int]
) -> list[dict]:
    """Run the same-invocation row-10 rejection/retry transaction."""

    if len(checkpoints) != 4:
        raise ValueError(
            "row-10 acceptance requires exactly four full-rank checkpoints"
        )
    values = _private_owners(inverse_hr)
    old_cache = 0
    outputs = []
    for checkpoint in checkpoints:
        columns, h_rows, b_columns, h, c = _checked_checkpoint(checkpoint)
        values["h_rows"] = h_rows
        values["b_columns"] = b_columns
        values["h"] = h
        values["c_columns"] = columns
        values["c"] = c
        values["multiple_state"][1] = 0
        status = int(
            pari_post_hnf_acceptance(**values, cache_changed=columns != old_cache)
        )
        if values["acceptance_state"][0] == 2:
            old_cache = columns
        outputs.append(_published(status, columns, values))
    return outputs


def fresh_row10_terminal(
    checkpoints: list[dict], analytic: dict, discriminant: int, roots_of_unity: int
) -> dict:
    """Derive analytic data and run the complete fresh acceptance schedule."""

    primes = [int(value) for value in analytic["primes"]]
    offsets = [int(value) for value in analytic["offsets"]]
    counts = [int(value) for value in analytic["counts"]]
    degrees = [int(value) for value in analytic["degrees"]]
    multiplicities = [int(value) for value in analytic["multiplicities"]]
    log_discriminant = [pari_discriminant_log(abs(int(discriminant)))]
    inverse_residue = [0] * 3
    result = pari_analytic_inverse_hr(
        abs(int(discriminant)),
        2,
        1,
        int(roots_of_unity),
        log_discriminant,
        primes,
        offsets,
        counts,
        degrees,
        multiplicities,
        [0.0] * 7,
        [0.0] * 31,
        [0.0],
        [0.0] * len(offsets),
        [0.0],
        inverse_residue,
        [0] * 3,
        [0] * 3,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 128,
    )
    inverse_hr = [int(result[2]), int(result[3]), int(result[4])]
    attempts = accept_fresh_row10_checkpoints(checkpoints, inverse_hr)
    if [entry["status"] for entry in attempts] != [5, 5, 5, 0]:
        raise ValueError("row-10 acceptance schedule changed")
    _, h_rows, _, h, _ = _checked_checkpoint(checkpoints[-1])
    smith_work = [0] * (h_rows * h_rows)
    smith_column = [0] * h_rows
    invariants = [0] * h_rows
    smith_class_number = [0]
    smith_state = [0] * 6
    smith_status = pari_class_invariant_output(
        h,
        h_rows,
        smith_work,
        smith_column,
        invariants,
        smith_class_number,
        smith_state,
    )
    if smith_status != 0 or smith_class_number[0] != int(attempts[-1]["classNumber"]):
        raise ValueError("row-10 accepted presentation failed Smith replay")
    return {
        "analyticState": [str(result[0]), str(result[1])],
        "inverseHR": [str(value) for value in inverse_hr],
        "attempts": attempts,
        "classGroup": {
            "classNumber": str(smith_class_number[0]),
            "invariantFactors": [str(value) for value in invariants[: smith_state[1]]],
            "presentation": [str(value) for value in h],
            "smithWork": [str(value) for value in smith_work],
            "smithState": [str(value) for value in smith_state],
        },
    }
