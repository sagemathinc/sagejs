"""Run mpmath's unmodified basic-operations tests without pytest."""

from time import perf_counter

from mpmath.tests import test_basic_ops


tests = [
    (name, getattr(test_basic_ops, name))
    for name in sorted(dir(test_basic_ops))
    if name.startswith("test_")
]
passed = 0
failures = []
started = perf_counter()
for name, test in tests:
    try:
        test()
        passed += 1
    except BaseException as error:
        failures.append((name, str(error)))
elapsed = perf_counter() - started

for name, message in failures:
    print("FAIL", name, message)
print("RESULT", passed, len(failures), elapsed)
