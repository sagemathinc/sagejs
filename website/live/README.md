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

## Product behavior

- Shift+Enter runs the current `# %%` or blank-line cell.
- Ctrl/Command+Enter runs all source.
- Selection, cell and all-source buttons are explicit and keyboard accessible.
- Text streams while a run is active. Plotly displays stay outside the worker.
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
