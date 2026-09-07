# Plan: a robust and efficient Sage.js release process

Status: **proposal, not an authorization to bypass current release gates**.
Audit date: 2026-09-07. Source inspected: `origin/main` at
`8ebd868bf`; operational examples also come from the frozen 0.8.0 candidates
`ef09d3c7` and `19789307`. These are different scopes: measurements below do
not qualify newer `main`. This document does not change the active candidate,
publish anything, or claim that 0.8.0 qualification is complete.

## Executive decision

**Modularize release work before modularizing the public distribution.** Keep
one repository, a straightforward npm install and self-contained SEA products.
Make building, qualification, packaging, signing and promotion separate,
resumable operations over explicitly identified artifacts.

The immediate problem is not evidence that Sage.js is inherently unreleasable.
The audit identifies avoidable coupling: reporting lies on publication paths,
successful work is invalidated too broadly, and packaging/qualification repeat
expensive preparation. Fix those boundaries first. A wholesale mathematical
rewrite or a new build-system framework is not a prerequisite.

Read sections 2 and 7 for the audit and implementation sequence; section 9
distinguishes existing experimental tooling from adopted release behavior.
For a short implementation brief, start with **First bounded implementation
cut** in section 8. Section 2 records the audited baseline; later inventory
counts in section 9 describe subsequent experimental changes, not changes to
that baseline. Historical passing trials qualify only their named source and
artifact scope. This plan does not declare the release-process goal complete.
The first delivery should demonstrate three things:

1. A failed optional timing campaign cannot block an otherwise qualified
   product, but failed correctness, startup, size or platform checks still do.
2. A stopped campaign resumes valid completed work without accepting partial
   artifacts or concealing a failed attempt.
3. A partially published release can finish using exactly the already-tested
   bytes, without launching a compiler or repeating mathematical qualification.

This is a planning document. Proposed budget changes, evidence reuse and gate
reclassification require their stated validation before adoption. Existing
uncommitted prototypes are not proof that these milestones are complete.

## Implementation brief: what to do next

Read this brief first; section 9 is historical evidence, not a prerequisite
checklist to repeat. This planning refresh inspected committed release tooling
at `0e04e16c2` and the current experimental checkout on 2026-09-07. The shadow
inventory reports **85 stage instances, 43 workflow jobs and 114 potential
dependency edges**, with **seven unreviewed control steps and five incomplete
audit scopes**. These are not timings or proof of complete gate coverage.
`release:inventory --check` passing means its declared inventory is consistent,
not that all publication dependencies have been reviewed.

### First milestone: one recoverable promotion, not another release framework

Keep the existing runner, package graph, platform producers and numerical
verifiers. Deliver these bounded changes in order:

| Order | Deliverable | Completion demonstration |
| --- | --- | --- |
| 1 | Close the seven control-step reviews and trace publisher, recovery and both website/app consumers back to required product checks | Every promotion path has an explicit required closure; reporting timeout cannot block it and missing correctness evidence cannot pass |
| 2 | Finish exact artifact-set consumption using the existing raw numerical verifier, package checks and signing checks | All nine transport roles authenticate; inner SEA/npm/browser identities and signature state match the selected candidate; altered or mixed bytes fail |
| 3 | Journal publication and pointer promotion independently of builds | Interrupt after some immutable uploads, resume with integrity checks and zero compiler invocations; old public installer remains usable |
| 4 | Exercise the complete non-publishing candidate path, then adopt it in production | Four native targets and real browsers qualify the exact delivered bytes; owner-approved signing policy and required human review remain intact |

Do not grow this milestone to include independently versioned math packages,
general remote execution, broad cross-commit mathematical evidence reuse, or a
complete compiler refactor. None is necessary to prove safe publication retries.
Conversely, a downloader and a green fixture suite do not complete it: the real
publisher/deployer/recovery consumers must actually use the new boundary.

### Gate policy to implement, without blanket waivers

- **Always required product checks:** complete platform/format matrix, fresh
  installation, correct answers on representative packaged paths, safe native
  dispatch/fallback, startup, eager and total payload limits, bounded memory and
  recovery, artifact provenance and required signing.
- **Required component qualification:** full affected-domain semantics,
  sanitizers and oracle campaigns bound to their actual source/toolchain/ABI,
  target and test closure. Initially keep existing exact-candidate numerical
  evidence; introduce narrower reuse only through the phase D pilot.
- **Non-blocking reporting:** minor comparative speed ratios and repeated
  performance campaigns, after extracting any embedded correctness or safety
  assertions. A discovered mathematical defect still blocks the affected
  product; a 10 ms versus 15 ms observation by itself does not.

The current normalized startup gate is not the requested raw, usable-startup
contract: it includes ARM64 allowances above 400 ms and a 1,500 ms hard ceiling.
Measure the proposed ready-to-use protocol in section 2.4 before adopting new
thresholds. Do not claim the desired contract is already enforced.

### Scope and stop conditions

Extraction/publication-preparation tooling in the experimental branch
is **not an adopted release path**. Its scoped validation is recorded in section
9, not proof of completed production adoption. No new tag, publication, deployment, signing
environment modification or installer-pointer change is part of this planning
delivery. A missing signing authorization or source-current component eligibility
should be reported by preflight before launching a long candidate campaign.

After the first milestone, pursue file-level test recovery, validated dependency
prefix reuse and one component-closure pilot. Measure critical-path time,
recompiled inputs, peak disk/RSS and repeated work saved for each change. Expand
physical module splitting only when those measurements justify it. The release
manager should be able to explain a failure from one status record and retry the
failed node—not start another day-long campaign.

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

### First bounded implementation cut

Do not interpret A + B + C as permission to spend another release cycle building
a universal release framework. Deliver the smallest end-to-end path, then
expand it:

1. **Close the reporting boundary.** Inventory the actual prerequisite steps
   and artifact consumers for native and browser product acceptance. In
   particular, extract timing from the mixed `node-oracle` job as well as
   `browser-performance`; preserve mathematical parity and private-route checks.
   Introduce explicit product aggregate jobs covering all required matrix cells,
   reproduction, security, packaging and numerical evidence. Do not simply
   rename the old browser aggregate: whole-workflow success currently protects
   additional jobs outside its explicit `needs` list.
2. **Make publication consume the new boundary safely.** Update npm and app
   deployment together, keeping existing raw-evidence authentication. Bind job
   observations to repository, workflow, source, event/ref and run attempt;
   reject skipped, missing, duplicated or stale-attempt prerequisites. Test a
   retry race. A successful job observation is not artifact authentication.
3. **Prove one recoverable artifact campaign.** Use conservative exact-candidate
   identities, existing platform producers and a minimal manifest for the
   actual SEA/npm/browser outputs. Add only the journal states needed to resume
   these nodes and publication. Start with fixture-backed interrupted uploads,
   then a real candidate under the normal publication authority. Keep complete
   numerical qualification initially; cross-candidate reuse is not necessary
   to prove this improvement.

For each cut, report changed dependencies, preserved assertions, measured time
and resource use, fault-injection results, and remaining manual steps. If a
boundary cannot be proven, retain its current required status and name the
specific unresolved dependency. Do not resolve the uncertainty by endlessly
rerunning all platforms or by silently deleting a gate.

Planning recheck: the shadow inventory on `feat/release-process-v2` at
`b31c57508` still reports 79 runner stage instances, 40 aggregate workflow jobs,
91 potential edges and six additional API/control steps needing review. It
confirms the path `ci.yml#publish-release` → whole Wasm workflow success →
`wasm-release.yml#browser-performance`. This is a source-bound dependency
finding, not a claim that the complete assertion/artifact audit is finished.

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
  proposed classifications. It now also parses all 13 workflow files, retaining
  40 aggregate jobs and 91 potential edges. Source-bound reviews capture npm
  publication's whole-Wasm-workflow prerequisite and app deployment's whole
  Wasm/CI prerequisites. `--path` explains indirect paths; stale reviewed shell
  bodies/helpers, invalid YAML, unknown dependencies and cycles are rejected.
  Matrix conditions/tolerated failures are preserved, not evaluated. Six other
  API/control steps, external actions, artifact dataflow, transitive shell and
  numerical aggregation semantics remain unaudited. No enforcement is relaxed.
  YAML is a pinned development-only parser dependency. The inventory test no
  longer opts into source-only checkpoint reuse because it now loads that
  installed dependency; the other two source-only pilot tests remain opted in.
- `fc0e599e6` / `1c2f52dab`: opt-in isolated-file resume with complete candidate,
  generated-input, Node executable, host, environment and invocation bindings.
  Ten checkpoint recovery/fault tests pass on Linux and native Windows; the
  broader focused runner/metadata/UX set passes 54 tests on Linux. The real CLI
  executed, reused, and forcibly reran all three source-only pilot files.
  Native Windows tests used a small sparse worktree which was removed afterward;
  existing release artifacts were untouched. Input-mutation and storage-failure
  handling fail closed. This is not yet broad mathematical-suite reuse.
- `4723a4e44`: lease-aware transactional SciPy preparation now replaces the
  runner's non-resumable provisioning command. Full catalog/provenance/prefix
  verification and actual Python/NumPy/SciPy probing remain mandatory on reuse.
  Eleven transaction/lease tests pass on Linux and native Windows; ten existing
  oracle/provisioner tests pass on Linux. A real Linux prefix was provisioned
  from authenticated cached archives in this isolated worktree and then reused
  with unchanged binding/provenance IDs. Repeat full verification took 1.65 s;
  the actual runner stage passed in 2.24 s and subsequently reused its verified
  stage checkpoint. These are single observations, not timing gates. Previous
  directories and partial attempts are retained; retention policy, other native
  oracle-platform integration runs and transactional lazy-cache preparation
  remain to be completed.

Phases A–F are **not complete**. Next: finish dependency inventory, separate
required assertions from reporting, audit more files for the resume contract,
extend transactional preparation and its platform coverage, then artifact-set
publication. Current stage checkpoints
remain exact-candidate scheduling hints; they are not transferable evidence.

A dedicated shadow browser workload acceptance collector now executes the same
21 benchmark sources cold/warm, with one observation per phase and no memory
sampling. Its separate receipt validates private routes in both phases, exact
workload/budget/source identities and the existing 5,000 ms interrupt ceiling.
The CLI verifies the same-commit production artifact before and after execution.
Dashboard acceptance-only mode requires an explicit source and cannot use timing
reports as route authority. Fixture tests preserve the complete corpus/shards,
reject lost telemetry, failed evaluation, unsafe interrupts and missing engines,
and detect unexpected portable routes seen only in cold execution. The default
runner and CI still use the existing gates until real three-engine validation
and migration of the complete publication/deployment dependency chain. This
does not replace mathematical oracles or dedicated resource-safety tests.

Read-only collector trial on 2026-09-07: the new shared execution loop, with
memory collection disabled, ran the unchanged 21-case corpus against the
retained `19789307151662045ca942ad8ea30dcea4b6f6fa` browser artifact. Artifact
identity `sha256:7d726ed06c858b73c1a7a9994255bc5bf4c9334270defafb221808f4ef9c6eb2`
verified before and after. All cold/warm private-route validators passed:

- Chromium: 42 evaluations, 134.08 s total, interrupt 0.535 ms.
- Firefox: 42 evaluations, 219.91 s total, interrupt 0.660 ms.
- WebKit: 42 evaluations, 157.99 s total, interrupt 1.080 ms.

These are single observations under ordinary host load, not a like-for-like
benchmark against the former repeated timing campaign or new timing gates.
The trial served the retained artifact read-only, wrote no qualification
receipts and did not rebuild or relabel it as the new branch. It tests the
collector, not the new candidate's mathematics or complete CLI qualification.
The focused acceptance/dashboard/release-gate/inventory and runner/recovery sets
pass 85 tests on Linux, and `merge:check` passes. The full `architecture:check`
was attempted but stops at the FFI CLI because this isolated worktree has no
`dist/tools/cli`; its generated workload projection check passes independently.

The next publication-boundary building block is a read-only, attempt-scoped
GitHub job verifier (`scripts/release/product-acceptance.cjs`). It requires
explicit native/browser v1 aggregate names and a successful prerequisite
assertion, not a whole-workflow conclusion. Repository/source/ref/event and
both before/after run identities are checked; incomplete, duplicated or
foreign-attempt pagination and retry races fail closed. Qualification cannot
impersonate tag publication. Nine verifier tests plus thirteen existing
publication/inventory tests pass on Linux. A real read-only inspection of
successful scheduled run `34080875618` correctly rejected its legacy aggregate
name: that historical run does not implement the new contract. The new source-only
verifier test is an isolated-file resume pilot; it does not call GitHub.

No current publisher/deployer uses this verifier. Adoption must prove complete
prerequisite coverage and preserve raw artifact/numerical authentication;
passing status fixtures alone cannot prove mathematical or platform coverage.

Browser workflow integration now collects the cold/warm acceptance receipt
alongside each engine's full parity receipt. Workload enforcement consumes only
those six explicit files, with exact-candidate acceptance enabled; no timing
receipt is an input. The local browser profile enforces workload coverage before
its four still-required timing stages. A new v1 browser aggregate asserts the
complete ten-job prerequisite set, including the build/reproduction/Windows/Node
jobs outside the old five-job browser aggregate. Tests bind its exact `needs`,
assertion command and matrix coverage, reject every unsuccessful or missing
prerequisite, and ensure new unclassified jobs cannot silently evade the set.

This is a transitional branch integration, not production adoption: legacy
browser-release-gates and whole-workflow publication guards remain, and
`node-oracle` still contains repeated timing collection. The native aggregate,
native-timing extraction, publisher/deployer migration and exact-candidate
collector validation remain outstanding. The focused runner, inventory,
acceptance, prerequisite, workload and artifact-gate set passes 73 Linux tests.

Exact-candidate preparation trial at `75b3e3581541640ea8b536036a765335e919d19a`:
the resumable canonical run stopped in 5.73 s at `numerical-product`, before
runtime/browser compilation. The cached toolchain and numerical reactor builds
succeeded, but `verify-release.cjs --require-qualified` correctly rejected the
checked-in pending NLopt qualification state. The failed attempt and logs remain
under `build/release-runner/75b3e3581541640ea8b536036a765335e919d19a/`; this is
not a passing canonical checkpoint or a collector CLI qualification.

The scope mismatch is concrete: `ci.yml` applies this eligibility check only to
tagged products, whereas the local canonical preparation stage always requires
it. The existing development verifier explicitly permits source-current pending
artifacts for development builds. Before using this runner to prepare a new
candidate for qualification, separate non-publishing preparation from release
eligibility. Do not remove the tagged-product check, relabel pending evidence as
qualified, or rerun a full four-platform campaign merely to test collector
plumbing. This finding adds a preparation/admission edge to phase A/B's audit;
it does not establish that the underlying mathematical qualification is cyclic
or unnecessary.

Preparation/admission split: the explicit non-publishing `preparation` profile
now builds the numerical handoff, runtime, browser artifact and common npm
archive without claiming qualification. The `canonical` profile still requires
the same qualified-NLopt command in a separate `numerical-eligibility` stage,
before runtime/packaging as previously enforced. Tagged CI's admission check is
unchanged. Run journals identify profile and selected-stage scope and explicitly
deny publication authority. A test demonstrates that a passing preparation
checkpoint cannot satisfy a failed eligibility stage. The inventory now has
84 stage instances: four preparation instances and the extracted eligibility
instance are additional, not 84 mandatory sequential release steps.

An exact preparation run exposed two additional operational gaps: missing parser
submodules failed after build launch, and a long stage's durable elapsed field
stayed at its start value. The follow-up `feat/release-preflight-status` checks
the complete selected plan's three required parser pins and source files before
any command executes. It is read-only, does not initialize optional upstream
repositories, and retains the existing clean-candidate requirement. Status now
adds explicit read-time observation ages/wall times without rewriting historical
records or claiming progress for a missing/unknown process owner. These changes
do not change mathematical acceptance, performance budgets or artifact payloads.

Validation of `e0ecd663c`: 59 focused Linux tests and `merge:check` pass. The
30 source/preflight/runner tests also pass on native Windows x64 with Node
26.5.1, using a SHA-256-verified 300 KiB source bundle and real local Git
submodule fixtures, not a full product build. Initial sparse bundles omitted
files read by existing gate-partition tests; adding those tracked inputs fixed
the test harness without changing code or assertions. The temporary Windows
bundle was removed afterward; existing release artifacts were not modified.
Actual read-only inspection accepts the initialized pins in the ongoing
`f9384a408` preparation checkout and rejects all three missing modules in the
new worktree. The updated status observer correctly reports the live campaign
and stage wall time while retaining the older durable journal's values.

Exact-candidate preparation at `f9384a408499accf60d348df28dd473e1855ce33`
completed the selected numerical-product/public-runtime/public-build stages in
1,451.503 s. Numerical preparation reused its verified checkpoint; runtime plus
the complete lazy cache took 768.241 s, and browser assembly/receipt/size checks
took 681.918 s. Repeating the identical command reused all three checkpoints in
1.894 s without running their build commands. The failed earlier attempt remains
in the run history. These are single local observations, not a full preparation
profile (root packing was not selected), release qualification or an SLA.
The full `architecture:check` now also passes with the prepared runtime.

The resulting production artifact is
`sha256:f8be73f49dbe4808dc8477ca77d9b70b9bca4647de2a1955c8523eb01cd60361`.
It passed the existing payload budget without changing thresholds. This provides
an exact-source artifact for the new collector CLI, unlike the earlier read-only
shared-loop trial on the retained 0.8.0 artifact. Keep that distinction when
interpreting or transferring results.

The actual same-commit collector CLI passed on Chromium, Firefox and WebKit,
each with all 21 workloads cold and warm (42 evaluations per engine), validating
the production receipt and unchanged source/artifact identities before and after
collection. Receipts are under `build/wasm-acceptance-{engine}.json` in the frozen
`robust-release-process` checkout at `f9384a408`. At most two read-only browser
collectors ran concurrently, using separate sessions/output files; ordinary
timing ratios and memory sampling were not collected. Full mathematical parity,
dedicated resource/safety qualification and the complete publication-boundary
migration remain outstanding; these three acceptance receipts do not authorize
a release or deployment.

### Native workload/reporting follow-up

The following describes the implementation on `feat/release-native-acceptance`,
not adopted production behavior. The focused acceptance, runner, inventory,
prerequisite, numerical-workflow and deployment-workflow tests pass 84/84;
`merge:check` also passes. Production qualification remains separate.

Native workload/reporting separation: the proposed required Node oracle retains full
release parity and all 21 additional benchmark sources cold/warm once, with
failed evaluation/interruption and the finite absolute interrupt ceiling still
blocking. Minor timing ratios, seven-pass repetition and memory sampling are
not acceptance prerequisites. The existing v2 receipt labels this purpose
explicitly; browser/native ratios against its single observation are diagnostic,
not a newly qualified statistical baseline. The workflow reuses its existing
native build and does not add another artifact transfer or build job.

The local `browser` profile now contains product checks only, including the new
native acceptance stage. The separate `reporting` profile retains all four
original timing commands and consumes the same prepared inputs without build
commands. Current inventory has 85 instances across those profiles; counts are
not a sequential critical path. Wrong-answer/interruption fault injection and
full corpus equivalence are tested; successful product checkpoints remain
reusable after a separate reporting failure, but a changed failing correctness
command still fails. Actual native CLI qualification and the native/browser
aggregate, publisher and deploy migration remain required before production
adoption. No raw numerical, startup, size, signing or source guard is removed.

Native aggregate follow-up: the tagged workflow now defines the native v1
acceptance job over all ten release producers, with an unconditional-on-failure
assertion scoped to tags. Its exact dependencies include every native platform,
signing, shared root and numerical reconstruction. The publisher adds this
prerequisite without deleting its numerical gate or external Wasm check.
Fixture tests reject every missing/failed/skipped producer, cross-product
substitution and undeclared jobs; the actual native CLI assertion passes its
complete fixture. The focused prerequisite/job-inspection/inventory/numerical
workflow/deployment suite passes 44/44. These are contract tests, not a new
four-platform release qualification. Deployment, publication recovery and
artifact authentication must be migrated together before dropping their legacy
whole-workflow requirements.

Recovery audit finding: `select-recovery-publisher.cjs` intentionally searches
all attempts and selects the latest occurrence of each producer, then reruns
only the original trusted publisher. The new job verifier instead requires a
single current attempt. A fixture modeling a publisher-only retry correctly
rejects missing current-attempt acceptance and a relabeled older aggregate.
Do not wire that verifier into recovery as a drop-in replacement: first bind a
qualified producer attempt and immutable artifact IDs/digests in the release
manifest, separately from the publication attempt. Authenticate those bytes on
retry and reject changed producer evidence. This makes the minimal artifact
manifest/recovery work a prerequisite of the complete consumer migration,
not an optional later optimization. The existing recovery path is unchanged.

Artifact transport inventory foundation: `scripts/release/artifact-set.cjs`
captures nine reviewed product/evidence container roles from both accepted
producer runs, checks pagination and immutable-ID re-reads, and repeats both
product observations to reject capture-time retries. The versioned manifest
separates qualification attempts from subsequent publication attempts and
binds archive IDs/digests/size/source/repository. Recovery verification never
substitutes a new same-name artifact. Streamed local verification rejects
altered/truncated ZIP bytes. Its self-hash is explicitly not provenance or
release authorization; trusted manifest production/retention and inner product,
signature and raw-evidence authentication still need integration.

The focused suite passes 56 tests including source mixing, changed/expired pins,
duplicate/incomplete matrices and qualification-versus-release substitution.
A real read-only 9,130-byte GitHub artifact download (ID `9988827252`) matches
its API SHA-256 and byte count, confirming the ZIP transport interpretation.
This historical reporting artifact is only a transport-format check; it is not
new candidate qualification. No public artifact or pointer was modified.

The manifest supports pre-tag qualification identities, but the existing native
workflow still limits full signing/numerical aggregation to tags. A complete
explicit non-publishing qualification mode is therefore required before real
pre-tag capture. Do not create a tag just to test this foundation or mislabel
a partial manual run as a qualified candidate. The aggregate/manifest protocol
must be exercised in that mode before retiring legacy publication guards.

Native Windows validation of `428b2723b`: all 11 artifact-set tests pass under
Node 26.5.1 in 1.51 s, including streaming ZIP checks and the exact workflow
role inventory. A SHA-256-verified 1,024,000-byte source/dependency bundle was
used; no Sage.js native rebuild or existing release directory was involved.
The temporary Windows source fixture and archive were removed afterward.
This is portability evidence for the manifest foundation, not full Windows
product qualification or authenticated live publication.

Explicit pre-tag CI mode: `qualify_release=true` plus a matching full
`candidate_sha` now enables the complete native signing/numerical producer
closure and browser provenance without enabling publication. Admission rejects
partial/smoke/recovery combinations before installation/build in the root jobs.
The publisher now requires a tag push event: a manual dispatch at a tag is not
publication. Fixture expression comparisons ensure every conditional release
producer step also executes for a full candidate, across all Windows signing
modes. The focused set passes 83 tests, release metadata and merge checks pass.
No full workflow has been dispatched; fixture checks are not hosted qualification.

Read-only environment audit found that `sagejs-signing` allows only `v*` tags
and retains a required human reviewer. Exercising pre-tag signing needs the
owner's approval to allow one dedicated candidate branch; no protected policy
was changed. Keep review, source-current component eligibility and all existing
raw numerical checks. In particular the pending NLopt state remains an explicit
qualification failure, not a reason to relax admission or launch a doomed long
campaign. This configuration issue was found before any expensive CI dispatch.

Resumable download staging now uses the existing directory transactions and
leases for each pinned GitHub ZIP. It revalidates cached bytes, recovers complete
pending downloads, replaces only corrupt/missing entries, and retains earlier
copies and failed preparation. A trusted manifest digest is mandatory; cached
verified bytes can survive remote expiry without selecting a newer artifact.
Streaming enforces the pinned byte count and a ten-minute deadline, with a
download-specific disk/inode preflight and explicit cancellation. No archive
extraction, compilation, signing or publication occurs in this stage.

Validation: 79 focused Linux tests and merge checks pass; all 21 staging and
directory-transaction tests pass on native Windows Node 26.5.1 in 1.91 s.
The Windows source bundle was expanded after two attempts revealed omitted
test dependencies; the complete bundle passes without a Sage.js rebuild.
Faults cover interrupted downloads/installation, changed bytes, missing remote
pins, disk preflight, concurrent writers, deadlines and cancellation even during
the final installation. A real historical 9,130-byte GitHub download also
matched its API ZIP digest; this is transport evidence, not qualification of
a new candidate. Authenticated manifest retention, inner-product validation and
publisher/deployer/recovery adoption are still required before this cache can
participate in release promotion.

Authenticated handoff retention is now implemented as a separate manual,
non-publishing `release-artifact-handoff.yml` workflow. It captures the accepted
product transport manifest in one bounded job and retains a non-overwritable
attempt-specific artifact. The consumer pins the reviewed control-code commit
separately from product source, queries the exact historical capture attempt,
requires its capture/upload steps to succeed, verifies repository and immutable
artifact identity plus ZIP hash/size, and decodes exactly one bounded JSON
member without filesystem extraction. Its `stage` entry point passes that
authenticated manifest directly into resumable ZIP staging, rather than asking
the operator to trust a self-hash copied from arbitrary JSON.

Validation: 71 focused Linux tests and merge checks pass; all eight handoff
tests pass on native Windows Node 26.5.1 in 0.85 s, using a verified small source
bundle removed afterward. An actual historical GitHub run-attempt API response
confirms the identity fields used, but no new capture workflow was dispatched.
Fixture tests cover wrong control/product identities, incomplete/skipped capture,
foreign/replaced/expired artifacts, malformed/duplicate/path ZIP members, and
authenticated staging followed by reuse. The shadow inventory now includes 43
jobs and flags the new cross-workflow helper for explicit dependency review.

This closes the staging handoff's manual trust gap, not end-to-end release
adoption. GitHub retention is 90 days; deleted/expired handoff authentication
still fails closed. Saved local verification JSON is not an attestation or
permission for indefinite offline promotion. Permanent authenticated archival,
inner-product/signature/raw-evidence validation and coordinated publisher,
deployer and recovery migration remain required. Existing publication guards
and signing environment policy are unchanged.

The source-only publication consumer now joins authenticated handoff, bounded
outer-ZIP extraction, canonical input projection and the existing numerical
assembler/authenticator under the shared runner. It requires a dedicated clean
product checkout, refuses built/frozen producer directories, rechecks projected
hashes after verification and preserves failed gates/copies for recovery. ZIP
layout tests bind the nine extraction roles to actual workflow upload paths.
The shared SciPy ZIP reader retains its original wheel limits and policies;
release extraction uses a bounded random-access view and streamed payloads.

Validation: 118 focused Linux tests pass, including the existing real numerical
assembler/authenticator contract tests; merge inventory checks pass. Native
Windows passes 18 handoff/extraction tests plus an actual parent-cancellation
test. Its temporary fixture/archive/helper were removed. An additional Linux
fault case verifies that a successful verifier cannot certify another projected
input that it changed. The consumer's positive end-to-end test deliberately uses
small source-only CLI fixtures: it proves retry, preservation, exact byte checks
and checkpoint reuse, **not** source-current numerical qualification of Sage.js.

This does not yet check platform inner-package signatures or bind reproducible
browser bytes into an adopted publisher/deployer. No full candidate was built,
tagged or published; no runtime payload, budget, signing policy or public pointer
changed. The next integration must connect the exact staged inventory to those
remaining real consumer checks before replacing legacy publication guards.
