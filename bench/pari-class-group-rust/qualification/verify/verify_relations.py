#!/usr/bin/env python3
"""Verify Rust cubic relation witnesses with an independent PARI process.

The verifier consumes a neutral field input and an already-produced Rust result.
It never supplies class numbers, relations, prime ideals, or retry schedules to
the Rust process.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import sys
import time
from pathlib import Path
from typing import Any

from cypari2 import Pari


INPUT_SCHEMA = "sagejs.pari-class-group/rust-cubic-brute-force-input-v1"
RESULT_SCHEMA = "sagejs.pari-class-group/rust-cubic-brute-force-result-v1"
REPORT_SCHEMA = "sagejs.pari-class-group/rust-relation-verification-v1"


class VerificationError(RuntimeError):
    """Raised when a Rust witness disagrees with independent PARI arithmetic."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def _integers(value: Any, *, length: int, label: str) -> list[int]:
    _require(isinstance(value, list), f"{label} must be an array")
    _require(len(value) == length, f"{label} must have length {length}")
    _require(
        all(isinstance(entry, int) and not isinstance(entry, bool) for entry in value),
        f"{label} must contain only integers",
    )
    return value


def _sha256(document: dict[str, Any]) -> str:
    encoded = json.dumps(
        document, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()


def _polynomial(pari: Pari, coefficients: list[int]):
    x = pari("x")
    return sum(
        (
            pari(coefficient) * x**degree
            for degree, coefficient in enumerate(coefficients)
        ),
        pari(0),
    )


def _basis_polynomials(pari: Pari, entries: list[int]):
    x = pari("x")
    return [
        sum(
            (pari(entries[3 * row + degree]) * x**degree for degree in range(3)),
            pari(0),
        )
        for row in range(3)
    ]


def _element(pari: Pari, coordinates: list[int], basis: list[Any], polynomial: Any):
    representative = sum(
        (pari(coordinates[index]) * basis[index] for index in range(3)), pari(0)
    )
    return pari.Mod(representative, polynomial)


def _canonical_ideal(pari: Pari, nf: Any, ideal: Any) -> str:
    """Return PARI's canonical HNF as a stable key inside this process."""

    return str(pari.idealhnf(nf, ideal))


def _ideal_from_emitted_hnf(
    pari: Pari, nf: Any, polynomial: Any, basis: list[Any], flat_hnf: list[int]
):
    # Rust serializes a row-major matrix.  PARI ideal matrices use generators
    # as columns, so independently turn each emitted column into an element.
    columns = []
    for column in range(3):
        coordinates = [flat_hnf[3 * row + column] for row in range(3)]
        columns.append(_element(pari, coordinates, basis, polynomial))
    ideal = columns[0]
    for generator in columns[1:]:
        ideal = pari.idealadd(nf, ideal, generator)
    return pari.idealhnf(nf, ideal)


def _factorization_map(pari: Pari, nf: Any, element: Any) -> dict[str, int]:
    factorization = pari.idealfactor(nf, element)
    size = int(pari.matsize(factorization)[0])
    answer: dict[str, int] = {}
    for index in range(size):
        key = _canonical_ideal(pari, nf, factorization[0][index])
        exponent = int(factorization[1][index])
        answer[key] = answer.get(key, 0) + exponent
    return answer


def _pari_version(pari: Pari) -> str:
    return ".".join(str(int(part)) for part in pari("version()"))


def verify_documents(
    neutral_input: dict[str, Any],
    rust_result: dict[str, Any],
    *,
    required_pari_version: str | None = None,
) -> dict[str, Any]:
    """Verify all emitted prime ideals, witnesses, and relation exponents."""

    started = time.perf_counter_ns()
    _require(neutral_input.get("schema") == INPUT_SCHEMA, "unsupported input schema")
    _require(rust_result.get("schema") == RESULT_SCHEMA, "unsupported result schema")
    _require(
        rust_result.get("linksPari") is False,
        "Rust result must declare linksPari=false",
    )
    _require(
        rust_result.get("usesOracleAsInput") is False,
        "Rust result must declare usesOracleAsInput=false",
    )

    polynomial_coefficients = _integers(
        neutral_input.get("polynomialAscending"), length=4, label="input polynomial"
    )
    basis_entries = _integers(
        neutral_input.get("integralBasisRowMajor"), length=9, label="input basis"
    )
    _require(polynomial_coefficients[-1] == 1, "the defining cubic must be monic")
    _require(
        rust_result.get("polynomialAscending") == polynomial_coefficients,
        "result polynomial differs from neutral input",
    )
    _require(
        rust_result.get("integralBasisRowMajor") == basis_entries,
        "result integral basis differs from neutral input",
    )
    _require(
        rust_result.get("fieldId") == neutral_input.get("fieldId"),
        "result fieldId differs from neutral input",
    )

    witnesses = rust_result.get("witnesses")
    _require(
        isinstance(witnesses, dict),
        "result has no witnesses; set includeWitnesses=true",
    )
    factor_base_size = rust_result.get("factorBaseSize")
    relation_rows = rust_result.get("relationRows")
    _require(
        isinstance(factor_base_size, int) and factor_base_size > 0,
        "invalid factor-base size",
    )
    _require(
        isinstance(relation_rows, int) and relation_rows > 0,
        "invalid relation-row count",
    )
    prime_ideals = witnesses.get("primeIdeals")
    elements = witnesses.get("elements")
    relations = witnesses.get("relations")
    _require(isinstance(prime_ideals, list), "primeIdeals must be an array")
    _require(isinstance(elements, list), "elements must be an array")
    _require(isinstance(relations, list), "relations must be an array")
    _require(
        len(prime_ideals) == factor_base_size, "factor-base descriptor count mismatch"
    )
    _require(len(elements) == relation_rows, "witness element count mismatch")
    _require(
        len(relations) == relation_rows * factor_base_size,
        "flattened relation matrix has the wrong size",
    )

    pari = Pari()
    version = _pari_version(pari)
    if required_pari_version is not None:
        _require(
            version == required_pari_version,
            f"PARI {required_pari_version} required, but cypari2 links PARI {version}",
        )
    polynomial = _polynomial(pari, polynomial_coefficients)
    nf = pari.nfinit(polynomial)
    basis = _basis_polynomials(pari, basis_entries)

    factor_keys: list[str] = []
    factor_norms: list[int] = []
    for index, descriptor in enumerate(prime_ideals):
        _require(isinstance(descriptor, dict), f"prime ideal {index} is not an object")
        prime = descriptor.get("prime")
        ramification = descriptor.get("ramification")
        residue_degree = descriptor.get("residueDegree")
        norm = descriptor.get("norm")
        _require(
            all(
                isinstance(value, int) and not isinstance(value, bool) and value > 0
                for value in (prime, ramification, residue_degree, norm)
            ),
            f"prime ideal {index} has invalid scalar metadata",
        )
        generator = _integers(
            descriptor.get("generator"),
            length=3,
            label=f"prime ideal {index} generator",
        )
        emitted_hnf = _integers(
            descriptor.get("hnf"), length=9, label=f"prime ideal {index} HNF"
        )
        alpha = _element(pari, generator, basis, polynomial)
        generator_ideal = pari.idealadd(nf, prime, alpha)
        emitted_ideal = _ideal_from_emitted_hnf(
            pari, nf, polynomial, basis, emitted_hnf
        )
        key = _canonical_ideal(pari, nf, generator_ideal)
        _require(
            key == _canonical_ideal(pari, nf, emitted_ideal),
            f"prime ideal {index}: emitted HNF and (p, generator) define different ideals",
        )
        _require(
            int(pari.idealnorm(nf, generator_ideal)) == norm,
            f"prime ideal {index}: norm mismatch",
        )
        _require(norm == prime**residue_degree, f"prime ideal {index}: norm is not p^f")

        decomposition = pari.idealprimedec(nf, prime)
        matches = [
            candidate
            for candidate in decomposition
            if _canonical_ideal(pari, nf, candidate) == key
        ]
        _require(
            len(matches) == 1,
            f"prime ideal {index}: descriptor is not a unique prime above p",
        )
        _require(
            int(matches[0][2]) == ramification,
            f"prime ideal {index}: ramification mismatch",
        )
        _require(
            int(matches[0][3]) == residue_degree,
            f"prime ideal {index}: residue-degree mismatch",
        )
        factor_keys.append(key)
        factor_norms.append(norm)

    _require(
        len(set(factor_keys)) == factor_base_size,
        "factor base contains duplicate prime ideals",
    )
    factor_index = {key: index for index, key in enumerate(factor_keys)}

    for row_index, coordinates_value in enumerate(elements):
        coordinates = _integers(
            coordinates_value, length=3, label=f"relation {row_index} element"
        )
        element = _element(pari, coordinates, basis, polynomial)
        _require(element != 0, f"relation {row_index}: zero is not a relation witness")
        expected = relations[
            row_index * factor_base_size : (row_index + 1) * factor_base_size
        ]
        _require(
            all(
                isinstance(value, int) and not isinstance(value, bool) and value >= 0
                for value in expected
            ),
            f"relation {row_index}: expected valuations must be nonnegative integers",
        )
        factorization = _factorization_map(pari, nf, element)
        actual = [0] * factor_base_size
        for key, exponent in factorization.items():
            _require(
                key in factor_index,
                f"relation {row_index}: principal ideal has a prime factor outside the emitted factor base",
            )
            actual[factor_index[key]] = exponent
        _require(
            actual == expected,
            f"relation {row_index}: valuation row mismatch; expected {expected}, PARI computed {actual}",
        )
        norm_from_row = 1
        for factor_norm, exponent in zip(factor_norms, expected, strict=True):
            norm_from_row *= factor_norm**exponent
        _require(
            norm_from_row == abs(int(element.norm())),
            f"relation {row_index}: factor-base norm product differs from the element norm",
        )

    try:
        cypari_version = importlib.metadata.version("cypari2")
    except importlib.metadata.PackageNotFoundError:
        cypari_version = "unknown"
    return {
        "schema": REPORT_SCHEMA,
        "verified": True,
        "fieldId": rust_result["fieldId"],
        "neutralInputSha256": _sha256(neutral_input),
        "rustResultSha256": _sha256(rust_result),
        "factorBasePrimeIdealsVerified": factor_base_size,
        "relationRowsVerified": relation_rows,
        "oracle": {
            "engine": "cypari2/PARI",
            "cypari2Version": cypari_version,
            "linkedPariVersion": version,
            "boundary": "test-only replay of emitted prime-ideal descriptors and principal-ideal relation witnesses",
            "runtimeInputs": [],
            "qualificationReferenceVersion": "2.17.4",
        },
        "checks": [
            "neutral input agrees with Rust result metadata",
            "each emitted (p, generator) ideal equals its emitted HNF ideal",
            "each factor-base ideal occurs uniquely in PARI idealprimedec with matching e, f, and norm",
            "PARI idealfactor of every witnessed element equals the complete emitted valuation row",
            "every relation norm equals the product of prime-ideal norms to emitted valuations",
        ],
        "elapsedNanoseconds": time.perf_counter_ns() - started,
    }


def _read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise VerificationError(f"{path}: top-level JSON value must be an object")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", required=True, type=Path, help="neutral Rust input JSON"
    )
    parser.add_argument(
        "--result", required=True, type=Path, help="Rust result JSON with witnesses"
    )
    parser.add_argument(
        "--require-pari-version",
        help="fail unless cypari2 is linked to this exact PARI version (qualification uses 2.17.4)",
    )
    args = parser.parse_args(argv)
    try:
        report = verify_documents(
            _read_json(args.input),
            _read_json(args.result),
            required_pari_version=args.require_pari_version,
        )
    except (VerificationError, ValueError, TypeError) as error:
        print(f"verification failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
