"""Fresh prepared-only class and compact-unit replay for panel row 4.

All inputs are numeric owners made by one live prepared-field invocation.  No
retained W0 relation trace, terminal answer, timing datum, or reserve decision
is accepted.  PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from typing import Any

from .mixed_cubic_presentation import _multiply_ideals, _same_lattice
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .row34_real_cubic_presentation import SCHEMA as PRESENTATION_SCHEMA
from .row34_real_cubic_presentation import _array_digest, _smith, _source_replay
from .row4_rank2_unit_authority import (
    OUTPUT_SCHEMA as UNIT_SCHEMA,
    _bridge_with_exact_sign_fallback,
    _canonical_sha256,
    _compose,
    _generator_signs,
    _getfu_large,
    _norm,
    _raw_provenance,
    _root_intervals,
)
from .row4_real_cubic_class_witness import (
    compose_row4_real_cubic_class_witness,
)
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix
from .torsion_authority import derive_real_cubic_torsion


FIELD_ID = (
    "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9"
)
POLYNOMIAL = [20000000018, -20000000010, 0, 1]
ROWS = 560
RELATIONS = 567
KERNEL = 7
RANK = 2
DEGREE = 3
PLACES = 3
LOG_STRIDE = 21
RESULT_SCHEMA = "sagejs.pari-class-group/row4-fresh-upstream-assumed-result-v1"


class Row4FreshAdapterFailure(ValueError):
    """A live row-4 owner failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Row4FreshAdapterFailure(label + " is not a sequence")
    if len(value) < length:
        raise Row4FreshAdapterFailure(label + " is too short")
    result: list[int] = []
    for entry in value[:length]:
        if isinstance(entry, bool):
            raise Row4FreshAdapterFailure(label + " contains a boolean")
        number = int(entry)
        if str(number) != str(entry):
            raise Row4FreshAdapterFailure(label + " contains noncanonical data")
        result.append(number)
    return result


def _owner(resident: Mapping[str, Any], name: str, length: int) -> list[int]:
    if name not in resident:
        raise Row4FreshAdapterFailure("missing live owner " + name)
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
    terminal_permutation: list[int],
) -> tuple[list[int], list[int], list[int]]:
    selected = _owner(resident, "prep_selected_indices", ROWS)
    catalog_primes = _owner(resident, "prep_kummer_catalog_primes", 3690)
    catalog_e = _owner(resident, "prep_kummer_catalog_e", 3690)
    catalog_f = _owner(resident, "prep_kummer_catalog_f", 3690)
    catalog_inert = _owner(resident, "prep_kummer_catalog_inert", 3690)
    catalog_generators = _owner(resident, "prep_kummer_catalog_generators", 3 * 3690)
    catalog_tau = _owner(resident, "prep_kummer_catalog_tau", 9 * 3690)
    packet_ideals = _owner(resident, "packet_ideals", 9 * ROWS)
    packet_norms = _owner(resident, "packet_norms", ROWS)
    relation_primes = _owner(resident, "relation_primes", ROWS)
    descriptors: list[int] = []
    ideals: list[int] = []
    norms: list[int] = []
    for position, index in enumerate(selected):
        if index < 0 or index >= 3690:
            raise Row4FreshAdapterFailure("selected catalog index is out of range")
        prime = catalog_primes[index]
        residue_degree = catalog_f[index]
        inert = catalog_inert[index]
        generator = catalog_generators[3 * index : 3 * index + 3]
        tau_row_major = catalog_tau[9 * index : 9 * index + 9]
        tau_column_major = [
            tau_row_major[3 * row + column] for column in range(3) for row in range(3)
        ]
        if relation_primes[position] != prime:
            raise Row4FreshAdapterFailure("factor base detached from catalog order")
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
        if ideal != packet_ideals[9 * position : 9 * position + 9]:
            raise Row4FreshAdapterFailure("factor ideal reconstruction changed")
        if packet_norms[position] != norm:
            raise Row4FreshAdapterFailure("factor norm changed")
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
    for column in range(RELATIONS):
        product = identity
        for position, exponent in enumerate(
            records[ROWS * column : ROWS * (column + 1)]
        ):
            if exponent < 0 or exponent > 16:
                raise Row4FreshAdapterFailure("relation exponent left retained domain")
            ideal = ideals[9 * position : 9 * position + 9]
            for _ in range(exponent):
                product = _multiply_ideals(product, ideal, table)
        principal = [0] * 9
        pari_cubic_mul_matrix(table, generators[3 * column : 3 * column + 3], principal)
        if not _same_lattice(product, principal):
            raise Row4FreshAdapterFailure(
                "principal relation replay failed at " + str(column + 1)
            )
    if sorted(terminal_permutation) != list(range(1, ROWS + 1)):
        raise Row4FreshAdapterFailure("terminal permutation changed")
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


def compose_row4_fresh_presentation(
    resident: Mapping[str, Any], ancestry: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    """Replay the presentation from same-invocation live owners."""
    if _owner(resident, "attempt_state", 4) != [4, 0, 1, 1]:
        raise Row4FreshAdapterFailure("row-4 attempt is not terminal")
    if _owner(resident, "prep_base_state", 6) != [4033, 4033, 560, 360, 360, 560]:
        raise Row4FreshAdapterFailure("row-4 factor-base policy changed")
    if _owner(resident, "relation_state", 1) != [RELATIONS]:
        raise Row4FreshAdapterFailure("row-4 relation count changed")
    if _owner(resident, "class_number", 1) != [2] or _owner(
        resident, "class_invariants", 1
    ) != [2]:
        raise Row4FreshAdapterFailure("row-4 class result changed")
    if _owner(resident, "prep_polynomial", 4) != POLYNOMIAL:
        raise Row4FreshAdapterFailure("wrong row-4 polynomial")
    records = _owner(resident, "relation_records", ROWS * RELATIONS)
    generators = _owner(resident, "generators", DEGREE * RELATIONS)
    logs = _owner(resident, "log_embeddings", LOG_STRIDE * RELATIONS)
    initial_permutation = _owner(resident, "search_ideals", ROWS)
    replay = _source_replay(records, logs, initial_permutation, ROWS, RELATIONS, 4)
    if replay["w"] != [2]:
        raise Row4FreshAdapterFailure("row-4 terminal presentation changed")
    invariants, class_number, smith_state = _smith(replay["w"], 1)
    if invariants != [2] or class_number != 2:
        raise Row4FreshAdapterFailure("row-4 Smith result changed")
    expected_exponents = [0] * ROWS
    expected_exponents[replay["permutation"][0] - 1] = 2
    if replay["classExponents"] != expected_exponents:
        raise Row4FreshAdapterFailure("class map does not present terminal W")
    if replay["c"] != _owner(resident, "hnf_result_c", LOG_STRIDE * RELATIONS):
        raise Row4FreshAdapterFailure("transformed relation logs changed")
    table = _owner(resident, "basis_table", 27)
    descriptors, ideals, norms = _factor_base(
        resident, table, records, generators, replay["permutation"]
    )
    embedding_m = [
        value
        for index in range(9)
        for value in (
            _owner(resident, "admission_matrix_m", 9)[index],
            _owner(resident, "admission_matrix_p", 9)[index],
            _owner(resident, "admission_matrix_e", 9)[index],
        )
    ]
    presentation = {
        "schema": PRESENTATION_SCHEMA,
        "field": {
            "id": FIELD_ID,
            "panelIndex": 4,
            "polynomial": _strings(POLYNOMIAL),
            "signature": [3, 0],
            "discriminant": str(int(resident["analytic_discriminant"])),
            "index": str(int(resident["prep_index"])),
            "basisDenominator": str(int(resident["prep_zkden"])),
            "basis": _strings(_owner(resident, "prep_zk", 9)),
            "multiplicationTensor": _strings(table),
            "embeddingM": _strings(embedding_m),
            "embeddingG": _strings(_owner(resident, "preparation_embedding", 27)),
        },
        "ancestry": {**dict(ancestry or {}), "preparedOwnerOnly": True},
        "dimensions": {
            "degree": 3,
            "places": 3,
            "factorBaseSize": ROWS,
            "relationCount": RELATIONS,
            "kernelRank": KERNEL,
            "unitRank": RANK,
            "classPresentationDimension": 1,
            "subfactorCount": 4,
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
            "packedLogsSha256": _array_digest(logs),
            "matrixSha256": _array_digest(records),
            "principalGeneratorsSha256": _array_digest(generators),
            "scalarPrefixCount": 116,
        },
        "presentation": {
            "terminalW": ["2"],
            "rawToKernel": _strings(replay["kernelMap"]),
            "kernelLogs": _strings(replay["c"][: LOG_STRIDE * KERNEL]),
            "rawToClassPresentation": _strings(replay["classMap"]),
            "classExponentMatrix": _strings(replay["classExponents"]),
            "relationLattice": _strings(_owner(resident, "accept_lattice", 14)),
            "packedRegulator": _strings(_owner(resident, "accept_regulator", 3)),
            "classNumber": "2",
            "invariants": ["2"],
            "terminalWSha256": _array_digest([2]),
            "rawToKernelSha256": _array_digest(replay["kernelMap"]),
            "rawToClassPresentationSha256": _array_digest(replay["classMap"]),
        },
        "replay": {
            "terminalPermutation": _strings(replay["permutation"]),
            "hnfState": replay["state"],
            "smithState": smith_state,
            "cleanupTransformSha256": replay["cleanupSha256"],
            "allDescriptorsReconstructed": True,
            "allPrincipalRelationsReplayed": True,
            "rawRelationsTimesKernelZero": True,
            "rawRelationsTimesClassMapEqualsEmbeddedW": True,
            "computedBeforeExpectedComparison": True,
        },
        "comparison": {"classNumber": 2, "invariants": [2], "matches": True},
        "completion": {
            "presentationComplete": True,
            "classWitnessesComplete": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }
    return presentation


def compose_row4_fresh_units(presentation: Mapping[str, Any]) -> dict[str, Any]:
    """Derive compact exact rank-two units from fresh relation owners."""
    field = presentation["field"]
    relations = presentation["relations"]
    exact = presentation["presentation"]
    records = _integers(relations["matrix"], ROWS * RELATIONS, "relations")
    generators = _integers(
        relations["principalGenerators"], DEGREE * RELATIONS, "generators"
    )
    raw_logs = _integers(relations["packedLogs"], LOG_STRIDE * RELATIONS, "logs")
    raw_to_kernel = _integers(exact["rawToKernel"], RELATIONS * KERNEL, "raw-to-kernel")
    # Packed logarithms are sign/precision/exponent records, not componentwise
    # integers.  The translated HNF replay already computed the exact packed
    # transform and retained its first seven kernel columns.
    kernel_logs = _integers(exact["kernelLogs"], LOG_STRIDE * KERNEL, "kernel logs")
    lattice = _integers(exact["relationLattice"], 14, "unit lattice")
    regulator = _integers(exact["packedRegulator"], 3, "regulator")
    bridge = _bridge_with_exact_sign_fallback(kernel_logs, lattice, regulator)
    tensor = _integers(field["multiplicationTensor"], 27, "tensor")
    embedding = _integers(field["embeddingM"], 27, "embedding")
    getfu = _getfu_large(bridge["cleanLogs"], embedding, tensor)
    transform = _compose(bridge["transform"], getfu["factor"])
    provenance = _raw_provenance(raw_to_kernel, transform)
    ideal_exponents = [
        sum(
            records[source * ROWS + row] * provenance[unit * RELATIONS + source]
            for source in range(RELATIONS)
        )
        for unit in range(RANK)
        for row in range(ROWS)
    ]
    if any(ideal_exponents):
        raise Row4FreshAdapterFailure("factored units have nontrivial ideals")
    ordered_norms = _integers(presentation["factorBase"]["norms"], ROWS, "norms")
    permutation = _integers(
        presentation["replay"]["terminalPermutation"], ROWS, "permutation"
    )
    source_norms = [0] * ROWS
    for terminal, source in enumerate(permutation):
        source_norms[source - 1] = ordered_norms[terminal]
    generator_norms: list[int] = []
    for relation in range(RELATIONS):
        norm = _norm(generators[3 * relation : 3 * relation + 3], tensor)
        expected = 1
        for row in range(ROWS):
            exponent = records[relation * ROWS + row]
            if exponent:
                expected *= source_norms[row] ** exponent
        if abs(norm) != expected:
            raise Row4FreshAdapterFailure("principal relation norm changed")
        generator_norms.append(norm)
    unit_norms = [
        -1
        if sum(
            (provenance[unit * RELATIONS + relation] & 1)
            for relation in range(RELATIONS)
            if generator_norms[relation] < 0
        )
        & 1
        else 1
        for unit in range(RANK)
    ]
    root_intervals = _root_intervals(field["embeddingG"])
    signs = _generator_signs(
        generators,
        generator_norms,
        _integers(field["basis"], 9, "basis"),
        int(field["basisDenominator"]),
        root_intervals,
    )
    unit_signs = [
        -1
        if sum(
            (provenance[unit * RELATIONS + relation] & 1)
            for relation in range(RELATIONS)
            if signs[3 * relation + place] < 0
        )
        & 1
        else 1
        for unit in range(RANK)
        for place in range(PLACES)
    ]
    arithmetic = {
        "kernelLogs": _strings(kernel_logs),
        "unitKernelTransform": _strings(transform),
        "rawUnitProvenance": _strings(provenance),
        "unitNorms": _strings(unit_norms),
        "unitRealSigns": unit_signs,
        "packedRegulator": _strings(regulator),
    }
    return {
        "schema": UNIT_SCHEMA,
        "field": dict(field),
        "sourceLogs": {
            "frozenW0UsedAsInput": False,
            "preparedNfLiveRoot": True,
            "qualifiedTiming": False,
            "rawPackedLogsSha256": _array_digest(raw_logs),
        },
        "units": {
            "materialization": "not_given(LARGE)",
            "reason": "LARGE",
            "unitKernelTransform": arithmetic["unitKernelTransform"],
            "rawUnitProvenance": arithmetic["rawUnitProvenance"],
            "factoredUnitBasis": "same-invocation principalGenerators",
            "unitNorms": arithmetic["unitNorms"],
            "unitRealSigns": unit_signs,
        },
        "regulator": {
            "packed": arithmetic["packedRegulator"],
            "computedFloat": bridge["computedRegulator"],
            "expectedFloat": bridge["expectedRegulator"],
        },
        "replay": {
            "bridgeStatus": bridge["bridgeStatus"],
            "getfuStatus": getfu["status"],
            "getfuState": getfu["state"],
            "rawRelationsTimesUnitsZero": True,
            "allPrincipalRelationNormsReplayed": True,
            "allPrincipalGeneratorSignsProved": True,
            "arithmeticSha256": _canonical_sha256(arithmetic),
        },
    }


def compose_row4_fresh_transaction_state(
    resident: Mapping[str, Any], ancestry: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    presentation = compose_row4_fresh_presentation(resident, ancestry)
    presentation_sha256 = _digest(presentation)
    class_witness = compose_row4_real_cubic_class_witness(
        presentation,
        {"presentationSha256": presentation_sha256, "freshResidentOwners": True},
    )
    units = compose_row4_fresh_units(presentation)
    torsion = derive_real_cubic_torsion(POLYNOMIAL).detached_payload()
    result = {
        "schema": RESULT_SCHEMA,
        "status": "pari-2.17.4-correspondence-complete-not-certified",
        "complete": False,
        "field": dict(presentation["field"]),
        "classGroup": {
            "classNumber": "2",
            "invariantFactors": ["2"],
            "generatorIdealHnf": class_witness["generator"]["idealHnf"],
            "generatorOrder": "2",
        },
        "unitGroup": units,
        "torsion": torsion,
        "authorities": {
            "presentationSha256": presentation_sha256,
            "classWitnessSha256": _digest(class_witness),
            "unitSha256": _digest(units),
        },
        "provenance": {
            "retainedW0RuntimeInput": False,
            "sameInvocationPrivateOwners": True,
            "timingClaim": False,
            "reserveClaim": False,
        },
    }
    return {
        "presentation": presentation,
        "classWitness": class_witness,
        "units": units,
        "torsion": torsion,
        "result": result,
    }


__all__ = [
    "RESULT_SCHEMA",
    "Row4FreshAdapterFailure",
    "compose_row4_fresh_presentation",
    "compose_row4_fresh_transaction_state",
    "compose_row4_fresh_units",
]
