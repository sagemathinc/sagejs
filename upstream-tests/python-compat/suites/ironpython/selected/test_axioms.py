# Licensed to the .NET Foundation under one or more agreements.
# The .NET Foundation licenses this file to you under the Apache 2.0 License.
# See the LICENSE file in the project root for more information.

# Modified by Sage.js: selected unchanged upstream method spans; a local
# unittest class wrapper and explicit invocation replace the iptest module harness.
import unittest


class _SelectedCase(unittest.TestCase):
    def axiom_helper(self, a, b):
        self.assertTrue((a // b) * b + (a % b) == a, "(" + str(a) + " // " + str(b) + ") * " + str(b) + " + (" + str(a) + " % " + str(b) + ") != " + str(a))

    def test_axioms(self):
        a = -209681412991024529003047811046079621104607962110459585190118809030105845255159325119855216402270708
        b = 37128952704582304957243524

        self.axiom_helper(a,b)

        a = 209681412991024529003047811046079621104607962110459585190118809030105845255159325119855216402270708
        b = 37128952704582304957243524

        self.axiom_helper(a,b)


_result = unittest.TestResult()
_SelectedCase("test_axioms").run(_result)
assert _result.testsRun == 1, _result.testsRun
assert not _result.failures, _result.failures
assert not _result.errors, _result.errors
assert not _result.skipped, _result.skipped
assert not _result.expectedFailures, _result.expectedFailures
assert not _result.unexpectedSuccesses, _result.unexpectedSuccesses
