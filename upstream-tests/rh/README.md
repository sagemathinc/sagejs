# Prime Numbers and the Riemann Hypothesis compatibility corpus

This corpus pins the public source repository for Barry Mazur and William
Stein's *Prime Numbers and the Riemann Hypothesis*. It turns the code used to
make the book, and the Sage sessions printed in the book, into an executable
Sage.js compatibility target.

The exact upstream revision is recorded in `SOURCE.json` and checked out as the
`source` Git submodule. Initialize it after cloning Sage.js with:

```sh
git submodule update --init upstream-tests/rh/source
```

The upstream repository does not declare a license. It is therefore recorded
as `NOASSERTION` and linked as a submodule instead of being copied into Sage.js.
The checked-in fixtures contain provenance, hashes, and the small executable
excerpts needed to report compatibility. Clarifying the upstream license would
make future packaging of a self-contained copy possible.

Regenerate the inventory and fixtures:

```sh
pnpm rh:extract
```

Run the reviewed compatibility target:

```sh
pnpm test:rh
```

Produce a diagnostic report without failing on unclassified gaps:

```sh
pnpm rh:report
```

## Scope

The corpus has three canonical layers:

- docstring examples in `rh/code/code.sage`;
- reader-facing Sage sessions printed in `rh/rh.tex`;
- the named `fig_*` generators which created the book's illustrations.

The first two layers are exact executable examples. Figure generators are
inventory targets: their mathematical construction should run and produce a
Sage.js graphics object, while publication-specific PDF/LaTeX file output may
be classified separately.

The historical `code.sagews` worksheet is retained upstream as development
provenance, but its UI commands, timing transcripts, repeated `%load` cells,
manual experiments, and recorded failures are not canonical book examples.
Anything uniquely valuable there should be promoted into an explicit fixture
instead of being silently treated as a pass requirement.

## Source normalization

The pinned source predates Python 3. Before loading it, the runner applies a
small deterministic compatibility transform:

- Python 2 `print` statements become calls;
- `xrange` becomes `range`;
- obsolete Sage raw-number suffixes such as `1r` are removed;
- historical symbolic function assignments such as `f(x) = sin(x)` become
  ordinary one-line function definitions.

The source submodule remains unchanged. Missing mathematics, plotting
primitives, or Python behavior are never patched into the upstream source by
the adapter.
