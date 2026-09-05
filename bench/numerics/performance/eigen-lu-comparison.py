"""Matched single-thread LU development evidence, not public API qualification."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path

for variable in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[variable] = "1"

import numpy as np
import scipy
import scipy.linalg
from threadpoolctl import threadpool_info


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if len(sys.argv) != 4:
        raise ValueError(
            "usage: eigen-lu-comparison.py EIGEN_SOURCE GENERATED_CORE NEW_OUTPUT"
        )
    eigen, core, output = (Path(value).resolve() for value in sys.argv[1:])
    output.mkdir(exist_ok=False)
    source = Path(__file__).with_suffix(".cpp")
    inputs = [source, Path(__file__), core / "kernel_core.c", core / "kernel_core.h"]
    source_hashes = {str(path): digest(path) for path in inputs}
    eigen_headers = {
        str(path.relative_to(eigen)): digest(path)
        for path in sorted((eigen / "Eigen").rglob("*"))
        if path.is_file()
    }
    flags = ["-O2", "-fno-fast-math", "-ffp-contract=off"]
    commands = [
        [
            "cc",
            "-std=c11",
            *flags,
            "-I" + str(core),
            "-c",
            str(core / "kernel_core.c"),
            "-o",
            str(output / "core.o"),
        ],
        [
            "c++",
            "-std=c++14",
            *flags,
            "-I" + str(eigen),
            "-I" + str(core),
            str(source),
            str(output / "core.o"),
            "-o",
            str(output / "comparison"),
        ],
    ]
    build_start = time.perf_counter()
    with (output / "build.log").open("w") as log:
        for command in commands:
            subprocess.run(command, check=True, stdout=log, stderr=log, timeout=180)
    build_seconds = time.perf_counter() - build_start
    native = subprocess.run(
        [str(output / "comparison")],
        check=True,
        text=True,
        capture_output=True,
        timeout=180,
    )
    (output / "native-output.json").write_text(native.stdout)
    cases = json.loads(native.stdout)
    records = []
    for case in cases:
        n = case["n"]
        a = np.asarray(case["input"], dtype=np.float64).reshape(n, n)
        checks = {}
        for backend in ("source", "eigen"):
            packed = np.asarray(case[backend + "_packed"]).reshape(n, n)
            raw_permutation = np.asarray(case[backend + "_permutation"])
            permutation = raw_permutation.astype(int)
            assert np.array_equal(raw_permutation, permutation)
            assert sorted(permutation.tolist()) == list(range(n))
            lower, upper = np.tril(packed, -1) + np.eye(n), np.triu(packed)
            residual = float(
                np.linalg.norm(a[permutation] - lower @ upper, np.inf)
                / np.linalg.norm(a, np.inf)
            )
            assert np.isfinite(residual) and residual < 64 * np.finfo(float).eps * n
            checks[backend] = {"relative_reconstruction": residual, "passed": True}
        # LAPACK verifies a complete factorization independently of both cores.
        p, lower, upper = scipy.linalg.lu(a)
        scipy_residual = float(
            np.linalg.norm(a - p @ lower @ upper, np.inf) / np.linalg.norm(a, np.inf)
        )
        assert scipy_residual < 64 * np.finfo(float).eps * n
        scipy_samples = []
        for block in range(10):
            start = time.perf_counter()
            for k in range(case["batch"]):
                a[0, 0] = n + (k % 2) * 0.001
                result = scipy.linalg.lu_factor(
                    a, overwrite_a=False, check_finite=False
                )
                assert np.isfinite(result[0][0, 0])
            elapsed = (time.perf_counter() - start) * 1000 / case["batch"]
            if block >= 3:
                scipy_samples.append(elapsed)
        samples = {
            "typed_source": case["source_ms"],
            "eigen": case["eigen_ms"],
            "scipy": scipy_samples,
        }
        records.append(
            {
                "n": n,
                "batch": case["batch"],
                "samples_ms": samples,
                "medians_ms": {
                    name: statistics.median(values) for name, values in samples.items()
                },
                "checks": checks,
                "scipy_relative_reconstruction": scipy_residual,
            }
        )
    assert {str(path): digest(path) for path in inputs} == source_hashes
    pools = threadpool_info()
    assert all(pool["num_threads"] == 1 for pool in pools)
    report = {
        "schema": "sagejs.eigen-lu-comparison/v1",
        "qualification": False,
        "host": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "versions": {"numpy": np.__version__, "scipy": scipy.__version__},
        "threadpools": pools,
        "source_hashes": source_hashes,
        "eigen_header_hashes": eigen_headers,
        "commands": commands,
        "build_seconds": build_seconds,
        "warmups": 3,
        "samples": 7,
        "records": records,
        "scope": "retained-workspace factorization cores, not Sage.js public calls",
        "limits": [
            "Eigen and typed source alternate in one process; SciPy is a later block",
            "SciPy includes Python boundary and fresh returned arrays; not an identical retained-workspace API",
            "input diagonal mutation and output observation included",
            "independent reconstruction outside timing",
            "no general conditioning or failure corpus",
            "no startup, peak memory, browser, or product qualification",
        ],
    }
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"records": records, "report": str(output / "report.json")}))


if __name__ == "__main__":
    main()
