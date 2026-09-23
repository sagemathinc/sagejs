# Phase-6 qualification execution audit

This audit is deliberately narrower than a qualification result. It records
which parts of Phase 6 are executable through the resident-handle boundary at
integration commit `6f40367f7`, and it
adds the adapter-neutral success-path executor needed between authenticated
field adapters and the existing sealed receipt journal. It does not open the
reserve population, approve this project host, or publish a timing ratio.

## Frozen populations and denominators

`run_class_unit_qualification.cjs --check-manifest` reauthenticated:

- `panel.json` SHA-256
  `7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5`;
- qualification-manifest SHA-256
  `3821a5a51390ca25b3110e7a8058d73cd9945d0ab6ad254c07186e0ac19c1c50`;
- exactly 24 distinct identities: four sentinels, twelve additional development
  fields, and eight final reserves;
- the fixed seven-block `AB/BA` diagnostic schedule and eleven-block
  `ABBA/BAAB` promotion schedule.

The reporter continues to require all 24 prepared flag-zero cases for a final
report. Failures and timeouts remain in that 24-field coverage denominator;
only completed matched pairs enter GM and nearest-rank p95 timing statistics.
The compact flag-one manifest separately freezes twelve additional-development
identities. It does not replace or reduce the 24-field flag-zero denominator.

## Reference and adapter state

The private pristine PARI installation is present and authentic:

- PARI version `[2,17,4]`;
- source archive SHA-256
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `buch2.c` SHA-256
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`;
- `libpari-gmp-tls.so.2.17.4` SHA-256
  `fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f`.

The row-14 pristine-PARI prepared adapter builds and runs now. A fresh focused
check produced two `bnfinit0(prepared_nf,0)` kernel observations of
`2,035,010,394 ns` and `1,938,986,216 ns`, authenticates the exact semantic,
work, and RNG records, and rejects thirteen mutations. This is an executable
reference adapter, not a qualified ratio.

The row-20 compact flag-one seed also replays now. It authenticates matching
Sage.js C6/C7 and pristine-PARI flag-one output digest
`ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2`
and rejects six mutations. It is intentionally untimed and excludes eager unit
expansion; the other eleven compact identities have no timing adapters yet.

## New neutral execution core

`qualification_execution_core.cjs` closes one previously absent mechanical
boundary without changing the sealed manifest, runner, or receipt schema. Given
two already-authenticated adapters named `sagejs` and `pari`, it:

1. warms each implementation outside timing;
2. independently doubles fresh computations until each retained arm contains
   at least one second of kernel work;
3. freezes the resulting per-implementation repetition counts;
4. executes the exact seven-block diagnostic or eleven-block promotion order;
5. requires every fresh computation and every cross-implementation arm to have
   identical normalized output, replay, RNG, and source-work digests;
6. retains peak RSS and sums thread-CPU and resource counters;
7. requires the four mutually exclusive prepared-kernel leaves plus an explicit
   unattributed remainder to equal the inclusive kernel clock exactly.

Receipt arms emitted by the core validate unchanged against the existing sealed
receipt schema. Detailed leaf timers are returned in parallel `stageBlocks`,
because that schema intentionally has no leaf-timer property and rejects extra
arm fields. A later coordinator may authenticate that supplemental stage record;
this core does not weaken the receipt contract to fit it.

The focused check executes all 11 blocks and 44 arms, exercises independent
calibration (two Sage.js versus four PARI repetitions in the synthetic control),
validates the produced arms through the sealed receipt validator, and rejects:

- a non-closing stage partition;
- a changed semantic output after calibration;
- a sub-one-second calibration target.

## What cannot be qualified here yet

The present CoCalc host is not a qualification host. Its process affinity spans
CPUs `0-15`, and no readable fixed governor/frequency policy is exposed. It
therefore fails the existing one-physical-core and fixed-frequency preflight.

More importantly, the general execution runner remains correctly sealed:
`executionEnabled=false` and `reserveOpeningEnabled=false`. There is not yet an
authenticated prepared-input adapter pair for all sixteen development fields,
let alone the eight unopened reserves. The current row-14 Sage.js and PARI
adapters agree semantically, and commit `6f40367f7` closes the compile-inside-
clock defect with an exact corrected single observation of 37.038 seconds
versus 2.017 seconds. That is still not an alternating result on an approved
timing authority, so no ratio is promoted. The compact flag-one tier likewise
has one untimed seed, not a twelve-field timing campaign.

Thus the runnable state is: frozen denominators, schedules, reference PARI,
receipt/report validation, one real PARI prepared adapter, one untimed compact
seed, and now the neutral calibrated alternating executor. The remaining work
is field-adapter closure followed by execution on an approved
quiet Linux x86-64 host; it is not a reason to alter the population, thresholds,
or failure accounting.
