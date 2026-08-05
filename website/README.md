# Sage.js implementation dashboard

This directory is the static source for <https://sagemathinc.github.io/sagejs/>.
It intentionally has no build step or third-party browser dependencies.

`capabilities.json` is the project's machine-readable implementation map. Each
entry must distinguish:

- `state`: how much of the capability exists (`available`, `partial`, or
  `planned`);
- `quality`: how strongly it is supported (`certified`, `tested`, `prototype`,
  or `planned`);
- `coverage`: how broad the implemented surface is, independently of quality;
- `evidence`: the concrete basis for the quality claim;
- `target` and `priority`: what remains and when it matters.

## Coverage scores

A numeric score is published only when its meaning is explicit. A measured
score records its numerator, denominator, unit, reference version, method, and
audit date. An expert estimate uses `kind: "estimated"`, is rendered with a
leading `~`, and states why a mechanical denominator is not yet available.
Capabilities without either must display `Score audit pending`; absence is not
silently converted into a zero or an optimistic estimate.

The first reproducible audit is
[`coverage/python-stdlib.json`](coverage/python-stdlib.json). It measures
top-level module breadth against CPython 3.14. The integration test
`test/coverage-python-stdlib.cjs` imports every reference name and verifies the
published numerator. This deliberately does not claim that every API inside an
importable module exists. Future audits should follow the same pattern and use
the narrowest defensible unit: public symbols, documented constructors,
algorithm cases, or a named workflow corpus.

[`coverage/graphics-3d.json`](coverage/graphics-3d.json) applies the same rule
to SageMath 10.10.beta7's public `sage.plot.plot3d.all` exports. Its 24/24 score
means complete top-level symbol presence only. Separate facets report tested
workflows and incomplete option, algorithm, renderer, export, texture, and
lighting semantics, preventing a narrow 100% measurement from being presented
as total implementation parity.

## Competitive audit and performance corpus

`competitive-audit.json` gives every capability one explicit audit unit, a
reference-system family, benchmark-suite IDs, and a stable primary gap ID. The
gap IDs are intended to become independently claimable implementation or audit
lanes. Keeping them in data makes priority searches and generated work queues
possible without scraping prose. Every planned benchmark suite also generates
an independent `benchmark-*` performance lane, so scope measurement and timing
infrastructure can proceed in parallel.

`benchmarks.json` inventories both existing benchmark programs and planned
research workload families. Existing entries must point at a checked-in runner;
planned entries must state their capability, comparison systems, and input
axes without pretending timing data exists. Competitive results must preserve
proof and semantic modes. For example, probable class-number computation and a
certified class-group computation must never be presented as equivalent merely
because both print the same integer.

`performance/quadratic-class-groups-pilot.json` is the first illustrative
same-host result. It demonstrates the result shape and semantic labels, but is
explicitly not a release baseline. Future dedicated benchmark VMs should record
their exact machine type, software revisions, proof modes, repetitions, and raw
case data. The dashboard renders this JSON as both an exact table and a compact
log-scale elapsed-time plot; it does not maintain a second hand-written copy of
the numbers.

Run the complete audit validation with:

```sh
pnpm audit:competitive
```

Run the small same-host timing pilot, without a CI performance gate, with:

```sh
pnpm bench:audit:pilot
```

List the generated work queue, optionally filtering by priority, dimension,
area, or text:

```sh
pnpm audit:gaps -- --priority=P0
pnpm audit:gaps -- --dimension=performance
pnpm audit:gaps -- --area="Algebraic number theory"
```

`examples.json` is an executable cookbook. Examples are displayed inside their
capability cards and indexed by the site-wide search. `test/dashboard-examples.cjs`
runs every cell through the same polyglot kernel used by Jupyter and checks its
exact normalized output. Non-Sage examples are copied with their required cell
magic automatically.

Run `node --test test/website.cjs` after changing the site or capability data.
After changing examples, build Sage.js and run the executable corpus as well:

```sh
pnpm build
node --test --test-concurrency=1 test/dashboard-examples.cjs
```

The GitHub Pages workflow validates the static site before deploying it, and
the full integration tier executes every notebook cell.

Serve the directory locally to exercise `fetch()`:

```sh
python3 -m http.server --directory website 8000
```
