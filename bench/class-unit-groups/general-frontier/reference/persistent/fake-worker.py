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
for line in sys.stdin:
    label = line.split("\t")[1]
    if label == "timeout":
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        state.with_suffix(".descendant").write_text(str(child.pid))
        time.sleep(60)
    if label == "output-limit":
        print("x" * 100000, flush=True)
        continue
    if label == "crash":
        sys.exit(7)
    basis = [["1", "0"], ["0", "1"]]
    decomposition = {"coordinates": [], "representative": basis, "witness": []}
    answer = json.dumps(
        {
            "status": "ok",
            "result": {
                "schema": "sagejs-hecke-frontier-screen-v1",
                "id": label,
                "bits": 200,
                "iterations": 1,
                "elapsed_ns": "1",
                "compact": {
                    "class_number": "1",
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
                        "bits": 200,
                        "guarantee": "absolute-radius-less-than-2^-bits",
                        "lower": "1",
                        "upper": "1",
                    },
                },
            },
        }
    )
    print(answer, flush=True)
    if label == "duplicate":
        print(answer, flush=True)
