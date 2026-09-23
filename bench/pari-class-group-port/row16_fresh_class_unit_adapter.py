"""Fresh prepared-field adapters for development-panel row 16.

The resident PARI 2.17.4 translation supplies every numeric owner in one
invocation.  This module replays its presentation, three independent order-3
class witnesses, primitive rank-one unit, and torsion without consulting W0.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping, Sequence

from .mixed_cubic_presentation import (
    SCHEMA as PRESENTATION_SCHEMA,
    _smith,
    _source_presentation,
)
from .mixed_cubic_rank1_unit import compose_mixed_cubic_rank1_unit
from .panel1_presentation_authority import (
    _array_digest,
    _determinant3,
    _multiply_ideals,
    _same_lattice,
)
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .row16_mixed_cubic_class_witness import (
    compose_row16_mixed_cubic_class_witness,
)
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


FIELD_ID = "3.1.1002718428660.2"
ROWS = 48
COLUMNS = 54
KERNEL = 6
DEGREE = 3
LOG_STRIDE = 14
RESULT_SCHEMA = "sagejs.pari-class-group/row16-fresh-state-v1"


class Row16FreshAdapterFailure(ValueError):
    """The fresh resident row-16 owner failed exact replay."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Row16FreshAdapterFailure(label + " is not an integer sequence")
    if len(value) < length:
        raise Row16FreshAdapterFailure(label + " is too short")
    result: list[int] = []
    for entry in value[:length]:
        if isinstance(entry, bool):
            raise Row16FreshAdapterFailure(label + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise Row16FreshAdapterFailure(label + " is not integral") from error
        if str(integer) != str(entry):
            raise Row16FreshAdapterFailure(label + " is not canonical")
        result.append(integer)
    return result


def _owner(resident: Mapping[str, Any], name: str, length: int) -> list[int]:
    if name not in resident:
        raise Row16FreshAdapterFailure("missing resident owner " + name)
    return _integers(resident[name], length, name)


def _strings(values: Sequence[int]) -> list[str]:
    return [str(int(value)) for value in values]


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _factor_base(
    resident: Mapping[str, Any],
    table: list[int],
    records: list[int],
    generators: list[int],
    terminal_permutation: Sequence[int],
) -> tuple[list[int], list[int], list[int]]:
    selected = _owner(resident, "prep_selected_indices", ROWS)
    catalog_primes = _owner(resident, "prep_kummer_catalog_primes", 3 * 1230)
    catalog_e = _owner(resident, "prep_kummer_catalog_e", 3 * 1230)
    catalog_f = _owner(resident, "prep_kummer_catalog_f", 3 * 1230)
    catalog_inert = _owner(resident, "prep_kummer_catalog_inert", 3 * 1230)
    catalog_generators = _owner(resident, "prep_kummer_catalog_generators", 9 * 1230)
    catalog_tau = _owner(resident, "prep_kummer_catalog_tau", 27 * 1230)
    packet_ideals = _owner(resident, "packet_ideals", 9 * ROWS)
    packet_norms = _owner(resident, "packet_norms", ROWS)
    relation_primes = _owner(resident, "relation_primes", ROWS)
    descriptors: list[int] = []
    ideals: list[int] = []
    norms: list[int] = []
    for position, index in enumerate(selected):
        if index < 0 or index >= 3 * 1230:
            raise Row16FreshAdapterFailure("selected catalog index is out of range")
        prime = catalog_primes[index]
        residue_degree = catalog_f[index]
        inert = catalog_inert[index]
        generator = catalog_generators[3 * index : 3 * index + 3]
        tau_row_major = catalog_tau[9 * index : 9 * index + 9]
        tau_column_major = [
            tau_row_major[3 * row + column] for column in range(3) for row in range(3)
        ]
        if relation_primes[position] != prime:
            raise Row16FreshAdapterFailure("factor base detached from catalog")
        ideal = [0] * 9
        pari_prime_ideal_hnf(
            table,
            generator,
            DEGREE,
            prime,
            inert,
            [0] * 9,
            [0] * 9,
            [0] * 3,
            ideal,
        )
        norm = prime**residue_degree
        if (
            ideal != packet_ideals[9 * position : 9 * position + 9]
            or abs(_determinant3(ideal)) != norm
            or packet_norms[position] != norm
        ):
            raise Row16FreshAdapterFailure("factor ideal reconstruction changed")
        descriptors.extend(
            [
                prime,
                catalog_e[index],
                residue_degree,
                inert,
                *generator,
                *tau_column_major,
            ]
        )
        ideals.extend(ideal)
        norms.append(norm)

    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for column in range(COLUMNS):
        product = identity
        for position, exponent in enumerate(
            records[ROWS * column : ROWS * (column + 1)]
        ):
            if exponent < 0 or exponent > 16:
                raise Row16FreshAdapterFailure("relation exponent left row-16 domain")
            ideal = ideals[9 * position : 9 * position + 9]
            for _ in range(exponent):
                product = _multiply_ideals(product, ideal, table)
        principal = [0] * 9
        pari_cubic_mul_matrix(table, generators[3 * column : 3 * column + 3], principal)
        if not _same_lattice(product, principal):
            raise Row16FreshAdapterFailure(
                "principal relation replay failed at " + str(column + 1)
            )

    return (
        [
            value
            for position in terminal_permutation
            for value in descriptors[16 * (position - 1) : 16 * position]
        ],
        [
            value
            for position in terminal_permutation
            for value in ideals[9 * (position - 1) : 9 * position]
        ],
        [norms[position - 1] for position in terminal_permutation],
    )


def compose_row16_fresh_state(
    resident: Mapping[str, Any], ancestry: Mapping[str, Any]
) -> dict[str, Any]:
    """Detach the complete row-16 result from one resident invocation."""
    if _owner(resident, "attempt_state", 4) != [4, 0, 3, 1]:
        raise Row16FreshAdapterFailure("resident attempt is not terminal row 16")
    if _owner(resident, "prep_base_state", 6) != [215, 215, 48, 31, 31, 48]:
        raise Row16FreshAdapterFailure("resident factor-base policy changed")
    if _owner(resident, "relation_state", 1) != [COLUMNS]:
        raise Row16FreshAdapterFailure("resident relation count changed")
    if _owner(resident, "class_number", 1) != [27] or _owner(
        resident, "class_invariants", 3
    ) != [3, 3, 3]:
        raise Row16FreshAdapterFailure("resident class candidate changed")

    polynomial = _owner(resident, "prep_polynomial", 4)
    table = _owner(resident, "basis_table", 27)
    if polynomial != [-73393658, -146523, 0, 1]:
        raise Row16FreshAdapterFailure("wrong row-16 polynomial")
    records = _owner(resident, "relation_records", ROWS * COLUMNS)
    generators = _owner(resident, "generators", DEGREE * COLUMNS)
    logs = _owner(resident, "log_embeddings", LOG_STRIDE * COLUMNS)
    initial_permutation = _owner(resident, "search_ideals", ROWS)
    replay = _source_presentation(records, logs, initial_permutation, ROWS, 3)
    exact_w = _owner(resident, "hnf_result_h", 9)
    invariants, smith_order, smith_state = _smith(exact_w, 3)
    if replay["classNumber"] != 27 or smith_order != 27 or invariants != [3, 3, 3]:
        raise Row16FreshAdapterFailure("source presentation changed class group")
    if replay["transformedLogs"] != _owner(
        resident, "hnf_result_c", LOG_STRIDE * COLUMNS
    ):
        raise Row16FreshAdapterFailure("source HNF transformed logs changed")
    descriptors, ideals, norms = _factor_base(
        resident, table, records, generators, replay["terminalPermutation"]
    )
    scalar_prefix = 0
    for column in range(COLUMNS):
        if generators[3 * column + 1 : 3 * column + 3] != [0, 0]:
            break
        scalar_prefix += 1
    if scalar_prefix != 15:
        raise Row16FreshAdapterFailure("scalar relation prefix changed")
    regulator = _owner(resident, "accept_regulator", 3)
    relation_lattice = _owner(resident, "accept_lattice", KERNEL)
    mantissas = _owner(resident, "admission_matrix_m", 9)
    precisions = _owner(resident, "admission_matrix_p", 9)
    exponents = _owner(resident, "admission_matrix_e", 9)
    embedding_m = [
        value
        for index in range(9)
        for value in (mantissas[index], precisions[index], exponents[index])
    ]
    presentation = {
        "schema": PRESENTATION_SCHEMA,
        "field": {
            "id": FIELD_ID,
            "panelIndex": 16,
            "polynomial": _strings(polynomial),
            "signature": [1, 1],
            "discriminant": str(int(resident["analytic_discriminant"])),
            "index": str(int(resident["prep_index"])),
            "basisDenominator": str(int(resident["prep_zkden"])),
            "basis": _strings(_owner(resident, "prep_zk", 9)),
            "multiplicationTensor": _strings(table),
            "embeddingM": _strings(embedding_m),
            "embeddingG": _strings(_owner(resident, "preparation_embedding", 27)),
        },
        "ancestry": dict(ancestry),
        "dimensions": {
            "degree": 3,
            "places": 2,
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "kernelRank": KERNEL,
            "unitRank": 1,
            "subfactorCount": 3,
        },
        "factorBase": {
            "descriptorWidth": 16,
            "descriptors": _strings(descriptors),
            "ideals": _strings(ideals),
            "norms": _strings(norms),
            "descriptorsSha256": _array_digest(descriptors),
            "idealsSha256": _array_digest(ideals),
        },
        "relations": {
            "matrix": _strings(records),
            "principalGenerators": _strings(generators),
            "packedLogs": _strings(logs),
            "scalarPrefixCount": scalar_prefix,
            "matrixSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
            "packedLogsSha256": _array_digest(logs),
        },
        "presentation": {
            "matrix": _strings(replay["presentation"]),
            "relationToPresentation": _strings(replay["relationToPresentation"]),
            "rawToKernel": _strings(replay["rawToKernel"]),
            "kernelLogs": _strings(replay["transformedLogs"][: LOG_STRIDE * KERNEL]),
            "relationLattice": _strings(relation_lattice),
            "packedRegulator": _strings(regulator),
            "classNumber": "27",
            "invariants": ["3", "3", "3"],
            "matrixSha256": _array_digest(replay["presentation"]),
            "rawToKernelSha256": _array_digest(replay["rawToKernel"]),
        },
        "replay": {
            "terminalPermutation": _strings(replay["terminalPermutation"]),
            "cleanupTransform": _strings(replay["cleanupTransform"]),
            "activeShape": replay["activeShape"],
            "activeRelation": _strings(replay["activeRelation"]),
            "activeFullHnf": _strings(replay["activeFullHnf"]),
            "activeTransform": _strings(replay["activeTransform"]),
            "activeDiagonal": _strings(replay["activeDiagonal"]),
            "hnfState": replay["hnfState"],
            "smithState": smith_state,
            "allDescriptorsReconstructed": True,
            "allPrincipalRelationsReplayed": True,
            "rawRelationsTimesKernelZero": True,
            "computedBeforeExpectedComparison": True,
        },
        "comparison": {"classNumber": 27, "invariants": [3, 3, 3], "matches": True},
        "completion": {
            "presentationComplete": True,
            "classWitnessesComplete": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }
    presentation_sha256 = _digest(presentation)
    class_witness = compose_row16_mixed_cubic_class_witness(
        presentation, {"presentationSha256": presentation_sha256}
    )
    class_sha256 = _digest(class_witness)
    unit = compose_mixed_cubic_rank1_unit(
        presentation, {"presentationSha256": presentation_sha256}
    )
    unit_sha256 = _digest(unit)
    return {
        "schema": RESULT_SCHEMA,
        "presentation": presentation,
        "classWitness": class_witness,
        "unit": unit,
        "torsion": {"order": "2", "generator": ["-1", "0", "0"]},
        "authorities": {
            "presentationSha256": presentation_sha256,
            "classWitnessSha256": class_sha256,
            "unitSha256": unit_sha256,
        },
    }


__all__ = [
    "RESULT_SCHEMA",
    "Row16FreshAdapterFailure",
    "compose_row16_fresh_state",
]
