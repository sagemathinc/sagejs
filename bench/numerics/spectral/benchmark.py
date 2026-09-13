"""Reproducible local performance and payload witness for spectral methods."""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import platform
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Callable

import mpmath
import numpy as np
import scipy.linalg
import scipy.signal
import scipy.sparse
import scipy.sparse.linalg

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "src" / "lib" / "sagejs" / "numerics" / "spectral"
sys.path.append(str(ROOT / "src" / "lib"))

from sagejs.numerics.spectral import (  # noqa: E402
    CSRMatrix,
    convolve,
    fft,
    general_eigen,
    sparse_eigen,
    sparse_solve,
    svd,
    symmetric_eigen,
)


def _measure(function: Callable[[], Any], repetitions: int) -> float:
    samples: list[float] = []
    for _ in range(repetitions):
        started = time.perf_counter()
        value = function()
        elapsed = (time.perf_counter() - started) * 1000.0
        if hasattr(value, "success") and not value.success:
            raise AssertionError((value.status, value.validation.to_dict()))
        samples.append(elapsed)
    return statistics.median(samples)


def _record(
    name: str,
    sagejs: Callable[[], Any],
    oracle: Callable[[], Any],
    *,
    repetitions: int,
    shape: list[int],
) -> dict[str, Any]:
    sagejs()
    oracle()
    return {
        "id": name,
        "shape": shape,
        "repetitions": repetitions,
        "sagejs_median_ms": _measure(sagejs, repetitions),
        "numpy_scipy_median_ms": _measure(oracle, repetitions),
    }


def main() -> None:
    symmetric = np.asarray(
        [
            [
                (4.0 if row == column else 1.0 / (1.0 + abs(row - column)))
                for column in range(24)
            ]
            for row in range(24)
        ]
    )
    general = np.asarray(
        [
            [
                math.sin((row + 1) * (column + 2)) + (2.0 if row == column else 0.0)
                for column in range(10)
            ]
            for row in range(10)
        ]
    )
    rectangular = np.asarray(
        [
            [math.sin((row + 1) * (column + 1) / 7.0) for column in range(18)]
            for row in range(30)
        ]
    )
    samples = np.asarray(
        [
            complex(math.sin(index / 11.0), math.cos(index / 17.0))
            for index in range(4096)
        ]
    )
    left = np.asarray([math.sin(index / 13.0) for index in range(512)])
    right = np.asarray([math.cos(index / 17.0) for index in range(512)])
    sparse_dense = np.diag(np.full(400, 4.0))
    sparse_dense += np.diag(np.full(399, -1.0), 1)
    sparse_dense += np.diag(np.full(399, -1.0), -1)
    sparse = CSRMatrix.from_dense(sparse_dense.tolist())
    scipy_sparse = scipy.sparse.csr_array(sparse_dense)
    right_hand_side = np.asarray([1.0 + (index % 5) for index in range(400)])
    eigen_dense = np.diag(
        np.asarray([10.0] + [2.0 + (index % 11) / 50.0 for index in range(399)])
    )
    eigen_sparse = CSRMatrix.from_dense(eigen_dense.tolist())
    scipy_eigen_sparse = scipy.sparse.csr_array(eigen_dense)

    workloads = [
        _record(
            "symmetric_eigen_24",
            lambda: symmetric_eigen(symmetric.tolist()),
            lambda: scipy.linalg.eigh(symmetric, check_finite=True),
            repetitions=3,
            shape=[24, 24],
        ),
        _record(
            "general_eigen_10",
            lambda: general_eigen(general.tolist()),
            lambda: scipy.linalg.eig(general, check_finite=True),
            repetitions=3,
            shape=[10, 10],
        ),
        _record(
            "reduced_svd_30x18",
            lambda: svd(rectangular.tolist()),
            lambda: scipy.linalg.svd(
                rectangular, full_matrices=False, check_finite=True
            ),
            repetitions=3,
            shape=[30, 18],
        ),
        _record(
            "fft_4096",
            lambda: fft(samples.tolist()),
            lambda: np.fft.fft(samples),
            repetitions=5,
            shape=[4096],
        ),
        _record(
            "fft_convolution_512x512",
            lambda: convolve(left.tolist(), right.tolist(), method="fft"),
            lambda: scipy.signal.fftconvolve(left, right),
            repetitions=5,
            shape=[512, 512],
        ),
        _record(
            "cg_tridiagonal_400",
            lambda: sparse_solve(sparse, right_hand_side.tolist(), method="cg"),
            lambda: scipy.sparse.linalg.cg(
                scipy_sparse, right_hand_side, rtol=1e-10, atol=0.0
            ),
            repetitions=3,
            shape=[400, 400],
        ),
        _record(
            "dominant_eigen_diagonal_400",
            lambda: sparse_eigen(eigen_sparse, tolerance=1e-8, max_iterations=2_000),
            lambda: scipy.sparse.linalg.eigsh(
                scipy_eigen_sparse, k=1, which="LM", tol=1e-8
            ),
            repetitions=3,
            shape=[400, 400],
        ),
    ]

    mpmath_matrix = mpmath.matrix(general[:6, :6].tolist())
    mpmath_svd_matrix = mpmath.matrix(rectangular[:8, :5].tolist())
    mpmath_comparison = {
        "version": mpmath.__version__,
        "general_eigen_6_median_ms": _measure(lambda: mpmath.eig(mpmath_matrix), 3),
        "svd_8x5_median_ms": _measure(lambda: mpmath.svd(mpmath_svd_matrix), 3),
    }

    sources = sorted(SOURCE.glob("*.py"))
    source_bytes = b"".join(path.read_bytes() for path in sources)
    result = {
        "schema_version": 1,
        "platform": {
            "system": platform.system(),
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "versions": {
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "mpmath": mpmath.__version__,
        },
        "policy": {
            "warmups": 1,
            "statistic": "median",
            "validation_included_in_sagejs_time": True,
            "input_conversion_included_in_sagejs_time": True,
        },
        "payload": {
            "python_files": len(sources),
            "source_bytes": len(source_bytes),
            "gzip_bytes": len(gzip.compress(source_bytes, compresslevel=9)),
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
            "new_native_or_wasm_bytes": 0,
        },
        "workloads": workloads,
        "mpmath_reference": mpmath_comparison,
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
