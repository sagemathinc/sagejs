"""Offline NumPy/SciPy differential oracle for the spectral corpus."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy.linalg
import scipy.sparse
import scipy.sparse.linalg

ROOT = Path(__file__).resolve().parents[3]
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


def _complex(value: object) -> complex:
    if isinstance(value, list):
        return complex(float(value[0]), float(value[1]))
    return complex(value)


def _matrix(value: list[list[object]]) -> list[list[complex]]:
    return [[_complex(entry) for entry in row] for row in value]


def _match(actual: list[complex], expected: list[complex], tolerance: float) -> None:
    remaining = list(expected)
    for value in actual:
        index = min(
            range(len(remaining)),
            key=lambda candidate: abs(value - remaining[candidate]),
        )
        reference = remaining.pop(index)
        error = abs(value - reference)
        if error > tolerance * max(1.0, abs(reference)):
            raise AssertionError((value, reference, error))
    if remaining:
        raise AssertionError("unmatched oracle eigenvalues")


def main() -> None:
    corpus = json.loads((Path(__file__).parent / "corpus.json").read_text())
    comparisons = 0
    maximum_difference = 0.0
    for case in corpus["dense_eigen"]:
        matrix = np.asarray(_matrix(case["matrix"]), dtype=np.complex128)
        if case["kind"] == "symmetric":
            result = symmetric_eigen(matrix.tolist())
            oracle_values, _ = scipy.linalg.eigh(matrix, check_finite=True)
        else:
            result = general_eigen(matrix.tolist())
            oracle_values, _ = scipy.linalg.eig(matrix, check_finite=True)
        actual = [_complex(value) for value in result.value["eigenvalues"]]
        expected = [complex(value) for value in oracle_values.tolist()]
        _match(actual, expected, 1e-7)
        for value in actual:
            difference = min(abs(value - reference) for reference in expected)
            maximum_difference = max(maximum_difference, difference)
        comparisons += len(actual)

    for case in corpus["svd"]:
        matrix = np.asarray(_matrix(case["matrix"]), dtype=np.complex128)
        result = svd(matrix.tolist())
        oracle_values = scipy.linalg.svdvals(matrix, check_finite=True)
        actual = np.asarray(result.value["singular_values"])
        difference = float(np.max(np.abs(actual - oracle_values)))
        maximum_difference = max(maximum_difference, difference)
        if not np.allclose(actual, oracle_values, rtol=1e-8, atol=1e-10):
            raise AssertionError((actual, oracle_values))
        comparisons += len(actual)

    for case in corpus["fft"]:
        samples = np.asarray([_complex(value) for value in case["samples"]])
        result = fft(samples.tolist())
        actual = np.asarray([_complex(value) for value in result.value])
        oracle = np.fft.fft(samples)
        difference = float(np.max(np.abs(actual - oracle)))
        maximum_difference = max(maximum_difference, difference)
        if not np.allclose(actual, oracle, rtol=1e-10, atol=1e-10):
            raise AssertionError((actual, oracle))
        comparisons += len(actual)

    for case in corpus["convolution"]:
        left = np.asarray([_complex(value) for value in case["left"]])
        right = np.asarray([_complex(value) for value in case["right"]])
        result = convolve(
            left.tolist(), right.tolist(), mode=case["mode"], method=case["method"]
        )
        actual = np.asarray([_complex(value) for value in result.value])
        oracle = np.convolve(left, right, mode=case["mode"])
        difference = float(np.max(np.abs(actual - oracle)))
        maximum_difference = max(maximum_difference, difference)
        if not np.allclose(actual, oracle, rtol=1e-10, atol=1e-10):
            raise AssertionError((actual, oracle))
        comparisons += len(actual)

    for case in corpus["sparse"]:
        dense = np.asarray(_matrix(case["matrix"]), dtype=np.complex128)
        scipy_matrix = scipy.sparse.csr_array(dense)
        matrix = CSRMatrix.from_dense(dense.tolist())
        if case["operation"] == "solve":
            right = np.asarray([_complex(value) for value in case["right_hand_side"]])
            result = sparse_solve(matrix, right.tolist(), method=case["method"])
            actual = np.asarray([_complex(value) for value in result.value])
            if case["method"] == "cg":
                oracle, status = scipy.sparse.linalg.cg(
                    scipy_matrix, right, rtol=1e-10, atol=0.0
                )
            else:
                oracle, status = scipy.sparse.linalg.bicgstab(
                    scipy_matrix, right, rtol=1e-10, atol=0.0
                )
            if status != 0 or not np.allclose(actual, oracle, rtol=1e-8, atol=1e-10):
                raise AssertionError((status, actual, oracle))
            maximum_difference = max(
                maximum_difference, float(np.max(np.abs(actual - oracle)))
            )
            comparisons += len(actual)
        else:
            result = sparse_eigen(matrix)
            actual = _complex(result.value["eigenvalue"])
            oracle, _ = scipy.sparse.linalg.eigsh(
                scipy_matrix, k=1, which="LM", tol=1e-10
            )
            difference = abs(actual - complex(oracle[0]))
            maximum_difference = max(maximum_difference, difference)
            if difference > 1e-7 * max(1.0, abs(oracle[0])):
                raise AssertionError((actual, oracle[0]))
            comparisons += 1

    random = np.random.default_rng(20_260_831)
    for size in range(2, 7):
        general_matrix = random.normal(size=(size, size)) + 1j * random.normal(
            size=(size, size)
        )
        general_result = general_eigen(general_matrix.tolist(), max_iterations=2_000)
        if not general_result.success:
            raise AssertionError(
                ("random general eigensystem", size, general_result.to_dict())
            )
        actual = [_complex(value) for value in general_result.value["eigenvalues"]]
        expected = [
            complex(value)
            for value in scipy.linalg.eigvals(
                general_matrix, check_finite=True
            ).tolist()
        ]
        _match(actual, expected, 2e-7)
        comparisons += size

        hermitian_matrix = general_matrix + general_matrix.conjugate().T
        hermitian_result = symmetric_eigen(hermitian_matrix.tolist())
        if not hermitian_result.success:
            raise AssertionError(
                ("random Hermitian eigensystem", size, hermitian_result.to_dict())
            )
        actual_real = np.asarray(hermitian_result.value["eigenvalues"])
        expected_real = scipy.linalg.eigvalsh(hermitian_matrix, check_finite=True)
        if not np.allclose(actual_real, expected_real, rtol=2e-8, atol=2e-10):
            raise AssertionError((actual_real, expected_real))
        comparisons += size

    for rows, columns in ((2, 2), (5, 3), (3, 5), (8, 4)):
        matrix = random.normal(size=(rows, columns)) + 1j * random.normal(
            size=(rows, columns)
        )
        result = svd(matrix.tolist())
        actual = np.asarray(result.value["singular_values"])
        expected = scipy.linalg.svdvals(matrix, check_finite=True)
        if not result.success or not np.allclose(
            actual, expected, rtol=2e-8, atol=2e-10
        ):
            raise AssertionError((rows, columns, actual, expected))
        comparisons += min(rows, columns)

    for size in (1, 2, 3, 5, 8, 11, 16, 31):
        samples = random.normal(size=size) + 1j * random.normal(size=size)
        result = fft(samples.tolist())
        actual = np.asarray([_complex(value) for value in result.value])
        expected = np.fft.fft(samples)
        if not result.success or not np.allclose(
            actual, expected, rtol=2e-10, atol=2e-10
        ):
            raise AssertionError((size, actual, expected))
        comparisons += size

    for left_size, right_size in ((1, 4), (4, 1), (5, 3), (9, 7)):
        left = random.normal(size=left_size) + 1j * random.normal(size=left_size)
        right = random.normal(size=right_size) + 1j * random.normal(size=right_size)
        for mode in ("full", "same", "valid"):
            for method in ("direct", "fft"):
                result = convolve(
                    left.tolist(), right.tolist(), mode=mode, method=method
                )
                actual = np.asarray([_complex(value) for value in result.value])
                expected = np.convolve(left, right, mode=mode)
                if not result.success or not np.allclose(
                    actual, expected, rtol=2e-10, atol=2e-10
                ):
                    raise AssertionError(
                        (left_size, right_size, mode, method, actual, expected)
                    )
                comparisons += len(actual)

    for separation in (0.0, 1e-12, 1e-10):
        unsupported = general_eigen([[1.0, 1.0], [0.0, 1.0 + separation]])
        if (
            unsupported.success
            or unsupported.status != "validation_failed"
            or unsupported.value is not None
        ):
            raise AssertionError(("unsafe eigenbasis accepted", separation))

    print(
        json.dumps(
            {
                "numpy_version": np.__version__,
                "scipy_version": scipy.__version__,
                "comparisons": comparisons,
                "maximum_absolute_difference": maximum_difference,
                "status": "passed",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
