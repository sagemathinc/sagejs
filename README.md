# Sage.js

> **Early alpha:** Sage.js 0.3.0 is the first release intended for outside
> experimentation. Expect missing functionality, incompatible changes, and
> rough edges.

> **Sage.js is open, portable, high-performance software for exploring
> research mathematics, discovering patterns, testing conjectures, developing
> algorithms, and producing reproducible computational evidence for formal
> proof.**

> **Start instantly. Run anywhere. Scale from a laptop to a cluster. Reproduce
> every result.**

> **Sage.js does not choose JavaScript instead of Python for writing
> mathematics. It uses Python for mathematical source, mature native libraries
> for computation, and the JavaScript ecosystem to make that mathematics
> portable, interactive, and accessible everywhere.**

Sage.js is a new implementation of Python and Sage semantics on JavaScript and
Node. It does not embed or invoke the official CPython interpreter.

[![Sage.js CI](https://github.com/sagemathinc/sagejs/actions/workflows/ci.yml/badge.svg)](https://github.com/sagemathinc/sagejs/actions/workflows/ci.yml)
[![Implementation dashboard](https://img.shields.io/badge/dashboard-capabilities%20%26%20roadmap-0d9488)](https://sagemathinc.github.io/sagejs/)

The [implementation dashboard](https://sagemathinc.github.io/sagejs/) is the
living map of what Sage.js provides, how strongly each capability is tested,
and what is prioritized next.

## Download a standalone executable

The [latest GitHub release](https://github.com/sagemathinc/sagejs/releases/latest)
contains ready-to-run archives for Linux x64, Linux arm64, Windows x64, and
Apple Silicon macOS. On macOS and Linux, the checksum-verifying installer is:

```sh
curl -fsSL https://sagejs.org/install.sh | sh
```

It installs into `~/.local/bin` by default and, when necessary, adds that
directory to the current user's shell startup file. Restart the shell (or
source the file named by the installer) after a first installation. When run
as root it instead installs system-wide into `/usr/local/bin`; set
`SAGEJS_INSTALL_DIR` to choose another directory or `SAGEJS_VERSION=0.3.0` to
pin a release. The archives
include both `sagejs`, with the native mathematics stack, and
`sagepython`, the lightweight Python-compatible runtime. No Node.js, Python,
compiler, package manager, or source checkout is needed on the target machine.

Current downloads are roughly 92–143 MiB and the two installed executables use
about 600–700 MiB together. Embedded Python/Sage modules execute directly from
the SEA; they are not copied into a permanent installation tree. Native addons
are extracted on demand under the operating system's temporary directory in a
`sagejs-sea-*` directory (about 44 MiB for the core mathematics addons and
under roughly 80 MiB when all current optional addons are needed) and removed
when the process exits normally.

After extracting manually, run `./sagejs` on macOS/Linux or `sagejs.exe` on
Windows. Each archive has a neighboring `.sha256` file. Linux releases are
built on Ubuntu 24.04; a minimal Debian/Ubuntu image needs `curl`, `xz-utils`,
and `libatomic1` for the one-command installer and official Node-based
executable. Windows executables are intended for ordinary Windows
10/11 x64 systems; Authenticode provisioning is still in progress, so the
0.3.0 early-alpha executables may be unsigned. macOS executables use the hardened
runtime, are Developer ID signed, and the downloadable ZIP and PKG are both
submitted to Apple's notary service; the PKG also carries a stapled ticket.

## Build the complete system from source

The native bootstrap is validated on x86-64 and arm64 Linux, x86-64 Windows,
and Apple Silicon macOS. A new checkout becomes a working research system with
one pnpm command:

```sh
git clone https://github.com/sagemathinc/sagejs.git
cd sagejs
pnpm bootstrap
```

The bootstrap command checks the host, initializes every Git submodule,
installs the lockfile exactly, builds the compiler and standard library, builds
the complete native mathematics stack, and produces a self-contained
`build/sea/sagejs` executable. It ends by evaluating `factor(2026)` through
both the development runtime and the standalone executable.

The full build requires Node.js 25.5 or newer (for Node's SEA builder), pnpm
11.9.0, Git, Python 3, and a native C/C++ toolchain. On Debian or Ubuntu, the
non-Node prerequisites are installed by:

```sh
sudo apt-get install build-essential cmake git python3 m4 xz-utils
```

For a conservative cold-build budget, allow 15–30 minutes on Linux or Apple
Silicon macOS and 30–60 minutes on Windows, and roughly 6–8 GB of working disk.
Published native dependency bundles usually make subsequent builds much
faster. These figures include the checkout, package store, build trees, and
standalone executables; the finished standalone installation is much smaller.

A system GMP installation is **not** required. By default, bootstrap downloads
a content-addressed static dependency bundle for the current supported target,
verifies its SHA-256 sidecar and complete internal file manifest, and then only
builds the comparatively small Sage.js native adapters. Linux and macOS bundles
contain GMP, MPFR, MPC, OpenBLAS, FLINT, FFLAS/FFPACK, igraph, and M4RI.
Linux x64 also builds ffpoly and smalljac; Windows installs the arithmetic
stack from a pinned vcpkg baseline and builds the same pinned igraph source.
Every platform statically links its libraries into the native addons and SEA.
The ffpoly/smalljac accelerator still contains x86-64
GNU assembly, so Linux arm64, macOS, and Windows currently use the tested
portable elliptic-curve point-count fallback behind the same API. Verified
bundles are cached by content identity under `~/.cache/sagejs/native-prebuilt`;
installed prefixes remain under each package's `.native` directory.
The published bundles use the portable native-math profile: ordinary compiled
code does not use `-march=native`, x86-64 GMP and OpenBLAS select compatible
optimized kernels at runtime, arm64 OpenBLAS retains its ARMv8 baseline, and
Windows OpenBLAS uses its generic x86-64 target. CPU-specialized local builds
are fingerprinted separately and are never restored from the release catalog.

On Apple Silicon macOS, install the Xcode Command Line Tools and Homebrew
packages `node`, `pnpm`, `m4`, and `xz`. The native libraries target macOS 13
or newer by default; set `MACOSX_DEPLOYMENT_TARGET` before the first build to
choose a different compatible target. Homebrew currently disables Node's SEA
builder; Sage.js detects that build, downloads the matching official Node
archive, verifies it against Node's published SHA-256 manifest, and caches it
solely for creating the standalone executable. Set `SAGEJS_SEA_NODE` to use a
specific SEA-enabled Node executable instead.

On Windows x64, install Git, Python 3, CMake, and Visual Studio 2022 Build
Tools with the Desktop C++ workload, clang-cl, and the ClangCL MSBuild
toolset. Native Windows does not require WSL, MSYS2, or MinGW. See
[`WINDOWS.md`](WINDOWS.md) for the exact toolchain and architecture.

If a bundle has not yet been published for a new platform or changed dependency
specification, bootstrap falls back to the pinned source build. That fallback
takes roughly 3–15 minutes on Linux or Apple Silicon and 30–60 minutes for a
first Windows vcpkg build. Set `SAGEJS_NATIVE_PREBUILT=0` to request it
explicitly. `SAGEJS_NATIVE_MATH_PROFILE=cpu-native` and custom package prefix
variables also bypass portable prebuilds by design. An R2 or other mirror can
be selected with `SAGEJS_NATIVE_PREBUILT_BASE_URL`; it must serve the bundle and
its neighboring `.sha256` file. Source builds use up to eight CPU jobs by
default. To choose the parallelism explicitly, for example on a 16-core builder,
run:

```sh
SAGEJS_BUILD_JOBS=16 pnpm bootstrap
```

The value must be a positive integer. More jobs increase peak memory use, and
the GMP validation suite remains part of every genuinely cold build.
OpenBLAS uses its own threads at runtime; set `OPENBLAS_NUM_THREADS=1` when
parallelizing independent calculations with Sage.js worker threads.

Sage.js development itself supports Node.js 22.22.2 or newer. On Node 22–24,
build everything except the standalone SEA with:

```sh
pnpm bootstrap --without-sea
```

Once built:

```sh
pnpm start                         # interactive Sage.js REPL
node bin/sagejs program.sage       # run a source file
build/sea/sagejs program.sage      # Linux/macOS: no Node or checkout
build\sea\sagejs.exe program.sage  # Windows: no Node or checkout

pnpm test:unit                     # fast JavaScript/runtime regression tier
pnpm test:startup                  # enforce the 350 ms development startup budget
pnpm test:native                   # FLINT, igraph, and native integration tests
pnpm test:tutorial                 # complete Sage tutorial compatibility
pnpm test:sea                      # rebuild and relocation-test both SEAs
pnpm test                          # full compiler, CLI, upstream, and CoWasm suite
```

Startup speed is a tested compatibility property. `pnpm test:startup`
interleaves eleven fresh Sage.js processes with eleven bare Node processes,
checks that each Sage.js process evaluates `2^100`, and requires the median
startup-and-evaluation time to remain below 300 ms. It only normalizes downward
when contemporaneous bare-Node launches prove that the host is under load; a
1.5-second raw median remains an unconditional failure. `pnpm test:sea` applies
the same gate to the standalone executable. This catches architectural startup
regressions portably, though no user-space test can force an operating system
to discard its filesystem cache. The sample count, normalized budget, reference
Node launch time, and hard ceiling can be overridden with
`SAGEJS_STARTUP_SAMPLES`, `SAGEJS_STARTUP_BUDGET_MS`,
`SAGEJS_STARTUP_REFERENCE_NODE_MS`, and `SAGEJS_STARTUP_HARD_LIMIT_MS`.

See [`TESTING.md`](TESTING.md) for the test tiers and
[`DISTRIBUTION.md`](DISTRIBUTION.md) for native, SEA, and WebAssembly
distribution details. Python interoperability and the host-capability design
are documented in
[`docs/python-standard-library.md`](docs/python-standard-library.md). Large
CPU-bound Python/Sage computations can use persistent isolated evaluators
through the initial [`multiprocessing.Pool`](docs/python-multiprocessing.md)
interface. Coordinated development efforts use isolated worktrees,
machine-readable task contracts,
exclusive path claims, and validation receipts as described in
[`PARALLEL-DEVELOPMENT.md`](PARALLEL-DEVELOPMENT.md).
Durable results and worker-thread messages use the safe, versioned protocol in
[`SERIALIZATION.md`](SERIALIZATION.md). The mechanically checked logical and
workspace package graph, lazy-loading policy, source budgets, and startup
budgets are defined in
[`PACKAGE-ARCHITECTURE.md`](PACKAGE-ARCHITECTURE.md).

Tagged releases publish ready-to-run `sagejs` and `sagepython` archives for
Linux x64, Linux arm64, Windows x64, and Apple Silicon macOS. They require no
Node.js, compiler, or package manager on the target machine. Release CI refuses
to publish unsigned macOS binaries and explicitly records whether Windows
binaries were signed or released under the temporary early-alpha unsigned
policy. A maintainer with Apple
credentials can reproduce the signed, notarized macOS artifacts locally with:

```sh
pnpm release:macos
# Or also attach it to an existing release:
pnpm release:macos -- --publish v0.3.0
```

The command uses the same credential conventions as CoCalc's macOS release
tooling: `SAGEJS_MACOS_SIGN_ID`, `SAGEJS_MACOS_INSTALLER_ID`, and
`SAGEJS_MACOS_NOTARY_PROFILE` (default `notary-profile`). It creates a signed,
notarized ZIP and a signed, notarized, stapled installer under `build/release`.
[`RELEASING.md`](RELEASING.md) documents Apple, Windows, npm, and tag secrets
and the complete release checklist. macOS users are never asked to bypass
platform security; Windows users may encounter a SmartScreen warning until
Authenticode provisioning is complete.

The main contributor-facing directories are:

| Path | Contents |
|---|---|
| `src/lib` | Sage-compatible mathematical library modules, written as ordinary CPython-parseable source |
| `packages/flint/src` | Hand-written C kernels and stable Node-API bindings for FLINT and related native libraries |
| `packages/flint-wasm` | The browser/WebWorker adapter and WASM build of shared host-neutral kernels |
| `src`, `bootstrap`, `tools` | Compiler, runtime, kernel, CLI, and embedding infrastructure |
| `test`, `upstream-tests` | Focused regressions and executable compatibility corpora derived from upstream projects |
| `bench` | Reproducible cross-system correctness and performance dashboards |
| `docs` | Searchable Markdown guides and generated DocSpec API reference |

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

Version 0.3 remains intentionally early alpha. It revives and modernizes the
self-hosting language compiler formerly developed as JPython and PyLang while
adding a substantial native mathematical library layer.

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

## Install the published npm package

Sage.js development after version 0.1 requires Node.js 22.22.2 or newer.

```sh
npm install --global @sagemath/sagejs@0.3.0
```

Or, with pnpm:

```sh
pnpm add --global --allow-build=zeromq @sagemath/sagejs@0.3.0
```

The public package keeps the Sage.js library and embedding APIs, while its
command-line launcher selects an optional package containing the native
executable for the current operating system and architecture. This is the same
artifact distributed on GitHub; normal CLI use does not require a compiler or
local native build. A source-only fallback remains available for unsupported
platforms and for Sage.js development. It can also be tried without a global
installation:

```sh
pnpm dlx @sagemath/sagejs
```

For portable deployment, Sage.js can produce a single native executable with
the compiler and standard library embedded. A mathematics variant also embeds
the FLINT addon and statically linked GMP, MPFR, MPC, OpenBLAS, and FLINT.
[`DISTRIBUTION.md`](DISTRIBUTION.md) documents the reproducible SEA builds,
the smaller FLINT-free `sagepython` artifact, browser/WebWorker plans,
container deployment, and the evaluated TypeScript-to-native alternatives.
A [`flint-wasm`](packages/flint-wasm/README.md) proof of concept links
CoWasm's FLINT, GMP, and MPFR archives into a 4.7 MiB browser module. The real
Sage.js evaluator compiles source in a nested worker and runs
arbitrary-precision factorization in an interruptible outer worker. Native and
WASM builds also share the same host-neutral `P1List` and weight-2
modular-symbol presentation core, establishing the adapter pattern for deeper
mathematics in the browser.

## Documentation

Sage.js retains public docstrings for `help(f)`, `f?`, Jupyter inspection, and
`search_doc(...)`. The same live objects feed a versioned
[DocSpec](DOCSPEC.md) registry for shells and agents:

```sh
sagejs docs search finite field
sagejs docs search --regex --backend FLINT 'matrix|polynomial'
sagejs docs show dimension_cusp_forms
sagejs docs show --json GF
sagejs docs export --jsonl
sagejs docs path
```

Guides and the generated [API reference](docs/reference/api.md) are ordinary,
searchable Markdown. DocSpec records Sage compatibility, implementation
backends, limitations, provenance, and literature/software references, so an
answering agent can distinguish supported behavior from an accidental-looking
result.

## Embed Sage.js

Applications can create a persistent, interruptible Sage session with a small
public API:

```js
const { createSage } = require("@sagemath/sagejs/kernel");

const sage = await createSage();
sage.on("stdout", (text) => process.stdout.write(text));

const result = await sage.evaluate("sum([n^2 for n in [1..100]])");
console.log(result.repr);

await sage.close();
```

The 0.3.0 npm embedding API includes the compiler, Sage/Python runtime, and
pure-JavaScript libraries. The installed `sagejs` command uses the full native
mathematics executable, but this first alpha does not yet expose its bundled
native addons through `createSage()`; native-backed embedding is planned for a
follow-up release. With pnpm 11, add `--allow-build=zeromq` to the install
command so pnpm can install the Jupyter transport dependency.

Each session runs in an isolated worker. Definitions persist between
evaluations, while interruption, timeouts, and reset reliably replace the
worker. The browser/WASM backend exposes the same lifecycle and result shape.
See [`EMBEDDING.md`](EMBEDDING.md) for the complete Node and browser API,
output streaming, error behavior, and isolation contract.

Sage.js also runs as a polyglot Jupyter kernel with persistent state, streamed
output, completion, inspection, reliable interruption, and native Plotly
display for 2D and 3D graphics. Cells marked `%%sage`, `%%python`, `%%magma`,
`%%matlab`, `%%maple`, or `%%wolfram` share one JavaScript object namespace.
Run `sagejs --install-jupyter-kernel`, then select **Sage.js Polyglot** in
JupyterLab, CoCalc, or any other Jupyter environment. The command works for
both npm and self-contained native installations. See
[`JUPYTER.md`](JUPYTER.md) for installation, behavior, and testing details.
[`POLYGLOT.md`](POLYGLOT.md) defines the shared-object
interoperability contract, compatibility matrix, executable corpus, example
notebook, and frontend-overhead benchmark.

Sage-compatible `plot()`, `line()`, `point()`, and `list_plot()` now produce
composable `Graphics` objects. Browser embeddings receive an optional Plotly
figure through the same clone-safe kernel result protocol. See
[`PLOTTING.md`](PLOTTING.md) for examples, supported options, renderer
integration, and symbolic-expression sampling.

Sage-compatible `plot3d()`, `parametric_plot3d()`, `sphere()`, `line3d()`, and
`point3d()` similarly produce composable `Graphics3d` objects. Symbolic
surfaces compile their two-variable expression once inside the evaluator
worker and render as interactive Plotly surfaces in the frontend.

Dense exact `matrix()` and `vector()` objects over `ZZ` and `QQ` provide
Sage-compatible arithmetic, determinant, rank, rational RREF, integer Hermite
form, inverse, and linear solving.
Kernels are genuine vector-subspace or free-submodule parents with canonical
bases, ambient spaces, membership, and generators. As in Sage, `kernel()`
means the row-vector left kernel, while `right_kernel()` is explicit.
Compatible subspaces support exact sums with `V + W` and intersections with
`V.intersection(W)`, retaining integral lattice indices over `ZZ`.
Characteristic polynomials return ordinary Sage.js polynomial elements, and
`random_matrix()` provides reproducible dense `ZZ`/`QQ` inputs for experiments
and benchmarks.
Node keeps entries in opaque FLINT `fmpz_mat`/`fmpq_mat` objects; browser
workers use the same backend contract implemented with portable `BigInt`
rationals. Run `pnpm bench:linear-algebra` to compare the shared workload
against SageMath without process startup or cached determinant/inverse
results.

Exact modular forms have an initial FLINT-backed vertical slice. The
`eisenstein_series_qexp()` function supports Sage's linear, constant, and
integral normalizations over `QQ`, together with reduction to prime finite
fields. `Gamma0()`, `Gamma1()`, `dimension_cusp_forms()`, `ModularForms()`,
and `EisensteinForms()` cover arbitrary-level Riemann--Roch dimensions and
level one or prime `Gamma0` Eisenstein bases. Dimensions for individual
Dirichlet characters use the exact Cohen--Oesterlé formula. This includes the
weight-2 level-11 form and oldform degeneracy maps:

```py
sage: eisenstein_series_qexp(4, 6)
1/240 + q + 9*q^2 + 28*q^3 + 73*q^4 + 126*q^5 + O(q^6)
sage: EisensteinForms(11, 2).basis()
[1 + 12/5*q + 36/5*q^2 + 48/5*q^3 + 84/5*q^4 + 72/5*q^5 + O(q^6)]
sage: dimension_cusp_forms(DirichletGroup(13).0^2, 2)
1
```

FLINT computes the Bernoulli constant and all divisor sums in one native
sieve, returning the complete exact polynomial through a single Node-API
call. Cuspidal bases, Hecke operators, composite-level Eisenstein newforms,
and modular symbols remain separate future layers.

## Sage mode

The `sagejs` command uses Sage-style syntax by default:

```py
$ sagejs
Welcome to Sage.js v0.3.0 [linux-x64].
sage: 2^100
1267650600228229401496703205376
sage: sum([1..100])
5050
sage: 7^^3
4
sage: factor(2026)
2 * 1013
sage: x
x
sage: f = sin(x^2)
sage: f.derivative(x)
2*x*cos(x^2)
sage: f.subs(x=2)
sin(4)
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

Sage.js also provides an initial symbolic ring backed by the
[Cortex Compute Engine](https://cortexjs.io/compute-engine/). The Sage-owned
Python layer defines `SR`, `Expression`, coercion, representations, constants
`pi` and `e`, the predefined variable `x`, elementary functions, substitution,
differentiation, numerical approximation, and `fast_callable()`. Cortex sits
behind a narrow MathJSON adapter, so backend objects do not leak into the
public API.

```py
sage: plot(sin(x^2), (x, 0, 2*pi))
Graphics object consisting of 1 graphics primitive
```

The Node backend is loaded lazily on first symbolic computation. Browser
builds bundle it into the evaluator worker, where compiled numerical functions
and plots run without blocking the UI thread.

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
interned prime finite fields and `Zmod(n)` residue rings, immutable scalar
elements, canonical maps, interned polynomial parents, and symmetric binary
coercion. It does not depend on `__add__`/`__radd__` fallback. A coercion plan
contains a common parent and a map for each operand.

Dense matrices over composite `Zmod(n)` use ring semantics rather than field
Gaussian elimination. FLINT supplies determinant, characteristic polynomial,
and canonical Howell reduction; matrix rank follows Sage by counting unit
pivots, unit inverses are reduced from exact integer adjugates, and kernels
retain zero-divisor torsion generators.

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

Multivariate rings over `ZZ`, `QQ`, prime fields, word-sized residue rings,
and FLINT word-characteristic extension fields use the corresponding native
`*_mpoly` contexts. In particular, `GF(4, 'a')['x,y']` is backed directly by
FLINT `fq_nmod_mpoly`; coefficients and the polynomial context retain the same
opaque finite-field context rather than translating through strings.

The initial ideal layer over `QQ[x_1,...,x_n]` uses FLINT's bounded
Buchberger implementation. Rational generators are represented by primitive
integer polynomials during the computation and normalized to a reduced monic
basis on return. Ideal membership reduces against that basis. Explicit
resource limits prevent an unexpectedly difficult basis from monopolizing an
embedded evaluator.

This is deliberately not presented as a substitute for Singular. FLINT
provides the compact, high-quality foundation for arithmetic and useful small
Gröbner computations. Primary decomposition, associated primes, comprehensive
coefficient-domain support, and the broader algebraic-geometry layer remain
the boundary at which Sage.js should evaluate a Singular integration instead
of growing an ad hoc computer-algebra system.

Generator declarations are parsed contextually and lowered to ordinary
assignment AST nodes. For example, `R.<x> = ZZ[]` constructs
`PolynomialRing(ZZ, "x")`, assigns it to `R`, and binds the result of
`R._first_ngens(1)` to `x`. Existing parent expressions support multiple
bindings through `_first_ngens(n)`, including declarations such as
`R.<x,y> = GF(4, 'a')[]`.

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
Welcome to Sage.js v0.3.0 (Python mode) [linux-x64].
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

Python mode provides the ordinary double-precision `complex` builtin,
including mixed real arithmetic, division, absolute value, conjugation, and
Python-style representation. This is distinct from Sage mode's
arbitrary-precision `CC` parent.

Python mode is an independent implementation of Python on the JavaScript
runtime, in the same broad category as PyPy, Jython, IronPython, and
RustPython. It parses ordinary Python with the pinned Tree-sitter Python
grammar, lowers it through Sage.js's Python AST, and executes generated
JavaScript on V8. CPython is not embedded and CPython's extension-module ABI is
not provided.

The compatibility target is increasingly ordinary, unmodified pure-Python
code. Install platform-independent wheels with the bundled package command:

```sh
sagejs pip install mpmath
printf 'import mpmath\nprint(mpmath.mp.dps)\n' | sagejs --python
```

Pinned end-to-end workflows currently verify `packaging`, `six`, `pyparsing`,
`attrs`, `idna`, `tomli`, `decorator`, `sortedcontainers`, `mpmath`, `pytz`,
and `python-dateutil`. Those checks download the identified `py3-none-any`
wheels, run their unmodified package sources, and assert substantive output.
They are compatibility evidence, not a claim that the complete Python
language and standard library are finished. Native wheels and source builds
that require the CPython C API remain explicitly unsupported.

Third-party modules are translated once and stored in a compiler-versioned,
source-hashed user cache. Dynamic `eval` and `exec` fragments use a separate
compiler-versioned cache. Cache misses affect only the first compilation;
source or compiler changes invalidate the corresponding entry.

Inspect obsolete compiler-version caches without changing anything with:

```sh
sagejs cache prune
```

The command reports both imported-module and dynamic-code caches and is a dry
run unless `--apply` is present. Its default policy always keeps the current
compiler, caches leased by running Sage.js processes, pinned versions, and the
five newest compiler versions. Obsolete versions at least
seven days old are preferred for size-based cleanup; if they are insufficient
to approach the best-effort 2 GiB per-family target, newer obsolete versions
may also be selected. Independently, unprotected versions older than 30 days
expire. Standard caches schedule the same bounded cleanup automatically;
explicitly redirected dynamic caches remain user-managed. Hard-protected
versions may keep a cache above the target. Pin a version
manually by placing an empty `.sagejs-keep` file in its directory. Run
`sagejs cache --help` to inspect or override the size and age limits, then apply
the displayed plan explicitly:

```sh
sagejs cache prune --apply
```

Pruning removes only complete disposable compiler-version directories. It
never edits a live cache entry or follows symbolic links.

### Pytest

Sage.js runs the unmodified upstream pytest distribution as an explicit
pure-Python compatibility target:

```sh
sagejs pip install pytest==9.1.1
sagejs pytest
```

The initial supported tier includes test discovery, fixtures, parametrization,
marks and outcomes, `pytest.raises`, `pytest.approx`, terminal reporting, and
correct success/failure exit codes. Sage.js selects `--assert=plain`, disables
third-party plugin autoloading, and disables pytest's bundled `capture`,
`logging`, `subtests`, `cacheprovider`, and `faulthandler` plugins. Those
plugins depend on host-specific stream, logging, cache, signal, or unittest
details that are outside this first tier. Arbitrary third-party plugins and
CPython-style assertion rewriting are later compatibility milestones; ordinary
Python `assert` statements and pytest's failure reports work now.

### JavaScript and local npm packages

Trusted Node.js hosts expose an explicit public bridge to built-in modules and
packages installed in the current project's `node_modules` tree:

```sh
pnpm add express
```

```py
from sagejs.javascript import require

express = require("express")
app = express()
path = require("node:path")
print(path.basename("/tmp/example.txt"))
```

Resolution begins in the current working directory rather than inside the
Sage.js installation. An optional second argument selects another project
directory, and `sagejs.javascript.resolve(name, directory)` reports the exact
entry point. JavaScript methods retain their native `this` receiver while
values remain in the same V8 isolate; there is no subprocess or serialization
boundary. `import_module` additionally returns the native Promise for a
dynamic ESM import.

The ecosystem boundary is intentional: ordinary `import express` continues
to mean a Python module and never silently falls back to npm. Browser or
restricted evaluators may omit JavaScript module loading, which callers can
detect with `sagejs.javascript.is_available()`.

### Experimental NumPy facade

Sage.js includes an initial Python-facing `numpy` module backed by
[`numpy-ts`](https://www.npmjs.com/package/numpy-ts). The facade, rather than
the backend, owns the compatibility contract: raw JavaScript arrays do not
escape, Python slicing creates shared-storage views, and Python-visible dtype,
scalar, mutation, operator, and representation behavior can be corrected
independently of `numpy-ts`.

The first vertical slice supports dense array construction, dtypes, reshape,
basic slicing and mutation, element-wise operators, reductions, matrix
multiplication, and `numpy.linalg.det`:

```py
import numpy as np

a = np.arange(6, dtype=np.int32).reshape(2, 3)
view = a[:, 1:]
view[0, 0] = 99
print(a)
print(a.sum(axis=0))
print(np.linalg.det(np.array([[1.5, 2.0], [3.0, 4.5]])))
```

This is a compatibility experiment, not yet a claim to implement NumPy. The
same ordinary `.py` fixture runs under Sage.js and CPython/NumPy, and
`test/numpy-module.cjs` requires their output to agree when NumPy is available.
That differential corpus is intended to grow into selected upstream NumPy
tests without making CPython's extension ABI a Sage.js goal.

## Graphs, exact symmetry, and interactive layouts

Sage.js provides readable `Graph` and `DiGraph` objects, Sage's authored
layouts for the implemented named families, the historical 1,252-record small
graph database, and exact portable algorithms. An isolated optional
[igraph](https://igraph.org/) backend supplies dispatched Bliss/VF2
isomorphism, Bliss canonical labeling, compact automorphism-group generators
with exact orders, and Fruchterman–Reingold and Kamada–Kawai layouts. Labeled
multigraphs and certificates retain the readable exact fallback.

```py
G = graphs.PetersenGraph()
A = G.automorphism_group()
print(A.order(), A.gens())
G.show(interactive=True)  # self-contained SVG; drag vertices directly
```

Plotly remains the default renderer. `interactive=True` (also
`renderer='interactive'`) selects a dependency-free SVG renderer because
Plotly editable mode edits chart metadata, not scatter-point positions. The
SVG has no CDN dependency and supports pointer and touch dragging.

The igraph release archive is SHA-256 pinned and mirrored in Sage.js's durable
source cache; see [VENDORED-SOURCES.md](VENDORED-SOURCES.md).

## JavaScript API

The compiler can also be loaded from Node:

```js
const createCompiler = require("@sagemath/sagejs");
const {
  createPythonCompilerFrontend,
} = require("@sagemath/sagejs/frontend");
const compiler = createCompiler();
const frontend = await createPythonCompilerFrontend(compiler, "python");
const ast = frontend.parse("print(2 + 3)");
frontend.close();
```

Tree-sitter is intentionally initialized asynchronously. The low-level
compiler object contains semantic AST and JavaScript-output machinery, but no
second parser implementation.

The CLI can emit standalone JavaScript containing the small Sage.js base
library:

```sh
sagejs --python compile input.py --output output.js
node output.js
```

## Native Kernel v9

The structured native compiler path parses `@native` Sage.js functions
through the ordinary frontend, lowers them to an explicitly typed
intermediate representation, and generates both a JavaScript fallback and a
C/GMP/MPFR/MPC Node addon. In addition to `RealField` and `ComplexField` loops,
v9 compiles exact `int`/`Integer` modules and dense linear algebra over prime
fields. Exact modules support comparisons, branching, `while`, floor division,
remainder, and direct calls among compiled functions. Argument
and return annotations in the source are the native signature; no parallel
JavaScript type table is required. A
content-addressed cache incorporates the source, typed IR, compiler
implementation, native ABI, Node ABI, platform, compiler toolchain and flags,
and mathematical-library versions.

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

The public `@sagemath/sagejs/native` Node subpath compiles content-addressed
kernel modules, while `from sagejs.native import native` marks ordinary Python
functions and automatically resolves a source-hash-matched artifact. Compile a
module and then import it normally:

```sh
sagejs native compile algorithms.py
sagejs --python algorithms.py
```

The compiler constructs a module call graph. Each exact-integer function gets
a private C entry point, so a compiled `lcm()` can call compiled `gcd()` without
crossing Node-API or returning through JavaScript. The same generated module
contains an exact `BigInt` fallback.

V9 also compiles rank, determinant, reduced echelon form, and matrix solve
over `GF(p)`. More importantly, `prime_field_factor(A)` returns an immutable
packed decomposition with `rank()`, `determinant()`, `echelon()`, and reusable
`solve(B)` methods. The backend selects classical or cache-blocked elimination,
uses bounded unreduced dot products for small primes, applies permutation plus
triangular substitution for solves, keeps inputs immutable, and returns
ordinary Sage.js matrices through a zero-copy shared ABI. On the dedicated
host, every fresh 256-by-256 operation is within about 2x of direct FLINT; a
retained four-column solve is 3.6x faster than refactorizing through FLINT over
the 32-bit field and 7.1x faster over the 61-bit field. The generated GCC addon
is only about 27 KB. See
[`bench/PRIME-FIELD-NATIVE-BENCHMARK.md`](bench/PRIME-FIELD-NATIVE-BENCHMARK.md)
and run:

```sh
pnpm run bench:native:prime-field
```

V7 can compile the complete unmodified CoWasm number-theory module—including
its imports, defaults, tuple-returning extended GCD, destructuring, fixed wheel
sequence, exceptions, and prime-counting call graph:

```sh
sagejs native compile bench/cowasm/src/nt.py
```

On the dedicated 16-vCPU benchmark host, v7 runs that unchanged module's
`pi(100000)` in 2.36 ms, versus 128.29 ms with forced GMP, 78.35 ms in
CPython, and 285.00 ms in interpreted Sage.js.

V7 performs exact-value lifetime, mutability, and effect analysis before
generating C.
Immutable integer parameters are borrowed, while nonescaping locals are
interval-colored onto reusable GMP scratch slots. It also proves a checked
signed-64-bit specialization for exact call graphs. Entry guards and checked
arithmetic preserve the proof inductively. When an intermediate overflows, the
generated code promotes the live values into lazy tagged GMP cells and resumes
at the failed instruction. It never replays the public function, and Python
integers never wrap.
The generated wrapper selects adaptive native execution or BigInt from the
function's loop/call profile and runtime operand sizes. Selection and proof
metadata are inspectable, while tagged, BigInt, and forced GMP paths remain
directly callable:

```js
kernel.gcd.backendFor(a, b); // "bigint", "tagged", or "gmp"
kernel.gcd.backendPolicy;
kernel.gcd.effects;
kernel.gcd.taggedInteger;
kernel.gcd.bigint(a, b);
kernel.gcd.tagged(a, b); // checked int64 with in-place GMP promotion
kernel.gcd.gmp(a, b);    // start in GMP immediately
```

`SAGEJS_NATIVE_INTEGER_BACKEND=bigint|gmp|auto` overrides selection for
benchmarking and diagnosis; `gmp` bypasses the int64 specialization and `auto`
is the default.

The exact-integer backend also supports offset and exact-Integer `range` loops,
integer-to-field coercion, nested arithmetic, small constant powers, augmented
and parallel assignment, exact `divmod`, literal defaults, fixed integer
sequence lookup, typed tuple returns, checked `round(sqrt(Integer))`, explicit
`ZeroDivisionError`, and recursive native calls. Run the exact module and
CoWasm comparisons with:

```sh
pnpm run bench:native:integer
pnpm run bench:native:cowasm
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

The suite also adopts CoWasm's ordinary-Python runtime benchmarks as a shared
compatibility and performance corpus. `pnpm test:cowasm` requires all 61
registered workloads and their assertions to pass in Sage.js Python mode.
`pnpm bench:cowasm` runs those identical source files under Sage.js and
CPython and reports per-case median timings; additional Python-compatible
runtimes such as Sage can be included explicitly. The source revision,
license, exclusions, and runner options are documented in
[`bench/cowasm/README.md`](bench/cowasm/README.md).

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

`pnpm build` generates architecture- and V8-specific caches for the compiler
and Sage/Python base runtimes. They accelerate the first calculation but are
never authoritative: Node rejects an incompatible cache and recompiles the
bundled source. `pnpm bench:cold` reports bare Node startup, first Sage.js
evaluation, first import, and native-library loading separately.

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

Python compatibility is measured systematically using a pinned copy of
MicroPython's standalone language corpus. Each applicable program must produce
exactly the same combined output under Sage.js and a reference CPython.
`pnpm python:conformance` reports all current outcomes, while
`pnpm test:python:conformance` checks the reviewed baseline for regressions and
newly passing tests. See
[`upstream-tests/micropython/README.md`](upstream-tests/micropython/README.md).

## History and licensing

The language compiler descends from RapydScript-ng, JPython, and PyLang. The
original copyright notices and permissive license are preserved in source
headers and under [licenses](licenses/).

Sage.js as a whole is distributed under the
[GNU General Public License, version 3](LICENSE). This is appropriate for an
open research mathematics system built around GPL-compatible mathematical
libraries.
