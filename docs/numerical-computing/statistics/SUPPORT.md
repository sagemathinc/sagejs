# Support and evidence matrix

| Area | Implemented | Independent evidence | Important limit |
|---|---|---|---|
| Descriptive statistics | count, mean, variance, standard deviation/error, five-number summary, range, IQR, MAD, covariance, correlation | centered-sum and ordering identities; offset regression tests | scalar finite binary64 data only |
| Probability | Normal, Student-t, chi-square, binomial, Poisson | SciPy fixture, R oracle source, CDF/SF and quantile identities | no noncentral or multivariate laws |
| RNG | versioned PCG32, state restore, child streams, unbiased bounded integers, Box-Muller normals | exact CPython/Sage.js streams and restore tests | not cryptographic; not NumPy stream-compatible |
| Sampling | all five distributions | exact replay and support validation | binomial is `O(trials * size)` |
| Inference | mean CI, one-sample t, Welch/pooled two-sample t | SciPy fixture, R source, test/interval identities | assumptions are reported, not tested from data |
| Regression | centered OLS with diagnostics and inference | SciPy fixture and three normal-equation identities | one predictor only |
| Robust fitting | Theil-Sen, Huber IRLS; Huber/soft-L1/Cauchy losses | SciPy Theil-Sen fixture; median and estimating-equation identities | no robust covariance or robust p-values |
| Explanation | assumptions, local diagnostics, `explain`, PlotSpec | CPython/Sage.js construction tests | shared top-level dispatch awaits integration |
| Budgets | cancellation, elapsed, evaluations, iterations, trace events/bytes | failure corpus and forced-stop tests | synchronous cancellation callback |
| Platforms | ordinary Python, no native dependency | CPython and Sage.js on Linux x64; platform-neutral source | four-host qualification belongs to integration/release |

The Linux benchmark receipt records 106,039 raw source bytes and 20,848 gzip
bytes across nine Python files, with no native dependency. Timings exclude import
and lazy transpilation. They are regression budgets, not a claim that Sage.js is
faster than established native statistical libraries.
