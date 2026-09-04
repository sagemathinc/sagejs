# Statistics and probability

The statistics package is a dependency-free, backend-neutral vertical slice for
undergraduate probability and statistics. Import it explicitly:

```python
from sagejs.numerics.statistics import (
    Normal,
    RandomStream,
    confidence_interval_mean,
    describe,
    huber_regression,
    linear_regression,
    sample,
)
```

It provides stable descriptive statistics, five common probability laws,
reproducible sampling, t-based inference, simple linear regression, Theil-Sen
regression, Huber regression, robust losses, independent checks, bounded traces,
and semantic PlotSpec output. The same ordinary Python source runs in CPython
and Sage.js.

## A first statistical workflow

```python
from sagejs.numerics.statistics import describe, confidence_interval_mean

heights = [168, 171, 174, 166, 180, 175, 169, 172]
summary = describe(heights)
interval = confidence_interval_mean(heights, confidence=0.95)

print(summary.value["mean"])
print(summary.value["standard_deviation"])
print(interval.value["interval"])
print(interval.explain())
plot = interval.to_plot_spec()
animation = interval.animate()
evidence = interval.explanation()
```

The confidence interval is not a probability statement about a fixed unknown
mean after the data have been observed. Its 95% is the long-run coverage of
the procedure when the recorded assumptions hold. The result carries those
assumptions because the arithmetic alone cannot establish independence,
normality, or representative sampling.

## Regression and resistance to outliers

```python
from sagejs.numerics.statistics import (
    huber_regression,
    linear_regression,
    theil_sen_regression,
)

x = list(range(8))
y = [1 + 2*t for t in x]
y[-1] = 30

least_squares = linear_regression(x, y)
theil_sen = theil_sen_regression(x, y)
huber = huber_regression(x, y)

print(least_squares.value["slope"])
print(theil_sen.value["slope"])
print(huber.value["slope"])
fit_plot = huber.to_plot_spec()
fit_animation = huber.animate()
```

Ordinary least squares minimizes squared residuals, so one large residual can
have high influence. Theil-Sen uses the median pairwise slope. Huber IRLS uses
quadratic loss near zero and linear loss in the tails. The robust results do
not manufacture classical p-values: their result records state the narrower
claims that have actually been computed.

## Reproducible simulation

```python
from sagejs.numerics.statistics import Normal, RandomStream, sample

rng = RandomStream(20260831, stream=4)
before = rng.state()
experiment = sample(Normal(mean=10, standard_deviation=2), 100, rng=rng)
replay = RandomStream.from_state(before)
assert experiment.value == sample(Normal(10, 2), 100, rng=replay).value
```

The replay contract includes the algorithm name, schema version, state,
increment, draw count, and cached Box-Muller variate. It applies to an identical
sequence of method calls. State words are canonical hexadecimal strings and
seed, stream, and draw-count fields are decimal strings, so a JSON round trip
through a browser cannot round 64-bit words. Only the PCG32 integer core is
specified for exact replay; distribution transforms also use
platform math functions and are checked numerically rather than promised
bit-for-bit. This is not NumPy stream compatibility, evidence of statistical
quality beyond the named PCG32 construction, or a cryptographic generator.

Plotting or animating a completed sample reads its detached result evidence and
does not advance the RNG. The sequence view is capped at 512 display draws;
replay state and the full result value remain unchanged.

## Instructive visual cases

The domain visualizers deliberately keep interpretation visible:

- `StudentT(5).animate("sf", lower=0, upper=10)` highlights the directly
  computed upper tail instead of teaching `1 - cdf` subtraction;
- a three-observation OLS plot states that an in-sample line supplies little
  evidence against overfit and does not validate prediction;
- a Huber view marks final weights below 0.8 and replays retained IRLS updates,
  while warning that residual robustness does not remove leverage risk;
- an invalid zero-variance t test produces an accessible status view rather
  than inventing an infinite statistic.

The machine-readable source for these examples is
`assets/teaching-cases.json`.

All static views provide explicit alternative text. Animations contain fully
materialized semantic frames and hard frame/sample/byte/duration ceilings; they
do not depend on a browser callback and do not promise autoplay or looping.

## Detached planning

```python
from sagejs.numerics import NumericalProblem
from sagejs.numerics.statistics import capabilities, plan, supports

problem = NumericalProblem("statistics", "two_sample_t_test", method="auto")
assert supports(problem)
resolved = plan(problem)
```

The package-local planner chooses only from operation metadata. It does not
evaluate a live callback, inspect data by calling user code, or consume random
state. Shared top-level facade registration remains an integration-lane task.

## Honest failures

Invalid mathematical input raises `ValueError`: examples are an empty sample,
non-finite observations under `nan_policy="raise"`, a nonpositive Student-t
degree of freedom, and regression with constant `x`. Runtime stops return a
structured unsuccessful canonical `NumericalResult` status:

- `cancelled`;
- `maximum_evaluations`;
- `maximum_iterations`.

An elapsed-time deadline is reported as `cancelled`, with the trace retaining
the resource-boundary context. Explicit inner-loop ceilings additionally bound
special-function series, quantile bisection, PCG rejection, and Box-Muller
rejection.

A constant sample makes the t statistic undefined, so the test returns
`invalid_problem` with the shared `validation_failed` diagnostic and a
`statistics_reason` of `zero_variance`, rather than serializing infinity or NaN.
Sampler parameter ranges that cannot be represented honestly return
`invalid_problem` with a structured `nonfinite_evaluation` diagnostic; they do
not return a constant sample labeled as distributionally valid.
The backend-neutral failure corpus is in
`test/numerics/statistics/failure-corpus.json`.

## Numerical truth

Results use `validated_approximate` only when their independent identities pass.
These checks include centered-sum identities, distribution CDF/SF complementarity,
support checks for samples, test/interval duality, OLS normal equations and
sum-of-squares decomposition, and robust estimating equations. They validate
the implemented binary64 computation; they do not turn approximate arithmetic
into a rigorous enclosure or validate scientific study design.

## Qualified binary64 envelopes

Student-t and chi-square degrees of freedom are supported through 10,000.
Student-t quantiles and inverse survival values require `df >= 0.1` and each
non-endpoint tail probability to be at least `1e-14`. Chi-square quantiles also
require `df >= 0.1`; lower-tail quantiles require `p >= 1e-12`, while direct
chi-square inverse survival is qualified down to `1e-300`.
Binomial trials are limited to 10,000,000 and Poisson rate to 1,000,000.
Student-t and chi-square sampling additionally require degrees of freedom at
least `0.1`. Confidence procedures require their Student-t tail probability to
be at least `1e-14`. Calls outside these envelopes fail explicitly.
