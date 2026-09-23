from __future__ import annotations

import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from verify_relations import VerificationError, verify_documents


HERE = Path(__file__).resolve().parent
CRATE = HERE.parents[1]


class RelationVerifierIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.neutral = json.loads(
            (CRATE / "corpus" / "class-number-2.json").read_text(encoding="utf-8")
        )
        runtime_input = dict(cls.neutral)
        runtime_input["includeWitnesses"] = True
        runtime_input["samples"] = 1
        binary = (
            CRATE / "target" / "release" / "sagejs-pari-class-group-rust-experiment"
        )
        if not binary.is_file():
            subprocess.run(
                [
                    "cargo",
                    "build",
                    "--release",
                    "--manifest-path",
                    str(CRATE / "Cargo.toml"),
                ],
                check=True,
            )
        with tempfile.TemporaryDirectory(prefix="rust-class-group-test-") as temporary:
            input_path = Path(temporary) / "input.json"
            input_path.write_text(json.dumps(runtime_input), encoding="utf-8")
            completed = subprocess.run(
                [
                    str(binary),
                    "brute-force-cubic",
                    str(input_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        cls.result = json.loads(completed.stdout)

    def test_accepts_all_independently_factored_rows(self) -> None:
        report = verify_documents(self.neutral, self.result)
        self.assertTrue(report["verified"])
        self.assertEqual(report["factorBasePrimeIdealsVerified"], 7)
        self.assertEqual(report["relationRowsVerified"], 27)

    def test_rejects_a_tampered_relation_exponent(self) -> None:
        tampered = copy.deepcopy(self.result)
        tampered["witnesses"]["relations"][0] += 1
        with self.assertRaisesRegex(VerificationError, "valuation row mismatch"):
            verify_documents(self.neutral, tampered)

    def test_rejects_a_tampered_prime_ideal_hnf(self) -> None:
        tampered = copy.deepcopy(self.result)
        tampered["witnesses"]["primeIdeals"][0]["hnf"][0] += 1
        with self.assertRaisesRegex(VerificationError, "define different ideals"):
            verify_documents(self.neutral, tampered)


if __name__ == "__main__":
    unittest.main()
