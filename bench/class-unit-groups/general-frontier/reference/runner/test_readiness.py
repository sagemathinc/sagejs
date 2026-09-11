import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "readiness", Path(__file__).with_name("discovery-readiness.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReadinessTests(unittest.TestCase):
    def test_degree_cap_not_raw_expensive_count(self):
        rows = [
            {
                "label": f"10.0.{1000 + i}.1",
                "status": "paired-discovery",
                "faster_worker_nanoseconds": "10000000000",
            }
            for i in range(60)
        ]
        result = module.readiness([{"rows": rows}])
        self.assertEqual(result["one_second_panel_upper_bound"], 40)
        self.assertEqual(result["necessary_one_second_shortfall"], 80)
        self.assertFalse(result["qualification_evidence"])

    def test_failures_and_unreconciled_supplements_do_not_fill_cost_quota(self):
        result = module.readiness(
            [
                {
                    "rows": [
                        {"label": "3.3.49.1", "status": "censored-or-missing"},
                        {
                            "label": "supplement-a",
                            "status": "paired-discovery",
                            "faster_worker_nanoseconds": "10000000000",
                        },
                    ]
                }
            ]
        )
        self.assertEqual(result["one_second_panel_upper_bound"], 0)
        self.assertEqual(result["unclassified_field_identities"], ["supplement-a"])

    def test_repeated_attempts_require_reconciliation(self):
        report = {"rows": [{"label": "3.3.49.1", "status": "censored-or-missing"}]}
        with self.assertRaises(ValueError):
            module.readiness([report, report])


if __name__ == "__main__":
    unittest.main()
