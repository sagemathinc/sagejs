"""Linux/opt bounded PARI screening, with a conservative single-CPU ledger.

Run inside a systemd user service with CPUAffinity=2, MemoryMax=4G and
MemorySwapMax=0. This candidate-cost screen is not final performance evidence.
Every attempt, including errors/timeouts, consumes wall time from the CPU
budget: a conservative charge on the one permitted CPU. An interrupted
coordinator retains the full reservation until explicitly reconciled.
"""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import math
import resource
import re
import signal
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from fractions import Fraction


LIMIT = 120 * 3600
PARI_SCHEMA = "sagejs-pari-frontier-screen-v2"
PARI_SEMANTICS = "ideal-equals-principal-witness-times-literal-class-generator-product"


def parse_pari_compact(output, label, bits=200, iterations=1, degree=None, seed=1):
    """Strict v2 transport/shape checks, not mathematical certificate replay."""

    def require(condition):
        if not condition:
            raise ValueError("invalid explicit PARI output")

    def keys(value, expected):
        require(isinstance(value, dict) and set(value) == set(expected.split()))

    def distinct(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result)
            result[key] = value
        return result

    def nonfinite(value):
        raise ValueError("nonfinite JSON constant")

    def integer(value):
        require(isinstance(value, str) and re.fullmatch(r"0|-?[1-9][0-9]*", value))
        return int(value)

    def bounded(value, low, high):
        require(type(value) is int and low <= value <= high)

    def sequence(value, length):
        require(isinstance(value, list) and len(value) == length)

    require(len(output.encode()) <= 32 * 1024 * 1024)
    lines = [line for line in output.splitlines() if line.strip()]
    require(len(lines) == 2 and lines[0].startswith("FRONTIER_RESULT|"))
    require(lines[1].startswith("FRONTIER_COMPACT_JSON|" + label + "|"))
    summary = lines[0].split("|")
    require(len(summary) == 11)
    require(summary[1:4] == [label, str(bits), str(iterations)])
    result = json.loads(
        lines[1].split("|", 2)[2], object_pairs_hook=distinct, parse_constant=nonfinite
    )
    keys(
        result,
        "schema id bits iterations seed proof_policy independent_replay witness_semantics class_generator_order unit_generator_order element_basis ideal_basis_layout pari_version retained_iteration batch_outputs_complete compact",
    )
    require(result["schema"] == PARI_SCHEMA and result["id"] == label)
    bounded(bits, 100, 200)
    require(bits in (100, 200))
    bounded(iterations, 1, 10000)
    require(type(seed) is int and seed > 0)
    for key, expected in (
        ("bits", bits),
        ("iterations", iterations),
        ("retained_iteration", iterations),
    ):
        require(type(result[key]) is int and result[key] == expected)
    require(integer(result["seed"]) == seed)
    require(
        result["proof_policy"] == "conditional-grh"
        and result["independent_replay"] is False
    )
    require(result["witness_semantics"] == PARI_SEMANTICS)
    require(result["class_generator_order"] == "pari-bnf.gen")
    require(result["unit_generator_order"] == "torsion-first-then-bnfunits-free-order")
    require(result["element_basis"] == "ascending-powers-of-input-generator")
    require(result["ideal_basis_layout"] == "outer-array-of-basis-elements")
    require(result["batch_outputs_complete"] is (iterations == 1))
    sequence(result["pari_version"], 3)
    for value in result["pari_version"]:
        bounded(value, 0, 1000000)
    compact = result["compact"]
    keys(
        compact,
        "class_number class_invariants discriminant signature integral_basis class_generators class_coordinates class_decompositions class_power_witnesses unit_invariants torsion_order units unit_coordinates probes decompositions regulator",
    )
    signature = compact["signature"]
    sequence(signature, 2)
    for value in signature:
        bounded(value, 0, 10)
    n = signature[0] + 2 * signature[1]
    require(2 <= n <= 10 and (degree is None or (type(degree) is int and degree == n)))
    require(isinstance(compact["class_invariants"], list))
    orders = [integer(value) for value in compact["class_invariants"]]
    require(all(value > 1 for value in orders))
    require(all(a % b == 0 for a, b in zip(orders, orders[1:])))
    require(integer(compact["class_number"]) == math.prod(orders))
    require(integer(compact["discriminant"]) != 0)
    torsion = integer(compact["torsion_order"])
    require(torsion > 0)
    require(summary[5] == compact["class_number"] and json.loads(summary[6]) == orders)
    require(
        summary[7] == compact["discriminant"] and json.loads(summary[8]) == signature
    )
    require(summary[9] == compact["torsion_order"])
    count, unit_count = len(orders), sum(signature)

    def element(value):
        sequence(value, n)
        for coefficient in value:
            require(
                isinstance(coefficient, str)
                and re.fullmatch(r"(?:0|-?[1-9][0-9]*)(?:/[1-9][0-9]*)?", coefficient)
            )
            require(str(Fraction(coefficient)) == coefficient)

    def ideal(value):
        sequence(value, n)
        for basis_element in value:
            element(basis_element)

    def factored(value):
        require(isinstance(value, list))
        for factor in value:
            keys(factor, "factor exponent")
            element(factor["factor"])
            require(any(c != "0" for c in factor["factor"]))
            require(integer(factor["exponent"]) != 0)

    def coordinates(value):
        sequence(value, count)
        require(all(0 <= integer(c) < d for c, d in zip(value, orders)))

    def decomposition(value):
        keys(value, "coordinates generator_product_witness")
        coordinates(value["coordinates"])
        factored(value["generator_product_witness"])

    ideal(compact["integral_basis"])
    for name in (
        "class_generators",
        "class_coordinates",
        "class_decompositions",
        "class_power_witnesses",
    ):
        sequence(compact[name], count)
    for j in range(count):
        ideal(compact["class_generators"][j])
        coordinates(compact["class_coordinates"][j])
        require(
            compact["class_coordinates"][j] == [str(int(k == j)) for k in range(count)]
        )
        decomposition(compact["class_decompositions"][j])
        require(
            compact["class_decompositions"][j]["coordinates"]
            == compact["class_coordinates"][j]
        )
        power = compact["class_power_witnesses"][j]
        keys(power, "exponent witness")
        require(integer(power["exponent"]) == orders[j])
        factored(power["witness"])
    sequence(compact["unit_invariants"], unit_count)
    require(compact["unit_invariants"] == [str(torsion)] + ["0"] * (unit_count - 1))
    sequence(compact["units"], unit_count)
    sequence(compact["unit_coordinates"], unit_count)
    for j in range(unit_count):
        factored(compact["units"][j])
        sequence(compact["unit_coordinates"][j], unit_count)
        require(
            compact["unit_coordinates"][j]
            == [str(int(k == j)) for k in range(unit_count)]
        )
    sequence(compact["probes"], 3)
    sequence(compact["decompositions"], 3)
    for probe, answer in zip(compact["probes"], compact["decompositions"]):
        ideal(probe)
        decomposition(answer)
    regulator = compact["regulator"]
    keys(
        regulator,
        "guarantee requested_working_bits initial_working_bits value_precision_bits text fundamental_units_policy",
    )
    require(regulator["guarantee"] == "working-precision-approximation")
    require(
        type(regulator["requested_working_bits"]) is int
        and regulator["requested_working_bits"] == bits
    )
    bounded(regulator["initial_working_bits"], bits, 1000000)
    if regulator["value_precision_bits"] is not None:
        bounded(regulator["value_precision_bits"], 1, 1000000)
    require(regulator["fundamental_units_policy"] == "conditional-grh")
    text = regulator["text"]
    require(
        isinstance(text, str)
        and re.fullmatch(r"[0-9]+(?:\.[0-9]*)?(?:[Ee][+-]?[0-9]+)?", text)
    )
    require(any(c in "123456789" for c in text.split("E")[0].split("e")[0]))
    require(summary[10] == text)
    return result


def save(path, value):
    data = json.dumps(value, sort_keys=True, indent=2) + "\n"
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())
        temporary = out.name
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def require_controls():
    if os.sched_getaffinity(0) != {2}:
        raise ValueError("controlled screen requires CPU affinity exactly {2}")
    group = Path("/proc/self/cgroup").read_text().strip().split(":")[-1]
    root = Path("/sys/fs/cgroup" + group)
    if (root / "memory.max").read_text().strip() != "4294967296":
        raise ValueError("controlled screen requires cgroup MemoryMax=4G")
    if (root / "memory.swap.max").read_text().strip() != "0":
        raise ValueError("controlled screen requires cgroup MemorySwapMax=0")
    return {
        "affinity": [2],
        "memory_max": 4294967296,
        "swap_max": 0,
        "cgroup": group,
        "hostname": os.uname().nodename,
    }


def validate_state(state, reservation):
    charged = state.get("charged_seconds")
    if (
        state.get("schema") != "sagejs.general-frontier-conservative-cpu-ledger.v1"
        or state.get("limit_seconds") != LIMIT
        or state.get("pending", "missing") is not None
        or type(charged) not in (int, float)
        or not math.isfinite(charged)
        or not 0 <= charged <= LIMIT
        or charged + reservation > LIMIT
    ):
        raise ValueError("invalid, interrupted or exhausted M0 budget requires review")


def validate_terminal(
    output,
    errors,
    label,
    returncode,
    timed_out,
    output_capped,
    *,
    expected_bits=200,
    expected_iterations=1,
    expected_degree=None,
    expected_seed=1,
):
    if output_capped:
        return "output-limit"
    if timed_out:
        return "timeout"
    lines = [
        line for line in output.splitlines() if line.startswith("FRONTIER_RESULT|")
    ]
    compact = [
        line
        for line in output.splitlines()
        if line.startswith(("FRONTIER_COMPACT|", "FRONTIER_COMPACT_JSON|"))
    ]
    fields = lines[0].split("|") if len(lines) == 1 else []
    valid_summary = (
        len(fields) == 11
        and re.fullmatch(r"[0-9]+", fields[4]) is not None
        and re.fullmatch(r"[1-9][0-9]*", fields[5]) is not None
        and re.fullmatch(r"\[(?:[1-9][0-9]*(?:,\s*[1-9][0-9]*)*)?\]", fields[6])
        is not None
        and re.fullmatch(r"-?[1-9][0-9]*", fields[7]) is not None
        and re.fullmatch(r"\[[0-9]+,\s*[0-9]+\]", fields[8]) is not None
        and re.fullmatch(r"[1-9][0-9]*", fields[9]) is not None
        and re.fullmatch(r"[0-9]+(?:\.[0-9]*)?(?:[Ee][+-]?[0-9]+)?", fields[10])
        is not None
        and any(char in "123456789" for char in fields[10].split("E")[0].split("e")[0])
    )
    if (
        returncode != 0
        or any(
            line.strip()
            and not re.fullmatch(
                r"\s*\*\*\* [A-Za-z_][A-Za-z_0-9]*: Warning: increasing stack size to [0-9]+\.",
                line,
            )
            for line in errors.splitlines()
        )
        or len(lines) != 1
        or len(compact) != 1
        or not valid_summary
        or type(expected_bits) is not int
        or expected_bits not in (100, 200)
        or type(expected_iterations) is not int
        or not 1 <= expected_iterations <= 10000
        or not lines[0].startswith(
            f"FRONTIER_RESULT|{label}|{expected_bits}|{expected_iterations}|"
        )
        or not compact[0].startswith(
            ("FRONTIER_COMPACT|" + label + "|", "FRONTIER_COMPACT_JSON|" + label + "|")
        )
        or not compact[0].split("|", 2)[-1].strip()
    ):
        return "error"
    if compact[0].startswith("FRONTIER_COMPACT_JSON|"):
        try:
            parse_pari_compact(
                output,
                label,
                expected_bits,
                expected_iterations,
                expected_degree,
                expected_seed,
            )
        except (
            KeyError,
            TypeError,
            ValueError,
            AttributeError,
            RecursionError,
            OverflowError,
        ):
            return "error"
    return "ok"


def validate_case(record):
    label = record["label"]
    if (
        not isinstance(label, str)
        or not label
        or any(char not in "0123456789.-abcdefghijklmnopqrstuvwxyz" for char in label)
    ):
        raise ValueError("invalid screening label")
    coefficients = record["coefficients"]
    if not isinstance(coefficients, list) or not 3 <= len(coefficients) <= 11:
        raise ValueError("expected degree 2..10")
    for value in coefficients:
        if not isinstance(value, str) or str(int(value)) != value:
            raise ValueError("coefficients must be canonical exact integer strings")
    if coefficients[-1] != "1":
        raise ValueError("screening probes require a monic integral polynomial")
    return label, coefficients


def validate_hecke_terminal(
    output,
    errors,
    label,
    returncode,
    timed_out,
    output_capped,
    *,
    expected_bits=200,
    expected_iterations=1,
):
    if output_capped:
        return "output-limit"
    if timed_out:
        return "timeout"
    if returncode != 0 or errors.strip():
        return "error"
    try:
        answer = json.loads(output)
        result = answer["result"]
        compact = result["compact"]
        if (
            answer["status"] != "ok"
            or type(expected_bits) is not int
            or expected_bits not in (100, 200)
            or type(expected_iterations) is not int
            or not 1 <= expected_iterations <= 10000
            or result["schema"]
            not in (
                "sagejs-hecke-frontier-screen-v1",
                "sagejs-hecke-frontier-screen-v2",
            )
            or (
                result["schema"] == "sagejs-hecke-frontier-screen-v2"
                and (
                    result.get("witness_semantics")
                    != "ideal-equals-principal-witness-times-literal-class-generator-product"
                    or result.get("proof_policy") != "conditional-grh"
                    or result.get("independent_replay") is not False
                )
            )
            or result["id"] != label
            or type(result["bits"]) is not int
            or result["bits"] != expected_bits
            or type(result["iterations"]) is not int
            or result["iterations"] != expected_iterations
            or not re.fullmatch(r"[0-9]+", result["elapsed_ns"])
            or not re.fullmatch(r"[1-9][0-9]*", compact["class_number"])
            or not re.fullmatch(r"[1-9][0-9]*", compact["torsion_order"])
            or type(compact["regulator"]["bits"]) is not int
            or compact["regulator"]["bits"] != expected_bits
            or compact["regulator"]["guarantee"] != "absolute-radius-less-than-2^-bits"
            or not compact["integral_basis"]
            or not compact["units"]
        ):
            return "error"
    except (KeyError, TypeError, ValueError):
        return "error"
    return "ok"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, required=True)
    parser.add_argument("--engine", choices=("pari", "hecke"), default="pari")
    parser.add_argument("--gp")
    parser.add_argument("--julia")
    parser.add_argument("--project", type=Path)
    parser.add_argument("--depot", type=Path)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--seconds", type=int, default=60)
    args = parser.parse_args()
    if args.engine == "pari" and not args.gp:
        raise ValueError("PARI screen requires --gp")
    if args.engine == "hecke" and not all((args.julia, args.project, args.depot)):
        raise ValueError(
            "Hecke screen requires provisioned --julia, --project and --depot"
        )
    executable = args.gp if args.engine == "pari" else args.julia
    if not 1 <= args.seconds <= 600:
        raise ValueError("request cap must be 1..600 seconds")
    controls = require_controls()
    input_text = args.input.read_text()
    input_sha256 = hashlib.sha256(input_text.encode()).hexdigest()
    runner_sha256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    records = json.loads(input_text)
    if not isinstance(records, list) or not 1 <= len(records) <= 200:
        raise ValueError("one screen batch contains 1..200 records")
    identities = [validate_case(record) for record in records]
    if len({label for label, _ in identities}) != len(identities):
        raise ValueError("duplicate screening labels")
    args.output.mkdir(parents=True, exist_ok=True)
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    with open("/tmp/sagejs-opt-timing.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = (
            json.loads(args.ledger.read_text())
            if args.ledger.exists()
            else {
                "schema": "sagejs.general-frontier-conservative-cpu-ledger.v1",
                "limit_seconds": LIMIT,
                "charged_seconds": 600,
                "initial_charge_reason": "Conservative ten-minute allowance for pre-screen local reference diagnostics; compilation excluded.",
                "pending": None,
            }
        )
        validate_state(state, 10)
        state["pending"] = {"stage": "version-probe", "reserved_seconds": 10}
        save(args.ledger, state)
        version = subprocess.check_output(
            [executable, "--version-short" if args.engine == "pari" else "--version"],
            text=True,
            timeout=5,
        ).strip()
        state["charged_seconds"] += 10
        state["pending"] = None
        save(args.ledger, state)
        worker_text = args.worker.read_text()
        gp_path = Path(executable).resolve(strict=True)
        gp_sha256 = hashlib.sha256(gp_path.read_bytes()).hexdigest()
        environment = dict(
            os.environ,
            OPENBLAS_NUM_THREADS="1",
            JULIA_NUM_THREADS="1",
            OMP_NUM_THREADS="1",
        )
        extra_hashes = {}
        if args.engine == "hecke":
            environment["JULIA_DEPOT_PATH"] = str(args.depot.resolve(strict=True))
            for path in (
                args.project / "Project.toml",
                args.project / "Manifest.toml",
                args.worker.with_name("transport.jl"),
            ):
                extra_hashes[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()

        def interrupted(signum, frame):
            raise InterruptedError(signum)

        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGINT, interrupted)
        for label, coefficients in identities:
            destination = args.output / (label + ".json")
            if destination.exists():
                raise ValueError("refusing to overwrite a previous attempt")
            request = worker_text + "\nfrontier_case(" + json.dumps(label) + ",["
            request += ",".join(coefficients) + "],200,1,1);\n"
            if args.engine == "hecke":
                request = (
                    "FRONTIER1\t"
                    + label
                    + "\t200\t1\t1\t"
                    + ",".join(coefficients)
                    + "\n"
                )
            reservation = args.seconds + 10
            validate_state(state, reservation)
            state["pending"] = {
                "label": label,
                "reserved_seconds": reservation,
                "output": str(destination),
                "request_sha256": hashlib.sha256(request.encode()).hexdigest(),
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
            save(args.ledger, state)
            started = time.monotonic()

            def output_cap():
                resource.setrlimit(
                    resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024)
                )

            with (
                tempfile.TemporaryFile(mode="w+") as stdout,
                tempfile.TemporaryFile(mode="w+") as stderr,
            ):
                child = subprocess.Popen(
                    [
                        executable,
                        "-fq",
                        "--default",
                        "parisizemax=2147483648",
                        "--default",
                        "nbthreads=1",
                        "--default",
                        "threadsizemax=2147483648",
                    ]
                    if args.engine == "pari"
                    else [
                        executable,
                        "--startup-file=no",
                        "--compiled-modules=strict",
                        "--pkgimages=existing",
                        "--project=" + str(args.project.resolve()),
                        str(args.worker.resolve()),
                    ],
                    stdin=subprocess.PIPE,
                    stdout=stdout,
                    stderr=stderr,
                    text=True,
                    start_new_session=True,
                    preexec_fn=output_cap,
                    env=environment,
                )
                status = "exited"
                try:
                    child.communicate(request, timeout=args.seconds)
                except subprocess.TimeoutExpired:
                    status = "timeout"
                finally:
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    child.wait()
                elapsed = time.monotonic() - started
                stdout.seek(0)
                stderr.seek(0)
                output = stdout.read(32 * 1024 * 1024 + 1)
                errors = stderr.read(1024 * 1024 + 1)
                output_capped = (
                    os.fstat(stdout.fileno()).st_size >= 32 * 1024 * 1024
                    or os.fstat(stderr.fileno()).st_size > 1024 * 1024
                    or child.returncode == -signal.SIGXFSZ
                )
            result_lines = [
                line
                for line in output.splitlines()
                if line.startswith("FRONTIER_RESULT|")
            ]
            validator = (
                validate_terminal if args.engine == "pari" else validate_hecke_terminal
            )
            status = validator(
                output,
                errors,
                label,
                child.returncode,
                status == "timeout",
                output_capped,
                **(
                    {"expected_degree": len(coefficients) - 1}
                    if args.engine == "pari"
                    else {}
                ),
            )
            receipt = {
                "schema": "sagejs.general-frontier-" + args.engine + "-cost-screen.v1",
                "engine": args.engine,
                "qualification_evidence": False,
                "label": label,
                "coefficients": coefficients,
                "status": status,
                "regulator_guarantee": "PARI-working-precision-approximation-not-enclosure"
                if args.engine == "pari"
                else "Hecke-absolute-radius-less-than-2^-200",
                "independent_replay": False,
                "executable_version": version,
                "executable": str(gp_path),
                "executable_sha256": gp_sha256,
                "environment_hashes": extra_hashes,
                "process_boundary": "fresh-process-cost-discovery-not-warm-JIT-qualification",
                "runner_sha256": runner_sha256,
                "input_sha256": input_sha256,
                "controls": controls,
                "proof_policy": "conditional-grh",
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "worker_sha256": hashlib.sha256(worker_text.encode()).hexdigest(),
                "request_sha256": hashlib.sha256(request.encode()).hexdigest(),
                "wall_seconds": elapsed,
                "cap_seconds": args.seconds,
                "exit_code": child.returncode,
                "result_lines": result_lines,
                "stdout": output,
                "stderr": errors,
            }
            save(destination, receipt)
            # Include parsing and receipt publication plus one second reserved
            # for ledger bookkeeping. Wall-time overrun remains visible and
            # leaves the reservation pending rather than silently continuing.
            charge = time.monotonic() - started + 1
            if charge > reservation or state["charged_seconds"] + charge > LIMIT:
                raise ValueError("screen charge exceeded reservation; review required")
            state["charged_seconds"] += charge
            state["pending"] = None
            save(args.ledger, state)
            print(
                json.dumps({"label": label, "status": status, "wall_seconds": elapsed}),
                flush=True,
            )


if __name__ == "__main__":
    main()
