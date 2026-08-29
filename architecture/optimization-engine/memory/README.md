# Optimization memory

This directory contains the concise, checked part of the version-two
optimization ledger. `campaign-1-arrow.json` anchors the frozen version-one
receipt without pretending that it is a version-two promotion. Its exact
mechanism key, source-region lineage, evidence digest, producer command, epoch,
revision, fallback, and regression state remain queryable.

The canonical authority is sorted NDJSON. SQLite is only a derived indexed
view and must reproduce the same logical digest. Build both release assets with:

```sh
node scripts/optimization-memory.cjs build \
  --input=architecture/optimization-engine/memory \
  --output=/scratch/sagejs-optimization-memory
```

`current-context.json` is the frozen Campaign 1 context used to validate the
historical anchor; it is not an assertion that the old epoch is the current
checkout. `current-memory.json` therefore keeps the accepted result visible as
`historical` and nonactionable. A new epoch supplies its own source-closure,
workload, and subject-lineage context. Git commit and tree fields are retained
for diagnosis but are never used to infer compatibility.

Generate or enforce a report with:

```sh
node scripts/optimization-memory.cjs report \
  --input=architecture/optimization-engine/memory \
  --context=architecture/optimization-engine/memory/current-context.json \
  --repository-root=.

node scripts/optimization-memory.cjs check \
  --input=architecture/optimization-engine/memory \
  --context=architecture/optimization-engine/memory/current-context.json \
  --repository-root=.
```

The `check` command fails for actionable accepted results when their subject,
fallback, or nonregression guarantee disappears. Historical records and stale
negative experiments remain visible to queries but cannot authorize a change.
