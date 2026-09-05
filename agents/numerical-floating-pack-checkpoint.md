# N2 isolated floating Wasm pack boundary

This is a separate infrastructure continuation of draft PR #148, not a new
public dispatch or completed browser statistics product. It reuses the existing
source-transparent Wasm pack builder, portable identities, digest-authenticated
loader, checked marshaller and owned host buffers. No mathematical implementation
is replaced or handwritten in C.

The builder's explicit `isolateFloat64: true` / `--isolate-float64` option places
modules in a `float64` domain only when all lowered functions are binary64, the
core depends solely on libc/libm, and there are no foreign declarations. That
domain needs no GMP, FLINT, MPFR or MPC prefix, links no exact-library host shims,
and disables FP contraction. Existing production-domain selection is unchanged.
An early blanket classification moved existing curve kernels from GMP before
their current consumers supported the new domain; the integration regression
caught that, so isolation is now explicit until consumers are qualified.

Binary64 Wasm callables expose the same owned buffer creation and stable numeric
sorting helpers used by the prepared statistics orchestration. The sorting helper
preserves equal-value/signed-zero ordering and does not invoke arbitrary scalar
conversion hooks. Calls still copy host buffers into and out of Wasm; no retained
Wasm-memory view, zero-copy execution or warm-query speedup is claimed.

## Evidence

- The four statistics source kernels compile as one isolated floating pack with
  deliberately nonexistent exact-library prefixes and no ownership adapters.
- The real pack and digest-authenticated loader pass Node and actual Chromium,
  Firefox and WebKit workers on a loopback secure context. Checks include accurate
  cancellation-heavy summation, stable signed-zero ordering, source/digest mismatch,
  missing packs, boxed floats, hook rejection and unchanged memory capacity after
  1,000 repeated calls. Capacity stability is not a full allocator-leak proof.
- Eight focused loader/pack tests pass; three existing native/JS/CPython/Node-Wasm
  boundary tests pass. The six-test production inventory suite has four passes and
  two explicit skips because its complete FLINT/GMP/MPFR/MPC test fixture is absent.
  Existing production domain manifests remain unchanged without the new option.
- Architecture and source-current optimizer-inventory checks pass.

## Remaining integration

Connect this small pack to lazy frontend preparation and source-authenticated
resolver registration before the first decorated statistics module is imported.
Add the matching independently lazy native pack, public browser execution,
artifact-bound public provenance, npm/SEA and four-platform qualification,
destructive/soak tests and whole-query/startup/memory/payload measurements.
Do not use the current arithmetic-core browser witnesses as public API receipts.
No product release, installer, default, eager payload ceiling or performance
threshold changes here.
