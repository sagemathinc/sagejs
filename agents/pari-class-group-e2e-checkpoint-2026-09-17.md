# PARI class-group end-to-end checkpoint — 2026-09-17

This checkpoint records the honest state of
`pari-class-group-end-to-end-native-plan.md` after integration of the first
complete prepared real-cubic H1 root, the native diagnostic stage clock, and
the first authentic field-3 mixed-quartic C1--C7 owner chain. It now also
records frozen panel row 8's authentic C5 v2, C6, exact terminal closure, and
field-neutral C7 chain; panel row 1's exact class presentation, C3 witness,
exact units, and C7 result; and panel row 20's successful exact-unit C6 and C7
closure. It is not a qualification result and does not weaken any still-open
plan gate.

## Current result

### Row 6 post-Gate-C terminal arithmetic

The authenticated row-6 Gate-C and factor-base owners now feed the shared
ordinary-Python post-HNF/analytic/Smith kernel without using the frozen PARI
transcript at runtime. Under a 4 GiB/600 second cap the first sealed run took
25.482 seconds at 515,372 KiB peak RSS and independently returned class number
`4`, invariant factors `[2, 2]`, and the exact expected 192-bit regulator and
rank-two relation lattice. Nine input/output mutations were rejected. This is
a connected arithmetic boundary, not yet a completed class-and-unit result:
full Smith ancestry, exact class witnesses, fundamental-unit reconstruction,
and C7 assembly remain open.

Commits `a4184f067` and `d3ca4608b` subsequently close the first three of
those evidence gaps. Exact source-schedule ancestry supplies seven relation
kernels and two class columns; cubic ideal replay authenticates all 1,137
principal equations and proves two independent order-two generator ideals.
Exact sign propagation modulo two then closes the totally-real cubic C5/C6
suffix, retaining the compact `7 x 2` unit transform and the authentic
`not_given(LARGE)` flag-zero outcome. This makes the class side internally
complete and the matched unit correspondence complete, but it still does not
provide independently certified full-unit saturation or a C7 transaction.

Commit `f0e0ace61` and the subsequent prepared-row-6 transaction close C7 and
publication for this retained-owner boundary. The isolated capped run takes
84.370 seconds, peaks at 963,064 KiB RSS, rejects twelve mutations, and publishes
the 6,746,371-byte envelope
`b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73`.
It is correspondence-complete and public-incomplete. The runtime still admits
the immutable factor-base and accepted Gate-C owners, so row 6 is not a
prepared-field relation-collection qualification result.

### Post-checkpoint advances on 2026-09-18

The integration spine has since crossed four additional, independently checked
boundaries.  These advances do not enable Phase 6 and do not change the honest
campaign outcome from **D**:

- commit `78f9dd920` computes row 14's factor base and 42 initial relations from
  the authenticated prepared-number-field projection rather than accepting the
  historical capsule as an input;
- commit `de485149e` connects that prepared root through the complete live
  relation/HNF schedule `42 -> 802 -> 804 -> 805 -> 806`.  The capped run took
  90.91 seconds and 1,227,312 KiB peak RSS.  All four checkpoint hashes and all
  806 relation identities agree with frozen W0, which is admitted only after
  live execution;
- commits `9f095bed7` and `e452597cd` reconstruct the row-14 HNF ancestry and
  exact order-24/order-8 class witnesses, then compose the neutral C7 result.
  Thus row 14 now proves `Cl(K) = Z/8Z x Z/24Z`, class number 192, while
  retaining rank-two compact-unit ancestry and the authentic
  `not_given(LARGE)` outcome.  The C7 result is correspondence-complete and
  public-incomplete.  Commit `4e6a3f013` then fuses the prepared root, eight-pass
  Gate-C schedule, post-806 arithmetic, C5/C6, exact class ancestry, and C7
  publication into one transaction.  Its runtime inputs are the authenticated
  prepared-field projection and immutable prepared-root owner;
  W0 and all previously published mathematical answer owners are excluded.  The
  capped replay takes 138.62 seconds and 1,384,772 KiB peak RSS, rejects 11
  adversarial mutations, and reproduces the independently constructed C7 digest
  exactly.  Commit `4fb519147` closes the stricter boundary by recomputing that
  root inside the same worker, so the authenticated neutral prepared-field
  projection is now the sole mathematical input.  Its fresh root takes 1.210
  seconds, the downstream live computation 137.870 seconds, and the inclusive
  mathematical clock 139.080 seconds; the all-in transaction including
  compile/warmup and serialization takes 150.260 seconds at 1,390,700 KiB peak
  RSS.  This is the first genuine end-to-end result at the strict prepared-
  number-field boundary, but no PARI ratio is valid until Sage-side detached
  certification is separated from the matched clock;
- commit `b5c292b9c` closes row 3 with class group `Z/6Z`, exact order witness,
  compact rank-two units, regulator, torsion, and authentic
  `not_given(LARGE)`; and commit `6b881db53` closes row 11 with class group
  `(Z/2Z)^2`, two exact order-two witnesses, two 330-factor compact units,
  regulator, torsion, and authentic `not_given(LARGE)`.  Row 11's capped cold
  replay took 25.2 seconds and rejected 14 adversarial mutations.  Both rows
  explicitly retain their frozen-W0 input limitation and make no qualified
  timing or public-completion claim.

The compiler spine also fixed relative native-import graph reachability,
source-compiler convergence, and the stage-zero AST bridge at commits
`f51105d1c`, `ee8dc34e3`, and `88f919534`.  A fresh self-host now converges in
two passes and the full 94-module standard-library plus 67-module baselib cache
build succeeds.

Commit `c7ad139c1` also opens the next field from prepared input.  Row 13's
1.276-second capped root constructs all 999 factor-base descriptors, the
999-by-999 basis owner, and 54 initial relations at 256-bit precision, reaching
relation state `[54,10110,945,7,0,1006]` at 634,900 KiB peak RSS.  Frozen W0 is
admitted only after worker exit; every descriptor, basis cell, and relation
agrees exactly even though the live RNG state legitimately differs.

Commits `2644f1053`, `338f89654`, and `95fdde170` continue row 13 through its
complete ten-pass relation/HNF schedule.  The first two close genuine shared
frontiers: authentic 448-bit real/log/argument storage, a 500,000-operation CUP
bridge, and deterministic supported-smooth factorization of the 68-bit norm
that previously stopped at the word boundary.  Gate C reaches checkpoints
995, 996, 999, 1000, 1001, 1002, 1005, and 1006, including the two authentic
stalls, with final state `[1006,10110,0,0,1006,1006]`.  The capped run takes
127.394 seconds at 1,546,392 KiB peak RSS.  Relations, raw exact logs, `H`,
dependent blocks, and basis/dependent permutation partitions match W0 at all
eight checkpoints.  Alternate valid resident `B`, `C`, and within-partition
pivot coordinates are retained and hash-bound rather than replaced from W0.

The connected row-13 terminal transaction now continues that live state
through analytic acceptance, Smith reduction, exact class ancestry, all 1,006
principal-relation replays, rank-two C5/C6, and neutral C7 publication.  A
fresh capped run from only the authenticated prepared projection and immutable
prepared root took 509.685 seconds at 1,326,656 KiB peak RSS and rejected all
14 boundary/owner/envelope mutations.  It proves `Cl(K) = Z/2Z`, class number
2, retains the compact unit ancestry, regulator, and authentic
`not_given(LARGE)` result, and seals envelope
`17ccbab46e27cae538d8958f4eb0a760fbbbfde112ea26b784dcc54057505b73`.
Frozen W0 is read only afterward as a differential oracle.  This makes row 13
the twelfth internally correspondence-complete development field while
retaining `public_complete=false` and making no qualified timing claim.

Commit `f5d660bf6` crosses a separate generality frontier for row 6.  Its live
prepared-input factor-base root reaches `KC=1130`, beyond the old fixed 1024
ceiling, under a predeclared 2048-ideal admission bound while allocating zero
relation/HNF matrix cells.  It also computes the index-dividing prime `p=3`
through the translated maximal-order radical, quotient split, complement, and
descriptor path instead of importing a frozen packet.  All 1,130 descriptors
and source control state match the cold PARI trace.  The cached native call took
0.845 seconds and 497,468 KiB peak RSS; the first compile-bearing successful
child used 743,024 KiB.

Commit `0bad7237f` continues that owner through the authentic initial-relation
cut.  It derives 203 relations, target 1,137, need 934, missing 927, and state
`[203,11420,927,7,0,1137]`, preserving all 66 RNG words.  The 0.086-second
native root publishes the exact 593-entry sparse basis and all principal
records at 264,652 KiB peak RSS, while allocating no HNF or transformation
history.  It deliberately stops before row 6's 14-pass relation/HNF schedule.

Commit `40b654aad` now executes that complete schedule:
`203 -> 1133`, one stall, `-> 1136`, ten stalls, and `-> 1137`, for 14
collection passes in total.  All relation records, exact logs, `H`, dependent,
`B`, `C`, permutation, and terminal relation identities match frozen W0 after
worker exit.  The isolated replay took 125.593 seconds; a contention-heavy
qualifying run took 322.253 seconds at 1,133,356 KiB peak RSS.  The immutable
owner remains below the 4-GiB bound.  Analytic acceptance, exact class
witnesses, units, and C7 remain the next row-6 cuts.

The subsequent f06f row-6 milestone closes that particular native-call gap.
`row6_phase6_whole_prepared_root.generated.py` now connects the authenticated
prepared input, factor base, initial relations, all 14 collection passes,
initial HNF and both continuations, ancestry, analytic and post-HNF work, Smith
invariants, rank-two units, exact factor/principal authentication, and class
witness projection in one native invocation.  Its exact replay returns class
number `4`, invariants `[2,2]`, and the expected unit result; it also rejects a
reused publication lifecycle and a prepared-input mutation.  The final persisted
4-GiB/600-second jitless correctness run exited zero after 65.236 seconds at
595,336 KiB maximum RSS/HWM and 3,225,152 KiB maximum virtual size.  Its JSON
receipt SHA-256 is
`a6c1729e8099c687a7d4134be2a8e5f89b4ef749c489f6b7bd2948a9b50f273d`;
the sampled resource receipt SHA-256 is
`371e3b4c9f9a3b2a8e851009560d7535e66f9b9ce78ab6d8e310498b6afd12a7`.
This is whole-root correctness/resource evidence for row 6, not Phase-6
qualification: timing remains disabled pending the full matched v2 Sage/PARI
adapter, approved host, identical clock boundaries, and alternating campaign.

Commits `bff9e5840` and `0e15a7d4d` add the pinned PARI 2.17.4 side of the
row-14 prepared-field timing experiment.  It prepares `nfinit` outside the
clock and times exactly `bnfinit0(prepared_nf,0,NULL,nbits2prec(192))`, retaining
the matched class, generator, rank-two log/regulator, torsion, work-state, and
`not_given(LARGE)` projection.  On the development host, preparation took about
4 ms and two diagnostic class-and-unit kernels took 1.902 and 1.787 seconds.
The adapter deliberately publishes no ratio: the Sage.js transaction still
includes detached certification and publication work excluded from PARI's
kernel clock, so a matched Sage-side timing partition is the next prerequisite.

Commit `dfc734103` proves the strict Sage and pristine PARI outputs have the
same class group, both generator-ideal HNFs, regulator value, torsion, work
shape, and all 66 terminal RNG words; the six rounded unit logarithms agree by
110--115 bits.  A subsequent resident prototype removes subprocesses, files,
owner hashing, detached replay, mutation checks, and publication from the
clock.  Its first successful compute-only run took 128.439 seconds: 1.368 for
the live root, 86.658 for relation/HNF, 5.082 for a now-removed projection,
35.271 for analytic acceptance plus the terminal lattice, 0.014 for native
unit/getfu, and 0.044 for native `class_group_gen`.  This is diagnostic pending
the cleaned focused receipt, but it already localizes essentially the whole
remaining performance problem to relation/HNF and analytic/terminal-lattice
machinery rather than unit or final class assembly.  Commit `f6c99d9a8` then
closes that boundary with a fully resident compute-only clock: Sage.js takes
91.109736691 seconds and single-threaded PARI 2.17.4 takes 2.023787590 seconds
on the development host.  The Sage partition is 1.383 seconds for the initial
root, 89.392 for relation collection plus incremental HNF, 0.255 for analytic
acceptance and terminal lattice, 0.016 for unit/getfu, and 0.061 for class
generators.  Exact generators, regulator, torsion, work shape, RNG, and at least
110 log bits agree.  No formal ratio is published from this single proof;
per-pass relation-versus-HNF instrumentation and the required alternating
campaign remain open.

One prepared totally real cubic,
`x^3 - 20018*x + 20034`, now has a genuinely connected internal result:

- live relation collection and HNF state;
- exact H1 class correspondence;
- precision-retrying fundamental-unit reconstruction;
- exact unit norms, regulator, torsion, and final atomic publication;
- an independent cold-replay boundary;
- `correspondence_complete = true` and `public_complete = false`.

The last distinction is essential. PARI agreement and its assumed analytic
policy do not constitute Sage.js completion or certification.

The newer seven-pair development-host diagnostic has 14 samples per
implementation and median complete-root times of `942.830 ms` for Sage.js and
`11.488 ms` for PARI 2.17.4, an `82.07x` ratio. It is explicitly unqualified.
Its raw receipt has SHA-256
`45f778c300a0a51a6b3a039693d1a3b9a423afe9c5e4e7bde8f2a8eab1e1306f`
and records clean commit `68a90847708e2fe49ac9b07c13e51d5c53b31969`.
Both implementations now have real exclusive source-local duration partitions,
but their source cuts are not proved to be identical and therefore must not be
compared stage by stage. Within the Sage.js root, the median partitions are
`626.123 ms` for unit/regulator, `251.142 ms` for relation/retry, `64.037 ms`
for sparse HNF/SNF, `0.100 ms` for honesty/final, and `0.011 ms` unattributed.

A read-only allocator-count profile localizes a concrete compiler/runtime
frontier. The unit/regulator visits perform about 2.09 million `malloc` and
2.26 million `realloc` calls; relation/retry performs about 1.35 million and
0.54 million; sparse HNF/SNF performs about 0.67 million and 0.30 million. The
generated root is one native call, so the public JavaScript/native boundary is
not a plausible explanation. The first permitted compiler campaign tested
authenticated root-lifetime GMP scratch frames. It preserved the exact H1
authority digest and reduced median root callback allocation events from
7,210,445 to 34,813, a 99.52% reduction. The fixed time gate nevertheless
failed: relation/retry improved 1.51x, HNF/SNF 1.69x, and unit/regulator 1.26x,
all below the required 2x. Allocation-event count is therefore not the dominant
remaining H1 wall-time mechanism, and the campaign stopped without fmpz parity.

The honest predeclared campaign outcome at this checkpoint is therefore **D**.
The correctness prerequisite for Outcome C exists, but the required 80% gap
attribution does not.

### Live row-14 relation and HNF closure

Commit `2fd1484fb` advances frozen panel row 14 from its authenticated 42-row
capsule through the complete live relation schedule
`42 -> 802 -> 804 -> 805 -> 806`. The source-faithful schedule takes eight
collection passes in total, including four legitimate empty retries while the
resident state remains at 805 relations. The implementation retains that state
and invokes incremental HNF only when a pass adds relations.

The final capped cold replay took 110.052 seconds, sampled approximately
933 MiB peak RSS, and declared a conservative simultaneous-owner upper bound of
1,633,313,800 bytes. It terminates with relation state
`[806,8110,0,0,806,806]` and HNF state
`[3,10,796,0,7,0,0,806,0]`. Only after the complete live computation, the
checker admits frozen W0 as a differential oracle. All logical prefixes of the
relation records, logarithms, `H`, `dep`, `B`, `C`, and permutation agree
cell-for-cell at all four HNF checkpoints.

The immutable accepted-relation owner has SHA-256
`9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65`;
its compressed representation has SHA-256
`85420e260827d8b1dd50bfcf21c3dc33097856856ef17a487e335de5d8734568`
and sizes 397,276 compressed bytes and 3,580,683 uncompressed bytes. It records
`previousAcceptanceColumns=0` and `cacheChanged=true` for the terminal handoff.
It explicitly excludes the analytic acceptance, Smith invariants, `[24,8]`,
regulator, units, and public-completion claims. Those remain the next connected
gate rather than being inferred from W0.

Commit `6578fc785` closes the next connected gate directly from that immutable
live owner. It constructs the degree catalog through prime 10627, derives the
analytic bound 10626 and inverse-`hR`, runs post-HNF acceptance, takes the
authenticated equal-bound honesty skip, and computes Smith invariants `[24,8]`
with class number 192. The accepted regulator is retained at 256-bit precision,
and the exact 14-cell rank-two unit-relation owner is published with SHA-256
`ac3b40e1d95edee9b8af61f2689a32a937945ed43b2a6112ec97f0783497aef8`.
The final capped checker took 15.534 seconds and sampled
512,996 KiB maximum RSS. Neither W0 nor a regulator, class number, invariant,
or inverse-`hR` answer is a runtime input. Full Smith transformations,
class-generator ideals, order-principal witnesses, compact-unit reconstruction,
and expanded units remain explicitly incomplete.

Commit `5a885c403` now executes row 14's authentic rank-two C5/C6 suffix from
that post-806 state. The capped focused run took 17.3 seconds and terminates in
PARI's legitimate flag-zero `not_given(LARGE)` state: the public unit-relation
exponents reach 41 while the source expansion threshold is 20. The immutable
3,302-byte result owner has SHA-256
`763a91e02ed0f3245d561ba38430930f09eedf8dfce943d27130f7cc579ac212`;
seven result mutations and one post-806 lattice-input mutation are rejected.
This closes source-policy C5/C6 correspondence but does not invent expanded
units or claim the compact factored-unit ancestry that the remaining HNF
source-operation replay must still derive.

These row-14 stage times are not a matched PARI ratio. The frozen panel records
an historical PARI 2.15.4 discovery cost of 11.248 seconds, and the pristine
PARI 2.17.4 trace is explicitly untimed. Stock PARI can now be timed from a
prepared `nfinit` input, but the Sage.js row-14 path still begins later, from an
authenticated factor-base/42-relation capsule. A valid paired comparison must
first connect factor-base selection and the initial relation phase into one
prepared-input Sage.js root and add a row-14 PARI 2.17.4 adapter at the same
boundary. Dividing the current 110.052-, 15.534-, or 17.3-second stage runs by
stock `bnfinit(nf,0)` would therefore be invalid.

Commits `fbbbeb75f` and `b5873397b` separately add honest exact presentation
boundaries for development rows 3, 4, and 11. Their invariant factors and class
numbers are respectively `[6]`/6, `[2]`/2, and `[2,2]`/4. These cuts replay the
authenticated relation presentations but deliberately leave class-order
witnesses, units, correspondence completion, and public completion false at
that boundary. Row 4 now continues beyond it: commit `a542496fe` publishes an
exact compact order-two class witness with 397 signed relation factors and
2,671 bounded ideal products, while commit `ddcf0fd63` publishes two exact
compact rank-two units with norms `(-1,+1)`, regulator
`218671508114152.38`, and the authentic flag-zero `not_given(LARGE)` result.
The unit suffix explicitly records `frozenW0UsedAsInput=true` and
`inputBoundaryComplete=false`; its raw logs are reauthenticated from the
frozen trace rather than generated by a prepared-input live root. Commit
`f232411d9` joins these authorities with torsion and honesty state into
immutable C7 owner
`1e86617426aa63ca4c1b2e3e1c5aaec33401249f98da63a09db26b3fd8e271ef`.
It has `correspondence_complete=true` and `public_complete=false`, while
preserving `frozenW0UsedAsInput=true`, `inputBoundaryComplete=false`, and
`qualifiedTiming=false`. Commit `e7d500d18` adds the fail-closed row-14
terminal-witness verifier: it can
prove generator orders 24 and 8 once the live raw transform and compact
principal-factor owner are available, but it publishes no authentic witness
from generated protocol data alone.

Phase 0 is now proven rather than partial. Evidence commit `a56b433be` records
the definitive fresh 25-stage replay at clean commit `44807189a`; the complete
source/toolchain/build/owner/output manifest is
`8e0c44d0c480fe8580025f7e337b72fa7023d03a7dbb60f0ddf3aa7cf5a91a27`
and the corrected resource ledger is
`18c0af1ccdb5a713478e85f60061cb2f543e90a9598e4b34744f3843894be519`.
The exact-commit build used the authorized build-only stress tier after the
normal 600-second attempt crossed its threshold; mathematical stages retained
their normal limits. The retained approximately 2.08 ms splitting timing is
explicitly unqualified and is not a current performance promotion.

Frozen panel row 8, `x^4 - 20018*x - 20034`, has now closed its authentic
192-bit C5--C7 internal correspondence chain at commits `0e54e771f`,
`88ec9584c`, and `1fe2a113c`. Corrected C5 v2 retains the exact 9-by-2 compact
unit transform and the non-symmetric private `getfu` factor. C6 executes the
full translated exponential, solve, and rounding graph and exactly reproduces
PARI's terminal `PRECI` state with worst rounding error 69863. Under flag zero,
that means `not_given(PRECI)`: the public pre-`getfu` `U` and `A` remain the C5
owners, no expanded unit is published, and the result is not a successful
exact-unit C6 case.

The terminal closure independently replays the authentic 150+1+1 HNF schedule,
all 152 principal ideals and norms, and every cell of the exact equations
`R*T = 0` and `R*Q = I_143`. C7 joins that closure to the trivial class group,
rank-two compact unit evidence, accepted regulator, and torsion order two. Its
immutable result is `correspondenceComplete=true`, `publicComplete=false`.
This closes panel row 8 internally without changing Outcome D, supplying
independent Sage.js certification, or satisfying any qualification gate.

The newer authentic field-3 experiment has now crossed a different frontier.
Starting from immutable exact relation and log owners for
`x^4 - 2000022*x - 2000042`, it executes the high-precision HNF transform,
analytic acceptance, unit-lattice cleanup, embedding reconstruction, and
native translated `getfu` graph. The graph terminates with PARI's legitimate
flag-zero `not_given(PRECI)` at 153088 bits. This is successful source-policy
correspondence, not expanded fundamental-unit reconstruction. The authenticated
terminal adapter now retains C5's exact 301-by-2 compact transform, proves
`W=T*U`, `R*W=0`, principal ideal one, and exact norms `(+1,+1)`, while
publishing no power-basis units and explicitly saying
`exactUnitsPublished=false`. C7 joins that compact unit authority to the exact
field-3 class group `[2,2]`, of order 4, and its class-generator and
order-principal witnesses. The immutable result has
`correspondenceComplete=true`, `publicComplete=false`, and independently cold
replays. It is the first authentic hard-quartic correspondence-complete
development field, not one of the four frozen sentinels and not public Sage.js
completion or certification.

Frozen panel row 1, `x^3 - 20010*x + 20018`, now has an exact presentation
derived from all 58 authenticated principal relations over 51 factor-base
ideals. It proves `R*T=0`, `R*V=P`, class number 3, and Smith invariant `[3]`.
Its C3 witness proves that the selected prime ideal has nonzero quotient
coordinate and that its cube is the authenticated principal ideal. The unit
authority derives both rank-two units from raw relations, with exact norms
`(+1,+1)`, real-place sign phases, and regulator agreement; one unit requires
more than 9,200 coordinate bits. C7 joins those owners with torsion order two
and the authentic equal-bound honesty skip. Owner
`a2c9eabd7c2c41777f80ae8b0fbf75ac5f99272b794540ec57db40bae1d00cb2`
records class group `[3]`, exact units, `correspondence_complete=true`, and
`public_complete=false`.

Predeclared panel row 20, `x^5 - 5*x - 12`, now supplies the required
successful exact-unit C6 case. The authentic C3--C6 suffix publishes integral-
basis units `[7,-7,15,-9,9]` and `[-27,15,8,6,-9]`, both of norm `-1`, with
exact inverses and principal-ideal proofs. C7 independently replays the raw
14-by-7 relation closure, proving `R*T=0` and `R*Q=I_7`, hence the trivial
class group. Owner
`3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052`
joins that class result to the exact units and torsion order two, again with
`correspondence_complete=true` and `public_complete=false`. This closes the
plan's successful exact C6/factorback example, but not the separately timed
compact flag-one tier, the remaining development ladder, independent Sage.js
certification, or qualification.

Frozen mixed-cubic rows 16 and 18 are also internally closed at commit
`967dcf806`. Row 16 derives the noncyclic class group `[3,3,3]`, of order 27,
and row 18 replays its 47-to-50 relation retry before deriving the cyclic class
group `[18]`. Their exact class-generator order witnesses, exact norm-one
rank-one units, regulators, and cubic torsion are joined through the same
immutable neutral C7 envelope. Both results have
`correspondence_complete=true` and `public_complete=false`; they expand the
frozen development-field coverage but do not satisfy public Sage.js
certification or Phase-6 timing qualification.

## Phase coverage

| Phase | State | Closed evidence | Remaining gate |
| --- | --- | --- | --- |
| 0 — canonical spine | Proven | Definitive evidence commit `a56b433be` records a fresh 25-stage replay generated entirely at clean commit `44807189a`: both required histories are ancestors, all 7,081 splitting outputs and nine malformed controls replay, the cubic/quartic paths and required backends agree, and the source/toolchain/build/owner/output manifest and corrected resource ledger are hash-bound. | No Phase-0 gate remains. The retained approximately 2.08 ms splitting receipt is explicitly unqualified and is not promoted as a current performance result; performance qualification remains Phase 6. |
| 1 — observability and ladder | Partial | Four-plus-twelve identities and the 24-field qualification population are frozen; all 16 development PARI traces are exported and hashed. | Natural random-relation, successful honesty, and precision coverage are absent from the performance population; Sage.js does not execute all 16 end to end. |
| 2 — relation/retry | Partial | Exact cubic collection, quartic repeated nonempty-`W` HNF appends, and isolated random-relation corridors exist. | Generic capacity growth, factor-base enlargement, natural random fallback, and all-sentinel closure remain. |
| 3 — exact envelope | Partial | H1 full Smith replay and field-3 `[2,2]` relation/Smith state exist. The field-3 live process retains and independently cold-replays all 186,560 exact cells. All 301 principal relations replay exactly against the 288 retained factor-base ideals. A bounded canonical-HNF route proves rank 288, invariant factors `[2,2]`, order 4, exact suffix alignment, and an arbitrary-ideal receipt with an independently checked principal quotient. The exact 301-by-13 transform has been bound into the immutable field-3 composer: all 3,744 relation-kernel entries vanish, source-order packed replay matches every HNF/append checkpoint and terminal `A`, and both compact unit columns have exact kernel witnesses. Panel row 8 replays its authentic 150+1+1 schedule, all 152 principal ideals and norms, and `R*T=0`, `R*Q=I_143`. Panel row 1 proves its complete 51-dimensional presentation and cyclic order-three generator witness; row 4 now proves its cyclic order-two generator with an exact compact principal witness; mixed-cubic rows 16 and 18 prove `[3,3,3]` and `[18]` with exact order witnesses; row 20 proves the 14-relation right inverse and trivial presentation. | Generalize beyond these fields and close the remaining development-field envelope. |
| 4 — units/precision | Partial | The real H1 cubic performs exact source-derived units and retries from 192 to 2304 bits. For field 3, all 301 real and complex log columns join into an immutable 6,321-cell raw owner; the authentic C3 transform, C4 analytic acceptance, C5 `cleanarch`, and native C6 embedding/`getfu` stages execute at 153088 bits. C5 retains a 301-by-2 compact transform with supports 227/227 and exact norms `+1,+1`; C6 faithfully terminates as `not_given(PRECI)`. Panel row 8 likewise reaches flag-zero `not_given(PRECI)` at 192 bits. Panel row 1 derives two exact units from all 58 raw relations using 16,384-bit exact storage and proves norms `+1,+1`. Row 4 derives two exact compact units with norms `(-1,+1)` and faithfully returns `not_given(LARGE)`, but frozen W0 still supplies the raw logs. Row 14 now executes authentic C5/C6 and faithfully terminates as `not_given(LARGE)` with its immutable source-policy result and mutation checks; compact unit-column ancestry remains open. Rows 16 and 18 publish exact norm-one rank-one units with their regulator owners. Row 20 authentically reaches successful flag-zero C6, publishes two exact quintic units, and proves both norms, inverses, and principal ideals. | Run the separately timed compact flag-one tier, replace row 4's W0 raw-log input, finish row 14's compact unit ancestry, and generalize the precision/unit path to the remaining development fields. |
| 5 — honesty/final | Partial | One atomic H1 internal final result and mutation/replay contract exists. Field-3 C7 joins its exact class witnesses and compact PRECI units into a correspondence-complete, public-incomplete result. Panel-row-8 C7 does likewise for its trivial class group while preserving `not_given(PRECI)`. Panel-row-1 C7 joins class `[3]`, a genuine order-three generator witness, expanded exact units, regulator, torsion, and equal-bound honesty evidence. Row-4 C7 joins class `[2]`, its compact order witness, two exact factored units, `not_given(LARGE)`, regulator, and torsion while retaining the frozen-W0 input limitation. Mixed-cubic rows 16 and 18 join exact class witnesses, rank-one units, regulator, and torsion through the neutral C7 envelope. Row-20 C7 joins a trivial exact presentation to its successful expanded exact units and torsion. Rows 3 and 11 now add exact witnessed groups `[6]` and `[2,2]` with compact rank-two unit results. Row 14 adds exact witnessed group `[8,24]`, authentic rank-two `not_given(LARGE)`, and the first single prepared-input-through-C7 transaction with no frozen answer input. Eleven of the sixteen frozen development fields are now internally correspondence-complete. A separate predeclared unequal-bound degree-five path authentically executes successful `be_honest`. | Add the matched PARI 2.17.4 prepared-field adapter, replace rows 3 and 11's frozen-W0 inputs, run the compact flag-one tier, add independent Sage.js certification, and close the remaining development fields. |
| 6 — qualification | Partial | A real mutually exclusive seven-pair matched diagnostic conserves each root and leaves only `0.011 ms` median unattributed in Sage.js. Compiler campaign 1 preserved the exact result while removing 99.52% of callback allocation events; only 1.26x–1.69x stage gains prove allocation count is not the dominant residual gap. | Source stage cuts are not cross-implementation-identical, the 80% cross-source gap attribution gate remains unmet, and the frozen 24-field qualification has not run. |

## Next falsifiable cuts

1. Complete the matched PARI 2.17.4 prepared-`nfinit` adapter, prove that its
   timed boundary matches the connected row-14 transaction, and run the frozen
   alternating schedule before reporting any ratio.  Keep preparation time and
   final serialization outside both timed regions and retain all failures in
   the denominator.
2. Extend the same sealed owner/result machinery across the remaining frozen
   five-field development ladder, preserving full relation/HNF provenance, exact
   generator-order witnesses, source-order replay, and the
   `public_complete=false` certification boundary. Run the separately timed
   compact flag-one tier only after its genuine compact-factor path and matched
   PARI adapter exist for the full declared tier.
3. Only after those gates close may the unchanged frozen 24-field qualification
   run and Outcome C versus D be reassessed. Preserve failures and timeouts in
   every denominator, do not open reserves early, and do not substitute easier
   fields.

The bounded full-presentation checker at integration commit `e635ce176` used
2,637,224 KiB peak aggregate RSS. It reduced the 301-by-288 source lattice to
288 canonical HNF rows with 555 nonzero entries, then verified the presentation
invariants and order. The generic source-transform route is not an alternative:
it exceeded the four-GiB campaign ceiling before reaching a result.

The first field-specific 153088-bit log replay used 2,108,868 KiB peak
aggregate RSS and 99.663 seconds wall time at integration commit `5083d897a`.
It authenticates the exact hard-quartic owners, regenerates the scalar-2 column
as `(log(2), log(2), 2*log(2))`, and matches all six packed scalar fields with
PARI. It publishes only one of 301 columns and explicitly derives no accepted
lattice or regulator.

The integrated high-precision full-product branch agrees exactly with PARI,
CPython, JavaScript, GMP, and tagged execution at and around the tune-dependent
3520-bit cutoff and at 153088 bits. A 42.7x operand-size increase costs about
5.2x rather than the 1824x quadratic-size ratio. Requalification preserves all
packed outputs; the complex neutral root now uses 170.488 seconds arithmetic
and 1,228,256 KiB peak RSS, versus 380.346 seconds before the branch.

The field-specific 153088-bit embedding probe atomically retains polynomial,
signature, exact integral-basis numerator/denominator data, multiplication
tensor, and run identity. All four exported root components and all 16
`make_M` entries are packed-exact. Closing the former one-ulp discrepancy
required preserving PARI's source operation graph: evaluate the numerator
basis with its common denominator 37 still present, then divide every column by
37. Algebraically cancelling that factor earlier changed one rounding decision;
no answer-derived correction is used.

The 153088-bit real AGM logarithm port matches all seven pristine-PARI packed
triples, including six AGM cases, one series-side cutoff case, exponent shifts,
and one authentic field-3 real root. CPython, generated JavaScript, and GMP
agree. The focused GMP batch used 96.266 seconds arithmetic and 1,298,336 KiB
peak aggregate RSS. At that earlier isolated checkpoint complex AGM remained a
separate cut; the authentic C6 result below now exercises the connected
high-precision complex path through its terminal source decision.

The earlier field-3 composer publishes internal envelope SHA-256
`95925cadcaa3073f8b90b44e4bb8d785e49290c398c42cb41ba10314e347f08a`.
Its two compact units each have 227 nonzero raw-principal factors and exact norm
`+1`; the exact relation-kernel identities also hold after the compact
rank-two transformation. Publication is separately authorized, atomic, and
idempotent. This is PARI-correspondence completeness, not independent Sage.js
certification, so `public_complete` remains false. Those retained compact-unit
witnesses are separate from the newly executed authentic C6 graph and do not
turn its terminal `not_given(PRECI)` owner into an expanded exact-unit result.
The older envelope is rooted in older owner schemas and cannot directly certify
the new immutable chain.

The complete field-3 complex-log corpus is now published as immutable owner
SHA-256 `1edf9485abbd073b5f239c68d441397be5a93d38a46e9489cefc6db1829302fa`
(26,577,591 bytes, mode 0444). Its 76 ordered authenticated batches cover all
301 source columns and contain exactly 2,107 packed weighted complex cells.
The merge receipt is
`ccb40a3389b02cc9b5085d601712ec2515b9eee49875760938cc439b859135b8`;
read-only deterministic reconstruction from the capsules is byte-identical to
the owner, and all 32 selected-prefix columns have compatibility digest
`f4899c83bfb797e61a3fbfc539c107db57eb0ea78e20b9ab1697167d75c3b1cd`.
Two strict ordinary-batch epoch records authenticate source/compiler changes
at 152-to-156 and 164-to-168, while fragment-assembled batches retain a single
cache identity. Aggregate recorded worker wall time is 8,588,801 ms, aggregate
native-kernel time is 5,521,902.412 ms, and maximum aggregate RSS is 1,523,248
KiB. This owner is correctness evidence for the downstream join, not a
single-commit timing benchmark.

## Authentic field-3 C1--C6 chain

The following immutable mode-0444 artifacts were rehashed from scratch storage
at integration commit `e22b2cc96`. File names are content addressed; the
recomputed file SHA-256 equals the digest shown in every row.

| Cut | Immutable owner SHA-256 | Evidence |
| --- | --- | --- |
| C1 joined logs | `8edb2b58b7fa8226e3258d5468e4c4d72fb919750c4e6a2fa4c5030b78dddf1e` | All 301 source columns joined into 6,321 packed cells; 54,345,461 bytes. |
| C3 high-precision transform | `55ebf2e3cd1972aa73fe30e083fdc3a2d6321a659e2086e9ed7e442bd683a4fe` | Authenticated transformed `A`; 2,106,785 bytes. |
| Full terminal ancestry | `ff43de4786beee14f959276505c9c3b80a6fde6147ee1bcc3aa9abbeee83d960` | Joined exact terminal HNF/log ancestry; 4,929,230 bytes. |
| C4 analytic field | `08d3393a9218cd83d93385c30a24881d779dbd4614461f5aea9bd1a1cfe34e40` | Exact field identity used to derive the prime catalog. |
| C4 prime catalog | `74726d2477c470792055a873e86a4dd4a640cc8063bff1dff95bf93ca65196e1` | 802 primes through sentinel 6151, differentially equal to pristine PARI 2.17.4. |
| Accepted C4 | `e21202c987f705108b9391fb429b2eb9d79fba10ce020443431bfe9553044f7a` | Accepted analytic class candidate 4 at generation 1 and 153088 bits. |
| Exact relation authority | `292f5a0c4ab5e39cfa68551638cd870e2a63e360afa8e92415d6de0f06a23b70` | 301 exact principal relations over 288 factor-base ideals. |
| Exact class suffix | `2e6ec2310be5a2d737a51e3b113c42374487d80a81cbf74c635ee4c1b0e5bb4b` | All 572 terminal `B` cells, corrected antiuniformizer descriptors, generator ideals, and order-principal factorbacks. |
| Exact live owner | `1b93fe314ea22d3e8d3d5d42532a1ebefef41354b2833d3dac76fe22ab9c4795` | Binds relation and class authorities, `[2,2]`, class number 4, and torsion 2; 1,112,518 bytes. |
| C5 unit lattice | `d47a5cb6231eeec67849d939a68830e828a7d39f18fbcb7dac813e977bcae7a7` | Authentic `cleanarch`/lattice state, accepted analytic ancestry, and exact 301-by-2 compact unit transform with supports 227/227 and norms `+1,+1`. |
| Prepared embedding | `e353db1b859ada577239bffa42f2fba77b912a4dda1507776aad0249360a0d8f` | Native 153088-bit embedding rebuild with 153152-bit root precision. |
| C6 native candidate | `d2d1798c4ae619debe30ffce5377987b702de8946b9d04c5d41075409a6ff91c` | Native status word 3 and exact terminal state `[3,153088,1,0,0,1,16385,301,0,-2,0,0]`. |
| C6 publication | `8fa75f15da623f809951df429e7f6f6d6f3d6fe879818c2d62e4b9bd8496d3f9` | Canonical `not_given(PRECI)` publication; no unit material. |
| Terminal unit owner | `c8474c87009165ae64401f28436170e851884402c7010f9726120e9ea8557186` | Binds C3--C6, embedding, candidate, and full15 ancestry; `accepted=false`, `exactUnitsPublished=false`. |
| Compact PRECI unit owner | `04bc6ad74bf0cf55d6385bad6a0e58a39ae29b324518af98a450656b4d8ea115` | Retains the 301-by-2 compact transform and relation authority; proves transform composition, relation kernel, principal ideal one, and norms `+1,+1`; 2,082,026 bytes. |
| Authentic C7 envelope | `2ecc26edb8249022d47bfdaaae12ee799b36a1bb5db23d8be870aaf22d4e8615` | Joins class `[2,2]`, class number 4, torsion, exact class witnesses, and compact units; `correspondenceComplete=true`, `publicComplete=false`; 5,733,727 bytes. |

The first authentic C6 attempt exposed an artificial translated precision cap:
PARI retains one guard limb, so the first nonzero exponential input has 153152
bits even though the nominal field precision is 153088. Commit `5cbf21b2e`
admits exactly that guard limb after a storage/capacity audit and pristine-PARI
differentials; 153216-bit input still fails closed before cache mutation. The
rebuilt native `getfu` module has SHA-256
`a24d89365e9d35713bfec9cfba2a12618278c4588f9c9aab1cd29acb10bcb0f8`
and size 1,590,570 bytes. Its build took 56 seconds and used 470,156 KiB peak
process-group RSS.

After that fix, the single authorized authentic attempt ran for 92 seconds and
used 3,641,268 KiB peak process-group RSS under the 4 GiB ceiling. It reached
the source-defined terminal status 3 rather than a translated exception. The
coordinator then published the immutable C6 and terminal unit owners in 0.017075
seconds. C5 took 1.165796 seconds; no separate C5 RSS sample was captured. The
corrected relation and class-owner publications took 0.866540 and 23.290736
seconds respectively. The earlier 4-second, 3,529,788-KiB attempt stopped at the
artificial exponential guard and is diagnostic only, not completed arithmetic.

Two limitations must remain visible. First, terminal `getfu` `PRECI` is not a
Buchall precision retry: it is PARI's flag-zero `not_given` result after accepted
`compute_R`. Second, the authentic C6 run therefore proves source-policy and
language/runtime execution but does not prove expanded exact-unit
reconstruction. The replacement compact unit owner deliberately retains the
transform and relation authority needed for C7, but still publishes no expanded
unit. This one chain cannot satisfy the plan's successful exact-unit, compact
flag-one, all-sentinel, 12-field, or frozen-qualification gates by itself.

## Authentic panel-row-8 C5 v2--C7 chain

Commits `0e54e771f`, `88ec9584c`, and `1fe2a113c` close the frozen row-8
C5 v2/C6/terminal-closure/C7 sequence. The following active mode-0444 owners
were rehashed directly from project scratch at integration commit `1fe2a113c`;
each recomputed SHA-256 equals its content-addressed file name.

| Boundary | Immutable owner SHA-256 | Bytes | Evidence |
| --- | --- | ---: | --- |
| Accepted retry | `b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591` | 467,766 | Authenticates the accepted 152-relation log/lattice boundary and pristine W0 ancestry. |
| Corrected C5 v2 | `f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21` | 6,139 | Retains public 9-by-2 `U`, public 3-by-2 `A`, private getfu candidate, and the authentic non-symmetric factor `[1,0,-2,1]`. |
| C6 `not_given(PRECI)` | `d1f4e9e2ce4ae987952cbce8e8af9d6c9ede318f5ffa89b185fbd003ab5e28df` | 3,098 | Exact terminal state `[3,15,-185,0,69863,0,0,1]`, where status 3 is `PRECI`; no unit, log, or adjusted-factor material is published. |
| Exact terminal closure | `2e7a8a896f68e80093e3e5a5e198597569e804e4dc53f888869138a97710919d` | 261,786 | Replays all 152 principal ideals and norms, all three HNF states, the 152-by-9 `T`, and the 152-by-143 `Q`; proves `R*T=0` and `R*Q=I_143`. |
| Field-neutral C7 | `5626e6e186f481f94c7e1752daab96d04753b864a42cda45faca0607f565e27b` | 264,058 | Trivial class group, unit rank two, torsion order two, compact C5 evidence, `correspondenceComplete=true`, and `publicComplete=false`. |

The five active owners total 1,002,847 bytes. C6 additionally reauthenticates
the mode-0644 W0 artifact at SHA-256
`4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1`
and prepared-number-field authority
`f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01`;
only the prepared embedding and multiplication tensor cross that boundary.
The W0 event arrays and precision-corridor answer tape do not.

At `1fe2a113c`, `check_panel8_c7_result_composer.cjs` passed against the real
owners, performed two cold compositions, and rejected all 12 tested ancestry,
matrix, principal-generator, `PRECI`, compact-unit, closure-tier, and coordinated
reseal mutations. It returned class number 1, empty invariant factors, torsion
order 2, `unitMaterialization="not_given(PRECI)"`,
`correspondenceComplete=true`, and `publicComplete=false`. The full
`pnpm architecture:check` gate also passed at the same commit.

## Authentic panel-row-1 presentation through C7

Commits `80610c6ad`, `9ae23c0de`, `f60734fc9`, and `6f08c8b14` close the
panel-row-1 presentation/C3/exact-unit/C7 chain. The following mode-0444
owners were rehashed directly from project scratch at integration commit
`6f08c8b14`; each recomputed SHA-256 equals its content-addressed file name.

| Boundary | Immutable owner SHA-256 | Bytes | Evidence |
| --- | --- | ---: | --- |
| Exact presentation | `c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf` | 98,465 | Replays 58 principal relations over 51 ideals, proves `R*T=0`, `R*V=P`, class number 3, and Smith invariant `[3]`. |
| C3 generator witness | `77e3a6dd0011fdc5f85fc4d168e3f481eeceb30660a7d158f20cf87e06016d9d` | 6,620 | Proves the chosen ideal has nonzero coordinate modulo 3 and computes an exact principal generator for its cube. |
| Exact units | `75c7f895711566e954db046b76cf49553b8ec1fdf67ee097cddbb98aa004c9ea` | 15,986 | Derives two integral-basis units from 58 raw principal generators, proves norms `+1,+1`, phase bits, and regulator agreement. |
| Field-neutral C7 | `a2c9eabd7c2c41777f80ae8b0fbf75ac5f99272b794540ec57db40bae1d00cb2` | 27,558 | Joins class `[3]`, the order-three witness, exact units, torsion order two, and equal-bound honesty evidence; `correspondence_complete=true`, `public_complete=false`. |

The four active owners total 148,629 bytes. The exact-unit producer consults
W0's `fundamental_units` only after deriving its result, and W0 contains no
exact reference unit. C7 labels PARI's factor-base/bound selection, GRH bounds,
and correspondence faithfulness as assumptions; it is not independent Sage.js
certification.

## Authentic panel-row-20 successful C6--C7 chain

Commits `d2eb36305` and `ad3c192a8` close the predeclared successful exact-unit
case for row 20. These mode-0444 owners were rehashed directly from project
scratch at integration commit `ad3c192a8`.

| Boundary | Immutable owner SHA-256 | Bytes | Evidence |
| --- | --- | ---: | --- |
| Successful exact-unit C6 | `5449d3812514fa9aad06364e6b5ba0c18d10ee66225d0baa4fc5ea7d39f7ea1d` | 3,371 | Authentically reaches terminal state `[0,3,-186,0,-185,1,2,-1]`, publishes two exact integral-basis units, and proves norms `-1,-1`, exact inverses, and principal ideal one. |
| Field-neutral C7 | `3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052` | 7,290 | Replays all 14 principal relations, proves `R*T=0`, `R*Q=I_7`, trivial class group, exact unit ancestry, and torsion order two; `correspondence_complete=true`, `public_complete=false`. |

The two active owners total 10,661 bytes. The C7 producer does not read W0's
class, final, result, or fundamental-unit answer events. It still carries the
declared PARI correspondence, factor-base, GRH, and relation-bound assumptions,
and it is a flag-zero success oracle rather than a compact flag-one timing
result.

## Resource state

Rebuildable caches and inactive generated worktree products were cleaned before
this checkpoint. Active integration and lane artifacts were preserved. Bulky
corpus and replay artifacts remain under project-scoped `/scratch` storage. At
the current evidence rehash, the project-scoped scratch tree occupied 443 MiB
(`461,946,399` apparent bytes).
The field-3 16 retained immutable owners total 75,123,368 bytes; the five active
panel-row-8 owners add 1,002,847 bytes; panel row 1 adds 148,629 bytes; and row
20 adds 10,661 bytes. Superseded owners remain as historical evidence and are
not counted in those active totals.
