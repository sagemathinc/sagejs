# Authentic `h = 1` internal correspondence completion

## Conclusion

The qualified totally real cubic `x^3 - 20018*x + 20034` now has enough
connected evidence to support one narrow claim:

> The translated path has a PARI-2.17.4-correspondence-complete **internal**
> class-and-unit result for this field, under the explicitly retained PARI/GRH
> assumptions.

It does **not** have enough evidence to claim a completed public
`UnitGroupComputation` or `ClassUnitComputation`.

This is the distinction required by the plan. The plan permits an explicitly
upstream-assumed internal state for the language experiment, and separately
forbids passing that state through the standard public adapter merely because
it agrees with PARI. No semantics are weakened here.

## What the composition replays

`internal_correspondence_completion.py` joins four existing authorities and
replays every cross-edge:

1. **Presentation authority.** All 66 ordered factor-base ideals are rebuilt,
   all 73 retained principal ideal identities are checked, relation HNF is
   rerun, and the active `8 x 15` relation matrix and `8 x 8` presentation are
   reproduced.
2. **Authentic class/unit state.** Smith replay gives `D = I_8`, class number
   one, no invariant factors, and a genuinely empty class-generator list. The
   exact `2 x 7` unit provenance lies in the published HNF kernel.
3. **Exact units and regulator.** The two selected algebraic integers are
   retained in exact power-basis coordinates and have exact norms `-1`. The
   production RealBall/RegulatorEnclosure path proves rank two, the product
   formula, containment of all six packed PARI logarithms, and containment of
   the accepted packed regulator.
4. **Torsion authority.** The prepared irreducible totally real cubic has
   exactly `{+1,-1}` as roots of unity, with exact generator `-1` and order
   two.

The composition additionally checks that the resident and unit-fixture hashes,
polynomial, active relation matrix, HNF presentation, selected-unit
provenance, exact norms, torsion record, and accepted regulator all agree
across authorities. The old leaf correctly remains marked
`final_driver_status = not-published`; this new component is the explicit
composition driver rather than a mutation of that historical leaf.

The rigorous regulator leaf uses the selected pre-`getfu` basis, while the
authentic terminal component applies the source-identical diagonal basis
change `diag(1,-1)`. Replay derives this sign from the two exact HNF-provenance
rows, inverts the second algebraic unit by exact integral cubic arithmetic, and
checks that the resulting two power-basis units equal the fresh pristine-PARI
oracle units after the recorded integral-to-power-basis conversion. Thus the
regulator and terminal unit bases are linked rather than silently conflated.

The terminal record therefore has separate, immutable fields:

```text
correspondence_complete = true
composition_driver_published = true
public_complete = false
class_unit_computation_complete = false
standard_public_adapter_eligible = false
unit_saturation_certified = false
```

The correspondence claim is limited to this qualified sentinel. It is not a
coverage claim for the 24-field campaign.

## Why saturation is not required for this internal claim

The internal question is whether Sage.js reproduced the complete state and
decisions of the pinned PARI computation. PARI accepted this rank-two lattice;
the experiment explicitly assumes PARI's heuristic bounds and floating
acceptance decisions. Exact reconstruction and rigorous enclosure now show
that the selected objects are real units, are independent, and have the
recorded regulator. Under the recorded correspondence assumption, that is
enough to say the port reproduced PARI's accepted internal result.

It is **not** enough to infer mathematically that this subgroup has index one
in the full unit group. A rigorous nonzero regulator proves full rank, not
saturation. Agreement with PARI cannot turn that missing theorem into an exact
certificate. Consequently the completion component never constructs a
`UnitGroupComputation`, never sets a generic `complete` field, and is rejected
if any public/saturation flag is promoted.

## Exact evidence still required for public completion

For `UnitGroupComputation(complete=True)`, the exact torsion, two exact free
generators, and rigorous `RegulatorEnclosure` are now available. The missing
item is a replayable proof that the generated free subgroup has index one.
Under the repository's standard analytic route this means an authentic
`UnitSaturationIndexCertificate` whose detached replay establishes all of the
following:

- the exact field/maximal-order identity and the same two initial units;
- the exact signature, class number, and roots-of-unity order;
- a rigorous regulator enclosure for those units;
- a rigorous Dedekind-zeta log-residue enclosure from replayed splitting data;
- an `h*R` index interval with `lower_index = upper_index = unique_index = 1`;
- replayable factor-base/relation generation evidence and its verifier; and
- an honest proof status, either unconditional or explicitly conditional on
  GRH.

`ClassUnitSaturationRecord` is the standard parent record. It must retain that
certificate, `remaining_index_bound = 1`, exact unit/principal-ideal checks,
the saturation attempts, and final analytic validation `[1,1]`, and its
`verify(...)` method must succeed. An independently replayable exact
fundamental-box exhaustion could prove unit saturation through the unit API,
but it does not by itself replace the class engine's required generation and
proof-stage payload.

For `ClassUnitComputation(complete=True)`, the standard adapter additionally
requires its completed conditional-GRH or unconditional proof payload:
completed proof stage, exact relation count, factor-base theorem/bound,
saturation data, and replay evidence. The presentation authority proves the
captured ideals and relations exactly; it does not independently prove the
upstream-assumed bound exhausts the class group. Thus public completion remains
false even in this class-number-one case.

## Focused replay

The checker obtains the successful unit data from a freshly instrumented
pristine PARI 2.17.4 source oracle, builds the authentic class/unit and
presentation authorities from the qualified resident artifact, independently
cold-replays the rigorous regulator through Sage.js, derives exact torsion,
then seals and cold-replays the composition.

It rejects coordinated mutations of correspondence/public/saturation flags,
the missing-evidence list, exact units, source digests, HNF unit provenance, a
principal relation, and the rigorous regulator input. The regulator callback
is an explicit cross-runtime replay boundary: the ordinary CPython composition
cannot replace Sage.js's field/Arb objects with a digest-only assertion.

```bash
SAGEJS_REPLAY_RUNTIME_ROOT=/home/user/sagejs-worktrees/pari-class-group-e2e-integration \
  node bench/pari-class-group-port/check_internal_correspondence_completion.cjs
```
