# Copyright (c) 2001 Python Software Foundation; All Rights Reserved.
# Selected unchanged CPython method; local unittest wrapper is described in SOURCE.json.
import unittest

class SelectedScopeTest(unittest.TestCase):
    def testCellIsKwonlyArg(self):
        # Issue 1409: Initialisation of a cell value,
        # when it comes from a keyword-only parameter
        def foo(*, a=17):
            def bar():
                return a + 5
            return bar() + 3

        self.assertEqual(foo(a=42), 50)
        self.assertEqual(foo(), 25)


_result = unittest.TestResult()
SelectedScopeTest("testCellIsKwonlyArg").run(_result)
assert _result.testsRun == 1
assert not _result.failures, _result.failures
assert not _result.errors, _result.errors
assert not _result.skipped
assert not _result.expectedFailures
assert not _result.unexpectedSuccesses
