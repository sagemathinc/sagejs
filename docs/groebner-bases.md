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

```sage test
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

Every supported global order also has a storage-neutral exact reference
backend. It is useful as a portable fallback, a differential oracle, and for
small computations outside msolve's current envelope:

```sage test
L.<x,y> = PolynomialRing(QQ, 2, order="lex")
J = L.ideal([x^2 - y, x*y - 1])
J.groebner_basis(algorithm="buchberger")
# [x - y^2, y^3 - 1]
```

The implementation returns a reduced basis and verifies its exact change-of-
basis certificate before exposing the result. It supports `QQ` and prime
fields with `lex`, `deglex`, and `degrevlex` order on native and Wasm builds.

## Ideals and finite quotient rings

Polynomial sequences can be turned back into ideals, and ideals support exact
containment, equality, sum, product, dimension, degree, and unit/zero tests:

```sage test
R.<x,y> = PolynomialRing(QQ, 2, order="degrevlex")
I = R.ideal([x^2 - y, x*y - 1])
I.dimension(), I.degree(), I.is_zero_dimensional()
# (0, 3, True)
I.groebner_basis().ideal() == I
# True
```

For a zero-dimensional quotient, the standard monomials provide an explicit
vector-space API:

```sage test
I.quotient_basis()
# [1, y, x]
I.quotient_coordinates(x + 2*y + 3)
# (3, 2, 1)
I.multiplication_matrix(x)
# [0 1 0]
# [0 0 1]
# [1 0 0]
```

`normal_basis()` is an alias-level description of the same standard-monomial
basis. A positive-dimensional quotient reports `+Infinity` from
`vector_space_dimension()` and rejects finite-basis operations explicitly.

## Elimination and changing order

`elimination_ideal()` applies the elimination theorem in a temporary exact
lexicographic ring, then maps the surviving generators back into the original
parent:

```sage test
R.<x,y,z> = PolynomialRing(QQ, 3, order="degrevlex")
I = R.ideal([x - y^2, y - z^2])
I.elimination_ideal([x, y]).groebner_basis(algorithm="buchberger")
# []
I.elimination_ideal(x).groebner_basis(algorithm="buchberger")
# [z^2 - y]
```

For zero-dimensional ideals, exact FGLM converts an already computed quotient
to another order through linear dependence among normal forms:

```sage test
R.<x,y> = PolynomialRing(GF(101), 2, order="degrevlex")
I = R.ideal([x^2 - y, x*y - 1])
Glex = I.fglm()
Glex
# [x + 100*y^2, y^3 + 100]
```

`transformed_basis(other_ring=L)` accepts a compatible target ring explicitly.
The current FGLM implementation is deliberately bounded to quotient dimension
256 and verifies Buchberger's criterion on the resulting basis.

## Solving zero-dimensional systems

`variety()` builds on FGLM and returns dictionaries keyed by the original ring
generators. Over a prime field it enumerates all base-field solutions; over
`QQ` it returns all rational solutions:

```sage test
R.<x,y> = PolynomialRing(GF(5), 2, order="degrevlex")
points = R.ideal([x - y^2, y^2 - 1]).variety()
sorted((point[x], point[y]) for point in points)
# [(1, 1), (1, 4)]

S.<u,v> = PolynomialRing(QQ, 2, order="degrevlex")
S.ideal([u - v, v^2 - 2]).variety()
# []
```

The second result is empty because neither root lies in `QQ`; solving over
algebraic closures is not silently approximated. `rational_points()` is an
alias for the same base-field operation.

## Choosing a rational backend

The FLINT Gröbner-basis implementation is still available. Sage.js mirrors
Sage's global proof preferences, which require unconditional polynomial
results by default:

```sage test
proof.polynomial()
# True

R.<x,y> = PolynomialRing(QQ, 2, order="degrevlex")
I = R.ideal([x*y - 1, x^3 + 7*y^2])
G_exact = I.groebner_basis()
I.groebner_basis_metadata()["backend"]
# 'flint:bounded-buchberger-v1'
```

With proof disabled, `algorithm="auto"` uses the modern modular msolve path
for compatible rational inputs. A per-call `proof=` argument takes precedence
over the global preference:

```sage test
proof.polynomial(False)
G_fast = I.groebner_basis()
I.groebner_basis_metadata()

# The scope restores the previous preference even if an exception is raised.
with proof.WithProof("polynomial", True):
    G_exact = I.groebner_basis()

proof.polynomial(True)
G_fast = I.groebner_basis(algorithm="msolve", proof=False)
```

The modular rational stopping test is probabilistic. Sage.js therefore keeps
the global polynomial proof preference enabled initially and rejects msolve
when proof is required, until the backend exports enough transformation
provenance for a complete ideal-equality certificate. Explicit
`algorithm="flint"` remains available regardless of the global preference.
The exact rational FLINT Gröbner entry point is currently native-only. In a
browser, a proof-required rational `algorithm="auto"` call uses the portable,
certificate-verified Buchberger implementation. Use `proof.polynomial(False)`
or an explicit `proof=False` to select the faster modular msolve path when its
probabilistic stopping test is acceptable.

FLINT can be faster on very small inputs. F4's batched sparse linear algebra
becomes important as critical pairs and intermediate polynomials grow, as the
next examples illustrate.

## When F4 matters

The classical Katsura family gives a compact, reproducible crossover example:

```sage test
def katsura(n):
    R = PolynomialRing(QQ, "x", n + 1, order="degrevlex")
    x = R.gens()
    equations = [x[0] + 2*sum(x[j] for j in range(1, n + 1)) - 1]
    for i in range(1, n + 1):
        equations.append(
            sum(
                x[abs(j)]*x[abs(i - j)]
                for j in range(-n, n + 1)
                if abs(i - j) <= n
            ) - x[i]
        )
    return R.ideal(equations)

I = katsura(6)
G = I.groebner_basis(algorithm="msolve", proof=False)
len(G)
# 38
all(
    I.normal_form(f, algorithm="msolve", proof=False) == 0
    for f in I.gens()
)
# True
```

On the Linux x64 development host (AMD EPYC 7B13, Node 26.7.0), warmed scalar
medians in the benchmark below are about 0.028 seconds with msolve and 1.03
seconds with FLINT. Smaller systems can still favor FLINT: cyclic-5 takes about
0.003 seconds with msolve and 0.002 seconds with FLINT on the same host, so the
benchmark retains both small and crossover cases.

Cyclic-6 is a more dramatic example:

```sage test
def cyclic(n):
    R = PolynomialRing(QQ, "x", n, order="degrevlex")
    x = R.gens()
    equations = [
        sum(prod(x[(i + j) % n] for j in range(d)) for i in range(n))
        for d in range(1, n)
    ]
    equations.append(prod(x) - 1)
    return R.ideal(equations)

I = cyclic(6)
G = I.groebner_basis(algorithm="msolve", proof=False)
len(G)
# 45
```

The same host computed this msolve basis in 0.033 seconds from a fresh process
and about 0.014 seconds warm. The explicit FLINT call did not complete within
a separate 90-second process cap. This is
the kind of system for which the msolve integration changes what is practical;
the routine benchmark deliberately does not make users wait for the FLINT
timeout.

## Finite-field consistency without enumeration

A 3-coloring of a graph can be encoded over `GF(7)`: each vertex receives a
cube root of unity, and each edge requires different roots. The complete graph
on four vertices is not 3-colorable, so its ideal is the unit ideal:

```sage test
R = PolynomialRing(GF(7), "c", 4, order="degrevlex")
c = R.gens()
edges = [(i, j) for i in range(4) for j in range(i + 1, 4)]
equations = [value^3 - 1 for value in c]
equations += [
    c[i]^2 + c[i]*c[j] + c[j]^2
    for i, j in edges
]
R.ideal(equations).groebner_basis()
# [1]
```

This computation uses deterministic prime-field F4 in native builds and the
same scalar core in the browser Wasm build.

## Exact large rational coefficients

The rational msolve adapter clears denominators, computes modulo machine-word
primes, and reconstructs exact coefficients. It does not turn a hard rational
problem into a floating-point one:

```sage test
a = QQ(2^127 + 12345, 2^89 - 1)
b = QQ(2^119 + 54321, 2^83 - 9)
R.<x,y> = PolynomialRing(QQ, 2, order="degrevlex")
I = R.ideal([x*y - a, x^3 + b*y^2])
G = I.groebner_basis(algorithm="msolve", proof=False)
len(G)
# 3
all(
    I.normal_form(f, algorithm="msolve", proof=False) == 0
    for f in I.gens()
)
# True
```

The final normal forms are exact FLINT reductions. They are a useful
cross-check, but they do not replace the missing msolve transformation
provenance described above.

## Reduction can change in special characteristic

Specializing a rational system modulo a prime can change its geometry. Here
the rational ideal is proper, while the characteristic-two specialization is
the unit ideal because the `2*y` term vanishes:

```sage test
Q.<x,y> = PolynomialRing(QQ, 2, order="degrevlex")
Q.ideal([x^2 + 2*y, x*y + 1]).groebner_basis(
    algorithm="msolve", proof=False
)
# [y^2 - 1/2*x, x*y + 1, x^2 + 2*y]

F.<a,b> = PolynomialRing(GF(2), 2, order="degrevlex")
F.ideal([a^2 + 2*b, a*b + 1]).groebner_basis()
# [1]
```

## Current capability contract

| Domain | Order | Default backend | Contract |
| --- | --- | --- | --- |
| Prime `GF(p)`, `p < 2^31` | global `degrevlex` | msolve scalar F4 | deterministic and unconditional |
| Prime `GF(p)` | `lex`, `deglex`, or `degrevlex` outside the msolve envelope | exact Buchberger | deterministic with verified transformation certificate |
| `QQ`, proof required | any FLINT-supported global order | FLINT | bounded exact Buchberger |
| `QQ`, proof disabled | global `degrevlex` | msolve modular F4 | probabilistic stopping test |
| `QQ`, proof disabled | another supported global order | FLINT | exact fallback |
| `QQ` with `algorithm="buchberger"` | `lex`, `deglex`, or `degrevlex` | exact portable Buchberger | deterministic with verified transformation certificate |

The msolve paths return full reduced bases and support exact normal forms,
leading ideals, and ideal membership. Unsupported coefficient domains, term
orders, characteristics, and proof requests fail explicitly instead of being
silently relabeled or sent to an inapplicable algorithm.

The current port does not yet provide finite extension fields, algebraic-
closure solving, modules, syzygies, resolutions, local standard bases, or
Singular's wider commutative-algebra operations.

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

The reviewed msolve slice raises the complete production FLINT Wasm artifact
to 6,744,875 bytes uncompressed and 2,554,576 bytes with `gzip -9`. The raw
payload guard is intentionally 6,800,000 bytes so future growth remains
visible; the production topology's independent compressed-payload budgets
continue to apply as well.

The versioned oracle corpus is
[`test/fixtures/groebner-basis-oracles-v1.json`](../test/fixtures/groebner-basis-oracles-v1.json).
Its ordinary-Python verifier checks both ideal containments through a change
matrix, Buchberger's criterion, reducedness, monicity, leading ideals, and
normal forms. The corpus records results from the pinned msolve port,
Groebner.jl, FLINT, Singular, and a separately built MathicGB F4New oracle;
the latter two raw commands, revisions, and outputs are retained in the
fixture. It also names every required edge class, including unlucky-prime
rational reconstruction and the separate term/exponent resource envelopes,
so deleting one silently fails the structural test. Run the focused checks
and benchmark with:

```sh
node --test test/groebner-contract.cjs packages/flint/test/msolve-groebner.cjs
node bench/groebner/benchmark.cjs
```

The design and candidate research are recorded in
[`agents/groebner-basis-strategy.md`](../agents/groebner-basis-strategy.md).
