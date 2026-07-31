# Sage.js documentation strategy

Sage.js documentation starts with ordinary Python docstrings beside the public
API they describe.  The build retains those docstrings at runtime so the same
source serves interactive users, notebooks, editors, tests, and agents.

## Interactive access

- `help(object)` prints the object's signature and docstring.
- `object?` is shorthand for `help(object)` in the Sage.js CLI and Jupyter
  kernels.
- Jupyter `inspect_request` returns the same runtime signature and docstring,
  which powers notebook inspection UI.
- `search_doc("text")` searches the public names and docstrings currently
  loaded in the Sage.js runtime.

Public subsystems register searchable objects by qualified name in the small
runtime documentation registry.  Registration stores the object itself—not a
second copy of its prose—so `help`, inspection, and search cannot disagree
about the docstring.

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
Docstrings use Sage's familiar examples and lightweight reStructuredText
conventions where useful.  They are executable metadata, so removing them from
the runtime build or allowing public APIs to lose them is a regression.

As the API grows, this runtime corpus can also generate a static reference and
a compact machine-readable symbol index.  The adjacent docstring remains the
authoritative source so interactive and generated documentation cannot drift.
