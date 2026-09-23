# H1 matched flag-zero Outcome-C audit

## Question and fixed threshold

This lane asks whether a matched PARI flag-zero boundary removes at least 80%
of the measured H1 duration gap without calling Sage.js's stronger exact-unit
replay. The fixed baseline gap is `931,341,545 ns`, so the fixed Outcome-C
threshold is `745,073,236 ns`. The existing eager exact-unit visit accounts for
about `624,947,000 ns`; consequently the matched relation-prefix/control work
must independently explain at least `120,126,236 ns`. These numbers are frozen
before this implementation is timed.

## Boundary

The Sage.js matched root consumes the authenticated outputs of the existing
prepared H1 relation/HNF computation and compact p192 bridge. It transposes the
authenticated prepared embedding owner into the basis-column-major layout used
by `getfu`, makes exactly one `pari_getfu_signed_real_cubic` call at p192, and
accepts either exact success or PARI-compatible `not_given(PRECI)`. It never
enters the p192-to-p2304 retry/reconstruction suffix and never publishes a
complete public class-and-unit result (`public_complete=false`).

The existing `pari_live_retrying_h1_suffix` remains a separately callable,
strictly stronger post-pass. It reconstructs relation units from the compact
provenance owner and may retry at increasing precision. Its work and timing are
reported as exact replay, never as matched flag-zero work.

## Canonical evidence

`h1_matched_flag_zero.py` defines two capacity-independent canonical records:

1. a pre-HNF relation-prefix record, using column-major relation order,
   row-major factor-ideal descriptors, relation-major algebraic generators,
   relation metadata, packed real/complex log embeddings, named logical
   counters, and all 66 words of terminal RNG state;
2. a compact p192 record containing clean logs/phases, compact provenance,
   factor transform, one-attempt status, zero retry/suffix counters, and the
   same terminal RNG owner.

Integers are canonical decimal strings and hashes are SHA-256 of sorted compact
JSON. Workspace padding is excluded. Mutation tests cover descriptors,
relations, metadata, logs, RNG state, authority/counter state, and `getfu`
status.

## PARI control

`h1_matched_flag_zero_control.cjs` authenticates the pinned PARI 2.17.4 archive
and pristine `src/basemath/buch2.c`. The compact control instruments stock
source immediately before the first `hnfspec_i` and immediately after
flag-zero `getfu`. The relation control applies the already-audited Sage.js
same-work adaptation: selected prime-ideal norm/HNF packets are prepared once
and then consumed by `small_norm`, with the original factorization and
relation branches unchanged. It exits before HNF and records the descriptors,
relation matrix, generators, metadata, log embeddings, counters, and RNG. The
compact record contains the stock p192 logs/factor/regulator/PRECI reason/RNG.
These are pinned-source controls, not API-level reconstructions.

## Admitted isolated and control results

The isolated native differential passed for both JavaScript and GMP backends:

- root state: `[0,1,3,192,1,0,0,7,73,8,0,1]`;
- signed-`getfu` state: `[3,10,-186,0,1923,0,0,1]` (`PRECI`);
- one attempt, zero retries, zero exact-suffix calls, and
  `public_complete=false`;
- authenticated compact owners remained immutable and four independent owner
  mutations were rejected before `getfu`;
- the generated core contains `pari_getfu_signed_real_cubic` and contains no
  retry graph or precision-resource loop.

The first admitted probe exposed that the default exact-buffer word capacity
was too small for this real compact owner. The harness now allocates the
declared owners with 4,096-word exact capacity. The passing run took
`54.7647 s` including cached compiler loading/execution and peaked at
`1,218,848 KiB` aggregate RSS under the 4 GiB/600 s envelope. Its receipt is
`/scratch/sagejs-runtime/h1-matched-flag-zero/isolated-native.json`
(`fe88a5c86208b30f0a6db8ed4287e69691c3420de68a6c59a684b64d42d2ff8d`),
with resource receipt
`e9645f06b41cff347bdffbc116ca82972e2329cd9392a866d75031211870aca9`.
Only the serializer portion of the Python file changed after this run; the
complete `@native` source suffix is unchanged and has SHA-256
`c0d4409aacd26738fee0cbef322737e8e6942f5db55d4184fcf9999b7aa1de5b`.

The adapted PARI relation control and stock compact control then passed in
`9.3553 s` at `240,812 KiB` peak aggregate RSS. Its canonical relation record
agrees exactly with the authenticated Sage.js owner at the intended cut:

- 660 factor-descriptor cells, 4,818 relation cells, 219 generator cells,
  219 metadata cells, 1,533 packed-log cells, and 66 RNG words;
- catalog/degree/factor counts `1230/1833/2270`, `C1=C2=333`,
  `KC/KCZ/KCZ2=66/48/48`, 48 decompositions, 66 descriptors, four subfactor
  trials, 12 initial and 73 accepted relations, 16 visited ideals, 1,046 small
  elements, 96 factor attempts, and zero random relations;
- canonical relation-prefix SHA-256
  `b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a`.

The complete control receipt is
`/scratch/sagejs-runtime/h1-matched-flag-zero/pari-control-adapted.json`
(`5532a9cecbbbde6b5ff697df2615706debbd592828f3dc688140774af7dd5540`),
with resource receipt
`6c280ad39bd740e3bd5c718435afac216f52de73b2f823f330b316321ecbf880`.
The compact control reports p192, one stock `getfu`, PRECI reason 3, rank-two
logs, seven compact factors, no expanded unit, and the same 66-word terminal
RNG state.

## Pending fused-root validation

The isolated correctness gate and matched pinned-source relation gate are now
complete. Final accepted timing still requires a single compiled root (no host
conversion between live H1 and compact `getfu`) generated mechanically from
the existing signature/layout. That admitted run must record:

- fused-root differential correctness and mutation rejection;
- matched relation-prefix duration, avoided exact-replay duration, their sum,
  and the frozen `745,073,236 ns` pass/fail decision.

No timing from two public native calls is acceptable as the final matched-root
timing because intermediate host conversion changes the boundary.
