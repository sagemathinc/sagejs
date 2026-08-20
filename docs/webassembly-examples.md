---
title: "Portable Node and browser examples"
---

# Portable Node and browser examples

These are public Sage programs, not private Wasm calls. Each fenced block is
executed by the documentation test in Node and is byte-for-byte tied to the
named case in
[`test/browser-wasm-parity-corpus.json`](../test/browser-wasm-parity-corpus.json).
The routine/release browser jobs evaluate that same source through the worker
runtime.

Run the focused source-consistency check with:

```sh
node --test test/webassembly-docs.cjs
```

Run all `sage test` documentation fences in the native Node runtime with:

```sh
pnpm docs:examples
```

The first command is fast and does not build a Wasm toolchain. The second
builds Sage.js and executes the marked documentation examples.

## Exact arithmetic and serialization

Large integers are exact and factorization has the same public representation
on both hosts:

```sage test browser-parity=exact-big-integer
print(2^80 + 17)
print(factor(2026))
```

## Capability discovery

The public capability report can be filtered by mathematical family or queried
by exact workflow name. Returned records are detached and deeply immutable:

```sage test browser-parity=capability-report-api
caps = sagejs_capabilities()
nf_caps = sagejs_capabilities('number-fields')
workflow = sagejs_capabilities(workflow='exact-integer-factorization')
print(len(caps) >= 900, len(nf_caps) > 0, workflow.available)
try:
    caps[0] = None
except TypeError:
    print('immutable')
```

## Exact serialization

SagePack is the data-only interchange format used for Node/browser and saved
application data:

```sage test browser-parity=sagepack-exact-roundtrip
from sagejs_serialization import dumps, loads
A = matrix(QQ, [[1/2,2/3],[3/4,4/5]])
data = dumps(A)
print(data[:8] == b'SAGEPK1\x00', loads(data) == A, dumps(loads(data)) == data)
```

## Algebraic numbers

The real and complex algebraic fields use the same certified resource core in
Node and WebAssembly. Roots retain exact defining data even though `AA` uses a
compact decimal interval for display:

```sage test browser-parity=exact-algebraic-roots
R.<x> = QQ[]
print((x^2 - 2).roots(AA))
print((x^2 + 1).roots(QQbar))
a = AA(2).sqrt()
print(a.minpoly(), a > 1, a < 2)
```

## Modular symbols

The public modular-symbols implementation has a reviewed portable fallback,
including construction, cuspidal subspaces, and Hecke operators:

```sage test browser-parity=modular-symbols-weight-two
M = ModularSymbols(37, 2)
print(M)
print(M.dimension())
C = M.cuspidal_subspace()
print(C.dimension())
print(M.hecke_matrix(2).trace())
```

## A quadratic number field

This one workflow exercises signature, a certified maximal order, prime-ideal
factorization, and Dedekind-zeta coefficients. Public ideals and coefficient
lists are materialized above the packed core identically on each host.

```sage test browser-parity=number-field-maximal-order-prime-zeta
R.<x> = QQ[]
K.<a> = NumberField(x^2 - 5)
O = K.maximal_order()
D = O.factor_rational_prime(11)
print(K.signature())
print([(P.rational_prime(),e,P.residue_class_degree(),P.norm()) for P,e in D])
print(K.zeta_function().coefficients(16))
```

The headline cubic workflow is also bounded and deterministic: it proves the
maximal order, factors a ramified prime, and computes the first 24 Dedekind-zeta
coefficients. Larger coefficient bounds belong in the performance suite rather
than the routine browser gate.

```sage test browser-parity=number-field-cubic-headline
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 - x - 1)
O = K.maximal_order()
D = O.factor_rational_prime(23)
print(K.signature())
print([(P.rational_prime(),e,P.residue_class_degree(),P.norm()) for P,e in D])
print(K.zeta_function().coefficients(24))
```

## Batched analytic values

The batch retains arbitrary-precision Arb/Acb computation and only converts to
floating point here so the example has compact stable output.

```sage test browser-parity=riemann-zeta-batch
R = RiemannZeta(80)
for z in R.values([2,3]):
    print(float(z.real()), float(z.imag()))
```

The quadratic Dedekind zeta path composes the same Riemann and Dirichlet batch
cores:

```sage test browser-parity=quadratic-dedekind-zeta-batch
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^2 - 5)
Z = K.zeta_function(prec=80)
for z in Z.values([2,3]):
    print(float(z.real()), float(z.imag()))
```

## Elliptic-curve L-series plot

`complex_plot` samples through bounded packed tiles. Increasing
`plot_points` does not expose the internal 10,000-point call limit; the public
plot can contain many tiles.

```sage test browser-parity=elliptic-lseries-complex-plot
E = EllipticCurve([0,0,1,-1,0])
L = E.lseries()
complex_plot(L,(0,2),(-1,1),plot_points=12,interpolation='nearest')
```

The result is a normal Sage.js `Graphics` object. In the browser its structured
Plotly display crosses the worker boundary; no worker-owned mathematical object
is exposed to the page.

## Adding an example

Add the public program and its exact capability IDs to the parity corpus first.
Then copy its `source` exactly into a fence whose info string is:

```text
sage test browser-parity=the-case-id
```

Use deterministic output. Exact results should have canonical strings or
digests; numerical results should declare precision-aware tolerances; plots
should compare sampled values and stable display metadata rather than pixels.
