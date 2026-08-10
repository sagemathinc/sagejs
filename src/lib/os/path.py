"""Platform pathname operations exposed through the standard ``os.path`` name.

CPython registers either :mod:`posixpath` or :mod:`ntpath` under this module
name.  Sage.js uses a tiny Python wrapper so the static module resolver and the
runtime registry agree that ``import os.path`` and ``os.path`` name the same
module.
"""

import sys

if sys.platform == "win32":
    from ntpath import *  # noqa: F403
else:
    from posixpath import *  # noqa: F403
