from sagejs.numerics.statistics import StatisticsData

data = None


def prepare():
    global data
    values = [1e9 + ((index * 37) % 1000) / 10.0 for index in range(20000)]
    data = StatisticsData(values, backend="native")
    assert data.backend == "source-native"
    for level in ("none", "summary"):
        result = data.describe(trace=level)
        assert result.success and result.evaluations == 20000


def query_none():
    return data.describe(trace="none")


def query_summary():
    return data.describe(trace="summary")
