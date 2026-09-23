# Rust class-group qualification contracts

These Draft 2020-12 schemas freeze the machine-readable R0 boundaries for the
Rust class-group qualification campaign:

- `neutral-input.schema.json` admits a public polynomial or independently
  certified neutral prepared-field data. Its closed shape cannot carry class
  numbers, relations, retry schedules, or other answer-bearing oracle data.
- `result-evidence.schema.json` keeps a relation-lattice **candidate**, an
  **upstream-assumed correspondence**, and a **publicly complete** result as
  disjoint claims. Only the last can assert public completeness, and it must
  bind completion, generator/map, unit, and independent replay evidence.
- `benchmark-receipt.schema.json` names one of the algorithm-stage,
  prepared-field, or public-call timing boundaries. Qualified timings require
  matched publicly complete work, a clean repository, a quiet host, at least
  15 raw samples per implementation, and no omitted failures.
- `corpus-manifest.schema.json` freezes the 60 development and 60 held-out
  qualification cases, degree-7/8 extension panel, reproducible random panel,
  small exhaustive panels, PARI 2.17.4 identity, and holdout rules.
- `capability-status.schema.json` records each concrete native or browser route,
  proof-mode fallback, arithmetic route, public outputs, qualification gates,
  artifact, receipts, and limitations. A browser route cannot become qualified
  unless W0, lifecycle, payload, and all shared product gates pass.
- `common.schema.json` contains only shared scalar and record definitions.

Every object is closed with `additionalProperties: false`; arbitrary-size
integers, byte counts, and nanosecond values use canonical decimal strings.
The schemas deliberately leave mathematical identities that JSON Schema cannot
express (for example polynomial length versus degree, signature equations,
class-number products, exact 60/60 role counts, and content-ID recomputation)
to the R0 semantic validator. Passing JSON Schema validation alone is never a
correctness or qualification claim.

Schemas use relative references to `common.schema.json`, so validators should
load all six files into one registry before compiling a document schema.

Run the durable strict-compilation and counterfeit suite from the repository
root:

```sh
node bench/pari-class-group-rust/qualification/schemas/schema-contracts.test.cjs
```
