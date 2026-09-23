"""Authenticated panel-row-8 matched flag-zero `getfu` attempt.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.

This cut consumes the independently computed C5 `A` and the authenticated
prepared-number-field embedding and multiplication table.  It executes the
ordinary translated mixed-quartic `getfu` graph through exponential
evaluation, the real/imaginary solve, and integer rounding.  At the frozen
192-bit precision the authentic result is `PRECI`; no unit is published.
"""

from collections.abc import Mapping, Sequence
import hashlib
import re
from typing import Any

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .field3_mixed_unit_suffix import pari_field3_prepare_getfu
from .getfu_mixed_quartic import pari_getfu_mixed_quartic


C5_SCHEMA = "sagejs.pari-class-group/panel8-c5-unit-lattice-cleanarch-v2"
ACCEPTED_SCHEMA = "sagejs.pari-class-group/panel8-accepted-retry-owner-v1"
PREPARED_SCHEMA = "sagejs.pari-class-group/panel8-c6-prepared-input-v1"
OUTPUT_SCHEMA = "sagejs.pari-class-group/c6-getfu-not-given-v1"
C5_SHA256 = "f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21"
ACCEPTED_SHA256 = "b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591"
W0_SHA256 = "4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1"
PREPARED_AUTHORITY_SHA256 = (
    "f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01"
)
EXPECTED_STATE = [3, 15, -185, 0, 69863, 0, 0, 1]
EXPECTED_TRACE_SHA256 = {
    "archReal": "e2a550f6fdce9f1fb606277a13dd94bcc8ea5b802f5312f4443496e0e9b04bc4",
    "archImag": "a3fed3a2a4ff5599e53671161a9122eeddde4615873ec80ee73460716fcad974",
    "cleanReal": "f0c7d3eefef660f9aeb299f330f2ba922d57cc3a7fcc7800f73d81ac575019c5",
    "cleanImag": "8bdc5eaabb3e7fea48b80c5d2b4bab3169613532f09c1892cbf8212f951c98fa",
    "solved": "46e34ba564f6d61eea5b45d4c44c7fc6091d120e408a6467615e940efedfb1cc",
    "rounded": "d867a2ade06e649c3f53a11634fe5f3b4b1e72707de8831dc10414d444964d10",
}
POISON = 31337


@native
def pari_panel8_c6_getfu(
    clean_a: IntegerBuffer,
    getfu_factor: IntegerBuffer,
    expected_a: IntegerBuffer,
    embedding_real: IntegerBuffer,
    embedding_imag: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    precision: int,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    factored_clean: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
    exponential_real: IntegerBuffer,
    exponential_imag: IntegerBuffer,
    split_matrix: IntegerBuffer,
    split_rhs: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    candidate_units: IntegerBuffer,
    normalized_factor: IntegerBuffer,
    output_units: IntegerBuffer,
    output_logs_real: IntegerBuffer,
    output_logs_imag: IntegerBuffer,
    output_factor: IntegerBuffer,
    state: Int64Buffer,
    pivots: Int64Buffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    agm_a: IntegerBuffer,
    agm_b: IntegerBuffer,
    agm_p: IntegerBuffer,
    agm_q: IntegerBuffer,
    agm_stack: IntegerBuffer,
) -> int:
    """Execute the exact matched C6 attempt and fail closed off its trace."""

    if precision != 192:
        raise ValueError("panel-8 C6 requires 192-bit precision")
    status = pari_field3_prepare_getfu(
        clean_a,
        getfu_factor,
        matep,
        arch,
        factored_clean,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    if status != 0:
        return 8
    for index in range(42):
        if factored_clean[index] != expected_a[index]:
            return 9
    status = pari_getfu_mixed_quartic(
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
        getfu_factor,
        embedding_real,
        embedding_imag,
        multiplication_tensor,
        precision,
        exponential_real,
        exponential_imag,
        split_matrix,
        split_rhs,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        multiplication,
        inverse,
        candidate_units,
        normalized_factor,
        output_units,
        output_logs_real,
        output_logs_imag,
        output_factor,
        state,
        pivots,
        exp_cache,
        pi_cache,
        agm_a,
        agm_b,
        agm_p,
        agm_q,
        agm_stack,
    )
    if status != 3:
        return 10
    expected = [3, 15, -185, 0, 69863, 0, 0, 1]
    for index in range(8):
        if state[index] != expected[index]:
            return 11
    return 3


class Panel8C6Failure(ValueError):
    """An authenticated panel-8 C6 input or arithmetic check failed."""


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Panel8C6Failure(name + " is not an object")
    return value


def _digest(value: Any, name: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        raise Panel8C6Failure(name + " is not a SHA-256 digest")
    return value


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Panel8C6Failure(name + " is not an integer vector")
    if len(value) != length:
        raise Panel8C6Failure(name + " has the wrong length")
    result = []
    for entry in value:
        if isinstance(entry, bool):
            raise Panel8C6Failure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise Panel8C6Failure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise Panel8C6Failure(name + " contains a noncanonical integer")
        result.append(integer)
    return result


def _cells_sha256(values: Sequence[int]) -> str:
    return hashlib.sha256(
        "\n".join(str(value) for value in values).encode()
    ).hexdigest()


def _workspace() -> dict[str, list[int]]:
    zero = lambda length: [0] * length
    return {
        "matep": zero(42),
        "arch": zero(42),
        "factored": zero(42),
        "arch_real": zero(18),
        "arch_imag": zero(18),
        "clean_real": zero(18),
        "clean_imag": zero(18),
        "exp_real": zero(18),
        "exp_imag": zero(18),
        "split_matrix": zero(48),
        "split_rhs": zero(24),
        "solve_work": zero(48),
        "solve_rhs": zero(24),
        "solved": zero(24),
        "rounded": zero(8),
        "multiplication": zero(16),
        "inverse": zero(4),
        "candidate_units": zero(8),
        "normalized_factor": zero(4),
        "output_units": [POISON] * 8,
        "output_logs_real": [POISON] * 18,
        "output_logs_imag": [POISON] * 18,
        "output_factor": [POISON] * 4,
        "state": zero(8),
        "pivots": zero(4),
        "exp_cache": zero(3),
        "pi_cache": zero(3),
        "agm_a": zero(512),
        "agm_b": zero(512),
        "agm_p": zero(512),
        "agm_q": zero(512),
        "agm_stack": zero(91),
    }


def compose_authenticated_panel8_c6(
    c5_owner: Mapping[str, Any],
    accepted_owner: Mapping[str, Any],
    prepared_input: Mapping[str, Any],
    c5_sha256: str,
    accepted_sha256: str,
    w0_sha256: str,
    source_sha256: str,
) -> dict[str, Any]:
    """Run C6 before recording the scalar-only pristine comparison."""

    c5 = _mapping(c5_owner, "C5 owner")
    accepted = _mapping(accepted_owner, "accepted owner")
    prepared = _mapping(prepared_input, "prepared C6 input")
    c5_sha256 = _digest(c5_sha256, "C5 digest")
    accepted_sha256 = _digest(accepted_sha256, "accepted digest")
    w0_sha256 = _digest(w0_sha256, "W0 digest")
    source_sha256 = _digest(source_sha256, "source digest")
    if c5_sha256 != C5_SHA256 or c5.get("schema") != C5_SCHEMA:
        raise Panel8C6Failure("wrong C5 authority")
    if accepted_sha256 != ACCEPTED_SHA256 or accepted.get("schema") != ACCEPTED_SCHEMA:
        raise Panel8C6Failure("wrong accepted-retry authority")
    if w0_sha256 != W0_SHA256 or c5.get("pristineW0Sha256") != w0_sha256:
        raise Panel8C6Failure("C5 is detached from W0")
    if c5.get("acceptedRetryOwnerSha256") != accepted_sha256:
        raise Panel8C6Failure("C5 is detached from the accepted owner")
    if c5.get("field") != accepted.get("field"):
        raise Panel8C6Failure("field identity changed across C5")
    if prepared.get("schema") != PREPARED_SCHEMA:
        raise Panel8C6Failure("wrong prepared C6 schema")
    if prepared.get("w0Sha256") != w0_sha256:
        raise Panel8C6Failure("prepared C6 input is detached from W0")
    if prepared.get("preparedAuthoritySha256") != PREPARED_AUTHORITY_SHA256:
        raise Panel8C6Failure("wrong prepared-number-field authority")
    if prepared.get("field") != c5.get("field"):
        raise Panel8C6Failure("prepared field identity changed")
    clean_a = _integers(c5.get("cleanA"), 42, "C5 clean A")
    factor = _integers(c5.get("getfuFactor"), 4, "C5 getfu factor")
    expected_a = _integers(
        c5.get("getfuCandidateA"), 42, "C5 private getfu candidate A"
    )
    embedding_real = _integers(prepared.get("embeddingReal"), 36, "embedding real")
    embedding_imag = _integers(prepared.get("embeddingImag"), 36, "embedding imaginary")
    tensor = _integers(
        prepared.get("multiplicationTensor"), 64, "multiplication tensor"
    )
    prepared_sha256 = {
        "embeddingRealSha256": _cells_sha256(embedding_real),
        "embeddingImagSha256": _cells_sha256(embedding_imag),
        "multiplicationTensorSha256": _cells_sha256(tensor),
    }
    if prepared_sha256 != {
        "embeddingRealSha256": "cd6364b9ab90d303d52b2819e70668c075570ad6a2a2e508b749f561c91d10e2",
        "embeddingImagSha256": "04c607a74eb4d5c2ce81da56b8d371378c232e7de6ea9a08e20c2a9309dd8a5c",
        "multiplicationTensorSha256": "289a16f6a80a279eaaacdd936109285a40dcb0eecc2add3f8c26655f4c4fe369",
    }:
        raise Panel8C6Failure("prepared getfu inputs changed")
    if c5.get("precision") != 192 or factor != [1, 0, -2, 1]:
        raise Panel8C6Failure("C5 precision or factor changed")

    work = _workspace()
    status = pari_panel8_c6_getfu(
        clean_a,
        factor,
        expected_a,
        embedding_real,
        embedding_imag,
        tensor,
        192,
        work["matep"],
        work["arch"],
        work["factored"],
        work["arch_real"],
        work["arch_imag"],
        work["clean_real"],
        work["clean_imag"],
        work["exp_real"],
        work["exp_imag"],
        work["split_matrix"],
        work["split_rhs"],
        work["solve_work"],
        work["solve_rhs"],
        work["solved"],
        work["rounded"],
        work["multiplication"],
        work["inverse"],
        work["candidate_units"],
        work["normalized_factor"],
        work["output_units"],
        work["output_logs_real"],
        work["output_logs_imag"],
        work["output_factor"],
        work["state"],
        work["pivots"],
        work["exp_cache"],
        work["pi_cache"],
        work["agm_a"],
        work["agm_b"],
        work["agm_p"],
        work["agm_q"],
        work["agm_stack"],
    )
    if status != 3 or work["state"] != EXPECTED_STATE:
        raise Panel8C6Failure("matched C6 trace changed: " + str(work["state"]))
    for name, length in (
        ("output_units", 8),
        ("output_logs_real", 18),
        ("output_logs_imag", 18),
        ("output_factor", 4),
    ):
        if work[name] != [POISON] * length:
            raise Panel8C6Failure("PRECI attempt published " + name)

    trace_sha256 = {
        "archReal": _cells_sha256(work["arch_real"]),
        "archImag": _cells_sha256(work["arch_imag"]),
        "cleanReal": _cells_sha256(work["clean_real"]),
        "cleanImag": _cells_sha256(work["clean_imag"]),
        "solved": _cells_sha256(work["solved"]),
        "rounded": _cells_sha256(work["rounded"]),
    }
    if trace_sha256 != EXPECTED_TRACE_SHA256:
        raise Panel8C6Failure("matched getfu arithmetic trace changed")

    # This scalar comparison is deliberately after the complete arithmetic
    # call.  No corridor array or answer-derived intermediate is an input.
    if work["state"][0] != 3 or work["state"][4] != 69863:
        raise Panel8C6Failure("pristine PRECI comparison changed")
    return {
        "schema": OUTPUT_SCHEMA,
        "field": dict(c5["field"]),
        "precision": 192,
        "status": "not_given",
        "reason": "PRECI",
        "matchedFlagZero": True,
        "exactUnitsPublished": False,
        "publicComplete": False,
        "correspondenceComplete": True,
        "materialization": "not_given(PRECI)",
        "state": list(work["state"]),
        "unitTransformShape": c5.get("uShape"),
        "unitTransform": list(c5.get("u")),
        "archimedeanUnitShape": c5.get("aShape"),
        "archimedeanUnits": list(c5.get("a")),
        "regulator": list(c5.get("regulator")),
        "ancestry": {
            "c5OwnerSha256": c5_sha256,
            "acceptedRetryOwnerSha256": accepted_sha256,
            "pristineW0Sha256": w0_sha256,
            "preparedAuthoritySha256": PREPARED_AUTHORITY_SHA256,
            "sourceSha256": source_sha256,
        },
        "preparedInputs": {
            **prepared_sha256,
            "w0FieldsConsumed": [
                "prepared.embeddingM",
                "prepared.multiplicationTensor",
            ],
        },
        "arithmeticTraceSha256": trace_sha256,
        "pristineComparison": {
            "source": "PARI-2.17.4-buch2.c:getfu/fupb_PRECI",
            "reason": 3,
            "roundingError": 69863,
            "comparedAfterComputation": True,
            "intermediateArraysConsumed": False,
        },
    }


__all__ = [
    "EXPECTED_STATE",
    "Panel8C6Failure",
    "compose_authenticated_panel8_c6",
    "pari_panel8_c6_getfu",
]
