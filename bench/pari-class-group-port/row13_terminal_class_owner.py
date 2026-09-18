"""Exact terminal class owner for prepared-panel row 13."""

from __future__ import annotations

import hashlib
import importlib
import json
from collections.abc import Mapping, Sequence
from typing import Any


ROWS = 999
COLUMNS = 1006
DEGREE = 4
OWNER_SCHEMA = "sagejs.pari-class-group/row13-terminal-class-owner-v1"
ANCESTRY_SCHEMA = "sagejs.pari-class-group/row13-column-ancestry-v1"


class Row13TerminalClassFailure(ValueError):
    """The row-13 terminal class evidence failed exact replay."""


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row13TerminalClassFailure(label + " is not an object")
    return value


def _integers(value: Any, length: int, label: str) -> tuple[int, ...]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise Row13TerminalClassFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row13TerminalClassFailure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row13TerminalClassFailure(label + " is not canonical")
        result.append(number)
    return tuple(result)


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()


def _quartic_replay() -> Any:
    module = importlib.import_module("field3_relation_replay_map")
    module.__package__ = "bench.pari-class-group-port"
    return module


def _authenticate_principals(
    records: tuple[int, ...],
    generators: tuple[int, ...],
    metadata: Mapping[str, Any],
) -> tuple[dict[str, int], list[str]]:
    prepared = _mapping(metadata.get("prepared"), "prepared metadata")
    factor = _mapping(metadata.get("factor"), "factor metadata")
    table = _integers(prepared.get("basis_table"), 64, "multiplication table")
    ideals = _integers(factor.get("packetIdeals"), 16 * ROWS, "packet ideals")
    factor_base = tuple(ideals[16 * index : 16 * (index + 1)] for index in range(ROWS))
    identity = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    replay = _quartic_replay()
    quartic = importlib.import_module(
        "bench.pari-class-group-port.quartic_signed_genback"
    )
    checked_products = 0
    nonzero_entries = 0
    maximum_exponent = 0
    norm_signs: list[str] = []
    for column in range(COLUMNS):
        product = identity
        for row in range(ROWS):
            exponent = records[column * ROWS + row]
            if exponent < 0:
                raise Row13TerminalClassFailure("raw relation exponent is negative")
            maximum_exponent = max(maximum_exponent, exponent)
            if exponent:
                nonzero_entries += 1
            base = factor_base[row]
            power = exponent
            while power:
                if power & 1:
                    product = replay._quartic_product(product, base, table)
                    checked_products += 1
                power //= 2
                if power:
                    base = replay._quartic_product(base, base, table)
                    checked_products += 1
        generator = generators[DEGREE * column : DEGREE * (column + 1)]
        if not any(generator):
            raise Row13TerminalClassFailure("raw principal generator is zero")
        if product != replay._principal_hnf(generator, table):
            raise Row13TerminalClassFailure(
                "raw principal equation failed at column " + str(column)
            )
        multiplication = [0] * 16
        quartic.pari_quartic_mul_matrix(list(table), list(generator), multiplication)
        determinant = replay._determinant4(multiplication)
        if determinant == 0:
            raise Row13TerminalClassFailure("principal generator has zero norm")
        norm_signs.append("-1" if determinant < 0 else "1")
    return (
        {
            "principalEquations": COLUMNS,
            "nonzeroRelationEntries": nonzero_entries,
            "idealProducts": checked_products,
            "maximumRawExponent": maximum_exponent,
        },
        norm_signs,
    )


def _factor_base_projection(
    metadata: Mapping[str, Any], metadata_sha256: str
) -> dict[str, Any]:
    prepared = _mapping(metadata.get("prepared"), "prepared metadata")
    factor = _mapping(metadata.get("factor"), "factor metadata")
    projection = {
        "packetIdeals": [
            str(value)
            for value in _integers(
                factor.get("packetIdeals"), 16 * ROWS, "packet ideals"
            )
        ],
        "packetNorms": [
            str(value)
            for value in _integers(factor.get("packetNorms"), ROWS, "packet norms")
        ],
        "packetIds": [
            str(value)
            for value in _integers(factor.get("packetIds"), ROWS, "packet IDs")
        ],
        "relationPrimes": [
            str(value)
            for value in _integers(
                factor.get("relationPrimes"), ROWS, "relation primes"
            )
        ],
        "basisTable": [
            str(value)
            for value in _integers(
                prepared.get("basis_table"), 64, "multiplication table"
            )
        ],
    }
    canonical = json.dumps(projection, separators=(",", ":"), sort_keys=True)
    return {
        **projection,
        "metadataSha256": metadata_sha256,
        "projectionSha256": hashlib.sha256(canonical.encode()).hexdigest(),
    }


def compose_row13_terminal_class_owner(
    accepted: Mapping[str, Any],
    metadata_receipt: Mapping[str, Any],
    ancestry: Mapping[str, Any],
) -> dict[str, Any]:
    """Authenticate the cyclic order-two class generator and its principal square."""
    accepted = _mapping(accepted, "accepted owner")
    metadata_receipt = _mapping(metadata_receipt, "metadata receipt")
    ancestry = _mapping(ancestry, "column ancestry")
    if (
        accepted.get("schema")
        != "sagejs.pari-class-group/row13-accepted-relation-owner-v1"
    ):
        raise Row13TerminalClassFailure("wrong accepted owner")
    accepted_sha256 = _hash(accepted)
    metadata = _mapping(metadata_receipt.get("metadata"), "factor metadata")
    metadata_sha256 = metadata_receipt.get("metadataSha256")
    if (
        not isinstance(metadata_sha256, str)
        or _hash(metadata) != metadata_sha256
        or accepted.get("ancestry", {}).get("factorMetadataSha256") != metadata_sha256
    ):
        raise Row13TerminalClassFailure("metadata ancestry changed")
    if ancestry.get("schema") != ANCESTRY_SCHEMA:
        raise Row13TerminalClassFailure("wrong column ancestry")
    ancestry_state = _mapping(ancestry.get("state"), "column ancestry state")
    expected_state = {
        "backend": "source-hnfspec-hnfadd-reverse-replay",
        "selectedColumns": 8,
        "kernelColumns": 7,
        "classColumns": 1,
        "relationReplayCells": ROWS * 8,
        "acceptedOwnerSha256": accepted_sha256,
        "metadataSha256": metadata_sha256,
        "relationCollectionRerun": False,
        "frozenW0UsedAsInput": False,
    }
    for key, expected in expected_state.items():
        if ancestry_state.get(key) != expected:
            raise Row13TerminalClassFailure("column ancestry changed: " + key)
    final = _mapping(accepted.get("final"), "accepted final owner")
    records = _integers(final.get("records"), ROWS * COLUMNS, "raw relations")
    generators = _integers(
        final.get("generators"), DEGREE * COLUMNS, "principal generators"
    )
    presentation = _integers(final.get("h"), 1, "terminal presentation")
    if presentation != (2,):
        raise Row13TerminalClassFailure("terminal presentation is not [2]")
    if _integers(final.get("hnfState"), 9, "terminal HNF state") != (
        1,
        8,
        998,
        0,
        7,
        1,
        0,
        1006,
        0,
    ):
        raise Row13TerminalClassFailure("terminal HNF state changed")
    permutation = _integers(final.get("perm"), ROWS, "terminal permutation")
    accepted_active_row = permutation[0] - 1
    active_row = ancestry_state.get("activeFactorRow")
    if isinstance(active_row, bool) or not isinstance(active_row, int):
        raise Row13TerminalClassFailure("replay active factor row is invalid")
    if active_row < 0 or active_row >= ROWS:
        raise Row13TerminalClassFailure("active factor row is invalid")
    if accepted_active_row < 0 or accepted_active_row >= ROWS:
        raise Row13TerminalClassFailure("accepted active factor row is invalid")
    if ancestry_state.get("acceptedActiveFactorRow") != accepted_active_row:
        raise Row13TerminalClassFailure("accepted pivot ancestry changed")
    class_transform = _integers(
        ancestry.get("rawToPresentation"), COLUMNS, "class transform"
    )
    unit_transform = _integers(
        ancestry.get("rawToUnitKernel"), 7 * COLUMNS, "unit transform"
    )
    for row in range(ROWS):
        actual = sum(
            records[column * ROWS + row] * class_transform[column]
            for column in range(COLUMNS)
        )
        expected = 2 if row == active_row else 0
        if actual != expected:
            raise Row13TerminalClassFailure("class transform failed exact replay")
    for kernel in range(7):
        for row in range(ROWS):
            total = sum(
                records[column * ROWS + row] * unit_transform[kernel * COLUMNS + column]
                for column in range(COLUMNS)
            )
            if total != 0:
                raise Row13TerminalClassFailure("unit transform is not a kernel")
    principal_state, principal_norm_signs = _authenticate_principals(
        records, generators, metadata
    )
    factor_base = _factor_base_projection(metadata, metadata_sha256)
    mapped_ideal = factor_base["packetIdeals"][16 * active_row : 16 * (active_row + 1)]
    raw_product = []
    for relation, exponent in enumerate(class_transform):
        if exponent:
            raw_product.append(
                {
                    "rawRelationIndex": str(relation),
                    "exponent": str(exponent),
                    "principalFactors": [
                        {
                            "values": [
                                str(value)
                                for value in generators[
                                    DEGREE * relation : DEGREE * (relation + 1)
                                ]
                            ],
                            "denominator": "1",
                            "exponent": "1",
                        }
                    ],
                }
            )
    if not raw_product:
        raise Row13TerminalClassFailure("order witness is empty")
    factor_map = ["0"] * ROWS
    factor_map[active_row] = "1"
    witness = {
        "schema": "sagejs.pari-class-group/row13-terminal-class-witness-v1",
        "field": {
            "coefficients": list(accepted.get("field", {}).get("polynomial", [])),
            "signature": [2, 1],
        },
        "classGroup": {"classNumber": "2", "invariants": ["2"]},
        "witnesses": [
            {
                "order": "2",
                "properMultiplesRejected": 1,
                "smithQuotientCoordinates": ["1"],
                "presentationRelation": ["1"],
                "idealHnf": mapped_ideal,
                "rawPrincipalProduct": raw_product,
            }
        ],
        "proof": {
            "presentationDeterminant": "2",
            "rawRelations": COLUMNS,
            "factorBaseSize": ROWS,
            "independenceChecks": 2,
            "frozenW0UsedAsInput": False,
        },
        "publicComplete": False,
    }
    return {
        "schema": OWNER_SCHEMA,
        "ancestry": {
            "acceptedOwnerSha256": accepted_sha256,
            "metadataSha256": metadata_sha256,
        },
        "activeFactorRows": [str(active_row)],
        "factorMap": factor_map,
        "rawToPresentation": [str(value) for value in class_transform],
        "rawToUnitKernel": [str(value) for value in unit_transform],
        "principalAuthentication": principal_state,
        "principalNormSigns": principal_norm_signs,
        "factorBase": factor_base,
        "columnAncestry": dict(ancestry_state),
        "classWitness": witness,
        "relationCollectionRerun": False,
        "frozenW0UsedAsInput": False,
        "publicComplete": False,
    }


__all__ = [
    "OWNER_SCHEMA",
    "Row13TerminalClassFailure",
    "compose_row13_terminal_class_owner",
]
