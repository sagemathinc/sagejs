"""Descriptive statistics for numeric and exact Sage.js data."""

import math
from collections import Counter, namedtuple


class StatisticsError(ValueError):
    pass


def _values(data):
    values = list(data)
    if not values:
        raise StatisticsError('no data points')
    return values


def mean(data):
    values = _values(data)
    return sum(values) / len(values)


def fmean(data, weights=None):
    values = _values(data)
    if weights is None:
        return float(sum(values)) / len(values)
    weights = list(weights)
    if len(values) != len(weights):
        raise StatisticsError('data and weights must be the same length')
    total = sum(weights)
    if total == 0:
        raise StatisticsError('sum of weights must be non-zero')
    return float(sum(value * weight for value, weight in zip(values, weights))) / total


def geometric_mean(data):
    values = _values(data)
    if any(value < 0 for value in values):
        raise StatisticsError('geometric mean requires a non-negative dataset')
    if any(value == 0 for value in values):
        return 0.0
    return math.exp(sum(math.log(value) for value in values) / len(values))


def harmonic_mean(data, weights=None):
    values = _values(data)
    if any(value < 0 for value in values):
        raise StatisticsError('harmonic mean does not support negative values')
    if weights is None:
        if any(value == 0 for value in values):
            return 0
        return len(values) / sum(1 / value for value in values)
    weights = list(weights)
    if len(values) != len(weights):
        raise StatisticsError('Number of weights does not match data size')
    if any(weight < 0 for weight in weights):
        raise StatisticsError('harmonic mean does not support negative values')
    total_weight = sum(weights)
    if total_weight <= 0:
        raise StatisticsError('Weighted sum must be positive')
    reciprocal_sum = 0
    for value, weight in zip(values, weights):
        if value == 0:
            if weight:
                return 0
        else:
            reciprocal_sum += weight / value
    if reciprocal_sum <= 0:
        raise StatisticsError('Weighted sum must be positive')
    return total_weight / reciprocal_sum


def median(data):
    values = sorted(_values(data))
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2


def median_low(data):
    values = sorted(_values(data))
    return values[(len(values) - 1) // 2]


def median_high(data):
    values = sorted(_values(data))
    return values[len(values) // 2]


def median_grouped(data, interval=1.0):
    values = sorted(_values(data))
    middle = len(values) // 2
    midpoint = values[middle]
    lower = midpoint - interval / 2
    left = 0
    while left < len(values) and values[left] < midpoint:
        left += 1
    right = left
    while right < len(values) and values[right] == midpoint:
        right += 1
    return lower + interval * (len(values) / 2 - left) / (right - left)


def mode(data):
    values = _values(data)
    counts = Counter(values)
    return counts.most_common(1)[0][0]


def multimode(data):
    values = list(data)
    if not values:
        return []
    counts = Counter(values)
    largest = max(counts.values())
    return [value for value in counts if counts.__getitem__(value) == largest]


def pvariance(data, mu=None):
    values = _values(data)
    center = mean(values) if mu is None else mu
    return sum((value - center) ** 2 for value in values) / len(values)


def variance(data, xbar=None):
    values = _values(data)
    if len(values) < 2:
        raise StatisticsError('variance requires at least two data points')
    center = mean(values) if xbar is None else xbar
    return sum((value - center) ** 2 for value in values) / (len(values) - 1)


def pstdev(data, mu=None):
    return math.sqrt(pvariance(data, mu))


def stdev(data, xbar=None):
    return math.sqrt(variance(data, xbar))


def quantiles(data, *, n=4, method='exclusive'):
    if n < 1:
        raise StatisticsError('n must be at least 1')
    values = sorted(data)
    length = len(values)
    if length < 2:
        if length == 1:
            return values * (n - 1)
        raise StatisticsError('must have at least one data point')
    if method == 'inclusive':
        scale = length - 1
        answer = []
        for index in range(1, n):
            position, remainder = divmod(index * scale, n)
            answer.append(
                (values[position] * (n - remainder)
                 + values[position + 1] * remainder) / n
            )
        return answer
    if method == 'exclusive':
        scale = length + 1
        answer = []
        for index in range(1, n):
            position = index * scale // n
            position = min(length - 1, max(1, position))
            remainder = index * scale - position * n
            answer.append(
                (values[position - 1] * (n - remainder)
                 + values[position] * remainder) / n
            )
        return answer
    raise ValueError("Unknown method: " + repr(method))


def covariance(x, y):
    x = list(x)
    y = list(y)
    if len(x) != len(y):
        raise StatisticsError('covariance requires that both inputs have same number of data points')
    if len(x) < 2:
        raise StatisticsError('covariance requires at least two data points')
    xmean = mean(x)
    ymean = mean(y)
    return sum((a - xmean) * (b - ymean) for a, b in zip(x, y)) / (len(x) - 1)


def correlation(x, y, *, method='linear'):
    if method != 'linear':
        raise NotImplementedError('only linear correlation is currently supported')
    x = list(x)
    y = list(y)
    numerator = covariance(x, y)
    return numerator / (stdev(x) * stdev(y))


LinearRegression = namedtuple('LinearRegression', 'slope intercept')


def linear_regression(x, y, *, proportional=False):
    x = list(x)
    y = list(y)
    if len(x) != len(y) or len(x) < 2:
        raise StatisticsError('linear regression requires equal non-empty inputs')
    if proportional:
        denominator = sum(value * value for value in x)
        if denominator == 0:
            raise StatisticsError('x is constant')
        return LinearRegression(sum(a * b for a, b in zip(x, y)) / denominator, 0.0)
    xmean = mean(x)
    ymean = mean(y)
    denominator = sum((value - xmean) ** 2 for value in x)
    if denominator == 0:
        raise StatisticsError('x is constant')
    slope = sum((a - xmean) * (b - ymean) for a, b in zip(x, y)) / denominator
    return LinearRegression(slope, ymean - slope * xmean)
