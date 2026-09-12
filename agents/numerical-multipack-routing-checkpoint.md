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

Class-group benchmark tooling hard-codes the old single-pack path:

- `bench/class-unit-groups/run-complex-cubic-frontier.cjs`
- `bench/class-unit-groups/complex-cubic-frontier-holdout.cjs`
- `bench/class-unit-groups/run-class-unit-corpus.cjs`
- `bench/cubic-online-support-transcript.cjs`

Its frozen v3 runtime-closure receipt format must not silently change. A
coordinated current-layout reader/version update and regression fixtures must
preserve historical evidence. The owning lane was contacted in Discussion104;
these files and historical receipts have deliberately not been edited here.

After that integration: rebuild the complete catalog, run the full production
and corruption suites, verify real npm/SEA installs on all four supported
platforms, measure startup/payload/RSS, and integrate prepared-statistics
descriptors from draft #240. The ARM result recorded in PR #259 predates this
routing change and is not claimed as its qualification. Public statistics still
misses its 10 ms target; no N0–N6 milestone is declared complete here.
