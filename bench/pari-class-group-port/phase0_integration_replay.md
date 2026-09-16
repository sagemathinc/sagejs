# Phase-0 integration replay

`run_phase0_integration_replay.cjs` turns the existing PARI-port producers and
checkers into one durable, resumable Phase-0 gate. It does not implement a new
mathematical algorithm. Each stage invokes the ordinary existing checker and
then validates its declared result more narrowly than a zero exit status.

The former audit notes often named historical `/tmp/sagejs-*` directories.
Those paths are not inputs here. The caller supplies an artifact root and the
runner sets `TMPDIR`, `TMP`, and `TEMP` to an attempt-local directory beneath
that root. Stage attempts are append-only:

```text
ARTIFACT_ROOT/
  pipeline.json
  stages/STAGE/current.json
  stages/STAGE/attempts/attempt-XXXXXX/
    command.json
    stdout.log
    stderr.log
    receipt.json
    generated/...
```

`current.json` is replaced atomically only after the checker succeeds, its
reported artifact remains inside the root, the stage-specific assertions pass,
and its outputs are hashed. A failed attempt remains available for diagnosis
but cannot become current. A resumed stage verifies the current receipt and
all declared output hashes, then compares its complete identity: repository
commit/tree, command, checker/runner hashes, dependency receipt hashes, and
pinned PARI identity. Identity drift fails closed; an intentional rerun uses
`--force-stage` and appends another attempt.

## Stages

The default run ends at `cubic-candidate`:

1. `analytic` regenerates native analytic inverse-hR fixtures from the pinned
   PARI 2.17.4 source/build.
2. `splitting-fixture` checks all four int64 splitting catalogs under CPython,
   JavaScript, GMP, and tagged execution.
3. `splitting-replay` reconstructs the current modular graph through the
   checked private Stage-A dispatcher and replays every exact catalog output.
   The historical Stage-G/H driver remains an artifact-specific optimization
   experiment for its original monolithic lowered IR; its call-fact counts are
   not asserted for the later source-transparent imported-module graph. This
   stage checks four packets, all 7,081 active outputs, and nine malformed
   controls, and retains its unqualified alternating timing receipt.
4. `cubic-collector`, `cubic-driver`, and `cubic-acceptance` regenerate the
   field-1 relation/HNF inputs, unmodified PARI driver trace, and matched
   post-HNF decision.
5. `cubic-candidate` checks the accepted class number 3 and invariants `[3]`
   through CPython, generated JavaScript, and the one-call native path.

The generated-resident cubic has a separate, explicit chain because it is a
different mathematical example, not another backend for the field-1
candidate. `resident-cubic-collector`, `resident-cubic-driver`,
`resident-cubic-acceptance`, and `resident-cubic-input` regenerate field 0 and
retain the `--export-inputs` artifact. `kummer-prepared-nf` regenerates the
prepared number-field rows used by `initial-kummer`; neither stage imports an
old `/tmp` fixture. The four `resident-cubic-{cpython,javascript,gmp,tagged}`
stages then replay the same readable entry and require class number 1, 73
relations, and regulator
`[4510874135066530692003455889568986616389323011914280231659,192,20]`.
This must not be confused with `cubic-candidate`: that field-1 case has class
number 3, invariants `[3]`, and regulator
`[3895441961913051012156655978319959870688113589397982850906,192,17]`.

The mixed-quartic retry is intentionally separate because its packed owners and
native compilation are expensive:

6. `quartic-collector` and `quartic-driver` regenerate the field-2 inputs and
   unmodified PARI retry trace.
7. `quartic-continuation` reconstructs the two appended relation batches. The
   historical checker accidentally embedded its author's scratch PARI checkout;
   the runner asserts that exact single source occurrence and emits an
   attempt-local copy with the explicit `--pari-root`. Both original and
   generated checker hashes are part of the receipt. This is harness path
   parameterization, not a mathematical-source change.
8. `quartic-retry-cpython` retains the independent three-pass source oracle.
   `quartic-retry-javascript`, `quartic-retry-gmp`, and
   `quartic-retry-tagged` replay the same readable Python entry through the
   named generated backend. Native stages run under a 4 GiB address-space limit
   and a 1536 MiB Node heap. Success requires the exact three-pass 150/151/152
   relation trace, class number 1, and accepted terminal state.

The runner does not treat these candidate results as a complete class/unit
group and does not change any production dispatch.

## Commands

Use an empty durable directory (scratch is appropriate because these artifacts
are reproducible and large) and the pinned archive/build:

```bash
node bench/pari-class-group-port/run_phase0_integration_replay.cjs list

node bench/pari-class-group-port/run_phase0_integration_replay.cjs run \
  --artifact-root /scratch/sagejs/pari-class-group-phase0 \
  --pari-root /scratch/sagejs/pari-2.17.4 \
  --pari-archive /scratch/sagejs/pari-2.17.4.tar.gz
```

Resume or select an expensive terminal stage:

```bash
node bench/pari-class-group-port/run_phase0_integration_replay.cjs run \
  --artifact-root /scratch/sagejs/pari-class-group-phase0 \
  --pari-root /scratch/sagejs/pari-2.17.4 \
  --pari-archive /scratch/sagejs/pari-2.17.4.tar.gz \
  --stage quartic-retry-gmp
```

Dependencies are added automatically. `--through STAGE` follows the declared
stage order, while `--stage STAGE` runs only that stage's transitive closure.
Ordinary reruns reuse valid current receipts. To append a fresh attempt after a
deliberate source/toolchain change, name it explicitly:

```bash
... run ... --stage quartic-retry-gmp --force-stage quartic-retry-gmp
```

Verify stored evidence without invoking mathematical code:

```bash
node bench/pari-class-group-port/run_phase0_integration_replay.cjs verify \
  --artifact-root /scratch/sagejs/pari-class-group-phase0
```

The archive must have SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
the extracted `buch2.c` must have SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
New reference receipts may not use a system PARI of another version.

## Scope and caveats

- Native compiler caches remain content-addressed beside their mathematical
  sources, as required by the existing compiler. The receipt hashes the exact
  generated core/addon artifacts reported by each checker; the orchestration
  evidence and every checker-created temporary directory live under the caller
  root.
- Timing emitted by the splitting checker remains unqualified unless the whole
  runner is executed under the designated quiet timing-host protocol.
- The runner requires a clean tracked worktree by default. `--allow-dirty` is
  diagnostic-only and does not make such a receipt review evidence.
- `--force-stage` never deletes or overwrites a prior attempt. Downstream stages
  become stale because dependency receipt hashes change and must likewise be
  rerun explicitly.
