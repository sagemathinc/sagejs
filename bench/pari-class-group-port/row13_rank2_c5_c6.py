"""Row-13 rank-two C5/C6 unit suffix.

The arithmetic is the field-neutral mixed-quartic implementation already
exercised by row 14.  Row 13 differs only in its authenticated owner shapes
and 256-bit precision.  The exact compact unit transform is retained even when
PARI's flag-zero `getfu` policy declines expanded units as `LARGE`.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from . import row14_rank2_c5_c6 as shared


OUTPUT_SCHEMA = "sagejs.pari-class-group/row13-rank2-c5-c6-v1"
ACCEPTED_SCHEMA = "sagejs.pari-class-group/row13-accepted-relation-owner-v1"
UNIT_COLUMNS = 7
PLACES = 3
PRECISION = 256


class Row13Rank2Failure(ValueError):
    """The row-13 compact unit suffix failed closed."""


def _embedding(prepared: Mapping[str, Any]) -> tuple[list[int], list[int]]:
    source = shared._integers(
        prepared.get("preparation_embedding"), 48, "prepared embedding"
    )
    real, imaginary = shared._zeros(36), shared._zeros(36)
    for basis in range(4):
        for place in range(3):
            source_at = 3 * (4 * place + basis)
            target = 3 * (4 * basis + place)
            real[target : target + 3] = source[source_at : source_at + 3]
            if place == 2:
                imaginary_at = 3 * (4 * 3 + basis)
                imaginary[target : target + 3] = source[imaginary_at : imaginary_at + 3]
            else:
                imaginary[target : target + 3] = [0, -1, 0]
    return real, imaginary


def _c6(c5: Mapping[str, Any], prepared: Mapping[str, Any]) -> dict[str, Any]:
    embedding_real, embedding_imag = _embedding(prepared)
    tensor = shared._integers(prepared.get("basis_table"), 64, "multiplication tensor")
    poison8, poison_real, poison_imag, poison4 = (
        [shared.POISON] * 8,
        [shared.POISON] * 18,
        [shared.POISON] * 18,
        [shared.POISON] * 4,
    )
    state = shared._zeros(8)
    work = {
        "exp_real": shared._zeros(18),
        "exp_imag": shared._zeros(18),
        "split_matrix": shared._zeros(48),
        "split_rhs": shared._zeros(24),
        "solve_work": shared._zeros(48),
        "solve_rhs": shared._zeros(24),
        "solved": shared._zeros(24),
        "rounded": shared._zeros(8),
        "multiplication": shared._zeros(16),
        "inverse": shared._zeros(4),
        "candidate_units": shared._zeros(8),
        "normalized_factor": shared._zeros(4),
    }
    status = shared.pari_getfu_mixed_quartic(
        list(c5["archReal"]),
        list(c5["archImag"]),
        list(c5["cleanReal"]),
        list(c5["cleanImag"]),
        list(c5["factor"]),
        embedding_real,
        embedding_imag,
        tensor,
        PRECISION,
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
        poison8,
        poison_real,
        poison_imag,
        poison4,
        state,
        shared._zeros(4),
        shared._zeros(3),
        shared._zeros(3),
        shared._zeros(512),
        shared._zeros(512),
        shared._zeros(512),
        shared._zeros(512),
        shared._zeros(91),
    )
    if (
        status != 2
        or state[0] != 2
        or state[1] <= 0
        or state[2:7] != [0, 0, 0, 0, 0]
        or state[7] != 1
    ):
        raise Row13Rank2Failure("row-13 getfu did not return LARGE: " + str(state))
    if (
        poison8 != [shared.POISON] * 8
        or poison_real != [shared.POISON] * 18
        or poison_imag != [shared.POISON] * 18
        or poison4 != [shared.POISON] * 4
    ):
        raise Row13Rank2Failure("LARGE getfu published an expanded output")
    return {
        "status": status,
        "state": state,
        "embeddingReal": embedding_real,
        "embeddingImag": embedding_imag,
        "tensor": tensor,
        **work,
    }


def compose_row13_rank2_c5_c6(
    accepted: Mapping[str, Any],
    post1006: Mapping[str, Any],
    metadata_receipt: Mapping[str, Any],
    ancestry: Mapping[str, Any],
) -> dict[str, Any]:
    """Compute the compact row-13 unit suffix without a frozen trace."""
    try:
        accepted = shared._mapping(accepted, "accepted owner")
        post1006 = shared._mapping(post1006, "post1006 output")
        metadata_receipt = shared._mapping(metadata_receipt, "metadata receipt")
        ancestry = shared._mapping(ancestry, "ancestry")
        if accepted.get("schema") != ACCEPTED_SCHEMA:
            raise Row13Rank2Failure("wrong accepted owner schema")
        accepted_sha256 = hashlib.sha256(
            json.dumps(accepted, separators=(",", ":")).encode()
        ).hexdigest()
        metadata_sha256 = metadata_receipt.get("metadataSha256")
        if (
            post1006.get("acceptedOwnerSha256") != accepted_sha256
            or post1006.get("metadataSha256") != metadata_sha256
            or post1006.get("status") != 0
        ):
            raise Row13Rank2Failure("post1006 output is detached")
        if post1006.get("terminalState") != [0, 0, 7, 0, 1, 1006, 0, 0, 2, 0]:
            raise Row13Rank2Failure("post1006 terminal state changed")
        metadata = shared._mapping(metadata_receipt.get("metadata"), "metadata")
        if (
            hashlib.sha256(
                json.dumps(metadata, separators=(",", ":")).encode()
            ).hexdigest()
            != metadata_sha256
        ):
            raise Row13Rank2Failure("metadata digest changed")
        final = shared._mapping(accepted.get("final"), "accepted final state")
        packed_a = shared._integers(final.get("c"), 21 * 1006, "accepted C")[:147]
        lattice = shared._integers(post1006.get("unitRelations"), 14, "unit relations")
        regulator = shared._integers(post1006.get("regulator"), 3, "regulator")
        if post1006.get("unitRelationsSha256") != shared._sha256_json(lattice):
            raise Row13Rank2Failure("unit relation digest changed")
        if (
            ancestry.get("acceptedOwnerSha256") != accepted_sha256
            or ancestry.get("metadataSha256") != metadata_sha256
        ):
            raise Row13Rank2Failure("unit ancestry changed")
        post_arithmetic = {
            "acceptedOwnerSha256": post1006.get("acceptedOwnerSha256"),
            "metadataSha256": post1006.get("metadataSha256"),
            "regulator": post1006.get("regulator"),
            "unitRelations": [str(value) for value in lattice],
            "unitRelationsSha256": post1006.get("unitRelationsSha256"),
            "terminalState": post1006.get("terminalState"),
        }
        expected_post_digest = hashlib.sha256(
            json.dumps(post_arithmetic, separators=(",", ":")).encode()
        ).hexdigest()
        if ancestry.get("post1006ArithmeticSha256") != expected_post_digest:
            raise Row13Rank2Failure("post1006 arithmetic ancestry changed")
        if (
            ancestry.get("sourceSha256")
            != hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        ):
            raise Row13Rank2Failure("unit source ancestry changed")

        # The shared routines parameterize their exact-real work by this module
        # constant.  Run them in an isolated coordinator process and restore the
        # original setting even on failure.
        saved_precision = shared.PRECISION
        shared.PRECISION = PRECISION
        try:
            c5 = shared._c5(packed_a, lattice, regulator)
            c6 = _c6(c5, shared._mapping(metadata.get("prepared"), "prepared"))
        finally:
            shared.PRECISION = saved_precision
    except shared.Row14Rank2Failure as error:
        raise Row13Rank2Failure(str(error).replace("row-14", "row-13")) from error

    compact = {
        "unitTransformShape": [7, 2],
        "unitTransform": [str(value) for value in c5["u"]],
        "archimedeanUnitShape": [3, 2],
        "archimedeanUnits": [str(value) for value in c5["a"]],
        "getfuFactorShape": [2, 2],
        "getfuFactor": [str(value) for value in c5["factor"]],
        "getfuCandidateA": [str(value) for value in c5["candidateA"]],
        "relationLatticeShape": [7, 2],
        "relationLattice": [str(value) for value in lattice],
        "regulator": [str(value) for value in regulator],
    }
    return {
        "schema": OUTPUT_SCHEMA,
        "field": {
            "polynomial": list(accepted.get("field", {}).get("polynomial", [])),
            "degree": 4,
            "signature": [2, 1],
            "unitRank": 2,
        },
        "precision": PRECISION,
        "status": "not_given",
        "reason": "LARGE",
        "materialization": "not_given(LARGE)",
        "matchedFlagZero": True,
        "exactUnitsPublished": False,
        "compactFactoredUnitsRetained": False,
        "correspondenceComplete": False,
        "compact": compact,
        "c5State": c5["state"],
        "c6State": c6["state"],
        "traceSha256": {
            name: shared._sha256_cells(c6[name])
            for name in ("solved", "rounded", "candidate_units")
        },
        "ancestry": dict(ancestry),
        "provenance": {
            "frozenW0RuntimeInput": False,
            "postcomputeDifferentialOnly": True,
        },
    }


__all__ = ["OUTPUT_SCHEMA", "Row13Rank2Failure", "compose_row13_rank2_c5_c6"]
