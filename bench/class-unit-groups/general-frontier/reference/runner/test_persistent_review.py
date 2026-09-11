import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "review", Path(__file__).with_name("summarize-persistent.py")
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def receipt(h="6", invariants="[6]"):
    return {
        "record": {"label": "example", "coefficients": ["1", "0", "1"]},
        "engine": "pari",
        "status": "ok",
        "wall_seconds": 0.01,
        "stdout": f"FRONTIER_RESULT|example|200|1|10|{h}|{invariants}|-4|[0, 1]|4|1\nFRONTIER_COMPACT|example|opaque\n",
        "stderr": "",
    }


class ReviewTests(unittest.TestCase):
    def test_exact_order_and_normalization(self):
        row = review.normalize(receipt("8", "[4, 2]"))
        self.assertEqual(row["class_invariants"], ["2", "4"])
        self.assertEqual(row["worker_nanoseconds"], "10000000")
        self.assertEqual(
            row["regulator"]["guarantee"], "working-precision-approximation"
        )

    def test_disagreement_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            review.normalize(receipt("5", "[6]"))
        with self.assertRaises(ValueError):
            review.normalize(receipt("6", "[2, 3]"))

    def test_timeouts_remain_censored(self):
        r = receipt()
        r["status"] = "timeout"
        row = review.normalize(r)
        self.assertEqual(row["status"], "timeout")
        self.assertNotIn("class_number", row)


if __name__ == "__main__":
    unittest.main()
