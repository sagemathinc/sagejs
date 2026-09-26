#!/usr/bin/env python3

import json
import pathlib
import subprocess
import unittest

HERE = pathlib.Path(__file__).resolve().parent
CORPUS = HERE.parent / "corpus" / "initial-open-development-v1.json"


class PariControlTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([str(HERE / "build.py")], check=True, stdout=subprocess.DEVNULL)

    def run_control(self, boundary):
        completed = subprocess.run(
            [
                str(HERE / "run.py"),
                "--input",
                str(CORPUS),
                "--field-id",
                "small-class-number-6",
                "--boundary",
                boundary,
                "--seed",
                "benchmark-seed-is-not-required-to-be-decimal",
            ],
            check=True,
            text=True,
            capture_output=True,
        )
        return json.loads(completed.stdout)

    def test_all_boundaries_are_distinct_and_exact(self):
        samples = {
            boundary: self.run_control(boundary)
            for boundary in ("algorithm-stage", "prepared-field", "public-call")
        }
        self.assertEqual(
            len({sample["boundaryLabel"] for sample in samples.values()}), 3
        )
        for sample in samples.values():
            self.assertEqual(
                sample["result"], {"classNumber": "6", "invariantFactors": ["6"]}
            )
            self.assertEqual(sample["controlIdentity"]["pariVersion"], "2.17.4")
            self.assertEqual(
                sample["call"]["seed"], "benchmark-seed-is-not-required-to-be-decimal"
            )
            self.assertGreater(int(sample["kernelNanoseconds"]), 0)
        self.assertFalse(samples["algorithm-stage"]["call"]["preparationIncluded"])
        self.assertFalse(samples["prepared-field"]["call"]["preparationIncluded"])
        self.assertTrue(samples["public-call"]["call"]["preparationIncluded"])


if __name__ == "__main__":
    unittest.main()
