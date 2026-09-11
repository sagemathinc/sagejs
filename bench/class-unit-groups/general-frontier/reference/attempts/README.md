# Offline cap-rescue reconciliation

`reconcile.py` consumes original PARI/Hecke persistent raw directories, the
directory emitted by `runner/prepare-cap-rescue.py`, and exactly one designated
retry raw directory per nonempty engine selection. It launches no processes,
performs no CAS work, and grants no execution authority.

```sh
python3 bench/class-unit-groups/general-frontier/reference/attempts/reconcile.py \
  --pari-original ORIGINAL_PARI --hecke-original ORIGINAL_HECKE \
  --policy-directory PREDECLARED_POLICY \
  --pari-retry DESIGNATED_PARI_RETRY --hecke-retry DESIGNATED_HECKE_RETRY \
  --output NEW_REPORT.json
```

Omit an engine's retry option only when its policy selection is empty. Output
must be new and outside all input directories. Keep every raw directory and
the policy permanently; the report hashes every raw JSON file, including
startup/warmup/error receipts. No original receipt is modified.

The existing reviewer and pairer revalidate raw outcomes. The policy must equal
the recomputed original pair and selector result, including producer hashes.
Policy input bytes must match the retry run's input hash; ordered polynomials
must match exactly. Runtime/source provenance must remain identical except for
the input hash. Host, CPU2, 4GiB, no swap, one thread, GRH policy, 200 bits,
one iteration, sample1 and seed1 remain fixed. Cgroup path changes are allowed.
Only selected original 60-second timeouts are replaced by their designated
600-second outcome, including errors/timeouts. Incomplete or interrupted runs,
extra/duplicate outcomes and changed inputs fail closed. There is no directory
search, adaptive retry or fastest-of-many selection.

The output uses the ordinary paired-discovery schema. Effective engine reviews
are explicitly marked synthetic where replaced; their baseline run hashes do
not assert that retry rows came from the original run. `attempt_reconciliation`
retains the original paired report, all retry reviews, per-row attempt history,
raw file hashes and policy hashes. Consumers must retain this provenance.

This is screening, not qualification or independent mathematical replay.
Exact-summary disagreement remains disagreement. PARI regulator approximations
and Hecke absolute enclosures remain distinct guarantees. Timings remain single
samples with possible JIT; no JIT subtraction or timeout-as-worker-time occurs.
The tool authenticates neither historical policy creation time nor machine
attestation: trusted pre-execution custody and the original supervisor's budget
ledger remain external obligations. Unknown producer revisions fail closed;
there is no compatibility normalization of earlier policies.

The actual `cap-rescue-v2` policy pins **different execution harnesses for the
two engines**. Its exact policy-file SHA256 is
`fbbf94e50ca6bed7ae7000711eb553df355992b333836df288339671cf94d025`.
Read each engine's `paired_report.<engine>_review.provenance.sha256`, not the
review's top-level `validator_sha256` or `shared_validator_sha256`: those latter
hashes identify offline review code, not the original executed harness.

| Engine | Executed supervisor SHA256 | Executed shared runner SHA256 |
| --- | --- | --- |
| PARI | `8673c74e009dea0f3ef1c69d3d75e41fc9b9286150191726a880859057ac10bb` | `daf64e8199d4f6d0801bdbbfb48030e74d7c0d30858fd281765e5298fe93bd30` |
| Hecke | `e7d6c4b102437b521050ed340d3e7f44ca8a0d907790ed4906bfe797651095bc` | `e9ff8aa09f1accf4e8d4ae4ddc598685e7fa847696bf8f9fc97448114d103911` |

PARI's eight designated rescues require its older harness; Hecke's five require
its newer precision/batching harness. All other per-engine runtime/source hashes
must also match. Deploying either engine with the other engine's harness would
correctly fail this tool's strict provenance check. The earlier wording that
described both originals as using the older harness was incorrect.

An aborted infrastructure-misconfigured run is not accepted as an ordinary
designated rescue by this tool. Preserve its raw receipts, interruption and
budget reservation/charge history. Any replacement requires a separate,
pre-execution infrastructure-correction policy naming exactly one fresh attempt
and retaining the aborted run; it must not edit the original policy, select the
fastest outcome, or imply that the current reconciler supports this extra attempt
history. No such exception is implemented by `reconcile.py`.

## Separate fixed-incident custody envelope

`mislaunch.py` is an additive validator for this exact incident, not a generic
retry facility. It pins the original policy hash above, requires the five
unchanged ordered Hecke inputs, and verifies that the aborted run differs from
Hecke's expected execution provenance only by using PARI's two harness files.
It retains every raw receipt hash, including the completed first sample and
interrupted second sample. Neither can supply eligible timings or invariants.
The before/after ledger must clear the matching interruption and add the full
610-second reservation without refunds or unrelated ledger edits. Prior charges
for completed work remain in the before-ledger; this tool does not independently
reconstruct their full accounting history.

```sh
python3 bench/class-unit-groups/general-frontier/reference/attempts/mislaunch.py plan \
  --policy-directory ORIGINAL_CAP_RESCUE_V2 \
  --aborted-directory persistent-hecke-cap-rescue-v2-attempt-1 \
  --ledger-before BEFORE.json --ledger-after AFTER.json --correction NEW.json
```

Use `check` with the same arguments to verify that an existing correction equals
the retained evidence. `plan` creates only a new JSON file, never launches a
worker and never edits either ledger or the original policy. The envelope names
only `persistent-hecke-cap-rescue-v2-attempt-2`, requiring all five fields again
under the original modern Hecke provenance at 600 seconds, 200 bits, one sample
and one iteration. Coordinator approval and evidence that the old process has
exited must precede that execution; hashes do not authenticate chronology.

The envelope does **not** reconcile or promote the fresh attempt. Once the
designated execution has finished, the separate `join` command rechecks its
approved byte hash and unchanged custody, requires the exact fresh directory
name/provenance/ordered inputs, then calls the unchanged strict reconciler.
The ordinary paired-discovery result retains strict original/retry histories
and additionally embeds the complete excluded-abort envelope, exact raw JSON
receipt texts and both ledger texts. Aborted answers never enter pairing.

Use the same five custody arguments shown above, with `join` instead of `plan`,
and add:

```sh
  --correction-sha256 APPROVED_PREDECLARATION_BYTE_SHA256 \
  --pari-original ORIGINAL_PARI_DIRECTORY \
  --hecke-original ORIGINAL_HECKE_DIRECTORY \
  --pari-retry COMPLETED_DESIGNATED_PARI_RETRY_DIRECTORY \
  --hecke-retry /custody/persistent-hecke-cap-rescue-v2-attempt-2 \
  --output /custody/paired-cap-rescue-with-excluded-incident.json
```

Output is exclusive-create and must be outside the source directories. The
caller must supply the hash retained at approval, not compute a new approval
from modified evidence. This remains discovery only, not qualification or
independent replay. Offline checks do not authenticate approval chronology or
process exit. The strict paired report alone still omits mislaunch custody;
only this additive join carries that history. Keep all original files as well.

Offline tests: `python3 -m unittest discover -s
bench/class-unit-groups/general-frontier/reference/attempts -p 'test_*.py'`.
