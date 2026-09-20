# R0 contract map: Rust class-group core to Sage.js public semantics

Status: proposed R0 implementation contract; documentation only. This file maps
the current Sage.js class/unit public behavior to the artifacts a Rust backend
must provide. It does not make Rust a production backend, alter proof semantics,
or define the Rust wire ABI.

## Purpose and scope

The Rust trial qualifies the **ordinary ideal class group and ordinary unit
group** of the maximal order of an irreducible monic integral number-field
polynomial in the admitted degree-2-through-6 domain. It must support the scalar
class number, invariant-factor group, generator ideals, ideal-to-class map,
principality with exact witnesses, torsion and free units, a rigorous regulator
enclosure, and the evidence that makes the advertised result complete.

Narrow class groups, ray class groups, arbitrary nonmaximal orders, and the full
PARI BNF API are outside this qualification contract. Existing specialized
quadratic routes may continue to answer public calls. Rust may decline any
input outside its advertised capability, but it may not return a weaker object
under the contract of a stronger public call.

The source of truth is the current public behavior, principally:

- [`NumberField.class_group`](../src/baselib/number_fields.py#L2817) and
  [`class_number`](../src/baselib/number_fields.py#L2961), together with
  [`units`](../src/baselib/number_fields.py#L2345),
  [`unit_group`](../src/baselib/number_fields.py#L2373),
  [`regulator`](../src/baselib/number_fields.py#L2432), and
  [`class_unit_group`](../src/baselib/number_fields.py#L2452).
- The shared orchestration entry point
  [`class_unit_context`](../src/lib/sagejs/number_fields/class_unit_groups.py#L7946)
  and its terminal records
  [`ClassUnitComputation`](../src/lib/sagejs/number_fields/class_unit_groups.py#L1124)
  and
  [`UnitGroupComputation`](../src/lib/sagejs/number_fields/class_unit_groups.py#L739).
- The public group, maps, and witness types in
  [`class_group_maps.py`](../src/lib/sagejs/number_fields/class_group_maps.py#L876),
  especially
  [`IdealClassGroup`](../src/lib/sagejs/number_fields/class_group_maps.py#L1197).
- The proof-state and completeness records in
  [`class_group_proof.py`](../src/lib/sagejs/number_fields/class_group_proof.py#L1).
- Exact relation and matrix replay in
  [`RelationRecord`](../src/lib/sagejs/number_fields/class_group_relations.py#L784)
  and
  [`RelationPresentation`](../src/lib/sagejs/number_fields/class_group_matrix.py#L1594).
- Unit torsion and completion contracts in
  [`units.py`](../src/lib/sagejs/number_fields/units.py#L503), rigorous analytic
  completion in
  [`UnitSaturationIndexCertificate`](../src/lib/sagejs/number_fields/class_unit_analytic.py#L5835),
  and compact exact units in
  [`FactoredNumberFieldElement`](../src/lib/sagejs/number_fields/factored_elements.py#L106).

## Public call matrix

The public surface stays representation-independent. A caller must not have to
know whether Python, Rust, or another declared backend produced the result.

| Public call | Successful result | Required authority before publication |
| --- | --- | --- |
| `K.class_number(proof=...)` | Exact positive integer | A completed class-number proof for the selected proof mode. A scalar-only path may retain a sealed continuation, as the existing cubic projection does, but a relation-lattice candidate is insufficient. |
| `K.class_group(proof=...)` | `IdealClassGroup` | Complete invariant factors, exact generator ideals and their order witnesses, arbitrary-ideal discrete logs with quotient-principality witnesses, verified matrix presentation, and matching completeness proof. |
| `K.class_unit_group(proof=...)` | `ClassUnitComputation` | Either an honest incomplete computation record or a complete class **and** unit result. A complete record requires both groups. |
| `K.unit_group(proof=...)` | Complete `UnitGroupComputation` | Complete torsion, exactly `r1+r2-1` free generators, rigorous regulator state, and replayable unit-completion/saturation evidence. The wrapper rejects an incomplete subgroup. |
| `K.units(proof=...)` | Tuple of expanded exact free units | Complete unit group first; expansion of compact factored units occurs only at this projection. |
| `K.regulator(prec, proof=...)` | Rigorous regulator enclosure at at least `prec` bits | Complete unit result and rigorous enclosure tied to those generators; precision escalation must preserve the exact unit subgroup. |
| `C(ideal)` / `C.map().preimage(ideal)` | `IdealClassElement` | Exact ideal-class discrete log and verified principal quotient witness. |
| `C.discrete_log(ideal)` | `IdealClassDiscreteLog` | Normalized invariant coordinates plus an exact witness for `ideal / representative(coordinates)`. |
| `C.principality(ideal)` | `PrincipalityResult` | A complete conditional or unconditional group. A positive answer carries an exact generator witness; a negative answer carries none. |
| `C.is_principal(ideal, proof=True)` | Boolean | Unconditionally complete class group. A conditional group must raise rather than silently answer this request. |
| `C.proof_payload()` and `C.verify_proof_payload(payload)` | Canonical payload and replay result | Attached conditional or unconditional proof record plus all independently replayable context needed by its schema. |

`proof=None` has the same meaning as `proof=True` in the shared engine
([`class_unit_context`](../src/lib/sagejs/number_fields/class_unit_groups.py#L7970)).
`proof=False` permits the GRH-conditional exact relation contract; it does not
permit heuristic answers. Algorithms and explicit resource limits retain their
current public arguments. The backend must preserve cancellation, progress,
checkpoint/resume, deterministic seed, and memory-limit behavior when the Rust
route claims those capabilities.

## Result-state machine

Only these states may cross the Rust boundary:

| State | Public meaning | Permitted projections |
| --- | --- | --- |
| `candidate` | Exact relations and a tentative presentation have been computed, but generation/completeness is not established | Diagnostics and internal continuation only. Never an `IdealClassGroup`, class number, or principality answer. |
| `incomplete-resource-limit` | Work stopped because of a declared limit, cancellation, unsupported proof upgrade, or recoverable backend limitation | `ClassUnitComputation(complete=False)` with reason, stages, diagnostics, continuation/checkpoint state where supported, and optional `tentative_invariants`. `class_group()` must raise, as it does now at [`ClassUnitComputation.class_group`](../src/lib/sagejs/number_fields/class_unit_groups.py#L1178). |
| `exact-relations-conditional-grh` | Exact relation arithmetic, maps, unit completion, and analytic index-one evidence are complete assuming the named GRH factor-base theorem | Complete class/unit result for `proof=False`; proof status remains visible and serialized. `is_principal(..., proof=True)` must reject it. |
| `exact-unconditional` | The complete relation presentation and maps have been upgraded with exact unconditional completeness evidence | All ordinary public projections, including `proof=True` principality. |

`heuristic-diagnostic-only` remains a recognized internal label but is never a
successful public class/unit result. The authoritative labels and the set of
complete labels are defined in
[`class_group_proof.py`](../src/lib/sagejs/number_fields/class_group_proof.py#L18).

A scalar class-number projection is a fourth *execution shape*, not a fourth
proof state. It may stop before materializing generator maps and unit result
objects only after the scalar is rigorously determined. It must retain enough
authenticated state to resume, or recompute through a correct route when a
later group or unit request occurs. The existing model is documented at
[`cubic_class_number_projection`](../src/lib/sagejs/number_fields/class_unit_groups.py#L8561).

## Exact class-group material Rust must deliver

For a complete group the backend adapter must be able to construct or
independently reconstruct all of the following.

1. **Field/order identity.** The defining polynomial, maximal-order basis and
   denominator, multiplication table, discriminant, signature, and a canonical
   order fingerprint. Every ideal and element payload is bound to this identity.
2. **Factor base.** Canonically ordered prime-ideal descriptors with rational
   prime, ramification/residue data, exact ideal representation, theorem,
   assumptions, and exact factor-base bound.
3. **Exact relation records.** Each row has the retained source and quotient
   rows, a compact exact principal generator, norm-smoothness evidence,
   archimedean evidence where unit recovery consumes it, and provenance. The
   defining identity is replayed exactly by
   [`verify_relation_record`](../src/lib/sagejs/number_fields/class_group_relations.py#L983).
4. **Replayable lattice presentation.** Relation rows, HNF and its left
   transform, SNF and both transforms plus the right inverse. Verification must
   establish the matrix identities, rank, zero free rank, normalized invariant
   factors, and order. The existing shape is
   [`RelationPresentation`](../src/lib/sagejs/number_fields/class_group_matrix.py#L1594).
5. **Normalized finite invariants.** Omit factors equal to one. Every retained
   factor is greater than one and divides the next, matching the constructor
   checks at
   [`IdealClassGroup.__init__`](../src/lib/sagejs/number_fields/class_group_maps.py#L1202).
6. **Generator ideals and order relations.** There is one exact ideal for each
   invariant and one `PrincipalIdealWitness` proving that its invariant-th
   power is principal. The witness may use a compact factored element and must
   replay against the maximal order.
7. **Arbitrary-ideal class map.** For every admitted nonzero fractional ideal,
   return normalized invariant coordinates and an exact principal witness for
   the quotient by the corresponding product of generator ideals. The adapter
   must produce `IdealClassDiscreteLog`, whose replay is defined at
   [`class_group_maps.py`](../src/lib/sagejs/number_fields/class_group_maps.py#L997).
8. **Completeness record.** Supply exactly one proof record matching the result
   label, with its replay context and canonical payload. Presentation evidence,
   generator relations, saturation, and proof records must be bound by hashes
   so that pieces cannot be exchanged between fields or computations.

The public group operations that this material must support are `invariants`,
`order`/`cardinality`, `one`, `gen`/`gens`, `gens_ideals`, coordinate
construction, representative ideals, multiplication/division/inversion/powers,
the class map and its inverse, discrete logs, and principality. Their current
implementation begins at
[`IdealClassElement`](../src/lib/sagejs/number_fields/class_group_maps.py#L1075)
and [`IdealClassMap`](../src/lib/sagejs/number_fields/class_group_maps.py#L1168).

The R0 adapter should consume a coarse canonical result/certificate bundle or a
sealed resident handle. It must not invoke Rust once per scalar, factor-base
entry, or matrix cell. Public Sage.js ideals and elements may be materialized
lazily, but each lazy operation must retain the field/order identity and exact
witness behavior above.

## Completeness by proof mode

### Conditional GRH

The conditional result is mathematically exact except for the stated theorem
assumption. Rust must provide:

- the named factor-base theorem, exact positive bound, explicit GRH assumption,
  and exact relation count;
- exact relation and presentation replay;
- a complete `SaturationProofRecord` with final index bound one;
- rigorous analytic evidence isolating the combined class/unit index at one;
- canonical conditional evidence sufficient for independent replay rather than
  a producer boolean.

These fields correspond to
[`ConditionalGRHProofRecord`](../src/lib/sagejs/number_fields/class_group_proof.py#L200).
The record verifies only through a context that independently checks the
conditional evidence. Matching PARI output, obtaining full rank, collecting a
fixed surplus of relations, or observing a small numerical residual does not
satisfy this contract.

### Unconditional

An unconditional result must include all conditional exact arithmetic and unit
completion, then establish ideal-class generation without GRH. The current
contract uses the Minkowski theorem:

- bind the exact discriminant, field/order fingerprint, exact Minkowski bound,
  theorem, and saturation record;
- enumerate every required prime ideal through that bound in canonical order;
- for each required ideal retain its fingerprint, norm, class coordinates, and
  exact principal witness relating it to the displayed generators;
- replay the complete enumeration, reject duplicates or omissions, and verify
  every class-map witness.

This is the contract of
[`UnconditionalMinkowskiProofRecord`](../src/lib/sagejs/number_fields/class_group_proof.py#L397)
and [`MinkowskiPrimeClassRecord`](../src/lib/sagejs/number_fields/class_group_proof.py#L312).
Rust may later supply another proved unconditional theorem, but introducing it
requires a new named proof record and independent verifier rather than relabeling
the conditional result.

## Unit and regulator material Rust must deliver

A class-group-only candidate is not enough for a complete
`ClassUnitComputation`: its constructor requires both class and unit groups
([`class_unit_groups.py`](../src/lib/sagejs/number_fields/class_unit_groups.py#L1175)).
The Rust result must retain:

1. A complete `RootsOfUnityResult`: exact order, generator, full power list (or
   an equivalent lazily materialized list), and replayable exhaustion
   certificate. The current verification contract is at
   [`RootsOfUnityResult.verify`](../src/lib/sagejs/number_fields/units.py#L527).
2. Exactly `r1+r2-1` independent free-unit generators. Compact
   `FactoredNumberFieldElement` values are preferred for large units; they must
   support exact expansion, norm, principal ideal, and rigorous logarithms.
3. Exact relation-kernel evidence connecting unit generators to dependency rows
   and proving the claimed integral kernel/rank. The current replay shape is
   [`UnitLatticeExtractionResult`](../src/lib/sagejs/number_fields/class_unit_analytic.py#L1048).
4. A rigorous regulator enclosure bound to the displayed free generators,
   weighted complex-place convention, precision history, and precision
   escalation. A floating approximation without an enclosure is insufficient.
5. A global saturation/index certificate binding field/order identity, initial
   units, class number, generation evidence, regulator proof, zeta log-residue
   proof, and a unique final index. The accepted final state has rigorous class
   and unit saturation and remaining index bound one. The parent record is
   [`ClassUnitSaturationRecord`](../src/lib/sagejs/number_fields/class_unit_groups.py#L414),
   and the analytic certificate is
   [`UnitSaturationIndexCertificate`](../src/lib/sagejs/number_fields/class_unit_analytic.py#L5835).
6. Completion evidence replayable by `UnitGroupComputation.verify_completion()`.
   Merely having the correct number of units, or reproducing PARI's regulator,
   cannot set `complete=True`.

The public `torsion`, `generators`, `gens()`, `unit_rank`, `complete`,
`regulator_enclosure`, `proof_status`, `completion_certificate`, and
`verify_completion()` behavior must survive adaptation. Expanding compact free
units is charged only when `K.units()` or an equivalent eager operation asks
for it.

## Rust-to-Sage.js publication boundary

R0 freezes semantic data, not a particular FFI layout. The eventual wire/handle
contract must nevertheless obey these rules:

- One call accepts neutral field input plus proof policy, algorithm policy,
  deterministic seed, resource limits, and cancellation/checkpoint controls.
- One resident computation may return a scalar projection, a complete bundle,
  an honest incomplete record, or a resumable handle. Publication is
  transactional: panics, traps, allocation failures, cancellation, or failed
  replay publish no partial complete result.
- Arbitrary-size integers and rationals use canonical sign/magnitude or another
  documented lossless encoding. Ideals, elements, matrices, bounds, and hashes
  are never narrowed through JavaScript numbers.
- Large rows, matrices, logs, and factored units cross in packed batches or stay
  resident behind a bounded handle. Ownership, dimensions, lifetime, and close
  behavior are explicit.
- The Python-side adapter independently validates type/shape/bounds, field/order
  binding, invariant normalization, exact relation identities, matrix
  transforms, generator relations, completion record, and requested proof
  status before constructing public objects.
- A fast live authentication path may avoid repeating an expensive traversal
  only when it is single-use, mutation-sensitive, producer-bound, and has a
  detached replay path. This follows the existing sealed projection pattern at
  [`class_group_projection_from_engine_result`](../src/lib/sagejs/number_fields/class_group_maps.py#L2017).
- Canonical detached serialization must round-trip and replay without a live
  Rust process. It is test evidence and cache material; it must not contain raw
  pointers, allocator-owned limbs, or opaque claims of verification.

## Fallback and failure contract

Rust dispatch is capability-driven. Capability checks include target, loaded
artifact/version, arithmetic backend, degree/signature, proof mode, resource
features, and supported input representation. Dispatch may not recognize an
unrelated implementation solely from a Python function name.

For `algorithm="auto"`, a Rust decline before publication falls through to the
existing exact Sage.js route. A Rust attempt may decline because the artifact
is absent, the field is outside the admitted domain, a checked integer must use
an unavailable promotion path, a precision or resource policy is exhausted,
or independent replay rejects the result. The fallback receives the original
input and proof request, not partially trusted Rust output.

For an explicitly selected future `algorithm="rust"`, unsupported capability
may raise a stable capability error or return an honest incomplete context,
according to the public operation. It must not silently switch proof modes.
Resource exhaustion and cancellation produce `incomplete-resource-limit` with
reason and diagnostics when the caller requested the context API. Public
`class_group`, `class_number`, and `unit_group` must either complete through an
authorized fallback or surface the limitation; they may not project tentative
data.

`proof=True` must never fall back to a conditional or heuristic answer.
`proof=False` may return `exact-relations-conditional-grh` or an unconditional
result. A cached conditional result may be upgraded for a later unconditional
request, but cache keys and retained authority remain proof-policy bound.

The architectural requirement for an explicit capability boundary and tested
correct fallback is stated in [`ARCHITECTURE.md`](../ARCHITECTURE.md#L44), along
with packed native ABI guidance and host independence
([`ARCHITECTURE.md`](../ARCHITECTURE.md#L50)) and native Windows requirements
([`ARCHITECTURE.md`](../ARCHITECTURE.md#L72)). A production Rust backend needs
an architecture decision and inventory policy update before promotion.

## Minimum R0 schemas to freeze next

The integration lane should derive versioned schemas from this map before the
algorithm lanes expand. At minimum:

1. `rust-class-unit-request-v1`: canonical polynomial/order input, proof and
   algorithm policy, limits, seed, requested projection, and checkpoint token.
2. `rust-class-unit-status-v1`: candidate/incomplete/conditional/unconditional
   state, reason, deterministic stage ledger, counters, resource use, and
   continuation identity.
3. `rust-class-group-presentation-v1`: order identity, factor base, exact
   relations, HNF/SNF transforms, invariants, generator ideals, power witnesses,
   and class-map state.
4. `rust-unit-group-v1`: torsion, compact free units, dependency lattice,
   regulator enclosure, saturation/index evidence, and precision history.
5. `rust-class-group-proof-v1`: a tagged union whose branches adapt exactly to
   the existing GRH and unconditional proof records.
6. `rust-class-unit-result-v1`: hashes of all component payloads, terminal state,
   proof label, algorithm/source provenance, and optional sealed continuation.

Every schema needs canonical encoding rules, exact size/depth caps, semantic
hash binding, version rejection, corruption tests, native/Wasm parity fixtures,
and a detached verifier. The version-1 schemas should contain only semantic
state needed for replay and public operations; profiling traces and mutable
workspace storage belong in separate diagnostics.

## R0 acceptance tests implied by this map

R0 is complete when tests can express the contract independently of the final
Rust algorithm:

- all four result labels are accepted or rejected at the proper public
  boundary, and `proof=None`, `False`, and `True` retain their meanings;
- incomplete and heuristic artifacts cannot construct an `IdealClassGroup` or
  leak a scalar class number;
- conditional groups answer witnessed class maps and `proof=False`
  principality, reject `proof=True`, and replay their canonical proof payload;
- unconditional groups replay complete Minkowski coverage and answer
  `proof=True` principality;
- generator ideals have the advertised exact orders, arbitrary ideals round
  trip through the map, and principal answers retain exact generators;
- complete unit results replay torsion, free-unit independence, regulator
  enclosure, relation-kernel and global saturation evidence;
- every component mutation, cross-field substitution, omitted prime/relation,
  bad transform, changed bound, changed unit, or changed proof label fails
  closed;
- Rust decline, trap, cancellation, capacity exhaustion, and corrupt output
  exercise the declared fallback/incomplete behavior without cache pollution;
- the same canonical fixtures adapt and replay on native Linux and through the
  actual browser Wasm route.

This contract deliberately requires more than matching invariant factors. A
Rust class-group core qualifies only when it supports the mathematical objects
and proof behavior that Sage.js users can continue to compute with.
