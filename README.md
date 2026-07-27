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
is now beginning to acquire an optional native mathematical library layer.

## Install

Sage.js development after version 0.1 requires Node.js 22.22.2 or newer.

```sh
pnpm add --global @sagemath/sagejs
```

It can also be tried without a global installation:

```sh
pnpm dlx @sagemath/sagejs
```

## Sage mode

The `sagejs` command uses Sage-style syntax by default:

```text
$ sagejs
Welcome to Sage.js [Node.js v26.5.0 on x64].
sage: 2^100
1267650600228229401496703205376
sage: sum([1..100])
5050
sage: 7^^3
4
sage: factor(2026)
2 * 1013
```

In Sage mode:

- `^` means exponentiation;
- `^^` means bitwise xor;
- Sage ellipses construct concrete sequences: `[a..b]`, stepped
  `[a,b,..,z]`, repeated ellipses, and iterator form `(a..b)`;
- `R.<x> = ZZ[]` constructs a named polynomial ring and binds its generator;
- general declarations such as `R.<x> = PolynomialRing(ZZ)` pass generator
  names to their constructor, and `R.0` is shorthand for `R.gen(0)`;
- numerical literals pass through exact-text `Integer(...)` and
  `RealNumber(...)` hooks.

Sage-style digit separators, binary/octal/hexadecimal integers, leading-zero
decimal integers, raw suffixes, and attribute access on numeric literals are
accepted. For example, `123_456`, `0o100`, `042`, and `87.toString()` parse
without losing the original numeric text. Complex `j` literals are recognized
by the compiler; their mathematical runtime is still under development.

These features are implemented in the parser and compiler, not by textual
preprocessing.

The interactive CLI accepts pasted Sage and Python prompts, so transcript
examples can be pasted directly:

```text
sage: for n in [1..3]:
....:     print(n)
1
2
3
```

`load path/to/file.sage` executes a file in the current session namespace.
`attach path/to/file.sage` additionally watches its modification time and
reloads it before the next input after it changes. Quoted paths and
`load("path with spaces.sage")` are accepted.

Integer source text is preserved before JavaScript parses it. The initial
`Integer` hook uses a JavaScript `Number` when the value is safely
representable and a `BigInt` otherwise:

```text
sage: 202693990283402830942083402834
202693990283402830942083402834
sage: jstype(9007199254740991)
number
sage: jstype(9007199254740992)
bigint
```

Exact integer addition, subtraction, multiplication, and nonnegative powers
promote mixed operands to `BigInt`. Operations beginning with safe `Number`
integers are recomputed as `BigInt` when their result leaves the safe range:

```text
sage: 923098402834028349082348209384 + 1
923098402834028349082348209385
sage: 9007199254740991 + 1 + 1
9007199254740993
```

When compiling Sage.js files, numeric constructors are pooled at module scope.
A literal inside a hot loop is therefore constructed once and reused; the
interactive REPL deliberately keeps each submitted line independent.

Exact integer division constructs an immutable normalized rational:

```text
sage: a = 2/3
sage: a
2/3
sage: type(a)
<class 'Rational'>
sage: parent(a)
Rational Field
sage: 1 + a
5/3
```

This hybrid remains an intentionally compatible step, not the final Sage.js
numeric tower. Modulo, bit operations, comparisons across mathematical
parents, and floating-point literal interactions still need explicit
semantics. The constructor seam allows a future `Integer` element type to
replace the representation without changing the parser again.

## Parents, coercion, and native polynomials

The first mathematical object model implements singleton `ZZ` and `QQ`
parents, immutable rational elements, canonical maps, interned polynomial
parents, and symmetric binary coercion. It does not depend on
`__add__`/`__radd__` fallback. A coercion plan contains a common parent and a
map for each operand.

Common parents may be constructed rather than equal to either input parent:

```text
sage: R.<x> = ZZ[]
sage: g = (1 + x) + 1/3
sage: g
x + 4/3
sage: parent(g)
Univariate Polynomial Ring in x over Rational Field
```

Here the resolver recursively computes `QQ` as the common coefficient parent,
constructs the interned parent `QQ[x]`, converts the `ZZ[x]` operand, and
embeds `1/3` as a constant. Polynomial coefficients and arithmetic live in
native FLINT `fmpz_poly` and `fmpq_poly` values behind opaque Node-API objects;
polynomial arithmetic does not copy coefficient arrays through JavaScript.

Generator declarations are parsed contextually and lowered to ordinary
assignment AST nodes. For example, `R.<x> = ZZ[]` constructs
`PolynomialRing(ZZ, "x")`, assigns it to `R`, and binds the result of
`R._first_ngens(1)` to `x`. Existing parent expressions support multiple
bindings through `_first_ngens(n)`; empty-bracket `ZZ[]` and `QQ[]`
construction is currently restricted to the univariate runtime.

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
pnpm install --frozen-lockfile
pnpm test
```

`pnpm build` compiles the TypeScript tooling and then uses the checked-in
bootstrap compiler to rebuild the compiler from its Python-like source. The
build continues until the compiler is compiled with an up-to-date version of
itself.

See [HACKING.md](HACKING.md) for the source layout.

## Native FLINT experiment

The first optional native package now lives under
[`packages/flint`](packages/flint/). It is a direct C Node-API binding to
FLINT 3.5 and demonstrates:

- linear, word-array conversion between JavaScript `BigInt` and FLINT `fmpz`;
- exact GCD, factorial, Fibonacci, binomial, primorial, and factorization;
- opaque native `fmpz_poly` and `fmpq_poly` values with arithmetic, powers,
  equality, formatting, and native `ZZ[x]` to `QQ[x]` conversion;
- a global `factor(n)` returning an `IntegerFactorization`;
- lazy loading on the first `factor` call, so the core language pays no native
  startup cost;
- a Sage.js program calling FLINT and receiving JavaScript `BigInt` results.

The factorization is an immutable sequence of prime-exponent pairs with a
separate unit, following Sage's factorization model:

```text
sage: factor(-360)
-1 * 2^3 * 3^2 * 5
sage: a = factor(-360)
sage: type(a)
<class 'IntegerFactorization'>
sage: a[0]
(2, 3)
sage: list(a)
[(2, 3), (3, 2), (5, 1)]
sage: a.unit()
-1
sage: a.value()
-360
sage: factor(1)
1
sage: factor(202693990283402830942083402834)
2 * 3^2 * 37 * 20390333 * 14925961766090828753
```

Safe JavaScript integer `Number` values and arbitrary-size `BigInt` values are
accepted. Factoring zero is undefined and raises an error. The generic
`Factorization` core also supports simplification, formal multiplication and
powers, radicals, iteration, and value reconstruction.

On the initial Linux x86-64 build, the stripped addon is about 11 MB and packs
to about 5.3 MB. A 4096-bit round trip takes roughly half a microsecond, and
FLINT GCD including conversion is already competitive with V8 `BigInt`.
These figures are preliminary and machine-dependent; reproducible benchmark
scripts are included.

The package remains private while platform prebuilds and the GMP runtime
contract are designed. Build and test it explicitly with:

```sh
pnpm --dir packages/flint build
pnpm test:native
pnpm --dir packages/flint bench
pnpm bench:cold
pnpm bench:arithmetic
```

The arithmetic benchmark runs identical source through Sage.js and an
installed Sagelite. On the initial x86-64 development machine, repeated small
rational operations and degree-64 polynomial additions were about four times
slower in Sage.js, degree-64 FLINT polynomial multiplication was within about
15%, and repeated `ZZ[x] + QQ` coercion was about four times faster in
Sage.js. These microbenchmarks exclude startup and are directional rather than
release claims; the scripts are included to keep comparisons reproducible.

## Status

Sage.js 0.1 is a research prototype. Its existing language test suite is
substantial, but Python compatibility is deliberately incomplete and the
mathematical object model covers only integers, rationals, and univariate
polynomials over `ZZ` and `QQ`. The FLINT package is an architectural
prototype, not yet a supported or published dependency.

## History and licensing

The language compiler descends from RapydScript-ng, JPython, and PyLang. The
original copyright notices and permissive license are preserved in source
headers and under [licenses](licenses/).

Sage.js as a whole is distributed under the
[GNU General Public License, version 3](LICENSE). This is appropriate for an
open research mathematics system built around GPL-compatible mathematical
libraries.
