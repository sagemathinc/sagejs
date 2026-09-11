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


def campaign(root, seconds=0.15):
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
            receipts["sample-first"]["pid"], receipts["sample-second"]["pid"]
        )
        self.assertEqual(receipts["warmup-0001-00"]["stage"], "warmup")
        self.assertFalse(receipts["sample-first"]["qualification_evidence"])
        self.assertEqual(receipts["sample-first"]["bits"], 200)
        self.assertIn("startup-0001", receipts)
        self.assertIn("shutdown", receipts)
        ledger = json.loads((self.root / "ledger.json").read_text())
        self.assertGreater(ledger["charged_seconds"], 605)
        self.assertIsNone(ledger["pending"])
        self.assertFalse(alive(receipts["sample-first"]["pid"]))

    def test_timeout_restarts_and_kills_descendants(self):
        campaign(self.root).run([record("timeout"), record("next")])
        receipts = self.receipts()
        self.assertEqual(receipts["sample-timeout"]["status"], "timeout")
        self.assertEqual(receipts["sample-next"]["status"], "ok")
        self.assertNotEqual(
            receipts["sample-timeout"]["pid"], receipts["sample-next"]["pid"]
        )
        self.assertIn("warmup-0002-00", receipts)
        self.assertFalse(alive(int((self.root / "pids.descendant").read_text())))

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
        self.assertEqual(receipts["sample-crash"]["status"], "crash")
        self.assertEqual(receipts["sample-output-limit"]["status"], "output-limit")
        self.assertLessEqual(
            len(receipts["sample-output-limit"]["stdout"].encode()), 4097
        )
        self.assertNotEqual(receipts["sample-duplicate"]["status"], "ok")
        self.assertEqual(receipts["sample-next"]["status"], "ok")
        self.assertEqual(len((self.root / "pids").read_text().splitlines()), 4)

    def test_duplicate_input_and_immutable_output_fail_closed(self):
        with self.assertRaises(ValueError):
            campaign(self.root).run([record("same"), record("same")])
        self.assertFalse((self.root / "pids").exists())
        campaign(self.root).run([record("same")])
        before = (self.root / "output" / "sample-same.json").read_bytes()
        with self.assertRaises(FileExistsError):
            campaign(self.root).run([record("same")])
        self.assertEqual(
            before, (self.root / "output" / "sample-same.json").read_bytes()
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
        self.assertEqual(ledger["pending"]["label"], "sample-timeout")
        self.assertGreater(ledger["pending"]["reserved_seconds"], 30)
        self.assertEqual(self.receipts()["sample-timeout"]["status"], "interrupted")
        for pid in (self.root / "pids").read_text().splitlines():
            self.assertFalse(alive(int(pid)))
        self.assertFalse(alive(int((self.root / "pids.descendant").read_text())))
        with self.assertRaises(ValueError):
            campaign(self.root).run([record("after")])

    def test_no_implicit_lower_precision(self):
        with self.assertRaises(ValueError):
            supervisor.encode_request("hecke", "case", ["-2", "0", "1"], 100, 1)

    def test_cleanup_is_reserved_when_budget_runs_out_after_warmup(self):
        supervisor.shared.save(
            self.root / "ledger.json", state(supervisor.shared.LIMIT - 27)
        )
        with self.assertRaises(ValueError):
            campaign(self.root).run([record("not-admitted")])
        receipts = self.receipts()
        self.assertIn("warmup-0001-00", receipts)
        self.assertIn("shutdown", receipts)
        self.assertNotIn("sample-not-admitted", receipts)
        ledger = json.loads((self.root / "ledger.json").read_text())
        self.assertIsNone(ledger["pending"])
        self.assertGreater(ledger["charged_seconds"], supervisor.shared.LIMIT - 24)
        self.assertLess(ledger["charged_seconds"], supervisor.shared.LIMIT)
        self.assertFalse(alive(int((self.root / "pids").read_text().strip())))

    def test_hecke_shape_and_endpoint_sanity(self):
        campaign(self.root).run([record("first")])
        output = self.receipts()["sample-first"]["stdout"]
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
        self.assertEqual(self.receipts()["warmup-0001-00"]["status"], "crash")
        self.assertNotIn("sample-not-started", self.receipts())
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
        self.assertNotIn("sample-not-started", self.receipts())


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--interrupt-driver":
        try:
            campaign(Path(sys.argv[2]), seconds=30).run([record("timeout")])
        except supervisor.CoordinatorInterrupted:
            sys.exit(73)
    else:
        unittest.main()
