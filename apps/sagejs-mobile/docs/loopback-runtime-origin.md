# Verified mobile runtime origin

The iPhone, iPad, and Android applications execute the bundled Sage.js browser
runtime from an application-owned HTTP server bound to `127.0.0.1` on an
operating-system-selected port. Each launch creates a 256-bit random capability
as the first URL path component. The WebView accepts navigation only within that
exact origin and capability root.

Before opening the listening socket, the native host verifies every bundled
byte against `asset-manifest.json`, verifies the embedded production manifest
and build receipt have the same artifact identity, and confirms the complete
production asset closure appears with matching lengths and SHA-256 digests.
Only those allowlisted regular files can be served. There is no remote URL,
development fallback, directory listing, service worker, cookie, or filesystem
fallback.

Every response carries COOP `same-origin`, COEP `require-corp`, CORP
`same-origin`, `nosniff`, a restrictive permissions policy, and a CSP whose
network access is `connect-src 'self'`. Generated Sage.js code requires
`'unsafe-eval'` and WebAssembly requires `'wasm-unsafe-eval'`; workers are
limited to the same origin and `blob:`. The launch HTML is `no-store`; other
assets behind the per-launch capability URL are immutable. Wasm, JavaScript,
JSON, HTML, and CSS receive explicit MIME types.

Android declares the normal `INTERNET` permission because Android applies it to
loopback sockets too. It causes no runtime prompt. Cleartext is disabled by
default and enabled only for `127.0.0.1` in the Network Security Configuration;
the server never binds an external interface. No storage permission is present.
iOS uses the narrow `NSAllowsLocalNetworking` transport exception and keeps
arbitrary network loading disabled.

The React component stops the server when it unmounts or enters the background,
and restarts it with a fresh port and capability when active. Native teardown
also closes the listening socket. A failed manifest verification, socket bind,
or native-module response leaves the runtime unavailable instead of reverting
to `file:` or a remote host.
