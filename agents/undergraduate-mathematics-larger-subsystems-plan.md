# Undergraduate mathematics: larger subsystem plan

## Purpose

This plan completes the larger PREP-tutorial gaps after the calculus and
discrete-mathematics foundations landed on `undergrad-math`.  The target is
not a collection of tutorial-only stubs: each subsystem must have a usable
public Sage-compatible core, honest capability limits, and the same behavior
in the CLI, Jupyter, and `app.sagejs.org` wherever presentation is involved.

Already delivered:

- common calculus aliases and elementary functions;
- nested, column, and block matrix construction;
- conjunction-aware solving and explicit ODE capability errors;
- symbolic sums, gradients, Hessians, Jacobians, and symbolic cross products;
- general scalar linear first-order ODEs plus the existing second-order
  tutorial equation;
- PREP-order combinations, permutations, multiset derangements, factorial
  helpers, and finite-field linear-code foundations.

## P1 — Executable PREP compatibility corpus

Extract every executable input from the PREP quickstarts into a versioned
offline corpus.  Classify each example as `supported`, `presentation-only`,
`planned`, or `intentionally-out-of-scope`, with a reason and an expected Sage
10.9 result.  Run supported examples through one persistent Sage.js process
and representative display examples through both Jupyter messages and the
browser renderer.

Acceptance:

- no unclassified executable PREP examples;
- every supported example is a regression test;
- unsupported examples raise a useful capability error instead of returning a
  plausible but incorrect object;
- a generated report lists parity by PREP chapter and public API.

## P2 — Interacts without a Python or Jupyter dependency

### Kernel model

Implement `interact`, `@interact`, `input_box`, `slider`, `range_slider`,
`checkbox`, `selector`, `color_selector`, and `button` as ordinary
CPython-parseable Python.  Normalize annotations/defaults into immutable
control specifications.  Calling an interact once evaluates its documented
defaults, so CLI use is deterministic and useful even without a frontend.

Publish live controls as
`application/vnd.sagejs.interact+json` display data.  The payload contains a
version, stable interaction id, ordered controls, layout, current values, and
the output display id.  Control events use a Sage.js-owned request/reply
channel, not IPython widget state or Python traitlets.  Re-evaluation happens
inside the owning kernel session and replaces the prior output atomically.

### Frontends

- Jupyter kernel: expose a `sagejs.interact` comm target using the existing
  pure-JavaScript messaging stack.
- `app.sagejs.org`: render the same MIME schema directly using accessible HTML
  controls, KaTeX, and the existing Plotly renderer.
- Other clients: the initial display remains meaningful even if they do not
  implement the live protocol.

Acceptance:

- PREP's basic plot, slider, checkbox, selector, and custom-layout interacts
  work in Jupyter and the browser app;
- control changes do not leak sessions or retain obsolete outputs;
- CLI execution evaluates defaults and explains that live controls require a
  compatible display frontend;
- protocol conformance tests do not launch `jupyter`, Python, or a browser.

## P3 — Directed rounding and certified real/complex intervals

### Floating-point rounding

Finish Sage-compatible `RealField(prec, rnd=...)` behavior for `RNDN`, `RNDU`,
`RNDD`, `RNDZ`, and `RNDA`.  Add `nextabove`, `nextbelow`, `exact_rational`,
`sign_mantissa_exponent`, and base-2 `str`.  The implementation must use the
MPFR layer already shipped with FLINT; JavaScript binary64 arithmetic is not
an acceptable oracle for directed rounding.

### Interval arithmetic

Add owned native Arb/Acb resource types and public `RealIntervalField`, `RIF`,
`ComplexIntervalField`, and `CIF`.  Construction from integers and rationals
must be outward-rounded exactly.  First public operations:

- arithmetic and integer powers;
- containment, overlap, intersection, union when connected;
- lower/upper endpoints, center, radius, absolute/relative diameter;
- `sqrt`, `exp`, `log`, and trigonometric functions;
- Sage bracket and question-mark formatting.

The native boundary returns Arb/Acb enclosures, never midpoint-only decimals.
Portable WebAssembly uses the same FLINT/Arb code.  If a host lacks the
capability, construction raises an explicit error; it must not silently
substitute uncertified `mpmath.iv` arithmetic.

Acceptance:

- every PREP numerical-analysis rounding and interval example agrees with
  Sage at its requested precision;
- randomized rational inputs contain their exact values after every operation;
- native Linux, macOS arm64, Windows x64, and WebAssembly agree on enclosure
  relations and endpoint directions;
- resource lifetime and serialization tests cover success and exception paths.

## P4 — Combinatorics, groups, and coding completion

The first PREP slice is implemented.  Extend it in this order:

1. ranking, unranking, membership, and uniform random selection for
   combinations and permutations without enumeration;
2. standard permutation parents/elements interoperable with permutation
   groups rather than returning plain lists for every advanced use;
3. linear-code parity-check matrices, syndrome/decode APIs, weight enumerators,
   puncturing/shortening, and efficient automorphism search;
4. named teaching codes (Hamming, Golay, Reed–Solomon) with differential Sage
   and Magma corpora;
5. selected symmetric-function functionality only after polynomial parents can
   represent it naturally.

Exhaustive algorithms retain explicit work ceilings.  Performance-motivated
code uses source-transparent `@native` kernels after a readable dynamic
implementation and differential corpus exist.

## P5 — Selected SciPy compatibility

Create a small, explicit `scipy` compatibility package rather than claiming
general SciPy support.  Use the already shipped NumPy and mpmath layers and
Sage.js native numerical kernels.  Initial PREP-driven surface:

- `scipy.stats.hmean`, percentile helpers, and binomial distributions
  (`pmf`, `cdf`, `rvs`);
- `scipy.integrate.quad` with value/error return shape;
- `scipy.optimize.root_scalar`, `brentq`, and basic multivariable `root`;
- selected `scipy.linalg` decompositions already supported by Sage.js matrix
  backends.

Each function documents its supported parameters.  Unknown keyword arguments
raise `NotImplementedError`; they are never ignored.  Statistical random
sampling accepts deterministic seeds.  Compare numerical results and failure
modes against current SciPy on an offline fixture corpus.

## Sequencing and release gates

1. Keep P1 current throughout the project.
2. Implement P2 and P3 as separate branches because they touch independent
   frontend and native-resource boundaries.
3. Continue P4 in small public-API slices.
4. Start P5 only with the explicit PREP surface above.

Every slice requires focused tests, `pnpm test:baselib:strict`, relevant
browser/Jupyter or native tests, `pnpm architecture:check`, and persistent-host
qualification when native resources change.  Startup size and time budgets
remain ratchets: heavy implementations must be lazy even when their public
constructors are visible at startup.
