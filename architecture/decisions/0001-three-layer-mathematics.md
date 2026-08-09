# ADR 0001: Three-layer mathematical implementation architecture

- Status: accepted
- Date: 2026-08-09

## Context

Sage.js must combine interactive Sage/Python compatibility, maintainable
research algorithms, and performance competitive with mature systems.  Early
development demonstrated two viable acceleration paths: handwritten native
code over FLINT/GMP, and ahead-of-time compilation of typed but otherwise
ordinary Python bodies.  Uncoordinated performance work risks duplicating the
mathematical system in large opaque C adapters, while refusing native code
would discard decades of work in mature libraries.

The Native Kernel experiments established that source-transparent Python can
compile close to handwritten C for exact integer, prime-field, elliptic-curve,
packed-buffer, n-body, and dense matrix workloads.  The dynamic runtime remains
essential for compatibility and for code outside the compiled subset.

## Decision

Sage.js uses three cooperating execution layers:

1. ordinary CPython-parseable Python executed by the JavaScript runtime;
2. explicit source-transparent AOT compilation of selected typed bodies;
3. mature native/Wasm mathematical libraries behind host-neutral packed ABIs.

Handwritten Sage.js C/C++ is limited to adapters, low-level representation
primitives, and documented measured compiler limitations.  Every compiled body
retains a correct dynamic fallback.  Compiler output is inspectable and source
mapped.  Native and WebAssembly are targets of the same typed IR rather than
separate mathematical implementations.

## Consequences

- Mathematical source remains readable and executable without a native
  toolchain.
- Compiler development is part of the computer-algebra architecture rather
  than a generic Python-optimization project.
- External libraries remain central where they provide sophisticated or
  exceptionally optimized algorithms.
- Some existing native code requires classification and measured remediation.
- The repository carries policy manifests, differential witnesses, and CI
  checks.  New native code has a small documentation cost by design.

## Rejected alternatives

- **Implement most mathematics directly in C.**  Fast, but duplicates dynamic
  semantics and makes research algorithms harder to inspect and evolve.
- **Use only dynamic JavaScript/Python.**  Portable, but cannot meet the target
  performance for many exact and packed numerical kernels.
- **Treat every operation as a secret compiler intrinsic.**  Produces isolated
  benchmark wins without demonstrating that the source language is compilable.
- **Reimplement mature libraries.**  Wastes proven FLINT/Arb/GMP/PARI work and
  usually worsens correctness or asymptotic performance.
