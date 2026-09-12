# Numerical native multipack routing — draft integration

N2 packaging increment, 2026-09-12, based on main after prefix-free aggregate
PR #259 merged.
This is not merge-ready and does not enable numerical backend defaults.

## Implemented

Production publication separates nonempty all-binary64, foreign-library-free
lowered families from families requiring the exact dependency pack. Mixed
families remain in the exact pack. Selection uses actual IR, not function names.
Both groups retain generated same-source bodies and wrappers. No numerical
source, ABI, compiler lowering, or automatic-selection policy changes.

The v5 production catalog derives paths only from validated content identities:

```text
native-kernels/index.json
native-kernels/packs/<packKey>/<cacheKey>/index.cjs
native-kernels/packs/<packKey>/pack/index.json
native-kernels/packs/<packKey>/pack/sagejs_native_kernel_pack.node
```

The generated wrapper's existing `../pack` lookup works unchanged. Ordinary
autoload resolves the selected source's pack. SEA collection enumerates the
complete catalog, rejects missing assets and symlink paths, and retains the
platform lifetime/renamed-host checks for every pack. SEA extraction authenticates
and extracts only the selected pack, including its content identity, digest,
size, ABI, target and kernel membership. Development v3 caches remain supported;
old generated v4 production outputs must be rebuilt, not aliased into this layout.

## Focused evidence

- TypeScript compilation passes.
- Aggregate architecture passes; strict Python passes all 393 modules.
- Node 22.22.2 passes all six focused tests, including prior prefix-free pack
  regressions; Node 26.8.1 passes the three new layout/routing tests.
- Actual generated numerical and exact families publish into separate packs.
  Numerical public `is_compiled`/`nativeAvailable` autoload succeeds while the
  exact pack directory is physically withheld. A cancellation-sensitive sum
  returns exactly 1; the restored exact pack returns the correct 202-bit integer.
- The actual compiled SEA resource loader, under a controlled asset transport,
  extracts and executes the numerical pack without reading/extracting the
  withheld exact pack. Six invalid manifest variants are rejected before load:
  wrong pack identity, digest, membership, size, native ABI and architecture.
- Path traversal, incomplete catalogs, duplicate pack/kernel/source identities
  and mismatched membership have focused rejection tests.

The controlled SEA asset transport is **not an executable SEA qualification**.
An additional specialized test now builds and relocates two real executable SEA
fixtures on Linux x64 Node 26.8.1, using the actual compiled resource loader.
The valid fixture computes the cancellation-sensitive sum exactly and leaves
the exact pack unextracted; the second fixture rejects a corrupted embedded
manifest before extraction. Execution has no compiler on `PATH`, no developer
native cache and an absent exact prefix. Each fixture is 157,220,036 bytes
(mostly the unstripped Node template), not a measured Sage.js product payload.
This is executable native-pack loading qualification only, **not** full Sage.js
Python/CLI/npm/SEA qualification. Reproduce with a prepared native checkout and
a Node builder supporting `--build-sea`:

```sh
node --test test/numerics/performance/multipack-sea.cjs
```

These checks use existing built frontend/runtime inputs with freshly compiled
TypeScript and freshly generated native fixtures, not a fresh eight-stage
product build. The full production-native suite has been updated for the layout
but still needs a newly built complete production catalog before execution.
This proves separate native-pack loading, not removal of every other eager
exact-library import or a measured whole-product startup/RSS improvement.

## Merge blockers and remaining qualification

Class-group benchmark tooling now has explicit current-layout readers:

- `bench/class-unit-groups/run-complex-cubic-frontier.cjs`
- `bench/class-unit-groups/complex-cubic-frontier-holdout.cjs`
- `bench/class-unit-groups/run-class-unit-corpus.cjs`
- `bench/cubic-online-support-transcript.cjs`

The new candidate runtime closure v4 hashes the entire v5 catalog tree and
authenticates every pack's bytes, source routing and manifest; a standalone
fallback in any pack is rejected. The selected pack is recorded separately and
must agree with the complete catalog. An unused pack is still part of the
runtime identity. Historical closure v3 keeps its original flat paths and
producer behavior; no historical receipts, cohorts, timing ledgers or live
optimizer-service files are changed. This narrow compatibility extension was
announced in Discussion104 before editing the four readers. Regression tests
exercise both schemas and the full freeze/qualification/disclosure gates.

The real executable pack fixture now passes on all four persistent platforms;
see the [scoped receipts and verifier](../bench/numerics/performance/results/n2-multipack-sea-de1262a00/README.md).
These reuse explicitly identified frontend/dependency inputs and remain distinct
from full Sage.js npm/SEA qualification.

Still required: rebuild the complete catalog, run the full production
and corruption suites, verify real npm/SEA installs on all four supported
platforms, measure startup/payload/RSS, and integrate prepared-statistics
descriptors from draft #240. The ARM result recorded in PR #259 predates this
routing change and is not claimed as its qualification. Public statistics still
misses its 10 ms target; no N0–N6 milestone is declared complete here.

## Full-catalog integration checkpoint

The first full local build at `4291d2368` passed stages 1–7, including all 41
production kernel families. Its v5 catalog is complete and authenticates through
the new benchmark reader. The one-family dependency-free pack is 26,856 bytes;
the 40-family exact pack is 28,489,560 bytes. These are addon file sizes, not
compressed product payload or measured startup/RSS savings.

Stage 8 correctly stopped because the previously qualified NLopt manifest
bound the old `tools/resources.ts`. The integration updates that reviewed hash,
adds its new `tools/native-pack-layout.js` dependency, and explicitly returns
the manifest to `pending_source_current_requalification`. The NLopt algorithm,
adapter, Wasm bytes and historical `qualification-v1.json` are unchanged.
Ordinary pending-state verification passes; `--require-qualified` still rejects.
All 35 focused NLopt backend/ABI/promotion tests pass. This is not promotion or
release qualification; a subsequent complete build and source-current release
evidence are still required. Architecture and strict Python (393 modules) pass.

Earlier attempts remain visible: unsupported test-tier declarations initially
blocked build startup and were corrected in `4291d2368`; an extra Node 22
holdout test was scheduled during module-cache reconstruction and failed on
the absent runtime cache (16 passed, one failed). That run is not claimed as
qualification and is rerun only after the cache is stable.

## Executable product checkpoint at `e4d066c38`

The graph-enabled eight-stage Linux x64 build now passes (10m36s), with
41 authenticated production families and two packs; all 41 families reused
their validated generated objects. Lazy preparation passes for 431 modules,
eight dynamic artifacts and 46 multiprocessing modules. Both real product
SEAs build and pass `test/sea-smoke.cjs`; the public numerical CMinpack and
NLopt SEA tests also pass (2/2). These are full local executables, unlike the
earlier four-platform loader fixtures.

| Executable | Bytes | SHA-256 |
| --- | ---: | --- |
| Sage.js | 502426062 | `9d4640bc38d2b49abf30a4982538955b1bb9f69d91d01a70fb8e25af10fac0ea` |
| SagePython | 414910926 | `7942e13e055ba09763d83981a6e8ca3cbc4a0a66674bc1a41ac94127ab75e0d5` |

The Linux x64 platform npm archive builds. The root archive does **not** yet
pass ordinary prepack: its functional tests pass, but the unchanged 400ms
development-CLI startup gate fails at 411.0ms normalized. A second unchanged
run after other owned builds finished also fails at 409.0ms (empty CLI
185.1ms). Concurrency therefore does not explain away the failure. No budget
was increased and prepack was not bypassed. Fresh installed-root-package
qualification has not run. Startup attribution, four-platform full product
qualification, and source-current backend promotion evidence remain open;
this PR stays draft.

Earlier local attempts correctly rejected a missing graph addon, then a stale
build receipt after enabling it. Rebuilding with the validated graph and FLINT
prefixes resolved those artifact-input issues; neither was a solver failure.
The post-build closure regressions pass 19/19, and the corrected Node 22
post-build holdout run passes 17/17. Artifact sizes above are not evidence of
startup, RSS or compressed-payload improvement.

## Current-main integration at `d3c436020`

PR #259 has merged. PR #262 now targets main and merges `256419004` without
changing mathematical algorithms or compiler lowering. The sole merge conflict
was the pending NLopt public closure: the reviewed main evaluator identity is
combined with the multipack loader identities. The resulting public bundle is
`0f700d227efce9e5b284b5488cefa8a027206ef093fc5afa3c9cae388b78a842`.
Ordinary source-current verification passes; `--require-qualified` still
rejects the explicitly pending state. Historical receipts are unchanged.

The complete graph-enabled local build passes in 14m12s, rebuilding all 41
kernel families into two production packs. Post-build architecture checks and
strict Python (403 modules, zero errors) pass. All 12 focused production,
catalog, closure and independent-pack tests pass without skips. They include
autoload of every production family, numerical execution with the exact pack
withheld, and rejection of six corrupt manifests and stale FFI/compiler
metadata. The 35 focused NLopt backend/ABI/promotion tests also pass.

Ordinary root `pnpm pack` passes its complete routine prepack validation in
2m12s, including the unchanged startup gate. This is a new-source pass, not an
erasure of the prior `e4d066c38` failures or a measured startup speedup. Lazy
preparation passes for 441 modules, eight dynamic programs and 46 authorized
multiprocessing modules. The root archive and Linux platform archive build.
A fresh Linux x64 install passes public APIs, lazy numerical resource checks
and relocated SEA execution. Both rebuilt product executables pass general SEA
smoke and the two public CMinpack/NLopt SEA tests, without skips.

| Merged-source artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Sage.js SEA | 504191438 | `6ca63ad06ec95aaa6387f0d625a8d828b775d1af16140f9bed4d311bcde10c20` |
| SagePython SEA | 416623054 | `88bfe34a70e64318f8c4ea0eb5902b0f5bc772a321b63a952906a71f3c15354f` |
| Root npm archive | 51537277 | `f6a53ef3c0681aabf807306ea7efe7c206cf966aa8b5de878aafc7140c8cc285` |

These are development qualification artifacts, not a published release or a
new compressed-payload allowance. The old executable hashes above do not
qualify this merged source. Full cross-platform packages remain open.

An architecture run launched during compiler convergence failed with an
`instanceof` parser error; the stable post-build run passes. Separately,
`parallel:check` cannot select this integration worktree's task because it sees
416 live records. Other lanes' records are not modified to hide that tooling
failure. No four-platform full-product or public-latency target is claimed.

## Frozen Linux ARM64 full-package qualification

The persistent `bench-arm` run at exact source
`d3c436020f79e11ecc8b0c1eccbb2e3e312f7bd7` finishes successfully. The full
native-enabled build publishes all 41 families in two packs (20.76 MiB).
All 12 production/catalog/closure/multipack tests pass; ordinary prepack passes
the routine suite, including startup, in 3m35s. Both real SEAs, general and
public numerical SEA smokes, platform packaging, fresh npm installation,
lazy numerical resources and relocation pass. The runner exits zero and its
host reservation is released. These are functional receipts, not timings that
qualify public numerical latency.

| ARM64 artifact | SHA-256 |
| --- | --- |
| Sage.js SEA | `a782083cbe989a174ec8180afa38bf53c100c02d112551512f66dfccaa6f5684` |
| SagePython SEA | `ccadd0d1fc34f56322f30c0509f1b102d13c07e8a7c11a355b0f040aa0068321` |
| Root npm archive | `050db550f79c5600d651eb9a524b7c8edc713be49840c6dfa08d190491e5ff58` |
| Platform npm archive | `d7e16256ae7a18fbe5b053b59dc645b7956672eb09fa1f107378e1c71e044ad6` |

Earlier attempts are retained separately: a dependency prefix alone did not
enable optional host adapters, and the reused eclib source needed the current
repository's checked FLINT patch before building the adapter. The successful
attempt builds adapters explicitly without rebuilding or modifying shared
native-library prefixes. Mac and Windows full packaging remain in progress.

The macOS run subsequently passes its native-enabled build, all 12 pack tests,
ordinary routine prepack (4m08s), both SEAs and their general/public numerical
smokes. The fresh installed CommonJS check stops because it expects
`darwin-arm64` in `version()`, whereas the product correctly returns its
documented release-platform spelling `macos-arm64`. The checker is corrected
to use the canonical release target, with all four spellings and invalid Node
ABI aliases covered by a focused regression. All 18 package-qualification
helper tests pass. This does not change any mathematical or runtime artifact;
the original install failure is retained, and remaining installed/relocation
checks must still run with the corrected checker.

Windows native build and all 12 pack tests pass. Ordinary prepack first finds
missing `xz`; the upstream native XZ 5.8.3 archive is verified against GitHub's
SHA-256 `8d0048ee51177b11ef1613959c2a268c951f4e7f6fb3706e681e00e34bb6d5e3`
and extracted into the task-local `numerical-tools` directory, without changing
system PATH. The next attempt finds a test defaulting to `python3`; setting its
supported `PYTHON` override to the existing Python 3.13 executable passes that
focused test. The ordinary portable suite then passes. The attempts remain
separate logs; no gate is bypassed and no files are deleted.

The unchanged macOS `d3c436020` archives subsequently pass the complete fresh
installation/public/lazy-resource/relocated-SEA checker from a separate clean
`94c872832` checkout. Runtime and checker sources remain distinct; this is not
a claim that the old archives were rebuilt at the checker commit. The Mac host
reservation is released. Its Sage.js/SagePython SHA-256 values are
`663e8a33c6a05d216faa70dedf510ec58ebbaa78b17377a4e558e11e453fceb7` and
`652d0f7451d025db7ace853ec9e9a06182a8811f4c48fa6d1d68c19c935329be`;
root/platform archives are
`c7d9f13b7b2d8e4969ea6928b5b9502cc6fc5aa40656a51e38b84b51ea303972` and
`78e76ed100688644c46102ce5e5a9a051755ff3242ea39ee52a2be4a3fe38039`.

Windows routine prepack passes in 6m19s, followed by both SEAs and the general
SEA smoke. The explicit CMinpack/NLopt smokes then fail: the build explicitly
reported optional reactor omission, and those tests indexed unavailable result
values. This is not qualified numerical execution. The authenticated numerical
product is now transferred from the frozen ARM64 source using the existing
publisher/installer, identity
`sha256:1313fd9ad1d870225b681c7cb170c7cd57a96ad96e95eaeafaa2bfa9ce41c069`.
Its transport archive SHA-256 is
`33b3bac538178cec59d7410cf6205520f31bcec5daa32027fac859b88545aba6`.
Windows installation authenticates it successfully. A fresh bounded runner
sets `SAGEJS_NUMERICAL_PRODUCT_ROOT` and `SAGEJS_NUMERICAL_RUNTIME_REQUIRED=1`,
then rebuilds, ordinarily prepacks, tests both SEAs, and uses the corrected
checker. Those final results remain pending, not a four-platform pass.

To preserve Windows capacity, only this candidate's generated
`packages/flint/.native/production-kernels` cache receives reversible NTFS
compression after checking it contains no reparse points: 1,349,816,031 logical
bytes occupy 653,805,992 compressed bytes. No files or shared prefixes are
deleted. The current local controller is
`/tmp/sagejs-multipack-windows-required-product.ps1`; its output is
`/tmp/sagejs-multipack-d3c436020-windows-required.log`, with a 45-minute ceiling
and a 1.5 GiB free-space check before each stage. Inspect it before resuming or
launching another host job. Earlier attempts remain in their separate logs.
