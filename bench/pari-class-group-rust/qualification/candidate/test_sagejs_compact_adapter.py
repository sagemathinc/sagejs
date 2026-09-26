"""Qualification-only replay of Rust compact presentation evidence.

The retained row-6 integration is deliberately opt-in and content-addressed:

```bash
SAGEJS_ROW6_HASH_BOUND=1 \
SAGEJS_RUST_PREPARED_V2=/tmp/sagejs-row6-v2-fresh-r3.json \
SAGEJS_RUST_COMPACT_CERTIFICATE=/tmp/sagejs-row6-compact-fresh-r3.json \
node bin/sagejs --python \
  bench/pari-class-group-rust/qualification/candidate/test_sagejs_compact_adapter.py
```

Without both evidence paths the file runs only its small counterfeit suite.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import time
from typing import Any

from sagejs.number_fields.class_group_matrix import (
    RelationMatrixError,
    SparseRelationRow,
)
from sagejs.number_fields.compact_relation_presentation import (
    CompactRelationPresentation,
)

_ROW6_PREPARED_SHA256 = (
    "c51c7070bbfb9470b440602f5fae7d87a1fb7bf57f60103a981ef8a1a5594c99"
)
_ROW6_CERTIFICATE_SHA256 = (
    "ce85dcbcfdae9e73f6fe789f8712c463765295c7f41749c0d6950f53127cfaf2"
)
_ROW6_INPUT_ID = (
    "sha256:42ecf93a56de4cc7763d33c8b422e7804582278674c1a6fef41a4799a9930bd5"
)
_ROW6_REPLAY_BUDGET_SECONDS = 600.0
_VERIFIER_SOURCE_PATH = (
    "bench/pari-class-group-rust/qualification/candidate/test_sagejs_compact_adapter.py"
)


def _decimal(value: Any, label: str) -> int:
    if (
        not isinstance(value, str)
        or not value
        or value[0] == "0"
        or any(character < "0" or character > "9" for character in value)
    ):
        raise RelationMatrixError(label + " is not a positive decimal")
    return int(value)


def _signed_decimal(value: Any, label: str, *, nonzero: bool = False) -> int:
    if not isinstance(value, str) or not value:
        raise RelationMatrixError(label + " is not a canonical decimal")
    digits = value[1:] if value.startswith("-") else value
    if (
        not digits
        or (len(digits) > 1 and digits[0] == "0")
        or any(character < "0" or character > "9" for character in digits)
        or value == "-0"
    ):
        raise RelationMatrixError(label + " is not a canonical decimal")
    answer = int(value)
    if nonzero and answer == 0:
        raise RelationMatrixError(label + " must be nonzero")
    return answer


def _closed(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise RelationMatrixError(label + " has an unsupported schema")
    return value


def _natural(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise RelationMatrixError(label + " is not a natural number")
    return value


def _positive_natural(value: Any, label: str) -> int:
    answer = _natural(value, label)
    if answer == 0:
        raise RelationMatrixError(label + " must be positive")
    return answer


def _sparse_vector(
    terms: Any,
    length: int,
    index_key: str,
    coefficient_key: str,
    label: str,
    *,
    decimal_coefficients: bool = True,
) -> tuple[int, ...]:
    if not isinstance(terms, list):
        raise RelationMatrixError(label + " terms must be a list")
    answer = [0] * length
    previous = -1
    for term in terms:
        if not isinstance(term, dict) or set(term) != {index_key, coefficient_key}:
            raise RelationMatrixError(label + " has malformed terms")
        index = _natural(term[index_key], label + " index")
        if not previous < index < length:
            raise RelationMatrixError(label + " index is out of bounds")
        if decimal_coefficients:
            coefficient = _signed_decimal(
                term[coefficient_key], label + " coefficient", nonzero=True
            )
        else:
            coefficient = term[coefficient_key]
            if (
                isinstance(coefficient, bool)
                or not isinstance(coefficient, int)
                or coefficient == 0
            ):
                raise RelationMatrixError(label + " coefficient is invalid")
        answer[index] = coefficient
        previous = index
    return tuple(answer)


_PREPARED_KEYS = {
    "analyticCompletion",
    "classMap",
    "inputId",
    "kernel",
    "mathematicalBoundary",
    "polynomialAscending",
    "presentationIndexEvidence",
    "qualificationStatus",
    "reconstructedUnitLattice",
    "relationCollectionProfile",
    "relationLatticeEvidence",
    "relations",
    "schema",
    "timingsNanoseconds",
    "usesClassGroupAnswersAsInput",
    "usesOracleAsInput",
}
_CERTIFICATE_KEYS = {
    "groupOrder",
    "invariantFactors",
    "latticeIndexEvidence",
    "modularClassMap",
    "qualificationStatus",
    "relationDependencies",
    "relationShape",
    "schema",
    "sourceInputId",
    "standardGeneratorLifts",
    "verified",
}
_VERIFIED_KEYS = {
    "classMapAnnihilatesEveryRelation",
    "dependencyCountEqualsRowsMinusColumns",
    "dependencyLatticeEqualsIntegralLeftKernel",
    "dependencyLatticeIsPrimitive",
    "dependencyRankEqualsRowsMinusColumns",
    "everyDependencyReplaysToZero",
    "fullRelationLatticeIndexEqualsGroupOrder",
    "generatorOrderWitnessesReplayExactly",
    "invariantProductEqualsClaimedClassNumber",
    "projectedDependencyIndexDividesSquareDeterminant",
    "standardGeneratorLiftsMapToCoordinateBasis",
}


def compact_from_rust_v2(
    prepared: dict[str, Any], certificate: dict[str, Any]
) -> CompactRelationPresentation:
    """Translate only exact evidence, then delegate all proof to Sage.js."""
    _closed(prepared, _PREPARED_KEYS, "prepared evidence")
    _closed(certificate, _CERTIFICATE_KEYS, "compact certificate")
    if prepared.get("schema") != "sagejs.rust-class-group/prepared-cubic-class-unit-v2":
        raise RelationMatrixError("unsupported prepared evidence")
    if certificate.get("schema") != (
        "sagejs.rust-class-group/compact-presentation-certificate-v1"
    ):
        raise RelationMatrixError("unsupported Rust compact certificate")
    if certificate.get("sourceInputId") != prepared.get("inputId"):
        raise RelationMatrixError("certificate input identity mismatch")
    if (
        prepared["qualificationStatus"] != "grh-conditional-class-unit-index-one"
        or certificate["qualificationStatus"]
        != "closed-exact-lattice-index-certificate"
        or prepared["usesClassGroupAnswersAsInput"] is not False
        or prepared["usesOracleAsInput"] is not False
    ):
        raise RelationMatrixError("unsupported qualification status")
    verified = _closed(certificate["verified"], _VERIFIED_KEYS, "verified claims")
    if any(value is not True for value in verified.values()):
        raise RelationMatrixError("producer verification claims are incomplete")
    shape = _closed(certificate["relationShape"], {"rows", "columns"}, "relation shape")
    row_count = _natural(shape["rows"], "row count")
    columns = _natural(shape["columns"], "column count")
    prepared_shape = _closed(
        prepared["relations"], {"rows", "columns"}, "prepared shape"
    )
    if (
        _natural(prepared_shape["rows"], "prepared row count") != row_count
        or _natural(prepared_shape["columns"], "prepared column count") != columns
    ):
        raise RelationMatrixError("relation shape mismatch")
    lattice = _closed(
        prepared["relationLatticeEvidence"],
        {"schema", "factorBaseCatalog", "relationRecords"},
        "relation-lattice evidence",
    )
    if (
        lattice["schema"]
        != "sagejs.rust-class-group/prepared-cubic-relation-lattice-v1"
    ):
        raise RelationMatrixError("unsupported relation-lattice evidence")
    catalog = lattice["factorBaseCatalog"]
    if not isinstance(catalog, list) or len(catalog) != columns:
        raise RelationMatrixError("factor-base catalog has the wrong length")
    catalog_keys = {
        "factorBaseIndexZeroBased",
        "generator",
        "hnf",
        "norm",
        "prime",
        "ramification",
        "residueDegree",
    }
    for expected, entry in enumerate(catalog):
        _closed(entry, catalog_keys, "factor-base entry")
        if _natural(entry["factorBaseIndexZeroBased"], "factor-base index") != expected:
            raise RelationMatrixError("factor-base indices are not contiguous")
        for key in ("norm", "prime", "ramification", "residueDegree"):
            _positive_natural(entry[key], "factor-base " + key)
        if (
            not isinstance(entry["generator"], list)
            or len(entry["generator"]) != 3
            or any(
                isinstance(x, bool) or not isinstance(x, int)
                for x in entry["generator"]
            )
            or not isinstance(entry["hnf"], list)
            or len(entry["hnf"]) != 9
            or any(isinstance(x, bool) or not isinstance(x, int) for x in entry["hnf"])
        ):
            raise RelationMatrixError("factor-base entry has malformed coordinates")
    records = lattice["relationRecords"]
    if not isinstance(records, list):
        raise RelationMatrixError("relation records must be a list")
    if len(records) != row_count:
        raise RelationMatrixError("relation record count mismatch")
    relation_rows = []
    for expected, record in enumerate(records):
        _closed(
            record,
            {"integralBasisCoordinates", "primeIdealFactors", "relationIndexZeroBased"},
            "relation record",
        )
        if _natural(record["relationIndexZeroBased"], "relation index") != expected:
            raise RelationMatrixError("relation indices are not contiguous")
        coordinates = record["integralBasisCoordinates"]
        if not isinstance(coordinates, list) or len(coordinates) != 3:
            raise RelationMatrixError("principal coordinates have the wrong length")
        tuple(_signed_decimal(value, "principal coordinate") for value in coordinates)
        relation_rows.append(
            SparseRelationRow(
                columns,
                _sparse_vector(
                    record["primeIdealFactors"],
                    columns,
                    "factorBaseIndexZeroBased",
                    "exponent",
                    "relation",
                    decimal_coefficients=False,
                ),
            )
        )
    invariants = tuple(
        _decimal(value, "invariant factor") for value in certificate["invariantFactors"]
    )
    modular_map = _closed(
        certificate["modularClassMap"], {"moduli", "rows"}, "modular class map"
    )
    if modular_map["moduli"] != certificate["invariantFactors"]:
        raise RelationMatrixError("class-map moduli mismatch")
    class_map_rows = []
    for expected, row in enumerate(modular_map["rows"]):
        _closed(row, {"factorBaseIndexZeroBased", "residues"}, "class-map row")
        if _natural(row["factorBaseIndexZeroBased"], "class-map row index") != expected:
            raise RelationMatrixError("class-map rows are not contiguous")
        class_map_rows.append(row["residues"])
    lifts = certificate["standardGeneratorLifts"]
    if len(lifts) != len(invariants):
        raise RelationMatrixError("standard-generator lift count mismatch")
    generator_transforms = []
    order_combinations = []
    for expected, lift in enumerate(lifts):
        _closed(
            lift,
            {
                "coordinateZeroBased",
                "factorBaseLift",
                "modulus",
                "orderRelationCombination",
            },
            "standard-generator lift",
        )
        if (
            _natural(lift["coordinateZeroBased"], "generator coordinate") != expected
            or _decimal(lift["modulus"], "lift modulus") != invariants[expected]
        ):
            raise RelationMatrixError("standard-generator lift is not canonical")
        generator_transforms.append(
            _sparse_vector(
                lift["factorBaseLift"],
                columns,
                "factorBaseIndexZeroBased",
                "coefficient",
                "generator lift",
            )
        )
        order_combinations.append(
            _sparse_vector(
                lift["orderRelationCombination"],
                row_count,
                "relationIndexZeroBased",
                "coefficient",
                "generator order combination",
            )
        )
    dependencies = []
    for expected, dependency in enumerate(certificate["relationDependencies"]):
        _closed(
            dependency,
            {"dependencyIndexZeroBased", "terms"},
            "relation dependency",
        )
        if (
            _natural(dependency["dependencyIndexZeroBased"], "dependency index")
            != expected
        ):
            raise RelationMatrixError("dependency indices are not contiguous")
        dependencies.append(
            _sparse_vector(
                dependency["terms"],
                row_count,
                "relationIndexZeroBased",
                "coefficient",
                "dependency",
            )
        )
    evidence = _closed(
        certificate["latticeIndexEvidence"],
        {
            "dependencySaturation",
            "fullRelationLatticeIndex",
            "projectedDependencyDeterminant",
            "squareDeterminant",
            "squareRowIndicesZeroBased",
            "surplusRowIndicesZeroBased",
        },
        "lattice-index evidence",
    )
    saturation = _closed(
        evidence["dependencySaturation"],
        {"criterion", "gcd", "selectedMinors"},
        "dependency saturation",
    )
    if (
        saturation["criterion"] != ("gcd-of-exhibited-maximal-dependency-minors-is-one")
        or saturation["gcd"] != "1"
    ):
        raise RelationMatrixError("unsupported dependency-saturation evidence")
    dependency_minors = []
    for minor in saturation["selectedMinors"]:
        _closed(
            minor,
            {"relationRowIndicesZeroBased", "determinant"},
            "dependency minor",
        )
        dependency_minors.append(
            (
                minor["relationRowIndicesZeroBased"],
                _decimal(minor["determinant"], "dependency minor"),
            )
        )
    dependency_minors.sort(key=lambda minor: tuple(minor[0]))
    answer = CompactRelationPresentation.from_small_surplus(
        columns,
        relation_rows,
        invariants,
        class_map_rows,
        generator_transforms,
        dependencies,
        evidence["squareRowIndicesZeroBased"],
        evidence["surplusRowIndicesZeroBased"],
        _decimal(evidence["squareDeterminant"], "square determinant"),
        _decimal(
            evidence["projectedDependencyDeterminant"],
            "projected determinant",
        ),
        dependency_minors,
    )
    for modulus, lift, combination in zip(
        invariants, generator_transforms, order_combinations, strict=True
    ):
        left = tuple(modulus * value for value in lift)
        right = [0] * columns
        for coefficient, relation in zip(combination, relation_rows, strict=True):
            if coefficient:
                for column, value in relation.entries:
                    right[column] += coefficient * value
        if left != tuple(right):
            raise RelationMatrixError(
                "standard-generator order combination does not replay exactly"
            )
    claimed_order = _decimal(certificate["groupOrder"], "group order")
    full_index = _decimal(evidence["fullRelationLatticeIndex"], "full index")
    if (
        claimed_order != answer.order
        or full_index != answer.order
        or not answer.verify()
    ):
        raise RelationMatrixError("Rust compact certificate failed Sage.js replay")
    return answer


PREPARED = {
    "schema": "sagejs.rust-class-group/prepared-cubic-class-unit-v2",
    "inputId": "sha256:sagejs-compact-adapter-test",
    "qualificationStatus": "grh-conditional-class-unit-index-one",
    "usesClassGroupAnswersAsInput": False,
    "usesOracleAsInput": False,
    "relations": {"rows": 3, "columns": 2},
    "relationLatticeEvidence": {
        "schema": "sagejs.rust-class-group/prepared-cubic-relation-lattice-v1",
        "factorBaseCatalog": [
            {
                "factorBaseIndexZeroBased": index,
                "generator": [0, 1, index],
                "hnf": [1, 0, 0, 0, 1, 0, 0, 0, 1],
                "norm": index + 2,
                "prime": index + 2,
                "ramification": 1,
                "residueDegree": 1,
            }
            for index in range(2)
        ],
        "relationRecords": [
            {
                "relationIndexZeroBased": 0,
                "integralBasisCoordinates": ["1", "0", "0"],
                "primeIdealFactors": [{"factorBaseIndexZeroBased": 0, "exponent": 2}],
            },
            {
                "relationIndexZeroBased": 1,
                "integralBasisCoordinates": ["0", "1", "0"],
                "primeIdealFactors": [{"factorBaseIndexZeroBased": 1, "exponent": 1}],
            },
            {
                "relationIndexZeroBased": 2,
                "integralBasisCoordinates": ["0", "1", "0"],
                "primeIdealFactors": [{"factorBaseIndexZeroBased": 1, "exponent": 1}],
            },
        ],
    },
    "analyticCompletion": {},
    "classMap": {},
    "kernel": {},
    "mathematicalBoundary": {},
    "polynomialAscending": [],
    "presentationIndexEvidence": {},
    "reconstructedUnitLattice": {},
    "relationCollectionProfile": {},
    "timingsNanoseconds": {},
}

CERTIFICATE = {
    "schema": "sagejs.rust-class-group/compact-presentation-certificate-v1",
    "sourceInputId": PREPARED["inputId"],
    "qualificationStatus": "closed-exact-lattice-index-certificate",
    "relationShape": {"rows": 3, "columns": 2},
    "invariantFactors": ["2"],
    "groupOrder": "2",
    "modularClassMap": {
        "moduli": ["2"],
        "rows": [
            {"factorBaseIndexZeroBased": 0, "residues": [1]},
            {"factorBaseIndexZeroBased": 1, "residues": [0]},
        ],
    },
    "standardGeneratorLifts": [
        {
            "coordinateZeroBased": 0,
            "modulus": "2",
            "factorBaseLift": [{"factorBaseIndexZeroBased": 0, "coefficient": "1"}],
            "orderRelationCombination": [
                {"relationIndexZeroBased": 0, "coefficient": "1"}
            ],
        }
    ],
    "relationDependencies": [
        {
            "dependencyIndexZeroBased": 0,
            "terms": [
                {"relationIndexZeroBased": 1, "coefficient": "1"},
                {"relationIndexZeroBased": 2, "coefficient": "-1"},
            ],
        }
    ],
    "latticeIndexEvidence": {
        "squareRowIndicesZeroBased": [0, 1],
        "surplusRowIndicesZeroBased": [2],
        "squareDeterminant": "2",
        "projectedDependencyDeterminant": "1",
        "dependencySaturation": {
            "criterion": "gcd-of-exhibited-maximal-dependency-minors-is-one",
            "selectedMinors": [
                {"relationRowIndicesZeroBased": [1], "determinant": "1"}
            ],
            "gcd": "1",
        },
        "fullRelationLatticeIndex": "2",
    },
    # Required producer claims are schema/status metadata, never the authority:
    # every corresponding mathematical statement is independently replayed.
    "verified": {key: True for key in _VERIFIED_KEYS},
}

presentation = compact_from_rust_v2(PREPARED, CERTIFICATE)
assert presentation.verify()
assert presentation.invariants == (2,)
assert presentation.dependency_combination(0) == (0, 1, -1)

counterfeit = copy.deepcopy(CERTIFICATE)
counterfeit["relationDependencies"][0]["terms"][1]["coefficient"] = "-2"
try:
    compact_from_rust_v2(PREPARED, counterfeit)
except RelationMatrixError:
    pass
else:
    raise AssertionError("trusted Rust booleans admitted a counterfeit dependency")

# Every producer assertion is required but independently insufficient.
for verified_key in _VERIFIED_KEYS:
    counterfeit = copy.deepcopy(CERTIFICATE)
    counterfeit["verified"][verified_key] = False
    try:
        compact_from_rust_v2(PREPARED, counterfeit)
    except RelationMatrixError:
        pass
    else:
        raise AssertionError("incomplete producer verification was accepted")

for mutation in (
    lambda p, c: c.update({"qualificationStatus": "candidate-only"}),
    lambda p, c: c["verified"].update({"unknownClaim": True}),
    lambda p, c: c["standardGeneratorLifts"][0]["orderRelationCombination"][0].update(
        {"coefficient": "2"}
    ),
    lambda p, c: c["standardGeneratorLifts"][0]["factorBaseLift"][0].update(
        {"coefficient": 1}
    ),
    lambda p, c: c["relationDependencies"][0]["terms"].reverse(),
    lambda p, c: p.update({"usesOracleAsInput": True}),
    lambda p, c: p["relationLatticeEvidence"].update({"schema": "counterfeit"}),
    lambda p, c: p["relationLatticeEvidence"]["factorBaseCatalog"][0].update(
        {"factorBaseIndexZeroBased": 1}
    ),
    lambda p, c: p["relationLatticeEvidence"]["relationRecords"][0].update(
        {"integralBasisCoordinates": ["01", "0", "0"]}
    ),
    lambda p, c: p["relationLatticeEvidence"]["factorBaseCatalog"][0].update(
        {"factorBaseIndexZeroBased": False}
    ),
    lambda p, c: p["relationLatticeEvidence"]["relationRecords"][0].update(
        {"relationIndexZeroBased": False}
    ),
    lambda p, c: c["modularClassMap"]["rows"][0].update(
        {"factorBaseIndexZeroBased": False}
    ),
    lambda p, c: c["standardGeneratorLifts"][0].update({"coordinateZeroBased": False}),
    lambda p, c: c["relationDependencies"][0].update(
        {"dependencyIndexZeroBased": False}
    ),
    lambda p, c: c["relationDependencies"][0]["terms"][0].update({"coefficient": "١"}),
    lambda p, c: p["relationLatticeEvidence"]["relationRecords"][0].update(
        {"integralBasisCoordinates": ["١", "0", "0"]}
    ),
):
    counterfeit_prepared = copy.deepcopy(PREPARED)
    counterfeit_certificate = copy.deepcopy(CERTIFICATE)
    mutation(counterfeit_prepared, counterfeit_certificate)
    try:
        compact_from_rust_v2(counterfeit_prepared, counterfeit_certificate)
    except RelationMatrixError:
        pass
    else:
        raise AssertionError("counterfeit ignored evidence was accepted")

for catalog_key in ("norm", "prime", "ramification", "residueDegree"):
    for invalid in (0, False):
        counterfeit_prepared = copy.deepcopy(PREPARED)
        counterfeit_certificate = copy.deepcopy(CERTIFICATE)
        counterfeit_prepared["relationLatticeEvidence"]["factorBaseCatalog"][0][
            catalog_key
        ] = invalid
        try:
            compact_from_rust_v2(counterfeit_prepared, counterfeit_certificate)
        except RelationMatrixError:
            pass
        else:
            raise AssertionError("nonpositive factor-base metadata was accepted")

print("Rust v2 compact-certificate Sage.js replay passed")

prepared_path = os.environ.get("SAGEJS_RUST_PREPARED_V2")
certificate_path = os.environ.get("SAGEJS_RUST_COMPACT_CERTIFICATE")
live_paths = (
    (prepared_path, certificate_path) if prepared_path and certificate_path else ()
)
if live_paths:
    started = time.perf_counter()
    with open(_VERIFIER_SOURCE_PATH, "rb") as verifier_source_file:
        verifier_source_hash = hashlib.sha256(verifier_source_file.read()).hexdigest()
    with open(live_paths[0], "rb") as prepared_bytes_file:
        prepared_bytes = prepared_bytes_file.read()
    with open(live_paths[1], "rb") as certificate_bytes_file:
        certificate_bytes = certificate_bytes_file.read()
    prepared_hash = hashlib.sha256(prepared_bytes).hexdigest()
    certificate_hash = hashlib.sha256(certificate_bytes).hexdigest()
    with open(live_paths[0], encoding="utf-8") as prepared_file:
        live_prepared = json.load(prepared_file)
    with open(live_paths[1], encoding="utf-8") as certificate_file:
        live_certificate = json.load(certificate_file)
    live = compact_from_rust_v2(live_prepared, live_certificate)
    replay_seconds = time.perf_counter() - started
    minor_count = len(
        live_certificate["latticeIndexEvidence"]["dependencySaturation"][
            "selectedMinors"
        ]
    )
    if os.environ.get("SAGEJS_ROW6_HASH_BOUND") == "1" and not (
        prepared_hash == _ROW6_PREPARED_SHA256
        and certificate_hash == _ROW6_CERTIFICATE_SHA256
        and live_prepared["inputId"] == _ROW6_INPUT_ID
        and live.row_count == 1137
        and live.column_count == 1130
        and live.invariants == (2, 2)
        and live.order == 4
        and len(live.dependency_transforms) == 7
        and minor_count == 4
        and replay_seconds <= _ROW6_REPLAY_BUDGET_SECONDS
    ):
        raise RelationMatrixError("hash-bound row-6 integration receipt mismatch")
    print(
        json.dumps(
            {
                "backend": live.backend,
                "columns": live.column_count,
                "dependencies": len(live.dependency_transforms),
                "dependencyMinorGcd": 1,
                "invariants": list(live.invariants),
                "order": live.order,
                "preparedSha256": prepared_hash,
                "certificateSha256": certificate_hash,
                "selectedDependencyMinors": minor_count,
                "verificationBudgetSeconds": _ROW6_REPLAY_BUDGET_SECONDS,
                "verificationSeconds": replay_seconds,
                "verifierSourceSha256": verifier_source_hash,
                "rows": live.row_count,
                "status": "independent-sagejs-replay-passed",
            },
            sort_keys=True,
        )
    )
