# Sage.js

**Open research mathematics, native to Node.**

Sage.js is an experiment in building a genuinely useful open computer algebra
system in the Node.js ecosystem. It combines:

- a lightweight Python-like language compiled to JavaScript;
- optional Sage-style mathematical syntax;
- V8's mature optimizing runtime;
- direct access to JavaScript and npm packages;
- native mathematical libraries through stable Node-API bindings.

The long-term goal is analogous to SageMath and OSCAR: integrate the best open
mathematical libraries behind a coherent language, object model, coercion
system, package distribution, and collection of high-level algorithms.

Version 0.1 is intentionally much smaller. It revives and modernizes the
self-hosting language compiler formerly developed as JPython and PyLang. It
does not yet contain the native mathematical library layer.

## Install

Sage.js requires Node.js 20.17 or newer.

```sh
npm install --global @sagemath/sagejs
```

It can also be tried without a global installation:

```sh
npx --package @sagemath/sagejs sagejs
```

## Sage mode

The `sagejs` command uses Sage-style syntax by default:

```text
$ sagejs
Welcome to Sage.js [Node.js v26.5.0 on x64].
sage: 2^100
1.2676506002282294e+30
sage: sum([1..100])
5050
sage: 7^^3
4
```

In Sage mode:

- `^` means exponentiation;
- `^^` means bitwise xor;
- `[a..b]` means the inclusive range from `a` through `b`;
- numerical literals pass through the language's configurable number hook.

These features are implemented in the parser and compiler, not by textual
preprocessing.

Run a file directly:

```sh
sagejs program.sage
```

Compile it without executing:

```sh
sagejs compile program.sage --output program.js
```

## Python mode

Python mode retains Python's meaning of `^`:

```text
$ sagejs --python
Welcome to Sage.js (Python mode) [Node.js v26.5.0 on x64].
>>> 2^3
1
>>> 2**3
8
```

The `sagepython` executable is equivalent:

```sh
sagepython program.py
sagepython
```

This is a **Python-like language**, not an implementation of the complete
Python language or standard library. Programs can directly load JavaScript
packages with `require(...)`, and compiled code runs as JavaScript rather than
through CPython or WebAssembly.

## JavaScript API

The compiler can also be loaded from Node:

```js
const createCompiler = require("@sagemath/sagejs");
const compiler = createCompiler();
const ast = compiler.parse("print(2 + 3)");
```

The CLI can emit standalone JavaScript containing the small Sage.js base
library:

```sh
sagejs --python compile input.py --output output.js
node output.js
```

## Build from source

```sh
git clone https://github.com/sagemathinc/sagejs
cd sagejs
npm ci
npm test
```

`npm run build` compiles the TypeScript tooling and then uses the checked-in
bootstrap compiler to rebuild the compiler from its Python-like source. The
build continues until the compiler is compiled with an up-to-date version of
itself.

See [HACKING.md](HACKING.md) for the source layout.

## Status

Sage.js 0.1 is a research prototype. Its existing language test suite is
substantial, but Python compatibility is deliberately incomplete and exact
integer semantics still need design work.

The next architectural milestone is a native Node-API package demonstrating
efficient conversion between JavaScript `BigInt` and a serious mathematical
library such as FLINT or PARI.

## History and licensing

The language compiler descends from RapydScript-ng, JPython, and PyLang. The
original copyright notices and permissive license are preserved in source
headers and under [licenses](licenses/).

Sage.js as a whole is distributed under the
[GNU General Public License, version 3](LICENSE). This is appropriate for an
open research mathematics system built around GPL-compatible mathematical
libraries.
