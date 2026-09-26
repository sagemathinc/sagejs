from sagejs.native import int64, native


@native
def safe_constant_range() -> int64:
    index: int64 = 0
    last: int64 = -1
    for index in range(9):
        last = index
    return last


@native
def safe_constant_range_with_continue() -> int64:
    index: int64 = 0
    last: int64 = -1
    for index in range(9):
        if index < 8:
            continue
        last = index
    return last


@native
def dynamic_range(start: int64, stop: int64, step: int64) -> int64:
    index: int64 = start
    last: int64 = start
    for index in range(start, stop, step):
        last = index
    return last


@native
def near_overflow_constant_range() -> int64:
    index: int64 = 0
    last: int64 = 0
    for index in range(9223372036854775806, 9223372036854775807, 2):
        last = index
    return last


@native
def stale_control_flow_range(stop_input: int64) -> int64:
    stop: int64 = 1
    run: bool = True
    while run:
        stop = stop_input
        run = False
    index: int64 = 0
    for index in range(9223372036854775806, stop, 2):
        index = index
    return index


@native
def stale_branch_range(stop_input: int64, choose: bool) -> int64:
    stop: int64 = 1
    if choose:
        stop = stop_input
    index: int64 = 0
    for index in range(9223372036854775806, stop, 2):
        index = index
    return index
