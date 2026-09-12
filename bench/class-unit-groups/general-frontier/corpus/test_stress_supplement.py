"""Offline policy, algebraic-certificate and immutable-corpus regressions."""

from collections import Counter
from contextlib import redirect_stderr, redirect_stdout
import copy
from fractions import Fraction
import hashlib
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import rank_two_supplement as rank_two
import stress_supplement as supplement


HERE = Path(__file__).resolve().parent


# Small test-only versions of the exact rational Sturm/Sylvester checks used
# by the prior generated-admission audit. No producer certificate is consulted.
def determinant(matrix):
    values = [[Fraction(x) for x in row] for row in matrix]
    answer = Fraction(1)
    for column in range(len(values)):
        pivot = next((i for i in range(column, len(values)) if values[i][column]), None)
        if pivot is None:
            return Fraction(0)
        if pivot != column:
            values[column], values[pivot] = values[pivot], values[column]
            answer = -answer
        entry = values[column][column]
        answer *= entry
        for i in range(column + 1, len(values)):
            quotient = values[i][column] / entry
            values[i] = [x - quotient * y for x, y in zip(values[i], values[column])]
    return answer


def equation_discriminant(coefficients):
    degree = len(coefficients) - 1
    polynomial = list(reversed(coefficients))
    derivative = [i * coefficients[i] for i in range(1, degree + 1)][::-1]
    matrix = [[0] * i + polynomial + [0] * (degree - 2 - i) for i in range(degree - 1)]
    matrix += [[0] * i + derivative + [0] * (degree - 1 - i) for i in range(degree)]
    return (-1) ** (degree * (degree - 1) // 2) * determinant(matrix)


def real_root_count(coefficients):
    def remainder(left, right):
        left = list(left)
        while left and len(left) >= len(right):
            offset, quotient = len(left) - len(right), left[-1] / right[-1]
            for i, value in enumerate(right):
                left[offset + i] -= quotient * value
            while left and left[-1] == 0:
                left.pop()
        return left

    polynomial = [Fraction(x) for x in coefficients]
    sequence = [polynomial, [i * polynomial[i] for i in range(1, len(polynomial))]]
    while len(sequence[-1]) > 1:
        row = [-x for x in remainder(sequence[-2], sequence[-1])]
        if not row:
            raise ValueError("test oracle requires a squarefree polynomial")
        sequence.append(row)

    def variations(at):
        signs = [(1 if row[-1] > 0 else -1) * at ** (len(row) - 1) for row in sequence]
        return sum(left != right for left, right in zip(signs, signs[1:]))

    return variations(-1) - variations(1)


def rehash(value):
    value["policy_sha256"] = supplement.digest(value["policy"])
    for row in value["records"]:
        row["source"]["policy_sha256"] = value["policy_sha256"]
    value["records_sha256"] = supplement.digest(value["records"])
    value["export_sha256"] = supplement.digest(
        {key: item for key, item in value.items() if key != "export_sha256"}
    )


class StressSupplementTests(unittest.TestCase):
    def test_complete_grid_roles_and_determinism(self):
        value = supplement.generate()
        self.assertEqual(value, supplement.generate())
        self.assertIs(supplement.validate(value), value)
        self.assertEqual(value["polynomial_candidate_count"], 36)
        self.assertEqual(
            Counter(row["degree"] for row in value["records"]), {2: 20, 5: 16}
        )
        self.assertEqual(
            Counter(row["queue_role"] for row in value["records"]),
            {"primary-candidate": 18, "reserve-candidate": 18},
        )
        self.assertEqual(len({row["label"] for row in value["records"]}), 36)
        self.assertEqual(
            Counter(tuple(row["signature"]) for row in value["records"]),
            {(2, 0): 10, (0, 1): 10, (3, 1): 16},
        )
        self.assertFalse(value["stress_selection_frozen"])
        self.assertFalse(value["qualification_evidence"])
        self.assertIsNone(value["distinct_field_count"])
        for key, expected in {
            "policy_sha256": "899344df4c76d1d2e1b16f2400a14dbd0825077fb7a87de55689a74cd882f891",
            "records_sha256": "dbd6f1e30646d4b2708a42071484fc9f61f77edb24d8bd84ac1b39c43ea3ae8d",
            "export_sha256": "56c7fbe15c5c3ce5fc373aaaa714061653e6080d356b6b0b31150d4cc7988d44",
        }.items():
            self.assertEqual(value[key], expected, key)

    def test_independent_oracle_known_polynomials(self):
        for coefficients, roots, discriminant in (
            ([-2, 0, 1], 2, 8),
            ([2, 0, 1], 0, -8),
            ([0, -1, 0, 1], 3, 4),
            ([1, 0, 0, 0, 1], 0, 256),
            ([0, -1, 0, 0, 0, 1], 3, -256),
        ):
            self.assertEqual(real_root_count(coefficients), roots)
            self.assertEqual(equation_discriminant(coefficients), discriminant)
        self.assertEqual(equation_discriminant([0, 0, 1]), 0)
        with self.assertRaisesRegex(ValueError, "squarefree"):
            real_root_count([0, 0, 1])

    def test_independent_sturm_resultant_and_eisenstein(self):
        for row in supplement.generate()["records"]:
            with self.subTest(label=row["label"]):
                coefficients = list(map(int, row["coefficients"]))
                self.assertEqual(coefficients[-1], 1)
                self.assertTrue(all(value % 2 == 0 for value in coefficients[:-1]))
                self.assertEqual(coefficients[0] % 4, 2)
                r1 = real_root_count(coefficients)
                self.assertEqual(row["signature"], [r1, (row["degree"] - r1) // 2])
                self.assertEqual(row["unit_rank"], sum(row["signature"]) - 1)
                self.assertEqual(
                    equation_discriminant(coefficients),
                    int(row["equation_discriminant"]),
                )
                self.assertEqual(
                    row["elementary_certificate"]["signature"], row["signature"]
                )

    def test_source_only_nulls_and_exact_large_integer_transport(self):
        for row in supplement.generate()["records"]:
            for name in (
                "field_discriminant",
                "discriminant_absolute",
                "equation_order_index",
                "field_identity",
                "class_number",
                "class_group",
                "regulator",
                "used_grh",
                "holdout_eligible",
                "stress_eligible",
                "unconditional_eligible",
                "final_role",
            ):
                self.assertIsNone(row[name], name)
            self.assertFalse(
                row["elementary_certificate"]["field_discriminant_certified"]
            )
            self.assertEqual(row["reference_time_band"], "pending")
            self.assertEqual(json.loads(json.dumps(row)), row)
        largest = supplement.make_record(supplement.FAMILIES[0], 28, 0)
        self.assertGreater(abs(int(largest["coefficients"][0])), 2**53)

    def test_domain_separated_coefficient_identity(self):
        row = supplement.make_record(supplement.FAMILIES[0], 12, 0)
        self.assertEqual(row["coefficients"], ["-2000000000002", "0", "1"])
        body = {
            "schema": "sagejs.monic-polynomial-coefficients.v1",
            "degree": 2,
            "coefficients": row["coefficients"],
        }
        expected = hashlib.sha256(
            json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        self.assertEqual(row["label"], "generated-sha256-" + expected)
        self.assertEqual(row["coefficient_sha256"], expected)
        self.assertFalse(
            {r["label"] for r in supplement.generate()["records"]}
            & {r["label"] for r in rank_two.generate()["records"]}
        )

    def test_bad_parameters_and_count_bounds(self):
        for arguments in [
            ("unknown", 12, 0),
            (supplement.FAMILIES[0], 13, 0),
            (supplement.FAMILIES[0], True, 0),
            (supplement.FAMILIES[0], 12, True),
            (supplement.FAMILIES[0], 12, 2),
            (supplement.FAMILIES[2], 4, 4),
            (supplement.FAMILIES[2], 4, -1),
        ]:
            with self.assertRaises(ValueError):
                supplement.coefficient_vector(*arguments)
        with patch.object(supplement, "COUNT_CAP", 35):
            with self.assertRaisesRegex(ValueError, "candidate-count"):
                supplement.generate()

    def test_failed_elementary_certificates(self):
        real, imaginary, quintic = supplement.FAMILIES
        for family, coefficients in [
            (real, ["-4", "0", "1"]),
            (real, ["-2", "1", "1"]),
            (real, ["2", "0", "1"]),
            (imaginary, ["-2", "0", "1"]),
            (real, ["-02", "0", "1"]),
            (real, [-2, "0", "1"]),
            (real, ["-2", "0", "2"]),
            (real, ["-" + "2" * 129, "0", "1"]),
            (quintic, ["2", "-2", "0", "0", "0", "1"]),
            (quintic, ["2", "-20002", "2", "0", "0", "1"]),
            (quintic, ["-2", "-20002", "0", "0", "0", "1"]),
        ]:
            with self.subTest(family=family, coefficients=coefficients):
                with self.assertRaises(ValueError):
                    supplement.elementary_certificate(family, coefficients)

    def test_rehashed_mutations_do_not_create_authority(self):
        mutations = [
            lambda x: x.update(schema=rank_two.SCHEMA),
            lambda x: x.update(distinct_field_count=36),
            lambda x: x.update(stress_selection_frozen=True),
            lambda x: x["policy"]["quadratic_decimal_scales"].append(32),
            lambda x: x["records"].reverse(),
            lambda x: x["records"].pop(),
            lambda x: x["records"][0].update(queue_role="reserve-candidate"),
            lambda x: x["records"][0].update(class_number="1"),
            lambda x: x["records"][0].update(holdout_eligible=True),
            lambda x: x["records"][0].update(unconditional_eligible=True),
            lambda x: x["records"][0].update(
                field_discriminant=x["records"][0]["equation_discriminant"]
            ),
            lambda x: x["records"][0]["coefficients"].__setitem__(0, "-2000000000010"),
            lambda x: x["records"][0]["elementary_certificate"].update(
                signature=[0, 1]
            ),
        ]
        for mutate in mutations:
            value = copy.deepcopy(supplement.generate())
            mutate(value)
            rehash(value)
            with self.assertRaises(ValueError):
                supplement.validate(value)
        with self.assertRaises(ValueError):
            rank_two.validate(supplement.generate())
        with self.assertRaises(ValueError):
            supplement.validate(rank_two.generate())

    def test_old_export_and_frozen_membership_bytes_unchanged(self):
        self.assertEqual(
            rank_two.generate()["export_sha256"],
            "d2f9ff5edae1b507667baaec70aee0ac4f37b410bfa0e2fa74e83996a05fad1e",
        )
        old_export = (json.dumps(rank_two.generate(), indent=2) + "\n").encode()
        self.assertEqual(
            hashlib.sha256(old_export).hexdigest(),
            "8e7a63a7abfb21f2f4bf1b370ba526d17ee48b2a4af533a2c5bd8f55a75f5141",
        )
        for name, expected in {
            "rank_two_supplement.py": "25d0fc16caaad16ba40d33f5a82a9160880c0ab01db3e22d565ec9db78c413be",
            "frozen/coverage.jsonl": "b53a7084f53c7dd6cb6911423daacb7f2103fb6cb075f13da2534eb0aa62f948",
            "frozen/observations.jsonl": "de1f90c7f9d719e68cc397a34958b835c9425a035d1fdfbb4f10c972f7101060",
            "frozen/manifest.json": "29e13dfbd25807dd5e1737585ab7e207594b53d6b55bc0da3380333f9f61358a",
        }.items():
            self.assertEqual(
                hashlib.sha256((HERE / name).read_bytes()).hexdigest(), expected, name
            )

    def test_cli_exclusive_output_and_offline_check(self):
        with tempfile.TemporaryDirectory(prefix="sagejs-stress-") as directory:
            output = Path(directory) / "export.json"
            with redirect_stdout(StringIO()) as printed:
                supplement.main(["plan"])
                self.assertEqual(json.loads(printed.getvalue()), supplement.policy())
            with redirect_stdout(StringIO()):
                supplement.main(["generate", "--output", str(output)])
                original = output.read_bytes()
                supplement.main(["check", "--fixture", str(output)])
            self.assertLess(len(original), supplement.MAX_EXPORT_BYTES)
            self.assertEqual(
                original, (json.dumps(supplement.generate(), indent=2) + "\n").encode()
            )
            with self.assertRaises(FileExistsError):
                supplement.write_export(output, supplement.generate())
            self.assertEqual(output.read_bytes(), original)
            with patch.object(supplement, "MAX_EXPORT_BYTES", 8):
                with self.assertRaisesRegex(ValueError, "byte limit"):
                    supplement.read_fixture(output)
            malformed = Path(directory) / "duplicate.json"
            malformed.write_text('{"schema":"first","schema":"second"}')
            with self.assertRaisesRegex(ValueError, "duplicate"):
                supplement.read_fixture(malformed)
            partial = Path(directory) / "partial.json"
            with patch.object(
                supplement.json, "dump", side_effect=OSError("write failed")
            ):
                with self.assertRaises(OSError):
                    supplement.write_export(partial, supplement.generate())
            self.assertFalse(partial.exists())
            self.assertEqual(output.read_bytes(), original)

    def test_cli_does_not_accept_policy_or_ambiguous_output_overrides(self):
        for arguments in (
            ["plan", "--output", "unused"],
            ["generate"],
            ["generate", "--output", "unused", "--fixture", "unused"],
            ["check"],
            ["check", "--fixture", "unused", "--output", "unused"],
            ["generate", "--output", "unused", "--count", "37"],
            ["generate", "--output", "unused", "--scale", "32"],
        ):
            with redirect_stderr(StringIO()), self.assertRaises(SystemExit) as error:
                supplement.main(arguments)
            self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
