"""A compact, compatible foundation for Python's :mod:`unittest`.

The implementation intentionally covers the portable core used by ordinary
pure-Python libraries: test cases and assertions, exception/warning context
managers, suites, results, a text runner, and the standard decorators.  Test
discovery and `unittest.mock` remain separate compatibility milestones.
"""

from __future__ import annotations

import traceback


class SkipTest(Exception):
    """Raised to skip a test."""


class _OutcomeContext:
    def __init__(self, test_case, expected, regex=None):
        self.test_case = test_case
        self.expected = expected
        self.regex = regex
        self.exception = None

    def __enter__(self):
        return self

    def __exit__(self, exception_type, exception, tb):
        if exception_type is None:
            self.test_case.fail(
                "%s not raised" % getattr(self.expected, "__name__", self.expected)
            )
        if not issubclass(exception_type, self.expected):
            return False
        self.exception = exception
        if self.regex is not None:
            import re

            if re.search(self.regex, str(exception)) is None:
                self.test_case.fail(
                    "%r does not match %r" % (str(exception), self.regex)
                )
        return True


class TestCase:
    """Base class for individual tests, closely following CPython's API."""

    failureException = AssertionError
    longMessage = True
    maxDiff = 80 * 8

    def __init__(self, methodName="runTest"):
        self._testMethodName = methodName

    def __repr__(self):
        return "<%s testMethod=%s>" % (type(self).__name__, self._testMethodName)

    def __str__(self):
        return "%s (%s.%s)" % (
            self._testMethodName,
            type(self).__module__,
            type(self).__name__,
        )

    def id(self):
        return "%s.%s.%s" % (
            type(self).__module__,
            type(self).__name__,
            self._testMethodName,
        )

    def shortDescription(self):
        method = getattr(self, self._testMethodName)
        doc = getattr(method, "__doc__", None)
        return doc.strip().split("\n")[0] if doc else None

    def setUp(self):
        pass

    def tearDown(self):
        pass

    def runTest(self):
        pass

    def skipTest(self, reason):
        raise SkipTest(reason)

    def fail(self, msg=None):
        raise self.failureException(msg or "test failed")

    def _formatMessage(self, msg, standard):
        if msg is None:
            return standard
        return standard + " : " + str(msg) if self.longMessage else str(msg)

    def assertTrue(self, expr, msg=None):
        if not expr:
            self.fail(self._formatMessage(msg, "%r is not true" % (expr,)))

    def assertFalse(self, expr, msg=None):
        if expr:
            self.fail(self._formatMessage(msg, "%r is not false" % (expr,)))

    def assertEqual(self, first, second, msg=None):
        if first != second:
            self.fail(self._formatMessage(msg, "%r != %r" % (first, second)))

    def assertNotEqual(self, first, second, msg=None):
        if first == second:
            self.fail(self._formatMessage(msg, "%r == %r" % (first, second)))

    def assertIs(self, first, second, msg=None):
        if first is not second:
            self.fail(self._formatMessage(msg, "%r is not %r" % (first, second)))

    def assertIsNot(self, first, second, msg=None):
        if first is second:
            self.fail(self._formatMessage(msg, "unexpectedly identical"))

    def assertIsNone(self, value, msg=None):
        self.assertIs(value, None, msg)

    def assertIsNotNone(self, value, msg=None):
        self.assertIsNot(value, None, msg)

    def assertIn(self, member, container, msg=None):
        if member not in container:
            self.fail(
                self._formatMessage(msg, "%r not found in %r" % (member, container))
            )

    def assertNotIn(self, member, container, msg=None):
        if member in container:
            self.fail(
                self._formatMessage(
                    msg, "%r unexpectedly found in %r" % (member, container)
                )
            )

    def assertIsInstance(self, obj, cls, msg=None):
        if not isinstance(obj, cls):
            self.fail(
                self._formatMessage(msg, "%r is not an instance of %r" % (obj, cls))
            )

    def assertNotIsInstance(self, obj, cls, msg=None):
        if isinstance(obj, cls):
            self.fail(self._formatMessage(msg, "%r is an instance of %r" % (obj, cls)))

    def assertGreater(self, first, second, msg=None):
        if not first > second:
            self.fail(
                self._formatMessage(msg, "%r not greater than %r" % (first, second))
            )

    def assertGreaterEqual(self, first, second, msg=None):
        if not first >= second:
            self.fail(
                self._formatMessage(
                    msg, "%r not greater than or equal to %r" % (first, second)
                )
            )

    def assertLess(self, first, second, msg=None):
        if not first < second:
            self.fail(self._formatMessage(msg, "%r not less than %r" % (first, second)))

    def assertLessEqual(self, first, second, msg=None):
        if not first <= second:
            self.fail(
                self._formatMessage(
                    msg, "%r not less than or equal to %r" % (first, second)
                )
            )

    def assertAlmostEqual(self, first, second, places=7, msg=None, delta=None):
        difference = abs(first - second)
        equal = (
            difference <= delta if delta is not None else round(difference, places) == 0
        )
        if not equal:
            self.fail(
                self._formatMessage(msg, "%r != %r within tolerance" % (first, second))
            )

    def assertNotAlmostEqual(self, first, second, places=7, msg=None, delta=None):
        difference = abs(first - second)
        equal = (
            difference <= delta if delta is not None else round(difference, places) == 0
        )
        if equal:
            self.fail(
                self._formatMessage(msg, "%r == %r within tolerance" % (first, second))
            )

    def assertRaises(self, expected_exception, *args, **kwargs):
        msg = kwargs.pop("msg", None)
        context = _OutcomeContext(self, expected_exception)
        if not args:
            return context
        function = args[0]
        with context:
            function(*args[1:], **kwargs)
        return context

    def assertRaisesRegex(self, expected_exception, regex, *args, **kwargs):
        context = _OutcomeContext(self, expected_exception, regex)
        if not args:
            return context
        function = args[0]
        with context:
            function(*args[1:], **kwargs)
        return context

    assertRaisesRegexp = assertRaisesRegex

    def assertRegex(self, text, regex, msg=None):
        import re

        if re.search(regex, text) is None:
            self.fail(self._formatMessage(msg, "%r does not match %r" % (text, regex)))

    def assertNotRegex(self, text, regex, msg=None):
        import re

        if re.search(regex, text) is not None:
            self.fail(self._formatMessage(msg, "%r matches %r" % (text, regex)))

    assertRegexpMatches = assertRegex
    assertNotRegexpMatches = assertNotRegex

    def countTestCases(self):
        return 1

    def run(self, result=None):
        result = result or TestResult()
        result.startTest(self)
        try:
            self.setUp()
            getattr(self, self._testMethodName)()
            self.tearDown()
        except SkipTest as error:
            result.addSkip(self, str(error))
        except self.failureException:
            result.addFailure(self, traceback.format_exc())
        except Exception:
            result.addError(self, traceback.format_exc())
        else:
            result.addSuccess(self)
        result.stopTest(self)
        return result

    __call__ = run


class FunctionTestCase(TestCase):
    def __init__(self, testFunc, setUp=None, tearDown=None, description=None):
        super().__init__("runTest")
        self._testFunc = testFunc
        self._setUpFunc = setUp
        self._tearDownFunc = tearDown
        self._description = description

    def setUp(self):
        if self._setUpFunc is not None:
            self._setUpFunc()

    def tearDown(self):
        if self._tearDownFunc is not None:
            self._tearDownFunc()

    def runTest(self):
        self._testFunc()

    def shortDescription(self):
        return self._description or super().shortDescription()


class TestResult:
    def __init__(self):
        self.failures = []
        self.errors = []
        self.skipped = []
        self.expectedFailures = []
        self.unexpectedSuccesses = []
        self.testsRun = 0
        self.shouldStop = False

    def startTest(self, test):
        self.testsRun += 1

    def stopTest(self, test):
        pass

    def addSuccess(self, test):
        pass

    def addError(self, test, error):
        self.errors.append((test, error))

    def addFailure(self, test, error):
        self.failures.append((test, error))

    def addSkip(self, test, reason):
        self.skipped.append((test, reason))

    def wasSuccessful(self):
        return not self.failures and not self.errors

    def stop(self):
        self.shouldStop = True


class TestSuite:
    def __init__(self, tests=()):
        self._tests = list(tests)

    def addTest(self, test):
        self._tests.append(test)

    def addTests(self, tests):
        self._tests.extend(tests)

    def __iter__(self):
        return iter(self._tests)

    def countTestCases(self):
        return sum(test.countTestCases() for test in self._tests)

    def run(self, result):
        for test in self._tests:
            if result.shouldStop:
                break
            test(result)
        return result

    __call__ = run


class TextTestRunner:
    resultclass = TestResult

    def __init__(self, stream=None, descriptions=True, verbosity=1, **kwargs):
        self.stream = stream
        self.descriptions = descriptions
        self.verbosity = verbosity

    def run(self, test):
        result = self.resultclass()
        test(result)
        return result


def skip(reason):
    def decorator(test_item):
        def skipped(*args, **kwargs):
            raise SkipTest(reason)

        return skipped

    return decorator


def skipIf(condition, reason):
    return skip(reason) if condition else (lambda item: item)


def skipUnless(condition, reason):
    return skip(reason) if not condition else (lambda item: item)


def expectedFailure(function):
    function.__unittest_expecting_failure__ = True
    return function


defaultTestLoader = None


def main(*args, **kwargs):
    """Compatibility entry point; discovery is not implemented yet."""
    raise NotImplementedError("unittest command-line discovery is not implemented")
