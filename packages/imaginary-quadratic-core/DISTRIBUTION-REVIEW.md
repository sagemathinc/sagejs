# Imaginary-quadratic Wasm distribution review request

Status: **development-only; do not stage in the production Wasm layout**. This
document makes the independent review actionable. It is not a safety finding,
license opinion, artifact-derived SBOM, or distribution approval.

## Exact candidate and reproducible checks

The current `wasm32-wasip1` candidate is
`target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm`, 346,982
bytes, SHA-256
`2133f2b425c84580a15441b06810c1126839b80fdde0c3d15acd412f6d318eb3`.
This digest identifies one development build, not a production release. Rebuild
and review any changed digest. The cross-Linux-host and macOS receipts below
concern earlier `7344622a` and `e28a3e01` artifacts; they do not certify these
new bytes. The byte-matched link-map receipt for this candidate is recorded
below. Run:

```sh
sh packages/imaginary-quadratic-core/scripts/build-wasm.sh
node packages/imaginary-quadratic-core/scripts/audit-distribution.mjs
node --test packages/imaginary-quadratic-core/test/distribution-audit.test.mjs
cargo test --locked --manifest-path packages/imaginary-quadratic-core/Cargo.toml
node --test packages/flint-wasm/test/quadratic-core-product.test.mjs packages/flint-wasm/test/quadratic-core-evaluator.test.mjs
```

`src/lib.rs` includes the shared first-party
`packages/class-groups/src/imaginary.rs` by source path. The standalone crate
does not link the cubic source modules or GMP, MPFR, FLINT, Arb, or PARI. Its
direct Rust dependencies are `serde`, `serde_json`, and `smallvec`. The audit
checks the artifact bytes, import/export inventory, a resolved Cargo build
graph, Cargo archive checksums, and notice-file hashes. It also records source
and build-script hashes, compiler identity, linker hash, and build flags. Its
own scope label is `development-build-closure-inventory`; it does **not**
establish an artifact-derived list of linked code. The graph has 13 packages,
including first-party GPL-2.0-or-later code (the repository declares
GPL-3.0-only) and registry crates declaring MIT, Apache-2.0, Unlicense, and
Unicode-3.0 expressions. Some resolved packages are build-time procedural
macros, so the graph must not be misrepresented as a list of code present in
the final Wasm bytes.

The saved
[`development-distribution-inventory-2026-09-28.json`](development-distribution-inventory-2026-09-28.json)
binds this development candidate's SHA-256 to the audit's 12 source/toolchain
input hashes, four WASI imports, export and memory inventories, and 13 locked
packages with registry-archive and notice-file hashes. Regenerate it only
after inspecting a changed candidate or input:

```sh
node packages/imaginary-quadratic-core/scripts/audit-distribution.mjs \
  --output packages/imaginary-quadratic-core/development-distribution-inventory-2026-09-28.json
```

It is a review input, not the independent linked-component, license, or
production-artifact receipt required for release.

The artifact imports only `environ_get`, `environ_sizes_get`, `fd_write`, and
`proc_exit` from `wasi_snapshot_preview1`. It exports memory, reactor ABI
version 2, allocation, checked response-length lookup, deallocation,
and JSON execution. The service-envelope ABI remains version 1 and the host
retains support for the existing production reactor ABI. The build requests a 16 MiB
initial and 256 MiB maximum memory. The service caps request and response
payloads at 1 MiB and 16 MiB; the reactor caps live allocations at eight and
their total capacity at 48 MiB. These are source and structural observations,
not yet an independent byte-bound proof.

An earlier 2026-09-26 development build of the same source route was rebuilt
in an independent offline target directory with the same pinned compiler,
linker, lockfile, and flags; its bytes matched. That check did not use the
candidate digest above, establish cross-host reproducibility, or approve
distribution. Likewise, the frozen 11-field development comparison remains
several times slower than PARI at the Sage-mode boundary and omits outer worker
IPC; it is not a release performance receipt.

On 2026-09-27, the **earlier candidate digest**
`7344622aa162561860fef387e2133d59d1908b1aec71c8c1c15c57b7c98cd201`
was rebuilt with
`cargo build --offline --locked --release --target wasm32-wasip1 --lib` in a
fresh `CARGO_TARGET_DIR`, using the pinned linker and the exact `RUSTFLAGS`
from `build-wasm.sh`. That 346,869-byte artifact matched the earlier candidate
SHA-256 byte for byte and passed `verify-wasm.mjs` with one defined 256-page
memory capped at 4096 pages. The read-only distribution inventory again
validated the four WASI imports, five exported reactor functions plus memory,
13 locked packages, registry archive checksums, and notice-file hashes.
`cargo test --locked` passed 31 unit and four service-contract tests; the
distribution-audit, Wasm product, and Sage-mode evaluator suite passed all
five tests, including stale-handle rejection and complete ideal maps. This is
same-host, same-toolchain reproducibility and functional evidence only. It
does not resolve the independent safety, linked-component provenance,
distribution-license, or public-production packaging decisions below.

On 2026-09-27, a separate macOS 26.4 arm64 host (`m1`) checked out clean
revision `72fe83cf4e77b1edb72d85dcf4bec513dd7880ec` in a temporary
directory and built the same crate and `wasm32-wasip1` target with Rust
1.98.1 (`48a229cea`, LLVM 22.1.8), the same `RUSTFLAGS`, and the official
WASI SDK 33.0 arm64-macos archive (verified SHA-256
`85c997a2665ead91673b5bb88b7d0df3fc8900df3bfa244f720d478187bbdc78`).
Its linker reports the same LLD 22.1.0 revision as the Linux SDK. Two
independent clean Cargo target directories on `m1` produced byte-identical
346,801-byte artifacts with SHA-256
`7e7b0f5ff1be5ecebc79cefd8e5347b7f3417e23b9a49d01a6bf38e435b45369`.
That hash differs from the 346,869-byte canonical Linux candidate above.
The difference reaches the function, element, code, and data sections, so it
cannot be dismissed as only a name or producer-section difference; its cause
has not been established. The Mac-built artifact passed the Linux structural
Wasm verifier and all three isolated product/evaluator regressions, including
Sage-mode exact ideal maps and forged/stale handle rejection. This establishes
cross-host functional evidence and Mac-local reproducibility, **not**
cross-host byte identity or approval of either artifact for distribution.

On 2026-09-27, a second Linux x86-64 host (`opt`) checked out clean revision
`31899d7716e208b3f4d6e59cd6cf44842aa30130` in an isolated temporary
directory and built the crate with Rust 1.98.1 (`48a229cea`, LLVM 22.1.8),
the same locked dependencies and `RUSTFLAGS`, and the official WASI SDK 33.0
Linux x86-64 archive (verified SHA-256
`0ba8b5bfaeb2adf3f29bab5841d76cf5318ab8e1642ea195f88baba1abd47bce`).
Its `wasm-ld` SHA-256 was
`5c965a9e8525c7206aa583f9691f1a7a5e46bd4d793bf65f809b7124c670df26`,
identical to the canonical Linux linker's digest. A fresh Cargo target
directory produced exactly the canonical 346,869-byte SHA-256
`7344622aa162561860fef387e2133d59d1908b1aec71c8c1c15c57b7c98cd201`
artifact, and `verify-wasm.mjs` passed its structural memory check. This
establishes reproducibility across two independent Linux hosts with the same
toolchain inputs. It does not explain the Mac/Linux byte difference or replace
the independent review and public production benchmarks below.
The earlier artifact's linked-object receipt remains in
[`link-map-inventory-2026-09-27.json`](link-map-inventory-2026-09-27.json).

On 2026-09-28, an additional fresh Linux target directory was built with the
same compiler, linker, dependencies, and optimization flags plus
`-C save-temps` and the linker's `--Map` output. Its final Wasm bytes matched
the **earlier** 346,869-byte candidate SHA-256
`5aad704d7d6f9af61301431f1f76807e54a614d5132b9b5066626e7aff51915e`.
The refreshed
[`link-map-inventory-2026-09-28.json`](link-map-inventory-2026-09-28.json)
records hashes of the 40 selected linked object/archive members and their
containing archives. In particular, the map identifies 23 members of the Rust
sysroot's self-contained WASI `libc.a`, including allocator and I/O objects;
these do not appear as Cargo packages in the build-graph inventory. The
inventory script refuses a map build whose final Wasm bytes differ from the
candidate and fails closed on unrecognized linked-input forms. The linked Rust
sysroot `libc.a` is byte-for-byte identical to the archive in the pinned
WASI SDK 33.0 Linux x64 sysroot (both SHA-256
`5d8ba34d8c6fd0ac59e0efe37241143887f8f232864bbeacc4181ae739f63371`).
The inventory requires and records that archive equality when given the SDK
path. This earlier-artifact receipt is same-host linked-object evidence, not
cross-host reproducibility or distribution approval. The official
[`wasi-sdk-33` source tag](https://github.com/WebAssembly/wasi-sdk/tree/wasi-sdk-33/src)
points its `src/wasi-libc` submodule at
[`161b3195fc2558d2b1ba3eb9ffae3b2b47407623`](https://github.com/WebAssembly/wasi-libc/tree/161b3195fc2558d2b1ba3eb9ffae3b2b47407623).
This is a specific upstream source candidate for notice review, not a proof
that the distributed archive was built from that commit or a conclusion about
which per-file notices apply. Together these observations provide stronger
provenance input for review, **not** an artifact-derived SBOM:
inlined dependency code may have no separately linked object, linker output
can transform selected members, and the legal obligations for the bundled
WASI libc and every other component remain to be established independently.
The earlier `e28a3e01` candidate passed the locked build-graph and ABI
inventory above. A fresh same-host `-C save-temps`/link-map rebuild produced
byte-identical Wasm with 40 linked inputs, including 23 Rust-sysroot WASI
libc members whose archive bytes match the pinned SDK. This is historical
linked-object evidence, not an artifact-derived SBOM or distribution approval.
The earlier cross-host receipts must not be reused for the candidate at the
top of this document.

On 2026-09-28, the `opt` Linux x86-64 VM checked out clean commit
`f056a01281681ca91af87e331fb60a3b2877b3d3` and built the standalone
reactor in a fresh Cargo target directory with locked offline dependencies,
Rust 1.98.1, `wasm32-wasip1`, and the same `RUSTFLAGS` as `build-wasm.sh`.
The linker was copied from the verified local WASI SDK 33.0 and checked on
`opt` at SHA-256
`5c965a9e8525c7206aa583f9691f1a7a5e46bd4d793bf65f809b7124c670df26`;
its LLD version is 22.1.0. The linked Rust-sysroot WASI libc archive has the
same SHA-256 as the pinned SDK archive above. The independent build produced
346,136 bytes with SHA-256
`e28a3e01b0da2580f8bb4bcd8c654e6c98918ac1311e653f17e6b4950462cb91`,
byte-identical to that earlier candidate. This establishes reproducibility
between two Linux hosts for those exact source and toolchain inputs. It does
not resolve the previously observed macOS byte difference, establish a
complete source/license inventory, or approve production distribution.

On 2026-09-28, `m1` rebuilt the **earlier** reactor source from clean detached
commit `1aa8366a79f06a5c2c7b1fc861a4085ade14d4b9`. The isolated reactor
source and lockfile are unchanged from the Linux candidate above; intervening
changes in that package only update this review document. The official WASI
SDK 33.0 arm64-macos archive matched its pinned SHA-256
`85c997a2665ead91673b5bb88b7d0df3fc8900df3fba244f720d478187bbdc78`.
Rust 1.98.1 and the SDK's `wasm-ld` (LLD 22.1.0, SHA-256
`1682e0d83e144ce8e9b3d5f9dbb628ffdbe404c374c86b5757c00bce4a4d1f24`)
built the locked crate offline with the exact `RUSTFLAGS` from `build-wasm.sh`
in two independent Cargo target directories. Both produced the same 346,068-byte
artifact, SHA-256
`d4f2100e5f088dc1cf219de228c8a3bdd21e461aaab32adf17e5489b5aca87e6`.
The Mac SDK's WASI `libc.a` matches the Linux-pinned archive byte for byte at
SHA-256 `5d8ba34d8c6fd0ac59e0efe37241143887f8f232864bbeacc4181ae739f63371`.

The Mac-built artifact is **not** byte-identical to the 346,136-byte Linux
candidate. A section-by-section comparison found identical type, import,
table, memory, global, export, producer, and target-feature sections, but
different function, element, code, data, and name sections. The code and data
sections have equal lengths across hosts; the Mac name section is 68 bytes
shorter. Both code sections contain 503 functions and have the same multiset
of body lengths; 379 function bodies match byte-for-byte as a multiset. This
is compatible with changed function ordering or references but does not prove
that explanation or semantic equivalence of the remaining bodies. Thus the
68-byte whole-file difference is not merely custom metadata, and its cause
remains unproven. The Mac artifact passed `verify-wasm.mjs`
(one defined memory, 256 initial and 4096 maximum pages) and all five focused
Node Wasm product/evaluator tests on Linux, including exact ideal maps,
forged/stale handles, and host cleanup after malformed exports and failed
initialization. The Mac artifact also passed the exact-ideal-map and tamper
browser test in Chromium, Firefox, and WebKit on Linux, both with and without
cross-origin isolation. This is Mac-local reproducibility and cross-host
functional evidence, **not** cross-host byte identity, independent safety
review, or distribution approval. Do not silently substitute the Mac bytes
for the current candidate.

On 2026-09-28, the new 346,982-byte candidate above passed `verify-wasm.mjs`,
the locked source/build/ABI inventory, and a fresh same-host `-C save-temps`
link-map rebuild that matched its SHA-256 byte for byte. The updated
[`link-map-inventory-2026-09-28-current.json`](link-map-inventory-2026-09-28-current.json)
records 40 linked inputs, including 23 Rust-sysroot WASI libc members whose
archive matches the pinned SDK byte for byte. The standalone Rust suite passed
34 unit and four service-contract tests; the Node product/evaluator suite
passed five tests. The development-injected Sage-mode evaluator also passed
Chromium, Firefox, and WebKit with and without cross-origin isolation, using
the commands below. This evidence is for the current digest, but it does not
replace a new independent cross-host rebuild, source or license review, or
production distribution approval. The medium-range cyclic
presentation change is also covered by native Rust and Sage-mode exact-map
regressions, including a noncyclic fallback.

To reproduce the linked-object inventory for the current candidate after
preparing the pinned Wasm toolchain, run from the repository root:

```sh
review_dir=$(mktemp -d -p /tmp sagejs-iq-link-map.XXXXXX)
toolchain_dir=$(node packages/wasm-toolchain/scripts/toolchain.cjs path)
CARGO_TARGET_DIR="$review_dir/target" \
CARGO_TARGET_WASM32_WASIP1_LINKER="$toolchain_dir/sdk/bin/wasm-ld" \
RUSTFLAGS="-C target-feature=+simd128 -C link-arg=--export-memory -C link-arg=--initial-memory=16777216 -C link-arg=--max-memory=268435456 -C save-temps -C link-arg=--Map=$review_dir/link.map" \
cargo build --offline --locked --release --target wasm32-wasip1 --lib \
  --manifest-path packages/imaginary-quadratic-core/Cargo.toml
node packages/imaginary-quadratic-core/scripts/link-map-inventory.mjs \
  packages/imaginary-quadratic-core/target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm \
  "$review_dir/target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm" \
  "$review_dir/link.map" \
  "$toolchain_dir/sdk/share/wasi-sysroot/lib/wasm32-wasip1/libc.a"
```

On 2026-09-28, the development-injected Sage-mode browser evaluator ran the
earlier `e28a3e01b0da2580f8bb4bcd8c654e6c98918ac1311e653f17e6b4950462cb91`
reactor in Chromium 151.0.7922.34, Firefox 153.0, and WebKit 26.5. Each
engine passed both the normal cross-origin-isolated test server and an
unisolated mode that asserts `crossOriginIsolated === false` and the absence
of `SharedArrayBuffer`. Both modes checked unconditional class numbers, small
and large full groups, exact ideal-class coordinates, and forged-result
rejection. The reproducible commands are:

```sh
SAGEJS_BROWSER_ENGINES=chromium,firefox,webkit \
SAGEJS_REQUIRED_BROWSER_ENGINES=chromium,firefox,webkit \
  node packages/flint-wasm/test/browser-quadratic-core-evaluator.mjs
SAGEJS_BROWSER_UNISOLATED=1 SAGEJS_BROWSER_ENGINES=chromium,firefox,webkit \
SAGEJS_REQUIRED_BROWSER_ENGINES=chromium,firefox,webkit \
  node packages/flint-wasm/test/browser-quadratic-core-evaluator.mjs
```

These are isolated development-injection results. They do not put the
reactor in the production Wasm layout or satisfy the independent distribution
and safety decisions below.

## Required independent decisions

1. Review `src/reactor.rs`, the host in `packages/flint-wasm`, and the compiled
   artifact together. Exercise pointer overflow, memory growth, allocation
   failure, wrong kind/length, repeated calls, and error cleanup. The current
   owned-allocation table checks the pointer, length, kind, and monotonically
   increasing nonrecycled generation without dereferencing unregistered
   pointers. A regression grows linear memory with live request and response
   handles, confirms that the Wasm allocator reuses an address, and checks that
   the old handle cannot run or deallocate its replacement. Review
   generation exhaustion, forged handles, host lifetime assumptions, and
   response-length lookup independently; the passing test is not a safety
   signoff. The generation is an identity tag, not a secret capability token.
2. Establish source provenance and distribution obligations for every linked
   component, including the shared `packages/class-groups/src/imaginary.rs`
   source, Rust standard library, third-party crates, and required notices.
   Confirm that the exact production packaging satisfies the applicable
   licenses; the declared expressions and archive notices above are not a
   legal conclusion.
3. Produce an artifact-bound build/source/notice receipt and review the exact
   byte-identical artifact that would be staged. The existing build-graph
   inventory is useful input but is not a substitute for this gate.
4. Only after those reviews, wire the reactor into the public production Wasm
   package and run the normal browser and Node-Wasm public API, exact ideal-map,
   forged-result rejection, resource-limit, and frozen PARI comparisons.
   Development injection tests prove behavior of the candidate, not public
   availability or speed competitiveness.

The review should record reviewer identity, artifact digest, source revision,
scope, findings, required changes, and a separate distribution decision. No
status flag or release manifest should be changed merely because this request
exists.
