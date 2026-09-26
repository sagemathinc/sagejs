"""Authenticate the frozen panel-8 resident-retry computation.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.

This module recomputes the translated three-pass retry from its prepared
owners.  Reference values are consulted only after every pass has returned;
they never enter the mathematical call or select a retry.
"""

import hashlib
import json
import sys

from .prepared_class_group_resumable import pari_prepared_class_group_resumable


SCHEMA = "sagejs.pari-class-group/panel8-accepted-retry-owner-v1"
FIELD_ID = (
    "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363"
)
POLYNOMIAL = ["-20034", "-20018", "0", "0", "1"]


def _digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()


def _integers(values: list[object]) -> list[int]:
    return [int(value) for value in values]


def _strings(values: list[object]) -> list[str]:
    return [str(value) for value in values]


def _fresh(names: list[list[str]], raw: dict[str, object]) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, kind in names:
        value = raw[name]
        if kind.endswith("Buffer"):
            result[name] = (
                [float(entry) for entry in value]
                if kind == "Float64Buffer"
                else _integers(value)
            )
        elif kind == "float":
            result[name] = float(value)
        elif kind == "bool":
            result[name] = bool(value)
        else:
            result[name] = int(value)
    return result


def _packed_real(value: dict[str, object]) -> list[str]:
    if value.get("kind") == "integer":
        return [str(value["value"]), "-1", "0"]
    if value.get("kind") != "real":
        raise ValueError("pristine scalar component is not real")
    return [str(value["mantissa"]), str(value["precision"]), str(value["exponent"])]


def _packed_scalar(value: dict[str, object]) -> list[str]:
    if value.get("kind") == "complex":
        return ["2", *_packed_real(value["real"]), *_packed_real(value["imag"])]
    return ["1", *_packed_real(value), "0", "-1", "0"]


def _packed_matrix(value: dict[str, object]) -> list[str]:
    if value.get("kind") != "matrix":
        raise ValueError("pristine value is not a matrix")
    return [
        cell
        for column in value["values"]
        for entry in column["values"]
        for cell in _packed_scalar(entry)
    ]


def _integer_matrix(value: dict[str, object]) -> list[str]:
    if value.get("kind") != "matrix":
        raise ValueError("pristine value is not an integer matrix")
    return [
        str(entry["value"]) for column in value["values"] for entry in column["values"]
    ]


def _reference_summary(events: list[dict[str, object]]) -> dict[str, object]:
    hnfs = [event for event in events if event.get("event") == "hnf"]
    acceptance = [event for event in events if event.get("event") == "acceptance"]
    results = [event for event in events if event.get("event") == "result"]
    if len(hnfs) != 3 or len(acceptance) != 3 or len(results) != 1:
        raise ValueError("pristine trace does not contain the three-pass terminal path")
    return {
        "relationCounts": [int(event["relations"]) for event in hnfs],
        "acceptanceCodes": [int(event["code"]) for event in acceptance],
        "classNumbers": [str(event["h"]) for event in acceptance],
        "regulators": [
            [
                str(event["R"]["mantissa"]),
                str(event["R"]["precision"]),
                str(event["R"]["exponent"]),
            ]
            for event in acceptance
        ],
        "exactRegulators": [
            [
                str(event["exactR"]["mantissa"]),
                str(event["exactR"]["precision"]),
                str(event["exactR"]["exponent"]),
            ]
            for event in acceptance
        ],
        "transformedLogPrefixes": [_packed_matrix(event["exactC"]) for event in hnfs],
        "terminalLattice": _integer_matrix(acceptance[-1]["lattice"]),
        "result": {
            "classNumber": str(results[0]["classNumber"]),
            "invariants": _strings(results[0]["invariants"]),
            "regulator": [
                str(results[0]["regulator"]["mantissa"]),
                str(results[0]["regulator"]["precision"]),
                str(results[0]["regulator"]["exponent"]),
            ],
        },
    }


def compose_accepted_retry_owner(
    inputs: dict[str, object],
    pristine_events: list[dict[str, object]],
    ancestry: dict[str, object],
) -> dict[str, object]:
    """Recompute and seal the exact accepted resident-retry state."""

    names = inputs["names"]
    raw = inputs["raw"]
    expected = inputs["wanted"]
    reference = _reference_summary(pristine_events)
    if reference["relationCounts"] != [150, 151, 152]:
        raise ValueError("pristine relation schedule changed")
    if reference["acceptanceCodes"] != [1, 1, 0]:
        raise ValueError("pristine acceptance schedule changed")

    # These buffers are deliberately blank/poisoned at the call boundary.  In
    # particular, no accepted class number, regulator, retry action, relation
    # prefix, or HNF C block is supplied as an input answer.
    if any(int(value) != 0 for value in raw["relation_records"]):
        raise ValueError("prepared relation record owner contains an answer")
    if any(int(value) != 0 for value in raw["generators"]):
        raise ValueError("prepared generator owner contains an answer")
    if any(int(value) != 0 for value in raw["log_embeddings"]):
        raise ValueError("prepared logarithm owner contains an answer")
    if any(int(value) != 77 for value in raw["hnf_result_c"]):
        raise ValueError("prepared transformed-log owner is not poisoned")
    if any(int(value) != 77 for value in raw["accept_regulator"]):
        raise ValueError("prepared regulator owner is not poisoned")
    if any(int(value) != 77 for value in raw["accept_relations"]):
        raise ValueError("prepared relation-lattice owner is not poisoned")
    if any(int(value) != 77 for value in raw["driver_trace"]):
        raise ValueError("prepared driver trace is not poisoned")
    if int(raw["class_number"][0]) != 77:
        raise ValueError("prepared class result is not poisoned")

    kc = len(raw["relation"])
    n = int(raw["n"])
    places = (n + int(raw["admission_real_count"])) // 2
    passes: list[dict[str, object]] = []
    terminal: dict[str, object] | None = None

    for pass_limit in (1, 2, 3):
        state = _fresh(names, raw)
        state["pass_limit"] = pass_limit
        status = int(pari_prepared_class_group_resumable(**state))
        last = int(state["relation_state"][0])
        records = _strings(state["relation_records"][: kc * last])
        generators = _strings(state["generators"][: n * last])
        logs = _strings(state["log_embeddings"][: 7 * places * last])
        transformed_logs = _strings(state["hnf_result_c"][: 7 * places * last])
        pass_state = {
            "passLimit": pass_limit,
            "status": status,
            "relationCount": last,
            "driverState": _integers(state["driver_state"]),
            "driverTrace": _integers(state["driver_trace"][: 5 * pass_limit]),
            "outerState": _integers(state["outer_state"]),
            "relationState": _strings(state["relation_state"]),
            "recordsSha256": _digest(records),
            "generatorsSha256": _digest(generators),
            "logsSha256": _digest(logs),
            "transformedLogsSha256": _digest(transformed_logs),
            "transformedLogs": transformed_logs,
        }
        passes.append(pass_state)

        # Exact enriched-PARI prefixes are comparison-only.  The call above
        # has already returned and cannot observe these values.
        if records != _strings(expected["records"][: kc * last]):
            raise ValueError(f"relation prefix {last} differs from pristine PARI")
        if generators != _strings(expected["generators"][: n * last]):
            raise ValueError(f"generator prefix {last} differs from pristine PARI")
        if logs != _strings(expected["logs"][: 7 * places * last]):
            raise ValueError(f"log prefix {last} differs from pristine PARI")
        if transformed_logs != reference["transformedLogPrefixes"][pass_limit - 1]:
            raise ValueError(f"transformed-log prefix {last} differs from pristine W0")

        wanted_status = -200 if pass_limit < 3 else 0
        if (
            status != wanted_status
            or last != reference["relationCounts"][pass_limit - 1]
        ):
            raise ValueError(
                f"translated pass {pass_limit} has the wrong terminal state"
            )
        if state["driver_trace"][5 * pass_limit - 4] != (
            5 if reference["acceptanceCodes"][pass_limit - 1] == 1 else 0
        ):
            raise ValueError(
                f"translated pass {pass_limit} has the wrong acceptance action"
            )

        if pass_limit == 3:
            final_c = _strings(state["hnf_result_c"][: len(expected["C"])])
            if final_c != _strings(expected["C"]):
                raise ValueError(
                    "terminal transformed logarithms differ from pristine PARI"
                )
            regulator = _strings(state["accept_regulator"][:3])
            lattice = _strings(state["accept_relations"][: len(expected["L"])])
            if lattice != reference["terminalLattice"]:
                raise ValueError("terminal relation lattice differs from pristine W0")
            class_number = str(state["class_number"][0])
            invariant_count = int(state["driver_state"][5])
            invariants = _strings(state["class_invariants"][:invariant_count])
            if class_number != reference["result"]["classNumber"]:
                raise ValueError("terminal class number differs from pristine PARI")
            if invariants != reference["result"]["invariants"]:
                raise ValueError("terminal invariants differ from pristine PARI")
            if regulator != reference["result"]["regulator"]:
                raise ValueError("terminal regulator differs from pristine PARI")
            if regulator != reference["exactRegulators"][-1]:
                raise ValueError("terminal regulator differs from pristine W0 exactR")
            terminal = {
                "status": "accepted",
                "classNumber": class_number,
                "classInvariants": invariants,
                "regulator": regulator,
                "relationLatticeShape": [9, 2],
                "relationLattice": lattice,
                "hnfShape": {"W": [0, 0], "B": [0, kc], "C": [places, last]},
                "packedLogComponentsPerEntry": 7,
                "transformedLogs": final_c,
                "relationRecordsShape": [kc, last],
                "relationRecords": records,
                "generatorsShape": [n, last],
                "generators": generators,
                "logEmbeddingsShape": [places, last],
                "packedLogEmbeddings": logs,
                "driverState": _integers(state["driver_state"]),
                "outerState": _integers(state["outer_state"]),
                "relationState": _strings(state["relation_state"]),
            }

    if terminal is None:
        raise AssertionError("terminal pass was not computed")
    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "panelIndex": 8,
            "polynomial": POLYNOMIAL,
            "polynomialCoefficientOrder": "ascending",
            "degree": 4,
            "signature": [2, 1],
            "unitRank": 2,
            "discriminant": "-4337631470366176176",
        },
        "upstreamAssumption": "faithful PARI 2.17.4 correspondence; not an independent proof",
        "preparedBoundary": "authenticated W0 plus prepared factor-base and analytic inverse-hR; no relation, HNF, regulator, retry, class, or unit answers",
        "ancestry": ancestry,
        "retryPasses": passes,
        "terminal": terminal,
        "pristineComparison": {
            "relationCounts": reference["relationCounts"],
            "acceptanceCodes": reference["acceptanceCodes"],
            "regulators": reference["regulators"],
            "exactRegulators": reference["exactRegulators"],
            "transformedLogPrefixSha256": [
                _digest(value) for value in reference["transformedLogPrefixes"]
            ],
            "terminalLatticeSha256": _digest(reference["terminalLattice"]),
            "allThreeExactPrefixesCompared": True,
            "terminalStateCompared": True,
        },
    }


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(
            "usage: panel8_accepted_retry_owner.py INPUTS PRISTINE ANCESTRY"
        )
    with open(sys.argv[1], encoding="utf8") as stream:
        inputs = json.load(stream)
    with open(sys.argv[2], encoding="utf8") as stream:
        pristine_bundle = json.load(stream)
    with open(sys.argv[3], encoding="utf8") as stream:
        ancestry = json.load(stream)
    result = compose_accepted_retry_owner(inputs, pristine_bundle["events"], ancestry)
    json.dump(result, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
