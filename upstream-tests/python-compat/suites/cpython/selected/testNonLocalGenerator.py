# Copyright (c) 2001 Python Software Foundation; All Rights Reserved.
# Selected unchanged CPython method; local unittest wrapper is described in SOURCE.json.
import unittest

class SelectedScopeTest(unittest.TestCase):
    def testNonLocalGenerator(self):

        def f(x):
            def g(y):
                nonlocal x
                for i in range(y):
                    x += 1
                    yield x
            return g

        g = f(0)
        self.assertEqual(list(g(5)), [1, 2, 3, 4, 5])


_result = unittest.TestResult()
SelectedScopeTest("testNonLocalGenerator").run(_result)
assert _result.testsRun == 1
assert not _result.failures, _result.failures
assert not _result.errors, _result.errors
assert not _result.skipped
assert not _result.expectedFailures
assert not _result.unexpectedSuccesses
