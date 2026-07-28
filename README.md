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
SageMath is the semantic specification by default; an eventual compatibility
target is to run substantial upstream Sage test suites unchanged.

Version 0.1 is intentionally much smaller. It revives and modernizes the
self-hosting language compiler formerly developed as JPython and PyLang. It
is now beginning to acquire an optional native mathematical library layer.

## Mission

Sage.js aims to be an open, research-grade mathematical computing system
native to Node.js: a viable free alternative to Magma, Mathematica, and Maple
which adopts SageMath's mature semantics, integrates the best open native
mathematics libraries, and compiles performance-critical mathematical code to
native speed.

The north-star user experience is simple: a researcher can take serious Sage
code, run it with Sage.js, obtain the same mathematical objects and answers,
and achieve competitive performance—while benefiting from instant startup,
npm distribution, and seamless access to the JavaScript ecosystem.

The short version is:

> **Sage semantics. Native mathematics. The JavaScript ecosystem.**

See MISSION.md for the complete project charter, guiding
principles, non-goals, and decision criteria. See
IMPLEMENTATION.md for the empirically motivated division
between maintainable Sage.js library source, typed native lowering, and
hand-written native code. [`TYPING.md`](TYPING.md) defines the ordinary-Python
source and static-checking contract for mathematical library modules.

## Relationship to SageMath and OSCAR

SageMath, OSCAR, and Sage.js apply the same broad open-source strategy in
different language ecosystems:

| System | Primary ecosystem | Integration strategy |
|---|---|---|
| SageMath | Python and Cython | Combine the best open mathematical libraries behind a coherent Python-based language, parent/coercion model, distribution, and library of high-level algorithms. |
| OSCAR | Julia | Combine high-performance systems such as GAP, Singular, polymake, and the Julia algebra ecosystem behind coherent Julia interfaces and mathematical structures. |
| Sage.js | Node.js and JavaScript | Combine the best open mathematical libraries with Sage-compatible semantics, fast JavaScript startup and integration, npm distribution, and optional native compilation of hot library code. |

All three reject the idea that a serious computer algebra system must
reimplement every mathematical kernel or use a proprietary bespoke language.
Instead, each makes a general-purpose language ecosystem into the connective
tissue around specialized state-of-the-art libraries.

Sage.js is closest to SageMath semantically: Sage is its executable
specification for syntax, parents, coercions, representations, defaults, and
edge cases. It is not intended to reproduce all of CPython, however. Its
distinct experiment is to discover what the Sage model becomes when
JavaScript and Node are the interactive runtime, package ecosystem, and
default compilation target—while typed mathematical library code can still
compile to C, C++, or Rust when native performance is required.

The projects are therefore complementary rather than mutually exclusive.
They share libraries, mathematical ideas, tests, and an open-software mission,
while bringing the integration pattern to researchers working in different
language ecosystems.

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

```py
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
without losing the original numeric text. Real literals construct elements of
`RR`, and complex `j` literals construct elements of `CC`.

These features are implemented in the parser and compiler, not by textual
preprocessing.

The interactive CLI accepts pasted Sage and Python prompts, so transcript
examples can be pasted directly:

```py
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

Sage's symbolic shorthand `f(x) = expression` is intentionally gated for now:
it requires a symbolic-expression parent and explicit symbolic variables,
neither of which should be faked using implicit undefined identifiers.
Ordinary executable functions use `def` or `lambda`.

Integer source text is preserved before JavaScript parses it. The initial
`Integer` hook uses a JavaScript `Number` when the value is safely
representable and a `BigInt` otherwise:

```py
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

```py
sage: 923098402834028349082348209384 + 1
923098402834028349082348209385
sage: 9007199254740991 + 1 + 1
9007199254740993
```

When compiling Sage.js files, numeric constructors are pooled at module scope.
A literal inside a hot loop is therefore constructed once and reused; the
interactive REPL deliberately keeps each submitted line independent.

Exact integer division constructs an immutable normalized rational:

```py
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

The `Rational` element, including normalization and arithmetic with
cross-cancellation, is implemented in ordinary annotated Sage.js/Python
source. Its BigInt storage and exact-quotient operations are narrow compiler
contracts rather than embedded JavaScript.

This hybrid remains an intentionally compatible step, not the final Sage.js
integer representation. Modulo and several bit operations still need explicit
semantics. The constructor seam allows a future `Integer` element type to
replace the representation without changing the parser again.

Finite fields and prime-field polynomial rings follow Sage's parent,
coercion, representation, and factorization interfaces:

```py
sage: F = GF(5)
sage: F(-1)
4
sage: F(1/2)
3
sage: R.<x> = GF(5)[]
sage: f = x^4 - 1
sage: f.factor()
(x + 1) * (x + 2) * (x + 3) * (x + 4)
sage: ((x - 1)^2 * (x + 2)).roots()
[(3, 1), (1, 2)]
sage: gcd(f, (x - 1)^2 * (x + 2))
x^2 + x + 3
sage: K.<a> = GF(3^2)
sage: K
Finite Field in a of size 3^2
sage: K.modulus()
x^2 + 2*x + 2
sage: a^2
a + 1
sage: list(K)
[0, a, a + 1, 2*a + 1, 2, 2*a, 2*a + 2, a + 2, 1]
```

`GF(p)` is interned and exact scalar elements use reduced JavaScript `BigInt`
values, so ordinary field arithmetic does not cross Node-API. Polynomials are
opaque native FLINT `nmod_poly` values; multiplication, GCD, irreducibility,
factorization, and root finding each cross into native code once for the
complete operation. Canonical coercion from `ZZ` and `ZZ[x]` is supported.

For database-backed `GF(p^n)`, Sage.js uses the same Conway defining
polynomials and polynomial-basis representation as Sage. Extension-field
contexts and elements remain opaque native FLINT `fq_nmod` or `fq` values.
Arithmetic, inverses, and powers cross Node-API once per operation; coercions
from `ZZ` and the prime subfield, generator declarations, defining polynomials,
and Sage's finite iteration order are implemented. Fields requiring Sage's
pseudo-Conway construction currently raise `NotImplementedError` instead of
silently selecting an incompatible modulus.

Sage-compatible arbitrary-precision real and complex fields are backed by
MPFR and MPC. The default fields are cached 53-bit parents:

```py
sage: RR
Real Field with 53 bits of precision
sage: CC
Complex Field with 53 bits of precision
sage: 1.2
1.20000000000000
sage: (1 + 1j)^-2
-0.500000000000000*I
sage: RealField(100)(1/3)
0.33333333333333333333333333333
```

The real and complex parents, elements, literal handling, and coercion maps
are implemented in ordinary annotated Sage.js/Python source. Only the opaque
MPFR/MPC operations and a few JavaScript bootstrap primitives cross the
explicit `sagejs.runtime` boundary.

`RealField(p)` and `ComplexField(p)` are interned by precision. Their canonical
maps follow Sage, including the intentionally information-losing maps from a
higher-precision field to a lower-precision field. Consequently the common
parent need not be either operand: an element of `RealField(53)` plus one of
`ComplexField(100)` has parent `ComplexField(53)`.

As in Sage, decimal source constructs a `RealLiteral`. It retains the original
normalized source text and uses enough initial precision for its significant
digits, with a minimum of 53 bits. A later conversion to a wider field parses
that text again instead of widening an already-rounded binary value:

```py
sage: R = RealField(1000)
sage: R(1.00000000000000000000000000000000000000000000000000001505) == \
....: R("1.00000000000000000000000000000000000000000000000000001505")
True
```

## Parents, coercion, and native polynomials

The mathematical object model implements singleton `ZZ` and `QQ` parents,
interned prime finite fields, immutable scalar elements, canonical maps,
interned polynomial parents, and symmetric binary coercion. It does not depend on
`__add__`/`__radd__` fallback. A coercion plan contains a common parent and a
map for each operand.

Common parents may be constructed rather than equal to either input parent:

```py
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
native FLINT `fmpz_poly`, `fmpq_poly`, and `nmod_poly` values behind opaque
Node-API objects; polynomial arithmetic does not copy coefficient arrays
through JavaScript.

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

```py
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

## Native Kernel v0

The first structured native compiler path parses selected Sage.js functions
through the ordinary frontend, lowers them to an explicitly typed
intermediate representation, and generates both a JavaScript fallback and a
C/MPFR/MPC Node addon. It currently accepts deliberately narrow `RealField`
and `ComplexField` loop subsets. Argument and return annotations in the source
are the native signature; no parallel JavaScript type table is required. A
content-addressed cache incorporates the source, typed IR, compiler
implementation, native ABI, Node ABI, platform, and mathematical-library
versions.

Generated native kernels cross Node-API once for the whole algorithm and
return the same opaque native values used by the standard Sage.js
`RealNumber` and `ComplexNumber` classes—not compiler-specific result objects.
The generated JavaScript wrapper validates the parent and arguments and turns
that native value into an ordinary element of the supplied field. Setting
`SAGEJS_NATIVE_DISABLE=1` runs the generated JavaScript backend instead.

On the initial benchmark machine, a 53-bit multiplication loop took about
141 ns per iteration as a native kernel, 1470 ns through scalar Sage.js
operations, and 206 ns in SageMath/Cython. See
[`bench/NATIVE-COMPILER.md`](bench/NATIVE-COMPILER.md) for the architecture,
limitations, configuration format, and full results. Build the included
example from a source checkout (after `pnpm --dir packages/flint build`) or
run its comparative benchmark with:

```sh
node tools/native-kernel.cjs bench/native-kernel.config.cjs
pnpm run bench:native
```

For a matched comparison where both Sage.js and SageMath call MPFR's
`mpfr_mul`, see
[`bench/MPFR-BENCHMARK.md`](bench/MPFR-BENCHMARK.md). On the initial machine,
the generated 53-bit real loop took about 12 ns per multiplication, versus
128 ns through SageMath's Cython `RealNumber` and 1204 ns through scalar
Sage.js. Julia's ordinary `BigFloat` loop took about 96 ns, while an explicit
in-place Julia MPFR loop took about 21 ns. The benchmark reports loaded MPFR
and GMP versions and allocation so this comparison remains auditable.

The same unchanged-source comparison for `GF(65537)` and `GF(65537)[x]`
shows scalar arithmetic within about 10% of SageMath, small polynomial
multiplication within about 2x, and the tested native GCD and factorization
workloads slightly faster on the initial machine. See
[`bench/FINITE-FIELD-BENCHMARK.md`](bench/FINITE-FIELD-BENCHMARK.md) and run
`pnpm run bench:finite-fields`.

## Build from source

```sh
git clone https://github.com/sagemathinc/sagejs
cd sagejs
pnpm install --frozen-lockfile
pnpm test
```

The main suite includes generated semantic snapshots of selected upstream Sage
doctests. These contain the exact inputs and expected outputs, grouped as in
their original docstrings, but none of Sage's implementation code. Provenance
includes the source path, Git revision, line numbers, optional-package tags,
and a hash of the complete upstream file. Known compatibility gaps are tracked
separately as explicit skips or expected failures, so a regression or an
unrecorded new pass fails CI. See
[upstream-tests/README.md](upstream-tests/README.md) for extraction and runner
commands.

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

```py
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
rational operations and degree-64 polynomial additions were about five to six
times slower in Sage.js, degree-64 FLINT polynomial multiplication was within
about 20%, and repeated `ZZ[x] + QQ` coercion was about three times faster in
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
