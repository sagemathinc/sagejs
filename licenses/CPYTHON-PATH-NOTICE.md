# CPython path-module notice

The Sage.js files `src/lib/genericpath.py`, `src/lib/posixpath.py`, and
`src/lib/ntpath.py`, together with their focused compatibility tests, are
adapted from the corresponding CPython modules and tests.

- Source: <https://github.com/python/cpython>
- Revision: `7b4165b3b07638d8aeab79a880c52f2b51c56f37`
- Copyright: Python Software Foundation and CPython contributors
- License: PSF License Agreement for Python 2.1.1 and newer (SPDX
  `PSF-2.0`), available in CPython's
  [LICENSE](https://github.com/python/cpython/blob/7b4165b3b07638d8aeab79a880c52f2b51c56f37/LICENSE)

Sage.js changes include an explicit host-capability boundary, a Node.js host
adapter, session-local current-directory semantics, and a compact subset of
the full CPython API suitable for the Sage.js compiler.
