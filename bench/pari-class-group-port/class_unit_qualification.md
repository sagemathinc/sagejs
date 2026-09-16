# Class-and-unit qualification infrastructure

This directory contains a sealed qualification contract for the faithful PARI
2.17.4 class-and-unit language experiment. It does **not** yet execute either
implementation, open the eight reserve fields, or claim qualified timings.

`class-unit-qualification-manifest.json` links the exact 24-field population to
the SHA-256 of `panel.json`. Four sentinels and twelve additional development
fields may be used while building the complete path. Eight final-reserve fields
remain unavailable until the complete candidate commit and all executable,
generated-source, object, PARI library, and oracle hashes have been frozen.

## Measurement protocol

The complete prepared-`nfinit` result is the headline boundary. Relation/retry,
sparse HNF/SNF/transform, unit/regulator, and honesty/generator/final assembly
are separate diagnostic boundaries. Their leaf clocks must be mutually
exclusive; the inclusive root minus their sum is an explicit unattributed
remainder. `nfinit` preparation is contextual and is never included in the
prepared-kernel ratio.

Stage diagnostics use at least seven alternating `AB`, `BA` observations. Final
qualification uses at least eleven blocks alternating `ABBA`, `BAAB`, with
`A = Sage.js` and `B = PARI`. Every retained arm contains fresh computations
whose batch wall time is at least one second. Calibration, compilation, warmup,
decoding, and replay are recorded but excluded from the kernel clock. A batch
that misses the one-second gate is retained as invalid evidence; a replacement
uses the predeclared repetition-doubling rule.

The timing coordinator holds an exclusive nonblocking
`/tmp/sagejs-opt-timing.lock` across host fingerprinting, warmup, every arm, and
the final append/fsync. Qualification requires one pinned physical core, an
explicitly quiet host, readable fixed frequency policy, one arithmetic thread,
the exact frozen artifacts, a 4 GiB normal address-space cap, and a 600-second
arm timeout.

Receipts are append-only JSON Lines journals: one declaration, complete raw
block records, and one terminal summary. The materialized receipt validates
against `class-unit-qualification-receipt.schema.json`. Output, replay, RNG, and
source-work digests must agree in every completed matched arm.

## Commands available now

```sh
node bench/pari-class-group-port/run_class_unit_qualification.cjs --check-manifest
node bench/pari-class-group-port/run_class_unit_qualification.cjs --plan-development
node bench/pari-class-group-port/run_class_unit_qualification.cjs --validate-receipt receipt.json
node bench/pari-class-group-port/run_class_unit_qualification.cjs --validate-journal receipt.jsonl
node bench/pari-class-group-port/report_class_unit_qualification.cjs receipt.json ...
```

`--run`, `--lock-held`, and `--open-reserves` fail closed. The integration lane
must connect a correspondence-complete Phase-5 root and a pinned PARI oracle,
then deliberately enable execution and reserve release. The lock re-execution
interface is already deterministic: `/usr/bin/flock --nonblock --exclusive`
owns the timing lock for the lifetime of the child runner.

## Failure accounting

Every frozen field remains in the 24-field denominator. The allowed terminal
statuses distinguish wrong results, replay or work divergence, unsupported
branches, timeout, resource failure, crash, invalid measurement, and
infrastructure failure. Every incomplete case records failure taxonomy 1--10,
first divergence, and a nonempty diagnosis. Timing GM and nearest-rank p95 use
completed matched fields only; there is no favorable imputation.

The reporter applies the plan's fixed A/B/C/D thresholds. In particular,
seconds-scale eligibility comes from fresh PARI 2.17.4 per-call measurements,
never the historical PARI 2.15.4 discovery costs stored in the selection panel.
