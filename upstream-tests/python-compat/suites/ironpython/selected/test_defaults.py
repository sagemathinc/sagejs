# Licensed to the .NET Foundation under one or more agreements.
# The .NET Foundation licenses this file to you under the Apache 2.0 License.
# See the LICENSE file in the project root for more information.

# Modified by Sage.js: selected unchanged upstream method spans; a local
# unittest class wrapper and explicit invocation replace the iptest module harness.
import unittest


class _SelectedCase(unittest.TestCase):
    def test_defaults(self):
        defaults = [None, object, int, [], 3.14, [3.14], (None,), "a string"]
        for default in defaults:
            def helperFunc(): pass
            self.assertEqual(helperFunc.__defaults__, None)
            self.assertEqual(helperFunc.__defaults__, None)

            def helperFunc1(a): pass
            self.assertEqual(helperFunc1.__defaults__, None)
            self.assertEqual(helperFunc1.__defaults__, None)


            def helperFunc2(a=default): pass
            self.assertEqual(helperFunc2.__defaults__, (default,))
            helperFunc2(a=7)
            self.assertEqual(helperFunc2.__defaults__, (default,))


            def helperFunc3(a, b=default, c=[42]): c.append(b)
            self.assertEqual(helperFunc3.__defaults__, (default, [42]))
            helperFunc3("stuff")
            self.assertEqual(helperFunc3.__defaults__, (default, [42, default]))


_result = unittest.TestResult()
_SelectedCase("test_defaults").run(_result)
assert _result.testsRun == 1, _result.testsRun
assert not _result.failures, _result.failures
assert not _result.errors, _result.errors
assert not _result.skipped, _result.skipped
assert not _result.expectedFailures, _result.expectedFailures
assert not _result.unexpectedSuccesses, _result.unexpectedSuccesses
