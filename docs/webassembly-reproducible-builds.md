---
title: "Reproducible WebAssembly builds"
---

# Reproducible WebAssembly builds

A production Sage.js Wasm artifact is built from a checked lock and a
content-addressed toolchain cache. It must not depend on a developer's sibling
CoWasm checkout, system FLINT, or undocumented compiler flags.

The lock records the exact CoWasm revision, WASI SDK identity, FLINT, GMP,
MPFR, MPC, Arb, and M4RI sources, archive digests, targets, flags, and recipe
overrides. The build receipt authenticates that toolchain, the complete source
and generator closure, generated adapter inputs, each output asset, module
memory limits, and the exported capability set.

## Clean local build

Use Node 22.22.2 or newer and the repository's pinned pnpm. On a supported
POSIX build host:

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile

node packages/flint-wasm/scripts/wasm-toolchain.cjs status
node packages/flint-wasm/scripts/wasm-toolchain.cjs prepare
pnpm build
pnpm --dir packages/flint-wasm build
node packages/flint-wasm/scripts/production-receipt.cjs validate
```

`status` is expected to fail before the first preparation. `prepare` clones the
locked CoWasm revision into the Git common directory's content-addressed cache,
verifies source pins and digests, builds the locked dependencies, and publishes
the completed directory atomically. A second worktree with the same lock reuses
it.

Inspect the selected paths without guessing:

```sh
node packages/flint-wasm/scripts/wasm-toolchain.cjs cache-path
node packages/flint-wasm/scripts/wasm-toolchain.cjs path
node packages/flint-wasm/scripts/wasm-toolchain.cjs status --json
```

`SAGEJS_WASM_TOOLCHAIN_CACHE` may relocate the content-addressed cache.
`SAGEJS_WASM_TOOLCHAIN_ROOT` is an expert override for an already prepared
checkout; the resolver still verifies the full revision, pins, SDK, headers,
and archives. The legacy `SAGEJS_COWASM_ROOT` spelling cannot name a different
tree. An override is not a way to bypass the lock.

Windows is a supported runtime and development target, but does not prepare
the POSIX CoWasm toolchain locally. Windows CI consumes the authenticated
prebuilt Wasm artifact and exercises the portable/native fallback contract.

## What a release contains

`packages/flint-wasm/dist/production-manifest.json` lists every served asset by
path, content length, SHA-256 digest, and safe public path. The matching
`build-receipt.json` embeds the same artifact identity and adds source and
toolchain provenance. A release is invalid if either file is missing, if an
asset is unlisted, or if any byte differs.

The production layout separates allocator ownership domains:

- FLINT/GMP/MPFR/MPC/Arb, loaded eagerly;
- M4RI, loaded lazily;
- source-transparent kernel packs and optional specialist modules as declared.

Host JavaScript, parser modules, standard-library data, and styles used by the
runtime are authenticated assets too. Staging a site or mobile application may
only copy files covered by the receipt.

## Reproducibility and release gates

The scheduled/tag workflow performs two clean builds in separate jobs and
compares the production directories byte for byte. It then runs:

- production manifest and memory-contract validation;
- artifact size, startup, operation, and memory budgets;
- the identical Node oracle and public browser corpus;
- Chromium, Firefox, and WebKit release parity;
- serialization, stale-view, lifecycle, interruption, filesystem quota,
  offline cache, upgrade, and rollback checks.

The authoritative pipeline is
[`wasm-release.yml`](../.github/workflows/wasm-release.yml). The routine
Chromium path in [`wasm-routine.yml`](../.github/workflows/wasm-routine.yml)
may restore an exact artifact cache; a cache miss must resolve the pinned
toolchain rather than an ambient directory.

To compare two locally produced release directories, use the same validator as
CI:

```sh
node packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs \
  --dist build/a/packages/flint-wasm/dist \
  --compare build/b/packages/flint-wasm/dist \
  --output build/reproducible-artifact.json
```

Do not compare timestamps in ad hoc archives. Release archives normalize file
order, modification time, owner, and group after the byte-identical directory
check.

## Staging applications

The live site verifies the production manifest and receipt before copying the
complete closure:

```sh
node website/live/scripts/stage.mjs
node website/live/scripts/static-server.mjs
```

The mobile shell applies the same rule:

```sh
cd apps/sagejs-mobile
pnpm assets:prepare
pnpm assets:verify
```

Neither application has a remote-runtime fallback. Missing, partial, stale,
or unattested assets fail staging or the platform build.

## Diagnosing a mismatch

1. Compare `toolchain/lock.json` and its resolver digest.
2. Compare the receipt's source closure and generated adapter-input hash.
3. Compare the first differing asset SHA-256 in the production manifests.
4. Confirm that no untracked generated source or ambient library entered the
   link.
5. Rebuild from a clean checkout before changing normalization rules.

Never “fix” reproducibility by excluding a runtime input from the receipt.
Authenticate the missing input or remove the dependency.
