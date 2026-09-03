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
the untimed census. Its first call may rerun the closed program solely to
extract an untrusted finite transcript; the closed result supplies no replay
authority. Ordinary objects independently rebuild the maximal order and the
complete theorem-qualified factor base, match every factor ideal exactly,
authenticate principal relations spanning the published row lattice, and
recompute its HNF and SNF. For a nontrivial presentation, they also check the
published exact unit and independently use the Belabas--Friedman enclosure and
analytic class-number formula to isolate the global class/unit index as one.
Conditional trivial presentations stop after proving that their row lattice is
all of $\mathbb Z^n$; unconditional trivial presentations use the stronger
ordinary bounded-Minkowski checker. The audit therefore independently proves
the complete class group under exactly the receipt's stated hypotheses without
rediscovering relations. The stronger `receipt.verify(field)` remains available
for a separately scheduled unconditional audit. A native decline instead
continues through the exact dynamic class-group implementation and verifies its
presentation. Records bind the replay contract and distinguish native pass,
native decline with exact fallback, certificate/proof failure, disagreement,
timeout, error, and missing comparator. Receipt JSON is an audit view; the
authority is accurately called
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

## Freeze before revealing the holdout

The holdout is not an informal follow-up sample. After the survey census and
retained timing pass are accepted, build the candidate and run a fresh complete
candidate census while the holdout asset is still absent:

```bash
node bench/class-unit-groups/run-complex-cubic-frontier.cjs --census \
  --corpus bench/optimization-engine/complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json \
  --asset-dir /data/complex-cubic-frontier-v1 \
  --systems sagejs,pari --sagejs "$PWD/bin/sagejs" --gp "$(command -v gp)" \
  --cpu 2 --census-cpus 0,1,2,3 \
  --output /data/complex-cubic-frontier-candidate-census.json
```

This qualification is deliberately generated after the candidate intervention;
it is not the predecessor census used to select the intervention. It must be
created by the candidate's clean checkout and current build, and it binds the
candidate runtime closure that the freeze will later reauthenticate. Once that
census is complete and agreeing, its recorded host projection—including the
selected logical CPU/model and fixed thread environment—must match the freeze
host, and its canonical timestamp may not be later than the freeze. Then create
the content-addressed predecessor
freeze:

```bash
node bench/class-unit-groups/complex-cubic-frontier-holdout.cjs --freeze \
  --corpus bench/optimization-engine/complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json \
  --asset-dir /data/complex-cubic-frontier-v1 \
  --census /data/complex-cubic-frontier-census.json \
  --timing /data/complex-cubic-frontier-timing.json \
  --qualification /data/complex-cubic-frontier-candidate-census.json \
  --sagejs "$PWD/bin/sagejs" --gp "$(command -v gp)" --cpu 2 \
  --output-dir /data/frontier-freezes
```

The command revalidates every survey census process, Sage.js proof branch,
independent receipt replay, direct PARI result, LMFDB invariant, retained timing
event, source tree, build receipt, and generated timing program. It recomputes
the complete metrics and applies one fixed selector: the
smallest-discriminant native decline, or, if none exists, the
smallest-discriminant field whose 11 paired scalar-prepared samples have median
Sage.js/PARI ratio at least $3$ and Sage.js is slower in at least 9 rounds. The
freeze binds the physical and canonical hashes of both predecessor files, the
selected field and survey coordinates, its complete stratum, the predecessor
Git source, selection parameters, timestamp, and the still-unread holdout asset
identity. Separately, freeze schema v2 binds the candidate implementation's
clean Git commit and tree, current build receipt, Sage.js executable digest,
the deterministic compiler/runtime/module/native-kernel output closure, the
exact direct-PARI executable and version used by the predecessor, and the
selected logical CPU plus a stable host projection. The qualification input is
a complete authenticated census produced by that candidate source. Its exact
bytes and the selected field's record are bound into the freeze, and the
selected field must already be `native-pass`; a fallback is not evidence that
the new native regime works. This distinction allows an intervention to be
selected from predecessor evidence without pretending that the predecessor
source is the candidate implementation. Its filename is derived from the
canonical freeze payload. `--allow-dirty` is forbidden.

Only then may the holdout census command open the second release asset:

```bash
gh release download optimization-corpus-complex-cubic-v1 \
  --pattern 'complex-cubic-frontier-holdout-*.jsonl.gz' \
  --dir /data/complex-cubic-frontier-v1
```

```bash
node bench/class-unit-groups/complex-cubic-frontier-holdout.cjs --holdout-census \
  --freeze-file /data/frontier-freezes/complex-cubic-frontier-freeze-sha256-DIGEST.json \
  --corpus bench/optimization-engine/complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json \
  --asset-dir /data/complex-cubic-frontier-v1 \
  --census /data/complex-cubic-frontier-census.json \
  --timing /data/complex-cubic-frontier-timing.json \
  --qualification /data/complex-cubic-frontier-candidate-census.json \
  --sagejs "$PWD/bin/sagejs" --gp "$(command -v gp)" --cpu 2 \
  --output /data/complex-cubic-frontier-holdout-census.json
```

Before the first holdout-asset read, this command reauthenticates the freeze
against the original census and timing bytes, independently reruns the selector,
and revalidates the candidate qualification census. It also requires a clean
current source and current build receipt identical to the frozen candidate, the
same deterministic build/runtime closure, exact Sage.js and PARI executable
identities, the exact frozen CPU and host projection, and a directly resolved
Sage.js executable equal to this checkout's `bin/sagejs`. Direct Sage.js runs
inherit no ambient environment at all. They are launched through the recorded,
hashed Node executable (not the wrapper's `env` shebang), with only a fixed
locale/time zone, the fixed single-thread environment, source mode, the exact
candidate production native pack, a closure-bound noninteractive module cache,
and controlled nonexistent dynamic-cache and site-package roots. Before source
identity is recorded, two identical untimed passes traverse all 1,000 exposed
survey fields as 20 fresh 50-field stratum processes per pass, matching the
retained 50-field partition without retaining the whole corpus's object graph
in one interpreter. Every field must reproduce its frozen class group through an
authenticated native receipt and independent exact replay; only a compact
observation digest crosses each process boundary. The generated-program bundle,
both response bundles, both closure digests, process count, and pass count form a compact
warmup attestation retained in the source identity. The complete runtime closure
is hashed after each pass and must be unchanged; the separately recorded source
closure must equal that fixed point. Thus the second pass proves that every
survey-exercised lazy path has stabilized, without a post-warm identity gap.
This applies to the survey census and timing commands too. Because retained
timing visits all 20 partitions in one interpreter, the complete runtime closure
is hashed again after the actual census or timing execution and before evidence
publication; any mutation invalidates the run and requires a new qualification
cycle. The
runtime closure records the full environment and launch identity, the complete
production cache index, the selected cubic loader, and the manifest and exact
bytes of its required native pack. It rejects the loader's standalone-addon
fallback, requires native execution, disables detached module-cache cleanup,
and rejects symbolic links in the executable closure. The actual Node
resolution of `@sagemath/sagejs-flint` must land at this checkout's package;
the package loader, both generated and direct addon manifests, and both addon
binaries are hashed and cross-checked. The fixed `/usr/bin/taskset` and
`/usr/bin/time` launch wrappers are likewise hashed before they are allowed to
sit in front of the recorded Node or GP executable. Thus an installed package,
import path, loader injection, wrapper substitution, or cache/site-package
override cannot silently replace the authenticated checkout.
The output pathname is atomically claimed with exclusive creation before
disclosure; a failed run deliberately leaves that claim rather than permitting
an accidental retry to overwrite its history. Both the reservation and final
publication are directory-synchronized on supported hosts, and publication
rechecks the pathname's device/inode after writing and syncing the held file.
The manifest's holdout descriptor
must still equal the frozen descriptor. Only after all of those gates pass does
the command resolve, read, and decompress the holdout asset. It then admits all
and only selection ranks 51 through 70 of the frozen stratum—exactly 20 fields,
with no result-dependent filtering, replacement, or adaptation. Sage.js runs
in 20 isolated singleton processes;
each native result must carry its authenticated conditional-GRH receipt and
pass the same independent replay as the survey. One direct `bnfinit(P,0)` PARI
process supplies the second implementation. All 21 process records must be
successful, bound to the single execution epoch, requested CPU, exact shard and
labels, regenerated program, and recorded response; their monotonic intervals
may not overlap. All 20 Sage.js fields must be `native-pass`. Both systems must
agree with the stronger
`used_grh=false` LMFDB class number and invariant factors before a complete
holdout census is written. The source and executable identities are checked
again after execution. This pass is correctness evidence; retained timing, if
desired later, needs a separately frozen protocol.

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
