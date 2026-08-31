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
    stiff = ode_problem(
        lambda t, y: [-1000.0 * (y[0] - math.cos(t)) - math.sin(t)],
        (0.0, 1.0),
        [1.0],
        method="radau",
    )
    unsupported = False
    try:
        plan_ode(stiff)
    except OdeUnsupportedError:
        unsupported = True
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
        "stiff-tracking": {"implicit_method_unsupported": unsupported},
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
    assert records["stiff-tracking"]["implicit_method_unsupported"]


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
    stiff = scipy_solve_ivp(
        lambda t, y: [-1000.0 * (y[0] - math.cos(t)) - math.sin(t)],
        (0.0, 1.0),
        [1.0],
        method="Radau",
        rtol=1e-8,
        atol=1e-11,
        dense_output=True,
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
        "stiff-tracking": {
            "final_state": [float(value) for value in stiff.y[:, -1]],
        },
    }
    return scipy.__version__, records


def _check_live(fixture: dict[str, Any]) -> str:
    version, records = _live_scipy_records()
    for name, actual in records.items():
        expected = fixture["cases"][name]
        for key, value in actual.items():
            if isinstance(value, list):
                assert _close_vector(value, expected[key], 5e-13)
            else:
                assert abs(value - expected[key]) <= 5e-13
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
