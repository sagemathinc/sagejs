# Sage.js 0.8.0

Sage.js 0.8.0 is an **early alpha release** for developers, educators, agents,
and researchers who want a portable numerical and exact-mathematics system in
native executables, Node.js, Jupyter, and the browser. Missing functionality,
incompatible API changes, and rough edges remain expected; installation,
portability, and mathematical bug reports are especially valuable.

This release introduces an agent-first numerical computing laboratory built
around shared semantics rather than separate language-specific wrappers:

- A common problem, plan, result, diagnostic, capability, provenance,
  explanation, and bounded-trace model makes solver choices and conclusions
  inspectable. Results distinguish exact, independently validated approximate,
  heuristic, and indeterminate claims instead of trusting a backend success
  flag.
- The supported method families now include scalar and system root finding,
  approximation, dense linear algebra, adaptive quadrature, optimization and
  fitting, explicit and stiff ordinary differential equations, polynomial
  roots, FFT and spectral methods, descriptive statistics and regression, and
  deterministic parameter sweeps.
- Supported Sage, Python/SciPy, MATLAB, and Wolfram operations lower to the same
  numerical contracts. Scalar-root source parsing is qualified in all four
  languages; the broader catalog classifies code-emission targets separately
  and rejects unsupported translations explicitly. Results can emit stable
  JSON, explanations, PlotSpec/Plotly figures, and bounded animations without
  coupling visualization to solver kernels.
- Interactive lessons and a cross-domain teaching gallery expose both success
  and failure behavior, including convergence traces, adaptive step choices,
  conditioning, validation residuals, and resource-budget diagnostics.
- Numerical modules remain ordinary CPython-parseable strict Python. Browser
  and Node runtimes load domains lazily, use explicit capability planning, and
  retain correct dynamic fallbacks when a compiled resource is unavailable or
  outside its validated envelope.

The numerical implementation is supported by backend-neutral correctness
corpora, metamorphic and failure tests, bounded fuzz and sweep cases, executed
differential oracles drawn from NumPy, SciPy, and mpmath, plus retained R
reference source and fixtures. Qualified cminpack integration supplies
nonlinear least squares. One explicit-only NLopt Nelder-Mead Wasm reactor is
qualified and capability-gated; it is never selected automatically, and other
NLopt methods remain unsupported until separately qualified.

Release publication now requires an authenticated numerical evidence gate. It
binds the exact candidate to Node, npm, SEA, and browser observations; Linux
x86_64, Linux arm64, macOS arm64, and native Windows x64; hermetic oracle
inputs; memory, startup, payload, and performance measurements; and raw
producer artifacts. The tagged workflow reconstructs that gate twice and
requires canonical byte identity before GitHub, npm, or Cloudflare publication.

Interactive mathematics is substantially broader in this release:

- Upstream `traitlets`, `comm`, and `ipywidgets` are bundled with a
  transport-neutral comm implementation. Standard controls, binary widget
  state, repeated updates, plots, and rich `Output` content work in the
  browser app, and Sage-compatible `@interact` controls are available.
- Real and complex interval fields support all five MPFR rounding modes and
  use MPFR/Arb/Acb on native and WebAssembly targets. A pinned executable Sage
  PREP corpus provides explicit coverage and expected-failure accounting for
  undergraduate examples.

The exact algebra and number-theory libraries also gained major foundations:

- Classical integral-weight trivial-character `Gamma0(N)` modular forms over
  `QQ` now have common parents, immutable exact coordinates, coercion,
  membership, arithmetic, and certified good- and bad-prime Hecke actions for
  ambient, cusp, Eisenstein, old, and new spaces.
- Polynomial ideals over `QQ` and prime fields now include exact,
  certificate-verified Buchberger bases, elimination, bounded FGLM order
  conversion, quotient coordinates and multiplication matrices, and
  base-field solving, on native and WebAssembly runtimes.
- Complex cubic number fields have a narrowly gated native class-group
  frontier with authenticated replayable certificates and fail-closed resource
  limits. Its frozen 1,000-field survey and 20-field holdout agree exactly with
  retained PARI and LMFDB reference data; this is explicitly not yet broad
  PARI performance parity.

Linux native worker teardown is now fork-safe. Mathematical addons that embed
process-wide OpenBLAS `atfork` handlers remain mapped for process lifetime, and
SEA workers share one atomically published extraction root. This closes an
intermittent ARM64 worker-teardown/spawn crash without retaining one native
image per worker.

The supported release platforms remain:

- macOS arm64, signed with Apple Developer ID and notarized by Apple;
- Linux x86_64 and arm64;
- Windows x86_64, available through npm and as a standalone ZIP.

Every downloadable archive has a SHA-256 checksum. Windows Authenticode
provisioning may still be incomplete, so the Windows executables may be
unsigned. The release records the signing mode used, and Windows SmartScreen
may show an unrecognized-app warning for unsigned artifacts.

Install the command line globally:

```sh
npm install -g @sagemath/sagejs@0.8.0
```

Or embed Sage.js in a Node application:

```sh
pnpm add @sagemath/sagejs
```

```js
import { createSage } from "@sagemath/sagejs";

const sage = await createSage();
console.log((await sage.evaluate("find_root(cos(x) - x, 0, 1)")).repr);
await sage.close();
```

On macOS and Linux, the checksum-verifying standalone installer is also
available:

```sh
curl -fsSL https://sagejs.org/install.sh | sh
```

Try Sage.js without installing anything at <https://app.sagejs.org/> and open
the numerical laboratory at <https://sagejs.org/numerical-computing/>. Please
report installation problems and mathematical bugs at
<https://github.com/sagemathinc/sagejs/issues>.
