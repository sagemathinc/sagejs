# Releasing Sage.js

Sage.js releases should be boring publication events, not the first complete
test of a candidate. The expensive GitHub workflows provide independent
release evidence, signing, and publication. They are deliberately the **last**
step in the process.

This document complements [TESTING.md](TESTING.md) and
[DISTRIBUTION.md](DISTRIBUTION.md). It is the release playbook for both people
and coding agents.

See the [0.8.0 resumable qualification record](agents/release-080-resumable-qualification.md)
for a completed pre-tag campaign and its remaining optimization lessons.

## The three testing loops

Keep these loops separate so ordinary development stays fast and release
qualification remains meaningful.

1. **Routine push CI** should finish quickly, fail fast, and answer whether a
   change is safe to merge. It runs deterministic architecture, compiler,
   strict-Python, unit, startup, and small platform-smoke gates. It must not
   rebuild every native dependency or run the full browser/performance corpus.
2. **Cached release qualification** runs the exact release commands on the
   persistent `bench-1` (Linux x64), `bench-arm` (Linux ARM64), `m1` (macOS
   ARM64), and `windows` (native Windows x64) hosts. Reuse their native and
   compiler caches. Iterate here until all four hosts pass.
3. **Clean release CI** rebuilds from authenticated sources on GitHub-hosted
   runners, checks reproducibility, signs artifacts, and publishes them. Run it
   once for a candidate which already passed cached qualification.

Do not use immutable tags as the edit/test loop. A late failure in a clean
four-platform build can otherwise cost an hour and require another tag even
when the fix is a one-line test-portability correction.

## Release invariants

- Freeze one exact source commit and record its full SHA.
- Make that commit reachable from `origin/main` before production deployment.
- Run native Windows, not WSL, MSYS2, or MinGW.
- Test the public npm tarballs and SEA archives, not only the source checkout.
- Keep routine and release-only timing budgets distinct. Routine gates should
  be short; tagged SEA builds may have realistic 90–120 minute ceilings.
- Normalize platform facts deliberately: launch JavaScript CLIs through the
  repository helper on Windows, accept CRLF where output is line-oriented, and
  use `test/helpers/sanitizers.cjs` for sanitizer capability differences.
- A release tag and a published npm version are immutable. Never move, delete,
  or reuse them. If a published or tagged candidate needs a source change,
  increment the version. Before npm publication, recovery tags such as
  `v0.4.1+release.2` may identify successive immutable candidates, but they
  must also never be reused.
- npm publication uses GitHub/npm Trusted Publishing (OIDC), not a long-lived
  npm token. macOS signing/notarization and optional Windows signing happen in
  the protected GitHub release environments.
- Only a Sage.js product release tag such as `v0.4.1+release.23` may own
  GitHub's **Latest** pointer. Keep `website/published-release.json` pinned to
  the last completely published product; never derive that pointer from the
  development package version. The website installer is staged from that
  published release. Also protect `releases/latest`, used by direct GitHub
  installation paths: benchmark evidence, optimizer snapshots, and
  native dependency catalogs must be created with `--latest=false` (or as a
  prerelease). The release-event guard restores the highest published product
  version if an infrastructure release is accidentally made latest.
- Do not publish when a required gate is skipped, timed out, or merely passed
  on an older commit.

## Recommended release sequence

### Resumable execution (required before tagging)

`pnpm release:inventory` generates an inspectable **shadow** inventory of all
runner targets/profiles, direct package-script bodies, declared input/output
boundaries, timeouts, existing test selectors and proposed P/C/R classifications.
`pnpm release:inventory --check` detects unreviewed runner stages, stale policy
entries, unresolved direct package scripts, detected unreviewed control steps
and drift in reviewed API checks. It is not a release acceptance
command: stages remain required within the selected profile. The explicit
`reporting` profile is separate from local browser product acceptance; the
legacy GitHub whole-workflow publication guards still require reports until
their coordinated migration.
The inventory also parses every workflow with YAML 1.2 and preserves job `needs`,
conditions, matrix strategies, timeouts, tolerance and exact step bodies. The
source-bound API review registry distinguishes whole-workflow/job success,
artifact data inputs and dispatch/pointer effects used by publication/deployment.
Effects are not completion prerequisites. Changed check bodies, helpers or
declared producer artifact names require review.
For example, inspect the potential dependency path without running any jobs:

```sh
pnpm release:inventory --path 'ci.yml#publish-release' 'wasm-release.yml#browser-performance'
```

This is a conservative potential graph, not a GitHub expression interpreter.
Matrix cells stay aggregate nodes; reviewed artifact inputs may bind an explicit
literal cell of a simple static matrix. A conditional dependency is not proof that
the job runs or that every failure blocks. Unreviewed API/control steps are
listed, and external actions, unreviewed artifact dataflow and transitive shell behavior
remain explicitly incomplete. A null path does not prove independence while
those scopes remain unaudited. No policy change is authorized by this inventory.

The new **shadow workload acceptance collector** extracts required execution,
private cold/warm route telemetry and the existing interrupt ceiling from the
21-case benchmark corpus. It runs each source twice, with no timing ratios,
repeated samples or `measureUserAgentSpecificMemory` calls. It requires a clean
checkout and a verified, same-commit production artifact, rechecked afterward:

```sh
pnpm wasm:workload-acceptance --engine chromium --output build/wasm-acceptance-chromium.json
```

Repeat for Firefox and WebKit; `--shard INDEX/COUNT` retains the complete,
deterministic workload partition. Feed these receipts **and** the full parity
receipts to `wasm:workload-enforce --acceptance-only --source-revision FULL_SHA
--explicit-receipts-only --receipt FILE ...`. This mode cannot substitute a
performance report for acceptance, and still requires every policy engine and
route. Receipts use `sagejs.browser-wasm-workload-acceptance/v1`, not a fabricated
performance baseline. Content identities do not authenticate the producer;
trusted transport remains part of release qualification.

The release-process branch now collects these receipts immediately after each
engine's parity test, in both the browser runner profile and Wasm workflow.
Workload enforcement reads only the explicit parity/acceptance files. Local
browser acceptance and repeated timing use separate profiles. The legacy
whole-workflow publication guards are retained during validation. Tests
prove source/route preservation, no memory sampling, and failure handling. A
read-only three-engine trial of the shared execution loop passed against the
retained `19789307` artifact (see the release-process plan); it is not
qualification of this branch. Exact-candidate browser collector CLI runs now
pass at `f9384a408`; full parity and the complete publication dependency
migration remain required before adoption. Mathematical parity,
startup, size, numerical evidence and dedicated memory/security gates are not
replaced by route acceptance.

`scripts/release/product-acceptance.cjs` is the read-only job-status verifier
for the explicit product boundary. It is not wired into publication yet.
The Wasm workflow now has the v1 browser aggregate, asserting all ten required
job families (including clean/cross-platform builds, Windows, reproducibility,
Node and browser parity, workload routes and security/recovery). The native v1
aggregate is not yet installed. Old successful workflow/job names deliberately
do not satisfy the new contract.

```sh
node scripts/release/product-acceptance.cjs \
  --kind browser --run-id RUN_ID --sha FULL_SHA \
  --ref IMMUTABLE_TAG --event push --purpose release
```

The verifier checks the fixed repository/workflow, source, ref and event,
reads the complete attempt-specific job list, then re-reads the run to reject
attempt changes. Only one successful product job with its successful required
assertion step is accepted; missing/skipped jobs or steps fail closed. Explicit
pagination supports the persistent hosts' older `gh` versions. Use `--kind
native` for the native boundary. Manual/scheduled observations must explicitly
use `--purpose qualification` and their actual ref/event; they cannot pretend
to be tag-release observations.

A report job may fail or remain in progress independently of a passed product
boundary. That is only a job-status observation, **not permission to publish**:
trusted source selection, exact artifact/signature checks and raw numerical
evidence reconstruction remain mandatory. No current whole-workflow guard is
removed by adding this verifier.

The native v1 aggregate runs on tags and explicit full pre-tag candidates even
if prerequisites fail. It
asserts all ten release producer jobs explicitly: routine validation, numerical
runtime, shared npm/browser root, four native builds, macOS signing, browser
numerical evidence and the final reconstructed numerical gate. The publisher
requires this aggregate in addition to its existing numerical gate. A partial
manual campaign cannot produce release acceptance. Smoke-only, publication and
recovery jobs are deliberately outside the producer aggregate. Both native and
browser prerequisite assertions require an explicit product kind; tests bind
their exact workflow dependencies and reject missing/skipped/failed producers.
External publisher/deployer job inspection still needs coordinated adoption;
the existing same-tag Wasm whole-workflow requirement remains in force.

### Frozen artifact transport inventory

`scripts/release/artifact-set.cjs` captures the nine required GitHub artifact
containers: four signed/declared-policy platform bundles, the shared npm/browser
root, numerical gate and raw evidence, browser clean-build and reproducible
browser bundle. It records immutable artifact IDs, ZIP SHA-256 digests and byte
counts, source/ref/event, and distinct native/browser qualification run/attempt/
aggregate-job identities. It re-inspects both accepted product boundaries after
the artifact reads and rejects a concurrent qualification retry.

```sh
node scripts/release/artifact-set.cjs capture \
  --sha FULL_SHA --ref IMMUTABLE_TAG --event push --purpose release \
  --native-run NATIVE_RUN_ID --browser-run BROWSER_RUN_ID
node scripts/release/artifact-set.cjs verify \
  --manifest artifact-set.json --expected-digest sha256:AUTHENTICATED_DIGEST
node scripts/release/artifact-set.cjs verify-archive \
  --manifest artifact-set.json --expected-digest sha256:AUTHENTICATED_DIGEST \
  --key native/sagejs-linux-x64 --file downloaded-github-artifact.zip
```

Capture writes JSON to stdout and never publishes or downloads product archives.
Store the manifest in a trusted immutable handoff before using it for recovery.
The expected digest must come from that authenticated handoff, not merely be
copied out of an untrusted JSON document. A self-hash proves neither trusted
origin nor release eligibility. Verification uses pinned IDs, never a new
same-name artifact. Deletion/expiry fails explicitly; recovery must retain the
original bytes and authenticated transport record rather than silently rebuild.
Archive verification streams bytes without extracting or executing them.

For pre-tag capture the identity supports `--purpose qualification --event
workflow_dispatch --ref CANDIDATE_BRANCH`; every required product boundary must
still have passed. Use the explicit full mode below, not ordinary partial manual
campaigns. Changing the purpose in an old manifest is not promotion.

This schema is a **transport inventory**, not the complete release acceptance
manifest. GitHub's archive digest covers its downloadable ZIP, not directly the
inner SEA or npm tarball. Consumers must additionally authenticate the manifest
producer, verify inner product digests and platform/version matrix, reconstruct
raw numerical evidence and check signatures. Publication attempts must reference
the frozen qualification identity without relabeling it as their own attempt.
No current publisher/deployer consumes this inventory yet; existing guards remain.

### Resumable artifact download staging

For a trusted retained handoff, prefer the authenticated entry point in the
next section over manually transferring a manifest digest.

Given an independently authenticated manifest handoff, stage its exact ZIPs in
an existing dedicated, canonical cache directory:

```sh
node scripts/release/stage-artifacts.cjs \
  --manifest artifact-set.json --expected-digest sha256:AUTHENTICATED_DIGEST \
  --directory /absolute/path/to/existing-artifact-cache
```

Repeat the same command after a failure. Each archive has its own recoverable
directory transaction beneath the manifest digest. Every reuse rechecks bytes
and SHA-256; a complete pending download may be freshly verified and installed
without downloading again. Missing or corrupt entries require current remote
pin verification. Valid cached bytes remain usable offline or after remote
expiry because the authenticated frozen manifest, not a newer same-name
artifact, supplies their identity.

Downloads are sequential, streamed, limited to the pinned byte count and a
ten-minute deadline. Preflight requires the archive size plus 64 MiB free space
and, where reported, 64 free inodes. Existing partial/previous copies already
consume that free space and are retained for inspection; this command does not
garbage-collect them. Leases reject concurrent writers. If a controller dies
without releasing its lease, inspect its actual process/children before stale
lock recovery; do not start a second downloader merely because status is old.

Progress goes to stderr and the verified file inventory to stdout. Cancellation
does not report a completed set, including during the final installation. This
is only a verified download cache: it never extracts or executes archives,
builds, signs, publishes, or authorizes promotion. Inner-product, signature and
raw-evidence verification remain mandatory in the consuming release process.

### Retain and authenticate a qualification handoff

The manual `release-artifact-handoff.yml` workflow captures a complete accepted
native/browser artifact set without building or publishing. Dispatch it only
after both product aggregates pass, using a reviewed control branch and the
explicit product source/ref/event/purpose and native/browser run IDs. Its one
read-only-permission job uploads `artifact-set.json` under the immutable name
`sagejs-artifact-set-attempt-ATTEMPT`; overwrite is forbidden. Retention is
90 days, not permanent archival. Record its run ID, attempt, artifact ID and
full **control** commit independently of the product commit.

The control commit may differ from the product commit: correcting transport
tooling does not itself require recompiling previously qualified mathematics.
Consumers must explicitly trust that control commit; an arbitrary fork or
same-named workflow does not qualify. Native/browser qualification still binds
the original product source and attempts. The capture workflow does not change
their policy or turn qualification-purpose evidence into a published release.

The consumer runs from the control checkout with its normal pinned dependencies
installed (including the existing `fflate` ZIP reader); the capture workflow
itself uses only Node built-ins and `gh`, without installing or building Sage.js.

After obtaining the pinned handoff ZIP, verify it and stage its product ZIPs:

```sh
node scripts/release/artifact-handoff.cjs stage \
  --run-id HANDOFF_RUN_ID --attempt HANDOFF_ATTEMPT \
  --artifact-id HANDOFF_ARTIFACT_ID --control-sha REVIEWED_CONTROL_SHA \
  --sha PRODUCT_SHA --ref PRODUCT_REF --event workflow_dispatch \
  --purpose qualification --archive handoff.zip \
  --directory /absolute/path/to/existing-artifact-cache
```

Use `verify` without `--directory` to authenticate only the local handoff ZIP.
For tagged producer runs, use their exact tag, `--event push` and `--purpose
release`; these must match the captured manifest. This verifier uses the
authenticated GitHub API's exact historical run-attempt/job records and immutable
artifact ID/digest. It requires successful capture/retention, rejects foreign
or expired handoffs, and verifies the bounded one-file ZIP before decoding JSON
in memory. It never extracts handoff members to disk. Repeating staging then
reuses valid product archives without reinterpreting later workflow attempts.

The machine result contains the authenticated manifest, control/transport
identity, and staged archive inventory. This closes the manual self-hash trust
gap for staging, **not** the remaining inner-product/signature/raw-evidence
acceptance requirements. It is not yet wired into existing publishers or
deployers. A locally saved result is not a new attestation, and expired or
deleted handoff authentication must not silently fall back to that result.
Permanent authenticated archival and publication consumer migration remain
explicit follow-up work; do not claim indefinite offline promotion.

### Prepare authenticated publication inputs without rebuilding

`artifact-handoff.cjs prepare` accepts the same arguments as `stage` and also
expands the nine authenticated outer GitHub ZIPs into isolated, leased cache
directories. It checks exact role layouts, local/central ZIP metadata, CRCs and
SHA-256 inventories; it rejects links, path traversal, case collisions, extras
and oversized expansion. Limits are 20,000 entries, 2 GiB per member and 4 GiB
expanded per transport. Existing SciPy wheel parsing retains its smaller limits.
Inner SEA/npm archives remain unopened and are never executed by extraction.

The composite consumer runs from the reviewed control checkout but requires a
**separate, clean, source-only Git checkout at the exact product SHA**. Do not
point it at a built producer or retained release worktree. The artifact cache
must be outside that consumer checkout.

The controller needs maintained XZ Utils (`xz` on `PATH`) to inspect Linux
distribution archives. Availability is checked before downloading artifact
inputs. This is a release-tool/test prerequisite, not a dependency of installed
Sage.js, its npm runtime or the browser. Native Windows CI provisions the pinned,
checksum-verified upstream Windows tool before the expensive native build; it
does not require WSL/MSYS2. Developers running these transport tests on Windows
can use the native tools from [XZ Utils](https://tukaani.org/xz/). Example:

```sh
node scripts/release/prepare-publication.cjs \
  --candidate-root /absolute/path/to/source-only-product-checkout \
  --run-id HANDOFF_RUN_ID --attempt HANDOFF_ATTEMPT \
  --artifact-id HANDOFF_ARTIFACT_ID --control-sha REVIEWED_CONTROL_SHA \
  --sha PRODUCT_SHA --ref PRODUCT_REF --event workflow_dispatch \
  --purpose qualification --archive handoff.zip \
  --directory /absolute/path/to/existing-artifact-cache
```

After authentication, the consumer copies pinned inputs to canonical publisher
paths, then invokes the product checkout's existing numerical gate assembler
and authenticator through the shared runner. It preserves the exact 16-row and
eleven-raw-record contract and checks the selected public npm root and browser
distribution. Success also rechecks projected file hashes and clean source.
It does not install dependencies or regenerate runtime artifacts.

The consumer also compares all four selected platform npm tarballs against
their original raw qualification manifests, whose file hashes are bound by the
authenticated gate. Producer paths remain unchanged in those manifests. This
check runs from reviewed control tooling on every preparation, including when
the candidate's earlier verification stages are reused. It does not require a
new CLI option in an older frozen candidate. New tagged CI explicitly enables
the equivalent `--platform-npm-directory release/npm` authenticator option.
These are content checks of already-qualified packages, not replacement
cross-platform installation tests or fresh signature verification.

Preparation also streams each platform npm tarball to identify its two packaged
SEA executables. The inner `sagejs` size/hash must equal the independently
qualified platform SEA row, not merely another executable inside a tarball
with a matching download checksum. The original raw manifest hashes and archive
bytes are checked before and after the read, including on checkpoint reuse.
The result's `packagedExecutables` records the exact executable members and
their evidence scope. `sagepython` is bound by the tested npm tarball; the
current numerical SEA row covers only `sagejs`, so the checker does not invent
an independent `sagepython` row. No binary is extracted or executed.

The producer workflow orders macOS collection after Developer ID signing and
notarization, and Windows collection after the configured signing step; this
cross-binding therefore must use the post-signing row rather than an earlier
unsigned binary. Preparation compares all four downloadable archives against
these identities and the candidate's exact documentation/notices.
`downloadableArchives` records checked member hashes. ZIP inspection preserves
Windows' root layout and macOS' enclosing directory, checks local/central
records and streaming descriptors, and rejects ambiguous metadata. Linux XZ
decoding feeds the shared GNU/USTAR inspector through a pipe, with one decoder
thread, a 128 MiB decoder-memory limit and a five-minute deadline. Ambient XZ
options cannot override those flags; cancellation kills and awaits the decoder.
A valid tar followed by an XZ integrity failure is rejected. All readers bound
expansion and check executable modes, without extracting or executing binaries.
Matching checksum sidecars alone cannot authorize different executables.
macOS installer content comparison and authenticating signature/notarization
state remain necessary before adopting the final publisher.

Browser preparation selects the clean-build distribution explicitly. Its bytes
must match the numerical gate and the canonical artifact report recorded by the
successful reproducibility producer, including the ARM64/macOS comparison
reports. The checker revalidates file hashes, Wasm memory declarations, manifest
and build-receipt metadata, and derived totals against the candidate's total and
topology budgets. It reuses compression measurements from the authenticated
report instead of running gzip/Brotli again. This requires trusted transport:
`verifyRecordedArtifact` by itself cannot authenticate a self-authored report.
The result identifies `selectedBrowser.directory`. Preparation also streams the
retained inner `sagejs-wasm.tar.gz` and compares every file's size and SHA-256,
plus the reconstructed directory layout, with that exact qualified tree. This
includes metadata, supporting sources and other files outside the payload
report's asset list. It checks the archive's checksum sidecar and rechecks both
the selected tree and archive after comparison. `selectedBrowser.archive`
records this binding; it does not authorize deployment of an arbitrary path.

The inner reader neither extracts nor executes content. It accepts ordinary
USTAR and the producer's current short-name GNU tar format beneath `dist/`;
links, devices, PAX/long-name/sparse extensions, path collisions, ambiguous size
fields and special permission bits fail closed. npm's separate `package/`,
USTAR-only contract remains intact. Browser verification has a two-minute
deadline, propagates cancellation, caps compressed and expanded archives at
2 GiB, and caps entries at 100,000. Per-file and full-tree hashes stream through
bounded buffers; no gzip/Brotli measurement is repeated. Changing the producer
archive format requires explicit compatibility tests rather than relaxing the
parser during publication.

Reruns revalidate cached files and reuse valid verification checkpoints. A failed
gate directory is retained outside the canonical raw-evidence tree before a
fresh reconstruction; interrupted copies and replaced inputs are likewise
retained under `build/release-publication/`. Cancellation propagates to the
runner and its child processes. Inspect retained attempts before manual cleanup;
the consumer does not silently delete earlier evidence.

The success status is `numerical-publication-inputs-authenticated`, **not release
authorization**. Downloadable SEA archive/installer and signature checks and actual
publisher/deployer/recovery adoption remain required.
This command cannot upload, sign, tag, publish or move public pointers. Its local
state is a resumability record, not an offline replacement for authenticated
handoff provenance.

### Full pre-tag qualification without publication

After local/persistent-host iteration, dispatch both workflows on a frozen
candidate branch using its full SHA:

```sh
gh workflow run ci.yml --ref release-candidate \
  -F qualify_release=true -f candidate_sha=FULL_SHA \
  -f native_targets=all -F platform_smoke=false
gh workflow run wasm-release.yml --ref release-candidate \
  -F qualify_release=true -f candidate_sha=FULL_SHA
```

This is opt-in. `candidate-mode.cjs` rejects a mismatched dispatch/checkout SHA,
partial target selection, smoke-only or mixed recovery requests before product
installation/build in the root jobs. Keep the branch fixed for both dispatches;
capture also requires their exact source/ref/event identities to agree. The mode
retains qualified-NLopt eligibility, all numerical product/supplemental rows,
macOS signing/notarization and the existing explicit Windows signing policy.
The browser build retains provenance attestation. Pending component qualification
is still a failure, not permission to promote unqualified mathematics.

Publication requires an actual tag **push** event, not just a tag-shaped ref;
manual dispatch cannot publish through `publish-release`, even at an existing
tag. Qualification also excludes the publication-recovery job. Nothing in this
mode edits GitHub Latest, npm channels, Pages or app deployment pointers. It does
use signing/provenance services and their existing approval protections.

Operational prerequisite checked on 2026-09-07: `sagejs-signing` permits only
`v*` tags and requires a human reviewer. It therefore currently blocks pre-tag
signing. Before a full trial, the owner must explicitly permit a single dedicated
candidate branch (proposed: `release-candidate`) while retaining approval. Do not
broaden the policy to all branches, remove review, create a throwaway tag, or
silently skip signing to work around this. No environment policy was changed
while implementing the mode, and no full candidate workflow has yet validated it.

`pnpm release:run --candidate FULL_SHA` executes the native-host plan. First
install the pinned JavaScript dependencies and place the **same candidate's**
canonical numerical product at `build/authenticated-numerical-product` and
canonical public root archive at `build/release/npm/sagejs.tgz` on each host.
Set `SAGEJS_NUMERICAL_PRODUCT_ROOT` to that product directory and
`SAGEJS_NUMERICAL_RUNTIME_REQUIRED=1`; use the required native dependency
catalog as in CI. This command is not a toolchain provisioning substitute.

To build a new candidate **for testing**, use
`pnpm release:run --candidate FULL_SHA --profile preparation` on Linux. This
non-publishing profile checkpoints the authenticated numerical build,
browser/runtime build, and one public root pack separately. A source-current
pending numerical artifact is allowed during preparation, so that qualification
can be collected against it. A passing preparation run does **not** establish
release eligibility, mathematical qualification, signing or publication
authority; its journal records the profile and whether only selected stages ran.

The `canonical` profile retains the mandatory qualified-NLopt check as the
separate `numerical-eligibility` stage, after numerical preparation and before
runtime/packaging, matching its previous enforcement order. It checks the
qualified manifest and current compiled artifact, never a renamed preparation
receipt. Tagged CI retains the same required check. Once the numerical
qualification exists, run `pnpm release:run --candidate FULL_SHA --profile
canonical`; compatible same-candidate build checkpoints can be reused, but
they cannot satisfy the eligibility stage. All remaining platform, product and
raw-evidence gates still apply.

The preparation outputs are the numerical product directory, browser `dist`,
and root tarball described above. Runtime preparation includes the full lazy
module cache before browser assembly freezes `dist` as an input; the smaller
startup cache alone is insufficient. Copy those exact outputs, not independently
packed roots, to the native consumers. Existing Wasm source/toolchain caches
are used; source-current verification remains mandatory.

Use `--list` to inspect commands and gate classes without running them, or
`--stage integration,native` to diagnose selected stages. A partial run is
**not** a complete release qualification. `--fresh` reruns selected stages.
GitHub's native build, integration, native tests, and SEA steps use this same
runner; CI still independently collects and authenticates publication evidence.

Use `pnpm release:run --candidate FULL_SHA --preflight` for a quick read-only
source/Node/disk check before starting a campaign. The runner also checks free
space immediately before each stage that actually executes: both the checkout
and the child's temporary directory need at least 2 GiB available and 8,192 free
inodes where inode counts are supported. These are initial safety floors, not
peak-space estimates or reservations; other processes can still consume space.
For plans containing `public-runtime` or `bootstrap`, preflight also checks the
three required foreign-parser submodules against their pinned Git commits and
requires ordinary grammar/parser/scanner source files. The runner checks the
whole selected plan's source prerequisites before launching its first command,
so missing runtime sources cannot waste an earlier numerical build. Inspection
does not fetch or modify submodules; it reports the scoped initialization command
and asks that local changes be inspected first. Unrelated upstream test
repositories are not required by this check. `--profile` and `--stage` apply to
the preflight selection too. This is still not complete compiler/browser/oracle
provisioning or verification.

`pnpm release:run --candidate FULL_SHA --status` reads structured scheduling
status without requiring a build or changing a lock. `status.json` records the
latest attempt, including pre-command failures, pending/blocked stages, reused
checkpoints, log paths and failure codes. `runs/` retains prior attempt journals
and stage receipts. A live owner PID is only a liveness observation, not proof
that its children are healthy; a missing PID requires child-process inspection
before recovery. Remote or inaccessible owner probes are explicitly unknown.
Neither this status nor a partial stage selection authorizes publication. If
the filesystem becomes completely full even failure-journal writes may fail;
the runner reports that and retains the original causal error.

The `observation` object is computed at read time without rewriting the journal.
It shows the age of the last durable update and current campaign/active-stage
wall times when the owner is locally live. Remote, missing and inaccessible
owners get `null` execution-time estimates; a stale journal is not proof that
work kept running. Recorded durations and attempt results remain unchanged.

Checkpoints and separate attempt logs live in
`build/release-runner/FULL_SHA/`. A successful checkpoint is reusable only for
the same clean source, runner, command, host, Node version, relevant environment,
input content, and output content. Interrupted/failed/corrupt checkpoints are
not successful evidence. A host lock prevents two runners from mutating the
same checkout. Do not manually relabel receipts. Never restore a checkpoint
from another machine as proof of local execution.

Correctness file queues also use `--resume`. A test is reusable only after an
isolation audit adds `// sagejs-test-resume-inputs: [...]` beside its tier. The
JSON array lists every ignored/generated dependency it consumes; `[]` is only
for tests of tracked source using Node built-ins. The declaration also asserts
read-only inputs, no setup consumed by siblings, and no unbound external tools,
services, caches or installed packages. Tests lacking it execute normally. The
initial pilot covers three source-only infrastructure files, not the large
mathematical integration suite. Expand coverage through explicit audits, never
by assuming every independently spawned test is hermetic.

File records bind the whole clean candidate, declared input contents, exact Node
executable, host/platform, complete child environment digest, arguments and
concurrency. Shared input trees are hashed once at entry and again after all
children finish/cancel, not once per file. Changed inputs invalidate the attempt.
Normally completed files survive a later sibling failure. A killed controller's
completed records require matching current identities and a confirmed missing
owner; the stale lock still requires manual orphan-process inspection. Running,
corrupt, invalidated and unstarted records never count as passes. `--fresh`
forces fresh file execution as well as fresh stages, and a failed fresh attempt
supersedes an older successful record. File state lives in
`build/release-test-checkpoints`, separate from learned timing estimates.
If a failed input check cannot persist invalidation, the attempt record is
renamed out of the reusable namespace. If that too fails, the lease is retained
and the error requires quarantining the checkpoint store—not just deleting its
lock. This prevents a disk/permission failure from turning known-invalid work
into apparently recoverable interrupted work.

For a developer's clean checkout, `pnpm test:unit --resume` opts into this same
mechanism; `--resume-fresh` replaces previous results. Other reporters and dirty
checkouts do not support resume. Local file records remain scheduling hints,
not portable numerical evidence or authorization to publish.
Use repeatable `--file PATH` selectors for targeted full-file runs without
filtering individual test names, for example
`pnpm test:unit --resume --file test/release-inventory.cjs`. A targeted run is
still partial qualification; a full release stage accounts for every selected
file whether it executes or safely reuses a matching record.

Stages consuming the native/Node `dist` additionally require the existing
source-current build receipt before running or reusing tests. Hashing an old
runtime next to a new checkout is not qualification of that checkout.

Native bootstrap also completes the full lazy cache and initializes the existing
cubic-frontier harness's empty, validated history file before freezing `dist`.
SEA packaging and tests must consume those completed inputs. On older candidates
whose runner predates this preparation, explicitly run the full precompile and
the harness's `prepareCandidateDirectEnvironment()` before qualification; never
turn off the input mutation check to accommodate lazy preparation.

Browser workload enforcement is an aggregate gate: it follows all three engine
parity/acceptance stages and explicitly consumes their six receipts. Timing
reports are not its inputs. It is not a Node-only prerequisite. Older frozen
candidates retain their original timing-receipt contract; use explicit
stage ordering and the same receipt handoff as the clean CI DAG rather than
rebuilding the mathematical product merely to change the scheduler.

Gate classes are explicit in `scripts/release/stages.cjs`:

- `build`, `integrity`, `installation`, `packaging`, `correctness`, and
  `numerical-evidence` are required; missing inputs fail closed.
- `performance` is also required, but runs separately, after correctness,
  without parallel sibling files. The explicit integration timing partition
  currently covers the Python/CPython experiments; benchmark-policy regression
  tests remain correctness tests. The unfiltered developer test command still
  includes every file. No threshold is disabled by choosing a gate class.
- Compiler/tutorial compatibility diagnostics and broad research campaigns
  retain their existing non-blocking/scheduled policy; they are not substituted
  for required mathematical evidence.
- `performance-report` collects the existing Wasm/browser timing trend reports
  with the same `--report-regressions` policy as release CI. Corpus, baseline
  coverage, execution and numerical checks still must succeed; only timing
  regressions are reports rather than mathematical failures.

Package installation runs before long suites and numerical soaks. Numerical
Node/npm/SEA subjects have independent checkpoints. Retrying one preserves
successful siblings and moves its previous output into runner history rather
than deleting it. The existing final numerical gate still authenticates all
16 product rows and supplemental evidence. Local checkpoints do not authorize
publication or replace clean CI, macOS signing, or browser qualification.

The native profile matches the platform test inventory: Linux x64 includes
the eclib corpus, generated reference/upstream checks and SEA Jupyter; ARM64
uses the existing portable/native inventory rather than silently adding a
second full integration campaign. On a prepared Linux browser host, run
`pnpm release:run --candidate FULL_SHA --profile browser` for Node/native and
Node-Wasm parity, all three real browser engines, security/recovery tests,
native workload acceptance and browser workload enforcement. Install the matching
Playwright engines and OS libraries beforehand. Numerical browser/supplemental
collection and cross-host clean reproducibility remain the separately required
commands below.

The required native workload step uses
`node bench/browser-wasm-performance.mjs --native-acceptance --budget
bench/browser-wasm-budget.json --output build/wasm-native-acceptance.json`.
It executes all 21 checked-in programs cold/warm once, without memory sampling
or minor timing-ratio enforcement. Failed evaluation/interruption and the
existing absolute interruption ceiling remain blocking. It cannot accept a
custom corpus, shard, repeated sample count or report-only override. Its v2
receipt labels the measurement as `native-workload-acceptance`; incidental
durations can inform diagnostics but are not a repeated timing qualification.
Independent raw startup, mathematical parity and memory/security gates remain
required.

Use `pnpm release:run --candidate FULL_SHA --profile reporting` separately on
the same prepared checkout for the existing seven-sample native reference and
three browser timing reports. This profile has no build commands. Its failure
retains its own attempt journal and cannot invalidate unchanged successful
product checkpoints. The Wasm workflow also uses the one-observation native
acceptance step on its already-built oracle; browser timing reports label ratios
against that reference as single-observation diagnostics. This removes repeated
native timing from the required oracle job without another build or a large
cross-job runtime transfer. The GitHub browser-report job and legacy publication
guards remain until full product-boundary adoption.

To launch the four hosts together, use
`pnpm release:coordinate --candidate FULL_SHA --hosts build/release-hosts.json`.
The ignored JSON file is an array of four objects with `host` (SSH config name),
`target`, `root` (absolute checkout), optional `node` (absolute executable),
and `env` (explicit release/build environment). Targets are exactly
`linux-x64`, `linux-arm64`, `macos-arm64`, and `windows-x64`. Provision and
check out the clean candidate beforehand; the coordinator will not reset a
host's existing work. Do not place secrets in this configuration. Coordinate
host occupancy in the public discussion before starting it.

Coordinator logs are under `build/release-coordinator/FULL_SHA/`. It waits for
all four independent hosts; a failing host stops its own stages without
discarding successful work on the others. After a disconnected controller,
inspect remote processes before restarting: the per-checkout lock prevents
duplicate builds, and a stale lock requires orphan-process inspection rather
than automatic deletion. A successful coordinator exit covers the native
profile only, not signing, browser/reproducibility or final aggregation.

Every operation that prepares a checkout's generated files must participate in
the same exclusive lock, including independent Wasm reproduction. Observing
that `active.lock` is absent does not reserve the checkout: another controller
can acquire it immediately afterwards. Finish the complete native coordinator
and its checkpoint refresh before starting reproduction on those checkouts, or
use separate reproduction worktrees. Never refresh native checkpoints while a
Wasm build is preparing the shared lazy compiler cache.

Run long host/coordinator operations under a supervisor or detached session
with durable logs. A chat/terminal worker disconnect can terminate an ordinary
foreground process. On recovery, inspect actual local and remote process trees
and checkpoint state before launching anything again.

Checkpoint reuse is intentionally limited to one exact candidate. Reuse of
unchanged compiled components across candidates remains the build system's
content-addressed cache responsibility; test evidence is always recollected
for a new candidate. This distinction avoids claiming that a test on an old
source commit qualified a new release.

### 1. Freeze and inspect

Create a release branch or detached worktree from the intended commit. Confirm
that the worktree is clean, versions and release date are correct, and the
release notes describe the actual source.

```sh
git status --short --branch
git rev-parse HEAD
pnpm test:release
```

Run `pnpm test:changed` as appropriate while fixing the candidate. Native or
compiler changes also require `pnpm architecture:check`; migrated Python must
keep `pnpm test:baselib:strict` at zero errors.

### 2. Qualify on persistent hosts

Before long native integration tests, authenticate the complete browser
handoff if the checkout contains a production Wasm artifact. Installing the
eight-file numerical product alone does **not** refresh the browser manifest,
build receipt, or other modules. A cached checkout can otherwise mix an old
manifest with new numerical loaders and fail late in a Node-Wasm test.
Preserve an old `packages/flint-wasm/dist` separately, restore the complete
`package/packages/flint-wasm/dist` from the SHA-verified canonical public root
tarball, then run:

```sh
node packages/flint-wasm/scripts/production-receipt.cjs validate
node packages/flint-wasm/node-cli.mjs --verify-only
```

Do not regenerate receipts around stale or mixed bytes. This handoff check
does not replace the later independent Wasm reproduction builds.

Fetch the frozen SHA on all four hosts. Run the same build and test stages used
by `.github/workflows/ci.yml`, with the host's existing dependency cache. Do
not substitute a focused smoke test for the complete platform job. At minimum,
exercise:

- compiler and native mathematics builds;
- portable, unit, host-integration, and native tests selected by the release
  job;
- both SEA executables, relocation, version output, and the installer/package
  layouts;
- platform-specific signing inputs and package metadata without publishing;
- the production npm package plus its platform package in a fresh temporary
  project.

Numerical product qualification has checked-in production entry points. Each
platform producer first provisions the authenticated, link-free SciPy oracle
declared by
`bench/numerical-computing/qualification/scipy-oracle-catalog.json`; a Python
or SciPy found on `PATH` is intentionally never accepted. For persistent-host
preparation use `node scripts/release/prepare-oracle.cjs` (also used by the
runner's `oracle` stage). It revalidates an existing installation against the
current catalog, complete prefix and provenance and actually probes the Python,
NumPy and SciPy runtime. A cache hit is not a path-exists shortcut.

When replacement is necessary, prefix and provenance are prepared as one private
bundle. The old directory stays in place until that bundle validates, then is
retained under `build/.transactions-numerical-scipy/<transaction-id>/previous`.
Failed or partial preparation is also retained there. The checkout mutation lease
excludes running consumers; a direct child of the release runner may borrow its
parent's lease. Standalone invocations must acquire their own lease. Windows has
no atomic exchange of nonempty directories, so a brief missing-target interval
is covered by the transaction journal and recovery, not claimed to be invisible.

After an interrupted attempt, inspect any stale lock's owner and children before
unlocking. Rerunning preparation restores the previous directory when needed,
reuses a verified staged bundle if present, and verifies the installed location
again. It never accepts a stale catalog, silently falls back to PATH, or deletes
previous/failed directories. Corrupt journals and unsafe filesystem objects fail
closed for inspection. Retained transactions consume disk: archive or prune only
after inspecting active leases and which evidence/artifacts still reference them.

The older low-level provisioning command remains useful for clean, explicitly
chosen output paths, but is not the retry interface for a persistent checkout.
The persistent-host platform sequence is:

```sh
candidate=$(git rev-parse HEAD)
node scripts/release/prepare-oracle.cjs
export SAGEJS_QUALIFICATION_SCIPY_PREFIX="$PWD/build/numerical-scipy/prefix"
export SAGEJS_QUALIFICATION_SCIPY_PROVENANCE="$PWD/build/numerical-scipy/provenance.json"
pnpm release:qualify:numerics:platform -- \
  --candidate "$candidate" \
  --root-archive build/release/npm/sagejs.tgz \
  --platform-archive build/release/npm/sagejs-PLATFORM.tgz \
  --sea-executable PATH/TO/SAGEJS \
  --output build/numerical-qualification/platform/PLATFORM
```

Replace `PLATFORM` with `linux-x64`, `linux-arm64`, `macos-arm64`, or
`windows-x64`. Use the equivalent PowerShell environment assignments on native
Windows. This low-level collector requires a fresh output directory; preserve
prior evidence before invoking it. For retries prefer the release runner's
subject stages, which retain previous outputs and verified checkpoints.
The platform collector derives and checks its platform rather than
trusting a command-line label. It cold-runs and immediately verifies the Node,
fresh-npm, and relocated-SEA product rows against the same source commit,
corpus, artifacts, and hermetic oracle. The macOS signing workflow may collect
the Node row before signing and the npm/SEA rows after signing only because the
two jobs restore the same source and provision the identical content-addressed
oracle at the identical workspace path.

Collecting a platform's Node row also runs the bounded `release` numerical
soak in fresh processes and writes `<platform>-soak.evidence.json`. The final
gate requires one source- and Node-artifact-bound soak record from each of the
four supported platforms; a missing, failed, stale, or relabeled soak is a
release failure. The separate scheduled workflow runs the longer `scheduled`
profile for trend detection, but it does not substitute for these exact
candidate receipts.

Linux x64 also collects the four real-browser rows and all supplemental gates
after the production browser artifact and the exact Linux SEA exist:

```sh
pnpm exec playwright-core install chromium firefox webkit
pnpm release:qualify:numerics:browser -- \
  --candidate "$candidate" \
  --artifact packages/flint-wasm \
  --output build/numerical-qualification/browser
```

This produces Chromium, Firefox, WebKit, and Chromium-worker product receipts,
native ASAN/UBSAN/LSAN evidence for cminpack and NLopt, destructive Wasm fault
evidence, four process-tree memory records, and the structural startup/package/
payload/closure record. “Skipped”, “unsupported”, stale-candidate, dirty-tree,
or missing evidence is a release failure, never an optional result.

The canonical Linux numerical producer publishes one exact, source-commit-bound
eight-file handoff: the Node and browser cminpack/NLopt Wasm files plus their
four JavaScript loaders. Every platform release job sets
`SAGEJS_NUMERICAL_PRODUCT_ROOT` and `SAGEJS_NUMERICAL_RUNTIME_REQUIRED=1`, so
bootstrap installs that handoff, build receipts bind the SHA-256 and byte count
of all eight files, and SEA packaging rechecks the current receipt. The browser
qualification job consumes the same artifact rather than selecting a separate
numerical rebuild. Tagged production also runs the NLopt verifier with
`--require-qualified`; a pending or stale qualification manifest blocks the
handoff before any release artifact is uploaded.

Copy producer outputs without merging their directories into this exact
layout:

```text
build/numerical-qualification/
  platform/{linux-x64,linux-arm64,macos-arm64,windows-x64}/
  browser/
```

Then aggregate, reproduce, and authenticate the final gate:

```sh
pnpm release:qualify:numerics:gate -- \
  --candidate "$candidate" \
  --input build/numerical-qualification \
  --output build/numerical-qualification/gate
mkdir -p build/validated-numerical-gate
cp build/numerical-qualification/gate/release-gate.json \
  build/validated-numerical-gate/release-gate.json
rm -rf build/numerical-qualification/gate
pnpm release:qualify:numerics:gate -- \
  --candidate "$candidate" \
  --input build/numerical-qualification \
  --output build/numerical-qualification/gate
pnpm release:qualify:numerics:authenticate -- \
  --candidate "$candidate" \
  --gate build/validated-numerical-gate/release-gate.json \
  --rebuilt-gate build/numerical-qualification/gate/release-gate.json \
  --public-npm-root build/release/npm/sagejs.tgz
```

The gate is exactly 16 product rows (Node/npm/SEA on four platforms plus four
browser/worker rows), six supplemental requirements represented by eleven raw
records (including four platform-specific numerical soaks), and one
source-current hermetic SciPy binding per platform. Producer
jobs are independent; the browser job consumes only the candidate's already
built Linux SEA, and the aggregation job consumes only their immutable
evidence. This one-way DAG avoids both circular qualification and a publisher
which silently rebuilds what it is supposed to authenticate.

All four npm rows must bind byte-identical public `@sagemath/sagejs` root
tarballs. The gate records their one path-independent content digest, and the
publisher compares the Linux x64 copy selected for npm publication against
that digest after downloading it. A platform-local `pnpm pack` difference is
therefore a release failure; a publisher cannot silently select an unqualified
fifth root archive.

Clean tag CI preserves the small publisher-facing gate as
`numerical-release-gate` and the complete reproducible row/manifest/receipt/
supplemental inventory as `numerical-release-evidence`, both for 90 days. The
larger artifact deliberately excludes the derived gate outputs. Before
publishing, the candidate checkout restores that raw inventory, reruns the
checked-in fail-closed assembler at its canonical
`build/numerical-qualification/gate` path, and requires exact byte equality
with the small publisher-facing gate. The aggregation job itself also performs
this same real second reconstruction before preserving either artifact, and
the assembler rejects noncanonical input/output layouts. Cloudflare deployment
does the same. Thus valid-looking nested SHA/content-ID substitutions cannot be
authorized by merely recomputing the compact outer ID; the successful producer
run's immutable raw evidence is the trust boundary.

Transferred browser-memory receipts use current source-and-artifact verification,
not measured-host verification: the aggregation or publication machine is not
the measurement machine. Preserve the producer's platform and collector facts;
never rewrite them to match the consumer. Receipt content, corpus, source bundle,
adapter, artifacts, capabilities, exact candidate/tree, and clean checkout remain
mandatory bindings. Direct collection verification still requires the actual
measured host and collector runtime. This distinction does not make arbitrary
external JSON trustworthy; the successful producer's immutable evidence transport
is still required, and historical-content-only verification is insufficient.

After `pnpm bootstrap`, use the run-only test and packaging boundaries. They
consume the exact validated native prefixes and generated artifacts instead of
preparing them again:

```sh
pnpm test:integration:run
pnpm test:native:run
pnpm test:sea:reuse
```

The unsuffixed `test:native` and `test:sea` commands remain self-contained
developer entry points: they prepare missing inputs first. Release jobs must not
use those rebuilding entry points after a successful bootstrap.

An ordinary developer bootstrap does not implicitly download or compile the
reproducible Wasm toolchain. If neither a prepared toolchain nor an authenticated
handoff is configured, the resulting self-contained SEA explicitly omits the
optional cminpack and NLopt reactor assets. A partial or invalid local reactor
set still fails closed. Release SEAs never take the omission path because the
required-provider settings above are mandatory on all four platform jobs.

The canonical numerical product is produced on Linux x64 and remains exactly
source-bound. NLopt's portable build-report identity binds every report field
except the validated host-builder provenance object; signed platform receipts
retain the runtime platform identity, while source closure, canonical toolchain,
artifact, corpus, oracle, selection, semantics, and qualification tooling remain
exact bindings. A macOS or Linux-ARM64 reproducibility builder consumes the
canonical product while assembling Sage.js, then invokes the cminpack and NLopt
low-level reactor builders separately and compares their bytes with that product.
Preserve both directly built reactors so the aggregation job can repeat the byte
comparisons independently. Never discard or normalize any build-report field
other than the exact host-builder object allowed by the qualification contract.

Run the Wasm release workflow's build, Node-Wasm parity, browser parity,
security, and performance commands before tagging as well. Persistent browser
caches are acceptable for iteration; GitHub will later prove a clean,
reproducible build.

When any host fails, fix and retest there first, then rerun the relevant full
host job. Check the other hosts for the same class of assumption before making
a tag.

### 3. Merge the frozen source to `main`

Merge the exact qualified commit into the latest `origin/main`, resolve any
conflicts, and rerun the deterministic checks implied by the merge. Push the
merge and wait for routine CI to pass. Record the source SHA which will be
tagged; do not include unrelated work after the freeze.

### 4. Create one immutable release tag

Create and push an annotated tag on the frozen source commit. Verify the tag
before pushing it.

```sh
git tag -s vX.Y.Z <full-source-sha>
git rev-list -n1 vX.Y.Z
git push origin vX.Y.Z
```

Use an unsigned annotated tag only when signing is unavailable and the early
alpha release policy explicitly allows it. Never force-push a tag.

The tag starts the clean native/SEA workflow, mandatory numerical qualification
DAG, and reproducible Wasm release workflow. The native release publisher
cannot publish until the exact 16-row numerical gate, all six supplemental
requirements, and a successful reproducible Wasm run for the exact tag and
source SHA pass. Monitor individual jobs and stop or cancel dependent work
promptly after a failure. Pull the complete failed-job log and identify the
first causal error rather than reacting to the final aggregate failure.

### 5. Publish and deploy

After every required native job passes, the protected release workflow should:

- sign and notarize macOS artifacts;
- sign Windows artifacts when credentials are configured, or state clearly
  that an early-alpha artifact is unsigned;
- create the GitHub Release and upload archives, checksums, and `install.sh`;
- publish all four platform npm packages before `@sagemath/sagejs`;
- wait for registry consistency; and
- make the GitHub Release public and latest only after npm succeeds.

npm Trusted Publishing authorizes the calling workflow filename. Consequently
`.github/workflows/ci.yml` is the only workflow that executes `npm publish`.
Immediately before restoring publication artifacts, its publisher queries the
WebAssembly workflow through the authenticated GitHub API and requires a
successful push run for the exact immutable tag and full source SHA. The two
workflows may build concurrently, but a failed or still-running Wasm gate can
therefore never race npm publication. If native qualification finishes first,
the publisher fails closed; after the Wasm workflow succeeds, use the same
validated-publication recovery below rather than rebuilding successful native
producers.

If its publication job fails after every producer and the numerical gate pass,
dispatch **Request validated release publication recovery** with the original
tagged CI run ID and immutable tag. That small bridge dispatches `ci.yml` at
the tag; its recovery job retrieves every paginated job attempt, verifies the
exact source SHA and the unique latest occurrence of each required producer,
then reruns the latest failed/cancelled publisher job by job ID. It deliberately does not
require the overall source run to have succeeded (the publisher failure is the
reason recovery exists), but it does require that run to have been triggered by
the exact requested tag rather than merely another tag at the same commit. It
never receives an npm OIDC token itself. The rerun treats an existing npm
version as idempotent only when its registry SHA-512 integrity equals the exact
qualified local archive; a partial publication from different bytes fails
closed instead of being mixed into the GitHub release.

Deploy `app.sagejs.org` only from the successful reproducible Wasm run and the
successful numerical-qualification CI run for the same source SHA. Supply both
run IDs to the deployment workflow. It rejects different SHAs, a missing or
non-successful numerical gate job, and a gate artifact whose content ID or
exact inventory fails authentication. Production additionally requires that
SHA to be reachable from `origin/main`.

### 6. Verify as a new user

Test public infrastructure from clean temporary directories and without local
workspace resolution.

```sh
pnpm view @sagemath/sagejs version dist-tags --json
pnpm view @sagemath/sagejs-linux-x64 version --json
pnpm view @sagemath/sagejs-linux-arm64 version --json
pnpm view @sagemath/sagejs-darwin-arm64 version --json
pnpm view @sagemath/sagejs-win32-x64 version --json
```

In fresh CommonJS and ESM projects, create an embedded kernel and evaluate at
least `factor(370309)`, `version()`, `version(True)`,
`number_of_partitions(10)`, and `Partitions(10).cardinality()`.
Confirm that installation selects the correct platform package and never asks
the user to install an unpublished internal addon.

Download the latest installer into a temporary installation prefix, verify
checksums, run `sagejs --version`, and evaluate the same smoke corpus. Verify
the signed/notarized state on macOS and the declared signing state on Windows.

Finally, open `https://app.sagejs.org` in a fresh browser context, confirm its
runtime receipt names the release SHA, evaluate `number_of_partitions(10)` and
`Partitions(10).cardinality()` (both must return `42`), and check that the
npm/embed documentation links are live.

## Build and test parallelism

Production native kernels are lowered by a bounded family queue. Independent
standalone addons compile concurrently, and the final dependency-deduplicated
pack keeps one generated translation unit per source family; node-gyp compiles
those units with the host build-job limit before linking the single `.node`
module. `SAGEJS_BUILD_JOBS` controls compiler jobs and
`SAGEJS_NATIVE_KERNEL_JOBS` controls concurrent kernel families. Scheduling
values do not participate in content identities.

The native dependency catalog is immutable and content addressed. When native
dependency inputs change, bump `catalogRelease` in
`scripts/native-prebuilt-dependencies.cjs` and the matching workflow value,
publish every supported target with `native-dependencies.yml`, and only then
enable required-prebuild release jobs. A checksum or asset miss is a release
configuration failure, not permission to spend an hour silently rebuilding
GMP/FLINT/FFLAS.

Test files are scheduled longest-first from learned per-host timings with
bounded concurrency. A failing file terminates active process trees and stops
new work. The repository test plan runs independent post-build phases through
resource slots while source builds, native preparation, and performance
budgets remain exclusive.

## Further improvements

The current workflows prove a great deal, but the release interface should be
simpler and faster:

- Extend the existing `release:coordinate` / `release:run` checkpoints into a
  single final campaign summary, including the numerical and reproduction
  evidence collected by the existing specialized entry points. Browser numerical
  collection can start when its exact Linux SEA and canonical browser artifact
  are ready; it need not wait for every other native platform. Final aggregation
  still requires all producer evidence.
- Record native family and final-pack compile timings in the same learned timing
  store used by tests, so heterogeneous hosts can tune the two concurrency
  limits automatically without changing artifact identities.
- Preflight Wasm/browser release workloads on a persistent browser host.
- Separate browser memory sampling from repeated timing samples. In the 0.8.0
  campaign Chromium timing took about 61 minutes while awaiting repeated
  user-agent memory measurements; dedicated authenticated memory gates already
  run separately. Preserve those gates when changing the timing collector.
- Cache gzip/Brotli payload reports by complete artifact, compression-tool and
  policy identities. Reproduction must still compare every payload byte/hash;
  identical payloads should not need repeated maximum-quality compression.
- Remove duplicate full lazy precompilation through an authenticated preparation
  boundary: bootstrap, the runner's bootstrap stage, SEA packaging and Wasm
  assembly currently request overlapping work. On the persistent M1, one full
  lazy-cache pass takes roughly 12 minutes. Do not skip it without validating
  its source/compiler/input closure and complete outputs.
- Separate volatile build-receipt metadata from execution artifact identity.
  The receipt's `completedAt` timestamp currently participates in whole-`dist`
  checkpoint hashes, so repairing an otherwise equivalent build can invalidate
  every downstream test. Any normalization must keep source-current receipt
  validation and all actual code/resource hashes mandatory.
- Preserve dependency caches across candidates, while keeping the final
  GitHub build clean and authenticated. Key native artifacts by the actual
  lowered source, dependency lock, compiler, ABI, and target—not by an
  unrelated repository commit—so a documentation or TypeScript-only fix does
  not rebuild GMP, FLINT, or an unchanged native pack.
- Build generated `dist/`, module-cache, and SEA inputs in candidate
  directories, validate them, and atomically rename them into place. An
  interrupted build must leave the previous complete cache usable instead of
  exposing a partially refreshed compiler/runtime tree.
- Split release correctness from broad research/performance evidence. Keep
  catastrophic performance ceilings in the blocking release path; run large
  benchmark campaigns on schedule or explicitly before a public milestone.
- Measure each stage and set timeouts from observed supported-host runtimes
  with useful headroom. A timeout must identify a hang, not kill a healthy SEA
  build seconds before packaging completes.
- Keep publication jobs dependent on every required artifact, but avoid
  rerunning a successful reproducible Wasm build when only native packaging
  changes.

The target is one cached qualification cycle, one immutable tag, one clean CI
confirmation, and one publication—not a sequence of tags used to discover
cross-platform assumptions.
