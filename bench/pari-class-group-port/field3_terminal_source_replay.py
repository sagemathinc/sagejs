"""Exact replay for the two field-3 terminal serialization boundaries.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This module does not infer a class-group answer from a digest.  It consumes the
retained exact owners, reruns the 301 principal-ideal equalities, and reruns the
two-column `class_group_gen` suffix before returning ordinary JSON data to the
transactional coordinator.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import os
import sys
from collections.abc import Mapping, Sequence
from typing import Any

sys.set_int_max_str_digits(0)


FIELD = "x^4-2000022*x-2000042"
RUN = "pari-2.17.4:nfinit192->nfnewprec153088:field3"
FULL15_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1"
RELATION_SCHEMA = "sagejs.pari-class-group/field3-full-owner-authority-v1"
CLASS_SCHEMA = "sagejs.pari-class-group/field3-live-class-suffix-owner-v1"
AUTHORITY_SHA256 = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c"
LIVE_JOIN_SHA256 = "b8df9b99acb501d8ea0faf3034c1059d451ffd84180735c89c982b0f014da814"
PROTOCOL_SHA256 = "892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72"


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


def _live(live_join: Mapping[str, Any]) -> dict[str, Any]:
    live = live_join.get("live")
    if not isinstance(live, dict):
        raise Field3TerminalSourceFailure("live class join changed")
    return live


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
    live = _live(live_join)
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


def _replay_terminal_b(
    protocol: Mapping[str, Any], authority_b: Sequence[int]
) -> list[int]:
    """Replay the authenticated `hnffinal` plus three `hnfadd` B stages."""
    from .field3_high_precision_hnf_transform import _protocol_arrays
    from .hnfadd import pari_hnfadd
    from .hnffinal import pari_hnffinal_nonempty

    p = _protocol_arrays(protocol)
    checkpoints = protocol.get("checkpointHashes")
    if not isinstance(checkpoints, Mapping):
        raise Field3TerminalSourceFailure("local HNF checkpoint owner changed")

    def z(length: int) -> list[int]:
        return [0] * length

    # B is independent of logarithm values.  One valid inexact real entry is
    # repeated solely to keep the generic log-transform dispatch on its real
    # branch while the exact H/D/B schedule is replayed.
    log_entry = [1, 1 << 63, 64, 0, 0, -1, 0]
    rows, columns, dep_rows, total, log_rows = 34, 41, 2, 293, 3
    lig, tail = rows + dep_rows, total - columns
    result_h = z(rows * rows)
    result_dep = z(dep_rows * rows)
    result_b = z(lig * (tail + rows))
    result_c = z(7 * log_rows * total)
    state = z(7)
    if pari_hnffinal_nonempty(
        p["initialFullH"],
        rows,
        columns,
        list(range(1, lig + 1)),
        p["initialFullDep"],
        dep_rows,
        p["initialTrailing"],
        total,
        log_entry * (log_rows * total),
        log_rows,
        z(rows * columns),
        z(columns * columns),
        z(columns * columns),
        z(columns + 1),
        z(11),
        z(dep_rows * columns),
        z(lig * tail),
        z(7 * log_rows * total),
        z(rows),
        z(lig),
        result_h,
        result_dep,
        result_b,
        result_c,
        state,
    ) != 0 or state != [4, 11, 282, 2, 7, 30, 0]:
        raise Field3TerminalSourceFailure("initial terminal-B replay failed")
    current_h = result_h[:16]
    current_dep = result_dep[:8]
    current_b = result_b[:1692]
    if _array_sha256(current_b) != checkpoints.get("initialB"):
        raise Field3TerminalSourceFailure("initial B checkpoint changed")

    metadata = p["appendMetadata"]
    current_columns = 293
    labels = ("random", "post", "terminal")
    expected_states = (
        [5, 12, 283, 0, 7, 1, 0, 295, 0],
        [5, 13, 283, 0, 8, 0, 0, 296, 0],
        [2, 15, 286, 0, 13, 3, 0, 301, 0],
    )
    for stage, (label, expected_state) in enumerate(
        zip(labels, expected_states, strict=True)
    ):
        at = 16 * stage
        old, new, old_h, old_b = metadata[at : at + 4]
        if old != current_columns:
            raise Field3TerminalSourceFailure("disconnected terminal-B schedule")
        permutation = p["appendPermutations"][
            metadata[at + 11] : metadata[at + 11] + 288
        ]
        explicit: dict[str, Any] = {
            "h": current_h,
            "h_rows": old_h,
            "dep": current_dep,
            "b": current_b,
            "b_columns": old_b,
            "logs": log_entry * (3 * old),
            "total_columns": old,
            "log_rows": 3,
            "perm": permutation,
            "rows": 288,
            "new_relations": p["appendRelations"][
                metadata[at + 13] : metadata[at + 13] + 288 * new
            ],
            "new_columns": new,
            "new_logs": log_entry * (3 * new),
        }
        capacity = max(
            8192, 288 * (old_h + new), 21 * (old + new), 288 * (old + new + 288)
        )
        outputs: dict[str, list[int]] = {}
        arguments: list[Any] = []
        for name in inspect.signature(pari_hnfadd).parameters:
            value = explicit.get(name)
            if value is None:
                value = z(capacity)
                outputs[name] = value
            arguments.append(value)
        if pari_hnfadd(*arguments) != 0:
            raise Field3TerminalSourceFailure(label + " terminal-B replay failed")
        replay_state = outputs["state"][:9]
        if replay_state != expected_state:
            raise Field3TerminalSourceFailure(label + " terminal-B state changed")
        current_h = outputs["result_h"][: replay_state[0] ** 2]
        current_dep = outputs["result_dep"][: replay_state[3] * replay_state[0]]
        current_b = outputs["result_b"][: (288 - replay_state[2]) * replay_state[2]]
        if _array_sha256(current_b) != checkpoints.get(label + "B"):
            raise Field3TerminalSourceFailure(label + " B checkpoint changed")
        current_columns += new
    expected = [int(value) for value in authority_b]
    if current_b != expected or len(current_b) != 2 * 286:
        raise Field3TerminalSourceFailure("terminal B diverged from resident authority")
    if any(value < 0 or value >= 2 for value in current_b):
        raise Field3TerminalSourceFailure("terminal B is not reduced modulo H")
    return current_b


def _class_suffix_replay(
    full15: Mapping[str, Any], live: Mapping[str, Any], owners: Mapping[str, Any]
) -> dict[str, list[int]]:
    """Rerun the suffix from derived antiuniformizers, never an answer fixture."""
    from .prime_descriptor import pari_prepared_prime_descriptor_suffix
    from .prime_ideal_hnf import pari_prime_ideal_hnf
    from .quartic_class_group_assembly import pari_mixed_quartic_class_group_assembly

    def z(length: int) -> list[int]:
        return [0] * length

    permutation = _integers(live.get("outerPerm"), 288, "live permutation")
    packet_primes = _integers(owners.get("packetPrimes"), 288, "packet primes")
    packet_generators = _integers(
        owners.get("packetGenerators"), 1152, "packet generators"
    )
    packet_inert = _integers(owners.get("packetInert"), 288, "packet inert flags")
    ramification = _integers(owners.get("ramification"), 288, "ramification")
    packet_ideals = _integers(owners.get("packetIdeals"), 4608, "packet ideals")
    table = _integers(live.get("basisTable"), 64, "basis table")
    indices = permutation[:2]
    primes: list[int] = []
    generators: list[int] = []
    antiuniformizers: list[int] = []
    tau: list[int] = []
    assembly_tau: list[int] = []
    for selected in indices:
        packet = selected - 1
        if packet < 0 or packet >= 288 or packet_inert[packet] != 0:
            raise Field3TerminalSourceFailure("invalid selected packet")
        if ramification[packet] != 1:
            raise Field3TerminalSourceFailure("unsupported ramified selected packet")
        prime = packet_primes[packet]
        generator = packet_generators[4 * packet : 4 * packet + 4]
        anti, descriptor_tau, descriptor_state = z(4), z(16), z(3)
        descriptor_tau_work = z(16)
        pari_prepared_prime_descriptor_suffix(
            table,
            generator,
            4,
            prime,
            0,
            z(44),
            z(4),
            z(4),
            descriptor_tau_work,
            z(4),
            z(4),
            z(4),
            z(1),
            anti,
            descriptor_tau,
            descriptor_state,
        )
        if descriptor_state[0] != 0 or descriptor_state[2] != 1:
            raise Field3TerminalSourceFailure("selected descriptor replay failed")
        reconstructed = z(16)
        pari_prime_ideal_hnf(
            table,
            generator,
            4,
            prime,
            0,
            z(16),
            z(16),
            z(4),
            reconstructed,
        )
        if reconstructed != packet_ideals[16 * packet : 16 * packet + 16]:
            raise Field3TerminalSourceFailure("selected packet ideal replay failed")
        primes.append(prime)
        generators.extend(generator)
        antiuniformizers.extend(anti)
        tau.extend(descriptor_tau)
        assembly_tau.extend(descriptor_tau_work)

    matrices = [z(4) for _ in range(10)]
    generator_ideals, generated_ideals, relation_exponents = z(32), z(32), z(4)
    offsets, kinds, nums, dens, exps = z(3), z(2), z(2), z(2), z(2)
    invariants, class_number = z(2), z(1)
    assembly: Any = pari_mixed_quartic_class_group_assembly
    status = assembly(
        _integers(full15.get("terminalH"), 4, "terminal H"),
        _integers(full15.get("packedCe"), 42, "packed Ce"),
        primes,
        assembly_tau,
        2,
        2,
        generator_ideals,
        generated_ideals,
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
    )
    if status != 0:
        raise Field3TerminalSourceFailure("high-precision class suffix replay failed")
    state = [
        0,
        2,
        int(live.get("hnfState", [0] * 8)[7]),
        *indices,
        32,
        4,
        offsets[2],
        class_number[0],
        2,
        2,
        63,
    ]
    return {
        "indices": indices,
        "primes": primes,
        "generators": generators,
        "antiuniformizers": antiuniformizers,
        "tau": tau,
        "order": relation_exponents,
        "m1": matrices[8],
        "offsets": offsets,
        "kinds": kinds,
        "numerators": nums,
        "denominators": dens,
        "exponents": exps,
        "generatorIdeals": generator_ideals,
        "generatedIdeals": generated_ideals,
        "relationExponents": relation_exponents,
        "invariants": invariants,
        "classNumber": class_number,
        "state": state,
        "uir": matrices[6],
        "computedM1": matrices[8],
    }


def build_class_owner(
    full15: Mapping[str, Any],
    relation: Mapping[str, Any],
    authority: Mapping[str, Any],
    live_join: Mapping[str, Any],
    raw_owner: Mapping[str, Any],
    protocol_owner: Mapping[str, Any],
    full15_sha256: str,
    relation_sha256: str,
    authority_sha256: str,
    live_join_sha256: str,
    raw_owner_sha256: str,
    protocol_owner_sha256: str,
) -> dict[str, Any]:
    """Replay and serialize the authentic two-generator class suffix."""
    if (
        authority_sha256 != AUTHORITY_SHA256
        or live_join_sha256 != LIVE_JOIN_SHA256
        or protocol_owner_sha256 != PROTOCOL_SHA256
    ):
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
    from .field3_full_terminal_ancestry import transform_authenticated_owners

    replayed_full15 = transform_authenticated_owners(
        raw_owner, protocol_owner, authority
    )
    replayed_full15.update(
        {
            "rawOwnerSha256": raw_owner_sha256,
            "protocolOwnerSha256": protocol_owner_sha256,
            "authorityOwnerSha256": authority_sha256,
        }
    )
    if full15 != replayed_full15:
        raise Field3TerminalSourceFailure("full15 raw/protocol replay changed")
    owners = _authority_owners(authority)
    live = _live(live_join)
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
    selected_count = len(terminal_h) // 2
    if (
        selected_count != 2
        or terminal_permutation[:selected_count] != live_permutation[:selected_count]
        or terminal_permutation[:selected_count]
        != authority_permutation[:selected_count]
    ):
        raise Field3TerminalSourceFailure("selected class prefix changed")
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
    replay = _class_suffix_replay(full15, live, owners)
    if replay["indices"] != terminal_permutation[:selected_count]:
        raise Field3TerminalSourceFailure("derived suffix selection changed")
    if replay["uir"] != replay["m1"] or replay["computedM1"] != replay["m1"]:
        raise Field3TerminalSourceFailure("Uir/M1 exact replay changed")
    invariants = [terminal_h[0], terminal_h[3]]
    if replay["invariants"] != invariants or replay["classNumber"] != [
        invariants[0] * invariants[1]
    ]:
        raise Field3TerminalSourceFailure("Smith invariants failed replay")
    authority_b = _integers(
        authority.get("terminalHNF", [None, None, None])[2], 572, "terminal B"
    )
    b = _replay_terminal_b(protocol_owner, authority_b)

    # Independently reconnect descriptors, integral inverse ideals, retained
    # scalar factors, Smith order rows, and the full relation quotient.
    from .field3_relation_replay_map import replay_field3_principal_relations
    from .quartic_signed_genback import pari_quartic_ideal_hnf_inverse_scaled

    relation_replay = replay_field3_principal_relations(
        owners, _integers(live.get("basisTable"), 64, "basis table")
    )
    if (
        replay["offsets"] != [0, 1, 2]
        or replay["kinds"] != [0, 0]
        or replay["numerators"] != [1, 1]
        or replay["denominators"] != replay["primes"]
        or replay["exponents"] != [1, 1]
    ):
        raise Field3TerminalSourceFailure("derived principal factors changed")
    if replay["order"] != replay["relationExponents"]:
        raise Field3TerminalSourceFailure("retained order rows changed")
    table = relation_replay["basis_table"]
    from .field3_relation_replay_map import _principal_hnf, _quartic_product

    for generator in range(selected_count):
        selected = replay["indices"][generator] - 1
        packet = relation_replay["factor_base"][selected]
        generated = tuple(
            replay["generatorIdeals"][16 * generator : 16 * generator + 16]
        )
        inverse_scaled = [0] * 16
        pari_quartic_ideal_hnf_inverse_scaled(
            list(packet),
            list(table),
            [0] * 16,
            [0] * 4,
            [0] * 4,
            [0] * 52,
            [0] * 20,
            [0] * 4,
            inverse_scaled,
        )
        if generated != tuple(inverse_scaled):
            raise Field3TerminalSourceFailure("generated ideal is not p*P^-1")
        prime = replay["primes"][generator]
        principal_p = _principal_hnf((prime, 0, 0, 0), table)
        if _quartic_product(packet, generated, table) != principal_p:
            raise Field3TerminalSourceFailure("P*(p*P^-1) is not (p)")
        packet_square = _quartic_product(packet, packet, table)
        generated_square = _quartic_product(generated, generated, table)
        if _quartic_product(packet_square, generated_square, table) != _principal_hnf(
            (prime * prime, 0, 0, 0), table
        ):
            raise Field3TerminalSourceFailure("generator order ideal replay failed")
        # The independently replayed terminal presentation is diagonal H.
        # Thus e_j is not in H Z^2 while 2e_j is, proving exact order two
        # without repeating the already-authenticated 288-dimensional HNF.
        if terminal_h[generator * 2 + generator] != 2:
            raise Field3TerminalSourceFailure("selected ideal lost exact order two")
    precision = int(full15.get("targetBits", 0))
    if precision != 153088:
        raise Field3TerminalSourceFailure("full15 precision identity changed")
    descriptors = []
    order_factorback = []
    unit_columns = int(full15.get("unitColumns", -1))
    for index in range(2):
        descriptors.append(
            {
                "packetIndex": str(replay["indices"][index]),
                "prime": str(replay["primes"][index]),
                "generator": _strings(replay["generators"][4 * index : 4 * index + 4]),
                "antiuniformizer": _strings(
                    replay["antiuniformizers"][4 * index : 4 * index + 4]
                ),
                "tau": _strings(replay["tau"][16 * index : 16 * index + 16]),
            }
        )
        order_factorback.append(
            {
                "packetIndex": str(replay["indices"][index]),
                "packetExponent": str(invariants[index]),
                "relationExponents": _strings(
                    transform[
                        (unit_columns + index) * 301 : (unit_columns + index + 1) * 301
                    ]
                ),
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
        "rawOwnerSha256": raw_owner_sha256,
        "protocolOwnerSha256": protocol_owner_sha256,
        "B": _strings(b),
        "W": _strings(terminal_h),
        "packedC": _strings(packed_ce),
        "invariants": _strings(invariants),
        "classNumber": str(invariants[0] * invariants[1]),
        "Vbase": descriptors,
        "orderPrincipalFactorback": order_factorback,
        "retainedWitness": {name: _strings(values) for name, values in replay.items()},
        "replay": {
            "smithExact": True,
            "descriptorReplay": True,
            "principalFactorsExact": True,
            "selectedPermutationPrefix": _strings(terminal_permutation[:2]),
            "wholePermutationCompared": False,
            "terminalBExact": True,
            "selectedIdealsExact": True,
            "orderPrincipalIdealsExact": True,
        },
        "BDefinition": {
            "layout": "column-major 2x286 reduced trailing block",
            "equation": "C_B[j] = g_perm[2+j] + sum_i B[i,j]*g_perm[i]",
            "checkpointSha256": _array_sha256(b),
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
    elif operation == "class" and len(argv) == 14:
        full15 = _load(argv[2], argv[8], "full15 owner")
        relation = _load(argv[3], argv[9], "relation owner")
        authority = _load(argv[4], argv[10], "authority owner")
        live = _load(argv[5], argv[11], "live class join")
        raw = _load(argv[6], argv[12], "raw logarithm owner")
        protocol = _load(argv[7], argv[13], "local HNF protocol owner")
        result = build_class_owner(
            full15,
            relation,
            authority,
            live,
            raw,
            protocol,
            argv[8],
            argv[9],
            argv[10],
            argv[11],
            argv[12],
            argv[13],
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
