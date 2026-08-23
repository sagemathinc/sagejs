"""Derivative-free and gradient-based numerical optimization: root finding
and minimization.

Eight algorithm modules live here, each transliterated from the reference
implementation that SageMath itself calls into rather than re-derived from a
textbook description:

* `brent_root` — Brent's bracketed root finder `zeroin` and plain bisection.
  Richard P. Brent, *Algorithms for Minimization without Derivatives*,
  Prentice-Hall (1973), chapter 4.
* `brent_minimize` — Brent's scalar minimizer `localmin`, golden section
  search combined with successive parabolic interpolation, in both a bounded
  form (`fminbound`) and an unbounded one (`bracket` then `brent`). Brent
  (1973), chapter 5.
* `nelder_mead` — the downhill simplex method of J. A. Nelder and R. Mead,
  *A Simplex Method for Function Minimization*, Computer Journal 7:308-313
  (1965). K. I. M. McKinnon, *Convergence of the Nelder-Mead Simplex Method
  to a Nonstationary Point*, SIAM Journal on Optimization 9(1):148-158
  (1998), documents the method's known stalling failure mode.
* `powell` — Powell's derivative-free direction-set method, M. J. D. Powell,
  *An efficient method for finding the minimum of a function of several
  variables without calculating derivatives*, Computer Journal 7(2):155-162
  (1964), each one-dimensional sweep driven by `brent_minimize`'s unbounded
  Brent search.
* `line_search` — the strong-Wolfe step selection shared by the
  gradient-based methods: the MINPACK `dcsrch` search with a Nocedal-Wright
  bracket-and-zoom fallback, plus `approx_fprime`, a forward-difference
  gradient approximation.
* `gradient_methods` — quasi-Newton and Newton-type descent built on
  `line_search`: BFGS, Polak-Ribiere-plus nonlinear conjugate gradient, and
  truncated ("inexact") Newton-CG. Nocedal and Wright, *Numerical
  Optimization*, 2nd ed., Springer (2006).
* `lbfgsb` — L-BFGS-B, limited-memory BFGS with box constraints. Byrd, Lu,
  Nocedal and Zhu, *A limited memory algorithm for bound constrained
  optimization*, SIAM J. Sci. Comput. 16(5):1190-1208 (1995); targets
  `scipy.optimize.fmin_l_bfgs_b`, itself a wrapper over the original Fortran
  `lbfgsb.f`. Drives `line_search.DCSRCH`'s reverse-communication `iterate`
  directly for its own line search, the same way `tnc` does.
* `tnc` — truncated Newton with bounds. Stephen G. Nash, *Newton-type
  minimization via the Lanczos method*, SIAM J. Numer. Anal. 21(4):770-788
  (1984); targets `scipy.optimize.fmin_tnc`, itself a wrapper over Jean-
  Sebastien Roy's `tnc.c`.

`sagejs.optimization.sage_api` layers Sage's `find_root`,
`find_local_minimum`, `find_local_maximum`, `minimize` and
`minimize_constrained` on top of these. It is deliberately not re-exported
here, so that the algorithms stay importable without pulling in the
symbolic expression layer.
"""

from .brent_minimize import (
    BracketError,
    BracketResult,
    BrentMinimumResult,
    BrentResult,
    bracket,
    brent,
    fminbound,
)
from .brent_root import BrentRootResult, bisect, brentq
from .findminimum import LocalResult, LocalSpec, findminimum
from .gradient_methods import (
    BFGSResult,
    CGResult,
    NewtonCGResult,
    fmin_bfgs,
    fmin_cg,
    fmin_ncg,
)
from .lbfgsb import LBFGSBResult, fmin_l_bfgs_b
from .line_search import (
    DCSRCH,
    EPSILON,
    LineSearchError,
    LineSearchResult,
    ScalarSearchResult,
    approx_fprime,
    line_search_wolfe1,
    line_search_wolfe2,
    line_search_wolfe12,
    numerical_gradient,
    scalar_search_wolfe1,
    scalar_search_wolfe2,
)
from .nelder_mead import NelderMeadResult, nelder_mead
from .powell import PowellResult, powell
from .tnc import (
    CONSTANT,
    FCONVERGED,
    INFEASIBLE,
    LOCALMINIMUM,
    LSFAIL,
    MAXFUN,
    NOPROGRESS,
    RCSTRINGS,
    USERABORT,
    XCONVERGED,
    TNCResult,
    fmin_tnc,
)

__all__ = [
    "BFGSResult",
    "BracketError",
    "BracketResult",
    "BrentMinimumResult",
    "BrentResult",
    "BrentRootResult",
    "CGResult",
    "CONSTANT",
    "DCSRCH",
    "EPSILON",
    "FCONVERGED",
    "INFEASIBLE",
    "LBFGSBResult",
    "LOCALMINIMUM",
    "LSFAIL",
    "LineSearchError",
    "LineSearchResult",
    "LocalResult",
    "LocalSpec",
    "MAXFUN",
    "NOPROGRESS",
    "NelderMeadResult",
    "NewtonCGResult",
    "PowellResult",
    "RCSTRINGS",
    "ScalarSearchResult",
    "TNCResult",
    "USERABORT",
    "XCONVERGED",
    "approx_fprime",
    "bisect",
    "bracket",
    "brent",
    "brentq",
    "findminimum",
    "fmin_bfgs",
    "fmin_cg",
    "fmin_l_bfgs_b",
    "fmin_ncg",
    "fmin_tnc",
    "fminbound",
    "line_search_wolfe1",
    "line_search_wolfe12",
    "line_search_wolfe2",
    "nelder_mead",
    "numerical_gradient",
    "powell",
    "scalar_search_wolfe1",
    "scalar_search_wolfe2",
]
