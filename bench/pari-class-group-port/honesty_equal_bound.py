"""Source-derived honesty dispatch from authenticated factor-base state.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

PARI 2.17.4 enters `be_honest` exactly when `F.KCZ2 > F.KCZ`.  This
small ordinary-Python component retains that decision boundary explicitly.
It consumes the bound counters produced by factor-base preparation; it does
not accept a caller-supplied honesty result or status string.
"""

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class HonestyDispatch:
    """An inspectable decision at PARI's post-`compute_R` boundary."""

    relation_bound: int
    checking_bound: int
    relation_groups: int
    checking_groups: int
    unchecked_groups: int
    requires_honesty: bool

    @property
    def status(self) -> str:
        """Return a presentation label derived only from `requires_honesty`."""
        if self.requires_honesty:
            return "honesty-required"
        return "equal-bound-source-skip"


def pari_honesty_dispatch_from_factor_base(
    factor_base_state: Sequence[int], preparation_state: Sequence[int]
) -> HonestyDispatch:
    """Apply PARI 2.17.4's exact `F.KCZ2 > F.KCZ` dispatch predicate.

    `factor_base_state` is the seven-word result of the resident preparation:
    `[C1, C2, KC, KCZ, KCZ2, KC2, product]`.  `preparation_state` is the
    connected preparation state; its phase and copied `KC`/`KCZ` fields
    authenticate that the counters came from the completed factor-base path.

    The function is intentionally general across valid monotone bound states.
    In particular, changing `KCZ2` changes the decision.  There is no input
    through which a stale success or skip bit can be injected.
    """
    if len(factor_base_state) < 7 or len(preparation_state) < 8:
        raise ValueError("short authenticated factor-base state")
    c1, c2, kc, kcz, kcz2, kc2, product = (int(factor_base_state[i]) for i in range(7))
    phase = int(preparation_state[0])
    prepared_kc = int(preparation_state[2])
    prepared_kcz = int(preparation_state[3])
    if phase < 3 or prepared_kc != kc or prepared_kcz != kcz:
        raise ValueError("unauthenticated factor-base bound counters")
    if (
        c1 < 2
        or c2 < c1
        or kc < 0
        or kcz < 0
        or kcz2 < kcz
        or kc2 < kc
        or kcz > kc
        or kcz2 > kc2
        or product <= 0
    ):
        raise ValueError("invalid factor-base bound state")
    unchecked = kcz2 - kcz
    return HonestyDispatch(
        relation_bound=c1,
        checking_bound=c2,
        relation_groups=kcz,
        checking_groups=kcz2,
        unchecked_groups=unchecked,
        requires_honesty=unchecked > 0,
    )
