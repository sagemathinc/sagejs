# Prepared reference work audit: successful field 1

This is a boundary/work audit, not a timing result. The input field is
`x^3 - 20010*x + 20018`; the pinned source is PARI 2.17.4. No benchmark was
run for this audit.

## Evidence and matching counters

Reference receipt:
`/tmp/sagejs-prepared-attempt-reference-Zia34T/fixtures.json`.
Its transformed source SHA256 is
`6395df83b194714374366bec27ae11f0356361382b7e855d7ee47be7675b8e59`.
Native input-owner fixture:
`/tmp/sagejs-prepared-class-inputs-Q1wCht/inputs.json`.

A fresh CPython replay of the **same source function compiled for native**,
`pari_prepared_class_group_attempt`, using every owner in that fixture, returned:

| Work item | Pinned reference | Source replay / owner |
| --- | ---: | --- |
| Candidate small elements | 491 | `counters[1] = 491` |
| Normalized smooth candidates reaching insertion | 54 | `progress[1] = 54` |
| Visited ideals | 12 | `search_count - schedule[0] = 51 - 39` |
| Initial rational-prime relations | 11 | Existing initial-collector receipt: 11 |
| Final relation count / target | 58 / 58 | `relation_state[0] = relation_state[5] = 58` |
| Computed logarithm columns | 58 | `log_completed[0] = 58` |
| HNF / B / unit-column dimensions | 1 / 50 / 7 | `hnf_state[0,2,4] = 1,50,7` |
| Accepted invariant factors | `[3]` | Action 0, class number 3 |

Replay owners were `counters=[99,491,6,0]`, `progress=[2,54,1,1]`,
`schedule=[39,1,1,1]`, `relation_state=[58,630,0,0,0,58]`,
`attempt_state=[4,0,1,1]`. `counters[0]` and `progress[0]` are per-ideal
counters, **not totals**. The ideal-count formula is valid here because
`jid0=0`: no distinguished-ideal skips occur. The source counter called
`factorAttempts` actually increments after normalization before insertion;
it is not a count of all attempted numerical norm/factor tests.

Counter locations are `candidate_element.py` (`counters[1]`),
`relation_insertion.py` (`progress[1]`), and `ideal_schedule.py` (cursor and
reset rules). These counts were obtained by CPython replay, not by claiming
an old native receipt exported counters that it did not export. Existing
native checks establish exact relation/log/HNF/result equality; the next
native timing harness should assert these three work counters directly.

## Boundary agreement

Both calls receive a prepared maximal-order field representation, selected
default factor base, search order, prime decompositions, ideal HNF/norm
packets, and analytic inverse `hR`. The actual input has `construct_primes=0`
and `outer_mode=0`; thus the reference's explicit `pr_hnf`/`pr_norm` packet
substitution is appropriate. It would **not** be appropriate for a later
`construct_primes=1` benchmark without changing both boundaries.

Both initialize the rational-prime relation cache, execute the first
`small_norm` search with default quota 4, compute relation logarithms, run
initial HNF, test the regulator, and compute invariant-only Smith output.
The reference's full-driver comparison additionally verifies the default
bounds, relation counts, absence of a second collection pass, and exact
192-bit regulator. Neither timed boundary constructs class ideal generators,
principal-ideal maps, full fundamental units/maps, or performs honesty work.

## Differences that remain relevant

1. **Arithmetic is not instruction-for-instruction identical.** PARI uses
   tagged `GEN` values, stack allocation, word kernels and GMP primitives.
   The port has explicit mantissa/precision/exponent representations and
   source-transparent arithmetic. In modular rank/CUP, exact integer
   multiplication/reduction replaces PARI's specialized word operations.
   `hnf_bezout.py` explicitly substitutes Euclidean recurrence for the
   multiword GMP `mpn_gcdext` leaf. Matching outer work counts does not measure
   these primitive counts or establish that all substitutions are cost-neutral.

2. **Prepared arithmetic caches differ in representation.** The native fixture
   supplies 6,543 primes, nine cumulative prime products, factor limit
   1,048,576 and prime limit 65,537. These are arithmetic constants, not input
   factorizations. PARI uses its initialized prime/cache machinery. Cache
   construction is outside the proposed section, but access, conversion and
   cache traversal inside remain runtime costs; they should not be described
   as identical memory behavior.

3. **Validation and storage copying are visible costs.** Native wrappers check
   shapes, freshness, permutations, prepared log entries and capacities;
   private PARI routines rely on driver invariants. The port copies original
   ideal packets into resident scratch, normalized generators into flat
   owners, and relation integers into the word HNF input. PARI uses `GEN`
   references/clones. These are implementation/representation overheads,
   not extra mathematical search. Do not silently disable native validation
   merely to improve a ratio.

4. **Allocation/reset conventions are not yet matched.** Native buffers are
   preallocated with explicit capacities; field1 relation capacity is 630.
   The reference's `init_rel` allocates the same logical relation capacity
   within the section, and `zero_Flm_copy` initializes its basis there.
   Reference packet preparation, permutation copy, FACT scratch allocation,
   output printing and cache teardown are outside. Native JS-to-owner
   conversion, full-capacity zeroing/reset and result extraction must be
   separately reported. A 160,000-entry CUP arena is allocated even for this
   small field; only live scratch should be charged as algorithm execution,
   while owner allocation/reset deserves a distinct measurement.

5. **Smith output deliberately omits transforms on both sides.** Native
   `class_invariant_output.py` translates the square-HNF `ZM_snfall_i`
   invariant-only branch (`U=V=NULL`) and strips ones. The reference calls
   `ZM_snf` and strips ones, not full `class_group_gen`. Neither computes
   generator transformations. For field1 the input is merely `[3]`, so this
   experiment provides almost no evidence about nontrivial Smith cost.

6. **Instrumentation is not free.** Native `track_small=track_fact=1`; the
   reference explicitly enables corresponding counter updates without debug
   printing. Reference result stability checks and serialization are outside
   its clock. Release flags, linked PARI/GMP builds, CPU isolation and cache
   warmup still need recording before any performance claim.

## Conclusion and next measurement

There is no observed excess enumeration, smooth-candidate insertion work,
ideal search, or relation/log count in field1. This is a strong shared
algorithm-work checkpoint, **not proof that the remaining slowdown is solely
compiler code generation**: scalar algorithms, representation, validation,
owner conversion and allocation remain mixed together.

Measure the resident compiled call with precreated owners, assert the three
counter equalities after each fresh attempt, and report reset/conversion
separately. Compare that with the release prepared reference only in a serial,
isolated run. Then attribute remaining time by arithmetic phase and primitive
before changing algorithms or drawing conclusions about language viability.

## Repeat/reset follow-up

The reference now checks every repeat against the first for initial/target/final
relation counts, small-element/normalized-factor/visited-ideal counts, HNF/B/unit
dimensions, regulator-multiple bit count, and exact class number/invariants/R.
These checks occur outside its clock. It also snapshots and compares the shared
prepared `nf`, LP/LV/FB/index arrays, original permutation, subfactor base,
minimum-index array, search list, ideal/norm packets and inverse `hR` after every
attempt. Thus later repeats cannot silently benefit from mutated prepared values.

The shallow `FB_t G=F` copy is safe for this bounded no-automorphism, `j0=0`
path: HNF receives a separate `leafcopy(F.perm)`, `trim_list` returns a newly
allocated search vector, and `small_norm` reads that vector. Cache/basis/FACT
owners are fresh per repeat. The reached admission/valuation routines read the
shared factor-base data; distinguished-ideal, random-relation, subfactor-base
change and honesty paths are not invoked. The full driver's more general
mutation behavior must not be inferred safe from this narrow check.

Two repeats of both fields passed under a **4 GiB virtual-memory limit**, with
exact work-count equality and no shared-preparation discrepancy. Final receipt:
`/tmp/sagejs-prepared-attempt-reference-glncqA/fixtures.json`; transformed source
SHA256 `c2f08963daf1acabf923ecb324b9cc6afb049fa1531a1636c627d0eff0b76feb`.
This was reset validation, not a qualified benchmark.

The resident GMP probe subsequently asserted these same reference work counts
after every native sample: 491 small elements, 54 normalized smooth candidates,
12 ideals, and 58 relations, with the exact class number and regulator above.
The September 15 diagnostic used core SHA256
`d81c5cc7e3083cb08da8482fc84e91a3295301aa9949c556bfc9f5b1c0de2a48`
and 271,240,904 bytes of input/work owners plus an equally sized reset snapshot.
It ran under a 4 GiB address-space cap. This closes the native counter check
requested above; concurrent-host samples remain unqualified timing evidence.
