"""Offline algebra and fake-process identity tests; never start a CAS."""

import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

import check
import driver


def fixture(engine="pari"):
    return {
        "schema": "sagejs.reference-order-identity.v1",
        "engine": engine,
        "label": "field",
        "coefficients": ["4", "0", "1"],
        "signature": [0, 1],
        "discriminant": "-4",
        "index": "2",
        "basis": [["1", "0"], ["0", "1/2"]],
        "maximality": {
            "method": "pari-nfcertify"
            if engine == "pari"
            else "hecke-maximal-order-no-hints",
            "unresolved": [],
        },
        "independent_maximality_replay": False,
    }


def record():
    return {"label": "field", "coefficients": ["4", "0", "1"]}


class ExactIdentity(unittest.TestCase):
    def test_nonmonogenic_basis_and_unimodular_change(self):
        a, b = fixture(), fixture("hecke")
        b["basis"][1][0] = "1"
        result = check.compare(record(), a, b)
        self.assertTrue(result["paired_order_consistency"])
        self.assertTrue(result["both_engines_establish_maximality"])
        self.assertFalse(result["independent_maximality_replay"])
        self.assertFalse(result["distinct_field_admission"])

    def test_basis_discriminant_index_signature_and_closure_mutations(self):
        for mutation in (
            lambda x: x.update(discriminant="4"),
            lambda x: x.update(index="1"),
            lambda x: x.update(signature=[2, 0]),
            lambda x: x.update(signature=[False, 1]),
            lambda x: x["basis"][1].__setitem__(1, "0"),
            lambda x: x["basis"][1].__setitem__(1, "2/4"),
            lambda x: x["basis"][0].__setitem__(0, "2"),
            lambda x: x.update(independent_maximality_replay=True),
        ):
            value = fixture()
            mutation(value)
            with self.assertRaises(ValueError):
                check.validate(record(), value, "pari")
        value = fixture()
        value.update(coefficients=["1", "0", "1"], discriminant="-1")
        with self.assertRaisesRegex(ValueError, "not an order"):
            check.validate(
                {"label": "field", "coefficients": value["coefficients"]}, value, "pari"
            )

    def test_engine_claim_is_not_independent_maximality(self):
        value = fixture()
        value.update(basis=[["1", "0"], ["0", "1"]], index="1", discriminant="-16")
        # A consistent strict suborder cannot be ruled out by these identities.
        result = check.validate(record(), value, "pari")
        self.assertTrue(result["consistent_order"])
        self.assertFalse(result["independent_maximality_replay"])
        self.assertFalse(
            check.compare(record(), value, fixture("hecke"))["paired_order_consistency"]
        )

    def test_unresolved_pari_output_is_retained_not_established(self):
        value = fixture()
        value["maximality"]["unresolved"] = ["15"]
        self.assertFalse(
            check.validate(record(), value, "pari")["engine_established_maximality"]
        )
        self.assertFalse(
            check.compare(record(), value, fixture("hecke"))[
                "both_engines_establish_maximality"
            ]
        )

    def test_real_and_cubic_trace_discriminants(self):
        for coefficients, disc, signature in (
            (["-2", "0", "1"], "8", [2, 0]),
            (["-2", "0", "0", "1"], "-108", [1, 1]),
        ):
            value = fixture()
            n = len(coefficients) - 1
            value.update(
                coefficients=coefficients,
                discriminant=disc,
                signature=signature,
                index="1",
                basis=[[str(int(i == j)) for i in range(n)] for j in range(n)],
            )
            self.assertEqual(
                check.validate(
                    {"label": "field", "coefficients": coefficients}, value, "pari"
                )["polynomial_discriminant"],
                disc,
            )

    def test_strict_json(self):
        for text in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":1e999}'):
            with self.assertRaises(ValueError):
                check.strict_json(text)

    def test_sources_are_order_only_and_explicit_about_premises(self):
        gp = (driver.HERE / "pari.gp").read_text()
        julia = (driver.HERE / "hecke.jl").read_text()
        self.assertIn("nfcertify(nf)", gp)
        self.assertIn("nfinit(P)", gp)
        self.assertIn("O = maximal_order(K)", julia)
        self.assertIn('string(numerator(q)) * "/" * string(denominator(q))', julia)
        self.assertIn("identity_rational(coeff(K(b), i))", julia)
        changed = fixture("hecke")
        changed["basis"][1][1] = "1//2"
        with self.assertRaises(ValueError):
            check.validate(record(), changed, "hecke")
        for source in (gp, julia):
            for forbidden in (
                "bnfinit(",
                "bnfcertify(",
                "class_group(",
                "unit_group(",
                "unit_group_fac_elem(",
            ):
                self.assertNotIn(forbidden, source)


class FakeProcess(unittest.TestCase):
    def test_success_timeout_overflow_and_missing_executable(self):
        marker = b"IDENTITY_DONE|" + b"a" * 32
        code = 'import sys; marker=sys.stdin.readline().strip(); print("{}"); print(marker); sys.stdout.flush(); sys.stdin.read()'
        answer = driver.run_process(
            [sys.executable, "-u", "-c", code],
            dict(os.environ),
            marker + b"\n",
            marker,
            seconds=1,
        )
        self.assertEqual(answer["status"], "ok")
        self.assertEqual(answer["stdout"].strip(), "{}")
        self.assertTrue(answer["process_closed"])
        for code, expected in (
            ("import time; time.sleep(5)", "timeout"),
            (
                'import sys,time; print("x"*10000); sys.stdout.flush(); time.sleep(5)',
                "output-limit",
            ),
        ):
            answer = driver.run_process(
                [sys.executable, "-u", "-c", code],
                dict(os.environ),
                b"",
                marker,
                seconds=0.1,
                output_cap=100,
            )
            self.assertEqual(answer["status"], expected)
            self.assertTrue(answer["process_closed"])
        answer = driver.run_process(
            ["/nonexistent-identity-fixture"], {}, b"", marker, seconds=0.1
        )
        self.assertEqual(answer["status"], "infrastructure-error")

    def test_immutable_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "receipt.json"
            driver.save(path, {"status": "timeout"})
            with self.assertRaises(FileExistsError):
                driver.save(path, {"status": "ok"})


class Admission(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        inventory = root / "runtime-inventory.json"
        inventory.write_text("{}")
        for name in ("Project.toml", "Manifest.toml"):
            (root / name).write_text("offline")
        self.records = [
            {"label": f"field-{i}", "coefficients": [str(i + 1), "0", "1"]}
            for i in range(38)
        ]
        self.input = json.dumps(self.records).encode()
        self.ledger = {
            "schema": "sagejs.general-frontier-conservative-cpu-ledger.v1",
            "limit_seconds": 432000,
            "charged_seconds": 3705,
            "pending": None,
        }
        executable = str(Path(sys.executable).resolve())
        hashes = {
            str(p): driver.sha(p.read_bytes())
            for p in (
                Path(executable),
                inventory,
                root / "Project.toml",
                root / "Manifest.toml",
            )
        }
        runtime = {
            "executable": executable,
            "inventory": str(inventory),
            "project": str(root),
            "depot": str(root),
            "sha256": hashes,
        }
        self.admission = {
            "schema": "sagejs.reference-identity-admission.v1",
            "input_sha256": driver.sha(self.input),
            "candidate_count": 38,
            "engines": ["pari", "hecke"],
            "process_cap_seconds": 30,
            "cleanup_cap_seconds": 5,
            "prepaid_seconds": 2705,
            "outer_cap_seconds": 2700,
            "outer_kill_grace_seconds": 5,
            "overhead_seconds": 40,
            "charged_before_seconds": 1000,
            "ledger_sha256": driver.sha(json.dumps(self.ledger).encode()),
            "source_sha256": {
                str(p): driver.sha(p.read_bytes()) for p in driver.source_paths()
            },
            "runtimes": {"pari": runtime, "hecke": runtime},
        }

    def test_outcome_marker_paths_reject_traversal_and_symlinks(self):
        root = Path(self.temp.name)
        config = {
            "outcomes_root": str(root),
            "admission_id": "wave-one",
            "consumption_path": str(root / "wave-one.consumed"),
        }
        self.assertEqual(
            driver.outcome_paths(config, root / "results"), root / "wave-one.consumed"
        )
        for output in (root / "../escape", root / "nested/escape"):
            with self.assertRaises(ValueError):
                driver.outcome_paths(config, output)
        (root / "linked").symlink_to(root, target_is_directory=True)
        with self.assertRaises(ValueError):
            driver.outcome_paths(config, root / "linked")
        (root / "wave-one.consumed").symlink_to(root / "other")
        with self.assertRaises(ValueError):
            driver.outcome_paths(config, root / "results")

    def test_valid_prepaid_admission_and_mutations(self):
        self.assertEqual(
            driver.admit(self.input, self.admission, json.dumps(self.ledger).encode()),
            self.records,
        )
        for mutate in (
            lambda x: x.update(prepaid_seconds=2280),
            lambda x: x.update(engines=["pari"]),
            lambda x: x.update(input_sha256="0" * 64),
            lambda x: x.update(ledger_sha256="0" * 64),
            lambda x: x["source_sha256"].pop(str(driver.HERE / "check.py")),
            lambda x: x["runtimes"]["pari"]["sha256"].update(
                {str(Path(sys.executable).resolve()): "0" * 64}
            ),
        ):
            changed = copy.deepcopy(self.admission)
            mutate(changed)
            with self.assertRaises(ValueError):
                driver.admit(self.input, changed, json.dumps(self.ledger).encode())
        self.ledger["pending"] = {"stage": "other"}
        self.admission["ledger_sha256"] = driver.sha(json.dumps(self.ledger).encode())
        with self.assertRaises(ValueError):
            driver.admit(self.input, self.admission, json.dumps(self.ledger).encode())


if __name__ == "__main__":
    unittest.main()
