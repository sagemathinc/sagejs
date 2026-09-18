"""Connected row-21 immediate-success honesty transaction.

This correctness-only root implements the no-automorphism, six-success path at
PARI 2.17.4 `buch2.c:4134--4140`.  It accepts authenticated prepared owners and
a same-run factor-base projection, computes every collector observation in
Sage, restores `KCZ`, and performs the caller's one-shot `KCZ2 = 0` update.

It deliberately does not implement automorphism or failed-probe retries.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from . import ball_volume, honesty_success, unreduced_ideal_collector

sys.set_int_max_str_digits(100_000)


SCHEMA = "sagejs.pari-class-group/row21-honesty-owner-v1"
ENVELOPE_SCHEMA = "sagejs.pari-class-group/row21-honesty-envelope-v1"
FACTOR_SCHEMA = "sagejs.pari-class-group/row21-honesty-factor-owner-v1"
PREPARED_SHA256 = "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f"


class Row21HonestyFailure(ValueError):
    """An owner, observation, or replay violated the bounded source cut."""


def _canonical(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _canonical(value[key]) for key in sorted(value)}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return [_canonical(entry) for entry in value]
    return value


def _bytes(value: Any) -> bytes:
    return json.dumps(
        _canonical(value), separators=(",", ":"), ensure_ascii=True
    ).encode()


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _integers(value: Any, name: str, length: int | None = None) -> list[int]:
    if not isinstance(value, list) or (length is not None and len(value) != length):
        raise Row21HonestyFailure(name + " has the wrong shape")
    answer = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row21HonestyFailure(name + " contains a non-integer")
        try:
            integer = int(entry)
        except (ValueError, OverflowError) as error:
            raise Row21HonestyFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise Row21HonestyFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _validate_factor(owner: Mapping[str, Any], owner_sha256: str) -> None:
    if owner.get("schema") != FACTOR_SCHEMA or _sha(_bytes(owner)) != owner_sha256:
        raise Row21HonestyFailure("custom factor-base authority changed")
    authority = owner.get("authority", {})
    bounds = owner.get("bounds", {})
    if authority.get("preparedSha256") != PREPARED_SHA256:
        raise Row21HonestyFailure("custom factor-base prepared authority changed")
    if bounds != {
        "C1": "5",
        "C2": "31",
        "KC": "6",
        "KCZ": "3",
        "KCZ2": "10",
        "nonidentityAutomorphisms": "0",
        "prodZ": "30",
    }:
        raise Row21HonestyFailure("custom honesty bounds changed")
    initial = owner.get("initialFactorBase", {})
    checking = owner.get("checkingFactorBase", {})
    if initial.get("rationalPrimes") != ["2", "3", "5"]:
        raise Row21HonestyFailure("initial custom factor groups changed")
    if checking.get("rationalPrimes") != [
        "2",
        "3",
        "5",
        "11",
        "13",
        "17",
        "19",
        "23",
        "29",
        "31",
    ]:
        raise Row21HonestyFailure("checking custom factor groups changed")
    if checking.get("probeNorms") != ["11", "11", "11", "13", "29", "29"]:
        raise Row21HonestyFailure("honesty probe norms changed")


def _collector_values(
    prepared: Mapping[str, Any], factor: Mapping[str, Any], probe: int
) -> dict[str, Any]:
    n = 5
    initial = factor["initialFactorBase"]
    checking = factor["checkingFactorBase"]
    descriptors = initial["descriptors"]
    if len(descriptors) != 6:
        raise Row21HonestyFailure("custom relation descriptor count changed")
    offsets = [-1] * 32
    counts = [0] * 32
    tau: list[int] = []
    es: list[int] = []
    fs: list[int] = []
    inert: list[int] = []
    relation_primes: list[int] = []
    cursor = 0
    for raw_prime in initial["rationalPrimes"]:
        prime = int(raw_prime)
        offsets[prime] = cursor
        while cursor < len(descriptors) and int(descriptors[cursor][0]) == prime:
            record = _integers(descriptors[cursor], "prime descriptor", 33)
            es.append(record[1])
            fs.append(record[2])
            generator = record[3:8]
            inert.append(int(all(value == 0 for value in generator)))
            column_major = record[8:33]
            tau.extend(
                column_major[column * n + row]
                for row in range(n)
                for column in range(n)
            )
            relation_primes.append(prime)
            cursor += 1
        counts[prime] = cursor - offsets[prime]
    if cursor != 6:
        raise Row21HonestyFailure("custom relation groups are incomplete")

    size = len(descriptors)
    capacity = 10 * (size + 2) + 50
    zero = lambda length: [0] * length
    values: dict[str, Any] = {
        "matrix": zero(3 * n * n),
        "ideal": zero(n * n),
        "n": n,
        "precision": 192,
        "scale": ball_volume.pari_small_norm_scale(n),
        "track_small": 0,
        "reduction": zero(3 * n * n),
        "vectors": zero(3 * n * n),
        "betas": zero(3 * n),
        "norms": zero(3 * n),
        "column": zero(3 * n),
        "float_q": [0.0] * ((n + 1) ** 2),
        "float_v": [0.0] * (n + 1),
        "bound": [0.0],
        "cache": zero(3),
        "a": zero(64),
        "b": zero(64),
        "p": zero(64),
        "q": zero(64),
        "stack": zero(128),
        "x": zero(n + 1),
        "y": [0.0] * (n + 1),
        "z": [0.0] * (n + 1),
        "inc": zero(n + 1),
        "state": zero(5),
        "cursor_output": zero(n + 1),
        "element": zero(n),
        "counters": zero(4),
        "admission_matrix_m": _integers(
            prepared["admission_matrix_m"], "admission matrix M", 25
        ),
        "admission_matrix_p": _integers(
            prepared["admission_matrix_p"], "admission matrix P", 25
        ),
        "admission_matrix_e": _integers(
            prepared["admission_matrix_e"], "admission matrix E", 25
        ),
        "admission_embedding_m": zero(n),
        "admission_embedding_p": zero(n),
        "admission_embedding_e": zero(n),
        "admission_real_count": int(prepared["admission_real_count"]),
        "admission_ideal_norm": int(checking["probeNorms"][probe]),
        "admission_ideal": _integers(checking["probeIdeals"][probe], "probe ideal", 25),
        "admission_mode": 2,
        "admission_factor_product": 30,
        "admission_primes": _integers(prepared["admission_primes"], "primes"),
        "admission_products": _integers(prepared["admission_products"], "products"),
        "admission_factorlimit": int(prepared["admission_factorlimit"]),
        "admission_prime_limit": int(prepared["admission_prime_limit"]),
        "admission_rational_factors": zero(16),
        "admission_rational_exponents": zero(16),
        "admission_prime_offsets": offsets,
        "admission_prime_counts": counts,
        "admission_group_tau": tau,
        "admission_group_e": es,
        "admission_group_f": fs,
        "admission_group_inert": inert,
        "admission_tau": zero(n * n),
        "admission_x": zero(n),
        "admission_y": zero(n),
        "admission_spare": zero(n),
        "admission_stack": zero(32),
        "admission_primitive": zero(n * n),
        "admission_columns": zero(n * n),
        "admission_values": zero(n),
        "admission_temporary": zero(n),
        "admission_indices": zero(128),
        "admission_exponents": zero(128),
        "diagnostic": zero(3),
        "nrelid": 0,
        "track_fact": 0,
        "jid": 0,
        "jid0": 0,
        "e0": 0,
        "subfactor": [],
        "extra": [],
        "extra_count": 0,
        "relation_primes": relation_primes,
        "ramification": list(es),
        "relation": zero(size),
        "relation_state": [0, capacity, size, 0, 0, 4],
        "relation_basis": zero(size * size),
        "relation_records": zero(capacity * size),
        "relation_hashes": zero(capacity),
        "relation_metadata": zero(capacity * 3),
        "relation_scratch": zero(size),
        "generators": zero(capacity * n),
        "progress": zero(4),
        "preparation_rounded_embedding": _integers(
            prepared["preparation_rounded_embedding"], "rounded embedding", 25
        ),
        "preparation_embedding": _integers(
            prepared["preparation_embedding"], "embedding", 75
        ),
    }
    special_lengths = {
        "diagnostic": 7,
        "rank_diagnostic": 3,
        "flags": 2,
        "selection": 5,
        "stages": 4,
        "temporary": 1,
        "state": 1,
        "r1": 12,
        "r2": 12,
        "r3": 12,
        "inverse": 12,
        "first": 12,
        "second": 12,
        "final": 12,
        "t1": 4,
        "t2": 4,
        "t3": 4,
        "integers": 4,
        "rounded": 4,
    }
    vector_names = {
        "y",
        "s",
        "exponents",
        "s_exponents",
        "alpha",
        "column_exponents",
        "float_scratch",
    }
    signature = inspect.signature(
        unreduced_ideal_collector.pari_collect_unreduced_ideal
    )
    for parameter in signature.parameters.values():
        name = parameter.name
        if name in values:
            continue
        short = name.removeprefix("preparation_")
        length = special_lengths.get(short, n if short in vector_names else n * n)
        annotation = str(parameter.annotation)
        values[name] = [0.0] * length if "float" in annotation else zero(length)
    if set(values) != set(signature.parameters):
        raise Row21HonestyFailure("collector owner vocabulary changed")
    return values


def _source_sha(module: Any) -> str:
    return _sha(Path(module.__file__).read_bytes())


def compute_owner(
    prepared: Mapping[str, Any],
    prepared_sha256: str,
    factor: Mapping[str, Any],
    factor_sha256: str,
) -> dict[str, Any]:
    """Compute the exact six-observation resident owner."""
    if prepared_sha256 != PREPARED_SHA256:
        raise Row21HonestyFailure("prepared authority changed")
    _validate_factor(factor, factor_sha256)
    checking = factor["checkingFactorBase"]
    outer = [int(value) for row in checking["outerSchedule"] for value in row]
    schedule = [int(value) for row in checking["probeSchedule"] for value in row]
    norms = _integers(checking["probeNorms"], "probe norms", 6)
    ideals = [
        value
        for ideal in checking["probeIdeals"]
        for value in _integers(ideal, "probe ideal", 25)
    ]
    state = [0] * honesty_success.STATE_LENGTH
    published = [0] * 25
    first_norm = honesty_success.pari_honesty_success_begin(
        5, 3, 10, 0, outer, schedule, norms, ideals, state, published
    )
    if first_norm != norms[0] or published != ideals[:25]:
        raise Row21HonestyFailure("first honesty probe publication changed")

    rows = []
    rng = list(range(1, 67))
    rng_before = list(rng)
    resumes = []
    for probe in range(6):
        values = _collector_values(prepared, factor, probe)
        if (
            published != values["admission_ideal"]
            or state[19] != values["admission_ideal_norm"]
        ):
            raise Row21HonestyFailure("scheduler and collector owners diverged")
        protected = {
            name: _bytes(values[name])
            for name in (
                "admission_ideal",
                "preparation_rounded_embedding",
                "preparation_embedding",
                "admission_matrix_m",
                "admission_matrix_p",
                "admission_matrix_e",
                "admission_group_tau",
                "admission_group_e",
                "admission_group_f",
                "admission_group_inert",
            )
        }
        collector = unreduced_ideal_collector.pari_collect_unreduced_ideal
        status = collector(
            *(values[name] for name in inspect.signature(collector).parameters)
        )
        if status not in (0, 1):
            raise Row21HonestyFailure("collector returned a non-Boolean status")
        if any(_bytes(values[name]) != before for name, before in protected.items()):
            raise Row21HonestyFailure("collector mutated a prepared source owner")
        resume = honesty_success.pari_honesty_success_resume(
            status,
            outer,
            schedule,
            norms,
            ideals,
            rng,
            state,
            [0] * 25,
            published,
        )
        resumes.append(resume)
        count = values["counters"][2]
        rows.append(
            {
                "probe": probe,
                "schedule": checking["probeSchedule"][probe],
                "norm": checking["probeNorms"][probe],
                "idealSha256": _sha(_bytes(checking["probeIdeals"][probe])),
                "status": status,
                "candidateAttempts": values["counters"][0],
                "factorIndices": values["admission_indices"][:count],
                "factorExponents": values["admission_exponents"][:count],
                "element": values["element"],
                "preparationRankDiagnostic": values["preparation_rank_diagnostic"],
                "sourceOwnersUnchanged": True,
            }
        )
    if rng != rng_before:
        raise Row21HonestyFailure("immediate-success path consumed RNG")
    if [row["status"] for row in rows] != [1] * 6:
        raise Row21HonestyFailure("selected immediate-success path did not succeed")
    if resumes != [1, 1, 1, 1, 1, 0]:
        raise Row21HonestyFailure("successful scheduler continuation changed")
    if state[0] != 3 or state[6] != 3 or state[8] != 1 or state[9] != 1:
        raise Row21HonestyFailure("KCZ restoration changed")
    if state[2] != 10 or state[4] != 6 or state[5] != 6 or state[17] != 0:
        raise Row21HonestyFailure("successful scheduler terminal state changed")

    # `buch2.c:4134--4140`: after successful `be_honest`, the caller makes
    # honesty one-shot by clearing KCZ2 before proceeding to units.
    kcz2_before = state[2]
    kcz2_after = 0
    kcz2_reset_count = 1
    transcript = {
        "rows": rows,
        "schedulerResumes": resumes,
        "schedulerState": list(state),
        "driverCallsite": {
            "source": "pari-2.17.4/src/basemath/buch2.c:4134-4140",
            "restartRequired": False,
            "kcz2Before": kcz2_before,
            "kcz2After": kcz2_after,
            "kcz2ResetCount": kcz2_reset_count,
            "nextStage": "unit-reconstruction",
        },
        "rngStartSha256": _sha(_bytes(rng_before)),
        "rngEndSha256": _sha(_bytes(rng)),
        "rngUnchanged": True,
        "acceptedPariStatusAsRuntimeInput": False,
    }
    transcript["sha256"] = _sha(_bytes(transcript))
    payload = {
        "schema": SCHEMA,
        "authority": {
            "preparedSha256": prepared_sha256,
            "customFactorOwnerSha256": factor_sha256,
            "residentSourceSha256": _sha(Path(__file__).read_bytes()),
            "collectorSourceSha256": _source_sha(unreduced_ideal_collector),
            "schedulerSourceSha256": _source_sha(honesty_success),
        },
        "field": {
            "id": "5.3.1009349859375.3",
            "polynomial": ["36", "930", "-305", "-90", "0", "1"],
        },
        "bounds": {"C1": "5", "C2": "31", "KCZ": "3", "KCZ2": "10"},
        "outcome": {
            "kind": "selected-no-automorphism-immediate-success",
            "success": True,
            "probes": 6,
            "kczIncrements": 3,
            "kczRestorations": 1,
            "finalKCZ": 3,
            "finalKCZ2": 0,
            "publicationBeforeUnitReconstruction": True,
        },
        "scope": {
            "correctnessOnly": True,
            "timingClaim": False,
            "generalAutomorphisms": False,
            "failedProbeRetries": False,
        },
        "transcript": transcript,
    }
    return {
        "schema": ENVELOPE_SCHEMA,
        "payload": payload,
        "payloadSha256": _sha(_bytes(payload)),
    }


def cold_replay(
    candidate: Mapping[str, Any],
    prepared: Mapping[str, Any],
    prepared_sha256: str,
    factor: Mapping[str, Any],
    factor_sha256: str,
) -> dict[str, Any]:
    """Recompute the live graph and require byte-identical canonical output."""
    if candidate.get("schema") != ENVELOPE_SCHEMA:
        raise Row21HonestyFailure("honesty envelope schema changed")
    payload = candidate.get("payload")
    if candidate.get("payloadSha256") != _sha(_bytes(payload)):
        raise Row21HonestyFailure("honesty payload digest changed")
    expected = compute_owner(prepared, prepared_sha256, factor, factor_sha256)
    if _bytes(candidate) != _bytes(expected):
        raise Row21HonestyFailure("honesty cold replay diverged")
    return expected


__all__ = [
    "ENVELOPE_SCHEMA",
    "PREPARED_SHA256",
    "Row21HonestyFailure",
    "cold_replay",
    "compute_owner",
]


def _main() -> None:
    request = json.load(sys.stdin)
    operation = request.get("operation")
    arguments = (
        request["prepared"],
        request["preparedSha256"],
        request["factorOwner"],
        request["factorOwnerSha256"],
    )
    if operation == "compute":
        result: Any = compute_owner(*arguments)
    elif operation == "replay-many":
        accepted = cold_replay(request["candidate"], *arguments)
        rejected = []
        for mutation in request["mutations"]:
            mutation_arguments = (
                mutation.get("prepared", request["prepared"]),
                mutation.get("preparedSha256", request["preparedSha256"]),
                mutation.get("factorOwner", request["factorOwner"]),
                mutation.get("factorOwnerSha256", request["factorOwnerSha256"]),
            )
            try:
                cold_replay(mutation["candidate"], *mutation_arguments)
            except Row21HonestyFailure as error:
                rejected.append({"name": mutation["name"], "error": str(error)})
            else:
                raise AssertionError(
                    "honesty mutation was accepted: " + mutation["name"]
                )
        result = {
            "acceptedPayloadSha256": accepted["payloadSha256"],
            "mutationsRejected": rejected,
        }
    else:
        raise Row21HonestyFailure("unknown row21 honesty root operation")
    sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    _main()
