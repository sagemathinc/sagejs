# ODE backend survey and production decision

Survey date: 2026-08-31. The lane evaluated mature algorithms before choosing
its production surface. The decision is per method and does not imply that a
library rejected for this first slice is unsuitable in general.

## SciPy `solve_ivp`

SciPy 1.18 documents RK45 as the Dormand–Prince 5(4) embedded pair with local
extrapolation and a quartic interpolation polynomial. Its `solve_ivp` event
contract locates roots of event functions on dense output. It also exposes
Radau, BDF, and LSODA for stiff work.

Primary sources:

- [SciPy RK45 documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.RK45.html)
- [SciPy `solve_ivp` documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html)
- [SciPy IVP event implementation](https://github.com/scipy/scipy/blob/main/scipy/integrate/_ivp/ivp.py)
- [SciPy BSD license](https://scipy.org/scipylib/license.html)

Decision: use SciPy as the differential oracle, including its Radau stiff path,
but do not ship SciPy/NumPy as a browser dependency. The Sage.js ordinary-Python
RK45 source uses the published Dormand–Prince tableau and Shampine extension;
the checked SciPy fixture compares endpoints, dense midpoints, and event
locations. SciPy timing is not presented as a same-runtime performance claim.

## SUNDIALS ARKODE and CVODE

ARKODE supplies adaptive one-step explicit, diagonally implicit, IMEX, and
multirate methods. Its mathematical documentation specifies weighted-RMS error
control, step bounds, stop times, interpolation, and rootfinding. CVODE supplies
Adams and BDF families. SUNDIALS is BSD-3-Clause licensed.

Primary sources:

- [ARKODE introduction](https://sundials.readthedocs.io/en/latest/arkode/Introduction_link.html)
- [ARKODE mathematical considerations](https://sundials.readthedocs.io/en/latest/arkode/Mathematics_link.html)
- [SUNDIALS source and package overview](https://github.com/LLNL/sundials)
- [SUNDIALS license](https://github.com/LLNL/sundials/blob/main/LICENSE)

Decision: retain SUNDIALS as the leading mature native candidate for sparse,
large-scale, DAE, or multistep work, but do not claim it in this lane. A production choice requires a real callback and
packed-state boundary, browser/Wasm build, Windows x64 build, cancellation and
rootfinding tests, allocation accounting, payload and cold-start measurements,
and differential agreement. None of those receipts exists yet, and this lane
does not own dependency or package-graph changes.

## Boost.Odeint

Boost.Odeint documents classical RK4, controlled Dormand–Prince 5, dense
output, Bulirsch–Stoer, and Rosenbrock 4. Its stiff Rosenbrock path uses
Boost.uBLAS state and Jacobian contracts. The library uses the Boost Software
License 1.0.

Primary sources:

- [Odeint stepper and controller overview](https://www.boost.org/doc/libs/latest/libs/numeric/odeint/doc/html/boost_numeric_odeint/odeint_in_detail/steppers.html)
- [Odeint Rosenbrock4 coefficient source](https://github.com/boostorg/odeint/blob/master/include/boost/numeric/odeint/stepper/rosenbrock4.hpp)
- [Kaps and Rentrop, *Generalized Runge–Kutta methods of order four with stepsize control for stiff ordinary differential equations*](https://doi.org/10.1007/BF01396495)
- [Odeint dense-output concept](https://www.boost.org/doc/libs/latest/libs/numeric/odeint/doc/html/boost_numeric_odeint/concepts/dense_output_stepper.html)
- [Boost Software License](https://www.boost.org/users/license.html)

Decision: translate the published Kaps–Rentrop Rosenbrock4 coefficient set into
ordinary Python, not a C++ dependency. The paper establishes a fourth-order
linearly implicit family with embedded third-order step control, and the Boost
source provides an independently inspectable coefficient and stage reference.
The translation's fixed-step convergence ratio is checked directly. It reuses
one partial-pivoting LU factorization per attempted step and independently
checks every normalized linear residual.

The first prototype also translated Boost's Rosenbrock dense extension. It was
rejected because its raw derivative defect did not pass the lane's quantitative
stiff-transition gate on the adversarial Van der Pol case. The shipped path
uses endpoint-derivative cubic Hermite output, controls its midpoint defect
online, and independently validates a checked `(I-hJ)` defect correction. This
is lower-order dense output than the solution step and is declared as such.

## Algorithm decision

The selected implementation order follows `ARCHITECTURE.md`:

1. classical fixed-step RK4 as a readable comparison baseline;
2. ordinary-Python Dormand–Prince 5(4) as the production nonstiff path;
3. ordinary-Python Kaps–Rentrop Rosenbrock4 as the named dense-Jacobian stiff
   path;
4. SciPy 1.18 Radau/BDF plus analytic, invariant, and defect cases as
   independent oracles; and
5. no native code or new dependency.

The adaptive controller uses a component-scaled weighted RMS error norm,
acceptance at norm at most one, safety factor `0.9`, bounded growth/shrink, and
the estimator-order exponent. Accepted steps retain the same method's quartic
dense polynomial. Event location uses safeguarded bisection over that polynomial
and rechecks the event residual. Independent midpoint checks scale the dense
derivative defect by the accepted-step width and require it to remain within
`64` requested state-tolerance units. That factor accommodates the quartic
extension's defect constant while rejecting stage-aliasing cases by many orders
of magnitude; it is not presented as a global forward-error bound.

The stiff qualification is deliberately narrow. Rosenbrock4 is dense-Jacobian,
dense-LU, real-binary64, and linearly implicit; it has no Newton iteration,
sparse solve, mass matrix, or DAE contract. Supplied and forward-difference
Jacobians are covered. Robertson, HIRES, and `mu=1000` Van der Pol endpoints are
checked against both SciPy Radau and SciPy BDF, with conservation and
linearized-residual evidence where applicable. `radau`, `bdf`, `lsoda`,
`cvode`, and `sundials` remain unsupported method names.

`method="auto"` always means the nonstiff RK45 baseline. No independently
qualified stiffness classifier exists, so the planner does not infer one from
rejections or a few early Jacobians.
