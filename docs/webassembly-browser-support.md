---
title: "WebAssembly browser support and capabilities"
---

# WebAssembly browser support and capabilities

Sage.js uses the same public Sage source in Node, browser workers, and the
mobile WebView. The browser build is an offline-capable, single-threaded
WebAssembly runtime; it is not a remote SageMath service and does not emulate
Node.js.

The checked-in [public capability
report](../architecture/wasm-capabilities-report.json) is the precise answer to
“does this operation work in a browser?” It is generated from the reviewed
[capability manifest](../architecture/wasm-capabilities.json), and the release
artifact authenticates the exact capabilities it contains. The live
environment displays the same report rather than maintaining a separate
marketing list.

## Reading a capability record

Every public record has an `id`, family, disposition, status, fallback,
ownership module, public consumers, and explanation. Some also publish
resource limits.

| Status | Meaning |
|---|---|
| `available` | The production Wasm closure contains and tests the accelerator. |
| `fallback` | The public operation uses its tested ordinary Sage.js implementation. |
| `planned` | The architecture is reviewed, but the production artifact does not contain it yet. |
| `desktop-only` | A desktop dependency is intentionally not shipped; the explanation identifies the public behavior. |

Disposition and status answer different questions. For example,
`compiled-source` describes how a kernel is built, while `available` says that
the current production closure actually contains it. Never infer availability
from a C symbol, an FFI declaration, or a source file alone.

Audit the manifest and regenerate its public projection after a deliberate
review with:

```sh
pnpm architecture:wasm
node scripts/check-wasm-capabilities.cjs --write-report
```

The second command does not invent dispositions. A new native boundary remains
a failing architecture check until a contributor classifies it.

## Browser contract

The routine gate runs the public worker corpus in Chromium. The release gate
rebuilds the artifact twice, requires byte-identical output, and runs the
release corpus in Chromium, Firefox, and WebKit. Browsers must support:

- WebAssembly and JavaScript `BigInt`;
- module Web Workers and transferable `MessagePort` objects;
- ES modules and typed arrays;
- the storage APIs used for worksheets and offline assets when those features
  are enabled.

The dedicated execution origin supplies COOP, COEP, CORP, CSP, MIME, and
permissions headers. Opening the source tree through `file://` is not a
supported deployment. Service workers and local persistence are useful product
features, but mathematical evaluation does not depend on a network after the
complete release has been cached.

The canonical checks are
[`wasm-routine.yml`](../.github/workflows/wasm-routine.yml) and
[`wasm-release.yml`](../.github/workflows/wasm-release.yml). Passing a private
ABI unit test is not browser support: a public program must pass through the
worker evaluator in a real browser.

## Resource and precision behavior

Each Wasm ownership domain has a linker-enforced initial and maximum linear
memory recorded in the production manifest. The in-memory WASI filesystem,
source imports, output, plot payloads, evaluation time, and saved worksheets
are separately bounded. The deployed application publishes its current values
on the [security, privacy, and limits
page](../website/live/privacy.html); those release data take precedence over
old screenshots or benchmark notes.

Capability absence, invalid input, resource exhaustion, and failed
mathematical invariants are distinct outcomes. The runtime may select an exact
portable fallback for an unavailable accelerator. It must not silently lower
an exact or arbitrary-precision API to binary64. Plot-only batch paths may use
documented display precision because their public result is pixels rather than
an arbitrary-precision value.

Complex plots are tiled internally. A 10,000-point packed call is a resource
tile, not a public image-size limit, so larger grids work through multiple
bounded calls.

## Execution and privacy boundary

User source is intentionally executable. Evaluation happens in a replaceable
worker, and interrupt, timeout, reset, or output overflow terminates that
worker and all resources it owns. A worker is not a security sandbox for
secrets. Production therefore uses a dedicated, non-credentialed origin with
no privileged API or ambient account cookies.

Source and results stay in the browser during mathematical evaluation.
Worksheet source is stored locally only when the user saves it; results and
live mathematical objects are not persisted. A share URL carries bounded
source in its fragment. See the public [privacy and security
contract](../website/live/privacy.html) and the [live application deployment
guide](../website/live/README.md).

## Mobile relationship

The iPhone/iPad application bundles the same authenticated browser artifact in
a React Native `WKWebView`; it does not contain Node or a second mathematical
engine. Its native bridge is a short versioned allowlist for document,
lifecycle, and explicit share operations. Read the [mobile architecture and
offline contract](../apps/sagejs-mobile/README.md), [physical-device receipt
policy](../apps/sagejs-mobile/docs/physical-device-feasibility.md), and [App
Review notes](../apps/sagejs-mobile/docs/app-review-notes.md).

Simulator, physical-device, TestFlight, and public-origin claims require their
own current receipts. The existence of a buildable shell or deployment source
does not by itself assert that those external releases have happened.
