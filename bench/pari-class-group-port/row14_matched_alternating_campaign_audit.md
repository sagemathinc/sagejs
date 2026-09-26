# Row 14 authentic alternating timing coordinator

This narrow coordinator turns the already proved resident row-14 Sage.js and
pristine PARI 2.17.4 boundaries into one executable ABBA/BAAB campaign. It does
not run the expensive series merely by being tested.

The production entry point requires exactly 11 pairs (22 fresh computations
per implementation), a Linux process whose allowed CPU set contains exactly
the declared `SAGEJS_TIMING_CPU`, `--expose-gc`, a clean tracked Git tree, and
one-second minimum duration for every admitted arm. Native graphs, prepared
input authentication, and the private PARI helper are established before the
schedule begins. Each Sage.js arm invokes the complete resident computation
again; each PARI arm resets its stack and seed and invokes `bnfinit0(nf,0)`
again. Garbage collection between arms is outside both mathematical clocks.

Every Sage.js arm also fails closed unless Gate C reports four resident native
handles, zero compilation inside the run, and the same four authenticated cache
keys established before the campaign clock. This closes the compile-inside-
clock defect found in the earlier single-run adapter rather than merely
declaring compilation excluded in receipt metadata.

Every Sage result is admitted with the existing strong correspondence check:
both generator-ideal HNFs and the regulator, torsion, work shape, and terminal
RNG state are exact, while all six log embeddings must agree by at least 96
bits. Every PARI sample must have an identical full semantic digest. Only
compact hashes and raw durations enter the final receipt. The receipt labels
the one-field prepared boundary qualified but explicitly leaves the complete
24-field panel unqualified. The machine-readable contract is
[`row14-matched-alternating-campaign-receipt.schema.json`](row14-matched-alternating-campaign-receipt.schema.json).

The runner refuses to overwrite evidence and only writes under `/scratch`:

```bash
SAGEJS_TIMING_CPU=CPU taskset -c CPU \
  prlimit --as=$((4*1024*1024*1024)) --rss=$((4*1024*1024*1024)) \
    --cpu=7200 -- \
  node --expose-gc \
    bench/pari-class-group-port/run_row14_matched_alternating_campaign.cjs \
    /scratch/sagejs-runtime/row14-matched-campaign/receipt.json
```

The long series should run only after the resident host's compile-inside-clock
audit is green and on the selected quiet timing authority. The focused checker
exercises schedule, affinity-record, duration, freshness, correspondence, and
summary mutation rejection without launching any mathematical worker.
