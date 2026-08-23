"""The shared constraint shape for Wolfram's optimization surface.

`NMinimize[{f, cons}, ...]` and `FindMinimum[{f, cons}, ...]` document
exactly the same `cons` — one relation or callable, or a `List` of them —
and `_constraint` in `wolfram.py` builds the *same* engine-level value for
either, calling `module.equality`/`module.inequality` on whichever engine
module it was given (`nminimize` or `findminimum`). So the shape those two
calls build, and the rule that coerces a raw `constraints` argument into a
list of them, belong to neither engine specifically — they belong here.

This module exists separately, rather than folding into `nminimize.py` or
`findminimum.py` and having the other import it, so that neither engine has
to load the other's dependencies just to share this shape. `nminimize.py`
pulls in the population methods — `differential_evolution`, `random_search`,
`simulated_annealing`, `nelder_mead` — so importing it from `findminimum.py`
(or vice versa) would load all of that on every call to either, defeating
the two separate lazy-load caches `wolfram.py` keeps for the local and
global engines specifically so a caller of one never pays for the other
(see `_findminimum_module`'s docstring there). This module imports nothing
from either engine and nothing heavy, so both can depend on it for free.

`nminimize.py` and `findminimum.py` each still enforce constraints their own
way — a penalty folded into the objective there, COBYLA's own inequality
list here — and that machinery is genuinely engine-specific, so it stays in
each engine module. Only the shape and the normalization rule, identical in
both, live here; sharing them means a fix to what a constraint *means* can
no longer land in one engine and not the other by omission.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, cast

Objective = Callable[[Sequence[float]], float]
"""An objective or constraint function: one coordinate sequence to a float."""

INEQUALITY = "inequality"
"""`Constraint.kind` for `g(x) >= 0`."""

EQUALITY = "equality"
"""`Constraint.kind` for `h(x) == 0`."""


@dataclass(frozen=True)
class Constraint:
    """One constraint, either `g(x) >= 0` or `h(x) == 0`.

    `kind` is `"inequality"` or `"equality"`; build instances with
    `inequality` and `equality` rather than spelling the strings out.
    `function` maps a coordinate sequence to the constraint's value.
    """

    kind: str
    function: Objective


def inequality(g: Objective) -> Constraint:
    """Return the constraint `g(x) >= 0`."""
    return Constraint(kind=INEQUALITY, function=g)


def equality(h: Objective) -> Constraint:
    """Return the constraint `h(x) == 0`."""
    return Constraint(kind=EQUALITY, function=h)


def normalize_constraints(constraints: Sequence[Any] | None) -> list[Constraint]:
    """Coerce `constraints` into `Constraint` values, a callable meaning `g >= 0`.

    Shared verbatim by `nminimize.nminimize` and `findminimum.findminimum`:
    both take a `constraints` argument that is `None`, a `Constraint`, or a
    plain callable read as the inequality `g(x) >= 0`, and both read a List
    of any mix of those the same way.
    """
    if constraints is None:
        return []
    result: list[Constraint] = []
    for index in range(len(constraints)):
        entry = constraints[index]
        if isinstance(entry, Constraint):
            if entry.kind != INEQUALITY and entry.kind != EQUALITY:
                raise ValueError(
                    "constraint %d has kind %r, expected %r or %r"
                    % (index, entry.kind, INEQUALITY, EQUALITY)
                )
            result.append(entry)
        elif callable(entry):
            result.append(inequality(cast(Objective, entry)))
        else:
            raise TypeError(
                "constraint %d must be a `Constraint` or a callable `g` read "
                "as `g(x) >= 0`" % (index,)
            )
    return result
