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

## Probability laws

The constructors are `Normal(mean=0, standard_deviation=1)`,
`StudentT(degrees_of_freedom)`, `ChiSquare(degrees_of_freedom)`,
`Binomial(trials, probability)`, and `Poisson(rate)`. Each provides `pdf` or
`pmf`, `logpdf` or `logpmf`, `cdf`, `sf`, `quantile` (also `ppf`), `to_dict`,
and a bounded `plot`.

Separate `sf` formulas preserve upper-tail information that `1 - cdf` can
lose. Continuous quantiles return infinite endpoints when mathematically
appropriate. `Poisson.quantile(1)` is rejected as unbounded, except for the
degenerate rate-zero law.

## Randomness and sampling

`RandomStream(seed, stream=0)` is PCG XSH RR 64/32 with a SplitMix64 seed fold.
Its public contract is `pcg32-xsh-rr-v1`. Methods are `uint32`, `random`,
`uniform`, `randbelow`, `normal`, `choice`, `sample_without_replacement`,
`spawn`, `state`, and `from_state`.

`sample(distribution, size, seed=... | rng=..., budget=None, cancel=None,
trace="summary")` returns all completed draws plus before/after replay state.
Normal sampling uses polar Box-Muller, Student-t and chi-square use
Marsaglia-Tsang gamma sampling, binomial uses exact Bernoulli trials, and
Poisson uses Knuth for small rates and transformed rejection for larger rates.
The direct binomial algorithm is intentionally bounded and simple; large
`trials * size` workloads may exhaust `max_evaluations` rather than silently
switch to an approximate law.

## Inference

`confidence_interval_mean(data, confidence=0.95)` constructs the usual
two-sided Student-t interval.

`one_sample_t_test(data, population_mean=0, alternative="two-sided",
confidence=0.95)` returns statistic, p-value, degrees of freedom, standard
error, confidence interval, and the decision at `alpha = 1 - confidence`.

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
a MAD residual scale with an explicit binary64 floor, semantic iteration
events, and independent estimating-equation checks. `huber_loss`,
`soft_l1_loss`, and `cauchy_loss` are public scalar losses.

## Result contract

`StatisticsResult` provides `success`, `status`, `value`, `method`,
`validation`, `assumptions`, `diagnostics`, `trace`, `to_dict`, `to_json`,
`explain`, and `to_plot_spec` (also `plot`). The JSON record includes schema
version, binary64 precision, ordinary-Python provenance, work counts, trace,
and replay evidence where meaningful.
