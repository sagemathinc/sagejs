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
Fixed, fault-injection, and long-duration campaigns state their trial count;
deterministic fuzz campaigns additionally require a nonempty seed and at least
two trials; metamorphic campaigns require at least two transformations. Fuzz
and metamorphic are distinct correctness layers. Seeds, trial counts, and
invariants still need explicit observation checks: campaign metadata by itself
is not proof that an adapter performed the work. Every non-fixed campaign names
the validation check IDs that witness its execution.

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

The receipt records the current Git commit and tree, clean/dirty state, and a
digest of the porcelain status. Dirty development receipts remain valid as
exact byte-bound evidence, but a release policy should set `require_clean` to
`true`. The current-binding verifier also requires the same commit, tree,
source, adapter, artifact, capability manifest, platform facts, and Node
collector runtime.

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
- RSS before and after a sample, RSS sampled at 5 ms asynchronous intervals,
  and Node's process high-water RSS where available; and
- exact installed bytes for the corpus, adapter, capability manifest, and every
  passed artifact path.

The 5 ms sampler cannot observe a short synchronous allocation spike by itself;
the process high-water value is retained separately. Installed artifact bytes
are not called compressed bytes. To measure a compressed archive, pass that
archive as its own artifact. The harness records measurements but does not
invent performance thresholds before representative hosts have been measured.

These fields are receipt structure, not an automatic performance claim. A
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

The adversarial suite in
`test/numerics/evidence/qualification.cjs` covers duplicate JSON keys, source,
adapter, and artifact changes after capability binding, receipt mutation,
mutation followed by content-ID recomputation, removed case evidence, forged
platform identity, unavailable capabilities, duplicate matrix evidence,
missing platform rows, and receipt overwrite attempts.

See [cross-platform.md](cross-platform.md) for collection and reporting, and
[domain-integration.md](domain-integration.md) for the adapter protocol and
registry-free domain integration.
