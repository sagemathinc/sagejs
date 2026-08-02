# Sage.js package architecture

Sage.js has two related dependency graphs:

1. npm workspace packages for independently built native, WASM, and
   application artifacts;
2. logical mathematical packages inside the current source tree.

Both are declared in [`architecture/package-graph.json`](architecture/package-graph.json)
and checked by:

```sh
pnpm architecture:check
```

The check is part of `pnpm test` and the fast unit tier. It rejects:

- unknown dependencies and dependency cycles;
- dependencies which point upward or sideways through the layer graph;
- Python source files with no owner or multiple owners;
- imports across undeclared logical package boundaries;
- undeclared dependencies between pnpm workspace packages;
- invalid startup budgets; and
- source growth beyond a package's declared budget.

Adding a Python library file therefore requires an explicit package decision,
not merely placing it somewhere importable.

## Logical layers

```text
core-runtime
├── arithmetic
│   ├── linear-algebra
│   ├── symbolics
│   ├── elliptic-curves
│   └── modular-forms
├── python-stdlib (lazy)
│   └── numeric-compat (lazy)
└── graphics
    └── polyglot (lazy)
```

The manifest is the authoritative graph; this sketch intentionally omits some
cross-layer edges. Each package declares exact files, directory prefixes,
module names, dependencies, startup policy, and source-byte ceiling.

## Startup policy

New domains default to lazy loading. Adding a package must not make an empty
CLI process slower unless the package is explicitly imported. A bootstrap
exception requires all of the following:

- an architectural reason that the type must exist in every evaluator;
- an explicit `startup: "bootstrap"` declaration;
- room in that package's checked source budget; and
- the measured aggregate startup test remaining within its budget.

The current mathematical baselib predates this boundary and is still compiled
as one bootstrap image. The graph records that reality honestly and places a
ceiling around each component. New library domains should live on the lazy
side, and existing domains can migrate out of the bootstrap incrementally
without changing their public semantics.

`architecture/package-graph.json` is also the source of truth for runtime
budgets. `pnpm test:startup` alternates fresh Sage.js and bare-Node processes,
uses the median to normalize host load, and currently requires:

- at most 300 ms normalized median startup plus `2^100` evaluation;
- at most 1.5 seconds raw median even on an overloaded host; and
- eleven fresh-process samples by default.

SEA and development CLI budgets are separate manifest entries so they can
evolve independently without hidden constants in test code.

## Boundaries and codecs

Packages own their public mathematical types, benchmarks, and serialization
codecs. Shared registries expose small registration APIs; domain packages must
not modify central switch statements whenever a new object type appears.

The core runtime may depend on no mathematical domain. Arithmetic may depend
only on the core. Higher domains depend downward through declared interfaces.
Applications may compose domains, but importing an application must not turn
an optional native or browser backend into an unconditional dependency.

Native Windows x64 remains mandatory. A new native package must pass Windows
CI or declare and test a correct capability fallback as required by
[`AGENTS.md`](AGENTS.md).

## Changing the graph

A graph change is an integration decision. Update the manifest and relevant
documentation in a focused change, then run:

```sh
pnpm architecture:check
pnpm test:startup
pnpm test:changed
```

Moving files without changing behavior should be separate from changing their
public API. This keeps parallel mathematical projects from fighting over the
dependency structure during routine implementation.
