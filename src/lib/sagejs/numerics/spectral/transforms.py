"""Portable FFT and convolution with independent reconstruction checks."""

from __future__ import annotations

import cmath
import math
from collections.abc import Callable, Sequence
from typing import Any

from ..model import NumericalResult, NumericalValidation
from ..trace import NumericalTrace
from ._common import (
    _EPSILON,
    _BudgetStop,
    _empty_validation,
    _Execution,
    _finish_result,
    _json_vector,
    _norm,
    _plan,
    _problem,
    _vector,
)


def _power_of_two(value: int) -> bool:
    return value > 0 and value & (value - 1) == 0


def _next_power_of_two(value: int) -> int:
    answer = 1
    while answer < value:
        answer *= 2
    return answer


def _bit_reverse(value: int, width: int) -> int:
    answer = 0
    for _ in range(width):
        answer = (answer << 1) | (value & 1)
        value >>= 1
    return answer


def _fft_power_two(
    values: Sequence[complex],
    inverse: bool,
    execution: _Execution,
    *,
    trace_phase: str,
) -> list[complex]:
    size = len(values)
    if not _power_of_two(size):
        raise ValueError("internal radix-2 transform length must be a power of two")
    levels = size.bit_length() - 1
    answer = [0.0 + 0.0j for _ in range(size)]
    for index in range(size):
        answer[_bit_reverse(index, levels)] = values[index]
    block_size = 2
    while block_size <= size:
        iteration = execution.iteration()
        angle = (2.0 if inverse else -2.0) * math.pi / block_size
        root = complex(math.cos(angle), math.sin(angle))
        half = block_size // 2
        for block_start in range(0, size, block_size):
            execution.check()
            twiddle = 1.0 + 0.0j
            for offset in range(half):
                even_index = block_start + offset
                odd_index = even_index + half
                even = answer[even_index]
                odd = twiddle * answer[odd_index]
                answer[even_index] = even + odd
                answer[odd_index] = even - odd
                twiddle *= root
        execution.trace.append(
            "iteration",
            iteration=iteration,
            accepted=True,
            data={
                "phase": trace_phase,
                "radix": 2,
                "block_size": block_size,
                "butterflies": size // 2,
            },
        )
        block_size *= 2
    if inverse:
        return [value / size for value in answer]
    return answer


def _fft_any(
    values: Sequence[complex], inverse: bool, execution: _Execution
) -> tuple[list[complex], str]:
    size = len(values)
    if _power_of_two(size):
        return (
            _fft_power_two(
                values, inverse, execution, trace_phase="radix2_butterflies"
            ),
            "radix2_cooley_tukey",
        )
    padded = _next_power_of_two(2 * size - 1)
    sign = 1.0 if inverse else -1.0
    first = [0.0 + 0.0j for _ in range(padded)]
    chirp = [0.0 + 0.0j for _ in range(padded)]
    for index in range(size):
        execution.check()
        angle = sign * math.pi * (index * index) / size
        first[index] = values[index] * cmath.exp(1j * angle)
        conjugate_chirp = cmath.exp(-1j * angle)
        chirp[index] = conjugate_chirp
        if index != 0:
            chirp[padded - index] = conjugate_chirp
    first_transform = _fft_power_two(
        first, False, execution, trace_phase="bluestein_input_fft"
    )
    chirp_transform = _fft_power_two(
        chirp, False, execution, trace_phase="bluestein_chirp_fft"
    )
    product = [
        first_transform[index] * chirp_transform[index] for index in range(padded)
    ]
    convolved = _fft_power_two(
        product, True, execution, trace_phase="bluestein_inverse_fft"
    )
    result = [
        convolved[index] * cmath.exp(1j * sign * math.pi * (index * index) / size)
        for index in range(size)
    ]
    if inverse:
        result = [value / size for value in result]
    return result, "bluestein_radix2"


def _normalization_factor(size: int, inverse: bool, norm: str) -> float:
    if norm == "backward":
        return 1.0
    if norm == "forward":
        return float(size) if inverse else 1.0 / size
    if norm == "ortho":
        return math.sqrt(size) if inverse else 1.0 / math.sqrt(size)
    raise ValueError("norm must be 'backward', 'forward', or 'ortho'")


def _direct_transform_at(
    values: Sequence[complex],
    index: int,
    *,
    inverse: bool,
    norm: str,
) -> complex:
    size = len(values)
    sign = 1.0 if inverse else -1.0
    answer = sum(
        (
            values[sample]
            * cmath.exp(1j * sign * 2.0 * math.pi * index * sample / size)
            for sample in range(size)
        ),
        0.0 + 0.0j,
    )
    if inverse:
        answer /= size
    return answer * _normalization_factor(size, inverse, norm)


def _validation_indices(size: int, limit: int = 32) -> list[int]:
    if size <= limit:
        return list(range(size))
    answer = {0, size - 1, size // 2}
    for index in range(limit):
        answer.add((index * (size - 1)) // (limit - 1))
    return sorted(answer)


def _validate_transform(
    original: Sequence[complex],
    transformed: Sequence[complex],
    *,
    inverse: bool,
    norm: str,
    tolerance: float,
    execution: _Execution,
) -> NumericalValidation:
    indices = _validation_indices(len(original))
    differences: list[float] = []
    for index in indices:
        execution.check()
        reconstructed = _direct_transform_at(
            transformed, index, inverse=not inverse, norm=norm
        )
        differences.append(abs(reconstructed - original[index]))
    scale = max(_norm(original), _EPSILON)
    reconstruction = max(differences, default=0.0) / scale
    input_energy = sum(abs(value) ** 2 for value in original)
    output_energy = sum(abs(value) ** 2 for value in transformed)
    if inverse:
        base_scale = 1.0 / len(original)
    else:
        base_scale = 1.0
    actual_scale = base_scale * _normalization_factor(len(original), inverse, norm)
    expected_output_energy = len(original) * actual_scale * actual_scale * input_energy
    energy_error = abs(output_energy - expected_output_energy) / max(
        input_energy, expected_output_energy, _EPSILON
    )
    passed = reconstruction <= tolerance and energy_error <= tolerance
    checks = [
        {
            "kind": "independent_direct_reconstruction",
            "passed": reconstruction <= tolerance,
            "value": reconstruction,
            "threshold": tolerance,
            "sampled_indices": indices,
        },
        {
            "kind": "parseval_energy",
            "passed": energy_error <= tolerance,
            "value": energy_error,
            "threshold": tolerance,
        },
        {
            "kind": "orthogonality_scaling",
            "passed": energy_error <= tolerance,
            "value": energy_error,
            "threshold": tolerance,
            "normalization": norm,
        },
    ]
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=checks,
        residual=reconstruction,
        error_estimate=max(reconstruction, energy_error),
    )


def fourier_transform(
    samples: Sequence[Any],
    *,
    inverse: bool = False,
    n: int | None = None,
    norm: str = "backward",
    tolerance: float = 1e-11,
    max_iterations: int = 256,
    max_elapsed_ms: int = 30_000,
    max_points: int = 1_048_576,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Compute a one-dimensional DFT with radix-2/Bluestein FFT methods."""
    values = _vector(samples, "samples")
    if n is not None:
        if isinstance(n, bool) or not isinstance(n, int) or n <= 0:
            raise ValueError("n must be a positive integer")
        if n < len(values):
            values = values[:n]
        else:
            values += [0.0 + 0.0j for _ in range(n - len(values))]
    if not values:
        raise ValueError("fourier_transform requires at least one sample")
    if (
        isinstance(max_points, bool)
        or not isinstance(max_points, int)
        or max_points <= 0
    ):
        raise ValueError("max_points must be a positive integer")
    padded_points = (
        len(values)
        if _power_of_two(len(values))
        else _next_power_of_two(2 * len(values) - 1)
    )
    if padded_points > max_points:
        raise ValueError("transform workspace exceeds max_points=" + str(max_points))
    if tolerance <= 0.0:
        raise ValueError("tolerance must be positive")
    _normalization_factor(len(values), inverse, norm)
    problem = _problem(
        "inverse_fourier_transform" if inverse else "fourier_transform",
        initial_data={"samples": _json_vector(values)},
        method="auto_fft",
        max_iterations=max_iterations,
        max_evaluations=256,
        max_elapsed_ms=max_elapsed_ms,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        metadata={
            "length": len(values),
            "inverse": inverse,
            "norm": norm,
            "tolerance": tolerance,
            "max_points": max_points,
            "workspace_points": padded_points,
        },
    )
    method = "radix2_cooley_tukey" if _power_of_two(len(values)) else "bluestein_radix2"
    plan = _plan(
        problem,
        method=method,
        classification="translated",
        validation=[
            "independent_direct_reconstruction",
            "parseval_energy",
            "orthogonality_scaling",
        ],
        reason=(
            "the transform length is a power of two"
            if method == "radix2_cooley_tukey"
            else "Bluestein reduction gives an arbitrary-length transform using radix-2 convolution"
        ),
        requires=["finite_one_dimensional_samples", "bounded_fft_workspace"],
    )
    numerical_trace = NumericalTrace(problem.trace_policy)
    numerical_trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": method,
            "length": len(values),
            "workspace_points": padded_points,
        },
        important=True,
        force=True,
    )
    execution = _Execution(problem, numerical_trace, cancel)
    try:
        transformed, actual_method = _fft_any(values, inverse, execution)
        factor = _normalization_factor(len(values), inverse, norm)
        if factor != 1.0:
            transformed = [value * factor for value in transformed]
        validation = _validate_transform(
            values,
            transformed,
            inverse=inverse,
            norm=norm,
            tolerance=max(tolerance, 200.0 * len(values) * _EPSILON),
            execution=execution,
        )
        return _finish_result(
            problem,
            plan,
            execution,
            status="converged",
            value=_json_vector(transformed),
            validation=validation,
            trace=numerical_trace,
            domain_payload={
                "inverse": inverse,
                "normalization": norm,
                "algorithm": actual_method,
                "workspace_points": padded_points,
            },
        )
    except _BudgetStop as stop:
        return _finish_result(
            problem,
            plan,
            execution,
            status=stop.status,
            value=None,
            validation=_empty_validation(),
            trace=numerical_trace,
        )


def fft(samples: Sequence[Any], **options: Any) -> NumericalResult:
    """Compute a forward FFT using NumPy/SciPy normalization names."""
    return fourier_transform(samples, inverse=False, **options)


def ifft(samples: Sequence[Any], **options: Any) -> NumericalResult:
    """Compute an inverse FFT using NumPy/SciPy normalization names."""
    return fourier_transform(samples, inverse=True, **options)


def _direct_convolution(
    left: Sequence[complex],
    right: Sequence[complex],
    execution: _Execution,
) -> list[complex]:
    size = len(left) + len(right) - 1
    answer = [0.0 + 0.0j for _ in range(size)]
    execution.iteration()
    for left_index in range(len(left)):
        execution.check()
        for right_index in range(len(right)):
            answer[left_index + right_index] += left[left_index] * right[right_index]
    return answer


def _fft_convolution(
    left: Sequence[complex],
    right: Sequence[complex],
    execution: _Execution,
) -> tuple[list[complex], int]:
    output_size = len(left) + len(right) - 1
    workspace = _next_power_of_two(output_size)
    left_padded = list(left) + [0.0 + 0.0j for _ in range(workspace - len(left))]
    right_padded = list(right) + [0.0 + 0.0j for _ in range(workspace - len(right))]
    left_transform = _fft_power_two(
        left_padded, False, execution, trace_phase="convolution_left_fft"
    )
    right_transform = _fft_power_two(
        right_padded, False, execution, trace_phase="convolution_right_fft"
    )
    product = [
        left_transform[index] * right_transform[index] for index in range(workspace)
    ]
    result = _fft_power_two(
        product, True, execution, trace_phase="convolution_inverse_fft"
    )
    return result[:output_size], workspace


def _mode_slice(left_size: int, right_size: int, mode: str) -> tuple[int, int]:
    full_size = left_size + right_size - 1
    if mode == "full":
        return 0, full_size
    if mode == "same":
        output_size = max(left_size, right_size)
        start = (full_size - output_size) // 2
        return start, start + output_size
    if mode == "valid":
        output_size = max(left_size, right_size) - min(left_size, right_size) + 1
        start = min(left_size, right_size) - 1
        return start, start + output_size
    raise ValueError("mode must be 'full', 'same', or 'valid'")


def _convolution_coefficient(
    left: Sequence[complex], right: Sequence[complex], index: int
) -> complex:
    start = max(0, index - len(right) + 1)
    stop = min(len(left), index + 1)
    return sum(
        (
            left[left_index] * right[index - left_index]
            for left_index in range(start, stop)
        ),
        0.0 + 0.0j,
    )


def _validate_convolution(
    left: Sequence[complex],
    right: Sequence[complex],
    result: Sequence[complex],
    *,
    start: int,
    tolerance: float,
    execution: _Execution,
) -> NumericalValidation:
    indices = _validation_indices(len(result))
    errors: list[float] = []
    reference_scale = 0.0
    for local_index in indices:
        execution.check()
        reference = _convolution_coefficient(left, right, start + local_index)
        reference_scale = max(reference_scale, abs(reference))
        errors.append(abs(reference - result[local_index]))
    residual = max(errors, default=0.0) / max(reference_scale, _EPSILON)
    passed = residual <= tolerance
    return NumericalValidation(
        "validated_approximate" if passed else "indeterminate",
        passed,
        checks=[
            {
                "kind": "independent_direct_convolution",
                "passed": passed,
                "value": residual,
                "threshold": tolerance,
                "sampled_indices": indices,
            },
            {
                "kind": "convolution_reconstruction",
                "passed": passed,
                "value": residual,
                "threshold": tolerance,
            },
            {
                "kind": "orthogonality_not_applicable",
                "passed": True,
                "applicable": False,
            },
        ],
        residual=residual,
        error_estimate=residual,
    )


def convolve(
    left: Sequence[Any],
    right: Sequence[Any],
    *,
    mode: str = "full",
    method: str = "auto",
    tolerance: float = 1e-11,
    max_iterations: int = 256,
    max_elapsed_ms: int = 30_000,
    max_points: int = 1_048_576,
    max_direct_operations: int = 1_000_000,
    trace: str = "summary",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    cancel: Callable[[], bool] | None = None,
) -> NumericalResult:
    """Convolve two finite sequences with direct or FFT execution."""
    left_values = _vector(left, "left")
    right_values = _vector(right, "right")
    if not left_values or not right_values:
        raise ValueError("convolve requires two nonempty sequences")
    start, stop = _mode_slice(len(left_values), len(right_values), mode)
    direct_operations = len(left_values) * len(right_values)
    workspace = _next_power_of_two(len(left_values) + len(right_values) - 1)
    if method == "auto":
        selected = "direct" if direct_operations <= 4_096 else "fft"
    elif method in ("direct", "fft"):
        selected = method
    else:
        raise ValueError("method must be 'auto', 'direct', or 'fft'")
    if selected == "direct" and direct_operations > max_direct_operations:
        raise ValueError(
            "direct convolution exceeds max_direct_operations="
            + str(max_direct_operations)
        )
    if selected == "fft" and workspace > max_points:
        raise ValueError(
            "FFT convolution workspace exceeds max_points=" + str(max_points)
        )
    problem = _problem(
        "convolution",
        initial_data={
            "left": _json_vector(left_values),
            "right": _json_vector(right_values),
        },
        method=selected,
        max_iterations=max_iterations,
        max_evaluations=256,
        max_elapsed_ms=max_elapsed_ms,
        trace=trace,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
        metadata={
            "left_length": len(left_values),
            "right_length": len(right_values),
            "mode": mode,
            "tolerance": tolerance,
            "max_points": max_points,
            "max_direct_operations": max_direct_operations,
        },
    )
    plan = _plan(
        problem,
        method=selected,
        classification="translated",
        validation=[
            "independent_direct_convolution",
            "convolution_reconstruction",
        ],
        reason=(
            "the direct product count is below the crossover"
            if selected == "direct"
            else "the product count favors bounded radix-2 FFT convolution"
        ),
        requires=["finite_nonempty_sequences", "bounded_workspace"],
    )
    numerical_trace = NumericalTrace(problem.trace_policy)
    numerical_trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": selected,
            "left_length": len(left_values),
            "right_length": len(right_values),
            "mode": mode,
        },
        important=True,
        force=True,
    )
    execution = _Execution(problem, numerical_trace, cancel)
    try:
        if selected == "direct":
            full = _direct_convolution(left_values, right_values, execution)
            actual_workspace = len(full)
        else:
            full, actual_workspace = _fft_convolution(
                left_values, right_values, execution
            )
        result = full[start:stop]
        validation = _validate_convolution(
            left_values,
            right_values,
            result,
            start=start,
            tolerance=max(tolerance, 500.0 * workspace * _EPSILON),
            execution=execution,
        )
        return _finish_result(
            problem,
            plan,
            execution,
            status="converged",
            value=_json_vector(result),
            validation=validation,
            trace=numerical_trace,
            domain_payload={
                "mode": mode,
                "full_output_length": len(full),
                "returned_slice": [start, stop],
                "workspace_points": actual_workspace,
            },
        )
    except _BudgetStop as stop_error:
        return _finish_result(
            problem,
            plan,
            execution,
            status=stop_error.status,
            value=None,
            validation=_empty_validation(),
            trace=numerical_trace,
        )
