"""Offline v2 mutation tests; optional single-process, 180-second GP toy replay.

The default unittest command never launches a CAS. The explicit diagnostic
mode retains every stage, including failures, and is not performance evidence.
"""

import argparse
import copy
from datetime import datetime, timezone
from fractions import Fraction
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
import time
import unittest


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "pari_supervisor", HERE.parent / "persistent/supervisor.py"
)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)
screen = supervisor.shared
spec = importlib.util.spec_from_file_location(
    "pari_review", HERE / "summarize-persistent.py"
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def fixture(n=2, orders=(2,), iterations=1):
    basis = [[str(int(i == j)) for i in range(n)] for j in range(n)]
    signature = [n % 2, n // 2]
    m = sum(signature)
    coordinates = [
        [str(int(i == j)) for i in range(len(orders))] for j in range(len(orders))
    ]
    identity = {"coordinates": ["0"] * len(orders), "generator_product_witness": []}
    return {
        "schema": screen.PARI_SCHEMA,
        "id": "field",
        "bits": 200,
        "iterations": iterations,
        "seed": "1",
        "proof_policy": "conditional-grh",
        "independent_replay": False,
        "witness_semantics": screen.PARI_SEMANTICS,
        "class_generator_order": "pari-bnf.gen",
        "unit_generator_order": "torsion-first-then-bnfunits-free-order",
        "element_basis": "ascending-powers-of-input-generator",
        "ideal_basis_layout": "outer-array-of-basis-elements",
        "pari_version": [2, 15, 4],
        "retained_iteration": iterations,
        "batch_outputs_complete": iterations == 1,
        "compact": {
            "class_number": str(math.prod(orders)),
            "class_invariants": [str(d) for d in orders],
            "discriminant": "-20",
            "signature": signature,
            "integral_basis": basis,
            "class_generators": [copy.deepcopy(basis) for _ in orders],
            "class_coordinates": coordinates,
            "class_decompositions": [
                {"coordinates": c, "generator_product_witness": []} for c in coordinates
            ],
            "class_power_witnesses": [
                {"exponent": str(d), "witness": []} for d in orders
            ],
            "torsion_order": "2",
            "unit_invariants": ["2"] + ["0"] * (m - 1),
            "units": [[] for _ in range(m)],
            "unit_coordinates": [
                [str(int(i == j)) for i in range(m)] for j in range(m)
            ],
            "probes": [copy.deepcopy(basis) for _ in range(3)],
            "decompositions": [copy.deepcopy(identity) for _ in range(3)],
            "regulator": {
                "guarantee": "working-precision-approximation",
                "requested_working_bits": 200,
                "initial_working_bits": 256,
                "value_precision_bits": None if m == 1 else 256,
                "text": "1",
                "fundamental_units_policy": "conditional-grh",
            },
        },
    }


def frames(value):
    c = value["compact"]
    header = "|".join(
        [
            "FRONTIER_RESULT",
            value["id"],
            str(value["bits"]),
            str(value["iterations"]),
            "1",
            c["class_number"],
            json.dumps([int(d) for d in c["class_invariants"]]),
            c["discriminant"],
            json.dumps(c["signature"]),
            c["torsion_order"],
            c["regulator"]["text"],
        ]
    )
    return (
        header
        + "\nFRONTIER_COMPACT_JSON|"
        + value["id"]
        + "|"
        + json.dumps(value)
        + "\n"
    )


def check(value, degree=None, iterations=1):
    return supervisor.validate_answer(
        "pari",
        {"status": "ok", "stdout": frames(value), "stderr": ""},
        "field",
        degree,
        200,
        iterations,
    )


class PariExplicitOutput(unittest.TestCase):
    def test_empty_rank_zero_and_unequal_native_orders(self):
        for value, degree in (
            (fixture(), 2),
            (fixture(2, ()), 2),
            (fixture(3, (4, 2)), 3),
        ):
            self.assertEqual(check(value, degree), "ok")

    def test_every_fixed_key_required_and_no_extra_keys(self):
        base = fixture()
        for path in ((), ("compact",), ("compact", "regulator")):
            original = base
            for key in path:
                original = original[key]
            for key in list(original) + ["unknown"]:
                value = copy.deepcopy(base)
                changed = value
                for part in path:
                    changed = changed[part]
                if key == "unknown":
                    changed[key] = False
                else:
                    changed.pop(key)
                # Missing scalar keys cannot be passed through frames().
                output = frames(base).splitlines()
                output[1] = "FRONTIER_COMPACT_JSON|field|" + json.dumps(value)
                with self.subTest(path=path, key=key):
                    self.assertNotEqual(
                        screen.validate_terminal(
                            "\n".join(output), "", "field", 0, False, False
                        ),
                        "ok",
                    )

    def test_exact_integer_and_rational_leaves(self):
        value = fixture()
        factors = value["compact"]["units"][0]
        factors.append(
            {"factor": [str(2**200 + 1), "-1/3"], "exponent": str(-(2**100 + 1))}
        )
        self.assertEqual(check(value), "ok")
        for leaf in (
            "01",
            "-0",
            "0/2",
            "1/1",
            "2/4",
            "1/0",
            "1/-2",
            "1//2",
            "0.5",
            "x",
            "Mod(1,x)",
            True,
            1,
            None,
        ):
            changed = copy.deepcopy(value)
            changed["compact"]["units"][0][0]["factor"][0] = leaf
            self.assertNotEqual(check(changed), "ok", repr(leaf))
        for exponent in ("0", "-0", "01", "1/2", True, 1):
            changed = copy.deepcopy(value)
            changed["compact"]["units"][0][0]["exponent"] = exponent
            self.assertNotEqual(check(changed), "ok")
        for mutation in (
            lambda f: f.update(factor=["0", "0"]),
            lambda f: f.update(extra=1),
            lambda f: f.pop("exponent"),
        ):
            changed = copy.deepcopy(value)
            mutation(changed["compact"]["units"][0][0])
            self.assertNotEqual(check(changed), "ok")

    def test_request_ordering_and_scope_mutations(self):
        mutations = [
            ("schema", "sagejs-pari-frontier-screen-v3"),
            ("seed", "2"),
            ("bits", True),
            ("iterations", True),
            ("retained_iteration", True),
            ("batch_outputs_complete", 1),
            ("batch_outputs_complete", False),
            ("independent_replay", True),
            ("proof_policy", "unconditional"),
            ("witness_semantics", "reduced-representative"),
            ("class_generator_order", "sorted"),
            ("unit_generator_order", "torsion-last"),
            ("pari_version", [2, 15, True]),
        ]
        for key, replacement in mutations:
            value = fixture()
            value[key] = replacement
            self.assertNotEqual(check(value), "ok", key)
        self.assertNotEqual(check(fixture(), 3), "ok")
        value = fixture(iterations=3)
        self.assertEqual(check(value, iterations=3), "ok")
        value["batch_outputs_complete"] = True
        self.assertNotEqual(check(value, iterations=3), "ok")

    def test_presentation_and_dimensions_fail_closed(self):
        for name in (
            "integral_basis",
            "class_generators",
            "class_coordinates",
            "class_decompositions",
            "class_power_witnesses",
            "units",
            "unit_coordinates",
            "unit_invariants",
            "probes",
            "decompositions",
        ):
            value = fixture(3, (4, 2))
            value["compact"][name] = []
            self.assertNotEqual(check(value), "ok", name)
        for mutation in (
            lambda c: c.update(class_invariants=["2", "4"]),
            lambda c: c["class_coordinates"].reverse(),
            lambda c: c["class_decompositions"][0].update(coordinates=["0", "1"]),
            lambda c: c["class_decompositions"][0].update(representative=[]),
            lambda c: c["class_power_witnesses"][0].update(exponent="2"),
            lambda c: c["decompositions"][0].update(coordinates=["4", "0"]),
            lambda c: c["decompositions"][0].update(coordinates=["-1", "0"]),
            lambda c: c.update(unit_invariants=["0", "2"]),
            lambda c: c["unit_coordinates"].reverse(),
        ):
            value = fixture(3, (4, 2))
            mutation(value["compact"])
            self.assertNotEqual(check(value), "ok")

    def test_regulator_never_upgraded_to_enclosure(self):
        for key, replacement in (
            ("guarantee", "absolute-radius-less-than-2^-bits"),
            ("lower", "1"),
            ("requested_working_bits", True),
            ("initial_working_bits", 100),
            ("value_precision_bits", "+oo"),
            ("value_precision_bits", True),
            ("text", "0"),
            ("text", "NaN"),
            ("text", "1/2"),
            ("fundamental_units_policy", "unconditional"),
        ):
            value = fixture()
            value["compact"]["regulator"][key] = replacement
            self.assertNotEqual(check(value), "ok", key)

    def test_json_framing_and_summary_splices(self):
        good = frames(fixture())
        for output in (
            good + good,
            good + "extra\n",
            good + "FRONTIER_COMPACT|field|[]\n",
            good.replace('"schema":', '"schema":"duplicate","schema":'),
            good.replace('"seed": "1"', '"seed": NaN'),
            good.replace('"seed": "1"', '"seed": Infinity'),
            good.replace('"seed": "1"', '"seed": ' + "[" * 1500 + "0" + "]" * 1500),
            good.replace("|1|2|[2]|", "|1|3|[2]|"),
            good.replace("|[0, 1]|", "|[2, 0]|"),
            good.replace("|2|1\n", "|4|1\n"),
            good.replace("|2|1\n", "|2|2\n"),
            good.replace(
                "FRONTIER_COMPACT_JSON|field|", "FRONTIER_COMPACT_JSON|other|"
            ),
        ):
            self.assertNotEqual(
                screen.validate_terminal(output, "", "field", 0, False, False), "ok"
            )
        self.assertEqual(
            screen.validate_terminal(good, "", "field", -9, True, False), "timeout"
        )
        self.assertEqual(
            screen.validate_terminal(good, "", "field", 0, False, True), "output-limit"
        )

    def test_normalized_legacy_never_silently_upgraded(self):
        for modern in (False, True):
            value = fixture(3, (4, 2), iterations=3)
            output = frames(value)
            if not modern:
                output = output.replace("FRONTIER_COMPACT_JSON|", "FRONTIER_COMPACT|")
            receipt = {
                "record": {"label": "field", "coefficients": ["-1", "14", "0", "1"]},
                "engine": "pari",
                "status": "ok",
                "wall_seconds": 1,
                "bits": 200,
                "iterations": 3,
                "sample": 1,
                "declared_samples": 1,
                "request_id": "sample-0001-field",
                "stdout": output.replace("field", "sample-0001-field"),
                "stderr": "",
            }
            row = review.normalize(receipt)
            self.assertEqual(row["status"], "ok")
            self.assertEqual(row["exact_compact_output"], modern)
            self.assertEqual(row["class_invariants"], ["2", "4"])
            if modern:
                self.assertEqual(row["presentation_class_invariants"], ["4", "2"])
                self.assertFalse(row["batch_outputs_complete"])
                self.assertEqual(row["retained_iteration"], 3)
            else:
                self.assertEqual(row["worker_schema"], "legacy-pari-native-text")
                self.assertNotIn("witness_semantics", row)


def gp_vector(value):
    """Only decoded exact rational/integer arrays, never raw GP expressions."""
    if isinstance(value, list):
        return "[" + ",".join(gp_vector(item) for item in value) + "]"
    if not isinstance(value, str) or str(Fraction(value)) != value:
        raise ValueError("noncanonical replay leaf")
    return value


def replay_commands(result, coefficients):
    c = result["compact"]
    n = len(coefficients) - 1
    basis = gp_vector(c["integral_basis"])
    generators = gp_vector(c["class_generators"])
    commands = [
        f"default(realbitprecision,{result['bits']}); setrand(1); b=bnfinit(Polrev({gp_vector(coefficients)}),1);",
        f'z={basis}; frontier_assert(vector({n},j,frontier_decode_element(b,z[j])) == vector({n},j,Mod(b.zk[j],b.pol)),"decoded order basis");',
    ]
    commands.append(
        f'gs={generators}; frontier_assert(vector(#gs,j,frontier_decode_ideal(b,gs[j])) == b.gen,"native generator order");'
    )

    def factors(value):
        return gp_vector([[f["factor"], f["exponent"]] for f in value])

    for basis_value, decomposition in zip(
        c["class_generators"] + c["probes"],
        c["class_decompositions"] + c["decompositions"],
    ):
        call = f"frontier_replay_equation(b,{gp_vector(basis_value)},gs,{gp_vector(decomposition['coordinates'])},{factors(decomposition['generator_product_witness'])})"
        commands.append(f'frontier_assert({call},"decoded literal ideal equation");')
        tampered = copy.deepcopy(decomposition["generator_product_witness"])
        tampered.append({"factor": ["2"] + ["0"] * (n - 1), "exponent": "1"})
        commands.append(
            f'frontier_assert(!frontier_replay_equation(b,{gp_vector(basis_value)},gs,{gp_vector(decomposition["coordinates"])},{factors(tampered)}),"decoded witness mutation");'
        )
    for j, power in enumerate(c["class_power_witnesses"], 1):
        commands.append(
            f'frontier_assert(idealpow(b,b.gen[{j}],{power["exponent"]}) == idealhnf(b,frontier_decode_factored(b,{factors(power["witness"])})),"decoded class power");'
        )
    commands.append("u=bnfunits(b);")
    permutation = [len(c["units"])] + list(range(1, len(c["units"])))
    for j, native_j in enumerate(permutation):
        commands.append(
            f'frontier_assert(frontier_decode_factored(b,{factors(c["units"][j])}) == nfbasistoalg(b,nffactorback(b,u[1][{native_j}])),"decoded torsion-first unit");'
        )
    return commands


def diagnostic(executable, output):
    """One existing Worker, one overall 180s deadline, all stages immutable."""
    output.mkdir(parents=True, exist_ok=False)
    worker_path = HERE.parent / "pari-screen.gp"
    smoke_path = HERE.parent / "pari-explicit-output-smoke.gp"
    try:
        executable = executable.resolve(strict=True)
    except OSError as error:
        supervisor.immutable_save(
            output / "preflight-failure.json",
            {
                "status": "preflight-error",
                "executable_requested": str(executable),
                "error": str(error),
                "gp_processes_launched": 0,
                "qualification_evidence": False,
            },
        )
        raise
    command = [
        str(executable),
        "-fq",
        "--default",
        "parisizemax=268435456",
        "--default",
        "nbthreads=1",
        "--default",
        "threadsizemax=268435456",
        str(worker_path),
    ]
    supervisor.immutable_save(
        output / "inputs.json",
        {
            "command": command,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "deadline_seconds": 180,
            "output_cap_bytes": 32 * 1024 * 1024,
            "qualification_evidence": False,
            "controls": "local-uncontrolled-correctness-only",
            "hashes": {
                str(p): supervisor.digest(p)
                for p in (
                    executable,
                    worker_path,
                    smoke_path,
                    Path(__file__),
                    Path(supervisor.__file__),
                    Path(screen.__file__),
                )
            },
        },
    )
    worker = supervisor.Worker(
        command, dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1"), "pari"
    )
    started = time.monotonic()
    status = "error"
    try:
        marker = b"FRONTIER_DIAGNOSTIC_READY"
        ready = worker.start(
            10,
            marker,
            b'print("FRONTIER_DIAGNOSTIC_VERSION|",version());\nprint("FRONTIER_DIAGNOSTIC_READY");\n',
        )
        supervisor.immutable_save(output / "startup.json", ready)
        if (
            ready["status"] != "ok"
            or not ready["stdout"].startswith("FRONTIER_DIAGNOSTIC_VERSION|")
            or ready["stderr"].strip()
        ):
            raise ValueError("diagnostic startup failed; raw receipt retained")
        payload = (
            f'read({json.dumps(str(smoke_path))});\nfrontier_explicit_smoke();\nprint("FRONTIER_DIAGNOSTIC_DONE");\n'
        ).encode()
        supervisor.immutable_save(output / "request.json", {"text": payload.decode()})
        response = worker.exchange(
            payload,
            max(0.001, 175 - (time.monotonic() - started)),
            b"FRONTIER_DIAGNOSTIC_DONE",
        )
        supervisor.immutable_save(output / "math.json", response)
        if (
            response["status"] != "ok"
            or response["stderr"].strip()
            or "FRONTIER_TEST|complete|ok\n" not in response["stdout"]
        ):
            raise ValueError("GP exact diagnostics failed; raw receipt retained")
        lines = response["stdout"].splitlines()
        results = []
        commands = []
        polynomials = [
            ["4", "0", "1"],
            ["21", "0", "1"],
            ["39", "0", "1"],
            ["-1", "14", "0", "1"],
            ["1", "0", "0", "0", "1"],
        ]
        for i, line in enumerate(lines):
            if not line.startswith("FRONTIER_RESULT|"):
                continue
            _, label, bits, iterations, *_ = line.split("|")
            coefficients = polynomials[
                0 if label == "explicit-batch" else int(label.split("-")[1]) - 1
            ]
            pair = line + "\n" + lines[i + 1] + "\n"
            if (
                screen.validate_terminal(
                    pair,
                    "",
                    label,
                    0,
                    False,
                    False,
                    expected_bits=int(bits),
                    expected_iterations=int(iterations),
                    expected_degree=len(coefficients) - 1,
                )
                != "ok"
            ):
                raise ValueError("emitted schema failed strict validation: " + label)
            result = screen.parse_pari_compact(
                pair, label, int(bits), int(iterations), len(coefficients) - 1
            )
            results.append(result)
            commands += replay_commands(result, coefficients)
        if len(results) != 11:
            raise ValueError("missing declared diagnostic requests")
        commands.append('print("FRONTIER_DECODED_REPLAY|ok");')
        commands.append('print("FRONTIER_REPLAY_DONE");')
        replay = ("\n".join(commands) + "\n").encode()
        supervisor.immutable_save(output / "decoded.json", results)
        supervisor.immutable_save(
            output / "replay-request.json", {"text": replay.decode()}
        )
        response = worker.exchange(
            replay,
            max(0.001, 175 - (time.monotonic() - started)),
            b"FRONTIER_REPLAY_DONE",
        )
        supervisor.immutable_save(output / "replay.json", response)
        if (
            response["status"] != "ok"
            or response["stderr"].strip()
            or response["stdout"] != "FRONTIER_DECODED_REPLAY|ok\n"
        ):
            raise ValueError("decoded exact replay failed; raw receipt retained")
        status = "ok"
    finally:
        worker.close()
        supervisor.immutable_save(
            output / "completion.json",
            {
                "status": status,
                "elapsed_seconds": time.monotonic() - started,
                "qualification_evidence": False,
            },
        )
    print(
        json.dumps(
            {
                "status": status,
                "output": str(output),
                "requests": 11,
                "qualification_evidence": False,
            }
        )
    )


if __name__ == "__main__":
    if "--gp-diagnostic" in sys.argv:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--gp-diagnostic", type=Path, required=True)
        parser.add_argument("--output", type=Path, required=True)
        args = parser.parse_args()
        diagnostic(args.gp_diagnostic, args.output)
    else:
        unittest.main()
