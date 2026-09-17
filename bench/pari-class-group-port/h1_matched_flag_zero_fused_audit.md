# Fused H1 matched flag-zero source checkpoint

## Purpose

This lane removes the host conversion between the authenticated live-H1 graph
and the already-qualified compact p192 flag-zero post-root. Its single timed
native call starts with prepared-field owners, performs the adapted eager
same-work relation prefix and HNF/compact bridge, makes exactly one p192
`pari_getfu_signed_real_cubic` attempt, accepts `not_given(PRECI)`, and stops.
It neither calls the stronger exact-unit retry suffix nor publishes a complete
public class-and-unit result.

The fixed Outcome-C baseline gap remains `931,341,545 ns`; passing requires
removing at least `745,073,236 ns`. No threshold is changed by this lane.

## Mechanical composition

`h1_matched_flag_zero_fused.py` was mechanically generated from the typed
signatures of:

- `pari_unified_live_h1_root` (433 parameters), and
- `pari_h1_compact_flag_zero_root` (37 parameters).

Ten compact parameters are existing live-root owners, including the explicit
aliases `multiplication_tensor -> basis_table` and
`clean_phases -> signs`. The fused public root therefore has 460 parameters,
only 27 more than the live root. The checker reconstructs this union from the
two authoritative signatures and proves both private call argument lists
exactly, preventing a hand-maintained 460-argument ABI.

The fused body clears its 12-word publication state before entering the live
graph. A live-prefix failure returns without entering compact/getfu and records
only a nonpublished failure status. A successful prefix delegates to the
qualified compact root, whose own authentication and fail-atomic publication
remain unchanged.

## Static graph exclusions

The timed body contains no serialization, JSON, hashing, evidence construction,
filesystem access, p2304 constant, precision-resource loop, or import/call of
`pari_live_retrying_h1_suffix`. The compact private leaf contains exactly one
signed-getfu call and accepts only exact success or PRECI. The stronger exact
replay remains separately callable in `unified_full_h1_root.py` and is never
labeled matched flag-zero work.

The source-only checker also executes the ordinary CPython fallback with fake
private leaves. It proves the successful call order, prefix-failure short
circuit, cleared publication state, owner aliasing, and propagation of compact
authority failure. Native owner mutation tests remain mandatory after the
heavy build is admitted.

## Qualified evidence outside the clock

The preceding lane established exact canonical agreement at the intended cut:

- relation-prefix SHA-256
  `b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a`;
- 660 factor-descriptor, 4,818 relation, 219 generator, 219 metadata,
  1,533 packed-log, and 66 terminal-RNG cells;
- all catalog, factor-base, subfactor, relation, small-element, and factor
  counters agree with the adapted pinned PARI 2.17.4 source control;
- the isolated compact root publishes PRECI with one getfu attempt, zero
  retries, zero exact-suffix calls, and `public_complete=false`.

The fused timed call does not recompute hashes. The validation driver computes
and compares canonical owner evidence after the clock.

## Paired timing design

`time_h1_matched_flag_zero_fused.cjs` coordinates seven alternating AB/BA
pairs. Each worker reports an internal `kernelNs` interval around exactly one
prebuilt native call. Compilation, input allocation, fixture loading, evidence
hashing, validation, and serialization are excluded. Every pair must agree on
the canonical relation hash, logical owner-evidence hash, terminal RNG hash,
p192 PRECI status, one getfu attempt, zero retries, zero exact-suffix calls,
and incomplete public status.

The paired receipt reports the Sage.js/PARI medians, matched remaining gap,
removed gap relative to `931,341,545 ns`, and the frozen
`745,073,236 ns` pass/fail result. Its deterministic seven-pair self-test
passes. A receipt is never qualified merely because the coordinator ran: both
authenticated worker commands and their current source/build provenance must
be archived when the heavy run is admitted.

## Build-size and RSS planning

No fused build has been started. The most recent isolated artifacts provide a
conservative planning interval:

| artifact | generated core | manifest |
|---|---:|---:|
| live H1 | 95,064,789 bytes | 111,152,277 bytes |
| compact p192 | 12,012,710 bytes | 14,200,209 bytes |

Private-graph deduplication should put the fused core between approximately
95.1 MB (complete overlap beyond the wrapper) and 107.1 MB (the two cores
summed). The earlier cold isolated build peaked at 3,496,424 KiB aggregate RSS.
The fused build must therefore use a dedicated 4 GiB/600 s monitored slot; a
modest overrun is possible because lowering must hold the combined IR and
manifest. If it approaches the limit, stop and measure which compiler phase is
resident rather than silently increasing the envelope.

## Pending admitted work

1. Compile the fused graph once under the monitored heavy slot and archive the
   generated core/manifest sizes, source hashes, compile duration, and peak RSS.
2. Run JavaScript and GMP differential validation against the isolated two-call
   result, including authenticated-owner mutations and exact root/getfu state.
3. Add the real Sage.js and pinned adapted-PARI workers to the paired driver,
   prove all evidence outside the timer, and run the seven fixed pairs.
4. Report Outcome C against the frozen threshold without changing the boundary
   or counting the stronger exact replay as matched work.

## First bounded native gate: capacity failure

The first admitted 4 GiB/600 s, one-job gate compiled and linked the fused
graph, then was killed by the aggregate RSS monitor before correctness output
could be serialized. It exited `-9` after `419.637 s` at
`4,292,332 KiB`, just above the `4,194,304 KiB` limit; stdout and stderr were
empty. The resource receipt is
`/scratch/sagejs-runtime/h1-matched-flag-zero-fused/native-check-resource.json`
with SHA-256
`e1d73334cde75dfe7c2af23a0b4bbe06925026d0e3c132016c906378e899f752`.

This is a compile/code-size capacity failure, not a mathematical failure. The
generated artifact completed before the abort:

- cache key
  `2a65d69bf9c475e1378673d9829ffed16ba84dea4e503a7668b4ba59b970e6f1`;
- core: `100,149,154` bytes, SHA-256
  `7cd618f435f215f520a92798fc44594dda83c3143b5af34045296ca7d29d33ae`;
- object: `19,622,640` bytes;
- addon: `13,998,880` bytes, SHA-256
  `6f6198906aba59940a994ee8aeff6e79e43e956690c9235060c59cb7e52d7251`.

The failure came from retaining the compiler's approximately 100 MB generated
graph/IR and then layering multiple complete JavaScript/GMP owner sets in the
same Node process. It does not justify increasing the memory cap or splitting
the mathematical native call.

The follow-up checker uses the narrowest compilation-unit policy: one child
lowers/loads the existing cache and exits; JavaScript success, GMP success, and
each GMP mutation run in separate sequential child processes which require the
same already-built addon directly. The native entry remains the exact single
fused call. This prevents compiler IR and prior backends' exact buffers from
coexisting while retaining byte-for-byte cross-backend evidence comparison.

That first process split still failed: even isolated cached `compileKernel`
lowering/cache discovery crossed the cap before any backend child began. The
second resource receipt records exit `-9` after `52.6453 s`, peak
`4,217,240 KiB`, empty stdout/stderr, and SHA-256
`e1709b1550cd9d0f9ea3f5d64cf982497b0eed0adf83f07768dcb369c3496ad5`.
This localizes the capacity problem to reconstructing the approximately 100 MB
private graph IR/manifest merely to discover an already-built addon.

The corrected policy bypasses compiler lowering entirely for correctness
replay. It authenticates the ordinary-Python source SHA against the 559-byte
native cache discovery index, pins the exact cache key, and authenticates the
generated core and addon hashes before requiring the addon directly. Four
negative controls independently mutate the source, cache, core, and addon
identities and must all fail. Backend and mutation owner sets remain isolated
in sequential child processes. This uses the one already-built fused artifact;
it neither rebuilds nor changes the mathematical/timed boundary.

The authorized direct-addon correctness gate also hit the same fixed cap. It
performed no compile or relowering, but exited `-9` after `6.043 s` at
`4,227,896 KiB`; stdout and stderr were empty. Its resource receipt is
`/scratch/sagejs-runtime/h1-matched-flag-zero-fused/native-check-direct-resource.json`
with SHA-256
`5694ceabc7d3cc77ed9ec14bb85ef8ba55971e337de16c796c2f7d772c3df415`.
The rapid failure localizes the remaining capacity problem to loading/compiling
the generated 15,146,245-byte JavaScript wrapper/fallback module (or entering
its first backend child), not C compilation or mathematical execution. The
14 MB native addon itself is already linked and authenticated, but the current
generated module couples it to a very large ordinary-JavaScript fallback.

No further correctness rerun or paired timing was attempted. A subsequent
compiler change must separate the lightweight native-addon loader/ABI wrapper
from the generated JavaScript fallback so native-only validation can load the
fused addon without asking V8 to compile the complete private graph.

## Authenticated thin-cache loader

The capacity diagnosis is now conclusive at load-only scope. Requiring the
14.0 MB addon through the new general
`tools/native-kernel/thin-cache-loader.cjs` path leaves the process at only
`54,744 KiB` RSS. The 15.1 MB generated `index.cjs` is absent from
`require.cache`. In contrast, the prior generated-module process crossed
`4,227,896 KiB` in 6.043 seconds before producing output. Thus the generated
JavaScript fallback parse/compile, rather than the addon, accounts for
essentially the entire observed 4 GiB spike.

The thin loader is not an H1-specific mathematical wrapper. It implements the
compiler's existing packed boundary generically: `IntegerBuffer` is the public
`Int32Array` sizes plus `BigUint64Array` limbs record; fixed-width buffers are
the corresponding typed arrays; scalar and arity checks precede one raw N-API
`$gmp` call. The source-identical generated JavaScript fallback remains
available through an explicitly lazy `loadDynamicFallback` method, but native
loading does not parse it.

Before loading an addon, the loader authenticates the ordinary-Python source,
small cache discovery index, native ABI, full manifest, addon, and normalized
entry signature. File hashes are streamed through a fixed 1 MB buffer, so the
116 MB manifest is never materialized as a JavaScript string. Focused negative
controls independently mutate the source hash, cache key, manifest hash, addon
hash, and 460-parameter signature hash; all five are rejected. The pinned
identities are:

- manifest SHA-256
  `2e17ea617106bcfe30d64e35bde06b1649d49d034bc2540c9aa28104ba592235`;
- signature SHA-256
  `127398018f82c3171e40b25a9d5dbbcb5f4661437395dda53203952c8d3eaf81`.

The next bounded correctness gate should therefore use only the thin native
entry for the GMP success and fail-atomic mutation children. CPython fallback
semantics remain covered by the source-level fallback audit; parsing the giant
generated JavaScript fallback in that gate would recreate the diagnosed
capacity failure and is intentionally excluded. A conservative prediction is
that loader overhead is below 64 MiB RSS, leaving more than 4.1 GiB of the
fixed process-tree envelope for authenticated owners and mathematical work.
No new heavy correctness or timing run has yet been attempted.

## Thin-loader correctness gate

The one authorized thin-loader correctness gate passed under the unchanged
4 GiB/600 s process-tree envelope. It exited zero after `15.346 s`, produced
no stderr, and peaked at `1,794,924 KiB` aggregate RSS. This is
`2,432,972 KiB` below the failed generated-module gate and leaves more than
2.3 GiB of headroom beneath the fixed cap. The resource receipt is
`/scratch/sagejs-runtime/h1-matched-flag-zero-fused/native-check-thin-resource.json`
with SHA-256
`47c033e2d27ee3702f5da18928dc6201cfd5d1c1ee023d9a3368be7ca91d5149`.
The full correctness receipt is `native-check-thin.json` in the same directory,
with SHA-256
`3632a784297565d44db83f574e9149fba88113f3d191ba3b5c820831fc71aa78`.

The gate authenticated the exact 2,970,787-byte prepared input at SHA-256
`22a997866388571cd3c12e1a3ea5c5cc3a7fe89217b253bb0e779007f6fe9b77`.
One fused native call returned zero and reproduced the qualified relation SHA
`b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a`,
compact SHA
`80cec2acce5b95ec48beff67b800410eedb5e580e25029aa79d4d63dc40b1c2d`,
and combined owner-evidence SHA
`a0ae8b44555295c035a3603ce4c18dde8dd174bff80b79d34f61d86423a13b5e`.
The published root was exactly
`[0,1,3,192,1,0,0,7,73,8,0,1]`; the one non-retrying getfu attempt ended in
PARI-compatible `not_given(PRECI)` state
`[3,10,-186,0,1923,0,0,1]`.

All frozen relation counters agree: catalog 1230, degree groups 1833, factor
slots 2270, C1=C2=333, KC=66, KCZ=KCZ2=48, decomposition calls 48,
descriptors 66, subfactor trials 4, relations 12 to 73, visited ideals 16,
small elements 1046, factor attempts 96, and random relations 0. Separate
degree and precision mutation children both failed before getfu, left the
publication marker clear, and preserved getfu storage byte-for-byte.

The observed `3.160 s` fused-call interval belongs to a correctness run with
oversized 4096-word defensive buffers. It is not a qualified performance
measurement and must not be compared to PARI.

## Qualified seven-pair matched timing

The predeclared seven alternating pairs have now run against the authenticated
existing addon and an adapted eager same-work executable built from pinned
PARI 2.17.4 `buch2.c`. No native compilation or relowering occurred in the
timed series. The Sage.js clock encloses exactly one raw fused addon call; the
PARI clock starts after `nfinit` and RNG reset and stops immediately after the
single p192 `getfu` attempt. Input preparation, evidence hashing, validation,
and serialization are outside both clocks.

Every one of the fourteen arms reproduced the relation, compact, owner, and
terminal-RNG hashes above, all frozen counters, the exact root/getfu states,
PARI-compatible `not_given(PRECI)`, one getfu attempt, zero precision retries,
zero stronger-suffix calls, and `public_complete=false`. This is therefore a
qualified same-work comparison, not a comparison of the stronger exact replay.

The raw kernel intervals in pair order were:

- Sage.js: `2,426,413,887`, `2,444,824,443`, `2,458,828,850`,
  `2,363,156,132`, `2,404,938,192`, `2,236,508,141`, and
  `2,602,812,935 ns`;
- PARI: `14,276,382`, `15,245,933`, `14,297,012`, `15,028,583`,
  `18,217,515`, `15,028,842`, and `14,009,202 ns`.

The Sage.js median is `2,426,413,887 ns` with MAD `32,414,963 ns`; the
PARI median is `15,028,583 ns` with MAD `731,571 ns`. Peak worker RSS was
`1,733,980 KiB` for Sage.js and `24,244 KiB` for PARI. The matched remaining
gap is thus `2,411,385,304 ns`, larger than the frozen `931,341,545 ns`
baseline gap. Removed gap is clamped to zero, so Outcome C **fails** the fixed
`745,073,236 ns` attribution threshold.

This failure is informative: host conversion, evidence serialization, and the
stronger exact-unit retry suffix are not responsible for the original gap.
The fully fused source-transparent graph still spends roughly 2.43 seconds in
the native call versus 15.0 milliseconds in matched PARI. The next diagnosis
must profile the fused generated native graph itself—especially exact-buffer
representation, private-call ABI/status traffic, and work/storage reuse—rather
than changing the boundary or acceptance criterion.

The full scratch receipt is
`/scratch/sagejs-runtime/h1-matched-flag-zero-fused/h1-matched-seven-pairs.json`,
SHA-256
`eb1acb5624943cb3c57a476e6f387d7d6da84b78925b4fdd88824fdff5c3d00c`.
The committed compact receipt preserves all raw samples, order, RSS, evidence,
toolchain, and artifact identities in
`h1_matched_flag_zero_timing_result.json`.
