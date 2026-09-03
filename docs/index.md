---
title: "Sage.js documentation"
---

# Sage.js documentation

Sage.js is an open-source, lightweight, high-performance runtime for research
mathematics, native to JavaScript and designed for both humans and agents.

Start with:

- [Documentation strategy](../DOCUMENTATION.md)
- [DocSpec v1](../DOCSPEC.md)
- [Generated API reference](reference/api.md)
- [Mission](../MISSION.md)
- [Implementation](../IMPLEMENTATION.md)
- [Embedding](../EMBEDDING.md)
- [Jupyter](../JUPYTER.md)
- [Measuring execution](timing.md)
- [Optimizing mathematics compiler laboratory](optimizing-mathematics-compiler-lab.md)
- [The Sage.js optimizer in the compiler landscape](optimizing-compiler-landscape.md)
- [Optimization opportunity dashboard](optimizer-opportunities.md)
- [Polyglot execution](../POLYGLOT.md)
- [Python standard library compatibility](python-standard-library.md)
- [Certified real and complex interval arithmetic](interval-arithmetic.md)
- [Portable modern Gröbner bases](groebner-bases.md)
- [Certified number-field maximal orders](number-field-maximal-orders.md)
- [General number-field class and unit groups](number-field-class-unit-groups.md)
- [Plotting](../PLOTTING.md)
- [Hyperelliptic curves and local Frobenius data](hyperelliptic-curves.md)
- [Hyperelliptic conductors, root numbers, and L-series](hyperelliptic-lseries.md)
- [BSD arithmetic for genus-2 and genus-3 Jacobians](hyperelliptic-bsd-arithmetic.md)
- [Jacobian arithmetic for genus-2 and genus-3 hyperelliptic curves](hyperelliptic-jacobian-arithmetic.md)
- [Split even-degree hyperelliptic Jacobians](hyperelliptic-even-degree-jacobians.md)
- [Exploring elliptic-curve L-series](elliptic-curve-lseries.md)
- [Exact modular-form q-expansion bases](modular-form-q-expansions.md)
- [A guided tour from modular-form spaces to L-series input](modular-forms-tour.md)
- [Half-integral-weight modular forms](half-integral-modular-forms.md)
- [Brandt modules over the rational numbers](brandt-modules.md)
- [Mestre's method of graphs and sparse modular forms](mestre-method-of-graphs.md)
- [WebAssembly browser support and capabilities](webassembly-browser-support.md)
- [Portable Node and browser examples](webassembly-examples.md)
- [Contributing portable WebAssembly mathematics](webassembly-contributor-guide.md)
- [Packed ABI and Wasm32 rules](webassembly-packed-abi.md)
- [Reproducible WebAssembly builds](webassembly-reproducible-builds.md)
- [WebAssembly production parity release notes](webassembly-production-release-notes.md)

The Markdown sources are intentionally ordinary files: they render on GitHub
and documentation sites, can be indexed by search engines, and are directly
searchable by humans and agents:

```bash
rg -i 'finite field|eisenstein|groebner' "$(sagejs docs path)"
```

For the installed runtime rather than the checked-in prose, use:

```bash
sagejs docs search finite field
sagejs docs show GF
sagejs docs export --jsonl
```
