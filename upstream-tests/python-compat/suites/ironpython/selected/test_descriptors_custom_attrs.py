# Licensed to the .NET Foundation under one or more agreements.
# The .NET Foundation licenses this file to you under the Apache 2.0 License.
# See the LICENSE file in the project root for more information.

# Modified by Sage.js: selected unchanged upstream method spans; a local
# unittest class wrapper and explicit invocation replace the iptest module harness.
import unittest


class _SelectedCase(unittest.TestCase):
    def test_descriptors_custom_attrs(self):
        """verifies the interaction between descriptors and custom attribute access works properly"""
        class mydesc(object):
            def __get__(self, instance, ctx):
                raise AttributeError

        class f(object):
            x = mydesc()
            def __getattr__(self, name): return 42

        self.assertEqual(f().x, 42)


_result = unittest.TestResult()
_SelectedCase("test_descriptors_custom_attrs").run(_result)
assert _result.testsRun == 1, _result.testsRun
assert not _result.failures, _result.failures
assert not _result.errors, _result.errors
assert not _result.skipped, _result.skipped
assert not _result.expectedFailures, _result.expectedFailures
assert not _result.unexpectedSuccesses, _result.unexpectedSuccesses
