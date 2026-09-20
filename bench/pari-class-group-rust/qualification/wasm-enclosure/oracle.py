#!/usr/bin/env python3
"""Independent mpmath oracle for the Rust MPFR/MPC enclosure receipt."""

import json
import sys

import mpmath


def number(text: str):
    return mpmath.mpf(text)


def main() -> None:
    document = json.load(sys.stdin)
    mpmath.mp.dps = 180
    roots = mpmath.polyroots([1, 0, -3, -1], maxsteps=1000, error=False)
    alpha = max(root.real for root in roots if abs(root.imag) < mpmath.mpf("1e-150"))
    expected = mpmath.log(mpmath.mpc(alpha, 1))
    previous_width = None
    for stage in document["stages"]:
        root = stage["root"]
        complex_log = stage["complexLog"]
        assert number(root["lower"]) <= alpha <= number(root["upper"])
        assert number(complex_log["realLower"]) <= expected.real <= number(
            complex_log["realUpper"]
        )
        assert number(complex_log["imagLower"]) <= expected.imag <= number(
            complex_log["imagUpper"]
        )
        assert number(complex_log["realLower"]) <= number(
            complex_log["mpcReal"]
        ) <= number(complex_log["realUpper"])
        assert number(complex_log["imagLower"]) <= number(
            complex_log["mpcImag"]
        ) <= number(complex_log["imagUpper"])
        width = number(root["upper"]) - number(root["lower"])
        assert width > 0
        if previous_width is not None:
            assert width < previous_width
        previous_width = width
    assert document["stages"][0]["targetMet"] is False
    assert document["stages"][-1]["targetMet"] is True
    print(
        json.dumps(
            {
                "oracle": "mpmath.polyroots+log",
                "mpmathVersion": mpmath.__version__,
                "decimalDigits": mpmath.mp.dps,
                "verifiedStages": len(document["stages"]),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
