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

Documentation of an extension or incompatibility belongs next to the API, not
only in a commit message.  Backend notes should explain behavior users can
observe—exactness, precision, supported coefficient rings, or performance
boundaries—without exposing incidental internal details.

## Source and build policy

Mathematical library files remain ordinary CPython-parseable `.py` files.
Docstrings use Sage's familiar executable examples. Existing lightweight
reStructuredText is accepted, but new prose should favor Markdown-compatible
plain text that remains readable in a terminal. They are executable metadata,
so removing them from the runtime build or allowing public APIs to lose them
is a regression.

The runtime corpus generates the Markdown reference under `docs/reference/`
and can be exported as compact JSON or JSONL. The adjacent docstring remains
the authoritative prose source so interactive and generated documentation
cannot drift. Run:

```bash
pnpm docs:generate
pnpm docs:check
```

## Attribution and algorithms

Documentation adapted from SageMath records its source URL or revision and GPL
license in DocSpec provenance. Library-backed implementations name their
backend. Implementations based on published algorithms cite the paper, book,
or primary description used. Sage.js-original code is labeled explicitly;
these provenance categories may be combined.
