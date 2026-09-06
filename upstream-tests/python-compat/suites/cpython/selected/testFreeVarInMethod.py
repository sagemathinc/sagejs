# Copyright (c) 2001 Python Software Foundation; All Rights Reserved.
# Selected unchanged CPython method; local unittest wrapper is described in SOURCE.json.
import unittest

class SelectedScopeTest(unittest.TestCase):
    def testFreeVarInMethod(self):

        def test():
            method_and_var = "var"
            class Test:
                def method_and_var(self):
                    return "method"
                def test(self):
                    return method_and_var
                def actual_global(self):
                    return str("global")
                def str(self):
                    return str(self)
            return Test()

        t = test()
        self.assertEqual(t.test(), "var")
        self.assertEqual(t.method_and_var(), "method")
        self.assertEqual(t.actual_global(), "global")

        method_and_var = "var"
        class Test:
            # this class is not nested, so the rules are different
            def method_and_var(self):
                return "method"
            def test(self):
                return method_and_var
            def actual_global(self):
                return str("global")
            def str(self):
                return str(self)

        t = Test()
        self.assertEqual(t.test(), "var")
        self.assertEqual(t.method_and_var(), "method")
        self.assertEqual(t.actual_global(), "global")


_result = unittest.TestResult()
SelectedScopeTest("testFreeVarInMethod").run(_result)
assert _result.testsRun == 1
assert not _result.failures, _result.failures
assert not _result.errors, _result.errors
assert not _result.skipped
assert not _result.expectedFailures
assert not _result.unexpectedSuccesses
