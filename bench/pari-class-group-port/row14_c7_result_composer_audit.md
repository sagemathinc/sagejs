# Row-14 C7 composition audit

This boundary joins four independently replayed row-14 owners into the existing
field-neutral `class-unit-correspondence-result-v1` envelope:

1. the immutable 806-relation/HNF owner;
2. the deterministic mathematical projection of the post-806 acceptance and
   invariant computation;
3. the source-operation column-ancestry and exact class-witness owner; and
4. the authentic rank-two C5/C6 `not_given(LARGE)` owner.

The composer is data-only. It neither reads files nor invokes a process and it
cannot construct detached mathematical authority. Those capabilities are
injected by the focused checker and replayed again at final publication.

## The missing compact-unit join

The terminal-class owner retains seven source-derived kernel columns in a
column-major `806 x 7` `rawToUnitKernel` transform. C5 retains its column-major
`7 x 2` unit transform. C7 composes these as

```text
F[u,r] = sum_j rawToUnitKernel[j,r] * unitTransform[u,j].
```

It directly verifies `R * rawToUnitKernel = 0` and `R * F = 0`. The terminal
class owner has already replayed every one of the 806 identities
`product(factor_base_i ** R[i,j]) = (generator_j)`. Consequently each column
of `F` is an exact compact/factored generator of the unit ideal. C7 also derives
the two norm signs from exact determinants of the retained principal
generators. No expanded algebraic unit is invented.

The flag-zero result therefore remains exactly PARI's outcome:

```json
{"tag":"not_given","reason":"LARGE","precisionBits":"192"}
```

The immutable C6 owner remains incomplete by itself. Only this later join may
state that compact factored units are retained and that internal PARI
correspondence is complete.

## Class group and ordering

The source presentation is the column-major matrix

```text
[24, 0, 0, 4, 4, 0, 5, 3, 2].
```

The two source witnesses have orders 24 and 8, in that order. The neutral
result contract requires normalized increasing invariant factors, so the
published `classGroup.invariantFactors` is `[8,24]`. The source ordering and
both exact order-principal witnesses remain retained storage and replay
evidence. The class number is 192.

## Retained replay state

The envelope retains the raw relation records and principal generators, raw
logs, terminal `H/B/C` and permutation, the source-operation transforms, dense
order-principal coefficient vectors, mapped generator ideals, factor-base
ideals/norms/identities, compact unit data, regulator, torsion generator, and
equal-bound honesty counters. The terminal-class owner must therefore expose a
`factorBase` projection containing `packetIdeals`, `packetNorms`, `packetIds`,
`relationPrimes`, and the 64-cell `basisTable`.

The field has a real embedding, so its torsion subgroup is exactly `{+1,-1}`;
the retained power-basis generator is `[-1,0,0,0]`.

## Honesty and completion labels

The authenticated factor-base counters are

```text
C1=C2=5978, KC=KC2=799, KCZ=KCZ2=487.
```

Thus PARI's `KCZ2 > KCZ` honesty branch is skipped. The envelope records
`equal-bound-source-skip`, not `not-required`. It deliberately remains
`public_complete=false`: GRH bounds, PARI's factor-base choices, and PARI
correspondence are explicit assumptions. The completed internal replay is
`correspondence_complete=true` only after all four boundaries and their exact
cross-owner joins pass.

## Adversarial checks

The focused checker executes under a 600-second wall/CPU cap and 4 GiB address
space/RSS caps. It rejects mutations of every detached input, raw relation and
principal data, HNF/log state, factor-base data, post-806 invariants and
regulator, both source transforms, class witnesses, and C5/C6 state. It also
performs coordinated re-authorization attacks against the exact algebraic join,
re-seals altered output envelopes with fresh hashes, rejects a fraudulent public
completion label, verifies idempotent publication, rejects a conflicting second
publication, and writes the accepted envelope mode `0444`.

Frozen W0 is not an input to this composition or replay.

## Validation receipt

The complete capped checker passed twice against the initial immutable terminal
class owner and then passed again against its hardened, runtime-neutral successor
`c9186b96f7c4845957ad4e6bb002a1d00862f95a4ed26a8d242ed07ce36fb47f`
and authentic C5/C6 owner
`763a91e02ed0f3245d561ba38430930f09eedf8dfce943d27130f7cc579ac212`.
The original two wall times were 25.7 and 26.4 seconds; the hardened-owner run
took 26.1 seconds. Each run rejected 36 detached
authority, coordinated re-authorization, semantic join, re-seal, completion,
and publication-conflict mutations. The second run also re-opened the existing
mode-`0444` immutable publication, proving publication idempotence.

The resulting 3,819,487-byte neutral envelope is

```text
edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2
```

at
`/tmp/sagejs-row14-c7-owner/row14-c7-class-unit-result-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json`.
