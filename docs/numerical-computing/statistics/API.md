# Statistics API reference

## Stable summaries

`describe(data, ddof=1, nan_policy="raise", budget=None, cancel=None,
trace="summary")` returns a `StatisticsResult`. Its value contains count, sum,
mean, variance, standard deviation, standard error, five-number summary, range,
IQR, median absolute deviation, divisor convention, and quantile convention.
The mean uses `math.fsum`; variance uses a corrected two-pass centered sum.

`quantile(data, p)` uses R type 7 / linear interpolation. `covariance(x, y)`
and `correlation(x, y)` use centered two-pass formulas. Non-finite data are
rejected unless `nan_policy="omit"`; paired omission removes the entire pair.

### Explicit prepared data (Sage.js extension)

```python
from sagejs.numerics.statistics import StatisticsData

with StatisticsData([1.0, 2.0, 4.0, 7.0]) as data:
    sample = data.describe(ddof=1)
    population = data.describe(ddof=0)
    print(data.preparation())  # copying/conversion cost, separate from each query
```

`StatisticsData(data, nan_policy="raise", budget=None, cancel=None,
max_buffer_bytes=67108864, backend="dynamic")` copies and validates input once.
Every `describe(data)` or `data.describe()` query recomputes the summary,
independent checks and result. No summary or sorted order is precomputed during
preparation. `to_list()` returns a detached copy; changing either the original
input or an export cannot change the retained sample. `close()` is idempotent
and releases the sample and workspace. Closed instances cannot be queried.
Private underscore attributes are implementation details, not mutation APIs.

The logical buffer ceiling charges 80 bytes per observation plus 16 bytes for
input, scratch, transient copies and ordering capacity. It does not bound
Python object overhead, physical RSS or detached result/plot memory. It is
checked during materialization, before allocating native workspace. Preparation
preserves per-observation iterator/conversion/cancellation order. Each prepared
query charges its sample count atomically before arithmetic, then checks elapsed
time and cancellation at coarse phase boundaries. Recursive queries, exporting,
or closing the same instance from a query's callback are rejected. Use separate
instances for concurrent jobs; the workspace is not shared.

`backend="native"` is an **experimental AOT opt-in**, not the default. It uses
source-transparent accurately rounded reductions and centered arithmetic, and
the host engine's stable finite-binary64 buffer sorting. It requires matching
precompiled artifacts; absence, source mismatch or an unavailable native addon
selects the ordinary implementation. `data.backend` and each successful result
report the actual selection. This path does not load FLINT/MPC or compile code
at query time. It has no claimed four-platform public/package qualification or
qualified execution receipt yet. The small production Wasm/native pack and its
browser/npm/SEA integration remain under development: do not infer that the
browser is accelerated from the separate generated-Wasm kernel witnesses.

Ordinary `describe()` on a list or user iterable keeps the existing generic
path; this extension does not bypass Python conversion hooks or change its
budget accounting. Other statistics functions may iterate `StatisticsData` as
a detached ordinary sequence but do not yet reuse its native workspace.

## Probability laws

The constructors are `Normal(mean=0, standard_deviation=1)`,
`StudentT(degrees_of_freedom)`, `ChiSquare(degrees_of_freedom)`,
`Binomial(trials, probability)`, and `Poisson(rate)`. Each provides `pdf` or
`pmf`, `logpdf` or `logpmf`, `cdf`, `sf`, `quantile` (also `ppf`), and
`to_dict`. `curve(...)` returns the canonical `StatisticsResult`; `plot(...)`
returns its accessible `PlotSpec`, and `animate(...)` returns a bounded
`PlotAnimation`. CDF/SF views identify the numerically important tail without
changing the qualified evaluation or quantile envelope.

Separate `sf` formulas preserve upper-tail information that `1 - cdf` can
lose. Continuous quantiles return infinite endpoints when mathematically
appropriate. `Poisson.quantile(1)` is rejected as unbounded, except for the
degenerate rate-zero law.

The qualified binary64 parameter envelope is `0 < df <= 10000` for Student-t
and chi-square, at most 10,000,000 binomial trials, and Poisson rate at most
1,000,000. Student-t and chi-square quantiles require `df >= 0.1`.
Non-endpoint Student-t `quantile`/`isf` tails must be at least `1e-14`.
Chi-square `quantile` requires lower-tail `p >= 1e-12`, while direct `isf` is
qualified for upper-tail probabilities down to `1e-300`. These are explicit
failure boundaries, not silent approximations.

## Randomness and sampling

`RandomStream(seed, stream=0)` is PCG XSH RR 64/32 with a SplitMix64 seed fold.
Its public contract is `pcg32-xsh-rr-v1`. Methods are `uint32`, `random`,
`uniform`, `randbelow`, `normal`, `choice`, `sample_without_replacement`,
`spawn`, `state`, and `from_state`.

Seeds, stream identifiers, and child indices are capped at 4096 bits so seed
folding has an explicit work ceiling. Serialized seed/stream/draw counts use
canonical decimal strings; PCG state words use 16-digit lowercase hexadecimal
strings. Numeric state words and noncanonical strings are rejected on restore.

`sample(distribution, size, seed=... | rng=..., budget=None, cancel=None,
trace="summary")` returns all completed draws plus before/after replay state.
Normal sampling uses polar Box-Muller, Student-t and chi-square use
Marsaglia-Tsang gamma sampling, binomial uses exact Bernoulli trials, and
Poisson uses Knuth for small rates and transformed rejection for larger rates.
Student-t and chi-square sampling require `df >= 0.1`; smaller shapes return a
structured unsupported-envelope result because underflow can otherwise turn a
continuous sample into repeated zeros. Normal sampling preflights a conservative
finite location/scale envelope and checks every completed draw.
The direct binomial algorithm is intentionally bounded and simple; large
`trials * size` workloads may exhaust `max_evaluations` rather than silently
switch to an approximate law.

## Inference

`confidence_interval_mean(data, confidence=0.95)` constructs the usual
two-sided Student-t interval.

`one_sample_t_test(data, population_mean=0, alternative="two-sided",
confidence=0.95)` returns statistic, p-value, degrees of freedom, standard
error, confidence interval, and the decision at `alpha = 1 - confidence`.
For `greater` the confidence interval is `[lower, None]`; for `less` it is
`[None, upper]`. These one-sided intervals use the same tail as the test and
their null-exclusion decision is validated against the p-value decision.

`two_sample_t_test(first, second, equal_variance=False, ...)` uses Welch's
standard error and Satterthwaite degrees of freedom by default. Setting
`equal_variance=True` selects the pooled estimator and adds the equal-variance
assumption to the result.

The alternatives are `two-sided`, `less`, and `greater`. A p-value is the
probability, under the null model, of a statistic at least as unfavorable to
the null as the observed statistic. It is not the probability that the null is
true and it is not an effect size.

## Regression and robust losses

`linear_regression(x, y, confidence=0.95, alternative="two-sided")` returns
the intercept, slope, correlation, R-squared, residual evidence, classical
standard errors, t test for slope, and confidence intervals. If the line fits
exactly, standard errors collapse to zero and the p-value is reported as `None`
with an explanatory diagnostic.

`theil_sen_regression(x, y, confidence=0.95,
intercept_method="separate")` uses the median finite pairwise slope and a
tie-corrected Sen rank interval. `separate` uses
`median(y) - slope*median(x)`; `joint` uses `median(y - slope*x)`. The method is
quadratic in the number of observations and is governed by the evaluation
budget.

`huber_regression(x, y, tuning=1.345, tolerance=1e-10)` uses bounded IRLS,
a fixed initial MAD residual scale with an explicit binary64 floor, semantic
iteration events, and independent estimating-equation and same-objective
checks. The scale is not changed between the initial and final objective.
`huber_loss`,
`soft_l1_loss`, and `cauchy_loss` are public scalar losses.

## Result contract

`StatisticsResult` subclasses the shared `NumericalResult`; it does not define
a parallel result schema. Its `problem`, `plan_record`, `validation`, and
`diagnostics` are canonical `NumericalProblem`, `NumericalPlan`,
`NumericalValidation`, and `NumericalDiagnostic` records. It adds detached
statistical `value` views and `assumptions`. `explanation()` (also
`structured_explanation`) returns a detached record containing outcome,
interpretation, validation evidence, assumptions, limitations, and diagnostics;
`explain()` formats that evidence as readable text.

`to_plot_spec()` (also `plot`) returns an accessible canonical `PlotSpec` with
explicit alternative text. `to_plot_animation()` (also `animate`) returns a
topology-stable canonical `PlotAnimation` with at most 12 frames, 100,000
materialized coordinate scalars, an 8 MB payload ceiling, and no autoplay or
loop promise. Views cover bounded distribution curves and tails, sample order,
empirical ranks and quartiles, finite or one-sided confidence sets and nulls,
regression lines, Huber-downweighted observations, and structured failures.
Large descriptive, sampling, and regression inputs are deterministically
reduced to at most 257, 512, and 512 display observations respectively; the
statistical result value is not reduced.

`to_dict` uses the common numerical schema and records the actual resource
budget, binary64 precision, provenance, bounded trace, replay problem/plan, and
statistics domain payload.

## Package-local planning

`capabilities(operation=None)` returns detached records for the package's
planned statistics computations: result operations, scalar summaries, and
robust losses. `supports(problem, method=None)` and
`plan(problem, method=None)` accept canonical `NumericalProblem` records in the
`statistics` domain. Planning reads only detached metadata: it makes zero random
draws and never evaluates `problem.function`. Capability records therefore make
implementation and validation claims but no unqualified host-platform claim.
