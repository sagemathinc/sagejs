# Sage.js 0.6.0

Sage.js 0.6.0 is an **early alpha release** for developers and researchers who
want to experiment with portable research mathematics in native executables,
Node.js, Jupyter, and the browser. Missing functionality, incompatible API
changes, and rough edges remain expected; installation reports and mathematical
bug reports are especially valuable.

This release extends four substantial mathematical systems:

- Brandt modules now include integral ideal-class and component-group
  arithmetic, exact rank-four lattices, batched Hecke operators, sparse Mestre
  graphs, and replayable certificates checked against independent data.
- Modular-symbol spaces reconstruct exact cusp-form q-expansions over rational
  and cyclotomic coefficient fields. Composite levels, bad-prime operators,
  all signs, saturated integral modules, old/new decompositions, character
  Eisenstein series, and replayable Sturm certificates are supported.
- Cubic class-group computations gain a resident exact relation/HNF engine,
  authenticated presentation replay, reusable relation workspaces, and
  conservative dynamic fallbacks. Automatic native HNF selection is restricted
  to the exact matrix-shape and coefficient-bit envelope covered by release
  evidence; every out-of-envelope matrix fails closed to the ordinary exact
  backend.
- Undergraduate mathematics and browser worksheets add broader calculus and
  symbolic compatibility, piecewise functions, discrete mathematics, linear
  codes, improved matrix operations, numeric-data 3D plots, and richer live
  examples.

The sparse modular-form kernels use the same source-transparent native and Wasm
compiler path with ordinary-Python fallbacks. Their outputs were checked against
Sage semantics, Magma transcripts, modular-symbol Sturm certificates, historical
psage data, and pinned LMFDB records. Browser release gates compile all 284
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
npm install -g @sagemath/sagejs@0.6.0
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
