#ifndef SAGEJS_ELLIPTIC_LFUNCTION_FFI_H
#define SAGEJS_ELLIPTIC_LFUNCTION_FFI_H

#include <flint/arb.h>
#include <flint/fmpz.h>

#ifdef __cplusplus
extern "C" {
#endif

enum
{
    SAGEJS_EC_LFUNCTION_OK = 0,
    SAGEJS_EC_LFUNCTION_INSUFFICIENT_COEFFICIENTS = 1,
    SAGEJS_EC_LFUNCTION_INVALID_INPUT = 2,
    SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT = 3
};

typedef struct
{
    slong status;
    slong actual_cutoff;
    slong required_cutoff;
    slong grid_points;
    slong target_bits;
    slong work_precision;
    double grid_step;
    /* This initial Molin kernel has a proved coefficient-tail estimate but
       does not yet attach a proof bound to trapezoid discretization. */
    int rigorous_enclosure;
} sagejs_ec_lfunction_diagnostics;

/*
 * Evaluate consecutive central derivatives of the completed L-function.
 *
 * `coefficients` stores a_1 through a_K (there is no a_0 entry).  `output`
 * receives actual derivatives Lambda^(first_order+j)(1), not Taylor
 * coefficients.  Functional-equation-forbidden derivatives are exact zero.
 * `coefficient_tail_bound` receives a uniform upper bound for the omitted
 * n>K coefficient tail over the requested derivative range.  It does not
 * include the Molin/trapezoid discretization error; callers must retain the
 * `rigorous_enclosure` diagnostic instead of presenting these balls as a
 * proof of vanishing.
 *
 * The numerical grid is Pascal Molin's elliptic-curve specialization as used
 * by PARI 2.17.4 `ellanalyticrank` (`src/basemath/ellanal.c`, `param_points`,
 * `vecF`, and `glambda`), evaluated here with FLINT/Arb arithmetic and a
 * host-independent contiguous exact-coefficient boundary.
 */
int sagejs_ec_completed_lseries_jet(
    arb_ptr output,
    arb_t coefficient_tail_bound,
    sagejs_ec_lfunction_diagnostics *diagnostics,
    const fmpz *coefficients,
    slong cutoff,
    const fmpz_t conductor,
    int root_number,
    slong first_order,
    slong derivative_count,
    slong target_bits,
    slong work_precision);

#ifdef __cplusplus
}
#endif

#endif
