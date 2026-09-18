"""Authenticated row-3 ``class_group_gen`` transaction after presentation.

This joins the retained row-3 presentation with its independently published
reduced ``genback`` owner.  It recomputes the Smith request, terminal relation
logs, ``Ga``, ``GD``, ``ga``, and PARI's internal ``clg2`` state.  No PARI
terminal class object or generator answer is an input.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
from typing import Any

from .class_group_smith_transform import pari_class_group_smith_transform
from .log_matrix_transform import pari_log_matrix_transform
from .nf_cxlog import pari_prepared_famat_cxlog
from .relation_log_embeddings import pari_append_relation_log_embeddings


SCHEMA = "sagejs.pari-class-group/row3-class-group-transaction-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/row34-real-cubic-presentation-v1"
GENBACK_SCHEMA = "sagejs.pari-class-group/row3-reduced-genback-owner-v1"
FIELD_ID = (
    "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9"
)
ROWS = 668
COLUMNS = 675
DEGREE = 3
PLACES = 3
LOG_WIDTH = 7


class Row3ClassGroupTransactionFailure(ValueError):
    """The authenticated row-3 class-group transaction failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row3ClassGroupTransactionFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row3ClassGroupTransactionFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row3ClassGroupTransactionFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _digest(values: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(values)).encode()).hexdigest()


def _relation_logs(presentation: dict[str, Any]) -> tuple[list[int], list[int]]:
    embedding = _integers(
        presentation.get("field", {}).get("embeddingM"), 27, "embedding M"
    )
    matrix_m = embedding[::3]
    matrix_p = embedding[1::3]
    matrix_e = embedding[2::3]
    generators = _integers(
        presentation.get("relations", {}).get("principalGenerators"),
        DEGREE * COLUMNS,
        "principal generators",
    )
    scalar_prefix = presentation.get("relations", {}).get("scalarPrefixCount")
    if (
        not isinstance(scalar_prefix, int)
        or scalar_prefix < 0
        or scalar_prefix > COLUMNS
    ):
        raise Row3ClassGroupTransactionFailure("invalid scalar relation prefix")
    raw = [0] * (PLACES * LOG_WIDTH * COLUMNS)
    completed = [0]
    metadata = [value for index in range(COLUMNS) for value in (index + 1, 0, 0)]
    pari_append_relation_log_embeddings(
        matrix_m,
        matrix_p,
        matrix_e,
        generators,
        metadata,
        COLUMNS,
        DEGREE,
        PLACES,
        192,
        completed,
        raw,
        [0] * DEGREE,
        [0] * (PLACES * LOG_WIDTH),
        [0] * 3,
        [0] * 3,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 128,
        scalar_prefix,
    )
    if (
        completed != [COLUMNS]
        or _digest(raw) != presentation["relations"]["packedLogsSha256"]
    ):
        raise Row3ClassGroupTransactionFailure("raw relation-log replay changed")
    class_map = _integers(
        presentation.get("presentation", {}).get("rawToClassPresentation"),
        2 * COLUMNS,
        "raw-to-class map",
    )
    if (
        _digest(class_map)
        != presentation["presentation"]["rawToClassPresentationSha256"]
    ):
        raise Row3ClassGroupTransactionFailure("raw-to-class map digest changed")
    terminal = [0] * (PLACES * LOG_WIDTH * 2)
    pari_log_matrix_transform(raw, class_map, PLACES, COLUMNS, 2, True, terminal)
    return terminal, [*matrix_m, *matrix_p, *matrix_e]


def _smith(w: list[int]) -> dict[str, list[int]]:
    matrices = [[0] * 4 for _ in range(10)]
    invariants = [0] * 2
    class_number = [0]
    states = [[0] * 7 for _ in range(4)] + [[0] * 9]
    status = pari_class_group_smith_transform(
        w,
        2,
        *matrices,
        invariants,
        class_number,
        [0] * 2,
        [0] * 4,
        [0] * 8,
        *states,
    )
    if status != 0 or states[-1][1] != 1:
        raise Row3ClassGroupTransactionFailure("row-3 Smith transform changed")
    names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"]
    output = dict(zip(names, matrices, strict=True))
    output["invariants"] = invariants
    output["classNumber"] = class_number
    output["state"] = states[-1]
    return output


def compose_row3_class_group_transaction(
    presentation: dict[str, Any],
    genback: dict[str, Any],
    ancestry: dict[str, Any],
) -> dict[str, Any]:
    """Join the two owners and derive the retained-presentation class state."""
    if (
        presentation.get("schema") != PRESENTATION_SCHEMA
        or presentation.get("field", {}).get("id") != FIELD_ID
        or presentation.get("field", {}).get("panelIndex") != 3
        or presentation.get("completion", {}).get("presentationComplete") is not True
    ):
        raise Row3ClassGroupTransactionFailure("wrong row-3 presentation owner")
    if (
        genback.get("schema") != GENBACK_SCHEMA
        or genback.get("ancestry", {}).get("presentationSha256")
        != ancestry.get("presentationSha256")
        or genback.get("completion", {}).get("genbackRequestComplete") is not True
    ):
        raise Row3ClassGroupTransactionFailure("wrong row-3 genback owner")
    w = _integers(presentation.get("presentation", {}).get("terminalW"), 4, "W")
    if w != [3, 0, 0, 2]:
        raise Row3ClassGroupTransactionFailure("row-3 terminal W changed")
    smith = _smith(w)
    if smith["Uir"][:2] != [1, -1] or smith["invariants"][:1] != [6]:
        raise Row3ClassGroupTransactionFailure("Smith/genback request join changed")
    request = _integers(genback.get("request", {}).get("signedExponents"), 2, "request")
    if request != smith["Uir"][:2]:
        raise Row3ClassGroupTransactionFailure("genback request does not match Uir")

    terminal_logs, packed_embedding = _relation_logs(presentation)
    matrix_m = packed_embedding[:9]
    matrix_p = packed_embedding[9:18]
    matrix_e = packed_embedding[18:27]
    reduced = genback.get("reducedRepresentative", {})
    kinds = _integers(reduced.get("factorKinds"), 1, "Ge kinds")
    values = _integers(reduced.get("factorValues"), 4, "Ge values")
    exponents = _integers(reduced.get("factorExponents"), 1, "Ge exponents")
    if kinds != [0] or values != [1, 0, 0, 349] or exponents != [1]:
        raise Row3ClassGroupTransactionFailure("row-3 Ge changed")
    ga_atomic = [0] * (PLACES * LOG_WIDTH)
    cx_state = [0, 0, -1, -1, 0, 0, 0, 0]
    cx_status = pari_prepared_famat_cxlog(
        matrix_m,
        matrix_p,
        matrix_e,
        [0, 1],
        kinds,
        [values[0]],
        [values[3]],
        [0, 0, 0],
        exponents,
        1,
        192,
        ga_atomic,
        cx_state,
        [0] * 3,
        [0] * 21,
        [0] * 21,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 64,
        [0] * 128,
    )
    if cx_status != 0 or cx_state != [0, 1, -1, -1, 1, 0, 0, 0]:
        raise Row3ClassGroupTransactionFailure("row-3 Ga computation changed")
    zero_entry = [1, 0, -1, 0, 0, -1, 0]
    if ga_atomic != zero_entry * PLACES:
        raise Row3ClassGroupTransactionFailure("positive-rational Ga is not zero")

    gd = [0] * (PLACES * LOG_WIDTH)
    pari_log_matrix_transform(terminal_logs, smith["M1"][:2], PLACES, 2, 1, True, gd)
    generator_arch = [0] * (PLACES * LOG_WIDTH * 2)
    pari_log_matrix_transform(
        terminal_logs, smith["M2"], PLACES, 2, 2, True, generator_arch
    )
    for output_column in range(2):
        if smith["Ur"][2 * output_column + 1] != 0:
            raise Row3ClassGroupTransactionFailure(
                "omitted Ga tail coefficient is nonzero"
            )

    generator_ideal = _integers(reduced.get("idealHnf"), 9, "reduced generator ideal")
    if generator_ideal != [3839, 0, 2150, 0, 349, 30, 0, 0, 1]:
        raise Row3ClassGroupTransactionFailure("reduced class generator changed")
    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "requestJoin": {
            "smithUirColumn": _strings(smith["Uir"][:2]),
            "genbackExponents": _strings(request),
            "matches": True,
        },
        "classGroup": {
            "classNumber": str(smith["classNumber"][0]),
            "invariants": _strings(smith["invariants"][:1]),
            "generatorIdealHnf": _strings(generator_ideal),
            "generatorCount": 1,
        },
        "clg2": {
            "Ur": _strings(smith["Ur"]),
            "Ga": _strings(ga_atomic),
            "GD": _strings(gd),
            "Ge": {
                "factorOffsets": [0, 1],
                "factorKinds": kinds,
                "factorValues": _strings(values),
                "factorExponents": _strings(exponents),
            },
            "M1": _strings(smith["M1"][:2]),
            "M2": _strings(smith["M2"]),
        },
        "archimedean": {
            "terminalRelationLogs": _strings(terminal_logs),
            "ga": _strings(generator_arch),
            "cxlogState": cx_state,
            "rawLogsReplayed": COLUMNS,
        },
        "transform": {
            name: _strings(smith[name])
            for name in ("D", "U", "Ui", "V", "Y", "Uir", "X")
        },
        "finalClassState": {
            "internalClassGroupComplete": True,
            "generatorReduced": True,
            "exactPrincipalWitnessInherited": True,
            "exactOrderWitnessInherited": True,
            "inputBoundary": "retained-presentation-owner",
            "freshPreparedInputComplete": False,
            "qualifiedTiming": False,
        },
        "stop": {
            "code": 1,
            "reason": "class-and-unit correspondence/public-result owner not joined",
            "firstUnavailableOwner": "authenticated class-and-unit correspondence authority",
        },
        "completion": {
            "classGroupGenComplete": True,
            "clg2Complete": True,
            "retainedPresentationComplete": True,
            "freshPreparedInputComplete": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


__all__ = [
    "Row3ClassGroupTransactionFailure",
    "SCHEMA",
    "compose_row3_class_group_transaction",
]
