# Support and evidence matrix

| Area | Implemented | Independent evidence | Important limit |
|---|---|---|---|
| Descriptive statistics | count, mean, variance, standard deviation/error, five-number summary, range, IQR, MAD, covariance, correlation | centered-sum and ordering identities; offset regression tests | scalar finite binary64 data only |
| Probability | Normal, Student-t, chi-square, binomial, Poisson | executed SciPy fixture in CPython/Sage.js; R oracle source; CDF/SF and quantile identities | explicit df/tail/trial/rate envelopes; no noncentral or multivariate laws |
| RNG | versioned PCG32, browser-safe state restore, child streams, unbiased bounded integers, Box-Muller normals | exact integer-core CPython/Sage.js streams and JSON restore tests | transforms are numerically compared, not cross-platform bit promises; not cryptographic or NumPy-compatible |
| Sampling | all five distributions | exact replay, support validation, extreme-shape structured failures, nonconstant large-parameter witnesses | binomial is `O(trials * size)`; Student-t/chi-square sampling requires `df >= 0.1` |
| Inference | mean CI, one-sample t, Welch/pooled two-sample t | SciPy fixture, R source, test/interval identities | assumptions are reported, not tested from data |
| Regression | centered OLS with diagnostics and inference | SciPy fixture and three normal-equation identities | one predictor only |
| Robust fitting | Theil-Sen, Huber IRLS; Huber/soft-L1/Cauchy losses | SciPy Theil-Sen fixture; median and estimating-equation identities | no robust covariance or robust p-values |
| Explanation and visualization | detached structured explanation plus readable text; accessible PlotSpec and bounded PlotAnimation for every result operation | contract parity, alt-text, topology/resource, tail/outlier/overfit/failure tests in CPython/Sage.js | views explain recorded evidence; they do not validate study design or widen numerical envelopes |
| Package-local planning | detached `capabilities`, `supports`, and `plan` for all result operations | callback counter and unchanged RNG-state witnesses in CPython/Sage.js | shared top-level dispatch awaits integration; no host-platform qualification claim |
| Budgets | cancellation, elapsed, evaluations, iterations, trace events/bytes | failure corpus and forced-stop tests | synchronous cancellation callback |
| Platforms | ordinary Python, no native dependency | CPython and Sage.js on Linux x64; platform-neutral source | four-host qualification belongs to integration/release |

The checked-in Linux benchmark receipt records the exact source payload for its
revision, with no native dependency. Timings exclude import and lazy
transpilation. They are development-host regression observations, not release
qualification, a cross-platform performance claim, or a claim that Sage.js is
faster than established native statistical libraries.
