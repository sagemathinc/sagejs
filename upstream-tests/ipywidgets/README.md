# ipywidgets conformance fixtures

This directory freezes the semantic inputs for Sage.js's Python-free
ipywidgets implementation. `manifest.json` records exact source revisions,
wheel hashes, browser bundle identities, licenses, and protocol versions.
`test-inventory.json` assigns every selected upstream runtime-test family a
disposition.

The normalized protocol corpus is generated with the pinned CPython packages:

```bash
PYTHONPATH=/path/to/ipywidgets-8.1.9 \
  python3 scripts/generate-ipywidgets-corpus.py --check
```

The generator replaces only the kernel comm transport. It executes upstream
`traitlets`, `comm`, and `ipywidgets` unchanged, assigns deterministic comm
identifiers, and normalizes binary buffers by length and SHA-256. CPython is
the semantic authority; JupyterLite's JavaScript kernel is a secondary
implementation reference only.

The smaller traitlets transcript records notification order, validation
rollback, two-way and transformed one-way links, and unlink cleanup. Regenerate
it with the exact pinned traitlets wheel, then run the same program with
Sage.js through `test/traitlets-upstream.cjs`:

```bash
python3 scripts/generate-traitlets-semantics-corpus.py \
  > upstream-tests/ipywidgets/traitlets-semantics-corpus.json
node test/traitlets-upstream.cjs
```
