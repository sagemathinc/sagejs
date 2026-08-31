"""Validated descriptive statistics, probability, inference, and regression.

This package is ordinary CPython-parseable source and has no optional runtime
dependency. Import it explicitly as `sagejs.numerics.statistics`; registration
in the shared `sagejs.numerics` facade is owned by the integration lane.
"""

from .descriptive import correlation, covariance, describe, quantile
from .distributions import Binomial, ChiSquare, Distribution, Normal, Poisson, StudentT
from .inference import confidence_interval_mean, one_sample_t_test, two_sample_t_test
from .regression import (
    cauchy_loss,
    huber_loss,
    huber_regression,
    linear_regression,
    soft_l1_loss,
    theil_sen_regression,
)
from .result import StatisticsResult
from .rng import RNG_ALGORITHM, RNG_CONTRACT_VERSION, RandomStream, sample

__all__ = [
    "RNG_ALGORITHM",
    "RNG_CONTRACT_VERSION",
    "Binomial",
    "ChiSquare",
    "Distribution",
    "Normal",
    "Poisson",
    "RandomStream",
    "StatisticsResult",
    "StudentT",
    "cauchy_loss",
    "confidence_interval_mean",
    "correlation",
    "covariance",
    "describe",
    "huber_loss",
    "huber_regression",
    "linear_regression",
    "one_sample_t_test",
    "quantile",
    "sample",
    "soft_l1_loss",
    "theil_sen_regression",
    "two_sample_t_test",
]
