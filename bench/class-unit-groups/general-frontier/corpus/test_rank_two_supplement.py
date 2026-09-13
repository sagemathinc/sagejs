"""Offline regressions for the exact rank-two supplemental candidate policy."""

import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import rank_two_supplement as supplement


class SupplementTests(unittest.TestCase):
    def test_complete_bounded_policy(self):
        value = supplement.generate()
        self.assertEqual(value["polynomial_candidate_count"], 112)
        self.assertEqual(len({row["label"] for row in value["records"]}), 112)
        self.assertIsNone(value["distinct_field_count"])
        self.assertEqual(supplement.validate(value), value)
        self.assertEqual(supplement.generate(), value)
        self.assertEqual(
            supplement.policy()["coverage_targets_per_degree"],
            {"development": 120, "holdout": 80},
        )

    def test_all_exact_signatures_and_coefficients(self):
        value = supplement.generate()
        for row in value["records"]:
            coefficients = [int(c) for c in row["coefficients"]]
            self.assertEqual(coefficients[-1], 1)
            self.assertTrue(all(c % 2 == 0 for c in coefficients[:-1]))
            self.assertEqual(coefficients[0] % 4, 2)
            self.assertEqual(row["signature"], [3, 0] if row["degree"] == 3 else [2, 1])
            self.assertEqual(row["unit_rank"], 2)
            equation_disc = int(row["equation_discriminant"])
            self.assertGreater(
                equation_disc if row["degree"] == 3 else -equation_disc, 0
            )
            self.assertIsNone(row["discriminant_absolute"])
            self.assertIsNone(row["field_identity"])
            self.assertIsNone(row["class_number"])
            self.assertIsNone(row["class_group"])
            self.assertIsNone(row["regulator"])
            self.assertIsNone(row["holdout_eligible"])
            self.assertIsNone(row["final_role"])
        largest = supplement.make_record(supplement.FAMILIES[1], 20, 7)
        self.assertTrue(any(abs(int(c)) > 2**53 for c in largest["coefficients"]))
        self.assertEqual(json.loads(json.dumps(largest)), largest)

    def test_labels_are_exact_coefficient_identities(self):
        row = supplement.make_record(supplement.FAMILIES[0], 4, 0)
        expected = supplement.digest(
            {
                "schema": "sagejs.monic-polynomial-coefficients.v1",
                "degree": 3,
                "coefficients": ["20002", "-20002", "0", "1"],
            }
        )
        self.assertEqual(row["label"], "generated-sha256-" + expected)
        self.assertNotEqual(
            row["label"], supplement.make_record(supplement.FAMILIES[0], 4, 1)["label"]
        )

    def test_failed_elementary_obligations(self):
        cubic, quartic = supplement.FAMILIES
        for family, coefficients in [
            (cubic, ["2", "-2", "0", "1"]),  # Negative cubic discriminant.
            (cubic, ["4", "-20002", "0", "1"]),  # Constant divisible by 4.
            (cubic, ["2", "-20001", "0", "1"]),  # Odd coefficient.
            (cubic, ["2", "-20002", "2", "1"]),  # Not depressed cubic.
            (cubic, ["02", "-20002", "0", "1"]),
            (cubic, [2, "-20002", "0", "1"]),
            (cubic, ["2", "-20002", "0", "2"]),
            (quartic, ["2", "-2", "0", "0", "1"]),  # Positive constant.
            (quartic, ["-2", "2", "0", "0", "1"]),
            (quartic, ["-2", "-2", "2", "0", "1"]),
        ]:
            with self.subTest(family=family, coefficients=coefficients):
                with self.assertRaises(ValueError):
                    supplement.elementary_certificate(family, coefficients)

    def test_out_of_policy_parameters_and_safety_caps(self):
        for arguments in [
            ("unknown", 4, 0),
            (supplement.FAMILIES[0], 5, 0),
            (supplement.FAMILIES[0], 4, 8),
            (supplement.FAMILIES[0], 4, -1),
            (supplement.FAMILIES[0], 4, True),
        ]:
            with self.assertRaises(ValueError):
                supplement.coefficient_vector(*arguments)
        with patch.object(supplement, "SAMPLES_PER_CELL", 9):
            with self.assertRaisesRegex(ValueError, "samples-per-cell"):
                supplement.generate()
        with patch.object(supplement, "COUNT_CAP", 100):
            with self.assertRaisesRegex(ValueError, "candidate-count"):
                supplement.generate()

    def test_tampering_and_unsupported_versions_fail(self):
        original = supplement.generate()
        mutations = [
            lambda value: value.update(schema="sagejs.rank-two-supplement.v0"),
            lambda value: value.update(distinct_field_count=112),
            lambda value: value["records"][0].update(holdout_eligible=True),
            lambda value: value["records"][0].update(class_number="1"),
            lambda value: value["records"][0]["coefficients"].__setitem__(0, "20006"),
            lambda value: value["records"].reverse(),
        ]
        for mutation in mutations:
            value = copy.deepcopy(original)
            mutation(value)
            with self.assertRaises(ValueError):
                supplement.validate(value)

    def test_offline_cli_and_existing_output_preserved(self):
        with tempfile.TemporaryDirectory(prefix="sagejs-rank-two-") as directory:
            output = Path(directory) / "supplement.json"
            supplement.main(["generate", "--output", str(output)])
            original = output.read_bytes()
            supplement.main(["check", "--fixture", str(output)])
            with self.assertRaises(FileExistsError):
                supplement.main(["generate", "--output", str(output)])
            self.assertEqual(output.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
