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
