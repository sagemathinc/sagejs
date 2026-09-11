import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "rescue", Path(__file__).with_name("prepare-cap-rescue.py")
)
rescue = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rescue)


def fixture():
    base = {
        "bits": 200,
        "iterations": 1,
        "cap_seconds": 60,
        "coefficients": ["1", "0", "1"],
        "controls": {"hostname": "test", "affinity": [2]},
    }
    return {
        "rows": [
            {
                "label": "example",
                "status": "censored-or-missing",
                "pari": {**base, "status": "timeout"},
                "hecke": {**base, "status": "ok", "worker_nanoseconds": "10000000000"},
            }
        ]
    }


class RescueTests(unittest.TestCase):
    def test_only_expensive_completed_counterpart_triggers(self):
        report = fixture()
        self.assertEqual(len(rescue.select(report)["pari"]), 1)
        report["rows"][0]["hecke"]["worker_nanoseconds"] = "9999999999"
        self.assertEqual(rescue.select(report), {"pari": [], "hecke": []})
        report["rows"][0]["hecke"]["status"] = "timeout"
        self.assertEqual(rescue.select(report), {"pari": [], "hecke": []})

    def test_no_implicit_repeat_or_mixed_controls(self):
        report = fixture()
        report["rows"][0]["pari"]["cap_seconds"] = 600
        self.assertFalse(rescue.select(report)["pari"])
        report = fixture()
        report["rows"].append(copy.deepcopy(report["rows"][0]))
        with self.assertRaises(ValueError):
            rescue.select(report)
        report = fixture()
        report["rows"][0]["pari"]["controls"] = {"hostname": "other"}
        with self.assertRaises(ValueError):
            rescue.select(report)


if __name__ == "__main__":
    unittest.main()
