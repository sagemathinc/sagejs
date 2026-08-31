# Numerical design and mature implementation survey

## Survey conclusions

The implementation was compared with current documented behavior in mature
systems, without taking a dependency on those systems:

- [SciPy probability distributions](https://docs.scipy.org/doc/scipy/reference/stats.html)
  establish the `pdf`/`pmf`, `cdf`, `sf`, and `ppf` vocabulary and consistently
  expose survival functions for upper-tail work.
- [SciPy `ttest_1samp`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_1samp.html)
  defines its statistic as `(mean - popmean) / standard_error`, supports three
  alternatives, reports degrees of freedom, and ties confidence intervals to
  inversion of the test.
- [SciPy `linregress`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.linregress.html)
  explicitly conditions its coefficient standard errors on residual normality.
- [SciPy `theilslopes`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.theilslopes.html)
  distinguishes the joint and separate intercept conventions and notes that
  the slope interval does not provide an intercept interval.
- [NumPy random sampling](https://numpy.org/doc/stable/reference/random/)
  separates a bit generator from distribution transforms, recommends explicit
  seed records for replay, and warns that statistical PRNGs are not secure.
  [NumPy's compatibility policy](https://numpy.org/doc/stable/reference/random/compatibility.html)
  also shows why a reproducibility claim must name the generator and method-call
  sequence rather than promise compatibility with every future transform.
- The R manuals for the [normal](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/Normal.html),
  [Student-t](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/TDist.html),
  and [linear model](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/lm.html)
  functions are the secondary language oracle. A runnable R fixture is retained
  beside the SciPy fixture.

These references led to four deliberate choices: explicit survival functions,
explicit intercept conventions, inferential assumptions inside results, and a
versioned RNG algorithm rather than a vague seed-only promise.

## Algorithms

Means use compensated `fsum`. Variances use a corrected two-pass formula rather
than `E[x^2] - E[x]^2`, which is unstable for large offsets. Quantiles use the
widely taught R type-7 linear convention and say so in the result.

The normal CDF reduces to the upper incomplete gamma ratio. Student-t reduces
to the regularized incomplete beta ratio; chi-square reduces to the regularized
incomplete gamma ratios. The beta and gamma implementations use symmetric
series/continued-fraction regions so the smaller tail is evaluated directly.
Lanczos log-gamma avoids overflow in density and mass formulas. Binomial CDF/SF
use complementary incomplete-beta forms, and Poisson CDF/SF use complementary
incomplete-gamma forms. Quantiles use monotone bracketing and binary64-aware
bisection; the normal quantile starts from a rational approximation and refines
against the appropriate tail.

OLS is centered before forming cross products. Independent validation checks
both normal equations and the SST/SSR/SSE identity. Theil-Sen materializes all
finite pairwise slopes under the evaluation budget. Its confidence ranks include
tie corrections in both `x` and `y`. Huber IRLS reports its objective, scale,
weights, iteration trace, and estimating-equation residuals.

## Edge policy

- Parameters are checked before arithmetic. Degrees of freedom and continuous
  scales are positive; probabilities are bounded; Poisson rate may be zero.
- Non-finite observations never leak into JSON. `nan_policy="omit"` omits NaNs
  only; infinity is always rejected.
- A continuous density may legitimately be infinite at a support boundary,
  such as chi-square with fewer than two degrees of freedom at zero. Direct
  scalar evaluation can return that infinity, but rich JSON results do not.
- Endpoint quantiles follow the mathematical support. An unbounded Poisson
  quantile at probability one raises instead of returning a fake finite value.
- Direct `sf` evaluation avoids catastrophic cancellation in upper tails.
- Constant samples do not produce serialized infinite t statistics. Constant
  predictors do not produce an arbitrary slope.
- Every potentially long loop checks cancellation, elapsed time, and evaluation
  or iteration budgets. Trace retention is independently bounded by event and
  byte limits.

## Oracle policy

`oracle-fixtures.json` was generated with SciPy 1.18.0. `oracle.R` expresses the
same cases using R's `stats` package. The checked corpus covers central and tail
CDF/SF values, quantiles, discrete masses, one- and two-sample t inference, OLS,
and Theil-Sen. Analytic identities remain independent of either oracle:

- `cdf(x) + sf(x) = 1` within binary64 tolerance;
- `cdf(quantile(p))` recovers `p` for continuous laws;
- a full finite binomial mass sums to one;
- a sufficiently long Poisson prefix sums to one;
- OLS residuals satisfy the normal equations; and
- RNG replay is exact, not tolerance based.

R was not installed on the development host used for the recorded Linux receipt;
the R source is retained for an integration or release host. This limitation is
stated instead of labeling SciPy-generated numbers as independently executed R
output.
