# Approximation integration record

> Historical handoff, resolved during P2 integration.

The approximation lane originally left shared registry, package-ownership,
strict-source, test-discovery, diagnostic, and parent-package decisions to the
integration lane. Those decisions have now been made:

- the five implemented approximation operations are in the live capability
  registry and generated numerical surface;
- `src/lib/sagejs/numerics/approximation/` has an explicit lazy package-graph
  owner;
- all approximation modules are in the strict Pyright inventory;
- the approximation laboratory is discovered by `pnpm test:numerics`; and
- `maximum_elapsed_time` is a stable shared diagnostic.

The integration deliberately did not flatten every domain name into
`sagejs.numerics`. The canonical public imports remain under
`sagejs.numerics.approximation`, which preserves lazy loading and avoids generic
name collisions. Approximation presentation stays on `ApproximationResult` and
returns renderer-neutral `PlotSpec` and `PlotAnimation` records; common result
objects do not need domain-specific dispatch.

Domain construction and validation details such as duplicate abscissas,
periodic-boundary consistency, unrepresentable finite-difference steps, and
conditioning indicators remain typed domain errors or retained payload
evidence. They map to the stable common result and diagnostic vocabulary where
appropriate instead of requiring a central code for every domain detail.

There is no active shared integration request in this file. Future changes to
the public surface must update the live registry, support matrix, executable
corpus, strict inventory, and generated surface together.
