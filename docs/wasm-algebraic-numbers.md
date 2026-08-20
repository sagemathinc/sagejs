# Exact algebraic numbers in WebAssembly

Sage.js can use FLINT's `qqbar` implementation in a browser without emulating
Node-API.  The shared core in `packages/flint/src/algebraic_core.c` contains the
mathematical and resource policy.  The adapter in
`packages/flint-wasm/src/algebraic.c` exposes only fixed-width integers,
offsets, lengths, status codes, and byte buffers.  The same core is suitable for
native differential tests and Wasm32 builds.

The first production slice supports the operations needed by `AA`, `QQbar`,
exact roots of rational polynomials, and the algebraic part of number-field
embeddings:

- exact rational values, `I`, and bounded-order roots of unity;
- addition, subtraction, multiplication, division, negation, conjugation,
  real and imaginary parts, absolute value, square roots, integer powers, and
  rational powers;
- exact equality and ordering of real algebraic values;
- exact minimal polynomials, real/rational predicates, and algebraic degrees;
- all distinct roots of a `ZZ` or `QQ` polynomial, in deterministic
  real/imaginary lexicographic order, with exact multiplicities;
- certified complex enclosures at a requested precision; and
- deterministic exact serialization and reconstruction.

After the production integration links the two C sources and composes
`createAlgebraicBackend(instance)` into the FLINT backend, ordinary public code
uses this automatically:

```python
R.<x> = QQ[]
print((x^2 - 2).roots(AA))
print((x^2 + 1).roots(QQbar))

K.<a> = NumberField(x^3 - x - 1)
print(K.signature())
print(K.embeddings(QQbar))
```

The expected root multiplicities are exact.  Decimal displays are
approximations; comparison, arithmetic, root identity, and the returned
enclosures are not.

The low-level JavaScript backend also makes the certification boundary
explicit:

```javascript
const two = algebraic.qqbarFromRational(2n, 1n);
const root = algebraic.qqbarPowRational(two, 1n, 2n);

algebraic.qqbarMinpolyCoefficients(root); // [-2n, 0n, 1n]
algebraic.qqbarEnclosure(root, 100);       // exact dyadic interval endpoints
algebraic.qqbarClose(root);
algebraic.qqbarClose(two);
```

## Portable representation

No FLINT limb, pointer, `long`, or JavaScript object crosses the ABI.  An
arbitrary integer is encoded canonically as a 32-bit sign, a 32-bit byte count,
and a little-endian magnitude.  A packed integer vector starts with a 32-bit
element count.  Negative zero, redundant high zero bytes, truncation, and
trailing bytes are rejected.

An exact algebraic serialization contains a versioned header, the primitive
integer minimal polynomial, and the value's index in the canonical sorted list
of its roots.  It therefore contains no process-local handle and survives
module re-instantiation.  This format is intentionally versioned and is not yet
a declared stable external SagePack format.

Certified enclosures return six exact integers.  Each real or imaginary
interval is `(lower * 2^exponent, upper * 2^exponent)`.  The separate
`qqbarApprox` helper retains interval midpoints as exact dyadics for
precision-aware display and converts to binary64 only when a caller explicitly
requests a machine double.  Exact decisions continue to use `qqbar`.

## Ownership and limits

Values use generation-tagged 32-bit handles.  Closing a value invalidates the
handle, stale generations are rejected, and every failed operation is atomic.
The JavaScript owner provides deterministic `qqbarClose` and a
`FinalizationRegistry` safety net.  It recreates every typed-array view after a
Wasm call, so WebAssembly memory growth cannot leave a detached view in use.

The reviewed browser limits are machine-readable through
`algebraicResourceLimits`:

| Limit | Value |
| --- | ---: |
| Simultaneously live algebraic values | 4095 |
| Input polynomial degree | 256 |
| Packed transfer buffer | 1 MiB |
| Root-of-unity order | `2^32 - 1` |
| Requested display/enclosure precision | 1,000,000 bits/digits |

Exceeding a limit raises a `RangeError`; it never silently changes algorithms
or precision.

## Production integration and capability evidence

The integration lane must do all of the following as one closure:

1. compile `packages/flint/src/algebraic_core.c` and
   `packages/flint-wasm/src/algebraic.c` into a receipt-bound production FLINT
   Wasm module (measure whether a lazy `flint-algebraic.wasm` has a better
   payload/startup tradeoff than the main artifact);
2. export every `sagejs_wasm_algebraic_*` symbol listed by the adapter and merge
   `createAlgebraicBackend(instance)` into the public backend;
3. include `algebraic.mjs` in package and application releases;
4. run `algebraic-resource.test.mjs` against the real artifact and
   `algebraic-browser-smoke.mjs` in real Chromium; and
5. mark the existing `napi:@sagemath/sagejs-flint:qqbar*` and
   `napi:@sagemath/sagejs-flint:polyExactRoots` capabilities available only
   when the production build receipt contains the algebraic artifact closure.

The capability report should also add the reviewed aggregate capability
`algebraic:qqbar-resource-core`, with `shared-core` disposition and the exact
Node backend as its differential oracle.  Until the artifact receipt proves
that closure, public discovery must continue to report fallback status.

This slice concerns algebraic-number extensions and polynomials over `QQ`.
FLINT `fq` resources for polynomials over finite-field extensions are a
separate generated-FFI closure.  They should reuse the same ownership,
generation, canonical-byte, malformed-input, and memory-growth rules, but they
must not be reported as provided by the `qqbar` artifact.
