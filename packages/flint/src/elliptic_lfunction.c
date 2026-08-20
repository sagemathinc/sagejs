#include "elliptic_lfunction.h"

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

#include <flint/acb.h>
#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_vec.h>
#include <node_api.h>

#include "sagejs/elliptic_lfunction_ffi.h"

#define SAGEJS_PI 3.141592653589793238462643383279502884
#define SAGEJS_LN2 0.693147180559945309417232121458176568
#define SAGEJS_EC_LSERIES_MAX_POINTS 100000
#define SAGEJS_EC_LSERIES_MAX_OBJECT_POINTS 10000
#define SAGEJS_EC_LSERIES_MAX_CUTOFF 5000000
#define SAGEJS_EC_LSERIES_MAX_GRID_POINTS 20000
#define SAGEJS_EC_LSERIES_MAX_COEFFICIENT_TERMS 100000000
#define SAGEJS_EC_LSERIES_MAX_POINT_GRID_TERMS 10000000
#define SAGEJS_EC_LSERIES_MAX_HEIGHT 100.0
#define SAGEJS_EC_LSERIES_MAX_REAL_OFFSET 8.0

static void coefficient_tail_bound(
    arb_t result, const arb_t a, slong cutoff, slong order, slong precision)
{
    arb_t q, numerator, denominator, temporary;
    arb_init(q);
    arb_init(numerator);
    arb_init(denominator);
    arb_init(temporary);

    arb_neg(temporary, a);
    arb_exp(q, temporary, precision);
    arb_pow_ui(numerator, q, (ulong) cutoff + 1, precision);
    arb_mul_ui(numerator, numerator, 2, precision);
    for (slong k = 2; k <= order; ++k)
        arb_mul_ui(numerator, numerator, (ulong) k, precision);

    // For completed Lambda there is one more factor a^{-1} than for the
    // corresponding raw-L derivative tail.
    arb_set(denominator, a);
    if (order != 0)
    {
        arb_pow_ui(temporary, a, (ulong) order, precision);
        arb_mul(denominator, denominator, temporary, precision);
        arb_set_ui(temporary, (ulong) cutoff + 1);
        arb_pow_ui(temporary, temporary, (ulong) order, precision);
        arb_mul(denominator, denominator, temporary, precision);
    }
    arb_one(temporary);
    arb_sub(temporary, temporary, q, precision);
    arb_mul(denominator, denominator, temporary, precision);
    arb_div(result, numerator, denominator, precision);

    arb_clear(q);
    arb_clear(numerator);
    arb_clear(denominator);
    arb_clear(temporary);
}

/*
 * Bound y * sum_{n>cutoff} n*q^n.  The Hasse bound |a_n| <= n is
 * deliberately weaker than necessary but applies uniformly to every
 * elliptic-curve L-series coefficient used by this adapter.
 */
static void grid_omission_term_bound(
    arb_t result,
    const arb_t y,
    const arb_t q,
    slong cutoff,
    slong precision)
{
    arb_t numerator, denominator, temporary;
    arb_init(numerator);
    arb_init(denominator);
    arb_init(temporary);

    arb_pow_ui(numerator, q, (ulong) cutoff + 1, precision);
    arb_mul_ui(temporary, q, (ulong) cutoff, precision);
    arb_neg(temporary, temporary);
    arb_add_ui(temporary, temporary, (ulong) cutoff + 1, precision);
    arb_mul(numerator, numerator, temporary, precision);
    arb_mul(numerator, numerator, y, precision);

    arb_one(denominator);
    arb_sub(denominator, denominator, q, precision);
    arb_mul(denominator, denominator, denominator, precision);
    arb_div(result, numerator, denominator, precision);

    arb_clear(numerator);
    arb_clear(denominator);
    arb_clear(temporary);
}

/*
 * Build one value of the common real Mellin grid
 *
 *   F(u) = exp(u) sum a_n exp(-a*n*exp(u)).
 *
 * Both the central derivative jet and arbitrary complex values consume this
 * routine.  Keeping the exact coefficient indexing, local cutoff and Horner
 * loop here prevents the two entry points from drifting in normalization.
 */
typedef struct
{
    arb_t exponent;
    arb_t sum;
} mellin_grid_scratch;

static void mellin_grid_scratch_init(mellin_grid_scratch *scratch)
{
    arb_init(scratch->exponent);
    arb_init(scratch->sum);
}

static void mellin_grid_scratch_clear(mellin_grid_scratch *scratch)
{
    arb_clear(scratch->exponent);
    arb_clear(scratch->sum);
}

static slong mellin_grid_node(
    arb_t value,
    arb_t omission,
    arb_t jh,
    arb_t y,
    arb_t q,
    const arb_t a,
    const arb_t h,
    double h_double,
    double a_double,
    double real_width,
    slong grid,
    slong required_cutoff,
    slong cutoff,
    const fmpz *coefficients,
    const int32_t *packed_coefficients,
    mellin_grid_scratch *scratch,
    slong precision)
{
    const double u_double = (double) grid * h_double;
    slong local_cutoff = (slong) ceil(
        ((double) required_cutoff + real_width * u_double / a_double) *
        exp(-u_double));
    if (local_cutoff < 1) local_cutoff = 1;
    if (local_cutoff > cutoff) local_cutoff = cutoff;

    arb_mul_ui(jh, h, (ulong) grid, precision);
    arb_exp(y, jh, precision);
    arb_mul(scratch->exponent, a, y, precision);
    arb_neg(scratch->exponent, scratch->exponent);
    arb_exp(q, scratch->exponent, precision);
    arb_zero(scratch->sum);
    /*
     * Evaluate sum(a_n*q^n) by descending Horner accumulation.  The previous
     * loop maintained every successive q^n and then performed an addmul,
     * costing two full Arb operations per coefficient.  This is the same
     * polynomial with one multiplication and (for nonzero coefficients) one
     * cheap exact-integer addition per coefficient.
     */
    for (slong n = local_cutoff; n >= 1; --n)
    {
        arb_mul(scratch->sum, scratch->sum, q, precision);
        if (packed_coefficients != NULL)
        {
            const int32_t coefficient = packed_coefficients[n - 1];
            if (coefficient != 0)
                arb_add_si(
                    scratch->sum, scratch->sum, (slong) coefficient,
                    precision);
        }
        else if (!fmpz_is_zero(coefficients + n - 1))
            arb_add_fmpz(
                scratch->sum, scratch->sum, coefficients + n - 1,
                precision);
    }
    arb_mul(scratch->sum, scratch->sum, q, precision);
    arb_mul(value, y, scratch->sum, precision);

    if (local_cutoff < cutoff)
        grid_omission_term_bound(omission, y, q, local_cutoff, precision);
    else
        arb_zero(omission);

    return local_cutoff;
}

int sagejs_ec_completed_lseries_jet(
    arb_ptr output,
    arb_t coefficient_tail,
    arb_t grid_omission_bound,
    sagejs_ec_lfunction_diagnostics *diagnostics,
    const fmpz *coefficients,
    slong available_cutoff,
    const fmpz_t conductor,
    int root_number,
    slong first_order,
    slong derivative_count,
    slong target_bits,
    slong work_precision)
{
    if (output == NULL || diagnostics == NULL || coefficients == NULL ||
        available_cutoff < 1 || fmpz_sgn(conductor) <= 0 ||
        (root_number != 1 && root_number != -1) || first_order < 0 ||
        derivative_count < 1 || target_bits < 16 || work_precision < target_bits)
    {
        if (diagnostics != NULL)
            diagnostics->status = SAGEJS_EC_LFUNCTION_INVALID_INPUT;
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
    }

    const double conductor_double = fmpz_get_d(conductor);
    const double a_double = 2.0 * SAGEJS_PI / sqrt(conductor_double);
    const double D = (double) target_bits * SAGEJS_LN2 + 2.0;
    const double Y = 0.97;
    const double aY = a_double * cos(SAGEJS_PI * Y / 2.0);
    const double sqrt_aY = sqrt(aY);
    const double cla =
        (1.0 + 1.0 / sqrt_aY + 1.0 / (2.0 * aY)) /
        (2.0 * sqrt_aY);
    const double logM =
        2.0 * SAGEJS_LN2 + log(cla) + SAGEJS_LN2 - aY;
    const double h_double = SAGEJS_PI * SAGEJS_PI * Y / (D + logM);
    const double cutoff_double = D / a_double;
    const double grid_double = log(cutoff_double) / h_double;
    if (!isfinite(conductor_double) || !isfinite(a_double) || a_double <= 0.0 ||
        !isfinite(aY) || aY <= 0.0 || !isfinite(h_double) || h_double <= 0.0 ||
        !isfinite(cutoff_double) || cutoff_double > (double) WORD_MAX ||
        !isfinite(grid_double) || grid_double > (double) WORD_MAX)
    {
        diagnostics->status = SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
        diagnostics->actual_cutoff = 0;
        diagnostics->required_cutoff = 0;
        diagnostics->grid_points = 0;
        diagnostics->coefficient_terms = 0;
        diagnostics->target_bits = target_bits;
        diagnostics->work_precision = work_precision;
        diagnostics->point_count = 0;
        diagnostics->grid_step = 0.0;
        diagnostics->max_abs_imaginary = 0.0;
        diagnostics->max_abs_real_offset = 0.0;
        diagnostics->known_error_target_met = 0;
        diagnostics->rigorous_enclosure = 0;
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
    }
    slong required_cutoff = (slong) ceil(cutoff_double);
    if (required_cutoff < 1) required_cutoff = 1;
    const slong cutoff =
        available_cutoff < required_cutoff ? available_cutoff : required_cutoff;
    slong grid_points = (slong) ceil(grid_double);
    if (grid_points < 2) grid_points = 2;

    diagnostics->status = available_cutoff < required_cutoff
        ? SAGEJS_EC_LFUNCTION_INSUFFICIENT_COEFFICIENTS
        : SAGEJS_EC_LFUNCTION_OK;
    diagnostics->actual_cutoff = cutoff;
    diagnostics->required_cutoff = required_cutoff;
    diagnostics->grid_points = grid_points;
    diagnostics->coefficient_terms = 0;
    diagnostics->target_bits = target_bits;
    diagnostics->work_precision = work_precision;
    diagnostics->point_count = 0;
    diagnostics->grid_step = h_double;
    diagnostics->max_abs_imaginary = 0.0;
    diagnostics->max_abs_real_offset = 0.0;
    diagnostics->known_error_target_met = 0;
    diagnostics->rigorous_enclosure = 0;

    arb_t pi, conductor_arb, a, h, y, q, value;
    arb_t jh, factor, term, current_tail, omission;
    arb_init(pi);
    arb_init(conductor_arb);
    arb_init(a);
    arb_init(h);
    arb_init(y);
    arb_init(q);
    arb_init(value);
    arb_init(jh);
    arb_init(factor);
    arb_init(term);
    arb_init(current_tail);
    arb_init(omission);
    arb_ptr omissions = _arb_vec_init(derivative_count);
    mellin_grid_scratch grid_scratch;
    mellin_grid_scratch_init(&grid_scratch);

    arb_const_pi(pi, work_precision);
    arb_set_fmpz(conductor_arb, conductor);
    arb_sqrt(conductor_arb, conductor_arb, work_precision);
    arb_mul_ui(a, pi, 2, work_precision);
    arb_div(a, a, conductor_arb, work_precision);
    arb_set_d(h, h_double);

    for (slong index = 0; index < derivative_count; ++index)
    {
        arb_zero(output + index);
        arb_zero(omissions + index);
    }

    for (slong grid = 0; grid < grid_points; ++grid)
    {
        const slong local_cutoff = mellin_grid_node(
            value, omission, jh, y, q, a, h, h_double, a_double, 0.0, grid,
            required_cutoff, cutoff, coefficients, NULL, &grid_scratch,
            work_precision);
        if (diagnostics->coefficient_terms > WORD_MAX - local_cutoff)
            diagnostics->coefficient_terms = WORD_MAX;
        else
            diagnostics->coefficient_terms += local_cutoff;

        if (local_cutoff < cutoff)
        {
            for (slong index = 0; index < derivative_count; ++index)
            {
                const slong order = first_order + index;
                if (((order & 1) == 0) != (root_number == 1)) continue;
                if (order == 0)
                    arb_set(term, omission);
                else
                {
                    arb_pow_ui(factor, jh, (ulong) order, work_precision);
                    arb_mul(term, omission, factor, work_precision);
                }
                arb_mul_ui(term, term, 2, work_precision);
                arb_mul(term, term, h, work_precision);
                arb_add(
                    omissions + index, omissions + index, term,
                    work_precision);
            }
        }

        for (slong index = 0; index < derivative_count; ++index)
        {
            const slong order = first_order + index;
            if (((order & 1) == 0) != (root_number == 1)) continue;
            if (grid == 0)
            {
                if (order == 0)
                    arb_add(output + index, output + index, value, work_precision);
                continue;
            }
            if (order == 0)
                arb_set(term, value);
            else
            {
                arb_pow_ui(factor, jh, (ulong) order, work_precision);
                arb_mul(term, value, factor, work_precision);
            }
            arb_mul_ui(term, term, 2, work_precision);
            arb_add(output + index, output + index, term, work_precision);
        }
    }

    // The endpoint has half weight, while all positive grid points have the
    // factor two inserted above: h*(F(1) + 2 sum F(exp(jh))*(jh)^k).
    for (slong index = 0; index < derivative_count; ++index)
        arb_mul(output + index, output + index, h, work_precision);

    arb_zero(coefficient_tail);
    arb_zero(grid_omission_bound);
    for (slong index = 0; index < derivative_count; ++index)
    {
        const slong order = first_order + index;
        if (((order & 1) == 0) != (root_number == 1)) continue;
        coefficient_tail_bound(
            current_tail, a, cutoff, order, work_precision);
        arb_union(
            coefficient_tail, coefficient_tail, current_tail, work_precision);
        arb_union(
            grid_omission_bound, grid_omission_bound, omissions + index,
            work_precision);
    }

    arb_clear(pi);
    arb_clear(conductor_arb);
    arb_clear(a);
    arb_clear(h);
    arb_clear(y);
    arb_clear(q);
    arb_clear(value);
    arb_clear(jh);
    arb_clear(factor);
    arb_clear(term);
    arb_clear(current_tail);
    arb_clear(omission);
    mellin_grid_scratch_clear(&grid_scratch);
    _arb_vec_clear(omissions, derivative_count);
    return (int) diagnostics->status;
}

typedef struct
{
    slong required_cutoff;
    slong grid_points;
    slong coefficient_terms;
    slong work_precision;
    slong point_count;
    double grid_step;
    double max_abs_imaginary;
    double max_abs_real_offset;
} ec_lseries_plan;

static double arb_abs_upper_double(const arb_t value)
{
    arf_t upper;
    arf_init(upper);
    arb_get_abs_ubound_arf(upper, value, 64);
    const double result = arf_get_d(upper, ARF_RND_CEIL);
    arf_clear(upper);
    return result;
}

static int ec_lseries_domain(
    double *max_abs_imaginary,
    double *max_abs_real_offset,
    acb_srcptr points,
    slong point_count,
    slong precision)
{
    *max_abs_imaginary = 0.0;
    *max_abs_real_offset = 0.0;
    arb_t offset;
    arb_init(offset);
    for (slong index = 0; index < point_count; ++index)
    {
        if (!acb_is_finite(points + index))
        {
            arb_clear(offset);
            return 0;
        }
        const double imaginary =
            arb_abs_upper_double(acb_imagref(points + index));
        arb_sub_ui(offset, acb_realref(points + index), 1, precision);
        const double real_offset = arb_abs_upper_double(offset);
        if (!isfinite(imaginary) || !isfinite(real_offset))
        {
            arb_clear(offset);
            return 0;
        }
        if (imaginary > *max_abs_imaginary)
            *max_abs_imaginary = imaginary;
        if (real_offset > *max_abs_real_offset)
            *max_abs_real_offset = real_offset;
    }
    arb_clear(offset);
    return 1;
}

/* Upper bound, in bits, for multiplication by a^s/Gamma(s). */
static double raw_conversion_guard_bits(
    const arb_t a,
    acb_srcptr points,
    slong point_count,
    slong precision)
{
    acb_t base, factor, gamma_reciprocal;
    mag_t magnitude;
    acb_init(base);
    acb_init(factor);
    acb_init(gamma_reciprocal);
    mag_init(magnitude);
    acb_set_arb(base, a);
    double result = 0.0;
    for (slong index = 0; index < point_count; ++index)
    {
        acb_pow(factor, base, points + index, precision);
        acb_rgamma(gamma_reciprocal, points + index, precision);
        acb_mul(factor, factor, gamma_reciprocal, precision);
        acb_get_mag(magnitude, factor);
        const double bits = mag_get_d_log2_approx(magnitude);
        if (isfinite(bits) && bits > result) result = bits;
    }
    mag_clear(magnitude);
    acb_clear(gamma_reciprocal);
    acb_clear(factor);
    acb_clear(base);
    return result > 0.0 ? result : 0.0;
}

int sagejs_ec_lseries_work_precision(
    slong *work_precision,
    const fmpz_t conductor,
    acb_srcptr points,
    slong point_count,
    slong target_bits,
    slong planning_precision)
{
    if (work_precision == NULL || points == NULL || point_count < 1 ||
        point_count > SAGEJS_EC_LSERIES_MAX_POINTS ||
        fmpz_sgn(conductor) <= 0 || target_bits < 16 || target_bits > 8192 ||
        planning_precision < target_bits || planning_precision > 8192)
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;

    double max_abs_imaginary, max_abs_real_offset;
    if (!ec_lseries_domain(
            &max_abs_imaginary, &max_abs_real_offset, points, point_count,
            planning_precision))
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
    if (max_abs_imaginary > SAGEJS_EC_LSERIES_MAX_HEIGHT ||
        max_abs_real_offset > SAGEJS_EC_LSERIES_MAX_REAL_OFFSET)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;

    const double conductor_double = fmpz_get_d(conductor);
    const double a_double = 2.0 * SAGEJS_PI / sqrt(conductor_double);
    if (!isfinite(conductor_double) || !isfinite(a_double) || a_double <= 0.0)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;

    arb_t pi, conductor_arb, a;
    arb_init(pi);
    arb_init(conductor_arb);
    arb_init(a);
    arb_const_pi(pi, planning_precision);
    arb_set_fmpz(conductor_arb, conductor);
    arb_sqrt(conductor_arb, conductor_arb, planning_precision);
    arb_mul_ui(a, pi, 2, planning_precision);
    arb_div(a, a, conductor_arb, planning_precision);

    const double conversion_bits = raw_conversion_guard_bits(
        a, points, point_count, planning_precision);
    const double summation_bits =
        2.0 * fmax(0.0, -log(a_double) / SAGEJS_LN2);
    const double preliminary_D =
        (double) target_bits * SAGEJS_LN2 +
        SAGEJS_PI * max_abs_imaginary / 2.0 + 64.0;
    const double preliminary_U =
        fmax(0.0, log(preliminary_D / a_double));
    const double real_growth_bits =
        max_abs_real_offset * preliminary_U / SAGEJS_LN2;
    const double requested =
        (double) target_bits + conversion_bits + summation_bits +
        real_growth_bits + 48.0;

    arb_clear(a);
    arb_clear(conductor_arb);
    arb_clear(pi);

    if (!isfinite(requested) || requested > 8192.0)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
    const slong selected = (slong) ceil(requested);
    if (selected < target_bits || selected > 8192)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
    *work_precision = selected;
    return SAGEJS_EC_LFUNCTION_OK;
}

/*
 * Generalization of PARI 2.17 `param_points` to a bounded complex domain.
 * The height terms are Molin's degree-two terms.  The cutoff is enlarged
 * until the explicit |a_n| <= n coefficient-tail bound supports the raw
 * target after multiplication by a^s/Gamma(s).  Real width also enlarges the
 * finite-u extent.  Trapezoid discretization remains deliberately unproved.
 */
static int make_ec_lseries_plan(
    ec_lseries_plan *plan,
    const arb_t a,
    double a_double,
    acb_srcptr points,
    slong point_count,
    slong target_bits,
    slong requested_work_precision)
{
    double tmax, real_width;
    if (!ec_lseries_domain(
            &tmax, &real_width, points, point_count,
            requested_work_precision))
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
    if (point_count < 1 || point_count > SAGEJS_EC_LSERIES_MAX_POINTS ||
        tmax > SAGEJS_EC_LSERIES_MAX_HEIGHT ||
        real_width > SAGEJS_EC_LSERIES_MAX_REAL_OFFSET)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;

    const double conversion_bits = raw_conversion_guard_bits(
        a, points, point_count, requested_work_precision);
    const double goal =
        ((double) target_bits + conversion_bits + 24.0) * SAGEJS_LN2;
    const double Y = 0.97;
    const double aY = a_double * cos(SAGEJS_PI * Y / 2.0);
    if (!isfinite(aY) || aY <= 0.0)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
    const double sqrt_aY = sqrt(aY);
    const double cla =
        (1.0 + 1.0 / sqrt_aY + 1.0 / (2.0 * aY)) /
        (2.0 * sqrt_aY);
    const double logM =
        3.0 * SAGEJS_LN2 + log(cla) - aY +
        tmax * Y * SAGEJS_PI + real_width * Y * SAGEJS_PI / 2.0;

    double D = goal + SAGEJS_PI * tmax / 2.0 + 2.0;
    const double q = exp(-a_double);
    for (int iteration = 0; iteration < 12; ++iteration)
    {
        const double cutoff_estimate = D / a_double;
        const double c = a_double - real_width / (cutoff_estimate + 1.0);
        if (!isfinite(cutoff_estimate) || c <= 0.0)
        {
            D *= 2.0;
            continue;
        }
        const double X = fmax(0.0, log(cutoff_estimate));
        const double coefficient_requirement =
            goal + SAGEJS_LN2 - log1p(-q) - log(c);
        const double outer_c = a_double * (1.0 - real_width / D);
        if (outer_c <= 0.0)
        {
            D *= 2.0;
            continue;
        }
        const double outer_requirement =
            goal + SAGEJS_LN2 + real_width * X -
            log1p(-exp(-D)) - log(outer_c);
        const double molin_requirement =
            goal + SAGEJS_PI * tmax / 2.0 + 2.0;
        const double next = fmax(
            coefficient_requirement,
            fmax(outer_requirement, molin_requirement));
        if (next <= D + 0.25) break;
        D = next;
    }

    const double cutoff_double = D / a_double;
    const double denominator = D + logM;
    const double h_double = SAGEJS_PI * SAGEJS_PI * Y / denominator;
    const double X = fmax(0.0, log(cutoff_double));
    const double grid_double = X / h_double;
    if (!isfinite(D) || !isfinite(cutoff_double) || cutoff_double < 1.0 ||
        cutoff_double > (double) SAGEJS_EC_LSERIES_MAX_CUTOFF ||
        !isfinite(h_double) || h_double <= 0.0 ||
        !isfinite(grid_double) ||
        grid_double > (double) SAGEJS_EC_LSERIES_MAX_GRID_POINTS)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;

    slong required_cutoff = (slong) ceil(cutoff_double);
    slong grid_points = (slong) ceil(grid_double) + 1;
    if (required_cutoff < 1) required_cutoff = 1;
    if (grid_points < 2) grid_points = 2;
    slong coefficient_terms = 0;
    for (slong grid = 0; grid < grid_points; ++grid)
    {
        const double u = (double) grid * h_double;
        double local = ceil(
            ((double) required_cutoff + real_width * u / a_double) *
            exp(-u));
        if (local < 1.0) local = 1.0;
        if (coefficient_terms >
            SAGEJS_EC_LSERIES_MAX_COEFFICIENT_TERMS - (slong) local)
            return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
        coefficient_terms += (slong) local;
    }
    if (grid_points >
        SAGEJS_EC_LSERIES_MAX_POINT_GRID_TERMS / point_count)
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;

    const double summation_bits =
        2.0 * fmax(0.0, -log(a_double) / SAGEJS_LN2);
    const double real_growth_bits = real_width * X / SAGEJS_LN2;
    const slong minimum_work_precision =
        target_bits +
        (slong) ceil(conversion_bits + summation_bits + real_growth_bits) + 32;
    if (requested_work_precision < minimum_work_precision)
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
    plan->required_cutoff = required_cutoff;
    plan->grid_points = grid_points;
    plan->coefficient_terms = coefficient_terms;
    plan->work_precision = requested_work_precision;
    plan->point_count = point_count;
    plan->grid_step = h_double;
    plan->max_abs_imaginary = tmax;
    plan->max_abs_real_offset = real_width;
    return SAGEJS_EC_LFUNCTION_OK;
}

static void completed_coefficient_tail_bound(
    mag_t result,
    const arb_t a,
    slong cutoff,
    const acb_t point,
    const mag_t raw_conversion_magnitude,
    slong precision)
{
    arb_t real_offset, c, q, numerator, denominator, bound, temporary;
    arb_init(real_offset);
    arb_init(c);
    arb_init(q);
    arb_init(numerator);
    arb_init(denominator);
    arb_init(bound);
    arb_init(temporary);

    arb_sub_ui(real_offset, acb_realref(point), 1, precision);
    arb_abs(real_offset, real_offset);
    arb_set_ui(temporary, (ulong) cutoff + 1);
    arb_div(real_offset, real_offset, temporary, precision);
    arb_sub(c, a, real_offset, precision);
    if (!arb_is_positive(c))
    {
        mag_inf(result);
        goto cleanup;
    }
    arb_neg(temporary, a);
    arb_exp(q, temporary, precision);
    arb_pow_ui(numerator, q, (ulong) cutoff + 1, precision);
    arb_mul_ui(numerator, numerator, 2, precision);
    arb_one(denominator);
    arb_sub(denominator, denominator, q, precision);
    arb_mul(denominator, denominator, c, precision);
    arb_div(bound, numerator, denominator, precision);
    arb_get_mag(result, bound);
    if (mag_cmp_2exp_si(raw_conversion_magnitude, 0) > 0)
        mag_mul(result, result, raw_conversion_magnitude);

cleanup:
    arb_clear(real_offset);
    arb_clear(c);
    arb_clear(q);
    arb_clear(numerator);
    arb_clear(denominator);
    arb_clear(bound);
    arb_clear(temporary);
}

/* Bound the continuous integral beyond the last included u-grid node. */
static void completed_outer_tail_bound(
    mag_t result,
    const arb_t a,
    const arb_t last_u,
    const arb_t last_y,
    const acb_t point,
    const mag_t raw_conversion_magnitude,
    slong precision)
{
    arb_t real_offset, ay, exponential, numerator, denominator, c, temporary;
    arb_init(real_offset);
    arb_init(ay);
    arb_init(exponential);
    arb_init(numerator);
    arb_init(denominator);
    arb_init(c);
    arb_init(temporary);

    arb_sub_ui(real_offset, acb_realref(point), 1, precision);
    arb_abs(real_offset, real_offset);
    arb_mul(ay, a, last_y, precision);
    arb_neg(temporary, ay);
    arb_exp(exponential, temporary, precision);
    arb_mul(temporary, real_offset, last_u, precision);
    arb_exp(numerator, temporary, precision);
    arb_mul(numerator, numerator, exponential, precision);
    arb_mul_ui(numerator, numerator, 2, precision);

    arb_div(temporary, real_offset, last_y, precision);
    arb_sub(c, a, temporary, precision);
    if (!arb_is_positive(c))
    {
        mag_inf(result);
        goto cleanup;
    }
    arb_one(denominator);
    arb_sub(denominator, denominator, exponential, precision);
    arb_mul(denominator, denominator, c, precision);
    arb_div(temporary, numerator, denominator, precision);
    arb_get_mag(result, temporary);
    if (mag_cmp_2exp_si(raw_conversion_magnitude, 0) > 0)
        mag_mul(result, result, raw_conversion_magnitude);

cleanup:
    arb_clear(real_offset);
    arb_clear(ay);
    arb_clear(exponential);
    arb_clear(numerator);
    arb_clear(denominator);
    arb_clear(c);
    arb_clear(temporary);
}

static int ec_lseries_values_acb_internal(
    acb_ptr coarse_completed,
    acb_ptr coarse_raw,
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
    slong refinement_bits,
    slong work_precision)
{
    if (completed == NULL || raw == NULL || coefficient_tail_bounds == NULL ||
        grid_omission_bounds == NULL || outer_tail_bounds == NULL ||
        raw_conversion_magnitudes == NULL || diagnostics == NULL ||
        coefficients == NULL || points == NULL || available_cutoff < 1 ||
        point_count < 1 || fmpz_sgn(conductor) <= 0 ||
        (root_number != 1 && root_number != -1) || target_bits < 16 ||
        refinement_bits < 0 || refinement_bits > 256 ||
        work_precision < target_bits + refinement_bits ||
        ((coarse_completed == NULL) != (coarse_raw == NULL)))
    {
        if (diagnostics != NULL)
            diagnostics->status = SAGEJS_EC_LFUNCTION_INVALID_INPUT;
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
    }

    const double conductor_double = fmpz_get_d(conductor);
    const double a_double = 2.0 * SAGEJS_PI / sqrt(conductor_double);
    if (!isfinite(conductor_double) || !isfinite(a_double) || a_double <= 0.0)
    {
        diagnostics->status = SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
        return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
    }

    arb_t pi, conductor_arb, a, h, value, omission, jh, y, q;
    arb_init(pi);
    arb_init(conductor_arb);
    arb_init(a);
    arb_init(h);
    arb_init(value);
    arb_init(omission);
    arb_init(jh);
    arb_init(y);
    arb_init(q);
    arb_const_pi(pi, work_precision);
    arb_set_fmpz(conductor_arb, conductor);
    arb_sqrt(conductor_arb, conductor_arb, work_precision);
    arb_mul_ui(a, pi, 2, work_precision);
    arb_div(a, a, conductor_arb, work_precision);

    ec_lseries_plan plan;
    const slong fine_target_bits = target_bits + refinement_bits;
    const int plan_status = make_ec_lseries_plan(
        &plan, a, a_double, points, point_count, fine_target_bits,
        work_precision);
    if (plan_status != SAGEJS_EC_LFUNCTION_OK)
    {
        diagnostics->status = plan_status;
        goto cleanup_scalars;
    }
    if (coarse_completed != NULL)
    {
        /*
         * Use the already planned fine grid exactly once.  Every even fine
         * node forms a second trapezoid sum with step 2h.  The stronger fine
         * cutoff and outer extent are shared by both sums; the coarse value is
         * only a stability witness, so it need not duplicate an independent
         * target-bit planner's step.
         */
        if ((plan.grid_points & 1) == 0)
        {
            if (plan.grid_points >= SAGEJS_EC_LSERIES_MAX_GRID_POINTS)
            {
                diagnostics->status = SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
                goto cleanup_scalars;
            }
            plan.grid_points += 1;
        }
        plan.coefficient_terms = 0;
        for (slong grid = 0; grid < plan.grid_points; ++grid)
        {
            const double u = (double) grid * plan.grid_step;
            double local = ceil(
                ((double) plan.required_cutoff +
                    plan.max_abs_real_offset * u / a_double) * exp(-u));
            if (local < 1.0) local = 1.0;
            if (plan.coefficient_terms >
                SAGEJS_EC_LSERIES_MAX_COEFFICIENT_TERMS - (slong) local)
            {
                diagnostics->status = SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
                goto cleanup_scalars;
            }
            plan.coefficient_terms += (slong) local;
        }
        if (plan.grid_points >
            SAGEJS_EC_LSERIES_MAX_POINT_GRID_TERMS / point_count)
        {
            diagnostics->status = SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
            goto cleanup_scalars;
        }
    }
    const slong cutoff = available_cutoff < plan.required_cutoff
        ? available_cutoff : plan.required_cutoff;
    diagnostics->status = available_cutoff < plan.required_cutoff
        ? SAGEJS_EC_LFUNCTION_INSUFFICIENT_COEFFICIENTS
        : SAGEJS_EC_LFUNCTION_OK;
    diagnostics->actual_cutoff = cutoff;
    diagnostics->required_cutoff = plan.required_cutoff;
    diagnostics->grid_points = plan.grid_points;
    diagnostics->coefficient_terms = plan.coefficient_terms;
    diagnostics->target_bits = fine_target_bits;
    diagnostics->work_precision = work_precision;
    diagnostics->point_count = point_count;
    diagnostics->grid_step = plan.grid_step;
    diagnostics->max_abs_imaginary = plan.max_abs_imaginary;
    diagnostics->max_abs_real_offset = plan.max_abs_real_offset;
    diagnostics->known_error_target_met = 1;
    diagnostics->rigorous_enclosure = 0;
    if (diagnostics->status == SAGEJS_EC_LFUNCTION_INSUFFICIENT_COEFFICIENTS)
    {
        diagnostics->known_error_target_met = 0;
        goto cleanup_scalars;
    }
    arb_set_d(h, plan.grid_step);

    acb_ptr z = _acb_vec_init(point_count);
    acb_ptr forward = _acb_vec_init(point_count);
    acb_ptr backward = _acb_vec_init(point_count);
    acb_ptr forward_step = _acb_vec_init(point_count);
    acb_ptr backward_step = _acb_vec_init(point_count);
    acb_ptr weight = _acb_vec_init(point_count);
    acb_ptr term = _acb_vec_init(point_count);
    acb_ptr raw_factor = _acb_vec_init(point_count);
    acb_t base, gamma_reciprocal;
    acb_init(base);
    acb_init(gamma_reciprocal);
    acb_set_arb(base, a);
    mag_t omission_magnitude, weight_magnitude, h_magnitude;
    mag_init(omission_magnitude);
    mag_init(weight_magnitude);
    mag_init(h_magnitude);
    arb_get_mag(h_magnitude, h);
    mellin_grid_scratch grid_scratch;
    mellin_grid_scratch_init(&grid_scratch);

    for (slong index = 0; index < point_count; ++index)
    {
        acb_zero(completed + index);
        acb_zero(raw + index);
        if (coarse_completed != NULL)
        {
            acb_zero(coarse_completed + index);
            acb_zero(coarse_raw + index);
        }
        mag_zero(coefficient_tail_bounds + index);
        mag_zero(grid_omission_bounds + index);
        mag_zero(outer_tail_bounds + index);
        acb_sub_ui(z + index, points + index, 1, work_precision);
        acb_mul_arb(forward_step + index, z + index, h, work_precision);
        acb_exp(
            forward_step + index, forward_step + index, work_precision);
        acb_inv(
            backward_step + index, forward_step + index, work_precision);
        acb_one(forward + index);
        acb_one(backward + index);
        acb_pow(raw_factor + index, base, points + index, work_precision);
        acb_rgamma(gamma_reciprocal, points + index, work_precision);
        acb_mul(
            raw_factor + index, raw_factor + index, gamma_reciprocal,
            work_precision);
        acb_get_mag(raw_conversion_magnitudes + index, raw_factor + index);
    }

    for (slong grid = 0; grid < plan.grid_points; ++grid)
    {
        mellin_grid_node(
            value, omission, jh, y, q, a, h, plan.grid_step, a_double,
            plan.max_abs_real_offset, grid,
            plan.required_cutoff, cutoff, NULL, coefficients, &grid_scratch,
            work_precision);
        arb_get_mag(omission_magnitude, omission);
        for (slong index = 0; index < point_count; ++index)
        {
            if (grid != 0)
            {
                /* Re-anchor occasionally to keep ball-width growth bounded. */
                if ((grid & 63) == 0)
                {
                    acb_mul_arb(
                        forward + index, z + index, jh, work_precision);
                    acb_exp(
                        forward + index, forward + index, work_precision);
                    acb_inv(
                        backward + index, forward + index, work_precision);
                }
                else
                {
                    acb_mul(
                        forward + index, forward + index,
                        forward_step + index, work_precision);
                    acb_mul(
                        backward + index, backward + index,
                        backward_step + index, work_precision);
                }
            }
            if (root_number == 1)
                acb_add(
                    weight + index, forward + index, backward + index,
                    work_precision);
            else
                acb_sub(
                    weight + index, forward + index, backward + index,
                    work_precision);
            acb_mul_arb(term + index, weight + index, value, work_precision);
            if (grid == 0)
                acb_mul_2exp_si(term + index, term + index, -1);
            acb_add(
                completed + index, completed + index, term + index,
                work_precision);
            if (coarse_completed != NULL && (grid & 1) == 0)
                acb_add(
                    coarse_completed + index, coarse_completed + index,
                    term + index, work_precision);

            if (!arb_is_zero(omission))
            {
                acb_get_mag(weight_magnitude, weight + index);
                mag_mul(weight_magnitude, weight_magnitude, omission_magnitude);
                mag_mul(weight_magnitude, weight_magnitude, h_magnitude);
                if (grid == 0)
                    mag_mul_2exp_si(weight_magnitude, weight_magnitude, -1);
                mag_add(
                    grid_omission_bounds + index,
                    grid_omission_bounds + index, weight_magnitude);
            }
        }
    }

    for (slong index = 0; index < point_count; ++index)
    {
        acb_mul_arb(completed + index, completed + index, h, work_precision);
        acb_mul(
            raw + index, completed + index, raw_factor + index,
            work_precision);
        if (coarse_completed != NULL)
        {
            acb_mul_arb(
                coarse_completed + index, coarse_completed + index, h,
                work_precision);
            acb_mul_2exp_si(coarse_completed + index, coarse_completed + index, 1);
            acb_mul(
                coarse_raw + index, coarse_completed + index,
                raw_factor + index, work_precision);
        }
        acb_get_mag(weight_magnitude, raw_factor + index);
        if (mag_cmp_2exp_si(weight_magnitude, 0) > 0)
            mag_mul(
                grid_omission_bounds + index,
                grid_omission_bounds + index, weight_magnitude);
        completed_coefficient_tail_bound(
            coefficient_tail_bounds + index, a, cutoff, points + index,
            weight_magnitude, work_precision);
        completed_outer_tail_bound(
            outer_tail_bounds + index, a, jh, y, points + index,
            weight_magnitude, work_precision);
        mag_add(
            weight_magnitude, coefficient_tail_bounds + index,
            grid_omission_bounds + index);
        mag_add(
            weight_magnitude, weight_magnitude, outer_tail_bounds + index);
        if (mag_cmp_2exp_si(weight_magnitude, -fine_target_bits) > 0)
            diagnostics->known_error_target_met = 0;
    }

    mag_clear(h_magnitude);
    mellin_grid_scratch_clear(&grid_scratch);
    mag_clear(weight_magnitude);
    mag_clear(omission_magnitude);
    acb_clear(gamma_reciprocal);
    acb_clear(base);
    _acb_vec_clear(raw_factor, point_count);
    _acb_vec_clear(term, point_count);
    _acb_vec_clear(weight, point_count);
    _acb_vec_clear(backward_step, point_count);
    _acb_vec_clear(forward_step, point_count);
    _acb_vec_clear(backward, point_count);
    _acb_vec_clear(forward, point_count);
    _acb_vec_clear(z, point_count);

cleanup_scalars:
    arb_clear(q);
    arb_clear(y);
    arb_clear(jh);
    arb_clear(omission);
    arb_clear(value);
    arb_clear(h);
    arb_clear(a);
    arb_clear(conductor_arb);
    arb_clear(pi);
    return plan_status == SAGEJS_EC_LFUNCTION_OK
        ? (int) diagnostics->status : plan_status;
}

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
    slong work_precision)
{
    return ec_lseries_values_acb_internal(
        NULL, NULL, completed, raw, coefficient_tail_bounds,
        grid_omission_bounds, outer_tail_bounds,
        raw_conversion_magnitudes, diagnostics, coefficients,
        available_cutoff, conductor, root_number, points, point_count,
        target_bits, 0, work_precision);
}

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
    slong work_precision)
{
    if (coarse_completed == NULL || coarse_raw == NULL ||
        refinement_bits < 1)
    {
        if (diagnostics != NULL)
            diagnostics->status = SAGEJS_EC_LFUNCTION_INVALID_INPUT;
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
    }
    return ec_lseries_values_acb_internal(
        coarse_completed, coarse_raw, fine_completed, fine_raw,
        coefficient_tail_bounds, grid_omission_bounds, outer_tail_bounds,
        raw_conversion_magnitudes, diagnostics, coefficients,
        available_cutoff, conductor, root_number, points, point_count,
        target_bits, refinement_bits, work_precision);
}

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
    slong work_precision)
{
    if (completed == NULL || raw == NULL || diagnostics == NULL ||
        coefficients == NULL || points == NULL || cutoffs == NULL ||
        available_cutoff < 1 || point_count < 1 ||
        fmpz_sgn(conductor) <= 0 || target_bits < 16 ||
        work_precision < target_bits)
    {
        if (diagnostics != NULL)
            diagnostics->status = SAGEJS_EC_LFUNCTION_INVALID_INPUT;
        return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
    }

    slong maximum_cutoff = 0;
    slong coefficient_terms = 0;
    for (slong index = 0; index < point_count; ++index)
    {
        if (!acb_is_finite(points + index) || cutoffs[index] < 1 ||
            cutoffs[index] > available_cutoff)
        {
            diagnostics->status = SAGEJS_EC_LFUNCTION_INVALID_INPUT;
            return SAGEJS_EC_LFUNCTION_INVALID_INPUT;
        }
        if (cutoffs[index] > maximum_cutoff)
            maximum_cutoff = cutoffs[index];
        if (coefficient_terms > WORD_MAX - cutoffs[index] ||
            coefficient_terms >
                SAGEJS_EC_LSERIES_MAX_COEFFICIENT_TERMS - cutoffs[index])
        {
            diagnostics->status = SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
            return SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT;
        }
        coefficient_terms += cutoffs[index];
    }

    diagnostics->status = SAGEJS_EC_LFUNCTION_OK;
    diagnostics->actual_cutoff = maximum_cutoff;
    diagnostics->required_cutoff = maximum_cutoff;
    diagnostics->grid_points = 0;
    diagnostics->coefficient_terms = coefficient_terms;
    diagnostics->target_bits = target_bits;
    diagnostics->work_precision = work_precision;
    diagnostics->point_count = point_count;
    diagnostics->grid_step = 0.0;
    diagnostics->max_abs_imaginary = 0.0;
    diagnostics->max_abs_real_offset = 0.0;
    diagnostics->known_error_target_met = 1;
    diagnostics->rigorous_enclosure = 0;

    arb_t integer, logarithm, pi, conductor_arb, a, A;
    arb_init(integer);
    arb_init(logarithm);
    arb_init(pi);
    arb_init(conductor_arb);
    arb_init(a);
    arb_init(A);
    acb_t term, factor, gamma_value, base;
    acb_init(term);
    acb_init(factor);
    acb_init(gamma_value);
    acb_init(base);

    for (slong index = 0; index < point_count; ++index)
    {
        acb_zero(raw + index);
        acb_zero(completed + index);
    }
    for (slong n = 1; n <= maximum_cutoff; ++n)
    {
        if (coefficients[n - 1] == 0)
            continue;
        arb_set_ui(integer, (ulong) n);
        arb_log(logarithm, integer, work_precision);
        for (slong index = 0; index < point_count; ++index)
        {
            if (n > cutoffs[index])
                continue;
            acb_mul_arb(term, points + index, logarithm, work_precision);
            acb_neg(term, term);
            acb_exp(term, term, work_precision);
            acb_addmul_si(
                raw + index, term, (slong) coefficients[n - 1],
                work_precision);
        }
    }

    arb_const_pi(pi, work_precision);
    arb_set_fmpz(conductor_arb, conductor);
    arb_sqrt(conductor_arb, conductor_arb, work_precision);
    arb_mul_ui(a, pi, 2, work_precision);
    arb_div(a, a, conductor_arb, work_precision);
    arb_inv(A, a, work_precision);
    acb_set_arb(base, A);
    for (slong index = 0; index < point_count; ++index)
    {
        acb_pow(factor, base, points + index, work_precision);
        acb_gamma(gamma_value, points + index, work_precision);
        acb_mul(factor, factor, gamma_value, work_precision);
        acb_mul(
            completed + index, raw + index, factor,
            work_precision);
    }

    acb_clear(base);
    acb_clear(gamma_value);
    acb_clear(factor);
    acb_clear(term);
    arb_clear(A);
    arb_clear(a);
    arb_clear(conductor_arb);
    arb_clear(pi);
    arb_clear(logarithm);
    arb_clear(integer);
    return SAGEJS_EC_LFUNCTION_OK;
}

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;
    if (status == napi_ok) return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static int value_to_slong(
    napi_env env, napi_value value, slong minimum, slong maximum, slong *result)
{
    int64_t converted;
    if (!check_napi(env, napi_get_value_int64(env, value, &converted))) return 0;
    if (converted < minimum || converted > maximum)
    {
        napi_throw_range_error(env, NULL, "integer argument is outside its range");
        return 0;
    }
    *result = (slong) converted;
    return 1;
}

static int value_to_fmpz(napi_env env, napi_value value, fmpz_t result)
{
    napi_valuetype type;
    if (!check_napi(env, napi_typeof(env, value, &type))) return 0;
    if (type == napi_number)
    {
        double number;
        if (!check_napi(env, napi_get_value_double(env, value, &number))) return 0;
        if (!isfinite(number) || trunc(number) != number ||
            fabs(number) > 9007199254740991.0)
        {
            napi_throw_range_error(env, NULL, "coefficient must be a safe integer");
            return 0;
        }
        fmpz_set_d(result, number);
        return 1;
    }
    if (type == napi_bigint)
    {
        int sign = 0;
        size_t count = 0;
        if (!check_napi(env,
                napi_get_value_bigint_words(env, value, NULL, &count, NULL)))
            return 0;
        uint64_t *words = count == 0
            ? NULL
            : (uint64_t *) malloc(count * sizeof(uint64_t));
        if (count != 0 && words == NULL)
        {
            napi_throw_error(env, NULL, "unable to allocate coefficient limbs");
            return 0;
        }
        if (count != 0 && !check_napi(env,
                napi_get_value_bigint_words(env, value, &sign, &count, words)))
        {
            free(words);
            return 0;
        }
        if (count == 0)
            fmpz_zero(result);
        else
            fmpz_set_ui_array(result, (const ulong *) words, (slong) count);
        free(words);
        if (sign) fmpz_neg(result, result);
        return 1;
    }
    napi_throw_type_error(env, NULL, "coefficient must be an integer or BigInt");
    return 0;
}

typedef struct
{
    const int32_t *data;
    int32_t *owned;
    slong length;
} packed_coefficient_view;

static void packed_coefficient_view_clear(packed_coefficient_view *view)
{
    flint_free(view->owned);
    view->data = NULL;
    view->owned = NULL;
    view->length = 0;
}

static int value_to_packed_coefficients(
    napi_env env, napi_value value, packed_coefficient_view *view)
{
    view->data = NULL;
    view->owned = NULL;
    view->length = 0;
    bool is_typed = false;
    if (!check_napi(env, napi_is_typedarray(env, value, &is_typed)))
        return 0;
    if (is_typed)
    {
        napi_typedarray_type type;
        size_t length = 0;
        void *data = NULL;
        napi_value array_buffer;
        size_t byte_offset = 0;
        if (!check_napi(env, napi_get_typedarray_info(
                env, value, &type, &length, &data, &array_buffer,
                &byte_offset)))
            return 0;
        (void) array_buffer;
        (void) byte_offset;
        if (type != napi_int32_array || length < 2 || length > INT32_MAX)
        {
            napi_throw_type_error(env, NULL,
                "coefficients must be an Int32Array containing a_0 through a_K");
            return 0;
        }
        view->data = (const int32_t *) data;
        view->length = (slong) length;
        return 1;
    }

    bool is_array = false;
    uint32_t length = 0;
    if (!check_napi(env, napi_is_array(env, value, &is_array)) || !is_array ||
        !check_napi(env, napi_get_array_length(env, value, &length)) ||
        length < 2)
    {
        napi_throw_type_error(env, NULL,
            "coefficients must contain a_0 through a_K");
        return 0;
    }
    view->owned = flint_malloc((size_t) length * sizeof(*view->owned));
    if (view->owned == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate packed coefficients");
        return 0;
    }
    fmpz_t converted;
    fmpz_init(converted);
    for (uint32_t index = 0; index < length; ++index)
    {
        napi_value entry;
        if (!check_napi(env, napi_get_element(env, value, index, &entry)) ||
            !value_to_fmpz(env, entry, converted))
        {
            fmpz_clear(converted);
            packed_coefficient_view_clear(view);
            return 0;
        }
        if (!fmpz_fits_si(converted))
        {
            fmpz_clear(converted);
            packed_coefficient_view_clear(view);
            napi_throw_range_error(env, NULL,
                "coefficient exceeds packed signed storage");
            return 0;
        }
        const slong coefficient = fmpz_get_si(converted);
        if (coefficient < INT32_MIN || coefficient > INT32_MAX)
        {
            fmpz_clear(converted);
            packed_coefficient_view_clear(view);
            napi_throw_range_error(env, NULL,
                "coefficient exceeds packed signed storage");
            return 0;
        }
        view->owned[index] = (int32_t) coefficient;
    }
    fmpz_clear(converted);
    view->data = view->owned;
    view->length = (slong) length;
    return 1;
}

static napi_value decimal_from_arf(
    napi_env env, const arf_t value, slong digits)
{
    char *text = arf_get_str(value, digits);
    napi_value result;
    const int ok = check_napi(env,
        napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &result));
    flint_free(text);
    return ok ? result : NULL;
}

static int set_named(
    napi_env env, napi_value object, const char *name, napi_value value)
{
    return value != NULL && check_napi(env,
        napi_set_named_property(env, object, name, value));
}

static int set_named_slong(
    napi_env env, napi_value object, const char *name, slong value)
{
    napi_value converted;
    return check_napi(env, napi_create_int64(env, (int64_t) value, &converted)) &&
        set_named(env, object, name, converted);
}

static int set_named_double(
    napi_env env, napi_value object, const char *name, double value)
{
    napi_value converted;
    return check_napi(env, napi_create_double(env, value, &converted)) &&
        set_named(env, object, name, converted);
}

static int value_to_arb_decimal(
    napi_env env, napi_value value, arb_t result, slong precision)
{
    napi_valuetype type;
    if (!check_napi(env, napi_typeof(env, value, &type))) return 0;
    if (type != napi_string)
    {
        napi_throw_type_error(env, NULL, "complex components must be decimal strings");
        return 0;
    }
    size_t length = 0;
    if (!check_napi(env,
            napi_get_value_string_utf8(env, value, NULL, 0, &length)))
        return 0;
    char *text = (char *) malloc(length + 1);
    if (text == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate complex component");
        return 0;
    }
    size_t written = 0;
    const int copied = check_napi(env, napi_get_value_string_utf8(
        env, value, text, length + 1, &written));
    if (!copied)
    {
        free(text);
        return 0;
    }
    const int parsed = arb_set_str(result, text, precision) == 0;
    free(text);
    if (!parsed || !arb_is_finite(result))
    {
        napi_throw_range_error(env, NULL, "invalid finite decimal component");
        return 0;
    }
    return 1;
}

static int values_to_acb_points(
    napi_env env,
    napi_value value,
    acb_ptr points,
    slong point_count,
    slong precision)
{
    for (slong index = 0; index < point_count; ++index)
    {
        napi_value point, real, imaginary;
        bool is_array = false;
        uint32_t length = 0;
        if (!check_napi(env,
                napi_get_element(env, value, (uint32_t) index, &point)) ||
            !check_napi(env, napi_is_array(env, point, &is_array)) ||
            !is_array ||
            !check_napi(env, napi_get_array_length(env, point, &length)) ||
            length != 2)
        {
            napi_throw_type_error(env, NULL,
                "each complex point must be [realDecimal, imaginaryDecimal]");
            return 0;
        }
        if (!check_napi(env, napi_get_element(env, point, 0, &real)) ||
            !check_napi(env, napi_get_element(env, point, 1, &imaginary)) ||
            !value_to_arb_decimal(
                env, real, acb_realref(points + index), precision) ||
            !value_to_arb_decimal(
                env, imaginary, acb_imagref(points + index), precision))
            return 0;
    }
    return 1;
}

static napi_value complex_ball_to_object(
    napi_env env, const acb_t value, slong digits, slong accuracy_cap)
{
    napi_value result, real_midpoint, imaginary_midpoint;
    napi_value real_radius, imaginary_radius, accuracy;
    if (!check_napi(env, napi_create_object(env, &result))) return NULL;
    real_midpoint = decimal_from_arf(
        env, arb_midref(acb_realref(value)), digits);
    imaginary_midpoint = decimal_from_arf(
        env, arb_midref(acb_imagref(value)), digits);
    arf_t radius;
    arf_init(radius);
    arf_set_mag(radius, arb_radref(acb_realref(value)));
    real_radius = decimal_from_arf(env, radius, digits);
    arf_set_mag(radius, arb_radref(acb_imagref(value)));
    imaginary_radius = decimal_from_arf(env, radius, digits);
    arf_clear(radius);
    slong accuracy_bits = acb_rel_accuracy_bits(value);
    if (accuracy_bits > accuracy_cap) accuracy_bits = accuracy_cap;
    if (!check_napi(env, napi_create_int64(
            env, (int64_t) accuracy_bits, &accuracy)) ||
        !set_named(env, result, "realMidpoint", real_midpoint) ||
        !set_named(env, result, "imagMidpoint", imaginary_midpoint) ||
        !set_named(env, result, "realRadius", real_radius) ||
        !set_named(env, result, "imagRadius", imaginary_radius) ||
        !set_named(env, result, "accuracyBits", accuracy))
        return NULL;
    return result;
}

static napi_value ec_lseries_plan_to_object(
    napi_env env,
    const ec_lseries_plan *plan,
    slong target_bits,
    slong refinement_bits)
{
    napi_value result, status;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env, napi_create_string_utf8(
            env, "plan", NAPI_AUTO_LENGTH, &status)) ||
        !set_named(env, result, "status", status) ||
        !set_named_slong(env, result, "precisionBits", target_bits) ||
        !set_named_slong(env, result, "finePrecisionBits",
            target_bits + refinement_bits) ||
        !set_named_slong(env, result, "refinementBits", refinement_bits) ||
        !set_named_slong(
            env, result, "workPrecisionBits", plan->work_precision) ||
        !set_named_slong(
            env, result, "requiredCutoff", plan->required_cutoff) ||
        !set_named_slong(env, result, "gridPoints", plan->grid_points) ||
        !set_named_slong(
            env, result, "coefficientTerms", plan->coefficient_terms) ||
        !set_named_slong(env, result, "pointCount", plan->point_count) ||
        !set_named_double(env, result, "gridStep", plan->grid_step) ||
        !set_named_double(
            env, result, "maxAbsImag", plan->max_abs_imaginary) ||
        !set_named_double(env, result, "maxAbsRealOffset",
            plan->max_abs_real_offset))
        return NULL;
    return result;
}

static napi_value ec_lseries_packed_plot_to_object(
    napi_env env,
    acb_srcptr coarse_raw,
    acb_srcptr fine_raw,
    mag_srcptr coefficient_tail_bounds,
    mag_srcptr grid_omission_bounds,
    mag_srcptr outer_tail_bounds,
    const sagejs_ec_lfunction_diagnostics *diagnostics,
    slong point_count,
    slong target_bits,
    slong refinement_bits)
{
    const size_t stride = 5;
    if ((size_t) point_count > SIZE_MAX / stride / sizeof(double))
    {
        napi_throw_range_error(env, NULL, "packed plot result is too large");
        return NULL;
    }
    napi_value result, status, array_buffer, packed_values;
    napi_value known_error_target_met, rigorous;
    napi_value analytic_status, discretization_status;
    double *data = NULL;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env, napi_create_string_utf8(
            env,
            diagnostics->status == SAGEJS_EC_LFUNCTION_OK
                ? "ok" : "insufficient_coefficients",
            NAPI_AUTO_LENGTH, &status)) ||
        !check_napi(env, napi_create_arraybuffer(env,
            (size_t) point_count * stride * sizeof(double),
            (void **) &data, &array_buffer)) ||
        !check_napi(env, napi_create_typedarray(env, napi_float64_array,
            (size_t) point_count * stride, array_buffer, 0, &packed_values)) ||
        !check_napi(env, napi_get_boolean(
            env, diagnostics->known_error_target_met,
            &known_error_target_met)) ||
        !check_napi(env, napi_get_boolean(env, false, &rigorous)) ||
        !check_napi(env, napi_create_string_utf8(env,
            "coefficient_local_grid_and_outer_tail_only",
            NAPI_AUTO_LENGTH, &analytic_status)) ||
        !check_napi(env, napi_create_string_utf8(env,
            "unbounded_nonrigorous", NAPI_AUTO_LENGTH,
            &discretization_status)) ||
        !set_named(env, result, "status", status) ||
        !set_named(env, result, "packedValues", packed_values) ||
        !set_named(env, result, "knownErrorTargetMet",
            known_error_target_met) ||
        !set_named(env, result, "rigorous", rigorous) ||
        !set_named(env, result, "analyticErrorStatus", analytic_status) ||
        !set_named(env, result, "trapezoidDiscretizationStatus",
            discretization_status) ||
        !set_named_slong(env, result, "packedStride", (slong) stride) ||
        !set_named_slong(env, result, "precisionBits", target_bits) ||
        !set_named_slong(env, result, "finePrecisionBits",
            target_bits + refinement_bits) ||
        !set_named_slong(env, result, "refinementBits", refinement_bits) ||
        !set_named_slong(env, result, "workPrecisionBits",
            diagnostics->work_precision) ||
        !set_named_slong(
            env, result, "cutoff", diagnostics->actual_cutoff) ||
        !set_named_slong(env, result, "requiredCutoff",
            diagnostics->required_cutoff) ||
        !set_named_slong(
            env, result, "gridPoints", diagnostics->grid_points) ||
        !set_named_slong(env, result, "coefficientTerms",
            diagnostics->coefficient_terms) ||
        !set_named_slong(env, result, "pointCount", point_count) ||
        !set_named_double(
            env, result, "gridStep", diagnostics->grid_step) ||
        !set_named_double(env, result, "maxAbsImag",
            diagnostics->max_abs_imaginary) ||
        !set_named_double(env, result, "maxAbsRealOffset",
            diagnostics->max_abs_real_offset))
        return NULL;
    if (diagnostics->status != SAGEJS_EC_LFUNCTION_OK)
        return result;

    mag_t analytic_error;
    mag_init(analytic_error);
    for (slong index = 0; index < point_count; ++index)
    {
        const size_t offset = (size_t) index * stride;
        data[offset] = arf_get_d(
            arb_midref(acb_realref(fine_raw + index)), ARF_RND_NEAR);
        data[offset + 1] = arf_get_d(
            arb_midref(acb_imagref(fine_raw + index)), ARF_RND_NEAR);
        data[offset + 2] = arf_get_d(
            arb_midref(acb_realref(coarse_raw + index)), ARF_RND_NEAR);
        data[offset + 3] = arf_get_d(
            arb_midref(acb_imagref(coarse_raw + index)), ARF_RND_NEAR);
        mag_add(analytic_error,
            coefficient_tail_bounds + index, grid_omission_bounds + index);
        mag_add(
            analytic_error, analytic_error, outer_tail_bounds + index);
        data[offset + 4] = mag_get_d(analytic_error)
            + mag_get_d(arb_radref(acb_realref(fine_raw + index)))
            + mag_get_d(arb_radref(acb_imagref(fine_raw + index)));
    }
    mag_clear(analytic_error);
    return result;
}

napi_value sagejs_ec_completed_central_derivatives(
    napi_env env, napi_callback_info info)
{
    napi_value args[6];
    size_t argc = 6;
    if (!check_napi(env,
            napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != 6)
    {
        napi_throw_type_error(env, NULL,
            "ecCompletedCentralDerivatives expects conductor, root number, "
            "coefficient array, first order, derivative count, and precision");
        return NULL;
    }

    fmpz_t conductor;
    fmpz_init(conductor);
    slong root_number = 0;
    slong first_order = 0;
    slong derivative_count = 0;
    slong target_bits = 0;
    if (!value_to_fmpz(env, args[0], conductor) ||
        !value_to_slong(env, args[1], -1, 1, &root_number))
    {
        fmpz_clear(conductor);
        return NULL;
    }
    if (root_number != -1 && root_number != 1)
    {
        napi_throw_range_error(env, NULL, "root number must be -1 or 1");
        fmpz_clear(conductor);
        return NULL;
    }
    if (!value_to_slong(env, args[3], 0, 64, &first_order) ||
        !value_to_slong(env, args[4], 1, 65, &derivative_count) ||
        !value_to_slong(env, args[5], 16, 4096, &target_bits))
    {
        fmpz_clear(conductor);
        return NULL;
    }
    if (first_order + derivative_count > 65)
    {
        napi_throw_range_error(env, NULL,
            "requested derivative range exceeds order 64");
        fmpz_clear(conductor);
        return NULL;
    }

    packed_coefficient_view coefficient_view;
    if (!value_to_packed_coefficients(env, args[2], &coefficient_view))
    {
        fmpz_clear(conductor);
        return NULL;
    }

    const slong cutoff = coefficient_view.length - 1;
    fmpz *coefficients = _fmpz_vec_init(cutoff);
    for (slong n = 1; n <= cutoff; ++n)
        fmpz_set_si(coefficients + n - 1, coefficient_view.data[n]);

    const slong work_precision = target_bits + 24;
    arb_ptr derivatives = _arb_vec_init(derivative_count);
    arb_t coefficient_tail_bound, grid_omission_bound, total_tail_bound;
    arb_init(coefficient_tail_bound);
    arb_init(grid_omission_bound);
    arb_init(total_tail_bound);
    sagejs_ec_lfunction_diagnostics diagnostics;
    const int call_status = sagejs_ec_completed_lseries_jet(
        derivatives, coefficient_tail_bound, grid_omission_bound, &diagnostics,
        coefficients, cutoff, conductor, (int) root_number, first_order,
        derivative_count, target_bits, work_precision);
    _fmpz_vec_clear(coefficients, cutoff);
    packed_coefficient_view_clear(&coefficient_view);
    fmpz_clear(conductor);
    if (call_status == SAGEJS_EC_LFUNCTION_INVALID_INPUT ||
        call_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT)
    {
        _arb_vec_clear(derivatives, derivative_count);
        arb_clear(coefficient_tail_bound);
        arb_clear(grid_omission_bound);
        arb_clear(total_tail_bound);
        napi_throw_range_error(env, NULL,
            call_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT
                ? "elliptic L-function conductor exceeds native resource limits"
                : "invalid elliptic L-function input");
        return NULL;
    }

    napi_value result, values, status, rigorous, grid_step, error_status;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_create_array_with_length(env, derivative_count, &values)) ||
        !check_napi(env, napi_create_string_utf8(
            env,
            diagnostics.status == SAGEJS_EC_LFUNCTION_OK
                ? "ok" : "insufficient_coefficients",
            NAPI_AUTO_LENGTH, &status)) ||
        !check_napi(env,
            napi_get_boolean(env, diagnostics.rigorous_enclosure, &rigorous)) ||
        !check_napi(env,
            napi_create_double(env, diagnostics.grid_step, &grid_step)) ||
        !check_napi(env, napi_create_string_utf8(
            env, "coefficient_and_grid_omission_only", NAPI_AUTO_LENGTH,
            &error_status)) ||
        !set_named(env, result, "status", status) ||
        !set_named(env, result, "derivatives", values) ||
        !set_named(env, result, "rigorous", rigorous) ||
        !set_named(env, result, "analyticErrorStatus", error_status) ||
        !set_named(env, result, "gridStep", grid_step) ||
        !set_named_slong(env, result, "precisionBits", target_bits) ||
        !set_named_slong(env, result, "workPrecisionBits", work_precision) ||
        !set_named_slong(env, result, "cutoff", diagnostics.actual_cutoff) ||
        !set_named_slong(
            env, result, "requiredCutoff", diagnostics.required_cutoff) ||
        !set_named_slong(env, result, "gridPoints", diagnostics.grid_points) ||
        !set_named_slong(
            env, result, "coefficientTerms", diagnostics.coefficient_terms))
        goto failure;

    const slong digits = (slong) ceil((double) target_bits * 0.30103) + 8;
    arf_t converted;
    arf_init(converted);
    arb_add(
        total_tail_bound, coefficient_tail_bound, grid_omission_bound,
        work_precision);
    arb_get_ubound_arf(converted, total_tail_bound, work_precision);
    napi_value tail = decimal_from_arf(env, converted, digits);
    arb_get_ubound_arf(converted, coefficient_tail_bound, work_precision);
    napi_value coefficient_tail = decimal_from_arf(env, converted, digits);
    arb_get_ubound_arf(converted, grid_omission_bound, work_precision);
    napi_value grid_omission = decimal_from_arf(env, converted, digits);
    if (!set_named(env, result, "tailBound", tail) ||
        !set_named(env, result, "coefficientTailBound", coefficient_tail) ||
        !set_named(env, result, "gridOmissionBound", grid_omission))
    {
        arf_clear(converted);
        goto failure;
    }

    for (slong index = 0; index < derivative_count; ++index)
    {
        napi_value item, midpoint, radius, contains_zero, accuracy;
        if (!check_napi(env, napi_create_object(env, &item)))
        {
            arf_clear(converted);
            goto failure;
        }
        midpoint = decimal_from_arf(
            env, arb_midref(derivatives + index), digits);
        arf_set_mag(converted, arb_radref(derivatives + index));
        radius = decimal_from_arf(env, converted, digits);
        if (!check_napi(env, napi_get_boolean(
                env, arb_contains_zero(derivatives + index), &contains_zero)) ||
            !check_napi(env, napi_create_int64(
                env, (int64_t) arb_rel_accuracy_bits(derivatives + index),
                &accuracy)) ||
            !set_named_slong(
                env, item, "order", first_order + index) ||
            !set_named(env, item, "midpoint", midpoint) ||
            !set_named(env, item, "radius", radius) ||
            !set_named(env, item, "containsZero", contains_zero) ||
            !set_named(env, item, "accuracyBits", accuracy) ||
            !check_napi(env, napi_set_element(
                env, values, (uint32_t) index, item)))
        {
            arf_clear(converted);
            goto failure;
        }
    }
    arf_clear(converted);
    _arb_vec_clear(derivatives, derivative_count);
    arb_clear(coefficient_tail_bound);
    arb_clear(grid_omission_bound);
    arb_clear(total_tail_bound);
    return result;

failure:
    _arb_vec_clear(derivatives, derivative_count);
    arb_clear(coefficient_tail_bound);
    arb_clear(grid_omission_bound);
    arb_clear(total_tail_bound);
    return NULL;
}

napi_value sagejs_ec_lseries_values(napi_env env, napi_callback_info info)
{
    napi_value args[7];
    size_t argc = 7;
    if (!check_napi(env,
            napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc < 5 || argc > 7)
    {
        napi_throw_type_error(env, NULL,
            "ecLseriesValues expects conductor, root number, coefficient "
            "array, complex-point array, precision, optional refinement bits, "
            "and optional output mode");
        return NULL;
    }

    fmpz_t conductor;
    fmpz_init(conductor);
    slong root_number = 0;
    slong target_bits = 0;
    slong refinement_bits = 0;
    slong output_mode = 0;
    if (!value_to_fmpz(env, args[0], conductor) ||
        !value_to_slong(env, args[1], -1, 1, &root_number) ||
        !value_to_slong(env, args[4], 16, 4096, &target_bits) ||
        (argc >= 6 && !value_to_slong(
            env, args[5], 0, 256, &refinement_bits)) ||
        (argc == 7 && !value_to_slong(
            env, args[6], 0, 2, &output_mode)))
    {
        fmpz_clear(conductor);
        return NULL;
    }
    if (root_number != -1 && root_number != 1)
    {
        napi_throw_range_error(env, NULL, "root number must be -1 or 1");
        fmpz_clear(conductor);
        return NULL;
    }
    if (output_mode == 2 && refinement_bits == 0)
    {
        napi_throw_range_error(env, NULL,
            "packed plot output requires positive refinement bits");
        fmpz_clear(conductor);
        return NULL;
    }

    bool is_array = false;
    uint32_t point_count_u32 = 0;
    if (!check_napi(env, napi_is_array(env, args[3], &is_array)) || !is_array ||
        !check_napi(env,
            napi_get_array_length(env, args[3], &point_count_u32)) ||
        point_count_u32 < 1 ||
        point_count_u32 > (output_mode == 0
            ? SAGEJS_EC_LSERIES_MAX_OBJECT_POINTS
            : SAGEJS_EC_LSERIES_MAX_POINTS))
    {
        napi_throw_range_error(env, NULL,
            output_mode == 0
                ? "points must be a nonempty array with at most 10000 entries"
                : "planned or packed points must have at most 100000 entries");
        fmpz_clear(conductor);
        return NULL;
    }
    const slong point_count = (slong) point_count_u32;
    const slong fine_target_bits = target_bits + refinement_bits;
    const slong planning_precision = fine_target_bits + 128;
    acb_ptr points = _acb_vec_init(point_count);
    if (!values_to_acb_points(
            env, args[3], points, point_count, planning_precision))
    {
        _acb_vec_clear(points, point_count);
        fmpz_clear(conductor);
        return NULL;
    }

    slong work_precision = 0;
    const int precision_status = sagejs_ec_lseries_work_precision(
        &work_precision, conductor, points, point_count, fine_target_bits,
        planning_precision);
    if (precision_status != SAGEJS_EC_LFUNCTION_OK)
    {
        napi_throw_range_error(env, NULL,
            precision_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT
                ? "complex points or precision exceed native resource limits"
                : "invalid elliptic L-function precision-planning input");
        _acb_vec_clear(points, point_count);
        fmpz_clear(conductor);
        return NULL;
    }
    if (!values_to_acb_points(
            env, args[3], points, point_count, work_precision))
    {
        _acb_vec_clear(points, point_count);
        fmpz_clear(conductor);
        return NULL;
    }
    if (output_mode == 1)
    {
        const double conductor_double = fmpz_get_d(conductor);
        const double a_double = 2.0 * SAGEJS_PI / sqrt(conductor_double);
        arb_t pi, conductor_arb, a;
        arb_init(pi);
        arb_init(conductor_arb);
        arb_init(a);
        arb_const_pi(pi, work_precision);
        arb_set_fmpz(conductor_arb, conductor);
        arb_sqrt(conductor_arb, conductor_arb, work_precision);
        arb_mul_ui(a, pi, 2, work_precision);
        arb_div(a, a, conductor_arb, work_precision);
        ec_lseries_plan plan;
        const int plan_status = make_ec_lseries_plan(
            &plan, a, a_double, points, point_count, fine_target_bits,
            work_precision);
        napi_value plan_result = NULL;
        if (plan_status == SAGEJS_EC_LFUNCTION_OK)
            plan_result = ec_lseries_plan_to_object(
                env, &plan, target_bits, refinement_bits);
        else
            napi_throw_range_error(env, NULL,
                plan_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT
                    ? "elliptic L-function plan exceeds native resource limits"
                    : "invalid elliptic L-function plan input");
        arb_clear(a);
        arb_clear(conductor_arb);
        arb_clear(pi);
        _acb_vec_clear(points, point_count);
        fmpz_clear(conductor);
        return plan_result;
    }

    packed_coefficient_view coefficient_view;
    if (!value_to_packed_coefficients(env, args[2], &coefficient_view))
    {
        _acb_vec_clear(points, point_count);
        fmpz_clear(conductor);
        return NULL;
    }
    const slong cutoff = coefficient_view.length - 1;

    acb_ptr completed = _acb_vec_init(point_count);
    acb_ptr raw = _acb_vec_init(point_count);
    acb_ptr coarse_completed = refinement_bits == 0
        ? NULL : _acb_vec_init(point_count);
    acb_ptr coarse_raw = refinement_bits == 0
        ? NULL : _acb_vec_init(point_count);
    mag_ptr coefficient_tail_bounds = _mag_vec_init(point_count);
    mag_ptr grid_omission_bounds = _mag_vec_init(point_count);
    mag_ptr outer_tail_bounds = _mag_vec_init(point_count);
    mag_ptr raw_conversion_magnitudes = _mag_vec_init(point_count);
    sagejs_ec_lfunction_diagnostics diagnostics;
    const int call_status = refinement_bits == 0
        ? sagejs_ec_lseries_values_acb(
            completed, raw, coefficient_tail_bounds, grid_omission_bounds,
            outer_tail_bounds, raw_conversion_magnitudes, &diagnostics,
            coefficient_view.data + 1, cutoff, conductor,
            (int) root_number, points, point_count, target_bits,
            work_precision)
        : sagejs_ec_lseries_values_refined_acb(
            coarse_completed, coarse_raw, completed, raw,
            coefficient_tail_bounds, grid_omission_bounds,
            outer_tail_bounds, raw_conversion_magnitudes, &diagnostics,
            coefficient_view.data + 1, cutoff, conductor,
            (int) root_number, points, point_count, target_bits,
            refinement_bits, work_precision);
    packed_coefficient_view_clear(&coefficient_view);
    fmpz_clear(conductor);
    if (call_status == SAGEJS_EC_LFUNCTION_INVALID_INPUT ||
        call_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT)
    {
        _mag_vec_clear(raw_conversion_magnitudes, point_count);
        _mag_vec_clear(outer_tail_bounds, point_count);
        _mag_vec_clear(grid_omission_bounds, point_count);
        _mag_vec_clear(coefficient_tail_bounds, point_count);
        _acb_vec_clear(raw, point_count);
        _acb_vec_clear(completed, point_count);
        if (coarse_raw != NULL) _acb_vec_clear(coarse_raw, point_count);
        if (coarse_completed != NULL)
            _acb_vec_clear(coarse_completed, point_count);
        _acb_vec_clear(points, point_count);
        napi_throw_range_error(env, NULL,
            call_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT
                ? "elliptic L-function request exceeds native resource limits"
                : "invalid elliptic L-function input");
        return NULL;
    }

    if (output_mode == 2)
    {
        napi_value packed_result = ec_lseries_packed_plot_to_object(
            env, coarse_raw, raw, coefficient_tail_bounds,
            grid_omission_bounds, outer_tail_bounds, &diagnostics,
            point_count, target_bits, refinement_bits);
        _mag_vec_clear(raw_conversion_magnitudes, point_count);
        _mag_vec_clear(outer_tail_bounds, point_count);
        _mag_vec_clear(grid_omission_bounds, point_count);
        _mag_vec_clear(coefficient_tail_bounds, point_count);
        _acb_vec_clear(raw, point_count);
        _acb_vec_clear(completed, point_count);
        _acb_vec_clear(coarse_raw, point_count);
        _acb_vec_clear(coarse_completed, point_count);
        _acb_vec_clear(points, point_count);
        return packed_result;
    }

    napi_value result, values, coarse_values = NULL;
    napi_value status, rigorous, analytic_status;
    napi_value discretization_status;
    napi_value known_error_target_met;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_create_array_with_length(env, point_count_u32, &values)) ||
        (refinement_bits != 0 && !check_napi(env,
            napi_create_array_with_length(
                env, point_count_u32, &coarse_values))) ||
        !check_napi(env, napi_create_string_utf8(
            env,
            diagnostics.status == SAGEJS_EC_LFUNCTION_OK
                ? "ok" : "insufficient_coefficients",
            NAPI_AUTO_LENGTH, &status)) ||
        !check_napi(env, napi_get_boolean(env, false, &rigorous)) ||
        !check_napi(env, napi_get_boolean(
            env, diagnostics.known_error_target_met,
            &known_error_target_met)) ||
        !check_napi(env, napi_create_string_utf8(
            env, "coefficient_local_grid_and_outer_tail_only",
            NAPI_AUTO_LENGTH, &analytic_status)) ||
        !check_napi(env, napi_create_string_utf8(
            env, "unbounded_nonrigorous", NAPI_AUTO_LENGTH,
            &discretization_status)) ||
        !set_named(env, result, "status", status) ||
        !set_named(env, result, "values", values) ||
        (refinement_bits != 0 &&
            !set_named(env, result, "coarseValues", coarse_values)) ||
        !set_named(env, result, "rigorous", rigorous) ||
        !set_named(env, result, "knownErrorTargetMet",
            known_error_target_met) ||
        !set_named(env, result, "analyticErrorStatus", analytic_status) ||
        !set_named(env, result, "trapezoidDiscretizationStatus",
            discretization_status) ||
        !set_named_slong(env, result, "precisionBits", target_bits) ||
        !set_named_slong(
            env, result, "finePrecisionBits", fine_target_bits) ||
        !set_named_slong(
            env, result, "refinementBits", refinement_bits) ||
        !set_named_slong(
            env, result, "workPrecisionBits", work_precision) ||
        !set_named_slong(env, result, "cutoff", diagnostics.actual_cutoff) ||
        !set_named_slong(
            env, result, "requiredCutoff", diagnostics.required_cutoff) ||
        !set_named_slong(
            env, result, "gridPoints", diagnostics.grid_points) ||
        !set_named_slong(
            env, result, "coefficientTerms", diagnostics.coefficient_terms) ||
        !set_named_slong(env, result, "pointCount", point_count) ||
        !set_named_double(env, result, "gridStep", diagnostics.grid_step) ||
        !set_named_double(env, result, "maxAbsImag",
            diagnostics.max_abs_imaginary) ||
        !set_named_double(env, result, "maxAbsRealOffset",
            diagnostics.max_abs_real_offset))
        goto lseries_failure;

    const slong digits =
        (slong) ceil((double) fine_target_bits * 0.30103) + 12;
    arf_t converted;
    arf_init(converted);
    mag_t total_error;
    mag_init(total_error);
    mag_t maximum_coefficient_tail, maximum_grid_omission;
    mag_t maximum_outer_tail, maximum_analytic_error;
    mag_t maximum_raw_conversion;
    mag_init(maximum_coefficient_tail);
    mag_init(maximum_grid_omission);
    mag_init(maximum_outer_tail);
    mag_init(maximum_analytic_error);
    mag_init(maximum_raw_conversion);
    mag_zero(maximum_coefficient_tail);
    mag_zero(maximum_grid_omission);
    mag_zero(maximum_outer_tail);
    mag_zero(maximum_analytic_error);
    mag_zero(maximum_raw_conversion);
    for (slong index = 0; index < point_count; ++index)
    {
        napi_value item, point, completed_object, raw_object;
        if (!check_napi(env, napi_create_object(env, &item)) ||
            !check_napi(env, napi_create_array_with_length(env, 2, &point)))
            goto lseries_value_failure;
        napi_value point_real = decimal_from_arf(
            env, arb_midref(acb_realref(points + index)), digits);
        napi_value point_imaginary = decimal_from_arf(
            env, arb_midref(acb_imagref(points + index)), digits);
        completed_object = complex_ball_to_object(
            env, completed + index, digits, work_precision);
        raw_object = complex_ball_to_object(
            env, raw + index, digits, work_precision);
        arf_set_mag(converted, coefficient_tail_bounds + index);
        napi_value coefficient_tail = decimal_from_arf(env, converted, digits);
        arf_set_mag(converted, grid_omission_bounds + index);
        napi_value grid_omission = decimal_from_arf(env, converted, digits);
        arf_set_mag(converted, outer_tail_bounds + index);
        napi_value outer_tail = decimal_from_arf(env, converted, digits);
        arf_set_mag(converted, raw_conversion_magnitudes + index);
        napi_value raw_conversion = decimal_from_arf(env, converted, digits);
        mag_add(total_error,
            coefficient_tail_bounds + index, grid_omission_bounds + index);
        mag_add(total_error, total_error, outer_tail_bounds + index);
        arf_set_mag(converted, total_error);
        napi_value analytic_error = decimal_from_arf(env, converted, digits);
        if (mag_cmp(
                coefficient_tail_bounds + index,
                maximum_coefficient_tail) > 0)
            mag_set(maximum_coefficient_tail, coefficient_tail_bounds + index);
        if (mag_cmp(grid_omission_bounds + index, maximum_grid_omission) > 0)
            mag_set(maximum_grid_omission, grid_omission_bounds + index);
        if (mag_cmp(outer_tail_bounds + index, maximum_outer_tail) > 0)
            mag_set(maximum_outer_tail, outer_tail_bounds + index);
        if (mag_cmp(total_error, maximum_analytic_error) > 0)
            mag_set(maximum_analytic_error, total_error);
        if (mag_cmp(
                raw_conversion_magnitudes + index,
                maximum_raw_conversion) > 0)
            mag_set(maximum_raw_conversion, raw_conversion_magnitudes + index);
        if (!check_napi(env, napi_set_element(env, point, 0, point_real)) ||
            !check_napi(env,
                napi_set_element(env, point, 1, point_imaginary)) ||
            !set_named(env, item, "point", point) ||
            !set_named(env, item, "completed", completed_object) ||
            !set_named(env, item, "raw", raw_object) ||
            !set_named(env, item, "coefficientTailBound", coefficient_tail) ||
            !set_named(env, item, "gridOmissionBound", grid_omission) ||
            !set_named(env, item, "outerTailBound", outer_tail) ||
            !set_named(env, item, "rawConversionMagnitude", raw_conversion) ||
            !set_named(env, item, "analyticErrorBound", analytic_error) ||
            !check_napi(env,
                napi_set_element(env, values, (uint32_t) index, item)))
            goto lseries_value_failure;
        if (refinement_bits != 0)
        {
            napi_value coarse_item = NULL;
            napi_value coarse_completed_object = complex_ball_to_object(
                env, coarse_completed + index, digits, work_precision);
            napi_value coarse_raw_object = complex_ball_to_object(
                env, coarse_raw + index, digits, work_precision);
            if (coarse_completed_object == NULL || coarse_raw_object == NULL ||
                !check_napi(env, napi_create_object(env, &coarse_item)) ||
                !set_named(
                    env, coarse_item, "completed", coarse_completed_object) ||
                !set_named(env, coarse_item, "raw", coarse_raw_object) ||
                !check_napi(env, napi_set_element(
                    env, coarse_values, (uint32_t) index, coarse_item)))
                goto lseries_value_failure;
        }
    }
    arf_set_mag(converted, maximum_coefficient_tail);
    napi_value maximum_coefficient = decimal_from_arf(env, converted, digits);
    arf_set_mag(converted, maximum_grid_omission);
    napi_value maximum_grid = decimal_from_arf(env, converted, digits);
    arf_set_mag(converted, maximum_outer_tail);
    napi_value maximum_outer = decimal_from_arf(env, converted, digits);
    arf_set_mag(converted, maximum_analytic_error);
    napi_value maximum_error = decimal_from_arf(env, converted, digits);
    arf_set_mag(converted, maximum_raw_conversion);
    napi_value maximum_conversion = decimal_from_arf(env, converted, digits);
    if (!set_named(env, result, "coefficientTailBound", maximum_coefficient) ||
        !set_named(env, result, "gridOmissionBound", maximum_grid) ||
        !set_named(env, result, "outerTailBound", maximum_outer) ||
        !set_named(env, result, "analyticErrorBound", maximum_error) ||
        !set_named(env, result, "rawConversionMagnitude", maximum_conversion))
        goto lseries_value_failure;
    mag_clear(maximum_raw_conversion);
    mag_clear(maximum_analytic_error);
    mag_clear(maximum_outer_tail);
    mag_clear(maximum_grid_omission);
    mag_clear(maximum_coefficient_tail);
    mag_clear(total_error);
    arf_clear(converted);
    _mag_vec_clear(raw_conversion_magnitudes, point_count);
    _mag_vec_clear(outer_tail_bounds, point_count);
    _mag_vec_clear(grid_omission_bounds, point_count);
    _mag_vec_clear(coefficient_tail_bounds, point_count);
    _acb_vec_clear(raw, point_count);
    _acb_vec_clear(completed, point_count);
    if (coarse_raw != NULL) _acb_vec_clear(coarse_raw, point_count);
    if (coarse_completed != NULL)
        _acb_vec_clear(coarse_completed, point_count);
    _acb_vec_clear(points, point_count);
    return result;

lseries_value_failure:
    mag_clear(maximum_raw_conversion);
    mag_clear(maximum_analytic_error);
    mag_clear(maximum_outer_tail);
    mag_clear(maximum_grid_omission);
    mag_clear(maximum_coefficient_tail);
    mag_clear(total_error);
    arf_clear(converted);
lseries_failure:
    _mag_vec_clear(raw_conversion_magnitudes, point_count);
    _mag_vec_clear(outer_tail_bounds, point_count);
    _mag_vec_clear(grid_omission_bounds, point_count);
    _mag_vec_clear(coefficient_tail_bounds, point_count);
    _acb_vec_clear(raw, point_count);
    _acb_vec_clear(completed, point_count);
    if (coarse_raw != NULL) _acb_vec_clear(coarse_raw, point_count);
    if (coarse_completed != NULL)
        _acb_vec_clear(coarse_completed, point_count);
    _acb_vec_clear(points, point_count);
    return NULL;
}

napi_value sagejs_ec_lseries_direct_values(
    napi_env env, napi_callback_info info)
{
    napi_value args[5];
    size_t argc = 5;
    if (!check_napi(env,
            napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != 5)
    {
        napi_throw_type_error(env, NULL,
            "ecLseriesDirectValues expects conductor, coefficient array, "
            "complex-point array, cutoff array, and precision");
        return NULL;
    }

    fmpz_t conductor;
    fmpz_init(conductor);
    slong target_bits = 0;
    if (!value_to_fmpz(env, args[0], conductor) ||
        !value_to_slong(env, args[4], 16, 4096, &target_bits))
    {
        fmpz_clear(conductor);
        return NULL;
    }

    bool is_array = false;
    uint32_t point_count_u32 = 0;
    uint32_t cutoff_count_u32 = 0;
    if (!check_napi(env, napi_is_array(env, args[2], &is_array)) ||
        !is_array ||
        !check_napi(env,
            napi_get_array_length(env, args[2], &point_count_u32)) ||
        point_count_u32 < 1 || point_count_u32 > 10000 ||
        !check_napi(env, napi_is_array(env, args[3], &is_array)) ||
        !is_array ||
        !check_napi(env,
            napi_get_array_length(env, args[3], &cutoff_count_u32)) ||
        cutoff_count_u32 != point_count_u32)
    {
        napi_throw_range_error(env, NULL,
            "direct points and cutoffs must be equal nonempty arrays with "
            "at most 10000 entries");
        fmpz_clear(conductor);
        return NULL;
    }
    const slong point_count = (slong) point_count_u32;
    const slong work_precision = target_bits + 96;
    acb_ptr points = _acb_vec_init(point_count);
    slong *cutoffs = flint_malloc((size_t) point_count * sizeof(*cutoffs));
    if (cutoffs == NULL || !values_to_acb_points(
            env, args[2], points, point_count, work_precision))
    {
        flint_free(cutoffs);
        _acb_vec_clear(points, point_count);
        fmpz_clear(conductor);
        return NULL;
    }
    slong maximum_cutoff = 0;
    for (slong index = 0; index < point_count; ++index)
    {
        napi_value cutoff_value;
        if (!check_napi(env, napi_get_element(
                env, args[3], (uint32_t) index, &cutoff_value)) ||
            !value_to_slong(
                env, cutoff_value, 1, SAGEJS_EC_LSERIES_MAX_CUTOFF,
                cutoffs + index))
        {
            flint_free(cutoffs);
            _acb_vec_clear(points, point_count);
            fmpz_clear(conductor);
            return NULL;
        }
        if (cutoffs[index] > maximum_cutoff)
            maximum_cutoff = cutoffs[index];
    }

    packed_coefficient_view coefficient_view;
    if (!value_to_packed_coefficients(env, args[1], &coefficient_view) ||
        coefficient_view.length - 1 < maximum_cutoff)
    {
        if (coefficient_view.data != NULL)
        {
            packed_coefficient_view_clear(&coefficient_view);
            napi_throw_range_error(env, NULL,
                "direct coefficients must contain every requested prefix");
        }
        flint_free(cutoffs);
        _acb_vec_clear(points, point_count);
        fmpz_clear(conductor);
        return NULL;
    }
    const slong available_cutoff = coefficient_view.length - 1;

    acb_ptr completed = _acb_vec_init(point_count);
    acb_ptr raw = _acb_vec_init(point_count);
    sagejs_ec_lfunction_diagnostics diagnostics;
    const int call_status = sagejs_ec_lseries_direct_values_acb(
        completed, raw, &diagnostics, coefficient_view.data + 1, available_cutoff,
        conductor, points, cutoffs, point_count, target_bits,
        work_precision);
    packed_coefficient_view_clear(&coefficient_view);
    flint_free(cutoffs);
    fmpz_clear(conductor);
    if (call_status != SAGEJS_EC_LFUNCTION_OK)
    {
        _acb_vec_clear(raw, point_count);
        _acb_vec_clear(completed, point_count);
        _acb_vec_clear(points, point_count);
        napi_throw_range_error(env, NULL,
            call_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT
                ? "direct elliptic L-series request exceeds resource limits"
                : "invalid direct elliptic L-series input");
        return NULL;
    }

    napi_value result, values, status, algorithm, rigorous;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env, napi_create_array_with_length(
            env, point_count_u32, &values)) ||
        !check_napi(env, napi_create_string_utf8(
            env, "ok", NAPI_AUTO_LENGTH, &status)) ||
        !check_napi(env, napi_create_string_utf8(
            env, "direct", NAPI_AUTO_LENGTH, &algorithm)) ||
        !check_napi(env, napi_get_boolean(env, false, &rigorous)) ||
        !set_named(env, result, "status", status) ||
        !set_named(env, result, "algorithm", algorithm) ||
        !set_named(env, result, "values", values) ||
        !set_named(env, result, "rigorous", rigorous) ||
        !set_named_slong(env, result, "precisionBits", target_bits) ||
        !set_named_slong(
            env, result, "workPrecisionBits", work_precision) ||
        !set_named_slong(
            env, result, "cutoff", diagnostics.actual_cutoff) ||
        !set_named_slong(
            env, result, "coefficientTerms", diagnostics.coefficient_terms) ||
        !set_named_slong(env, result, "pointCount", point_count))
        goto direct_failure;

    const slong digits = (slong) ceil((double) target_bits * 0.30103) + 12;
    for (slong index = 0; index < point_count; ++index)
    {
        napi_value item = NULL;
        napi_value raw_object = complex_ball_to_object(
            env, raw + index, digits, target_bits + 32);
        napi_value completed_object = complex_ball_to_object(
            env, completed + index, digits, target_bits + 32);
        if (raw_object == NULL || completed_object == NULL ||
            !check_napi(env, napi_create_object(env, &item)) ||
            !set_named(env, item, "raw", raw_object) ||
            !set_named(env, item, "completed", completed_object) ||
            !check_napi(env, napi_set_element(
                env, values, (uint32_t) index, item)))
            goto direct_failure;
    }
    _acb_vec_clear(raw, point_count);
    _acb_vec_clear(completed, point_count);
    _acb_vec_clear(points, point_count);
    return result;

direct_failure:
    _acb_vec_clear(raw, point_count);
    _acb_vec_clear(completed, point_count);
    _acb_vec_clear(points, point_count);
    return NULL;
}
