# Matched H1 exclusive-stage development runner

This runner compares the complete unified Sage.js H1 root with the
benchmark-only PARI 2.17.4 derivative at the prepared-`nfinit` boundary. It is
an unqualified development-host diagnostic. It cannot qualify final campaign
timing.

## Honest timing sources

The Sage.js root is compiled from the unchanged
`pari_unified_complete_h1_root.py` source with the compiler's opt-in
`diagnosticStageClock`. The four existing `diagnostic_stage_switch` calls are
the only internal cuts. After each native call, the runner consumes
`diagnosticStageTrace()` directly and rejects a failed clock, failed root,
unknown stage, zero-length visit, gap, overlap, total mismatch, or incomplete
five-stage coverage.

The PARI arm consumes `orderedSegments`, `stageTotalsNanoseconds`, and
`inclusiveRootNanoseconds` from the separately hashed stage-clock derivative.
Every instrumented PARI result, work record, and all 66 terminal RNG words
must exactly equal an independent pristine-library cold replay before its
timing is accepted. No JavaScript timer, synthetic counter, or inferred
segment is substituted for either native trace.

Both arms additionally return the existing matched H1 projection. Its result,
cold-replay, seed/RNG, and common-work digests must agree exactly within and
across all pairs. This projection is intentionally narrower than PARI's rich
source record: the receipt separately hashes that exact PARI record and the
Sage.js independent owner replay authority. It does not claim that the two
implementations have the same internal RNG or work representation.

## Frozen input and command

The identified 351-owner input is:

```text
/tmp/sagejs-resident-generated-class-tiijCg/inputs.json
```

Its file SHA-256 is
`22a997866388571cd3c12e1a3ea5c5cc3a7fe89217b253bb0e779007f6fe9b77`;
after sanitization its prepared-input digest is
`03a4ac33c173b65168361f3ff612bc45ed7ff793881a8d5181b1c9a0868fe658`.
The runner records both identities and rejects ABI or field drift.

Run the seven alternating AB/BA pairs with:

```bash
node bench/pari-class-group-port/h1_matched_exclusive_stage_runner.cjs \
  --input /tmp/sagejs-resident-generated-class-tiijCg/inputs.json \
  --pairs 7 --seed 1 \
  --output bench/pari-class-group-port/h1-matched-exclusive-stage-development-receipt.json
```

The output records every raw ordered segment and derives odd-sample medians
for the four named stages, explicit residual, and complete root. The named
positive-gap fraction is diagnostic attribution only. Absolute times and
ratios from this shared host must not be promoted to the frozen qualification
table.

Run the mutation/static checker without compiling the large root:

```bash
node bench/pari-class-group-port/check_h1_matched_exclusive_stage_runner.cjs
```
