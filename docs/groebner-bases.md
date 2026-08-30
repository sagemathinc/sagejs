---
title: "Gröbner bases"
---

# Gröbner bases

Sage.js has a portable modern Gröbner-basis backend for polynomial ideals over
prime fields and an experimental modular backend over the rationals. The same
scalar msolve core is used on Linux, macOS, native Windows, Node WebAssembly,
and in browsers.

## Quick start

The supported fast path uses global degree-reverse-lexicographic order:

```py
R.<x,y> = PolynomialRing(GF(65537), 2, order="degrevlex")
I = R.ideal([x*y - 1, x^3 + 7*y^2])

I.groebner_basis()
I.normal_form(x*y - 1)
I.leading_ideal()
(x^4*y + 7*x*y^3) in I
I.groebner_basis_metadata()
```

The metadata makes dispatch and proof status explicit. For example, a finite
field call reports `msolve:f4-prime-field-v1`, its characteristic and order,
and that the scalar computation is deterministic.

Over `QQ`, the default remains FLINT's bounded exact Buchberger
implementation. The much faster modular msolve path is available explicitly:

```py
R.<x,y> = PolynomialRing(QQ, 2, order="degrevlex")
I = R.ideal([x*y - 1, x^3 + 7*y^2])
G = I.groebner_basis(algorithm="msolve", proof=False)
I.groebner_basis_metadata()
```

The modular rational stopping test is probabilistic. Sage.js therefore does
not silently use it as the rational default and rejects `proof=True` until the
backend exports enough transformation provenance for a complete ideal-equality
certificate.

## Current capability contract

| Domain | Order | Default backend | Contract |
| --- | --- | --- | --- |
| Prime `GF(p)`, `p < 2^31` | global `degrevlex` | msolve scalar F4 | deterministic, reduced basis; currently `proof=False` |
| `QQ` | any FLINT-supported global order | FLINT | bounded exact Buchberger |
| `QQ` | global `degrevlex` | explicit `algorithm="msolve"` | modular, probabilistic, `proof=False` |

The msolve paths return full reduced bases and support exact normal forms,
leading ideals, and ideal membership. Unsupported coefficient domains, term
orders, characteristics, and proof requests fail explicitly instead of being
silently relabeled or sent to an inapplicable algorithm.

The current port does not yet provide FGLM/order conversion, elimination
orders, finite extension fields, modules, syzygies, resolutions, local
standard bases, or Singular's wider commutative-algebra operations.

## Portability and safety

The integration vendors a hash-verified source slice from msolve 0.10.1 at
commit `1e3af01f3864f6c848814b02a450f384c108adea`. A narrow status-returning
adapter owns all input and output memory, contains upstream process exits, and
serializes the remaining upstream global state. The production WebAssembly
adapter uses a versioned bounded packet rather than exposing internal msolve
indices or pointers.

Inputs are rejected before entering msolve if they exceed the reviewed native
envelope: 4,096 variables, 262,144 generators, 1,048,576 input terms, or
16,777,216 exponent entries. The WebAssembly crossing additionally limits an
input packet to 1 MiB and an output packet to 16 MiB. These are safety bounds,
not promises that every computation inside them will be fast or fit a browser's
memory budget.

The versioned oracle corpus is
[`test/fixtures/groebner-basis-oracles-v1.json`](../test/fixtures/groebner-basis-oracles-v1.json).
Its ordinary-Python verifier checks both ideal containments through a change
matrix, Buchberger's criterion, reducedness, monicity, leading ideals, and
normal forms. Run the focused checks and benchmark with:

```sh
node --test test/groebner-contract.cjs packages/flint/test/msolve-groebner.cjs
node bench/groebner/benchmark.cjs
```

The design and candidate research are recorded in
[`agents/groebner-basis-strategy.md`](../agents/groebner-basis-strategy.md).
