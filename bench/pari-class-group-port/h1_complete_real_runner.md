# Real matched diagnostic for the complete prepared H1 root

This runner compares the genuine unified Sage.js H1 native root with PARI
2.17.4 `bnfinit0(nf, 0)` at the prepared-`nfinit` boundary. It is deliberately
an **unqualified development-host diagnostic**, not a final timing receipt.

## Boundaries

- Sage.js calls `pari_unified_complete_h1_root`, the 564-argument native graph
  that computes the accepted candidate, exact class witness, precision-retrying
  unit reconstruction, regulator, torsion, and atomic final publication.
- PARI uses the pinned 2.17.4 archive and executes complete
  `bnfinit0(nf, 0)` after `nfinit` has completed in the helper process.
- Both adapters authenticate successful terminal publication and replay before
  returning a common mathematical projection: field identity, trivial class
  group, unit rank two, torsion order and generator, regulator presence,
  assumptions, and non-public completion status.
- The native root deliberately leaves its replay field pending. The Sage.js
  adapter runs a second independent owner graph and compares the full terminal
  authority before it promotes only the diagnostic projection to
  correspondence-complete. Native publication alone is not treated as replay.
- PARI's flag-zero result and Sage.js's internal result retain different unit,
  floating, RNG, and work representations. The matched digest intentionally
  covers only their common projection. Each adapter validates its richer
  source-specific state before projection. The RNG digest records only the
  common seed and explicitly says that terminal states were not compared.

The unified Sage.js root currently has no in-call timing hooks. Both roots are
therefore charged entirely to `unattributed-remainder`. This keeps timing
segments mutually exclusive and conservative; it does not manufacture stage
attribution. A later instrumented native ABI can replace this residual after a
separate equivalence audit.

## Input prerequisite

The input is the 351-owner sanitized prepared state emitted by
`check_resident_generated_class_attempt.cjs`, not an answer-bearing final
fixture. This frozen owner graph authenticates the seed-1 stream, so the runner
rejects other seed labels. Generate it using the same prepared, analytic, and Kummer fixtures as
the unified-root checker, then pass the emitted `inputs.json` path:

```text
node bench/pari-class-group-port/run_h1_complete_matched_diagnostic.cjs \
  --input /tmp/sagejs-resident-generated-class-.../inputs.json \
  --pairs 7 --seed 1 --output /tmp/h1-real-matched.json

node bench/pari-class-group-port/check_h1_complete_real_runner.cjs \
  /tmp/h1-real-matched.json
```

The machine must provide the pinned pristine PARI 2.17.4 tree and archive at
`/home/user/upstream/pari-2.17.4` and
`/home/user/upstream/pari-2.17.4.tar.gz`, or the corresponding
`SAGEJS_PARI_ROOT` and `SAGEJS_PARI_ARCHIVE` paths. Their archive and
`buch2.c` hashes are checked before execution. Native FLINT/MPC dependencies
and the Sage.js compiler must already be built.

The runner performs at least seven alternating AB/BA pairs. Every receipt sets
`diagnosticOnly=true`, `qualifiedTiming=false`, and `finalTimingRun=false`.
Do not promote it as a quiet-host or cross-machine performance result.
