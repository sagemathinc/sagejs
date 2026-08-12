"""CPython/Sage.js timing harness for the source-transparent P1 pilot."""

from __future__ import annotations

import os
import sys
import types
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "lib"))
# The workload only exercises the pure-Python Heilbronn functions. Generated
# FFI declarations reference the Sage.js runtime lazily, so an empty import
# sentinel keeps their annotations CPython-importable without pretending that
# foreign calls themselves have a CPython host adapter.
sys.modules.setdefault("sagejs.runtime", types.ModuleType("sagejs.runtime"))

from sagejs.kernels.p1 import heilbronn_cremona_digest

prime = int(os.environ.get("SAGEJS_NATIVE_P1_PRIME", "1009"))
repetitions = int(os.environ.get("SAGEJS_NATIVE_P1_REPETITIONS", "3"))
for _warmup in range(2):
    answer = heilbronn_cremona_digest(prime)
started = perf_counter()
for _repetition in range(repetitions):
    answer = heilbronn_cremona_digest(prime)
elapsed = (perf_counter() - started) / repetitions
print("RESULT|" + "|".join(str(value) for value in answer) + f"|{elapsed:.12f}")
