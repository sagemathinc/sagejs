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

Coordinator inspection of the actual `cap-rescue-v2` originals found older
supervisor (`8673c74e…`) and shared validator (`daf64e…`) source identities,
different from the later precision/batching harness (`e7d6c4b…`, `e9ff8aa…`).
Running those rescues with the newer harness would correctly fail this tool's
strict provenance check. Deploy the exact pinned original harness, after
confirming it supports the declared cap, or predeclare and independently review
a separate harness-change policy before execution. This tool does not authorize
or implement that exception; do not quietly edit old receipts or policies.

Offline tests: `python3 -m unittest discover -s
bench/class-unit-groups/general-frontier/reference/attempts -p 'test_*.py'`.
