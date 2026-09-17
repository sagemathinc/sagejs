# Unified H1 diagnostic stages

This diagnostic contract measures the unified Sage.js H1 computation as one
inclusive root partitioned into five mutually exclusive buckets:

1. relation collection and precision retry;
2. sparse HNF, Smith reduction, and transform construction;
3. unit reconstruction and regulator work;
4. honesty, ideal-generator replay, and final immutable publication;
5. an explicit unattributed remainder.

`runUnifiedH1Diagnostic` accepts four actual operation callbacks. It enters a
named timer immediately before invoking each callback and returns to the
residual bucket immediately afterward. Named stages cannot nest, overlap,
repeat, or execute out of source order. Preparation, callback transitions,
validation, and any work without a reviewed hook therefore remain residual.
The result is diagnostic evidence only: both `qualifiedTiming` and
`finalTimingRun` are permanently false.

Each operation must return its result together with monotonically counted work
from a stage-specific vocabulary. Counter names belong to exactly one stage.
The validator independently reconstructs every duration and counter total,
checks that segments cover the inclusive root without gaps or overlap, and
checks that the four named totals plus the residual equal the root exactly.
Counters do not create timing attribution; they only make a claimed boundary
auditable against the operation's work receipt.

PARI 2.17.4 remains deliberately different. Public `bnfinit` exposes no
reviewed relation/HNF/unit/final hooks. `runPariWholeRootDiagnostic` therefore
times one complete operation entirely as residual, publishes no named-stage
records, and publishes zero diagnostic counters. Splitting that root based on
call-stack sampling or guessed percentages would fabricate attribution.

This component does not yet splice callbacks into the monolithic compiled
`pari_unified_live_h1_root`. A consumer may use it only where the same unified
computation is already orchestrated through the four real stage boundaries.
If a future compiler lowers the entire root into one call, it must add audited
source-boundary hooks before reusing the named-stage mode; until then that call
must use residual-only timing just like PARI.

Run the focused conservation and falsification checks with:

```sh
node bench/pari-class-group-port/check_h1_unified_diagnostic_stages.cjs
```
