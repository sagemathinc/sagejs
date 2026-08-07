"""Run mpmath's upstream test functions with machine-readable timings.

The default is the dependency-light compatibility slice used by the regular
benchmark.  ``SAGEJS_MPMATH_FULL_SUITE=1`` selects every ``test_*.py`` module
shipped in mpmath 1.3.0.  The JavaScript driver discovers the tests passing on
every runtime, then sums timings for that identical successful set.  Every run
still executes the entire selected corpus so upstream ordering and shared
module state stay identical across runtimes.  ``SAGEJS_MPMATH_SUITE_TESTS``
remains available for focused diagnosis.
"""

import os
from time import perf_counter


CURATED_MODULES = (
    'test_basic_ops',
    'test_bitwise',
    'test_convert',
    'test_gammazeta',
    'test_functions',
    'test_interval',
)
FULL_MODULES = (
    'test_basic_ops',
    'test_bitwise',
    'test_calculus',
    'test_compatibility',
    'test_convert',
    'test_diff',
    'test_division',
    'test_eigen',
    'test_eigen_symmetric',
    'test_elliptic',
    'test_fp',
    'test_functions',
    'test_functions2',
    'test_gammazeta',
    'test_hp',
    'test_identify',
    'test_interval',
    'test_levin',
    'test_linalg',
    'test_matrices',
    'test_mpmath',
    'test_ode',
    'test_pickle',
    'test_power',
    'test_quad',
    'test_rootfinding',
    'test_special',
    'test_str',
    'test_summation',
    'test_trig',
    'test_visualization',
)
full_suite = os.environ.get('SAGEJS_MPMATH_FULL_SUITE') == '1'
MODULES = FULL_MODULES if full_suite else CURATED_MODULES
module_selection_text = os.environ.get(
    'SAGEJS_MPMATH_SUITE_MODULES', '')
if module_selection_text:
    selected_modules = set(module_selection_text.split(','))
    MODULES = tuple(
        module for module in MODULES if module in selected_modules)
# This test silently changes scope according to whether the host happens to
# provide NumPy, Decimal, and Fraction integrations.  It is useful as a package
# integration test, but cannot be part of a runtime-neutral benchmark.
EXCLUDED_TESTS = (
    set() if full_suite else {'test_convert.test_compatibility'}
)

selection_text = os.environ.get('SAGEJS_MPMATH_SUITE_TESTS', '')
selection = set(selection_text.split(',')) if selection_text else None
total_passed = 0
total_failed = 0
suite_started = perf_counter()

for module_name in MODULES:
    import_started = perf_counter()
    try:
        module = __import__('mpmath.tests.' + module_name, fromlist=['*'])
    except BaseException as error:
        import_seconds = perf_counter() - import_started
        total_failed += 1
        try:
            detail = str(error).replace('\t', ' ').replace('\n', ' ')
        except BaseException:
            detail = type(error).__name__
        print(
            'IMPORT\t' + module_name + '\tFAIL\t'
            + str(import_seconds) + '\t' + detail
        )
        print(
            'MODULE\t' + module_name + '\t0\t1\t'
            + str(import_seconds) + '\t0.0'
        )
        continue
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
        except BaseException as error:
            failed += 1
            status = 'FAIL'
            # Keep the machine-readable stream one record per line.  Detailed
            # exceptions remain useful without making the parser understand
            # arbitrary tabs or newlines in an exception message.
            try:
                detail = str(error).replace('\t', ' ').replace('\n', ' ')
            except BaseException:
                detail = type(error).__name__
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
