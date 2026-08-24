---
title: "Reproducible WebAssembly builds"
---

# Reproducible WebAssembly builds

A production Sage.js Wasm artifact is built from the v2 toolchain lock and the
neutral authenticated source catalog. It does not use a sibling checkout,
system mathematical libraries, ambient compiler paths, or an install-time
native build.

The lock records the official WASI SDK 33 source for each supported POSIX
builder, upstream mathematical sources, semantic install prefixes, compile and
link policy, recipes, patches, and portability transformations. The prepared
toolchain receipt records the exact compiler identity, normalized commands,
archive hashes, and header-tree hashes. The production receipt then binds that
toolchain to the complete Sage.js source/generator closure and every deployed
asset.

## Clean local build

Use Node 22.22.2 or newer and the repository's pinned pnpm. On Linux x86-64,
Linux arm64, or macOS arm64:

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile

node packages/wasm-toolchain/scripts/toolchain.cjs status
pnpm --dir packages/wasm-toolchain toolchain:prepare
pnpm --dir packages/wasm-toolchain probe
pnpm build
pnpm --dir packages/flint-wasm build
node packages/flint-wasm/scripts/production-receipt.cjs validate
```

`status` fails before the first preparation. `toolchain:prepare` downloads the
checked official SDK and source archives, compiles static libraries with the
SDK tools directly, validates the complete prefix, and publishes it atomically
under the Git common directory. Another worktree with the same identity reuses
the prepared directory. Merely running `pnpm install` never prepares it.

Library recipes run with a deliberately small environment. Ambient compiler,
preprocessor, linker, pkg-config, Configure-site, and Make policy is discarded;
only the reviewed recipe values and a fixed minimal platform command path reach
the build. Validation probes are authenticated test inputs, but do not invalidate
the prepared-library cache because they cannot change an installed archive or
header.

The probe compile/links and executes minimal C and C++ modules, then compiles a
raw Preview 1 filesystem/clock module and executes it through both the Sage.js
host and Node's independent standards-oriented WASI implementation. The
production build separately checks every module's exact imports, exports,
memory contract, and artifact receipt.

Inspect paths without guessing:

```sh
node packages/wasm-toolchain/scripts/toolchain.cjs cache-path
node packages/wasm-toolchain/scripts/toolchain.cjs path
node packages/wasm-toolchain/scripts/toolchain.cjs status --json
```

`SAGEJS_WASM_TOOLCHAIN_CACHE` relocates the content-addressed cache.
`SAGEJS_WASM_TOOLCHAIN_ROOT` selects an already prepared v2 directory, but the
resolver still checks its exact receipt. It is not a fallback to arbitrary
headers or archives.

Windows is a supported runtime and development target. It validates and runs
the authenticated production artifact rather than preparing Autoconf-based
libraries locally.

## Authenticated source mirror

Release jobs use no upstream network fallback. They first fetch the selected
platform SDK plus all shared sources from the private R2 mirror, where the
object key and metadata contain the SHA-256 identity. Setting
`SAGEJS_WASM_SOURCE_MIRROR_DIR` makes preparation mirror-only. The same neutral
catalog exports verified `SAGEJS_*_TARBALL` values for desktop native builds.

Administrators stage and publish a reviewed catalog revision with:

```sh
node tools/source-mirror/scripts/source-mirror.mjs stage --all-platforms \
  --output /secure/staging/sagejs-native-sources
node tools/source-mirror/scripts/source-mirror.mjs upload --all-platforms \
  --input /secure/staging/sagejs-native-sources
```

`upload` uses bucket-scoped S3 credentials and HEAD-verifies length and digest
metadata after publication. Upstream HTTPS URLs are bootstrap provenance only;
routine and release workflows fetch immutable mirror objects.

## What a release contains

`packages/flint-wasm/dist/production-manifest.json` lists every served asset by
path, byte length, SHA-256 digest, memory contract, capability closure, and
topology group. The matching `build-receipt.json` embeds the same artifact
identity plus source and toolchain provenance. Missing, unlisted, or changed
bytes invalidate the release.

The production layout preserves allocator ownership domains:

- FLINT/GMP/MPFR/MPC/Arb;
- M4RI;
- source-transparent kernel packs;
- independently loaded specialist modules.

Host JavaScript, parser modules, standard-library data, plotting assets, and
the bounded first-party WASI host are authenticated assets too. Site and mobile
staging may copy only the receipt's closure.

## Reproducibility and release gates

The scheduled/tag workflow builds twice in separate canonical Linux x86-64
jobs using only the mirror and compares production directories byte for byte.
It then runs:

- receipt, export/import allowlist, memory, topology, and size validation;
- the identical Node oracle and public browser corpus;
- Chromium, Firefox, and WebKit release parity;
- startup, operation, interrupt, and memory budgets;
- serialization, lifecycle, filesystem quota, security, offline cache,
  upgrade, and rollback checks.

Linux arm64 and macOS arm64 independently prepare the semantic toolchain from
the authenticated mirror, run the compiler/WASI probes, build the production
payload, and compare every payload byte with the canonical Linux x86-64 build.
The release also compares the prepared receipts' SDK version, compiler version,
source identities, installed header trees, and static archives. Their complete
build receipts intentionally retain their distinct builder platform and
platform-specific SDK archive/tool hashes.
Windows downloads that exact canonical artifact, validates it, and runs a
diagnosed public CLI evaluation without preparing a POSIX toolchain. The
authoritative pipeline is
[`wasm-release.yml`](../.github/workflows/wasm-release.yml).

To compare local release directories:

```sh
node packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs \
  --dist build/a/packages/flint-wasm/dist \
  --compare build/b/packages/flint-wasm/dist \
  --output build/reproducible-artifact.json

node packages/wasm-toolchain/scripts/compare-receipts.cjs \
  build/a/toolchain.json build/linux-arm64/toolchain.json \
  build/darwin-arm64/toolchain.json
```

Release archives normalize file order, modification time, owner, and group
only after the byte-identical directory check.

## Staging applications

The live and mobile applications validate the same receipt before copying it:

```sh
node website/live/scripts/stage.mjs
node website/live/scripts/static-server.mjs

pnpm --dir apps/sagejs-mobile assets:prepare
pnpm --dir apps/sagejs-mobile assets:verify
```

Neither application has a remote mathematical-runtime fallback.

## Diagnosing a mismatch

1. Compare `packages/wasm-toolchain/lock.json` and its resolver digest.
2. Compare prepared receipts, normalized commands, header trees, and archives.
3. Compare the production receipt's source closure and adapter-input hash.
4. Compare the first differing asset digest in the production manifests.
5. Confirm no ambient compiler, header, or library entered the command.
6. Rebuild from clean mirror-only directories before changing normalization.

Never make a mismatch disappear by excluding an input. Authenticate it or
remove the dependency.
