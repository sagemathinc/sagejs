"""Small repeated-stage witness for the benchmark-only native clock."""

from sagejs.native import Int64Buffer, diagnostic_stage_switch, native


@native
def diagnostic_stage_clock_witness(
    output: Int64Buffer,
    rounds: int,
    fail: bool,
) -> int:
    if len(output) < 1 or rounds < 1:
        raise ValueError("invalid diagnostic witness input")
    total = 0
    diagnostic_stage_switch(1)
    for value in range(rounds):
        total += value & 7
    diagnostic_stage_switch(2)
    total += 11
    diagnostic_stage_switch(3)
    total += 13
    diagnostic_stage_switch(2)
    total += 17
    diagnostic_stage_switch(3)
    total += 19
    diagnostic_stage_switch(2)
    total += 23
    diagnostic_stage_switch(3)
    total += 29
    if fail:
        raise ValueError("requested diagnostic witness failure")
    diagnostic_stage_switch(4)
    output[0] = total
    return total


__all__ = ["diagnostic_stage_clock_witness"]
