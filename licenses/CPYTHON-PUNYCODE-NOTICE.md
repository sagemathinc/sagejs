# CPython Punycode notice

`src/lib/sagejs/_punycode.py` adapts the raw codec algorithms from
`Lib/encodings/punycode.py`, written by Martin v. Löwis, in CPython v3.14.7,
commit `823f0323ee6ec1402088b73bce1a38473cac36dc`.

Copyright (c) 2001 Python Software Foundation; All Rights Reserved.
Copyright Python Software Foundation and CPython contributors.

The complete upstream license is retained in `CPYTHON-LICENSE.txt`.
Source: https://github.com/python/cpython/blob/823f0323ee6ec1402088b73bce1a38473cac36dc/Lib/encodings/punycode.py

Sage.js changes: add type annotations and formatting, use a private lazy module,
omit the codec-registry/stream classes, and apply their decode error-handler
validation directly at the raw entry point. Encoding does not normalize or
validate domain names. Node and browser paths use the same Python source.
Internal positions and sorting use explicit Unicode code points rather than
host UTF-16 string indices. Empty decode follows Python's bytes fast path.
