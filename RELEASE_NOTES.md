# Sage.js 0.4.0

Sage.js 0.4.0 is an **early alpha release** for developers and researchers who
want to experiment with portable research mathematics in native executables,
Node.js, Jupyter, and the browser. Missing functionality, incompatible API
changes, and rough edges remain expected; installation reports and mathematical
bug reports are especially valuable.

This release substantially expands Sage.js since 0.3.0:

- The receipt-authenticated WebAssembly runtime now runs a broad public Sage.js
  corpus directly in Chromium, Firefox, and WebKit. The hosted application is
  available at <https://app.sagejs.org/>.
- Number-field arithmetic now includes substantially broader maximal-order,
  ideal, class-group, unit-group, regulator, roots-of-unity, and zeta-function
  computations, with exact certificates and fail-closed acceleration paths.
- Elliptic curves over the rationals gain L-series evaluation at complex
  arguments, probable analytic rank and leading-coefficient computation,
  Mordell–Weil rank and generators, root numbers, and much faster coefficient
  generation through the portable smalljac integration.
- Hyperelliptic curves gain extensive genus-2 and genus-3 Jacobian arithmetic,
  local L-polynomials, group structure, heights, and BSD-related computations.
  Narrow automatic native paths are enabled only where four-platform receipts
  authenticate exact agreement; all other workloads retain exact fallbacks.
- Integer partitions and broader combinatorics, graph, matrix, polynomial,
  finite-field, numerical, symbolic, plotting, and polyglot workflows have
  expanded substantially.
- Python mode more closely follows CPython floating-point parsing, formatting,
  hashing, exceptional-value, and arithmetic semantics.
- Native release packaging now consolidates mathematics libraries into a
  production pack, reduces standalone startup work, and enforces architecture,
  payload, startup, and cross-platform correctness budgets.

Supported native release platforms:

- macOS arm64, signed with Apple Developer ID and notarized by Apple;
- Linux x86_64 and arm64;
- Windows x86_64, available through npm and as a standalone ZIP.

Every downloadable archive has a SHA-256 checksum. Windows Authenticode
provisioning may still be incomplete, so the 0.4.0 Windows executables may be
unsigned. The release workflow records the signing mode used, and Windows
SmartScreen may show an unrecognized-app warning for unsigned artifacts.

Install with npm on any supported platform:

```sh
npm install -g @sagemath/sagejs@0.4.0
```

On macOS and Linux, the checksum-verifying standalone installer is also
available:

```sh
curl -fsSL https://sagejs.org/install.sh | sh
```

Please report installation problems and mathematical bugs at
<https://github.com/sagemathinc/sagejs/issues>.
