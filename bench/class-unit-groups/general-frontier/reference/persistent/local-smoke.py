"""Optional local-only live protocol check; no controlled-performance evidence."""

import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import time
import uuid


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "persistent_screen", HERE / "supervisor.py"
)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


TOY_FIELDS = (
    ("rank-zero", ["5", "0", "1"], "2", "-20", [0, 1], "2"),
    ("rank-one", ["-2", "0", "1"], "1", "8", [2, 0], "2"),
    ("torsion-eight", ["1", "0", "0", "0", "1"], "1", "256", [0, 2], "8"),
)


def matrix_requests(batch_evidence=False):
    requests = []
    for policy in supervisor.shared.PROOF_POLICIES:
        for bits in (100, 200):
            for name, coefficients, h, disc, signature, torsion in TOY_FIELDS:
                requests.append(
                    dict(
                        label=f"proof-{policy}-{name}-{bits}",
                        coefficients=coefficients,
                        proof_policy=policy,
                        bits=bits,
                        iterations=1,
                        expected=dict(
                            class_number=h,
                            discriminant=disc,
                            signature=signature,
                            torsion_order=torsion,
                        ),
                    )
                )
    if batch_evidence:
        requests += [
            dict(r, label=r["label"] + "-batch", iterations=2) for r in requests
        ]
    else:
        requests.append(
            dict(requests[7], label="proof-unconditional-batch", bits=100, iterations=2)
        )
    return requests


def retained_compacts(result):
    """Only after full answer validation; preserve original member ordinals."""
    if result["schema"].endswith("-v4"):
        return [entry["compact"] for entry in result["iteration_outputs"]]
    return [result["compact"]]


def pari_toy_commands(decoded, declared, make_commands):
    commands = []
    for result, request in zip(decoded, declared, strict=True):
        for compact in retained_compacts(result):
            # These are exact-array replay inputs, never timing receipts.
            commands += make_commands(
                dict(result, compact=compact),
                request["coefficients"],
                native_identity=False,
            )
    return commands


def validate_toy_checks(toy, compact):
    count = len(compact["class_generators"])
    if (
        not isinstance(toy, dict)
        or set(toy)
        != {"scope", "literal_equations", "rejected_mutations", "class_powers", "units"}
        or any(
            type(toy[key]) is not int
            for key in (
                "literal_equations",
                "rejected_mutations",
                "class_powers",
                "units",
            )
        )
        or toy["scope"] != "test-only-decoded-exact-payload-not-independent-proof"
        or toy["literal_equations"] != count + 3
        or toy["rejected_mutations"] != count + 3
        or toy["class_powers"] != count
        or toy["units"] != sum(compact["signature"])
    ):
        raise ValueError("missing declared decoded toy checks")


def validate_hecke_toys(result, toy):
    if result["schema"].endswith("-v4"):
        if (
            set(toy) != {"scope", "iteration_checks"}
            or toy["scope"] != "test-only-every-batch-output-not-independent-proof"
            or len(toy["iteration_checks"]) != result["iterations"]
        ):
            raise ValueError("missing batch toy replay")
        for ordinal, (compact, record) in enumerate(
            zip(retained_compacts(result), toy["iteration_checks"]), 1
        ):
            if (
                set(record) != {"iteration", "checks"}
                or type(record["iteration"]) is not int
                or record["iteration"] != ordinal
            ):
                raise ValueError("toy replay ordinal mismatch")
            validate_toy_checks(record["checks"], compact)
    else:
        validate_toy_checks(toy, result["compact"])


def proof_matrix(args):
    """One process, fixed tiny inputs, overall cap including startup/cleanup."""
    if args.output is None or not 1 <= args.seconds <= 180:
        raise ValueError(
            "matrix requires a new --output and whole-process --seconds 1..180"
        )
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    worker = None
    status, completed, decoded, replayed_outputs = "error", 0, [], 0

    def save(name, value):
        supervisor.immutable_save(args.output / (name + ".json"), value)

    def remaining():
        budget = args.seconds - (time.monotonic() - started) - 5
        if budget <= 0:
            raise TimeoutError(
                "whole diagnostic deadline exhausted; no further request"
            )
        return budget

    try:
        factory, provenance = supervisor.worker_factory(
            args.engine,
            args.executable,
            args.worker,
            args.project,
            args.depot,
            toy_replay=args.engine == "hecke",
        )
        sources = [Path(__file__)]
        if args.engine == "pari":
            sources += [
                HERE.parent / "pari-explicit-output-smoke.gp",
                HERE.parent / "runner/test_pari_explicit_output.py",
            ]
        provenance["diagnostic_sha256"] = {
            str(p): supervisor.digest(p) for p in sources
        }
        declared = matrix_requests(getattr(args, "batch_evidence_matrix", False))
        save(
            "inputs",
            dict(
                engine=args.engine,
                requests=declared,
                provenance=provenance,
                started_at=datetime.now(timezone.utc).isoformat(),
                whole_process_cap_seconds=args.seconds,
                cleanup_reserved_seconds=5,
                qualification_evidence=False,
                independent_replay=False,
                retained_output_count=sum(r["iterations"] for r in declared),
                controls="local-uncontrolled-correctness-only",
                one_process=True,
                source_text={
                    str(p): Path(p).read_text()
                    for p in [
                        *sources,
                        *(
                            Path(p)
                            for p in provenance["sha256"]
                            if Path(p).suffix in (".gp", ".jl", ".py", ".toml")
                        ),
                    ]
                },
            ),
        )
        marker = ("FRONTIER_READY|" + uuid.uuid4().hex).encode()
        worker, payload = factory(marker)
        if args.engine == "pari":
            payload = b'print("FRONTIER_VERSION|",version());\n' + payload
        save("startup-request", dict(command=worker.command, text=payload.decode()))
        ready = worker.start(min(60, remaining()), marker, payload)
        save("startup", ready)
        if (
            ready["status"] != "ok"
            or ready["stderr"].strip()
            or (
                not ready["stdout"].startswith("FRONTIER_VERSION|")
                if args.engine == "pari"
                else bool(ready["stdout"].strip())
            )
        ):
            raise ValueError("startup failed; raw receipt retained")
        pid = worker.child.pid
        for index, request in enumerate(declared):
            payload, marker = supervisor.encode_request(
                args.engine,
                request["label"],
                request["coefficients"],
                request["bits"],
                1,
                request["iterations"],
                request["proof_policy"],
            )
            save(f"request-{index:02}", dict(declared=request, text=payload.decode()))
            response = worker.exchange(payload, remaining(), marker)
            reviewed = supervisor.validate_answer(
                args.engine,
                response,
                request["label"],
                len(request["coefficients"]) - 1,
                request["bits"],
                request["iterations"],
                request["proof_policy"],
                require_current=True,
            )
            save(f"response-{index:02}", dict(response, reviewed_status=reviewed))
            if reviewed != "ok" or response["pid"] != pid:
                raise ValueError("request failed; no retry or field substitution")
            if args.engine == "pari":
                result = supervisor.shared.parse_pari_compact(
                    response["stdout"],
                    request["label"],
                    request["bits"],
                    request["iterations"],
                    len(request["coefficients"]) - 1,
                    proof_policy=request["proof_policy"],
                )
            else:
                answer = supervisor.shared.strict_json(response["stdout"])
                result = answer["result"]
                toy = answer["diagnostics"]["toy_replay"]
                validate_hecke_toys(result, toy)
                replayed_outputs += len(retained_compacts(result))
            if any(
                compact[key] != expected
                for compact in retained_compacts(result)
                for key, expected in request["expected"].items()
            ):
                raise ValueError("tiny exact abstract invariant disagrees")
            decoded.append(result)
            completed += 1
        save("decoded", decoded)
        if args.engine == "pari":
            module_spec = importlib.util.spec_from_file_location(
                "pari_toy_replay", HERE.parent / "runner/test_pari_explicit_output.py"
            )
            replay = importlib.util.module_from_spec(module_spec)
            module_spec.loader.exec_module(replay)
            commands = [
                f"read({json.dumps(str(HERE.parent / 'pari-explicit-output-smoke.gp'))});"
            ]
            commands += pari_toy_commands(decoded, declared, replay.replay_commands)
            commands += [
                'print("FRONTIER_TOY_REPLAY|ok");',
                'print("FRONTIER_TOY_DONE");',
            ]
            payload = ("\n".join(commands) + "\n").encode()
            save("replay-request", {"text": payload.decode()})
            response = worker.exchange(payload, remaining(), b"FRONTIER_TOY_DONE")
            save("replay", response)
            if (
                response["status"] != "ok"
                or response["stderr"].strip()
                or response["stdout"] != "FRONTIER_TOY_REPLAY|ok\n"
            ):
                raise ValueError("decoded exact toy replay failed")
            replayed_outputs = sum(len(retained_compacts(r)) for r in decoded)
        if any(
            supervisor.digest(p) != h
            for p, h in {
                **provenance["sha256"],
                **provenance["diagnostic_sha256"],
            }.items()
        ):
            raise ValueError("runtime or source changed during diagnostic")
        status = "ok"
    except BaseException as error:
        save("failure", {"type": type(error).__name__, "message": str(error)})
        raise
    finally:
        if worker is not None:
            worker.close()
        save(
            "completion",
            dict(
                status=status,
                completed_requests=completed,
                retained_outputs=sum(len(retained_compacts(r)) for r in decoded),
                toy_replayed_outputs=replayed_outputs,
                elapsed_seconds=time.monotonic() - started,
                process_closed=worker is None or worker.child is None,
                qualification_evidence=False,
                independent_replay=False,
            ),
        )
    print(
        json.dumps(
            {
                "status": status,
                "requests": completed,
                "output": str(args.output),
                "qualification_evidence": False,
            }
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=("pari", "hecke"), required=True)
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--project", type=Path)
    parser.add_argument("--depot", type=Path)
    parser.add_argument("--bits", type=int, choices=(100, 200), default=200)
    parser.add_argument("--iterations", type=int, choices=(1, 2), default=1)
    parser.add_argument(
        "--proof-policy",
        choices=supervisor.shared.PROOF_POLICIES,
        default="conditional-grh",
    )
    parser.add_argument("--proof-policy-matrix", action="store_true")
    parser.add_argument("--batch-evidence-matrix", action="store_true")
    parser.add_argument("--seconds", type=int, default=180)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--local-uncontrolled", action="store_true", required=True)
    args = parser.parse_args()
    if args.proof_policy_matrix or args.batch_evidence_matrix:
        proof_matrix(args)
        return
    factory, provenance = supervisor.worker_factory(
        args.engine, args.executable, args.worker, args.project, args.depot
    )
    marker = ("FRONTIER_READY|" + uuid.uuid4().hex).encode()
    worker, payload = factory(marker)
    try:
        ready = worker.start(60, marker, payload)
        assert ready["status"] == "ok", ready
        assert not ready["stdout"].strip() and not ready["stderr"].strip(), ready
        pid = worker.child.pid
        for label, coefficients in (
            ("local-quadratic", ["-2", "0", "1"]),
            ("local-cubic", ["-1", "-1", "0", "1"]),
        ):
            request, marker = supervisor.encode_request(
                args.engine,
                label,
                coefficients,
                args.bits,
                1,
                args.iterations,
                args.proof_policy,
            )
            response = worker.exchange(request, 60, marker)
            assert (
                supervisor.validate_answer(
                    args.engine,
                    response,
                    label,
                    len(coefficients) - 1,
                    args.bits,
                    args.iterations,
                    args.proof_policy,
                    require_current=True,
                )
                == "ok"
            ), response
            assert response["pid"] == pid
            if args.engine == "hecke":
                diagnostics = json.loads(response["stdout"])["diagnostics"]
                assert float(diagnostics["julia_compile_seconds"]) >= 0
                assert float(diagnostics["julia_recompile_seconds"]) >= 0
        print(
            json.dumps(
                {
                    "status": "ok",
                    "engine": args.engine,
                    "requests": 2,
                    "bits": args.bits,
                    "iterations": args.iterations,
                    "same_process": True,
                    "qualification_evidence": False,
                    "controls": "local-uncontrolled",
                    "provenance": provenance,
                }
            )
        )
    finally:
        worker.close()


if __name__ == "__main__":
    main()
