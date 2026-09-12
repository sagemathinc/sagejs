"""Offline versioned Hecke witness shapes; no mathematical or timing claims."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "witness_supervisor", Path(__file__).parents[1] / "persistent/supervisor.py"
)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)

spec = importlib.util.spec_from_file_location(
    "witness_review", Path(__file__).with_name("summarize-persistent.py")
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)

SEMANTICS = "ideal-equals-principal-witness-times-literal-class-generator-product"


def answer(version=2):
    basis = [["1", "0"], ["0", "1"]]
    witness_key = "generator_product_witness" if version == 2 else "witness"
    decomposition = {
        "coordinates": ["1"],
        "representative": basis,
        witness_key: [{"factor": ["1", "0"], "exponent": "1"}],
    }
    result = {
        "schema": f"sagejs-hecke-frontier-screen-v{version}",
        "id": "field",
        "bits": 200,
        "iterations": 1,
        "elapsed_ns": "1",
        "proof_policy": "conditional-grh",
        "independent_replay": False,
        "compact": {
            "class_number": "2",
            "discriminant": "-20",
            "class_invariants": ["2"],
            "signature": [0, 1],
            "torsion_order": "2",
            "integral_basis": basis,
            "class_generators": [basis],
            "class_coordinates": [["1"]],
            "class_decompositions": [copy.deepcopy(decomposition)],
            "class_power_witnesses": [{"exponent": "2", "witness": []}],
            "units": [[]],
            "unit_invariants": ["2"],
            "unit_coordinates": [["1"]],
            "probes": [basis, basis, basis],
            "decompositions": [copy.deepcopy(decomposition) for _ in range(3)],
            "regulator": {
                "bits": 200,
                "guarantee": "absolute-radius-less-than-2^-bits",
                "lower": "1",
                "upper": "1",
            },
        },
    }
    if version == 2:
        result["witness_semantics"] = SEMANTICS
    return {"status": "ok", "result": result}


def check(value):
    return supervisor.validate_answer(
        "hecke", {"status": "ok", "stdout": json.dumps(value), "stderr": ""}, "field", 2
    )


class WitnessSchemas(unittest.TestCase):
    def test_normalized_rows_preserve_versioned_unqualified_meaning(self):
        for version in (1, 2):
            value = answer(version)
            # An added v2 label must never upgrade a historical v1 witness.
            value["result"]["witness_semantics"] = SEMANTICS
            receipt = {
                "schema": "sagejs.general-frontier-persistent-screen.v1",
                "record": {"label": "field", "coefficients": ["5", "0", "1"]},
                "stage": "sample",
                "engine": "hecke",
                "status": "ok",
                "wall_seconds": 0.01,
                "stdout": json.dumps(value),
                "stderr": "",
                "qualification_evidence": False,
                "provenance": {"test_identity": "versioned-witness"},
            }
            with tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                run = {
                    "engine": "hecke",
                    "records": [receipt["record"]],
                    "provenance": receipt["provenance"],
                }
                (directory / "run.json").write_text(json.dumps(run))
                (directory / "field.json").write_text(json.dumps(receipt))
                result = review.summarize(directory)
            self.assertFalse(result["qualification_evidence"])
            self.assertFalse(result["independent_replay"])
            row = result["rows"][0]
            self.assertEqual(row["status"], "ok")
            self.assertEqual(row["worker_schema"], value["result"]["schema"])
            expected = (
                SEMANTICS
                if version == 2
                else "ideal-equals-principal-witness-times-returned-class-map-representative"
            )
            self.assertEqual(row["witness_semantics"], expected)

    def test_both_versions_remain_structural_unqualified_screens(self):
        for version in (1, 2):
            value = answer(version)
            self.assertEqual(check(value), "ok")
            self.assertFalse(value["result"]["independent_replay"])
        for coordinates in (["-1"], ["0"]):
            value = answer()
            value["result"]["compact"]["decompositions"][0]["coordinates"] = coordinates
            self.assertEqual(check(value), "ok")

    def test_unknown_or_spliced_versions_fail(self):
        for version in (0, 4, "unknown"):
            value = answer()
            value["result"]["schema"] = f"sagejs-hecke-frontier-screen-v{version}"
            self.assertNotEqual(check(value), "ok")
            self.assertFalse(supervisor.validate_hecke_shape(json.dumps(value), 2))
        for original, changed in ((1, 2), (2, 1)):
            value = answer(original)
            value["result"]["schema"] = f"sagejs-hecke-frontier-screen-v{changed}"
            value["result"]["witness_semantics"] = SEMANTICS
            self.assertNotEqual(check(value), "ok")

    def test_v2_semantics_and_proof_labels_are_exact(self):
        for key, value in (
            ("witness_semantics", None),
            ("witness_semantics", "ideal-equals-witness-times-representative"),
            ("proof_policy", "unconditional"),
            ("independent_replay", True),
        ):
            changed = answer()
            changed["result"][key] = value
            self.assertNotEqual(check(changed), "ok")

    def test_witness_shapes_cannot_be_reinterpreted(self):
        for collection in ("decompositions", "class_decompositions"):
            for mutation in (
                lambda d: d.pop("generator_product_witness"),
                lambda d: d.update(witness=[]),
                lambda d: d.update(coordinates=[]),
                lambda d: d.update(coordinates=[True]),
                lambda d: d.update(coordinates=["1/2"]),
                lambda d: d.update(generator_product_witness="trusted"),
                lambda d: d.update(
                    generator_product_witness=[{"factor": ["1"], "exponent": "1"}]
                ),
                lambda d: d.update(
                    generator_product_witness=[{"factor": ["1", "0"], "exponent": 1}]
                ),
            ):
                value = answer()
                mutation(value["result"]["compact"][collection][0])
                self.assertNotEqual(check(value), "ok")
        old = answer(1)
        old["result"]["compact"]["decompositions"][0]["generator_product_witness"] = []
        self.assertNotEqual(check(old), "ok")


if __name__ == "__main__":
    unittest.main()
