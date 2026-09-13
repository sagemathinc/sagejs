# Numerical qualification evidence

This directory defines the reusable P0-P8 evidence boundary for Sage.js
numerical computing. A corpus names the exact roadmap phases its cases qualify,
so a P8 release campaign can require evidence accumulated by P0 through P7
without pretending an inventory case is a numerical algorithm case. The
collector records what one host actually ran. It never fills an
unmeasured platform row, treats a skipped case as a pass, copies timings from a
different machine, or turns an unavailable capability into an available one.

The checked schemas are:

- [`corpus.schema.json`](corpus.schema.json): a backend-neutral, versioned case
  corpus;
- [`capability-manifest.schema.json`](capability-manifest.schema.json): the
  backend and runtime claims bound to exact corpus, source, adapter, and
  artifact hashes;
- [`run-receipt.schema.json`](run-receipt.schema.json): per-host case evidence
  plus startup, time, memory, and payload measurements;
- [`matrix-policy.schema.json`](matrix-policy.schema.json): the explicit
  release matrix; and
- [`matrix-report.schema.json`](matrix-report.schema.json): the deterministic,
  fail-closed report.

The schemas describe the wire formats. The executable validators in
`scripts/numerical-computing/` additionally enforce cross-field properties
which JSON Schema cannot express conveniently: unique case IDs and check IDs,
capability coverage of exact corpus case IDs, framed path digests, manifest
content identities, independently recomputed checks, deterministic repeated
observations, exact sample counts, platform derivation, metric summaries, and
complete matrix coverage.

## Evidence model

A qualification run binds this chain:

```text
corpus bytes + source closure + adapter bytes + artifact closure
                 │
                 v
       capability manifest content ID
                 │
                 v
 actual host + collector + observed subject runtime
                 │
                 v
 per-case observations ──> independently evaluated evidence
                 │
                 v
 startup / wall time / RSS / payload metrics
                 │
                 v
 content-addressed immutable run receipt
```

The corpus says which outcome is expected and how to derive correctness and
validation evidence from the adapter's observation. The adapter cannot return
`passed`; it returns only a structured outcome, values, phase telemetry, and
counters. The collector applies the corpus checks itself and separately records:

- failure evidence: expected and observed outcome plus exact failure code;
- correctness evidence: definitions, differential oracles, or other declared
  comparisons; and
- validation evidence: residuals, bounds, feasibility checks, or other
  independently named checks.

Every case must have both correctness and validation checks. Expected domain
failures are first-class cases. Codes beginning `qualification.` are reserved
for collector failures and cannot be accepted as a domain's expected failure.
An adapter exception, invalid observation, missing pointer, failed check,
nondeterministic repeated observation, missing capability, or incomplete
sample set therefore fails the receipt.

Every case also records one `P0`-`P8` program phase and a campaign contract.
Fixed, fault-injection, and historically named long-duration corpus campaigns
state their trial count;
deterministic fuzz campaigns additionally require a nonempty seed and at least
two trials; metamorphic campaigns require at least two transformations. Fuzz
and metamorphic are distinct correctness layers. Seeds, trial counts, and
invariants still need explicit observation checks: campaign metadata by itself
is not proof that an adapter performed the work or ran for a meaningful
duration. Every non-fixed campaign names
the validation check IDs that witness its execution.

Actual long-duration claims use the separate source-bound
[soak and reliability campaign](soak.md), which enforces minimum elapsed time,
minimum useful work, repeated fresh processes, recovery, and memory-growth
criteria on all four supported platforms. Routine CI does not run that release
campaign.

Available capabilities name every exact corpus case they cover. A capability
manifest is rejected if it names a case outside the bound corpus. At collection
time, the adapter must also report that it observed the capability in the
measured runtime. The report requires both facts. An envelope object is retained
as structured domain evidence, but the exact case allowlist remains the
machine-enforced lower bound.

## Hash and path rules

All evidence inputs are repository-relative. Files and directories are hashed
with names, kinds, lengths, and bytes in a deterministic frame. Directory
entries are sorted. Path traversal, absolute input paths, symbolic links, and
special filesystem objects are rejected. JSON parsing rejects duplicate object
keys, non-finite numbers, trailing content, and ambiguous escapes.

The receipt records the current Git commit and tree, clean state, and a digest
of the porcelain status. Collection fails before loading adapter code unless
the checkout is clean. After the adapter is closed, the collector rebinds the
corpus, complete source bundle, adapter, artifacts, capability manifest, and
repository identity. It rejects the run unless all bytes and validated
identities are unchanged and `HEAD` remains the original clean candidate.
The current-binding verifier additionally requires the same platform facts and
Node collector runtime.

Content IDs detect accidental or adversarial mutation; they are not digital
signatures. `verify --historical` proves internal consistency and bound content
identities but cannot prove which physical host authored a downloaded file.
Release automation must obtain receipts from its trusted persistent hosts and
preserve transport provenance or add an external signature. It must not treat
an arbitrary historical receipt supplied by an untrusted party as host
attestation.

## Measurements and their limits

The collector records:

- time from the earliest qualification CLI entry to adapter readiness;
- adapter module load and initialization time;
- harness-measured wall time for every warmup and measured sample;
- adapter-reported named phase times and counters, labeled as adapter telemetry;
- diagnostic collector RSS before and after a sample, RSS sampled at 5 ms
  asynchronous intervals, and Node's process high-water RSS where available;
- one collector-authenticated `peak_memory` record per sample and case, with an
  exact method, scope, sampling interval, and byte count; and
- exact installed bytes for the corpus, adapter, capability manifest, and every
  passed artifact path.

Node subjects use `collector_process` scope. npm, SEA, browser, and worker
subjects use `process_tree`, defined as the collector process plus every
descendant visible to the collector at each sample. Linux reads `/proc`, macOS
reads `ps`, and Windows reads CIM. `browser_heap` is supplemental and cannot
satisfy a process-tree policy. Adapter telemetry cannot populate or authenticate
`peak_memory`; the exact authority is always `qualification-collector`.
Historical verification enforces the exact platform/subject tuple instead of
accepting another globally known method: Node is
`node-process-rss-boundary-v1` at 5 ms; Linux external subjects are
`linux-procfs-process-tree-sampled-v1` at 5 ms; macOS is
`macos-ps-process-tree-sampled-v1` at 50 ms; and Windows is
`windows-cim-process-tree-sampled-v1` at 50 ms.
An external-subject sample fails unless the collector observes a live
descendant while that sample executes. In particular, an adapter must await an
asynchronously supervised local process: a synchronous child blocks the
collector's sampling loop and is deliberately unqualifiable, while a remote
browser cannot relabel the collector's RSS as browser process-tree evidence.
The collector tolerates the short launch interval before a descendant appears,
but it never turns a before/after collector-only boundary into process-tree
evidence.

Sampled measurements cannot observe every short synchronous allocation spike;
the Node process high-water value is retained separately as diagnostic data.
Installed artifact bytes
are not called compressed bytes. To measure a compressed archive, pass that
archive as its own artifact. The harness records measurements but does not
invent performance thresholds before representative hosts have been measured.

These fields are receipt structure, not an automatic performance claim. Every
matrix row names `required_memory_scope`; report generation fails closed if a
receipt has no collector-authenticated record at that exact scope. A
release policy pins the same corpus/source digest for every backend or host row,
while each row retains its own warmup/sample timings, evaluation counters,
startup, memory, and payload. Numeric budgets belong in a reviewed policy only
after representative hosts have been measured; absent budgets are not inferred.

The collector is a Node process. The capability manifest's `subject` describes
the runtime actually exercised by the adapter: Node, SEA, browser, worker, or a
named other runtime. A browser adapter must launch or connect to the browser,
obtain its real version, return that subject from `initialize`, and make it
match the bound manifest. Merely running the collector on a machine with a
browser installed is not browser evidence.

## Security and immutability

Adapters are trusted first-party CommonJS modules and execute with the
collector's authority. Corpora are data, not executable code. Run receipt
outputs are created atomically and never overwritten. A new source, corpus,
artifact, runtime, or run gets a new receipt. Derived JSON/Markdown matrix
reports may be regenerated because their identity is a deterministic function
of policy and receipt content.

Pre- and post-execution rebinding detects persistent or concurrent input
changes; it is not hostile-host attestation. In particular, a trusted adapter
could change, consume, and restore bytes between the two bindings. Proving
otherwise requires collector-owned staged read-only inputs or operating-system
isolation and is outside this receipt format. Release automation therefore
trusts the first-party adapter, collector, and persistent host while retaining
exact evidence for the stable candidate they executed.

The adversarial suite in
`test/numerics/evidence/qualification.cjs` covers duplicate JSON keys, source,
adapter, and artifact changes after capability binding, receipt mutation,
mutation followed by content-ID recomputation, removed case evidence, forged
platform identity, unavailable capabilities, duplicate matrix evidence,
missing platform rows, bound-input mutation during execution, dirty candidate
collection, and receipt overwrite attempts.

See [cross-platform.md](cross-platform.md) for collection and reporting, and
[domain-integration.md](domain-integration.md) for the adapter protocol and
registry-free domain integration. See
[sanitizers-and-browser-memory.md](sanitizers-and-browser-memory.md) for the
source-bound native sanitizer and real-browser process-tree memory gates.

The first complete product campaign is described in
[product-campaign.md](product-campaign.md). Its checked-in corpus and Node
adapter exercise the integrated P0-P8 numerical surface through a built
Sage.js artifact. The checked-in matrix files are templates, not receipts or
claims that any platform row has been measured.

## Hermetic SciPy oracle

Every one of the 16 full-runtime rows executes the same emitted SciPy oracle
programs through a separately bound, per-platform CPython prefix. The checked
catalog selects exact CPython 3.14.4 python-build-standalone 20260414 archives
and exact NumPy 2.5.1 and SciPy 1.18.0 wheels for Linux x64, Linux ARM64, macOS
ARM64, and Windows x64. It binds every source URL, raw SHA-256, byte count, and
the normalized installed closure. A version match is not sufficient.

Provision a host into ignored build storage with:

```console
node scripts/numerical-computing/qualification/provision-scipy-oracle.cjs \
  --artifact-directory build/qualification/scipy-inputs \
  --prefix build/qualification/scipy-prefix \
  --provenance build/qualification/scipy-provenance.json \
  --download
```

The network step is outside receipt collection. The provisioner first verifies
the catalog's raw archive bytes. Its tar and wheel parsers reject traversal,
absolute and nonportable names, hardlinks, special members, duplicates, case
collisions, unsupported ZIP features, `.data` wheel members, inconsistent
RECORD hashes, and expansion-budget violations. It materializes only internal
tar symlinks whose transitive target is a regular in-archive file, creating an
independent `nlink == 1` copy. The unused `share/terminfo/**` archive subtree is
deterministically pruned. Wheels are RECORD-verified and directly unpacked;
`pip` is intentionally not involved. The final prefix contains only real
directories and unique regular files, has an empty `.qualification-tmp`, and
must exactly match the catalog's complete path/kind/content closure before its
provenance file is published.

Producer jobs set `SAGEJS_QUALIFICATION_SCIPY_PREFIX` and
`SAGEJS_QUALIFICATION_SCIPY_PROVENANCE`. Adapters authenticate the prefix,
provenance, catalog, executable, complete import closure, deterministic launch
environment, and runtime versions before and after execution. Aggregation uses
the uploaded binding snapshot and exact source-current catalog without trying
to reopen producer-local paths. A missing input, stale closure, foreign
platform, link alias, or changed runtime makes the row impossible rather than
skipped.

## Mandatory release wiring

The P8 collectors and release-gate builder are not optional diagnostic tools.
Release integration must expose one named command and make publication depend
on its passing exact-candidate output. That wiring must restore all 16 receipt
files, their capability manifests and ignored artifacts, the supplemental
evidence, and all 16 row-specific hermetic SciPy binding snapshots at their
authenticated repository-relative paths before aggregation. The gate requires
those documents to collapse to exactly four platform identities. It must also
provision the standalone CPython/NumPy/SciPy inputs selected by the checked-in
catalog and set the explicit prefix and provenance variables for each producer
job. Producer-local compiler, Node, Python, and browser executable paths are
recorded and authenticated before and after collection but are not reopened on
the aggregation host.

Until that package command, release workflow dependency, artifact transport,
and four-platform oracle provisioning are exercised by the exact candidate,
this infrastructure deliberately cannot produce an eligible release gate. A
green ordinary test suite is not a substitute for the source-current
qualification document.
