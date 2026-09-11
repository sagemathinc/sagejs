"""Offline synthetic custody tests; no workers or ledger mutations."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "mislaunch", Path(__file__).with_name("mislaunch.py")
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


class MislaunchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.policy = self.root / "policy"
        self.policy.mkdir()
        self.abort = self.root / m.ABORT_NAME
        self.abort.mkdir()
        self.before, self.after = self.root / "before.json", self.root / "after.json"
        self.records = [
            {"label": f"field-{i}", "coefficients": ["1", "0", "1"]} for i in range(5)
        ]
        self.modern = {
            "threads": 1,
            "sha256": {"/task" + suffix: "a" * 64 for suffix in m.SUFFIXES},
        }
        legacy = {
            "threads": 1,
            "sha256": {"/task" + suffix: "b" * 64 for suffix in m.SUFFIXES},
        }
        row = {
            "bits": 200,
            "iterations": 1,
            "sample": 1,
            "cap_seconds": 60,
            "coefficients": ["1", "0", "1"],
            "controls": {
                "hostname": "fixture",
                "affinity": [2],
                "memory_max": 4294967296,
                "swap_max": 0,
            },
            "proof_policy": "conditional-grh",
            "producer_boundary": "persistent-process-fresh-field-not-proven-warm-JIT",
        }
        report = {
            "pari_review": {"declared_samples": 1, "provenance": legacy},
            "hecke_review": {"declared_samples": 1, "provenance": self.modern},
            "rows": [
                {
                    "label": r["label"],
                    "status": "censored-or-missing",
                    "pari": {
                        **row,
                        "status": "ok",
                        "worker_nanoseconds": "10000000000",
                    },
                    "hecke": {**row, "status": "timeout"},
                }
                for r in self.records
            ],
        }
        selected = m.reconcile.rescue.select(report)
        save(
            self.policy / "policy.json", {"paired_report": report, "selected": selected}
        )
        save(self.policy / "hecke.json", self.records)
        self.patch = patch.object(
            m,
            "POLICY_SHA256",
            m.reconcile.sha((self.policy / "policy.json").read_bytes()),
        )
        self.patch.start()
        self.addCleanup(self.patch.stop)
        wrong = {
            **legacy,
            "input_sha256": m.reconcile.sha((self.policy / "hecke.json").read_bytes()),
        }
        save(
            self.abort / "run.json",
            {
                "engine": "hecke",
                "bits": 200,
                "qualification_evidence": False,
                "provenance": wrong,
                "records": self.records,
            },
        )
        base = {
            "schema": "sagejs.general-frontier-persistent-screen.v1",
            "engine": "hecke",
            "provenance": wrong,
            "qualification_evidence": False,
            "stage": "sample",
        }
        save(
            self.abort / "sample-field-0.json",
            {**base, "status": "ok", "record": self.records[0], "cap_seconds": 600},
        )
        pending = {
            "label": "sample-field-1",
            "stage": "sample",
            "reserved_seconds": 610,
            "output": "/original/sample-field-1.json",
            "request_sha256": "c" * 64,
        }
        save(
            self.abort / "sample-field-1.json",
            {**base, "status": "interrupted", "pending_reservation": pending},
        )
        save(
            self.before,
            {
                "schema": "sagejs.general-frontier-conservative-cpu-ledger.v1",
                "limit_seconds": 432000,
                "charged_seconds": 1000.125,
                "pending": pending,
            },
        )
        save(
            self.after,
            {
                "schema": "sagejs.general-frontier-conservative-cpu-ledger.v1",
                "limit_seconds": 432000,
                "charged_seconds": 1610.125,
                "pending": None,
                "interruption_reconciliations": [
                    {
                        "id": "hecke-cap-rescue-v2-wrong-harness-abort",
                        "reason": "wrong harness",
                        "previous_ledger_sha256": m.reconcile.sha(
                            self.before.read_bytes()
                        ),
                        "charged_reserved_seconds": 610,
                        "interrupted_label": "sample-field-1",
                    }
                ],
            },
        )

    def evidence(self):
        return m.evidence(self.policy, self.abort, self.before, self.after)

    def test_full_charge_and_all_five_redo_are_bound(self):
        result = self.evidence()
        self.assertEqual(result["designated_fresh_attempt"], m.FRESH_NAME)
        self.assertEqual(result["selected"], self.records)
        self.assertEqual(result["charged_pending_seconds"], 610)
        self.assertFalse(result["aborted_rows_eligible"])
        self.assertFalse(result["strict_reconciler_accepts_aborted_attempt"])
        self.assertFalse(result["execution_authorized_by_this_artifact"])

    def test_reject_undercharge_refund_or_other_ledger_edits(self):
        original = json.loads(self.after.read_bytes())
        for key, value in (
            ("charged_seconds", 1039.125),
            ("charged_seconds", 1000.125),
            ("pending", {}),
            ("limit_seconds", 500000),
        ):
            save(self.after, {**original, key: value})
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                self.evidence()

    def test_reject_changed_policy_or_order(self):
        original = (self.policy / "policy.json").read_bytes()
        (self.policy / "policy.json").write_bytes(original + b"\n")
        with self.assertRaises(ValueError):
            self.evidence()
        (self.policy / "policy.json").write_bytes(original)
        save(self.policy / "hecke.json", list(reversed(self.records)))
        with self.assertRaises(ValueError):
            self.evidence()

    def test_reject_missing_or_extra_aborted_samples(self):
        sample = self.abort / "sample-field-0.json"
        body = json.loads(sample.read_bytes())
        save(sample, {**body, "stage": "warmup"})
        with self.assertRaises(ValueError):
            self.evidence()
        save(sample, body)
        save(self.abort / "sample-field-2.json", body)
        with self.assertRaises(ValueError):
            self.evidence()

    def test_reject_unrelated_provenance_change(self):
        path = self.abort / "run.json"
        body = json.loads(path.read_bytes())
        body["provenance"]["sha256"]["unexpected"] = "d" * 64
        save(path, body)
        with self.assertRaises(ValueError):
            self.evidence()

    def test_cli_preserves_old_policy_and_requires_exact_correction(self):
        output = self.root / "correction.json"
        args = [
            "mislaunch.py",
            "plan",
            "--policy-directory",
            str(self.policy),
            "--aborted-directory",
            str(self.abort),
            "--ledger-before",
            str(self.before),
            "--ledger-after",
            str(self.after),
            "--correction",
            str(output),
        ]
        with patch("sys.argv", args):
            m.main()
            with self.assertRaises(FileExistsError):
                m.main()
        args[1] = "check"
        with patch("sys.argv", args):
            m.main()
            body = json.loads(output.read_bytes())
            body["aborted_rows_eligible"] = True
            save(output, body)
            with self.assertRaises(ValueError):
                m.main()

    def prepare_join(self):
        self.correction = self.root / "correction.json"
        self.fresh = self.root / m.FRESH_NAME
        self.fresh.mkdir()
        evidence = self.evidence()
        save(self.correction, evidence)
        save(
            self.fresh / "run.json",
            {
                "provenance": evidence["expected_fresh_execution_provenance"],
                "records": self.records,
            },
        )
        return [
            self.policy,
            self.abort,
            self.before,
            self.after,
            self.correction,
            m.reconcile.sha(self.correction.read_bytes()),
            self.root / "original-pari",
            self.root / "original-hecke",
            self.root / "retry-pari",
            self.fresh,
        ]

    def test_join_retains_every_aborted_receipt_and_strict_history(self):
        args = self.prepare_join()
        strict = {
            "attempt_reconciliation": {"histories": ["strict-original-and-retry"]}
        }
        with patch.object(
            m.reconcile, "reconcile", return_value=copy.deepcopy(strict)
        ) as call:
            result = m.join(*args)
        self.assertEqual(
            result["attempt_reconciliation"], strict["attempt_reconciliation"]
        )
        call.assert_called_once_with(
            args[6], args[7], self.policy, {"pari": args[8], "hecke": self.fresh}
        )
        joined = result["mislaunch_reconciliation"]
        self.assertFalse(joined["aborted_rows_eligible"])
        self.assertEqual(json.loads(joined["correction_raw_json"]), self.evidence())
        for name, digest in self.evidence()["aborted_raw_snapshot"][
            "files_sha256"
        ].items():
            self.assertEqual(
                m.reconcile.sha(joined["excluded_aborted_raw_json"][name].encode()),
                digest,
            )
        self.assertEqual(
            joined["ledger_raw_json"]["after"].encode(), self.after.read_bytes()
        )

    def test_join_rejects_wrong_fresh_name_or_hash_or_provenance(self):
        args = self.prepare_join()
        with patch.object(m.reconcile, "reconcile") as strict:
            for index, value in ((9, self.abort), (5, "0" * 64)):
                bad = list(args)
                bad[index] = value
                with self.assertRaises(ValueError):
                    m.join(*bad)
            save(self.fresh / "run.json", {"records": self.records, "provenance": {}})
            with self.assertRaises(ValueError):
                m.join(*args)
            strict.assert_not_called()

    def test_join_rejects_changed_correction_or_lost_custody(self):
        args = self.prepare_join()
        raw = self.correction.read_bytes()
        self.correction.write_bytes(raw + b"\n")
        with self.assertRaises(ValueError):
            m.join(*args)
        self.correction.write_bytes(raw)
        receipt = self.abort / "sample-field-1.json"
        with patch.object(
            m.reconcile, "reconcile", side_effect=lambda *unused: receipt.unlink() or {}
        ):
            with self.assertRaises((ValueError, FileNotFoundError)):
                m.join(*args)

    def test_join_propagates_strict_rejection(self):
        args = self.prepare_join()
        with patch.object(
            m.reconcile, "reconcile", side_effect=ValueError("wrong precise controls")
        ):
            with self.assertRaisesRegex(ValueError, "wrong precise controls"):
                m.join(*args)


if __name__ == "__main__":
    unittest.main()
