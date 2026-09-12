# Numerical native multipack routing — draft integration

N2 packaging increment, 2026-09-12, stacked on prefix-free aggregate PR #259.
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
