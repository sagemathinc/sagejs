#!/usr/bin/env python3
"""Adversarial tests for answer-blind confirmation selection."""

from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load_selector():
    spec = importlib.util.spec_from_file_location(
        "confirmation_select", HERE / "select.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SELECT = load_selector()


def polynomial(value: int) -> list[str]:
    return [str(value), "1", "0", "1"]


def candidate(name: str, value: int) -> dict:
    coefficients = polynomial(value)
    return {
        "id": name,
        "polynomialAscending": coefficients,
        "polynomialSha256": SELECT.polynomial_digest(coefficients),
        "degree": 3,
        "irreducible": True,
        "signature": [1, 1],
        "timingStratum": "SECRET-TIMING",
        "traits": ["SECRET-TRAIT"],
        "constructionEvidence": {"fieldDiscriminant": "SECRET-DISC"},
        "expected": {"classNumber": "SECRET-ANSWER"},
    }


def panel() -> dict:
    values = iter(range(10_000, 10_120))
    partitions = {}
    for partition in ("open", "heldOut"):
        cases = []
        for index in range(60):
            value = next(values)
            coefficients = polynomial(value)
            cases.append(
                {
                    "fieldId": f"original-{partition}-{index}",
                    "field": {"coefficientsAscending": coefficients},
                }
            )
        partitions[partition] = {"cases": cases}
    return {
        "schema": "sagejs.rust-class-group/qualified-neutral-panel-v1",
        "partitions": partitions,
    }


class ConfirmationSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = SELECT.load_json(HERE / "policy.json")
        SELECT.validate_policy(self.policy)
        self.panel = panel()
        self.pool = {
            "schema": SELECT.POOL_SCHEMA,
            "candidates": [
                candidate(f"fresh-{index}", index + 1) for index in range(20)
            ],
        }

    def test_mutating_every_answer_field_cannot_change_selection(self) -> None:
        before = SELECT.select_projections(self.pool, self.panel, self.policy)
        mutated = copy.deepcopy(self.pool)
        for index, item in enumerate(mutated["candidates"]):
            item["expected"] = {"classNumber": f"CHANGED-{index}"}
            item["signature"] = [3, 0]
            item["timingStratum"] = f"CHANGED-{index}"
            item["traits"] = [f"CHANGED-{index}"]
            item["constructionEvidence"] = {"fieldDiscriminant": f"CHANGED-{index}"}
        after = SELECT.select_projections(mutated, self.panel, self.policy)
        self.assertEqual(before, after)

    def test_original_identity_and_polynomial_are_both_excluded(self) -> None:
        original = self.panel["partitions"]["open"]["cases"][0]
        duplicate_id = candidate(original["fieldId"], 90_001)
        duplicate_polynomial = candidate("fresh-duplicate-polynomial", 90_002)
        duplicate_polynomial["polynomialAscending"] = original["field"][
            "coefficientsAscending"
        ]
        duplicate_polynomial["polynomialSha256"] = SELECT.polynomial_digest(
            duplicate_polynomial["polynomialAscending"]
        )
        pool = copy.deepcopy(self.pool)
        pool["candidates"].extend((duplicate_id, duplicate_polynomial))
        selected = SELECT.select_projections(pool, self.panel, self.policy)
        self.assertNotIn(duplicate_id["id"], {item["id"] for item in selected})
        self.assertNotIn(
            duplicate_polynomial["polynomialSha256"],
            {item["polynomialSha256"] for item in selected},
        )

    def test_public_output_rejects_answer_injection_at_any_depth(self) -> None:
        clean = {"answerVisibility": "none", "cases": []}
        SELECT.assert_answer_free(clean)
        for forbidden in SELECT.FORBIDDEN_OUTPUT_KEYS:
            with self.assertRaises(RuntimeError, msg=forbidden):
                SELECT.assert_answer_free({"nested": [{forbidden: "SECRET"}]})

    def test_projection_rejects_digest_and_shape_mutations(self) -> None:
        bad_digest = candidate("bad-digest", 1)
        bad_digest["polynomialSha256"] = "0" * 64
        with self.assertRaises(RuntimeError):
            SELECT.answer_free_projection(bad_digest)
        bad_shape = candidate("bad-shape", 2)
        bad_shape["polynomialAscending"][-1] = "2"
        bad_shape["polynomialSha256"] = SELECT.polynomial_digest(
            bad_shape["polynomialAscending"]
        )
        with self.assertRaises(RuntimeError):
            SELECT.answer_free_projection(bad_shape)

    def test_selection_is_deterministic_and_exactly_twelve(self) -> None:
        first = SELECT.select_projections(self.pool, self.panel, self.policy)
        second = SELECT.select_projections(
            copy.deepcopy(self.pool), self.panel, self.policy
        )
        self.assertEqual(first, second)
        self.assertEqual(len(first), 12)

    def test_policy_cannot_claim_preregistration(self) -> None:
        mutated = copy.deepcopy(self.policy)
        mutated["preregistrationStatus"] = "preregistered"
        with self.assertRaises(RuntimeError):
            SELECT.validate_policy(mutated)

    def test_private_binding_must_stay_outside_repository(self) -> None:
        with self.assertRaises(RuntimeError):
            SELECT.require_outside_repository(HERE / "binding.json")


if __name__ == "__main__":
    unittest.main()
