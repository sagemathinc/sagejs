"""Fresh row-1 presentation, unit, and neutral result adapters.

The adapters consume only numeric owners produced by one successful resident
prepared-field invocation.  They replay the exact relation presentation,
principal relations, class generator, fundamental units, and torsion before
publishing an explicitly upstream-assumed result.  No W0 event, retained answer,
path, timing datum, or reserve decision is an input.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from typing import Any

from .panel1_c3_class_witness import compose_panel1_c3_class_witness
from .panel1_exact_unit_authority import derive_panel1_exact_units
from .panel1_presentation_authority import (
    SCHEMA as PRESENTATION_SCHEMA,
    _array_digest,
    _determinant3,
    _multiply_ideals,
    _same_lattice,
    _source_presentation,
)
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix
from .torsion_authority import derive_real_cubic_torsion


PRESENTATION_ADAPTER_SCHEMA = (
    "sagejs.pari-class-group/row1-fresh-presentation-adapter-v1"
)
UNIT_ADAPTER_SCHEMA = "sagejs.pari-class-group/row1-fresh-exact-units-v1"
RESULT_SCHEMA = "sagejs.pari-class-group/row1-fresh-upstream-assumed-result-v1"
FIELD_ID = (
    "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f"
)
DEGREE = 3
PLACES = 3
ROWS = 51
COLUMNS = 58
KERNEL = 7
UNIT_RANK = 2
LOG_STRIDE = 7 * PLACES


class Row1FreshAdapterFailure(ValueError):
    """A fresh row-1 resident owner failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Row1FreshAdapterFailure(label + " is not an integer sequence")
    if len(value) < length:
        raise Row1FreshAdapterFailure(label + " is too short")
    result: list[int] = []
    for entry in value[:length]:
        if isinstance(entry, bool):
            raise Row1FreshAdapterFailure(label + " contains a boolean")
        try:
            number = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise Row1FreshAdapterFailure(
                label + " contains noninteger data"
            ) from error
        if str(number) != str(entry):
            raise Row1FreshAdapterFailure(label + " contains noncanonical data")
        result.append(number)
    return result


def _strings(value: Sequence[int]) -> list[str]:
    return [str(int(entry)) for entry in value]


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _owner(resident: Mapping[str, Any], name: str, length: int) -> list[int]:
    if name not in resident:
        raise Row1FreshAdapterFailure("missing resident owner " + name)
    return _integers(resident[name], length, name)


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
    catalog_generators = _owner(
        resident, "prep_kummer_catalog_generators", 3 * 3 * 1230
    )
    catalog_tau = _owner(resident, "prep_kummer_catalog_tau", 9 * 3 * 1230)
    packet_ideals = _owner(resident, "packet_ideals", 9 * ROWS)
    packet_norms = _owner(resident, "packet_norms", ROWS)
    relation_primes = _owner(resident, "relation_primes", ROWS)
    descriptors: list[int] = []
    ideals: list[int] = []
    norms: list[int] = []
    for position, index in enumerate(selected):
        if index < 0 or index >= 3 * 1230:
            raise Row1FreshAdapterFailure("selected catalog index is out of range")
        prime = catalog_primes[index]
        residue_degree = catalog_f[index]
        inert = catalog_inert[index]
        generator = catalog_generators[3 * index : 3 * index + 3]
        tau_row_major = catalog_tau[9 * index : 9 * index + 9]
        tau_column_major = [
            tau_row_major[3 * row + column] for column in range(3) for row in range(3)
        ]
        if relation_primes[position] != prime:
            raise Row1FreshAdapterFailure("factor base detached from catalog order")
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
        retained = packet_ideals[9 * position : 9 * position + 9]
        if ideal != retained or abs(_determinant3(ideal)) != norm:
            raise Row1FreshAdapterFailure("factor ideal reconstruction changed")
        if packet_norms[position] != norm:
            raise Row1FreshAdapterFailure("factor norm changed")
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
            if exponent < 0 or exponent > 8:
                raise Row1FreshAdapterFailure("relation exponent left row-1 domain")
            ideal = ideals[9 * position : 9 * position + 9]
            for _ in range(exponent):
                product = _multiply_ideals(product, ideal, table)
        principal = [0] * 9
        pari_cubic_mul_matrix(table, generators[3 * column : 3 * column + 3], principal)
        if not _same_lattice(product, principal):
            raise Row1FreshAdapterFailure(
                "principal relation replay failed at " + str(column + 1)
            )

    for position in terminal_permutation:
        if position < 1 or position > ROWS:
            raise Row1FreshAdapterFailure("terminal permutation is out of range")
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


def compose_row1_fresh_presentation(
    resident: Mapping[str, Any], ancestry: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    """Replay and detach the exact row-1 presentation from live owners."""
    if not isinstance(resident, Mapping):
        raise Row1FreshAdapterFailure("resident owners are not a mapping")
    if _owner(resident, "attempt_state", 4) != [4, 0, 1, 1]:
        raise Row1FreshAdapterFailure("resident attempt is not terminal row 1")
    if _owner(resident, "prep_base_state", 6) != [259, 259, 51, 36, 36, 51]:
        raise Row1FreshAdapterFailure("resident factor-base policy changed")
    if _owner(resident, "relation_state", 1) != [58]:
        raise Row1FreshAdapterFailure("resident relation count changed")
    if _owner(resident, "class_number", 1) != [3] or _owner(
        resident, "class_invariants", 1
    ) != [3]:
        raise Row1FreshAdapterFailure("resident class candidate changed")

    polynomial = _owner(resident, "prep_polynomial", 4)
    table = _owner(resident, "basis_table", 27)
    basis = _owner(resident, "prep_zk", 9)
    if polynomial != [20018, -20010, 0, 1]:
        raise Row1FreshAdapterFailure("wrong row-1 polynomial")
    records = _owner(resident, "relation_records", ROWS * COLUMNS)
    generators = _owner(resident, "generators", DEGREE * COLUMNS)
    logs = _owner(resident, "log_embeddings", LOG_STRIDE * COLUMNS)
    permutation = _owner(resident, "search_ideals", ROWS)
    replay = _source_presentation(records, logs, permutation)
    if replay["classNumber"] != 3 or replay["invariants"] != [3]:
        raise Row1FreshAdapterFailure("source presentation changed class group")
    if replay["transformedLogs"] != _owner(
        resident, "hnf_result_c", LOG_STRIDE * COLUMNS
    ):
        raise Row1FreshAdapterFailure("source HNF transformed logs changed")
    descriptors, ideals, norms = _factor_base(
        resident, table, records, generators, replay["terminalPermutation"]
    )
    regulator = _owner(resident, "accept_regulator", 3)
    lattice = _owner(resident, "accept_lattice", UNIT_RANK * KERNEL)
    embedding_g = _owner(resident, "preparation_embedding", 27)
    embedding_mantissas = _owner(resident, "admission_matrix_m", 9)
    embedding_precisions = _owner(resident, "admission_matrix_p", 9)
    embedding_exponents = _owner(resident, "admission_matrix_e", 9)
    embedding_m = [
        value
        for index in range(9)
        for value in (
            embedding_mantissas[index],
            embedding_precisions[index],
            embedding_exponents[index],
        )
    ]
    rounded = _owner(resident, "preparation_rounded_embedding", 9)
    root_intervals = [[-142, -141], [1, 2], [140, 141]]
    kernel_logs = replay["transformedLogs"][: LOG_STRIDE * KERNEL]
    source = {
        "schema": PRESENTATION_ADAPTER_SCHEMA,
        "preparedOwnerOnly": True,
        "residentTerminalState": _strings(_owner(resident, "attempt_state", 4)),
    }
    return {
        "schema": PRESENTATION_SCHEMA,
        "field": {
            "id": FIELD_ID,
            "polynomial": _strings(polynomial),
            "signature": [3, 0],
            "discriminant": str(int(resident["analytic_discriminant"])),
            "index": str(int(resident["prep_index"])),
            "basisDenominator": str(int(resident["prep_zkden"])),
            "basis": _strings(basis),
            "multiplicationTensor": _strings(table),
            "tensorLayout": "output-major,column-major integral-basis multiplication",
            "embeddingM": _strings(embedding_m),
            "embeddingG": _strings(embedding_g),
            "roundedEmbedding": _strings(rounded),
            "rootIntervals": [list(map(str, interval)) for interval in root_intervals],
            "rootIdentity": "prepared embedding columns in resident owner order",
        },
        "ancestry": {**dict(ancestry or {}), "freshAdapter": source},
        "dimensions": {
            "degree": DEGREE,
            "places": PLACES,
            "factorBaseSize": ROWS,
            "relationCount": COLUMNS,
            "kernelRank": KERNEL,
            "unitRank": UNIT_RANK,
        },
        "factorBase": {
            "descriptorWidth": 16,
            "descriptors": _strings(descriptors),
            "idealShape": [DEGREE, DEGREE, ROWS],
            "ideals": _strings(ideals),
            "norms": _strings(norms),
            "descriptorsSha256": _array_digest(descriptors),
            "idealsSha256": _array_digest(ideals),
        },
        "relations": {
            "matrixShape": [ROWS, COLUMNS],
            "matrix": _strings(records),
            "principalGeneratorsShape": [DEGREE, COLUMNS],
            "principalGenerators": _strings(generators),
            "packedLogsShape": [PLACES, COLUMNS, 7],
            "packedLogs": _strings(logs),
            "matrixSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
            "packedLogsSha256": _array_digest(logs),
        },
        "presentation": {
            "matrixShape": [ROWS, ROWS],
            "matrix": _strings(replay["presentation"]),
            "relationToPresentationShape": [COLUMNS, ROWS],
            "relationToPresentation": _strings(replay["relationToPresentation"]),
            "rawToKernelShape": [COLUMNS, KERNEL],
            "rawToKernel": _strings(replay["rawToKernel"]),
            "kernelLogsShape": [PLACES, KERNEL, 7],
            "kernelLogs": _strings(kernel_logs),
            "relationLatticeShape": [UNIT_RANK, KERNEL],
            "relationLattice": _strings(lattice),
            "packedRegulator": _strings(regulator),
            "classNumber": "3",
            "invariants": ["3"],
            "matrixSha256": _array_digest(replay["presentation"]),
            "rawToKernelSha256": _array_digest(replay["rawToKernel"]),
        },
        "replay": {
            "cleanupTransformShape": [COLUMNS, COLUMNS],
            "cleanupTransform": _strings(replay["cleanupTransform"]),
            "activeRelationShape": [6, 13],
            "activeRelation": _strings(replay["activeRelation"]),
            "activeFullHnfShape": [6, 13],
            "activeFullHnf": _strings(replay["activeFullHnf"]),
            "activeTransformShape": [13, 13],
            "activeTransform": _strings(replay["activeTransform"]),
            "activeDiagonal": _strings(replay["activeDiagonal"]),
            "terminalPermutation": _strings(replay["terminalPermutation"]),
            "cleanupTransformSha256": _array_digest(replay["cleanupTransform"]),
            "activeRelationSha256": _array_digest(replay["activeRelation"]),
            "activeFullHnfSha256": _array_digest(replay["activeFullHnf"]),
            "activeTransformSha256": _array_digest(replay["activeTransform"]),
            "hnfState": replay["hnfState"],
            "smithState": replay["smithState"],
            "all51DescriptorsReconstructed": True,
            "all58PrincipalRelationsReplayed": True,
            "rawRelationsTimesKernelZero": True,
            "computedBeforeExpectedComparison": True,
        },
        "comparison": {
            "expectedClassNumber": "3",
            "expectedInvariants": ["3"],
            "matches": True,
        },
    }


def compose_row1_fresh_exact_units(presentation: Mapping[str, Any]) -> dict[str, Any]:
    """Derive exact fundamental units directly from a fresh presentation."""
    if presentation.get("schema") != PRESENTATION_SCHEMA:
        raise Row1FreshAdapterFailure("wrong fresh presentation schema")
    field = presentation.get("field", {})
    relations = presentation.get("relations", {})
    exact = presentation.get("presentation", {})
    result = derive_panel1_exact_units(
        relations.get("principalGenerators", ()),
        relations.get("packedLogs", ()),
        exact.get("rawToKernel", ()),
        exact.get("relationLattice", ()),
        field.get("multiplicationTensor", ()),
        exact.get("packedRegulator", ()),
        field.get("polynomial", ()),
        field.get("basis", ()),
        field.get("basisDenominator"),
        field.get("rootIntervals"),
        exact.get("kernelLogs", ()),
    )
    return {
        "schema": UNIT_ADAPTER_SCHEMA,
        "presentationSha256": _digest(presentation),
        "unitRank": UNIT_RANK,
        "exactUnitsIntegralBasis": [_strings(unit) for unit in result.exact_units],
        "unitNorms": _strings(result.unit_norms),
        "rawUnitProvenance": _strings(result.raw_unit_provenance),
        "unitTransform": _strings(result.unit_transform),
        "signPhases": list(result.sign_phases),
        "packedRegulator": _strings(result.packed_regulator),
        "arithmeticSha256": result.arithmetic_sha256,
        "exactRelationProductsMaterialized": True,
        "indexOneUnitLatticeAssumedFromPari": True,
    }


def compose_row1_fresh_transaction_state(
    resident: Mapping[str, Any], ancestry: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    """Build the replayed presentation, witnesses, units, and neutral result."""
    presentation = compose_row1_fresh_presentation(resident, ancestry)
    presentation_sha256 = _digest(presentation)
    class_witness = compose_panel1_c3_class_witness(
        presentation,
        {"presentationSha256": presentation_sha256, "freshResidentOwners": True},
    )
    units = compose_row1_fresh_exact_units(presentation)
    torsion = derive_real_cubic_torsion([20018, -20010, 0, 1])
    result = {
        "schema": RESULT_SCHEMA,
        "status": "pari-2.17.4-correspondence-complete-not-certified",
        "complete": False,
        "field": dict(presentation["field"]),
        "classGroup": {
            "classNumber": "3",
            "invariantFactors": ["3"],
            "generatorIdealHnf": class_witness["descriptor"]["idealHnf"],
            "generatorOrder": "3",
            "orderPrincipalWitness": class_witness["orderRelation"],
            "exactIdealReplay": class_witness["exactIdealReplay"],
        },
        "unitGroup": units,
        "torsion": torsion.detached_payload(),
        "authorities": {
            "presentationSha256": presentation_sha256,
            "classWitnessSha256": _digest(class_witness),
            "unitSha256": _digest(units),
        },
        "assumptions": [
            "prepared-maximal-order-assumed-from-pari",
            "factor-base-generation-assumed-from-pari",
            "grh-and-upstream-bounds-assumed",
            "unit-index-selection-assumed-from-pari",
        ],
        "provenance": {
            "pariVersion": "2.17.4",
            "retainedW0RuntimeInput": False,
            "timingClaim": False,
            "reserveClaim": False,
            "sameInvocationPrivateOwners": True,
        },
    }
    return {
        "presentation": presentation,
        "classWitness": class_witness,
        "units": units,
        "torsion": torsion.detached_payload(),
        "result": result,
    }


def compose_row1_fresh_class_unit_result(
    resident: Mapping[str, Any], ancestry: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    """Publish a branded, replayed, upstream-assumed row-1 result."""
    return compose_row1_fresh_transaction_state(resident, ancestry)["result"]


__all__ = [
    "RESULT_SCHEMA",
    "Row1FreshAdapterFailure",
    "compose_row1_fresh_class_unit_result",
    "compose_row1_fresh_exact_units",
    "compose_row1_fresh_presentation",
    "compose_row1_fresh_transaction_state",
]
