"""Synthetic raw receipts only: no reference processes or CAS are launched."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "attempts", Path(__file__).with_name("reconcile.py")
)
attempts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(attempts)


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.records = [{"label": "field", "coefficients": ["1", "0", "1"]}]
        self.originals = {e: self.root / e for e in attempts.ENGINES}
        self.policy = self.root / "policy"
        self.policy.mkdir()
        self.retry = self.root / "retry"
        for e, d in self.originals.items():
            self.make_run(d, e, "timeout" if e == "pari" else "ok", 60, "a" * 64)
        self.predeclare()
        self.make_run(
            self.retry,
            "pari",
            "ok",
            600,
            attempts.sha((self.policy / "pari.json").read_bytes()),
        )

    def predeclare(self):
        report = attempts.pairer.pair(
            *(
                attempts.pairer.review.summarize(self.originals[e])
                for e in attempts.ENGINES
            )
        )
        selected = attempts.rescue.select(report)
        self.policy_value = {
            "schema": "sagejs.general-frontier-cap-rescue.v1",
            "request_cap_seconds": 600,
            "trigger": "60-second timeout with other engine completed in at least 10 worker seconds",
            "selection_uses_sagejs_results": False,
            "qualification_evidence": False,
            "preserve_original_timeouts": True,
            "maximum_requests": 32,
            "worst_case_request_wall_seconds": 600 * sum(map(len, selected.values())),
            "producer_sha256": attempts.sha(
                Path(attempts.rescue.__file__).read_bytes()
            ),
            "paired_report": report,
            "selected": selected,
        }
        save(self.policy / "policy.json", self.policy_value)
        for e in attempts.ENGINES:
            save(self.policy / f"{e}.json", selected[e])

    def make_run(self, directory, engine, status, cap, input_hash):
        directory.mkdir()
        provenance = {
            "threads": 1,
            "sha256": {f"{engine}-runtime": "b" * 64, "worker": "c" * 64},
            "input_sha256": input_hash,
        }
        save(
            directory / "run.json",
            {
                "engine": engine,
                "records": self.records,
                "bits": 200,
                "iterations": 1,
                "samples": 1,
                "seed": 1,
                "provenance": provenance,
            },
        )
        basis = [["1", "0"], ["0", "1"]]
        decomp = {"coordinates": [], "representative": basis, "witness": []}
        compact = {
            "class_number": "1",
            "class_invariants": [],
            "discriminant": "-4",
            "signature": [0, 1],
            "torsion_order": "4",
            "integral_basis": basis,
            "class_generators": [],
            "class_coordinates": [],
            "class_decompositions": [],
            "class_power_witnesses": [],
            "units": [[]],
            "unit_invariants": ["4"],
            "unit_coordinates": [["1"]],
            "probes": [basis] * 3,
            "decompositions": [decomp] * 3,
            "regulator": {
                "bits": 200,
                "guarantee": "absolute-radius-less-than-2^-bits",
                "lower": "1",
                "upper": "1",
            },
        }
        stdout = (
            "FRONTIER_RESULT|sample-0001-field|200|1|12000|1|[]|-4|[0,1]|4|1\nFRONTIER_COMPACT|sample-0001-field|opaque\n"
            if engine == "pari"
            else json.dumps(
                {
                    "status": "ok",
                    "result": {
                        "schema": "sagejs-hecke-frontier-screen-v1",
                        "id": "sample-0001-field",
                        "bits": 200,
                        "iterations": 1,
                        "elapsed_ns": "15000000000",
                        "compact": compact,
                    },
                }
            )
        )
        receipt = {
            "schema": "sagejs.general-frontier-persistent-screen.v1",
            "stage": "sample",
            "engine": engine,
            "record": self.records[0],
            "status": status,
            "wall_seconds": cap if status == "timeout" else 16,
            "stdout": stdout if status == "ok" else "",
            "stderr": "",
            "qualification_evidence": False,
            "provenance": provenance,
            "bits": 200,
            "iterations": 1,
            "sample": 1,
            "declared_samples": 1,
            "request_id": "sample-0001-field",
            "cap_seconds": cap,
            "controls": {
                "hostname": "offline-fixture",
                "affinity": [2],
                "memory_max": 4294967296,
                "swap_max": 0,
                "cgroup": str(directory),
            },
            "proof_policy": "conditional-grh",
            "boundary": "persistent-process-fresh-field-not-proven-warm-JIT",
        }
        save(directory / "sample.json", receipt)
        save(
            directory / "startup.json",
            {**receipt, "stage": "startup", "status": "error", "stdout": ""},
        )

    def run_join(self, retries=None):
        return attempts.reconcile(
            self.originals["pari"],
            self.originals["hecke"],
            self.policy,
            {"pari": self.retry} if retries is None else retries,
        )

    def mutate(self, path, update):
        value = json.loads(path.read_text())
        update(value)
        save(path, value)

    def test_designated_success_and_complete_history(self):
        result = self.run_join()
        self.assertEqual(result["rows"][0]["status"], "paired-discovery")
        self.assertEqual(result["rows"][0]["faster_worker_nanoseconds"], "12000000000")
        self.assertFalse(result["qualification_evidence"])
        self.assertFalse(result["independent_replay"])
        history = result["attempt_reconciliation"]["histories"][0]
        self.assertEqual(history["original"]["status"], "timeout")
        self.assertEqual(history["retry"]["cap_seconds"], 600)
        self.assertIn(
            "startup.json",
            result["attempt_reconciliation"]["raw_attempts"]["original-pari"][
                "files_sha256"
            ],
        )

    def test_retry_failure_is_retained_not_retried(self):
        for status in ("timeout", "error", "crash", "output-limit"):
            self.mutate(
                self.retry / "sample.json", lambda r: r.update(status=status, stdout="")
            )
            result = self.run_join()
            self.assertEqual(result["rows"][0]["status"], "censored-or-missing")
            self.assertEqual(result["rows"][0]["pari"]["status"], status)

    def test_exact_disagreement_not_promoted(self):
        self.mutate(
            self.retry / "sample.json",
            lambda r: r.update(stdout=r["stdout"].replace("|4|1\n", "|2|1\n")),
        )
        self.assertEqual(
            self.run_join()["rows"][0]["status"], "exact-summary-disagreement"
        )

    def test_changed_policy_or_selection_rejected(self):
        for key, value in (
            ("request_cap_seconds", 601),
            ("maximum_requests", 33),
            ("preserve_original_timeouts", False),
            ("producer_sha256", "d" * 64),
            ("selected", {"pari": [], "hecke": []}),
        ):
            changed = copy.deepcopy(self.policy_value)
            changed[key] = value
            save(self.policy / "policy.json", changed)
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.run_join()

    def test_policy_input_bytes_bound_not_only_polynomial(self):
        p = self.policy / "pari.json"
        p.write_text(p.read_text() + "\n")
        with self.assertRaisesRegex(ValueError, "input bytes"):
            self.run_join()

    def test_changed_registered_polynomial_rejected(self):
        self.mutate(
            self.retry / "run.json",
            lambda r: r["records"][0].update(coefficients=["2", "0", "1"]),
        )
        with self.assertRaises(ValueError):
            self.run_join()

    def test_missing_extra_and_duplicate_retry_rejected(self):
        for retries in (
            {},
            {"hecke": self.retry},
            {"pari": self.retry, "hecke": self.retry},
        ):
            with self.subTest(retries=retries), self.assertRaises(ValueError):
                self.run_join(retries)
        save(
            self.retry / "duplicate.json",
            json.loads((self.retry / "sample.json").read_text()),
        )
        with self.assertRaises(ValueError):
            self.run_join()

    def test_retry_identity_controls_and_cap_rejected(self):
        path = self.retry / "sample.json"
        original = json.loads(path.read_text())
        for key, value in (
            ("engine", "hecke"),
            ("bits", 100),
            ("iterations", 2),
            ("sample", 2),
            ("request_id", "field"),
            ("cap_seconds", 60),
            ("proof_policy", "heuristic"),
            ("boundary", "other"),
            ("controls", {**original["controls"], "hostname": "foreign"}),
        ):
            save(path, {**original, key: value})
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.run_join()

    def test_runtime_source_and_thread_change_rejected(self):
        for key, value in (("sha256", {"different": "d" * 64}), ("threads", 2)):
            originals = {
                p: json.loads(p.read_text()) for p in self.retry.glob("*.json")
            }
            for p, r in originals.items():
                changed = copy.deepcopy(r)
                changed["provenance"][key] = value
                save(p, changed)
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.run_join()
            for p, r in originals.items():
                save(p, r)

    def test_original_tampering_rejected(self):
        self.mutate(
            self.originals["pari"] / "sample.json", lambda r: r.update(cap_seconds=600)
        )
        with self.assertRaises(ValueError):
            self.run_join()

    def test_incomplete_retry_rejected(self):
        self.mutate(
            self.retry / "sample.json",
            lambda r: r.update(
                status="interrupted", pending_reservation={"seconds": 600}
            ),
        )
        with self.assertRaises(ValueError):
            self.run_join()

    def test_missing_retry_label_rejected(self):
        self.mutate(self.retry / "sample.json", lambda r: r.update(stage="warmup"))
        with self.assertRaises(ValueError):
            self.run_join()

    def test_extra_registered_retry_label_rejected(self):
        self.mutate(
            self.retry / "run.json",
            lambda r: r["records"].append(
                {"label": "extra", "coefficients": ["2", "0", "1"]}
            ),
        )
        with self.assertRaises(ValueError):
            self.run_join()

    def test_unexpected_raw_member_rejected(self):
        (self.retry / "nested").mkdir()
        with self.assertRaises(ValueError):
            self.run_join()

    def test_hecke_designated_retry_and_empty_selection(self):
        # The synthetic fixture keeps the original failed stdout; supply a valid
        # successful PARI payload to reverse which engine needs rescuing.
        good = json.loads((self.retry / "sample.json").read_text())["stdout"]
        self.mutate(
            self.originals["pari"] / "sample.json",
            lambda r: r.update(status="ok", stdout=good),
        )
        self.mutate(
            self.originals["hecke"] / "sample.json",
            lambda r: r.update(status="timeout", stdout=""),
        )
        self.predeclare()
        retry = self.root / "hecke-retry"
        self.make_run(
            retry,
            "hecke",
            "ok",
            600,
            attempts.sha((self.policy / "hecke.json").read_bytes()),
        )
        self.assertEqual(
            self.run_join({"hecke": retry})["rows"][0]["status"], "paired-discovery"
        )
        self.mutate(
            self.originals["pari"] / "sample.json",
            lambda r: r.update(status="timeout", stdout=""),
        )
        self.predeclare()
        result = self.run_join({})
        self.assertEqual(result["attempt_reconciliation"]["histories"], [])
        self.assertEqual(result["rows"][0]["status"], "censored-or-missing")

    def test_cli_output_is_exclusive_and_outside_inputs(self):
        output = self.root / "joined.json"
        args = [
            "reconcile.py",
            "--pari-original",
            str(self.originals["pari"]),
            "--hecke-original",
            str(self.originals["hecke"]),
            "--policy-directory",
            str(self.policy),
            "--pari-retry",
            str(self.retry),
            "--output",
            str(output),
        ]
        with patch("sys.argv", args):
            attempts.main()
            before = output.read_bytes()
            with self.assertRaises(FileExistsError):
                attempts.main()
            self.assertEqual(output.read_bytes(), before)
        args[-1] = str(self.retry / "joined.json")
        with patch("sys.argv", args), self.assertRaises(ValueError):
            attempts.main()


if __name__ == "__main__":
    unittest.main()
