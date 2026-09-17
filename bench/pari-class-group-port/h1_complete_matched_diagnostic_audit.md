# Complete H1 matched diagnostic harness

This coordinator is the pre-timing contract for comparing the forthcoming
`pari_unified_complete_h1_root` with authentic PARI 2.17.4 `bnfinit(flag=0)`.
It does not run or qualify a benchmark by itself.

## Matched boundary

Both implementations receive the same canonical
`sagejs.pari-class-group/sanitized-prepared-h1-v1` payload. Number-field
preparation is outside the measured root. Each arm measures the complete class
and unit computation beginning at that prepared-number-field boundary and must
return matching result, cold-replay, RNG-terminal, and implementation-neutral
work digests. Digests must also remain stable across all pairs.

The schedule contains at least seven pairs and alternates `AB`, `BA`, with
`A = Sage.js` and `B = PARI`. Repetition counts may differ, so exact stage and
root gaps are normalized with a common integer denominator before attribution.

## Honest attribution

Each arm has one inclusive root, gap-free nonoverlapping segments, four named
stage totals, and an explicit residual. Sage.js may set a named hook only when
the complete root genuinely executes that stage as a separately measurable
operation. A hooked stage must have positive elapsed time and stage-owned work
counters. Unhooked work stays residual and cannot publish counters.

The currently drafted native root is monolithic. Unless its eventual adapter
executes an operation outside that call or gains audited source-boundary hooks,
its internal relation/retry, HNF/Smith, unit/regulator, and final work must stay
residual. Post-call state counters do not establish elapsed-time boundaries.

PARI exposes no reviewed internal hooks, so every PARI root is necessarily one
residual segment with no named counters. The harness rejects any PARI named
stage claim.

Attribution is derived, never asserted: every pair's exact named and residual
gaps must sum to its root gap. The reported fraction is the median fraction of
positive measured burden assigned to genuinely hooked Sage.js stages. Negative
stage gaps remain in the receipt but cannot manufacture positive attribution.

## Deliberately not final

The receipt hardcodes `diagnosticOnly: true`, `qualifiedTiming: false`, and
`finalTimingRun: false`. This lane uses deterministic clocks only to test the
contract. A later integration lane must connect the authentic adapters, verify
the complete-root output contract, establish a quiet host, and then run the
real alternating schedule. Even that first run remains diagnostic until
separately reviewed for final timing.

Run the focused contract and mutation checks with:

```sh
node bench/pari-class-group-port/check_h1_complete_matched_diagnostic.cjs
```
