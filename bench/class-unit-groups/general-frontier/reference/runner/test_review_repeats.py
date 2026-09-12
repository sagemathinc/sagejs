"""Offline repeat report tests using the real retained-member normalizer."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import test_batch_evidence as fixtures

spec = importlib.util.spec_from_file_location(
    "repeats", Path(__file__).with_name("review-repeats.py")
)
repeats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repeats)


class Repeats(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.plan = {
            "schema": "sagejs.reference-repeat-plan.v1",
            "controls": {
                "hostname": "fixture",
                "affinity": [2],
                "memory_max": 4294967296,
                "swap_max": 0,
            },
            "runs": [],
        }
        self.custody = {"schema": "sagejs.reference-repeat-custody.v1", "runs": {}}
        for engine in ("pari", "hecke"):
            for bits in (100, 200):
                name = f"{engine}-{bits}"
                path = self.root / name
                path.mkdir()
                request = dict(
                    engine=engine,
                    bits=bits,
                    iterations=2,
                    samples=3,
                    seed=1,
                    requested_proof_policy="unconditional",
                    records=[{"label": "field", "coefficients": ["5", "0", "1"]}],
                    provenance={"threads": 1, "sha256": {"fixture": "a" * 64}},
                )
                self.plan["runs"].append(
                    dict(id=name, request=request, timing_class="seconds")
                )
                raw = json.dumps(
                    dict(
                        schema="sagejs.general-frontier-persistent-request.v2",
                        **request,
                    )
                ).encode()
                (path / "run.json").write_bytes(raw)
                self.custody["runs"][name] = {
                    "directory": name,
                    "run_sha256": repeats.digest(raw),
                }
                for sample in range(1, 4):
                    value = fixtures.fixture(engine, "unconditional", bits, 2)
                    value["id"] = f"sample-{sample:04}-field"
                    if engine == "hecke":
                        value["elapsed_ns"] = "1000000000"
                    receipt = fixtures.policy_tests.receipt(engine, "unconditional")
                    receipt.update(
                        bits=bits,
                        iterations=2,
                        declared_samples=3,
                        sample=sample,
                        request_id=value["id"],
                        provenance=request["provenance"],
                        controls=self.plan["controls"],
                        boundary="persistent-process-fresh-field-not-proven-warm-JIT",
                        stdout=fixtures.policy_tests.output(engine, value),
                    )
                    (path / f"sample-{sample}.json").write_text(json.dumps(receipt))

    def run_review(self):
        raw = json.dumps(self.plan).encode()
        self.custody["plan_sha256"] = repeats.digest(raw)
        return repeats.review(raw, self.custody, self.root)

    def mutate(self, change, name="hecke-100", sample=1):
        path = self.root / name / f"sample-{sample}.json"
        receipt = json.loads(path.read_text())
        change(receipt)
        path.write_text(json.dumps(receipt))

    def test_all_members_preserved_without_qualification(self):
        report = self.run_review()
        self.assertEqual(report["eligible_samples"], 12, report["rejection_counts"])
        self.assertEqual(report["declared_sample_denominator"], 12)
        self.assertEqual(
            sum(len(c["row"]["iteration_outputs"]) for c in report["samples"]), 24
        )
        for key in (
            "qualification_evidence",
            "independent_replay",
            "warm_jit_qualification",
            "regulator_requests_mathematically_equivalent",
            "predeclaration_chronology_authenticated",
        ):
            self.assertIs(report[key], False)

    def test_early_member_corruption_is_not_hidden_by_last_member(self):
        def corrupt(r):
            result = json.loads(r["stdout"])
            result["result"]["iteration_outputs"][0]["compact"]["class_number"] = "999"
            r["stdout"] = json.dumps(result)

        self.mutate(corrupt)
        report = self.run_review()
        self.assertLess(report["eligible_samples"], 12)
        self.assertEqual(report["declared_sample_denominator"], 12)

    def test_failures_missing_samples_and_missing_run_keep_denominator(self):
        self.mutate(lambda r: r.update(status="timeout"))
        (self.root / "pari-100/sample-2.json").unlink()
        del self.custody["runs"]["pari-200"]
        report = self.run_review()
        self.assertEqual(report["declared_sample_denominator"], 12)
        self.assertEqual(report["rejection_counts"]["timeout"], 1)
        self.assertEqual(report["rejection_counts"]["missing-sample"], 1)
        self.assertEqual(report["rejection_counts"]["missing-run"], 3)
        pair = next(p for p in report["pairs"] if p["bits"] == 100)
        self.assertIsNone(
            pair["engine_timings"]["pari"]["median_worker_seconds_per_fresh_field"]
        )
        self.assertIsNone(
            pair["engine_timings"]["hecke"]["median_worker_seconds_per_fresh_field"]
        )

    def test_tiny_duration_uses_worker_not_outer_wall(self):
        self.plan["runs"][0]["timing_class"] = "tiny"
        self.mutate(lambda r: r.update(wall_seconds=1000), "pari-100")
        report = self.run_review()
        self.assertEqual(report["rejection_counts"]["inadequate-tiny-duration"], 3)

    def test_post_execution_request_change_cannot_reclassify(self):
        self.plan["runs"][0]["request"]["iterations"] = 3
        report = self.run_review()
        self.assertEqual(report["rejection_counts"]["rejected-run"], 3)

    def test_missing_precision_duplicate_cells_and_changed_polynomial_reject_plan(self):
        original = copy.deepcopy(self.plan)
        self.plan["runs"].pop()
        with self.assertRaises(ValueError):
            self.run_review()
        self.plan = copy.deepcopy(original)
        extra = copy.deepcopy(self.plan["runs"][0])
        extra["id"] = "extra"
        self.plan["runs"].append(extra)
        with self.assertRaises(ValueError):
            self.run_review()
        self.plan = original
        self.plan["runs"][0]["request"]["records"][0]["coefficients"][0] = "7"
        with self.assertRaises(ValueError):
            self.run_review()

    def test_hash_and_controls_tampering_rejected(self):
        self.custody["runs"]["pari-100"]["run_sha256"] = "b" * 64
        self.mutate(lambda r: r.update(controls={}))
        report = self.run_review()
        self.assertEqual(report["rejection_counts"]["rejected-run"], 3)
        self.assertEqual(report["rejection_counts"]["unmatched-controls"], 1)

    def test_reused_sample_identity_rejected(self):
        self.mutate(lambda r: r.update(request_id="sample-0001-field"), sample=2)
        report = self.run_review()
        self.assertEqual(report["rejection_counts"]["rejected-run"], 3)

    def test_exact_summary_disagreement_is_separate_from_sampling(self):
        def change(r):
            value = json.loads(r["stdout"])
            result = value["result"]
            result["compact"]["discriminant"] = "-24"
            for member in result["iteration_outputs"]:
                member["compact"]["discriminant"] = "-24"
            r["stdout"] = json.dumps(value)

        self.mutate(change)
        report = self.run_review()
        pair = next(p for p in report["pairs"] if p["bits"] == 100)
        self.assertTrue(pair["all_declared_samples_eligible"])
        self.assertFalse(pair["complete_eligible_exact_summary_pair"])

    def test_three_singleton_samples_are_allowed_with_full_payload(self):
        for entry in self.plan["runs"]:
            request = entry["request"]
            request["iterations"] = 1
            path = self.root / entry["id"]
            raw = json.dumps(
                dict(schema="sagejs.general-frontier-persistent-request.v2", **request)
            ).encode()
            (path / "run.json").write_bytes(raw)
            self.custody["runs"][entry["id"]]["run_sha256"] = repeats.digest(raw)
            for sample in range(1, 4):
                value = fixtures.policy_tests.result(
                    request["engine"], "unconditional", request["bits"]
                )
                value["id"] = f"sample-{sample:04}-field"
                self.mutate(
                    lambda r: r.update(
                        iterations=1,
                        stdout=fixtures.policy_tests.output(request["engine"], value),
                    ),
                    entry["id"],
                    sample,
                )
        report = self.run_review()
        self.assertEqual(report["eligible_samples"], 12, report["rejection_counts"])
        self.assertTrue(
            all(
                c["row"]["repeat_report_singleton_expansion"] for c in report["samples"]
            )
        )
        self.assertTrue(
            all(p["complete_eligible_exact_summary_pair"] for p in report["pairs"])
        )

    def test_two_samples_do_not_satisfy_seconds_requirement(self):
        for entry in self.plan["runs"]:
            request = entry["request"]
            request["samples"] = 2
            path = self.root / entry["id"]
            raw = json.dumps(
                dict(schema="sagejs.general-frontier-persistent-request.v2", **request)
            ).encode()
            (path / "run.json").write_bytes(raw)
            self.custody["runs"][entry["id"]]["run_sha256"] = repeats.digest(raw)
            (path / "sample-3.json").unlink()
            for sample in (1, 2):
                self.mutate(lambda r: r.update(declared_samples=2), entry["id"], sample)
        report = self.run_review()
        self.assertEqual(report["rejection_counts"]["insufficient-declared-samples"], 8)


if __name__ == "__main__":
    unittest.main()
