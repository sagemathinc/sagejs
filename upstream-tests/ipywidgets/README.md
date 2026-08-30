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
