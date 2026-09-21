#!/usr/bin/env python3
"""Adversarial tests for the answer-free held-out executor."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load_runner():
    spec = importlib.util.spec_from_file_location("heldout_run", HERE / "run.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RUNNER = load_runner()


class HeldoutExecutorTests(unittest.TestCase):
    def test_frozen_config_selects_only_heldout_cubics(self) -> None:
        config = RUNNER.load_json(HERE / "config.json")
        RUNNER.validate_config(config)
        selected, _, _, _ = RUNNER.validate_selection(config)
        self.assertEqual(len(selected), 12)
        self.assertEqual(
            [case["fieldId"] for case in selected],
            sorted(case["fieldId"] for case in selected),
        )
        self.assertTrue(all(case["field"]["degree"] == 3 for case in selected))

    def test_confirmation_policy_mutations_fail_closed(self) -> None:
        config = RUNNER.load_json(HERE / "config.json")
        for key in (
            "excludeOriginalQualificationPanel",
            "freezeBeforeInitialHeldoutExecution",
            "fixRequiresUntouchedConfirmationSet",
            "neverRemoveOrReplaceFailure",
        ):
            mutated = json.loads(json.dumps(config))
            mutated["confirmationPolicy"][key] = False
            with self.assertRaises(RuntimeError, msg=key):
                RUNNER.validate_config(mutated)

    def test_private_bundle_is_refused_inside_repository(self) -> None:
        repository = HERE.parents[4]
        with self.assertRaises(RuntimeError):
            RUNNER.refuse_repository_path(HERE / "private.json", repository)
        with tempfile.TemporaryDirectory() as directory:
            accepted = RUNNER.refuse_repository_path(
                Path(directory) / "private.json", repository
            )
            self.assertFalse(accepted.is_relative_to(repository))

    def test_redaction_scanner_rejects_nested_answer_fields(self) -> None:
        base = {"answerDisclosure": "none", "cases": []}
        RUNNER.assert_redacted(base)
        for forbidden in RUNNER.FORBIDDEN_REDACTED_KEYS:
            mutated = {"answerDisclosure": "none", "nested": {forbidden: "sentinel"}}
            with self.assertRaises(RuntimeError, msg=forbidden):
                RUNNER.assert_redacted(mutated)

    def test_failure_classifier_never_returns_raw_error_as_stage(self) -> None:
        secret = "Completion(SECRET_EXPECTED_VALUE)"
        completed = subprocess.CompletedProcess(
            [], 1, json.dumps({"error": secret}), "private stderr"
        )
        status, stage, parsed = RUNNER.classify_process(completed, timed_out=False)
        self.assertEqual((status, stage), ("failed", "unit-and-analytic-completion"))
        self.assertNotIn("SECRET", stage)
        self.assertEqual(parsed["error"], secret)

    def test_timeout_is_redacted_without_process_output(self) -> None:
        status, stage, parsed = RUNNER.classify_process(None, timed_out=True)
        self.assertEqual((status, stage, parsed), ("failed", "timeout", None))


if __name__ == "__main__":
    unittest.main()
