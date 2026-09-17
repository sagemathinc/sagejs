# Connected internal final-state assembler

`class_group_final_state.py` is a narrow Phase-5 integration boundary. It joins
live terminal outputs from the relation owner, Smith/HNF transform owner, unit
owner, class-generator owner, and final `buchall` driver. Publication is atomic
and idempotent: validation constructs detached bytes before acquiring the
publication lock, and a later unequal publication is rejected.

The current schema is
`sagejs.pari-class-group/connected-final-state-v2`. Version 2 deliberately does
not use the v1 internal-result unit representation. PARI packed real values are
arrays of words, not common-denominator rational numerators. The v2 unit bridge
therefore retains an exact bounded selection of candidate packed words and,
separately, an independently derived rational enclosure. The source component
must bind that derivation to the selected words with
`derived_from_packed_sha256`. Replay checks the exact packed-word selection,
factor norms, rational determinant, regulator source triplet, and torsion
shape. It does **not** claim that the cold verifier decodes PARI packed reals.

The embedded v1 partial result is intentionally required to contain transforms
and generators but no units. Its exact replay proves all of these links:

- the relation matrix generates the HNF/presentation and conversely;
- `U * W * V = D`;
- both `U` and `V` have explicit two-sided integer inverses;
- every nontrivial Smith factor has exactly one primitive spanning generator;
- a trivial class group correctly has an empty complete generator set.

For the authentic equal-bound target, the relation candidate must be the active
`A = hnf_matbnew` presentation boundary, not the raw relation-record owner:
`A` is 8-by-15, `H` is 8-by-8,
`relation_to_presentation = V[:, 7:]` is 15-by-8, and
`presentation_to_relation = V^-1[7:, :]` is 8-by-15. Replay checks
`A * V[:, 7:] = H` and `H * V^-1[7:, :] = A`. After all eight unit pivots are
deleted, the class quotient is trivial; the retained 8-by-8 Smith presentation
has only trivial factors and therefore correctly requires zero class-generator
entries. Supplying the raw 66-by-73 records or a fabricated 0-by-0
presentation fails the shape/linkage checks.

The final driver arrays `M1`, `M2`, `Ga`, `Ge`, `GD`, `ga`, and `clg2` are
bounded exact source outputs. They are retained and fingerprinted, not
re-derived as ideal arithmetic. Cold replay consequently requires the expected
connected-result SHA-256 as out-of-band publisher authority. Merely recomputing
self-describing JSON hashes is not authority.

## Honest status

Successful publication means only `connected-source-state-published`. Both
`phase5_complete` and `public_complete` are fixed to `false`. Remaining work is
recorded in every result:

- exact ideal-arithmetic replay;
- exact unit principality and norm replay;
- factor-base authentication;
- rigorous regulator enclosure and acceptance.

Thus a real partial candidate, missing component, stale owner generation, stale
component fingerprint, or absent publisher hash fails closed. This API is a
connected internal experiment result, not a certified public class/unit result.

## Focused validation

Run:

```bash
node bench/pari-class-group-port/check_class_group_final_state.cjs
```

The check covers synthetic connected success, the rank-two/trivial-class-group
case, authentic candidate-only partial substitution, missing live components,
stale component links, concurrent idempotence, publication conflict, exact
`V^-1` and two-way relation/presentation mutations, packed-log mutations,
detached cold replay, and publisher-pinned retained-state mutation.

## Integration contract

The campaign driver should construct the five frozen component dataclasses only
after their owning stages reach the exact terminal statuses accepted by this
module. It must compute each handoff fingerprint with
`canonical_component_sha256`, publish through one
`ConnectedFinalStateAssembler`, retain the resulting SHA-256 outside the
result, and use that SHA-256 for all later cold replay. No campaign driver or
shared manifest is changed by this lane.
