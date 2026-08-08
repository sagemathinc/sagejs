# Sage.js mission

## Mission statement

> Sage.js is an open, research-grade mathematical computing system native to
> Node.js. Its goal is to be a viable free alternative to Magma, Mathematica,
> and Maple by adopting SageMath's mature semantics, integrating the best open
> native mathematics libraries, and compiling performance-critical
> mathematical code to native speed.

## North star

> A researcher should be able to take serious Sage code, run it with Sage.js,
> obtain the same mathematical objects and answers, and achieve performance
> competitive with the best computer algebra systems—while benefiting from
> instant startup, npm distribution, and seamless access to the JavaScript
> ecosystem.

In one line:

> **Sage semantics. Native mathematics. The JavaScript ecosystem.**

## Guiding principles

### 1. Sage is the executable specification

Match Sage's syntax, parents, coercions, representations, exceptions,
defaults, and edge cases unless there is a compelling and documented reason
not to. Do not invent new mathematical semantics where Sage has already spent
decades resolving the subtle choices.

Running substantial upstream Sage test suites unchanged is the clearest
compatibility metric.

### 2. Integrate; do not reimplement

Use FLINT, PARI, Singular, Arb, MPFR, MPC, and other state-of-the-art open
mathematics libraries. Sage.js provides the language, parent and element
model, coercion system, packaging, high-level algorithms, and coherent user
experience.

The goal is not to rewrite proven mathematical kernels in JavaScript.

### 3. Use two execution tiers

Ordinary interactive and glue code should compile instantly to JavaScript and
benefit from V8, Node, and the npm ecosystem.

Stable, frequently executed library code should be able to opt into typed
ahead-of-time native compilation, analogous to the role Cython plays in Sage.
The same Sage.js frontend can target JavaScript for flexibility or native code
for sustained performance.

### 4. Cross native boundaries at the level of algorithms

Native scalar elements are essential, but a performance-critical loop should
not cross Node-API and allocate a JavaScript wrapper for every arithmetic
operation. Batch operations, compile whole loops, and move complete algorithms
across the boundary.

Native Kernel v3 demonstrates that compiling a complete `ComplexField` loop
can remove the small-operation gap with Sage/Cython. Its shared native element
ABI also lets generated addons return the ordinary Sage.js `ComplexNumber`
representation without serialization or copying through an intermediate
result format.

For exact arithmetic, v3 also compiles multi-function GMP modules. Its private
C entry points allow algorithms such as `lcm` to call `gcd` without an
intermediate JavaScript or Python boundary, while ordinary imports retain an
exact `BigInt` or interpreted fallback.

### 5. Be server-native first

Optimize initially for serious research computations on servers and
workstations. Native C, C++, and Rust libraries are first-class implementation
tools.

WASM and browser support can become additional backends later. They should not
constrain the primary architecture or prevent use of the best available native
libraries.

### 6. Treat performance as part of correctness

For research mathematics, an implementation which returns the right answer
but is dramatically slower than established systems is unfinished.

Major mathematical components should have representative benchmarks against
Sage and, when relevant, other state-of-the-art systems. Performance work
should measure complete research operations as well as language and native
boundary costs.

### 7. Deliver valuable vertical slices

Build coherent research capabilities—such as integer factorization,
polynomial arithmetic, number fields, elliptic curves, or modular forms—rather
than accumulating disconnected primitives.

Each slice should include its mathematical parents and elements, coercions,
native implementation, language integration, Sage compatibility tests,
documentation, and benchmarks.

## Explicit non-goals

Sage.js does not initially need to be:

- a complete CPython implementation;
- compatible with arbitrary Python extension modules;
- a browser-first computer algebra system;
- a pure-JavaScript rewrite of FLINT, PARI, or other native libraries;
- a new set of mathematical semantics;
- a clone of Mathematica's symbolic evaluator;
- a collection of impressive but disconnected demonstrations.

Python compatibility is valuable where it serves Sage source compatibility,
but reproducing all of CPython is not the mission. Likewise, browser and WASM
support are valuable deployment options, not the definition of the system.

## Architectural direction

The intended system has four cooperating layers:

1. **Language frontend** — a real parser and compiler for Sage-compatible
   source, not a textual preparser.
2. **Mathematical runtime** — parents, elements, canonical coercions,
   representations, exceptions, and high-level algorithms following Sage.
3. **Native library layer** — stable bindings to the best open mathematical
   libraries, with opaque native storage where appropriate.
4. **Typed native compiler** — an opt-in path which lowers hot Sage.js library
   functions through a typed intermediate representation to C, C++, or Rust,
   avoiding scalar crossings of the JavaScript/native boundary.

JavaScript remains the interactive runtime and integration language. Native
compilation complements it; it does not replace it.

See [`IMPLEMENTATION.md`](IMPLEMENTATION.md) for the implementation-language
strategy and the MPFR/Cython/Julia measurements which motivate it.

## Decision test

Every significant piece of work should advance at least one of these:

- more unchanged Sage code runs correctly;
- an important research computation becomes possible;
- performance becomes competitive;
- installation, startup, or distribution becomes dramatically easier.

Work which advances none of these is probably a distraction.

When choosing between two implementations, prefer the one which:

- makes Sage compatibility testable;
- reuses a state-of-the-art mathematical library;
- keeps the common interactive path simple and fast;
- admits efficient native compilation for hot code;
- produces a coherent user-facing capability rather than an isolated API.

## Success criteria

The long-term product test is:

> `sagejs program.sage` increasingly means the same mathematics as Sage,
> startup like Node, integration like npm, and hot loops like Cython.

Concrete evidence of progress includes:

- unchanged upstream Sage tests passing;
- important Sage examples and research programs running unchanged;
- startup and lightweight computations remaining substantially faster and
  smaller than a full CPython/Sage environment;
- native kernels and compiled library loops performing competitively with
  Sage, Magma, Mathematica, Maple, and OSCAR where comparisons are meaningful;
- straightforward installation and redistribution through the Node
  ecosystem;
- researchers choosing Sage.js for real computations, not merely demos.
