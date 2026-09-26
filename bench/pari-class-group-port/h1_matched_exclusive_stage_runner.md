# Matched H1 exclusive-stage development runner

This runner samples the complete unified Sage.js H1 root alongside the
benchmark-only PARI 2.17.4 derivative at the prepared-`nfinit` boundary. It is
an unqualified development-host diagnostic. It cannot qualify final campaign
timing.

## Honest timing sources

The Sage.js root is compiled from the unchanged
`pari_unified_complete_h1_root.py` source with the compiler's opt-in
`diagnosticStageClock`. The four existing `diagnostic_stage_switch` calls are
the only internal cuts. After each native call, the runner consumes
`diagnosticStageTrace()` directly and rejects a failed clock, failed root,
unknown stage, zero-length visit, total mismatch, or incomplete five-stage
coverage. The receipt records ordered duration partitions exactly as emitted;
it does not invent absolute start/end offsets.

The PARI arm consumes `orderedSegments`, `stageTotalsNanoseconds`, and
`inclusiveRootNanoseconds` from the separately hashed stage-clock derivative.
Every instrumented PARI result, work record, and all 66 terminal RNG words
must exactly equal an independent pristine-library cold replay before its
timing is accepted. No JavaScript timer, synthetic counter, or inferred
segment is substituted for either native trace.

The two source stage vocabularies are namespaced as `sage-root/*` and
`pari-buch2/*`. Similar names do not establish identical source boundaries, so
the receipt explicitly prohibits cross-implementation stage ratios. Only the
complete-root medians are compared.

Correctness comes from independent actual authorities, not a shared projected
record. The receipt embeds and hashes the Sage.js cold-replay final-owner
bundle and the pristine PARI result/work/66-word-RNG record. It independently
derives only a common terminal shape: field, class number/invariants, unit
rank, torsion order/generator, and terminal status. Regulator encodings and
fundamental-unit evidence remain source-specific and are not claimed equal.
Every sampled source authority must match its own replay. Sage.js emits no terminal RNG state; its
seed-1 owner-graph policy is reported separately rather than being equated to
PARI's actual RNG or work record.

Both implementations are prepared once. The Sage preparation replay and one
PARI active call are the sole enumerated, excluded warmups, followed by seven
alternating ABBA/BAAB pairs. Sage replay is never performed inside a sampled
arm.

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

Run the seven alternating ABBA/BAAB pairs with:

```bash
node bench/pari-class-group-port/h1_matched_exclusive_stage_runner.cjs \
  --input /tmp/sagejs-resident-generated-class-tiijCg/inputs.json \
  --pairs 7 --seed 1 \
  --output bench/pari-class-group-port/h1-matched-exclusive-stage-development-receipt.json
```

The output records every raw ordered duration partition, implementation-local
stage medians, and complete-root medians. It also hashes the clean Git commit,
compiler configuration and sources, native artifacts, PARI derivative inputs
and artifacts, command, and host/runtime identity. Absolute times and ratios
from this shared host must not be promoted to the frozen qualification table.

Run the mutation/static checker without compiling the large root:

```bash
node bench/pari-class-group-port/check_h1_matched_exclusive_stage_runner.cjs
```
