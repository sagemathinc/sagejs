# SEA size and production native-pack plan

## Outcome

Keep the uncompressed Sage.js single executable small enough that adding
mathematics does not cause roughly linear growth from repeated static copies of
FLINT, GMP, MPFR, MPC, OpenBLAS, M4RI, or Givaro.

The immediate release design should contain:

- one stripped Node executable template;
- one shared Sage/Python bootstrap source and two mode-specific V8 caches;
- one production-kernel addon containing the same portable production-kernel
  namespaces on every release platform;
- the existing host addons until their API and ownership boundaries can be
  consolidated independently.

Official releases contain exactly one production mathematics pack with the
same capability set on every supported platform. The manifest schema can
describe multiple packs only as an architectural escape hatch; producing more
than one requires an explicit reviewed exception for an incompatible
toolchain, allocator, or ownership boundary. Missing platform support is not a
reason to omit a component from one release: portability is part of admitting
native mathematics into Sage.js.

## Implementation status

Implemented on 2026-08-18:

- generated core and C++ shield symbols carry a content-addressed module
  identity;
- generated adapters support both standalone and pack initializers;
- dynamic development caches retain standalone addons;
- production publishing emits one pack and no per-source addons;
- FFLAS and M4RI accelerators remain outside the release pack until their
  existing Windows capability gaps are removed; the portable sparse-matrix
  source contributes only its platform-independent functions;
- wrappers resolve their exact cache-key namespace from the pack first;
- SEA construction rejects incomplete capability sets or pack counts other
  than one;
- the pack manifest records ABI, source, foreign-input, platform, byte-size,
  and SHA-256 identities;
- a machine-readable size report gates gross deduplication regressions.

The implemented portable Linux x86-64 release pack is 23,454,896 bytes versus
229,898,624 bytes for its 22 standalone addons, a 89.8% reduction. The
complete portable `sagejs` SEA is 359,684,558 bytes, down from 581,884,366
bytes after the first two reductions and from the original 623,938,756-byte
baseline.

## Measured baseline and validated savings

All sizes below are from Linux x86-64 at commit `0761e857`, using Node 26.7.0.
The measurement is uncompressed because installed and memory-mapped size is a
first-class distribution constraint.

| Item | Before | After/prototype | Saving |
| --- | ---: | ---: | ---: |
| Node SEA template | 147,870,928 B | 114,709,344 B | 33,161,584 B |
| `sagepython` | 326,847,684 B | 284,305,870 B | 42,541,814 B |
| `sagejs` | 623,938,756 B | 581,884,366 B | 42,054,390 B |
| 24 production-kernel addons | 237,928,992 B | 24,197,352 B | 213,731,640 B |

The first two reductions are implemented by the SEA builder:

- Linux uses `strip --strip-unneeded` on an isolated copy of Node.
- macOS uses `strip -x`, then ad-hoc signs the isolated copy before SEA
  injection. An official macOS arm64 Node 26.5.0 test shrank from 145,307,392
  to 106,962,288 bytes and remained executable.
- Windows intentionally does not run a Unix strip tool. The official Node
  26.5.1 executable inspected on the Windows VM is a 103,298,376-byte non-debug
  PE; debug information is distributed separately rather than embedded.
- The byte-identical Sage and Python bootstrap JavaScript is embedded once.
  The two `.bin` files remain separate because their V8 compilation identities
  and runtime filenames are mode-specific.

The native-pack figure is from a working link prototype, not extrapolation. It
combined the compiled objects for all 24 production modules, statically linked
the union of their libraries once, loaded successfully as a Node addon, and
registered 24 cache-key namespaces. Every namespace had exactly the same export
set as its standalone native addon.

At the current payload, replacing the individual production addons with this
pack would reduce `sagejs` from about 555 MiB to about 351 MiB. Host addons and
other assets account for the remaining native weight.

### Current production-addon breakdown

| Declared dependency class | Addons | Current total |
| --- | ---: | ---: |
| FLINT | 9 | 161.79 MiB |
| FLINT + M4RI | 1 | 18.02 MiB |
| generated/exact core | 12 | 39.51 MiB |
| FFLAS | 1 | 7.19 MiB |
| M4RI | 1 | 0.40 MiB |

The generated object files are small compared with the linked addons. For
example, typical FLINT adapters contain 0.02--0.72 MiB of generated objects but
produce 17.9--18.3 MiB addons. Stripping the already stripped individual
addons saved only about 0.4 MiB over all native assets. The dominant problem is
repeated static library code, not debug symbols.

## Required invariants

The pack is a release optimization, not a different mathematical backend.

1. Each Python source retains its source hash, cache key, native ABI,
   foreign-declaration identities, JavaScript fallback, inspectable IR, and
   generated C provenance.
2. `SAGEJS_NATIVE_MODE`, `SAGEJS_NATIVE_REQUIRED`, and
   `SAGEJS_NATIVE_DISABLE` retain their current behavior.
3. A wrapper receives only the native namespace for its own cache key. Native
   exports from unrelated sources are not flattened into one object.
4. Owned resources are created, used, and finalized by the same generated
   adapter contract. Packing must not create a new cross-addon ownership path.
5. Development builds may discover unavailable native dependencies and retain
   correct dynamic fallbacks. Official releases fail closed unless every
   declared production capability is present on every supported platform. The
   manifest records exactly which sources and dependency fingerprints are in
   the pack.
6. Ordinary dynamic compilation continues to produce a standalone addon. A
   user cache does not need the production pack builder.
7. Native Windows x64, macOS arm64, Linux x86-64, and Linux arm64 are release
   gates.

## Implementation plan

### 1. Give generated modules pack-safe C identities

Change the C backend so generated external symbols include a stable module
identity derived from the source/cache identity. Function names alone are not
sufficient: the prototype found
`sagejs_kernel_flint_byte_region_copy` exported by two different sources.

- Pass a short source identity into adapter, core, and exception-shim
  generation.
- Namespace every generated non-static global consistently in declarations,
  definitions, and call sites.
- Add a build-time global-symbol audit across all production objects. Apart
  from the two expected Node registration symbols in standalone mode, duplicate
  defined globals are an error.
- Increment the native ABI because generated object identity changes.

Do this in the generator rather than applying `objcopy` rewrites in production.
The prototype used `objcopy` only to validate the link architecture quickly.

### 2. Add a dual standalone/pack initializer contract

Generate one initialization body with two compile modes:

```c
#ifdef SAGEJS_NATIVE_PACK_INITIALIZER
napi_value SAGEJS_NATIVE_PACK_INITIALIZER(
    napi_env env, napi_value exports) {
    /* existing napi_define_properties body */
}
#else
static napi_value initialize(napi_env env, napi_value exports) {
    /* same body */
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
#endif
```

Standalone dynamic caches compile exactly as they do now. The production pack
compiles each adapter as a separate translation unit with a unique initializer
macro. Separate translation units preserve the current static helper and
resource-finalizer isolation.

Generate a small aggregator translation unit that:

1. creates one JavaScript object per cache key;
2. calls that source's initializer on the object;
3. stores the object under the cache key on the pack export;
4. exports a pack manifest/version for loader validation.

### 3. Build one content-addressed production pack

Extend `scripts/build-production-native-kernels.cjs` after the existing
per-source lowering/provenance phase.

- Compile pack-mode adapter objects from the already generated sources.
- Link the union of required static libraries once, using deterministic source
  and library ordering.
- Define the pack identity from the ordered source cache keys, native ABI,
  generator fingerprint, platform, architecture, Node module ABI, toolchain,
  and foreign-input fingerprints.
- Publish `pack/index.json` and one platform-native `.node` file alongside the
  per-source `index.cjs` wrappers.
- Keep standalone addons in the persistent development cache. Stop copying
  them to `dist/native-kernels` once the packed path has full coverage.
- Record byte size and SHA-256 in the pack manifest.

The builder should represent packs as an array even though the initial release
has one. A split is allowed only for a measured platform/toolchain/ownership
constraint; convenience is not enough reason to duplicate the math libraries.

### 4. Teach wrappers and the SEA loader about packed namespaces

Add a private runtime registry keyed by the source cache key. The SEA resource
loader extracts and loads the production pack once, validates its manifest,
and populates this registry before requiring a source wrapper.

The generated wrapper then resolves native code in this order:

1. its exact cache-key namespace from the private production-pack registry;
2. its local standalone `sagejs_native_kernel.node` for a normal development
   cache;
3. the existing JavaScript fallback when native mode permits it.

Do not expose the registry as a public API. A namespace is accepted only when
its pack ABI, cache key, source hash, and foreign declaration identities match
the wrapper metadata.

The SEA asset collector should embed:

- the production pack addon and manifest;
- `dist/native-kernels/index.json`;
- each source's `index.cjs` wrapper;

and should reject any accidentally published per-source production `.node`
files. The loader extracts one addon rather than one addon per imported source.

### 5. Validate behavior, ownership, size, and portability

Add focused tests before deleting the individual release artifacts.

- Compare every packed namespace's export names with the corresponding
  standalone addon.
- Load all production wrappers with individual addons deliberately absent and
  `SAGEJS_NATIVE_REQUIRED=1`.
- Run representative native calls from every dependency class, including
  returned resources, mutation, close/finalizer behavior, and exception
  translation.
- Run the complete production-native, FFI lifecycle/fuzz, architecture, SEA
  smoke, and startup gates.
- Differentially compare packed, standalone-native, and JavaScript results for
  the existing production corpus.
- Run ASan/UBSan where supported and the Windows lifecycle stress tests.
- Build and run on Windows x64, macOS arm64, Linux x86-64, and Linux arm64.

Add a machine-readable release size report. Initially gate:

- accidental inclusion of any standalone production addon in a SEA;
- pack size growth relative to the sum of generated objects and declared
  dependency closures;
- total uncompressed SEA size, with per-platform baselines recorded only after
  all four release receipts exist.

The gate should report the largest assets and size deltas, not merely fail with
a single aggregate number.

## Follow-up reductions

After the production pack lands, the next duplicated native dependency copies
will be the hand-written FLINT host addon (24.50 MiB), generated FLINT FFI addon
(19.09 MiB), and the production pack itself (prototype 23.08 MiB). Combining
those requires a separate ownership/API review. It should not delay the
production pack, whose cache-key namespaces already provide a narrow and
validated consolidation boundary.

Compressed release artifacts should still be produced for transport, but
compression is not a substitute for these changes: it does not reduce installed
size, extraction cost, or the amount of duplicated executable material the OS
must map.
