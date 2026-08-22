"""Derivative-free numerical optimization: root finding and minimization.

Three classical algorithms live here, each transliterated from the reference
implementation that SageMath itself calls into rather than re-derived from a
textbook description:

* `brent_root` — Brent's bracketed root finder `zeroin` and plain bisection.
  Richard P. Brent, *Algorithms for Minimization without Derivatives*,
  Prentice-Hall (1973), chapter 4.
* `brent_minimize` — Brent's bounded scalar minimizer `localmin`, golden
  section search combined with successive parabolic interpolation. Brent
  (1973), chapter 5.
* `nelder_mead` — the downhill simplex method of J. A. Nelder and R. Mead,
  *A Simplex Method for Function Minimization*, Computer Journal 7:308-313
  (1965). K. I. M. McKinnon, *Convergence of the Nelder-Mead Simplex Method
  to a Nonstationary Point*, SIAM Journal on Optimization 9(1):148-158
  (1998), documents the method's known stalling failure mode.

`sagejs.optimization.sage_api` layers Sage's `find_root`,
`find_local_minimum`, `find_local_maximum` and `minimize` on top of these
three. It is deliberately not re-exported here, so that the algorithms stay
importable without pulling in the symbolic expression layer.
"""

from .brent_minimize import BrentMinimumResult, fminbound
from .brent_root import BrentRootResult, bisect, brentq
from .nelder_mead import NelderMeadResult, nelder_mead

__all__ = [
    "BrentMinimumResult",
    "BrentRootResult",
    "NelderMeadResult",
    "bisect",
    "brentq",
    "fminbound",
    "nelder_mead",
]
