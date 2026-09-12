"""Offline proof-policy contract mutations; never starts a CAS."""

import copy
from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import test_pari_explicit_output as pari
import test_hecke_witness_schema as hecke
import test_pair as pairing


HERE = Path(__file__).resolve().parent
supervisor, screen, review = pari.supervisor, pari.screen, pari.review
spec = importlib.util.spec_from_file_location(
    "fresh_policy_review", HERE / "summarize-screen.py"
)
fresh_review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fresh_review)
spec = importlib.util.spec_from_file_location(
    "policy_local_smoke", HERE.parent / "persistent/local-smoke.py"
)
local_smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local_smoke)


def execution(engine, iterations):
    if engine == "pari":
        return dict(
            method="pari-bnfcertify-full",
            flag=0,
            last_return="1",
            completed_iterations=iterations,
            certification_milliseconds="0",
        )
    return dict(
        method="hecke-class-and-unit-grh-false",
        class_group_grh=False,
        unit_group_grh=False,
        completed_iterations=iterations,
        class_group_call_nanoseconds="0",
        unit_group_call_nanoseconds="0",
    )


def result(engine, policy="conditional-grh", bits=200, iterations=1):
    value = pari.fixture() if engine == "pari" else hecke.answer()["result"]
    value.update(
        schema=f"sagejs-{engine}-frontier-screen-v3",
        bits=bits,
        iterations=iterations,
        seed="1",
        proof_policy=policy,
        proof_execution=execution(engine, iterations)
        if policy == "unconditional"
        else None,
        retained_iteration=iterations,
        batch_outputs_complete=iterations == 1,
    )
    reg = value["compact"]["regulator"]
    reg["fundamental_units_policy"] = policy
    if engine == "pari":
        reg["requested_working_bits"] = bits
    else:
        reg.update(bits=bits, display="1")
        value.update(
            boundary="persistent-process-fresh-field-complete-compact-screen",
            versions={"julia": "1.12.7", "hecke": "0.40.0", "nemo": "0.56.1"},
        )
    return value


def output(engine, value):
    return (
        pari.frames(value)
        if engine == "pari"
        else json.dumps({"status": "ok", "result": value})
    )


def check(engine, value, policy="conditional-grh", bits=200, iterations=1):
    return supervisor.validate_answer(
        engine,
        {"status": "ok", "stdout": output(engine, value), "stderr": ""},
        "field",
        2,
        bits,
        iterations,
        policy,
        require_current=True,
    )


def receipt(engine, policy):
    value = result(engine, policy)
    value["id"] = "sample-0001-field"
    return dict(
        schema="sagejs.general-frontier-persistent-screen.v2",
        engine=engine,
        requested_proof_policy=policy,
        stage="sample",
        status="ok",
        wall_seconds=1,
        record={"label": "field", "coefficients": ["5", "0", "1"]},
        bits=200,
        iterations=1,
        sample=1,
        declared_samples=1,
        request_id=value["id"],
        stdout=output(engine, value),
        stderr="",
        qualification_evidence=False,
        provenance={"test": "fixed-fixture"},
    )


class ProofPolicy(unittest.TestCase):
    def test_fixed_matrix_is_thirteen_requests_and_eight_proof_iterations(self):
        requests = local_smoke.matrix_requests()
        self.assertEqual(len(requests), 13)
        self.assertEqual(len({r["label"] for r in requests}), 13)
        self.assertEqual(
            sum(
                r["iterations"]
                for r in requests
                if r["proof_policy"] == "unconditional"
            ),
            8,
        )
        self.assertEqual(requests[-1]["coefficients"], ["-2", "0", "1"])
        self.assertEqual(
            {tuple(r["coefficients"]) for r in requests},
            {("5", "0", "1"), ("-2", "0", "1"), ("1", "0", "0", "0", "1")},
        )
        commands = pari.replay_commands(
            result("pari"), ["5", "0", "1"], native_identity=False
        )
        self.assertNotIn("bnfinit", "\n".join(commands))
        self.assertNotIn("bnfunits", "\n".join(commands))
        self.assertIn("decoded literal ideal equation", "\n".join(commands))

    def test_matrix_preflight_failure_is_immutable_and_starts_no_process(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = type(
                "Args",
                (),
                dict(
                    output=Path(tmp) / "failure",
                    seconds=180,
                    engine="pari",
                    executable=Path("missing"),
                    worker=Path("missing"),
                    project=None,
                    depot=None,
                ),
            )()
            with mock.patch.object(
                local_smoke.supervisor,
                "worker_factory",
                side_effect=FileNotFoundError("pinned runtime missing"),
            ) as factory:
                with self.assertRaises(FileNotFoundError):
                    local_smoke.proof_matrix(args)
                factory.assert_called_once()
            completion = json.loads((args.output / "completion.json").read_text())
            self.assertEqual(completion["completed_requests"], 0)
            self.assertTrue(completion["process_closed"])
            self.assertEqual(completion["status"], "error")
            self.assertTrue((args.output / "failure.json").exists())
            with self.assertRaises(FileExistsError):
                local_smoke.proof_matrix(args)

    def test_fresh_cli_encodes_policy_and_retains_interruption_without_refund(self):
        for engine, policy, interrupted in (
            ("pari", "conditional-grh", False),
            ("pari", "unconditional", False),
            ("hecke", "conditional-grh", False),
            ("hecke", "unconditional", False),
            ("pari", "unconditional", True),
        ):
            with (
                self.subTest(engine=engine, policy=policy, interrupted=interrupted),
                tempfile.TemporaryDirectory() as tmp,
            ):
                root = Path(tmp)
                for name in (
                    "executable",
                    "worker",
                    "Project.toml",
                    "Manifest.toml",
                    "transport.jl",
                ):
                    (root / name).write_text("offline fixture")
                (root / "input.json").write_text(
                    json.dumps([{"label": "field", "coefficients": ["5", "0", "1"]}])
                )
                argv = [
                    "screen-batch.py",
                    "--input",
                    str(root / "input.json"),
                    "--output",
                    str(root / "out"),
                    "--ledger",
                    str(root / "ledger.json"),
                    "--worker",
                    str(root / "worker"),
                    "--engine",
                    engine,
                    "--gp" if engine == "pari" else "--julia",
                    str(root / "executable"),
                ]
                if engine == "hecke":
                    argv += ["--project", str(root), "--depot", str(root)]
                if policy == "unconditional":
                    argv += ["--proof-policy", policy]
                transmitted = []

                class Child:
                    pid = 12345
                    returncode = -9 if interrupted else 0

                    def __init__(self, command, **kwargs):
                        self.stdout = kwargs["stdout"]

                    def communicate(self, request, timeout):
                        transmitted.append(request)
                        if interrupted:
                            raise InterruptedError("offline interruption")
                        self.stdout.write(output(engine, result(engine, policy)))
                        self.stdout.flush()

                    def wait(self):
                        return self.returncode

                real_open = open

                def scoped_open(path, *args, **kwargs):
                    return real_open(
                        root / "offline.lock"
                        if str(path) == "/tmp/sagejs-opt-timing.lock"
                        else path,
                        *args,
                        **kwargs,
                    )

                with ExitStack() as stack:
                    for target, replacement in (
                        ("subprocess.Popen", Child),
                        (
                            "subprocess.check_output",
                            mock.Mock(return_value="offline-version"),
                        ),
                        ("require_controls", mock.Mock(return_value={"offline": True})),
                        ("os.killpg", mock.Mock()),
                        ("signal.signal", mock.Mock()),
                    ):
                        owner = screen
                        parts = target.split(".")
                        for part in parts[:-1]:
                            owner = getattr(owner, part)
                        stack.enter_context(
                            mock.patch.object(owner, parts[-1], replacement)
                        )
                    stack.enter_context(
                        mock.patch.object(screen, "open", scoped_open, create=True)
                    )
                    stack.enter_context(mock.patch.object(sys, "argv", argv))
                    stack.enter_context(mock.patch("builtins.print"))
                    if interrupted:
                        with self.assertRaises(InterruptedError):
                            screen.main()
                    else:
                        screen.main()
                receipt = json.loads((root / "out/field.json").read_text())
                self.assertEqual(receipt["requested_proof_policy"], policy)
                self.assertEqual(
                    receipt["status"], "interrupted" if interrupted else "ok"
                )
                self.assertIn(policy, transmitted[0])
                ledger = json.loads((root / "ledger.json").read_text())
                self.assertEqual(ledger["limit_seconds"], screen.LIMIT)
                if interrupted:
                    self.assertEqual(ledger["charged_seconds"], 610)
                    self.assertEqual(ledger["pending"]["reserved_seconds"], 70)
                else:
                    self.assertIsNone(ledger["pending"])

    def test_both_policies_bits_and_last_iteration(self):
        for engine in ("pari", "hecke"):
            for policy in screen.PROOF_POLICIES:
                for bits in (100, 200):
                    for iterations in (1, 2):
                        with self.subTest(
                            engine=engine,
                            policy=policy,
                            bits=bits,
                            iterations=iterations,
                        ):
                            value = result(engine, policy, bits, iterations)
                            self.assertEqual(
                                check(engine, value, policy, bits, iterations), "ok"
                            )
                            self.assertIs(
                                value["batch_outputs_complete"], iterations == 1
                            )
                            self.assertFalse(value["independent_replay"])

    def test_policy_enum_encodings_and_invalid_inputs(self):
        for engine in ("pari", "hecke"):
            for policy in screen.PROOF_POLICIES:
                payload, _ = supervisor.encode_request(
                    engine, "field", ["5", "0", "1"], 100, 1, 2, policy
                )
                fresh = screen.encode_fresh_request(
                    engine, "", "field", ["5", "0", "1"], policy
                )
                for text in (payload.decode(), fresh):
                    if engine == "hecke":
                        self.assertEqual(len(text.strip().split("\t")), 7)
                        self.assertTrue(text.startswith("FRONTIER2\t"))
                        self.assertEqual(text.strip().split("\t")[5], policy)
                    else:
                        self.assertIn(',"' + policy + '");', text)
                for invalid in (
                    None,
                    True,
                    False,
                    0,
                    "",
                    "Unconditional",
                    "grh",
                    'unconditional");quit',
                ):
                    with self.assertRaises(ValueError):
                        supervisor.encode_request(
                            engine, "field", ["5", "0", "1"], 100, 1, 1, invalid
                        )
                    with self.assertRaises(ValueError):
                        screen.encode_fresh_request(
                            engine, "", "field", ["5", "0", "1"], invalid
                        )

    def test_missing_spliced_and_noncanonical_worker_policy(self):
        for engine in ("pari", "hecke"):
            for key, changed in (
                ("proof_policy", None),
                ("proof_policy", True),
                ("proof_policy", "conditional-grh"),
                ("proof_execution", None),
                ("retained_iteration", True),
                ("batch_outputs_complete", 1),
            ):
                value = result(engine, "unconditional")
                value[key] = changed
                self.assertNotEqual(
                    check(engine, value, "unconditional"), "ok", (engine, key)
                )
            for key in (
                "proof_policy",
                "proof_execution",
                "retained_iteration",
                "batch_outputs_complete",
            ):
                value = result(engine, "unconditional")
                del value[key]
                self.assertNotEqual(check(engine, value, "unconditional"), "ok")
            value = result(engine, "unconditional")
            value["compact"]["regulator"]["fundamental_units_policy"] = (
                "conditional-grh"
            )
            self.assertNotEqual(check(engine, value, "unconditional"), "ok")
            value = result(engine)
            value["proof_execution"] = execution(engine, 1)
            self.assertNotEqual(check(engine, value), "ok")
            value = result(engine)
            self.assertNotEqual(check(engine, value, "unconditional"), "ok")

    def test_full_proof_record_mutations(self):
        for engine in ("pari", "hecke"):
            base = result(engine, "unconditional", iterations=2)
            for key in base["proof_execution"]:
                value = copy.deepcopy(base)
                del value["proof_execution"][key]
                self.assertNotEqual(
                    check(engine, value, "unconditional", iterations=2), "ok"
                )
            mutations = [
                ("method", "trusted"),
                ("completed_iterations", 1),
                ("completed_iterations", True),
                ("completed_iterations", "2"),
                ("extra", 0),
            ]
            if engine == "pari":
                mutations += [
                    ("flag", 1),
                    ("flag", False),
                    ("flag", "0"),
                    ("last_return", "0"),
                    ("last_return", 1),
                    ("last_return", True),
                ]
                durations = ["certification_milliseconds"]
            else:
                mutations += [
                    (key, bad)
                    for key in ("class_group_grh", "unit_group_grh")
                    for bad in (True, 0, "false")
                ]
                durations = [
                    "class_group_call_nanoseconds",
                    "unit_group_call_nanoseconds",
                ]
            mutations += [
                (key, bad)
                for key in durations
                for bad in (0, True, -1, "-1", "01", "1.5", "NaN")
            ]
            for key, bad in mutations:
                value = copy.deepcopy(base)
                value["proof_execution"][key] = bad
                self.assertNotEqual(
                    check(engine, value, "unconditional", iterations=2),
                    "ok",
                    (engine, key, bad),
                )

    def test_historical_receipts_remain_conditional(self):
        for engine in ("pari", "hecke"):
            old = pari.fixture() if engine == "pari" else hecke.answer()["result"]
            response = {"status": "ok", "stdout": output(engine, old), "stderr": ""}
            self.assertEqual(
                supervisor.validate_answer(engine, response, "field", 2), "ok"
            )
            self.assertNotEqual(
                supervisor.validate_answer(
                    engine, response, "field", 2, proof_policy="unconditional"
                ),
                "ok",
            )
            self.assertNotEqual(check(engine, old), "ok")
            before = copy.deepcopy(old)
            self.assertEqual(
                screen.receipt_policy({"schema": "historical.v1"}), "conditional-grh"
            )
            for bad in (
                {"proof_policy": "unconditional"},
                {"requested_proof_policy": "unconditional"},
            ):
                with self.assertRaises(ValueError):
                    screen.receipt_policy(dict(schema="historical.v1", **bad))
            self.assertEqual(old, before)

    def test_success_only_exposes_completed_policy(self):
        for engine in ("pari", "hecke"):
            for policy in screen.PROOF_POLICIES:
                value = receipt(engine, policy)
                row = review.normalize(value)
                self.assertEqual(row["status"], "ok")
                self.assertEqual(row["requested_proof_policy"], policy)
                self.assertEqual(row["proof_policy"], policy)
                self.assertEqual(
                    row["proof_execution"],
                    execution(engine, 1) if policy == "unconditional" else None,
                )
                for failure in (
                    "error",
                    "timeout",
                    "output-limit",
                    "crash",
                    "interrupted",
                ):
                    changed = dict(value, status=failure)
                    row = review.normalize(changed)
                    self.assertEqual(row["status"], failure)
                    self.assertEqual(row["requested_proof_policy"], policy)
                    self.assertNotIn("proof_policy", row)
                    self.assertNotIn("proof_execution", row)
                value["requested_proof_policy"] = (
                    "unconditional"
                    if policy == "conditional-grh"
                    else "conditional-grh"
                )
                row = review.normalize(value)
                self.assertNotEqual(row["status"], "ok")
                self.assertNotIn("proof_policy", row)

    def test_run_receipt_policy_join_including_nonsamples(self):
        for engine in ("pari", "hecke"):
            value = receipt(engine, "unconditional")
            run = dict(
                schema="sagejs.general-frontier-persistent-request.v2",
                engine=engine,
                requested_proof_policy="unconditional",
                records=[value["record"]],
                provenance=value["provenance"],
            )
            with tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                (directory / "run.json").write_text(json.dumps(run))
                (directory / "field.json").write_text(json.dumps(value))
                self.assertEqual(review.summarize(directory)["rows"][0]["status"], "ok")
                for stage in ("sample", "warmup", "startup", "shutdown"):
                    bad = dict(
                        value, stage=stage, requested_proof_policy="conditional-grh"
                    )
                    (directory / "field.json").write_text(json.dumps(bad))
                    with self.assertRaises(ValueError):
                        review.summarize(directory)
                (directory / "field.json").write_text(json.dumps(value))
                del run["requested_proof_policy"]
                (directory / "run.json").write_text(json.dumps(run))
                with self.assertRaises(KeyError):
                    review.summarize(directory)

    def test_pairing_matches_requested_and_completed_policy(self):
        for policy in screen.PROOF_POLICIES:
            a, b = pairing.fixture("pari", 10**9), pairing.fixture("hecke", 10**9)
            for report in (a, b):
                report["requested_proof_policy"] = policy
                report["rows"][0].update(
                    requested_proof_policy=policy,
                    proof_policy=policy,
                    worker_schema=f"sagejs-{report['engine']}-frontier-screen-v3",
                    proof_execution=execution(report["engine"], 1)
                    if policy == "unconditional"
                    else None,
                    retained_iteration=1,
                    batch_outputs_complete=True,
                    regulator=result(report["engine"], policy)["compact"]["regulator"],
                )
            self.assertEqual(
                pairing.pairs.pair(a, b)["rows"][0]["status"], "paired-discovery"
            )
            for location in ("report", "requested", "completed"):
                changed = copy.deepcopy(b)
                other = (
                    "conditional-grh" if policy == "unconditional" else "unconditional"
                )
                if location == "report":
                    changed["requested_proof_policy"] = other
                else:
                    changed["rows"][0][
                        "requested_proof_policy"
                        if location == "requested"
                        else "proof_policy"
                    ] = other
                with self.assertRaises(ValueError):
                    pairing.pairs.pair(a, changed)
            if policy == "unconditional":
                for key, bad in (
                    ("worker_schema", "sagejs-hecke-frontier-screen-v2"),
                    ("proof_execution", None),
                ):
                    changed = copy.deepcopy(b)
                    changed["rows"][0][key] = bad
                    with self.assertRaises(ValueError):
                        pairing.pairs.pair(a, changed)

    def test_fresh_receipt_policy_and_identity(self):
        for policy in screen.PROOF_POLICIES:
            value = result("pari", policy)
            raw = dict(
                schema="sagejs.general-frontier-pari-cost-screen.v2",
                requested_proof_policy=policy,
                label="field",
                coefficients=["5", "0", "1"],
                request_id="field",
                bits=200,
                iterations=1,
                seed="1",
                stdout=output("pari", value),
                stderr="",
                status="ok",
                exit_code=0,
                wall_seconds=1,
            )
            with tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                path = directory / "field.json"
                path.write_text(json.dumps(raw))
                self.assertEqual(
                    fresh_review.summarize(directory)["rows"][0]["proof_policy"], policy
                )
                raw["status"] = "interrupted"
                path.write_text(json.dumps(raw))
                row = fresh_review.summarize(directory)["rows"][0]
                self.assertEqual(row["reviewed_status"], "interrupted")
                self.assertNotIn("proof_policy", row)
                raw["bits"] = 100
                path.write_text(json.dumps(raw))
                with self.assertRaises(ValueError):
                    fresh_review.summarize(directory)

    def test_cli_policy_choices_fail_before_runtime_or_controls(self):
        common = [
            "--input",
            "missing",
            "--output",
            "missing",
            "--ledger",
            "missing",
            "--worker",
            "missing",
        ]
        for path, options in (
            (HERE / "screen-batch.py", ["--engine", "pari", "--gp", "missing"]),
            (
                HERE.parent / "persistent/supervisor.py",
                ["--engine", "pari", "--executable", "missing"],
            ),
        ):
            for bad in ("true", "Unconditional", "", "missing"):
                response = subprocess.run(
                    [
                        sys.executable,
                        "-B",
                        str(path),
                        *common,
                        *options,
                        "--proof-policy",
                        bad,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                self.assertNotEqual(response.returncode, 0)
                self.assertIn("invalid choice", response.stderr)
            help_result = subprocess.run(
                [sys.executable, "-B", str(path), "--help"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            self.assertIn(
                "--proof-policy {conditional-grh,unconditional}", help_result.stdout
            )

    def test_source_owners_and_entrypoints_are_explicit(self):
        root = HERE.parent
        gp = (root / "pari-screen.gp").read_text()
        self.assertIn("certified = bnfcertify(b, 0);", gp)
        self.assertIn('type(certified) != "t_INT" || certified != 1', gp)
        self.assertNotIn("bnfcertify(b, 1)", gp)
        julia = (root / "hecke/screen.jl").read_text()
        self.assertIn("class_group(O; GRH=grh)", julia)
        self.assertIn("unit_group_fac_elem(O; GRH=grh)", julia)
        self.assertIn("request.seed, request.proof_policy)", julia)
        bootstrap = (root / "persistent/hecke-bootstrap.jl").read_text()
        self.assertIn("request.seed, request.proof_policy)", bootstrap)


if __name__ == "__main__":
    unittest.main()
