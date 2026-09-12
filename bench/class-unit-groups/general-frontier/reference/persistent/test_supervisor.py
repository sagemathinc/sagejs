"""Offline process, accounting and failure tests; no controlled host required."""

import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "persistent_screen", HERE / "supervisor.py"
)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


def state(charged=600):
    return {
        "schema": "sagejs.general-frontier-conservative-cpu-ledger.v1",
        "limit_seconds": supervisor.shared.LIMIT,
        "charged_seconds": charged,
        "pending": None,
    }


def record(label):
    return {"label": label, "coefficients": ["-2", "0", "1"]}


def campaign(root, seconds=0.15, **measurement):
    root = Path(root)

    def factory(marker):
        return supervisor.Worker(
            [
                sys.executable,
                str(HERE / "fake-worker.py"),
                str(root / "pids"),
                marker.decode(),
            ],
            dict(os.environ),
            "hecke",
            4096,
        ), b""

    return supervisor.Campaign(
        root / "ledger.json",
        root / "output",
        "hecke",
        factory,
        {"mode": "offline-fake-not-controlled"},
        {},
        seconds=seconds,
        startup_seconds=2,
        lock=root / "test.lock",
        warmups=(("warmup", ["-2", "0", "1"]),),
        **measurement,
    )


def alive(pid):
    try:
        return Path(f"/proc/{pid}/stat").read_text().split()[2] != "Z"
    except FileNotFoundError:
        return False


class PersistentContracts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        supervisor.shared.save(self.root / "ledger.json", state())

    def tearDown(self):
        self.temporary.cleanup()

    def receipts(self):
        return {
            path.stem: json.loads(path.read_text())
            for path in (self.root / "output").glob("*.json")
        }

    def test_persistent_success_and_separate_warmup(self):
        campaign(self.root).run([record("first"), record("second")])
        receipts = self.receipts()
        self.assertEqual(len((self.root / "pids").read_text().splitlines()), 1)
        self.assertEqual(
            receipts["sample-0001-first"]["pid"], receipts["sample-0001-second"]["pid"]
        )
        self.assertEqual(receipts["warmup-0001-00-warmup"]["stage"], "warmup")
        self.assertFalse(receipts["sample-0001-first"]["qualification_evidence"])
        self.assertEqual(receipts["sample-0001-first"]["bits"], 200)
        self.assertIn("startup-0001", receipts)
        self.assertIn("shutdown", receipts)
        ledger = json.loads((self.root / "ledger.json").read_text())
        self.assertGreater(ledger["charged_seconds"], 605)
        self.assertIsNone(ledger["pending"])
        self.assertFalse(alive(receipts["sample-0001-first"]["pid"]))

    def test_timeout_restarts_and_kills_descendants(self):
        campaign(self.root).run([record("timeout"), record("next")])
        receipts = self.receipts()
        self.assertEqual(receipts["sample-0001-timeout"]["status"], "timeout")
        self.assertEqual(receipts["sample-0001-next"]["status"], "ok")
        self.assertNotEqual(
            receipts["sample-0001-timeout"]["pid"], receipts["sample-0001-next"]["pid"]
        )
        self.assertIn("warmup-0002-00-warmup", receipts)
        self.assertFalse(alive(int((self.root / "pids.descendant").read_text())))

    def test_unconditional_policy_survives_warmups_failures_and_restart(self):
        campaign(self.root, proof_policy="unconditional", bits=100, iterations=2).run(
            [record("timeout"), record("next")]
        )
        receipts = self.receipts()
        for value in receipts.values():
            self.assertEqual(value["requested_proof_policy"], "unconditional")
        self.assertEqual(receipts["sample-0001-timeout"]["status"], "timeout")
        self.assertEqual(receipts["sample-0001-next"]["status"], "ok")
        for name in (
            "warmup-0001-00-warmup",
            "warmup-0002-00-warmup",
            "sample-0001-next",
        ):
            value = receipts[name]
            result = json.loads(value["stdout"])["result"]
            self.assertEqual(result["proof_policy"], "unconditional")
            self.assertEqual(
                result["proof_execution"]["completed_iterations"], value["iterations"]
            )
            self.assertIs(result["proof_execution"]["unit_group_grh"], False)
        self.assertIsNone(
            json.loads((self.root / "ledger.json").read_text())["pending"]
        )

    def test_crash_output_cap_and_duplicate_response_restart(self):
        campaign(self.root).run(
            [
                record("crash"),
                record("output-limit"),
                record("duplicate"),
                record("next"),
            ]
        )
        receipts = self.receipts()
        self.assertEqual(receipts["sample-0001-crash"]["status"], "crash")
        self.assertEqual(receipts["sample-0001-output-limit"]["status"], "output-limit")
        self.assertLessEqual(
            len(receipts["sample-0001-output-limit"]["stdout"].encode()), 4097
        )
        self.assertNotEqual(receipts["sample-0001-duplicate"]["status"], "ok")
        self.assertEqual(receipts["sample-0001-next"]["status"], "ok")
        self.assertEqual(len((self.root / "pids").read_text().splitlines()), 4)

    def test_duplicate_input_and_immutable_output_fail_closed(self):
        with self.assertRaises(ValueError):
            campaign(self.root).run([record("same"), record("same")])
        self.assertFalse((self.root / "pids").exists())
        campaign(self.root).run([record("same")])
        before = (self.root / "output" / "sample-0001-same.json").read_bytes()
        with self.assertRaises(FileExistsError):
            campaign(self.root).run([record("same")])
        self.assertEqual(
            before, (self.root / "output" / "sample-0001-same.json").read_bytes()
        )

    def test_exhausted_missing_and_interrupted_ledger(self):
        for bad in (
            state(supervisor.shared.LIMIT),
            dict(state(), pending={"reserved_seconds": 20}),
        ):
            supervisor.shared.save(self.root / "ledger.json", bad)
            with self.assertRaises(ValueError):
                campaign(self.root).run([record("first")])
            self.assertFalse((self.root / "pids").exists())
        (self.root / "ledger.json").unlink()
        with self.assertRaises(ValueError):
            campaign(self.root).run([record("first")])

    def test_interruption_leaves_pending_reservation_and_no_worker(self):
        driver = subprocess.Popen(
            [sys.executable, str(__file__), "--interrupt-driver", str(self.root)]
        )
        try:
            end = time.monotonic() + 5
            while not (self.root / "pids.descendant").exists():
                if time.monotonic() > end:
                    self.fail("fake timeout worker did not start")
                time.sleep(0.01)
            driver.send_signal(signal.SIGTERM)
            self.assertEqual(driver.wait(timeout=5), 73)
        finally:
            if driver.poll() is None:
                driver.kill()
                driver.wait()
        ledger = json.loads((self.root / "ledger.json").read_text())
        self.assertEqual(ledger["pending"]["label"], "sample-0001-timeout")
        self.assertGreater(ledger["pending"]["reserved_seconds"], 30)
        self.assertEqual(
            self.receipts()["sample-0001-timeout"]["status"], "interrupted"
        )
        self.assertEqual(
            self.receipts()["sample-0001-timeout"]["requested_proof_policy"],
            "unconditional",
        )
        for pid in (self.root / "pids").read_text().splitlines():
            self.assertFalse(alive(int(pid)))
        self.assertFalse(alive(int((self.root / "pids.descendant").read_text())))
        with self.assertRaises(ValueError):
            campaign(self.root).run([record("after")])

    def test_explicit_precision_batch_and_samples(self):
        campaign(self.root, bits=100, iterations=3, samples=2).run(
            [record("first"), record("second")]
        )
        receipts = self.receipts()
        samples = [v for v in receipts.values() if v.get("stage") == "sample"]
        self.assertEqual(len(samples), 4)
        self.assertEqual(len({v["request_id"] for v in samples}), 4)
        self.assertEqual(len({v["pid"] for v in samples}), 1)
        for value in samples:
            self.assertEqual(value["status"], "ok")
            self.assertEqual(value["bits"], 100)
            self.assertEqual(value["iterations"], 3)
            self.assertEqual(value["declared_samples"], 2)
            self.assertIn(value["sample"], (1, 2))
            self.assertIn(value["record"]["label"], ("first", "second"))
            result = json.loads(value["stdout"])["result"]
            self.assertEqual(result["id"], value["request_id"])
        warmup = receipts["warmup-0001-00-warmup"]
        self.assertEqual(warmup["bits"], 100)
        self.assertEqual(warmup["iterations"], 1)
        self.assertIsNone(warmup["sample"])
        self.assertEqual(receipts["run"]["iterations"], 3)
        self.assertEqual(receipts["run"]["samples"], 2)

    def test_measurement_bounds_fail_before_worker_start(self):
        for options in (
            {"bits": 99},
            {"bits": True},
            {"iterations": 0},
            {"iterations": 10001},
            {"iterations": True},
            {"samples": 0},
            {"samples": 6},
            {"samples": True},
            {"proof_policy": True},
            {"proof_policy": None},
            {"proof_policy": "Unconditional"},
        ):
            with self.subTest(options=options), self.assertRaises(ValueError):
                campaign(self.root, **options)
        self.assertFalse((self.root / "pids").exists())
        for engine in ("pari", "hecke"):
            payload, _ = supervisor.encode_request(
                engine, "case", ["-2", "0", "1"], 100, 1, 10000
            )
            self.assertIn(b"10000", payload)
            with self.assertRaises(ValueError):
                supervisor.encode_request(
                    engine, "case", ["-2", "0", "1"], 200, 1, 10001
                )

    def test_wrong_precision_batch_and_reused_id_restart(self):
        campaign(self.root, bits=100, iterations=2).run(
            [
                record("wrong-bits"),
                record("wrong-batch"),
                record("reused-id"),
                record("next"),
            ]
        )
        receipts = self.receipts()
        for label in ("wrong-bits", "wrong-batch", "reused-id"):
            self.assertEqual(receipts["sample-0001-" + label]["status"], "error")
        self.assertEqual(receipts["sample-0001-next"]["status"], "ok")
        self.assertEqual(len((self.root / "pids").read_text().splitlines()), 4)

    def test_cli_rejects_invalid_caps_and_measurement_before_controls(self):
        command = [
            sys.executable,
            str(HERE / "supervisor.py"),
            "--engine",
            "pari",
            "--input",
            "missing",
            "--output",
            str(self.root / "never-created"),
            "--ledger",
            "missing",
            "--executable",
            "missing",
            "--worker",
            "missing",
        ]
        for option, value, message in (
            ("--seconds", "0", "caps must"),
            ("--seconds", "601", "caps must"),
            ("--startup-seconds", "0", "caps must"),
            ("--startup-seconds", "601", "caps must"),
            ("--iterations", "10001", "iterations must"),
            ("--samples", "6", "samples must"),
            ("--bits", "150", "bits must"),
        ):
            with self.subTest(option=option, value=value):
                response = subprocess.run(
                    command + [option, value], capture_output=True, text=True, timeout=5
                )
                self.assertNotEqual(response.returncode, 0)
                self.assertIn(message, response.stderr)
        self.assertFalse((self.root / "never-created").exists())

    def test_previous_sample_response_is_not_current_sample(self):
        campaign(self.root, samples=2).run([record("first")])
        response = self.receipts()["sample-0001-first"]
        self.assertEqual(
            supervisor.validate_answer("hecke", response, "sample-0002-first", 2),
            "error",
        )

    def test_failed_samples_are_retained_without_hidden_retry(self):
        campaign(self.root, iterations=3, samples=2).run([record("timeout")])
        receipts = self.receipts()
        samples = [v for v in receipts.values() if v.get("stage") == "sample"]
        self.assertEqual(len(samples), 2)
        self.assertEqual({v["sample"] for v in samples}, {1, 2})
        self.assertTrue(all(v["status"] == "timeout" for v in samples))
        self.assertTrue(all(v["cap_seconds"] == 0.15 for v in samples))
        self.assertTrue(all(v["iterations"] == 3 for v in samples))
        self.assertEqual(len((self.root / "pids").read_text().splitlines()), 2)
        self.assertIn("warmup-0002-00-warmup", receipts)

    def test_100_bit_endpoint_sanity_uses_requested_radius(self):
        campaign(self.root, bits=100).run([record("first")])
        answer = json.loads(self.receipts()["sample-0001-first"]["stdout"])
        answer["result"]["compact"]["regulator"].update(
            lower="1", upper=f"{2**100 + 1}/{2**100}"
        )
        output = json.dumps(answer)
        self.assertTrue(supervisor.validate_hecke_shape(output, 2, 100))
        self.assertFalse(supervisor.validate_hecke_shape(output, 2, 200))
        answer["result"]["compact"]["regulator"]["upper"] = f"{2**99 + 1}/{2**99}"
        self.assertFalse(supervisor.validate_hecke_shape(json.dumps(answer), 2, 100))

    def test_cleanup_is_reserved_when_budget_runs_out_after_warmup(self):
        supervisor.shared.save(
            self.root / "ledger.json", state(supervisor.shared.LIMIT - 27)
        )
        with self.assertRaises(ValueError):
            campaign(self.root).run([record("not-admitted")])
        receipts = self.receipts()
        self.assertIn("warmup-0001-00-warmup", receipts)
        self.assertIn("shutdown", receipts)
        self.assertNotIn("sample-0001-not-admitted", receipts)
        ledger = json.loads((self.root / "ledger.json").read_text())
        self.assertIsNone(ledger["pending"])
        self.assertGreater(ledger["charged_seconds"], supervisor.shared.LIMIT - 24)
        self.assertLess(ledger["charged_seconds"], supervisor.shared.LIMIT)
        self.assertFalse(alive(int((self.root / "pids").read_text().strip())))

    def test_hecke_shape_and_endpoint_sanity(self):
        campaign(self.root).run([record("first")])
        output = self.receipts()["sample-0001-first"]["stdout"]
        self.assertTrue(supervisor.validate_hecke_shape(output, 2))
        for field in (
            "class_power_witnesses",
            "probes",
            "unit_coordinates",
            "signature",
        ):
            answer = json.loads(output)
            del answer["result"]["compact"][field]
            self.assertFalse(supervisor.validate_hecke_shape(json.dumps(answer), 2))
        for lo, hi in (("2", "1"), ("1", "2"), ("-1", "-1"), ("nan", "nan")):
            answer = json.loads(output)
            answer["result"]["compact"]["regulator"].update(lower=lo, upper=hi)
            self.assertFalse(supervisor.validate_hecke_shape(json.dumps(answer), 2))

    def test_lock_contention_does_not_start_worker(self):
        import fcntl

        with (self.root / "test.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                campaign(self.root).run([record("first")])
        self.assertFalse((self.root / "pids").exists())

    def test_startup_and_warmup_failures_are_retained(self):
        run = campaign(self.root)
        run.warmups = (("crash", ["-2", "0", "1"]),)
        with self.assertRaises(RuntimeError):
            run.run([record("not-started")])
        self.assertEqual(self.receipts()["warmup-0001-00-crash"]["status"], "crash")
        self.assertNotIn("sample-0001-not-started", self.receipts())
        self.assertIsNone(
            json.loads((self.root / "ledger.json").read_text())["pending"]
        )

    def test_receipt_publication_never_overwrites(self):
        destination = self.root / "receipt.json"
        supervisor.immutable_save(destination, {"first": True})
        with self.assertRaises(FileExistsError):
            supervisor.immutable_save(destination, {"second": True})
        self.assertEqual(json.loads(destination.read_text()), {"first": True})

    def test_startup_failure_has_no_samples(self):
        run = campaign(self.root)
        run.factory = lambda marker: (
            supervisor.Worker(
                [sys.executable, "-c", "raise SystemExit(4)"], dict(os.environ), "hecke"
            ),
            b"",
        )
        with self.assertRaises(RuntimeError):
            run.run([record("not-started")])
        self.assertEqual(self.receipts()["startup-0001"]["status"], "crash")
        self.assertNotIn("sample-0001-not-started", self.receipts())


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--interrupt-driver":
        try:
            campaign(Path(sys.argv[2]), seconds=30, proof_policy="unconditional").run(
                [record("timeout")]
            )
        except supervisor.CoordinatorInterrupted:
            sys.exit(73)
    else:
        unittest.main()
