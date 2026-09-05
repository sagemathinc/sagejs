"""Public-call development measurements with preparation reported separately."""

import json
import time

from sagejs.numerics.statistics import StatisticsData, describe

values = [1e9 + ((index * 37) % 1000) / 10.0 for index in range(20000)]


def checked(call, expected):
    started = time.perf_counter()
    first = call()
    first_ms = (time.perf_counter() - started) * 1000
    assert first.success and first.value == expected
    for _ in range(3):
        assert call().value == expected
    samples = []
    for _ in range(7):
        started = time.perf_counter()
        result = call()
        samples.append((time.perf_counter() - started) * 1000)
        assert result.success and result.value == expected
        assert result.evaluations == 20000
    return {
        "first_call_ms": first_ms,
        "samples_ms": samples,
        "median_ms": sorted(samples)[3],
        "backend": first.backend,
        "value": first.value,
        "validation": first.validation.to_dict(),
    }


records = []
for level in ("none", "summary"):
    expected = describe(values, trace=level).value
    assert abs(expected["mean"] - 1000000049.95) < 1e-7
    generic = checked(lambda: describe(values, trace=level), expected)
    records.append({"trace": level, "route": "generic", "query": generic})
    for backend in ("dynamic", "native"):
        start = time.perf_counter()
        data = StatisticsData(values, backend=backend)
        setup_ms = (time.perf_counter() - start) * 1000
        try:
            assert data.backend == (
                EXPECTED_NATIVE_BACKEND if backend == "native" else "ordinary-python"
            )
            query = checked(lambda: data.describe(trace=level), expected)
            records.append(
                {
                    "trace": level,
                    "route": "prepared-" + backend,
                    "setup_wall_ms": setup_ms,
                    "preparation": data.preparation(),
                    "query": query,
                }
            )
        finally:
            data.close()
print(
    json.dumps(
        {"schema": "sagejs.prepared-statistics-development/v1", "records": records}
    )
)
