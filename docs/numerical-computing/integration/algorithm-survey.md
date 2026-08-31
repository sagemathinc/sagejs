# Adaptive integration algorithm survey

Survey date: 2026-08-31.

The selected implementation is ordinary Python with global largest-error
subdivision and embedded Gauss-Kronrod rules. This is a source-transparent,
portable foundation rather than a new numerical method.

## Mature evidence considered

- [QUADPACK on Netlib](https://netlib.org/quadpack/) classifies `QAG` as a
  globally adaptive Gauss-Kronrod integrator, `QAGS` as subdivision plus
  extrapolation, `QAGP` as the known-singularity/breakpoint path, and `QAGI` as
  the infinite-interval path.
- [GSL numerical integration](https://www.gnu.org/software/gsl/doc/html/integration.html)
  documents the embedded-rule error principle, 21-point QAGS finite rule,
  explicit known-singularity partition, Wynn epsilon acceleration, 15-point
  infinite rule, rational infinite maps, workspace limits, and distinct
  roundoff/singularity/divergence failures.
- [SciPy `integrate.quad`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.quad.html)
  exposes QUADPACK with explicit `epsabs`, `epsrel`, subinterval limit,
  breakpoints, infinite bounds, absolute-error estimate, and diagnostic work
  arrays. Its dispatch table distinguishes finite, breakpoint, infinite,
  weighted, and oscillatory routines rather than pretending one rule covers all
  semantics.
- [mpmath quadrature](https://mpmath.org/doc/current/calculus/integration.html)
  uses tanh-sinh by default for arbitrary precision, documents its endpoint
  singularity strength, recommends splitting at interior difficulties, and
  separately provides adaptive subdivision. This is strong evidence for a
  future arbitrary-precision path, but not for replacing the efficient
  binary64 general-purpose embedded rule in this milestone.

## Selection

Finite intervals use Gauss 10/Kronrod 21 with QUADPACK-style `resabs`/`resasc`
error rescaling and a roundoff floor. Infinite mappings use Gauss 7/Kronrod 15,
matching the mature observation that a lower-order rule is more efficient after
the transformation introduces endpoint difficulty. The largest estimated local
error is bisected because that makes the allocation decision deterministic,
inspectable, and directly useful in a teaching trace.

Known interior difficulties form the initial partition. Known endpoint
singularities use an explicit quadratic map. Automatic singularity detection
was rejected: callbacks can be discontinuous, undefined at an endpoint, noisy,
or adversarial, and a finite probe cannot establish the local analytic form.

The first implementation does not include Wynn epsilon extrapolation. Calling
this QAGS would therefore be misleading. It is named
`adaptive_gauss_kronrod`, and the capability record describes the exact rules
and transforms.

The quadratic endpoint transformation is qualified for logarithmic and
inverse-square-root behavior. Stronger algebraic singularities may exhaust the
depth or roundoff budget and are not silently promoted to supported; tanh-sinh
or extrapolation remains deferred until its own corpus is qualified.

## Independent evidence

The embedded Gauss member is a local error estimator, not an independent
oracle. Production success additionally requires agreement with composite
Gauss-Legendre 8 using fresh nodes on two panels inside every final leaf. This
validator reuses the partition but neither samples nor weights. It is
convergence-supporting evidence, not a proof or rigorous enclosure.

Binary64 cancellation is estimated from the integral of `abs(f)` gathered by
the Kronrod rule. Severe cancellation emits `loss_of_significance`; a small
absolute residual is not silently described as high relative accuracy.

## Deferred methods

- Wynn epsilon extrapolation needs its own convergence and roundoff corpus.
- Tanh-sinh belongs with an arbitrary-precision or explicitly endpoint-focused
  method record.
- Cauchy principal values and algebraic/logarithmic or Fourier weights require
  their specialized semantic contracts.
- Multidimensional integration needs global rather than per-nested-call error
  and resource accounting.
