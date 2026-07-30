# Upstream semantic tests

This directory contains generated semantic snapshots of upstream Sage doctests,
not copies of Sage implementations. Each fixture preserves the exact Sage input,
expected output, docstring grouping, source locations, tags, repository revision,
and SHA-256 hash of the complete source file.

Regenerate a fixture from a Sage or Sagelite checkout with:

```sh
node scripts/extract-sage-doctests.cjs \
  --source /path/to/sage/src/sage/rings/example.py \
  --license GPL-2.0-or-later \
  --output upstream-tests/sage/rings/example.doctests.json
```

Run a fixture against Sage.js with:

```sh
node scripts/run-sage-doctests.cjs \
  upstream-tests/sage/rings/example.doctests.json \
  --expectations upstream-tests/sage/rings/example.expectations.json
```

Expectations are separate from upstream tests. A `skip` records a deliberately
out-of-scope dependency and does not execute the example. An `xfail` records a
known Sage.js compatibility gap and is executed; an unexpected pass fails the
suite until the obsolete expectation is removed.

## Exact integer matrices

`sage/matrix/matrix_integer_dense_core.doctests.json` pins 207 public examples
from 15 high-frequency methods in Sage's integer dense-matrix implementation at
revision `09472ff530d280d0c9f44fdc5a9c3e856ed95b37`. Run the compatibility gate
or an unclassified development report with:

```sh
pnpm test:matrix:corpus
pnpm matrix:report
```

The extraction filter is an owner regular expression, so additional coherent
method groups can be adopted without importing the entire implementation
docstring corpus at once. Both extraction and execution accept
`--owner-regexp`.

`sage/matrix/matrix_modn_dense_core.doctests.json` pins the characteristic
polynomial and rank groups from Sage's FLINT modular-matrix implementation at
the same revision. Its prime-field examples are compatibility requirements;
examples over composite residue rings are explicitly classified until the
`Zmod(n)` matrix layer is adopted.

## Python language compatibility

The `micropython` directory contains a pinned copy of MicroPython's compact
language test corpus. Its ordinary programs are differential tests: their
combined output must exactly match CPython. Sage.js keeps a reviewed baseline of
all outcomes so regressions and newly passing tests are both visible.

See [`micropython/README.md`](micropython/README.md) for provenance, selection
rules, and commands.

## Sage Guided Tour

`sage/tutorial/guided-tour.doctests.json` pins every executable `sage:`
transcript from the public Guided Tour. The fixture keeps source-file, section,
line, output, and revision provenance while running each tutorial source file
as one stateful session:

```sh
pnpm test:tutorial
pnpm tutorial:report
```

Regenerate it from a Sage checkout at the revision in
`sage/tutorial/SOURCE.json`:

```sh
pnpm tutorial:extract -- --sage-root /path/to/sage
```

## Foreign-language parsers

The `tree-sitter-magma` submodule pins the MIT-licensed parser grammar used by
the experimental Magma frontend. The official MIT-licensed
`tree-sitter-wolfram` grammar and the MIT-licensed `tree-sitter-matlab`
grammar are pinned for the Wolfram Language and MATLAB frontends. Maple's
focused initial grammar is maintained in-tree because the available external
grammar did not yet parse representative Maple iterator syntax.

Initialize submodules before building:

```sh
git submodule update --init --recursive
```
