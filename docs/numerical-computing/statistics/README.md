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
sequence of method calls. It is not NumPy stream compatibility and the generator
is not suitable for cryptography.

## Honest failures

Invalid mathematical input raises `ValueError`: examples are an empty sample,
non-finite observations under `nan_policy="raise"`, a nonpositive Student-t
degree of freedom, and regression with constant `x`. Runtime stops return a
structured unsuccessful result with a stable local status:

- `cancelled`;
- `maximum_evaluations`;
- `maximum_iterations`; or
- `maximum_elapsed_time`.

A constant sample makes the t statistic undefined, so the test returns
`invalid_problem` with `zero_variance` rather than serializing infinity or NaN.
The backend-neutral failure corpus is in
`test/numerics/statistics/failure-corpus.json`.

## Numerical truth

Results use `validated_approximate` only when their independent identities pass.
These checks include centered-sum identities, distribution CDF/SF complementarity,
support checks for samples, test/interval duality, OLS normal equations and
sum-of-squares decomposition, and robust estimating equations. They validate
the implemented binary64 computation; they do not turn approximate arithmetic
into a rigorous enclosure or validate scientific study design.
