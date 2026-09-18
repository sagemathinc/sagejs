# Phase 6 final-report audit

This began as a read-only audit of
`report_class_unit_qualification.cjs`, its receipt validator/schema, the frozen
manifest, and the plan's predeclared Outcomes A--D.  It did not run timings or
open reserves.  The five fail-open conditions found below are now covered by a
separate promotion layer and adversarial regression tests.  Acquisition remains
disabled and unqualified.

The current GM, nearest-rank p95, seconds-scale count, rank-two-stratum count,
and fixed denominator computations are internally consistent with the plan:

- GM and p95 use only completed matched flag-zero prepared-kernel fields.
- Coverage always reports against 24 fields.
- A requires 24 completed fields, GM at most 2, and p95 at most 5.
- B requires at least 16 completed fields, both rank-two strata, at least four
  fresh PARI per-call costs strictly above one second, and GM at most 3.
- Failed full-population receipts do not receive favorable timing imputation.

The audit found five fail-open or completeness conditions in the original
reporter.

## 1. `qualifiedTiming` is a self-asserted boolean

`aggregateReceipts` asks `validateReceipt` to require
`qualifiedTiming === true`, but neither function proves that final execution and
reserve opening were enabled.  The currently frozen manifest says both are
false.  A synthetic receipt can flip one boolean and qualify.  Moreover, the
reporter does not require a common candidate commit, common artifact set,
common host, or unique run IDs across the 24 fields, despite the plan requiring
one frozen candidate and one quiet host.

This is not a criticism of synthetic test helpers; the counterexample uses them
only to show exactly what the public validator accepts.  Qualification needs a
non-self-authenticating campaign authority (or a frozen campaign declaration)
that binds the enabled manifest, candidate commit, artifacts, host, schedule,
and unique field journals.

## 2. `--allow-partial` can publish Outcome B

With `requireFullPopulation=false`, all 16 development receipts produce Outcome
B while the eight reserve fields have status `not_run`.  The plan explicitly
requires every other frozen field to have a precise diagnosis.  Partial reports
may be useful, but their outcome must remain provisional/unqualified (or at
most C if independently established); they must not return A or B.

## 3. Outcome C attribution is not derived from stage controls

The reporter trusts `summary.attributedGapFraction` on the prepared-kernel
receipt.  No diagnostic receipt, mutually exclusive stage clocks, inclusive
root, residual calculation, or link to the same run is required.  One complete
field with the scalar `0.8` therefore produces Outcome C with no stage evidence
at all.

The final reporter must derive attribution from authenticated diagnostic data:
the same candidate/artifacts/field/work boundary, at least seven alternating
pairs, mutually exclusive leaves, inclusive root, explicit residual, and a
defined numerator and denominator.  A caller-provided summary number is not
evidence.

The current aggregation also takes the minimum of every non-null attribution
value while silently skipping nulls.  The plan does not define this cross-field
aggregation.  It should instead define which correspondence-complete path is
the C witness and derive that path's attribution, or explicitly define an
aggregate statistic before observing results.

## 4. Failure diagnoses may omit the first divergence

The prose contract says every incomplete case records a first divergence,
failure taxonomy, and nonempty diagnosis.  The schema permits a null first
divergence, and semantic validation requires only the class and detail.  Eight
such failures still allow Outcome B.  Failure receipts should require a
nonempty first divergence unless a narrowly enumerated infrastructure condition
makes it unknowable; that exception itself needs an explicit reason.

## 5. The final report drops mandatory raw and resource evidence

Phase 6 requires publication of medians, spread, every raw paired value, peak
RSS, generated-source/object size, compilation time, allocation/copy/owner
counts, precision/retry counts, and exact work counters.  The JSON and Markdown
reports retain only per-field slowdown, reference time, attribution, and failure
summary.  They drop blocks, raw arms, RSS, counters, resource counters, and
provenance.  The receipt schema itself has no required generated/object sizes or
compilation metrics.  The report also has no journal path or journal digest, so
its `runId` cannot locate or authenticate the omitted evidence (and duplicate
run IDs are currently accepted).

The headline summary can remain compact, but the final artifact needs a stable,
authenticated evidence index plus the mandatory raw/resource tables.  It must
also include or link the separate compact flag-one series and the diagnostic
boundary series required by the plan.

## Reproduction

```sh
node bench/pari-class-group-port/phase6_final_report_audit_counterexamples.cjs
```

The program now exits successfully only when all five attacks fail closed.  Its
output is explicitly `qualifiedTiming: false` and it does not read any reserve
input.

## Hardening implemented

1. `class-unit-qualification-campaign-index.schema.json` defines a complete
   24-field, content-addressed campaign index.  Its authority digest is pinned
   by the enabled frozen manifest, avoiding self-asserted promotion.  The index
   binds one candidate commit, panel/manifest, host, toolchain, Sage.js
   artifacts, PARI artifacts, every raw journal, and campaign resource metrics.
2. Promotion fails unless the manifest explicitly enables both execution and
   reserve opening and pins `qualificationCampaignAuthoritySha256`.  All 24
   flag-zero journals must exist, hash correctly, validate as qualified, use
   unique run IDs/paths, and match the exact frozen population and common
   identity.
3. Loose or partial receipts still produce useful metrics and a clearly named
   `thresholdOutcome`, but their final `outcome` is always D.  A/B/C requires a
   campaign object created by the private validator capability.
4. C uses the best explicitly identified correspondence-complete stage witness,
   not a prepared-receipt scalar.  Its fraction is derived from at least seven
   alternating raw pairs.  Four named signed gaps plus the explicit residual
   must equal each inclusive root; the campaign reports the raw witness and
   numerator/denominator.
5. Every incomplete field must have a nonempty first divergence and detail.
6. The report retains every raw block/arm, provenance, peak RSS, work/resource
   counters, per-field paired slowdown samples/spread, journal path/hash, and
   the compact flag-one and stage-diagnostic artifacts.  The campaign index
   requires generated/object bytes, compilation time/RSS, owner live bytes and
   count, process RSS, allocations, copies, precision escalations, and retries.
7. `test/pari-class-group-final-report-hardening.cjs` exercises a valid
   authenticated A and C plus each adversarial condition.  The original
   qualification tests now distinguish numerical threshold classification from
   evidence-qualified promotion.

The current checked-in manifest intentionally remains disabled and has no
campaign-authority pin, so no real A/B/C result can be published until the
candidate is frozen and the reserve gate is deliberately opened.  This is a
fail-closed readiness mechanism, not fabricated qualification evidence.
