---
title: "Number-field class and unit groups"
---

# Number-field class and unit groups

Sage.js computes coupled ordinary ideal class groups and unit groups for
absolute number fields over `QQ`. The shared computation is available as
`K.class_unit_group()`; `K.class_group()`, `K.class_number()`, `K.unit_group()`,
`K.units()`, and `K.regulator()` are projections of the same engine.

```sage
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^2 + 4*x + 1)
result = K.class_unit_group()
result.complete, result.proof_status
# (True, 'exact-unconditional')
result.class_group().invariants(), result.unit_group().unit_rank
# ((), 1)
```

The motivating nonquadratic acceptance field is

```sage
L.<b> = NumberField(x^5 + x^3 - x^2 + 4*x + 1)
conditional = L.class_unit_group(proof=False)
conditional.class_group().invariants()
# (4,)
conditional.unit_group().unit_rank
# 2
```

This quintic has signature `(1, 2)` and field discriminant `380452`. It is a
deliberately slow documentation example; the ordinary test suite validates
its committed oracle record and runs the discriminant-12 quadratic through
the public API. Set `SAGEJS_SLOW_CLASS_UNIT=1` when running
`test/number-field-class-unit-public.cjs` to replay both proof modes for the
quintic as well.

## Proof and GRH semantics

`proof=None`, the default, means unconditional completion. `proof=True` is the
explicit spelling of the same policy. A complete result has proof status
`exact-unconditional`.

`proof=False` permits the factor-base completeness theorem to assume GRH. A
complete result then has status `exact-relations-conditional-grh`. The ideals,
relations, Smith normal form, units, witnesses, and group operations are still
exact; only the theorem that the searched factor base is sufficient is
conditional. This is not a floating-point or heuristic group.

The two policies have distinct cache identities. Always retain
`result.proof_status` with serialized results, and do not relabel a conditional
result after an unrelated unconditional computation.

If resource limits or cancellation prevent certification, `result.complete`
is false and the status is `incomplete-resource-limit`. The result may expose
diagnostics or tentative invariants, but `result.class_group()` deliberately
raises instead of returning an unproved group.

## Ideal-class maps and principality

A completed class group is both an abstract finite abelian group and an exact
map from fractional ideals:

```sage
C = conditional.class_group()
c = C.gen(0)
I = c.ideal()
C(I) == c
# True
C.discrete_log(I)[0]
# (1,)
c.order(), C.is_principal(I)
# (4, False)
```

`C.discrete_log(I)` returns coordinates and a principal witness for the
reduction. `C.gens_ideals()` returns representative generator ideals. Generator
ideals and coordinates are tied to one presentation; they are not canonical
across Sage.js, Sage/PARI, Magma, or Hecke. Compare abstract invariant factors,
orders, replayed ideal relations, and normalized lattice data rather than
displayed representations.

## Factored units and regulator enclosures

`result.units()` returns exact `FactoredNumberFieldElement` objects. Keeping a
unit as a product avoids an unnecessary coefficient explosion. Use
`unit.factors()` to inspect the product, `unit.norm()` and
`unit.principal_ideal()` for exact operations, and `unit.evaluate()` only when
an expanded field element is genuinely needed. `unit.to_dict()` is a
canonical, authenticated payload and `unit.stable_hash()` is its content hash.

`result.regulator()` returns a `RegulatorEnclosure`, not a bare decimal. Its
`lower`, `upper`, `precision_bits`, `rigorous`, and `proof_status` fields record
a weighted logarithmic determinant enclosure; complex places have weight two.
`K.regulator(prec=200)` requests at least 200-bit work and may reuse or refine
the coupled context. A rigorous nonzero determinant certifies independence at
the full Dirichlet rank; the separate rigorous `h*R` index-one validation is
what certifies that the subgroup is the complete unit lattice. Do not compare
printed midpoint strings: compare interval containment or exact serialized
endpoints.

## Resources, cancellation, and checkpoints

Resource keywords participate in the context cache key. The public engine
accepts bounds including `max_factor_base_bound`, `max_factor_base_size`,
`max_relation_attempts`, `max_relations`, `max_candidates_per_ideal`,
`max_random_terms`, `max_coefficient_bound`, `max_partial_relations`,
`large_prime_bound_multiplier`, `precision_bits`,
`max_precision_bits`, `max_analytic_prime_bound`, and `max_memory_bytes`.
Defaults are portable safety policy, not a promise that every field within a
degree or discriminant range will complete.

Pass `cancelled=callback` to `K.class_unit_group()` for cooperative
cancellation. The callback is checked at deterministic stage boundaries;
cancelled computations return an explicit incomplete result. Supplying a
callback disables result caching so a cancelled state cannot poison an
ordinary call. Process-level callers should still enforce wall-clock and
memory limits outside the runtime.

The successful result's `context` supports `context.checkpoint()` and
`context.checkpoint_hash()`. Checkpoints are canonical authenticated data tied
to the exact field, maximal order, discriminant, proof state, resource policy,
seed, and component states. `ClassUnitGroupContext.from_dict()` verifies those
bindings and accepts component-specific decoders and verifiers.

For an in-progress computation, pass `checkpoint=path` (or a detached sink)
to save authenticated stage snapshots and `resume_from=path` (or a detached
source) to continue the same deterministic search. `progress=callback`
receives structured events, and `max_checkpoint_bytes` bounds untrusted input.
Filesystem replacement is atomic, but concurrent writers are not coordinated
and directory contents are not explicitly `fsync`ed; applications needing
stronger crash durability should provide their own sink.

## Oracle provenance and benchmark method

The committed fixture
`test/fixtures/number-field-class-unit-oracles.json` contains 16 normalized
fields of degrees 1 through 5. It covers every quartic signature, cyclic and
noncyclic class groups, unit ranks 0 through 4, torsion, ideal logs and
principality, rigorous 100/200-bit regulator intervals, invalid inputs, and
bounded hard cases. The developer harness is
`bench/class-unit-groups/run-oracles.cjs`.

The companion fixture
`test/fixtures/number-field-class-unit-high-degree-oracles.json` covers
`x^n-x-1` in degrees 6 through 10. It records signatures, discriminants,
equation-order indices, class and unit invariants, regulators, and prime
splitting through each exact Minkowski bound. Sage/PARI, Magma, and Hecke
0.40.0 independently agree on the normalized data in conditional-GRH and
unconditional modes. The one-sample timings are provenance, not gates.

The oracle programs are compatibility tools, not runtime dependencies, and no
upstream source is copied into Sage.js:

| Source | Role | License / access |
|---|---|---|
| SageMath with PARI | Independent normalized oracle and Arb regulator capture | GPL-compatible Sage distribution; PARI/GP is GPL-2.0-or-later |
| Magma 2.18-5 | Independent black-box class, unit, map, and regulator oracle | Proprietary; invoked only from a licensed local installation |
| Hecke.jl / Oscar.jl | Independent high-degree oracle; separately instantiated compatibility check | Hecke BSD-2-Clause; Oscar GPL-3.0-or-later |

Correctness checks compare stable mathematical projections and ignore timing.
Each external system starts once per tier and constructs fresh fields for each
sample and proof mode. A publishable performance receipt uses at least five
samples on an uncontended host, reports versions, CPU, OS, proof mode, and
cold-versus-warm boundaries, and reports medians without combining process
startup with warm context work. Harness timeouts terminate the external
process group and are reported as failures rather than leaving orphan work.
See the harness README for the corpus tiers and recommended initial acceptance
thresholds.
