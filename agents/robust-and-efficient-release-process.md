# Plan: a robust and efficient Sage.js release process

Status: **proposal, not an authorization to bypass current release gates**.
Audit date: 2026-09-07. Source inspected: `origin/main` at
`8ebd868bf`; operational examples also come from the frozen 0.8.0 candidates
`ef09d3c7` and `19789307`. These are different scopes: measurements below do
not qualify newer `main`. This document does not change the active candidate,
publish anything, or claim that 0.8.0 qualification is complete.

## 1. Objective and priorities

Make releases bounded promotion operations over validated artifacts, rather
than repeated whole-repository research campaigns. Final deliverables remain:

- Linux x64, Linux ARM64, macOS ARM64, and native Windows x64 SEA executables;
- production browser JavaScript/Wasm, including worker and recovery support;
- the common npm package and four platform packages;
- a coherent public installer, npm channel, GitHub release, and browser app.

The user's priorities are authoritative design inputs:

1. Startup must stay solidly below 400 ms under a defined supported-host
   measurement protocol. New mathematics must not add eager startup work.
2. Preserve mathematical/Python semantics and honest capability boundaries.
   Known incorrect results, unsafe native execution, and broken fallback are
   not acceptable ways to make a release pass.
3. Keep all four native targets and real browsers first-class.
4. Keep browser download/initialization size, memory, and dependency complexity
   under control. Do not introduce opaque algebra systems or a large new
   release-service dependency stack.
5. Treat small timing changes, such as 10 ms versus 15 ms, as information unless
   they violate an explicitly justified user-facing contract.

Sage.js is early alpha with no compatibility burden requiring elaborate
migration shims. Correct the release architecture directly. Retain historical
evidence and provenance, not accidental APIs or unnecessary machinery.

## 2. Audit: what actually blocks today

### 2.1 Sources and inventory

The audit inspected these authoritative entry points, not just script names:

- [Release playbook](../RELEASE.md), [distribution layout](../DISTRIBUTION.md),
  and [architecture](../ARCHITECTURE.md).
- [Runner stage definitions](../scripts/release/stages.cjs),
  [checkpoint implementation](../scripts/release/runner.cjs), and
  [four-host coordinator](../scripts/release/coordinate.cjs).
- [Test discovery](../scripts/test-metadata.cjs),
  [file scheduler](../scripts/run-test-tier.cjs),
  [developer/CI plans](../scripts/run-test-plan.cjs), and
  [timing partition](../scripts/release/test-gates.cjs).
- [Native CI/publication](../.github/workflows/ci.yml),
  [Wasm release](../.github/workflows/wasm-release.yml),
  [routine Wasm](../.github/workflows/wasm-routine.yml), and
  [fast Wasm candidate](../.github/workflows/wasm-candidate.yml).
- [Numerical assembler](../scripts/numerical-computing/qualification/assemble-release-gate.cjs),
  [supplemental verifier](../scripts/numerical-computing/qualification/supplemental-report.cjs),
  and [supplemental requirements](../bench/numerical-computing/qualification/matrix/supplemental-evidence.template.json).
- [Startup checker](../scripts/check-startup-budget.cjs),
  [package graph](../architecture/package-graph.json),
  [browser budgets](../bench/browser-wasm-budget.json), and
  [browser timing collector](../bench/browser-wasm-performance.mjs).
- [Publication recovery](../.github/workflows/publish-validated-release.yml),
  [Cloudflare deployment](../.github/workflows/wasm-deploy-cloudflare.yml),
  [Pages](../.github/workflows/pages.yml), and
  [installer staging](../scripts/stage-website-installer.cjs).

The runner has four canonical stages, ten browser stages, and native profiles
of 19/14/16/16 stages for Linux x64/ARM64/macOS/Windows respectively: **79 stage
instances**, before separately orchestrated browser numerical collection,
reproduction, signing, and publication. Stages are not individual tests.

At audited `main`, discovery finds 164 unit files (149 portable), 393 integration
files, and 69 specialized files. Smoke/platform are overlapping selections,
not additional disjoint suites. The integration gate partitions into 390
correctness and three performance files. Package-specific tests and workflow
commands are additional; this discovery count is not the full release inventory.
The frozen 0.8.0 run has 365 correctness integration files, not 390.

### 2.2 Gate disposition proposed for implementation

Classes below describe the **future** policy:

- **P — product acceptance:** bounded checks of every final artifact set.
- **C — component qualification:** required when its validated input closure
  changes; reusable only under the binding rules in section 4.
- **R — reporting/research:** scheduled or explicit campaigns, not ancestors
  of publication. A discovered correctness/safety defect is still escalated.

| Current gate or family | Actual behavior now | Proposed disposition |
| --- | --- | --- |
| `numerical-product`, `public-runtime`, `public-build`, `bootstrap` | Build/provision overlapping source-current products and full lazy caches | C build nodes with immutable outputs; P validates assembled input identities |
| `public-pack`, `sea`, `npm`, `package-install`, `metadata` | Package artifacts, check metadata, exercise fresh installs; SEA stage also checks startup | P; split build/sign/test actions so retries cannot accidentally rebuild |
| `startup` and SEA startup | Required performance gate, including normalized timing | P; strengthen measurement contract as below, never downgrade to R |
| `strict`, merge/architecture/FFI invariants | Required source integrity/typing checks in runner or routine CI | Keep fast source checks; C for applicable source, always execute cheap integration invariants |
| `unit`, `portable`, `integration`, `native`, `eclib`, `reference` | Broad suites; integration repeats on three hosts; native includes lifecycle/sanitizer work | C full affected-domain/target tests plus P representative dispatch, exactness, and packaging checks |
| `integration-performance`, `native-performance` | Required wall-clock comparisons; some files also contain correctness assertions | Split assertions: correctness to C/P, minor ratios to R; only reviewed catastrophic cliffs remain P |
| `jupyter` | Linux SEA installation/integration boundary | P bounded kernel startup/evaluation/comm/widget smoke; extended cases C |
| `oracle` | Provisions authenticated SciPy into fixed output paths; refuses existing outputs | C content-addressed provision/verify node; P checks oracle identity when numerical evidence is required |
| `numerical-npm`, `numerical-sea`, `numerical-node` | Three complete product rows per platform; Node also runs bounded soak | Initially retain all 12 rows; later separate shared algorithm qualification C from P loader/ABI/packaged execution checks |
| `wasm-node`, three `wasm-ENGINE` parity stages | Release corpus in Node-Wasm and real browser engines | P small representative corpus on every supported execution route; C full affected browser/math corpus |
| `wasm-security` | Quotas, serialization, security, cache integrity, recovery/memory behavior | P bounded critical containment/recovery tests; C larger fault/resource campaigns |
| `wasm-native-timings`, three `wasm-ENGINE-timings` | Minor regressions are reported, but collection must finish successfully | R except extracted startup/size/interrupt safety ceilings; remove reporting jobs from publication dependencies |
| `wasm-workload` | Requires both parity and timing receipts, so reporting remains transitively blocking | Split required capability/correctness coverage from optional timing dashboard data |
| Numerical native ASAN/UBSAN/LSAN | cminpack and NLopt component harnesses | C for exact sources, adapters, toolchain/flags and supported target scope; never reuse across changed ABI or unsafe code |
| Numerical destructive Wasm faults | Validates quota/cancellation/failure containment | P compact recovery check; C complete destructive corpus |
| Numerical browser process-tree memory | Four records including worker replacement; instrument validation requires a touched-memory delta | C full measurement campaign; P bounded memory/recovery ceiling; do not mistake an instrumentation sanity check for the product's memory limit |
| Numerical startup/package/payload/closure | Aggregates package ownership, SEA startup, browser size and resource closure | Keep these P checks; move ownership out of the numerical-only aggregate so all mathematics obeys them |
| Four numerical platform soaks | At least 12 processes, three aggregate minutes and 5,376 checked operations per platform | Retain compact containment/leak guard P initially; longer stability campaigns R; reduce only after coverage mapping and measurements |
| Clean Wasm reproduction/toolchain comparisons | Rebuilds on Linux x64, ARM64 and macOS; Windows checks prebuilt artifact | Initially retain current gate; later C on relevant toolchain/build closure and independent scheduled clean audit, with trusted artifact production |
| Signing, raw-evidence authentication, publication/deployment | Signed Mac product, exact numerical gate reconstruction, same-tag successful Wasm workflow, protected publisher | P; preserve trust and signing, consume a validated manifest instead of requiring unrelated whole-workflow success |
| Compiler/tutorial diagnostics, scheduled campaigns | Some CI diagnostics already use non-blocking policy; scheduled numerical soak exists | Preserve their explicit policy; do not silently promote every diagnostic into P |

This is a family-level audit with concrete routing decisions, not a claim that
every individual mathematical assertion has been classified. Phase A must emit
the complete command/file inventory, including package scripts and specialized
tests. **Do not classify by filenames containing `performance`.** For example,
`dense-prime-host-boundary.cjs` combines exactness/cache checks and independent
wall-clock comparisons. Moving that entire file to reporting would lose safety.

Distinguish ordinary speed reports from evidence that authorizes a production
dispatch decision. A native eligibility/shape/bit-envelope contract, exactness
witness, or resource-safety proof remains required for selecting that route.
Moving comparative timings to R must never expand an accelerator's validated
domain. Missing authorization must retain the documented exact fallback or
explicit unsupported capability, not claim an unqualified fast path.

### 2.3 Specific structural findings

1. **Labels do not control dependency semantics.** `performance-report` suppresses
   timing regression failure, not collector errors/timeouts. The runner's
   `wasm-workload` consumes timing receipts. CI's `browser-release-gates` requires
   browser-performance success; the native publisher requires the whole same-tag
   Wasm workflow to succeed. Changing only a label would not unblock publication.
2. **Reuse is whole-commit and coarse-grained.** Runner keys include commit/tree,
   the entire runner file, hostname, Node, a broad environment digest, stage
   definition, and whole input directories. Updating unrelated release tooling
   invalidates checkpoints. Whole-`dist` hashing also includes volatile build
   receipt metadata. The file scheduler saves duration estimates, not per-file
   qualification receipts.
3. **There is no single end-to-end campaign graph.** The checked-in coordinator
   covers native profiles, not every browser numerical, reproduction, signing,
   or publication step. The active campaign needs ignored operational helpers.
   Persistent-host and GitHub stage order/inventory also differ; they share
   commands, not one complete generated DAG.
4. **Growth reaches release automatically.** New integration files join large
   default suites. Three files are explicitly partitioned as timing tests, but
   other mixed mathematical/benchmark files remain in correctness. Adding a
   feature can therefore add substantial release time without a budget decision.
5. **There are duplicated build and measurement costs.** Canonical packaging,
   native bootstrap, SEA assembly and Wasm assembly request overlapping lazy
   preparation. Browser timing samples call memory measurement before/after
   operations, although dedicated memory qualification exists. Payload reports
   repeatedly recompress identical bytes.
6. **Infrastructure failures waste correct work.** Prior-candidate oracle
   directories caused provisioning failure. Disk exhaustion at integration file
   134 forced a whole-stage rerun. Lock ownership is per checkout, but not every
   surrounding orchestration action is yet part of a single supervised protocol.
7. **Numerical qualification is also global release policy.** The current final
   assembler requires 16 product rows and six supplemental requirements backed
   by eleven raw records, plus hermetic oracle coherence. Startup/packaging and
   browser structure must not become numerical-library-specific responsibilities.
8. **Useful safeguards already exist.** Content-addressed native/toolchain
   caches, explicit lazy package ownership, Wasm payload identities, process-tree
   cancellation, stage checkpoints, root-tarball equality, raw-evidence
   reconstruction, signing and idempotent npm integrity checks should be reused.
   This is not a proposal to replace them with unchecked caches.

### 2.4 Startup and size: actual policy versus desired contract

`architecture/package-graph.json` currently sets an eleven-sample normalized
median of 400 ms for development CLI, with a Linux ARM64 override of 525 ms.
SEA uses 300 ms, Linux x64 350 ms, ARM64 425 ms. Both have a raw hard ceiling of
1,500 ms; empty-start checks use 225 ms normalized and 1,000 ms raw. The checker
times fresh processes through evaluation/exit and divides by a Node-startup load
factor. **A pass does not prove an observed interactive prompt below 400 ms.**

Implement a product-ready measurement on idle reference hosts: process launch
to usable prompt/kernel ready, separately record trivial-evaluation and exit
time. Proposed initial target for review: median at most 350 ms and observed
p95 below 400 ms over 21 fresh processes per native target. Record raw samples,
Node version, CPU/power/load state, filesystem-cache policy and signing state.
Distinguish process-cold/warm-filesystem from first-install/cold-filesystem runs.
Load normalization remains diagnostic, not a way to turn a slow raw result into
a product-contract pass. A noisy CI machine is inconclusive and needs the
qualified reference measurement, not automatic budget inflation. This cannot
promise 400 ms on every conceivable machine. Browser network fetch, cached
startup, and worker ready are separate contracts.

The audited browser budget has a baseline of 187,049,102 uncompressed bytes,
25,160,189 gzip bytes and 15,556,467 Brotli bytes, with 5% compressed-growth
policy and eager-core caps of 17,600,000 gzip / 9,700,000 Brotli bytes. These
baseline values are not all absolute limits. Keep total, eager, lazy-component,
and largest-resource ceilings distinct; require a reviewed explanation to
change them. A percentage reset each release must not permit unbounded growth.
Cache compression reports by payload, tool/version/options and report schema;
evaluate current policy against the cached measurements separately.

### 2.5 Observed cost, not promises

Local checkpoint samples from the 0.8.0 campaign:

| Candidate / stage | Passing wall time |
| --- | ---: |
| `19789307` canonical numerical product (warm cache) | 4 s |
| `19789307` public runtime/full lazy preparation | 19.4 min |
| `19789307` public browser build | 16.4 min |
| `19789307` public pack | 9.3 min |
| `ef09d3c7` native timing reference | 7.3 min |
| `ef09d3c7` Chromium / Firefox / WebKit timing stages | 59.8 / 11.0 / 7.9 min |

Source: ignored `build/release-runner/<full-SHA>/<stage>.json` records in the
release checkout; retained operational context is summarized in
[the 0.8.0 audit](release-080-resumable-qualification.md) and
[Discussion 104](https://github.com/sagemathinc/sagejs/discussions/104).
These are individual observations, not statistical bounds or a sum of parallel
critical paths. The Linux ENOSPC failure occurred after 133 passing files at
about 45 minutes; the exact failing test passed 2/2 after space recovery.

## 3. Target architecture: components assembled into one product

Keep one repository and a simple installation. Do not start with dozens of npm
packages, independently versioned user-facing APIs, or a new orchestration service.

Extend [the package graph](../architecture/package-graph.json), rather than
inventing an unrelated second ownership registry. Add build/test closure and
target contracts where they are missing:

- compiler/language runtime and small startup kernel;
- representation primitives, native/Wasm ABI and external-library adapters;
- mathematical families and their lazy implementation packages;
- Node/browser/worker/CLI/kernel host adapters;
- composition, package metadata, signing, and publication.

Each component declares owned source, generated inputs, dependencies, exported
ABI/API, target capabilities, build recipe/toolchain, tests, and optional
resource/size budgets. Unknown ownership or an unresolved dynamic dependency
invalidates conservatively. Compiler/bootstrap/representation changes usually
have broad downstream effects. Merely sharing a function name is not provenance.

Retain existing parallel native family compilation and Wasm lazy packs. Make
their outputs independently addressable and verifiable before considering more
physical splitting. A single linked native pack or SEA may still contain many
logical components. Its final bytes require assembly/ABI/installation checks;
component qualification does not eliminate those checks. Do not add dynamic
library search/signing complexity just to obtain smaller build jobs.

Build immutable component outputs in candidate directories. Verify complete
files and source closure before atomically promoting them to the cache. Tests
mount/consume read-only artifacts and use separate writable scratch spaces.
The startup kernel must not import or initialize every mathematical component.

## 4. Separate identities and define safe evidence reuse

Use four explicit identities:

1. **Component input identity:** source closure, build recipe, dependency
   digests, ABI, compiler/toolchain and relevant build settings.
2. **Artifact identity:** exact distributed bytes, resource inventory and target.
3. **Validation identity:** artifact/component closure exercised, test and fixture
   closure, oracle, execution target/runtime, relevant environment and policy.
4. **Release identity:** selected artifact manifest, version metadata, source
   provenance, accepted validation inventory and publication policy.

Repository commit remains provenance. It is not the sole semantic cache key.
Record timestamps and builder facts without injecting them into execution-byte
identity. Never remove arbitrary metadata fields to force equality: define a
versioned canonical payload schema, retain the full original receipt, and prove
every executable/resource byte is covered.

Examples of intended invalidation:

| Change | Must rerun | Potentially reusable |
| --- | --- | --- |
| Documentation only | Source/doc/link integrity | Unchanged executable qualification |
| npm uploader | Publisher/authentication/transaction tests | Identical product artifacts and their math tests |
| Version metadata/root package layout | Repack, metadata/version/installation/startup acceptance | Unchanged component mathematical tests |
| Hyperelliptic source | Family and reverse-dependent tests on applicable targets; final assembly checks | Unrelated component evidence with proven independent closures |
| Parser, core runtime, representation ABI | Broad transitive mathematical/host qualification | Only components demonstrably outside that closure |
| Numerical verifier/policy | Re-evaluate authentic raw evidence against new verifier/policy; rerun collection if required fields or semantics changed | Raw observations whose artifact/test/oracle meaning is unchanged |
| Browser loader/worker protocol | Browser runtime, safety, payload, startup and adapter checks | Native-only components with no dependency on the changed inputs |

Never rewrite an old receipt's commit, platform, or collector to impersonate a
new run. A new acceptance record may reference unchanged authenticated evidence
and explain the proven equivalence. Numerical schema changes must update
assembler, publisher and deploy verifier together; the current source-current
gate is not silently relaxed. Recompute derived reports from immutable raw
observations; changing acceptance policy is not changing what was observed.

Content hashes prove integrity, not trusted origin. Admit release evidence only
from approved producers/transport (existing authenticated GitHub artifacts or a
defined persistent-host attestation path). Persistent-host checkpoints alone
must not gain publication authority by being copied. Initially, trusted CI can
produce final artifacts once without repeating broad campaigns; qualify the
exact CI bytes or prove the declared reproducible payload relationship. Before
promoting VM-built artifacts directly, define authenticated host identity,
source/toolchain records, isolated workspace ownership and artifact signing or
trusted upload. No production secrets in test receipts or untrusted PR jobs.

Correctness reuse and performance reuse have different scopes. Timing/memory
observations retain their producer machine and sampling protocol. Linux x64
evidence does not prove Windows or ARM execution. A strict measured-host check
and a transferred-evidence authentication check are different operations.

## 5. One supervised DAG, with cheap failure recovery

```text
frozen source + policy
        |
 component builds ---- component qualification
        |                         |
        +---- artifact assembly --+
                      |
       per-target installation / startup / capability acceptance
                      |
          signing + post-sign acceptance
                      |
          authenticated release manifest
                      |
     staged publication -> public verification -> pointer promotion
```

Reporting campaigns consume the same artifacts but are not ancestors of pointer
promotion. Required browser safety/coverage must not depend on timing reports.
Numerical browser work can begin when its exact Linux SEA and browser artifacts
are ready, not when the slowest unrelated native integration suite finishes.

Extend the current runner/coordinator rather than adding another release engine:

- Generate local-host and CI jobs from the same explicit node inventory.
- Persist run/node/attempt IDs, real process ownership, dependency states,
  immutable output inventories and structured failure reasons.
- Preflight disk/inodes, scratch peak estimates, Node/compiler/browser versions,
  source archives, native dependency catalog, oracle availability and signing
  configuration before expensive work. Missing authentication is actionable
  before qualification, even though signing occurs later.
- Reserve disk and resource slots; throttle correctness workers by CPU/RAM/disk.
  Startup/microbench measurements require exclusive measured-host slots.
  Build/test/reproduction mutations share an actual acquired lease, not a
  check that a lock file happens to be absent.
- Provision the oracle and full lazy cache as transactional outputs: verify and
  reuse a complete matching directory, or build a new one and swap it in.
- Record per-file success only after normal completion and output/input checks.
  Include fixtures, helpers, runtime/native resources, relevant environment and
  isolation assumptions in its key. Tests sharing mutable setup remain grouped
  until made hermetic. A resumed suite must account for every planned file;
  cancelled, skipped-required and never-started files are not passes.
- Distinguish assertion failure, infrastructure failure, noisy measurement,
  missing capability, authentication block and cancelled dependency. Retain
  failed attempts even if a later controlled retry passes. Retry only explicitly
  transient infrastructure failures automatically, with a bounded retry count.
- A node failure stops its dependents and its test siblings, not useful
  independent platform work. Status reports expose failures immediately while
  other jobs continue; do not hide them until `Promise.all` finishes.
- Provide `plan`, `status`, `resume` and artifact inspection operations. Show
  actual blockers, completed/reused files, disk headroom, critical path and ETA
  uncertainty. No opaque log-tail polling as the source of release truth.
- Apply retention to old unreferenced scratch/cache objects. Protect active
  leases and published artifact/evidence roots; preview deletions and archive
  valuable failure evidence before cleanup.

## 6. Promotion and publication

The immutable release manifest names the exact common npm archive, four platform
archives, SEA products, browser distribution, source/component identities,
capabilities, sizes, required evidence, policy version and signature state.
Use the existing platform naming mapping deliberately (`darwin`/`win32` npm
names versus `macos`/`windows` artifact labels).

Keep runtime support explicit: final npm acceptance must exercise the documented
minimum Node.js 22.22.2 as well as the release's pinned Node runtime (26.5.1 in
the audited workflows). SEA ships its own pinned runtime. Use a bounded CJS/ESM
compatibility matrix and expand affected coverage for compiler/ABI changes,
rather than assuming a green single-Node CI proves the advertised range.

Signing is an explicit transformation from unsigned digest to signed digest,
with identity/notarization evidence and post-sign installation/startup checks.
Do not assume unsigned artifact hashes equal signed ones. macOS signing remains
required; Windows unsigned alpha delivery is an explicit declared policy until
the user completes signing, not an invisible success substitute.

Publisher actions may download/authenticate/upload, never compile or choose an
unqualified fifth root tarball. Keep OIDC publishing in the workflow trusted by
npm (`ci.yml` today), or deliberately migrate trusted-publisher configuration.
Keep existing raw-evidence reconstruction and integrity-equality retry checks.
Do not replace them with "a green workflow exists" or a self-computed JSON hash.

Publish assets and npm versions into staging/non-default channels first. Check
the complete artifact matrix and fresh external installs; then advance the
common npm default channel, GitHub Latest and the published website/app pointer
through a journaled, idempotent promotion operation. These services do not offer
a cross-service atomic transaction: define ordering, retry, mixed-state detection
and rollback of mutable pointers. Never overwrite an immutable npm version or
move a tag. If npm version bytes are wrong, use a new version. A tag should select
already-qualified artifacts, not initiate the discovery loop.

Keep `website/published-release.json` independent of development `package.json`.
Pages may publish documentation from `main`, but must not advertise an unreleased
binary. Validate every listed download URL and platform before promotion. The
browser app consumes the chosen release manifest, not arbitrary current `main`.
Retain the prior complete release so mutable channels can be restored on a
public failure. Baseline expectations, URLs and docs must agree on the version.

## 7. Implementation sequence and acceptance criteria

Each phase is a reviewable change set. Do not turn this into a prerequisite to
finishing every internal modularity improvement before another alpha release.
Keep current enforcement until the replacement is tested and explicitly adopted.

### A. Inventory and bounded policy (first)

Deliver a generated, inspectable gate inventory and a versioned release policy,
extending existing stage/test metadata. Every command/file has an owner, purpose,
P/C/R class, target scope, dependency closure, time/resource budget and failure
semantics. Include native package scripts, specialized tests and transitive
workflow/API publication requirements. Unknown entries default conservatively
to required; new costly gates require a policy review and projected critical-path
delta. Remove duplicates only after matching their actual coverage.

Extract mathematical assertions from mixed benchmark tests. Move minor native
ratios and full browser timing campaigns to R; retain bounded correctness,
startup, size, interrupt and memory checks. Split workload enforcement so R
failure/missing timing data cannot block P. Update the whole-workflow publisher
check and deploy policy together, not just job labels. Keep all 16 numerical rows
and existing security evidence initially; defer their reduction until phase D.

Acceptance: inject a reporting timeout and show that required product acceptance
can succeed while reporting is visibly incomplete. Inject a wrong answer,
missing platform, startup/size breach or unsafe recovery and show promotion is
blocked. Run old/new selectors side by side to show no required mathematical
assertion disappeared.

### B. Operational reliability and file-level resume

Implement disk/toolchain/oracle preflight, transactional preparation, exclusive
leases, structured live status and per-file receipts. Preserve current
longest-first bounded scheduling. Separate timing history from success evidence.
Make stale-lock recovery inspect real process trees; controller disconnect must
not imply child termination or cause a duplicate launch.

Acceptance: simulate ENOSPC after file 133, interruption during build/cache
promotion, stale oracle output and a controller disconnect. Recover without
rerunning valid files or accepting a partial output. Mutating a helper, fixture,
native module, environment or test must invalidate affected receipts. Demonstrate
one Windows-native recovery, not only a POSIX mock.

### C. Artifact-set manifest and build-once promotion

Add a manifest schema and local fixture-backed publication state machine. Make
signing, npm publication, GitHub upload, Pages and app deployment consume it.
Generate trusted CI and persistent-host invocation plans from the same DAG.
Initially retain conservative whole-runtime validation identities; gain safe
publication retry and removal of duplicate builds before fine-grained reuse.

Acceptance: kill publication after two platform npm uploads, resume without any
compiler/test invocation, require integrity equality for existing versions, and
keep the public installer usable throughout. Reject mixed candidates, malformed
manifests, changed archive bytes, missing signing evidence and forged raw records.
Test the signed artifact, then verify real clean CJS/ESM/CLI/browser installs.

### D. Component closure and qualification reuse pilot

Pilot one bounded mathematical component and one packaging-only change. Extend
the existing package graph with generated-file/toolchain/ABI edges; unknown
dynamic imports require explicit declarations or conservative wider closure.
Use observed dependency tracing as a cross-check, not sole proof of completeness.
Separate raw observations, policy evaluation and release acceptance. Version
the numerical receipt/assembler contract and migrate consumers atomically.

Acceptance: a docs/uploader-only change reuses unchanged mathematical evidence;
an ABI/parser/oracle change invalidates the appropriate full reverse closure.
Reject poisoned caches, stale/mismatched source mappings, relabeled platforms,
missing transitive imports and altered policy. Show both positive reuse tests
and deliberate under-invalidation tests before expanding to other families.

Only then decide, case by case, whether numerical algorithm campaigns can be
qualified once per component/target while npm/SEA run a bounded acceptance
corpus. Signing/wrapping/loading changes always retain final-artifact checks.

### E. Build and measurement efficiency

Deduplicate full lazy-cache preparation; cache compression measurements; separate
memory sampling from ordinary timing repetitions; schedule independent outputs
in parallel with resource caps. Keep large native dependencies content addressed.
Expand component-scoped compilation only where measured critical-path savings
justify the complexity. Keep one simple SEA distribution.

Acceptance: unchanged component rebuilds invoke no compiler, a wrapper-only
change does not precompile all mathematics, identical payload reports require
no recompression, and adding a lazy mathematical package leaves startup work
unchanged. Reproduce changed output bytes on the appropriate independent target
builders; measure wall time, CPU-hours, peak RSS, disk high-water mark and bytes.

### F. Rollout, clean audits and governance

Run the new planner in shadow mode against the existing inventory. Compare
coverage, catches, cache decisions and actual final artifacts. Approve the
policy change in a dedicated integration change—not as an emergency bypass of
a currently failing correctness gate. Archive the old campaign honestly.

Separate qualification from clean reproducibility: initially keep existing clean
checks; once trusted production and binding rules are proven, require independent
clean rebuilds when the relevant build/toolchain closure changes and on schedule,
not every retry of publication. A reproducibility mismatch remains actionable;
do not hide it as a cache hit. Keep deterministic target behavior tests on every
supported target regardless of cross-build byte equality.

Acceptance: two successive artifact promotions, including an injected recovery,
without manual ignored orchestration scripts. No new tag needed to diagnose a
candidate. The public URLs and npm/browser/SEA version checks agree, and all
blocking evidence can be explained from one manifest and policy.

## 8. Success measures and decisions to settle

These are engineering targets, **not established current performance claims**:

- Planner/preflight should explain the graph and missing inputs in under two
  minutes without expensive builds.
- An interruption should lose at most active test files/build nodes, not hours
  of completed independent qualification.
- An unchanged-artifact promotion should require no mathematical recompilation
  or broad mathematical campaign. Target 10–20 minutes of automated final
  acceptance/promotion work on the reference hosts, excluding signing service
  queues and registry propagation; measure before making it a hard SLA.
- Warm small-component changes should have a critical path proportional to the
  affected closure; report broad compiler changes separately. Track critical path
  and CPU-hours, not only a deceptively low wall time from unlimited parallelism.
- Startup and eager payload budgets cannot be raised automatically to obtain
  green checks. Record measured baseline, resource headroom and owner decisions.
- Track release failure causes, rerun amplification, reused/invalidated work,
  manual interventions and the time from freeze to a verified public install.

Before enforcement changes, settle the startup reference-machine/protocol
details; absolute eager/total browser size ceilings; the compact per-component
correctness corpus; the persistent-host trust model; and the policy for known
alpha limitations. The implementation should bring concrete measurements and
coverage diffs to those decisions, not demand that the user design a scheduler.

The first milestone is **A + B + C**, not an all-at-once rewrite. They remove
unnecessary publication dependencies, stop losing completed work, and make
release artifacts explicit. D and E then make growth sustainable. None requires
turning Sage.js into many independently installed packages or reintroducing
SageMath's opaque dependency problems.

## 9. Implementation tracking

Work is isolated on `feat/release-process-v2`, based on the audited source, not
in the active frozen 0.8.0 candidate. Initial implementation:

- `b64e13cff` / `1816a8a7f`: Node/disk/inode preflight, durable attempt journals,
  read-only status and safe cancellation on log ENOSPC. The 21 focused runner
  and preflight tests pass on Linux x64 and native Windows x64. Actual Windows
  low-disk preflight also correctly refused execution. These are safety floors,
  not resource reservations or full toolchain/oracle preflight.
- `pnpm release:inventory`: generated shadow inventory of all 79 runner stage
  instances with direct package scripts, current test selectors, timeouts and
  proposed classifications. It explicitly does not yet cover the transitive
  workflow/API/shell, signing or numerical aggregation graphs. Unknown stages
  remain required and require review; no enforcement has been relaxed.

Phases A–F are **not complete**. Next: finish dependency inventory, separate
required assertions from reporting, add safe per-file resume and transactional
oracle preparation, then artifact-set publication. Current stage checkpoints
remain exact-candidate scheduling hints; they are not transferable evidence.
