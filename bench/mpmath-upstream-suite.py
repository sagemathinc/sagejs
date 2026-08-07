"""Run a broad, dependency-light slice of mpmath's upstream test suite.

The selected modules cover exact and arbitrary-precision arithmetic, string
conversion, special functions, elementary functions, and interval arithmetic.
They are shipped in mpmath's universal wheel and do not require pytest merely
to import.  The JavaScript driver first discovers the tests passing on every
runtime, then sums timings for that common successful set.  Every run still
executes the complete slice so upstream ordering and shared module state stay
identical across runtimes.  ``SAGEJS_MPMATH_SUITE_TESTS`` remains available
for focused diagnosis.
"""

import os
from time import perf_counter


MODULES = (
    'test_basic_ops',
    'test_bitwise',
    'test_convert',
    'test_gammazeta',
    'test_functions',
    'test_interval',
)
# This test silently changes scope according to whether the host happens to
# provide NumPy, Decimal, and Fraction integrations.  It is useful as a package
# integration test, but cannot be part of a runtime-neutral benchmark.
EXCLUDED_TESTS = {'test_convert.test_compatibility'}

selection_text = os.environ.get('SAGEJS_MPMATH_SUITE_TESTS', '')
selection = set(selection_text.split(',')) if selection_text else None
total_passed = 0
total_failed = 0
suite_started = perf_counter()

for module_name in MODULES:
    import_started = perf_counter()
    module = __import__('mpmath.tests.' + module_name, fromlist=['*'])
    import_seconds = perf_counter() - import_started
    names = sorted(
        name for name in module.__dict__
        if name.startswith('test_')
        and module_name + '.' + name not in EXCLUDED_TESTS
        and (
            selection is None
            or module_name + '.' + name in selection
        )
    )
    passed = 0
    failed = 0
    tests_started = perf_counter()
    for name in names:
        test_started = perf_counter()
        try:
            getattr(module, name)()
        except Exception as error:
            failed += 1
            status = 'FAIL'
            # Keep the machine-readable stream one record per line.  Detailed
            # exceptions remain useful without making the parser understand
            # arbitrary tabs or newlines in an exception message.
            detail = str(error).replace('\t', ' ').replace('\n', ' ')
        else:
            passed += 1
            status = 'PASS'
            detail = ''
        test_seconds = perf_counter() - test_started
        print(
            'TEST\t' + module_name + '\t' + name + '\t' + status
            + '\t' + str(test_seconds) + '\t' + detail
        )
    tests_seconds = perf_counter() - tests_started
    total_passed += passed
    total_failed += failed
    print(
        'MODULE\t' + module_name + '\t' + str(passed) + '\t'
        + str(failed) + '\t' + str(import_seconds) + '\t'
        + str(tests_seconds)
    )

print(
    'SUMMARY\t' + str(total_passed) + '\t' + str(total_failed)
    + '\t' + str(perf_counter() - suite_started)
)
