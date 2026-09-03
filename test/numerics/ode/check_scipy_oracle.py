#!/usr/bin/env python3
"""Check Sage.js against frozen and optionally live SciPy IVP oracles."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.append(str(ROOT / "src" / "lib"))

from sagejs.numerics.ode import (  # noqa: E402
    OdeEvent,
    OdeUnsupportedError,
    ode_problem,
    plan_ode,
    solve_ivp,
)


def _close_vector(left: list[float], right: list[float], tolerance: float) -> bool:
    return len(left) == len(right) and all(
        abs(a - b) <= tolerance * max(1.0, abs(b)) for a, b in zip(left, right)
    )


def _robertson(t: float, y: list[float]) -> list[float]:
    y1, y2, y3 = y
    return [
        -0.04 * y1 + 1e4 * y2 * y3,
        0.04 * y1 - 1e4 * y2 * y3 - 3e7 * y2 * y2,
        3e7 * y2 * y2,
    ]


def _robertson_jacobian(t: float, y: list[float]) -> list[list[float]]:
    y1, y2, y3 = y
    return [
        [-0.04, 1e4 * y3, 1e4 * y2],
        [0.04, -1e4 * y3 - 6e7 * y2, -1e4 * y2],
        [0.0, 6e7 * y2, 0.0],
    ]


def _hires(t: float, y: list[float]) -> list[float]:
    return [
        -1.71 * y[0] + 0.43 * y[1] + 8.32 * y[2] + 0.0007,
        1.71 * y[0] - 8.75 * y[1],
        -10.03 * y[2] + 0.43 * y[3] + 0.035 * y[4],
        8.32 * y[1] + 1.71 * y[2] - 1.12 * y[3],
        -1.745 * y[4] + 0.43 * y[5] + 0.43 * y[6],
        -280.0 * y[5] * y[7] + 0.69 * y[3] + 1.71 * y[4] - 0.43 * y[5] + 0.69 * y[6],
        280.0 * y[5] * y[7] - 1.81 * y[6],
        -280.0 * y[5] * y[7] + 1.81 * y[6],
    ]


def _hires_jacobian(t: float, y: list[float]) -> list[list[float]]:
    return [
        [-1.71, 0.43, 8.32, 0.0, 0.0, 0.0, 0.0, 0.0],
        [1.71, -8.75, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, -10.03, 0.43, 0.035, 0.0, 0.0, 0.0],
        [0.0, 8.32, 1.71, -1.12, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, -1.745, 0.43, 0.43, 0.0],
        [
            0.0,
            0.0,
            0.0,
            0.69,
            1.71,
            -0.43 - 280.0 * y[7],
            0.69,
            -280.0 * y[5],
        ],
        [0.0, 0.0, 0.0, 0.0, 0.0, 280.0 * y[7], -1.81, 280.0 * y[5]],
        [0.0, 0.0, 0.0, 0.0, 0.0, -280.0 * y[7], 1.81, -280.0 * y[5]],
    ]


_VANDERPOL_MU = 1000.0


def _vanderpol(t: float, y: list[float]) -> list[float]:
    return [
        y[1],
        _VANDERPOL_MU * (1.0 - y[0] * y[0]) * y[1] - y[0],
    ]


def _vanderpol_jacobian(t: float, y: list[float]) -> list[list[float]]:
    return [
        [0.0, 1.0],
        [
            -2.0 * _VANDERPOL_MU * y[0] * y[1] - 1.0,
            _VANDERPOL_MU * (1.0 - y[0] * y[0]),
        ],
    ]


def _stiff_sage_record(
    function: Any,
    jacobian: Any,
    t_span: tuple[float, float],
    y0: list[float],
    *,
    atol: float,
) -> dict[str, Any]:
    result = solve_ivp(
        function,
        t_span,
        y0,
        method="rosenbrock4",
        jacobian=jacobian,
        rtol=1e-6,
        atol=atol,
        max_steps=20_000,
        max_evaluations=250_000,
        max_output_points=20_000,
        max_validation_evaluations=32,
        trace="summary",
    )
    return {
        "success": result.success,
        "final_state": list(result.value),
        "dense_defect_passed": result.evidence["dense_defect"]["passed"],
        "dense_acceptance_metric": result.evidence["dense_defect"]["acceptance_metric"],
        "dense_acceptance_threshold": result.evidence["dense_defect"][
            "acceptance_threshold"
        ],
        "maximum_linear_residual": result.to_dict()["measurements"][
            "max_normalized_linear_solve_residual"
        ],
    }


def _sagejs_records() -> dict[str, dict[str, Any]]:
    exponential = solve_ivp(
        lambda t, y: [y[0]],
        (0.0, 1.0),
        [1.0],
        rtol=1e-8,
        atol=1e-11,
        reference=lambda t: [math.exp(t)],
        reference_atol=1e-6,
        reference_rtol=1e-6,
    )
    oscillator = solve_ivp(
        lambda t, y: [y[1], -y[0]],
        (0.0, 2.0 * math.pi),
        [1.0, 0.0],
        rtol=1e-8,
        atol=1e-11,
        reference=lambda t: [math.cos(t), -math.sin(t)],
        reference_atol=2e-8,
        reference_rtol=2e-7,
    )
    projectile = solve_ivp(
        lambda t, y: [y[1], -9.81],
        (0.0, 3.0),
        [10.0, 0.0],
        rtol=1e-8,
        atol=1e-11,
        events=OdeEvent(
            lambda t, y: y[0],
            terminal=True,
            direction=-1,
            value_tolerance=1e-10,
        ),
        reference=lambda t: [10.0 - 4.905 * t * t, -9.81 * t],
        reference_atol=1e-7,
        reference_rtol=1e-7,
    )
    initial_positive = solve_ivp(
        lambda t, y: [1.0],
        (0.0, 1.0),
        [0.0],
        events=OdeEvent(lambda t, y: t, terminal=True, direction=1),
    )
    initial_negative = solve_ivp(
        lambda t, y: [1.0],
        (0.0, 1.0),
        [0.0],
        events=OdeEvent(lambda t, y: t, terminal=True, direction=-1),
    )
    stiff_unsupported = ode_problem(
        lambda t, y: [-1000.0 * (y[0] - math.cos(t)) - math.sin(t)],
        (0.0, 1.0),
        [1.0],
        method="radau",
    )
    unsupported = False
    try:
        plan_ode(stiff_unsupported)
    except OdeUnsupportedError:
        unsupported = True
    stiff_tracking = solve_ivp(
        lambda t, y: [-1000.0 * (y[0] - math.cos(t)) - math.sin(t)],
        (0.0, 1.0),
        [1.0],
        method="rosenbrock4",
        jacobian=lambda t, y: [[-1000.0]],
        rtol=1e-6,
        atol=1e-9,
    )
    return {
        "exponential-growth": {
            "success": exponential.success,
            "final_time": exponential.trajectory.final_time,
            "final_state": list(exponential.value),
            "dense_mid_state": exponential.trajectory(0.5),
        },
        "harmonic-oscillator": {
            "success": oscillator.success,
            "final_time": oscillator.trajectory.final_time,
            "final_state": list(oscillator.value),
            "dense_mid_state": oscillator.trajectory(math.pi),
        },
        "projectile-ground": {
            "success": projectile.success,
            "final_time": projectile.trajectory.final_time,
            "final_state": list(projectile.value),
            "event_time": projectile.events[0].time,
            "event_state": list(projectile.events[0].state),
        },
        "initial-event-direction": {
            "positive_final_time": initial_positive.trajectory.final_time,
            "positive_event_count": len(initial_positive.events),
            "negative_final_time": initial_negative.trajectory.final_time,
            "negative_event_count": len(initial_negative.events),
        },
        "stiff-tracking": {
            "radau_unsupported": unsupported,
            "success": stiff_tracking.success,
            "final_state": list(stiff_tracking.value),
        },
        "robertson": _stiff_sage_record(
            _robertson,
            _robertson_jacobian,
            (0.0, 100.0),
            [1.0, 0.0, 0.0],
            atol=1e-10,
        ),
        "hires": _stiff_sage_record(
            _hires,
            _hires_jacobian,
            (0.0, 321.8122),
            [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0057],
            atol=1e-10,
        ),
        "stiff-vanderpol": _stiff_sage_record(
            _vanderpol,
            _vanderpol_jacobian,
            (0.0, 3000.0),
            [2.0, 0.0],
            atol=1e-9,
        ),
    }


def _check_frozen(fixture: dict[str, Any]) -> None:
    records = _sagejs_records()
    for name in ("exponential-growth", "harmonic-oscillator"):
        expected = fixture["cases"][name]
        actual = records[name]
        assert actual["success"]
        assert abs(actual["final_time"] - expected["final_time"]) <= 1e-14
        assert _close_vector(actual["final_state"], expected["final_state"], 2e-7)
        assert _close_vector(
            actual["dense_mid_state"], expected["dense_mid_state"], 2e-7
        )
    expected_event = fixture["cases"]["projectile-ground"]
    actual_event = records["projectile-ground"]
    assert actual_event["success"]
    assert abs(actual_event["event_time"] - expected_event["event_time"]) <= 2e-8
    assert _close_vector(
        actual_event["event_state"], expected_event["event_state"], 2e-8
    )
    expected_direction = fixture["cases"]["initial-event-direction"]
    actual_direction = records["initial-event-direction"]
    assert actual_direction == expected_direction
    tracking = records["stiff-tracking"]
    expected_tracking = fixture["cases"]["stiff-tracking"]
    assert tracking["radau_unsupported"] and tracking["success"]
    assert _close_vector(
        tracking["final_state"], expected_tracking["radau_final_state"], 2e-5
    )
    for name in ("robertson", "hires", "stiff-vanderpol"):
        expected = fixture["cases"][name]
        actual = records[name]
        tolerance = float(expected["sagejs_oracle_tolerance"])
        assert actual["success"]
        assert actual["dense_defect_passed"]
        assert actual["dense_acceptance_metric"] <= actual["dense_acceptance_threshold"]
        assert actual["maximum_linear_residual"] <= 1e-10
        assert _close_vector(
            actual["final_state"], expected["radau_final_state"], tolerance
        )
        assert _close_vector(
            actual["final_state"], expected["bdf_final_state"], tolerance
        )
    assert abs(sum(records["robertson"]["final_state"]) - 1.0) <= 2e-12
    assert (
        abs(
            records["hires"]["final_state"][6]
            + records["hires"]["final_state"][7]
            - 0.0057
        )
        <= 2e-12
    )


def _live_scipy_records() -> tuple[str, dict[str, dict[str, Any]]]:
    try:
        import scipy
        from scipy.integrate import solve_ivp as scipy_solve_ivp
    except ImportError:
        raise SystemExit(77) from None

    exponential = scipy_solve_ivp(
        lambda t, y: [y[0]],
        (0.0, 1.0),
        [1.0],
        method="RK45",
        rtol=1e-8,
        atol=1e-11,
        dense_output=True,
    )
    oscillator = scipy_solve_ivp(
        lambda t, y: [y[1], -y[0]],
        (0.0, 2.0 * math.pi),
        [1.0, 0.0],
        method="RK45",
        rtol=1e-8,
        atol=1e-11,
        dense_output=True,
    )

    def ground(t: float, y: list[float]) -> float:
        return float(y[0])

    ground.terminal = True  # type: ignore[attr-defined]
    ground.direction = -1  # type: ignore[attr-defined]
    projectile = scipy_solve_ivp(
        lambda t, y: [y[1], -9.81],
        (0.0, 3.0),
        [10.0, 0.0],
        method="RK45",
        rtol=1e-8,
        atol=1e-11,
        dense_output=True,
        events=ground,
    )

    def initial_positive_event(t: float, y: list[float]) -> float:
        return t

    initial_positive_event.terminal = True  # type: ignore[attr-defined]
    initial_positive_event.direction = 1  # type: ignore[attr-defined]
    initial_positive = scipy_solve_ivp(
        lambda t, y: [1.0],
        (0.0, 1.0),
        [0.0],
        events=initial_positive_event,
    )

    def initial_negative_event(t: float, y: list[float]) -> float:
        return t

    initial_negative_event.terminal = True  # type: ignore[attr-defined]
    initial_negative_event.direction = -1  # type: ignore[attr-defined]
    initial_negative = scipy_solve_ivp(
        lambda t, y: [1.0],
        (0.0, 1.0),
        [0.0],
        events=initial_negative_event,
    )

    def scipy_stiff_records(
        function: Any,
        jacobian: Any,
        t_span: tuple[float, float],
        y0: list[float],
        *,
        rtol: float,
        atol: float,
    ) -> dict[str, list[float]]:
        answer: dict[str, list[float]] = {}
        for method in ("Radau", "BDF"):
            result = scipy_solve_ivp(
                function,
                t_span,
                y0,
                method=method,
                jac=jacobian,
                rtol=rtol,
                atol=atol,
            )
            assert result.success
            answer[method.lower() + "_final_state"] = [
                float(value) for value in result.y[:, -1]
            ]
        return answer

    stiff_tracking = scipy_stiff_records(
        lambda t, y: [-1000.0 * (y[0] - math.cos(t)) - math.sin(t)],
        lambda t, y: [[-1000.0]],
        (0.0, 1.0),
        [1.0],
        rtol=1e-10,
        atol=1e-13,
    )
    records = {
        "exponential-growth": {
            "final_state": [float(value) for value in exponential.y[:, -1]],
            "dense_mid_state": [float(value) for value in exponential.sol(0.5)],
        },
        "harmonic-oscillator": {
            "final_state": [float(value) for value in oscillator.y[:, -1]],
            "dense_mid_state": [float(value) for value in oscillator.sol(math.pi)],
        },
        "projectile-ground": {
            "event_time": float(projectile.t_events[0][0]),
            "event_state": [float(value) for value in projectile.y_events[0][0]],
        },
        "initial-event-direction": {
            "positive_final_time": float(initial_positive.t[-1]),
            "positive_event_count": len(initial_positive.t_events[0]),
            "negative_final_time": float(initial_negative.t[-1]),
            "negative_event_count": len(initial_negative.t_events[0]),
        },
        "stiff-tracking": stiff_tracking,
        "robertson": scipy_stiff_records(
            _robertson,
            _robertson_jacobian,
            (0.0, 100.0),
            [1.0, 0.0, 0.0],
            rtol=1e-10,
            atol=1e-13,
        ),
        "hires": scipy_stiff_records(
            _hires,
            _hires_jacobian,
            (0.0, 321.8122),
            [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0057],
            rtol=1e-10,
            atol=1e-13,
        ),
        "stiff-vanderpol": scipy_stiff_records(
            _vanderpol,
            _vanderpol_jacobian,
            (0.0, 3000.0),
            [2.0, 0.0],
            rtol=1e-8,
            atol=1e-10,
        ),
    }
    return scipy.__version__, records


def _check_live(fixture: dict[str, Any]) -> str:
    version, records = _live_scipy_records()
    for name, actual in records.items():
        expected = fixture["cases"][name]
        for key, value in actual.items():
            if isinstance(value, list):
                assert _close_vector(value, expected[key], 5e-12)
            else:
                assert abs(value - expected[key]) <= 5e-12
    return version


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--live-scipy", action="store_true")
    arguments = parser.parse_args()
    fixture = json.loads(arguments.fixture.read_text(encoding="utf-8"))
    _check_frozen(fixture)
    print("SciPy oracle fixture passed")
    if arguments.live_scipy:
        version = _check_live(fixture)
        print("live SciPy oracle passed with scipy " + version)


if __name__ == "__main__":
    main()
