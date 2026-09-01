# Sage.js 0.7.0

Sage.js 0.7.0 is an **early alpha release** for developers and researchers who
want to experiment with portable research mathematics in native executables,
Node.js, Jupyter, and the browser. Missing functionality, incompatible API
changes, and rough edges remain expected; installation reports and mathematical
bug reports are especially valuable.

This release adds five substantial systems:

- Exact multivariate Gröbner bases over finite prime fields and the rationals
  use portable msolve backends in native builds and WebAssembly. Public results
  are checked against a storage-neutral exact contract with ideal-containment,
  reducedness, monicity, and reconstruction certificates. Malformed and
  out-of-envelope workloads fail closed instead of entering native code.
- Modular forms gain certified q-expansion algebra, computational formula
  subspaces, exact eta products, Kohnen plus spaces, and Shimura lifts. Exact
  weight, level, character, cusp-order, Sturm, and provenance metadata remain
  inspectable, with SageMath and Magma oracle corpora for representative cases.
- The Python compatibility layer now supports pinned upstream Traitlets,
  transport-neutral IPython display and comm infrastructure, `ast.literal_eval`,
  richer callable metadata, `unittest.mock`, warning behavior, and logging
  configuration needed by ordinary Python packages and widgets.
- Browser WebAssembly coverage expands across polynomial factorization,
  multivariate arithmetic, matrices, numeric functions, and the new Gröbner
  backend. Public operations retain exact JavaScript fallbacks when a compiled
  capability is unavailable, and real-Chromium release gates exercise the
  combined production closure.
- Sage/Python mathematics compatibility grows across calculus, symbolic and
  piecewise expressions, discrete mathematics, linear codes, sparse matrix
  construction, plots, and browser worksheets.

The mathematical fast paths keep ordinary-Python or exact dynamic fallbacks,
bounded resource envelopes, and replayable evidence. Generated architecture
inventories classify 1,277 native boundaries and 1,046 reviewed WebAssembly
capabilities. The compressed browser payload has an explicit, narrowly
ratcheted topology budget, while startup and whole-artifact growth gates remain
independent.

The supported release platforms remain:

- macOS arm64, signed with Apple Developer ID and notarized by Apple;
- Linux x86_64 and arm64;
- Windows x86_64, available through npm and as a standalone ZIP.

Every downloadable archive has a SHA-256 checksum. Windows Authenticode
provisioning may still be incomplete, so the Windows executables may be
unsigned. The release workflow records the signing mode used, and Windows
SmartScreen may show an unrecognized-app warning for unsigned artifacts.

Install the command line globally:

```sh
npm install -g @sagemath/sagejs@0.7.0
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
