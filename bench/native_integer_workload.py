from __future__ import annotations

import os
import sys
from time import perf_counter

source_root = os.environ.get('SAGEJS_NATIVE_SOURCE_ROOT')
if source_root:
    sys.path.insert(0, os.path.join(source_root, 'src', 'lib'))

from native_integer_kernel import integer_quadratic_sum


terms = int(os.environ.get('SAGEJS_NATIVE_INTEGER_TERMS', '1000000'))
repetitions = int(
    os.environ.get('SAGEJS_NATIVE_INTEGER_REPETITIONS', '5'))
warmups = int(os.environ.get('SAGEJS_NATIVE_INTEGER_WARMUPS', '2'))

for _ in range(warmups):
    integer_quadratic_sum(terms)

started = perf_counter()
for _ in range(repetitions):
    answer = integer_quadratic_sum(terms)
elapsed = (perf_counter() - started) / repetitions

print('RESULT', answer, elapsed)
