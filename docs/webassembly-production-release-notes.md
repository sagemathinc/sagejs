---
title: "WebAssembly production parity release notes"
---

# WebAssembly production parity release notes

This page records the WebAssembly production-parity milestone under
development. It describes repository deliverables and release gates; it does
not claim that a public `app.sagejs.org` deployment, signed TestFlight build,
or App Store release exists without its separate deployment/device receipt.

## Newly portable mathematical families

The production browser corpus covers these public vertical slices:

- exact integers, rationals, finite/residue rings, dense exact matrices,
  polynomials, modular symbols, and SagePack serialization;
- number-field signature, certified maximal orders, rational-prime
  factorization, zeta coefficients, and quadratic Dedekind zeta values;
- batched Riemann zeta and Dirichlet L-values with arbitrary-precision
  transport;
- elliptic-curve coefficients through the pinned portable ffpoly/smalljac
  genus-one closure, semistable root numbers, moderate L-series values, and
  tiled real/complex plots.

The generated [capability
report](../architecture/wasm-capabilities-report.json), not this prose list, is
the version-specific authority. Portable fallbacks, planned operations, and
desktop-only specialists remain visible instead of being reported as Wasm
accelerators.

## Runtime and distribution

- The FLINT/GMP/MPFR/MPC/Arb and M4RI allocator domains are separate; copied
  canonical bytes are the only cross-module resource transfer.
- Declared FFI adapters support packed buffers, owned resources, borrowed
  views, memory-growth-safe copies, generation-tagged handles, and
  deterministic close.
- Applicable source-transparent production kernels are compiled from their
  canonical cores and keyed by source, ABI, declarations, generators, and
  oracle identity.
- The toolchain, library sources, flags, module memory limits, source closure,
  host assets, capability set, and output digests are locked and recorded.
- Routine Chromium parity and clean reproducible release builds are distinct
  gates; the release matrix includes Chromium, Firefox, and WebKit.
- Interruption replaces the worker. Output, plot, time, Wasm memory, imports,
  and the in-memory WASI filesystem are bounded and adversarially tested.

## Applications

The repository includes a static, backend-free live environment with editor
commands, streamed output, Plotly displays, interruption/reset, bounded local
sessions, explicit import/export/share, capability explanations, and offline
caching. Its [public privacy and security
contract](../website/live/privacy.html) requires a dedicated non-credentialed
origin.

The React Native iPhone/iPad shell bundles the identical authenticated browser
artifact in a WebView and provides local worksheets, Files/iCloud document
flows, share sheets, iPad layout, lifecycle recovery, and a narrow versioned
native bridge. The [App Review
notes](../apps/sagejs-mobile/docs/app-review-notes.md) describe visible-source,
offline educational execution. Signed device/TestFlight assertions remain
receipt-gated.

## Compatibility and deliberate limits

- Node.js is not embedded or emulated in browsers or mobile applications.
- The first release is single-threaded; threading is an optional capability,
  not a semantic fork.
- Binary64 is never substituted for an exact or arbitrary-precision public
  value. Explicit plot transport may use display precision.
- Optional desktop specialists may retain tested exact fallbacks or explicit
  capability errors. Large descent, trace, rforest, graph, and other specialist
  cases are not implied by core elliptic/number-field parity.
- Browser source is executable and therefore belongs on an origin containing
  no credentials or secrets. Worker isolation is not marketed as protection
  from browser-engine defects.

For current support, start with [browser capabilities and
limits](webassembly-browser-support.md). Contributors should use the [portable
architecture guide](webassembly-contributor-guide.md), [packed ABI
rules](webassembly-packed-abi.md), and [reproducible build
instructions](webassembly-reproducible-builds.md).
