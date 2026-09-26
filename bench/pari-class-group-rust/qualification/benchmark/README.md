# R0 class-group benchmark harness

This directory contains the qualification measurement harness, not a class-group
implementation. It invokes two external adapter commands and never edits or
links either implementation. The checked-in example is illustrative: its PARI
wrapper name is intentionally absent until the pinned qualification adapter is
frozen.

The harness rejects a run unless both arms declare the exact same boundary
label. A boundary also records one of the three campaign kinds:

- `algorithm-stage`, with a required `stageName`;
- `prepared-field`;
- `public-call`, with `fresh-process`, `fresh-field`,
  `warmed-code-fresh-field`, or `cached-result-lookup` mode.

Every boundary states included work, excluded work, proof mode, and output
policy. This prevents a Rust relation-and-Smith measurement from being labeled
as comparable to a complete PARI class/unit call merely because both print the
same invariant factors.

## Adapter contract

An arm command is an argv array, so it does not pass through a shell. The
following placeholders are available in every argument and in `cwd`:
`{input}`, `{fieldId}`, `{seed}`, `{sampleIndex}`, and `{round}`. The final
nonempty stdout line must be JSON. Set `jsonLinePrefix` when an adapter prefixes
that line. `durationPointer` selects the adapter's integer nanosecond duration;
when it is omitted the harness uses external wall time.

`resultProjection` maps shared result names to arm-specific JSON pointers. The
harness canonicalizes that projection and computes SHA-256. All retained
samples from both arms for a field must have one exact fingerprint. Use strings
for arbitrary-precision integers; JavaScript JSON numbers cannot represent
them exactly.

The example shows how the existing Rust candidate-stage result and a matched
PARI stage adapter can be normalized despite their different envelopes. It is
deliberately not a complete prepared-field comparison: the current Rust
coefficient-box result does not establish completion. Copy it to a run manifest
and replace the illustrative PARI command with a reviewed matched-stage wrapper:

```bash
node run-benchmark.mjs campaign.config.json campaign.receipt.json
```

## Measurement and evidence

At least 15 samples per arm and one warmup are mandatory. Each round runs both
arms, and first position alternates `AB`, `BA`, `AB`, `BA`, … to expose order
and thermal drift. Warmups are logged but excluded from statistics. Tiny-field
batching belongs inside an adapter and must produce the same fresh-result
contract on every repetition.

The receipt keeps raw samples in execution order. Each records arm, field,
round, position, seed, command, cwd, adapter time, external wall time, exit
status, exact result projection and fingerprint. Median values are derived
views; raw samples are never replaced by sorted or aggregated data.

The evidence directory stores the frozen config plus stdout, stderr, and a JSON
record for every invocation, including warmups and failures. A timeout,
nonzero exit, malformed JSON, missing pointer, invalid duration, or result
fingerprint mismatch makes the receipt fail. The runner continues the campaign
so failures and timeouts remain in the denominator. It rewrites the receipt
after every invocation, preserving evidence if the campaign is interrupted.

Environment identity includes Node and component versions, OS/CPU/memory,
thread-related environment variables, git commit and dirty-state fingerprint,
configured toolchain version commands, and executable hashes where the arm's
first argv item names a file. Add compiler, linker, PARI, GMP/MPFR, and Wasm
tool identities to `identityCommands` for a real campaign. Record host
exclusivity, CPU governor and pinning in the campaign manifest or an attached
host receipt; this harness does not silently change machine policy.

For the exact prepared-cubic engine, `run-rust-prepared.py` verifies the
conditional class/unit index-one status before exposing a sample, while
`run-pari-prepared.py` authenticates and invokes the pinned PARI 2.17.4
control. `prepared-cubic-campaign.config.json` compares these as
`prepared-field/complete-grh-class-unit-v1`. It is expressly not a public-call
comparison: maximal-order preparation and the Sage.js public interface are
outside both timers. Both wrappers add child-process peak RSS and preserve the
implementations' stage clocks. The campaign hashes the Rust and PARI
executables, wrappers, lockfile, and build identities, including their byte
sizes.

`results/prepared-cubic-overlapping-host-smoke.note.json` classifies the first
complete campaign as functional evidence only because a browser campaign ran
on the same host. Its times must not be used as headline or gate evidence.
`summarize-receipt.mjs` derives stage medians and Rust/PARI ratios from a
passed raw receipt while retaining its SHA-256 link. The stage buckets preserve
each engine's definitions and may be nested; they must not be summed blindly.

## Tests

The tests use only a fake subprocess adapter. They cover strict boundaries,
alternating order, raw evidence, matching exact fingerprints, nonzero-exit
retention, and mathematical-result mismatch:

```bash
node --test test/benchmark.test.mjs
```
