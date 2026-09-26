#!/usr/bin/env python3
"""Adversarial checks for the frozen class-group corpus boundary."""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

import corpus_tool


HERE = Path(__file__).resolve().parent


def load(name: str) -> dict[str, Any]:
    return json.loads((HERE / name).read_text(encoding="utf-8"))


SPEC = load("qualification-corpus-spec-v1.json")
PANEL = load("qualified-neutral-panel-v1.json")
RECEIPT = load("qualification-selection-receipt-v1.json")
PANEL_SCHEMA = load("qualified-neutral-panel-v1.schema.json")
RECEIPT_SCHEMA = load("qualification-selection-receipt-v1.schema.json")


def expect_structural_rejection(
    label: str,
    mutate: Callable[[dict[str, Any], dict[str, Any]], None],
) -> None:
    panel = copy.deepcopy(PANEL)
    receipt = copy.deepcopy(RECEIPT)
    mutate(panel, receipt)
    try:
        corpus_tool.validate_qualified_neutral_panel(panel, receipt, SPEC)
    except corpus_tool.CorpusError:
        return
    raise AssertionError(f"structural validator accepted {label}")


def expect_schema_rejection(
    label: str,
    schema: dict[str, Any],
    value: dict[str, Any],
) -> None:
    errors = list(Draft202012Validator(schema).iter_errors(value))
    if not errors:
        raise AssertionError(f"JSON schema accepted {label}")


def first_case(panel: dict[str, Any]) -> dict[str, Any]:
    return panel["partitions"]["open"]["cases"][0]


def main() -> None:
    Draft202012Validator.check_schema(PANEL_SCHEMA)
    Draft202012Validator.check_schema(RECEIPT_SCHEMA)
    Draft202012Validator(PANEL_SCHEMA).validate(PANEL)
    Draft202012Validator(RECEIPT_SCHEMA).validate(RECEIPT)
    corpus_tool.validate_qualified_neutral_panel(PANEL, RECEIPT, SPEC)

    mutations: list[tuple[str, Callable[[dict[str, Any], dict[str, Any]], None]]] = [
        ("unknown panel key", lambda panel, _: panel.__setitem__("extra", True)),
        (
            "unknown partition key",
            lambda panel, _: panel["partitions"].__setitem__("training", {}),
        ),
        (
            "retry schedule injection",
            lambda panel, _: first_case(panel).__setitem__("retrySchedule", []),
        ),
        (
            "answer injection",
            lambda panel, _: first_case(panel).__setitem__("classNumber", "1"),
        ),
        (
            "nested answer injection",
            lambda panel, _: first_case(panel)["field"].__setitem__("expected", {}),
        ),
        (
            "forged input id",
            lambda panel, _: first_case(panel).__setitem__(
                "inputId", "sha256:" + "0" * 64
            ),
        ),
        (
            "field id without recomputed identity",
            lambda panel, _: first_case(panel).__setitem__("fieldId", "forged-field"),
        ),
        (
            "degree and coefficient mismatch",
            lambda panel, _: first_case(panel)["field"].__setitem__("degree", 6),
        ),
        (
            "noncanonical coefficient",
            lambda panel, _: first_case(panel)["field"][
                "coefficientsAscending"
            ].__setitem__(0, "01"),
        ),
        (
            "nonmonic coefficient vector",
            lambda panel, _: first_case(panel)["field"][
                "coefficientsAscending"
            ].__setitem__(-1, "2"),
        ),
        (
            "false monic claim",
            lambda panel, _: first_case(panel)["field"].__setitem__("monic", False),
        ),
        (
            "false irreducible claim",
            lambda panel, _: first_case(panel)["field"].__setitem__(
                "irreducible", False
            ),
        ),
        (
            "changed proof request",
            lambda panel, _: first_case(panel)["request"].__setitem__(
                "proof", "unconditional"
            ),
        ),
        (
            "changed output request",
            lambda panel, _: first_case(panel)["request"].__setitem__(
                "output", "class-group"
            ),
        ),
        (
            "changed resource limit",
            lambda panel, _: first_case(panel)["request"]["limits"].__setitem__(
                "precisionBits", 8192
            ),
        ),
        (
            "request-side retry schedule",
            lambda panel, _: first_case(panel)["request"].__setitem__(
                "retrySchedule", []
            ),
        ),
        (
            "changed preparation",
            lambda panel, _: first_case(panel)["preparation"].__setitem__(
                "kind", "prepared-field"
            ),
        ),
        (
            "changed randomness algorithm",
            lambda panel, _: first_case(panel)["randomness"].__setitem__(
                "algorithm", "none"
            ),
        ),
        (
            "changed deterministic seed",
            lambda panel, _: first_case(panel)["randomness"].__setitem__(
                "seed", "0" * 64
            ),
        ),
        (
            "oracle answer flag",
            lambda panel, _: first_case(panel).__setitem__(
                "containsOracleAnswers", True
            ),
        ),
        (
            "duplicate field",
            lambda panel, _: panel["partitions"]["open"]["cases"].__setitem__(
                1, copy.deepcopy(first_case(panel))
            ),
        ),
        (
            "passed-panel reorder without receipt rebind",
            lambda panel, _: panel["partitions"]["open"]["cases"].__setitem__(
                slice(0, 2), list(reversed(panel["partitions"]["open"]["cases"][:2]))
            ),
        ),
        ("unknown receipt key", lambda _, receipt: receipt.__setitem__("extra", True)),
        (
            "unknown receipt summary key",
            lambda _, receipt: receipt["partitions"]["open"].__setitem__("extra", True),
        ),
        (
            "changed selection algorithm",
            lambda _, receipt: receipt.__setitem__("selectionAlgorithm", "other"),
        ),
        (
            "malformed source hash",
            lambda _, receipt: receipt.__setitem__("sourcePoolSha256", "0"),
        ),
        (
            "forged panel binding",
            lambda _, receipt: receipt.__setitem__(
                "qualifiedNeutralPanelSha256", "0" * 64
            ),
        ),
        (
            "timing quota underflow",
            lambda _, receipt: receipt["partitions"]["heldOut"][
                "timingStratumCounts"
            ].__setitem__("5ms-to-100ms", 9),
        ),
        (
            "signature entry extension",
            lambda _, receipt: receipt["partitions"]["open"]["legalSignaturesCovered"][
                0
            ].__setitem__("extra", True),
        ),
    ]
    for label, mutate in mutations:
        expect_structural_rejection(label, mutate)

    panel_extra = copy.deepcopy(PANEL)
    first_case(panel_extra)["retrySchedule"] = []
    expect_schema_rejection("runtime retrySchedule", PANEL_SCHEMA, panel_extra)
    panel_answer = copy.deepcopy(PANEL)
    first_case(panel_answer)["expected"] = {"classNumber": "1"}
    expect_schema_rejection("runtime answer", PANEL_SCHEMA, panel_answer)
    receipt_extra = copy.deepcopy(RECEIPT)
    receipt_extra["partitions"]["heldOut"]["extra"] = True
    expect_schema_rejection("receipt extension", RECEIPT_SCHEMA, receipt_extra)

    print(
        "corpus adversarial tests passed: "
        f"2 schemas, {len(mutations)} structural mutations, 3 schema mutations"
    )


if __name__ == "__main__":
    main()
