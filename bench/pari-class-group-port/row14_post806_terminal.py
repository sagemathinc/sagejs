"""Source-ordered acceptance, honesty dispatch, and Smith tail for row 14.

This entry starts at an already-published live HNF owner.  It deliberately
does not collect relations, reconstruct an HNF from frozen data, or accept a
regulator/class-group answer as input.  Analytic inverse-`hR` preparation is
performed by the host from prepared field data before this entry.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native

from .analytic_inverse_hr import pari_analytic_inverse_hr
from .class_invariant_output import pari_class_invariant_output
from .discriminant_log import pari_discriminant_log
from .post_hnf_acceptance import pari_post_hnf_acceptance


@native
def pari_row14_analytic_inverse_hr(
    discriminant: int,
    real_places: int,
    complex_places: int,
    roots_of_unity: int,
    log_discriminant: Float64Buffer,
    primes: IntegerBuffer,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    coefficients: Float64Buffer,
    table: Float64Buffer,
    tail: Float64Buffer,
    logarithms: Float64Buffer,
    log_inverse_residue: Float64Buffer,
    inverse_residue: IntegerBuffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    inverse_hr: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Derive inverse-`hR` from exact field data and a degree catalog."""
    if len(log_discriminant) < 1 or len(inverse_hr) < 3 or len(state) < 2:
        raise ValueError("short row-14 analytic result owner")
    magnitude = abs(discriminant)
    log_discriminant[0] = pari_discriminant_log(magnitude)
    bound, processed, hm, hp, he = pari_analytic_inverse_hr(
        magnitude,
        real_places,
        complex_places,
        roots_of_unity,
        log_discriminant,
        primes,
        offsets,
        counts,
        degrees,
        multiplicities,
        coefficients,
        table,
        tail,
        logarithms,
        log_inverse_residue,
        inverse_residue,
        exp_cache,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    inverse_hr[0] = hm
    inverse_hr[1] = hp
    inverse_hr[2] = he
    state[0] = bound
    state[1] = processed
    return 0


@native
def pari_row14_post806_terminal(
    factor_count: int,
    h_rows: int,
    b_columns: int,
    c_columns: int,
    places: int,
    degree: int,
    h: IntegerBuffer,
    c: IntegerBuffer,
    inverse_hr: IntegerBuffer,
    logs: IntegerBuffer,
    tentative_class_number: IntegerBuffer,
    zeta_factor: IntegerBuffer,
    post_hnf_state: Int64Buffer,
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
    rational_work: IntegerBuffer,
    lattice: IntegerBuffer,
    regulator_hnf_work: IntegerBuffer,
    regulator_hnf_column: IntegerBuffer,
    regulator_hnf_output: IntegerBuffer,
    regulator_hnf_state: Int64Buffer,
    regulator: IntegerBuffer,
    unit_relations: IntegerBuffer,
    denominator: IntegerBuffer,
    reconstruction_state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
    cache_changed: bool,
    acceptance_state: Int64Buffer,
    factor_base_state: IntegerBuffer,
    preparation_state: Int64Buffer,
    smith_work: IntegerBuffer,
    smith_column: IntegerBuffer,
    invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    smith_state: Int64Buffer,
    terminal_state: Int64Buffer,
) -> int:
    """Return zero only after acceptance, honesty skip, and Smith output.

    `terminal_state` is status/action, dimension need, zero columns,
    honesty-required, invariant count, accepted relation columns,
    full-transform-complete, generator-witness-complete, acceptance stage,
    and raw acceptance status.  The two completeness flags intentionally stay
    zero: this narrow tail computes invariant factors but not `U/V` or ideal
    generator/principal-relation witnesses.
    """
    if len(terminal_state) < 10:
        raise ValueError("short row-14 terminal state")
    if len(factor_base_state) < 7 or len(preparation_state) < 8:
        raise ValueError("short row-14 honesty authority")
    for i in range(10):
        terminal_state[i] = 0
    terminal_state[0] = -1
    terminal_state[6] = 0
    terminal_state[7] = 0

    action = pari_post_hnf_acceptance(
        factor_count,
        h_rows,
        b_columns,
        c_columns,
        places,
        degree,
        h,
        c,
        inverse_hr,
        logs,
        tentative_class_number,
        zeta_factor,
        post_hnf_state,
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
        rational_work,
        lattice,
        regulator_hnf_work,
        regulator_hnf_column,
        regulator_hnf_output,
        regulator_hnf_state,
        regulator,
        unit_relations,
        denominator,
        reconstruction_state,
        hnf_row_pivots,
        hnf_heights,
        cache_changed,
        acceptance_state,
    )
    terminal_state[0] = action
    terminal_state[1] = post_hnf_state[0]
    terminal_state[2] = post_hnf_state[1]
    terminal_state[5] = c_columns
    terminal_state[8] = acceptance_state[0]
    terminal_state[9] = acceptance_state[2]
    if action != 0:
        return action

    c1 = factor_base_state[0]
    c2 = factor_base_state[1]
    kc = factor_base_state[2]
    kcz = factor_base_state[3]
    kcz2 = factor_base_state[4]
    kc2 = factor_base_state[5]
    factor_product = factor_base_state[6]
    if (
        preparation_state[0] < 3
        or preparation_state[2] != kc
        or preparation_state[3] != kcz
        or c1 < 2
        or c2 < c1
        or kc < 0
        or kcz < 0
        or kcz2 < kcz
        or kc2 < kc
        or kcz > kc
        or kcz2 > kc2
        or factor_product <= 0
    ):
        terminal_state[0] = -2
        return -2
    if kcz2 > kcz:
        terminal_state[0] = 7
        terminal_state[3] = 1
        return 7

    status = pari_class_invariant_output(
        h,
        h_rows,
        smith_work,
        smith_column,
        invariants,
        class_number,
        smith_state,
    )
    if status != 0:
        terminal_state[0] = status
        return status
    terminal_state[0] = 0
    terminal_state[4] = smith_state[1]
    return 0


__all__ = ["pari_row14_analytic_inverse_hr", "pari_row14_post806_terminal"]
