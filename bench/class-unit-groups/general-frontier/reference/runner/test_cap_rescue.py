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
        "sample": 1,
        "cap_seconds": 60,
        "coefficients": ["1", "0", "1"],
        "controls": {
            "hostname": "test",
            "affinity": [2],
            "memory_max": 4294967296,
            "swap_max": 0,
        },
        "proof_policy": "conditional-grh",
        "producer_boundary": "persistent-process-fresh-field-not-proven-warm-JIT",
    }
    return {
        "pari_review": {"declared_samples": 1},
        "hecke_review": {"declared_samples": 1},
        "rows": [
            {
                "label": "example",
                "status": "censored-or-missing",
                "pari": {**base, "status": "timeout"},
                "hecke": {**base, "status": "ok", "worker_nanoseconds": "10000000000"},
            }
        ],
    }


class RescueTests(unittest.TestCase):
    def test_equal_invalid_contracts_are_rejected(self):
        for key, value in (
            ("controls", None),
            ("controls", {}),
            (
                "controls",
                {"hostname": "test", "affinity": [2], "memory_max": 1, "swap_max": 0},
            ),
            ("proof_policy", "heuristic"),
            ("producer_boundary", "unknown"),
            ("sample", 2),
        ):
            with self.subTest(key=key, value=value):
                report = fixture()
                for engine in ("pari", "hecke"):
                    report["rows"][0][engine][key] = value
                with self.assertRaises(ValueError):
                    rescue.select(report)

    def test_multiple_declared_samples_are_rejected(self):
        report = fixture()
        report["pari_review"]["declared_samples"] = 2
        with self.assertRaises(ValueError):
            rescue.select(report)

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
