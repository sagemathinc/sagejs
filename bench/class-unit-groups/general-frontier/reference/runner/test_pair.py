import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "pairs", Path(__file__).with_name("pair-persistent.py")
)
pairs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pairs)


def fixture(engine, ns):
    return {
        "engine": engine,
        "qualification_evidence": False,
        "bits": 200,
        "iterations": 1,
        "seed": 1,
        "missing_samples": [],
        "provenance": {"threads": 1, "sha256": {"runtime": "a" * 64}},
        "rows": [
            {
                "label": "example",
                "sample": 1,
                "coefficients": ["1", "0", "1"],
                "status": "ok",
                "controls": {
                    "hostname": "test",
                    "affinity": [2],
                    "memory_max": 4294967296,
                    "swap_max": 0,
                },
                "proof_policy": "conditional-grh",
                "producer_boundary": "persistent-process-fresh-field-not-proven-warm-JIT",
                "class_number": "1",
                "class_invariants": [],
                "discriminant": "-4",
                "signature": [0, 1],
                "torsion_order": "4",
                "worker_nanoseconds": str(ns),
            }
        ],
    }


class PairTests(unittest.TestCase):
    def test_missing_from_both_runs_is_retained(self):
        a, b = fixture("pari", 10**9), fixture("hecke", 10**9)
        for report in (a, b):
            report["missing_samples"] = [{"label": "absent", "sample": 1}]
        result = pairs.pair(a, b)
        self.assertEqual(len(result["rows"]), 2)
        self.assertEqual(result["rows"][0]["status"], "censored-or-missing")
        self.assertIsNone(result["rows"][0]["pari"])
        self.assertEqual(len(result["pairer_sha256"]), 64)

    def test_exact_threshold_and_failed_counterpart(self):
        a, b = fixture("pari", 10**9), fixture("hecke", 2 * 10**9)
        result = pairs.pair(a, b)
        self.assertFalse(result["qualification_evidence"])
        self.assertTrue(result["rows"][0]["reference_at_least_one_second"])
        b["rows"][0]["status"] = "timeout"
        row = pairs.pair(a, b)["rows"][0]
        self.assertEqual(row["status"], "censored-or-missing")
        self.assertNotIn("faster_worker_nanoseconds", row)

    def test_disagreement_is_not_a_cost_bucket(self):
        a, b = fixture("pari", 10**9), fixture("hecke", 10**9)
        b["rows"][0]["torsion_order"] = "2"
        self.assertEqual(
            pairs.pair(a, b)["rows"][0]["status"], "exact-summary-disagreement"
        )

    def test_mismatched_controls_and_duplicates_fail(self):
        a, b = fixture("pari", 10**9), fixture("hecke", 10**9)
        for key, value in (("hostname", "other"), ("affinity", [1]), ("memory_max", 0)):
            changed = copy.deepcopy(b)
            changed["rows"][0]["controls"][key] = value
            with self.assertRaises(ValueError):
                pairs.pair(a, changed)
        b["rows"].append(copy.deepcopy(b["rows"][0]))
        with self.assertRaises(ValueError):
            pairs.pair(a, b)


if __name__ == "__main__":
    unittest.main()
