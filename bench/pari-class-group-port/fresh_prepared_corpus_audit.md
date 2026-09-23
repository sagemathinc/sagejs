# Frozen 16-row prepared-only corpus

Status: deterministic development input infrastructure; not a class-group
result, a runtime fixture, or qualification evidence.

The aggregate fresh-prepared gate needs the same input boundary for all sixteen
development rows.  The frozen W0 exports contain that boundary, but also contain
relations, HNF decisions, regulators, class groups, units, and terminal answers.
They therefore must never be opened by a fresh runtime root.

`materialize_fresh_prepared_corpus.cjs` is an offline development tool.  It
authenticates the committed W0 manifest and each source payload, projects the
payload through `normalizePreparedBundle`, independently runs
`authenticatePreparedNf`, and writes a content-addressed mode-0444 JSON file
under `/scratch`.  Only the 22 reviewed normalized prepared-NF keys are written.
The source `events`, result, class, unit, relation, HNF, regulator, retry, and
timing fields are absent.  The extractor is not imported by a mathematical
transaction and its output is created before the runtime boundary.

The compact `fresh-prepared-corpus-manifest.json` pins, for every row:

- panel index and field identity;
- frozen W0 filename, byte count, and SHA-256;
- exact prepared-NF mathematical authority SHA-256; and
- serialized prepared-only byte count and SHA-256.

The corpus covers rows `0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21,
23`.  Before this common extractor, standalone normalized files were already
visible for rows 20, 21, and 23; row 13 and row 14 had larger stage-specific
prepared envelopes, and several transaction checkers projected their row
directly from W0.  Those heterogeneous paths are not used as corpus authority.
The new projection makes all sixteen inputs available in one uniform format and
does not trust or copy any earlier prepared-only file.

Reproduce and verify it with:

```bash
node bench/pari-class-group-port/materialize_fresh_prepared_corpus.cjs \
  /scratch/sagejs-pari-development-panel-a998 \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1
node bench/pari-class-group-port/check_fresh_prepared_corpus.cjs \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1
```

The checker rehashes the compact manifest, every immutable file, and every
mathematical authority.  It requires exactly the normalized key set, so adding
even a plausible answer field fails the aggregate input gate.  Runtime row
transactions may consume the prepared JSON object, but must not consume the
extractor, corpus index, W0 filename, W0 digest, or any other frozen payload.
