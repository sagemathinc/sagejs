# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

"""Qualification-only bridge from the Rust JSON query to exact Sage.js replay."""


def replay_public_arbitrary_ideal_query_receipt(context, ideal, polynomial, receipt):
    """Validate a Rust native/Wasm envelope, then invoke the exact consumer."""
    keys = {
        "certificate",
        "completion",
        "outcome",
        "polynomialAscending",
        "queriedIdealIntegralBasisRows",
        "schema",
    }
    if not isinstance(receipt, dict) or set(receipt) != keys:
        raise ValueError(
            "public arbitrary-ideal query receipt has an unsupported schema"
        )
    if (
        receipt["schema"]
        != "sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1"
        or receipt["outcome"] != "complete-conditional-grh-ideal-class"
        or receipt["polynomialAscending"] != polynomial
    ):
        raise ValueError("public arbitrary-ideal query authority mismatch")
    completion = receipt["completion"]
    if (
        not isinstance(completion, dict)
        or completion.get("schema")
        != "sagejs.rust-class-group/public-cubic-e2e-receipt-v2"
        or completion.get("outcome") != "complete-conditional-grh"
        or completion.get("publicComplete") is not True
        or completion.get("usesPariInput") is not False
        or completion.get("usesPreparedFixture") is not False
        or completion.get("usesFieldAnswersAsInput") is not False
    ):
        raise ValueError("public arbitrary-ideal completion is unsupported")
    evidence = completion.get("completion")
    if not isinstance(evidence, dict) or tuple(
        int(value) for value in evidence.get("invariantFactors", ())
    ) != tuple(context.invariants):
        raise ValueError("public arbitrary-ideal invariant mismatch")

    relative = ideal.basis_matrix() * ideal.ring()._basis_inverse_matrix()
    if any(value._denominator != 1 for row in relative.rows() for value in row):
        raise ValueError("the Rust arbitrary-ideal boundary requires an integral ideal")
    rows = [[str(value._numerator) for value in row] for row in relative.rows()]
    if receipt["queriedIdealIntegralBasisRows"] != rows:
        raise ValueError("public arbitrary-ideal input lattice mismatch")

    producer = receipt["certificate"]
    certificate_keys = {
        "classCoordinates",
        "cursorTrials",
        "factorBaseSize",
        "maximalOrderEvidence",
        "presentationZero",
        "primitiveCandidates",
        "principalElementIntegralBasisCoordinates",
        "quotientFactorBaseExponents",
        "smoothQuotientNorms",
    }
    if not isinstance(producer, dict) or set(producer) != certificate_keys:
        raise ValueError("public arbitrary-ideal certificate has an unsupported schema")
    for key in ("cursorTrials", "primitiveCandidates", "smoothQuotientNorms"):
        if (
            isinstance(producer[key], bool)
            or not isinstance(producer[key], int)
            or producer[key] < 0
        ):
            raise ValueError("public arbitrary-ideal query statistic is invalid")
    certificate = {
        "schema": "sagejs.rust-class-group/arbitrary-ideal-class-query-v1",
        "sourceInputId": context.producer_input_id,
        "preparedResultIdentity": context.prepared_result_identity,
        "compactCertificateIdentity": context.certificate_identity,
        "maximalOrderEvidence": producer["maximalOrderEvidence"],
        "factorBaseSize": producer["factorBaseSize"],
        "principalElementIntegralBasisCoordinates": producer[
            "principalElementIntegralBasisCoordinates"
        ],
        "quotientFactorBaseExponents": producer["quotientFactorBaseExponents"],
        "classCoordinates": producer["classCoordinates"],
        "presentationZero": producer["presentationZero"],
    }
    return context.replay_arbitrary_ideal_class_certificate(ideal, certificate)
