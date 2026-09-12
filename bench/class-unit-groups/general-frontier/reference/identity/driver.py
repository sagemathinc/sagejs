"""Linux-only, prepaid, one-shot order identity diagnostics; never select fields."""

import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import time
import uuid

import check

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "identity_process", HERE.parent / "persistent/supervisor.py"
)
process = importlib.util.module_from_spec(spec)
spec.loader.exec_module(process)
CAP = 30
CLEANUP = 5
COUNT = 38


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    json.dumps(value, allow_nan=False)
    process.immutable_save(path, value)


def source_paths():
    return [
        HERE / "driver.py",
        HERE / "check.py",
        HERE / "pari.gp",
        HERE / "hecke.jl",
        HERE.parent / "hecke/transport.jl",
        Path(process.__file__),
        Path(check.shared.__file__),
    ]


def verify_hashes(mapping):
    if not isinstance(mapping, dict) or not mapping:
        raise ValueError("missing file pins")
    for name, expected in mapping.items():
        if sha(Path(name).read_bytes()) != expected:
            raise ValueError("changed pinned file: " + name)


def admit(input_bytes, admission, ledger_bytes):
    records = check.strict_json(input_bytes)
    if not isinstance(records, list) or len(records) != COUNT:
        raise ValueError("exactly 38 preselected candidates are required")
    identities = [check.shared.validate_case(r) for r in records]
    if any(len(c) > 4096 for _, coefficients in identities for c in coefficients):
        raise ValueError("identity coefficient size exceeds bounded diagnostic")
    if (
        len({r[0] for r in identities}) != COUNT
        or len({tuple(r[1]) for r in identities}) != COUNT
    ):
        raise ValueError("duplicate candidate identity")
    if admission.get(
        "schema"
    ) != "sagejs.reference-identity-admission.v1" or admission.get(
        "input_sha256"
    ) != sha(input_bytes):
        raise ValueError("admission/input mismatch")
    if (
        admission.get("candidate_count") != COUNT
        or admission.get("engines") != ["pari", "hecke"]
        or admission.get("process_cap_seconds") != CAP
        or admission.get("cleanup_cap_seconds") != CLEANUP
    ):
        raise ValueError("changed fixed diagnostic scope")
    ledger = check.strict_json(ledger_bytes)
    check.shared.validate_state(ledger, 0)
    prepaid = admission["prepaid_seconds"]
    before = admission["charged_before_seconds"]
    overhead, outer = admission["overhead_seconds"], admission["outer_cap_seconds"]
    if (
        type(overhead) is not int
        or overhead < 1
        or type(outer) is not int
        or outer < COUNT * 2 * (CAP + CLEANUP) + overhead
        or admission["outer_kill_grace_seconds"] != CLEANUP
    ):
        raise ValueError("explicit whole-driver cap and checking overhead required")
    if (
        type(prepaid) is not int
        or prepaid < outer + CLEANUP
        or type(before) not in (int, float)
        or before < 0
    ):
        raise ValueError("insufficient explicit prepayment")
    if (
        admission["ledger_sha256"] != sha(ledger_bytes)
        or ledger["charged_seconds"] != before + prepaid
    ):
        raise ValueError("prepaid ledger custody mismatch")
    if set(admission["source_sha256"]) != {str(p) for p in source_paths()}:
        raise ValueError("incomplete exact source closure")
    verify_hashes(admission["source_sha256"])
    if set(admission["runtimes"]) != {"pari", "hecke"}:
        raise ValueError("both pinned runtimes required")
    for engine, runtime in admission["runtimes"].items():
        executable = str(Path(runtime["executable"]).resolve(strict=True))
        if (
            executable not in runtime["sha256"]
            or runtime["inventory"] not in runtime["sha256"]
        ):
            raise ValueError("executable and reviewed runtime inventory must be pinned")
        if engine == "hecke" and any(
            str(Path(runtime["project"]) / name) not in runtime["sha256"]
            for name in ("Project.toml", "Manifest.toml")
        ):
            raise ValueError("Hecke project pins missing")
        verify_hashes(runtime["sha256"])
    return records


def outcome_paths(admission, output):
    root = Path(admission["outcomes_root"])
    identifier = admission["admission_id"]
    if (
        not root.is_absolute()
        or not root.is_dir()
        or root.resolve() != root
        or not isinstance(identifier, str)
        or re.fullmatch(r"[a-z0-9][a-z0-9-]{0,100}", identifier) is None
    ):
        raise ValueError("invalid canonical writable outcome root/id")
    if (
        not output.is_absolute()
        or output.parent != root
        or output.resolve() != output
        or re.fullmatch(r"[a-z0-9][a-z0-9-]{0,100}", output.name) is None
    ):
        raise ValueError("output must be an explicit nonsymlink child of outcome root")
    consumed = root / (identifier + ".consumed")
    if admission["consumption_path"] != str(consumed) or consumed.is_symlink():
        raise ValueError("one-shot outcome marker path mismatch")
    return consumed


def request(engine, runtime, record):
    label, coefficients = check.shared.validate_case(record)
    marker = "IDENTITY_DONE|" + uuid.uuid4().hex
    environment = dict(os.environ)
    environment.update(
        OMP_NUM_THREADS="1",
        OPENBLAS_NUM_THREADS="1",
        JULIA_NUM_THREADS="1",
        JULIA_PKG_PRECOMPILE_AUTO="0",
    )
    if engine == "pari":
        command = [
            runtime["executable"],
            "-fq",
            "--default",
            "parisizemax=2147483648",
            "--default",
            "nbthreads=1",
            "--default",
            "threadsizemax=2147483648",
        ]
        payload = (HERE / "pari.gp").read_bytes() + (
            "\nidentity_case("
            + json.dumps(label)
            + ",["
            + ",".join(coefficients)
            + "]);\nprint("
            + json.dumps(marker)
            + ");\n"
        ).encode()
    else:
        environment["JULIA_DEPOT_PATH"] = runtime["depot"]
        command = [
            runtime["executable"],
            "--startup-file=no",
            "--history-file=no",
            "--compiled-modules=strict",
            "--threads=1",
            "--project=" + runtime["project"],
            str(HERE / "hecke.jl"),
        ]
        payload = (
            label + "\t" + ",".join(coefficients) + "\t" + marker + "\n"
        ).encode()
    return command, environment, payload, marker.encode()


def run_process(
    command,
    environment,
    payload,
    marker,
    seconds=CAP,
    output_cap=check.shared.OUTPUT_CAP,
):
    """The alarm covers process launch plus work; cleanup has Worker.close's 5s cap."""
    worker = process.Worker(command, environment, "pari", output_cap)
    started = time.monotonic()
    old_handler = signal.getsignal(signal.SIGALRM)
    if signal.getitimer(signal.ITIMER_REAL) != (0.0, 0.0):
        raise ValueError("existing alarm cannot be replaced")

    def expired(signum, frame):
        raise TimeoutError("whole-process identity deadline")

    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        answer = worker.start(seconds, marker, payload)
    except (TimeoutError, process.CoordinatorInterrupted) as error:
        output, errors = getattr(worker, "capture", (b"", b""))
        answer = {
            "status": "timeout" if isinstance(error, TimeoutError) else "interrupted",
            "stdout": bytes(output).decode("utf-8", "replace"),
            "stderr": bytes(errors).decode("utf-8", "replace"),
        }
    except (OSError, ValueError) as error:
        output, errors = getattr(worker, "capture", (b"", b""))
        answer = {
            "status": "infrastructure-error",
            "stdout": bytes(output).decode("utf-8", "replace"),
            "stderr": bytes(errors).decode("utf-8", "replace"),
            "infrastructure_error": str(error),
        }
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old_handler)
        try:
            worker.close()
        except Exception as error:
            answer.update(status="cleanup-error", cleanup_error=str(error))
    answer.update(
        whole_process_and_cleanup_seconds=time.monotonic() - started,
        process_closed=worker.child is None,
        request_sha256=sha(payload),
        request_marker=marker.decode(),
        command=command,
    )
    return answer


def retain_and_validate(path, receipt):
    """Durably retain raw transport evidence before any exact checking."""
    save(path, receipt)
    if receipt["status"] != "ok":
        return None
    validation = {"raw_receipt_sha256": sha(path.read_bytes())}
    try:
        value = check.strict_json(receipt["stdout"])
        validation["consistency"] = check.validate(
            receipt["record"], value, receipt["engine"]
        )
        validation["status"] = "consistent-output"
    except (ValueError, KeyError, TypeError, ZeroDivisionError) as error:
        value = None
        validation.update(status="invalid-output", error=str(error))
    save(path.with_name(path.stem + "-validation.json"), validation)
    return value


def execute(input_path, admission_path, ledger_path, output):
    input_bytes = input_path.read_bytes()
    admission_bytes = admission_path.read_bytes()
    admission = check.strict_json(admission_bytes)
    # Use the existing coordinator lock; never initialize or debit a new ledger.
    with open("/tmp/sagejs-opt-timing.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        records = admit(input_bytes, admission, ledger_path.read_bytes())
        controls = check.shared.require_controls()
        if controls != admission["controls"]:
            raise ValueError("unmatched controlled process environment")
        consumed = outcome_paths(admission, output)
        output.mkdir(exist_ok=False)
        save(
            consumed,
            {"admission_sha256": sha(admission_bytes), "output": str(output.resolve())},
        )
        save(output / "admission.json", admission)
        save(output / "input.json", records)
        for number, record in enumerate(records):
            accepted = {}
            for engine in ("pari", "hecke"):
                verify_hashes(admission["source_sha256"])
                verify_hashes(admission["runtimes"][engine]["sha256"])
                command, environment, payload, marker = request(
                    engine, admission["runtimes"][engine], record
                )
                with process.interrupted_signals():
                    answer = run_process(command, environment, payload, marker)
                receipt = {
                    "schema": "sagejs.reference-identity-receipt.v1",
                    "engine": engine,
                    "record": record,
                    "controls": controls,
                    "admission_sha256": sha(admission_bytes),
                    "input_sha256": sha(input_bytes),
                    "process_cap_seconds": CAP,
                    "cleanup_cap_seconds": CLEANUP,
                    "qualification_evidence": False,
                    "independent_maximality_replay": False,
                    **answer,
                }
                value = retain_and_validate(
                    output / f"{number:02}-{engine}.json", receipt
                )
                if value is not None:
                    accepted[engine] = value
                if answer["status"] in ("interrupted", "cleanup-error"):
                    return
            if set(accepted) == {"pari", "hecke"}:
                save(
                    output / f"{number:02}-pair.json",
                    check.compare(record, accepted["pari"], accepted["hecke"]),
                )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--admission", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    execute(args.input, args.admission, args.ledger, args.output)
