"""Compose an h=1 terminal root from live class and factor-base counters."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .honesty_equal_bound import pari_honesty_dispatch_from_factor_base


class H1TerminalFailure(ValueError):
    """The live attempt cannot publish the bounded h=1 terminal root."""


@dataclass(frozen=True)
class H1HonestyTerminal:
    """Immutable root joining the live h=1 and honesty decisions."""

    class_number: int
    invariant_count: int
    accepted_relations: int
    relation_bound: int
    checking_bound: int
    relation_groups: int
    checking_groups: int
    honesty_status: str


def _integers(value: Any, name: str, minimum: int) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise H1TerminalFailure(name + " must be a sequence")
    if len(value) < minimum:
        raise H1TerminalFailure(name + " is too short")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise H1TerminalFailure(name + " contains a non-integer")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise H1TerminalFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise H1TerminalFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def compose_h1_honesty_terminal(live_attempt: Mapping[str, Any]) -> H1HonestyTerminal:
    """Publish only from a completed live h=1 attempt with no honesty gap.

    The only input is the live resident attempt object. The honesty label is
    computed internally from its `prep_base_state` and `prep_state`; callers
    cannot inject a skip or success bit.
    """
    if not isinstance(live_attempt, Mapping):
        raise H1TerminalFailure("live attempt must be a mapping")
    try:
        base = _integers(live_attempt["prep_base_state"], "factor-base state", 7)
        preparation = _integers(live_attempt["prep_state"], "preparation state", 8)
        attempt = _integers(live_attempt["attempt_state"], "attempt state", 4)
        class_number = _integers(live_attempt["class_number"], "class number", 1)
        invariants = _integers(live_attempt["class_invariants"], "class invariants", 0)
        relation = _integers(live_attempt["relation_state"], "relation state", 6)
    except KeyError as error:
        raise H1TerminalFailure("live attempt is missing a required owner") from error

    if attempt[0] != 4 or attempt[1] != 0:
        raise H1TerminalFailure("class attempt is not terminal")
    invariant_count = attempt[2]
    if invariant_count < 0 or invariant_count > len(invariants):
        raise H1TerminalFailure("invalid live invariant count")
    if class_number[0] != 1 or invariant_count != 0:
        raise H1TerminalFailure("live class quotient is not trivial")
    if relation[0] <= 0 or relation[0] != relation[5]:
        raise H1TerminalFailure("live relation publication is incomplete")

    try:
        honesty = pari_honesty_dispatch_from_factor_base(base, preparation)
    except ValueError as error:
        raise H1TerminalFailure("live honesty counters rejected") from error
    if honesty.requires_honesty:
        raise H1TerminalFailure("live factor base still requires honesty")

    return H1HonestyTerminal(
        class_number=class_number[0],
        invariant_count=invariant_count,
        accepted_relations=relation[0],
        relation_bound=honesty.relation_bound,
        checking_bound=honesty.checking_bound,
        relation_groups=honesty.relation_groups,
        checking_groups=honesty.checking_groups,
        honesty_status=honesty.status,
    )
