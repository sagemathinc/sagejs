"""Exact terminal class owner for prepared-panel row 6.

This boundary consumes the live row-6 Gate-C owner, its authenticated
factor-base owner, the prepared maximal-order arithmetic, and a selected-column
reverse-HNF ancestry receipt.  It authenticates every retained principal
relation by exact cubic ideal arithmetic and publishes compact witnesses for
the two independent order-two presentation generators.  No W0 answer event is
an input.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
import json
from collections.abc import Mapping, Sequence
from typing import Any


ROWS = 1130
COLUMNS = 1137
DEGREE = 3
KERNEL_COLUMNS = 7
CLASS_COLUMNS = 2

GATE_SCHEMA = "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1"
FACTOR_SCHEMA = "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1"
ANCESTRY_SCHEMA = "sagejs.pari-class-group/row6-column-ancestry-v1"
OWNER_SCHEMA = "sagejs.pari-class-group/row6-terminal-class-owner-v1"


class Row6TerminalClassFailure(ValueError):
    """The row-6 terminal class evidence failed exact replay."""


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row6TerminalClassFailure(label + " is not an object")
    return value


def _integers(value: Any, length: int, label: str) -> tuple[int, ...]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise Row6TerminalClassFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row6TerminalClassFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row6TerminalClassFailure(label + " is not canonical")
        result.append(integer)
    return tuple(result)


def _hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    ).hexdigest()


def _semantic_hash(value: Any) -> str:
    projected = copy.deepcopy(value)
    projected.pop("ownerSha256", None)
    execution = projected.get("execution")
    if isinstance(execution, dict):
        execution.pop("elapsedNs", None)
        execution.pop("maxRssKiB", None)
    return _hash(projected)


def _cubic_modules() -> tuple[Any, Any, Any, Any]:
    presentation = importlib.import_module(
        "bench.pari-class-group-port.panel1_presentation_authority"
    )
    reduction = importlib.import_module(
        "bench.pari-class-group-port.signed_prime_ideal_reduction"
    )
    prime = importlib.import_module("bench.pari-class-group-port.prime_ideal_hnf")
    exact = importlib.import_module(
        "bench.pari-class-group-port.generator_order_witness"
    )
    return presentation, reduction, prime, exact


def _authenticate_factor_base(
    factor: Mapping[str, Any], prepared: Mapping[str, Any]
) -> tuple[tuple[int, ...], tuple[int, ...], dict[str, int]]:
    factor_data = _mapping(factor.get("factor"), "factor-base data")
    ideals = _integers(factor_data.get("packetIdeals"), 9 * ROWS, "factor ideals")
    norms = _integers(factor_data.get("packetNorms"), ROWS, "factor norms")
    descriptors = factor.get("selectedDescriptors")
    if not isinstance(descriptors, list) or len(descriptors) != ROWS:
        raise Row6TerminalClassFailure("prime descriptors have the wrong length")
    table = _integers(prepared.get("basis_table"), 27, "multiplication table")
    _, _, prime, _ = _cubic_modules()
    reconstructed = 0
    inert_count = 0
    for index, raw in enumerate(descriptors):
        descriptor = _mapping(raw, "prime descriptor")
        generator = _integers(descriptor.get("generator"), DEGREE, "prime generator")
        p = int(descriptor.get("p"))
        e = int(descriptor.get("e"))
        f = int(descriptor.get("f"))
        inert = int(descriptor.get("inert"))
        if p < 2 or e < 1 or f < 1 or inert not in (0, 1):
            raise Row6TerminalClassFailure("prime descriptor left its domain")
        output = [0] * 9
        prime.pari_prime_ideal_hnf(
            list(table),
            list(generator),
            DEGREE,
            p,
            inert,
            [0] * 9,
            [0] * 9,
            [0] * 3,
            output,
        )
        expected = list(ideals[9 * index : 9 * (index + 1)])
        if output != expected:
            raise Row6TerminalClassFailure(
                "factor ideal reconstruction failed at row " + str(index)
            )
        if p**f != norms[index]:
            raise Row6TerminalClassFailure("factor ideal norm changed")
        reconstructed += 1
        inert_count += inert
    return (
        ideals,
        table,
        {
            "reconstructedPrimeIdeals": reconstructed,
            "inertPrimeIdeals": inert_count,
        },
    )


def _authenticate_principals(
    records: tuple[int, ...],
    generators: tuple[int, ...],
    ideals: tuple[int, ...],
    table: tuple[int, ...],
) -> dict[str, int]:
    presentation, reduction, _, exact = _cubic_modules()
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    checked_products = 0
    nonzero_entries = 0
    maximum_exponent = 0
    for column in range(COLUMNS):
        product = identity
        for row in range(ROWS):
            exponent = records[column * ROWS + row]
            # Relation collection produces nonnegative small powers.  A bound
            # makes malformed owners fail before unbounded replay work.
            if exponent < 0 or exponent > 32:
                raise Row6TerminalClassFailure(
                    "raw relation exponent left 0..32 at column " + str(column)
                )
            if exponent:
                nonzero_entries += 1
                maximum_exponent = max(maximum_exponent, exponent)
                ideal = ideals[9 * row : 9 * (row + 1)]
                for _ in range(exponent):
                    next_product = [0] * 9
                    if exact._pari_exact_cubic_ideal_multiply(
                        product,
                        list(ideal),
                        list(table),
                        [0] * 27,
                        [0] * 27,
                        next_product,
                    ):
                        raise Row6TerminalClassFailure(
                            "exact cubic ideal multiplication failed"
                        )
                    product = next_product
                    checked_products += 1
        generator = generators[DEGREE * column : DEGREE * (column + 1)]
        if not any(generator):
            raise Row6TerminalClassFailure("raw principal generator is zero")
        principal = [0] * 9
        reduction.pari_cubic_mul_matrix(list(table), list(generator), principal)
        if not presentation._same_lattice(product, principal):
            raise Row6TerminalClassFailure(
                "raw principal equation failed at column " + str(column)
            )
    return {
        "principalEquations": COLUMNS,
        "nonzeroRelationEntries": nonzero_entries,
        "idealProducts": checked_products,
        "maximumRawExponent": maximum_exponent,
    }


def _target_rows(
    records: tuple[int, ...], transforms: tuple[int, ...]
) -> tuple[int, int]:
    targets: list[int] = []
    for presentation_column in range(CLASS_COLUMNS):
        nonzero: list[tuple[int, int]] = []
        for row in range(ROWS):
            value = sum(
                records[source * ROWS + row]
                * transforms[presentation_column * COLUMNS + source]
                for source in range(COLUMNS)
            )
            if value:
                nonzero.append((row, value))
        if len(nonzero) != 1 or nonzero[0][1] != 2:
            raise Row6TerminalClassFailure(
                "class transform does not publish one order-two pivot"
            )
        targets.append(nonzero[0][0])
    if targets[0] == targets[1]:
        raise Row6TerminalClassFailure("class transforms target the same factor row")
    return targets[0], targets[1]


def _compact_principal_product(
    transform: tuple[int, ...], generators: tuple[int, ...], column: int
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    offset = column * COLUMNS
    for relation in range(COLUMNS):
        exponent = transform[offset + relation]
        if exponent:
            result.append(
                {
                    "rawRelationIndex": str(relation),
                    "exponent": str(exponent),
                    "principalFactor": {
                        "values": [
                            str(value)
                            for value in generators[
                                DEGREE * relation : DEGREE * (relation + 1)
                            ]
                        ],
                        "denominator": "1",
                    },
                }
            )
    if not result:
        raise Row6TerminalClassFailure("order witness is empty")
    return result


def compose_row6_terminal_class_owner(
    gate: Mapping[str, Any],
    factor: Mapping[str, Any],
    prepared_envelope: Mapping[str, Any],
    ancestry: Mapping[str, Any],
) -> dict[str, Any]:
    """Authenticate all relations and compose the row-6 class owner."""
    gate = _mapping(gate, "Gate-C owner")
    factor = _mapping(factor, "factor-base owner")
    prepared_envelope = _mapping(prepared_envelope, "prepared envelope")
    ancestry = _mapping(ancestry, "column ancestry")
    if gate.get("schema") != GATE_SCHEMA or factor.get("schema") != FACTOR_SCHEMA:
        raise Row6TerminalClassFailure("wrong row-6 input schema")
    if ancestry.get("schema") != ANCESTRY_SCHEMA:
        raise Row6TerminalClassFailure("wrong row-6 ancestry schema")
    prepared = _mapping(prepared_envelope.get("data"), "prepared data")
    prepared_sha256 = prepared_envelope.get("authoritySha256")
    if not isinstance(prepared_sha256, str) or len(prepared_sha256) != 64:
        raise Row6TerminalClassFailure("prepared authority is absent")
    gate_authority = _mapping(gate.get("authority"), "Gate-C authority")
    factor_authority = _mapping(factor.get("authority"), "factor authority")
    if (
        gate_authority.get("preparedAuthoritySha256") != prepared_sha256
        or factor_authority.get("preparedAuthoritySha256") != prepared_sha256
    ):
        raise Row6TerminalClassFailure("prepared ancestry changed")
    gate_sha256 = _semantic_hash(gate)
    factor_sha256 = _semantic_hash(factor)
    # The ancestry receipt binds the versioned semantic projection used by
    # the JavaScript hosts; execution timing and RSS are not mathematics.
    state = _mapping(ancestry.get("state"), "column ancestry state")
    expected_state = {
        "backend": "source-hnfspec-hnfadd-reverse-replay",
        "selectedColumns": KERNEL_COLUMNS + CLASS_COLUMNS,
        "kernelColumns": KERNEL_COLUMNS,
        "classColumns": CLASS_COLUMNS,
        "relationReplayCells": ROWS * (KERNEL_COLUMNS + CLASS_COLUMNS),
        "relationCollectionRerun": False,
        "frozenW0UsedAsInput": False,
    }
    for key, expected in expected_state.items():
        if state.get(key) != expected:
            raise Row6TerminalClassFailure("column ancestry changed: " + key)
    if state.get("gateOwnerSha256") not in (None, gate_sha256):
        raise Row6TerminalClassFailure("column ancestry Gate-C digest changed")
    if state.get("factorOwnerSha256") not in (None, factor_sha256):
        raise Row6TerminalClassFailure("column ancestry factor digest changed")

    final = _mapping(gate.get("final"), "Gate-C final owner")
    if _integers(final.get("state"), 9, "terminal HNF state") != (
        2,
        9,
        1128,
        0,
        7,
        1,
        0,
        1137,
        0,
    ):
        raise Row6TerminalClassFailure("terminal HNF state changed")
    if _integers(final.get("h"), 4, "terminal presentation") != (2, 0, 0, 2):
        raise Row6TerminalClassFailure("terminal presentation is not diag(2,2)")
    records = _integers(final.get("relations"), ROWS * COLUMNS, "raw relations")
    identity = _mapping(gate.get("relationIdentity"), "relation identity")
    generators = _integers(
        identity.get("generators"), DEGREE * COLUMNS, "principal generators"
    )
    class_transform = _integers(
        ancestry.get("rawToPresentation"),
        CLASS_COLUMNS * COLUMNS,
        "class transform",
    )
    unit_transform = _integers(
        ancestry.get("rawToUnitKernel"),
        KERNEL_COLUMNS * COLUMNS,
        "unit transform",
    )
    for kernel in range(KERNEL_COLUMNS):
        for row in range(ROWS):
            if (
                sum(
                    records[source * ROWS + row]
                    * unit_transform[kernel * COLUMNS + source]
                    for source in range(COLUMNS)
                )
                != 0
            ):
                raise Row6TerminalClassFailure(
                    "unit transform is not a relation kernel"
                )
    active_rows = _target_rows(records, class_transform)
    declared_rows = state.get("activeFactorRows")
    if (
        declared_rows is not None
        and tuple(int(value) for value in declared_rows) != active_rows
    ):
        raise Row6TerminalClassFailure("declared active factor rows changed")

    ideals, table, factor_state = _authenticate_factor_base(factor, prepared)
    principal_state = _authenticate_principals(records, generators, ideals, table)
    factor_map = [0] * (ROWS * CLASS_COLUMNS)
    for column, row in enumerate(active_rows):
        factor_map[column * ROWS + row] = 1
    witnesses = []
    for column, row in enumerate(active_rows):
        witnesses.append(
            {
                "order": "2",
                "properMultiplesRejected": 1,
                "smithQuotientCoordinates": [
                    "1" if index == column else "0" for index in range(CLASS_COLUMNS)
                ],
                "presentationRelation": [
                    "1" if index == column else "0" for index in range(CLASS_COLUMNS)
                ],
                "idealHnf": [str(value) for value in ideals[9 * row : 9 * (row + 1)]],
                "rawPrincipalProduct": _compact_principal_product(
                    class_transform, generators, column
                ),
            }
        )
    class_witness = {
        "schema": "sagejs.pari-class-group/row6-terminal-class-witness-v1",
        "field": {
            "coefficients": [
                str(value) for value in gate.get("field", {}).get("polynomial", [])
            ],
            "signature": [3, 0],
        },
        "classGroup": {"classNumber": "4", "invariants": ["2", "2"]},
        "witnesses": witnesses,
        "proof": {
            "presentation": ["2", "0", "0", "2"],
            "presentationDeterminant": "4",
            "rawRelations": COLUMNS,
            "factorBaseSize": ROWS,
            # The three nonzero vectors in (Z/2Z)^2 were separated by the
            # exact diagonal presentation, proving generator independence.
            "nonzeroQuotientVectorsChecked": 3,
            "frozenW0UsedAsInput": False,
        },
        "publicComplete": False,
    }
    return {
        "schema": OWNER_SCHEMA,
        "ancestry": {
            "gateOwnerSha256": gate_sha256,
            "factorOwnerSha256": factor_sha256,
            "preparedAuthoritySha256": prepared_sha256,
        },
        "activeFactorRows": [str(value) for value in active_rows],
        "factorMap": [str(value) for value in factor_map],
        "rawToPresentation": [str(value) for value in class_transform],
        "rawToUnitKernel": [str(value) for value in unit_transform],
        "principalAuthentication": principal_state,
        "factorBaseAuthentication": factor_state,
        "columnAncestry": dict(state),
        "classWitness": class_witness,
        "relationCollectionRerun": False,
        "frozenW0UsedAsInput": False,
        "publicComplete": False,
    }


__all__ = [
    "OWNER_SCHEMA",
    "Row6TerminalClassFailure",
    "compose_row6_terminal_class_owner",
]
