# Eliminate the CoWasm dependency

## Outcome

Make Sage.js's WebAssembly implementation fully Sage.js-owned without
depending on a CoWasm checkout, CoWasm build recipes, or CoWasm browser runtime
packages.

After this work:

- native Sage.js and the SEA distributions remain unchanged by the migration;
- a clean Sage.js WebAssembly build downloads a pinned official WASI SDK and
  pinned upstream mathematical-library source archives, then builds everything
  with Sage.js-owned recipes;
- browser artifacts use a small Sage.js-owned WASI Preview 1 host and bounded
  in-memory temporary filesystem;
- builders do not clone CoWasm or download a CoWasm Git bundle;
- browser packages do not depend on `wasi-js` or `@cowasm/memfs`;
- no build path guesses a sibling CoWasm checkout or accepts
  `SAGEJS_COWASM_ROOT`;
- the existing CoWasm Python benchmark corpus remains as separately licensed
  upstream test data, not as a build or runtime dependency;
- source hashes, source-mirror authentication, atomic publication,
  reproducibility receipts, browser security limits, and mathematical parity
  are at least as strong as they are now.

This is a direct greenfield correction. The completed tree should not retain
compatibility aliases for the old toolchain layout or environment variables.

## Current dependency boundary

CoWasm currently enters Sage.js through three independent paths.

### 1. Build-time toolchain and recipes

`packages/flint-wasm/scripts/wasm-toolchain.cjs` clones the revision recorded in
`packages/flint-wasm/toolchain/lock.json` into a content-addressed cache. It
then uses CoWasm to provide:

- the extracted WASI SDK layout;
- the `cowasm-cc`, `cowasm-c++`, `cowasm-ar`, and `cowasm-ranlib` wrappers;
- build recipes for GMP, MPFR, MPC, FLINT/Arb, and M4RI;
- standalone compile/run probes for those libraries.

This boundary is already narrower than the directory ownership suggests. The
pinned checkout's current standalone recipes build these libraries with the
official WASI SDK 33, not with the legacy Zig compiler. They still invoke the
large `cowasm-cc`/`cowasm-c++` compatibility driver, use CoWasm-owned recipe and
probe files, and resolve CoWasm-shaped prefixes. The implementation work is
therefore an extraction and hardening of a demonstrated direct-WASI-SDK path,
not a speculative port from an unrelated compiler.

Sage.js already owns the ffpoly and smalljac portability transformation and
their Wasm build. Sage.js also already owns final module linking, generated FFI
adapters, kernel packs, production manifests, and browser runtime selection.

The current prepared checkout occupies about 1.4 GB on a build host. It is not
part of the release payload.

### 2. Browser WASI runtime

`packages/flint-wasm/src/wasi-runtime.mjs` imports `wasi-js` and
`@cowasm/memfs`. The bundle supplies a WASI Preview 1 descriptor interface and
an evaluator-private temporary filesystem. FLINT uses real file semantics for
algorithms including quadratic sieve, so this cannot be replaced by no-op
stubs.

The current production modules use only this observed WASI import set:

```text
clock_time_get
fd_close
fd_fdstat_get
fd_fdstat_set_flags
fd_prestat_get
fd_prestat_dir_name
fd_read
fd_seek
fd_write
path_open
path_remove_directory
path_unlink_file
proc_exit
```

The bundled runtime is currently about 569 KB uncompressed and 106 KB with
gzip. It is an eager browser asset.

### 3. Benchmark corpus

`bench/cowasm` vendors ordinary Python benchmark programs under their BSD
license. Those files exercise Sage.js and do not require CoWasm to build or
run. Preserve their source provenance and license. Renaming this corpus is
optional and is not part of dependency removal.

## Architectural decisions

1. **Do not vendor the CoWasm repository.** Copying the complete checkout into
   Sage.js would move rather than remove the dependency and would retain large
   amounts of unused CPython, dynamic-linking, package-manager, and shell
   infrastructure.
2. **Own narrow contracts, not a general Unix emulation layer.** Sage.js needs
   a static mathematical-library toolchain and a small browser WASI host. It
   does not need CoWasm's general-purpose runtime.
3. **Use the official WASI SDK directly.** Build scripts invoke pinned
   `clang`, `clang++`, `llvm-ar`, `llvm-ranlib`, and `llvm-strip` paths with
   explicit checked flags. A small Sage.js wrapper is allowed only where it
   makes those transformations auditable; it must not reproduce unused
   CoWasm modes.
4. **Keep upstream sources outside Git.** Continue using immutable,
   content-addressed source-mirror objects with complete SHA-256 identities.
   Do not commit extracted third-party source trees or built archives.
5. **Keep old CoWasm behavior only as a temporary differential oracle.** The
   implementation branch may build both toolchains while validating the
   replacement. The merged result must contain only the Sage.js path.
6. **Fail closed.** Unknown WASI imports, missing archives, inconsistent
   receipts, unsupported builders, source-digest mismatches, or browser
   filesystem-limit failures are errors, not reasons to use an ambient host
   dependency.
7. **Preserve allocator and ownership boundaries.** This migration must not
   combine WebAssembly modules or transfer allocated values across modules.
   The production layout remains authoritative.

## Required invariants

1. Every source archive, SDK archive, recipe, patch, compatibility header, and
   build driver contributes to the toolchain identity.
2. Two clean release builds from the same lock produce byte-identical
   production directories, or fail the existing reproducibility gate.
3. Production release builds can operate entirely from the authenticated
   source mirror without contacting upstream hosts.
4. Every generated `.wasm` module matches an exact reviewed per-module export
   allowlist. The allowlist includes legitimate reactor/runtime exports such as
   `memory`, `_initialize`, allocator hooks, and result-buffer accessors; it
   rejects accidental toolchain symbols.
5. Existing dynamic fallbacks, source-transparent native provenance, and
   capability reporting remain unchanged.
6. The browser filesystem remains private to an evaluator and enforces the
   current ceilings: 16 MiB per file, 64 MiB total, and 256 files.
7. Filesystem usage accounting tracks allocated file objects, not merely linked
   directory entries, and remains correct after overwrite, truncate, unlink of
   an open file, failed writes, final descriptor close, and evaluator disposal.
8. The runtime supplies the services required by the generated production
   import inventory: monotonic clock behavior, deterministic
   argument/environment policy, bounded stdout/stderr, and an exception rather
   than host termination for `proc_exit`. Cryptographically strong
   `random_get` is required if and only if a checked production module or
   explicit conformance probe imports it; an unimported JavaScript binding is
   not evidence of production support.
9. Node, Chromium, Firefox, WebKit, mobile WebKit, and Windows prebuilt-artifact
   paths continue to consume one authenticated production artifact.
10. Linux x86-64, Linux arm64, macOS arm64, and Windows x86-64 remain supported
    release platforms. Windows need not build the POSIX toolchain locally, but
    must validate and run the resulting artifacts.
11. Linux x86-64 is the canonical publication builder. Two clean canonical
    builds must be byte-identical. Linux arm64 and macOS arm64 must independently
    prepare the toolchain and pass the same source, ABI, and mathematical
    probes; cross-host byte identity is a release goal and any difference must
    be explained by a checked receipt rather than silently accepted.

## Phase 0: freeze the oracle and define completion

Before changing a build recipe, record a baseline at one exact Git revision.

- Save `wasm-toolchain.cjs status --json`, the production build receipt,
  production manifest, artifact-size report, and import/export inventory.
- Record hashes and sizes for every prepared header tree and static archive.
  Archive byte identity is useful diagnostic evidence but is not required if
  equivalent deterministic recipes legitimately change archive metadata.
- Record the exact compiler, configure, make, and link commands actually used
  by the pinned CoWasm recipes, including environment variables and generated
  configuration headers.
- Record every transformation performed by the current compatibility drivers,
  including response-file expansion, host sysroot/path removal, ELF-only linker
  flag removal, `-fvisibility-main`, injected target macros, emulated WASI
  libraries, PIC/side-module handling, startup objects, stripping, and archive
  selection. Convert the transformations needed by a Sage.js build into checked
  command-policy fixtures rather than relying on prose or wrapper line counts.
- Identify every CoWasm compatibility file that reaches a compiled object.
  Preserve its license and provenance if adapted; prefer a new small
  Sage.js-owned implementation when copying would bring unrelated machinery.
- Run the current standalone dependency probes plus the complete Node and
  browser parity corpus. Store machine-readable receipts under `build/`, not
  committed generated output.
- Add a checked dependency audit that classifies every remaining textual
  `cowasm` occurrence as one of:
  - temporary migration oracle;
  - benchmark provenance or license;
  - forbidden build/runtime dependency.

Completion means the third class is empty, `pnpm-lock.yaml` has no installed
CoWasm runtime package, and a release can be built without a CoWasm Git object.

## Phase 1: introduce a Sage.js-owned toolchain contract

Create a private first-party toolchain package, preferably
`packages/wasm-toolchain`, with no browser runtime dependencies. Keep the
authenticated source catalog neutral because it also contains native eclib,
GMP, OpenBLAS, and rforest inputs; either retain it under a neutral `tools/`
owner or create a repository-wide source-catalog package consumed by both
native and Wasm preparation.

The package owns:

```text
packages/wasm-toolchain/
  lock.json
  lock.schema.json
  scripts/prepare.cjs
  scripts/resolve.cjs
  recipes/
  patches/
  probes/
tools/source-mirror/
  catalog.json
  scripts/{stage,upload,fetch}.mjs
```

The exact layout may be refined, but consumers must resolve a semantic
manifest rather than concatenate implementation-specific paths:

```text
toolchain root
  sdk/bin/{clang,clang++,llvm-ar,llvm-ranlib,llvm-strip}
  sdk/share/wasi-sysroot
  prefixes/gmp/{include,lib}
  prefixes/mpfr/{include,lib}
  prefixes/mpc/{include,lib}
  prefixes/flint/{include,lib}
  prefixes/m4ri/{include,lib}
  prefixes/ffpoly/{include,lib}
  prefixes/smalljac/{include,lib}
  receipt.json
```

Implementation steps:

1. Define a new lock schema containing the SDK, source archives, patches,
   recipe inputs, compile/link policy, supported builder platforms, and source
   mirror identities. Remove `cowasm`, `cowasmTarget`, CoWasm workspace-lock
   hashes, wrapper-source paths, and recipe overrides.
2. Move source-mirror ownership out of the CoWasm-shaped resolver. Preserve the
   existing immutable R2 object format where possible, but remove the CoWasm
   Git bundle and seed archives directly into Sage.js recipe inputs.
3. Publish a versioned prepared-toolchain receipt containing the lock digest,
   builder platform, exact tool identities, archive/header hashes, and build
   commands.
4. Keep preparation content-addressed and atomic. Use an explicit preparation
   lock, build in a temporary sibling, validate the complete result, then
   rename into place.
5. Update `packages/flint-wasm/scripts/build.cjs` and the kernel-pack builders
   to consume only the semantic resolver.
6. Fold the legacy ambient paths in
   `scripts/build-ffi-wasm-resource-adapter.cjs` and
   `tools/native-kernel/wasm-production-pack.cjs` into the same resolver.

During development, the resolver may select either the new or old toolchain
only through an explicit test-only comparison option. Do not add a public or
permanent fallback environment variable.

## Phase 1.5: establish the independent WASI oracle

Before selecting any new library recipe as the default, implement the minimal
first-party WASI host needed to compile and execute ABI probes. This early host
may initially omit FLINT's complete temporary-filesystem behavior, but it must
already own checked memory access, errno/rights constants, descriptor setup,
clock behavior, `proc_exit`, import allowlisting, and deterministic lifecycle.

Run the same compiled probes against:

- the new host;
- the old `wasi-js` host while it remains an explicit migration oracle; and
- an independent standards-oriented WASI Preview 1 implementation such as
  Wasmtime.

The old host is a behavioral oracle, not the normative definition of WASI. A
disagreement must be resolved against the Preview 1 contract and the actual
mathematical caller before compatibility is encoded.

## Phase 2: extract and harden the mathematical-library build recipes

Extract the already demonstrated official-WASI-SDK standalone recipes from the
pinned checkout, remove their dependency on CoWasm paths and drivers, and
harden them incrementally so every library can be compared with the frozen
oracle before moving to the next one.

### 2.1 WASI SDK

- Extract the platform-specific, digest-checked official WASI SDK 33 archive.
- Resolve all compiler tools by absolute path.
- Check the target as `wasm32-wasip1` and reject host headers and libraries.
- Centralize the required compile policy, including reactor execution,
  visibility, sysroot, emulated signal/process-clock support, and deterministic
  archive flags.
- Implement only the compatibility-driver transformations observed in the
  Phase 0 command-policy fixtures. Reject unknown host paths, response-file
  recursion, unsupported ELF/PIC flags, and undeclared libraries instead of
  becoming a general compiler-driver compatibility layer.
- Test the driver with a minimal C and C++ compile/link/run probe.

Do not port CoWasm's Zig path, dynamic linker, side-module machinery, CPython
support, or general command-line compatibility. The production Sage.js modules
are statically linked reactors and kernel packs.

### 2.2 GMP

- Build the portable C implementation for `wasm32-wasip1`; ensure host
  assembly is never selected.
- Capture and check generated `gmp.h` ABI values, limb width, and endianness.
- Run integer arithmetic, division, import/export, and allocation probes under
  the browser-compatible WASI host.
- Compare public arithmetic results with native GMP and the current Wasm
  artifact.

### 2.3 MPFR and MPC

- Build each against only the newly prepared GMP/MPFR prefixes.
- Verify rounding modes, infinities, NaNs, signed zero, complex arithmetic,
  allocation/finalization, and representative high-precision operations.
- Confirm that no host-library path occurs in commands or resulting modules.

### 2.4 FLINT/Arb

- Build FLINT 3.6.0 against the new GMP and MPFR prefixes using a checked
  source patch/compatibility set.
- Account explicitly for WASI `fenv`, signal, process-clock, filesystem, and
  temporary-file assumptions.
- Run standalone integer, rational, finite-field, polynomial, matrix,
  factorization, Arb, ACB, algebraic-number, and Calcium probes.
- Exercise an input that forces FLINT's temporary-file path, not merely small
  in-memory factorization.
- Differentially run the public Sage.js corpus against native FLINT and the
  old CoWasm-built module.

### 2.5 M4RI

- Build the portable M4RI configuration directly with the official WASI SDK.
- Test dense binary matrix multiplication, echelon form, rank, solve, and
  error paths over a range of dimensions.
- Preserve its separate lazy module and allocator domain.

### 2.6 ffpoly and smalljac

- Move the already Sage.js-owned Wasm build into the new resolver without
  changing its portability transformations.
- Re-run complete genus 1, 2, and 3 L-polynomial coefficient oracles and
  cross-platform trace hashes.
- Confirm the new toolchain does not reintroduce host-width assumptions.

For every recipe, fail if the install prefix contains unexpected shared
objects, executable host objects, absolute build paths in public metadata, or
undeclared archives.

## Phase 3: replace the browser WASI runtime

Complete the small first-party WASI Preview 1 host established in Phase 1.5 so
it supports the full observed FLINT temporary-filesystem workload. It may keep
the descriptive internal `createWasiHost()` interface; that Sage.js-owned name
is not a compatibility shim. Its implementation must not present a general
Node `fs` emulation layer unless a real caller needs one.

### 3.1 Import contract

- Generate or verify the allowed WASI import inventory from every production
  `.wasm` module.
- Reject a build that adds an undeclared import.
- Implement each syscall from the WASI Preview 1 ABI using explicit little-
  endian memory reads/writes and checked pointer/range arithmetic.
- Keep errno constants, rights, flags, file types, whence values, and clock
  identifiers in one reviewed module with conformance tests.

### 3.2 Bounded temporary filesystem

Implement only the semantics needed by the production modules:

- a preopened `/` directory and `/tmp`;
- regular files plus the precreated `/` and `/tmp` directories; directory
  creation is out of scope while `path_create_directory` remains absent from
  the generated import inventory;
- descriptor allocation, cursor state, read, write, seek, close, and fdstat;
- relative `path_open` with creation/truncation flags and rights checks;
- unlink and empty-directory removal;
- sparse-seek behavior or an explicit checked rejection consistent with WASI;
- exact file-count and byte accounting;
- allocated-object accounting after unlink: an unlinked file with an open
  descriptor continues to consume its file and byte quota until the last
  descriptor closes;
- evaluator-local lifetime with deterministic disposal.

Prevent `..` traversal, NUL-bearing paths, escape from the preopen, descriptor
reuse bugs, integer overflow, writes through closed descriptors, and
use-after-disposal. A failed operation must leave accounting and file contents
consistent.

### 3.3 Host services

- Implement `random_get` with `crypto.getRandomValues` when the generated import
  contract or an explicit production conformance probe requires it; do not
  carry an otherwise unreachable random binding.
- Use a monotonic high-resolution clock for supported clock IDs.
- route stdout and stderr through bounded, UTF-8-safe sinks rather than
  unbounded string accumulation;
- turn `proc_exit` into a typed evaluator exception;
- keep arguments, environment, and preopens minimal and deterministic;
- initialize reactors exactly once and reject use before memory attachment.

### 3.4 Differential and adversarial tests

Run the same compiled syscall probes against the current `wasi-js` host, the
new host, and the independent Preview 1 oracle selected in Phase 1.5 while the
migration oracle remains available. Cover:

- empty and partial reads/writes;
- overlapping iovecs and invalid guest pointers;
- seek before zero and beyond end;
- overwrite, append, truncate, unlink-open-file, and descriptor reuse;
- rights and flag rejection;
- file, byte, and count quota boundaries;
- path normalization and traversal attempts;
- process exit and invalid clock IDs;
- evaluator disposal and repeated construction;
- FLINT quadratic-sieve temporary-file behavior;
- worker interruption, serialization, and browser offline-cache flows.

Once parity and security tests pass, remove `wasi-js`, `@cowasm/memfs`, and any
direct or transitive browser shims no longer used from
`packages/flint-wasm/package.json` and `pnpm-lock.yaml`. Audit the direct
`assert`, `buffer`, `events`, `path-browserify`, `process`,
`stream-browserify`, and `util` dependencies individually; preserve one only
when a production bundle has a checked remaining consumer.

## Phase 4: cut all consumers over and remove CoWasm

1. Make the Sage.js toolchain the only build path.
2. Delete CoWasm checkout, lock-repair, wrapper-installation, recipe-override,
   and Git-bundle handling.
3. Remove `SAGEJS_COWASM_ROOT`, sibling-checkout probing, and CoWasm-shaped
   prefix construction everywhere.
4. Rename CI cache keys and prepared-toolchain markers to Sage.js-owned v2
   identities so stale CoWasm caches cannot satisfy the new resolver.
5. Update routine, candidate, release, deployment, and mobile workflows.
   Windows continues to download the authenticated prebuilt artifact rather
   than preparing a POSIX toolchain.
6. Update `docs/webassembly-reproducible-builds.md`, `DISTRIBUTION.md`, package
   READMEs, source-mirror administration instructions, and architecture
   inventories.
7. Retain required upstream license notices for any adapted code. Remove
   CoWasm runtime licenses only when no corresponding bytes remain.
8. Add a repository check that rejects forbidden CoWasm build/runtime
   references while permitting the benchmark corpus and historical/provenance
   documentation.

Do not remove the frozen oracle until a clean new-toolchain release candidate
has passed the complete matrix. Remove it before merging the final cutover so
the repository itself proves independence.

## Phase 5: validation and release gates

### Focused local gates

- lock-schema and semantic resolver tests;
- mirror-only, network-forbidden toolchain preparation;
- one warm-cache no-op preparation and one corrupted-cache rejection;
- dependency compile/run probes;
- WASI ABI, filesystem, quotas, and adversarial unit tests;
- production receipt and manifest validation;
- `pnpm architecture:check`;
- `pnpm test:wasm` and focused browser parity.

### Reproducibility gates

- Build twice from separate clean directories using only the authenticated
  source mirror on the canonical Linux x86-64 builder.
- Compare the complete production directories byte for byte.
- On Linux arm64 and macOS arm64, build independently and compare semantic
  toolchain receipts, import/export inventories, and mathematical outputs. Also
  compare bytes; if they differ, record and review the precise deterministic
  cause before release.
- Record SDK, compiler, archive, recipe, and output identities in the release
  receipt.
- Prove that deleting every local CoWasm checkout, Git bundle, npm cache entry,
  and legacy environment variable does not change the build.

### Platform matrix

Use the available development hosts before relying on CI:

| Host | Responsibility |
| --- | --- |
| local / `bench-1` | Linux x86-64 clean build, reproducibility, performance |
| `bench-arm` | Linux arm64 clean build and public parity |
| `m1` | macOS arm64 clean build, WebKit, and public parity |
| `windows` | authenticated prebuilt artifact, browser/Node parity, no POSIX build assumption |

Required browser release coverage remains Chromium, Firefox, desktop WebKit,
and the existing mobile WebKit simulator/file-origin policy checks.

### Mathematical and operational gates

- Run the complete existing Wasm public parity corpus, not merely dependency
  probes.
- Compare representative outputs from integer/rational arithmetic, finite
  fields, polynomial and matrix algorithms, factorization, Arb/ACB, algebraic
  numbers, elliptic curves, hyperelliptic curves, L-series, and number fields.
- Measure eager download size, initialization time, first operation, warm
  operation, peak linear memory, and temporary-filesystem usage against the
  existing budgets.
- Require no material regression. Any intentional artifact change must update
  a reviewed baseline with an explanation rather than weakening a ceiling.

## Suggested implementation commits

Keep the work bisectable even if it occurs on one feature branch:

1. baseline receipts, import inventory, and forbidden-reference audit;
2. semantic toolchain resolver and v2 lock schema;
3. minimal first-party WASI ABI host and three-way conformance probes;
4. extracted direct WASI SDK and GMP recipes;
5. extracted direct MPFR and MPC recipes;
6. extracted direct FLINT/Arb and M4RI recipes;
7. ffpoly/smalljac migration and complete toolchain cutover;
8. complete bounded filesystem and browser runtime cutover;
9. npm/polyfill dependency removal and production-bundle audit;
10. CI/source-mirror/documentation cleanup;
11. final four-platform, browser, reproducibility, and performance receipts.

Each intermediate commit should either preserve the current default or be a
complete working cutover. Do not leave the main branch selecting a half-built
hybrid toolchain.

## Risks and mitigations

### Configure and generated-header drift

Autoconf projects may silently inspect the build host. Record commands and
generated headers, force the target/cache answers, and reject host paths in
outputs. Test on x86-64 and arm64 builders even though both produce wasm32.

### Missing compatibility behavior

CoWasm wrappers currently hide some compiler-flag normalization and WASI
emulation details. Audit the actual invoked commands and module imports before
porting. Implement only behavior demonstrated by a Sage.js build or probe.

### Filesystem correctness and security

The small syscall count does not make filesystem semantics trivial. Keep the
host capability-oriented, bounded, and evaluator-local; use adversarial guest
programs and real FLINT temporary-file workloads, not only JavaScript unit
tests.

### Reproducibility differences

Direct recipes may reorder archive members or embed build paths. Normalize
timestamps and archive ordering, use deterministic LLVM archives, strip only
through pinned tools, and compare two clean builds before changing baselines.

### Expanding into a general Wasm operating system

Reject scope growth. New syscalls require an observed production importer,
security review, tests, and an updated declared inventory. Do not port CoWasm's
dynamic linker, CPython, POSIX process model, shell, or package ecosystem.

## Explicit non-goals

- Porting or maintaining CoWasm itself.
- Running CPython inside WebAssembly.
- Supporting arbitrary third-party WASI command programs.
- Adding persistent browser filesystem access.
- Changing Sage.js mathematical APIs or native fallback semantics.
- Making Windows prepare Autoconf-based Wasm dependencies locally.
- Deleting the separately licensed benchmark corpus merely because its source
  repository is CoWasm.

## Final acceptance checklist

- [ ] `rg -i cowasm` finds only allowed benchmark provenance, licenses, and
      historical migration notes.
- [ ] No CoWasm checkout, Git bundle, workspace lock, wrapper, recipe, package,
      cache key, or environment variable participates in a build.
- [ ] `wasi-js` and `@cowasm/memfs` are absent from package manifests,
      `pnpm-lock.yaml`, and production bundles; `pnpm why` and bundle inspection
      show that no obsolete Node/browser filesystem shim remains reachable.
- [ ] A mirror-only clean build succeeds on Linux x86-64, Linux arm64, and
      macOS arm64.
- [ ] Windows consumes and validates the same authenticated artifact.
- [ ] Two clean canonical Linux x86-64 production directories are
      byte-identical; arm64 Linux and macOS receipts are semantically identical,
      with any byte difference explicitly reviewed.
- [ ] Node and all required browser parity/security suites pass.
- [ ] Mathematical oracles and source-transparent fallback tests pass.
- [ ] Artifact size, startup, operation, memory, and filesystem budgets pass.
- [ ] Documentation describes only the Sage.js-owned toolchain and runtime.
- [ ] The old oracle and every permanent compatibility shim are deleted.
