"""Witness that keeps diagnostic markers in only a selected call-graph node."""

from sagejs.native import diagnostic_stage_switch, native


@native
def diagnostic_stage_clock_marker_filter_helper(value: int) -> int:
    diagnostic_stage_switch(2)
    return value + 1


@native
def diagnostic_stage_clock_marker_filter_witness(value: int) -> int:
    diagnostic_stage_switch(1)
    return diagnostic_stage_clock_marker_filter_helper(value)


__all__ = ["diagnostic_stage_clock_marker_filter_witness"]
