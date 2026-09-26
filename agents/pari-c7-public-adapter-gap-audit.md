# C7 correspondence owners to public class/unit API: exact adapter gap

Audit date: 2026-09-18  
Audited commit: `0b0b849c102ca25e050e62d730c435c66525eb26`  
Plan: `agents/pari-class-group-end-to-end-native-plan.md`

This is a read-only design audit. It does not change production dispatch,
certify a class or unit group, or promote any C7 envelope. The current C7
terminal facts remain

```text
correspondence_complete = true
public_complete = false
```

## Conclusion

There is no missing JSON rename that can turn a C7 result into a complete
public Sage.js result. Two different gaps remain:

1. a comparatively small **representation adapter** must bind an already
   verified C7 envelope to the caller's live number field and convert the
   represented objects into the existing `ClassUnitComputation` vocabulary;
2. an independent **mathematical certification suffix** must prove global
   class-group generation and unit-lattice index one before any public
   `complete=True` result is legal.

The smallest honest first adapter is therefore an explicit, opt-in adapter to
an **incomplete** `ClassUnitComputation`, not the standard complete class-group
adapter and not a second public result hierarchy. It can expose authenticated
tentative invariants, assumptions, correspondence status, exact subgroups when
they are actually materialized, and replay diagnostics. It must leave
`complete=False`, must not make `class_group()` available, and must not make
`K.class_number()`, `K.class_group()`, `K.unit_group()`, `K.units()`, or the
default `algorithm="auto"` route consume the result.

That adapter is useful on its own: users can inspect a faithful PARI 2.17.4
correspondence result without confusing it with Sage.js certification. A later,
separately timed post-pass can upgrade the same live mathematical material only
after constructing the standard proof records.

## What the C7 owners already establish

The field-neutral boundary in
`bench/pari-class-group-port/class_unit_correspondence_result.cjs` already does
substantial shared work:

- it accepts only canonical, bounded data with explicit owner roles, logical
  lengths, capacities, and complete contents;
- it binds the defining polynomial, normalized invariant factors, class number,
  unit rank, torsion, regulator owner, honesty outcome, pinned PARI source, and
  explicit upstream assumptions;
- a branded out-of-band authority must synchronously replay the mathematical
  payload; changing and resealing submitted bytes cannot self-authorize a
  result;
- verification is detached before atomic publication, equal repeats are
  idempotent, and a conflicting second result does not replace the first; and
- the schema itself rejects `public_complete=true`.

The field-specific C7 composers supply stronger material behind that neutral
projection: exact relation and presentation owners, Smith/HNF transforms,
class-generator ideals and order witnesses where nontrivial, exact principal
relations, compact or expanded units, exact norm checks, torsion, regulator
acceptance, and owner ancestry. For the completed development fields this is
enough for the plan's internal PARI-correspondence claim.

It is not uniform public materialization. Some envelopes publish
`materialization.tag="exact_units"`; others faithfully publish
`not_given(PRECI)` or `not_given(LARGE)`. Several C7 chains also begin from
frozen-W0, accepted-relation, or retained factor-base owners rather than a
strict prepared-`nfinit` boundary. Those differences must survive adaptation.

## Reusable shared components versus missing work

| Boundary | Reusable now | Still required for an adapter | Still required for public completion |
| --- | --- | --- | --- |
| Result container | `ClassUnitComputation` already represents terminal complete or incomplete coupled computations and blocks `class_group()` when incomplete. | Construct it with `complete=False`, the live caller field, no class group, authenticated tentative invariants, and detached C7 diagnostics. Add one non-complete proof-status label for upstream-assumed correspondence; do not call it a resource-limit failure. | A completed result must contain both a verified class group and a complete unit group. |
| Units | `UnitGroupComputation` already represents exact generators, torsion, rank, regulator, completion evidence, and replay. `FactoredNumberFieldElement` is the existing compact representation. | For `exact_units`, reconstruct field elements or factored elements against the same live field/order and replay norms, principality, rank, and ancestry. For `not_given`, expose only diagnostic rank/torsion/regulator metadata; do not create a rank-`r` unit subgroup with zero fake generators. The incomplete-unit constructor currently rewrites every incomplete status to `incomplete-resource-limit`; it needs a narrow honest status path if an exact but uncertified subgroup is exposed. | Exact rank-many free generators, exact torsion, a rigorous `RegulatorEnclosure`, and replayable saturation/index-one evidence accepted by `UnitGroupComputation.verify_completion()`. |
| Regulator | `RealBall`, `RationalEndpoint`, `RegulatorEnclosure`, and `certified_regulator_enclosure` already implement the public rigorous interval contract. | A storage owner merely named `regulator-enclosure` is not one. Decode only an independently replayed rigorous ball, or recompute the enclosure from exact units/logarithms. Bind rank, weighted complex-place convention, precision history, and nonzero determinant to the live field. A PARI packed float/acceptance triple alone stays diagnostic. | The rigorous enclosure must participate in the final `h*R` index calculation and certificate replay; full rank by itself does not prove saturation. |
| Class invariants | C7 replays normalized invariant factors and, field by field, exact Smith/HNF presentations and order witnesses. | An incomplete adapter may publish these only as `tentative_invariants` plus diagnostics. Do not install an `_EngineClassGroup`: that type also needs live ideal objects, presentation/relation records, factor/reduce/combine operations, and a verifiable proof policy. | Prove that the selected factor base generates the full class group under an accepted unconditional or named conditional-GRH theorem and bind exact relation count, theorem/bound, proof stage, generation replay, ideals, maps, and witnesses. |
| Public class map | `_EngineClassGroup`, `class_group_maps.class_group_from_engine_result`, the projection sealer, and context transaction already provide the standard public map path. | Nothing should call these from a correspondence-only envelope. Their fail-closed construction assumptions are stronger than C7's upstream-assumed status. | Supply the exact engine-shaped live material and standard proof record so the existing adapter's independent `verify()` succeeds. Do not add a weaker parallel map adapter. |
| Analytic completion | `UnitSaturationIndexCertificate` and `ClassUnitSaturationRecord` already encode the repository's standard `h*R` completion route. | Preserve the C7 assumptions and regulator evidence as inputs/diagnostics; do not synthesize either record from a digest or from agreement with PARI. | Replay exact field/order/units, splitting data, rigorous zeta-residue bounds, regulator, class number, saturation attempts, and an integer index interval `[1,1]`, with `remaining_index_bound=1`. |
| Context and cache | `ClassUnitGroupContext` already owns proof policy, terminal data, cache identity, live saturation authority, and atomic public projection. | Keep correspondence results out of the ordinary complete-result cache. If an opt-in route caches them, its key must include the experimental algorithm, pinned PARI source, proof request, C7 schema, and envelope/authority identity. | Only the certified suffix may publish the standard terminal proof state and enable ordinary projections. |
| Dispatch | `K.class_unit_group()` and its projections already form the public API. | During this experiment, use an explicit adapter/helper or an unmistakable opt-in algorithm. Do not change `auto`; the plan places production adaptation and default dispatch outside the timed language experiment. | Promotion needs the independent certification post-pass, production qualification, and the usual public tests; internal A/B/C campaign outcomes do not authorize it. |

## The mathematical certification gap

### Class side

C7 proves the represented quotient and its witnesses exactly. It does not, by
itself, prove that the selected factor-base ideals generate the full ideal
class group. The missing public record must establish, for the exact live field
and maximal order:

- a recognized factor-base theorem and its exact bound;
- every prime ideal required by that theorem, not merely the retained C7 list;
- exact relation generation and the terminal relation count;
- global presentation saturation/generation replay;
- the completed proof stage and named assumptions; and
- live ideal-map material sufficient for public discrete logarithms,
  principality, representatives, and generator-order witnesses.

The current phrase `upstream-assumed-pari-correspondence` deliberately leaves
the first four facts to pinned PARI policy. That is sufficient for the language
experiment, not for `ClassUnitComputation.complete`.

### Unit side

Exact rank-many units plus a nonzero rigorous regulator show that the selected
units are independent and full rank. They do not show that their subgroup has
index one in the full unit group. The standard public suffix still needs a real
`UnitSaturationIndexCertificate` and parent `ClassUnitSaturationRecord`, or an
equally strong independently replayable theorem, establishing:

- the exact field, maximal order, signature, class number, torsion order, and
  the same initial units;
- a rigorous weighted-log regulator enclosure;
- a rigorous Dedekind-zeta log-residue enclosure from replayed splitting data;
- a unique positive integer `h*R` index equal to one;
- all bounded saturation attempts and exact unit/principal-ideal checks; and
- an honest unconditional or explicitly conditional-GRH proof status.

`not_given(PRECI/LARGE)` has an earlier representation gap as well: the neutral
envelope does not publish rank-many exact generators. Its compact ancestry may
be sufficient for correspondence replay, but it must first be converted into
the existing `FactoredNumberFieldElement` form before even an incomplete exact
unit subgroup can be returned.

## Smallest honest adapter contract

The narrow adapter should consume only an already verified
`ImmutableClassUnitCorrespondenceResult` plus the live field supplied by the
caller. It must not accept raw JSON or a replay callback, and the envelope must
not choose its own authority. Conceptually:

```python
adapt_pari_correspondence_result(field, verified_result)
    -> ClassUnitComputation(
        field,
        proof_status="upstream-assumed-pari-correspondence",
        complete=False,
        reason="PARI 2.17.4 correspondence replayed; Sage.js class/unit certification absent",
        algorithm="pari-correspondence-experimental",
        stages=(... authenticated adapter stage ...),
        class_group=None,
        unit_group=<exact incomplete subgroup only when genuinely materialized>,
        tentative_invariants=<C7 invariant factors>,
        diagnostics=<detached assumptions, hashes, owner/materialization status>,
    )
```

Required fail-closed checks are small but material:

1. Match the envelope's polynomial, degree, field identity, maximal order, and
   signature to the live `field`; a matching display label is insufficient.
2. Recheck the verified-result type/brand, payload hash, replay schema, pinned
   PARI source identity, `correspondence_complete=true`, and
   `public_complete=false`.
3. Convert every exposed integer, ideal, torsion element, unit, and interval
   into a live Sage.js object and replay the exact identity against that object.
   Detached owner names and digests are provenance, not constructors.
4. Preserve all assumptions and materialization omissions. In particular,
   `not_given` must remain not given.
5. Set no class group and no saturation record. Reject any attempt to pass the
   result to `_class_group_from_engine_result` or to publish it in the standard
   complete-result cache.
6. Keep public projections fail closed: `result.class_group()` and
   `result.class_number()` raise; `K.unit_group()` and `K.units()` continue to
   require `unit_result.complete`; `K.regulator()` must not treat a diagnostic
   packed value as a public rigorous enclosure.

The adapter may expose an exact incomplete `UnitGroupComputation` only on C7
results that materialize and independently replay rank-many exact generators,
torsion, principality, norms, and a genuine `RegulatorEnclosure`. Even there,
`unit_group.complete` remains false because index one is missing. For
`not_given` results the coupled result should carry no `UnitGroupComputation`;
unit rank, torsion correspondence, packed regulator data, and compact ancestry
remain in detached diagnostics until factored generators are constructed.

## Why this is the minimum

Returning the verified neutral envelope directly would create the second public
result hierarchy the plan rejects. Returning a completed `ClassUnitComputation`
would make an upstream assumption impersonate a proof. Returning a class group
while only the coupled result is incomplete would bypass
`ClassUnitComputation.class_group()`'s deliberate safety boundary. Treating all
of this as `incomplete-resource-limit` would also be false: certification is
absent by contract, not because a configured computation ran out of resources.

One new non-complete proof-status label, one field-binding adapter, and focused
negative tests are therefore the smallest coherent shared changes. Everything
else can reuse existing public types and fail-closed projection behavior.

## Promotion boundary and tests

The incomplete adapter can be reviewed independently of certification. Its
focused tests should cover:

- one exact-unit C7 result and one `not_given` result;
- wrong field, isomorphic-but-different field instance, wrong maximal order,
  wrong signature, stale authority, changed envelope, and wrong pinned source;
- attempts to promote `complete`, attach a class group, attach completion
  evidence, or enter the standard cache;
- `class_group`, `class_number`, `unit_group`, `units`, and `regulator`
  projections remaining unavailable unless their existing public preconditions
  are genuinely met; and
- atomic/idempotent adaptation without converting a later conflicting
  envelope.

Public completion needs a separate test tier. It must construct the standard
class proof payload, rigorous regulator, `UnitSaturationIndexCertificate`, and
`ClassUnitSaturationRecord`; replay each against the same live field/order and
units; then use the existing class-map adapter and context transaction. Only
that tier may set `UnitGroupComputation.complete=True` and
`ClassUnitComputation.complete=True` or select the route automatically.

The certification suffix is outside the matched `bnfinit(nf, 0)` clock. Under
the plan it must be timed and reported separately, just as the stronger H1
exact-unit/regulator post-pass is already kept separate from flag-zero
correspondence timing.
