# Projection regression and proof policy

The nontrivial cubic projection fixture retains the three presentations labeled
`3.1.588.1`, `3.1.5448.1`, and `3.1.4027.2`, with class-group invariants `(3,)`,
`(8,)`, and `(6,)`. It distinguishes exact map algebra from the assumptions
needed for combined class-and-unit completeness.

The previous fixture expected both proof policies to yield completed combined
results. Its unconditional expectation depended on the old BF proof-label bug:
Minkowski prime-class coverage was followed by an unconditional label for the
units, without an independent fundamental-unit certificate. These presentations
are not among the existing exact small-cubic unit specializations. Correcting
the test does not restore that label or change any production proof semantics.

The fixture now checks three separate outcomes:

- Conditional combined results retain all nontrivial projection checks:
  transactional sealing/rollback, interposed helpers, private-hook replacement,
  rejection of mutated source groups, independent wrappers and ideal data,
  exact invariants and payloads, zero-algebra repeated views, detached mutation
  isolation, cancellation, full replay and replaced-capsule rejection.
- Fresh and cached unconditional combined requests explicitly decline for the
  missing non-BF unit-completeness proof. Failed richer requests must preserve
  the conditional result, proof label, context, retained projection and maps.
- A separate fresh field returns the exact scalar class number 3 with
  `proof=True`. Direct execution showed that the other two public scalar
  requests currently decline through the combined engine. Their known class
  numbers 8 and 6 do not establish that the unconditional public route works.
  These diagnosed capability gaps are explicitly recorded, not counted as
  successful scalar computations.

The decoder counter instruments `ConditionalGRHProofRecord`, the evidence kind
actually used. Explicit payload verification must increment that counter;
repeated projection views must leave every algebra/replay counter at zero.
Callback-bearing conditional computations remain non-reusable, while their
unconditional combined requests also decline explicitly.

Three successful conditional projection rows are not reported as six successful
combined computations: scalar controls and capability declines have separate
result arrays. No trivial-field substitution replaces the nontrivial map tests.

An exact scalar class-number certificate does not certify fundamental units.
A future independently verified class-only map adapter could use exact class
number and relation/presentation evidence without solving unit completeness;
that remains a separate product capability, not a premise of this regression.

## Public map proof-regime regression

`test/number-field-class-group-maps-proof.cjs` also retains the sextic
$x^6-x-1$ and cubic $x^3+4x-1$, with class numbers 1 and 2, respectively.
Their public maps are tested under explicit conditional completion, including
prime schema rejection and the distinction between unconditional Minkowski
generation and conditional analytic completeness. Fresh and cached requests
for unconditional class groups or combined groups must decline with the
specific missing non-BF completeness diagnostic. Their conditional payloads
must still verify afterward. No production algorithm or proof label changes.

The earlier independent Minkowski-stream adapter fixture retains unconditional
payload validation, proof-progress completeness/count assertions, and ideal
and principal-witness schema mutations. That fixture uses explicit test doubles
for engine/saturation authority; it is an adapter regression, not a new proof
of a public field computation. A minimal direct-replay fixture checks the
100,000 bound guard: 100,001 is rejected before enumeration, while otherwise
identical metadata at 100,000 reaches an enumeration marker. Thus this resource
check does not depend on claiming unavailable unconditional units.
