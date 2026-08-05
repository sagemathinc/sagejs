# Sage.js documentation strategy

Sage.js documentation starts with ordinary Python docstrings beside the public
API they describe.  The build retains those docstrings at runtime so the same
source serves interactive users, notebooks, editors, tests, and agents.
Structured metadata follows [DocSpec v1](DOCSPEC.md), and ordinary Markdown is
the canonical format for guides and generated reference pages.

## Interactive access

- `help(object)` prints the object's signature and docstring.
- `object?` is shorthand for `help(object)` in the Sage.js CLI and Jupyter
  kernels.
- Jupyter `inspect_request` returns the same runtime signature and docstring,
  which powers notebook inspection UI.
- `search_doc("text")` searches the public names and docstrings currently
  loaded in the Sage.js runtime.
- `sagejs docs search`, `show`, `export`, and `coverage` expose the same
  installed registry to shells and agents.

Public subsystems register searchable objects by qualified name, together with
DocSpec metadata. Registration stores the object itself—not a second copy of
its prose—so `help`, inspection, search, JSON, and generated Markdown cannot
disagree about the docstring.

`search_doc` describes the installed Sage.js API.  The full SageMath manual is
valuable reference material, but it contains many interfaces that Sage.js has
not implemented and therefore is not used as an implicit runtime help result.

## Public docstring content

A public mathematical function, parent, element, or method should document:

1. its mathematical meaning and Sage-compatible semantics;
2. inputs, outputs, defaults, and important exceptions;
3. short executable examples;
4. the computational backend when that matters (for example FLINT);
5. current limitations and every intentional difference from SageMath.

Every public callable is expected to gain at least one executable example.
Examples are documentation first: they should be short, mathematical, and
worth copying. Unit and property tests remain separate and may assert details
that would make a user-facing example unreadable.

When an API is ported from SageMath, its imported upstream examples are kept
in a revision-pinned fixture as well as concise local examples. The reference
manual labels their origin and exposes expected failures or unavailable
optional dependencies instead of quietly dropping inconvenient examples.

## Executable examples

Sage prompts in retained docstrings are extracted into a versioned fixture and
run in isolated Sage.js sessions. The runner implements the important Sage
doctest directives:

- `# random` executes the example but does not compare its textual output;
- `# long time` runs only with `--long`;
- `# needs FEATURE` and `# optional - FEATURE` run only when the feature is
  enabled with `--optional`;
- `# tol`, `# abs tol`, and `# rel tol` compare numeric tokens with tolerance;
- `# not tested`, `# not implemented`, and `# known bug` are visible skips.

Each fixture run reports its random seed. Reference verification uses a stable
seed, while broader CI can vary the seed to expose accidental dependence on a
particular random stream. A skipped, randomly accepted, or failing example is
never presented as an exact CI-verified transcript.

Run `pnpm docs:verify` to execute attached public examples and regenerate the
reference data. Run `pnpm docs:generate` when only prose or metadata changed.

Documentation of an extension or incompatibility belongs next to the API, not
only in a commit message.  Backend notes should explain behavior users can
observe—exactness, precision, supported coefficient rings, or performance
boundaries—without exposing incidental internal details.

## Source and build policy

Mathematical library files remain ordinary CPython-parseable `.py` files.
Docstrings use Markdown and Sage's familiar executable examples. Inline code
uses single backticks, examples use fenced `sage` code blocks, and links use
Markdown syntax. reStructuredText constructs such as doubled backticks,
`EXAMPLES::`, interpreted-text roles, and directives are not accepted in
registered public documentation. Docstrings are executable metadata, so
removing them from the runtime build or allowing public APIs to lose them is a
regression.

The runtime corpus generates the Markdown reference under `docs/reference/`
and can be exported as compact JSON or JSONL. The adjacent docstring remains
the authoritative prose source so interactive and generated documentation
cannot drift. Run:

```bash
pnpm docs:generate
pnpm docs:check
```

The same catalog and verification results generate the fast static manual at
`website/reference.html`. Its search covers names, signatures, prose, tags,
backends, and example cells. Copy buttons remove Sage prompts, source excerpts
are available without a GitHub round trip, and language tabs preserve the
viewport when equivalent verified examples are added for another frontend.

Documentation coverage uses the explicit runtime DocSpec registry as its
denominator. It does **not** claim semantic correctness, performance, or an
inventory of every runtime-visible name; those dimensions are reported
separately so a high documentation score cannot conceal a mathematical gap.

## Attribution and algorithms

Documentation adapted from SageMath records its source URL or revision and GPL
license in DocSpec provenance. Library-backed implementations name their
backend. Implementations based on published algorithms cite the paper, book,
or primary description used. Sage.js-original code is labeled explicitly;
these provenance categories may be combined.
