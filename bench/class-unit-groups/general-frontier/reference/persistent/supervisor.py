"""Bounded persistent PARI/Hecke cost screening, never competitive qualification.

The controlled CLI requires the existing opt cgroup/CPU controls and lock.
It imports shared accounting/validators instead of defining a second policy.
The process component is also exercised by offline fake-worker tests.
"""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from fractions import Fraction
import fcntl
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import selectors
import signal
import subprocess
import tempfile
import time
import uuid


HERE = Path(__file__).resolve().parent
SHARED_PATH = HERE.parent / "runner" / "screen-batch.py"
_spec = importlib.util.spec_from_file_location("frontier_shared_screen", SHARED_PATH)
shared = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(shared)
LOCK = Path("/tmp/sagejs-opt-timing.lock")
WARMUPS = (
    ("imaginary-class-three", ["23", "0", "1"]),
    ("real-quadratic", ["-2", "0", "1"]),
    ("rank-one-cubic", ["-1", "-1", "0", "1"]),
    ("mixed-quartic", ["-1", "-1", "0", "0", "1"]),
    ("rank-three", ["1", "0", "-10", "0", "1"]),
    ("torsion-eight", ["1", "0", "0", "0", "1"]),
)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def immutable_save(path, value):
    """Publish an fsynced receipt without ever replacing an existing name."""
    data = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.link(temporary, path)
        descriptor = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink()


class CoordinatorInterrupted(BaseException):
    """Not InterruptedError: selectors may swallow that exception as EINTR."""


@contextmanager
def interrupted_signals():
    def interrupted(signum, frame):
        raise CoordinatorInterrupted(signum)

    previous = {
        sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)
    }
    try:
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


class Worker:
    """One process group, bounded pipe traffic, no unbounded communicate buffer."""

    def __init__(self, command, environment, engine, output_cap=32 * 1024 * 1024):
        self.command = command
        self.environment = environment
        self.engine = engine
        self.output_cap = output_cap
        self.child = None
        self.selector = None

    def close(self):
        previous = signal.pthread_sigmask(
            signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM}
        )
        try:
            if self.child is not None:
                try:
                    os.killpg(self.child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                self.child.wait(timeout=5)
                for stream in (self.child.stdin, self.child.stdout, self.child.stderr):
                    stream.close()
                self.child = None
            if self.selector is not None:
                self.selector.close()
                self.selector = None
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous)

    def start(self, seconds, marker, startup_input=b""):
        self.child = subprocess.Popen(
            self.command,
            env=self.environment,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
            bufsize=0,
        )
        self.selector = selectors.DefaultSelector()
        for name in ("stdout", "stderr"):
            stream = getattr(self.child, name)
            os.set_blocking(stream.fileno(), False)
            self.selector.register(stream, selectors.EVENT_READ, name)
        os.set_blocking(self.child.stdin.fileno(), False)
        return self.exchange(startup_input, seconds, marker)

    def exchange(self, request, seconds, marker=None):
        output = bytearray()
        errors = bytearray()
        self.capture = (output, errors)
        deadline = time.monotonic() + seconds
        sent = 0
        if request:
            self.selector.register(self.child.stdin, selectors.EVENT_WRITE, "stdin")
        status = "ok"
        try:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    status = "timeout"
                    break
                events = self.selector.select(min(remaining, 0.1))
                for key, _ in events:
                    if key.data == "stdin":
                        try:
                            sent += os.write(key.fd, request[sent : sent + 65536])
                        except BrokenPipeError:
                            status = "crash"
                            break
                        if sent == len(request):
                            self.selector.unregister(key.fileobj)
                        continue
                    try:
                        chunk = os.read(
                            key.fd,
                            max(
                                1,
                                min(
                                    65536,
                                    self.output_cap + 1 - len(output) - len(errors),
                                ),
                            ),
                        )
                    except BlockingIOError:
                        continue
                    if not chunk:
                        self.selector.unregister(key.fileobj)
                    target = output if key.data == "stdout" else errors
                    target.extend(chunk)
                    if len(output) + len(errors) > self.output_cap:
                        status = "output-limit"
                        break
                if len(output) + len(errors) > self.output_cap:
                    status = "output-limit"
                    break
                if status != "ok":
                    break
                lines = bytes(output).splitlines(keepends=True)
                complete = (
                    any(
                        line.rstrip(b"\r\n") == marker
                        for line in lines
                        if line.endswith(b"\n")
                    )
                    if marker is not None
                    else b"\n" in output
                )
                if complete:
                    # Drain already queued stderr/stdout before accepting framing.
                    for stream, target in (
                        (self.child.stdout, output),
                        (self.child.stderr, errors),
                    ):
                        if len(output) + len(errors) > self.output_cap:
                            status = "output-limit"
                            break
                        while True:
                            try:
                                chunk = os.read(
                                    stream.fileno(),
                                    max(
                                        1,
                                        min(
                                            65536,
                                            self.output_cap
                                            + 1
                                            - len(output)
                                            - len(errors),
                                        ),
                                    ),
                                )
                            except BlockingIOError:
                                break
                            if not chunk:
                                break
                            target.extend(chunk)
                            if len(output) + len(errors) > self.output_cap:
                                status = "output-limit"
                                break
                    break
                if self.child.poll() is not None:
                    status = "crash"
                    break
            code = self.child.poll()
            if code is not None and status == "ok":
                status = "crash"
            if marker is not None and status == "ok":
                split = bytes(output).splitlines(keepends=True)
                positions = [
                    i for i, line in enumerate(split) if line.rstrip(b"\r\n") == marker
                ]
                if len(positions) != 1 or positions[0] != len(split) - 1:
                    status = "protocol-error"
                else:
                    output = bytearray(b"".join(split[:-1]))
            try:
                text, diagnostics = output.decode("utf-8"), errors.decode("utf-8")
            except UnicodeDecodeError:
                status = "protocol-error"
                text, diagnostics = (
                    output.decode("utf-8", "replace"),
                    errors.decode("utf-8", "replace"),
                )
            return {
                "status": status,
                "stdout": text,
                "stderr": diagnostics,
                "exit_code": code,
                "pid": self.child.pid,
                "command": self.command,
            }
        finally:
            try:
                self.selector.unregister(self.child.stdin)
            except KeyError:
                pass


def validate_measurement(bits, iterations, samples):
    if type(bits) is not int or bits not in (100, 200):
        raise ValueError("bits must be explicitly 100 or 200")
    if type(iterations) is not int or not 1 <= iterations <= 10000:
        raise ValueError("iterations must be 1..10000")
    if type(samples) is not int or not 1 <= samples <= 5:
        raise ValueError("samples must be 1..5")


def encode_request(
    engine,
    label,
    coefficients,
    bits,
    seed,
    iterations=1,
    proof_policy="conditional-grh",
):
    validate_measurement(bits, iterations, 1)
    shared.validate_proof_policy(proof_policy)
    shared.validate_case({"label": label, "coefficients": coefficients})
    if engine not in ("pari", "hecke") or type(seed) is not int or seed < 1:
        raise ValueError("invalid engine or seed")
    if engine == "hecke":
        return (
            f"FRONTIER2\t{label}\t{bits}\t{iterations}\t{seed}\t{proof_policy}\t"
            + ",".join(coefficients)
            + "\n"
        ).encode(), None
    marker = ("FRONTIER_DONE|" + uuid.uuid4().hex).encode()
    command = f"frontier_case({json.dumps(label)},[{','.join(coefficients)}],{bits},{iterations},{seed},{json.dumps(proof_policy)});\n"
    return (command + "print(" + json.dumps(marker.decode()) + ");\n").encode(), marker


def validate_hecke_shape(output, degree=None, bits=200):
    """Structural screening sanity only, not mathematical verification/replay."""
    try:
        result = json.loads(output)["result"]
        schema = result["schema"]
        if schema == "sagejs-hecke-frontier-screen-v4":
            views = shared.batch_iteration_views(
                result, "hecke", result["proof_policy"], result["iterations"]
            )
            return all(
                validate_hecke_shape(json.dumps({"result": view}), degree, bits)
                for view in views
            )
        if schema not in (
            "sagejs-hecke-frontier-screen-v1",
            "sagejs-hecke-frontier-screen-v2",
            "sagejs-hecke-frontier-screen-v3",
        ):
            return False
        literal_product = schema in (
            "sagejs-hecke-frontier-screen-v2",
            "sagejs-hecke-frontier-screen-v3",
        )
        if literal_product and result.get("witness_semantics") != (
            "ideal-equals-principal-witness-times-literal-class-generator-product"
        ):
            return False
        compact = result["compact"]
        signature = compact["signature"]
        if not (
            isinstance(signature, list)
            and len(signature) == 2
            and all(type(x) is int and x >= 0 for x in signature)
        ):
            return False
        n = signature[0] + 2 * signature[1]
        if not 2 <= n <= 10 or (degree is not None and degree != n):
            return False

        def integer(value):
            return (
                isinstance(value, str) and re.fullmatch(r"-?[0-9]+", value) is not None
            )

        def element(value):
            return (
                isinstance(value, list)
                and len(value) == n
                and all(
                    isinstance(c, str)
                    and re.fullmatch(r"-?[0-9]+(?://?[1-9][0-9]*)?", c)
                    for c in value
                )
            )

        def ideal(value):
            return (
                isinstance(value, list)
                and len(value) == n
                and all(element(c) for c in value)
            )

        def factored(value):
            return isinstance(value, list) and all(
                isinstance(f, dict) and element(f["factor"]) and integer(f["exponent"])
                for f in value
            )

        generators = compact["class_generators"]
        count = len(generators)

        def coordinates(value):
            return (
                isinstance(value, list)
                and len(value) == count
                and all(integer(c) for c in value)
            )

        def decomposition(value):
            witness_key = "generator_product_witness" if literal_product else "witness"
            return (
                isinstance(value, dict)
                and (
                    set(value) == {"coordinates", "representative", witness_key}
                    if literal_product
                    else "generator_product_witness" not in value
                )
                and coordinates(value["coordinates"])
                and ideal(value["representative"])
                and factored(value[witness_key])
            )

        units = compact["units"]
        if not (
            ideal(compact["integral_basis"])
            and isinstance(generators, list)
            and all(ideal(g) for g in generators)
            and len(compact["class_invariants"]) == count
            and all(integer(v) for v in compact["class_invariants"])
            and len(compact["class_coordinates"]) == count
            and all(coordinates(v) for v in compact["class_coordinates"])
            and len(compact["class_decompositions"]) == count
            and all(decomposition(v) for v in compact["class_decompositions"])
            and len(compact["class_power_witnesses"]) == count
            and all(
                integer(v["exponent"]) and factored(v["witness"])
                for v in compact["class_power_witnesses"]
            )
            and isinstance(units, list)
            and len(units) == sum(signature)
            and all(factored(u) for u in units)
            and len(compact["unit_invariants"]) == len(units)
            and all(integer(v) for v in compact["unit_invariants"])
            and len(compact["unit_coordinates"]) == len(units)
            and all(
                isinstance(v, list)
                and len(v) == len(units)
                and all(integer(c) for c in v)
                for v in compact["unit_coordinates"]
            )
            and len(compact["probes"]) == len(compact["decompositions"]) == 3
            and all(ideal(p) for p in compact["probes"])
            and all(decomposition(d) for d in compact["decompositions"])
        ):
            return False
        endpoints = [compact["regulator"][side] for side in ("lower", "upper")]
        if not all(
            isinstance(v, str) and re.fullmatch(r"-?[0-9]+(?://?[1-9][0-9]*)?", v)
            for v in endpoints
        ):
            return False
        lo, hi = [Fraction(v.replace("//", "/")) for v in endpoints]
        return (
            type(bits) is int
            and bits in (100, 200)
            and 0 < lo <= hi
            and hi - lo < Fraction(1, 2 ** (bits - 1))
        )
    except (KeyError, TypeError, ValueError, AttributeError, ZeroDivisionError):
        return False


def validate_answer(
    engine,
    response,
    label,
    degree=None,
    bits=200,
    iterations=1,
    proof_policy="conditional-grh",
    *,
    require_current=False,
):
    shared.validate_proof_policy(proof_policy)
    if response["status"] != "ok":
        return response["status"]
    validator = (
        shared.validate_terminal if engine == "pari" else shared.validate_hecke_terminal
    )
    result = validator(
        response["stdout"],
        response["stderr"],
        label,
        0,
        False,
        False,
        expected_bits=bits,
        expected_iterations=iterations,
        expected_proof_policy=proof_policy,
        require_current=require_current,
        **({"expected_degree": degree} if engine == "pari" else {}),
    )
    if (
        engine == "hecke"
        and result == "ok"
        and not validate_hecke_shape(response["stdout"], degree, bits)
    ):
        return "shape-error"
    if engine == "pari" and any(
        not line.startswith(
            ("FRONTIER_RESULT|", "FRONTIER_COMPACT|", "FRONTIER_COMPACT_JSON|")
        )
        for line in response["stdout"].splitlines()
        if line.strip()
    ):
        return "protocol-error"
    return result


class Campaign:
    def __init__(
        self,
        ledger,
        output,
        engine,
        factory,
        controls,
        provenance,
        seconds=60,
        startup_seconds=60,
        lock=LOCK,
        warmups=WARMUPS,
        bits=200,
        iterations=1,
        samples=1,
        proof_policy="conditional-grh",
    ):
        validate_measurement(bits, iterations, samples)
        self.proof_policy = shared.validate_proof_policy(proof_policy)
        self.ledger, self.output = Path(ledger), Path(output)
        self.engine, self.factory = engine, factory
        self.controls, self.provenance = controls, provenance
        self.seconds, self.startup_seconds = seconds, startup_seconds
        self.lock, self.warmups = Path(lock), warmups
        self.worker = None
        self.state = None
        self.session = 0
        self.bits, self.iterations, self.samples = bits, iterations, samples

    def attempt(
        self, name, stage, cap, operation, request=b"", record=None, sample=None
    ):
        destination = self.output / (name + ".json")
        if destination.exists():
            raise ValueError("refusing duplicate immutable attempt: " + name)
        reservation = cap + 10
        # Leave enough unspent budget to publish a charged shutdown even when
        # the next request cannot be admitted. Never launch on the last slot.
        shared.validate_state(
            self.state, reservation + (0 if stage == "shutdown" else 15)
        )
        self.state["pending"] = {
            "stage": stage,
            "label": name,
            "reserved_seconds": reservation,
            "output": str(destination),
            "started_at": datetime.now(timezone.utc).isoformat(),
            "request_sha256": hashlib.sha256(request).hexdigest(),
        }
        shared.save(self.ledger, self.state)
        started = time.monotonic()
        try:
            response = operation()
            if response["status"] != "ok" and self.worker is not None:
                self.worker.close()
                self.worker = None
            receipt = {
                "schema": "sagejs.general-frontier-persistent-screen.v2",
                "engine": self.engine,
                "stage": stage,
                "attempt": name,
                "session": self.session,
                "started_at": self.state["pending"]["started_at"],
                "qualification_evidence": False,
                "independent_replay": False,
                "requested_proof_policy": self.proof_policy,
                "boundary": "persistent-process-fresh-field-not-proven-warm-JIT",
                "bits": self.bits if stage in ("sample", "warmup") else None,
                "iterations": (self.iterations if stage == "sample" else 1)
                if stage in ("sample", "warmup")
                else None,
                "declared_samples": self.samples,
                "sample": sample,
                "request_id": name if stage in ("sample", "warmup") else None,
                "regulator_guarantee": "PARI-working-precision-approximation-not-enclosure"
                if self.engine == "pari"
                else f"Hecke-absolute-radius-less-than-2^-{self.bits}",
                "warmup_policy": "fixed-six-controls-repeated-after-restart-not-qualification",
                "record": record,
                "controls": self.controls,
                "provenance": self.provenance,
                "request_sha256": hashlib.sha256(request).hexdigest(),
                "cap_seconds": cap,
                "wall_seconds": time.monotonic() - started,
                **response,
            }
            immutable_save(destination, receipt)
            charge = time.monotonic() - started + 1
            if (
                charge > reservation
                or self.state["charged_seconds"] + charge > shared.LIMIT
            ):
                raise ValueError(
                    "charge exceeded durable reservation; reconciliation required"
                )
            self.state["charged_seconds"] += charge
            self.state["pending"] = None
            shared.save(self.ledger, self.state)
            return receipt
        except BaseException as error:
            capture = getattr(self.worker, "capture", (b"", b""))
            if self.worker is not None:
                self.worker.close()
                self.worker = None
            if isinstance(error, CoordinatorInterrupted) and not destination.exists():
                immutable_save(
                    destination,
                    {
                        "schema": "sagejs.general-frontier-persistent-screen.v2",
                        "requested_proof_policy": self.proof_policy,
                        "status": "interrupted",
                        "stage": stage,
                        "attempt": name,
                        "engine": self.engine,
                        "session": self.session,
                        "request_id": name if stage in ("sample", "warmup") else None,
                        "record": record,
                        "bits": self.bits if stage in ("sample", "warmup") else None,
                        "iterations": (self.iterations if stage == "sample" else 1)
                        if stage in ("sample", "warmup")
                        else None,
                        "sample": sample,
                        "declared_samples": self.samples,
                        "qualification_evidence": False,
                        "independent_replay": False,
                        "pending_reservation": self.state["pending"],
                        "wall_seconds": time.monotonic() - started,
                        "controls": self.controls,
                        "provenance": self.provenance,
                        "stdout": bytes(capture[0]).decode("utf-8", "replace"),
                        "stderr": bytes(capture[1]).decode("utf-8", "replace"),
                    },
                )
            # Keep the full pending reservation on interruption/publication failure.
            raise

    def prepare(self):
        self.session += 1
        marker = ("FRONTIER_READY|" + uuid.uuid4().hex).encode()

        def start():
            self.worker, payload = self.factory(marker)
            answer = self.worker.start(self.startup_seconds, marker, payload)
            if answer["status"] == "ok" and (
                answer["stdout"].strip() or answer["stderr"].strip()
            ):
                answer["status"] = "startup-error"
            return answer

        receipt = self.attempt(
            f"startup-{self.session:04}", "startup", self.startup_seconds, start
        )
        if receipt["status"] != "ok":
            raise RuntimeError("startup failed; receipt retained, no sample launched")
        for index, (label, coefficients) in enumerate(self.warmups):
            receipt = self.request(
                f"warmup-{self.session:04}-{index:02}-{label}",
                "warmup",
                label,
                coefficients,
            )
            if receipt["status"] != "ok":
                raise RuntimeError(
                    "warmup failed; receipt retained, no sample launched"
                )

    def request(self, name, stage, label, coefficients, sample=None):
        iterations = self.iterations if stage == "sample" else 1
        payload, marker = encode_request(
            self.engine, name, coefficients, self.bits, 1, iterations, self.proof_policy
        )

        def operation():
            answer = self.worker.exchange(payload, self.seconds, marker)
            answer["status"] = validate_answer(
                self.engine,
                answer,
                name,
                len(coefficients) - 1,
                self.bits,
                iterations,
                self.proof_policy,
                require_current=True,
            )
            return answer

        return self.attempt(
            name,
            stage,
            self.seconds,
            operation,
            payload,
            {"label": label, "coefficients": coefficients},
            sample,
        )

    def run(self, records):
        identities = [shared.validate_case(record) for record in records]
        if not 1 <= len(identities) <= 200:
            raise ValueError("one batch contains 1..200 records")
        if len({label for label, _ in identities}) != len(identities):
            raise ValueError("duplicate labels")
        if not self.ledger.is_file():
            raise ValueError(
                "existing shared M0 ledger required; no implicit fresh budget"
            )
        self.output.mkdir(parents=True, exist_ok=True)
        with open(self.lock, "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.state = json.loads(self.ledger.read_text())
            shared.validate_state(self.state, self.startup_seconds + 25)
            immutable_save(
                self.output / "run.json",
                {
                    "schema": "sagejs.general-frontier-persistent-request.v2",
                    "requested_proof_policy": self.proof_policy,
                    "engine": self.engine,
                    "records": records,
                    "warmups": self.warmups,
                    "bits": self.bits,
                    "iterations": self.iterations,
                    "samples": self.samples,
                    "sample_order": "sample-major-input-order",
                    "seed": 1,
                    "qualification_evidence": False,
                    "provenance": self.provenance,
                },
            )
            with interrupted_signals():
                try:
                    for sample in range(1, self.samples + 1):
                        for label, coefficients in identities:
                            if self.worker is None:
                                self.prepare()
                            self.request(
                                f"sample-{sample:04}-{label}",
                                "sample",
                                label,
                                coefficients,
                                sample,
                            )
                finally:
                    if self.worker is not None:
                        if self.state["pending"] is None:

                            def shutdown():
                                self.worker.close()
                                self.worker = None
                                return {"status": "ok", "stdout": "", "stderr": ""}

                            self.attempt("shutdown", "shutdown", 5, shutdown)
                        else:
                            self.worker.close()
                            self.worker = None


def worker_factory(
    engine,
    executable,
    worker,
    project=None,
    depot=None,
    output_cap=32 * 1024 * 1024,
    *,
    toy_replay=False,
):
    environment = dict(
        os.environ,
        OPENBLAS_NUM_THREADS="1",
        JULIA_NUM_THREADS="1",
        OMP_NUM_THREADS="1",
        MKL_NUM_THREADS="1",
        JULIA_PKG_PRECOMPILE_AUTO="0",
    )
    worker, executable = (
        Path(worker).resolve(strict=True),
        Path(executable).resolve(strict=True),
    )
    files = [worker, executable, Path(__file__), SHARED_PATH]
    if engine == "hecke":
        project, depot = (
            Path(project).resolve(strict=True),
            Path(depot).resolve(strict=True),
        )
        environment["JULIA_DEPOT_PATH"] = str(depot)
        environment["JULIA_LOAD_PATH"] = "@:@stdlib"
        files += [
            project / "Project.toml",
            project / "Manifest.toml",
            worker.with_name("transport.jl"),
            HERE / "hecke-bootstrap.jl",
        ]
        if toy_replay:
            files.append(worker.with_name("generator-witness-smoke.jl"))

    hashes = {str(path): digest(path) for path in files}

    def factory(marker):
        if any(digest(path) != expected for path, expected in hashes.items()):
            raise ValueError("reference artifacts changed after provenance snapshot")
        if engine == "pari":
            command = [
                str(executable),
                "-fq",
                "--default",
                "parisizemax=2147483648",
                "--default",
                "nbthreads=1",
                "--default",
                "threadsizemax=2147483648",
                str(worker),
            ]
            payload = ("print(" + json.dumps(marker.decode()) + ");\n").encode()
        else:
            command = [
                str(executable),
                "--startup-file=no",
                "--compiled-modules=strict",
                "--pkgimages=existing",
                "--project=" + str(project),
                str(HERE / "hecke-bootstrap.jl"),
                str(worker),
                marker.decode(),
            ]
            if toy_replay:
                command.append("--toy-replay")
            payload = b""
        return Worker(command, environment, engine, output_cap), payload

    return factory, {
        "sha256": hashes,
        "threads": 1,
        "julia_cache_policy": "strict-existing-only" if engine == "hecke" else None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, required=True)
    parser.add_argument("--engine", choices=("pari", "hecke"), required=True)
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--project", type=Path)
    parser.add_argument("--depot", type=Path)
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--startup-seconds", type=int, default=60)
    parser.add_argument("--bits", type=int, default=200)
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--samples", type=int, default=1)
    parser.add_argument(
        "--proof-policy", choices=shared.PROOF_POLICIES, default="conditional-grh"
    )
    args = parser.parse_args()
    validate_measurement(args.bits, args.iterations, args.samples)
    if not all(1 <= cap <= 600 for cap in (args.seconds, args.startup_seconds)):
        raise ValueError("caps must be 1..600 seconds")
    if args.engine == "hecke" and (args.project is None or args.depot is None):
        raise ValueError("Hecke requires provisioned --project and --depot")
    controls = shared.require_controls()
    input_bytes = args.input.read_bytes()
    records = json.loads(input_bytes)
    factory, provenance = worker_factory(
        args.engine, args.executable, args.worker, args.project, args.depot
    )
    provenance["input_sha256"] = hashlib.sha256(input_bytes).hexdigest()
    Campaign(
        args.ledger,
        args.output,
        args.engine,
        factory,
        controls,
        provenance,
        args.seconds,
        args.startup_seconds,
        bits=args.bits,
        iterations=args.iterations,
        samples=args.samples,
        proof_policy=args.proof_policy,
    ).run(records)


if __name__ == "__main__":
    main()
