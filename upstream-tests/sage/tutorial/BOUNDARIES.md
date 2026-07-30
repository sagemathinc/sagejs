# Guided Tour compatibility boundaries

At the pinned Sage revision, the corpus contains 662 executable examples:

- 410 pass with Sage-compatible output or an explicitly equivalent numeric or
  symbolic result;
- 6 carry upstream `.. skip` directives;
- 246 are expected failures grouped by architectural boundary in
  `expectations.json`;
- 0 are unclassified failures or unexpected passes.

Expected failures are strict. If an excluded example starts passing, the test
gate reports an unexpected pass until its classification is removed. Every
classification lists exact source locations and a shared technical reason.

The remaining work is no longer a collection of missing scalar helpers. It
requires choosing or building one of these substantial subsystems:

- multivariate polynomial rings, ideals, Gröbner bases, and algebraic geometry,
  most naturally by deciding how Sage.js should integrate Singular;
- Laurent and power series with precision propagation;
- approximate real and complex matrix arithmetic and eigensystems;
- exact algebraic closures and eigensystems;
- p-adic rings/fields and general number fields;
- permutation and finitely generated abelian groups;
- broader symbolic CAS facilities: coupled nonlinear solving, partial
  fractions, ODEs, Laplace transforms, and arbitrary-precision special
  functions;
- elliptic curves, Dirichlet characters, and modular forms/modular symbols;
- Sage's category framework and concrete implementation-class identity model.

Some output differences are intentional consequences of Sage.js architecture,
not missing mathematics: optimized JavaScript small integers are interned,
symbolic functions are compiled callables, and portable FLINT polynomial
elements do not expose Sage's backend-specific NTL class identities. Those
examples remain explicit expected failures rather than being hidden by broad
output normalization.

