"""Authenticate and compose the row-14 terminal class-witness owner."""

from __future__ import annotations

import gzip
import hashlib
import importlib
import json
import os
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [
    str(ROOT),
    str(ROOT / "src/lib"),
    str(ROOT / "bench/pari-class-group-port"),
]


ACCEPTED_SCHEMA = "sagejs.pari-class-group/row14-accepted-relation-owner-v1"
ACCEPTED_SHA256 = "9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65"
METADATA_SHA256 = "cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684"
OWNER_SCHEMA = "sagejs.pari-class-group/row14-terminal-class-owner-v1"
ROWS = 799
COLUMNS = 806
DEGREE = 4


class Row14TerminalClassOwnerFailure(ValueError):
    """The immutable row-14 inputs failed exact terminal authentication."""


def _quartic_replay_module() -> Any:
    module = importlib.import_module("field3_relation_replay_map")
    module.__package__ = "bench.pari-class-group-port"
    return module


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _integers(value: Any, length: int, label: str) -> tuple[int, ...]:
    if not isinstance(value, list) or len(value) != length:
        raise Row14TerminalClassOwnerFailure(label + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row14TerminalClassOwnerFailure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row14TerminalClassOwnerFailure(label + " is not canonical")
        answer.append(number)
    return tuple(answer)


def _load_inputs(
    owner_path: str, metadata_path: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    compressed = Path(owner_path).read_bytes()
    try:
        plain = gzip.decompress(compressed)
    except (OSError, EOFError) as error:
        raise Row14TerminalClassOwnerFailure(
            "accepted owner is not valid gzip"
        ) from error
    if _sha256(plain) != ACCEPTED_SHA256:
        raise Row14TerminalClassOwnerFailure("accepted owner digest changed")
    owner = json.loads(plain)
    if owner.get("schema") != ACCEPTED_SCHEMA:
        raise Row14TerminalClassOwnerFailure("wrong accepted owner schema")
    receipt = json.loads(Path(metadata_path).read_bytes())
    metadata = receipt.get("metadata")
    if not isinstance(metadata, Mapping):
        raise Row14TerminalClassOwnerFailure("factor metadata is absent")
    encoded = json.dumps(metadata, separators=(",", ":")).encode()
    # The producer hashes JSON.stringify, whose compact representation matches
    # these separators for this integer/string-only owner.
    if (
        receipt.get("metadataSha256") != METADATA_SHA256
        or _sha256(encoded) != METADATA_SHA256
    ):
        raise Row14TerminalClassOwnerFailure("factor metadata digest changed")
    return owner, dict(metadata)


def _authenticate_principals(
    records: tuple[int, ...],
    generators: tuple[int, ...],
    metadata: Mapping[str, Any],
) -> dict[str, int]:
    replay = _quartic_replay_module()
    prepared = metadata.get("prepared")
    factor = metadata.get("factor")
    if not isinstance(prepared, Mapping) or not isinstance(factor, Mapping):
        raise Row14TerminalClassOwnerFailure("factor arithmetic owners are absent")
    table = _integers(prepared.get("basis_table"), 64, "multiplication table")
    ideals = _integers(factor.get("packetIdeals"), 16 * ROWS, "packet ideals")
    identity = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    factor_base = tuple(ideals[16 * index : 16 * (index + 1)] for index in range(ROWS))
    checked_products = 0
    maximum_exponent = 0
    nonzero_entries = 0
    for column in range(COLUMNS):
        product = identity
        for row in range(ROWS):
            exponent = records[column * ROWS + row]
            if exponent < 0 or exponent > 10:
                raise Row14TerminalClassOwnerFailure(
                    "raw relation exponent is outside 0..10"
                )
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
            raise Row14TerminalClassOwnerFailure("raw principal generator is zero")
        if product != replay._principal_hnf(generator, table):
            raise Row14TerminalClassOwnerFailure(
                "raw principal equation failed at column " + str(column)
            )
    return {
        "principalEquations": COLUMNS,
        "nonzeroRelationEntries": nonzero_entries,
        "idealProducts": checked_products,
        "maximumRawExponent": maximum_exponent,
    }


def _factor_base_projection(metadata: Mapping[str, Any]) -> dict[str, Any]:
    """Project only digest-authenticated factor-base inputs needed by C7."""
    prepared = metadata.get("prepared")
    factor = metadata.get("factor")
    if not isinstance(prepared, Mapping) or not isinstance(factor, Mapping):
        raise Row14TerminalClassOwnerFailure("factor-base projection source is absent")
    projection = {
        "packetIdeals": [
            str(value)
            for value in _integers(
                factor.get("packetIdeals"), ROWS * 16, "packet ideals"
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
    encoded = json.dumps(projection, separators=(",", ":"), sort_keys=True).encode()
    return {
        **projection,
        "metadataSha256": METADATA_SHA256,
        "projectionSha256": _sha256(encoded),
    }


def _validate_factor_base_projection(
    projection: Mapping[str, Any], metadata: Mapping[str, Any]
) -> None:
    expected = _factor_base_projection(metadata)
    if dict(projection) != expected:
        raise Row14TerminalClassOwnerFailure("factor-base projection changed")


def _factor_base_mutation_checks(
    projection: Mapping[str, Any], metadata: Mapping[str, Any]
) -> int:
    rejected = 0
    for field in (
        "packetIdeals",
        "packetNorms",
        "packetIds",
        "relationPrimes",
        "basisTable",
    ):
        mutated = {
            key: list(value) if isinstance(value, list) else value
            for key, value in projection.items()
        }
        mutated[field][0] = str(int(mutated[field][0]) + 1)
        try:
            _validate_factor_base_projection(mutated, metadata)
        except Row14TerminalClassOwnerFailure:
            rejected += 1
        else:
            raise Row14TerminalClassOwnerFailure(
                "factor-base mutation was accepted: " + field
            )
    mutated = {
        key: list(value) if isinstance(value, list) else value
        for key, value in projection.items()
    }
    mutated["projectionSha256"] = "0" * 64
    try:
        _validate_factor_base_projection(mutated, metadata)
    except Row14TerminalClassOwnerFailure:
        rejected += 1
    else:
        raise Row14TerminalClassOwnerFailure("factor-base digest mutation was accepted")
    return rejected


def _validate_transform_owner(
    transform_owner: Mapping[str, Any], accepted: Mapping[str, Any]
) -> tuple[tuple[int, ...], tuple[int, ...], dict[str, Any]]:
    """Authenticate the selected source columns and their staged provenance."""
    if (
        transform_owner.get("schema")
        != "sagejs.pari-class-group/row14-column-ancestry-v1"
    ):
        raise Row14TerminalClassOwnerFailure("wrong column ancestry schema")
    class_ancestry = _integers(
        transform_owner.get("rawToPresentation"), COLUMNS * 3, "class ancestry"
    )
    unit_ancestry = _integers(
        transform_owner.get("rawToUnitKernel"), COLUMNS * 7, "unit ancestry"
    )
    state = transform_owner.get("state")
    if not isinstance(state, Mapping):
        raise Row14TerminalClassOwnerFailure("column ancestry state is absent")
    expected_state = {
        "backend": "source-hnfspec-hnfadd-reverse-replay",
        "selectedColumns": 10,
        "kernelColumns": 7,
        "classColumns": 3,
        "relationReplayCells": ROWS * 10,
        "relationCollectionRerun": False,
        "frozenW0UsedAsInput": False,
    }
    for key, expected in expected_state.items():
        if state.get(key) != expected:
            raise Row14TerminalClassOwnerFailure(
                "column ancestry state changed: " + key
            )
    provenance = state.get("packedLogProvenance")
    if not isinstance(provenance, Mapping):
        raise Row14TerminalClassOwnerFailure("packed-log provenance is absent")
    expected_provenance = {
        "arithmetic": "source-stage-order",
        "pathDependent": True,
        "oneShotRawTransformAuthoritative": False,
        "rawToUnitKernelAuthority": "integer relation kernel R*T=0",
        "terminalPackedEquality": True,
        "mutationsRejected": 4,
    }
    for key, expected in expected_provenance.items():
        if provenance.get(key) != expected:
            raise Row14TerminalClassOwnerFailure(
                "packed-log provenance changed: " + key
            )
    checkpoints = provenance.get("checkpoints")
    source_schedule = accepted.get("schedule")
    source_checkpoints = (
        source_schedule.get("checkpoints")
        if isinstance(source_schedule, Mapping)
        else None
    )
    if not isinstance(checkpoints, list) or not isinstance(source_checkpoints, list):
        raise Row14TerminalClassOwnerFailure("packed-log checkpoints are absent")
    source_by_columns = {
        item.get("columns"): item
        for item in source_checkpoints
        if isinstance(item, Mapping)
    }
    expected_columns = (802, 804, 805, 806)
    if len(checkpoints) != len(expected_columns):
        raise Row14TerminalClassOwnerFailure("packed-log checkpoint count changed")
    for index, columns in enumerate(expected_columns):
        checkpoint = checkpoints[index]
        source = source_by_columns.get(columns)
        if not isinstance(checkpoint, Mapping) or not isinstance(source, Mapping):
            raise Row14TerminalClassOwnerFailure("packed-log checkpoint is absent")
        hashes = source.get("hashes")
        if not isinstance(hashes, Mapping):
            raise Row14TerminalClassOwnerFailure("source checkpoint hashes are absent")
        if checkpoint != {
            "columns": columns,
            "cells": 21 * columns,
            "sha256": hashes.get("c"),
            "sourceOrderPreserved": True,
            "mutationRejected": True,
        }:
            raise Row14TerminalClassOwnerFailure(
                "packed-log checkpoint changed at " + str(columns)
            )
    return class_ancestry, unit_ancestry, dict(state)


def _transform_state_mutation_checks(
    transform_owner: Mapping[str, Any], accepted: Mapping[str, Any]
) -> int:
    mutations: tuple[tuple[str, Any], ...] = (
        ("schema", lambda value: value.__setitem__("schema", "wrong")),
        (
            "backend",
            lambda value: value["state"].__setitem__("backend", "generic-hnf"),
        ),
        (
            "selected-columns",
            lambda value: value["state"].__setitem__("selectedColumns", 9),
        ),
        (
            "packed-arithmetic",
            lambda value: value["state"]["packedLogProvenance"].__setitem__(
                "arithmetic", "one-shot"
            ),
        ),
        (
            "checkpoint-count",
            lambda value: value["state"]["packedLogProvenance"]["checkpoints"].pop(),
        ),
        (
            "checkpoint-columns",
            lambda value: value["state"]["packedLogProvenance"]["checkpoints"][
                1
            ].__setitem__("columns", 803),
        ),
        (
            "checkpoint-cells",
            lambda value: value["state"]["packedLogProvenance"]["checkpoints"][
                2
            ].__setitem__("cells", 1),
        ),
        (
            "checkpoint-hash",
            lambda value: value["state"]["packedLogProvenance"]["checkpoints"][
                3
            ].__setitem__("sha256", "0" * 64),
        ),
    )
    rejected = 0
    for label, mutate in mutations:
        changed = json.loads(json.dumps(transform_owner))
        mutate(changed)
        try:
            _validate_transform_owner(changed, accepted)
        except Row14TerminalClassOwnerFailure:
            rejected += 1
        else:
            raise Row14TerminalClassOwnerFailure(
                "column ancestry mutation was accepted: " + label
            )
    return rejected


def compose_row14_terminal_class_owner(
    owner_path: str, metadata_path: str, transform_path: str
) -> dict[str, Any]:
    """Return an authenticated terminal class owner without relation collection."""
    accepted, metadata = _load_inputs(owner_path, metadata_path)
    final = accepted.get("final")
    if not isinstance(final, Mapping):
        raise Row14TerminalClassOwnerFailure("accepted final owner is absent")
    if accepted.get("acceptanceBoundary") != {
        "rows": 799,
        "hRows": 3,
        "bColumns": 796,
        "totalColumns": 806,
        "places": 3,
        "degree": 4,
        "previousAcceptanceColumns": 0,
        "cacheChanged": True,
    }:
        raise Row14TerminalClassOwnerFailure("accepted boundary changed")
    records = _integers(final.get("records"), ROWS * COLUMNS, "raw relations")
    generators = _integers(final.get("generators"), DEGREE * COLUMNS, "generators")
    presentation = _integers(final.get("h"), 9, "terminal presentation")
    permutation = _integers(final.get("perm"), ROWS, "terminal permutation")
    if _integers(final.get("hnfState"), 9, "terminal HNF state") != (
        3,
        10,
        796,
        0,
        7,
        0,
        0,
        806,
        0,
    ):
        raise Row14TerminalClassOwnerFailure("terminal HNF state changed")
    active_rows = tuple(value - 1 for value in permutation[:3])
    if len(set(active_rows)) != 3 or any(
        value < 0 or value >= ROWS for value in active_rows
    ):
        raise Row14TerminalClassOwnerFailure("active factor rows are invalid")
    factor_map = [0] * (ROWS * 3)
    for column, row in enumerate(active_rows):
        factor_map[column * ROWS + row] = 1
    transform_owner = json.loads(Path(transform_path).read_bytes())
    class_ancestry, unit_ancestry, transform_state = _validate_transform_owner(
        transform_owner, accepted
    )
    transform_mutations = _transform_state_mutation_checks(transform_owner, accepted)
    for column in range(3):
        for row in range(ROWS):
            value = sum(
                records[source * ROWS + row] * class_ancestry[column * COLUMNS + source]
                for source in range(COLUMNS)
            )
            target = sum(
                factor_map[index * ROWS + row] * presentation[column * 3 + index]
                for index in range(3)
            )
            if value != target:
                raise Row14TerminalClassOwnerFailure("class ancestry failed replay")
    for column in range(7):
        for row in range(ROWS):
            if (
                sum(
                    records[source * ROWS + row]
                    * unit_ancestry[column * COLUMNS + source]
                    for source in range(COLUMNS)
                )
                != 0
            ):
                raise Row14TerminalClassOwnerFailure(
                    "unit ancestry is not a relation kernel"
                )
    principal_state = _authenticate_principals(records, generators, metadata)
    factor_base = _factor_base_projection(metadata)
    _validate_factor_base_projection(factor_base, metadata)
    factor_mutations = _factor_base_mutation_checks(factor_base, metadata)

    terminal = importlib.import_module(
        "bench.pari-class-group-port.row14_terminal_class_witness"
    )
    compact = [
        [
            {
                "values": [
                    str(value) for value in generators[4 * index : 4 * index + 4]
                ],
                "denominator": "1",
                "exponent": "1",
            }
        ]
        for index in range(COLUMNS)
    ]
    live = {
        "schema": terminal.LIVE_SCHEMA,
        "field": {
            "id": terminal.FIELD_ID,
            "coefficients": [str(value) for value in terminal.POLYNOMIAL],
            "signature": [2, 1],
        },
        "dimensions": {
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "presentationDimension": 3,
        },
        "ancestry": {
            "sourceSha256": METADATA_SHA256,
            "terminalOwnerSha256": ACCEPTED_SHA256,
        },
        "presentation": [str(value) for value in presentation],
        "mappedGeneratorIdeals": [
            str(value) for ideal in terminal.GENERATOR_IDEALS for value in ideal
        ],
        "smithQuotientCoordinates": ["1", "0", "0", "-2", "-1", "-1"],
        "factorMap": [str(value) for value in factor_map],
        "rawRelations": [str(value) for value in records],
        "rawToPresentation": [str(value) for value in class_ancestry],
        "rawPrincipalFactors": compact,
    }
    witness = terminal.compose_row14_terminal_class_witness(live)
    return {
        "schema": OWNER_SCHEMA,
        "ancestry": witness["ancestry"],
        "activeFactorRows": [str(value) for value in active_rows],
        "factorMap": live["factorMap"],
        "rawToPresentation": live["rawToPresentation"],
        "rawToUnitKernel": [str(value) for value in unit_ancestry],
        "principalAuthentication": principal_state,
        "factorBase": factor_base,
        "factorBaseAuthentication": {
            "metadataSha256": METADATA_SHA256,
            "projectionSha256": factor_base["projectionSha256"],
            "lengths": [ROWS * 16, ROWS, ROWS, ROWS, 64],
            "mutationsRejected": factor_mutations,
        },
        "columnAncestry": transform_state,
        "columnAncestryAuthentication": {
            "source": "accepted-owner-stage-checkpoints",
            "mutationsRejected": transform_mutations,
        },
        "classWitness": witness,
        "relationCollectionRerun": False,
        "frozenW0UsedAsInput": False,
        "publicComplete": False,
    }


def _publish(value: Mapping[str, Any], output_directory: str) -> dict[str, Any]:
    encoded = (json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n").encode()
    digest = _sha256(encoded)
    directory = Path(output_directory)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / ("row14-terminal-class-" + digest + ".json")
    if target.exists():
        if target.read_bytes() != encoded:
            raise Row14TerminalClassOwnerFailure("immutable publication collision")
    else:
        temporary = directory / (target.name + ".tmp-" + str(os.getpid()))
        with temporary.open("xb") as stream:
            stream.write(encoded)
        os.chmod(temporary, 0o444)
        try:
            os.link(temporary, target)
        except FileExistsError:
            if target.read_bytes() != encoded:
                raise Row14TerminalClassOwnerFailure("publication race changed bytes")
        finally:
            temporary.unlink(missing_ok=True)
    os.chmod(target, 0o444)
    return {"path": str(target), "sha256": digest, "bytes": len(encoded)}


if __name__ == "__main__":
    if os.environ.get("SAGEJS_ROW14_TERMINAL_OWNER_SELF_CHECK") == "1":
        replay = _quartic_replay_module()
        print(
            json.dumps(
                {
                    "schema": "sagejs.pari-class-group/row14-terminal-owner-import-check-v1",
                    "root": str(ROOT),
                    "module": replay.__name__,
                    "modulePath": str(Path(replay.__file__).resolve()),
                    "arithmeticLoaded": False,
                    "ownersLoaded": False,
                },
                sort_keys=True,
            )
        )
        raise SystemExit(0)
    # The Sage.js launcher preserves its Node/CLI prefix in `sys.argv`.
    if len(sys.argv) < 5:
        raise SystemExit(
            "usage: row14_terminal_class_owner.py ACCEPTED METADATA TRANSFORM OUTPUT_DIR"
        )
    accepted_path, metadata_path, transform_path, output_directory = sys.argv[-4:]
    result = compose_row14_terminal_class_owner(
        accepted_path, metadata_path, transform_path
    )
    publication = _publish(result, output_directory)
    if _publish(result, output_directory) != publication:
        raise Row14TerminalClassOwnerFailure("publication is not idempotent")
    print(json.dumps({**publication, "idempotentPublication": True}, sort_keys=True))


__all__ = ["Row14TerminalClassOwnerFailure", "compose_row14_terminal_class_owner"]
