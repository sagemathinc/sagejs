import importlib.util
import json
from pathlib import Path
import tempfile
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
    def test_partial_multisample_run_preserves_missing_samples(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            run = {
                "engine": "pari",
                "records": [receipt()["record"]],
                "bits": 200,
                "iterations": 1,
                "samples": 3,
                "provenance": {"test_identity": "original"},
            }
            (directory / "run.json").write_text(json.dumps(run))
            for sample in (1, 2):
                r = receipt()
                name = f"sample-{sample:04}-example"
                r.update(
                    schema="sagejs.general-frontier-persistent-screen.v1",
                    stage="sample",
                    qualification_evidence=False,
                    bits=200,
                    iterations=1,
                    sample=sample,
                    declared_samples=3,
                    request_id=name,
                    provenance=run["provenance"],
                )
                r["stdout"] = r["stdout"].replace("|example|", f"|{name}|")
                (directory / f"{name}.json").write_text(json.dumps(r))
            result = review.summarize(directory)
            self.assertEqual(len(result["rows"]), 2)
            self.assertEqual(
                result["missing_samples"], [{"label": "example", "sample": 3}]
            )
            r["bits"] = 100
            (directory / f"{name}.json").write_text(json.dumps(r))
            with self.assertRaises(ValueError):
                review.summarize(directory)

            r["bits"] = 200
            r["provenance"] = run["provenance"]
            r.update(status="interrupted", pending_reservation={"seconds": 70})
            (directory / f"{name}.json").write_text(json.dumps(r))
            result = review.summarize(directory)
            self.assertEqual([x["sample"] for x in result["missing_samples"]], [2, 3])
            self.assertEqual(result["rows"][1]["status"], "interrupted")
            (directory / "duplicate.json").write_text(json.dumps(r))
            with self.assertRaises(ValueError):
                review.summarize(directory)
            (directory / "duplicate.json").unlink()
            r["bits"] = 200
            r["provenance"] = {"test_identity": "foreign"}
            (directory / f"{name}.json").write_text(json.dumps(r))
            with self.assertRaises(ValueError):
                review.summarize(directory)

    def test_exact_order_and_normalization(self):
        row = review.normalize(receipt("8", "[4, 2]"))
        self.assertEqual(row["class_invariants"], ["2", "4"])
        self.assertEqual(row["worker_nanoseconds"], "10000000")
        self.assertEqual(
            row["regulator"]["guarantee"], "working-precision-approximation"
        )

    def test_rejects_mixed_legacy_and_invalid_status_or_duration(self):
        for update in (
            {"iterations": 3, "bits": 100, "sample": 2},
            {"status": "invented"},
            {"wall_seconds": -5},
            {"wall_seconds": float("nan")},
        ):
            r = receipt()
            r.update(update)
            with self.assertRaises(ValueError):
                review.normalize(r)

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

    def test_explicit_batch_identity_and_precision(self):
        r = receipt()
        r.update(
            bits=100,
            iterations=3,
            sample=2,
            declared_samples=3,
            request_id="sample-0002-example",
        )
        r["stdout"] = (
            r["stdout"]
            .replace("|example|", "|sample-0002-example|")
            .replace("|200|1|", "|100|3|")
        )
        row = review.normalize(r)
        self.assertEqual(row["status"], "ok")
        self.assertEqual(row["iterations"], 3)
        self.assertEqual(row["worker_nanoseconds"], "10000000")
        self.assertEqual(row["timing_boundary"], "whole-fresh-field-batch")
        r["sample"] = 1
        with self.assertRaises(ValueError):
            review.normalize(r)

    def test_invalid_parameters_are_rejected_even_on_timeout(self):
        for key, value in (("bits", True), ("iterations", 0), ("sample", 6)):
            r = receipt()
            r.update(status="timeout")
            r[key] = value
            with self.assertRaises(ValueError):
                review.normalize(r)


if __name__ == "__main__":
    unittest.main()
