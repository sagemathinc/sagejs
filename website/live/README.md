# Sage.js live browser application

This directory is the static, backend-free execution application intended for
the dedicated, non-credentialed `app.sagejs.org` origin. It consumes the
verified production artifact emitted by `packages/flint-wasm`; it does not
carry an independent mathematical bundle or runtime implementation.
Staging also copies the exact generated
`architecture/wasm-capabilities-report.json`. The public panel filters that
report by family and explains available, fallback, planned and desktop-only
behavior without exposing internal review notes.

## Build and preview

Build the pinned WebAssembly production artifact first, then stage the site:

```sh
pnpm --dir packages/flint-wasm build
node website/live/scripts/stage.mjs
node website/live/scripts/static-server.mjs
```

Open `http://127.0.0.1:4173/`. The preview server applies the same important
COOP, COEP, CORP and CSP policies as production. Serving the source directory
directly does not work: staging verifies every file in
`dist/production-manifest.json`, checks that `dist/build-receipt.json` embeds
the identical artifact, and publishes it below its SHA-256 identity.

The staged directory is `website/live/dist/` and is intentionally ignored by
Git. It contains only static files. Production publication prepares identity
and Brotli representations under immutable release keys in a private R2
bucket, then atomically deploys the Worker in `cloudflare/worker.mjs`. Direct
Cloudflare Pages deployment is not supported because authenticated runtime
files exceed its 25 MiB per-file limit. Configure the custom domain as a
dedicated execution origin with:

- no authentication cookies or ambient credentials;
- no privileged API routes;
- no analytics script or remote font/CDN injection;
- correct `application/wasm` content type;
- the checked-in response headers left intact.

The runtime version pointer and service worker use revalidation. Mathematical
assets live below `assets/sha256-<artifact identity>/` and are immutable. A
new deployment therefore warms a new cache before deleting older Sage.js
caches; rollback selects the old identity without mutating its bytes.

## Validation

Fast UI, limit, persistence, staging and security-contract tests require no
WebAssembly toolchain:

```sh
node --test website/live/test/*.test.mjs
```

After a clean WebAssembly build, the browser release gate proves the app works
after the network is disabled:

```sh
node website/live/test/browser-offline.mjs
node website/live/test/browser-embed.mjs
```

The test stages the verified release, loads it under production headers in
headless Chromium, evaluates exact mathematics, waits for service-worker
installation, disables the network, reloads, and evaluates again. Set
`SAGEJS_CHROMIUM` if Chromium is not installed in a standard location.

Registration includes the staged release digest in the service-worker script
URL. Thus a byte-identical worker implementation still installs and warms the
new complete cache when an artifact changes; activation removes only older
Sage.js release caches after the new install succeeds.

Firefox and WebKit remain manual/CI browser-matrix release checks because this
focused script intentionally uses Chromium's DevTools protocol to make network
loss deterministic.

## Embeddable cell candidate

The staged site includes a provisional reusable cell at `/embed/v1/`. It is
built from the same controller, evaluator, rich-output pipeline, and standard
ipywidgets manager as the standalone app. The declarative form is:

```html
<script type="module" src="./embed/v1/sagejs-cell.mjs"></script>
<sagejs-cell run-button-text="Evaluate">
  <script type="text/x-sage">factor(2026)</script>
</sagejs-cell>
```

The equivalent module API is:

```js
import { createSageCell } from "./embed/v1/sagejs-cell.mjs";

const cell = await createSageCell(document.querySelector("#calculus"), {
  source: "show(integral(sin(x), x))",
  autoEvaluate: true,
});
```

Each cell currently owns an independent worker and exposes `source`, `ready`,
`run`, `interrupt`, `reset`, `clear`, `snapshot`, and `dispose`. Configuration
supports Sage or Python language mode, editor visibility, button text,
auto-evaluation, bounded timeout, System/Light/Dark themes, and math
typesetting. Controller events are re-emitted as bubbling, composed custom
events from the element. Removing a cell disposes its worker and widget views.

`browser-embed.mjs` qualifies both declarative and factory-created cells,
including Shadow DOM CodeMirror/output, independent lifecycle, KaTeX, and a
live Sage `@interact` slider. It also loads the module and immutable runtime
from a second origin into a deliberately non-isolated course page. A Blob
module bootstrap handles both the kernel worker and its nested compiler worker;
the public runtime responses permit credential-free CORS and cross-origin
resource use.

A strict host CSP must explicitly allow the pinned Sage.js asset origin. The
smallest currently qualified shape is equivalent to:

```text
script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://app.sagejs.org
worker-src blob: https://app.sagejs.org
connect-src https://app.sagejs.org
style-src 'self' 'unsafe-inline' https://app.sagejs.org
font-src https://app.sagejs.org
img-src data: blob: https://app.sagejs.org
```

The host does not need COOP or COEP for basic execution and standard widgets;
the component reports `crossOriginIsolated: false` in that mode. The iframe
transport, shared-session/pooling policy, complete isolated-versus-fallback
capability table, and Firefox/WebKit matrix remain under implementation. Do
not yet treat the candidate URL as a frozen compatibility contract.

## Product behavior

- Shift+Enter runs the current `# %%` or blank-line cell.
- Ctrl/Command+Enter runs all source.
- CodeMirror 6 provides Sage/Python highlighting, four-space indentation,
  bracket completion, search, line numbers and undo without a remote CDN.
- Selection, cell and all-source buttons are explicit and keyboard accessible.
- Text streams while a run is active. KaTeX mathematics and Plotly 2D/3D
  displays render outside the worker; the typesetting control can expose the
  plain representation instead.
- Recorded cell input is the same CodeMirror Sage/Python view in read-only
  mode, so copied results retain useful syntax highlighting without becoming
  a second editable document.
- Interrupt, reset, timeout and output overflow replace the worker and clear
  its resources.
- Worksheets save source locally; results and kernel objects do not persist.
- `.sage` source and bounded SagePack data import/export are explicit actions.
- Share URLs encode bounded source only in the fragment; there is no share
  service and fragments are not sent in HTTP requests.
- The service worker caches a complete release after one successful load.

The CSP must permit `'unsafe-eval'` because the visible Sage source is compiled
to JavaScript and evaluated inside the kernel worker. This exception is
deliberate and is safe only as part of the documented non-credentialed-origin
model; do not mount this application beneath an account or secrets-bearing
origin.

The production manifest also supplies each module's linker-enforced linear
memory contract. The capability panel reports the current 16 MiB initial and
512 MiB hard maximum for FLINT and lazy M4RI separately; it never presents
browser JavaScript heap estimates as WebAssembly memory.

See `privacy.html` for the public privacy, execution-boundary and resource-limit
contract.
