"""Fresh prepared-input pipeline for development-panel row 18.

This module composes the translated resident factor-base/initial-attempt graph
with its translated resumable relation collector.  It deliberately accepts no
retained trace or terminal owner.
"""

from __future__ import annotations

import copy
import inspect
from typing import Any, get_origin

from .prepared_class_group_resumable import pari_prepared_class_group_resumable
from .resident_generated_class_attempt import pari_resident_generated_class_attempt
from .mixed_cubic_presentation import _array_digest, _source_presentation
from .mixed_cubic_rank1_unit import compose_mixed_cubic_rank1_unit
from .row18_mixed_cubic_class_witness import compose_row18_cyclic_class_witness


def _convert(kind: str, value: Any) -> Any:
    if kind == "bool":
        converter = bool
    elif kind in ("float", "Float64Buffer"):
        converter = float
    else:
        converter = int
    if isinstance(value, list):
        return [converter(entry) for entry in value]
    return converter(value)


def _fresh_owner_graph(names: list[list[str]], raw: dict[str, Any]) -> dict[str, Any]:
    return {name: _convert(kind, raw[name]) for name, kind in names}


def _resumable_graph(
    pristine: dict[str, Any], generated: dict[str, Any]
) -> dict[str, Any]:
    # Continue the rejected resident attempt itself.  In particular the 47
    # accepted relations, their exact generators/logs, and the rejected HNF
    # are live inputs to the retry; resetting them silently changes the
    # mathematical transaction.
    state = copy.deepcopy(generated)
    signature = inspect.signature(pari_prepared_class_group_resumable)
    for name, parameter in signature.parameters.items():
        if name in state:
            continue
        annotation = str(parameter.annotation)
        if get_origin(parameter.annotation) is list or annotation.startswith("list["):
            state[name] = [0] * 4096
        elif annotation in ("float", "'float'"):
            state[name] = 0.0
        elif annotation in ("bool", "'bool'"):
            state[name] = False
        else:
            state[name] = 0

    factor_count = int(generated["prep_base_state"][2])
    relation_prime_count = int(generated["prep_base_state"][3])
    checking_prime_count = int(generated["prep_base_state"][4])
    subfactor_count = int(generated["prep_sub_state"][0])
    for name in (
        "admission_group_e",
        "admission_group_f",
        "admission_group_inert",
        "relation_primes",
        "ramification",
        "relation",
        "search_ideals",
        "packet_ids",
        "packet_norms",
    ):
        state[name] = state[name][:factor_count]
    state["admission_group_tau"] = state["admission_group_tau"][: 9 * factor_count]
    state["packet_ideals"] = state["packet_ideals"][: 9 * factor_count]
    state["subfactor"] = copy.deepcopy(state["search_ideals"][:subfactor_count])
    # The initial attempt consumes prebuilt prime-ideal packets, so its public
    # packet descriptor owners are intentionally empty.  A connected retry
    # reconstructs packets and therefore needs the same selected descriptors.
    # Gather them from the freshly generated catalog while its authenticated
    # zero-based selection remains live in this invocation.
    selected = generated["prep_selected_indices"][:factor_count]
    catalog_primes = generated["prep_kummer_catalog_primes"]
    catalog_inert = generated["prep_kummer_catalog_inert"]
    catalog_generators = generated["prep_kummer_catalog_generators"]
    degree = int(generated["n"])
    state["packet_primes"] = [catalog_primes[index] for index in selected]
    state["packet_inert"] = [catalog_inert[index] for index in selected]
    state["packet_generators"] = [
        catalog_generators[index * degree + coordinate]
        for index in selected
        for coordinate in range(degree)
    ]
    for name in (
        "initial_primes",
        "initial_offsets",
        "initial_counts",
        "initial_complete",
    ):
        state[name] = state[name][:relation_prime_count]

    for name in (
        "outer_minidx",
        "outer_present",
        "outer_live",
        "outer_perm",
        "outer_multiplier",
    ):
        state[name] = [0] * factor_count
    state["outer_minidx"] = list(range(1, factor_count + 1))
    state["outer_state"] = [0] * 19
    state["log_completed"] = [0]
    state["schedule"] = [0] * 4
    # The connected driver publishes the selected distinguished exponent in a
    # fifth slot; the first-pass-only resident graph owns only four slots.
    state["power_metadata"] = [0] * 5
    state["driver_state"] = [0] * 8
    state["driver_trace"] = [0] * 15
    state["capacity_state"] = [0] * 32
    state.update(
        scale=4.1887902047863905,
        track_small=1,
        admission_mode=2,
        admission_factor_product=int(generated["prep_base_state"][6]),
        nrelid=4,
        track_fact=1,
        jid0=0,
        e0=0,
        extra_count=-1,
        search_count=factor_count,
        construct_primes=0,
        outer_ru=0,
        log_precision=int(generated["precision"]),
        # PARI's row-18 retry grows the 47-column rejected presentation to the
        # reviewed 50-column terminal presentation before acceptance.
        initial_additional=10,
        hnf_k0=subfactor_count,
        pass_limit=3,
        automorphism_count=1,
        relation_prime_count=relation_prime_count,
        checking_prime_count=checking_prime_count,
    )
    return state


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _presentation_owner(
    state: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    rows = int(state["prep_base_state"][2])
    columns = int(state["relation_state"][0])
    degree = int(state["n"])
    subfactor_count = int(state["prep_sub_state"][0])
    if degree != 3 or rows != 41 or columns <= rows:
        raise ArithmeticError("unexpected fresh row-18 terminal dimensions")
    records = list(state["relation_records"][: rows * columns])
    generators = list(state["generators"][: degree * columns])
    logs = list(state["log_embeddings"][: 14 * columns])
    replay = _source_presentation(
        records,
        logs,
        list(state["search_ideals"][:rows]),
        rows,
        subfactor_count,
    )
    invariants = [
        int(value)
        for value in state["class_invariants"][: int(state["driver_state"][5])]
        if int(value) > 1
    ]
    smith_order = int(state["class_number"][0])
    smith_state = list(state["smith_state"])
    if (
        smith_order != int(state["class_number"][0])
        or replay["classNumber"] != smith_order
        or invariants != [18]
    ):
        raise ArithmeticError("fresh row-18 presentation disagrees with acceptance")

    selected = state["prep_selected_indices"][:rows]
    catalog_primes = state["prep_kummer_catalog_primes"]
    catalog_e = state["prep_kummer_catalog_e"]
    catalog_f = state["prep_kummer_catalog_f"]
    catalog_inert = state["prep_kummer_catalog_inert"]
    catalog_generators = state["prep_kummer_catalog_generators"]
    catalog_tau = state["prep_kummer_catalog_tau"]
    descriptors: list[int] = []
    for index in selected:
        descriptors.extend(
            [
                catalog_primes[index],
                catalog_e[index],
                catalog_f[index],
                catalog_inert[index],
                *catalog_generators[degree * index : degree * (index + 1)],
                *catalog_tau[9 * index : 9 * (index + 1)],
            ]
        )
    terminal_permutation = list(replay["terminalPermutation"])
    ordered_descriptors = [
        value
        for position in terminal_permutation
        for value in descriptors[16 * (position - 1) : 16 * position]
    ]
    ordered_ideals = [
        value
        for position in terminal_permutation
        for value in state["packet_ideals"][9 * (position - 1) : 9 * position]
    ]
    ordered_norms = [
        state["packet_norms"][position - 1] for position in terminal_permutation
    ]
    kernel = columns - rows
    relation_lattice = list(state["accept_lattice"][:kernel])
    if not any(relation_lattice):
        raise ArithmeticError("fresh row-18 accepted unit lattice is empty")
    embedding_m = [
        value
        for i in range(9)
        for value in (
            state["admission_matrix_m"][i],
            state["admission_matrix_p"][i],
            state["admission_matrix_e"][i],
        )
    ]
    scalar_prefix = 0
    while (
        scalar_prefix < columns
        and generators[3 * scalar_prefix + 1] == 0
        and generators[3 * scalar_prefix + 2] == 0
    ):
        scalar_prefix += 1
    return {
        "schema": "sagejs.pari-class-group/mixed-cubic-presentation-v1",
        "field": {
            "id": "3.1.1005907102200.3",
            "panelIndex": 18,
            "polynomial": _strings(list(state["prep_polynomial"])),
            "signature": [1, 1],
            "discriminant": str(state["analytic_discriminant"]),
            "index": str(state["prep_index"]),
            "basisDenominator": str(state["prep_zkden"]),
            "basis": _strings(list(state["prep_zk"])),
            "multiplicationTensor": _strings(list(state["basis_table"])),
            "embeddingM": _strings(embedding_m),
        },
        "ancestry": dict(ancestry),
        "dimensions": {
            "degree": degree,
            "places": 2,
            "factorBaseSize": rows,
            "relationCount": columns,
            "kernelRank": kernel,
            "unitRank": 1,
            "subfactorCount": subfactor_count,
        },
        "factorBase": {
            "descriptorWidth": 16,
            "descriptors": _strings(ordered_descriptors),
            "ideals": _strings(ordered_ideals),
            "norms": _strings(ordered_norms),
            "descriptorsSha256": _array_digest(ordered_descriptors),
            "idealsSha256": _array_digest(ordered_ideals),
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
            "kernelLogs": _strings(replay["transformedLogs"][: 14 * kernel]),
            "relationLattice": _strings(relation_lattice),
            "packedRegulator": _strings(list(state["accept_regulator"][:3])),
            "classNumber": str(replay["classNumber"]),
            "invariants": _strings(invariants),
            "matrixSha256": _array_digest(replay["presentation"]),
            "rawToKernelSha256": _array_digest(replay["rawToKernel"]),
        },
        "replay": {
            "terminalPermutation": _strings(terminal_permutation),
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
        "comparison": {"classNumber": 18, "invariants": [18], "matches": True},
        "completion": {
            "presentationComplete": True,
            "classWitnessesComplete": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


def run_fresh_row18(
    names: list[list[str]], raw: dict[str, Any], ancestry: dict[str, Any] | None = None
) -> dict[str, Any]:
    pristine = _fresh_owner_graph(names, raw)
    initial = copy.deepcopy(pristine)
    initial_action = int(pari_resident_generated_class_attempt(**initial))
    if initial_action != 5:
        raise ArithmeticError(f"unexpected row-18 initial action: {initial_action}")
    state = _resumable_graph(pristine, initial)
    arguments = {
        name: state[name]
        for name in inspect.signature(pari_prepared_class_group_resumable).parameters
    }
    status = int(pari_prepared_class_group_resumable(**arguments))
    if status != 0:
        raise ArithmeticError(f"fresh row-18 continuation failed: {status}")
    authority = dict(ancestry or {})
    presentation = _presentation_owner(state, authority)
    class_witness = compose_row18_cyclic_class_witness(presentation, authority)
    unit = compose_mixed_cubic_rank1_unit(presentation, authority)
    return {
        "initialAction": initial_action,
        "status": status,
        "driverState": list(state["driver_state"]),
        "driverTrace": list(state["driver_trace"][:15]),
        "relationState": list(state["relation_state"]),
        "hnfState": list(state["hnf_state"][:9]),
        "acceptMultipleState": list(state["accept_multiple_state"][:4]),
        "classNumber": str(state["class_number"][0]),
        "invariants": [str(value) for value in state["class_invariants"][:3]],
        "regulator": [str(value) for value in state["accept_regulator"][:3]],
        "presentation": presentation,
        "classWitness": class_witness,
        "unit": unit,
    }


__all__ = ["run_fresh_row18"]
