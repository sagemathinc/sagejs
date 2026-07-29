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

The pinned revision currently has 34 exact/numerical examples, all of which
pass.

Probe the mathematical construction behind every book figure while capturing
publication-specific `save()` calls in memory:

```sh
pnpm test:rh:figures
```

The figure census contains 53 generators. Sage.js executes and validates 51
of them, including every captured `Graphics` and `GraphicsArray` object and
every sampled line. The remaining two are reviewed xfails:

- `fig_erat` contains an upstream call with 200 cells even though its own
  square-grid helper (and SageMath itself) rejects that non-square count;
- `fig_inverse_of_log` shells out to Maxima solely to calculate a label.
  External CAS subprocesses are intentionally outside the embeddable kernel.

These classifications live in `expectations.json`; an unexpected pass is a
test failure so that obsolete exclusions cannot silently accumulate.

Produce a diagnostic report without failing on unclassified gaps:

```sh
pnpm rh:report
pnpm rh:figures:report
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
  ordinary symbolic-expression assignments, preserving Sage's substitution
  and differentiation behavior.

The source submodule remains unchanged. Missing mathematics, plotting
primitives, or Python behavior are never patched into the upstream source by
the adapter.

Numerical examples may declare a reviewed absolute or relative tolerance in
`expectations.json`. This is reserved for legacy floating-point output whose
last digits vary across numerical backends; it is not an xfail and does not
hide exceptions or nonnumeric output.

## Zeta-zero data

The RH source calls `zeta_zeros()` without an explicit count and later indexes
the first 15,000 ordinates. Sage.js embeds exactly that required prefix of
SageMath's optional `database_odlyzko_zeta` 20061209 table. The original
`zeros6` table contains 2,001,052 ordinates accurate to within `4e-9`; the
embedded prefix retains its nine decimal digits.

`scripts/build-odlyzko-subset.cjs` deterministically verifies the full source
file's SHA-256
`2ef7b752c2f17405222e670a61098250c8e4e09047f823f41e2b41a7b378e7c6`,
delta-encodes the nanounits, and generates `src/baselib/zeta_data.py`.
The corresponding Sage package tarball is
`database_odlyzko_zeta-20061209.tar.bz2`, SHA-256
`8919f01992718b9bf5c0602dbf16dd9d6f58b141b25f67f5cfd59f6cd0f9a0d4`.
See `licenses/ODLYZKO-ZETA-NOTICE.md` for source URLs and attribution.
