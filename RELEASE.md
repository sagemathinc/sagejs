# Releasing Sage.js

Sage.js releases should be boring publication events, not the first complete
test of a candidate. The expensive GitHub workflows provide independent
release evidence, signing, and publication. They are deliberately the **last**
step in the process.

This document complements [TESTING.md](TESTING.md) and
[DISTRIBUTION.md](DISTRIBUTION.md). It is the release playbook for both people
and coding agents.

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
  GitHub's **Latest** pointer. The public installer resolves its default archive
  through `releases/latest`, so benchmark evidence, optimizer snapshots, and
  native dependency catalogs must be created with `--latest=false` (or as a
  prerelease). The release-event guard restores the highest published product
  version if an infrastructure release is accidentally made latest.
- Do not publish when a required gate is skipped, timed out, or merely passed
  on an older commit.

## Recommended release sequence

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
or SciPy found on `PATH` is intentionally never accepted. On POSIX hosts the
essential sequence is:

```sh
candidate=$(git rev-parse HEAD)
rm -rf build/numerical-scipy build/numerical-qualification/platform/PLATFORM
mkdir -p build/numerical-scipy-downloads build/numerical-scipy
pnpm release:qualify:numerics:oracle -- \
  --artifact-directory build/numerical-scipy-downloads \
  --prefix build/numerical-scipy/prefix \
  --provenance build/numerical-scipy/provenance.json \
  --download
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
Windows. The platform collector derives and checks its platform rather than
trusting a command-line label. It cold-runs and immediately verifies the Node,
fresh-npm, and relocated-SEA product rows against the same source commit,
corpus, artifacts, and hermetic oracle. The macOS signing workflow may collect
the Node row before signing and the npm/SEA rows after signing only because the
two jobs restore the same source and provision the identical content-addressed
oracle at the identical workspace path.

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
  --output build/validated-numerical-gate
pnpm release:qualify:numerics:gate -- \
  --candidate "$candidate" \
  --input build/numerical-qualification \
  --output build/rebuilt-numerical-gate
pnpm release:qualify:numerics:authenticate -- \
  --candidate "$candidate" \
  --gate build/validated-numerical-gate/release-gate.json \
  --rebuilt-gate build/rebuilt-numerical-gate/release-gate.json \
  --public-npm-root build/release/npm/sagejs.tgz
```

The gate is exactly 16 product rows (Node/npm/SEA on four platforms plus four
browser/worker rows), five supplemental categories represented by seven raw
records, and one source-current hermetic SciPy binding per platform. Producer
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
checked-in fail-closed assembler into a fresh directory, and requires exact
byte equality with the small publisher-facing gate. Cloudflare deployment does
the same. Thus valid-looking nested SHA/content-ID substitutions cannot be
authorized by merely recomputing the compact outer ID; the successful producer
run's immutable raw evidence is the trust boundary.

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
cannot run until the exact 16-row numerical gate and all five supplemental
categories pass. Monitor individual jobs and stop or cancel dependent work promptly
after a failure. Pull the complete failed-job log and identify the first causal
error rather than reacting to the final aggregate failure.

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
If its publication job fails after every producer and the numerical gate pass,
dispatch **Request validated release publication recovery** with the original
tagged CI run ID and immutable tag. That small bridge dispatches `ci.yml` at
the tag; its recovery job verifies the exact source SHA and each required job,
then reruns the original publisher job by job ID. It deliberately does not
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
pnpm view @sagemath/sagejs-macos-arm64 version --json
pnpm view @sagemath/sagejs-windows-x64 version --json
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

- Add a coordinator which runs the four cached hosts concurrently, streams
  stage progress, records durations, and emits one source-bound receipt.
- Record native family and final-pack compile timings in the same learned timing
  store used by tests, so heterogeneous hosts can tune the two concurrency
  limits automatically without changing artifact identities.
- Preflight Wasm/browser release workloads on a persistent browser host.
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
