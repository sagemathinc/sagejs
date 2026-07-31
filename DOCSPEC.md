# Sage.js DocSpec v1

DocSpec is the stable, machine-readable description of the API installed in a
Sage.js runtime. It is designed for interactive users, static documentation,
editors, notebooks, search engines, and mathematical agents.

The current schema version is `1`.

## Design

Each public entry registers:

1. its canonical public name;
2. the live function, class, method, or object;
3. structured metadata describing semantics, implementation, compatibility,
   provenance, references, and limitations.

The live object remains the source for its signature and docstring. This keeps
`help(f)`, `f?`, Jupyter inspection, CLI search, and generated Markdown from
silently drifting apart. Metadata adds facts that runtime reflection cannot
reliably infer.

Every serialized catalog has this shape:

```json
{
  "schema_version": 1,
  "entries": []
}
```

Every entry is independently serializable and also contains
`"schema_version": 1`, making JSONL records self-describing.

## Entry fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | The DocSpec major version. |
| `name` | string | Stable canonical public name. |
| `aliases` | string array | Other exact names accepted by documentation lookup. |
| `kind` | enum | `class`, `constant`, `function`, `method`, or `object`. |
| `module` | string | Sage-compatible or Sage.js implementation module. |
| `signature` | string | Runtime signature derived from the live object. |
| `summary` | string | First nonempty line of the live docstring. |
| `doc` | string | Complete retained runtime docstring. |
| `tags` | string array | Searchable mathematical and operational topics. |
| `backends` | string array | Significant computational/rendering backends. |
| `sage_compatibility` | object | Compatibility status and an optional explanation. |
| `provenance` | object array | Where semantics and implementation came from. |
| `references` | object array | Papers, books, manuals, software, or web references. |
| `implementation` | object | Stable algorithm name and optional useful notes. |
| `limitations` | string array | Explicit boundaries of the installed implementation. |

Unknown fields may be added in a compatible minor evolution. Consumers must
ignore unknown fields. A meaningfully incompatible change increments
`schema_version`.

## Compatibility

`sage_compatibility.status` is one of:

- `compatible`: supported inputs intentionally match SageMath;
- `extension`: Sage-compatible behavior plus a documented Sage.js extension;
- `partial`: the supported subset is described explicitly;
- `incompatible`: an intentional semantic difference is documented.

Unsupported mathematics must raise an informative error or return a documented
symbolic/unevaluated object. It must not fabricate a plausible but false
answer.

## Provenance

Each provenance record has a `kind`:

- `sage-derived`: API, semantics, prose, tests, or code adapted from SageMath;
- `library-backed`: substantial computation is delegated to a named library;
- `literature-implemented`: an algorithm is implemented from published work;
- `sagejs-original`: design or implementation originated in Sage.js.

Records may also contain `source`, `revision`, `url`, and `license`. These
categories can be combined. For example, a Sage-compatible API implemented
directly from a paper over FLINT should record all three facts.

References have a stable `id`, `title`, and optional `type`, `authors`, `year`,
`doi`, `url`, and `relevant_sections`. New nontrivial algorithms should cite
the paper or other primary description used to implement them.

Sage-derived documentation must preserve the source URL or revision and
license. SageMath and Sage.js are GPL projects, but attribution is still part
of the technical record.

## Authoring an entry

Keep the useful prose beside the implementation:

```python
def dimension_cusp_forms(group, weight=2):
    """
    Return the dimension of a space of cuspidal modular forms.

    ### Examples

    ```sage
    sage: dimension_cusp_forms(Gamma0(11), 2)
    1
    ```
    """
    ...


runtime.register_doc(
    "dimension_cusp_forms",
    dimension_cusp_forms,
    {
        "kind": "function",
        "module": "sage.modular.dims",
        "tags": ["modular forms", "dimensions"],
        "backends": ["Sage.js exact arithmetic", "FLINT"],
        "sage_compatibility": {
            "status": "partial",
            "notes": "Weight-one Schaeffer cases are not implemented.",
        },
        "provenance": [
            {"kind": "sage-derived", "source": "SageMath modular API"},
            {
                "kind": "literature-implemented",
                "source": "Cohen--Oesterlé dimension formula",
            },
        ],
        "references": [
            {
                "id": "cohen-oesterle-1977",
                "type": "paper",
                "title": "Dimensions des espaces de formes modulaires",
                "authors": ["Henri Cohen", "Joseph Oesterlé"],
                "year": 1977,
                "doi": "10.1007/BFb0065297",
            },
        ],
        "limitations": [
            "Some weight-one cases are not implemented.",
        ],
    },
)
```

Public docstrings should normally include:

- a one-sentence mathematical summary;
- parameters, return value, and important exceptions;
- short executable Sage examples;
- implementation/backend details that affect exactness or performance;
- explicit limitations and intentional Sage differences.

Public docstrings are Markdown. Use single backticks for inline code, fenced
`sage` code blocks for examples, Markdown headings, and Markdown links. Do not
introduce reStructuredText forms such as doubled backticks,
`EXAMPLES::`, `:meth:`, or `.. note::`.

## Access and generation

The same registry is available through:

```bash
sagejs docs search finite field
sagejs docs search --regex --backend FLINT 'matrix|polynomial'
sagejs docs show dimension_cusp_forms
sagejs docs show --json GF
sagejs docs export --jsonl
sagejs docs export --markdown
sagejs docs coverage --json
sagejs docs path
```

Literal search normalizes spaces, `_`, `-`, quotes, and backticks. It uses
smart case by default. Regex and exact metadata filters support more systematic
agent queries. JSON output is written only to stdout so it can be composed
reliably with other tools.

`pnpm docs:generate` writes the committed Markdown API reference.
`pnpm docs:check` detects generated-reference drift.

Coverage currently measures registered entries. It does not claim that every
public-looking runtime name has been inventoried; a future public API manifest
will provide that stronger denominator.
