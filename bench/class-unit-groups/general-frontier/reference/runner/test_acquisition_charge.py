import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "acquisition", Path(__file__).with_name("charge-acquisition.py")
)
acquisition = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acquisition)


class AcquisitionTests(unittest.TestCase):
    def state(self):
        return {
            "schema": "sagejs.general-frontier-conservative-cpu-ledger.v1",
            "limit_seconds": 432000,
            "charged_seconds": 100,
            "pending": None,
        }

    def test_one_time_allowance(self):
        state = acquisition.charge(self.state())
        self.assertEqual(state["charged_seconds"], 6100)
        self.assertEqual(state["adjustments"][0]["seconds"], 6000)
        with self.assertRaises(ValueError):
            acquisition.charge(state)

    def test_pending_and_exhausted_fail_without_mutation(self):
        for key, value in (("pending", {"reserved": 100}), ("charged_seconds", 430000)):
            state = self.state()
            state[key] = value
            before = dict(state)
            with self.assertRaises(ValueError):
                acquisition.charge(state)
            self.assertEqual(state, before)

    def test_hard_windows_is_separate_bounded_allowance(self):
        state = acquisition.charge(self.state())
        acquisition.charge(state, "hard-windows-v1")
        self.assertEqual(state["charged_seconds"], 6400)
        with self.assertRaises(ValueError):
            acquisition.charge(state, "hard-windows-v1")
        with self.assertRaises(ValueError):
            acquisition.charge(state, "unbounded")


if __name__ == "__main__":
    unittest.main()
