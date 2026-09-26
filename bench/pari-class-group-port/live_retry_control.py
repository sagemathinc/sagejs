"""Answer-independent storage and precision controls for the live class root.

The formulas are the caller-visible forms of two PARI 2.17.4 policies:

* a factor-base entry is selected from at most `degree * prime_count`
  generated catalog slots; and
* `Buchall_param` advances precision from the current failed attempt. It
  never selects a precision known in advance to succeed.

Precision values here are storage bit capacities, rounded to 64-bit words.
"""

from sagejs.native import Int64Buffer, native


_WORD_BITS = 64
_PRECI = 3
_CLEANARCH = 4


@native
def pari_round_storage_precision(bits: int) -> int:
    """Round a positive bit request to one 64-bit PARI storage word."""
    if bits < 1 or bits > 1048576:
        raise ValueError("precision request is outside the reviewed corridor")
    return ((bits + _WORD_BITS - 1) // _WORD_BITS) * _WORD_BITS


@native
def pari_live_root_capacity_policy(
    degree: int,
    prime_count: int,
    additional_relations: int,
    padding: int,
    state: Int64Buffer,
) -> int:
    """Derive owner capacities from live input dimensions, never observed KC.

    `state` receives catalog slots, factor-base owner capacity, and PARI's
    source relation-cache capacity `10*(slots+additional)+50`. The latter is
    conservative because the selected factor base cannot exceed `slots`.
    """
    if len(state) < 3:
        raise ValueError("short live capacity state")
    if (
        degree < 1
        or degree > 64
        or prime_count < 1
        or prime_count > 1000000
        or additional_relations < 0
        or additional_relations > 1000000
        or padding < 0
        or padding > 1048576
    ):
        raise ValueError("live capacity input is outside the reviewed corridor")
    slots = degree * prime_count
    factor_capacity = slots + padding
    relation_capacity = 10 * (slots + additional_relations) + 50 + padding
    state[0] = slots
    state[1] = factor_capacity
    state[2] = relation_capacity
    return 0


@native
def pari_live_retry_transition(
    reason: int,
    current_precision: int,
    arch_exponent: int,
    arch_precision: int,
    flagged: int,
    state: Int64Buffer,
) -> int:
    """Compute one retry from a live failure and pinned PARI policy.

    Reason 3 is `fupb_PRECI` and mirrors `myprecdbl`. Reason 4 is the
    subsequent `cleanarch` failure and mirrors its live `gexpo` /
    `gprecision` increment. The output is only the *next* attempt; success
    must be reported by executing that attempt.
    """
    if len(state) < 6:
        raise ValueError("short live retry state")
    if (
        current_precision < 64
        or current_precision > 1048576
        or current_precision % 64 != 0
        or arch_precision < 0
        or arch_precision > 1048576
        or arch_precision % 64 != 0
        or flagged < 0
        or flagged > 1
    ):
        raise ValueError("invalid live retry input")
    raw = 0
    increment = 0
    if reason == _PRECI:
        if current_precision < 1280:
            raw = 2 * current_precision
        else:
            raw = (3 * current_precision) // 2
        if flagged:
            if arch_exponent < 0 or arch_exponent > 1048576:
                raise ValueError("invalid PRECI arch exponent")
            arch_target = current_precision + pari_round_storage_precision(
                arch_exponent
            )
            upper = 3 * raw
            if arch_target > upper:
                arch_target = upper
            if arch_target > raw:
                raw = arch_target
        increment = raw - current_precision
    elif reason == _CLEANARCH:
        if arch_exponent < -63 or arch_exponent > 1048512:
            raise ValueError("invalid cleanarch exponent")
        required = pari_round_storage_precision(arch_exponent + 64)
        increment = required - arch_precision
        if increment < 1:
            increment = 1
        raw = current_precision + increment
    else:
        raise ValueError("retry requires a live PRECI or cleanarch failure")
    target = pari_round_storage_precision(raw)
    if target <= current_precision:
        raise ValueError("retry policy did not increase precision")
    state[0] = reason
    state[1] = current_precision
    state[2] = raw
    state[3] = target
    state[4] = target - current_precision
    state[5] = 1
    return 0


__all__ = [
    "pari_live_retry_transition",
    "pari_live_root_capacity_policy",
    "pari_round_storage_precision",
]
