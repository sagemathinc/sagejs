"""Discovered adversarial tests for the Rust public-result adapter."""

from __future__ import annotations

import copy
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest


class FakeField:
    def __init__(self) -> None:
        self.field_id = "row6-live-field"
        self.polynomial = (2000000000018, -2000000000010, 0, 1)


class FakeUnitGroup:
    def __init__(self, evidence: object, proof_status: str) -> None:
        self._completion_evidence = evidence
        self.proof_status = proof_status
        self.complete = True

    def verify_completion(self) -> bool:
        return bool(self._completion_evidence.verify_completion())


class FakeIdealClassGroup:
    def __init__(
        self,
        invariants: tuple[int, ...],
        presentation: object,
        generator_ideals: tuple[object, ...],
        ideal_log: object,
        proof_record: object,
        proof_context: object,
        proof_status: str,
    ) -> None:
        self._invariants = invariants
        self._presentation_evidence = presentation
        self._generator_ideals = generator_ideals
        self._ideal_log = ideal_log
        self._proof_record = proof_record
        self._proof_context = proof_context
        self.proof_status = proof_status

    @property
    def proof_record(self) -> object:
        return self._proof_record

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def order(self) -> int:
        answer = 1
        for value in self._invariants:
            answer *= value
        return answer

    def gens_ideals(self) -> tuple[object, ...]:
        return self._generator_ideals

    def verify(self) -> bool:
        return True


class FakeClassUnitComputation:
    def __init__(
        self,
        field: object,
        *,
        proof_status: str,
        complete: bool,
        reason: str,
        algorithm: str,
        stages: tuple[object, ...],
        class_group: object = None,
        unit_group: object = None,
        tentative_invariants: tuple[int, ...] = (),
        diagnostics: object = None,
    ) -> None:
        self.field = field
        self.proof_status = proof_status
        self.complete = complete
        self.reason = reason
        self.algorithm = algorithm
        self.stages = stages
        self._class_group = class_group
        self._unit_group = unit_group
        self.tentative_invariants = tuple(tentative_invariants)
        self.diagnostics = diagnostics

    def class_group(self) -> object:
        if not self.complete:
            raise ValueError("incomplete")
        return self._class_group

    def unit_group(self) -> object:
        if self._unit_group is None:
            raise ValueError("missing units")
        return self._unit_group


# The production module pins these canonical import paths at module load.  The
# CPython qualification test supplies exact stand-ins under those paths because
# the Sage.js runtime modules themselves are executed by the Sage.js compiler.
sagejs_module = ModuleType("sagejs")
number_fields_module = ModuleType("sagejs.number_fields")
class_units_module = ModuleType("sagejs.number_fields.class_unit_groups")
class_maps_module = ModuleType("sagejs.number_fields.class_group_maps")
class_units_module.ClassUnitComputation = FakeClassUnitComputation
class_units_module.UnitGroupComputation = FakeUnitGroup
class_maps_module.IdealClassGroup = FakeIdealClassGroup
sys.modules["sagejs"] = sagejs_module
sys.modules["sagejs.number_fields"] = number_fields_module
sys.modules["sagejs.number_fields.class_unit_groups"] = class_units_module
sys.modules["sagejs.number_fields.class_group_maps"] = class_maps_module

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "rust_public_result_contract", HERE / "contract.py"
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load public-result contract")
contract = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = contract
SPEC.loader.exec_module(contract)

INPUT_ID = "sha256:" + "1" * 64
RESULT_ID = "sha256:" + "2" * 64
ARTIFACT = "3" * 64
FIELD_ID = "row6-live-field"
PRESENTATION_ID = "sha256:" + "4" * 64
GENERATOR_MAP_ID = "sha256:" + "5" * 64
POLYNOMIAL = (2000000000018, -2000000000010, 0, 1)


class FakeUnitEvidence:
    def __init__(self, field: object) -> None:
        self._field = field

    def verify_completion(self) -> bool:
        return True


class FakeProofContext:
    def __init__(self, relation_lattice: object) -> None:
        self.relation_lattice = relation_lattice


class AlienUnit(FakeUnitGroup):
    pass


def identity() -> dict[str, object]:
    return {
        "preparedInputId": INPUT_ID,
        "fieldId": FIELD_ID,
        "polynomialAscending": [str(value) for value in POLYNOMIAL],
        "artifactSha256": ARTIFACT,
        "presentationId": PRESENTATION_ID,
        "generatorMapId": GENERATOR_MAP_ID,
    }


IDEALS = [
    {
        "basisNumeratorsRowMajor": ["3", "0", "0"],
        "basisDenominator": "1",
        "norm": "3",
    },
    {
        "basisNumeratorsRowMajor": ["7", "0", "0"],
        "basisDenominator": "1",
        "norm": "7",
    },
]


def payloads(
    proof_status: str = contract.EXACT_RELATIONS_CONDITIONAL_GRH,
) -> dict[str, object]:
    relation = {
        "identity": identity(),
        "schema": "relation-lattice-v1",
        "rows": "1137",
    }
    presentation = {
        "identity": identity(),
        "schema": "compact-presentation-v1",
        "invariantFactors": ["2", "2"],
    }
    generators = {
        "identity": identity(),
        "schema": "generators-and-maps-v1",
        "invariantFactors": ["2", "2"],
        "generatorIdeals": copy.deepcopy(IDEALS),
        "mapPolicy": "exact-witness-per-query",
    }
    completion = {
        "identity": identity(),
        "schema": "completion-proof-v1",
        "complete": True,
        "proofStatus": proof_status,
        "dependencyDigests": {
            contract.RELATION_LATTICE: contract.component_sha256(
                contract.RELATION_LATTICE, relation
            ),
            contract.PRESENTATION: contract.component_sha256(
                contract.PRESENTATION, presentation
            ),
            contract.GENERATORS_MAP: contract.component_sha256(
                contract.GENERATORS_MAP, generators
            ),
        },
    }
    return {
        contract.RELATION_LATTICE: relation,
        contract.PRESENTATION: presentation,
        contract.GENERATORS_MAP: generators,
        contract.COMPLETION: completion,
    }


def binding(role: str, payload: object) -> dict[str, object]:
    return {
        "kind": role,
        "sha256": contract.component_sha256(role, payload),
        "replayable": True,
        "verified": True,
        "path": None,
    }


def raw_result(
    parts: dict[str, object], *, claim_status: str = contract.CANDIDATE
) -> dict[str, object]:
    if claim_status == contract.PUBLICLY_COMPLETE:
        claim: dict[str, object] = {
            "status": contract.PUBLICLY_COMPLETE,
            "publicComplete": True,
            "proofAuthority": contract.CONDITIONAL_GRH,
            "proofMode": contract.CONDITIONAL_GRH,
            "verificationSha256": "6" * 64,
        }
    else:
        claim = {
            "status": contract.CANDIDATE,
            "publicComplete": False,
            "proofAuthority": "none",
            "reason": "portable producer evidence only",
        }
    answer = {
        "schema": contract.RESULT_EVIDENCE_SCHEMA,
        "resultId": RESULT_ID,
        "inputId": INPUT_ID,
        "fieldId": FIELD_ID,
        "outcome": "completed",
        "requestedProof": contract.CONDITIONAL_GRH,
        "claim": claim,
        "classGroup": {
            "classNumber": "4",
            "invariantFactors": ["2", "2"],
            "generatorIdeals": copy.deepcopy(IDEALS),
        },
        "maps": None,
        "units": None,
        "evidence": {
            "relationLattice": binding(
                contract.RELATION_LATTICE, parts[contract.RELATION_LATTICE]
            ),
            "smith": binding(contract.PRESENTATION, parts[contract.PRESENTATION]),
            "completion": binding(contract.COMPLETION, parts[contract.COMPLETION]),
            "generatorsAndMaps": binding(
                contract.GENERATORS_MAP, parts[contract.GENERATORS_MAP]
            ),
            "independentChecks": [
                binding(contract.RELATION_LATTICE, parts[contract.RELATION_LATTICE])
            ],
        },
        "resourceUse": {
            "wallNanoseconds": "1",
            "peakLiveBytes": "1",
            "peakRssBytes": "1",
            "retries": 0,
        },
        "implementation": {
            "backend": "sagejs-rust-class-group",
            "version": "test",
            "artifactSha256": ARTIFACT,
            "linksPari": False,
            "usesOracleInput": False,
        },
        "failure": None,
    }
    if claim_status == contract.PUBLICLY_COMPLETE:
        replay = binding(contract.GENERATORS_MAP, parts[contract.GENERATORS_MAP])
        answer["maps"] = {
            "construction": "eager",
            "idealToClass": replay,
            "principality": replay,
            "verified": True,
        }
        answer["units"] = {
            "scope": "completion-only",
            "rank": 2,
            "torsionOrder": "2",
            "compactGenerators": [replay],
            "regulator": replay,
            "saturation": replay,
            "completeForClaim": True,
        }
    return answer


class ContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.field = FakeField()
        self.boundary = contract.trusted_boundary(
            live_field=self.field,
            canonical_prepared_input_id=INPUT_ID,
            loaded_artifact_sha256=ARTIFACT,
            requested_proof=contract.CONDITIONAL_GRH,
            trusted_field_id=FIELD_ID,
            trusted_polynomial_ascending=POLYNOMIAL,
            polynomial_reader=lambda field: field.polynomial,
            field_id_reader=lambda field: field.field_id,
        )
        self.parts = payloads()
        self.raw = raw_result(self.parts)

    def evidence(self, raw: object = None, parts: object = None) -> object:
        return contract.PortableResultEvidence(
            self.boundary,
            copy.deepcopy(self.raw if raw is None else raw),
            copy.deepcopy(self.parts if parts is None else parts),
        )

    def replayers(self) -> dict[str, object]:
        presentation = object()
        generators = (object(), object())

        def ideal_log(ideal: object) -> object:
            return ideal

        proof_record = object()
        relation_lattice = object()
        proof_context = FakeProofContext(relation_lattice)
        unit_evidence = FakeUnitEvidence(self.field)
        return {
            contract.RELATION_LATTICE: lambda request: contract.accept_relation_lattice(
                request, relation_lattice
            ),
            contract.PRESENTATION: lambda request: contract.accept_presentation(
                request, presentation
            ),
            contract.GENERATORS_MAP: lambda request: (
                contract.accept_generators_and_maps(request, generators, ideal_log)
            ),
            contract.COMPLETION: lambda request: contract.accept_completion(
                request, proof_record, proof_context, unit_evidence
            ),
        }

    def builder(self, material: object) -> object:
        group = FakeIdealClassGroup(
            (2, 2),
            material.presentation,
            material.generator_ideals,
            material.ideal_log,
            material.proof_record,
            material.proof_context,
            contract.EXACT_RELATIONS_CONDITIONAL_GRH,
        )
        computation = FakeClassUnitComputation(
            self.field,
            proof_status=contract.EXACT_RELATIONS_CONDITIONAL_GRH,
            complete=True,
            reason="",
            algorithm="rust-class-group-qualification",
            stages=(),
            class_group=group,
            unit_group=FakeUnitGroup(
                material.unit_completion_evidence,
                contract.EXACT_RELATIONS_CONDITIONAL_GRH,
            ),
        )
        return contract.seal_public_result(material, computation)

    def test_candidate_and_complete_use_existing_result_contract(self) -> None:
        evidence = self.evidence()
        incomplete = contract.adapt_public_result(evidence, {})
        self.assertIs(type(incomplete), FakeClassUnitComputation)
        self.assertFalse(incomplete.complete)
        self.assertEqual(incomplete.tentative_invariants, (2, 2))
        self.assertEqual(incomplete.diagnostics["adapterStatus"], contract.CANDIDATE)
        complete = contract.adapt_public_result(
            evidence, self.replayers(), builder=self.builder
        )
        self.assertIs(type(complete), FakeClassUnitComputation)
        self.assertTrue(complete.complete)
        self.assertIs(type(complete.class_group()), FakeIdealClassGroup)

    def test_callers_cannot_replace_the_canonical_result_types(self) -> None:
        with self.assertRaises(TypeError):
            contract.trusted_boundary(
                live_field=self.field,
                canonical_prepared_input_id=INPUT_ID,
                loaded_artifact_sha256=ARTIFACT,
                requested_proof=contract.CONDITIONAL_GRH,
                trusted_field_id=FIELD_ID,
                trusted_polynomial_ascending=POLYNOMIAL,
                polynomial_reader=lambda field: field.polynomial,
                field_id_reader=lambda field: field.field_id,
                class_unit_type=object,
            )
        self.assertIs(contract.ClassUnitComputation, FakeClassUnitComputation)
        self.assertIs(contract.IdealClassGroup, FakeIdealClassGroup)
        self.assertIs(contract.UnitGroupComputation, FakeUnitGroup)

    def test_round_trip_requires_fresh_replay_and_rejects_duplicate_keys(self) -> None:
        evidence = self.evidence()
        encoded = evidence.to_json()
        decoded = contract.PortableResultEvidence.from_json(
            encoded, copy.deepcopy(self.parts), self.boundary
        )
        self.assertEqual(encoded, decoded.to_json())
        self.assertFalse(contract.adapt_public_result(decoded, {}).complete)
        duplicate = encoded.replace(
            '"schema":"' + contract.RESULT_EVIDENCE_SCHEMA + '"',
            '"schema":"' + contract.RESULT_EVIDENCE_SCHEMA + '","schema":"bad"',
            1,
        )
        with self.assertRaises(ValueError):
            contract.PortableResultEvidence.from_json(
                duplicate, copy.deepcopy(self.parts), self.boundary
            )
        without_optional_path = copy.deepcopy(self.raw)
        del without_optional_path["evidence"]["smith"]["path"]
        contract.PortableResultEvidence(
            self.boundary, without_optional_path, copy.deepcopy(self.parts)
        )

    def test_parser_owns_deep_frozen_copies(self) -> None:
        raw = copy.deepcopy(self.raw)
        parts = copy.deepcopy(self.parts)
        evidence = contract.PortableResultEvidence(self.boundary, raw, parts)
        encoded = evidence.to_json()
        raw["classGroup"]["classNumber"] = "999"
        parts[contract.PRESENTATION]["invariantFactors"] = ["999"]
        self.assertEqual(evidence.to_json(), encoded)
        self.assertEqual(evidence.invariant_factors, (2, 2))

    def test_producer_public_claim_is_inert_and_not_serialized(self) -> None:
        evidence = self.evidence(
            raw=raw_result(self.parts, claim_status=contract.PUBLICLY_COMPLETE)
        )
        answer = contract.adapt_public_result(evidence, {})
        self.assertFalse(answer.complete)
        self.assertEqual(
            answer.diagnostics["portableClaimStatus"], contract.PUBLICLY_COMPLETE
        )
        with self.assertRaises(ValueError):
            evidence.to_json()

    def test_trusted_inputs_override_all_producer_identifiers(self) -> None:
        mutations = (
            lambda raw: raw.__setitem__("inputId", "sha256:" + "a" * 64),
            lambda raw: raw.__setitem__("fieldId", "other-field"),
            lambda raw: raw["implementation"].__setitem__("artifactSha256", "b" * 64),
            lambda raw: raw.__setitem__("requestedProof", contract.UNCONDITIONAL),
        )
        for mutation in mutations:
            counterfeit = copy.deepcopy(self.raw)
            mutation(counterfeit)
            with self.subTest(counterfeit=counterfeit):
                with self.assertRaises(ValueError):
                    self.evidence(raw=counterfeit)
        self.field.polynomial = (1, 0, 1)
        with self.assertRaises(ArithmeticError):
            self.evidence()

    def test_components_cross_bind_ids_and_domain_hashes(self) -> None:
        counterfeit = copy.deepcopy(self.parts)
        counterfeit[contract.PRESENTATION]["identity"]["generatorMapId"] = (
            "sha256:" + "9" * 64
        )
        with self.assertRaises(ValueError):
            self.evidence(raw=raw_result(counterfeit), parts=counterfeit)
        self.assertNotEqual(
            contract.component_sha256(
                contract.PRESENTATION, self.parts[contract.PRESENTATION]
            ),
            contract.component_sha256(
                contract.RELATION_LATTICE, self.parts[contract.PRESENTATION]
            ),
        )

    def test_stale_completion_and_generator_payloads_are_rejected(self) -> None:
        stale = copy.deepcopy(self.parts)
        stale[contract.GENERATORS_MAP]["generatorIdeals"][0]["norm"] = "5"
        raw = raw_result(stale)
        # Restore the old dependency to make the completion attachment stale.
        raw["evidence"]["completion"] = binding(
            contract.COMPLETION, stale[contract.COMPLETION]
        )
        with self.assertRaises((ArithmeticError, ValueError)):
            self.evidence(raw=raw, parts=stale)

    def test_callback_payload_is_frozen_and_live_identity_is_rechecked(self) -> None:
        evidence = self.evidence()
        with self.assertRaises(AttributeError):
            evidence.invariant_factors = (4,)

        def hostile(request: object) -> object:
            with self.assertRaises(TypeError):
                request.payload["rows"] = "0"
            self.field.field_id = "switched-field"
            return contract.accept_relation_lattice(request, object())

        with self.assertRaises(ArithmeticError):
            contract.adapt_public_result(evidence, {contract.RELATION_LATTICE: hostile})

    def test_acceptance_is_exact_sealed_and_boundary_bound(self) -> None:
        evidence = self.evidence()
        with self.assertRaises(TypeError):
            contract.adapt_public_result(
                evidence, {contract.RELATION_LATTICE: lambda request: True}
            )
        other_field = FakeField()
        other_boundary = contract.trusted_boundary(
            live_field=other_field,
            canonical_prepared_input_id=INPUT_ID,
            loaded_artifact_sha256=ARTIFACT,
            requested_proof=contract.CONDITIONAL_GRH,
            trusted_field_id=FIELD_ID,
            trusted_polynomial_ascending=POLYNOMIAL,
            polynomial_reader=lambda field: field.polynomial,
            field_id_reader=lambda field: field.field_id,
        )
        other = contract.PortableResultEvidence(
            other_boundary, copy.deepcopy(self.raw), copy.deepcopy(self.parts)
        )
        request = contract.ReplayRequest(
            contract._REQUEST_TOKEN,
            other,
            other.attachments[contract.RELATION_LATTICE],
        )
        foreign = contract.accept_relation_lattice(request, object())
        with self.assertRaises(ArithmeticError):
            contract.adapt_public_result(
                evidence, {contract.RELATION_LATTICE: lambda request: foreign}
            )

    def test_builder_must_consume_exact_verified_objects_and_types(self) -> None:
        evidence = self.evidence()

        def ignored(material: object) -> object:
            group = FakeIdealClassGroup(
                (2, 2),
                object(),
                (object(), object()),
                lambda ideal: ideal,
                object(),
                object(),
                contract.EXACT_RELATIONS_CONDITIONAL_GRH,
            )
            computation = FakeClassUnitComputation(
                self.field,
                proof_status=contract.EXACT_RELATIONS_CONDITIONAL_GRH,
                complete=True,
                reason="",
                algorithm="bad",
                stages=(),
                class_group=group,
                unit_group=FakeUnitGroup(
                    FakeUnitEvidence(self.field),
                    contract.EXACT_RELATIONS_CONDITIONAL_GRH,
                ),
            )
            return contract.seal_public_result(material, computation)

        with self.assertRaises(ArithmeticError):
            contract.adapt_public_result(evidence, self.replayers(), builder=ignored)
        with self.assertRaises(TypeError):
            contract.adapt_public_result(
                evidence,
                self.replayers(),
                builder=lambda material: FakeClassUnitComputation(
                    self.field,
                    proof_status=contract.EXACT_RELATIONS_CONDITIONAL_GRH,
                    complete=True,
                    reason="",
                    algorithm="unsealed",
                    stages=(),
                ),
            )

        def mutate_material(material: object) -> object:
            material.presentation = object()
            raise AssertionError("sealed material mutation unexpectedly succeeded")

        with self.assertRaises(AttributeError):
            contract.adapt_public_result(
                evidence, self.replayers(), builder=mutate_material
            )

    def test_live_identity_is_rechecked_after_builder(self) -> None:
        evidence = self.evidence()

        def switch_field(material: object) -> object:
            built = self.builder(material)
            self.field.polynomial = (1, 0, 1)
            return built

        with self.assertRaises(ArithmeticError):
            contract.adapt_public_result(
                evidence, self.replayers(), builder=switch_field
            )

    def test_requested_proof_compatibility_is_exact(self) -> None:
        unconditional = payloads(contract.EXACT_UNCONDITIONAL)
        raw = raw_result(unconditional)
        raw["requestedProof"] = contract.UNCONDITIONAL
        boundary = contract.trusted_boundary(
            live_field=self.field,
            canonical_prepared_input_id=INPUT_ID,
            loaded_artifact_sha256=ARTIFACT,
            requested_proof=contract.UNCONDITIONAL,
            trusted_field_id=FIELD_ID,
            trusted_polynomial_ascending=POLYNOMIAL,
            polynomial_reader=lambda field: field.polynomial,
            field_id_reader=lambda field: field.field_id,
        )
        evidence = contract.PortableResultEvidence(boundary, raw, unconditional)
        self.assertEqual(evidence.proof_status, contract.EXACT_UNCONDITIONAL)
        counterfeit = copy.deepcopy(unconditional)
        counterfeit[contract.COMPLETION]["proofStatus"] = (
            contract.EXACT_RELATIONS_CONDITIONAL_GRH
        )
        raw = raw_result(counterfeit)
        raw["requestedProof"] = contract.UNCONDITIONAL
        with self.assertRaises(ValueError):
            contract.PortableResultEvidence(boundary, raw, counterfeit)

    def test_complete_schema_fields_are_not_partially_mirrored(self) -> None:
        mutations = (
            lambda raw: raw["resourceUse"].__setitem__("wallNanoseconds", "01"),
            lambda raw: raw["resourceUse"].__setitem__("retries", True),
            lambda raw: raw["implementation"].__setitem__("version", ""),
            lambda raw: raw["evidence"].__setitem__("independentChecks", []),
            lambda raw: raw["evidence"]["independentChecks"][0].__setitem__(
                "replayable", "yes"
            ),
            lambda raw: raw["classGroup"]["generatorIdeals"][0].__setitem__(
                "norm", "0"
            ),
        )
        for mutation in mutations:
            counterfeit = copy.deepcopy(self.raw)
            mutation(counterfeit)
            with self.subTest(counterfeit=counterfeit):
                with self.assertRaises((TypeError, ValueError)):
                    self.evidence(raw=counterfeit)

        public = raw_result(self.parts, claim_status=contract.PUBLICLY_COMPLETE)
        public["maps"]["construction"] = "looks-fast"
        with self.assertRaises(ValueError):
            self.evidence(raw=public)
        public = raw_result(self.parts, claim_status=contract.PUBLICLY_COMPLETE)
        public["units"]["rank"] = "2"
        with self.assertRaises(TypeError):
            self.evidence(raw=public)

    def test_relation_lattice_must_reach_the_live_proof_context(self) -> None:
        evidence = self.evidence()
        replayers = self.replayers()

        def detached_completion(request: object) -> object:
            return contract.accept_completion(
                request,
                object(),
                FakeProofContext(object()),
                FakeUnitEvidence(self.field),
            )

        replayers[contract.COMPLETION] = detached_completion
        with self.assertRaises(ArithmeticError):
            contract.adapt_public_result(evidence, replayers, builder=self.builder)

    def test_exact_unit_type_and_live_field_evidence_are_required(self) -> None:
        evidence = self.evidence()

        def alien_builder(material: object) -> object:
            built = self.builder(material)
            built.computation._unit_group = AlienUnit(
                material.unit_completion_evidence,
                contract.EXACT_RELATIONS_CONDITIONAL_GRH,
            )
            return built

        with self.assertRaises(ArithmeticError):
            contract.adapt_public_result(
                evidence, self.replayers(), builder=alien_builder
            )

        other_field = FakeField()
        other_field.field_id = "other"
        replayers = self.replayers()

        def alien_evidence(request: object) -> object:
            relation = object()
            return contract.accept_completion(
                request,
                object(),
                FakeProofContext(relation),
                FakeUnitEvidence(other_field),
            )

        replayers[contract.COMPLETION] = alien_evidence
        with self.assertRaises(ArithmeticError):
            contract.adapt_public_result(evidence, replayers, builder=self.builder)

    def test_upstream_assumption_requires_separate_correspondence_replay(self) -> None:
        upstream = {
            "identity": identity(),
            "schema": "upstream-correspondence-v1",
            "pariResultSha256": "7" * 64,
        }
        parts = copy.deepcopy(self.parts)
        parts[contract.UPSTREAM_CORRESPONDENCE] = upstream
        raw = raw_result(parts)
        raw["claim"] = {
            "status": contract.UPSTREAM_ASSUMED,
            "publicComplete": False,
            "proofAuthority": "upstream-assumption",
            "reason": "qualified comparison only",
            "upstream": {
                "project": "PARI",
                "version": "2.17.4",
                "sourceSha256": "8" * 64,
                "algorithm": "bnfinit",
            },
            "assumptionsSha256": "9" * 64,
        }
        raw["evidence"]["independentChecks"].append(
            binding(contract.UPSTREAM_CORRESPONDENCE, upstream)
        )
        without_upstream = copy.deepcopy(parts)
        del without_upstream[contract.UPSTREAM_CORRESPONDENCE]
        with self.assertRaises(ValueError):
            contract.PortableResultEvidence(self.boundary, raw, without_upstream)

        evidence = contract.PortableResultEvidence(self.boundary, raw, parts)
        unreplayed = contract.adapt_public_result(evidence, {})
        self.assertEqual(unreplayed.diagnostics["adapterStatus"], contract.CANDIDATE)
        replayed = contract.adapt_public_result(
            evidence,
            {
                contract.UPSTREAM_CORRESPONDENCE: lambda request: (
                    contract.accept_upstream_correspondence(request, object())
                )
            },
        )
        self.assertEqual(
            replayed.diagnostics["adapterStatus"], contract.UPSTREAM_ASSUMED
        )

        malformed = copy.deepcopy(raw)
        malformed["claim"]["upstream"]["version"] = "future"
        with self.assertRaises(ValueError):
            contract.PortableResultEvidence(self.boundary, malformed, parts)


if __name__ == "__main__":
    unittest.main()
