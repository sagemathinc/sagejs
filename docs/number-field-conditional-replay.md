# Bounded detached conditional completeness

`export_conditional_class_unit(computation)` and
`replay_conditional_class_unit(text)` in
`sagejs.number_fields.class_unit_replay` provide a bounded, independent
class/unit completeness check. Export accepts the same authenticated generic
terminal sources as component export. The receiver creates a new field and
recomputes its maximal order; this is recomputation cost, not cached replay.

The new `compact-bf-index-v1` binding references the canonical component and
generation envelopes. It binds the ordered exact factored units, defining
polynomial, order basis and exact relation presentation without expanding unit
products. It does not reinterpret the ordinary-coordinate
`unit-saturation-index-certificate.v1` format.

Completeness requires exact prime and principal-relation replay, verified
HNF/SNF, complete Minkowski generating-base coverage, exact unit membership and
torsion, a full-rank rigorous logarithmic regulator, and freshly recomputed
Belabas--Friedman index one. The tentative class number is derived from the
finite verified relation quotient, not accepted from the certificate. The
positive integer ratio is the product of the relation-kernel index and unit
subgroup index; index one forces both to be one.

A successful report has `complete=True` and
`proof_status="exact-relations-conditional-grh"`, with the explicit zeta GRH
assumption. It grants no live context, producer token or coordinate-map
authority. No supplied callback, cached report or serialized rigor flag can
replace a mathematical check. Invalid or unsupported inputs raise; a failure
does not assert that the field lacks a complete class or unit group.
`replay_terminal_components` retains its original component-only, incomplete
report.

This slice retains all existing component caps: degree at most four, monic
defining coefficients of at most 32 magnitude bits, discriminant at most 128
bits, 32 factor-base primes, 128 relations, and factored exponent magnitude at
most 256 with aggregate 4096. Generation uses the existing Minkowski bound cap
1000. Analytic limits cannot exceed the existing verifier ceilings (4096-bit
precision, prime bound one million, and 32 error refinements). These are
arithmetic preflights, not wall-time or memory guarantees.

These restrictions do **not** cover the campaign's expensive rank-two target.
Large defining coefficients, larger terminal payloads and practical BDF/GRH
generation require separately reviewed policies and measured admission
evidence. Passing the exposed cubic/quartic tests is neither twenty expensive
fields nor an M1 completion or competitive-performance claim.

The focused integration regression also exercises the previously used totally
real quartic `x^4-x^3-3*x^2+x+1` (discriminant 725), with three free units.
It checks fresh conditional completion and recomputed index two after squaring
one unit, using the same verifier and unchanged resource limits as the rank-two
examples. The three-field test passed locally in 120.23 seconds; this is a
correctness-test duration with discovery and negative checks, not a controlled
class-and-unit timing.

A separate proper relation-sublattice control uses $x^3-10$, whose generic
computation has a three-prime factor base. After fresh completion establishes
$h=1$, the test doubles every relation row and witness exponent, recomputes norm
evidence and exact HNF/SNF, and leaves units and generating-base evidence
unchanged. This replaces $L$ by $2L$, so the finite quotient has order $8h$.
Independent component replay accepts these valid ideal equalities and transforms;
fresh analytic replay then actually returns index eight and refuses completeness.
The test tightens its error request to `1/32` within unchanged verifier limits.
Unlike changing only a claimed class number, this exercises the relation-index
factor of the argument. Neither this test nor the squared-unit controls constitute
a formal proof of the general theorem.
