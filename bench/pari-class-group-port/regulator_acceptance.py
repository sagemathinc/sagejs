"""Connected PARI regulator multiple and reconstruction, prepared boundary.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This closes two numerical calls, not buchall's collection/precision loop.
Positive zeta_factor=h*invhr and cache_changed=(cache.last!=old_cache) are
prepared inputs. Old-need/failure counters, precision changes, GRH decisions
and outer stopping policy remain with the caller; acceptance is heuristic.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .regulator_multiple import pari_regulator_multiple
from .regulator_reconstruction import pari_regulator_reconstruction
from .regulator_scalar import pari_validate_regulator_values


@native
def pari_regulator_acceptance(
    logs: IntegerBuffer,
    rows: int,
    columns: int,
    degree: int,
    prepared: IntegerBuffer,
    selected: Int64Buffer,
    prep_state: Int64Buffer,
    rank_work: IntegerBuffer,
    rank_occupied: Int64Buffer,
    rank_pivots: Int64Buffer,
    rank_state: Int64Buffer,
    integer_input: IntegerBuffer,
    integer_work: IntegerBuffer,
    integer_occupied: IntegerBuffer,
    integer_pivots: IntegerBuffer,
    integer_best: IntegerBuffer,
    integer_state: IntegerBuffer,
    basis: IntegerBuffer,
    minor: IntegerBuffer,
    det_work: IntegerBuffer,
    det_result: IntegerBuffer,
    det_pivots: Int64Buffer,
    det_state: Int64Buffer,
    inverse_work: IntegerBuffer,
    inverse_rhs: IntegerBuffer,
    inverse: IntegerBuffer,
    inverse_pivots: Int64Buffer,
    inverse_state: Int64Buffer,
    product: IntegerBuffer,
    inverse_slice: IntegerBuffer,
    multiple: IntegerBuffer,
    coordinates: IntegerBuffer,
    multiple_state: Int64Buffer,
    zeta_factor: IntegerBuffer,
    rational_work: IntegerBuffer,
    lattice: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_column: IntegerBuffer,
    hnf_output: IntegerBuffer,
    hnf_state: Int64Buffer,
    regulator: IntegerBuffer,
    relations: IntegerBuffer,
    denominator: IntegerBuffer,
    reconstruction_state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
    cache_changed: bool,
    acceptance_state: Int64Buffer,
) -> int:
    """Return action; acceptance state is [stage, action, raw stage status].

    Actions: 0 accepted; 1 NULL-lambda/bestappr precision request;
    2 NULL-R/regulator precision request; 3 remaining unit-rank defect;
    4 unchanged cache (need=1); 5 reconstruction RELAT (need=1);
    6 reconstruction PRECI (caller must apply its precision/GRH policy).
    Negative arithmetic/dispatch frontiers retain their raw stage status.
    Stages1/2 identify multiple/reconstruction, with stage0 before calls.

    Both stage state owners remain visible. Reconstruction owners are not
    touched on pre-reconstruction exits. Multiple/coordinates remain useful
    diagnostic outputs after a later rejection; final regulator/relations
    publish only on acceptance. Owners are disjoint. Invalid late stage
    buffers can reject after multiple has run; arithmetic failures can leave
    partial scratch. This entry neither certifies nor iterates.
    """
    if len(acceptance_state) < 3:
        raise ValueError("short regulator acceptance state")
    pari_validate_regulator_values(zeta_factor, 1)
    if zeta_factor[0] <= 0 or zeta_factor[1] < 64:
        raise ValueError("acceptance requires positive prepared real zeta factor")
    acceptance_state[0] = 1
    acceptance_state[1] = -1
    acceptance_state[2] = -1
    status = pari_regulator_multiple(
        logs,
        rows,
        columns,
        degree,
        prepared,
        selected,
        prep_state,
        rank_work,
        rank_occupied,
        rank_pivots,
        rank_state,
        integer_input,
        integer_work,
        integer_occupied,
        integer_pivots,
        integer_best,
        integer_state,
        basis,
        minor,
        det_work,
        det_result,
        det_pivots,
        det_state,
        inverse_work,
        inverse_rhs,
        inverse,
        inverse_pivots,
        inverse_state,
        product,
        inverse_slice,
        multiple,
        coordinates,
        multiple_state,
    )
    acceptance_state[2] = status
    if status < 0:
        acceptance_state[1] = status
        return status
    # buchall checks lambda before checking R, even for a rank defect.
    if multiple_state[3] == 0:
        acceptance_state[1] = 1
        return 1
    if status != 0:
        if multiple_state[1] == 0:
            acceptance_state[1] = 2
            return 2
        acceptance_state[1] = 3
        return 3
    if not cache_changed:
        multiple_state[1] = 1
        acceptance_state[1] = 4
        return 4
    acceptance_state[0] = 2
    acceptance_state[2] = -1
    status = pari_regulator_reconstruction(
        coordinates,
        rows - 1,
        columns,
        multiple,
        zeta_factor,
        rational_work,
        lattice,
        hnf_work,
        hnf_column,
        hnf_output,
        hnf_state,
        regulator,
        relations,
        denominator,
        reconstruction_state,
        hnf_row_pivots,
        hnf_heights,
    )
    acceptance_state[2] = status
    if status < 0:
        acceptance_state[1] = status
        return status
    if status == 1:
        multiple_state[1] = 1
        acceptance_state[1] = 5
        return 5
    if status == 3:
        acceptance_state[1] = 6
        return 6
    acceptance_state[1] = 0
    return 0
