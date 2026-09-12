# Frozen complex-cubic baseline: f7f00552

The 1,000-field correctness census passes completely, but this retained run
does **not** demonstrate PARI parity. The next selected slow field remains
`3.1.12716.2`. These measurements precede resumable collection and staged
certification; they must not be attributed to those changes.

## Result and boundary

Source: `f7f00552dd4178993ceef4522cc2897622cdf2c6`. Timing completed
2026-09-05 at 06:40:27 UTC on the dedicated `opt` VM: Linux x64,
AMD EPYC 7B13, four logical CPUs, 16 GB RAM, Node 26.7.0, PARI/GP 2.17.4.
Each retained process was pinned to CPU 0 with numerical-library thread
counts set to one. No timing processes overlapped.

Every ratio below is Sage.js time divided by PARI time; smaller is better.

| Boundary | Paired-shard geometric mean | Cluster-bootstrap 95% interval | Median corpus time: Sage.js / PARI |
| --- | ---: | ---: | ---: |
| Scalar prepared | 5.15504 | 4.53037–5.88890 | 7.22803 s / 1.27741 s |
| Fresh complete | 14.3330 | 13.9253–14.7487 | 24.7287 s / 1.69928 s |

Each boundary has 220 paired shard observations: 11 retained rounds of
20 fixed shards of 50 fields. Calibration is discarded; every retained
contiguous root lasts at least 1.2 seconds. Systems alternate their order
across fresh-process rounds. Twelve separate control fields warm each timing
process; they do not contribute to the reported population. The corpus
totals are sums of measured shard roots divided by repetition counts, not
phase sums. Their medians are not the same statistic as paired-shard ratios.
No paired shard was at or below PARI time in either boundary.

Prepared Sage.js timing starts after fresh isomorphic field and maximal-order
construction and measures `K.class_number(proof=False)`. Prepared PARI starts
after `nfinit(P)` and measures `bnfinit(nf,0)`. Fresh complete includes
polynomial/field/maximal-order construction on the Sage.js side and
`bnfinit(P,0)` on the PARI side. It does not include process launch or import
time. PARI computes a superset of the scalar answer, so these are deliberately
one-sided comparisons, not claims of identical output workloads.

The earlier `cf1307be` run reported 5.32736 and 14.5833 for the same two
aggregate ratios. The new point estimates are modestly lower, but these
sequential campaigns are not an interleaved old/new experiment and do not
establish a statistically significant speedup.

## Correctness and provenance

All 1,000 fields have exact agreement of discriminants, class numbers, and
class-group invariant factors with direct PARI and the frozen LMFDB data.
Every Sage.js observation records an authenticated native mathematical
receipt and successful independent ordinary-object exact replay bypassing
the closed cubic authority. There are no declines, disagreements, failed
certificates, or timeouts in this census.

The requested proof contract is conditional GRH: Sage.js `proof=False` and
PARI `bnfinit(P,0)`, without `bnfcertify`. LMFDB oracle records have
`used_grh=false`. Individual Sage.js receipts retain their actual assumptions;
some trivial-class-group certificates are stronger than the requested
conditional contract. On the selected nontrivial field, the assumptions are
GRH for the nontrivial ideal-class-character $L$-functions and for
$\zeta_K$ and $\zeta_{\mathbb Q}$, as recorded explicitly in the receipt.

Census and timing carry exactly equal source, corpus, and tool identities.
The build receipt reports clean source and matching required inputs/outputs.
The two full-survey runtime warmup passes reproduce the expected observations
and bind the same full runtime closure. Distinguish these two hashes:

- Full candidate runtime closure:
  `94b0de42e0bc8cf44eaecf6a179b2127fc27e903ff0ee4f25985d566a0d65dee`.
- Direct process environment closure:
  `eb902eabc2b696cbeb19f31e4ff135964ad8a10d3f7102433ac574abc04ede9b`.
  Direct-process records use this narrower identity in their
  `runtime_closure_sha256` field.

The launch policy is `auto`, meaning per-function qualified selection.
The mathematical receipts do not contain per-call backend telemetry.
Inspection of the exact retained generated adapter establishes that
`backend_certified_complex_cubic_class_group_v1` selects **fmpz** under this
native-required automatic policy. Its native namespace is `ed1377dd9d9e3720…`
in the production pack with SHA-256 `24ffe9f0ec06a8043230399283fce200487b5fcb0f5e878d0bb556297649785e`.
The generated adapter and native index are published alongside the raw
measurements to make this inference inspectable. They are not executed by the
evidence verifier. These public-call timings are not direct-core timings and
must not be substituted for earlier approximately 4.07 ms core diagnostics.

## Selected regime

The unchanged selector takes the least absolute discriminant with either a
native decline or a stable prepared slowdown (all 11 round diagnostics
available, median ratio at least three, slower in at least nine rounds).
Ties use the exactly derived equation-order index, then class number and
label. Recomputing that selector gives:

$$
K=\mathbb Q[a]/(a^3-a^2-11a-63),\qquad
D_K=-12716,\qquad \operatorname{Cl}(K)\cong C_3.
$$

The displayed generator has equation-order index $3$, since
$\operatorname{disc}(f)=-114444=3^2D_K$. LMFDB's separately named field
index is $1$; it is not the index of the displayed generator. The receipt
uses eight factor-base ideals, effort five, fifteen published compact
relations, and analytic threshold 997. The fifteen rows are the compact
published transcript, not a count of all candidate proposals or raw relations.

The selected field's per-round diagnostics are below, in milliseconds.
They locate a bottleneck; the retained contiguous shard roots above remain
the timing authority. In particular, GP's millisecond clock is averaged over
repetitions here, and these values are not eleven independent standalone
microbenchmarks of this field.

| Round | Prepared Sage.js | Prepared PARI | Ratio | Fresh Sage.js | Fresh PARI | Ratio |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 4.542400 | 0.781250 | 5.81427 | 20.221824 | 1.343750 | 15.0488 |
| 1 | 4.532864 | 0.875000 | 5.18042 | 19.820672 | 1.156250 | 17.1422 |
| 2 | 4.555840 | 0.968750 | 4.70280 | 20.891904 | 1.250000 | 16.7135 |
| 3 | 4.526656 | 0.812500 | 5.57127 | 20.528896 | 1.281250 | 16.0226 |
| 4 | 4.482752 | 0.937500 | 4.78160 | 21.613184 | 1.156250 | 18.6925 |
| 5 | 4.723648 | 0.843750 | 5.59840 | 20.107392 | 1.312500 | 15.3199 |
| 6 | 4.686432 | 0.812500 | 5.76792 | 21.094656 | 1.281250 | 16.4641 |
| 7 | 4.637056 | 0.875000 | 5.29949 | 20.308608 | 1.312500 | 15.4732 |
| 8 | 4.681632 | 0.937500 | 4.99374 | 20.731648 | 1.187500 | 17.4582 |
| 9 | 4.785280 | 0.875000 | 5.46889 | 22.351360 | 1.281250 | 17.4450 |
| 10 | 4.627200 | 0.781250 | 5.92282 | 22.232320 | 1.156250 | 19.2280 |

The median paired prepared ratio is 5.46889, with Sage.js slower in all eleven
rounds. This retains the provisional target for the separately preregistered
twenty neighboring fields. None of those twenty fields was executed during
this evidence task; this report neither changes their selection nor claims
held-out improvement.

## Evidence limits and reproduction

The raw metrics contain invalid secondary display keys
`class-group:undefined`, `equation-order:undefined`, and
`ramification:undefined`: the diagnostic formatter split colon-separated
corpus stratum names as if they were slash-separated dimensions. The
`discriminant:` entries actually name the combined discriminant/class-group
strata. Preserve those historical bytes, but do not interpret the undefined
groups as measured structural categories. This does not affect event timing,
paired-shard aggregates, exact census results, or the selector, which derives
the displayed-generator index independently from polynomial discriminants.

The verifier checks hashes, regenerates the census programs and response
digests, checks the warmup attestation, validates all retained events and
process order/affinity, and recomputes every aggregate and the selector.
It checks the retained exact-replay attestation; it does not rerun mathematical
replay, independently re-prove the number-theoretic theorem, or certify
unrecorded aspects of VM isolation. No Hecke or Magma measurements are included.

Raw files and generated-dispatch evidence are retained as content-addressed
gzip assets in the
[f7f00552 baseline release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-frontier-baseline-f7f00552).
The small manifest in
`bench/optimization-engine/cubic-frontier-f7f00552-evidence.json` gives both
compressed and decompressed sizes and SHA-256 hashes. The census decompressed
hash is `81ee1b5cf9823731806e4de61f56e3796cf3a958bb0342bbe7e3a2a0803039b1`;
the timing hash is `25fb63dcec844adb170f0df599263d91843f972fa162267567523ca2b4ccfef5`.
Published assets were downloaded into a separate directory and verified
before this report was committed. No large evidence files are committed.

From this checkout, download to a new evidence directory and verify:

```sh
frontier_evidence_dir=$(mktemp -d)
gh release download cubic-frontier-baseline-f7f00552 \
  --repo sagemathinc/sagejs --dir "$frontier_evidence_dir" --pattern '*.gz'
gh release download optimization-corpus-complex-cubic-v1 \
  --repo sagemathinc/sagejs --dir "$frontier_evidence_dir" \
  --pattern 'complex-cubic-frontier-survey-*.jsonl.gz'
node scripts/verify-cubic-f7-frontier-evidence.cjs "$frontier_evidence_dir" --self-test
```

The original retained command, run from `/home/user/sagejs-cubic-frontier`
on `opt` with `/opt/node-v26.7.0/bin` first in `PATH`, was:

```sh
node bench/class-unit-groups/run-complex-cubic-frontier.cjs --timing \
  --corpus bench/optimization-engine/complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json \
  --asset-dir /home/user/frontier-assets/complex-cubic-v1 \
  --census-file /home/user/frontier-results/f7f00552-auto/census.json \
  --systems sagejs,pari --sagejs /home/user/sagejs-cubic-frontier/bin/sagejs \
  --gp /home/user/pari-2.17.4-install/bin/gp-2.17 \
  --sagejs-integer-backend auto --cpu 0 \
  --boundaries scalar-prepared,fresh-complete --timeout-seconds 3600 \
  --output /home/user/frontier-results/f7f00552-auto/timing.json
```

Its generated system programs are defined by the
[runner at the frozen source commit](https://github.com/sagemathinc/sagejs/blob/f7f00552dd4178993ceef4522cc2897622cdf2c6/bench/class-unit-groups/run-complex-cubic-frontier.cjs).
Re-execution requires a source-matched build and census on an isolated timing
host and a new output path; it must not overwrite these retained files.
The corpus remains the frozen LMFDB survey, with attribution and
CC-BY-SA-4.0 source metadata in its corpus manifest.
