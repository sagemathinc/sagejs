# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

"""Exact, incomplete replay of Rust compact class-group evidence."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Sequence

import sagejs as sage
from sagejs.number_fields.class_group_matrix import (
    RelationMatrixError,
    SparseRelationRow,
)
from sagejs.number_fields.compact_relation_presentation import (
    CompactRelationPresentation,
)
from sagejs.number_fields.rust_class_group_preparation import (
    _element_from_prepared_coordinates,
    _ideal_from_prepared_descriptor,
    _input_integer,
    _prepared_basis_elements,
    _prepared_input_matches_authoritative,
    _validate_prime_hnf_lattice,
    prepare_cubic_for_rust,
)

PREPARED_RESULT_SCHEMA = "sagejs.rust-class-group/prepared-cubic-class-unit-v2"
RELATION_LATTICE_SCHEMA = "sagejs.rust-class-group/prepared-cubic-relation-lattice-v1"
COMPACT_CERTIFICATE_SCHEMA = (
    "sagejs.rust-class-group/compact-presentation-certificate-v1"
)
ARBITRARY_IDEAL_QUERY_SCHEMA = "sagejs.rust-class-group/arbitrary-ideal-class-query-v1"
PUBLICATION_CANDIDATE_SCHEMA = (
    "sagejs.rust-class-group/public-cubic-publication-candidate-v2"
)
DIAGNOSTICS_SCHEMA = (
    "sagejs.rust-class-group/compact-presentation-adapter-diagnostics-v1"
)

# These are verifier-owned limits, not claims about producer resource use.
# Compact replay materializes a square `columns x columns` submatrix and uses
# exact fraction-free elimination.  These caps are local verifier policy, not
# producer resource claims.
_MAX_COLUMNS = 256
_MAX_SURPLUS = 64
_MAX_INVARIANTS = 1_024
_MAX_DENSE_CERTIFICATE_ENTRIES = 8_000_000
_MAX_DENSE_DETERMINANT_ENTRIES = 4_096
_MAX_DENSE_DETERMINANT_WORK = 262_144
_MAX_DEPENDENCY_MINOR_WITNESSES = 256
_MAX_DEPENDENCY_MINOR_DETERMINANT_WORK = 128
_MAX_EXACT_INTEGER_BITS = 4_096
_MAX_EXACT_DECIMAL_DIGITS = 1_234
_MAX_ARBITRARY_IDEAL_VALUATION = 256
_MAX_PUBLICATION_COLUMNS = 2_048
_MAX_PUBLICATION_RELATIONS = 2_112
_MAX_PUBLICATION_FACTOR_TERMS = 10_000_000
_MAX_ANALYTIC_INTEGER_BITS = 16_384
_MAX_ANALYTIC_DECIMAL_DIGITS = 5_000

_PREPARED_KEYS = {
    "analyticCompletion",
    "classMap",
    "inputId",
    "kernel",
    "mathematicalBoundary",
    "polynomialAscending",
    "presentationIndexEvidence",
    "qualificationStatus",
    "reconstructedUnitLattice",
    "relationCollectionProfile",
    "relationLatticeEvidence",
    "relations",
    "schema",
    "timingsNanoseconds",
    "usesClassGroupAnswersAsInput",
    "usesOracleAsInput",
}
_CERTIFICATE_KEYS = {
    "groupOrder",
    "invariantFactors",
    "latticeIndexEvidence",
    "modularClassMap",
    "qualificationStatus",
    "relationDependencies",
    "relationShape",
    "schema",
    "sourceInputId",
    "standardGeneratorLifts",
    "verified",
}
_VERIFIED_KEYS = {
    "classMapAnnihilatesEveryRelation",
    "dependencyCountEqualsRowsMinusColumns",
    "dependencyLatticeEqualsIntegralLeftKernel",
    "dependencyLatticeIsPrimitive",
    "dependencyRankEqualsRowsMinusColumns",
    "everyDependencyReplaysToZero",
    "fullRelationLatticeIndexEqualsGroupOrder",
    "generatorOrderWitnessesReplayExactly",
    "invariantProductEqualsClaimedClassNumber",
    "projectedDependencyIndexDividesSquareDeterminant",
    "standardGeneratorLiftsMapToCoordinateBasis",
}
_REMAINING_GAPS = (
    "rust-arbitrary-ideal-query-product-invocation",
    "units-torsion-regulator-and-saturation",
    "conditional-factor-base-and-completion-proof-replay",
    "request-and-resource-binding",
    "executable-artifact-identity",
)
_ACCEPTED_JOINS = (
    "canonical-field-to-prepared-input",
    "producer-polynomial-and-input-identity",
    "complete-relation-matrix-shape",
    "exact-compact-relation-lattice-index",
    "live-factor-base-primes-and-principal-relation-equalities",
    "standard-factor-base-coordinate-map",
    "standard-generator-lifts-and-order-combinations",
)


def _untyped(value: Any) -> Any:
    return value


def _closed(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise RelationMatrixError(label + " has an unsupported schema")
    return value


def _natural(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise RelationMatrixError(label + " is not a natural number")
    return value


def _positive_natural(value: Any, label: str) -> int:
    answer = _natural(value, label)
    if answer == 0:
        raise RelationMatrixError(label + " must be positive")
    if answer.bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    return answer


def _bounded_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise RelationMatrixError(label + " is not an exact integer")
    if abs(value).bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    return value


def _positive_decimal(value: Any, label: str) -> int:
    if (
        not isinstance(value, str)
        or not value
        or value[0] == "0"
        or len(value) > _MAX_EXACT_DECIMAL_DIGITS
        or any(character < "0" or character > "9" for character in value)
    ):
        raise RelationMatrixError(label + " is not a positive decimal")
    answer = int(value)
    if answer.bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    return answer


def _signed_decimal(value: Any, label: str, *, nonzero: bool = False) -> int:
    if not isinstance(value, str) or not value:
        raise RelationMatrixError(label + " is not a canonical decimal")
    digits = value[1:] if value.startswith("-") else value
    if (
        not digits
        or (len(digits) > 1 and digits[0] == "0")
        or len(digits) > _MAX_EXACT_DECIMAL_DIGITS
        or any(character < "0" or character > "9" for character in digits)
        or value == "-0"
    ):
        raise RelationMatrixError(label + " is not a canonical decimal")
    answer = int(value)
    if abs(answer).bit_length() > _MAX_EXACT_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the exact-integer bit limit")
    if nonzero and answer == 0:
        raise RelationMatrixError(label + " must be nonzero")
    return answer


def _analytic_decimal(value: Any, label: str) -> int:
    """Decode one canonical directed-rounding endpoint under its own cap."""
    if not isinstance(value, str) or not value:
        raise RelationMatrixError(label + " is not a canonical decimal")
    digits = value[1:] if value.startswith("-") else value
    if (
        not digits
        or (len(digits) > 1 and digits[0] == "0")
        or len(digits) > _MAX_ANALYTIC_DECIMAL_DIGITS
        or any(character < "0" or character > "9" for character in digits)
        or value == "-0"
    ):
        raise RelationMatrixError(label + " is not a canonical decimal")
    answer = int(value)
    if abs(answer).bit_length() > _MAX_ANALYTIC_INTEGER_BITS:
        raise RelationMatrixError(label + " exceeds the analytic integer bit limit")
    return answer


def _sha256_identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.startswith("sha256:"):
        raise RelationMatrixError(label + " is not a SHA-256 identifier")
    digest = value[7:]
    if len(digest) != 64 or any(
        character not in "0123456789abcdef" for character in digest
    ):
        raise RelationMatrixError(label + " is not a canonical SHA-256 identifier")
    return value


def _canonical_json(value: Any, label: str) -> Any:
    try:
        return json.loads(
            json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
        )
    except (TypeError, ValueError) as error:
        raise RelationMatrixError(label + " is not canonical JSON data") from error


def _identity(value: Any) -> str:
    encoded = json.dumps(
        _canonical_json(value, "evidence"),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return "sha256:" + hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _sparse_vector(
    terms: Any,
    length: int,
    index_key: str,
    coefficient_key: str,
    label: str,
    *,
    decimal_coefficients: bool = True,
) -> tuple[int, ...]:
    if not isinstance(terms, list):
        raise RelationMatrixError(label + " terms must be a list")
    answer = [0] * length
    previous = -1
    for term in terms:
        if not isinstance(term, dict) or set(term) != {index_key, coefficient_key}:
            raise RelationMatrixError(label + " has malformed terms")
        index = _natural(term[index_key], label + " index")
        if not previous < index < length:
            raise RelationMatrixError(label + " index is out of bounds")
        if decimal_coefficients:
            coefficient = _signed_decimal(
                term[coefficient_key], label + " coefficient", nonzero=True
            )
        else:
            coefficient = _bounded_integer(
                term[coefficient_key], label + " coefficient"
            )
            if coefficient == 0:
                raise RelationMatrixError(label + " coefficient is invalid")
        answer[index] = coefficient
        previous = index
    return tuple(answer)


def _sparse_relation(terms: Any, columns: int) -> SparseRelationRow:
    if not isinstance(terms, list):
        raise RelationMatrixError("relation terms must be a list")
    entries: list[tuple[int, int]] = []
    previous = -1
    for term in terms:
        if not isinstance(term, dict) or set(term) != {
            "factorBaseIndexZeroBased",
            "exponent",
        }:
            raise RelationMatrixError("relation has malformed terms")
        index = _natural(term["factorBaseIndexZeroBased"], "relation index")
        exponent = _bounded_integer(term["exponent"], "relation coefficient")
        if not previous < index < columns:
            raise RelationMatrixError("relation index is out of bounds")
        if exponent <= 0:
            raise RelationMatrixError("relation coefficient is invalid")
        entries.append((index, exponent))
        previous = index
    return SparseRelationRow(columns, entries)


def _dependency_minor_key(minor: tuple[Sequence[int], int]) -> tuple[int, ...]:
    return tuple(_natural(index, "dependency minor index") for index in minor[0])


class RustCompactPresentationReplay:
    """A verified factor-base quotient map, explicitly not an ideal-class map."""

    def __init__(
        self,
        presentation: CompactRelationPresentation,
        field: Any,
        order: Any,
        prepared_basis: Sequence[Any],
        factor_base_ideals: Sequence[Any],
        *,
        producer_input_id: str,
        prepared_result_identity: str,
        certificate_identity: str,
        factored_units: Sequence[Any] = (),
        unit_certificates: Sequence[Any] = (),
    ) -> None:
        if not presentation.verify():
            raise RelationMatrixError("the compact relation presentation is invalid")
        if len(factor_base_ideals) != presentation.column_count:
            raise RelationMatrixError("the live factor base has the wrong length")
        self._presentation = presentation
        self._field = field
        self._order = order
        self._prepared_basis = list(prepared_basis)
        self._factor_base_ideals = tuple(factor_base_ideals)
        relations = __import__(
            "sagejs.number_fields.class_group_relations",
            fromlist=["class_group_relations"],
        )
        self._ideal_reconstructor = relations.FactorBaseIdealReconstructor(
            order, factor_base_ideals
        )
        self._factor_ideal_over_base = relations.factor_ideal_over_base
        self.producer_input_id = producer_input_id
        self.prepared_result_identity = prepared_result_identity
        self.certificate_identity = certificate_identity
        self._factored_units = tuple(factored_units)
        self._unit_certificates = tuple(unit_certificates)

    @property
    def invariants(self) -> tuple[int, ...]:
        return self._presentation.invariants

    @property
    def factor_base_size(self) -> int:
        return self._presentation.column_count

    @property
    def relation_count(self) -> int:
        return self._presentation.row_count

    def factored_units(self) -> tuple[Any, ...]:
        """Return exact compact units authenticated by the relation replay."""
        return self._factored_units

    def verify_factored_units(self) -> bool:
        """Replay every exact compact-unit certificate."""
        return bool(
            len(self._factored_units) == len(self._unit_certificates)
            and all(
                certificate.verify(unit)
                for certificate, unit in zip(
                    self._unit_certificates, self._factored_units, strict=True
                )
            )
        )

    def class_coordinates(
        self, factor_base_exponents: Sequence[int]
    ) -> tuple[int, ...]:
        """Map a factor-base exponent vector to the proved quotient coordinates."""
        checked = tuple(
            _bounded_integer(value, "factor-base exponent")
            for value in factor_base_exponents
        )
        return self._presentation.class_coordinates(checked)

    def factor_base_class_coordinates(self, index: int) -> tuple[int, ...]:
        position = _natural(index, "factor-base index")
        if position >= self.factor_base_size:
            raise RelationMatrixError("factor-base index is out of bounds")
        vector = [0] * self.factor_base_size
        vector[position] = 1
        return self.class_coordinates(vector)

    def factor_base_ideal(self, index: int) -> Any:
        """Return one independently reconstructed live maximal-order prime."""
        position = _natural(index, "factor-base index")
        if position >= self.factor_base_size:
            raise RelationMatrixError("factor-base index is out of bounds")
        return self._factor_base_ideals[position]

    def smooth_ideal_class_coordinates(self, ideal: Any) -> tuple[int, ...]:
        """Map an ideal whose complete support lies in the live factor base."""
        row = self._factor_ideal_over_base(ideal, self._factor_base_ideals)
        return self.class_coordinates(row)

    def representative_ideal(self, coordinates: Sequence[int]) -> Any:
        """Construct a live ideal representing verified class coordinates."""
        return self._ideal_reconstructor.reconstruct(
            self.lift_class_coordinates(coordinates)
        )

    def class_generator_ideal(self, index: int) -> Any:
        """Return the live representative of one invariant-factor generator."""
        position = _natural(index, "class-generator index")
        coordinates = [0] * len(self.invariants)
        if position >= len(coordinates):
            raise RelationMatrixError("class-generator index is out of bounds")
        coordinates[position] = 1
        return self.representative_ideal(coordinates)

    def replay_arbitrary_ideal_class_certificate(
        self, ideal: Any, certificate: dict[str, Any]
    ) -> tuple[int, ...]:
        """Replay `(alpha) = ideal * product(P_i^e_i)` and derive its class."""
        if getattr(ideal, "ring", lambda: None)() is not self._order:
            raise TypeError("the queried ideal belongs to another maximal order")
        if ideal.is_zero():
            raise ValueError("the zero ideal has no ideal class")
        relative = ideal.basis_matrix() * self._order._basis_inverse_matrix()
        if any(value._denominator != 1 for row in relative.rows() for value in row):
            raise ValueError(
                "the Rust arbitrary-ideal boundary requires an integral ideal"
            )

        keys = {
            "classCoordinates",
            "compactCertificateIdentity",
            "factorBaseSize",
            "maximalOrderEvidence",
            "preparedResultIdentity",
            "presentationZero",
            "principalElementIntegralBasisCoordinates",
            "quotientFactorBaseExponents",
            "schema",
            "sourceInputId",
        }
        certificate = _closed(certificate, keys, "arbitrary-ideal certificate")
        if certificate["schema"] != ARBITRARY_IDEAL_QUERY_SCHEMA:
            raise RelationMatrixError("unsupported arbitrary-ideal certificate")
        if (
            certificate["sourceInputId"] != self.producer_input_id
            or certificate["preparedResultIdentity"] != self.prepared_result_identity
            or certificate["compactCertificateIdentity"] != self.certificate_identity
        ):
            raise RelationMatrixError("arbitrary-ideal certificate authority mismatch")
        if certificate["maximalOrderEvidence"] != "rust-proved-maximal-order":
            raise RelationMatrixError("unsupported maximal-order evidence")
        if (
            _natural(certificate["factorBaseSize"], "factor-base size")
            != self.factor_base_size
        ):
            raise RelationMatrixError("arbitrary-ideal factor-base width mismatch")

        quotient = _sparse_vector(
            certificate["quotientFactorBaseExponents"],
            self.factor_base_size,
            "factorBaseIndexZeroBased",
            "exponent",
            "quotient factor-base vector",
        )
        if any(
            exponent < 0 or exponent > _MAX_ARBITRARY_IDEAL_VALUATION
            for exponent in quotient
        ):
            raise RelationMatrixError(
                "arbitrary-ideal exponent exceeds the verifier limit"
            )
        coordinates = certificate["principalElementIntegralBasisCoordinates"]
        if not isinstance(coordinates, list) or len(coordinates) != 3:
            raise RelationMatrixError("principal element has the wrong dimension")
        alpha = _element_from_prepared_coordinates(
            self._field,
            self._prepared_basis,
            tuple(
                _signed_decimal(value, "principal coordinate") for value in coordinates
            ),
        )
        if alpha.is_zero():
            raise RelationMatrixError("principal element must be nonzero")
        quotient_ideal = self._ideal_reconstructor.reconstruct(quotient)
        if self._order.ideal(alpha) != ideal * quotient_ideal:
            raise ArithmeticError(
                "arbitrary-ideal principal equality failed exact replay"
            )

        derived = self.class_coordinates(tuple(-value for value in quotient))
        claimed_raw = certificate["classCoordinates"]
        if not isinstance(claimed_raw, list) or len(claimed_raw) != len(
            self.invariants
        ):
            raise RelationMatrixError("class coordinates have the wrong dimension")
        claimed = tuple(
            _signed_decimal(value, "class coordinate") for value in claimed_raw
        )
        if any(
            value < 0 or value >= modulus
            for value, modulus in zip(claimed, self.invariants, strict=True)
        ):
            raise RelationMatrixError("class coordinates are not canonical residues")
        if claimed != derived:
            raise RelationMatrixError("arbitrary-ideal class coordinates mismatch")
        if certificate["presentationZero"] is not all(value == 0 for value in derived):
            raise RelationMatrixError("arbitrary-ideal principality state mismatch")
        return derived

    def lift_class_coordinates(self, coordinates: Sequence[int]) -> tuple[int, ...]:
        """Return the certified standard lift into the factor-base lattice."""
        checked = tuple(
            _bounded_integer(value, "class coordinate") for value in coordinates
        )
        return self._presentation.lift_class_coordinates(checked)

    def verify(self) -> bool:
        return self._presentation.verify()


def _replay_compact_presentation(
    prepared: dict[str, Any], certificate: dict[str, Any]
) -> CompactRelationPresentation:
    _closed(prepared, _PREPARED_KEYS, "prepared evidence")
    _closed(certificate, _CERTIFICATE_KEYS, "compact certificate")
    if prepared["schema"] != PREPARED_RESULT_SCHEMA:
        raise RelationMatrixError("unsupported prepared evidence")
    if certificate["schema"] != COMPACT_CERTIFICATE_SCHEMA:
        raise RelationMatrixError("unsupported compact certificate")
    input_id = _sha256_identifier(prepared["inputId"], "prepared input identity")
    if certificate["sourceInputId"] != input_id:
        raise RelationMatrixError("certificate input identity mismatch")
    if (
        prepared["qualificationStatus"] != "grh-conditional-class-unit-index-one"
        or certificate["qualificationStatus"]
        != "closed-exact-lattice-index-certificate"
        or prepared["usesClassGroupAnswersAsInput"] is not False
        or prepared["usesOracleAsInput"] is not False
    ):
        raise RelationMatrixError("unsupported qualification status")
    verified = _closed(certificate["verified"], _VERIFIED_KEYS, "verified claims")
    if any(value is not True for value in verified.values()):
        raise RelationMatrixError("producer verification claims are incomplete")

    shape = _closed(certificate["relationShape"], {"rows", "columns"}, "relation shape")
    row_count = _natural(shape["rows"], "row count")
    columns = _positive_natural(shape["columns"], "column count")
    if (
        columns > _MAX_COLUMNS
        or row_count <= columns
        or row_count - columns > _MAX_SURPLUS
    ):
        raise RelationMatrixError("relation shape exceeds the verifier envelope")
    if (
        columns * columns > _MAX_DENSE_DETERMINANT_ENTRIES
        or columns * columns * columns > _MAX_DENSE_DETERMINANT_WORK
    ):
        raise RelationMatrixError("square determinant exceeds the verifier work limit")
    prepared_shape = _closed(
        prepared["relations"], {"rows", "columns"}, "prepared shape"
    )
    if prepared_shape != shape:
        raise RelationMatrixError("relation shape mismatch")

    lattice = _closed(
        prepared["relationLatticeEvidence"],
        {"schema", "factorBaseCatalog", "relationRecords"},
        "relation-lattice evidence",
    )
    if lattice["schema"] != RELATION_LATTICE_SCHEMA:
        raise RelationMatrixError("unsupported relation-lattice evidence")
    catalog = lattice["factorBaseCatalog"]
    if not isinstance(catalog, list) or len(catalog) != columns:
        raise RelationMatrixError("factor-base catalog has the wrong length")
    catalog_keys = {
        "factorBaseIndexZeroBased",
        "generator",
        "hnf",
        "norm",
        "prime",
        "ramification",
        "residueDegree",
    }
    for expected, entry in enumerate(catalog):
        _closed(entry, catalog_keys, "factor-base entry")
        if _natural(entry["factorBaseIndexZeroBased"], "factor-base index") != expected:
            raise RelationMatrixError("factor-base indices are not contiguous")
        for key in ("norm", "prime", "ramification", "residueDegree"):
            _positive_natural(entry[key], "factor-base " + key)
        generator = entry["generator"]
        if (
            generator is not None
            and (
                not isinstance(generator, list)
                or len(generator) != 3
                or any(
                    isinstance(value, bool) or not isinstance(value, int)
                    for value in generator
                )
            )
        ) or (
            not isinstance(entry["hnf"], list)
            or len(entry["hnf"]) != 9
            or any(
                isinstance(value, bool) or not isinstance(value, int)
                for value in entry["hnf"]
            )
        ):
            raise RelationMatrixError("factor-base entry has malformed coordinates")
        for value in (generator or []) + entry["hnf"]:
            _bounded_integer(value, "factor-base coordinate")

    records = lattice["relationRecords"]
    if not isinstance(records, list) or len(records) != row_count:
        raise RelationMatrixError("relation record count mismatch")
    relation_rows: list[SparseRelationRow] = []
    for expected, record in enumerate(records):
        _closed(
            record,
            {"integralBasisCoordinates", "primeIdealFactors", "relationIndexZeroBased"},
            "relation record",
        )
        if _natural(record["relationIndexZeroBased"], "relation index") != expected:
            raise RelationMatrixError("relation indices are not contiguous")
        coordinates = record["integralBasisCoordinates"]
        if not isinstance(coordinates, list) or len(coordinates) != 3:
            raise RelationMatrixError("principal coordinates have the wrong length")
        tuple(_signed_decimal(value, "principal coordinate") for value in coordinates)
        relation_rows.append(_sparse_relation(record["primeIdealFactors"], columns))

    raw_invariants = certificate["invariantFactors"]
    if not isinstance(raw_invariants, list) or len(raw_invariants) > _MAX_INVARIANTS:
        raise RelationMatrixError("invalid invariant factors")
    invariants = tuple(
        _positive_decimal(value, "invariant factor") for value in raw_invariants
    )
    if columns * max(1, len(invariants)) > _MAX_DENSE_CERTIFICATE_ENTRIES:
        raise RelationMatrixError("class map exceeds the verifier envelope")
    modular_map = _closed(
        certificate["modularClassMap"], {"moduli", "rows"}, "modular class map"
    )
    if modular_map["moduli"] != raw_invariants or not isinstance(
        modular_map["rows"], list
    ):
        raise RelationMatrixError("class-map moduli mismatch")
    if len(modular_map["rows"]) != columns:
        raise RelationMatrixError("class-map row count mismatch")
    class_map_rows = []
    for expected, row in enumerate(modular_map["rows"]):
        _closed(row, {"factorBaseIndexZeroBased", "residues"}, "class-map row")
        if _natural(row["factorBaseIndexZeroBased"], "class-map row index") != expected:
            raise RelationMatrixError("class-map rows are not contiguous")
        residues = row["residues"]
        if not isinstance(residues, list) or len(residues) != len(invariants):
            raise RelationMatrixError("class-map residues have the wrong length")
        class_map_rows.append(
            tuple(_bounded_integer(value, "class-map residue") for value in residues)
        )

    lifts = certificate["standardGeneratorLifts"]
    if not isinstance(lifts, list) or len(lifts) != len(invariants):
        raise RelationMatrixError("standard-generator lift count mismatch")
    generator_transforms = []
    order_combinations = []
    for expected, lift in enumerate(lifts):
        _closed(
            lift,
            {
                "coordinateZeroBased",
                "factorBaseLift",
                "modulus",
                "orderRelationCombination",
            },
            "standard-generator lift",
        )
        if (
            _natural(lift["coordinateZeroBased"], "generator coordinate") != expected
            or _positive_decimal(lift["modulus"], "lift modulus")
            != invariants[expected]
        ):
            raise RelationMatrixError("standard-generator lift is not canonical")
        generator_transforms.append(
            _sparse_vector(
                lift["factorBaseLift"],
                columns,
                "factorBaseIndexZeroBased",
                "coefficient",
                "generator lift",
            )
        )
        order_combinations.append(
            _sparse_vector(
                lift["orderRelationCombination"],
                row_count,
                "relationIndexZeroBased",
                "coefficient",
                "generator order combination",
            )
        )

    raw_dependencies = certificate["relationDependencies"]
    if (
        not isinstance(raw_dependencies, list)
        or len(raw_dependencies) != row_count - columns
    ):
        raise RelationMatrixError("dependency count mismatch")
    if len(raw_dependencies) * row_count > _MAX_DENSE_CERTIFICATE_ENTRIES:
        raise RelationMatrixError("dependency matrix exceeds the verifier envelope")
    dependencies = []
    for expected, dependency in enumerate(raw_dependencies):
        _closed(
            dependency, {"dependencyIndexZeroBased", "terms"}, "relation dependency"
        )
        if (
            _natural(dependency["dependencyIndexZeroBased"], "dependency index")
            != expected
        ):
            raise RelationMatrixError("dependency indices are not contiguous")
        dependencies.append(
            _sparse_vector(
                dependency["terms"],
                row_count,
                "relationIndexZeroBased",
                "coefficient",
                "dependency",
            )
        )

    evidence = _closed(
        certificate["latticeIndexEvidence"],
        {
            "dependencySaturation",
            "fullRelationLatticeIndex",
            "projectedDependencyDeterminant",
            "squareDeterminant",
            "squareRowIndicesZeroBased",
            "surplusRowIndicesZeroBased",
        },
        "lattice-index evidence",
    )
    saturation = _closed(
        evidence["dependencySaturation"],
        {"criterion", "gcd", "selectedMinors"},
        "dependency saturation",
    )
    if (
        saturation["criterion"] != "gcd-of-exhibited-maximal-dependency-minors-is-one"
        or saturation["gcd"] != "1"
    ):
        raise RelationMatrixError("unsupported dependency-saturation evidence")
    if not isinstance(saturation["selectedMinors"], list):
        raise RelationMatrixError("dependency minors must be a list")
    minor_count = len(saturation["selectedMinors"])
    surplus = row_count - columns
    if minor_count > _MAX_DEPENDENCY_MINOR_WITNESSES:
        raise RelationMatrixError("too many dependency-minor witnesses")
    if (
        minor_count * surplus * surplus * surplus
        > _MAX_DEPENDENCY_MINOR_DETERMINANT_WORK
    ):
        raise RelationMatrixError(
            "dependency-minor replay exceeds the verifier work limit"
        )
    dependency_minors: list[tuple[Sequence[int], int]] = []
    for minor in saturation["selectedMinors"]:
        _closed(
            minor, {"relationRowIndicesZeroBased", "determinant"}, "dependency minor"
        )
        indices = minor["relationRowIndicesZeroBased"]
        if not isinstance(indices, list) or len(indices) != surplus:
            raise RelationMatrixError("dependency minor has the wrong dimension")
        dependency_minors.append(
            (
                tuple(_natural(index, "dependency minor index") for index in indices),
                _positive_decimal(minor["determinant"], "dependency minor"),
            )
        )
    dependency_minors.sort(key=_dependency_minor_key)

    answer = CompactRelationPresentation.from_small_surplus(
        columns,
        relation_rows,
        invariants,
        class_map_rows,
        generator_transforms,
        dependencies,
        evidence["squareRowIndicesZeroBased"],
        evidence["surplusRowIndicesZeroBased"],
        _positive_decimal(evidence["squareDeterminant"], "square determinant"),
        _positive_decimal(
            evidence["projectedDependencyDeterminant"], "projected determinant"
        ),
        dependency_minors,
    )
    for modulus, lift, combination in zip(
        invariants, generator_transforms, order_combinations, strict=True
    ):
        left = tuple(modulus * value for value in lift)
        right = [0] * columns
        for coefficient, relation in zip(combination, relation_rows, strict=True):
            if coefficient:
                for column, value in relation.entries:
                    right[column] += coefficient * value
        if left != tuple(right):
            raise RelationMatrixError(
                "standard-generator order combination does not replay exactly"
            )
    claimed_order = _positive_decimal(certificate["groupOrder"], "group order")
    full_index = _positive_decimal(evidence["fullRelationLatticeIndex"], "full index")
    if (
        claimed_order != answer.order
        or full_index != answer.order
        or not answer.verify()
    ):
        raise RelationMatrixError("Rust compact certificate failed Sage.js replay")
    return answer


def _replay_relation_ideals(
    field: Any,
    prepared: dict[str, Any],
    result: dict[str, Any],
    presentation: CompactRelationPresentation,
    *,
    basis_override: list[Any] | None = None,
    table_override: list[list[list[Any]]] | None = None,
) -> tuple[tuple[Any, ...], dict[str, Any]]:
    """Match the validated catalog and rows to live maximal-order ideals."""
    order = field.maximal_order()
    basis = (
        _prepared_basis_elements(field, prepared)
        if basis_override is None
        else basis_override
    )
    table = table_override
    if table is None:
        table = [
            [
                [
                    _input_integer(entry["numerator"])
                    // _input_integer(entry["denominator"])
                    for entry in product
                ]
                for product in left
            ]
            for left in prepared["preparation"]["multiplicationTable"]
        ]
    lattice = result["relationLatticeEvidence"]
    ideals = []
    factorizations: dict[int, tuple[tuple[Any, int], ...]] = {}
    validated_primes: set[int] = set()
    prime_ideals = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    for descriptor in lattice["factorBaseCatalog"]:
        _validate_prime_hnf_lattice(descriptor, table, validated_primes)
        exported = _ideal_from_prepared_descriptor(field, order, basis, descriptor)
        integral_rows = descriptor.get("integralBasisRows")
        if integral_rows is not None:
            if (
                not isinstance(integral_rows, list)
                or len(integral_rows) != 3
                or any(
                    not isinstance(row, list) or len(row) != 3 for row in integral_rows
                )
            ):
                raise ArithmeticError("an exported ideal basis is malformed")
            integral_generators = [
                _element_from_prepared_coordinates(field, basis, row)
                for row in integral_rows
            ]
            if order.ideal(integral_generators) != exported:
                raise ArithmeticError(
                    "an exported integral ideal basis does not match its HNF"
                )
        prime = int(descriptor["prime"])
        ramification = int(descriptor["ramification"])
        residue_degree = int(descriptor.get("residueDegree", 1))
        if residue_degree == 1 and ramification == 1:
            # `_validate_prime_hnf_lattice` proved that this index-p lattice is
            # the kernel of a surjective ring map O -> F_p.  It is therefore
            # already an independently proven maximal (hence prime) ideal;
            # refactoring pO would repeat an expensive global computation.
            live = prime_ideals.NumberFieldPrimeIdeal(
                order,
                exported._basis_rows,
                prime,
                ramification,
                residue_degree,
                _candidate_token=prime_ideals._PACKED_CANDIDATE_TOKEN,
            )
        else:
            # Higher residue degree lacks the linear residue character above,
            # and nontrivial ramification is additional metadata.  Recompute
            # those exceptional local factorizations through Sage.js.
            if prime not in factorizations:
                factorizations[prime] = tuple(
                    (candidate, int(exponent))
                    for candidate, exponent in order.ideal(prime).factor()
                )
            live = next(
                (
                    candidate
                    for candidate, exponent in factorizations[prime]
                    if candidate == exported and exponent == ramification
                ),
                None,
            )
            if live is None:
                raise ArithmeticError(
                    "factor-base entry is not the claimed prime ideal"
                )
        ideals.append(live)
    relations = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["class_group_relations"],
    )
    reconstruct = relations.FactorBaseIdealReconstructor(order, ideals).reconstruct
    records = lattice["relationRecords"]
    for record, row in zip(records, presentation.relation_rows, strict=True):
        element = _element_from_prepared_coordinates(
            field, basis, record["integralBasisCoordinates"]
        )
        if order.ideal(element) != reconstruct(row.dense()):
            raise ArithmeticError("relation is not the claimed principal ideal")
    return tuple(ideals), {
        "schema": "sagejs.rust-class-group/relation-ideal-replay-v1",
        "inputId": prepared["inputId"],
        "authority": "independent-sagejs-maximal-order-ideal-arithmetic",
        "factorBasePrimeCount": len(ideals),
        "principalRelationCount": len(records),
        "verifiedFactorTermCount": sum(
            len(record["primeIdealFactors"]) for record in records
        ),
        "exceptionalRationalPrimeFactorizations": len(factorizations),
        "allFactorBasePrimesReplayed": True,
        "allPrincipalIdealEqualitiesReplayed": True,
    }


def adapt_rust_prepared_cubic_v2_presentation(
    field: Any,
    prepared_input: dict[str, Any],
    prepared_result: dict[str, Any],
    compact_certificate: dict[str, Any],
) -> Any:
    """Replay the exact quotient-lattice evidence and return an incomplete result."""
    authoritative = prepare_cubic_for_rust(field)
    if not _prepared_input_matches_authoritative(prepared_input, authoritative):
        raise RelationMatrixError("prepared input is not the canonical field export")
    prepared_result = _canonical_json(prepared_result, "prepared result")
    compact_certificate = _canonical_json(compact_certificate, "compact certificate")
    _closed(prepared_result, _PREPARED_KEYS, "prepared evidence")
    producer_input_id = _sha256_identifier(
        prepared_result["inputId"], "producer input identity"
    )
    if prepared_input.get("inputId") != producer_input_id:
        raise RelationMatrixError("prepared result input identity mismatch")
    expected_polynomial = prepared_input.get("field", {}).get("coefficientsAscending")
    if prepared_result["polynomialAscending"] != expected_polynomial:
        raise RelationMatrixError("prepared result polynomial mismatch")

    presentation = _replay_compact_presentation(prepared_result, compact_certificate)
    factor_base_ideals, ideal_replay = _replay_relation_ideals(
        field, prepared_input, prepared_result, presentation
    )
    prepared_identity = _identity(prepared_result)
    certificate_identity = _identity(compact_certificate)
    context = RustCompactPresentationReplay(
        presentation,
        field,
        field.maximal_order(),
        _prepared_basis_elements(field, prepared_input),
        factor_base_ideals,
        producer_input_id=producer_input_id,
        prepared_result_identity=prepared_identity,
        certificate_identity=certificate_identity,
    )
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    diagnostics = {
        "schema": DIAGNOSTICS_SCHEMA,
        "automaticDispatch": False,
        "publicResultSupported": False,
        "preparedInputBinding": "canonical-field-replayed",
        "producerInputId": producer_input_id,
        "polynomialBinding": "exact",
        "preparedResultIdentity": prepared_identity,
        "compactCertificateIdentity": certificate_identity,
        "relationPresentationReplay": "exact-principal-ideal-and-integer-lattice",
        "relationIdealReplay": ideal_replay,
        "liveFactorBaseIdeals": "available-through-context",
        "factorBaseCoordinateMap": "available",
        "smoothFactorBaseIdealClassMap": "available-through-context",
        "classGeneratorIdeals": "available-through-context",
        "arbitraryIdealClassMap": "certificate-replay-available-through-context",
        "requestResourceBinding": "not-present-in-evidence",
        "artifactIdentity": None,
        "acceptedEvidenceJoins": list(_ACCEPTED_JOINS),
        "remainingEvidenceGaps": list(_REMAINING_GAPS),
    }
    stages = (
        groups.ClassUnitStage(
            "rust-compact-relation-presentation-replay",
            "complete",
            {
                "preparedResultIdentity": prepared_identity,
                "compactCertificateIdentity": certificate_identity,
                "factorBaseSize": context.factor_base_size,
                "relationCount": context.relation_count,
                "principalRelationCount": ideal_replay["principalRelationCount"],
            },
        ),
        groups.ClassUnitStage(
            "sagejs-public-class-unit-certification",
            "incomplete",
            {"missingEvidence": list(_REMAINING_GAPS)},
        ),
    )
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason="the exact principal relation quotient lacks product invocation/session lifetime, unit, completion, resource, and artifact authority",
        algorithm="rust-prepared-cubic-compact-presentation-experimental",
        stages=stages,
        tentative_invariants=presentation.invariants,
        context=context,
        diagnostics=diagnostics,
    )


def _replay_publication_field(
    field: Any, publication_field: Any, prepared_input: dict[str, Any]
) -> tuple[list[Any], list[list[list[Any]]], dict[str, Any]]:
    """Prove that an arbitrary published basis is the live maximal order."""
    keys = {
        "basisDenominator",
        "bindingSha256",
        "discriminant",
        "equationOrderIndex",
        "integralBasisNumerators",
        "irreducibilityPrime",
        "multiplicationTable",
        "polynomialAscending",
        "signature",
    }
    field_data = _closed(publication_field, keys, "publication field")
    prepared_field = prepared_input["field"]
    prepared = prepared_input["preparation"]
    digest = field_data["bindingSha256"]
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in "0123456789abcdef" for character in digest)
    ):
        raise RelationMatrixError("publication field binding is not a SHA-256 digest")
    if (
        field_data["polynomialAscending"] != prepared_field["coefficientsAscending"]
        or field_data["irreducibilityPrime"] != prepared["irreducibilityPrime"]
        or field_data["discriminant"] != prepared["discriminant"]
        or field_data["signature"]
        != [prepared["signature"]["realPlaces"], prepared["signature"]["complexPairs"]]
    ):
        raise RelationMatrixError("publication field invariants do not match")

    maximal = __import__(
        "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
    )
    order = field.maximal_order()
    expected_index = maximal.equation_order_index(order)
    if _positive_decimal(
        field_data["equationOrderIndex"], "equation-order index"
    ) != int(expected_index):
        raise RelationMatrixError("publication equation-order index does not match")
    raw_numerators = field_data["integralBasisNumerators"]
    if not isinstance(raw_numerators, list) or len(raw_numerators) != 9:
        raise RelationMatrixError("publication integral basis is malformed")
    numerators = [
        _signed_decimal(value, "integral-basis numerator") for value in raw_numerators
    ]
    denominator = _positive_decimal(field_data["basisDenominator"], "basis denominator")
    scale = int(field._integral_equation_scale_cache)
    rows = []
    basis = []
    for row_index in range(3):
        row = []
        element = field(0)
        power = 1
        for column in range(3):
            coefficient = _untyped(sage.QQ)(
                _input_integer(numerators[3 * row_index + column]) * power,
                _input_integer(denominator),
            )
            row.append(coefficient)
            element += coefficient * field.gen() ** column
            power *= scale
        rows.append(row)
        basis.append(element)

    matrix = maximal._nf_global("matrix")
    vector = maximal._nf_global("vector")
    published_matrix = matrix(sage.QQ, rows)
    if published_matrix.determinant() == 0:
        raise RelationMatrixError("publication integral basis is singular")
    if any(element not in order for element in basis):
        raise RelationMatrixError("publication basis is not integral")
    change = published_matrix * order._basis_inverse_matrix()
    if any(value._denominator != 1 for row in change.rows() for value in row):
        raise RelationMatrixError("publication basis is not contained integrally")
    determinant = change.determinant()
    if determinant._denominator != 1 or abs(int(determinant._numerator)) != 1:
        raise RelationMatrixError("publication basis is not the full maximal order")

    raw_table = field_data["multiplicationTable"]
    if not isinstance(raw_table, list) or len(raw_table) != 27:
        raise RelationMatrixError("publication multiplication table is malformed")
    expected_flat = [
        _signed_decimal(value, "multiplication-table entry") for value in raw_table
    ]
    inverse = published_matrix.inverse()
    actual_flat = []
    table = []
    for left in basis:
        products = []
        for right in basis:
            coordinates = list(
                vector(sage.QQ, maximal._nf_coordinates(left * right, 3)) * inverse
            )
            if any(value._denominator != 1 for value in coordinates):
                raise RelationMatrixError(
                    "publication basis is not multiplicatively closed"
                )
            integer_coordinates = [int(value._numerator) for value in coordinates]
            actual_flat.extend(integer_coordinates)
            products.append(integer_coordinates)
        table.append(products)
    if actual_flat != expected_flat:
        raise RelationMatrixError("publication multiplication table does not replay")
    return (
        basis,
        table,
        {
            "schema": "sagejs.rust-class-group/publication-field-replay-v1",
            "authority": "live-certified-maximal-order-with-unimodular-basis-change",
            "publishedBindingSha256": digest,
            "changeOfBasisDeterminant": int(determinant._numerator),
            "multiplicationTableReplayed": True,
        },
    )


def _publication_sparse_vector(
    terms: Any, length: int, index_key: str, label: str
) -> tuple[int, ...]:
    return _sparse_vector(terms, length, index_key, "value", label)


class RustCompactUnitReplayCertificate:
    """Exact proof that a factored relation product is a unit.

    Every factor is the principal generator of a relation already replayed as
    an exact ideal equality.  An exponent vector which annihilates the complete
    factor-base relation matrix therefore has principal ideal `(1)`.  Keeping
    the product factored is essential: expanded fundamental units can be
    astronomically larger than the relation generators which define them.
    """

    def __init__(
        self,
        relation_elements: Sequence[Any],
        relation_rows: Sequence[SparseRelationRow],
        exponents: Sequence[int],
    ) -> None:
        if len(relation_elements) != len(relation_rows) or len(exponents) != len(
            relation_rows
        ):
            raise RelationMatrixError("compact-unit relation dimensions mismatch")
        self._relation_elements = tuple(relation_elements)
        self._relation_rows = tuple(relation_rows)
        self._exponents = tuple(int(value) for value in exponents)
        self.proof_status = "exact-principal-relation-unit"

    @property
    def relation_exponents(self) -> tuple[int, ...]:
        return self._exponents

    def verify(self, unit: Any) -> bool:
        try:
            factored = __import__(
                "sagejs.number_fields.factored_elements",
                fromlist=["factored_elements"],
            )
            expected = factored.FactoredNumberFieldElement(
                unit.field(),
                (
                    (element, exponent)
                    for element, exponent in zip(
                        self._relation_elements, self._exponents, strict=True
                    )
                    if exponent
                ),
            )
            if expected != unit:
                return False
            columns = self._relation_rows[0].column_count
            totals = [0] * columns
            for coefficient, row in zip(
                self._exponents, self._relation_rows, strict=True
            ):
                if coefficient:
                    for column, value in row.entries:
                        totals[column] += coefficient * value
            return not any(totals)
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False


def _replay_publication_units(
    field: Any,
    publication_basis: Sequence[Any],
    relation_records: Sequence[dict[str, Any]],
    relation_rows: Sequence[SparseRelationRow],
    payload: Any,
) -> tuple[Any, tuple[RustCompactUnitReplayCertificate, ...], dict[str, Any]]:
    """Reconstruct exact factored units without expanding their huge values."""
    units_data = _closed(
        payload,
        {
            "commonDenominator",
            "fundamentalUnits",
            "regulator",
            "rootsOfUnity",
            "selectedBasisIndex",
        },
        "publication units",
    )
    common_denominator = _positive_decimal(
        units_data["commonDenominator"], "unit common denominator"
    )
    selected_basis_index = _positive_decimal(
        units_data["selectedBasisIndex"], "selected unit-basis index"
    )
    if selected_basis_index > common_denominator:
        raise RelationMatrixError("selected unit-basis index exceeds its denominator")

    relation_count = len(relation_rows)
    relation_elements = tuple(
        _element_from_prepared_coordinates(
            field,
            publication_basis,
            tuple(
                _signed_decimal(value, "principal coordinate")
                for value in record["integralBasisCoordinates"]
            ),
        )
        for record in relation_records
    )
    factored = __import__(
        "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
    )
    signature_module = __import__(
        "sagejs.number_fields.embeddings", fromlist=["embeddings"]
    )
    signature = signature_module.exact_signature(field)
    unit_rank = int(signature[0]) + int(signature[1]) - 1
    fundamental = units_data["fundamentalUnits"]
    if not isinstance(fundamental, list) or len(fundamental) != unit_rank:
        raise RelationMatrixError("publication fundamental-unit rank mismatch")
    compact_units = []
    certificates = []
    nonzero_terms = 0
    for entry in fundamental:
        entry = _closed(entry, {"relationExponents"}, "publication unit")
        exponents = _publication_sparse_vector(
            entry["relationExponents"],
            relation_count,
            "indexZeroBased",
            "unit relation exponent",
        )
        nonzero_terms += sum(1 for value in exponents if value)
        certificate = RustCompactUnitReplayCertificate(
            relation_elements, relation_rows, exponents
        )
        unit = factored.FactoredNumberFieldElement(
            field,
            (
                (element, exponent)
                for element, exponent in zip(relation_elements, exponents, strict=True)
                if exponent
            ),
        )
        if not certificate.verify(unit):
            raise ArithmeticError("compact unit does not annihilate the relations")
        compact_units.append(unit)
        certificates.append(certificate)

    roots_data = _closed(
        units_data["rootsOfUnity"],
        {"exhaustionTheorem", "generatorIntegralBasisCoordinates", "order"},
        "publication roots of unity",
    )
    if (
        roots_data["exhaustionTheorem"]
        != "odd-degree-number-fields-have-only-plus-or-minus-one-roots-of-unity"
        or int(field.degree()) % 2 != 1
    ):
        raise RelationMatrixError("unsupported roots-of-unity publication theorem")
    roots_order = _positive_decimal(roots_data["order"], "roots-of-unity order")
    raw_root = roots_data["generatorIntegralBasisCoordinates"]
    if not isinstance(raw_root, list) or len(raw_root) != int(field.degree()):
        raise RelationMatrixError("roots-of-unity generator has the wrong dimension")
    published_root = _element_from_prepared_coordinates(
        field,
        publication_basis,
        tuple(_signed_decimal(value, "torsion coordinate") for value in raw_root),
    )
    units_module = __import__("sagejs.number_fields.units", fromlist=["units"])
    torsion = units_module.roots_of_unity(field)
    if (
        roots_order != 2
        or published_root != -field.one()
        or int(torsion.order) != roots_order
        or not torsion.complete
        or not torsion.verify()
    ):
        raise ArithmeticError("roots-of-unity theorem failed independent replay")

    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    unit_group = groups.UnitGroupComputation(
        torsion,
        compact_units,
        unit_rank,
        complete=False,
        reason="exact compact units replayed; analytic index-one proof remains detached",
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
    )
    return (
        unit_group,
        tuple(certificates),
        {
            "schema": "sagejs.rust-class-group/compact-unit-replay-v1",
            "authority": "independent-exact-principal-relation-annihilation",
            "unitRank": unit_rank,
            "factoredUnitCount": len(compact_units),
            "nonzeroRelationExponentTerms": nonzero_terms,
            "selectedBasisIndex": selected_basis_index,
            "commonDenominator": common_denominator,
            "rootsOfUnityOrder": roots_order,
            "allRelationProductsAreUnits": True,
        },
    )


def _replay_publication_regulator(
    unit_group: Any, units_payload: Any, analytic_payload: Any
) -> tuple[Any, dict[str, Any]]:
    """Independently enclose the regulator of the exact factored units."""
    units_data = _closed(
        units_payload,
        {
            "commonDenominator",
            "fundamentalUnits",
            "regulator",
            "rootsOfUnity",
            "selectedBasisIndex",
        },
        "publication units",
    )
    regulator_data = _closed(
        units_data["regulator"],
        {"binaryExponent", "lower", "upper"},
        "publication regulator",
    )
    analytic_data = _closed(
        analytic_payload,
        {
            "bdfMargin",
            "bdfPlan",
            "bfEnclosure",
            "bfPlan",
            "classUnitHypothesis",
            "factorBaseHypothesis",
            "precision",
        },
        "publication analytic completion",
    )
    precision_data = _closed(
        analytic_data["precision"],
        {
            "attemptedLevels",
            "requestedLogarithmPrecisionBits",
            "requestedReplayPrecisionBits",
        },
        "publication precision evidence",
    )
    requested_logarithm = _natural(
        precision_data["requestedLogarithmPrecisionBits"],
        "requested logarithm precision",
    )
    requested_replay = _natural(
        precision_data["requestedReplayPrecisionBits"],
        "requested replay precision",
    )
    attempted = precision_data["attemptedLevels"]
    if not isinstance(attempted, list) or not attempted:
        raise RelationMatrixError("publication precision history is empty")
    levels = []
    for entry in attempted:
        entry = _closed(
            entry,
            {"logarithmPrecisionBits", "replayPrecisionBits"},
            "publication precision level",
        )
        level = (
            _positive_natural(entry["logarithmPrecisionBits"], "logarithm precision"),
            _positive_natural(entry["replayPrecisionBits"], "replay precision"),
        )
        if levels and (level[0] <= levels[-1][0] or level[1] <= levels[-1][1]):
            raise RelationMatrixError("publication precision levels are not increasing")
        levels.append(level)
    accepted_logarithm, accepted_replay = levels[-1]
    if (
        accepted_logarithm > requested_logarithm
        or accepted_replay > requested_replay
        or accepted_replay > accepted_logarithm
        or accepted_logarithm > 16_384
    ):
        raise RelationMatrixError("publication precision history exceeds its request")

    analytic = __import__(
        "sagejs.number_fields.class_unit_analytic", fromlist=["class_unit_analytic"]
    )
    factored = __import__(
        "sagejs.number_fields.factored_elements", fromlist=["factored_elements"]
    )
    exponent = _bounded_integer(
        regulator_data["binaryExponent"], "regulator binary exponent"
    )
    published = analytic.RealBall.dyadic_endpoints(
        _analytic_decimal(regulator_data["lower"], "regulator lower endpoint"),
        exponent,
        _analytic_decimal(regulator_data["upper"], "regulator upper endpoint"),
        exponent,
        precision_bits=accepted_logarithm,
        rigorous=True,
        source="Rust/Arb detached regulator enclosure",
    )
    if published.contains_zero():
        raise ArithmeticError("published regulator enclosure contains zero")
    workspace = factored.FactoredLogarithmWorkspace(
        unit_group.generators[0].field(), maximum_entries=4096
    )
    independent = analytic.regulator_from_factored_units(
        unit_group.generators,
        unit_rank=unit_group.unit_rank,
        precision_bits=accepted_logarithm,
        absolute_tolerance_bits=64,
        maximum_precision_bits=accepted_logarithm,
        logarithm_workspace=workspace,
    )
    if not independent.rigorous:
        raise ArithmeticError("independent factored-unit regulator is not rigorous")
    try:
        overlap = independent.ball.intersection(published)
    except ValueError as error:
        raise ArithmeticError(
            "published regulator is disjoint from independent replay"
        ) from error
    unit_group.regulator_enclosure = independent
    return (
        independent,
        {
            "schema": "sagejs.rust-class-group/regulator-replay-v1",
            "authority": "independent-sagejs-factored-unit-directed-logarithms",
            "acceptedLogarithmPrecisionBits": accepted_logarithm,
            "acceptedReplayPrecisionBits": accepted_replay,
            "attemptedLevels": [list(level) for level in levels],
            "publishedAndIndependentIntervalsOverlap": True,
            "independentRegulatorProofStatus": independent.proof_status,
            "overlapContainsZero": overlap.contains_zero(),
            "logarithmWorkspace": workspace.diagnostics(),
        },
    )


def _publication_dyadic_ball(analytic: Any, payload: Any, label: str) -> Any:
    data = _closed(payload, {"binaryExponent", "lower", "upper"}, label + " interval")
    exponent = _bounded_integer(data["binaryExponent"], label + " exponent")
    return analytic.RealBall.dyadic_endpoints(
        _analytic_decimal(data["lower"], label + " lower endpoint"),
        exponent,
        _analytic_decimal(data["upper"], label + " upper endpoint"),
        exponent,
        precision_bits=512,
        rigorous=True,
        source="Rust/Arb detached " + label,
    )


def _replay_publication_analytic_completion(
    field: Any,
    class_number: int,
    unit_group: Any,
    payload: Any,
) -> dict[str, Any]:
    """Rebuild the BF and BDF plans and their directed analytic decisions."""
    data = _closed(
        payload,
        {
            "bdfMargin",
            "bdfPlan",
            "bfEnclosure",
            "bfPlan",
            "classUnitHypothesis",
            "factorBaseHypothesis",
            "precision",
        },
        "publication analytic completion",
    )
    if (
        data["classUnitHypothesis"] != "GRH for the Dedekind-zeta residue bound"
        or data["factorBaseHypothesis"]
        != "GRH for all unramified Hecke L-functions of class-group characters"
    ):
        raise RelationMatrixError("unsupported analytic completion hypotheses")
    analytic = __import__(
        "sagejs.number_fields.class_unit_analytic", fromlist=["class_unit_analytic"]
    )
    primes = __import__("sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"])
    factor_base = __import__(
        "sagejs.number_fields.class_group_factor_base",
        fromlist=["class_group_factor_base"],
    )
    bf_data = _closed(
        data["bfPlan"], {"rawTerms", "terms", "threshold"}, "publication BF plan"
    )
    threshold = _positive_decimal(bf_data["threshold"], "BF threshold")
    if threshold > 1_000_000:
        raise RelationMatrixError("BF threshold exceeds the detached replay cap")
    expected_primes = tuple(analytic._primes_below(threshold))
    splitting = {}
    for record in primes.splitting_records(field.maximal_order(), 2, threshold):
        prime, factors = analytic._splitting_record(record, int(field.degree()))
        splitting[prime] = factors
    if tuple(sorted(splitting)) != expected_primes:
        raise ArithmeticError("BF replay did not cover the complete prime interval")
    plan = analytic._build_bf_plan_readable(threshold, splitting)
    raw_bf_terms = bf_data["terms"]
    if not isinstance(raw_bf_terms, list):
        raise RelationMatrixError("BF terms must be an array")
    published_bf_terms = tuple(
        tuple(_bounded_integer(value, "BF term") for value in term)
        if isinstance(term, list) and len(term) == 4
        else ()
        for term in raw_bf_terms
    )
    if (
        any(not term for term in published_bf_terms)
        or _natural(bf_data["rawTerms"], "BF raw term count") != plan.raw_terms
        or published_bf_terms != plan.terms
    ):
        raise ArithmeticError("BF prime-power plan failed independent replay")

    interval_field = analytic.IntervalBallField(512)
    finite = analytic._bf_finite_term(plan, interval_field)
    tail = analytic._BFErrorModel(
        int(field.maximal_order().discriminant()),
        int(field.degree()),
        interval_field,
    ).bound(threshold)
    zeta = finite.add_error(tail.upper)
    embeddings = __import__("sagejs.number_fields.embeddings", fromlist=["embeddings"])
    signature = tuple(int(value) for value in embeddings.exact_signature(field))
    index = analytic.validate_hr_index(
        signature=signature,
        discriminant=int(field.maximal_order().discriminant()),
        class_number=class_number,
        roots_of_unity=int(unit_group.torsion.order),
        regulator=unit_group.regulator_enclosure,
        zeta_log_residue=zeta,
        precision_bits=512,
    )
    if not index.index_one:
        raise ArithmeticError("independent BF replay did not isolate index one")
    bf_enclosure = _closed(
        data["bfEnclosure"],
        {"index", "tailBound", "zetaLogResidue"},
        "publication BF enclosure",
    )
    published_index = _publication_dyadic_ball(
        analytic, bf_enclosure["index"], "BF index"
    )
    published_tail = _publication_dyadic_ball(
        analytic, bf_enclosure["tailBound"], "BF tail"
    )
    published_zeta = _publication_dyadic_ball(
        analytic, bf_enclosure["zetaLogResidue"], "BF zeta residue"
    )
    try:
        published_index.intersection(index.index_ball)
        published_tail.intersection(tail)
        published_zeta.intersection(zeta)
    except ValueError as error:
        raise ArithmeticError(
            "published BF enclosure is disjoint from independent replay"
        ) from error
    quarter = analytic.RationalEndpoint(1, 4)
    if (
        published_index.lower.ceil() != 1
        or published_index.upper.floor() != 1
        or not published_tail.upper < quarter
    ):
        raise ArithmeticError("published BF tail does not prove the quarter bound")

    bdf_data = _closed(
        data["bdfPlan"], {"bound", "rawTerms", "terms"}, "publication BDF plan"
    )
    bdf_bound = _positive_decimal(bdf_data["bound"], "BDF bound")
    if bdf_bound > threshold:
        raise RelationMatrixError("BDF bound exceeds the replayed prime interval")
    aggregated: dict[tuple[int, int], int] = {}
    raw_bdf_terms = 0
    for prime in expected_primes:
        if prime >= bdf_bound:
            break
        for _ramification, residue_degree in splitting[prime]:
            norm = prime**residue_degree
            if norm >= bdf_bound:
                continue
            exponent = 1
            power = norm
            while power < bdf_bound:
                raw_bdf_terms += 1
                key = (norm, exponent)
                aggregated[key] = aggregated.get(key, 0) + 1
                exponent += 1
                power *= norm
    bdf_terms = tuple(
        (multiplicity, norm, exponent)
        for (norm, exponent), multiplicity in sorted(aggregated.items())
    )
    raw_published_bdf_terms = bdf_data["terms"]
    if not isinstance(raw_published_bdf_terms, list):
        raise RelationMatrixError("BDF terms must be an array")
    published_bdf_terms = tuple(
        tuple(_bounded_integer(value, "BDF term") for value in term)
        if isinstance(term, list) and len(term) == 3
        else ()
        for term in raw_published_bdf_terms
    )
    if (
        any(not term for term in published_bdf_terms)
        or _natural(bdf_data["rawTerms"], "BDF raw term count") != raw_bdf_terms
        or published_bdf_terms != bdf_terms
    ):
        raise ArithmeticError("BDF prime-power plan failed independent replay")
    bdf = factor_base.bdf_bound(
        field.maximal_order(),
        max_bound=bdf_bound,
        _compact_index_primes=True,
    )
    if int(bdf.bound) > bdf_bound:
        raise ArithmeticError("published BDF bound precedes the independent bound")
    evaluator = factor_base._BDFEvaluator(
        field.maximal_order(), bdf_bound, compact_index_primes=True
    )
    counted_terms, right_side, left_side = evaluator.inequality(
        bdf_bound,
        int(field.degree()),
        signature[0],
        abs(int(field.maximal_order().discriminant())),
        512,
    )
    if counted_terms != raw_bdf_terms or not right_side.lower > left_side.upper:
        raise ArithmeticError("independent BDF inequality is not strictly positive")
    independent_margin = right_side - left_side
    published_margin = _publication_dyadic_ball(
        analytic, data["bdfMargin"], "BDF margin"
    )
    if not analytic.RationalEndpoint(0) < published_margin.lower:
        raise ArithmeticError("published BDF margin is not strictly positive")
    bdf_interval = analytic.RealBall(
        analytic.RationalEndpoint(
            independent_margin.lower.numerator,
            independent_margin.lower.denominator,
        ),
        analytic.RationalEndpoint(
            independent_margin.upper.numerator,
            independent_margin.upper.denominator,
        ),
        precision_bits=512,
        rigorous=True,
        source="independent Sage.js BDF inequality",
    )
    try:
        published_margin.intersection(bdf_interval)
    except ValueError as error:
        raise ArithmeticError(
            "published BDF margin is disjoint from independent replay"
        ) from error
    return {
        "schema": "sagejs.rust-class-group/analytic-completion-replay-v1",
        "authority": "independent-sagejs-bf-and-bdf-directed-interval-replay",
        "bfThreshold": threshold,
        "bfRawTerms": plan.raw_terms,
        "bfAggregatedTerms": len(plan.terms),
        "bfIndex": 1,
        "bfTailBelowOneQuarter": True,
        "bdfBound": bdf_bound,
        "bdfSmallestIndependentBound": int(bdf.bound),
        "bdfRawTerms": raw_bdf_terms,
        "bdfAggregatedTerms": len(bdf_terms),
        "bdfStrictMargin": True,
        "hypothesis": "conditional-grh",
    }


def adapt_rust_public_cubic_publication_candidate(
    field: Any,
    publication_candidate: dict[str, Any],
    artifact_sha256: str,
) -> Any:
    """Independently replay the detached quotient and principal relations.

    This is deliberately an incomplete public result. It establishes the
    maximal-order field binding, every factor-base prime and principal
    relation, the compact small-surplus quotient certificate, compact units,
    regulator, and analytic completion. Public group construction and
    arbitrary-ideal dispatch remain separate boundaries, so this adapter does
    not yet claim an `IdealClassGroup` or complete unit group.
    """
    if (
        not isinstance(artifact_sha256, str)
        or len(artifact_sha256) != 64
        or any(character not in "0123456789abcdef" for character in artifact_sha256)
    ):
        raise RelationMatrixError("artifact identity is not a canonical SHA-256 digest")
    candidate = _canonical_json(publication_candidate, "publication candidate")
    top = _closed(
        candidate,
        {
            "analyticCompletion",
            "field",
            "maximalOrderCertificate",
            "presentation",
            "proofMode",
            "schema",
            "status",
            "units",
        },
        "publication candidate",
    )
    if (
        top["schema"] != PUBLICATION_CANDIDATE_SCHEMA
        or top["status"] != "detached-replay-required-before-publication"
        or top["proofMode"] != "conditional-grh"
    ):
        raise RelationMatrixError("unsupported publication candidate")
    prepared_input = prepare_cubic_for_rust(field)
    publication_basis, publication_table, field_replay = _replay_publication_field(
        field, top["field"], prepared_input
    )

    presentation_data = _closed(
        top["presentation"],
        {
            "bindingSha256",
            "classNumber",
            "factorBase",
            "factorBasePolicy",
            "generatorOrders",
            "invariantFactors",
            "latticeIndexEvidence",
            "principalRelations",
            "principalWitnessesSha256",
            "relationDependencies",
        },
        "publication presentation",
    )
    factor_base = presentation_data["factorBase"]
    relations = presentation_data["principalRelations"]
    if not isinstance(factor_base, list) or not isinstance(relations, list):
        raise RelationMatrixError("publication relations must be arrays")
    columns = len(factor_base)
    row_count = len(relations)
    if (
        columns == 0
        or columns > _MAX_PUBLICATION_COLUMNS
        or row_count <= columns
        or row_count > _MAX_PUBLICATION_RELATIONS
        or row_count - columns > _MAX_SURPLUS
    ):
        raise RelationMatrixError("publication relation shape exceeds replay limits")

    descriptor_keys = {
        "classCoordinates",
        "generator",
        "hnf",
        "indexZeroBased",
        "integralBasisRows",
        "norm",
        "prime",
        "ramification",
        "residueDegree",
    }
    old_catalog = []
    class_map_rows = []
    for expected, descriptor in enumerate(factor_base):
        descriptor = _closed(
            descriptor, descriptor_keys, "publication factor-base entry"
        )
        if _natural(descriptor["indexZeroBased"], "factor-base index") != expected:
            raise RelationMatrixError(
                "publication factor-base indices are not contiguous"
            )
        generator = descriptor["generator"]
        hnf = descriptor["hnf"]
        integral_rows = descriptor["integralBasisRows"]
        if (
            not isinstance(generator, list)
            or len(generator) != 3
            or not isinstance(hnf, list)
            or len(hnf) != 9
            or not isinstance(integral_rows, list)
            or len(integral_rows) != 3
            or any(not isinstance(row, list) or len(row) != 3 for row in integral_rows)
        ):
            raise RelationMatrixError("publication factor-base lattice is malformed")
        old_catalog.append(
            {
                "factorBaseIndexZeroBased": expected,
                "generator": [
                    _signed_decimal(value, "prime generator") for value in generator
                ],
                "hnf": [_signed_decimal(value, "prime HNF") for value in hnf],
                "integralBasisRows": [
                    [_signed_decimal(value, "integral ideal basis") for value in row]
                    for row in integral_rows
                ],
                "norm": _positive_decimal(descriptor["norm"], "prime norm"),
                "prime": _positive_decimal(descriptor["prime"], "rational prime"),
                "ramification": _positive_natural(
                    descriptor["ramification"], "ramification index"
                ),
                "residueDegree": _positive_natural(
                    descriptor["residueDegree"], "residue degree"
                ),
            }
        )
        class_map_rows.append(
            tuple(
                _signed_decimal(value, "class coordinate")
                for value in descriptor["classCoordinates"]
            )
        )

    relation_rows = []
    old_records = []
    factor_terms = 0
    for expected, record in enumerate(relations):
        record = _closed(
            record,
            {
                "primeIdealFactors",
                "principalElementIntegralBasisCoordinates",
                "relationIndexZeroBased",
            },
            "publication principal relation",
        )
        if _natural(record["relationIndexZeroBased"], "relation index") != expected:
            raise RelationMatrixError("publication relation indices are not contiguous")
        factors = record["primeIdealFactors"]
        if not isinstance(factors, list):
            raise RelationMatrixError("publication relation factors must be an array")
        factor_terms += len(factors)
        if factor_terms > _MAX_PUBLICATION_FACTOR_TERMS:
            raise RelationMatrixError("publication factor terms exceed replay limits")
        entries = []
        for factor in factors:
            factor = _closed(
                factor,
                {"exponent", "factorBaseIndexZeroBased"},
                "publication relation factor",
            )
            entries.append(
                (
                    _natural(factor["factorBaseIndexZeroBased"], "factor-base index"),
                    _positive_decimal(factor["exponent"], "relation exponent"),
                )
            )
        row = SparseRelationRow(columns, entries)
        relation_rows.append(row)
        old_records.append(
            {
                "relationIndexZeroBased": expected,
                "integralBasisCoordinates": record[
                    "principalElementIntegralBasisCoordinates"
                ],
                "primeIdealFactors": [
                    {"factorBaseIndexZeroBased": index, "exponent": exponent}
                    for index, exponent in entries
                ],
            }
        )

    raw_invariants = presentation_data["invariantFactors"]
    if not isinstance(raw_invariants, list) or len(raw_invariants) > _MAX_INVARIANTS:
        raise RelationMatrixError("publication invariant factors are malformed")
    invariants = tuple(
        _positive_decimal(value, "invariant factor") for value in raw_invariants
    )
    expected_class_number = 1
    for invariant in invariants:
        expected_class_number *= invariant
    if (
        _positive_decimal(presentation_data["classNumber"], "class number")
        != expected_class_number
    ):
        raise RelationMatrixError("publication class number has the wrong product")
    if any(len(row) != len(invariants) for row in class_map_rows):
        raise RelationMatrixError("publication class map has the wrong width")

    orders = presentation_data["generatorOrders"]
    if not isinstance(orders, list) or len(orders) != len(invariants):
        raise RelationMatrixError("publication generator-order count mismatch")
    generator_transforms = []
    order_combinations = []
    for expected, order in enumerate(orders):
        order = _closed(
            order,
            {
                "coordinateZeroBased",
                "factorBaseLift",
                "invariantFactor",
                "orderRelationCombination",
            },
            "publication generator order",
        )
        if (
            _natural(order["coordinateZeroBased"], "generator coordinate") != expected
            or _positive_decimal(order["invariantFactor"], "generator order")
            != invariants[expected]
        ):
            raise RelationMatrixError("publication generator order is not canonical")
        generator_transforms.append(
            _publication_sparse_vector(
                order["factorBaseLift"], columns, "indexZeroBased", "generator lift"
            )
        )
        order_combinations.append(
            _publication_sparse_vector(
                order["orderRelationCombination"],
                row_count,
                "indexZeroBased",
                "order relation combination",
            )
        )

    raw_dependencies = presentation_data["relationDependencies"]
    if (
        not isinstance(raw_dependencies, list)
        or len(raw_dependencies) != row_count - columns
    ):
        raise RelationMatrixError("publication dependency count mismatch")
    dependencies = [
        _publication_sparse_vector(
            terms, row_count, "indexZeroBased", "relation dependency"
        )
        for terms in raw_dependencies
    ]
    evidence = _closed(
        presentation_data["latticeIndexEvidence"],
        {
            "dependencySaturation",
            "method",
            "projectedDependencyDeterminant",
            "squareDeterminant",
            "squareRowIndicesZeroBased",
            "surplusRowIndicesZeroBased",
        },
        "publication lattice-index evidence",
    )
    if evidence["method"] != "compact-small-surplus":
        raise RelationMatrixError("detached dense quotient replay is not implemented")
    saturation = _closed(
        evidence["dependencySaturation"],
        {"criterion", "selectedMinors"},
        "publication dependency saturation",
    )
    if saturation["criterion"] != "gcd-of-exhibited-maximal-dependency-minors-is-one":
        raise RelationMatrixError("unsupported publication dependency proof")
    dependency_minors = []
    for minor in saturation["selectedMinors"]:
        minor = _closed(
            minor,
            {"determinant", "relationRowIndicesZeroBased"},
            "publication dependency minor",
        )
        dependency_minors.append(
            (
                tuple(
                    _natural(index, "dependency minor index")
                    for index in minor["relationRowIndicesZeroBased"]
                ),
                _positive_decimal(minor["determinant"], "dependency minor determinant"),
            )
        )
    dependency_minors.sort(key=_dependency_minor_key)
    presentation = CompactRelationPresentation.from_small_surplus(
        columns,
        relation_rows,
        invariants,
        class_map_rows,
        generator_transforms,
        dependencies,
        evidence["squareRowIndicesZeroBased"],
        evidence["surplusRowIndicesZeroBased"],
        _positive_decimal(evidence["squareDeterminant"], "square determinant"),
        _positive_decimal(
            evidence["projectedDependencyDeterminant"], "projected determinant"
        ),
        dependency_minors,
    )
    for modulus, lift, combination in zip(
        invariants, generator_transforms, order_combinations, strict=True
    ):
        left = tuple(modulus * value for value in lift)
        right = [0] * columns
        for coefficient, relation in zip(combination, relation_rows, strict=True):
            for column, value in relation.entries:
                right[column] += coefficient * value
        if left != tuple(right):
            raise RelationMatrixError(
                "publication generator-order witness failed replay"
            )
    if not presentation.verify():
        raise RelationMatrixError("publication quotient failed exact compact replay")

    prepared_result = {
        "relationLatticeEvidence": {
            "factorBaseCatalog": old_catalog,
            "relationRecords": old_records,
        }
    }
    factor_base_ideals, ideal_replay = _replay_relation_ideals(
        field,
        prepared_input,
        prepared_result,
        presentation,
        basis_override=publication_basis,
        table_override=publication_table,
    )
    unit_group, unit_certificates, unit_replay = _replay_publication_units(
        field,
        publication_basis,
        old_records,
        relation_rows,
        top["units"],
    )
    _regulator, regulator_replay = _replay_publication_regulator(
        unit_group, top["units"], top["analyticCompletion"]
    )
    analytic_replay = _replay_publication_analytic_completion(
        field, expected_class_number, unit_group, top["analyticCompletion"]
    )
    candidate_identity = _identity(candidate)
    context = RustCompactPresentationReplay(
        presentation,
        field,
        field.maximal_order(),
        publication_basis,
        factor_base_ideals,
        producer_input_id=prepared_input["inputId"],
        prepared_result_identity=candidate_identity,
        certificate_identity="sha256:" + artifact_sha256,
        factored_units=unit_group.generators,
        unit_certificates=unit_certificates,
    )
    groups = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )
    remaining = ("public-ideal-class-group-and-unit-group-construction",)
    diagnostics = {
        "schema": "sagejs.rust-class-group/publication-candidate-replay-v1",
        "automaticDispatch": False,
        "publicResultSupported": False,
        "artifactSha256": artifact_sha256,
        "publicationCandidateIdentity": candidate_identity,
        "fieldReplay": field_replay,
        "relationPresentationReplay": "exact-compact-small-surplus",
        "relationIdealReplay": ideal_replay,
        "compactUnitReplay": unit_replay,
        "regulatorReplay": regulator_replay,
        "analyticCompletionReplay": analytic_replay,
        "remainingEvidenceGaps": list(remaining),
    }
    return groups.ClassUnitComputation(
        field,
        proof_status=groups.INCOMPLETE_RESOURCE_LIMIT,
        complete=False,
        reason="the detached class/unit mathematics is independently replayed, but public group construction and arbitrary-ideal dispatch remain unfinished",
        algorithm="rust-public-cubic-publication-candidate-experimental",
        stages=(
            groups.ClassUnitStage(
                "rust-detached-publication-class-quotient-replay",
                "complete",
                {
                    "factorBaseSize": columns,
                    "relationCount": row_count,
                    "classNumber": expected_class_number,
                    "artifactSha256": artifact_sha256,
                },
            ),
            groups.ClassUnitStage(
                "sagejs-detached-compact-unit-replay",
                "complete",
                unit_replay,
            ),
            groups.ClassUnitStage(
                "sagejs-detached-regulator-replay",
                "complete",
                regulator_replay,
            ),
            groups.ClassUnitStage(
                "sagejs-detached-analytic-replay", "complete", analytic_replay
            ),
            groups.ClassUnitStage(
                "sagejs-public-class-unit-construction",
                "incomplete",
                {"missingEvidence": list(remaining)},
            ),
        ),
        unit_group=unit_group,
        tentative_invariants=invariants,
        context=context,
        diagnostics=diagnostics,
    )


__all__ = [
    "ARBITRARY_IDEAL_QUERY_SCHEMA",
    "PUBLICATION_CANDIDATE_SCHEMA",
    "RustCompactPresentationReplay",
    "adapt_rust_public_cubic_publication_candidate",
    "adapt_rust_prepared_cubic_v2_presentation",
]
