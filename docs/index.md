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
- [Polyglot execution](../POLYGLOT.md)
- [Python standard library compatibility](python-standard-library.md)
- [Plotting](../PLOTTING.md)
- [Hyperelliptic curves and local Frobenius data](hyperelliptic-curves.md)

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
