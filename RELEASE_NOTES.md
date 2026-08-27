# Sage.js 0.4.1

Sage.js 0.4.1 is an **early alpha release** for developers and researchers who
want to experiment with portable research mathematics in native executables,
Node.js, Jupyter, and the browser. Missing functionality, incompatible API
changes, and rough edges remain expected; installation reports and mathematical
bug reports are especially valuable.

This release makes the public npm package substantially easier to embed:

- `createSage` is exported directly from `@sagemath/sagejs` for both CommonJS
  and ES modules.
- A Sage session now uses the installed platform executable and therefore has
  the same native mathematics capabilities as the command line.
- The package no longer attempts to load the unpublished
  `@sagemath/sagejs-flint` development package.
- Installing with pnpm no longer reports an ignored `zeromq` build script.
- The package, website, and browser application now provide direct Node and
  browser embedding examples.
- Sage mode provides `version()` and a machine-readable `version(json=True)`
  result, while Python mode retains Python-compatible name resolution.

The mathematical library and supported native platforms are those of 0.4.0:

- macOS arm64, signed with Apple Developer ID and notarized by Apple;
- Linux x86_64 and arm64;
- Windows x86_64, available through npm and as a standalone ZIP.

Every downloadable archive has a SHA-256 checksum. Windows Authenticode
provisioning may still be incomplete, so the Windows executables may be
unsigned. The release workflow records the signing mode used, and Windows
SmartScreen may show an unrecognized-app warning for unsigned artifacts.

Install the command line globally:

```sh
npm install -g @sagemath/sagejs@0.4.1
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
