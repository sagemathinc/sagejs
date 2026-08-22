"""The shared result record for the population-based global optimizers.

`differential_evolution`, and the simulated-annealing and random-search
methods that join it later, all answer the same question — "where is the
global minimum, and how sure are we" — so they share one result shape
instead of each inventing a slightly different one. The shape mirrors
`NelderMeadResult` and `BrentMinimumResult` in this package (a frozen
dataclass, `x`/`fun`/`iterations`/`function_calls`/`converged`/`flag`), with
one field those local methods have no use for: `seed`, the value that was
actually used to seed the run. Every global method here takes a `seed`
keyword defaulting to `0` (matching Wolfram `NMinimize`'s `"RandomSeed" ->
0`), and returning it lets a caller who did not pick one still reproduce the
run exactly.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GlobalResult:
    """The outcome of a stochastic global-optimization run.

    `flag` is a short machine-readable reason the run stopped — each
    algorithm defines its own vocabulary (`differential_evolution` uses
    `"converged"` and `"maxiter"`) — and `converged` is `True` exactly when
    `flag` names a successful stop, never inferred from `iterations` or
    `function_calls` alone. `x` and `fun` are the best point and function
    value found, `iterations` counts completed algorithm iterations
    (generations, annealing steps, or restarts, depending on the method),
    `function_calls` counts every call the run made to the objective, and
    `seed` is the `RandomStream` seed the run was derived from — echoed
    back so a caller who accepted the default can still repeat the run.
    """

    x: list[float]
    fun: float
    iterations: int
    function_calls: int
    converged: bool
    flag: str
    seed: int
