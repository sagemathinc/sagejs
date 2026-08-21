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
explanation, and resource-limit fields without internal review prose. The
record shape is `id`, `family`, `disposition`, `status`, `fallback`,
`wasm_module`, `public_consumers`, `explanation`, and optional
`resource_limits`. Its source hash and complete contents are checked
deterministically.

The report also contains `workflow_aliases`. Each key is a stable public
workflow tag from `test/browser-wasm-parity-corpus.json`; its value is the
ordered list of exact capability IDs required by that workflow. The
architecture audit rejects unknown IDs, duplicate IDs, missing or extra tags,
and any disagreement between the reviewed aliases and the executable corpus.
This makes the alias table suitable for release gates and user interfaces: a
shell does not have to infer requirements from display names or implementation
symbols.

Workflow requirements name observable dispatch boundaries. Do not list a
library function merely because a compiled kernel or shared C adapter calls it
internally: route telemetry authenticates the outer artifact dispatch, not
private calls within that artifact. Conversely, when a workflow requires a
specific public operation, its corpus source must invoke that operation before
another operation can satisfy it from a shared cache.

[`wasm-capability-api.mjs`](wasm-capability-api.mjs) is the host-neutral query
surface for the website, mobile shell, and release tooling. It accepts the
separately staged report, validates and detaches all public data, freezes its
result, and fails closed on malformed or unreviewed identifiers:

```javascript
import { createSagejsCapabilityAPI } from "./wasm-capability-api.mjs";

const response = await fetch("./wasm-capabilities-report.json", {
  cache: "no-cache",
  credentials: "omit",
});
if (!response.ok) throw new Error(`capability report: HTTP ${response.status}`);

const capabilities = createSagejsCapabilityAPI(await response.json());
capabilities.sagejs_capabilities("analytic-functions");
capabilities.workflow("quadratic-dedekind-zeta-batch");
```

Pass the exact receipt-authenticated production closure as
`availableCapabilityIds` when reporting a concrete release. In that mode the
API computes workflow availability from the receipt, not from descriptive
manifest status:

```javascript
const capabilities = createSagejsCapabilityAPI(report, {
  availableCapabilityIds: productionManifest.capabilities.map(({ id }) => id),
});
capabilities.workflow("elliptic-lseries-complex-plot").available;
```

The report remains a separate 400+ KiB asset rather than being duplicated in
strict Python or every application bundle. The method name
`sagejs_capabilities` is deliberately ready for the Sage-facing helper: a
kernel host can install this checked API in its isolated evaluator and expose
the same call without embedding manifest data in mathematical source.

## Executable route provenance

A capability ID alone does not prove how a browser provides it. Browser parity
requirements therefore pair every exact ID with one of three closed routes:

- `receipt-backed-wasm-artifact` requires the exact capability record in the
  production artifact manifest, including its module, artifact name, and
  artifact SHA-256;
- `shared-runtime-js` requires an `available` public report record whose
  reviewed module is `host-runtime`;
- `portable-fallback` requires a `fallback` report record with the reviewed
  `portable-fallback` disposition.

The parity runner resolves the requested `(id, route)` pair, records both the
required route and selected provenance in its receipt, and fails with
`missing-capability-route` when only a different route exists. In particular,
a descriptive report entry—even one marked `available`—cannot manufacture a
receipt-backed Wasm artifact, and a portable fallback cannot satisfy an
artifact-required release test. Unknown routes and malformed provenance are
rejected rather than inferred.

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
