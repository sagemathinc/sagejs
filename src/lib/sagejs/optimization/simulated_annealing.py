"""Simulated annealing, as documented for Wolfram `NMinimize`'s
`"SimulatedAnnealing"` method.

The lineage is S. Kirkpatrick, C. D. Gelatt and M. P. Vecchi, *Optimization by
Simulated Annealing*, Science 220(4598):671-680 (1983) — Wolfram's own
bibliography for this method cites L. Ingber, *Simulated annealing: Practice
versus theory*, Mathematical Computer Modelling 18(11):29-57 (1993) instead,
but the algorithm the tutorial spells out is the classical Kirkpatrick form:
one current point, one best-so-far point, a shrinking neighborhood, and a
Metropolis-style acceptance test for uphill moves.

## The documented algorithm

Verbatim from the `NMinimize` tutorial
(`ConstrainedOptimizationGlobalNumerical`, section 4.3):

> "At each iteration, a new point, `x_new`, is generated in the neighborhood
> of the current point, `x_cur`. The radius of the neighborhood decreases
> with each iteration. The best point found so far, `x_best`, is also
> tracked. If `f(x_new) <= f(x_best)`, `x_new` replaces `x_best` and `x_cur`.
> Otherwise, `x_new` replaces `x_cur` with a probability `e^{b(i, df, f0)}`.
> Here `b` is the function defined by BoltzmannExponent, `i` is the current
> iteration, `df` is the change in the objective function value, and `f0` is
> the value of the objective function from the previous iteration."

Per-start stopping (verbatim): "For each starting point, this is repeated
until the maximum number of iterations is reached, the method converges to a
point, or the method stays at the same point consecutively for the number of
iterations given by LevelIterations."

## Documented defaults

| Option | Default | Meaning |
|---|---|---|
| `"LevelIterations"` | `50` | max iterations to stay at a given point |
| `"PerturbationScale"` | `1.0` | scale of the random jump |
| `"SearchPoints"` | `Automatic` = `min(2*d, 50)` | independent starting points |
| `"RandomSeed"` | `0` | seed for the random number generator |
| `"Tolerance"` | `0.001` | convergence tolerance |
| `"BoltzmannExponent"` | `Automatic` = `-df * log(i + 1) / 10` | acceptance exponent |

`b`'s default is *negative* for an uphill move (`df > 0`), so
`e^b = e^{-df log(i+1)/10}` decays as `log(i+1)` grows: that division by a
growing logarithm *is* the cooling schedule. For a downhill move relative to
the current point (`df < 0`, even if not an improvement over `x_best`) the
exponent is positive, so such a move is virtually always accepted — matching
ordinary hill-descent behavior between the rarer worse-than-`x_best` uphill
steps.

## What is *not* documented, and this module's choices for it

Wolfram never publishes the neighborhood-radius decay, nor how the
`"SearchPoints"` starting points are chosen when `"InitialPoints"` is
`Automatic`. Both are supplied here as explicit, separately documented
choices (see `_neighborhood_decay` and `_random_start`) rather than presented
as reverse-engineered Wolfram behavior.

## Randomness and independence

Each of the `search_points` starts is an independent annealing run. Following
the house discipline in `sagejs.optimization.random_stream`, run `i` draws
every perturbation and acceptance random number from
`derive_stream(seed, i)`, a pure function of `(seed, i)` alone. Runs therefore
never share generator state, and the whole `search_points`-way batch can be
executed serially, sharded across workers, or replayed one at a time and
still produce identical results — `anneal_once` is deliberately the unit that
would be shipped to a worker.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .global_result import GlobalResult
from .random_stream import RandomStream, derive_stream

BoltzmannExponentFn = Callable[[int, float, float], float]
"""The signature Wolfram's `"BoltzmannExponent" -> Function[{i, df, f0}, ...]`
takes: iteration `i`, objective change `df`, previous objective value `f0`."""


@dataclass(frozen=True)
class _Bounds:
    """One dimension's `(low, high)` pair, split for cheap repeated use.

    `width` is cached because it is read every perturbation; a fixed
    coordinate (`low == high`) has `width == 0.0`, which `_perturb` treats as
    "never move this coordinate" rather than as a degenerate random draw.
    """

    low: float
    high: float
    width: float

    def clip(self, value: float) -> float:
        """Clamp `value` into `[low, high]`."""
        if value < self.low:
            return self.low
        if value > self.high:
            return self.high
        return value


def _normalize_bounds(bounds: Sequence[tuple[float, float]]) -> list[_Bounds]:
    """Validate and convert raw `(low, high)` pairs into `_Bounds`.

    Raises `ValueError` if `bounds` is empty or any pair has `low > high`.
    `low == high` (a fixed coordinate) is accepted, matching the documented
    edge case that a dimension may be pinned.
    """
    if len(bounds) == 0:
        raise ValueError("`bounds` must describe at least one dimension")
    normalized: list[_Bounds] = []
    for low, high in bounds:
        low_f, high_f = float(low), float(high)
        if low_f > high_f:
            raise ValueError(
                "each bound's lower endpoint must not exceed its upper "
                "endpoint (got %r > %r)" % (low_f, high_f)
            )
        normalized.append(_Bounds(low_f, high_f, high_f - low_f))
    return normalized


def default_boltzmann_exponent(
    iteration: int, delta_f: float, previous_f: float
) -> float:
    """Wolfram's documented default `"BoltzmannExponent"`: `-df * log(i+1) / 10`.

    `previous_f` (`f0`) is accepted but unused, matching the documented
    three-argument signature `Function[{i, df, f0}, ...]` — it exists so a
    caller-supplied replacement can use it (e.g. a *relative* change
    `df / f0`) even though the built-in default does not.

    At `iteration == 0`, `log(1) == 0`, so the exponent is `0` and every move
    is accepted regardless of `delta_f`: the schedule starts "hot" and cools
    as `log(iteration + 1)` grows, exactly the effect the tutorial describes.
    """
    return -delta_f * math.log(iteration + 1) / 10.0


def _neighborhood_decay(iteration: int) -> float:
    """OUR CHOICE, not Wolfram's: the neighborhood radius's decay factor.

    Wolfram states only that "the radius of the neighborhood decreases with
    each iteration," without publishing a formula. This module uses
    `1 / (1 + iteration)`: it is `1.0` at `iteration == 0` (the full
    `perturbation_scale`), strictly decreasing, and simple enough that a
    caller reading `perturbation_scale * _neighborhood_decay(i)` can predict
    the radius at any iteration without simulating the run.
    """
    return 1.0 / (1.0 + iteration)


def _random_start(
    bounds: Sequence[_Bounds], search_index: int, seed: int
) -> list[float]:
    """OUR CHOICE, not Wolfram's: sample a starting point for search `search_index`.

    Wolfram documents no procedure for `"InitialPoints" -> Automatic`. This
    module draws each coordinate uniformly from its bound (a fixed coordinate
    is simply its pinned value, drawing nothing).

    The stream used is `derive_stream(seed, -(search_index + 1))` — a
    *negative* stream index, deliberately distinct from the non-negative
    `0 .. search_points - 1` range that `anneal_once` uses for its own
    perturbation stream. `RandomStream` accepts negative indices (see
    `random_stream.py`). Reusing the same non-negative index for both roles
    would make a run's first perturbation draws replay the exact words
    already spent placing its own starting point; the negative offset avoids
    that without needing any extra bookkeeping.
    """
    stream = derive_stream(seed, -(search_index + 1))
    return [
        bound.low if bound.width == 0.0 else stream.uniform_range(bound.low, bound.high)
        for bound in bounds
    ]


def _perturb(
    x_cur: list[float], bounds: Sequence[_Bounds], radius: float, stream: RandomStream
) -> list[float]:
    """Generate `x_new` in the neighborhood of `x_cur`.

    Each coordinate is displaced by `radius * width * stream.normal()` — the
    displacement scales with both the shrinking radius and the dimension's
    own bound width, so a `perturbation_scale` of `1.0` produces jumps
    comparable in size to the search box itself, the way Wolfram's default
    `-1 <= x <= 1` initial region and default `"PerturbationScale" -> 1.0`
    suggest. A fixed coordinate (`width == 0.0`) is left at its pinned value
    and consumes no random draw. The result is clamped back into bounds
    coordinate by coordinate.
    """
    new_point: list[float] = []
    for coord, bound in zip(x_cur, bounds, strict=True):
        if bound.width == 0.0:
            new_point.append(bound.low)
            continue
        jump = radius * bound.width * stream.normal()
        new_point.append(bound.clip(coord + jump))
    return new_point


def anneal_once(
    f: Callable[[Sequence[float]], float],
    bounds: Sequence[tuple[float, float]],
    start: Sequence[float],
    stream_index: int,
    seed: int,
    *,
    level_iterations: int = 50,
    perturbation_scale: float = 1.0,
    max_iterations: int = 100,
    tolerance: float = 0.001,
    boltzmann_exponent: BoltzmannExponentFn | None = None,
) -> GlobalResult:
    """Run one independent simulated-annealing chain from `start`.

    This is the per-start unit of work: its arguments are all plain,
    serializable values (`f`, floats, ints), never a live `RandomStream`, so
    it is what a parallel scheduler ships to a worker — `simulated_annealing`
    below is exactly `search_points` calls to this function, one per
    `stream_index`, folded down to the single best `GlobalResult`.

    `start` is clamped into `bounds` before the first evaluation. The chain's
    every random draw comes from `derive_stream(seed, stream_index)`, so two
    calls with the same five leading arguments are bit-identical regardless
    of what else is running.

    Stopping (verbatim from the tutorial): "repeated until the maximum number
    of iterations is reached, the method converges to a point, or the method
    stays at the same point consecutively for [`level_iterations`]
    iterations." Here "converges" means the neighborhood radius,
    `perturbation_scale * _neighborhood_decay(i)`, has fallen below
    `tolerance` — see `_neighborhood_decay`'s docstring for why that
    particular decay was chosen. `GlobalResult.flag` is `"converged"` for
    that case, `"level-stall"` for the same-point case, and `"maxiter"`
    otherwise.

    A `NaN` objective value is never accepted, at `x_best` or at `x_cur`: a
    `NaN` candidate fails every acceptance test explicitly (not merely by
    relying on IEEE `NaN` comparisons happening to be `False`), and if `f`
    itself returns `NaN` at `start` the run can still recover as soon as any
    later candidate evaluates to a real number, rather than being stuck
    comparing everything against a permanent `NaN` best.

    Raises `ValueError` if `bounds` is empty, has a `low > high` pair, if
    `level_iterations < 1`, or if `perturbation_scale < 0`.
    """
    if level_iterations < 1:
        raise ValueError("`level_iterations` must be at least 1")
    if perturbation_scale < 0.0:
        raise ValueError("`perturbation_scale` must not be negative")

    normalized_bounds = _normalize_bounds(bounds)
    exponent_fn = boltzmann_exponent or default_boltzmann_exponent
    stream = derive_stream(seed, stream_index)

    x_cur = [b.clip(v) for v, b in zip(start, normalized_bounds, strict=True)]
    function_calls = 1
    f_cur = float(f(x_cur))

    x_best = list(x_cur)
    f_best = f_cur

    stall = 0
    iterations = 0
    converged = False
    flag = "maxiter"

    for i in range(max_iterations):
        radius = perturbation_scale * _neighborhood_decay(i)
        if radius < tolerance:
            converged = True
            flag = "converged"
            break

        prev_x_cur = x_cur
        x_new = _perturb(x_cur, normalized_bounds, radius, stream)
        f_new = float(f(x_new))
        function_calls += 1
        f_new_is_nan = math.isnan(f_new)

        if not f_new_is_nan and (math.isnan(f_best) or f_new <= f_best):
            x_best, f_best = x_new, f_new
            x_cur, f_cur = x_new, f_new
        elif not f_new_is_nan and not math.isnan(f_cur):
            delta_f = f_new - f_cur
            exponent = exponent_fn(i, delta_f, f_cur)
            # `exponent >= 0.0` is `False` for a NaN exponent too, so a NaN
            # from a caller-supplied `boltzmann_exponent` falls into the
            # `math.exp` branch and (via the NaN comparison below) is never
            # accepted, exactly like a NaN objective value.
            probability = 1.0 if exponent >= 0.0 else math.exp(exponent)
            if stream.uniform() < probability:
                x_cur, f_cur = x_new, f_new
        # else: `f_new` is NaN, or `f_cur` is still NaN with no valid
        # candidate yet to compare against -- `x_cur` does not change.

        iterations += 1
        if x_cur == prev_x_cur:
            stall += 1
            if stall >= level_iterations:
                flag = "level-stall"
                break
        else:
            stall = 0

    return GlobalResult(
        x=x_best,
        fun=f_best,
        iterations=iterations,
        function_calls=function_calls,
        converged=converged,
        flag=flag,
        seed=seed,
    )


def _better(candidate: GlobalResult, current: GlobalResult) -> bool:
    """Report whether `candidate` should replace `current` as the incumbent.

    A `NaN` `fun` never wins, and always loses to a non-`NaN` one, so a batch
    where every start happened to land on a `NaN` objective still returns a
    `NaN`-valued result rather than raising, while a single valid start among
    many `NaN` ones is always preferred.
    """
    if math.isnan(candidate.fun):
        return False
    if math.isnan(current.fun):
        return True
    return candidate.fun < current.fun


def simulated_annealing(
    f: Callable[[Sequence[float]], float],
    bounds: Sequence[tuple[float, float]],
    *,
    level_iterations: int = 50,
    perturbation_scale: float = 1.0,
    search_points: int | None = None,
    max_iterations: int = 100,
    tolerance: float = 0.001,
    seed: int = 0,
    boltzmann_exponent: BoltzmannExponentFn | None = None,
    initial_points: Sequence[Sequence[float]] | None = None,
) -> GlobalResult:
    """Minimize `f` over the box `bounds` by multistart simulated annealing.

    `bounds` is a sequence of `(low, high)` pairs, one per dimension; its
    length `d` fixes the problem's dimension, including `d == 1`. A pair with
    `low == high` pins that coordinate for the whole run, per the documented
    edge case.

    `search_points` defaults to Wolfram's documented
    `"SearchPoints" -> Automatic = min(2*d, 50)`. Each search point runs as
    an independent `anneal_once` chain seeded by `derive_stream(seed, i)` for
    `i` in `range(search_points)`; the returned `GlobalResult` is whichever
    chain found the lowest (non-`NaN`) `fun`, by `_better`, and its
    `function_calls` is the *sum* over every chain (the true cost of the
    whole multistart run), while `iterations` and `flag`/`converged` are the
    winning chain's own.

    `initial_points`, when given, supplies explicit starting points for the
    first `len(initial_points)` search points (each clamped into `bounds`);
    any remaining search points fall back to `_random_start`'s uniform
    sampling — this module's own choice, since Wolfram does not document
    `"InitialPoints" -> Automatic`'s sampling procedure. Extra entries beyond
    `search_points` are ignored.

    `level_iterations`, `perturbation_scale`, `max_iterations`, `tolerance`,
    `seed`, and `boltzmann_exponent` are forwarded unchanged to every chain;
    see `anneal_once` for their meaning.

    Raises `ValueError` if `bounds` is empty, has a `low > high` pair, or if
    `search_points < 1`.
    """
    normalized_bounds = _normalize_bounds(bounds)
    dimension = len(normalized_bounds)
    points = search_points if search_points is not None else min(2 * dimension, 50)
    if points < 1:
        raise ValueError("`search_points` must be at least 1")

    supplied = initial_points if initial_points is not None else ()

    best: GlobalResult | None = None
    total_function_calls = 0
    for index in range(points):
        if index < len(supplied):
            start = [
                b.clip(float(v))
                for v, b in zip(supplied[index], normalized_bounds, strict=True)
            ]
        else:
            start = _random_start(normalized_bounds, index, seed)

        result = anneal_once(
            f,
            bounds,
            start,
            index,
            seed,
            level_iterations=level_iterations,
            perturbation_scale=perturbation_scale,
            max_iterations=max_iterations,
            tolerance=tolerance,
            boltzmann_exponent=boltzmann_exponent,
        )
        total_function_calls += result.function_calls
        if best is None or _better(result, best):
            best = result

    assert best is not None  # `points >= 1` guarantees at least one chain ran
    return GlobalResult(
        x=best.x,
        fun=best.fun,
        iterations=best.iterations,
        function_calls=total_function_calls,
        converged=best.converged,
        flag=best.flag,
        seed=seed,
    )
