# Prepared-nf resident candidate reference

`check_resident_attempt_reference.cjs` extracts the hash-pinned PARI 2.17.4
`buch2.c` from the pinned release archive. It is a separate, explicitly adapted
reference control, not a replacement Sage.js backend and not a whole `bnfinit`
benchmark. Source transformations, generated C, build arguments/compiler version,
shared-library hash, executable hash and output are retained in each artifact.

## Boundary

Only `x^3-20018*x+20034`, index one, signature (3,0), precision 192 is admitted.
`nfinit`, runtime initialization, roots-of-unity and empty automorphism/cyclotomic
branch admission are outside the section. These are prepared-field data and
corridor checks, not class-group answers. PARI retains its native nf embedding;
the candidate's packed exact/rounded embedding representation is setup data.

Precision is explicit: `nfinit(...,nbits2prec(192))`, the driver's working
precision maximum (default, nf precision, discriminant/degree estimate), and
`precisionBits=prec2nbits(PREC)`. In **this pinned 2.17.4 release** precision is
already in bits: `pariinl.h:1634` rounds `nbits2prec` up to a multiple of 64,
`:1648` defines `prec2nbits(x)` as `x`, and `parigen.h:44` sets `DEFAULTPREC=64`.
Both headers are verified byte-for-byte against the pinned archive and hashed
in every artifact. Thus changing the earlier literal 192 to `nbits2prec(192)`
does not change any precision or mathematical result. Do not infer historical
PARI word-precision conventions from the function names. Older evidence has
not been amended; the new explicit conversion makes the units unambiguous.

Each measured invocation independently performs:

1. LOGD and fresh GRH cache initialization; eager `cache_prime_dec(...,10007,nf)`.
   Because 10007 itself is prime, the source's inclusive next-prime rule gives
   exactly the candidate's 1,230 primes, not an extra one.
2. Default doubling/binary GRH bound search and `nthideal`; seed one; `FBgen`.
3. HNF/norm packet construction for **all** selected ideals in ascending
   factor-base group order, then default subfactor policy and `trim_list`.
4. Recomputed LOGD (also recomputed by the connected analytic wrapper),
   `primeneeded`, the cached degree data and `compute_invres`/inverse-hR.
5. Fresh relation cache, `init_rel`, first `small_norm(j0=0)`, exact logarithms,
   `hnfspec_i`, regulator multiple, determinant, `compute_R` and invariant-only
   `ZM_snf`.

The compute clock ends before output comparisons, serialization and teardown.
A second clock records `delete_cache`, `delete_FB`, `free_GRHcheck` and stack
rollback; both separate and compute-plus-teardown batch sums are emitted.
Use the combined figure when comparing against a native entry whose return
includes automatic temporary-owner cleanup. Each
repeat frees relation, subfactor and cloned degree-cache owners and rolls back
the PARI stack. No generated descriptor, inverseHR, relation or policy result
is shared between repeats. Full nf equality, exact outputs, work counters,
policy, degree catalog statistics, inverseHR and terminal RNG are checked for
repeat equality. The seed is initialized inside the section, before randomized
factorization. There are no random relation retries in this admitted attempt.

## Explicit adaptations and unmatched representation work

- Eager degree-cache coverage and its ordering differ from stock Buchall's
  demand-driven cache. This is intentional matching of the new candidate's
  preparation, not an assertion that stock PARI performs this eager work.
- Stock `small_norm` lazily builds packets for visited ideals. Here packet
  construction is charged once for all selected ideals; two hash-checked source
  replacements consume those packets in `small_norm` and their norms in
  `subFBgen`. The latter avoids charging a second norm construction that the
  candidate does not perform. No polynomial factoring or ideal calculation is
  replaced by an answer fixture.
- Candidate catalog packing, selected-metadata gathers, all-ideal bad-subfactor
  flag materialization, buffer validation and scalar publication have no
  separately invented C analog. PARI's descriptors/pointer lists and source
  predicate calls serve the same mathematical roles with different work.
- PARI cache prime logs are reused; the candidate can recompute prime logs in
  distinct preparation helpers. PARI `FBgen` computes ball volume internally;
  the candidate derives its collector scale in a separate helper.
- Fresh PARI allocations occur inside the section; candidate owners can be
  allocated/reset outside the compiled call. Report **kernel-only** and
  **reset plus call** separately. Never present their ratio as isolating compiler
  cost alone. Native scalar representations and previously documented leaf
  mappings also remain differences.

## Deliberately absent work

Retries and extra honesty work are rejected, not replaced by success. This
field has `KCZ == KCZ2`, so the original driver's conditional `be_honest` branch
would do no work. Nevertheless the original driver still goes on to unit
lattice extraction/LLL, `getfu`, archimedean cleanup, `class_group_gen` and
`buchall_end`, even with flag zero. None of those stages belongs to this
candidate boundary. Invariant-only SNF is the explicitly chosen output, not a
claim of fundamental units, class ideal generators, maps or a certified bnf.

`check_default_driver_trace.cjs --field0` remains the independent complete
driver correctness oracle. `check_prepared_attempt_reference.cjs` measures the
older, smaller boundary with factor-base and analytic inputs already prepared;
its times are not interchangeable with this reference.

## Validation and later timing

Default build is UBSan `-O1`, one fresh validation invocation. `--release` builds
`-O3`; `--warmups 3 --batches 7 --repetitions N` emits seven batch sums after three
fresh warmups. The executable emits result and timing objects as two JSON lines.
Every repeat validates outputs and work/RNG; these checks are
outside its clock. The emitted executable accepts `WARMUPS BATCHES REPETITIONS`
for subsequent isolated paired runs without rebuilding. All reported times
remain explicitly unqualified until the parent orchestrates an isolated,
matched native comparison. Instrumentation counters are enabled in both builds.

`--candidate PATH` checks exact degree state, default bounds, class invariants,
regulator, inverseHR and relation count against a candidate artifact.
`--catalog PATH` checks the complete 66-word terminal RNG and selected descriptor
count against the separately qualified source/native initial-catalog fixture.
Neither supplies mathematical inputs to the C invocation. `--emit-only` archives
source/metadata without compiling or executing.

Final diagnostic receipt: `/tmp/sagejs-resident-attempt-reference-3c1vJl/fixtures.json`,
two fresh UBSan invocations under a 4 GiB process address-space cap. Exact
candidate regulator/inverseHR and catalog RNG checks pass. Source result has
1,230 primes, 1,833 grouped degree entries, 2,270 factor slots; bounds 333,
66 selected ideals, 48 rational-prime groups, subfactor size four; initial 12
relations, target/final 73; 16 visited ideals, 1,046 small elements, 96 factoring
attempts; zero HNF class rows, 66 B columns, seven unit columns. The initial
failed diagnostic was an admission-assertion bug: PARI's automorphism list omits
identity, so the non-Galois case has vector length one, not two. The assertion
was corrected from the pinned function, without changing the admitted field.
All builds/runs are metered in the continuation ledger; no timing is qualified.
The generated C SHA256 is
`ef3126b4e98e88362cbd8e9415a028775196eb3bd99e9ec2336f5db2494625fc`.
All non-timing output fields remain exactly equal to the preceding
`/tmp/sagejs-resident-attempt-reference-T7lFNS/fixtures.json` receipt; the new
`precisionBits` field is 192.
