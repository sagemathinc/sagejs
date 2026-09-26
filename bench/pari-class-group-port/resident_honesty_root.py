"""Conditional resident root for equal- and frozen unequal-bound honesty."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .honesty_equal_bound import pari_honesty_dispatch_from_factor_base
from .honesty_scheduler import (
    pari_honesty_begin_frozen,
    pari_honesty_resume_frozen,
)


class ResidentHonestyFailure(ValueError):
    """Live honesty state or a probe result violated the root contract."""


@dataclass(frozen=True)
class ResidentHonestyResult:
    """Inspectable result of the conditional resident honesty root."""

    status: str
    success: bool | None
    initial_kcz: int
    final_kcz: int
    kcz2: int
    probes: int
    random_draws: int
    final_norm: int


def _integers(value: Any, name: str, minimum: int) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise ResidentHonestyFailure(name + " must be a sequence")
    if len(value) < minimum:
        raise ResidentHonestyFailure(name + " is too short")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise ResidentHonestyFailure(name + " contains a non-integer")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise ResidentHonestyFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise ResidentHonestyFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def run_resident_honesty_root(
    factor_base_state: Sequence[int],
    preparation_state: Sequence[int],
    nonidentity_automorphisms: int,
    arithmetic: Mapping[str, Any] | None,
    random_state: list[int],
    probe: Callable[[Sequence[int], int], int],
) -> ResidentHonestyResult:
    """Dispatch from live bounds and run the authenticated unequal scheduler.

    The callback is the existing no-cache collector boundary: it receives a
    freshly published ideal and norm and must return zero or one. No probe
    transcript or terminal answer is accepted. Equal bounds bypass arithmetic
    exactly as PARI's driver does.
    """
    try:
        dispatch = pari_honesty_dispatch_from_factor_base(
            factor_base_state, preparation_state
        )
    except ValueError as error:
        raise ResidentHonestyFailure("live factor-base dispatch rejected") from error
    kcz = dispatch.relation_groups
    kcz2 = dispatch.checking_groups
    if not dispatch.requires_honesty:
        return ResidentHonestyResult(
            "equal-bound-source-skip", True, kcz, kcz, kcz2, 0, 0, 0
        )
    if nonidentity_automorphisms != 0:
        return ResidentHonestyResult(
            "unsupported-automorphism-orbit", None, kcz, kcz, kcz2, 0, 0, 0
        )
    if arithmetic is None:
        raise ResidentHonestyFailure("unequal-bound honesty requires arithmetic owners")
    base = _integers(factor_base_state, "factor-base state", 7)
    if base[:5] != [5, 31, 3, 2, 9]:
        return ResidentHonestyResult(
            "unsupported-unequal-layout", None, kcz, kcz, kcz2, 0, 0, 0
        )
    try:
        n = int(arithmetic["degree"])
        basis = _integers(arithmetic["basisTable"], "basis table", n * n * n)
        initial = _integers(arithmetic["initialIdeal"], "initial ideal", n * n)
        subfactor = arithmetic["subfactor"]
        generator = _integers(subfactor["generator"], "subfactor generator", n)
        prime = int(subfactor["prime"])
        ramification = int(subfactor["ramification"])
        residue_degree = int(subfactor["residueDegree"])
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        raise ResidentHonestyFailure(
            "invalid unequal-bound arithmetic owners"
        ) from error
    if len(random_state) < 66:
        raise ResidentHonestyFailure("short live honesty RNG state")

    def zero(length: int) -> list[int]:
        return [0] * length

    state = zero(21)
    ideal = zero(n * n)
    norm = pari_honesty_begin_frozen(
        initial,
        n,
        kcz,
        kcz2,
        nonidentity_automorphisms,
        [3, 7, 2, 1, 1, 4, 11, 3, 2, 3],
        state,
        ideal,
    )
    staged_random = zero(66)
    while True:
        observation = probe(tuple(ideal), norm)
        if isinstance(observation, bool):
            observation = int(observation)
        if observation not in (0, 1):
            raise ResidentHonestyFailure("collector returned a non-Boolean observation")
        if observation == 1:
            return ResidentHonestyResult(
                "unsupported-success-continuation",
                None,
                kcz,
                state[0],
                kcz2,
                state[7],
                state[16],
                state[17],
            )
        more = pari_honesty_resume_frozen(
            0,
            basis,
            initial,
            generator,
            n,
            prime,
            ramification,
            residue_degree,
            random_state,
            staged_random,
            state,
            zero(n),
            zero(n),
            zero(n),
            zero(3),
            zero(3),
            zero(n * n),
            zero(n * n),
            zero(2 * n * n),
            zero(n * (3 * n + 1)),
            zero(n * (n + 1)),
            zero(n),
            zero(n * n),
            ideal,
        )
        if more == 0:
            return ResidentHonestyResult(
                "restart-required-honesty-failure",
                False,
                kcz,
                state[0],
                kcz2,
                state[7],
                state[16],
                state[17],
            )
        norm = state[17]
