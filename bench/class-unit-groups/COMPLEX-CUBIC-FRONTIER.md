# Complex cubic competitive frontier

This harness establishes a reproducible, out-of-sample frontier for class
groups of complex cubic number fields. It deliberately separates correctness
and route classification from timing. A fast answer is never allowed to become
its own oracle, and a timeout limit is never substituted for an observation.

## Frozen corpus

Export the required LMFDB columns to an offline JSON file, then construct the
corpus from that file. The generator performs no network access.

```bash
node bench/class-unit-groups/generate-complex-cubic-frontier-corpus.cjs \
  --input /data/lmfdb-complex-cubics.json \
  --exclude test/fixtures/number-field-lmfdb-cubic-100.json \
  --exclude /data/prior-cubic-frontier-corpus.json \
  --snapshot lmfdb-2026-09-02 \
  --output /data/complex-cubic-frontier-1000.json
```

Eligible records have degree $3$, signature $(1,1)$, negative discriminant of
absolute value at most $10^8$, and `used_grh=false`. Previously exposed labels
are removed before sampling. The remaining fields are stratified by six
discriminant bands, five class-group bands, equation-order index $1$ versus
larger index, and at most one versus multiple ramified primes. Within a stratum
the order is the MD5 rank of `label || seed`; a deterministic round robin over
MD5-ranked strata chooses 1,003 fields. The first 1,000 become 20
shards of 50 and the final three are fixed, excluded warm fields. The corpus
stores exact SQL, snapshot, source, label, record, and exclusion digests. The
production CLI requires the audited 1,815-label exposure union with SHA-256
`3aaa2fd01a009d87d40f9f21a83db42b00f3f578827e2ae36d3e0025bdf610d8`;
tests may exercise the pure selector at smaller cardinality.

## Pass A: census and classification

Run the census before measuring anything:

```bash
node bench/class-unit-groups/run-complex-cubic-frontier.cjs --census \
  --corpus /data/complex-cubic-frontier-1000.json \
  --systems sagejs,pari --cpu 2 \
  --output /data/complex-cubic-frontier-census.json
```

The direct settings are exact and intentionally asymmetric:

- Sage.js calls `K.class_number(proof=False)`.
- direct GP calls `bnfinit(P,0)`; it never substitutes flag $1$ for this run.
- a Magma protocol adapter must attest `Proof := "GRH"`.
- a Hecke protocol adapter must attest `class_group(...; GRH=true)`.
- the LMFDB result oracle has `used_grh=false`, which is stronger data than the
  requested conditional computation.

For Sage.js, a native result must match the live field, publish an authenticated
receipt, and pass `receipt.verify(field)`. That replay occurs in the untimed
census and uses the ordinary exact implementation. A native decline instead
continues through the exact dynamic class-group implementation and verifies its
presentation. Records distinguish native pass, native decline with exact
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
  --corpus /data/complex-cubic-frontier-1000.json \
  --census-file /data/complex-cubic-frontier-census.json \
  --systems sagejs,pari --cpu 2 \
  --output /data/complex-cubic-frontier-timing.json
```

There are 11 retained rounds. Every system/round has a fresh process pinned to
one recorded logical CPU, with all common thread environments set to one. The
system order rotates by round, so no position occurs more than one extra time.
Exactly three excluded fields warm the implementation. For each of 20 shards,
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
afterward. PARI computes a richer BNF state at both boundaries, so the
Sage.js/PARI ratio is one-sided frontier evidence rather than an equal-output
microbenchmark.

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

Routine tests use injected fake processes and clocks. They never contact LMFDB,
launch a CAS, or use the dedicated benchmark VM.
