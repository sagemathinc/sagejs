"""Bounded adapter contracts needed by the row-19 production continuation.

This module does not compute a class group.  It isolates four structural
requirements that the generic mixed-cubic connector did not previously
express: recursive CUP capacity, nonempty dependent-row retention, sparse
terminal acceptance events, and native dense reverse selection.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native


ROW19_ROWS = 424
ROW19_FIRST_COLUMNS = 423
ROW19_FIRST_H_ROWS = 9
ROW19_FIRST_DEP_ROWS = 7
ROW19_FIRST_B_COLUMNS = 408
ROW19_FIRST_ZERO_COLUMNS = 6
ROW19_FIRST_REMOVED_UNITS = 65


@native
def pari_row19_cup_capacity_contract(
    rows: int,
    columns: int,
    supplied_entries: int,
    state: Int64Buffer,
) -> int:
    """Publish the translated CUP capacity and report whether it is present.

    `state` is `[rows, columns, frame_capacity, depth, required, supplied]`.
    Status 0 means sufficient and status 1 means short.  Invalid dimensions
    raise before mutating `state`.
    """
    if rows < 0 or columns < 0 or supplied_entries < 0 or len(state) < 6:
        raise ValueError("invalid row19 CUP capacity contract")
    frame_capacity = rows * columns
    if frame_capacity < 1:
        frame_capacity = 1
    if rows > frame_capacity:
        frame_capacity = rows
    if columns > frame_capacity:
        frame_capacity = columns
    depth = rows // 4 + 1
    required = 8 * frame_capacity * depth
    state[0] = rows
    state[1] = columns
    state[2] = frame_capacity
    state[3] = depth
    state[4] = required
    state[5] = supplied_entries
    if supplied_entries < required:
        return 1
    return 0


@native
def pari_row19_first_hnf_contract(
    hnf_state: Int64Buffer,
    h: IntegerBuffer,
    dependent: IntegerBuffer,
    trailing: IntegerBuffer,
    retained_dependent: IntegerBuffer,
    shape: Int64Buffer,
) -> int:
    """Validate and retain the authentic row-19 first-HNF block boundary.

    Unlike the older initial connector, this contract requires and copies all
    seven dependent rows.  `shape` publishes `[rows, columns, H rows,
    dependent rows, B columns, zero columns, removed units, retained]`.
    """
    if (
        len(hnf_state) < 9
        or len(h) < ROW19_FIRST_H_ROWS * ROW19_FIRST_H_ROWS
        or len(dependent) < ROW19_FIRST_DEP_ROWS * ROW19_FIRST_H_ROWS
        or len(trailing)
        < (ROW19_FIRST_H_ROWS + ROW19_FIRST_DEP_ROWS) * ROW19_FIRST_B_COLUMNS
        or len(retained_dependent) < ROW19_FIRST_DEP_ROWS * ROW19_FIRST_H_ROWS
        or len(shape) < 8
    ):
        raise ValueError("short row19 first-HNF contract owner")
    if (
        hnf_state[0] != ROW19_FIRST_H_ROWS
        or hnf_state[1] != 15
        or hnf_state[2] != ROW19_FIRST_B_COLUMNS
        or hnf_state[3] != ROW19_FIRST_DEP_ROWS
        or hnf_state[4] != ROW19_FIRST_ZERO_COLUMNS
        or hnf_state[5] != ROW19_FIRST_REMOVED_UNITS
        or hnf_state[6] != 0
        or hnf_state[7] != ROW19_FIRST_COLUMNS
        or hnf_state[8] != 0
    ):
        raise ValueError("unexpected row19 first-HNF state")
    for i in range(ROW19_FIRST_DEP_ROWS * ROW19_FIRST_H_ROWS):
        retained_dependent[i] = dependent[i]
    shape[0] = ROW19_ROWS
    shape[1] = ROW19_FIRST_COLUMNS
    shape[2] = ROW19_FIRST_H_ROWS
    shape[3] = ROW19_FIRST_DEP_ROWS
    shape[4] = ROW19_FIRST_B_COLUMNS
    shape[5] = ROW19_FIRST_ZERO_COLUMNS
    shape[6] = ROW19_FIRST_REMOVED_UNITS
    shape[7] = ROW19_FIRST_COLUMNS
    return 0


@native
def pari_row19_terminal_acceptance_contract(
    hnf_terminal: Int64Buffer,
    hnf_count: int,
    acceptance_hnf_ordinal: Int64Buffer,
    acceptance_codes: Int64Buffer,
    acceptance_count: int,
    state: Int64Buffer,
) -> int:
    """Bind acceptance events to HNF ordinals rather than array positions.

    Row 19 has two successful HNF events but only one acceptance event, code
    zero at the terminal HNF.  Status 0 means terminal acceptance.  The event
    streams are completely validated before `state` is touched.
    """
    if (
        hnf_count < 1
        or acceptance_count < 1
        or len(hnf_terminal) < hnf_count
        or len(acceptance_hnf_ordinal) < acceptance_count
        or len(acceptance_codes) < acceptance_count
        or len(state) < 5
    ):
        raise ValueError("short row19 acceptance contract owner")
    terminal_count = 0
    terminal_ordinal = -1
    for i in range(hnf_count):
        terminal = hnf_terminal[i]
        if terminal != 0 and terminal != 1:
            raise ValueError("invalid row19 HNF terminal marker")
        if terminal == 1:
            terminal_count += 1
            terminal_ordinal = i
    if terminal_count != 1 or terminal_ordinal != hnf_count - 1:
        raise ValueError("row19 requires one final terminal HNF")
    previous = -1
    terminal_code = -1
    for i in range(acceptance_count):
        ordinal = acceptance_hnf_ordinal[i]
        code = acceptance_codes[i]
        if ordinal <= previous or ordinal < 0 or ordinal >= hnf_count:
            raise ValueError("invalid row19 acceptance ordinal")
        if hnf_terminal[ordinal] == 0:
            raise ValueError("acceptance attached to nonterminal HNF")
        if code != 0 and code != 1:
            raise ValueError("invalid row19 acceptance code")
        previous = ordinal
        terminal_code = code
    if previous != terminal_ordinal:
        raise ValueError("row19 terminal HNF lacks acceptance event")
    state[0] = hnf_count
    state[1] = acceptance_count
    state[2] = terminal_ordinal
    state[3] = terminal_code
    state[4] = 1
    return terminal_code


@native
def pari_row19_dense_reverse_selection(
    transform: IntegerBuffer,
    selected: IntegerBuffer,
    width: int,
    targets: int,
    output: IntegerBuffer,
) -> int:
    """Apply a column-major exact transform transpose to selected vectors.

    This is the dense inner operation used when reversing selected terminal
    columns through an HNF transform.  Keeping the loop in one native call
    avoids a 423-by-423 Python dispatch boundary while preserving arbitrary
    precision coefficients.  Input and output owners must be disjoint.
    """
    if (
        width < 1
        or width > 430
        or targets < 1
        or targets > 16
        or len(transform) < width * width
        or len(selected) < width * targets
        or len(output) < width * targets
    ):
        raise ValueError("invalid row19 dense reverse-selection owner")
    for target in range(targets):
        base = target * width
        for source in range(width):
            value = 0
            for column in range(width):
                value += transform[column * width + source] * selected[base + column]
            output[base + source] = value
    return 0
