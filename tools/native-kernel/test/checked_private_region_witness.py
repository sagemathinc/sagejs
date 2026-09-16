from sagejs.native import (
    Int64Buffer,
    UInt64Buffer,
    int64,
    native,
    uint64,
    uint64_buffer_view,
)


@native
def checked_region_int64_entry(
    storage: Int64Buffer, count: int64, value: int64
) -> int64:
    index: int64 = 0
    total: int64 = 0
    for index in range(count):
        storage[index] = value
        total += storage[index]
    return total


def checked_region_helper(storage: UInt64Buffer, index: int64, value: uint64) -> int64:
    storage[index] = value
    saved: uint64 = storage[index]
    shifted: int64 = index + 1
    doubled: int64 = shifted * 2
    result: int64 = doubled - 1
    return result


@native
def checked_region_entry(storage: UInt64Buffer, index: int64, value: uint64) -> int64:
    return checked_region_helper(storage, index, value)


@native
def checked_region_ambiguous_entry(
    storage: UInt64Buffer,
    index: int64,
    other_index: int64,
    value: uint64,
) -> int64:
    first: int64 = checked_region_helper(storage, index, value)
    return first + checked_region_helper(storage, other_index, value)


@native
def checked_region_loop_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    shifted: int64 = 0
    for index in range(count):
        storage[index] = value
        shifted = index + 1
    return shifted


@native
def checked_region_carried_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    cursor: int64 = 0
    for index in range(count):
        storage[cursor] = value
        cursor += 1
    return cursor


@native
def checked_region_mutated_bound_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(count):
        storage[index] = value
        count -= 1
    return count


@native
def checked_region_unknown_step_entry(
    storage: UInt64Buffer, count: int64, step: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(0, count, step):
        storage[index] = value
    return index


@native
def checked_region_unsupported_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    result: int64 = checked_region_helper(storage, count, value)
    while count > 0:
        result = checked_region_helper(storage, count, value)
        count -= 1
    return result


@native
def checked_region_branch_entry(
    storage: UInt64Buffer, index: int64, choose: bool, value: uint64
) -> int64:
    offset: int64 = 0
    if choose:
        offset = index + 1
    else:
        offset = index + 2
    storage[offset] = value
    return offset


@native
def checked_region_span_entry(
    storage: UInt64Buffer, start: int64, length: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, length)
    index: int64 = 0
    total: uint64 = 0
    for index in range(length):
        total += view[index]
    return total


@native
def checked_region_fixed_view_entry(
    storage: UInt64Buffer, start: int64, value: uint64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, 2)
    index: int64 = 0
    for index in range(2):
        view[index] = value
    return value + value


@native
def checked_region_fixed_view_index_entry(
    storage: UInt64Buffer, index: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, 0, 2)
    return view[index]


@native
def checked_region_fixed_view_uint_index_entry(
    storage: UInt64Buffer, index: uint64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, 0, 2)
    return view[index]


@native
def checked_region_fixed_view_integer_index_entry(
    storage: UInt64Buffer, index: Integer
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, 0, 2)
    return view[index]


@native
def checked_region_validated_view_entry(
    storage: UInt64Buffer,
    other: UInt64Buffer,
    start: int64,
    length: int64,
    index: int64,
    value: uint64,
) -> uint64:
    sagejs_virtual_uint64_data_0: uint64 = 0
    sagejs_virtual_uint64_length_0: uint64 = 0
    view: UInt64Buffer = uint64_buffer_view(storage, start, length)
    alias = view
    storage = other
    start = 0
    length = 0
    alias[index] = value
    return view[index] + sagejs_virtual_uint64_data_0 + sagejs_virtual_uint64_length_0


@native
def checked_region_validated_integer_view_entry(
    storage: UInt64Buffer, start: Integer, length: Integer, index: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, length)
    return view[index]


@native
def checked_region_graph_span_helper(
    storage: UInt64Buffer, start: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, 2)
    return view[0]


@native
def checked_region_graph_span_entry(storage: UInt64Buffer) -> uint64:
    return checked_region_graph_span_helper(storage, 2)


@native
def checked_region_graph_span_mutable_helper(
    storage: UInt64Buffer, start: int64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, 2)
    return view[0]


@native
def checked_region_graph_span_mutable_entry(
    storage: UInt64Buffer, count: int64
) -> uint64:
    start: int64 = 2
    result: uint64 = 0
    while count > 0:
        result = checked_region_graph_span_mutable_helper(storage, start)
        start += 1
        count -= 1
    return result


@native
def checked_region_two_validated_views_entry(
    storage: UInt64Buffer,
    first_start: int64,
    second_start: int64,
    value: uint64,
) -> uint64:
    first: UInt64Buffer = uint64_buffer_view(storage, first_start, 1)
    second: UInt64Buffer = uint64_buffer_view(storage, second_start, 1)
    first[0] = value
    second[0] = value
    return first[0] + second[0]


@native
def checked_region_local_copy_helper(
    storage: UInt64Buffer, start: int64, degree: int64, output: int64
) -> int64:
    source: UInt64Buffer = uint64_buffer_view(storage, start, 4)
    target: UInt64Buffer = uint64_buffer_view(storage, output, 4)
    index: int64 = 0
    if output > start:
        descending_start: int64 = degree
        descending_stop: int64 = -1
        descending_step: int64 = -1
        for index in range(descending_start, descending_stop, descending_step):
            target[index] = source[index]
    else:
        prefix_stop: int64 = degree + 1
        for index in range(prefix_stop):
            target[index] = source[index]
    tail_start: int64 = degree + 1
    tail_stop: int64 = 4
    for index in range(tail_start, tail_stop):
        target[index] = 0
    return degree


@native
def checked_region_local_copy_entry(
    storage: UInt64Buffer, start: int64, degree: int64, output: int64
) -> int64:
    return checked_region_local_copy_helper(storage, start, degree, output)


@native
def checked_region_direct_copy_entry(
    storage: UInt64Buffer, start: int64, degree: int64, output: int64
) -> int64:
    sentinel: UInt64Buffer = uint64_buffer_view(storage, 11, 1)
    sentinel_value: uint64 = sentinel[0]
    sentinel[0] = sentinel_value
    result: int64 = checked_region_local_copy_helper(storage, 0, 3, 4)
    result = checked_region_local_copy_helper(storage, 4, 3, 0)
    result = checked_region_local_copy_helper(storage, 2, -1, 6)
    result = checked_region_local_copy_helper(storage, start, degree, output)
    return result


@native
def checked_region_unit_range_entry(
    start: int64, stop: int64, descending: bool, skip: bool
) -> int64:
    index: int64 = start
    last: int64 = start
    if descending:
        negative_one: int64 = -1
        for index in range(start, stop, negative_one):
            if skip:
                continue
            last = index
    else:
        for index in range(start, stop):
            if skip:
                continue
            last = index
    return last


@native
def checked_region_unit_range_index_write_entry(start: int64, stop: int64) -> int64:
    index: int64 = start
    for index in range(start, stop):
        index = stop
        continue
    return index


@native
def checked_region_nested_unit_range_entry(
    outer_stop: int64, inner_stop: int64
) -> int64:
    index: int64 = 0
    for index in range(outer_stop):
        for index in range(inner_stop):
            continue
        continue
    return index


@native
def checked_region_refined_copy_entry(
    storage: UInt64Buffer, degree: int64, count: int64
) -> int64:
    if degree < -1:
        raise ValueError("degree is below the local copy range")
    if degree > 3:
        raise ValueError("degree is above the local copy range")
    index: int64 = 0
    for index in range(count):
        sentinel: uint64 = storage[11]
        storage[11] = sentinel
    return checked_region_local_copy_helper(storage, 0, degree, 4)


@native
def checked_region_or_refined_copy_entry(storage: UInt64Buffer, degree: int64) -> int64:
    if degree < -1 or degree > 3:
        raise ValueError("degree is outside the local copy range")
    return checked_region_local_copy_helper(storage, 0, degree, 4)


@native
def checked_region_summary_identity(value: int64, fail: bool) -> int64:
    if fail:
        raise ValueError("summary identity failure")
    return value


@native
def checked_region_summary_wrapper(value: int64, fail: bool) -> int64:
    return checked_region_summary_identity(value, fail)


@native
def checked_region_summary_entry(
    storage: UInt64Buffer, degree: int64, fail: bool
) -> int64:
    summarized: int64 = checked_region_summary_wrapper(degree, fail)
    adjusted: int64 = summarized + 1
    observed: uint64 = storage[summarized]
    view: UInt64Buffer = uint64_buffer_view(storage, 0, 9)
    index: int64 = 0
    for index in range(summarized):
        observed = view[index]
    return checked_region_local_copy_helper(storage, 0, summarized, 4)


@native
def checked_region_summary_view_helper(storage: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, 2)
    return view[0]


@native
def checked_region_summary_view_entry(
    storage: UInt64Buffer, start: int64, fail: bool
) -> uint64:
    summarized: int64 = checked_region_summary_wrapper(start, fail)
    return checked_region_summary_view_helper(storage, summarized)


@native
def checked_region_guard_root_helper(storage: UInt64Buffer, start: int64) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, start, 2)
    return view[0]


@native
def checked_region_guard_root_entry(storage: UInt64Buffer, start: int64) -> uint64:
    return checked_region_guard_root_helper(storage, start)


@native
def checked_region_summary_interval(selector: int64) -> int64:
    if selector == 0:
        return 1
    if selector == 1:
        return 2
    raise ValueError("summary interval failure")


@native
def checked_region_summary_interval_entry(
    storage: UInt64Buffer, selector: int64
) -> int64:
    summarized: int64 = checked_region_summary_interval(selector)
    return checked_region_local_copy_helper(storage, 0, summarized, 4)


def checked_region_summary_affine_remainder(
    dividend_degree: int64,
    divisor_degree: int64,
    stop: int64,
    want_remainder: bool,
) -> int64:
    if dividend_degree < -1:
        raise ValueError("invalid synthetic dividend degree")
    if divisor_degree < 0:
        raise ValueError("invalid synthetic divisor degree")
    if dividend_degree < divisor_degree and divisor_degree != 0:
        if not want_remainder:
            return -1
        return dividend_degree
    if divisor_degree == 0 or not want_remainder:
        return -1
    degree: int64 = divisor_degree - 1
    while degree >= 0 and degree > stop:
        degree -= 1
    return degree


def checked_region_summary_affine_square(
    degree: int64, divisor_degree: int64, stop: int64
) -> int64:
    return checked_region_summary_affine_remainder(degree, divisor_degree, stop, True)


def checked_region_summary_affine_multiply(
    degree: int64, divisor_degree: int64, stop: int64
) -> int64:
    return checked_region_summary_affine_remainder(degree, divisor_degree, stop, True)


def checked_region_summary_local_bounded(
    degree: int64, divisor_degree: int64, stop: int64
) -> int64:
    if divisor_degree <= 0:
        raise ValueError("invalid synthetic divisor degree")
    return divisor_degree - 1


@native
def checked_region_summary_while_entry(
    storage: UInt64Buffer,
    degree: int64,
    divisor_degree: int64,
    exponent: int64,
    stop: int64,
) -> int64:
    bit: int64 = exponent
    while bit > 0:
        degree = checked_region_summary_affine_square(degree, divisor_degree, stop)
        checked_region_local_copy_helper(storage, 0, degree, 4)
        if bit % 2:
            degree = checked_region_summary_affine_multiply(
                degree, divisor_degree, stop
            )
            checked_region_local_copy_helper(storage, 0, degree, 4)
        bit -= 1
    return checked_region_local_copy_helper(storage, 4, degree, 0)


@native
def checked_region_summary_break_while_entry(
    storage: UInt64Buffer,
    degree: int64,
    divisor_degree: int64,
    exponent: int64,
    stop: int64,
) -> int64:
    bit: int64 = exponent
    source: int64 = 0
    destination: int64 = 4
    while bit > 0:
        degree = checked_region_summary_local_bounded(degree, divisor_degree, stop)
        checked_region_local_copy_helper(storage, source, degree, destination)
        if bit == 1:
            break
        degree = checked_region_summary_local_bounded(degree, divisor_degree, stop)
        checked_region_local_copy_helper(storage, source, degree, destination)
        bit -= 1
    return checked_region_local_copy_helper(storage, destination, degree, source)


@native
def checked_region_summary_while_degrading_entry(
    storage: UInt64Buffer,
    second: UInt64Buffer,
    third: UInt64Buffer,
    other: UInt64Buffer,
    degree: int64,
    divisor_degree: int64,
    exponent: int64,
    stop: int64,
) -> int64:
    bit: int64 = exponent
    while bit > 0:
        degree = checked_region_summary_affine_square(degree, divisor_degree, stop)
        checked_region_local_copy_helper(storage, 0, degree, 4)
        storage = second
        second = third
        third = other
        bit -= 1
    return degree


def checked_region_summary_partial_overflow(value: int64) -> int64:
    if value == 0:
        return 0
    return value + 1


@native
def checked_region_summary_partial_overflow_entry(
    storage: UInt64Buffer, value: int64
) -> int64:
    degree: int64 = checked_region_summary_partial_overflow(value)
    return checked_region_local_copy_helper(storage, 0, degree, 4)


def checked_region_summary_recomputed_threshold(value: int64, rounds: int64) -> int64:
    while value > value - 1 and rounds > 0:
        value -= 1
        rounds -= 1
    return value


@native
def checked_region_summary_recomputed_threshold_entry(
    storage: UInt64Buffer, value: int64, rounds: int64
) -> int64:
    degree: int64 = checked_region_summary_recomputed_threshold(value, rounds)
    return checked_region_local_copy_helper(storage, 0, degree, 4)


def checked_region_summary_nested_step(value: int64, rounds: int64) -> int64:
    step: int64 = 1
    while value > 0:
        if rounds > 0:
            step = 100
        value -= step
        rounds -= 1
    return value


@native
def checked_region_summary_nested_step_entry(
    storage: UInt64Buffer, value: int64, rounds: int64
) -> int64:
    degree: int64 = checked_region_summary_nested_step(value, rounds)
    return checked_region_local_copy_helper(storage, 0, degree, 4)


@native
def checked_region_direct_zero_helper() -> int64:
    return 17


@native
def checked_region_direct_zero_entry(dummy: int64) -> int64:
    return checked_region_direct_zero_helper()


@native
def checked_region_mutated_view_entry(
    storage: UInt64Buffer, other: UInt64Buffer, value: uint64
) -> uint64:
    view: UInt64Buffer = uint64_buffer_view(storage, 1, 2)
    view = other
    view[0] = value
    return view[0]


@native
def checked_region_rebound_root_entry(
    storage: UInt64Buffer,
    other: UInt64Buffer,
    start: int64,
    value: uint64,
) -> uint64:
    storage = other
    view: UInt64Buffer = uint64_buffer_view(storage, start, 2)
    view[0] = value
    return view[0]


@native
def checked_region_relational_scalar_entry(
    storage: UInt64Buffer, count: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(count):
        storage[index] = value
    return index


@native
def checked_region_relational_affine_entry(
    storage: UInt64Buffer, degree: int64, value: uint64
) -> int64:
    stop: int64 = degree + 1
    index: int64 = 0
    for index in range(stop):
        storage[index] = value
    return index


@native
def checked_region_relational_product_entry(
    storage: UInt64Buffer, count: int64, degree: int64, value: uint64
) -> int64:
    capacity: int64 = count * degree
    index: int64 = 0
    for index in range(capacity):
        storage[index] = value
    return index


@native
def checked_region_relational_mismatch_entry(
    storage: UInt64Buffer, count: int64, other: int64, value: uint64
) -> int64:
    index: int64 = 0
    for index in range(other):
        storage[index] = value
    return index


@native
def checked_region_relational_short_entry(
    storage: UInt64Buffer, count: int64, choose: bool, value: uint64
) -> int64:
    stop: int64 = count
    selected: bool = choose and count > 0
    index: int64 = 0
    for index in range(stop):
        if selected:
            storage[index] = value
    return index
