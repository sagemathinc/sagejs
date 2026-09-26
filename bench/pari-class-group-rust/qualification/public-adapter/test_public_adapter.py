"""Focused fail-closed tests for the prepared-cubic public adapter."""

from __future__ import annotations

import copy
import json
import os

import sagejs.number_fields.rust_class_group_preparation as adapter
from sagejs.number_fields.class_unit_groups import (
    ClassUnitComputation,
    INCOMPLETE_RESOURCE_LIMIT,
)


class _Field:
    pass


INPUT_ID = "sha256:" + "a" * 64


PREPARED = {
    "schema": "sagejs.rust-class-group.neutral-input/v1",
    "inputId": INPUT_ID,
    "field": {"coefficientsAscending": ["-1", "0", "1", "1"]},
    "preparation": {},
    "containsOracleAnswers": False,
}

RESULT = {
    "schema": "sagejs.rust-class-group/prepared-cubic-class-unit-v1",
    "inputId": INPUT_ID,
    "polynomialAscending": ["-1", "0", "1", "1"],
    "qualificationStatus": "grh-conditional-class-unit-index-one",
    "usesOracleAsInput": False,
    "usesClassGroupAnswersAsInput": False,
    "mathematicalBoundary": (
        "replay-validated-prepared-cubic-to-complete-class-and-unit-result"
    ),
    "relations": {"rows": 9, "columns": 2},
    "classMap": {
        "generatorMajorCoordinates": [[0], [1]],
        "selectedGeneratorIndicesZeroBased": [1],
        "selectedGeneratorPrimeIdeals": [{"prime": "2"}],
    },
    "analyticCompletion": {
        "candidateClassNumber": "2",
        "candidateInvariantFactors": ["2"],
    },
}


def _generator_receipt() -> dict[str, object]:
    return {
        "schema": "sagejs.rust-class-group/generator-order-verification-v1",
        "inputId": INPUT_ID,
        "authority": "independent-sagejs-ideal-arithmetic",
        "verifiedGeneratorCount": 1,
        "generators": [
            {
                "generatorCoordinateZeroBased": 0,
                "order": 2,
                "hnfReplayed": True,
                "principalIdealEquality": True,
            }
        ],
    }


def _adapt(result: dict[str, object]) -> ClassUnitComputation:
    original_prepare = adapter.prepare_cubic_for_rust
    original_verify = adapter.verify_rust_class_generator_orders
    try:
        adapter.prepare_cubic_for_rust = lambda field: copy.deepcopy(PREPARED)
        adapter.verify_rust_class_generator_orders = lambda field, prepared, answer: (
            _generator_receipt()
        )
        return adapter.adapt_rust_prepared_cubic_class_unit_result(
            _Field(), copy.deepcopy(PREPARED), result
        )
    finally:
        adapter.prepare_cubic_for_rust = original_prepare
        adapter.verify_rust_class_generator_orders = original_verify


def _raises(exception: type[BaseException], callback: object) -> None:
    try:
        callback()
    except exception:
        return
    raise AssertionError("expected " + exception.__name__)


answer = _adapt(copy.deepcopy(RESULT))
assert type(answer) is ClassUnitComputation
assert answer.complete is False
assert answer.proof_status == INCOMPLETE_RESOURCE_LIMIT
assert answer.tentative_invariants == (2,)
assert answer._class_group is None
assert answer._unit_group is None
assert answer.diagnostics["candidateOnly"] is True
assert len(answer.diagnostics["remainingEvidenceGaps"]) == 6
_raises(ValueError, answer.class_group)
_raises(ValueError, answer.class_number)
_raises(ValueError, answer.unit_group)

counterfeit = copy.deepcopy(RESULT)
counterfeit["publicComplete"] = True
_raises(ValueError, lambda: _adapt(counterfeit))

counterfeit_nonboolean = copy.deepcopy(RESULT)
counterfeit_nonboolean["publicComplete"] = "true"
_raises(ValueError, lambda: _adapt(counterfeit_nonboolean))

noncanonical_number = copy.deepcopy(RESULT)
noncanonical_number["diagnosticOnly"] = float("nan")
_raises(TypeError, lambda: _adapt(noncanonical_number))

wrong_number = copy.deepcopy(RESULT)
wrong_number["analyticCompletion"]["candidateClassNumber"] = "4"
_raises(ArithmeticError, lambda: _adapt(wrong_number))

wrong_coordinates = copy.deepcopy(RESULT)
wrong_coordinates["classMap"]["generatorMajorCoordinates"][1][0] = 2
_raises(ValueError, lambda: _adapt(wrong_coordinates))

wrong_standard_generator = copy.deepcopy(RESULT)
wrong_standard_generator["classMap"]["generatorMajorCoordinates"][1][0] = 0
_raises(ArithmeticError, lambda: _adapt(wrong_standard_generator))

duplicate_generators = copy.deepcopy(RESULT)
duplicate_generators["analyticCompletion"]["candidateClassNumber"] = "4"
duplicate_generators["analyticCompletion"]["candidateInvariantFactors"] = ["2", "2"]
duplicate_generators["classMap"]["generatorMajorCoordinates"] = [[1, 0], [0, 1]]
duplicate_generators["classMap"]["selectedGeneratorIndicesZeroBased"] = [0, 0]
duplicate_generators["classMap"]["selectedGeneratorPrimeIdeals"] = [
    {"prime": "2"},
    {"prime": "3"},
]
_raises(ValueError, lambda: _adapt(duplicate_generators))

wrong_input = copy.deepcopy(RESULT)
wrong_input["inputId"] = "sha256:counterfeit"
_raises(ValueError, lambda: _adapt(wrong_input))

print("prepared-cubic public adapter: pass")


# Exercise the checked boundary against the retained certified bundle itself,
# not merely the counterfeit-focused unit fixture above.
qualification = os.path.dirname(os.path.dirname(__file__))
with open(
    os.path.join(
        qualification,
        "row6-candidate",
        "inputs",
        "complex-cubic-minus-23-neutral-prepared-field.json",
    ),
    encoding="utf-8",
) as stream:
    retained_prepared = json.load(stream)
with open(
    os.path.join(
        qualification,
        "row6-candidate",
        "results",
        "complex-cubic-minus-23-run.json",
    ),
    encoding="utf-8",
) as stream:
    retained_result = json.load(stream)
ring = PolynomialRing(QQ, "x")  # noqa: F821
x = ring.gen()
retained_field = NumberField(x**3 - x + 1, "a")  # noqa: F821
retained_answer = adapter.adapt_rust_prepared_cubic_class_unit_result(
    retained_field, retained_prepared, retained_result
)
assert type(retained_answer) is ClassUnitComputation
assert retained_answer.complete is False
assert retained_answer.tentative_invariants == ()
assert (
    retained_answer.diagnostics["generatorOrderVerification"]["verifiedGeneratorCount"]
    == 0
)
print("retained prepared-cubic bundle: honest incomplete pass")
