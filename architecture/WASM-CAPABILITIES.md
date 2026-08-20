# WebAssembly capability manifest

[`wasm-capabilities.json`](wasm-capabilities.json) is the reviewed source of
truth for Sage.js WebAssembly portability. It covers every current N-API
export, declared FFI function and resource, production source kernel, compiler
runtime intrinsic, and separately linked specialist library. The policy is
fail-closed: discovering a new boundary without a matching reviewed entry is
an architecture error.

The manifest records architectural intent, not merely whether a symbol happens
to link today. Its dispositions have these meanings:

- `generated-wasm`: generate or retain the Wasm adapter from declared ABI and
  ownership metadata;
- `shared-core`: share a host-neutral mathematical C core while keeping Node
  and Wasm conversion in separate adapters;
- `compiled-source`: compile the canonical typed Python source to the Wasm
  kernel pack while retaining its same-source fallback;
- `portable-fallback`: intentionally use the tested ordinary Sage.js path in a
  browser;
- `desktop-only`: retain a specialist desktop dependency with an exact fallback
  or explicit capability error;
- `remove-unused`: delete an unused boundary instead of porting it.

`status` is independent of disposition. In particular, `planned` means that a
reviewed ABI or compiler route exists but is not yet in the production browser
closure. A declaration with `targets.wasm: true` must say whether it is
`included`, `planned`, or deliberately `excluded`; an omission needs a
substantive explanation.

Each portable fallback cites a registered differential test. Each shared core
names its source file, and the checker rejects Node-API types or headers in that
file. Browser entry modules are also checked for eager imports of native host
packages.

## Public report

[`wasm-capabilities-report.json`](wasm-capabilities-report.json) is a generated,
machine-readable projection intended for the website, diagnostic tooling, and
mobile shells. It contains public availability, ownership, fallback, consumer,
and resource-limit fields without internal review prose. Its source hash and
complete contents are checked deterministically.

Run the audit directly with:

```sh
node scripts/check-wasm-capabilities.cjs
```

After an intentional manifest review, regenerate only the public projection:

```sh
node scripts/check-wasm-capabilities.cjs --write-report
```

The checker never generates review decisions. New discovered capabilities must
be classified by a person before the audit can pass.

### Updating availability after a port

Generated FFI availability is checked directly against the function and
resource selections in the production Wasm build. A declaration cannot be
marked available unless it is selected there, and selecting it while leaving
the reviewed status as planned also fails.

Compiled-source kernels and shared cores use tracked production capability
manifests. Add their tracked path to `policy.production_manifests`; the file
must have this deliberately small schema:

```json
{
  "schema": "sagejs.wasm-production-capabilities/v1",
  "capabilities": [
    {
      "id": "kernel:number-field-zeta-coefficients-production",
      "module": "number-fields"
    }
  ]
}
```

The manifest ID must be the exact capability ID in this inventory. Presence in
the production closure requires `status: "available"`; claiming availability
without the receipt also fails. Release build receipts may add artifact paths
and hashes to these records, but the tracked source closure—not an ignored
`dist/` file—drives the deterministic architecture report on a clean checkout.

An available specialist capability instead names a tracked
`availability_evidence.path`. Ordinary runtime intrinsics are discovered from
the browser-compatible compiler runtime registry itself.

The production infrastructure lane's canonical generated-FFI closure is
`packages/flint-wasm/release/production-capabilities.json`. Once that file is
integrated, add it to `policy.production_manifests`; the checker automatically
uses it instead of parsing the legacy handwritten adapter selections. The
release artifact and build receipt must authenticate the exact same capability
set, but ignored build output is not required for an architecture-only check.

## Integration hooks

The integration lane should add:

```json
{
  "architecture:wasm": "node scripts/check-wasm-capabilities.cjs"
}
```

to `package.json`, invoke `pnpm run architecture:wasm` from
`architecture:check`, and add `test/wasm-capabilities.cjs` to the unit test
manifest. Those shared registry edits are intentionally outside this parallel
lane's claims.
