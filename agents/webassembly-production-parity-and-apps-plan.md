# Plan for WebAssembly production parity, sagejs.org execution, and mobile apps

## Decision

Make WebAssembly a first-class Sage.js production target now, while the native
surface is still small enough to classify and the repository already contains
enough difficult examples to test the architecture honestly.

Carry this out as five dependency-ordered, independently shippable projects:

1. inventory every existing native and portable mathematical capability and
   enforce an explicit WebAssembly disposition for it;
2. make the Wasm toolchain, generated adapters, production kernel pack, browser
   tests, and release artifacts reproducible in CI;
3. systematically port the current mathematical surface by public vertical
   slice, beginning with number fields and analytic functions;
4. publish a live, interruptible Sage.js execution environment at
   `sagejs.org` or a dedicated same-project subdomain;
5. ship an offline-capable React Native iPhone and iPad application around the
   same browser kernel.

Do not attempt to compile Node-API code to WebAssembly, emulate Node merely to
reuse an adapter, or maintain separate mathematical implementations for Node
and browsers. Node-API and WebView code are host adapters. Mathematical cores,
packed schemas, FFI declarations, source-transparent kernels, oracle corpora,
and public semantics must be shared.

This is both a migration project and an architectural constraint on future
work. Guardrails alone would preserve the current parity gap; porting alone
would allow the gap to reopen. Both are required.

## Objectives

At completion, the same public Sage code should run in the desktop executable,
a browser, and an iPhone/iPad application whenever its documented resource
limits permit:

```sage
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 - x - 1)
O = K.maximal_order()
O.factor_rational_prime(23)
K.zeta_coefficients(1000)

E = EllipticCurve([1, 2, 3, 4, 999])
L = E.lseries()
L.values([1 + k*I/10 for k in range(40)])
complex_plot(L, (0, 2), (-4, 4), plot_points=120)
```

The project must:

- preserve Sage/Python semantics across hosts;
- retain ordinary CPython-parseable mathematical source and correct dynamic
  fallbacks;
- compile the same source-transparent kernel cores for native and Wasm targets;
- generate Node and Wasm adapters from the same declared ownership and ABI
  metadata wherever possible;
- use host-neutral packed buffers and bounded status codes across compiled
  boundaries;
- retain exact arbitrary-precision arithmetic without exposing FLINT or GMP
  object layouts to JavaScript;
- exercise public workflows, not only private ABI calls, in real browsers;
- keep the UI responsive and make interruption terminate all ongoing user
  computation reliably;
- work without a server-side mathematical process;
- support an offline mobile distribution whose executable engine is bundled
  with the application;
- report capabilities and resource limits honestly instead of silently
  substituting lossy arithmetic;
- prevent future native exports from landing without a reviewed Wasm decision.

## Current baseline

As of merge commit `d5ecf87a`, Sage.js already has a meaningful Wasm proof of
concept rather than an empty target.

### Browser and distribution foundation

`packages/flint-wasm` already provides:

- a browser-compatible FLINT/GMP/MPFR reactor;
- a separate M4RI Wasm module;
- a persistent Sage evaluator running in a Web Worker;
- a nested compiler worker using the authoritative Tree-sitter frontend;
- precompiled standard-library modules;
- exact integer factorization and primality;
- exact `ZZ`, `QQ`, `GF(p)`, and `Zmod(n)` polynomial and matrix operations;
- generated owned FLINT matrix resources with deterministic closure;
- weight-two modular symbols through shared P1 and Manin cores;
- SagePack serialization;
- structured Plotly graphics;
- streamed output, reset, timeout, and interruption through worker
  replacement;
- a headless-Chromium browser smoke test.

The current compressed payload is already plausible for a mathematical web
application. It is not yet a routinely produced or published artifact.

### Architecture foundation

The merged tree has:

- 31 registered source-transparent native kernel families;
- 412 declared FFI functions across four libraries;
- 369 FLINT declaration functions, 197 of which already declare a Wasm target;
- 311 classified N-API exports in 15 mathematical/representation families;
- 1,034 inventoried native boundaries;
- generated resource ownership and copied-byte transfer protocols;
- host-independent `kernel_core.c` and `kernel_core.h` artifacts;
- standalone and conditional Wasm differential tests for compiler cores;
- correct ordinary fallbacks for many optional accelerators.

### Existing gaps

The current Wasm package is explicitly a private proof of concept:

- it requires a separately prepared CoWasm checkout and WASI SDK;
- its full build is absent from ordinary CI and release validation;
- it includes a hand-selected subset of the declared FLINT surface;
- registered production kernels are packaged for desktop native hosts but not
  as a browser production pack;
- many direct `runtime.flint_backend()` consumers have never been exercised in
  a browser;
- new N-API adapters have no mandatory Wasm-disposition field;
- several adapters mix Node conversion, public object materialization, and
  host-neutral mathematics;
- browser asset versioning, immutable caching, CSP, memory ceilings, and
  compatibility reporting are not a production contract;
- the current evaluator executes compiler output dynamically inside its worker
  and therefore needs an execution-oriented CSP and a deliberately
  non-credentialed origin;
- no mobile shell or physical-device compatibility corpus exists.

## Architectural invariants

### One mathematical implementation

For any accelerated operation, use this order of preference:

1. ordinary strict Python with a same-source dynamic fallback;
2. source-transparent compilation to a host-independent core;
3. a declared mature-library operation with generated adapters;
4. a compact shared C core around mature FLINT/Arb/Acb functionality;
5. a host-specific adapter containing validation and conversion only.

Node and Wasm wrappers must never independently implement mathematical policy.

### Flat, host-neutral compiled ABIs

Public compiled boundaries may contain:

- fixed-width scalars with explicit overflow rules;
- checked offsets and lengths;
- typed-array-compatible packed buffers;
- canonical copied-byte encodings for arbitrary integers and rationals;
- opaque generation-tagged resource handles owned inside one module;
- bounded status and diagnostic records.

They must not contain:

- `napi_value`, `napi_env`, V8 handles, or JavaScript callbacks;
- raw public `fmpz`, `fmpq`, Arb, Acb, or library pointers;
- host object layouts;
- exception unwinding across the ABI;
- pointers retained after Wasm memory growth;
- unbounded output allocation controlled by user input.

### Public objects are materialized above the ABI

Packed results cross the boundary once. Ordinary Python/Sage.js constructs
public dictionaries, factors, matrices, ideals, complex values, and
diagnostics identically on every host. C adapters should not manufacture large
trees of Node objects.

### Wasm32 is an explicit target

Do not assume that C `long`, FLINT `ulong`, pointers, or `size_t` have desktop
width. Every shared boundary must use fixed-width external types and validate
conversion into the linked library's internal word type. Algorithms needing
larger primes must select an arbitrary-modulus resource or a correct fallback,
not truncate.

### Capability absence is not mathematical failure

An unavailable Wasm accelerator selects a tested exact or explicitly
non-rigorous fallback. A malformed input or failed mathematical invariant is a
different status. Tests must distinguish the two.

## Project 1: parity inventory and enforcement

### Capability manifest

Add a reviewed `architecture/wasm-capabilities.json` with one entry for every:

- N-API export;
- declared FFI function and resource;
- registered source-transparent production kernel;
- runtime intrinsic used by public mathematical code;
- separately linked external-library capability.

Each entry must include:

```json
{
  "id": "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch",
  "family": "number-field-zeta",
  "disposition": "shared-core",
  "fallback": "strict-python-finite-field-factorization",
  "wasm_module": "flint",
  "public_consumers": ["NumberField.zeta_coefficients"],
  "tests": ["number-field-zeta-browser-parity"],
  "status": "planned"
}
```

Allowed dispositions:

- `generated-wasm`;
- `shared-core`;
- `compiled-source`;
- `portable-fallback`;
- `desktop-only`;
- `remove-unused`.

`desktop-only` requires a substantive dependency or resource explanation and
a tested public fallback or an explicit capability error.

### Ratchet

Add `pnpm architecture:wasm` and include it in `pnpm architecture:check`.
Reject:

- an unclassified native export;
- a declaration marked Wasm-capable but omitted without explanation from the
  production Wasm closure;
- a production kernel with no Wasm disposition;
- a public browser-tested module that imports an unavailable host package at
  module initialization;
- a purported shared core containing Node-API symbols;
- a portable fallback that lacks a differential test.

Regeneration may update discovered facts but must not invent disposition,
fallback, or review decisions.

### Public capability report

Generate a machine-readable runtime capability table from the same manifest.
Expose a narrow expert API such as:

```sage
sagejs_capabilities()
sagejs_capabilities("number-fields")
```

The website and mobile shell should use this data to explain unavailable or
resource-limited operations.

### Stopping point

Project 1 is complete when every existing boundary is classified, the audit is
green, and adding an unreviewed N-API-only operation fails CI.

## Project 2: reproducible Wasm production infrastructure

### Toolchain

Pin a reproducible CoWasm/WASI toolchain identity including:

- repository revisions;
- Clang/WASI SDK version and digest;
- FLINT, GMP, MPFR, MPC, M4RI, and other archive revisions;
- build flags and exported symbol closure;
- generated adapter and compiler versions.

Prefer a versioned CI image or content-addressed toolchain artifact over an
ambient sibling checkout. A local developer may still point at a compatible
CoWasm tree.

The build receipt must identify the complete source and dependency closure.

### Production module layout

Avoid one separately linked GMP/FLINT copy per mathematical function. Produce
a small number of ownership domains:

1. a FLINT/GMP/MPFR/MPC/Arb module for exact and analytic resources;
2. an M4RI module for dense binary matrices;
3. a source-transparent kernel module or a small set of domain packs;
4. optional large specialist modules loaded only when requested.

Every resource is created, mutated, and destroyed by the module that owns its
allocator. Cross-module transfer uses canonical copied bytes, never raw
pointers or assumed allocator compatibility.

### Generated declared adapters

Extend the existing Wasm FFI generator so the production closure is selected
from declarations and public consumers rather than a handwritten function
list.

The generator must support:

- fixed scalars and status returns;
- packed input/output buffers;
- owned resources and borrowed views;
- copied-byte ingress and egress;
- deterministic close and generation-tag validation;
- memory-growth-safe JavaScript views;
- stable error translation;
- linker dead-code elimination for unused mature-library operations.

### Production source-transparent kernel pack

Compile every applicable registered kernel from its canonical emitted core.
The Wasm pack must use the same source hash, ABI hash, declaration hash, and
oracle identity as the native pack.

Do not treat a JavaScript fallback as evidence that Wasm lowering works. Run
the compiled core and compare it against the fallback.

### Runtime dispatch

The public runtime should select among:

- Wasm accelerator;
- ordinary JavaScript/Sage.js implementation;
- explicit unavailable capability.

Selection must be observable in diagnostics and must not depend on probing a
method only after expensive work has started.

### Browser CI

Add two tiers:

1. a routine prebuilt-artifact Chromium parity tier for every relevant change;
2. a scheduled or release full-toolchain rebuild followed by Chromium,
   Firefox, and available WebKit testing.

The full rebuild must start without an ambient CoWasm directory. Validate:

- artifact reproducibility;
- Wasm instantiation and ABI manifests;
- worker startup and interruption;
- exact public workflow digests;
- resource close/finalizer behavior;
- memory growth and stale-view rejection;
- serialization compatibility with Node;
- offline asset completeness.

### Stopping point

Project 2 is complete when a clean CI worker builds the distributable package,
runs public browser tests, and emits a signed/content-addressed release artifact
without manual toolchain preparation.

## Project 3: systematic migration of the current mathematical surface

Port by public vertical slice rather than by raw export count. Each slice must
exercise representation, exact arithmetic, algorithms, serialization,
fallbacks, and user-visible output together.

### Slice A: exact arithmetic baseline

Finish and harden the capabilities already demonstrated:

- integer arithmetic, primality, and factorization;
- `ZZ`, `QQ`, finite-field, and residue-ring polynomials;
- dense exact matrices, HNF, RREF, kernels, determinants, and solving;
- exact serialization;
- P1 lists and weight-two modular symbols.

Move all applicable declaration functions into the generated closure and
remove redundant handwritten adapters only after differential parity passes.

### Slice B: algebraic number fields

Support in a real browser:

```sage
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 - x - 1)
O = K.maximal_order()
K.signature()
O.factor_rational_prime(23)
K.zeta_coefficients(1000)
```

This requires:

- publishing the maximal-order production kernel closure to Wasm;
- exact packed integer/rational buffer support;
- finite-field polynomial factorization;
- arbitrary-prime and index-prime fallback paths;
- ideal and certificate serialization;
- the new number-field zeta factor-degree batch.

#### Number-field zeta pilot

Replace the Node-specific ingress with a shared packed core. Since polynomial
factorization modulo `p` needs only coefficient residues, prefer a fixed-width
residue matrix for word primes:

```c
int sagejs_nf_factor_degrees_residue_batch(
    uint16_t *factor_counts,
    uint16_t *exponents,
    uint16_t *degrees,
    const uint32_t *coefficient_residues,
    const uint32_t *primes,
    uint32_t degree,
    uint32_t prime_count);
```

Use an explicit 64-bit or arbitrary-modulus route when necessary. Node and
Wasm adapters copy typed arrays; ordinary Sage.js materializes public records.
Keep the certified index-prime route unchanged.

This pilot must preserve the measured native speedup and establish the pattern
for later batch adapters.

### Slice C: analytic functions and plotting

Port the Arb/Acb-backed batch primitives needed for:

- Riemann zeta jets and batches;
- Dirichlet `L`-value batches;
- quadratic Dedekind zeta;
- elliptic-curve `L`-series values and plot batches;
- arbitrary-precision complex gamma and completion factors.

Keep exact decimal or packed arbitrary-precision transport. Do not silently
replace Acb/Arb values with binary64 merely because a plot eventually consumes
pixels.

For plotting, share prepared coefficient/grid state and use the existing tiled
public protocol. A 10,000-point boundary remains an internal resource tile,
not a public image-size restriction.

### Slice D: algebraic numbers and advanced polynomials

Port or generate:

- QQbar/AA roots, comparisons, and enclosures;
- extension-field polynomial resources;
- multivariate polynomial and Groebner operations where their mature
  dependency is available;
- exact charpolys and factorization used by number-field construction.

This slice should validate that owned variable-size FLINT resources work beyond
matrices rather than introducing object-at-a-time scalar crossings.

### Slice E: elliptic and hyperelliptic arithmetic

Separate capabilities into:

- shared FLINT/Arb/Acb cores suitable for the main module;
- source-transparent kernels suitable for the production kernel pack;
- specialist external libraries such as eclib, smalljac, and rforest;
- exact portable fallbacks.

Do not block browser elliptic-curve arithmetic or moderate `L`-series values on
porting every desktop specialist library. Port high-value shared cores first.
Record unsupported descent, very large trace, or rforest cases explicitly.

### Lower-priority families

Graph/igraph and exceptionally large specialist algorithms may remain
portable-fallback or desktop-only during the first production release. Their
classification must still be complete, and public behavior must be tested.

### Per-slice completion gate

For each slice require:

- identical public examples in Node and Chromium;
- exact digest or precision-aware numerical agreement;
- dynamic-fallback differential tests;
- malformed-input and resource-limit tests;
- serialization Node-to-browser and browser-to-Node;
- cold/warm timing and peak-memory receipts;
- no new handwritten mathematical implementation;
- updated public capability documentation.

### Stopping point

Project 3 first release is complete when the exact arithmetic, number-field,
analytic/plotting, and core algebraic-number slices pass. Specialist descent,
large-height zero searches, rforest, igraph, and every optional native package
need not block that release if their fallbacks and capability reports are
honest.

## Project 4: live sagejs.org execution environment

### Deployment decision

Ordinary Web Workers and single-threaded Wasm can run from static hosting, so a
prototype need not wait for a hosting migration. Production should use a host
with controllable response headers before enabling shared-memory threads,
strict caching, or a hardened execution policy.

Cloudflare Pages is the preferred initial production target because a checked
`_headers` file can provide:

- `Cross-Origin-Opener-Policy`;
- `Cross-Origin-Embedder-Policy`;
- `Cross-Origin-Resource-Policy`;
- Content Security Policy;
- immutable caching for content-addressed Wasm and module assets;
- explicit MIME and security policy.

Keep the build source in this repository and preserve preview deployments. A
hosting move must not make Cloudflare a mathematical runtime dependency.

### Origin isolation

User-entered Sage code is intentionally executable. Host it on a dedicated,
non-credentialed origin such as `app.sagejs.org` even if the documentation and
marketing site remain at `sagejs.org`.

The execution origin should have:

- no authentication cookies or sensitive ambient credentials;
- a narrow `connect-src` policy;
- no privileged server API;
- isolated workers;
- bounded Wasm memory;
- termination-based time limits;
- explicit user action before downloading or opening generated files.

Do not claim that a Web Worker is a security sandbox for secrets on the same
origin. Defense comes from origin separation, CSP, absence of credentials,
bounded capabilities, and worker termination.

### Public application

The first public environment should provide:

- a Sage editor with run selection/run cell/run all;
- streamed textual output;
- rich Plotly graphics;
- interrupt and reset controls;
- visible CPU/wall-time and memory/resource diagnostics;
- examples for number fields, elliptic `L`-series, complex plots, matrices, and
  modular symbols;
- local session persistence;
- import/export of plain Sage source and SagePack data;
- shareable source encoded locally or through a deliberately data-only share
  service;
- a capability/about panel identifying exact artifact revisions;
- offline caching after the first successful load where browser policy permits.

Do not begin with accounts, collaborative editing, or server execution.

### Interrupt and resource policy

Every evaluation runs in the outer kernel worker. Timeout or interrupt
terminates the worker and all of its mathematical resources. Restart must
produce a clean session.

Set and test:

- initial and maximum Wasm memory;
- compiler and evaluator startup deadlines;
- default and configurable wall-time ceilings;
- maximum displayed output and plot payload;
- bounded saved files in the in-memory filesystem;
- graceful out-of-memory and module-instantiation errors.

### Website release gate

Before public launch require:

- a clean production Wasm rebuild;
- Chromium, Firefox, and available WebKit smoke tests;
- desktop and mobile-browser manual checks;
- cache upgrade and rollback tests;
- cross-origin isolation verification where enabled;
- interruption of infinite JavaScript, native Wasm loops, and filesystem-heavy
  FLINT operations;
- no network dependency for mathematical evaluation after assets load;
- accessible keyboard and screen-reader behavior for core controls;
- privacy documentation stating where source and results reside.

### Stopping point

Project 4 is complete when a user can visit the public URL, run the documented
number-field and `L`-series examples, interrupt computation, render plots, and
reload into a compatible saved session without a backend compute server.

## Project 5: React Native iPhone and iPad application

### Product architecture

Use a small React Native shell containing `WKWebView`; do not embed or emulate
full Node.js.

Bundle the exact production browser artifacts with the application:

- evaluator and compiler workers;
- Wasm modules;
- precompiled standard library;
- editor and graphics UI;
- examples and documentation metadata.

The initial application must function offline. Network access may later support
explicit import/export or documentation, not runtime completion.

### Device feasibility spike

Before building the full UI, run a physical-device spike on a supported iPhone
and iPad that proves:

- local Wasm compilation/instantiation;
- relative loading of worker and Wasm assets;
- nested workers, or a sibling compiler/evaluator-worker topology when nested
  workers are unavailable;
- FLINT temporary-file behavior;
- reliable worker termination;
- maximum practical memory and representative large allocations;
- cold/warm startup time;
- background/foreground lifecycle recovery;
- plot rendering and export;
- hardware-keyboard input;
- VoiceOver compatibility for editor and execution controls.

Choose the local asset URL strategy only after this spike. Avoid fragile
`file://` assumptions; use the WebView's supported bundled-resource mechanism
or a narrow application-owned scheme handler.

### Native shell responsibilities

The React Native layer should provide only product integration:

- document browser and recent worksheets;
- Files/iCloud import and export;
- share sheet for source, images, and data;
- split-view and keyboard support on iPad;
- settings for resource ceilings and appearance;
- lifecycle and crash recovery;
- optional example/document downloads whose source is visible.

It must expose no broad privileged bridge to arbitrary user code. The WebView
message protocol is versioned, validates every message, and supports a short
allowlist of document/share/lifecycle operations.

### App Store posture

Present the application as an educational and computational programming
environment. To align with Apple's executable-code policy:

- bundle the compiler and mathematical engine;
- keep all user and downloaded Sage source visible and editable;
- do not download opaque executable plugins that change application features;
- execute downloaded examples only through explicit user action;
- document the educational purpose clearly for review;
- provide meaningful device integration rather than a remote website wrapper;
- retain an App Review note explaining the language, offline engine, source
  visibility, and restricted native bridge.

Treat approval as a release risk to validate with an early TestFlight/App
Review consultation, not as a mathematical architecture assumption.

### Mobile parity and performance

Use the same public parity corpus with device-appropriate resource bounds.
Record:

- app and compressed runtime size;
- first and subsequent kernel startup;
- peak resident memory;
- number-field coefficient and `L`-series batch timings;
- complex-plot rendering time;
- interrupt latency;
- worksheet save/load time;
- thermal behavior on a sustained computation.

The mobile release may use single-threaded Wasm even if the website enables
threads. Threading is an optional capability, not a semantic fork.

### Stopping point

Project 5 is complete when a TestFlight build works offline on current iPhone
and iPad hardware, passes the public mathematical corpus within documented
mobile limits, and supports editing, interruption, plots, documents, and
sharing without a Node runtime.

## Shared correctness and oracle policy

Every migrated operation retains the oracle hierarchy already used by Sage.js:

- same-source CPython execution where applicable;
- ordinary Sage.js dynamic fallback;
- native Sage.js execution;
- Wasm execution in Node's Wasm host and a real browser;
- SageMath/PARI, Magma, Hecke/Oscar, or upstream-library corpora where relevant.

Functional equations and symmetry identities are useful regressions but are
not independent numerical accuracy evidence when the same formula enforces
them algebraically.

For arbitrary-precision values, compare at requested precision and retain
diagnostic meaning. For exact objects, compare canonical encodings and replay
certificates. For plots, compare sampled numerical values and stable rendering
metadata rather than brittle image pixels alone.

## Performance and payload gates

Establish baselines before migration and report regressions by host. Track:

- clean compressed artifact size by module;
- download and compile time;
- worker and compiler startup;
- warm operation latency;
- peak and maximum Wasm memory;
- host-boundary copy volume and crossing count;
- batch speedup over scalar evaluation;
- interrupt latency;
- browser-to-native ratio for representative kernels.

Initial gates should be empirical rather than arbitrary. Once recorded, require:

- no unexplained payload growth;
- no scalar host crossing inside a declared batch;
- no browser path accidentally selecting binary64 for an exact or
  arbitrary-precision API;
- no more than one packed ingress and one packed egress for the zeta factor
  batch;
- competitive warm Wasm performance for source-transparent arithmetic kernels;
- graceful refusal before memory growth exceeds declared ceilings.

Use lazy specialist modules when a dependency adds substantial payload for a
small audience.

## Security and privacy model

The evaluator runs untrusted user-authored code by design. It is not suitable
for handling secrets in the same realm or origin.

The production threat model must cover:

- infinite loops and excessive allocation;
- enormous textual/graphical output;
- malformed serialized data;
- stale resource handles after memory growth or reset;
- worker messages forged by evaluated code;
- filesystem path traversal in the in-memory filesystem;
- unexpected network access;
- persistence of sensitive source in browser storage;
- mobile native-bridge abuse.

Mitigations include origin separation, CSP, worker termination, strict message
schemas, bounded memory, data-only serialization, no ambient credentials,
minimal network capability, and explicit persistence controls.

Do not market the worker boundary as protection against browser-engine defects.

## Documentation deliverables

Add:

- a public browser-support and capability page;
- a contributor guide for shared-core and generated Wasm work;
- a packed-ABI design guide with Wasm32 rules;
- reproducible build instructions requiring no ambient toolchain state;
- live-environment privacy/security documentation;
- mobile architecture and App Review notes;
- examples that execute identically in Node and browser CI;
- release notes identifying newly portable mathematical families.

## Execution order

```text
parity inventory + ratchet
            |
            v
reproducible toolchain + generated adapters
            |
            +-----------------------+
            |                       |
            v                       v
production source kernels      public browser shell
            |                       |
            v                       |
exact arithmetic baseline           |
            |                       |
            v                       |
number fields + zeta pilot ----------+
            |
            v
analytic L-functions + plotting
            |
            +-----------------------+
            |                       |
            v                       v
advanced algebraic slices      sagejs.org launch
                                    |
                                    v
                           physical-device spike
                                    |
                                    v
                            iPhone/iPad release
```

Do not postpone the public browser shell until every mathematical family is
ported. Launch from an explicitly documented capability subset. Conversely, do
not declare WebAssembly first-class based only on a UI demo while important
exact workflows silently fall back or fail.

## Explicit non-goals for the first release

- Reimplementing Node.js in a browser or mobile WebView.
- Shipping a server-side Sage.js compute service.
- Porting every optional desktop external library before launch.
- Enabling Wasm threads before correctness, headers, and single-threaded
  resource behavior are stable.
- General collaborative notebooks, accounts, billing, or cloud persistence.
- Exposing arbitrary native mobile APIs to evaluated Sage code.
- Claiming rigorous numerical enclosures where the desktop implementation is
  itself explicitly non-rigorous.
- Using an N-API emulation layer as the permanent mathematical boundary.

## Final definition of done

The overall program is complete when:

1. every current and future native boundary has an enforced Wasm disposition;
2. a clean CI environment reproducibly builds and validates the Wasm release;
3. all applicable source-transparent production kernels have a tested Wasm
   artifact;
4. generated declarations, rather than handwritten inclusion lists, define
   the mature-library Wasm closure;
5. public exact arithmetic, number-field, zeta, analytic batch, and plotting
   workflows agree across Node and browsers;
6. `sagejs.org` offers a live, interruptible, non-credentialed execution
   environment with documented limits;
7. an offline iPhone/iPad build runs the same kernel and passes its
   device-appropriate parity corpus;
8. payload, startup, memory, and operation benchmarks are published and
   regression-gated;
9. desktop-only capabilities are few, explicit, justified, and paired with
   tested public behavior;
10. documentation teaches contributors how to preserve portability without
    duplicating mathematics.
