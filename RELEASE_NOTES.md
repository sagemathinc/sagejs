# Sage.js 0.5.0

Sage.js 0.5.0 is an **early alpha release** for developers and researchers who
want to experiment with portable research mathematics in native executables,
Node.js, Jupyter, and the browser. Missing functionality, incompatible API
changes, and rough edges remain expected; installation reports and mathematical
bug reports are especially valuable.

This release adds three substantial mathematical systems:

- A typed, provider-independent LMFDB catalog for genus-2 curves and number
  fields. It includes a small immutable offline catalog, exact Sage.js object
  construction, explicitly bounded live HTTP queries, and validated read-only
  SQLite snapshots. Automatic and bundled modes never access the network.
- Exact class groups for broader cubic and quartic number-field workloads,
  including authenticated relation/projection machinery, cached projection
  reuse, and conservative exact fallbacks when a fast path cannot certify its
  result.
- Mestre's method of graphs as a sparse exact modular-forms subsystem. Public
  APIs cover supersingular Brandt modules, sparse Hecke operators, weighted
  isogeny graphs, cuspidal and spectral computations, Krylov certificates,
  rational and algebraic eigenpackets, and q-expansions. The release also adds
  Hilbert modular-form computations over `Q(sqrt(3))` and `Q(sqrt(5))`.

The sparse modular-form kernels use the same source-transparent native and Wasm
compiler path with ordinary-Python fallbacks. Their outputs were checked against
Sage semantics, Magma transcripts, modular-symbol Sturm certificates, historical
psage data, and pinned LMFDB records. Browser release gates compile all 279
production Wasm kernels and exercise exact public computations in Chromium.

Packaging and runtime improvements include a lazy boundary for specialized
extension-field root splitting, bounded fail-fast coefficient-prefix tests, and
updated startup and browser payload guardrails. The supported release platforms
remain:

- macOS arm64, signed with Apple Developer ID and notarized by Apple;
- Linux x86_64 and arm64;
- Windows x86_64, available through npm and as a standalone ZIP.

Every downloadable archive has a SHA-256 checksum. Windows Authenticode
provisioning may still be incomplete, so the Windows executables may be
unsigned. The release workflow records the signing mode used, and Windows
SmartScreen may show an unrecognized-app warning for unsigned artifacts.

Install the command line globally:

```sh
npm install -g @sagemath/sagejs@0.5.0
```

Or embed Sage.js in a Node application:

```sh
pnpm add @sagemath/sagejs
```

```js
import { createSage } from "@sagemath/sagejs";

const sage = await createSage();
console.log((await sage.evaluate("factor(370309)")).repr);
await sage.close();
```

On macOS and Linux, the checksum-verifying standalone installer is also
available:

```sh
curl -fsSL https://sagejs.org/install.sh | sh
```

Try Sage.js without installing anything at <https://app.sagejs.org/>. Please
report installation problems and mathematical bugs at
<https://github.com/sagemathinc/sagejs/issues>.
