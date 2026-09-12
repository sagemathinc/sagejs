"""Public owned-data witnesses, shared by CPython, Sage.js and AOT execution."""

import math

from sagejs.numerics import ResourceBudget
from sagejs.numerics.statistics import StatisticsData, describe
from sagejs.numerics.statistics._core import StatisticsStopped


def raises(kind, function):
    try:
        function()
    except kind:
        return
    raise AssertionError("expected " + kind.__name__)


def checked(values, ddof=1):
    ordinary = describe(values, ddof=ddof, trace="none")
    with StatisticsData(values, backend="native") as data:
        assert data.backend == EXPECTED_BACKEND
        info = data.preparation()
        assert info["count"] == len(values)
        assert info["evaluations"] == len(values)
        assert not info["summary_precomputed"]
        assert info["logical_buffer_bytes"] == 80 * len(values) + 16
        assert info["elapsed_ms"] >= 0.0
        info["count"] = -7
        assert len(data) == len(values)
        for trace in ("none", "summary"):
            result = data.describe(ddof=ddof, trace=trace)
            assert result.success == ordinary.success
            assert result.status == ordinary.status
            assert result.value == ordinary.value
            if result.success:
                for name, value in ordinary.value.items():
                    if isinstance(value, float):
                        actual = result.value[name]
                        assert type(actual) is float, (name, type(actual), value)
                        if value == 0.0:
                            assert math.copysign(1.0, actual) == math.copysign(
                                1.0, value
                            ), name
            assert result.validation.to_dict() == ordinary.validation.to_dict()
            assert result.evaluations == len(values)
            if result.success:
                assert result.backend == EXPECTED_BACKEND
                record = result.to_dict()
                assert record["reproducibility"]["plan"]["backend"] == EXPECTED_BACKEND
                assert (
                    record["measurements"]["data_preparation"]["summary_precomputed"]
                    is False
                )
                assert record["provenance"]["qualification_receipt_sha256"] is None
                assert result.to_plot_spec().to_dict()["schema_version"] >= 1
                # Every query returns a detached value and fresh result, not a
                # retained answer computed during preparation.
                value = result.value
                value["mean"] = 1e99
                assert data.describe(ddof=ddof).value == ordinary.value
        if len(values) > 1:
            assert describe(data, ddof=0).value == describe(values, ddof=0).value
    assert data.closed
    data.close()
    raises(ValueError, lambda: data.describe())
    raises(ValueError, lambda: data.to_list())
    raises(ValueError, lambda: len(data))


for values in (
    [1.0, 2.0, 4.0, 7.0],
    [-0.0, 0.0, -0.0, 0.0],
    [0.0, -0.0, 0.0, -0.0],
    [7.0] * 7,
    [1e12 + i / 1024 for i in range(17)],
    [1e100, 1.0, -1e100, 3.0],
    [5e-324, -5e-324, 1e-323],
    [float((i * 37) % 101) / 7.0 - 4.0 for i in range(257)],
    [1e308, 1e308],
    [-1e308, 1e308],
):
    checked(values)
checked([3.0], 0)

# Original and exported data cannot alias the owned sample or its scratch.
source = [1.0, 2.0, 3.0]
data = StatisticsData(source, backend="native")
source[0] = 100.0
exported = data.to_list()
exported[1] = 100.0
assert data.to_list() == [1.0, 2.0, 3.0]
assert data.describe().value["mean"] == 2.0
assert data.describe().value["mean"] == 2.0

# Prepared queries charge their full sample atomically before doing arithmetic.
stopped = data.describe(budget=ResourceBudget(max_evaluations=2))
assert not stopped.success and stopped.status == "maximum_evaluations"
assert stopped.evaluations == 0
stopped = data.describe(cancel=lambda: True)
assert not stopped.success and stopped.status == "cancelled"
assert stopped.evaluations == 0
assert data.describe().success  # cancellation did not publish dirty scratch
for stop_at in (2, 4, 6):
    calls = [0]

    def stop_during_phase():
        calls[0] += 1
        return calls[0] == stop_at

    interrupted = data.describe(cancel=stop_during_phase)
    assert interrupted.success or interrupted.status == "cancelled"
    assert data.describe().value["mean"] == 2.0

# A callback may not release or recursively use active scratch.
raises(RuntimeError, lambda: data.describe(cancel=lambda: data.describe().success))
raises(RuntimeError, lambda: data.describe(cancel=lambda: data.close()))
assert data.describe().success
data.close()

raises(MemoryError, lambda: StatisticsData([1.0, 2.0], max_buffer_bytes=96))
raises(ValueError, lambda: StatisticsData([1.0], max_buffer_bytes=True))
raises(ValueError, lambda: StatisticsData([1.0], backend="fast"))
raises(ValueError, lambda: StatisticsData([]))
raises(ValueError, lambda: StatisticsData([math.inf]))
raises(ValueError, lambda: StatisticsData([math.nan]))
with StatisticsData([math.nan, 3.0], nan_policy="omit", max_buffer_bytes=96) as single:
    assert single.to_list() == [3.0]
    raises(ValueError, lambda: single.describe())
    assert single.describe(ddof=0).value["mean"] == 3.0

events = []


class Convertible:
    def __init__(self, value):
        self.value = value

    def __float__(self):
        events.append("float" + str(self.value))
        return float(self.value)


def observations():
    for value in (1, 2, 3):
        events.append("yield" + str(value))
        yield Convertible(value)


def cancellation():
    events.append("cancel")
    return False


result = describe(
    observations(), budget=ResourceBudget(max_evaluations=2), cancel=cancellation
)
assert result.status == "maximum_evaluations" and result.evaluations == 2
expected = [
    "yield1",
    "cancel",
    "float1",
    "yield2",
    "cancel",
    "float2",
    "yield3",
    "cancel",
]
assert events == expected
events.clear()
raises(
    StatisticsStopped,
    lambda: StatisticsData(
        observations(), budget=ResourceBudget(max_evaluations=2), cancel=cancellation
    ),
)
assert events == expected
events.clear()
with StatisticsData(observations(), cancel=cancellation, backend="native") as saved:
    assert events == expected + ["float3", "cancel"]
    events.clear()
    assert saved.describe().success
    assert events == []


# A subclass with its own iterator is not silently routed around that iterator.
class SpecialData(StatisticsData):
    def __iter__(self):
        return iter([4.0, 6.0])


with SpecialData([1.0, 2.0]) as special:
    assert describe(special).value["mean"] == 5.0

print("prepared statistics passed")
