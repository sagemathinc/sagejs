"""Offline whole-batch retention contracts; no CAS or mathematical proof claim."""

import copy
import json
from pathlib import Path
import unittest
from unittest import mock

import test_proof_policy as policy_tests

screen = policy_tests.screen
supervisor = policy_tests.supervisor
review = policy_tests.review


def fixture(engine, policy="conditional-grh", bits=200, iterations=3):
    result = policy_tests.result(engine, policy, bits, iterations)
    result.update(
        schema=f"sagejs-{engine}-frontier-screen-v4",
        seed_scope="once-per-batch",
        batch_outputs_complete=True,
        iteration_outputs=[
            dict(
                iteration=i,
                compact=copy.deepcopy(result["compact"]),
                proof_execution=policy_tests.execution(engine, 1)
                if policy == "unconditional"
                else None,
            )
            for i in range(1, iterations + 1)
        ],
    )
    return result


def check(engine, value, policy="conditional-grh", bits=200, iterations=3):
    return policy_tests.check(engine, value, policy, bits, iterations)


class BatchEvidence(unittest.TestCase):
    def test_live_matrix_is_frozen_and_replays_all_thirty_six_outputs(self):
        smoke = policy_tests.local_smoke
        requests = smoke.matrix_requests(batch_evidence=True)
        self.assertEqual(len(requests), 24)
        self.assertEqual(sum(r["iterations"] for r in requests), 36)
        self.assertEqual(
            sum(
                r["iterations"]
                for r in requests
                if r["proof_policy"] == "unconditional"
            ),
            18,
        )
        self.assertEqual(len({r["label"] for r in requests}), 24)
        self.assertEqual({r["bits"] for r in requests}, {100, 200})
        decoded = [
            fixture("pari", r["proof_policy"], r["bits"], 2)
            if r["iterations"] == 2
            else policy_tests.result("pari", r["proof_policy"], r["bits"])
            for r in requests
        ]
        calls = []

        def emit(value, coefficients, native_identity):
            self.assertFalse(native_identity)
            calls.append((value["compact"], coefficients))
            return ["checked"]

        commands = smoke.pari_toy_commands(decoded, requests, emit)
        self.assertEqual(len(commands), 36)
        self.assertEqual(len(calls), 36)
        for index, result in enumerate(decoded):
            for compact in smoke.retained_compacts(result):
                self.assertTrue(
                    any(
                        c is compact and coefficients == requests[index]["coefficients"]
                        for c, coefficients in calls
                    )
                )
        with self.assertRaises(ValueError):
            smoke.pari_toy_commands(decoded[:-1], requests, emit)

    def test_hecke_toy_replay_requires_each_member_not_last_only(self):
        smoke = policy_tests.local_smoke
        value = fixture("hecke")
        checks = dict(
            scope="test-only-decoded-exact-payload-not-independent-proof",
            literal_equations=4,
            rejected_mutations=4,
            class_powers=1,
            units=1,
        )
        toy = dict(
            scope="test-only-every-batch-output-not-independent-proof",
            iteration_checks=[
                dict(iteration=i, checks=copy.deepcopy(checks)) for i in range(1, 4)
            ],
        )
        smoke.validate_hecke_toys(value, toy)
        for mutate in (
            lambda t: t["iteration_checks"].pop(0),
            lambda t: t["iteration_checks"].reverse(),
            lambda t: t["iteration_checks"][0]["checks"].update(rejected_mutations=0),
            lambda t: t["iteration_checks"][0]["checks"].update(units=True),
            lambda t: t["iteration_checks"][0]["checks"].update(class_powers=True),
            lambda t: t["iteration_checks"][0]["checks"].update(unknown=1),
            lambda t: t["iteration_checks"][0].update(iteration=True),
        ):
            changed = copy.deepcopy(toy)
            mutate(changed)
            with self.assertRaises(ValueError):
                smoke.validate_hecke_toys(value, changed)

    def test_singleton_discovery_pairer_explicitly_rejects_batches(self):
        pairing = policy_tests.pairing
        a, b = pairing.fixture("pari", 10**9), pairing.fixture("hecke", 10**9)
        a["iterations"] = 3
        with self.assertRaisesRegex(ValueError, "single-field"):
            pairing.pairs.pair(a, b)

    def test_all_engines_policies_precisions_and_complete_outputs(self):
        for engine in ("pari", "hecke"):
            for policy in screen.PROOF_POLICIES:
                for bits in (100, 200):
                    value = fixture(engine, policy, bits)
                    self.assertEqual(check(engine, value, policy, bits), "ok")
                    views = screen.batch_iteration_views(value, engine, policy, 3)
                    self.assertEqual(len(views), 3)
                    self.assertTrue(value["batch_outputs_complete"])
                    self.assertFalse(value["independent_replay"])
                    self.assertEqual(views[0]["compact"], value["compact"])

    def test_scope_omissions_duplicates_reordering_and_unknown_fields(self):
        for engine in ("pari", "hecke"):
            for mutate in (
                lambda v: v.pop("iteration_outputs"),
                lambda v: v["iteration_outputs"].pop(0),
                lambda v: v["iteration_outputs"].reverse(),
                lambda v: v["iteration_outputs"].__setitem__(
                    1, v["iteration_outputs"][0]
                ),
                lambda v: v["iteration_outputs"][0].update(iteration=True),
                lambda v: v["iteration_outputs"][0].update(unknown=1),
                lambda v: v.update(unknown=1),
                lambda v: v.update(seed_scope="per-iteration"),
                lambda v: v.update(iterations=True),
                lambda v: v.update(retained_iteration=2),
                lambda v: v.update(batch_outputs_complete=False),
                lambda v: v.update(bits=100),
                lambda v: v.update(id="another-field"),
                lambda v: v.update(seed="2"),
                lambda v: v.update(independent_replay=True),
            ):
                value = fixture(engine)
                mutate(value)
                self.assertNotEqual(check(engine, value), "ok", (engine, mutate))
            self.assertNotEqual(
                check(engine, fixture(engine, iterations=1), iterations=1), "ok"
            )

    def test_every_earlier_compact_is_checked_not_only_last(self):
        for engine in ("pari", "hecke"):
            for mutate in (
                lambda c: c.update(signature=[9, 9]),
                lambda c: c.update(discriminant="-24"),
                lambda c: c.update(class_number="999"),
                lambda c: c["integral_basis"][0].append("0"),
                lambda c: c["unit_coordinates"][0].append("0"),
                lambda c: c["regulator"].update(
                    fundamental_units_policy="unconditional"
                ),
                lambda c: c["regulator"].update(guarantee="invented-guarantee"),
                lambda c: c["decompositions"][0].update(
                    generator_product_witness="opaque"
                ),
            ):
                value = fixture(engine)
                mutate(value["iteration_outputs"][0]["compact"])
                self.assertNotEqual(check(engine, value), "ok", (engine, mutate))
            value = fixture(engine)
            # Individually well-shaped but summary is not the retained last output.
            value["iteration_outputs"][-1]["compact"]["units"] = []
            self.assertNotEqual(check(engine, value), "ok")

    def test_each_proof_execution_and_aggregate_are_bound(self):
        for engine in ("pari", "hecke"):
            for mutate in (
                lambda p: p.update(completed_iterations=3),
                lambda p: p.update(method="invented-proof"),
                lambda p: p.clear(),
            ):
                value = fixture(engine, "unconditional")
                mutate(value["iteration_outputs"][0]["proof_execution"])
                self.assertNotEqual(check(engine, value, "unconditional"), "ok")
            name = (
                "certification_milliseconds"
                if engine == "pari"
                else "unit_group_call_nanoseconds"
            )
            value = fixture(engine, "unconditional")
            value["iteration_outputs"][0]["proof_execution"][name] = "7"
            self.assertNotEqual(check(engine, value, "unconditional"), "ok")
            value["proof_execution"][name] = "7"
            self.assertEqual(check(engine, value, "unconditional"), "ok")
            value["iteration_outputs"][0]["proof_execution"][name] = "07"
            self.assertNotEqual(check(engine, value, "unconditional"), "ok")
            value = fixture(engine, "conditional-grh")
            value["iteration_outputs"][0]["proof_execution"] = policy_tests.execution(
                engine, 1
            )
            self.assertNotEqual(check(engine, value), "ok")

    def test_normalization_retains_every_output_and_unmatched_guarantees(self):
        for engine in ("pari", "hecke"):
            for policy in screen.PROOF_POLICIES:
                value = fixture(engine, policy)
                value["id"] = "sample-0001-field"
                receipt = policy_tests.receipt(engine, policy)
                receipt.update(iterations=3, stdout=policy_tests.output(engine, value))
                row = review.normalize(receipt)
                self.assertEqual(row["status"], "ok")
                self.assertEqual(row["iteration_outputs"], value["iteration_outputs"])
                self.assertEqual(row["seed_scope"], "once-per-batch")
                self.assertTrue(row["batch_outputs_complete"])
                self.assertEqual(
                    row["regulator"]["guarantee"],
                    value["compact"]["regulator"]["guarantee"],
                )
                receipt["status"] = "timeout"
                row = review.normalize(receipt)
                self.assertEqual(row["status"], "timeout")
                self.assertNotIn("iteration_outputs", row)
                self.assertNotIn("proof_execution", row)

    def test_duplicate_json_fields_and_partial_terminal_fail_closed(self):
        for engine in ("pari", "hecke"):
            output = policy_tests.output(engine, fixture(engine))
            for malformed in (
                output.replace('"iteration": 1', '"iteration": 1, "iteration": 1', 1),
                output[:-5],
            ):
                response = dict(status="ok", stdout=malformed, stderr="")
                self.assertNotEqual(
                    supervisor.validate_answer(
                        engine, response, "field", 2, 200, 3, require_current=True
                    ),
                    "ok",
                )

    def test_response_caps_and_fresh_source_contract(self):
        value = fixture("hecke")
        with mock.patch.object(screen, "OUTPUT_CAP", 100):
            self.assertEqual(
                screen.validate_hecke_terminal(
                    policy_tests.output("hecke", value),
                    "",
                    "field",
                    0,
                    False,
                    False,
                    expected_iterations=3,
                ),
                "output-limit",
            )
        for engine in ("pari", "hecke"):
            validator = (
                screen.validate_terminal
                if engine == "pari"
                else screen.validate_hecke_terminal
            )
            self.assertEqual(validator("", "", "field", 0, False, True), "output-limit")
        root = Path(__file__).resolve().parents[1]
        gp = (root / "pari-screen.gp").read_text()
        julia = (root / "hecke/screen.jl").read_text()
        self.assertIn("b = bnfinit(polynomial, 1)", gp)
        self.assertIn("certified = bnfcertify(b, 0)", gp)
        self.assertIn("retained_bytes + #materialized + 65536 > 32*1024*1024", gp)
        self.assertIn('number_field(polynomial, "a"; cached=false)', julia)
        self.assertIn("unit_group_fac_elem(O; GRH=grh)", julia)
        self.assertIn(
            "retained_bytes + ncodeunits(materialized) + 65536 <= 32 * 1024 * 1024",
            julia,
        )

    def test_historical_v3_last_only_scope_is_unchanged(self):
        for engine in ("pari", "hecke"):
            value = policy_tests.result(engine, iterations=3)
            self.assertEqual(check(engine, value), "ok")
            self.assertFalse(value["batch_outputs_complete"])
            self.assertNotIn("iteration_outputs", value)
            value["batch_outputs_complete"] = True
            self.assertNotEqual(check(engine, value), "ok")


if __name__ == "__main__":
    unittest.main()
