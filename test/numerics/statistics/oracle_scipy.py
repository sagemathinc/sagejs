"""Regenerate the independent SciPy statistics oracle records for review."""

import json

import numpy as np
from scipy import stats


def scalar(value):
    return float(value)


records = {
    "normal": [
        {
            "x": x,
            "pdf": scalar(stats.norm.pdf(x)),
            "cdf": scalar(stats.norm.cdf(x)),
            "sf": scalar(stats.norm.sf(x)),
        }
        for x in (-8, -2, 0, 1.5, 8)
    ],
    "student_t_5": [
        {
            "x": x,
            "pdf": scalar(stats.t.pdf(x, 5)),
            "cdf": scalar(stats.t.cdf(x, 5)),
            "sf": scalar(stats.t.sf(x, 5)),
        }
        for x in (-10, -1, 0, 2, 10)
    ],
    "chi_square_4": [
        {
            "x": x,
            "pdf": scalar(stats.chi2.pdf(x, 4)),
            "cdf": scalar(stats.chi2.cdf(x, 4)),
            "sf": scalar(stats.chi2.sf(x, 4)),
        }
        for x in (0, 0.1, 1, 5, 20)
    ],
}

print(json.dumps(records, indent=2, sort_keys=True))
