# Imaginary-quadratic Wasm distribution review request

Status: **development-only; do not stage in the production Wasm layout**. This
document makes the independent review actionable. It is not a safety finding,
license opinion, artifact-derived SBOM, or distribution approval.

## Exact candidate and reproducible checks

The current `wasm32-wasip1` candidate is
`target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm`, 346,869
bytes, SHA-256
`7344622aa162561860fef387e2133d59d1908b1aec71c8c1c15c57b7c98cd201`.
This digest identifies one development build, not a production release. Rebuild
and review any changed digest. Run:

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
