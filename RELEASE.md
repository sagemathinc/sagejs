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

The long-term interface should be a single checked-in command, for example
`pnpm release:qualify --platform <name>`, shared by these hosts and GitHub CI.
Until that exists, treat the workflow steps as executable specifications and
record the exact commands and SHA in the release notes or an agent receipt.

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

The tag starts the clean native/SEA workflow and the reproducible Wasm release
workflow. Monitor individual jobs and stop or cancel dependent work promptly
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

Deploy `app.sagejs.org` only from the successful reproducible Wasm run for the
same source SHA. The deployment workflow intentionally requires that SHA to be
reachable from `origin/main`.

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

- Add `pnpm release:qualify --platform ...` so persistent hosts and GitHub call
  one implementation instead of duplicating shell sequences.
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
