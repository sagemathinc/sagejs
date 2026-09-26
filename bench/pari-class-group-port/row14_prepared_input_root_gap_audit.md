# Row-14 prepared-input root gap audit

## Conclusion

The current row-14 driver is an authentic continuation from the first 42
relations, but it is **not** yet an admissible prepared-`nfinit` timing root.
Its initial capsule supplies the selected factor base, the successful first
bound attempt, the subfactor schedule, all 42 initial rational relations, and
the first small-norm schedule. Those values are useful differential evidence,
but the end-to-end plan expressly forbids them as timed inputs.

Most of the missing mathematics is already translated. The smallest honest
next root should connect the existing degree-pattern, GRH-bound, factor-base,
Kummer-decomposition, selected-ideal, subfactor, and rational-relation
translations to the existing live 42-to-806 row-14 continuation. It should
accept only the neutral prepared number-field state and neutral runtime tables,
derive the current 42-relation state in memory, and pass its owners directly to
the continuation without serializing or rereading a capsule.

The principal remaining work is integration and storage policy, not inventing
a new relation algorithm. The material blockers are the cubic assumptions in
the nearest connected root, the absence of a general automorphism/minimum-index
translation, eager rather than demand-ordered prime decomposition, and the lack
of a practical compiler-owned dynamic capacity boundary for a factor base whose
size is itself computed inside the call.

## Audited field and current boundary

The frozen row-14 field is

```text
x^4 - 200000002*x - 200000002
```

with prepared polynomial coefficients, low degree first,
`[-200000002, -200000002, 0, 0, 1]`. Its relevant prepared data are:

```text
degree                         4
signature                      (2, 1)
unit rank                      2
discriminant                   -43200003776000087360000787200002480
equation index                 1
roots-of-unity order           2
initial floating precision     192 bits
runtime prime prefix           6,543 primes, through 65,537
factorization limit            1,048,576
prime limit                    65,537
```

The authenticated W0 records one successful first factor-base attempt:

```text
C1 = C2                       5,978
KC                              799
KCZ = KCZ2                      487
subfactor count                   4
subfactor indices        [2, 4, 5, 8]
automorphism permutation      empty
initial rational relations       42
```

For this signature, `RU = r1 + r2 = 3`. With `RELSUP = 5`, the outer
collector asks for `RELSUP + RU - 1 = 7` surplus relations. Thus the first
small-norm state is:

```text
relations                         42
target                           806
need                             764
Nrelid                             4
missing                          757
small_norm outer index             0
search/permutation length        799
```

The source RNG state recorded after factor-base construction is identical to
the state at relation initialization and at entry to the first small-norm
search. Rational-prime relation initialization therefore consumes no random
words. The translated connected cubic root seeds the PARI-compatible generator
with `1`; that is also the appropriate first hypothesis for the row-14 default
path and must be checked against the complete descriptor catalog, not accepted
merely because a serialized RNG snapshot agrees.

The existing continuation then follows the authenticated relation frontiers

```text
42 -> 802 -> 804 -> 805 -> 806
```

and obtains class invariants `[24, 8]`, hence class number `192`, after its
relation/HNF stages. This audit changes none of that continuation. It identifies
the missing connected prefix that must produce its initial live owners.

## Exact admissible input boundary

The governing boundary is
[`agents/pari-class-group-end-to-end-native-plan.md`](../../agents/pari-class-group-end-to-end-native-plan.md).
The timed input may contain a prepared maximal-order `nfinit` state and neutral
runtime data. For row 14 this includes:

- the polynomial, degree, signature, discriminant, equation index, integral
  basis, inverse-basis data, basis denominator, and multiplication tensor;
- the real and complex embedding data at the declared starting precision;
- neutral prime and factorization tables whose limits are selected by a public,
  field-independent runtime policy;
- empty caller-owned or compiler-owned storage, provided its policy is not
  learned from the desired row-14 answer; and
- public algorithm options such as the declared PARI-compatible default bound
  mode and assumption mode.

The following current capsule values are forbidden inputs to the matched timed
root:

- all 799 chosen factor-base descriptors, including `p`, `e`, `f`, generators,
  and antiuniformizer/`tau` matrices;
- `C1`, `C2`, `KC`, `KCZ`, `KCZ2`, the successful-attempt identity, and any
  preselected restart;
- the selected rational-prime factor-base catalog, complete-group flags,
  factor-base permutation, subfactor indices, or embedding permutation;
- the 42 sparse initial relations, their rational generators/multipliers, or a
  dense basis reconstructed from them;
- the target, need, `Nrelid`, missing count, first search list, or any later
  relation schedule derived from W0;
- the three serialized 66-word RNG snapshots;
- relation, logarithm, HNF, SNF, transformation, regulator, unit, class-group,
  retry, precision, acceptance, or terminal-result data; and
- a relation or descriptor capacity selected from the known values `KC = 799`,
  target `806`, or the existing row-14 reserve of 8,110 records.

In particular, hashing a capsule before the timer does not make these inputs
admissible. They must be computed from prepared field data by the timed native
call. The capsule remains a cold oracle for differential checking only.

## Upstream source correspondence

The source authority is the pinned PARI 2.17.4 `src/basemath/buch2.c` identified
in the campaign plan. The important prefix is:

- `init_rel`, approximately lines 3556-3581: for every complete rational-prime
  group in the selected factor base, form the relation expressing `(p)` as the
  product of prime ideals with ramification exponents and initialize its
  rational generator;
- the initial `buchall` preparation, approximately lines 3808-3875: initialize
  the GRH machinery, choose/search `C2`, clamp and derive `C1`, run `nthideal`,
  construct the factor base with `FBgen`, select a subfactor base with
  `subFBgen`, initialize rational relations, and add cyclotomic-unit data; and
- the first collection entry, approximately lines 3901-3938: trim the ideal
  list and enter `small_norm` with outer index zero.

For row 14, the prepared discriminant gives
`LOGD ~= 79.75114865146`, `LOGD^2 ~= 6360.2457`, and the default maximum
`floor(4*LOGD^2) = 25440`. The translated search selects `C2 = 5978`; default
equal bounds give `C1 = C2`, so this first path has no unequal-bound honesty
extension. Roots-of-unity order two contributes no nontrivial cyclotomic-unit
relation.

`subFBgen` also computes factor-base automorphism metadata and the minimum-index
map used to suppress equivalent searches. Row 14 has no nontrivial
automorphism permutation in W0, so its authenticated special corridor has the
identity minimum-index map. That observation can justify a fail-closed row-14
root, but it is not a substitute for a general `subFBgen` automorphism port.

## Existing translated graph

The nearest connected implementation is
`pari_resident_generated_class_attempt` in
[`resident_generated_class_attempt.py`](resident_generated_class_attempt.py).
Its preparation spine is:

```text
pari_resident_generated_class_attempt
 +- pari_prime_degree_catalog
 +- pari_discriminant_log
 +- pari_prepared_initial_base
 +- pari_random_seed
 +- pari_initial_kummer_catalog
 +- pari_selected_ideal_packets
 +- pari_selected_ideal_metadata
 +- pari_bad_subfactor_flags
 +- pari_subfactor_product
 +- pari_prepared_subfactor_base
 +- pari_small_norm_scale
 `- pari_analytic_class_group_attempt
```

The components needed by row 14 already exist individually:

| Required work | Existing translated entry | Current qualification |
|---|---|---|
| prime residue-degree patterns | `pari_prime_degree_catalog` in [`prime_degree_catalog.py`](prime_degree_catalog.py) | degrees 2-4; eager diagnostic order |
| small-prime factorization | `pari_get_fs_small` in [`get_fs_small.py`](get_fs_small.py) | monic degrees 2-4 with equation-index guard |
| `LOGD` | `pari_discriminant_log` in [`discriminant_log.py`](discriminant_log.py) | arbitrary discriminant |
| GRH bound search | `pari_prepared_grh_check/search` in [`grh_bound.py`](grh_bound.py) | prepared degree patterns |
| `nthideal`, bounds, `FBgen` selection | `pari_prepared_initial_base` in [`initial_base.py`](initial_base.py) | returns live `C1,C2,KC,KCZ,KCZ2,KC2,prodZ` |
| requested Kummer decompositions | `pari_initial_kummer_catalog` in [`initial_kummer_catalog.py`](initial_kummer_catalog.py) | degrees 3-4, one live RNG stream |
| selected prime-ideal HNF packets | `pari_selected_ideal_packets` in [`selected_ideal_packets.py`](selected_ideal_packets.py) | consumes translated descriptor choices |
| selected `p,e,f,tau` metadata | `pari_selected_ideal_metadata` in [`selected_ideal_metadata.py`](selected_ideal_metadata.py) | selected `FBgen` order |
| bad subfactor flags | `pari_bad_subfactor_flags` in [`bad_subfactor.py`](bad_subfactor.py) | translated group metadata |
| `subFBgen` product limit | `pari_subfactor_product` in [`subfactor_product.py`](subfactor_product.py) | accepts the complex-pair count |
| sorted subfactor selection | `pari_prepared_subfactor_base` in [`subfactor_base.py`](subfactor_base.py) | no general automorphism construction |
| PARI RNG | `pari_random_seed` in [`pari_random.py`](pari_random.py) | seed/state translation |
| initial rational relations | `pari_initialize_owned_relations` in [`relation_insertion.py`](relation_insertion.py) | constructs owned `(p)` generators and cache rows |
| first and later collection schedule | [`connected_outer_schedule.py`](connected_outer_schedule.py), [`ideal_schedule.py`](ideal_schedule.py), and [`unreduced_small_norm.py`](unreduced_small_norm.py) | already used by the live continuation |

The current row-14 capsule adapter
[`row14_initial_relation_seed.py`](row14_initial_relation_seed.py) expands and
inserts the serialized 42 relations. That adapter is exactly the boundary to
remove from the timed graph. Likewise,
[`row14_capsule_factor_metadata.py`](row14_capsule_factor_metadata.py) consumes
serialized descriptors and `tau`; the Kummer/selected-ideal translations above
must instead produce them live.

The connected cubic root is a useful structural template, not a row-14 root.
It is specialized to degree three, three real places, no complex pair, a cubic
discriminant path, fixed H1 storage shapes, and an identity minimum-index input
provided by its harness. Reusing that specialization unchanged would silently
compute the wrong geometry for signature `(2,1)`.

## Smallest honest connected row-14 root

The narrow root should perform these steps in one native call:

1. Validate a fresh owner set and the authenticated prepared quartic state.
   Reject non-row-14 field identities in the first specialization rather than
   pretending the special automorphism corridor is general.
2. Generate prime degree patterns from the prepared polynomial, equation index,
   and neutral runtime prime prefix.
3. Compute `LOGD`; run `pari_prepared_initial_base` to derive the bound, the
   ordered factor-base selection, and all live `KC*` counters.
4. Seed the source-compatible RNG with `1`. Run
   `pari_initial_kummer_catalog` only for descriptors requested through the
   computed bound, preserving one RNG stream and source visit order.
5. Construct the selected prime-ideal HNF/norm packets and metadata from those
   live descriptors.
6. Compute bad-subfactor flags, the signature-correct product limit with one
   complex pair, the subfactor base, its permutation, and the identity
   minimum-index map only after validating the no-automorphism row-14 corridor.
7. Initialize the relation owners and call
   `pari_initialize_owned_relations`. The resulting live count must be 42, and
   its complete rows, generators, hashes, metadata, relation basis, factor-base
   descriptors, subfactor schedule, and RNG state must equal the cold W0 oracle.
8. Without copying through JSON or a detached capsule, pass those same owners
   to the existing small-norm/retry/HNF continuation beginning at outer index
   zero.

The timer must surround this one call only. Prepared-`nfinit` construction,
allocation, packing, compilation, warmup, assertions, capsule loading, and cold
differential replay remain outside it. The factor-base prefix must not be
recomputed by a second disconnected call merely to size an answer-dependent
buffer.

## Concrete blockers

### 1. Quartic generalization of the connected root

`pari_resident_generated_class_attempt` contains degree-three, totally-real,
cubic-discriminant, zero-complex-pair, and H1-shaped assumptions. The new root
must parameterize those facts or introduce a deliberately row-14-specific
quartic root whose restrictions are explicit and validated.

### 2. Automorphism and minimum-index construction

There is no connected translation of PARI's factor-base automorphism matrices
and permutations. The frozen row-14 trace authenticates an empty nontrivial
permutation, making identity `minidx` valid for this field. The root must check
that corridor from prepared field identity and fail closed otherwise. A general
prepared-number-field root still requires the missing automorphism work.

### 3. Demand order versus eager degree catalog

`pari_prime_degree_catalog` factors every supplied runtime prime up front,
whereas PARI's `get_fs` cache fills on demand. This can reproduce the correct
catalog but does not establish a matched timing boundary. The first correctness
gate may use it; the promotion timing gate requires a source-order adaptive
prefix or measurements proving the eager neutral work is immaterial and
symmetrically charged.

### 4. Capacity without answer leakage

The current row-14 storage budget has 7,207,387 scalar cells and a relation
reserve of 8,110, both derived from the already known `KC = 799`. A naive
worst-case allocation for every possible descriptor through 65,537 is too
large, and relation/cache storage grows quadratically with the computed factor
base size.

The root therefore needs one of:

- a documented, field-neutral public admission ceiling that is fixed before
  seeing row-14 results and is large enough for the declared input class; or
- compiler-owned dynamic vectors/arenas whose capacity is grown from the live
  `KC` inside the call and is not part of the external ABI.

The compiler has `NativeIntegerVector`/`NativeIntegerMatrix` machinery, while
the current relation collectors require borrowed fixed `IntegerBuffer`
owners. A representation bridge or generalized collector ABI is the likely
smallest durable solution. Running an untimed first pass to discover `KC` and a
timed second pass is not an admissible answer.

### 5. Prepared embedding packing

The root still needs a fixture-independent packer for the prepared real and
complex embedding descriptors, including mantissa, exponent, and precision
owners. Those values are allowed prepared inputs, but copying them from a
row-14 result fixture would not be.

### 6. Restart ownership

The row-14 W0 succeeds on its first equal-bound attempt, so a narrow first root
may fail closed if its freshly computed first attempt cannot proceed. It must
not consume the capsule's declaration that attempt one succeeds. The general
engine still needs the source `START`/factor-base restart loop and must keep
the successful decision inside the call.

### 7. Connected qualification and graph size

The Kummer, selected-ideal, subfactor, relation initialization, and continuation
pieces have focused differential evidence, but the full quartic composition
through `p = 5978` has not yet been qualified as one root. It will also be
larger than the existing 357-function H1 graph. Compile memory, generated code
size, ownership, and call-graph closure need explicit qualification; they must
not be reduced by severing the timed graph at a serialized intermediate.

## Staged acceptance gates

### Gate A: computed factor-base frontier

From prepared row-14 input and neutral prime tables only, the root computes the
first attempt and reproduces:

```text
C1=C2=5978, KC=799, KCZ=KCZ2=487
```

It also reproduces all 799 descriptor choices, selected ideal packets, metadata,
subfactor `[2,4,5,8]`, empty nontrivial automorphism permutation, and the RNG
state. Mutating any forbidden capsule field cannot affect this run because none
is accepted by the ABI.

### Gate B: computed 42-relation boundary

The same call initializes exactly 42 rational-prime relations. Every relation
row, generator, owner length, hash/cache record, basis entry, and schedule
counter agrees with the frozen oracle. The RNG state is unchanged across this
initialization. No capsule relation or multiplier is loaded.

This is the smallest useful development stop: it proves that the forbidden
initial capsule can be regenerated. It is not yet an end-to-end timing claim.

### Gate C: live handoff to collection

Without serialization or reallocation from oracle-derived sizes, the owners
from Gate B enter the current outer-index-zero small-norm path and reproduce
the authenticated frontiers `42 -> 802 -> 804 -> 805 -> 806`, including
relation identities, schedules, retry decisions, and HNF checkpoints.

### Gate D: terminal class result

The connected row-14 call reaches the existing post-HNF path and reproduces
invariants `[24,8]` and class number `192`, together with all resident
transformation and witness material currently promised by that path. Cold
replay validates the result after timing. This gate does not claim unfinished
unit/final-BNF material unless those later owners are also generated live.

### Gate E: honest matched timing

Only after Gates A-D pass may the prepared-input kernel be timed against the
matching PARI 2.17.4 prepared-field boundary. Qualification records the
complete native call graph, generated source/object size, peak compile and run
RSS, allocation/growth counts, eager versus demanded prime work, exact relation
and HNF counters, and all raw alternating pairs. A disconnected prepass, a
capsule read, an answer-derived capacity, or an untimed successful-restart
selection invalidates the comparison.

## Implementation decision

The shortest defensible campaign is therefore:

1. build a fail-closed row-14 quartic prepared-input root by adapting the
   existing connected H1 orchestration;
2. solve capacity with compiler-owned growth or a declared neutral admission
   policy;
3. qualify its prefix at the freshly computed 42-relation boundary;
4. connect the same owners to the existing 42-to-806 continuation; and
5. only then replace eager catalog work and field-specific automorphism handling
   as required for a matched timing and a general prepared-number-field root.

This preserves the value of the authenticated capsule as an exact oracle while
removing every answer-bearing capsule field from the computation boundary.
