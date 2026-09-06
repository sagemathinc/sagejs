# Licensed to the .NET Foundation under one or more agreements.
# The .NET Foundation licenses this file to you under the Apache 2.0 License.
# See the LICENSE file in the project root for more information.

# Modified by Sage.js: selected unchanged upstream method spans; a local
# unittest class wrapper and explicit invocation replace the iptest module harness.
import unittest


class _SelectedCase(unittest.TestCase):
    def test_computed_format(self):
        self.assertEqual("|{0:10}|".format("a"), "|a         |")
        self.assertEqual("|{0:*^10}|".format("a"), "|****a*****|")
        self.assertEqual("|{0:*^{1}}|".format("a", 10), "|****a*****|")
        self.assertEqual("{0:*{2}10}".format("a", "*", "^", "10"), "****a*****")
        self.assertEqual("{0:{1}^{3}}".format("a", "*", "^", "10"), "****a*****")
        self.assertEqual("{0:{1}{2}{3}}".format("a", "*", "^", "10"), "****a*****")
        self.assertEqual("{0:{1}*^{2}}".format("a", "", "10"), "****a*****")


_result = unittest.TestResult()
_SelectedCase("test_computed_format").run(_result)
assert _result.testsRun == 1, _result.testsRun
assert not _result.failures, _result.failures
assert not _result.errors, _result.errors
assert not _result.skipped, _result.skipped
assert not _result.expectedFailures, _result.expectedFailures
assert not _result.unexpectedSuccesses, _result.unexpectedSuccesses
