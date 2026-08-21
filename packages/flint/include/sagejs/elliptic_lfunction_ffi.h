#ifndef SAGEJS_ELLIPTIC_LFUNCTION_FFI_H
#define SAGEJS_ELLIPTIC_LFUNCTION_FFI_H

#include <flint/acb.h>
#include <flint/arb.h>
#include <flint/fmpz.h>
#include <flint/mag.h>
#include <stdint.h>

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
    slong coefficient_terms;
    slong target_bits;
    slong work_precision;
    slong point_count;
    double grid_step;
    double max_abs_imaginary;
    double max_abs_real_offset;
    int known_error_target_met;
    /* This initial Molin kernel has a proved coefficient-tail estimate but
       does not yet attach a proof bound to trapezoid discretization. */
    int rigorous_enclosure;
} sagejs_ec_lfunction_diagnostics;

/*
 * Select the working precision for a batch of complex L-values.
 *
 * `points` must already have been parsed at `planning_precision`.  The
 * returned precision includes the target, reciprocal-gamma conversion,
 * summation, and real-direction growth guards used by the canonical Acb
 * evaluator.  Keeping this policy in the host-neutral core prevents browser
 * adapters from replacing it with a large fixed guard that can make
 * low-precision plots hundreds of bits more expensive than the native path.
 */
int sagejs_ec_lseries_work_precision(
    slong *work_precision,
    const fmpz_t conductor,
    acb_srcptr points,
    slong point_count,
    slong target_bits,
    slong planning_precision);

/*
 * Evaluate consecutive central derivatives of the completed L-function.
 *
 * `coefficients` stores a_1 through a_K (there is no a_0 entry).  `output`
 * receives actual derivatives Lambda^(first_order+j)(1), not Taylor
 * coefficients.  Functional-equation-forbidden derivatives are exact zero.
 * `coefficient_tail_bound` receives a uniform upper bound for the omitted
 * n>K coefficient tail over the requested derivative range.
 * `grid_omission_bound` bounds the deliberate n>K_j omission at the finite
 * grid nodes, using |a_n|<=n.  Neither includes the Molin/trapezoid
 * discretization error; callers must retain the `rigorous_enclosure`
 * diagnostic instead of presenting these balls as a proof of vanishing.
 *
 * The numerical grid is Pascal Molin's elliptic-curve specialization as used
 * by PARI 2.17.4 `ellanalyticrank` (`src/basemath/ellanal.c`, `param_points`,
 * `vecF`, and `glambda`), evaluated here with FLINT/Arb arithmetic and a
 * host-independent contiguous exact-coefficient boundary.
 */
int sagejs_ec_completed_lseries_jet(
    arb_ptr output,
    arb_t coefficient_tail_bound,
    arb_t grid_omission_bound,
    sagejs_ec_lfunction_diagnostics *diagnostics,
    const fmpz *coefficients,
    slong cutoff,
    const fmpz_t conductor,
    int root_number,
    slong first_order,
    slong derivative_count,
    slong target_bits,
    slong work_precision);

/*
 * Evaluate canonical completed and raw elliptic-curve L-values at a batch of
 * complex points.  The normalization is
 *
 *   Lambda(E,s) = (sqrt(N)/(2*pi))^s Gamma(s) L(E,s),
 *   Lambda(E,s) = w Lambda(E,2-s).
 *
 * `coefficients` stores a_1 through a_K (there is no a_0 entry).  Each output
 * and diagnostic array has `point_count` entries.  Raw values are formed with
 * Acb's reciprocal gamma operation, including at trivial zeros.  The reported
 * tail bounds are multiplied by max(1, |a^s/Gamma(s)|), so each is a uniform
 * bound valid for both the completed and raw result.
 *
 * The Acb balls enclose arithmetic on the selected finite grid.  The `mag`
 * arrays separately bound coefficient truncation, deliberate local-grid
 * coefficient omissions, and the continuous tail beyond the grid.  They do
 * not include a proved
 * trapezoidal discretization error, so `rigorous_enclosure` is always false.
 */
int sagejs_ec_lseries_values_acb(
    acb_ptr completed,
    acb_ptr raw,
    mag_ptr coefficient_tail_bounds,
    mag_ptr grid_omission_bounds,
    mag_ptr outer_tail_bounds,
    mag_ptr raw_conversion_magnitudes,
    sagejs_ec_lfunction_diagnostics *diagnostics,
    const int32_t *coefficients,
    slong available_cutoff,
    const fmpz_t conductor,
    int root_number,
    acb_srcptr points,
    slong point_count,
    slong target_bits,
    slong work_precision);

/* One nested refinement: the target+refinement fine grid is evaluated once,
   and every even node forms a coarse sum with step 2h. Fine outputs and
   diagnostics obey `target_bits + refinement_bits`; coarse outputs are the
   non-rigorous stability witness. */
int sagejs_ec_lseries_values_refined_acb(
    acb_ptr coarse_completed,
    acb_ptr coarse_raw,
    acb_ptr fine_completed,
    acb_ptr fine_raw,
    mag_ptr coefficient_tail_bounds,
    mag_ptr grid_omission_bounds,
    mag_ptr outer_tail_bounds,
    mag_ptr raw_conversion_magnitudes,
    sagejs_ec_lfunction_diagnostics *diagnostics,
    const int32_t *coefficients,
    slong available_cutoff,
    const fmpz_t conductor,
    int root_number,
    acb_srcptr points,
    slong point_count,
    slong target_bits,
    slong refinement_bits,
    slong work_precision);

/*
 * Evaluate finite direct Dirichlet prefixes
 *
 *   L_K(E,s) = sum_{n=1}^K a_n n^(-s)
 *
 * for a batch of points.  `cutoffs[index]` selects the checked prefix used
 * for that point, while `available_cutoff` describes the shared coefficient
 * storage.  Tail planning and route selection intentionally remain in the
 * ordinary Python layer; this primitive accelerates only the measured Acb
 * finite-sum/compiler limitation.  `completed` uses the same canonical
 * normalization as `sagejs_ec_lseries_values_acb`.
 */
int sagejs_ec_lseries_direct_values_acb(
    acb_ptr completed,
    acb_ptr raw,
    sagejs_ec_lfunction_diagnostics *diagnostics,
    const int32_t *coefficients,
    slong available_cutoff,
    const fmpz_t conductor,
    acb_srcptr points,
    const slong *cutoffs,
    slong point_count,
    slong target_bits,
    slong work_precision);

#ifdef __cplusplus
}
#endif

#endif
