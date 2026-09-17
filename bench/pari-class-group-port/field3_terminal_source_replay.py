"""Exact replay for the two field-3 terminal serialization boundaries.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This module does not infer a class-group answer from a digest.  It consumes the
retained exact owners, reruns the 301 principal-ideal equalities, and reruns the
two-column `class_group_gen` suffix before returning ordinary JSON data to the
transactional coordinator.
"""

from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Mapping, Sequence
from typing import Any


FIELD = "x^4-2000022*x-2000042"
RUN = "pari-2.17.4:nfinit192->nfnewprec153088:field3"
FULL15_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1"
RELATION_SCHEMA = "sagejs.pari-class-group/field3-full-owner-authority-v1"
CLASS_SCHEMA = "sagejs.pari-class-group/field3-live-class-suffix-owner-v1"
AUTHORITY_SHA256 = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c"
LIVE_JOIN_SHA256 = "b8df9b99acb501d8ea0faf3034c1059d451ffd84180735c89c982b0f014da814"


class Field3TerminalSourceFailure(ValueError):
    """An authenticated terminal source failed exact replay."""


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Field3TerminalSourceFailure("duplicate JSON key: " + key)
        result[key] = value
    return result


def _load(path: str, expected: str, label: str) -> dict[str, Any]:
    data = open(path, "rb").read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise Field3TerminalSourceFailure(label + " changed after authentication")
    if os.stat(path).st_mode & 0o777 != 0o444:
        raise Field3TerminalSourceFailure(label + " is not immutable")
    value = json.loads(data, object_pairs_hook=_strict_object)
    if not isinstance(value, dict):
        raise Field3TerminalSourceFailure(label + " is not an object")
    return value


def _integer(value: Any, label: str) -> int:
    if (
        not isinstance(value, str)
        or not value
        or (value[0] == "-" and not value[1:].isdigit())
        or (value[0] != "-" and not value.isdigit())
    ):
        raise Field3TerminalSourceFailure(label + " is not canonical decimal data")
    if value != str(int(value)):
        raise Field3TerminalSourceFailure(label + " is not canonical decimal data")
    return int(value)


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Field3TerminalSourceFailure(label + " has the wrong length")
    return [_integer(entry, f"{label}[{index}]") for index, entry in enumerate(value)]


def _strings(values: Sequence[int]) -> list[str]:
    return [str(int(value)) for value in values]


def _array_sha256(values: Sequence[int]) -> str:
    """Use the established packed-owner digest: decimal cells joined by LF."""
    data = "\n".join(_strings(values)).encode()
    return hashlib.sha256(data).hexdigest()


def _identity(owner: Mapping[str, Any], schema: str, label: str) -> None:
    if owner.get("schema") != schema or owner.get("field") != FIELD:
        raise Field3TerminalSourceFailure(label + " identity changed")
    if owner.get("runIdentity") != RUN:
        raise Field3TerminalSourceFailure(label + " run identity changed")


def _authority_owners(authority: Mapping[str, Any]) -> dict[str, Any]:
    authenticated = authority.get("authority")
    if not isinstance(authenticated, dict):
        raise Field3TerminalSourceFailure("authority envelope changed")
    owners = authenticated.get("owners")
    if not isinstance(owners, dict):
        raise Field3TerminalSourceFailure("authority exact owners changed")
    state = authenticated.get("state")
    if not isinstance(state, list):
        raise Field3TerminalSourceFailure("authority state changed")
    if state[:6] != [0, 288, 301, 4, 3, 288]:
        raise Field3TerminalSourceFailure("authority terminal state changed")
    if (
        authority.get("terminalAction") != 0
        or authority.get("terminalClassNumber") != 4
    ):
        raise Field3TerminalSourceFailure("authority did not terminate successfully")
    return owners


def _live(live_join: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    live = live_join.get("live")
    expected = live_join.get("expected")
    if not isinstance(live, dict) or not isinstance(expected, dict):
        raise Field3TerminalSourceFailure("live class join changed")
    return live, expected


def _replay_resident_authority(
    envelope: Mapping[str, Any], owners: Mapping[str, Any]
) -> None:
    """Rerun the complete frozen authority latch before exact replay."""
    from .field3_full_owner_authority import pari_field3_full_owner_authority

    names = (
        "relationState",
        "relationRecords",
        "relationBasis",
        "relationHashes",
        "relationMetadata",
        "principalGenerators",
        "logCompleted",
        "relationLogs",
        "packetIds",
        "packetIdeals",
        "packetNorms",
        "packetPrimes",
        "packetGenerators",
        "packetInert",
        "relationPrimes",
        "ramification",
        "hnfPermutation",
        "outerPermutation",
        "randomState",
        "randomSchedule",
        "randomSubfactor",
        "smallSchedule",
        "outerState",
        "driverState",
        "hnfState",
        "controlState",
    )
    values: dict[str, list[int]] = {}
    for name in names:
        raw = owners.get(name)
        if not isinstance(raw, list):
            raise Field3TerminalSourceFailure(name + " owner changed")
        values[name] = [_integer(entry, name) for entry in raw]
    fingerprints, state = [77] * 48, [77] * 24
    status = pari_field3_full_owner_authority(
        int(envelope.get("terminalAction", -1)),
        values["relationState"],
        values["relationRecords"],
        values["relationBasis"],
        values["relationHashes"],
        values["relationMetadata"],
        values["principalGenerators"],
        values["logCompleted"],
        values["relationLogs"],
        values["packetIds"],
        values["packetIdeals"],
        values["packetNorms"],
        values["packetPrimes"],
        values["packetGenerators"],
        values["packetInert"],
        values["relationPrimes"],
        values["ramification"],
        values["hnfPermutation"],
        values["outerPermutation"],
        values["randomState"],
        values["randomSchedule"],
        values["randomSubfactor"],
        len(values["randomSubfactor"]),
        values["smallSchedule"],
        values["outerState"],
        values["driverState"],
        values["hnfState"],
        values["controlState"],
        fingerprints,
        state,
    )
    authenticated = envelope.get("authority")
    if not isinstance(authenticated, dict):
        raise Field3TerminalSourceFailure("authority envelope changed")
    expected_fingerprints = [
        _integer(value, "authority fingerprint")
        for value in authenticated.get("fingerprints", [])
    ]
    if (
        status != 0
        or fingerprints != expected_fingerprints
        or state != authenticated.get("state")
    ):
        raise Field3TerminalSourceFailure("resident authority replay failed")


def build_relation_owner(
    authority: Mapping[str, Any],
    live_join: Mapping[str, Any],
    authority_sha256: str,
    live_join_sha256: str,
) -> dict[str, Any]:
    """Replay and serialize the complete 288-by-301 relation authority."""
    if authority_sha256 != AUTHORITY_SHA256 or live_join_sha256 != LIVE_JOIN_SHA256:
        raise Field3TerminalSourceFailure("frozen relation source identity changed")
    owners = _authority_owners(authority)
    _replay_resident_authority(authority, owners)
    live, _ = _live(live_join)
    basis_table = _integers(live.get("basisTable"), 64, "integral-basis table")
    from .field3_relation_replay_map import replay_field3_principal_relations

    replay = replay_field3_principal_relations(
        owners, basis_table, verify_principal_relations=True
    )
    records = [value for row in replay["rows"] for value in row]
    generators = [
        value for column in replay["principal_generators"] for value in column
    ]
    packet_ideals = [value for ideal in replay["factor_base"] for value in ideal]
    packet_norms = _integers(owners.get("packetNorms"), 288, "packet norms")
    packet_ids = _integers(owners.get("packetIds"), 288, "packet ids")
    metadata = _integers(owners.get("relationMetadata"), 903, "relation metadata")
    outer_permutation = _integers(
        owners.get("outerPermutation"), 288, "outer permutation"
    )
    live_permutation = _integers(live.get("outerPerm"), 288, "live permutation")
    # Only the two selected class rows are a shared semantic boundary.  The
    # later unused suffix positions legitimately differ between the captures.
    if outer_permutation[:2] != live_permutation[:2]:
        raise Field3TerminalSourceFailure("selected relation suffix changed")
    exact = {
        "relationRecords": _strings(records),
        "principalGenerators": _strings(generators),
        "packetIdeals": _strings(packet_ideals),
        "packetNorms": _strings(packet_norms),
        "packetIds": _strings(packet_ids),
        "relationMetadata": _strings(metadata),
        "outerPermutation": _strings(outer_permutation),
        "basisTable": _strings(basis_table),
    }
    return {
        "schema": RELATION_SCHEMA,
        "field": FIELD,
        "runIdentity": RUN,
        "residentAuthoritySha256": authority_sha256,
        "liveClassJoinSha256": live_join_sha256,
        "shape": [288, 301],
        "degree": 4,
        "exactOwners": exact,
        "exactOwnersAreAuthority": True,
        "principalGeneratorsAreExact": True,
        "replay": {
            "principalRelationsExact": True,
            "relations": 301,
            "factorBaseSize": 288,
            "nonzeroRelationEntries": replay["nonzero_relation_entries"],
            "maximumRelationSupport": replay["maximum_relation_support"],
            "selectedPermutationPrefix": _strings(outer_permutation[:2]),
            "relationRecordsSha256": _array_sha256(records),
            "principalGeneratorsSha256": _array_sha256(generators),
            "relationMetadataSha256": _array_sha256(metadata),
        },
        "assumptions": {
            "pari2174Correspondence": True,
            "upstreamBoundsAssumed": True,
            "publicCompletion": False,
        },
    }


def _class_suffix_replay(
    full15: Mapping[str, Any], live: Mapping[str, Any]
) -> dict[str, list[int]]:
    """Rerun the exact two-column suffix using the high-precision `Ce`."""
    from .field3_live_class_suffix import pari_field3_live_class_suffix

    def z(length: int) -> list[int]:
        return [0] * length

    matrices = [z(4) for _ in range(10)]
    retained = [z(length) for length in (2, 2, 8, 32, 4, 4, 3, 2, 2, 2, 2)]
    generator_ideals, relation_exponents = z(32), z(4)
    offsets, kinds, nums, dens, exps = z(3), z(2), z(2), z(2), z(2)
    invariants, class_number, state = z(2), z(1), z(12)
    args = [
        _integers(full15.get("terminalH"), 4, "terminal H"),
        _integers(full15.get("packedCe"), 42, "packed Ce"),
        [int(value) for value in live.get("hnfState", [])],
        _integers(live.get("outerPerm"), 288, "live permutation"),
        int(live.get("packetCount", -1)),
        _integers(live.get("packetPrimes"), 288, "packet primes"),
        _integers(live.get("packetGenerators"), 1152, "packet generators"),
        _integers(live.get("packetInert"), 288, "packet inert flags"),
        _integers(live.get("basisTable"), 64, "basis table"),
        z(4),
        z(42),
        z(2),
        z(32),
        z(4),
        z(16),
        generator_ideals,
        z(32),
        relation_exponents,
        offsets,
        kinds,
        nums,
        dens,
        exps,
        z(16),
        z(16),
        z(52),
        z(20),
        z(4),
        *matrices,
        invariants,
        class_number,
        z(42),
        z(42),
        z(42),
        z(2),
        z(4),
        z(8),
        *[z(7) for _ in range(4)],
        z(9),
        z(3),
        z(42),
        z(42),
        z(42),
        z(42),
        z(42),
        z(42),
        z(8),
        *retained,
        state,
    ]
    suffix: Any = pari_field3_live_class_suffix
    if suffix(*args) != 0:
        raise Field3TerminalSourceFailure("high-precision class suffix replay failed")
    names = (
        "indices",
        "primes",
        "generators",
        "tau",
        "order",
        "m1",
        "offsets",
        "kinds",
        "numerators",
        "denominators",
        "exponents",
    )
    result = {name: values for name, values in zip(names, retained, strict=True)}
    result.update(
        {
            "generatorIdeals": generator_ideals,
            "relationExponents": relation_exponents,
            "invariants": invariants,
            "classNumber": class_number,
            "state": state,
            "uir": matrices[6],
            "computedM1": matrices[8],
        }
    )
    return result


def build_class_owner(
    full15: Mapping[str, Any],
    relation: Mapping[str, Any],
    authority: Mapping[str, Any],
    live_join: Mapping[str, Any],
    full15_sha256: str,
    relation_sha256: str,
    authority_sha256: str,
    live_join_sha256: str,
) -> dict[str, Any]:
    """Replay and serialize the authentic two-generator class suffix."""
    if authority_sha256 != AUTHORITY_SHA256 or live_join_sha256 != LIVE_JOIN_SHA256:
        raise Field3TerminalSourceFailure("frozen class source identity changed")
    _identity(full15, FULL15_SCHEMA, "full15 owner")
    _identity(relation, RELATION_SCHEMA, "relation owner")
    if relation.get("residentAuthoritySha256") != authority_sha256 or (
        relation.get("liveClassJoinSha256") != live_join_sha256
    ):
        raise Field3TerminalSourceFailure("relation ancestry changed")
    expected_relation = build_relation_owner(
        authority, live_join, authority_sha256, live_join_sha256
    )
    if relation != expected_relation:
        raise Field3TerminalSourceFailure("relation owner failed independent replay")
    if (
        full15.get("authorityOwnerSha256") != authority_sha256
        or full15.get("transformShape") != [301, 15]
        or full15.get("terminalShape") != [3, 15]
        or full15.get("unitColumns") != 13
        or full15.get("classColumns") != 2
        or full15.get("retentionState") != [0, 301, 15, 293, 3, 4515, 13, 2]
        or full15.get("imageState") != [0, 288, 301, 13, 2, 15, 3744, 576]
        or full15.get("terminalState") != [2, 15, 286, 0, 13, 3, 0, 301, 0]
    ):
        raise Field3TerminalSourceFailure("full15 authenticated ancestry changed")
    owners = _authority_owners(authority)
    live, expected = _live(live_join)
    terminal_h = _integers(full15.get("terminalH"), 4, "terminal H")
    terminal_permutation = _integers(
        full15.get("terminalPermutation"), 288, "terminal permutation"
    )
    live_permutation = _integers(live.get("outerPerm"), 288, "live permutation")
    authority_permutation = _integers(
        owners.get("outerPermutation"), 288, "authority permutation"
    )
    authority_h = _integers(
        authority.get("terminalHNF", [None])[0], 4, "authority terminal H"
    )
    live_h = _integers(live.get("h"), 4, "live terminal H")
    if terminal_h != authority_h or terminal_h != live_h:
        raise Field3TerminalSourceFailure("terminal H owners diverged")
    for authority_name, live_name, length in (
        ("packetPrimes", "packetPrimes", 288),
        ("packetGenerators", "packetGenerators", 1152),
        ("packetInert", "packetInert", 288),
    ):
        if _integers(owners.get(authority_name), length, authority_name) != _integers(
            live.get(live_name), length, live_name
        ):
            raise Field3TerminalSourceFailure(authority_name + " owners diverged")
    if terminal_permutation[:2] != live_permutation[:2] or (
        terminal_permutation[:2] != authority_permutation[:2]
    ):
        raise Field3TerminalSourceFailure("selected class prefix changed")
    if terminal_permutation[:2] != [11, 2]:
        raise Field3TerminalSourceFailure("unexpected selected class packets")
    if terminal_h[1] != 0 or terminal_h[2] != 0:
        raise Field3TerminalSourceFailure("terminal class presentation is not diagonal")
    transform = _integers(full15.get("transform"), 301 * 15, "full15 transform")
    packed_a = _integers(full15.get("packedA"), 273, "packed A")
    packed_ce = _integers(full15.get("packedCe"), 42, "packed Ce")
    if _integers(full15.get("packedTerminal"), 315, "packed terminal") != (
        packed_a + packed_ce
    ):
        raise Field3TerminalSourceFailure("full15 packed split changed")
    relation_exact = relation.get("exactOwners")
    if not isinstance(relation_exact, dict):
        raise Field3TerminalSourceFailure("relation exact owner changed")
    relation_records = _integers(
        relation_exact.get("relationRecords"), 288 * 301, "relation records"
    )
    from .field3_full_terminal_ancestry import (
        pari_field3_validate_full_terminal_image,
    )

    image_state = [77] * 8
    if pari_field3_validate_full_terminal_image(
        relation_records, transform, terminal_h, terminal_permutation, image_state
    ) != 0 or image_state != [0, 288, 301, 13, 2, 15, 3744, 576]:
        raise Field3TerminalSourceFailure("full15 exact relation image changed")
    replay = _class_suffix_replay(full15, live)
    retained = expected.get("retained")
    if not isinstance(retained, dict):
        raise Field3TerminalSourceFailure("retained class witness changed")
    for name in (
        "indices",
        "primes",
        "generators",
        "tau",
        "order",
        "m1",
        "offsets",
        "kinds",
        "numerators",
        "denominators",
        "exponents",
    ):
        expected_values = _integers(retained.get(name), len(replay[name]), name)
        if replay[name] != expected_values:
            raise Field3TerminalSourceFailure(name + " failed class replay")
    expected_m1 = _integers(retained.get("m1"), 4, "retained M1")
    if replay["uir"] != expected_m1 or replay["computedM1"] != expected_m1:
        raise Field3TerminalSourceFailure("Uir/M1 exact replay changed")
    if replay["generatorIdeals"] != _integers(
        expected.get("generatorIdeals"), 32, "generator ideals"
    ):
        raise Field3TerminalSourceFailure("generator ideals failed replay")
    if replay["relationExponents"] != _integers(
        expected.get("order"), 4, "order exponents"
    ):
        raise Field3TerminalSourceFailure("order exponents failed replay")
    if replay["state"] != _integers(expected.get("suffixState"), 12, "suffix state"):
        raise Field3TerminalSourceFailure("class suffix state failed replay")
    invariants = [terminal_h[0], terminal_h[3]]
    if replay["invariants"] != invariants or replay["classNumber"] != [
        invariants[0] * invariants[1]
    ]:
        raise Field3TerminalSourceFailure("Smith invariants failed replay")
    b = _integers(
        authority.get("terminalHNF", [None, None, None])[2], 572, "terminal B"
    )
    precision = int(full15.get("targetBits", 0))
    if precision != 153088:
        raise Field3TerminalSourceFailure("full15 precision identity changed")
    descriptors = []
    for index in range(2):
        descriptors.append(
            {
                "packetIndex": str(replay["indices"][index]),
                "prime": str(replay["primes"][index]),
                "generator": _strings(replay["generators"][4 * index : 4 * index + 4]),
                "tau": _strings(replay["tau"][16 * index : 16 * index + 16]),
            }
        )
    return {
        "schema": CLASS_SCHEMA,
        "field": FIELD,
        "runIdentity": RUN,
        "precision": precision,
        "fullTerminalOwnerSha256": full15_sha256,
        "relationAuthoritySha256": relation_sha256,
        "residentAuthoritySha256": authority_sha256,
        "liveClassJoinSha256": live_join_sha256,
        "B": _strings(b),
        "W": _strings(terminal_h),
        "packedC": _strings(packed_ce),
        "invariants": _strings(invariants),
        "classNumber": str(invariants[0] * invariants[1]),
        "Vbase": descriptors,
        "retainedWitness": {name: _strings(values) for name, values in replay.items()},
        "replay": {
            "smithExact": True,
            "descriptorReplay": True,
            "principalFactorsExact": True,
            "selectedPermutationPrefix": _strings(terminal_permutation[:2]),
            "wholePermutationCompared": False,
        },
        "assumptions": {
            "pari2174Correspondence": True,
            "upstreamBoundsAssumed": True,
            "publicCompletion": False,
        },
    }


def main(argv: Sequence[str]) -> None:
    if len(argv) < 2:
        raise Field3TerminalSourceFailure("missing operation")
    operation = argv[1]
    if operation == "relation" and len(argv) == 6:
        authority = _load(argv[2], argv[4], "authority owner")
        live = _load(argv[3], argv[5], "live class join")
        result = build_relation_owner(authority, live, argv[4], argv[5])
    elif operation == "class" and len(argv) == 10:
        full15 = _load(argv[2], argv[6], "full15 owner")
        relation = _load(argv[3], argv[7], "relation owner")
        authority = _load(argv[4], argv[8], "authority owner")
        live = _load(argv[5], argv[9], "live class join")
        result = build_class_owner(
            full15, relation, authority, live, argv[6], argv[7], argv[8], argv[9]
        )
    else:
        raise Field3TerminalSourceFailure("invalid terminal-source operation")
    json.dump(result, __import__("sys").stdout, separators=(",", ":"))
    print()


if __name__ == "__main__":
    import sys

    main(sys.argv)


__all__ = [
    "CLASS_SCHEMA",
    "Field3TerminalSourceFailure",
    "RELATION_SCHEMA",
    "build_class_owner",
    "build_relation_owner",
]
