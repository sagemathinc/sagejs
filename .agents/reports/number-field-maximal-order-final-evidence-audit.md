# Maximal-order final-evidence harness audit

Date: 2026-08-18  
Lane: `nf-opt-final-evidence`  
Base: `93e6c22f168f13fc825b8173c4b52f3f5dc13a3b`

## Scope

This lane adds measurement and integrity support only. It does not change a
number-field algorithm, native kernel, public API, build registry, package
manifest, or frozen corpus. The expensive final corpus and stress sweeps were
deliberately not launched while optimization source is still changing.

## Audit of the pre-existing profiler

The existing profiler is a strong starting point: it has persistent bounded
adapters, exact rational lattice normalization, an independent containment /
closure / index / discriminant verifier, raw samples, explicit failure states,
and correct implementation-family labels.

The final optimization plan nevertheless exposed these gaps:

| Requirement | Previous state | Risk |
| --- | --- | --- |
| Corrected standard corpus | The checked profiler policy selected 22 cases | A final run could omit most of the 489 standard cases |
| Stress public execution | The historical 16-case report retained structural oracle evidence and explicitly did not execute the current Sage.js lattice | Stress correctness/performance could be claimed without running current source |
| Raw terminal accounting | State counts covered only records that happened to be returned | A missing case/system/boundary row was not distinguished from a zero count |
| Longer diagnostics | Historical reports used an ad hoc separate run | A recovered diagnostic could accidentally replace the raw uniform timeout |
| Cold boundary | `includeCold` retained only the first request per system | It was not case-complete and could not support corpus-wide cold comparisons |
| Native boundary | `native-public` forces the public native algorithm | It includes orchestration and is not direct polynomial/local-component-to-HNF evidence |
| Identity | Commit, host, CPU, Node, and one addon hash were recorded | Tree, relevant source hashes, registry/corpus identity, artifact availability, and host load were not one enforced contract |
| Gate evaluation | A durable receipt described an earlier commit's gates | Final evidence had no reusable evaluator and boundary mismatches could be compared silently |
| Platform closure | A human platform report existed | Exactness/autoload/lifecycle/corruption metadata was not attached to measurement artifacts in a machine-evaluable form |

## Reusable support added

`bench/number-field-maximal-order-final-evidence.cjs` provides:

- `plan`: a no-execution matrix preview;
- `run`: a uniform primary run whose expected matrix is known before execution;
- `cold`: a fresh process for every case/system, with parent exact verification
  required for acceptance but kept outside the cold timer;
- `diagnose`: authenticated reruns of selected raw terminal states, permanently
  labeled non-substituting and linked to the primary payload and row;
- `gates`: machine evaluation with `pass`, `fail`, `partial`, and
  `not-measured` outcomes.

The runner derives every selection from the corrected checked corpus rather
than copying polynomials:

| Selection | Cases |
| --- | ---: |
| `standard` | 489 |
| `stress` | 16 |
| `round4` | 477 |
| `hecke` | 6 |
| `equivalent` | 34 |
| `quick` | 2 |
| `all` | 505 |

The corrected `addprimes-degree-7` authority is checked explicitly: index
`558573`, field discriminant
`-1654803061237150235374988302272`, and canonical lattice digest
`8fb192c7a7e9aade6fef4192eff1ae429b33be25f1a5462924e34e725bc9877b`.

Each final artifact now includes:

- exactly one terminal state for every expected case/system/boundary key;
- missing, duplicate, unexpected, and unknown-state lists;
- accepted independently verified and rejected exactness counts;
- PARI/Sage, Hecke/Oscar, Magma, and Sage.js family labels;
- explicit timing semantics for warm public, dynamic public, forced native
  public, true direct native kernel, cold application, external core, forced
  local algorithms, and parallel/sequential public boundaries;
- commit, tree, worktree status, relevant source hashes, native artifact
  availability/hashes, OS/CPU/runtime identity, and start/end load snapshots;
- a stable JSON payload digest that verifies before and after disk round-trip.

The evaluator intentionally refuses to treat `native-public` as
`native-kernel`. It also refuses to let a bounded diagnostic satisfy a uniform
corpus gate.

## Focused validation performed

- Unit/integrity suite: 9/9 passing.
- `pnpm architecture:check`: passing.
- `pnpm test:baselib:strict`: 126 modules, zero errors.
- `pnpm test:portable`: 276/276 passing after restoring the lane's declared
  content-addressed FLINT dependency/addon cache. The first no-install attempt
  failed six unrelated native-capability tests because the isolated worktree
  had neither the FLINT addon nor headers; no tracked source changed during
  restoration.
- Corpus selection validation: `489 + 16 = 505`, with the additional Round-4,
  Hecke, and equivalent-generator subsets checked.
- One-case GP primary run: `nfbasis` and `nfinit` both independently verified,
  with complete 2/2 accounting.
- One-case cold GP run: exact verified `cold-application` record with complete
  1/1 accounting.
- Forced one-millisecond Sage primary timeout followed by a 30-second
  diagnostic: primary timeout preserved; diagnostic recovered exactly and was
  linked as non-substituting.
- One-case oracle-family probe: Sage 10.9.post1, GP/PARI 2.17.3, Hecke 0.39.21,
  Oscar 1.9.0-DEV, and Magma 2.18-5 all returned the same independently
  verified lattice. The matrix was complete 6/6 with no invalid, timeout,
  crash, unavailable, or unsupported row.

No full standard, stress, Round-4, or platform sweep was run.

## Exact remaining evidence gaps

These gaps require integrated optimized source or other supported hosts and
are deliberately reported rather than filled with proxy measurements:

1. The lane has a dynamic build and a restored FLINT addon for portable
   validation, but not a complete production-native build: FFLAS is absent and
   production-kernel publication was therefore skipped. It is also pinned to
   the pre-optimization base. Sage.js primary, stress, and performance evidence
   must start only after the integration source and production registry are
   stable and freshly built.
2. The current profiler produces `native-public`, not the plan's true direct
   polynomial/local-component-to-HNF `native-kernel` record. Consequently the
   0.25 ms microkernel and direct PARI/Hecke ratio gates remain
   `not-measured` until an algorithm lane exposes that exact boundary.
3. The checked corpus contains 34 frozen equivalent-generator cases, but no
   final randomized seed schedule. The evaluator marks this gate `partial`
   even when all frozen transformations pass.
4. There is no final record producer for forced `round2-local`,
   `round4-local`, and `om-local` overlap on one input. The evaluator can
   compare their canonical digests once those records exist.
5. There is no final record producer for `sequential-public` versus
   `parallel-public`, including scheduler decision, cancellation, and peak
   memory metadata.
6. OM automatic selection needs an explicit input-derived selection record
   (`algorithm_selection.selected = "om"`) before the evaluator can pass it.
7. Linux arm64, macOS arm64, and native Windows x64 must attach focused
   exactness, production autoload, resource lifecycle, and corruption metadata.
   Only the current Linux x64 host was used for the focused harness checks.
8. AddressSanitizer, UndefinedBehaviorSanitizer, leak/lifecycle stress, and
   source-currentness receipts remain owned by the native/platform lanes.

All configured external oracle executables and projects are currently present
and passed the one-case exact probe. Magma remains optional and opt-in, as
required by the plan.

## Commands for the stable-source phase

Preview without running:

```sh
node bench/number-field-maximal-order-final-evidence.cjs plan \
  --selection standard --systems sagejs
```

Primary corrected-corpus and stress runs:

```sh
node bench/number-field-maximal-order-final-evidence.cjs run \
  --selection standard --systems sagejs --samples 1 --warmups 0 \
  --timeout-ms 5000 --output STANDARD.json --markdown STANDARD.md

node bench/number-field-maximal-order-final-evidence.cjs run \
  --selection stress --systems sagejs --samples 1 --warmups 0 \
  --timeout-ms 300000 --output STRESS.json --markdown STRESS.md
```

Non-substituting timeout diagnostics:

```sh
node bench/number-field-maximal-order-final-evidence.cjs diagnose \
  --primary STANDARD.json --timeout-ms 30000 \
  --output DIAGNOSTIC.json --markdown DIAGNOSTIC.md
```

Final gate evaluation (after direct-kernel, oracle, scheduler, and platform
reports are also present):

```sh
node bench/number-field-maximal-order-final-evidence.cjs gates \
  --reports STANDARD.json,STRESS.json,OTHER-REPORTS.json \
  --reference-host linux-x64@HOST \
  --output GATES.json --markdown GATES.md
```
