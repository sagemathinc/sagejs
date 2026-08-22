"""Levenberg-Marquardt nonlinear least squares, as MINPACK's `lmdif` does it.

Sage's numerical curve-fitting (and `scipy.optimize.leastsq` generally) is a
thin wrapper around MINPACK-1's `lmdif` (More, Garbow & Hillstrom, *User
Guide for MINPACK-1*, Argonne National Laboratory ANL-80-74, 1980): the
Levenberg-Marquardt trust-region method with a forward-difference Jacobian.
`leastsq` below transliterates that Fortran driver line for line — trust
region radius `delta`, the actual-vs-predicted reduction ratio, and the
`ftol`/`xtol`/`gtol` convergence tests with their `info` codes — reading
`lmdif.f` and `lmdif1.f` (for the default `maxfev = 200*(n+1)` rule) and
`lmpar.f` (the More trust-region step for the LM parameter) directly.

`enorm`, `fdjac2`, `qrfac`, and `qrsolv` are *not* transcribed from a source
file on disk — MINPACK ships them as separate subroutines not provided
here. They are reconstructed from the precise contracts `lmdif.f` and
`lmpar.f` document for their own calls into them (the packed Householder
form `qrfac` leaves behind, how the `ipvt` permutation threads through
every later step, how `lmpar` consumes `qrsolv`'s side effect on `r`'s
strict lower triangle for its own Newton correction) plus the published
algorithm description in the MINPACK user guide: the standard,
unchanged-since-1980 public-domain routines, not a guess, but a
reconstruction rather than a transliteration — flagged as such per the
project's sourcing rule.

`qrfac` always pivots (`lmdif`'s only calling mode). `enorm` additionally
returns `nan` immediately when any component is `nan`: the plain
three-accumulator algorithm does not itself guarantee this (a `nan` routed
into the "large" bucket before `x1max` is set can divide `nan` by an exact
`0.0`, an unhandled Python crash IEEE arithmetic would not raise) — a small,
documented hardening beyond the letter of `enorm.f`.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

_NAN = float("nan")

# dpmpar(1): IEEE double machine epsilon, 2**-52.
_EPSILON = 2.220446049250313e-16
# dpmpar(2): smallest positive normalized IEEE double.
_DWARF = 2.2250738585072014e-308
# enorm.f's published scaling constants: rdwarf**2 must not underflow and
# rgiant**2 must not overflow, for every component's square.
_RDWARF = 3.834e-20
_RGIANT = 1.304e19

_INFO_MESSAGES: dict[int, str] = {
    0: "improper input parameters",
    1: "both actual and predicted relative reductions in the sum of "
    "squares are at most ftol",
    2: "relative error between two consecutive iterates is at most xtol",
    3: "conditions for info=1 and info=2 both hold",
    4: "cosine of the angle between residuals and every Jacobian column "
    "is at most gtol",
    5: "number of calls to `residuals` reached maxfev",
    6: "ftol is too small: no further reduction in the sum of squares is possible",
    7: "xtol is too small: no further improvement in x is possible",
    8: "gtol is too small: residuals are orthogonal to the Jacobian to "
    "machine precision",
}


@dataclass(frozen=True)
class LeastSquaresResult:
    """The outcome of a Levenberg-Marquardt least-squares fit.

    `info` is MINPACK's own code: `1`-`4` are the successful stops
    (`ftol`, `xtol`, both, `gtol` — see `_INFO_MESSAGES` for exact
    wording), `5` is `maxfev` exhausted, `6`-`8` mean the corresponding
    tolerance is already at machine precision so no further progress is
    possible. `converged` is `True` exactly for `info in (1, 2, 3, 4)`.
    `flag` is `_INFO_MESSAGES[info]`.

    `jacobian` is the `m x n` finite-difference Jacobian
    (`jacobian[i][j] = d(residuals[i])/d(x[j])`) from the *last* outer
    iteration MINPACK recomputed it — generally one step before the final
    accepted `x`, like `scipy.optimize.leastsq`'s `infodict['fjac']`.
    `cost` is `0.5 * sum(r**2 for r in residuals)`, scipy's
    `least_squares` convention.
    """

    x: list[float]
    cost: float
    residuals: list[float]
    jacobian: list[list[float]]
    iterations: int
    function_calls: int
    converged: bool
    flag: str
    info: int


def enorm(x: Sequence[float]) -> float:
    """Euclidean norm, MINPACK `enorm.f`'s overflow/underflow-guarded form.

    Splits the sum of squares into three accumulators for small (magnitude
    `<= rdwarf`), intermediate, and large (magnitude `>= rgiant/n`)
    components, each scaled so no term overflows or underflows even when
    `sum(v * v for v in x)` would. Do not replace this with a naive
    `sqrt(sum(v * v for v in x))`; that is precisely the failure mode this
    routine exists to avoid. Returns `nan` immediately if any component is
    `nan` (see the module docstring).
    """
    if any(math.isnan(v) for v in x):
        return _NAN
    n = len(x)
    if n == 0:
        return 0.0
    s1 = s2 = s3 = 0.0
    x1max = x3max = 0.0
    agiant = _RGIANT / float(n)
    for v in x:
        xabs = abs(v)
        if _RDWARF < xabs < agiant:
            s2 += xabs * xabs
        elif xabs <= _RDWARF:
            if xabs > x3max:
                s3 = 1.0 + s3 * (x3max / xabs) ** 2
                x3max = xabs
            elif xabs != 0.0:
                s3 += (xabs / x3max) ** 2
        else:
            if xabs > x1max:
                s1 = 1.0 + s1 * (x1max / xabs) ** 2
                x1max = xabs
            else:
                s1 += (xabs / x1max) ** 2
    if s1 != 0.0:
        return x1max * math.sqrt(s1 + (s2 / x1max) / x1max)
    if s2 != 0.0:
        if s2 >= x3max:
            return math.sqrt(s2 * (1.0 + (x3max / s2) * (x3max * s3)))
        return math.sqrt(x3max * ((s2 / x3max) + (x3max * s3)))
    return x3max * math.sqrt(s3)


def _fdjac2(
    func: Callable[[list[float]], list[float]],
    x: list[float],
    fvec: Sequence[float],
    epsfcn: float,
) -> list[list[float]]:
    """Forward-difference Jacobian, MINPACK `fdjac2.f`'s step-size rule.

    Column `j`'s step is `h = eps * abs(x[j])` (or `eps` itself when
    `x[j] == 0`), with `eps = sqrt(max(epsfcn, machine epsilon))`. Returns
    `n` columns of length `m` (Fortran's natural column-major layout, which
    every routine below shares); `x` is restored on return.
    """
    m = len(fvec)
    eps = math.sqrt(max(epsfcn, _EPSILON))
    columns: list[list[float]] = []
    for j, xj in enumerate(x):
        h = eps * abs(xj)
        if h == 0.0:
            h = eps
        x[j] = xj + h
        wa = func(x)
        x[j] = xj
        columns.append([(wa[i] - fvec[i]) / h for i in range(m)])
    return columns


def _qrfac(
    a: list[list[float]], m: int, n: int
) -> tuple[list[int], list[float], list[float]]:
    """Householder QR with column pivoting, MINPACK `qrfac.f` (always pivots).

    Mutates `a`'s columns in place into packed Householder form: for
    pivoted position `j`, rows `>= j` hold the Householder vector (its own
    leading entry folded to `1 + ...`, *not* the true `R` diagonal — that is
    the returned `rdiag[j]`). Returns `(ipvt, rdiag, acnorm)`: `ipvt[j]` is
    the original column now sitting at position `j` (so `a*P = Q*R` with
    `P`'s column `j` equal to identity column `ipvt[j]`), `rdiag` is `R`'s
    diagonal (nonincreasing in magnitude, in pivoted order), and `acnorm` is
    every column's *original* norm, indexed by original (unpivoted) column
    index — the scale `lmdif` uses to initialize `diag`.
    """
    acnorm = [enorm(a[j]) for j in range(n)]
    rdiag = list(acnorm)
    wa = list(acnorm)
    ipvt = list(range(n))

    for j in range(min(m, n)):
        kmax = j
        for k in range(j, n):
            if rdiag[k] > rdiag[kmax]:
                kmax = k
        if kmax != j:
            a[j], a[kmax] = a[kmax], a[j]
            rdiag[kmax] = rdiag[j]
            wa[kmax] = wa[j]
            ipvt[j], ipvt[kmax] = ipvt[kmax], ipvt[j]

        ajnorm = enorm(a[j][j:])
        if ajnorm != 0.0:
            if a[j][j] < 0.0:
                ajnorm = -ajnorm
            for i in range(j, m):
                a[j][i] /= ajnorm
            a[j][j] += 1.0
            for k in range(j + 1, n):
                total = sum(a[j][i] * a[k][i] for i in range(j, m))
                temp = total / a[j][j]
                for i in range(j, m):
                    a[k][i] -= temp * a[j][i]
                if rdiag[k] != 0.0:
                    temp = a[k][j] / rdiag[k]
                    rdiag[k] *= math.sqrt(max(0.0, 1.0 - temp * temp))
                    if 0.05 * (rdiag[k] / wa[k]) ** 2 <= _EPSILON:
                        rdiag[k] = enorm(a[k][j + 1 :])
                        wa[k] = rdiag[k]
        rdiag[j] = -ajnorm
    return ipvt, rdiag, acnorm


def _qrsolve(
    r: list[list[float]],
    ipvt: list[int],
    diag_scaled: list[float],
    qtb: list[float],
    n: int,
) -> tuple[list[float], list[float], list[list[float]]]:
    """Solve `R*z = Q^T b`, `D*z = 0` in the least-squares sense.

    MINPACK `qrsolv.f`, eliminating diagonal matrix `D` (here
    `diag_scaled`, already `sqrt(par) * diag`) into `R` row by row with
    Givens rotations. `r[i][j]` (row `i`, col `j`) must be `R`'s full
    upper triangle (`i <= j`; entries below ignored). Returns
    `(x, sdiag, s)`: `x` is the solution permuted back by `ipvt`, `sdiag`
    is the diagonal of upper-triangular `S` with
    `P^T(A^T A + D^2)P = S^T S`, and `s` (`s[j][i]`, `i > j`, holds `S`'s
    strict upper triangle) is what `lmpar` needs for its Newton
    correction — `qrsolv.f` exposes this as a side effect on its shared
    `r` argument; here it is returned explicitly.
    """
    s = [[r[i][j] if i <= j else 0.0 for j in range(n)] for i in range(n)]
    wa = list(qtb)
    sdiag = [0.0] * n

    for j in range(n):
        dj = diag_scaled[ipvt[j]]
        if dj == 0.0:
            sdiag[j] = s[j][j]
            continue
        work = [0.0] * n
        work[j] = dj
        qtbpj = 0.0
        for k in range(j, n):
            if work[k] == 0.0:
                continue
            if abs(s[k][k]) >= abs(work[k]):
                cotan = s[k][k] / work[k]
                sin_ = 0.5 / math.sqrt(0.25 + 0.25 * cotan * cotan)
                cos_ = sin_ * cotan
            else:
                tan_ = work[k] / s[k][k]
                cos_ = 0.5 / math.sqrt(0.25 + 0.25 * tan_ * tan_)
                sin_ = cos_ * tan_
            s[k][k] = cos_ * s[k][k] + sin_ * work[k]
            temp = cos_ * wa[k] + sin_ * qtbpj
            qtbpj = -sin_ * wa[k] + cos_ * qtbpj
            wa[k] = temp
            for i in range(k + 1, n):
                temp = cos_ * s[k][i] + sin_ * work[i]
                work[i] = -sin_ * s[k][i] + cos_ * work[i]
                s[k][i] = temp
        sdiag[j] = s[j][j]

    nsing = n
    for j in range(n):
        if sdiag[j] == 0.0 and nsing == n:
            nsing = j
        if nsing < n:
            wa[j] = 0.0
    for k in range(nsing):
        j = nsing - 1 - k
        total = sum(s[j][i] * wa[i] for i in range(j + 1, nsing))
        wa[j] = (wa[j] - total) / sdiag[j]

    x = [0.0] * n
    for j in range(n):
        x[ipvt[j]] = wa[j]
    return x, sdiag, s


def _lmpar(
    r: list[list[float]],
    ipvt: list[int],
    diag: list[float],
    qtb: list[float],
    delta: float,
    par0: float,
    n: int,
) -> tuple[list[float], float]:
    """Determine the Levenberg-Marquardt parameter, MINPACK `lmpar.f`.

    Given the QR factorization (`r`, `ipvt`) of the Jacobian, the scaling
    `diag`, `qtb = Q^T fvec`, and trust-region radius `delta`, finds
    `par >= 0` and the step `x` solving `R*x = Q^T fvec`,
    `sqrt(par)*diag*x = 0` in the least-squares sense, with
    `norm(diag * x)` within 10% of `delta` (or `par == 0` and
    `norm(diag * x) <= delta`, the Gauss-Newton step). At most 10
    refinement iterations run; the 10th accepts whatever `par` it reached.
    `r`'s diagonal being exactly zero on rows `>= nsing` (a rank-deficient
    Jacobian) is handled by MINPACK's own least-squares fallback below,
    never a pseudo-inverse.
    """
    wa1 = list(qtb)
    nsing = n
    for j in range(n):
        if r[j][j] == 0.0 and nsing == n:
            nsing = j
        if nsing < n:
            wa1[j] = 0.0
    for k in range(nsing):
        j = nsing - 1 - k
        wa1[j] /= r[j][j]
        temp = wa1[j]
        for i in range(j):
            wa1[i] -= r[i][j] * temp

    x = [0.0] * n
    for j in range(n):
        x[ipvt[j]] = wa1[j]

    wa2 = [diag[j] * x[j] for j in range(n)]
    dxnorm = enorm(wa2)
    fp = dxnorm - delta
    if fp <= 0.1 * delta:
        return x, 0.0

    parl = 0.0
    if nsing == n:
        wa1 = [diag[ipvt[j]] * (wa2[ipvt[j]] / dxnorm) for j in range(n)]
        for j in range(n):
            total = sum(r[i][j] * wa1[i] for i in range(j))
            wa1[j] = (wa1[j] - total) / r[j][j]
        temp = enorm(wa1)
        parl = ((fp / delta) / temp) / temp

    wa1 = [0.0] * n
    for j in range(n):
        total = sum(r[i][j] * qtb[i] for i in range(j + 1))
        wa1[j] = total / diag[ipvt[j]]
    gnorm = enorm(wa1)
    paru = gnorm / delta
    if paru == 0.0:
        paru = _DWARF / min(delta, 0.1)

    par = min(max(par0, parl), paru)
    if par == 0.0:
        par = gnorm / dxnorm

    for _ in range(10):
        if par == 0.0:
            par = max(_DWARF, 0.001 * paru)
        temp = math.sqrt(par)
        diag_scaled = [temp * diag[j] for j in range(n)]
        x, sdiag, s = _qrsolve(r, ipvt, diag_scaled, qtb, n)
        wa2 = [diag[j] * x[j] for j in range(n)]
        dxnorm = enorm(wa2)
        prev_fp = fp
        fp = dxnorm - delta

        if abs(fp) <= 0.1 * delta or (parl == 0.0 and fp <= prev_fp and prev_fp < 0.0):
            break

        wa1 = [diag[ipvt[j]] * (wa2[ipvt[j]] / dxnorm) for j in range(n)]
        for j in range(n):
            wa1[j] /= sdiag[j]
            temp = wa1[j]
            for i in range(j + 1, n):
                wa1[i] -= s[j][i] * temp
        temp = enorm(wa1)
        parc = ((fp / delta) / temp) / temp

        if fp > 0.0:
            parl = max(parl, par)
        if fp < 0.0:
            paru = min(paru, par)
        par = max(parl, par + parc)

    return x, par


def _lmdif(
    func: Callable[[list[float]], list[float]],
    x0: list[float],
    fvec0: list[float],
    m: int,
    n: int,
    ftol: float,
    xtol: float,
    gtol: float,
    maxfev: int,
    epsfcn: float,
    factor: float,
    diag_in: list[float] | None,
) -> tuple[list[float], list[float], list[list[float]], int, int, int]:
    """The Levenberg-Marquardt iteration itself, MINPACK `lmdif.f`.

    Returns `(x, fvec, jacobian_mn, info, nfev, iterations)`. `func` must
    already coerce its result to `list[float]`; `fvec0` is `func(x0)`,
    already spent as the first of `nfev`'s calls (matching `lmdif.f`, which
    evaluates once before entering the loop).
    """
    x = list(x0)
    fvec = fvec0
    fnorm = enorm(fvec)
    mode2 = diag_in is not None
    diag = list(diag_in) if diag_in is not None else [1.0] * n

    par = 0.0
    delta = 0.0
    xnorm = 0.0
    nfev = 1
    iteration = 1
    final_info = 0
    jacobian_mn: list[list[float]] = [[0.0] * n for _ in range(m)]

    while True:
        columns = _fdjac2(func, x, fvec, epsfcn)
        nfev += n
        jacobian_mn = [[columns[j][i] for j in range(n)] for i in range(m)]

        ipvt, rdiag, acnorm = _qrfac(columns, m, n)

        if iteration == 1:
            if not mode2:
                diag = [c if c != 0.0 else 1.0 for c in acnorm]
            xnorm = enorm([diag[j] * x[j] for j in range(n)])
            delta = factor * xnorm if xnorm != 0.0 else factor

        wa4 = list(fvec)
        qtf = [0.0] * n
        for j in range(n):
            if columns[j][j] != 0.0:
                total = sum(columns[j][i] * wa4[i] for i in range(j, m))
                temp = -total / columns[j][j]
                for i in range(j, m):
                    wa4[i] += columns[j][i] * temp
            columns[j][j] = rdiag[j]
            qtf[j] = wa4[j]

        r_mat = [
            [
                columns[j][i] if i < j else (rdiag[j] if i == j else 0.0)
                for j in range(n)
            ]
            for i in range(n)
        ]

        gnorm = 0.0
        if fnorm != 0.0:
            for j in range(n):
                pivoted = ipvt[j]
                if acnorm[pivoted] != 0.0:
                    total = sum(r_mat[i][j] * (qtf[i] / fnorm) for i in range(j + 1))
                    gnorm = max(gnorm, abs(total / acnorm[pivoted]))

        if gnorm <= gtol:
            final_info = 4
            break

        if not mode2:
            diag = [max(diag[j], acnorm[j]) for j in range(n)]

        while True:
            xdir, par = _lmpar(r_mat, ipvt, diag, qtf, delta, par, n)
            wa1 = [-v for v in xdir]
            wa2 = [x[j] + wa1[j] for j in range(n)]
            pnorm = enorm([diag[j] * wa1[j] for j in range(n)])

            if iteration == 1:
                delta = min(delta, pnorm)

            fvec_trial = func(wa2)
            nfev += 1
            fnorm1 = enorm(fvec_trial)

            actred = -1.0
            if 0.1 * fnorm1 < fnorm:
                actred = 1.0 - (fnorm1 / fnorm) ** 2

            wa3 = [0.0] * n
            for j in range(n):
                temp = wa1[ipvt[j]]
                for i in range(j + 1):
                    wa3[i] += r_mat[i][j] * temp
            temp1 = enorm(wa3) / fnorm
            temp2 = (math.sqrt(par) * pnorm) / fnorm
            prered = temp1 * temp1 + temp2 * temp2 / 0.5
            dirder = -(temp1 * temp1 + temp2 * temp2)

            ratio = 0.0
            if prered != 0.0:
                ratio = actred / prered

            if ratio <= 0.25:
                if actred >= 0.0:
                    temp = 0.5
                else:
                    temp = 0.5 * dirder / (dirder + 0.5 * actred)
                if 0.1 * fnorm1 >= fnorm or temp < 0.1:
                    temp = 0.1
                delta = temp * min(delta, pnorm / 0.1)
                par = par / temp
            elif par == 0.0 or ratio >= 0.75:
                delta = pnorm / 0.5
                par = 0.5 * par

            if ratio >= 0.0001:
                x = wa2
                fvec = fvec_trial
                xnorm = enorm([diag[j] * x[j] for j in range(n)])
                fnorm = fnorm1
                iteration += 1

            info = 0
            if abs(actred) <= ftol and prered <= ftol and 0.5 * ratio <= 1.0:
                info = 1
            if delta <= xtol * xnorm:
                info = 2
            if (
                abs(actred) <= ftol
                and prered <= ftol
                and 0.5 * ratio <= 1.0
                and info == 2
            ):
                info = 3
            if info == 0:
                if nfev >= maxfev:
                    info = 5
                if (
                    abs(actred) <= _EPSILON
                    and prered <= _EPSILON
                    and 0.5 * ratio <= 1.0
                ):
                    info = 6
                if delta <= _EPSILON * xnorm:
                    info = 7
                if gnorm <= _EPSILON:
                    info = 8

            if info != 0:
                final_info = info
                break
            if ratio >= 0.0001:
                break

        if final_info != 0:
            break

    return x, fvec, jacobian_mn, final_info, nfev, iteration


def leastsq(
    residuals: Callable[[Sequence[float]], Sequence[float]],
    x0: Sequence[float],
    *,
    ftol: float = 1.49012e-08,
    xtol: float = 1.49012e-08,
    gtol: float = 0.0,
    maxfev: int | None = None,
    epsfcn: float | None = None,
    factor: float = 100.0,
    diag: Sequence[float] | None = None,
) -> LeastSquaresResult:
    """Minimize `sum(r**2 for r in residuals(x))` over `x`, MINPACK `lmdif`.

    `residuals(x)` must return `m` numbers for a length-`n` `x`; `m >= n`
    is required (MINPACK cannot solve an underdetermined system) and
    violating it raises `ValueError` naming both counts. `x0` must be
    all-finite (raises `ValueError` otherwise). Keyword-only tolerances
    default to scipy's `leastsq` defaults: `ftol = xtol = 1.49012e-08`,
    `gtol = 0.0`, `factor = 100.0`. `maxfev` defaults to `200 * (n + 1)`,
    MINPACK `lmdif1`'s rule (scipy's own default for `Dfun is None`).
    `epsfcn` defaults to machine epsilon, matching scipy's
    `finfo(dtype).eps`. `diag`, when given, must have `n` positive entries
    and fixes the per-variable scaling (MINPACK's `mode = 2`); by default
    (`mode = 1`) the scaling is re-derived from the Jacobian's own column
    norms every outer iteration.

    An exactly-zero residual vector at `x0` terminates immediately with
    `info = 4` (the scaled gradient norm is forced to `0`, always `<=
    gtol` since `gtol >= 0` — no Jacobian is needed to certify a perfect
    fit). A rank-deficient or singular Jacobian does not raise; LM damping
    and `_lmpar`'s own least-squares fallback handle it, never a
    pseudo-inverse. `residuals` returning `nan` propagates `nan` through
    `x`/`cost`/`flag` rather than raising, past `enorm`'s `nan` guard.
    """
    x0_list = [float(v) for v in x0]
    n = len(x0_list)
    if any(not math.isfinite(v) for v in x0_list):
        raise ValueError(f"x0 must be finite, got {x0_list!r}")

    def func(x: list[float]) -> list[float]:
        return [float(v) for v in residuals(x)]

    fvec0 = func(x0_list)
    m = len(fvec0)
    if m < n:
        raise ValueError(
            "leastsq requires at least as many residuals as parameters "
            f"(MINPACK's m >= n): got m={m} residuals for n={n} parameters"
        )

    resolved_maxfev = 200 * (n + 1) if maxfev is None else maxfev
    resolved_epsfcn = _EPSILON if epsfcn is None else epsfcn
    diag_list = [float(v) for v in diag] if diag is not None else None
    if diag_list is not None and (
        len(diag_list) != n or any(v <= 0.0 for v in diag_list)
    ):
        raise ValueError("diag must have length n and all-positive entries")
    if (
        n <= 0
        or resolved_maxfev <= 0
        or factor <= 0.0
        or ftol < 0.0
        or xtol < 0.0
        or gtol < 0.0
    ):
        raise ValueError(
            "ftol, xtol, gtol must be nonnegative and maxfev, factor "
            "positive, with n >= 1"
        )

    x, fvec, jacobian, info, nfev, iterations = _lmdif(
        func,
        x0_list,
        fvec0,
        m,
        n,
        ftol,
        xtol,
        gtol,
        resolved_maxfev,
        resolved_epsfcn,
        factor,
        diag_list,
    )

    cost = 0.5 * sum(v * v for v in fvec)
    return LeastSquaresResult(
        x=x,
        cost=cost,
        residuals=fvec,
        jacobian=jacobian,
        iterations=iterations,
        function_calls=nfev,
        converged=info in (1, 2, 3, 4),
        flag=_INFO_MESSAGES.get(info, "unknown info code"),
        info=info,
    )
