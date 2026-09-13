"""Run the complete reviewed Tomli 2.3.0 error-test class unchanged."""

import unittest

from tests.test_error import TestError


class RecordingResult(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.test_ids = []

    def startTest(self, test):
        super().startTest(test)
        self.test_ids.append(test.id())

loader = unittest.TestLoader()
suite = loader.loadTestsFromTestCase(TestError)
assert [test.id() for test in suite] == EXPECTED_TEST_IDS
assert suite.countTestCases() == len(EXPECTED_TEST_IDS)
result = RecordingResult()
suite.run(result)
assert result.testsRun == len(EXPECTED_TEST_IDS)
assert result.test_ids == EXPECTED_TEST_IDS
assert not result.errors, result.errors
assert not result.failures, result.failures
assert not result.skipped, result.skipped
assert not result.expectedFailures, result.expectedFailures
assert not result.unexpectedSuccesses, result.unexpectedSuccesses
assert result.wasSuccessful()
