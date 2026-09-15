# Independent review: resident field-2 class-group attempt

Scope: the upcoming native closure joining initial relations/HNF, native
regulator acceptance, source next-pass collection, append/HNF and another
acceptance. This is a bounded prepared-number-field diagnostic, not a claim
that all `Buchall_param` branches or final units/maps have been ported.

Review status: API/source/checker review complete; full three-pass native GMP
and same-source JavaScript receipts passed. Native cap-1/cap-2 runs are being
qualified separately by the integration author.
The following obligations come from pristine PARI 2.17.4 `buch2.c` and the
already independently traced field-2 execution.

## State obligations

- W NULL means initial HNF has not run. An existing **empty** W is different:
  field 2 has a complete ideal lattice with class number 1 throughout.
- A becomes present on the first dimension-ready extraction of C's unit
  prefix, before regulator acceptance. A does not mean "accepted units".
- Immediately before that first A assignment, source `if (!A)` resets
  `small_fail=old_need=0` and sets `fail_limit=max(KC/32,10)`. It does not reset
  these on each subsequent rejected acceptance. Initial fail_limit was KC+1.
- R describes the actual multiple returned by `compute_multiple_of_R`, not
  whether `compute_R` accepted. On source RELAT/translated action5 in field2,
  A and R are both present despite the rejection.
- The next requested need is derived from native dimensions or the native
  acceptance action. Do not feed source oracle need/A/R/W flags as control
  inputs. Unsupported lambda, precision, random-relation, rank, or capacity
  branches must stop explicitly rather than inventing recovery.
- `cache.chk` means the last successfully incorporated relation column.
  `cache.last` means the last collected column. The former must advance only
  after native HNF outputs have safely become the resident H/D/B/C/perm.
- `old_cache` is separate: source sets it to last immediately before
  reconstruction, even when reconstruction rejects. The unchanged-cache
  check must compare this value, not chk. A no-append collector pass must not
  pretend to have new HNF or new reconstruction work.

## Owners and extents

- Preserve relation records, exact generators, admission metadata/basis,
  original embedding cache, counters, multiplier and source schedule across
  passes. Reset only the fresh-per-call markers documented by next-pass code.
- Original weighted `embs` and transformed HNF C are different owners with
  different meanings. New append E is the original suffix `(chk,last]`,
  seven fields per place per column; records use the same column interval.
- HNF append outputs can remain mathematically useful after regulator
  rejection. Only publish/swap them after HNF success, not after merely
  entering its phase. Copy precisely live H/dep/B/C extents derived from its
  state, including empty matrices, and preserve the physical permutation.
- After the dimension gate is ready, initialize the multiple's in/out need
  to zero at the source point. Do not blanket-reset candidate regulator/L
  or use previous accepted outputs as new candidate scratch.
- Public class invariants, class number and regulator must stay unpublished
  on failure/stop. Staged HNF or a tentative determinant is not a public
  accepted result. Exceptions must prevent accidental re-entry into a
  half-mutated phase; completed calls need explicit idempotence/resume rules.

## Required field-2 chain

The native engine should independently generate and reproduce:

1. Initial 150 relations, W empty, 143 B columns, seven unit columns;
   acceptance action5 (source code1), need1.
2. Source j=1 pass, exact generator `[28,3,0,0]`, 151 total relations;
   append/HNF and another action5, need1.
3. Source j=2 pass, exact generator `[-143,4,0,0]`, 152 total relations;
   append/HNF and acceptance0, h=1, invariant list empty.

The accepted regulator triple is
`[5535521411280883888340490680131024664251778663230538321703,192,27]`.
Source lookup of these answers is permitted in the checker only, never as
mathematical inputs or stop conditions of the native engine. Initial packet,
prime descriptors and analytic inverseHR are explicitly prepared boundaries.

## Checker/resource obligations

- Show native-produced decisions and append outputs; source fixtures are
  independent comparisons, not supplied intermediate control/state.
- Test at least accepted completion, an early stop/unpublished outcome,
  repeat-call semantics and state/owner integrity.
- Pin source/inputs and report backend counts honestly. Existing component
  coverage is not a claim that this entire closure ran under JavaScript.
- Run native diagnostics under 4GiB address-space and bounded CPU limits.
  `createIntegerBuffer` capacity is measured in **64-bit words**, not bits.
  Estimate packed allocations before executing; persist CP evidence before
  compilation or costly native qualification.

## Initial source review

Reviewed `prepared_class_group_resumable.py` against the source boundaries
above. Its prepared-factor-base corridor derives the initial target need from
native relation initialization, runs the actual outer schedule, computes HNF
and acceptance, and limits retries to native empty-W/full-B RELAT outcomes.
It does not consume the old continuation checker's supplied A/R/need flags.

The ordering of dimension readiness, first `!A` reset/A assignment, separate
old_cache update, original embedding suffix copy, and post-HNF chk publication
matches the declared corridor. Empty H/dep/B need no live-element copy in that
corridor; C does, and its copy count is explicitly recorded. Nonempty-W retry,
dimension need, no append, capacity, precision and other unsupported branches
stop rather than silently choose recovery. Successful initial nonempty-W
acceptance still reaches invariant extraction without entering the retry loop.

The independent AST arity check passed all eight composed calls, including
both 173-argument collector calls and the 95-argument append connector.

One publication defect was found and corrected by the author: early
automorphism/honesty stops previously preceded initialization of the public
publication flag. Those stops now clear publication/count/last slots first,
so a fresh phase0 owner containing other sentinels cannot appear published.
Independent CP tests passed both sentinel early-stop cases, their idempotent
repeat calls, and an atomic partial-phase reuse rejection.

One clarification was requested and fixed: collector return0 can also describe a gated
outer schedule (`outer_state[17]==3`), where the source would enter random
relations. Both collector return sites now detect that gate and stop as an
unsupported branch. Current field2 never reaches this gate; no acceptance is
inferred from a gated collector.

## Checker review and independent control

Reviewed `check_prepared_class_group_resumable.cjs`. Source append records,
generators, logs, final C, h/R/L are only used as expected values. The initial
factor-base counts remain an explicit prepared boundary; no source retry
decision is supplied to the kernel. CP controls cover pass caps 1/2/3, complete
record/generator/original-log prefixes, final C/R/L, the source trace and
small_fail sequence, publication on failure, early guards and repeat behavior.

The first native repeat assertion compared an already materialized snapshot;
the author replaced it with a fresh digest of every owner before/after repeat.
Native failed-pass controls now also assert untouched public invariant storage.

An independent CP full-run control deliberately replaced incoming outer flags
and counters with 999, the multiple's incoming need with 999, HNF/candidate
outputs with 888, and the public class-number sentinel with 123456. The engine
still derived the exact three-pass trace, h=1, accepted R/L, and chk=old_cache=152.
This directly checks that those outputs and retry decisions are computed rather
than accidentally taken from prepared fixture storage. A first harness attempt
hit CPython's default decimal-deserialization digit limit; using the existing
diagnostic 100000-digit override fixed that harness issue, without source edits.

Reviewed source SHA256:
`f2c3d39471b5d7e3f4243d93ea363d1d51f72ee2fcf54e52710863b1c7423014`.
Reviewed checker SHA256:
`0cbe18f4943015c7f1690ae3bd5a998b410f455e1b667f21dd00182486da13c7`.

## Final native and JavaScript receipts

The first native integration compile detected a real annotation mismatch:
`log_completed` is an IntegerBuffer in the collector but the next-pass helper
declared Int64Buffer. Separate host calls had hidden this mismatch. The author
corrected the helper ABI; the mathematical source/control flow was unchanged.
An additional independent static check then passed all **511 direct buffer
annotation matches** across the composed calls. Arity-only review was not enough
to catch this, and is not represented as having done so.

- Native GMP complete three-pass receipt:
  `/tmp/sagejs-prepared-class-resumable-uZTOAV/fixtures.json`.
- Complete same-source JavaScript three-pass receipt:
  `/tmp/sagejs-prepared-class-resumable-vg9REZ/fixtures.json`.
- Both compute driver state `[4,0,3,152,1,0,6363,152]` and the exact trace
  `[150,5,0,0,10,151,5,1,1,10,152,0,2,2,10]`, h=1, and the R/L above.
- Both compare all original records/generators/logs, final transformed C,
  and terminal-repeat owner integrity. CP controls additionally cover all
  three pass limits and partial-state/early-stop guards.
- Emitted core: **61,048,992 bytes**; SHA256
  `97ae2196191bdfac4ac6a25b60c3c1195d98263a1c662d84e55abf661f587c62`.
  This is generated-code evidence, not a waived production size allowance.

The checker now accepts `--backend javascript|gmp`, default GMP. JavaScript
uses raw BigInt/Number arrays instead of allocating the approximately 1.46GB
packed GMP owner set. It is explicitly labeled a same-source entry, **not** a
native entry. Native packed storage behavior remains unchanged. The JavaScript
run passed under 4GiB address space, a 1536MiB Node heap and a 60-second wall cap;
metered peak RSS was 1,031,568KiB. Its 38.44-second total wall time and 51.712502
child CPU seconds include fixture preparation, CP controls, compiler/cache
loading and all validation. They are **not kernel performance measurements**.

Final reviewed source SHA256 remains
`f2c3d39471b5d7e3f4243d93ea363d1d51f72ee2fcf54e52710863b1c7423014`.
Final backend-aware checker SHA256:
`525d312dd082c04dabe0999a19418a562b5063a30559b706d9abaf52aacece86`.
Corrected next-pass helper SHA256:
`be3765d65cfd2dd5e63803aad8c603c5ff960155cd684960d33f6dc72ed58177`.
