# Complex cubic competitive frontier

This harness establishes a reproducible, out-of-sample frontier for class
groups of complex cubic number fields. It deliberately separates correctness
and route classification from timing. A fast answer is never allowed to become
its own oracle, and a timeout limit is never substituted for an observation.

## Frozen corpus

The runner consumes the content-addressed manifest committed at
`bench/optimization-engine/complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json`
and the manifest's `survey` release asset. It validates the manifest, reads
only `release.assets[0]`, authenticates both the compressed bytes and canonical
logical records, and never resolves or opens the `holdout` asset.

```bash
gh release download optimization-corpus-complex-cubic-v1 \
  --pattern 'complex-cubic-frontier-survey-*.jsonl.gz' \
  --dir /data/complex-cubic-frontier-v1
```

Eligible records have degree $3$, signature $(1,1)$, negative discriminant of
absolute value between $10^4$ and $10^8$, and `used_grh=false`. Previously
exposed labels were removed before sampling. The survey contains 50 tuning
fields in each of four discriminant bands crossed with five class-group bands,
plus 12 fixed controls. The runner projects tuning rows rank-major across the
manifest's 20 strata: shard $s$ is exactly stratum $s$, and every shard has 50
fields. All 12 controls are excluded warmups. The manifest stores the exact SQL,
LMFDB snapshot, source, label, record, and exclusion digests. It binds the
audited 1,815-label exposure union with SHA-256
`3aaa2fd01a009d87d40f9f21a83db42b00f3f578827e2ae36d3e0025bdf610d8`;
the projected 1,000-row runner view has record digest
`14ecb29ebef8f30ef1de9c7ef0241a24187d8412bcceef97ae41447e5bc43cfa`.

## Pass A: census and classification

Run the census before measuring anything:

```bash
node bench/class-unit-groups/run-complex-cubic-frontier.cjs --census \
  --corpus bench/optimization-engine/complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json \
  --asset-dir /data/complex-cubic-frontier-v1 \
  --systems sagejs,pari --cpu 2 --census-cpus 0,1,2,3 \
  --output /data/complex-cubic-frontier-census.json
```

The built-in Sage.js census runs as 1,000 isolated singleton processes in
frozen global-rank order. Direct PARI retains the corpus's 20 natural 50-field
timing strata, since it does not have Sage.js's long-tail verifier behavior.
`--census-cpus` permits at most one direct process on each listed logical CPU;
an idle CPU dynamically takes the next shard. This shortens only the
non-authoritative correctness census. Every process records its affinity and
is bound to its exact label and generated-program digests. Its own explicit
timeout can therefore lose at most one Sage.js field.

Successful Sage.js singleton results are published in `OUTPUT.parts` (or the
explicit `--census-parts-dir`) as atomic, content-addressed checkpoints. A part
is reusable only after the native receipt has matched the live field and passed
independent exact recomputation, or after the dynamic fallback presentation has
verified exactly. The key binds the complete frozen record and corpus, proof
mode, generated verifier program, source tree, current build receipt,
executable, thread environment, platform, architecture, CPU pool, and
partition. Timeouts, malformed responses, disagreements, and proof failures
are never published. An addressed malformed or conflicting part fails closed;
the runner never scans arbitrary files in the directory. `--allow-dirty`
therefore requires `--no-census-parts`.

Every census process also records a digest of its complete response. Before
timing, the runner reconstructs those responses from the stored observations,
revalidates every proof branch against the frozen oracle, and recomputes the
entire census summary. Process intervals carry an execution-epoch digest;
one-process-per-CPU scheduling is checked within each monotonic-clock epoch,
while checkpointed processes from unrelated resumed epochs are never compared
as if their monotonic clocks shared an origin.

This is a resumption mechanism, not retry-history evidence. Only successful
verified parts enter the eventual census. Abandoned timeout/error attempts are
outside that checkpoint set and appear only if an operator separately retains
an incomplete run's output. The retained timing pass is always fresh and reads
checkpoints only indirectly through the fully revalidated census gate.

External protocol adapters retain one serialized full-corpus process because
their runtime closure is authenticated as a single unit. Retained timing
rejects all census-only options and remains serialized on `--cpu`. PARI's
decreasing `bnf.cyc` convention is reversed and validated before comparison
with Sage/LMFDB divisibility order.

The direct settings are exact and intentionally asymmetric:

- Sage.js calls `K.class_number(proof=False)`.
- direct GP calls `bnfinit(P,0)`; it never substitutes flag $1$ for this run.
- a Magma protocol adapter must attest `Proof := "GRH"`.
- a Hecke protocol adapter must attest `class_group(...; GRH=true)`.
- the LMFDB result oracle has `used_grh=false`, which is stronger data than the
  requested conditional computation.

For Sage.js, a native result must match the live field, publish an authenticated
receipt, and pass `receipt.verify_conditional_grh(field)`. That replay occurs in
the untimed census, bypasses the closed native program, and uses the ordinary
exact class/unit implementation with `proof=False`. It therefore independently
recomputes the complete class group under the same explicit GRH contract; the
stronger `receipt.verify(field)` remains available for a separately scheduled
unconditional audit. A native decline instead continues through the exact
dynamic class-group implementation and verifies its presentation. Records bind
the replay contract and distinguish native pass, native decline with exact
fallback, certificate/proof failure, disagreement, timeout, error, and missing
comparator. Receipt JSON is an audit view; the authority is accurately called
`live-authenticated-with-independent-exact-recomputation`, not detached replay.

The helper that generates unconditional direct-GP census source uses
`bnfinit(P,1)` followed by the explicit full check `bnfcertify(bnf,0)`. This is
kept separate from conditional frontier evidence.

## Pass B: retained timing

Only a complete, agreeing census for the identical corpus and Git source tree
is accepted:

```bash
node bench/class-unit-groups/run-complex-cubic-frontier.cjs --timing \
  --corpus bench/optimization-engine/complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json \
  --asset-dir /data/complex-cubic-frontier-v1 \
  --census-file /data/complex-cubic-frontier-census.json \
  --systems sagejs,pari --cpu 2 \
  --output /data/complex-cubic-frontier-timing.json
```

There are 11 retained rounds. Every system/round has a fresh process pinned to
one recorded logical CPU, with all common thread environments set to one. The
system order rotates by round, so no position occurs more than one extra time.
Exactly 12 excluded control fields warm the implementation. For each of 20 shards,
the process doubles repetitions until a discarded contiguous root lasts at
least 1.2 seconds, then measures a separate retained root with the calibrated
count. Launch-to-ready time, complete process wall time, stderr digest, and
timeout status are recorded separately.

The two roots are:

| Boundary | Sage.js | direct GP |
|---|---|---|
| `scalar-prepared` | fresh isomorphic field and maximal order before the root; `K.class_number(proof=False)` inside | `nfinit(P)` before the root; `bnfinit(nf,0)` inside |
| `fresh-complete` | coefficients through polynomial, field, maximal order, and scalar result | polynomial coefficients through `bnfinit(P,0)` |

Each retained shard has one contiguous monotonic root. Phase sums never replace
it. Per-field nested clocks are diagnostic only. Answers are retained during
the root but their canonical digest and comparison with census/LMFDB occur
afterward. The internal outputs are intentionally different. PARI computes a
BNF state but `bnfinit(P,0)` may accept a class number and regulator while
omitting a fundamental unit when its working precision is insufficient;
Sage.js native success publishes and exactly checks unit coordinates in its
receipt. The ratio therefore compares the same observable scalar request under
the same requested conditional-GRH mode, but it is not an equal-certificate
microbenchmark. Sage.js records its two precise GRH hypotheses in the receipt;
PARI documents flag $0$ generically as GRH-conditional.

The output preserves all raw shard roots and reports 11 absolute corpus totals,
paired shard and diagnostic field ratios, median/geometric mean/tails/worst,
counts within $1\times$, $3\times$, and $10\times$, a deterministic 95% shard
bootstrap interval, and diagnostics stratified by corpus dimensions and
Sage.js route. Missing tools remain explicit incomplete coverage.

## Magma and Hecke adapter protocol

Magma and Hecke are optional secondary comparators and require explicit
adapters, for example `--adapter magma=/path/to/adapter`. The executable reads
one JSON request from stdin, writes the literal ready line
`SAGEJS_COMPLEX_CUBIC_FRONTIER_READY`, and finishes with
`SAGEJS_COMPLEX_CUBIC_FRONTIER_RESPONSE|` followed by one compact JSON response
having schema `sagejs.benchmark/complex-cubic-frontier-adapter-v1`. The request
contains the frozen warmups, 20 shards, proof setting, boundary list, round,
and 1.2-second minimum. The orchestrator revalidates every class number and any
published invariants, so an adapter cannot self-certify arithmetic.

Every successful external response must also carry a content-bound runtime
identity. The orchestrator verifies its canonical digest and system binding,
independently regenerates the CAS program from the exact protocol request, and
checks the reported program digest. It retains the complete identity with the
process evidence and requires one unchanged runtime-closure digest from census
through every retained round; the request-specific program digest is the only
excluded part of that closure. The supplied
Magma adapter hashes the launcher, runtime, package tree, adapter, helper, and
generated program. The supplied Hecke adapter additionally pins and hashes the
Julia system image, exact Hecke Git tree, project/manifest, FLINT/GMP/MPFR
libraries, and loaded caches. Version drift or an incomplete installation fails
before the ready marker, so it cannot silently become benchmark evidence.

Routine tests use injected fake processes and clocks. They never contact LMFDB,
launch a CAS, or use the dedicated benchmark VM.
