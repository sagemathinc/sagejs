# Hyperelliptic BSD arithmetic plan

## Purpose

Build a transparent Birch--Swinnerton-Dyer arithmetic layer for genus-2 and
genus-3 hyperelliptic Jacobians over `QQ`.  The work begins with a useful
analytic quotient assembled from supplied arithmetic data, then replaces each
supplied input with an independently checkable Sage.js computation.

The intended end state is not a function that prints a plausible integer.  It
is a collection of exact and numerical objects that records:

- the normalization of every BSD factor;
- whether the Mordell--Weil group or only a finite-index subgroup is known;
- which inputs were computed, supplied, proved, bounded, or merely numerical;
- the distinction between a geometric and rational component group;
- the distinction between a model differential and a Neron differential;
- the analytic error status of the leading Taylor coefficient;
- enough certificates and source data to reproduce or independently verify the
  result.

This plan deliberately uses a bounded-capability contract.  An exact answer in
a documented genus/reduction/model envelope is a successful implementation;
unsupported wild or unsaturated cases must remain explicit rather than being
turned into guesses.

## Mathematical contract

Let `A/QQ` be an abelian variety of rank `r`, with dual `Adual`.  Write

```text
Lstar(A,1) = lim_(s->1) L(A,s)/(s-1)^r = L^(r)(A,1)/r!.
```

The general BSD quotient is

```text
             Lstar(A,1) * #A(Q)_tors * #Adual(Q)_tors
Q(A) = -------------------------------------------------------.
       Omega_A * Reg(A(Q),Adual(Q)) * product_p c_p(A)
```

The regulator here is the determinant of the Neron--Tate pairing between the
free parts of `A(Q)` and `Adual(Q)`.  The generic data model must retain these
two groups separately.  It must not assume that either torsion factor is a
square or impose a square/twice-square condition on the result.  This is
important even in familiar modular settings: non-principally-polarized
abelian varieties can have Tate--Shafarevich groups whose orders are neither a
square nor twice a square; see William Stein, *Shafarevich--Tate Groups of
Nonsquare Order*, <https://wstein.org/papers/nonsquaresha/>.

For `J = Jac(C)`, the canonical principal polarization identifies `J` with its
dual.  If `Gamma` is a supplied full-rank subgroup of `J(Q)` and

```text
m = [J(Q)/J(Q)_tors : Gamma],
```

then its height-pairing determinant satisfies

```text
Reg(Gamma) = m^2 * Reg(J(Q)),
```

and the primary computable object is

```text
                     Lstar(J,1) * #J(Q)_tors^2
Q_Gamma = ----------------------------------------------------
          Omega_J * Reg(Gamma) * product_p c_p(J)

        = #Sha(J/QQ) / m^2                         (assuming BSD).
```

The API must therefore call this value `sha_over_index_squared`, or an equally
explicit name.  It may expose `analytic_sha` only when a certified subgroup
index is supplied.  Rank zero uses the conventional regulator `1`.

The existing hyperelliptic analytic engine returns actual derivatives, not
Taylor coefficients, so the division by `r!` is mandatory and must have a
direct regression test.  Functional-equation parity applies to the completed
Lambda function, not to arbitrary raw derivatives of `L`.

## Honesty and rigor levels

Every result should carry independent statuses for:

1. **Analytic rank:** supplied/proved, probable from a refined central jet, or
   indeterminate.
2. **Leading term:** arithmetic-ball enclosure plus refinement-stable analytic
   approximation; eventually a rigorous analytic enclosure.
3. **Period:** supplied, model-normalized, or Neron-normalized.
4. **Regulator:** supplied scalar, determinant of a supplied pairing, or
   computed from verified rational divisors.
5. **Tamagawa data:** supplied, geometric only, or certified rational
   component-group order.
6. **Torsion:** lower bound, reduction upper bound, or certified exact order.
7. **Subgroup:** arbitrary independent points, full-rank finite-index subgroup,
   `S`-saturated subgroup, globally saturated subgroup, or full Mordell--Weil
   group.

The current central-value engine explicitly does not enclose every infinite
contour error.  Until that changes, the combined BSD result must remain
`rigorous=False` even when every arithmetic input is certified.  Precision
doubling and independent algorithms establish strong numerical evidence, not
a theorem-proving interval.

No result is rounded silently.  Integer or square/twice-square recognition is
an optional diagnostic that reports the candidate, distance, precision
stability, and applicable hypotheses.  In particular, `Q_Gamma` need not be an
integer because the unknown index occurs in its denominator.

## Proposed public surface

The exact spelling should be frozen during Phase 0, but the intended workflow
is:

```sage
R.<x> = PolynomialRing(QQ)
C = HyperellipticCurve(x^5 - x + 1)

B = C.bsd_analytic_quotient(
    rank=2,
    real_period=Omega,
    height_pairing=[[h11, h12], [h12, h22]],
    tamagawa_numbers={2: 1, 23: 2},
    torsion_order=1,
    subgroup_index=None,
    prec=160,
)

B.leading_derivative()          # L^(2)(J,1)
B.leading_taylor_coefficient()  # L^(2)(J,1)/2!
B.regulator()
B.tamagawa_product()
B.sha_over_index_squared()
B.diagnostics()
B.to_dict()
```

When the index is certified:

```sage
B2 = B.with_subgroup_index(3, certificate=index_certificate)
B2.analytic_sha()               # 3^2 * B.sha_over_index_squared()
```

Later phases add the independently useful primitives:

```sage
C.real_period()
C.tamagawa_number(p)
C.is_deficient(p)

J = C.jacobian()
J.torsion_bound()
J.torsion_subgroup()
P.canonical_height()
J.height_pairing(points)
J.regulator(points)
J.saturate(points)
```

Objects should serialize to a versioned, deterministic record with decimal
strings for unbounded integers and string/ball representations for numerical
values.  The record must include the curve model, transforms, precision,
backend versions, source/provenance for supplied inputs, and all capability
statuses.  This should work with the existing `save`/`dumps` facilities and be
straightforward to store in the supported Python-compatible SQLite layer.

## Phase 0: conventions, corpus, and interfaces

Freeze the mathematical and software contracts before adding another numeric
formula.

### Work

- Define `BSDArithmeticInput`, `BSDAnalyticQuotient`, period, regulator,
  Tamagawa, torsion, subgroup-index, and provenance record schemas.
- Keep the generic `A`/`Adual` factors in the internal schema, with a Jacobian
  constructor that records the canonical principal polarization.
- Define the Neron--Tate pairing convention and the factor of `1/2` used to
  obtain a bilinear pairing from a quadratic canonical height.
- Define `Omega_J` as the integral of the absolute value of a Neron top
  differential over `J(R)`, including the real-component factor.
- Specify transformations of curve models, differential bases, Mumford
  divisors, height pairings, periods, and local data.
- Define exact failure/status types; do not use `None` to conflate unknown,
  unsupported, and numerically indeterminate states.
- Assemble a checked-in oracle corpus containing ranks 0, 1, and at least 2;
  odd- and even-degree genus-2 models; generalized `h != 0` models; semistable
  and almost-good reduction; split Jacobians; and several supported genus-3
  curves.
- Include modular genus-2 examples with independently known BSD data and
  decomposable Jacobians whose factors provide normalization checks.

### Oracles

- PARI `lfungenus2`, `lfun`, `genus2red`, and `hyperellperiods(C,2)`.
- Magma `LSeries`, analytic Jacobians, heights, regulators, rational torsion,
  Mordell--Weil/saturation routines, and regular-model calculations.
- Raymond van Bommel's genus-2 BSD corpus and algorithms.
- LMFDB records only as versioned fixture data, never as a runtime dependency.
- Products or isogeny decompositions into elliptic curves, with every period,
  regulator, torsion, Tamagawa, and isogeny-index correction made explicit.

### Exit criterion

A written normalization note and schema tests can express a generic
dual-aware quotient, a principally polarized Jacobian quotient, an unknown
subgroup index, and every rigor/provenance state without guessing.

## Phase 1: analytic quotient from supplied arithmetic data

This is the first research-usable deliverable and should land independently of
automatic period, height, or Tamagawa computation.

### Work

- Obtain `r`, `L^(r)(J,1)`, and the exact functional-equation sign from the
  existing prepared central-weight engine.
- Accept either a supplied regulator or a symmetric height-pairing matrix and
  compute its determinant.
- Validate positivity and nondegeneracy at the requested precision.
- Accept per-prime Tamagawa numbers and check that every certified bad prime is
  represented; require an explicit override/provenance record if global
  reduction is outside the current envelope.
- Accept separate generic torsion orders and specialize to the square only for
  a recorded principal polarization.
- Compute and expose every numerator/denominator factor as well as the final
  quotient.
- Compare independent precisions and reject inconsistent analytic rank or
  leading-term isolation.
- If supplied points have a different count from the analytic/supplied rank,
  return a rank mismatch rather than a determinant of the wrong size.
- Add deterministic JSON and SQLite-friendly serialization.

### Tests

- Rank 0 uses regulator `1` and `0! = 1`.
- Rank 1 uses `L'(1)` with no extra factor.
- Ranks 2 and 3 catch the `r!` normalization explicitly.
- Changing a subgroup basis by an integral matrix of determinant `d` changes
  the regulator by `d^2` and `Q_Gamma` by `1/d^2`.
- Generic `A`/`Adual` torsion factors are not accidentally squared.
- Missing bad-prime data, a singular pairing matrix, fractional exact inputs,
  and probable/proved rank disagreement all fail honestly.

### Exit criterion

For the oracle corpus, supplied Magma/PARI/LMFDB arithmetic inputs reproduce
the expected analytic quotient with full provenance.  The result is labeled
`sha_over_index_squared` unless a subgroup-index certificate is present.

## Phase 2: real periods and Neron normalization

Implement an independent hyperelliptic period engine for genus 2 and 3, using
PARI as a differential oracle rather than a runtime dependency.

### Mathematical outline

For

```text
C: y^2 + h(x)y = f(x),
```

use the completed model `Y^2 = h^2 + 4f` and the holomorphic differentials

```text
omega_i = x^i dx / (2y+h),  0 <= i < g.
```

Compute a symplectic homology basis, the `g x 2g` period matrix, the real
period-lattice volume, and the number of connected components.  Separately
compute the determinant taking the model differential lattice to the global
Neron differential lattice.  The BSD period is returned only after this
normalization is certified.

### Work

- Isolate and order complex branch points with Arb/Acb balls.
- Construct cycles stably under close or nearly real branch points.
- Integrate all differentials in batches with certified finite arithmetic and
  adaptive path subdivision.
- Check the Riemann bilinear relations and positive definiteness of the
  resulting Siegel matrix.
- Compute the real-locus component factor.
- Track every rational model transformation and its determinant on
  differentials.
- Initially accept a supplied Neron-lattice index when integral-model
  certification lies outside the implemented local envelope.
- Cache branch geometry and quadrature plans by exact model and precision.

### Tests and benchmarks

- Compare the large period matrix and BSD real volume with PARI
  `hyperellperiods(C,1)` and `hyperellperiods(C,2)`.
- Compare analytic Jacobians and real volumes with Magma.
- Test real-root topologies, no-real-root models, close branch points,
  generalized `h`, odd/even degree, and model transformations with known
  differential determinant.
- Require convergence under precision doubling and stable homology choices.

### Exit criterion

`C.real_period()` returns a model period for every supported smooth genus-2/3
complex model and a BSD/Neron period exactly when the differential-lattice
normalization is certified or explicitly supplied.

## Phase 3: rational Tamagawa numbers in the certified local envelope

Compute

```text
c_p(J) = #Phi_p(F_p),
```

not merely the geometric component-group order.  Conductor exponents, local
Euler-factor degrees, numbers of components, and `#Phi_p(Fbar_p)` are not
substitutes for `c_p`.

### Initial envelope

- good reduction (`c_p = 1`);
- the implemented genus-2 almost-good cases;
- split semistable genus-2/3 cluster pictures;
- nonsplit semistable cases once Frobenius action on the component lattice is
  certified;
- odd primes only at first.

### Work

- Convert the existing cluster tree, relative depths, principal components,
  node/edge data, and Frobenius action into the weighted dual graph of the
  minimal regular model.
- Construct the graph Jacobian/component lattice using exact integer matrices,
  Smith normal form, and the monodromy pairing.
- Compute Frobenius-fixed rational component classes rather than taking the
  geometric group order.
- Retain a certificate containing the graph/lattice matrices, Frobenius
  operator, Smith data, and fixed subgroup.
- Add `tamagawa_product()` only when every bad prime has an exact answer.
- Preserve explicit `unsupported_wild`, `unsupported_at_2`, and
  `model_not_minimal` outcomes.

### Oracles

- Magma regular models and component groups.
- Van Bommel's Tamagawa implementation and corpus.
- Sage/PARI genus-2 reduction types, remembering that their displayed
  component group is geometric.
- Direct enumeration of the finite component group with Frobenius for small
  graph examples.

### Exit criterion

Every local answer has a recheckable rational-component-group certificate,
and the full Tamagawa product is atomic: one unsupported prime prevents a
claim of completeness.

## Phase 4: rational torsion bounds and certificates

Build the useful bounded workflow before attempting a universal torsion-point
finder.

### Work

- For several certified good primes, compute `#J(F_p)` and use reduction to
  bound rational torsion, handling residue-characteristic primary parts by
  combining distinct primes correctly.
- Factor and progressively tighten the gcd bound; expose the primes and group
  orders forming the certificate.
- Compute rational `2`-torsion from the factorization/Galois structure of the
  branch polynomial.
- Verify supplied rational Mumford divisors exactly and compute their orders
  using reduction bounds plus factor-and-strip scalar multiplication.
- Certify the full torsion subgroup when the generated lower bound equals the
  reduction upper bound.
- Add bounded searches for small odd torsion only after measuring them; failure
  to find points must not reduce the upper bound.
- Keep generic `A` and `Adual` torsion slots distinct in serialized BSD input.

### Exit criterion

`J.torsion_bound()` always returns a proof record in its supported good-prime
envelope, while `J.torsion_subgroup()` returns only when explicit rational
generators attain that bound.

## Phase 5: fast genus-2 canonical heights and regulators

Implement the Muller--Stoll Kummer-surface algorithm as the production genus-2
height path, while retaining a readable definition/reference path.

Reference: J. Steffen Muller and Michael Stoll, *Canonical Heights on Genus Two
Jacobians*, <https://arxiv.org/abs/1603.00640>.

### Work

- Add exact Kummer coordinates and duplication for integral genus-2 models,
  including transformations to and from generalized `h != 0` and even-degree
  models where justified.
- Implement the naive height and its decomposition into archimedean and
  non-archimedean local correction functions.
- Use the factorization-free/coprime-factor strategy for finite corrections so
  large discriminants do not force complete integer factorization.
- Evaluate the archimedean correction with precision refinement and explicit
  tail bounds/status.
- Define `canonical_height(P)` with the chosen theta-divisor normalization.
- Define the bilinear pairing by polarization and compute pairing matrices in
  a basis-independent way.
- Compute `Reg(Gamma)` as the determinant of the pairing matrix, rejecting
  dependent or numerically unresolved inputs.
- Cache model constants and local correction data across all points in a
  subgroup or family.
- Retain a slow repeated-doubling/reference definition on small examples as a
  differential oracle.

### Tests and benchmarks

- Exact torsion points have height zero within the stated analytic status.
- `hat_h(nP) = n^2 hat_h(P)` over a wide range of signed scalars.
- Pairing matrices transform by `M^T H M`; regulators transform by
  `det(M)^2`.
- Compare individual heights, pairings, and regulators with Magma.
- Include rank 1, 2, and higher supplied subgroups, generalized models, and
  bad-prime correction cases.

### Exit criterion

Genus-2 rational Mumford divisors have a practical canonical-height and
regulator API whose normalization is independently checked against Magma and
whose repeated calls reuse model-local work.

## Phase 6: saturation and subgroup-index certificates

This phase upgrades `sha_over_index_squared` when enough Mordell--Weil
information is available.  It does not pretend that saturation proves the
rank is complete.

### Work

- Distinguish four questions explicitly:
  1. are the supplied points independent;
  2. do they have the expected/proved full rank;
  3. is their subgroup saturated at a specified prime or finite set `S`;
  4. is there a proved global index bound making `S`-saturation sufficient?
- Use the regulator and height lower bounds to derive an index/search bound
  where the required hypotheses are established.
- Use reductions into the existing explicit finite-field abelian-group maps to
  rule out divisibility and constrain possible saturation primes.
- Implement exact rational division tests for Mumford divisors, beginning with
  `2` and small odd primes.
- Search for missing divisors within a certified height bound and enlarge the
  subgroup when one is found.
- Return a chain of basis-change matrices and exact index factors.
- Accept a proved algebraic rank or Selmer upper bound from an external source
  with provenance; do not turn the probable analytic rank into an algebraic
  proof.

### Capability boundary

A supplied full-rank subgroup can be saturated without implementing a complete
2-descent package.  Proving automatically that the subgroup has full rank is a
later Selmer/descent project and must remain a separate status.

### Exit criterion

For bounded genus-2 examples, `J.saturate(points)` either returns a larger
subgroup or a certificate of `S`-saturation.  It claims a global index only
when a separately verified index bound makes the finite test sufficient.

## Phase 7: deficient places and Sha-shape diagnostics

Implement the Poonen--Stoll obstruction correctly rather than adding a generic
"nearest square" heuristic.

Reference: Bjorn Poonen and Michael Stoll, *The Cassels--Tate Pairing on
Polarized Abelian Varieties*, <https://math.mit.edu/~poonen/papers/sha.pdf>.

### Work

- Define deficiency at a place `v` using the local existence of a divisor of
  degree `g-1`, with the appropriate genus-2 odd-degree formulation as a
  convenience, not as the general definition.
- Implement the real-place test exactly from the topology/real divisor data.
- Implement finite-place tests first for the current semistable and almost-good
  local envelope, then extend with regular models.
- Return local witnesses or obstruction certificates and assemble the parity
  of deficient places.
- For Jacobians, report the conditional consequence for whether finite
  `#Sha` is a square or twice a square.
- Disable this specialization for a generic abelian variety or an unrecorded
  polarization; never use it as an integer-recognition rule for the generic
  quotient.

### Exit criterion

The oracle corpus reproduces Magma's deficiency/index-one decisions and known
Poonen--Stoll examples.  The BSD result can display the applicable conditional
Sha-shape theorem without altering its numerical value.

## Phase 8: genus-3 canonical heights via Faltings--Hriljac

Extend height and regulator support beyond the optimized genus-2 Kummer path.
This is the largest phase and should be delivered through progressively wider
regular-model envelopes.

References:

- Jan Steffen Muller, *Computing Canonical Heights Using Arithmetic
  Intersection Theory*, <https://arxiv.org/abs/1105.1719>;
- David Holmes, *Computing Neron--Tate Heights of Points on Hyperelliptic
  Jacobians*, <https://arxiv.org/abs/1004.4503>.

### Initial envelope

- odd-degree genus-3 models with a rational point at infinity;
- rational Mumford divisors with controllable/disjoint horizontal support;
- good and certified semistable odd-prime reduction;
- a supplied or separately certified treatment at unsupported primes,
  especially `2`.

### Work

- Construct the required proper regular-model data from the existing cluster
  picture wherever possible.
- Move divisor representatives to disjoint support and compute finite
  intersection multiplicities exactly.
- Solve for vertical correction divisors using the intersection matrix of the
  special fibre.
- Compute archimedean Green functions from the period matrix and theta
  functions, sharing the Phase-2 analytic Jacobian cache.
- Assemble the Faltings--Hriljac pairing and verify independence from auxiliary
  divisor representatives.
- Build pairing matrices and regulators with the same public normalization and
  provenance schema as genus 2.
- Add resource estimates for regular-model construction, Groebner/intersection
  work, theta precision, and integer factorization.
- Extend from semistable odd primes to broader tame cases before considering
  wild reduction at `2`.

### Tests and benchmarks

- Bilinearity, symmetry, quadratic scaling, torsion height zero, and invariance
  under changing divisor representatives.
- Agreement with Magma's general hyperelliptic height implementation.
- Agreement with genus-2 Muller--Stoll heights when both algorithms apply.
- Split/isogenous genus-3 examples where heights can be checked through lower-
  dimensional factors.
- Separate timing for regular models, finite intersections, period/theta work,
  and repeated points on one curve.

### Exit criterion

Supported genus-3 rational divisors have independently verified canonical
heights and regulators.  Unsupported reduction or excessive regular-model
work produces a structured capability result, never an incomplete height.

## Final integration milestone

After Phases 1--7 and the first Phase-8 envelope, the intended experience is:

```sage
J = C.jacobian()
Gamma = [P1, P2]

B = C.bsd_analytic_quotient(
    subgroup=Gamma,
    rank=2,                  # supplied with provenance, or probable analytic
    prec=192,
)

B
# Analytic BSD quotient for Jac(C)
# rank: 2 (supplied/proved)
# leading Taylor coefficient: ...
# real period: ... (Neron-normalized)
# regulator: ... (computed for Gamma)
# Tamagawa product: ... (certified)
# rational torsion order: ... (certified)
# subgroup status: S-saturated / global index unknown
# sha_over_index_squared: ...
# rigorous analytic enclosure: False
```

Automatic assembly must be atomic.  If a bad prime, period normalization,
height correction, torsion proof, or rank condition is missing, the object may
still show completed independent factors but must not claim a complete BSD
quotient.

## Architecture and implementation policy

- The mathematical sources remain ordinary CPython-parseable Python.
- Implement readable reference algorithms before accelerating measured hot
  regions with source-transparent `@native` compilation.
- Prefer existing exact matrix, polynomial, number-field, FLINT, and Arb
  facilities to new handwritten native mathematics.
- PARI, SageMath, Magma, and research scripts are development oracles, not
  runtime requirements for the supported Sage.js path.
- Batch crossings for period integration, local-height corrections, reduction
  maps, or theta evaluation; do not create one host/native call per scalar.
- Every accelerated path retains a dynamic fallback and differential tests.
- Windows x64, Linux x64/arm64, and macOS arm64 remain first-class targets.
- New mathematical modules enter strict Pyright and Python formatting gates.
- New native boundaries require the architecture inventories, audit records,
  cancellation/resource tests, and cross-platform focused receipts.

## Dependency and delivery order

```text
Phase 0 normalization/schema
        |
        v
Phase 1 supplied-data quotient
        |
        +---- Phase 2 periods ----------------------+
        +---- Phase 3 Tamagawa ---------------------+
        +---- Phase 4 torsion ----------------------+---- integrated quotient
        +---- Phase 7 deficient places ------------+
                                                     |
Phase 5 genus-2 heights --> Phase 6 saturation ------+

Phase 2 periods + regular-model data --> Phase 8 genus-3 heights
```

Recommended coherent releases:

1. **BSD quotient release:** Phases 0--1.
2. **Rank-zero arithmetic release:** Phases 2--4 and 7; this already makes
   many genus-2/3 rank-zero BSD experiments substantially automatic.
3. **Genus-2 positive-rank release:** Phases 5--6.
4. **Genus-3 positive-rank release:** the supported envelope of Phase 8.
5. **Later independent project:** full 2-descent/Selmer and automatic
   Mordell--Weil rank determination.

## Global acceptance gates

- Every formula is invariant under tested curve/model transformations after
  applying the recorded differential and subgroup changes.
- Rank `r` uses `L^(r)(1)/r!`; completed/raw derivative normalizations are not
  conflated.
- `Q_Gamma` scales by the inverse square of subgroup index.
- Rational Tamagawa numbers use Frobenius-fixed component classes, not the
  geometric component-group order.
- The BSD period uses a certified Neron differential lattice or says that it
  does not.
- Torsion results distinguish lower bounds, upper bounds, and exact groups.
- Saturation results distinguish `S`-saturation, global saturation, full rank,
  and full Mordell--Weil determination.
- Numerical results retain analytic refinement/error diagnostics and never
  inherit `rigorous=True` merely from exact arithmetic inputs.
- No generic square or twice-square assumption is encoded.
- Oracle agreement covers PARI, Magma, Sage/LMFDB fixtures, split Jacobians,
  and model transformations at multiple precisions.
- Serialization round-trips every exact integer, numerical enclosure/status,
  certificate, and provenance field.
- Focused results agree across Linux x64, Linux arm64, macOS arm64, and native
  Windows x64 wherever the phase includes native acceleration.

## Explicit non-goals of this plan

- A universal algorithm proving the Mordell--Weil rank of every genus-2/3
  Jacobian.
- A complete wild regular-model and conductor/Tamagawa theory at `p=2` in the
  first release.
- Silent use of the analytic rank as a proof of algebraic rank.
- Treating the nearest integer, square, or twice-square as a certificate.
- Requiring PARI, Magma, SageMath, or an online database at runtime.
- Hiding supplied inputs inside a result that appears fully automatic.

The plan succeeds incrementally: Phase 1 is already a legitimate research
tool, and every later phase converts one previously supplied BSD factor into a
certified Sage.js computation without changing the meaning of earlier output.
