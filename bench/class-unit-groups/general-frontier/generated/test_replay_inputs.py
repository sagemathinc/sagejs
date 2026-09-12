"""Synthetic offline schema/provenance tests; no CAS worker is launched."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location(
    "admission_replay", Path(__file__).with_name("replay_inputs.py")
)
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)


class ReplayInputsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.generator = replay.module(
            "test_generator", "corpus/rank_two_supplement.py"
        )
        self.preparation = replay.module(
            "test_prepare", "reference/runner/prepare-supplement-screen.py"
        )
        self.pairer = replay.module(
            "test_pairer", "reference/runner/pair-persistent.py"
        )
        pilot, selection = self.preparation.prepare()
        self.request = {
            "generator": self.write("generator.json", self.generator.generate()),
            "pilot": self.write("pilot.json", pilot),
            "pilot_selection": self.write("selection.json", selection),
            "reference_directories": {},
        }
        reports = []
        for engine in ("pari", "hecke"):
            directory = self.root / engine
            directory.mkdir()
            self.request["reference_directories"][engine] = str(directory)
            provenance = {
                "input_sha256": self.request["pilot"]["sha256"],
                "threads": 1,
                "sha256": {"synthetic-not-runtime-attestation": "a" * 64},
            }
            provenance["sha256"].update(
                {
                    "/synthetic/" + relative: replay.pinned(replay.ROOT / relative)[
                        "sha256"
                    ]
                    for relative in replay.WORKER_SOURCES[engine]
                }
            )
            run = {
                "engine": engine,
                "records": pilot,
                "bits": 200,
                "iterations": 1,
                "samples": 1,
                "seed": 1,
                "provenance": provenance,
            }
            self.write(f"{engine}/run.json", run)
            for record in pilot:
                name = "sample-0001-" + record["label"]
                receipt = {
                    "schema": "sagejs.general-frontier-persistent-screen.v1",
                    "stage": "sample",
                    "qualification_evidence": False,
                    "engine": engine,
                    "record": record,
                    "status": "timeout",
                    "wall_seconds": 60,
                    "stdout": "",
                    "stderr": "",
                    "bits": 200,
                    "iterations": 1,
                    "sample": 1,
                    "declared_samples": 1,
                    "request_id": name,
                    "provenance": provenance,
                }
                self.write(f"{engine}/{name}.json", receipt)
            reports.append(self.pairer.review.summarize(directory))
        self.request["paired"] = self.write("paired.json", self.pairer.pair(*reports))

    def write(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value, sort_keys=True))
        return replay.pinned(path)

    def test_genuine_schemas_and_all_raw_pins_replay_offline(self):
        out = replay.rebuild(self.request)
        self.assertEqual(len(out["generator"]["records"]), 112)
        self.assertEqual(len(out["paired"]["rows"]), 28)
        self.assertEqual(len(out["raw_reference_files"]), 58)
        self.assertTrue(
            all(r["status"] == "censored-or-missing" for r in out["paired"]["rows"])
        )

    def test_generator_mutation_rehashed_still_rejected(self):
        g = self.generator.generate()
        g["records"][0]["coefficients"][0] = "2"
        self.request["generator"] = self.write("generator.json", g)
        with self.assertRaisesRegex(ValueError, "generation policy"):
            replay.rebuild(self.request)

    def test_pilot_omission_rehashed_still_rejected(self):
        pilot, _ = self.preparation.prepare()
        self.request["pilot"] = self.write("pilot.json", pilot[:-1])
        with self.assertRaisesRegex(ValueError, "predeclared"):
            replay.rebuild(self.request)

    def test_unknown_generator_schema_rejected(self):
        g = self.generator.generate()
        g["schema"] = "fake-lmfdb-v2"
        self.request["generator"] = self.write("generator.json", g)
        with self.assertRaisesRegex(ValueError, "schema"):
            replay.rebuild(self.request)

    def test_paired_summary_mutation_rehashed_still_rejected(self):
        p = json.loads(Path(self.request["paired"]["path"]).read_text())
        p["rows"][0]["status"] = "paired-discovery"
        self.request["paired"] = self.write("paired.json", p)
        with self.assertRaisesRegex(ValueError, "raw reconstruction"):
            replay.rebuild(self.request)

    def test_raw_receipt_mutation_rejected_even_with_valid_paired_file(self):
        path = next((self.root / "pari").glob("sample*.json"))
        raw = json.loads(path.read_text())
        raw["wall_seconds"] = 59
        self.write(str(path.relative_to(self.root)), raw)
        with self.assertRaisesRegex(ValueError, "rebuilt raw receipts"):
            replay.rebuild(self.request)

    def test_raw_run_input_hash_conflict_rejected(self):
        path = self.root / "pari/run.json"
        raw = json.loads(path.read_text())
        raw["provenance"]["input_sha256"] = "b" * 64
        self.write("pari/run.json", raw)
        with self.assertRaisesRegex(ValueError, "input identity"):
            replay.rebuild(self.request)

    def test_raw_unknown_status_rejected(self):
        path = next((self.root / "pari").glob("sample*.json"))
        raw = json.loads(path.read_text())
        raw["status"] = "trusted"
        self.write(str(path.relative_to(self.root)), raw)
        with self.assertRaisesRegex(ValueError, "unknown sample status"):
            replay.rebuild(self.request)

    def test_worker_source_mismatch_rejected_even_after_reports_rebuilt(self):
        directory = self.root / "pari"
        for path in directory.glob("*.json"):
            raw = json.loads(path.read_text())
            raw["provenance"]["sha256"]["/synthetic/reference/pari-screen.gp"] = (
                "b" * 64
            )
            self.write(str(path.relative_to(self.root)), raw)
        reports = [
            self.pairer.review.summarize(self.root / engine)
            for engine in ("pari", "hecke")
        ]
        self.request["paired"] = self.write("paired.json", self.pairer.pair(*reports))
        with self.assertRaisesRegex(ValueError, "worker source identity"):
            replay.rebuild(self.request)

    def test_pin_mutation_rejected(self):
        request = copy.deepcopy(self.request)
        request["paired"]["sha256"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "hash changed"):
            replay.rebuild(request)

    def test_new_raw_file_during_summarize_is_rejected(self):
        original_module = replay.module
        original_summarize = self.pairer.review.summarize

        def select_module(name, relative):
            if name == "generated_pairer":
                return self.pairer
            return original_module(name, relative)

        def add_after_summarize(directory):
            report = original_summarize(directory)
            (directory / "concurrent-added.json").write_text("{}")
            return report

        with mock.patch.object(replay, "module", side_effect=select_module):
            with mock.patch.object(
                self.pairer.review, "summarize", side_effect=add_after_summarize
            ):
                with self.assertRaisesRegex(ValueError, "inputs changed during replay"):
                    replay.rebuild(self.request)


if __name__ == "__main__":
    unittest.main()
