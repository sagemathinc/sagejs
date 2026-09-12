"""Offline protocol fixture, never a mathematical reference."""

import json
import os
from pathlib import Path
import subprocess
import sys
import time


state, marker = Path(sys.argv[1]), sys.argv[2]
with state.open("a") as stream:
    stream.write(str(os.getpid()) + "\n")
print(marker, flush=True)
previous_id = None
for line in sys.stdin:
    protocol, label, bits, iterations, seed, policy, _ = line.rstrip("\n").split("\t")
    assert protocol == "FRONTIER2" and policy in ("conditional-grh", "unconditional")
    bits, iterations = int(bits), int(iterations)
    if label.endswith("-timeout"):
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        state.with_suffix(".descendant").write_text(str(child.pid))
        time.sleep(60)
    if label.endswith("-output-limit"):
        print("x" * 100000, flush=True)
        continue
    if label.endswith("-crash"):
        sys.exit(7)
    basis = [["1", "0"], ["0", "1"]]
    decomposition = {
        "coordinates": [],
        "representative": basis,
        "generator_product_witness": [],
    }
    answer = json.dumps(
        {
            "status": "ok",
            "result": {
                "schema": "sagejs-hecke-frontier-screen-v3",
                "seed": seed,
                "boundary": "persistent-process-fresh-field-complete-compact-screen",
                "witness_semantics": "ideal-equals-principal-witness-times-literal-class-generator-product",
                "proof_policy": policy,
                "proof_execution": None
                if policy == "conditional-grh"
                else {
                    "method": "hecke-class-and-unit-grh-false",
                    "class_group_grh": False,
                    "unit_group_grh": False,
                    "completed_iterations": iterations,
                    "class_group_call_nanoseconds": "0",
                    "unit_group_call_nanoseconds": "0",
                },
                "independent_replay": False,
                "retained_iteration": iterations,
                "batch_outputs_complete": iterations == 1,
                "versions": {
                    "julia": "offline-fake",
                    "hecke": "offline-fake",
                    "nemo": "offline-fake",
                },
                "id": previous_id if label.endswith("-reused-id") else label,
                "bits": 300 - bits if label.endswith("-wrong-bits") else bits,
                "iterations": iterations + 1
                if label.endswith("-wrong-batch")
                else iterations,
                "elapsed_ns": "1",
                "compact": {
                    "class_number": "1",
                    "discriminant": "8",
                    "torsion_order": "2",
                    "signature": [2, 0],
                    "integral_basis": basis,
                    "class_invariants": [],
                    "class_generators": [],
                    "class_coordinates": [],
                    "class_decompositions": [],
                    "class_power_witnesses": [],
                    "units": [[], []],
                    "unit_invariants": ["2", "0"],
                    "unit_coordinates": [["1", "0"], ["0", "1"]],
                    "probes": [basis, basis, basis],
                    "decompositions": [decomposition, decomposition, decomposition],
                    "regulator": {
                        "bits": bits,
                        "guarantee": "absolute-radius-less-than-2^-bits",
                        "lower": "1",
                        "upper": "1",
                        "display": "1",
                        "fundamental_units_policy": policy,
                    },
                },
            },
        }
    )
    print(answer, flush=True)
    if label.endswith("-duplicate"):
        print(answer, flush=True)
    previous_id = label
