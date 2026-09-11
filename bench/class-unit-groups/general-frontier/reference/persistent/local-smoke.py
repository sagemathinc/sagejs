"""Optional local-only live protocol check; no controlled-performance evidence."""

import argparse
import importlib.util
import json
from pathlib import Path
import uuid


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "persistent_screen", HERE / "supervisor.py"
)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=("pari", "hecke"), required=True)
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--project", type=Path)
    parser.add_argument("--depot", type=Path)
    parser.add_argument("--bits", type=int, choices=(100, 200), default=200)
    parser.add_argument("--iterations", type=int, choices=(1, 2), default=1)
    parser.add_argument("--local-uncontrolled", action="store_true", required=True)
    args = parser.parse_args()
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
                args.engine, label, coefficients, args.bits, 1, args.iterations
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
