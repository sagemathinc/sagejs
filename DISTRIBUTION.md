# Distributing Sage.js

Sage.js has two distinct portability layers:

1. the language runtime, compiler, baselib, and JavaScript-backed standard
   library; and
2. native mathematical kernels such as GMP, MPFR, MPC, OpenBLAS, and FLINT.

Keeping that boundary explicit gives us useful distributions before the full
mathematical library exists. It also prevents browser portability from
dictating the architecture of the native research system.

## Single executable applications

[Node.js single executable applications](https://nodejs.org/api/single-executable-applications.html)
retain V8, including its optimizing JIT, while packaging the JavaScript
runtime and assets into one platform-specific executable. Sage.js builds two
variants:

| Artifact | Contents | Intended use |
|---|---|---|
| `build/sea/sagepython` | Python/Sage.js compiler, baselib, standard library, and Jupyter kernel; no FLINT addon | The small language runtime, compatibility testing, and portable demos |
| `build/sea/sagejs` | Everything above plus native FLINT and igraph addons and their statically linked libraries | Self-contained native research mathematics |

Build both with:

```sh
pnpm build:sea
```

Or build one variant:

```sh
pnpm build:sea:python
pnpm build:sea:math
```

The direct `node --build-sea` builder requires Node 25.5 or newer. The
resulting executable does not require Node, pnpm, the Sage.js checkout, or
separately installed mathematical libraries on the target computer. It is
still specific to an operating system and CPU architecture. Normal Sage.js
development and npm use continue to support Node 22.22.2 or newer.
The standard-library sources and their validated precompiled module caches are
embedded as SEA assets. Selected substantial pure-Python packages also ship
portable, compiler-versioned JavaScript templates. A target installation
materializes its real source filenames and creates V8 bytecode locally, so a
first `import mpmath` does not run the Sage.js compiler. Packages selected for
this treatment are declared in
`scripts/precompiled-python-packages.json`; the mechanism is not specific to
mpmath. The bundled `numpy-ts` backend is part of the JavaScript payload, so
`import numpy` does not require an adjacent `node_modules` tree.
Linux artifacts also inherit the libc and compiler-runtime baseline of the
Node executable used to build them; release binaries should therefore be
built in the oldest Linux environment which Sage.js intends to support.

The native build downloads checksum-pinned releases of GMP, MPFR, MPC, FLINT,
and igraph; Linux x64 also downloads ffpoly and smalljac. Fragile upstream
archives are mirrored according to [VENDORED-SOURCES.md](VENDORED-SOURCES.md). It builds
position-independent static libraries, tests GMP, and links those libraries
into the addon. Other platforms retain the same elliptic-curve API using the
portable point-counting fallback. At runtime the SEA asset API writes native
addons and evaluator workers to a private temporary directory because Node
loads both through filesystem paths. The embedded ZeroMQ Node-API addon
provides a real Jupyter wire protocol without requiring Node or `node_modules`
beside the executable. The directory is removed when the process exits.

### Native mathematics build profiles

Release artifacts and ordinary source builds use the `portable` mathematics
profile. On x86-64 it builds GMP's runtime-dispatched fat binary and keeps
FLINT free of host-specific compiler flags, so an artifact is not silently tied
to the CPU which happened to compile it.

Controlled benchmarks and local source installations may explicitly select a
CPU-specific stack:

```sh
SAGEJS_NATIVE_MATH_PROFILE=cpu-native pnpm --dir packages/flint build
SAGEJS_NATIVE_MATH_PROFILE=cpu-native pnpm --dir packages/fflas build
```

The `cpu-native` profile omits GMP's `--enable-fat`, compiles GMP, FLINT, and
the FFLAS stack with the compiler's native CPU flag when supported, and lets
FLINT detect `fft_small` from the resulting instruction set. It is intentionally
opt-in: moving one of these binaries to a different CPU may execute unsupported
instructions. Native Windows x64 always falls back visibly to the portable
profile and remains correct.

The shared native-artifact cache fingerprints the effective profile, CPU model
and feature set for CPU-native builds, target C ABI, compiler identity and
target, exact dependency versions, and build options. Portable entries omit
the particular CPU identity so compatible hosts can still share them. Inspect
the selected profile, the installed dependency stamp, and observed FLINT
capabilities without rebuilding anything:

```sh
sagejs native profile
sagejs native profile --json
```

Record the JSON output with performance results. It distinguishes a selected
profile from a differently built prefix and makes accidental portable/native
benchmark comparisons apparent.

If `jupyter` is available on `PATH`, either executable can register itself as
a kernel with no additional Sage.js files:

```sh
sagejs --install-jupyter-kernel
```

Run the end-to-end build and relocation smoke test with:

```sh
pnpm test:sea
```

On one x86-64 Linux development host the uncompressed mathematics executable
was about 164 MB. Compressing it with:

```sh
xz -T0 -9 -k build/sea/sagejs
```

produced a 34 MB file. These figures are examples rather than size promises;
the Node executable used to build the artifact accounts for most of the
uncompressed size. For comparison with SageMath's multi-package
distribution, a single file comfortably below 200 MB is already a successful
proof of concept.

The Python-only executable intentionally keeps the ordinary mathematical API
surface visible. Calling a FLINT-backed operation produces a clear
“built without the optional FLINT mathematics backend” error rather than
silently changing its semantics.

## Browser and WebAssembly

The browser proof of concept executes the mathematics runtime inside a Web
Worker. A nested worker runs the self-hosted compiler in a separate realm,
matching the VM isolation used by the Node REPL. Long computations cannot
freeze the page, and the first reliable interruption mechanism simply
terminates and recreates the outer worker. WebAssembly mathematical objects
remain opaque handles owned by that worker.

The release gate also runs the production kernel in Playwright's Linux WebKit
port under deliberate pressure. It directly observes the memory object passed
to Tree-sitter and requires its 384 MiB maximum, compiles and evaluates a
bounded 1 MiB source, exercises number-field zeta coefficients and analytic
values, interrupts and resets active allocation-heavy computations, and then
proves that a fresh kernel can compute again. WebKit does not expose a standard
per-worker JavaScript heap measurement API, so the receipt says which memory
facts were observed directly and which limits were authenticated statically.
The gate refuses to infer a heap figure from an unavailable API.

Playwright WebKit on Linux is an important JavaScriptCore/WebKit compatibility
signal, but it is **not** physical iOS or iPadOS validation. It does not model
WKWebView process eviction, device RAM classes, thermal pressure,
background/foreground transitions, or Apple's exact shipping WebKit build.
The physical iPhone/iPad feasibility and release corpus therefore remain
separate mandatory gates.

A mobile shell must not load the kernel from bundled `file:` URLs. Those URLs
cannot carry COOP/COEP response headers, are not cross-origin isolated, and
cannot be treated as if `SharedArrayBuffer` were available. A real WebKit
file-origin release check exercises both the outer module worker and its nested module
worker and records the actual isolation and `SharedArrayBuffer` state. The
release check proves why it is rejected. The mobile host instead serves the
verified bundle through a narrowly scoped application-owned HTTPS or loopback
HTTP asset origin with the same COOP/COEP/CORP policy, immutable asset
verification, and no remote fallback. The authoritative compiler still keeps
its non-isolated, in-realm fallback for WebViews where synchronous
shared-memory RPC remains unavailable. A `file:` URL plus HTML meta tags cannot
provide either contract.

There is strong evidence that the native library stack is portable:

- the earlier CoWasm SageMath work builds GMP, MPFR, and FLINT for WASI and
  exercises integer, rational, finite-field, polynomial, matrix, Arb, ACB,
  algebraic-number, and Calcium operations;
- [python-flint](https://github.com/flintlib/python-flint) supports an
  Emscripten/Pyodide build; and
- [napi-wasm](https://github.com/devongovett/napi-wasm) offers a possible
  compatibility layer for compiling a Node-API-shaped addon to WebAssembly.

The implemented direct C ABI links the CoWasm FLINT, MPFR, and GMP archives
into a 4.7 MiB stripped module, about 2 MiB with gzip. The compiler and baselib
add about 0.45 MiB with gzip. CoWasm's `wasi-js` and `@cowasm/memfs` provide a
browser-safe temporary filesystem for FLINT algorithms such as quadratic
sieve, without granting access to a host filesystem. A real Chromium smoke
test evaluates
`factor(2026)` through the Sage parser, generated JavaScript, ordinary
`IntegerFactorization`, and FLINT WASM layers. It also verifies persistent
definitions across evaluations and factors every `n^22 - 1` for
`2025 <= n <= 2050`.

This establishes a worker-hosted WASM backend without making the browser the
primary high-performance research target or forcing native deployment through
WebAssembly. The current evaluator uses dynamic JavaScript evaluation inside
the isolated worker, so restrictive Content Security Policies remain a
separate deployment issue.

Synchronous `time.sleep()` follows the same architecture. It uses
`Atomics.wait` in Node and can block an isolated worker, but it refuses to
busy-wait on a browser main thread.

## Hosted services

Ordinary edge-worker isolates are a poor match for a large optimizing runtime,
native libraries, long computations, and interruptible state. A
[Cloudflare Container](https://developers.cloudflare.com/containers/) or
ordinary OCI container is a much cleaner hosted target: it can run the native
SEA artifact while the surrounding service owns scheduling, persistence,
resource limits, and termination.

## TypeScript-to-native compilers

[Porffor](https://github.com/CanadaHonk/porffor) is an interesting
experimental JavaScript/TypeScript ahead-of-time compiler, but it is not
currently a distribution route for the general Sage.js runtime:

- Sage.js depends on dynamic language machinery which an optimizing
  JavaScript runtime already implements;
- replacing V8 gives up the JIT rather than merely removing Node APIs; and
- a measured experiment on a 118-byte Python loop produced 1.25 MB of
  generated Sage.js runtime JavaScript. Porffor parsed and lowered it to C,
  but first exposed an unmangled C-reserved identifier and, after that
  experimental rename, its default native/LTO build did not finish within
  180 seconds.

Porffor may eventually be useful for small, isolated kernels. Sage.js already
has a more direct route for those kernels: typed Sage.js IR lowered to compact
C against the native mathematical ABI. The two approaches should not be
confused with packaging the complete dynamic runtime.

## Current matrix

| Target | Status | Runtime strategy |
|---|---|---|
| npm package | Working | Small Node dispatcher + platform-native optional package; source/embedding APIs retained |
| Native single file | Working proof of concept | Node SEA + embedded static-math addon |
| FLINT-free single file | Working proof of concept | Node SEA, JavaScript language runtime only |
| Browser demo | Working proof of concept | Web Worker + WASM mathematical backend |
| Hosted service | Straightforward later | SEA in an OCI/Cloudflare Container |
| General Porffor binary | Not currently viable | Loses V8 and expands the whole dynamic runtime |

The strategic default remains simple: use V8 for dynamic code, native
libraries for mathematical objects, and typed native lowering for hot library
kernels.
