# Retained fresh-reference repeat report

`review-repeats.py` is an offline sampling adjudicator, not a dispatcher,
certificate checker, or replacement for the historical discovery pairer.
It calls the existing persistent normalizer, which validates every retained
batch member. Singleton v3 requests retain their complete compact payload;
multi-iteration requests require v4 whole-batch output. Every accepted member
is included once in the report's `samples[].row.iteration_outputs`.

## Inputs and custody

Before dispatch, freeze a JSON plan with schema
`sagejs.reference-repeat-plan.v1`, `controls`, and `runs`.
Each run has a unique `id`, a predeclared `timing_class` (`tiny` or `seconds`),
and a `request` containing exactly these existing supervisor run fields:

```
engine, bits, iterations, samples, seed, requested_proof_policy,
records, provenance
```

Use the same concrete values that will appear in `run.json`: engine `pari` or
`hecke`, bits 100 or 200, iterations 1–10000, samples 1–5, seed 1, validated
proof policy, frozen label/coefficient records, and the pinned single-thread
provenance including source/runtime SHA-256 values. Both engines and both
precisions must be declared for every field/policy, without duplicate cells.
Iteration counts may differ between engines; the whole request is bound.
`controls` is the exact expected receipt controls object, including hostname,
affinity `[2]`, memory maximum 4294967296, and swap maximum 0.

After execution, create a separate custody JSON:

```json
{
  "schema": "sagejs.reference-repeat-custody.v1",
  "plan_sha256": "SHA256_OF_THE_PREDECLARED_PLAN_BYTES",
  "runs": {
    "DECLARED_RUN_ID": {
      "directory": "relative/path/to/immutable/receipts",
      "run_sha256": "SHA256_OF_THE_ACTUAL_RUN_JSON"
    }
  }
}
```

Directories are relative to the custody file. Missing runs may be omitted;
they remain in the declared denominator. Source receipts are never changed.
Run hashes are necessarily postexecution custody, **not** predeclaration.
The coordinator must establish plan chronology and authenticated custody
externally. This tool sets `predeclaration_chronology_authenticated=false`.

```
python3 -B bench/class-unit-groups/general-frontier/reference/runner/review-repeats.py \
  frozen-plan.json custody.json new-report.json
```

Output is exclusive-create. Every run retains a JSON-file path/hash inventory;
malformed runs are rejected as a whole and every expected sample stays in the
denominator. Raw evidence remains authoritative, including malformed payloads.
Missing samples, failures, wrong controls, altered request identities,
insufficient declared samples, and inadequate tiny durations remain visible.

## What eligibility means

Tiny batches require at least one second of worker time. Seconds-scale runs
require at least three declared fresh sample requests; complete pair eligibility
also requires every declared sample to succeed. Classification comes from the
frozen plan, never from an outcome-based reclassification. Supervisor wall time
includes IPC and validation and cannot satisfy the mathematical-work threshold.
Worker and outer times remain separate, with no residual-JIT subtraction.
Per-engine worker-per-field sample times are reported; a median is emitted only
when all declared samples for that engine/field/precision/policy are eligible.
No successful-only median hides a failed or missing sample.

Unique sample identities and pinned fresh-request boundaries reject accidental
receipt reuse. They are not proof of absent internal caches or independent
random streams. Warmups remain recorded but this report does not authenticate
warm-JIT qualification. It does not wait for independent mathematical replay
before allowing useful sampling reports; replay is a separate admission gate.

`complete_eligible_exact_summary_pair` means that all declared samples are
eligible and the class number, canonical invariant factors, discriminant,
signature and torsion order agree across every retained member. It does **not**
prove the exact witnesses, maps, unit completeness, or regulator correctness.
Fundamental units themselves need not be identical between engines.

PARI's regulator remains a working-precision approximation; Hecke's is an
enclosure. Both 100/200 requests are recorded without pretending those numerical
guarantees coincide. No minimum is labelled a matched certified-regulator cost.
Qualification, independent replay, regulator equivalence, and warm-JIT
qualification flags remain false. This report alone does not pass M0.
