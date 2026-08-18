"""Matched warm/repeated/batch benchmark for elliptic L-series evaluation.

This is intentionally valid Sage source. Run it under SageMath for the PARI
baseline and under Sage.js after `Lseries_ell.values` is available.
"""

import json
import time


CURVES = [
    ("11a1", [0, -1, 1, -10, -20]),
    ("user-evaluation", [1, 2, 3, 4, 999]),
]
POINTS = [1 + I, 1 - I, 1 + 2 * I, QQ(1) / 2 + I, QQ(3) / 2 - I]
USER_POINTS = [
    1 + 3 * I,
    1 + 4 * I,
    1 + 10 * I,
    1 + 20 * I,
    3 + I,
    4 + I,
    10 + I,
]
SAMPLES = 7


def median(values):
    values = sorted(values)
    return values[len(values) // 2]


def elapsed(call):
    started = time.perf_counter()
    value = call()
    return time.perf_counter() - started, value


records = []
for curve_id, a_invariants in CURVES:
    curve = EllipticCurve(a_invariants)
    first_seconds, L = elapsed(curve.lseries)
    cold_seconds, cold_value = elapsed(lambda: L(1 + I))
    repeated = [elapsed(lambda: L(1 + I))[0] for _ in range(SAMPLES)]
    independent_L = EllipticCurve(a_invariants).lseries()
    independent = [
        elapsed(lambda point=point: independent_L(point))[0] for point in POINTS
    ]
    batch_seconds = None
    batch_checksum = None
    batch_L = EllipticCurve(a_invariants).lseries()
    if hasattr(batch_L, "values"):
        batch_seconds, batch = elapsed(lambda: batch_L.values(POINTS))
        batch_checksum = str(
            sum((index + 1) * value for index, value in enumerate(batch))
        )
    user_point_seconds = None
    line_seconds = None
    rectangle_seconds = None
    plot_100_seconds = None
    plot_53_seconds = None
    diagnostics = None
    if curve_id == "user-evaluation":
        point_L = EllipticCurve(a_invariants).lseries()
        user_point_seconds = {
            str(point): elapsed(lambda point=point: point_L(point))[0]
            for point in USER_POINTS
        }
        if hasattr(point_L, "values_along_line"):
            line_seconds = elapsed(
                lambda: point_L.values_along_line(1, 1 + 20 * I, 101)
            )[0]
        if hasattr(point_L, "values"):
            rectangle = [
                QQ(2 * x) / 15 + QQ(y) / 15 * I
                for y in range(-150, 151, 20)
                for x in range(16)
            ]
            rectangle_seconds = elapsed(lambda: point_L.values(rectangle))[0]
        if hasattr(point_L, "_plot_complex_batch"):
            plot_100_seconds, adaptive_plot = elapsed(
                lambda: complex_plot(point_L, (0, 2), (-10, 10), plot_points=100)
            )
            plot_53_seconds = elapsed(
                lambda: complex_plot(
                    point_L,
                    (0, 2),
                    (-10, 10),
                    plot_points=100,
                    plot_precision=53,
                )
            )[0]
            plot_diagnostic = adaptive_plot._plot_spec_diagnostics[0]
            first_run = plot_diagnostic["runs"][0]
            diagnostics = {
                "pixel_count": int(plot_diagnostic["pixel_count"]),
                "unstable_pixels": int(plot_diagnostic["unstable_pixels"]),
                "accepted_at_16": int(
                    plot_diagnostic["accepted_by_precision"]["16"]
                ),
                "evaluated_point_count": int(first_run["evaluated_point_count"]),
                "conjugation_reconstructed": int(
                    first_run["conjugation_reconstructed"]
                ),
                "cutoff": int(first_run["cutoff"]),
                "grid_points": int(first_run["grid_points"]),
            }
    records.append(
        {
            "curve_id": curve_id,
            "conductor": str(curve.conductor()),
            "lseries_object_seconds": first_seconds,
            "cold_value_seconds": cold_seconds,
            "cold_value": str(cold_value),
            "repeated_median_seconds": median(repeated),
            "independent_batch_total_seconds": sum(independent),
            "native_batch_seconds": batch_seconds,
            "batch_checksum": batch_checksum,
            "user_point_seconds": user_point_seconds,
            "line_101_seconds": line_seconds,
            "rectangle_16x16_seconds": rectangle_seconds,
            "complex_plot_100_auto_seconds": plot_100_seconds,
            "complex_plot_100_53_seconds": plot_53_seconds,
            "complex_plot_diagnostics": diagnostics,
            "samples": int(SAMPLES),
        }
    )

print(
    json.dumps({"schema": "sagejs.benchmark/elliptic-lseries-v1", "records": records})
)
