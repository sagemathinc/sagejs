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

Decision: retain SUNDIALS as the leading mature stiff/native candidate, but do
not claim it in this lane. A production choice requires a real callback and
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
- [Odeint dense-output concept](https://www.boost.org/doc/libs/latest/libs/numeric/odeint/doc/html/boost_numeric_odeint/concepts/dense_output_stepper.html)
- [Boost Software License](https://www.boost.org/users/license.html)

Decision: do not add a C++ dependency for the explicit slice already expressed
clearly in ordinary Python. Reconsider Rosenbrock only through a measured stiff
prototype; its uBLAS/Jacobian boundary and browser payload must be compared
against SUNDIALS rather than inferred from the feature list.

## Algorithm decision

The selected implementation order follows `ARCHITECTURE.md`:

1. classical fixed-step RK4 as a readable comparison baseline;
2. ordinary-Python Dormand–Prince 5(4) as the production nonstiff path;
3. SciPy 1.18 and analytic/invariant cases as independent oracles; and
4. no native code or new dependency.

The adaptive controller uses a component-scaled weighted RMS error norm,
acceptance at norm at most one, safety factor `0.9`, bounded growth/shrink, and
the estimator-order exponent. Accepted steps retain the same method's quartic
dense polynomial. Event location uses safeguarded bisection over that polynomial
and rechecks the event residual.

Stiff support is deliberately absent. The support record names `radau`, `bdf`,
`lsoda`, `cvode`, and `sundials` as unsupported and points to mature external
alternatives. `method="auto"` always means the nonstiff RK45 baseline; it does
not inspect a few early steps and invent a stiffness guarantee.
