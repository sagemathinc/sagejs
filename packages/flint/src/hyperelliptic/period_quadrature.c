/* Bounded Node adapter around FLINT Arb/Acb Gauss--Legendre primitives. */

#include "period_quadrature.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <uv.h>

#include <flint/acb.h>
#include <flint/acb_mat.h>
#include <flint/arb.h>
#include <flint/arb_hypgeom.h>
#include <flint/arb_mat.h>
#include <flint/arf.h>
#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz_mat.h>
#include <flint/qqbar.h>

#define SAGEJS_PERIOD_MIN_PRECISION 32
#define SAGEJS_PERIOD_MAX_PRECISION 1024
#define SAGEJS_PERIOD_MIN_ORDER 8
#define SAGEJS_PERIOD_MAX_ORDER 64
#define SAGEJS_PERIOD_MAX_PANELS 64
#define SAGEJS_PERIOD_MAX_ROOTS 8

typedef struct
{
    double real;
    double imaginary;
} sagejs_period_point;

typedef struct
{
    slong index;
    double angle;
    double radius;
} sagejs_period_angular_root;

typedef struct
{
    acb_mat_t period_matrix;
    arb_t model_period;
    arb_t symmetry_defect;
    arb_t conjugation_defect;
    arb_t lattice_imaginary_defect;
    slong component_count;
    slong sign_mask;
    slong sample_evaluations;
    double roots_ms;
    double quadrature_ms;
    double matrix_ms;
    double riemann_ms;
    double conjugation_ms;
    double lattice_ms;
    int initialized;
} sagejs_period_run;

static int period_check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;
    if (status == napi_ok)
        return 1;
    if (napi_get_last_error_info(env, &info) == napi_ok && info != NULL &&
        info->error_message != NULL)
        napi_throw_error(env, NULL, info->error_message);
    else
        napi_throw_error(env, NULL, "hyperelliptic period Node-API failure");
    return 0;
}

static int period_value_to_slong(
    napi_env env, napi_value value, slong lower, slong upper, slong *result)
{
    int64_t converted;
    if (!period_check_napi(env, napi_get_value_int64(env, value, &converted)))
        return 0;
    if (converted < lower || converted > upper)
    {
        napi_throw_range_error(env, NULL,
            "hyperelliptic period parameter exceeds its bounded range");
        return 0;
    }
    *result = (slong) converted;
    return 1;
}

static int period_value_to_arb(
    napi_env env, napi_value value, arb_t result, slong precision)
{
    napi_valuetype type;
    size_t length = 0;
    size_t written = 0;
    char *text;
    int parsed;
    if (!period_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_string)
    {
        napi_throw_type_error(env, NULL,
            "hyperelliptic period components must be decimal strings");
        return 0;
    }
    if (!period_check_napi(env,
            napi_get_value_string_utf8(env, value, NULL, 0, &length)))
        return 0;
    if (length == 0 || length > 4096)
    {
        napi_throw_range_error(env, NULL,
            "hyperelliptic period decimal component is empty or too large");
        return 0;
    }
    text = (char *) malloc(length + 1);
    if (text == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate a hyperelliptic period component");
        return 0;
    }
    if (!period_check_napi(env, napi_get_value_string_utf8(
            env, value, text, length + 1, &written)))
    {
        free(text);
        return 0;
    }
    parsed = arb_set_str(result, text, precision) == 0;
    free(text);
    if (!parsed || !arb_is_finite(result))
    {
        napi_throw_range_error(env, NULL,
            "invalid finite hyperelliptic period component");
        return 0;
    }
    return 1;
}

static int period_value_to_fmpq(
    napi_env env, napi_value value, fmpq_t result)
{
    napi_valuetype type;
    size_t length = 0;
    size_t written = 0;
    char *text;
    int parsed;
    if (!period_check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_string)
    {
        napi_throw_type_error(env, NULL,
            "hyperelliptic polynomial coefficients must be exact strings");
        return 0;
    }
    if (!period_check_napi(env,
            napi_get_value_string_utf8(env, value, NULL, 0, &length)))
        return 0;
    if (length == 0 || length > 4096)
    {
        napi_throw_range_error(env, NULL,
            "hyperelliptic polynomial coefficient is empty or too large");
        return 0;
    }
    text = (char *) malloc(length + 1);
    if (text == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate a hyperelliptic polynomial coefficient");
        return 0;
    }
    if (!period_check_napi(env, napi_get_value_string_utf8(
            env, value, text, length + 1, &written)))
    {
        free(text);
        return 0;
    }
    parsed = fmpq_set_str(result, text, 10) == 0;
    free(text);
    if (!parsed)
    {
        napi_throw_range_error(env, NULL,
            "invalid exact hyperelliptic polynomial coefficient");
        return 0;
    }
    fmpq_canonicalise(result);
    return 1;
}

static int period_values_to_fmpq_poly(
    napi_env env, napi_value value, fmpq_poly_t polynomial,
    slong expected_minimum, slong expected_maximum, int allow_zero,
    slong *length_out)
{
    bool is_array = false;
    uint32_t length = 0;
    slong index;
    fmpq_t coefficient;
    if (!period_check_napi(env, napi_is_array(env, value, &is_array)) ||
        !is_array ||
        !period_check_napi(env,
            napi_get_array_length(env, value, &length)) ||
        length < (uint32_t) expected_minimum ||
        length > (uint32_t) expected_maximum)
    {
        napi_throw_range_error(env, NULL,
            "the completed hyperelliptic polynomial has the wrong bounded degree");
        return 0;
    }
    fmpq_init(coefficient);
    for (index = 0; index < (slong) length; index++)
    {
        napi_value item;
        if (!period_check_napi(env,
                napi_get_element(env, value, (uint32_t) index, &item)) ||
            !period_value_to_fmpq(env, item, coefficient))
        {
            fmpq_clear(coefficient);
            return 0;
        }
        fmpq_poly_set_coeff_fmpq(polynomial, index, coefficient);
    }
    fmpq_clear(coefficient);
    if (fmpq_poly_degree(polynomial) + 1 != (slong) length &&
        !(allow_zero && fmpq_poly_is_zero(polynomial)))
    {
        napi_throw_range_error(env, NULL,
            "the completed hyperelliptic polynomial must have nonzero leading coefficient");
        return 0;
    }
    *length_out = (slong) length;
    return 1;
}

static double period_point_distance(
    const sagejs_period_point *left, const sagejs_period_point *right)
{
    const double real = left->real - right->real;
    const double imaginary = left->imaginary - right->imaginary;
    return hypot(real, imaginary);
}

static double period_orientation(
    const sagejs_period_point *left,
    const sagejs_period_point *right,
    const sagejs_period_point *point)
{
    return (right->imaginary - left->imaginary) *
            (point->real - left->real) -
        (right->real - left->real) *
            (point->imaginary - left->imaginary);
}

static int period_edges_properly_intersect(
    const sagejs_period_point *a_value,
    const sagejs_period_point *b_value,
    const sagejs_period_point *c_value,
    const sagejs_period_point *d_value)
{
    const double first = period_orientation(a_value, b_value, c_value);
    const double second = period_orientation(a_value, b_value, d_value);
    const double third = period_orientation(c_value, d_value, a_value);
    const double fourth = period_orientation(c_value, d_value, b_value);
    return first * second < 0.0 && third * fourth < 0.0;
}

static double period_point_segment_distance(
    const sagejs_period_point *point,
    const sagejs_period_point *left,
    const sagejs_period_point *right)
{
    const double direction_real = right->real - left->real;
    const double direction_imaginary = right->imaginary - left->imaginary;
    const double denominator = direction_real * direction_real +
        direction_imaginary * direction_imaginary;
    double coordinate;
    sagejs_period_point projection;
    if (denominator == 0.0)
        return period_point_distance(point, left);
    coordinate = ((point->real - left->real) * direction_real +
        (point->imaginary - left->imaginary) * direction_imaginary) /
        denominator;
    if (coordinate <= 0.0)
        return period_point_distance(point, left);
    if (coordinate >= 1.0)
        return period_point_distance(point, right);
    projection.real = left->real + coordinate * direction_real;
    projection.imaginary = left->imaginary + coordinate * direction_imaginary;
    return period_point_distance(point, &projection);
}

static int period_path_quality(
    const sagejs_period_point *points, const slong *order, slong count,
    double *clearance_out, double *length_out)
{
    const slong edge_count = count - 1;
    slong first, second, edge, index;
    double clearance = HUGE_VAL;
    double length = 0.0;
    for (first = 0; first < edge_count; first++)
        for (second = first + 2; second < edge_count; second++)
            if (period_edges_properly_intersect(
                    points + order[first], points + order[first + 1],
                    points + order[second], points + order[second + 1]))
                return 0;
    for (edge = 0; edge < edge_count; edge++)
    {
        const slong left = order[edge];
        const slong right = order[edge + 1];
        length += period_point_distance(points + left, points + right);
        for (index = 0; index < count; index++)
        {
            double candidate;
            if (index == left || index == right)
                continue;
            candidate = period_point_segment_distance(
                points + index, points + left, points + right);
            if (candidate < clearance)
                clearance = candidate;
        }
    }
    if (!(clearance > 0.0) || !isfinite(clearance) || !isfinite(length))
        return 0;
    *clearance_out = clearance;
    *length_out = length;
    return 1;
}

static int period_compare_angular_roots(const void *left, const void *right)
{
    const sagejs_period_angular_root *a =
        (const sagejs_period_angular_root *) left;
    const sagejs_period_angular_root *b =
        (const sagejs_period_angular_root *) right;
    if (a->angle < b->angle)
        return -1;
    if (a->angle > b->angle)
        return 1;
    if (a->radius < b->radius)
        return -1;
    if (a->radius > b->radius)
        return 1;
    return a->index < b->index ? -1 : a->index > b->index;
}

static int period_order_lex_less(
    const slong *left, const slong *right, slong count)
{
    slong index;
    for (index = 0; index < count; index++)
    {
        if (left[index] < right[index])
            return 1;
        if (left[index] > right[index])
            return 0;
    }
    return 0;
}

static int period_next_permutation(slong *values, slong count)
{
    slong left = count - 2;
    slong right = count - 1;
    slong swap;
    while (left >= 0 && values[left] >= values[left + 1])
        left--;
    if (left < 0)
        return 0;
    while (values[right] <= values[left])
        right--;
    swap = values[left];
    values[left] = values[right];
    values[right] = swap;
    right = count - 1;
    left++;
    while (left < right)
    {
        swap = values[left];
        values[left] = values[right];
        values[right] = swap;
        left++;
        right--;
    }
    return 1;
}

static int period_plan_branch_order(
    qqbar_srcptr exact_roots, slong root_count, slong precision,
    slong *order, slong *real_root_count_out,
    double *clearance_out, double *scale_out)
{
    sagejs_period_point points[SAGEJS_PERIOD_MAX_ROOTS];
    sagejs_period_angular_root angular[SAGEJS_PERIOD_MAX_ROOTS];
    slong candidate[SAGEJS_PERIOD_MAX_ROOTS];
    slong reversed[SAGEJS_PERIOD_MAX_ROOTS];
    slong tail[SAGEJS_PERIOD_MAX_ROOTS - 1];
    slong best[SAGEJS_PERIOD_MAX_ROOTS];
    slong index, position, anchor;
    slong real_root_count = 0;
    double centroid_real = 0.0;
    double centroid_imaginary = 0.0;
    double scale = 1.0;
    double clearance = 0.0;
    double length = 0.0;
    double best_clearance = -1.0;
    double best_length = HUGE_VAL;
    acb_t approximate;
    acb_init(approximate);
    for (index = 0; index < root_count; index++)
    {
        qqbar_get_acb(approximate, exact_roots + index, precision);
        points[index].real = arf_get_d(
            arb_midref(acb_realref(approximate)), ARF_RND_NEAR);
        points[index].imaginary = arf_get_d(
            arb_midref(acb_imagref(approximate)), ARF_RND_NEAR);
        centroid_real += points[index].real;
        centroid_imaginary += points[index].imaginary;
        if (hypot(points[index].real, points[index].imaginary) > scale)
            scale = hypot(points[index].real, points[index].imaginary);
        if (qqbar_is_real(exact_roots + index))
            real_root_count++;
    }
    acb_clear(approximate);
    if (real_root_count == root_count)
    {
        for (index = 0; index < root_count; index++)
            order[index] = index;
        clearance = HUGE_VAL;
        for (index = 0; index + 1 < root_count; index++)
        {
            double distance = period_point_distance(
                points + index, points + index + 1);
            if (distance < clearance)
                clearance = distance;
        }
        *real_root_count_out = real_root_count;
        *clearance_out = clearance;
        *scale_out = scale;
        return clearance > 0.0;
    }

    centroid_real /= (double) root_count;
    centroid_imaginary /= (double) root_count;
    for (index = 0; index < root_count; index++)
    {
        const double real = points[index].real - centroid_real;
        const double imaginary = points[index].imaginary - centroid_imaginary;
        angular[index].index = index;
        angular[index].angle = atan2(imaginary, real);
        angular[index].radius = hypot(real, imaginary);
    }
    qsort(angular, (size_t) root_count, sizeof(*angular),
        period_compare_angular_roots);
    anchor = 0;
    for (index = 0; index < root_count; index++)
        if (angular[index].index == 0)
            anchor = index;
    for (index = 0; index < root_count; index++)
        candidate[index] = angular[(anchor + index) % root_count].index;
    reversed[0] = 0;
    for (index = 1; index < root_count; index++)
        reversed[index] = candidate[root_count - index];
    if (period_order_lex_less(reversed, candidate, root_count))
        for (index = 0; index < root_count; index++)
            candidate[index] = reversed[index];
    if (period_path_quality(
            points, candidate, root_count, &clearance, &length) &&
        clearance / scale >= 1.0 / 16.0)
    {
        for (index = 0; index < root_count; index++)
            order[index] = candidate[index];
        *real_root_count_out = real_root_count;
        *clearance_out = clearance;
        *scale_out = scale;
        return 1;
    }

    for (index = 0; index < root_count - 1; index++)
        tail[index] = index + 1;
    do
    {
        candidate[0] = 0;
        for (index = 1; index < root_count; index++)
            candidate[index] = tail[index - 1];
        if (period_path_quality(
                points, candidate, root_count, &clearance, &length) &&
            (clearance > best_clearance ||
                (clearance == best_clearance && length < best_length) ||
                (clearance == best_clearance && length == best_length &&
                    period_order_lex_less(candidate, best, root_count))))
        {
            for (position = 0; position < root_count; position++)
                best[position] = candidate[position];
            best_clearance = clearance;
            best_length = length;
        }
    } while (period_next_permutation(tail, root_count - 1));
    if (!(best_clearance > 0.0))
        return 0;
    for (index = 0; index < root_count; index++)
        order[index] = best[index];
    *real_root_count_out = real_root_count;
    *clearance_out = best_clearance;
    *scale_out = scale;
    return 1;
}

static int period_values_to_roots(
    napi_env env, napi_value value, acb_ptr roots, slong count, slong precision)
{
    slong index;
    for (index = 0; index < count; index++)
    {
        napi_value pair, real, imaginary;
        bool is_array = false;
        uint32_t length = 0;
        if (!period_check_napi(env,
                napi_get_element(env, value, (uint32_t) index, &pair)) ||
            !period_check_napi(env, napi_is_array(env, pair, &is_array)) ||
            !is_array ||
            !period_check_napi(env,
                napi_get_array_length(env, pair, &length)) ||
            length != 2)
        {
            napi_throw_type_error(env, NULL,
                "each hyperelliptic branch root must be [real, imaginary]");
            return 0;
        }
        if (!period_check_napi(env, napi_get_element(env, pair, 0, &real)) ||
            !period_check_napi(env, napi_get_element(env, pair, 1, &imaginary)) ||
            !period_value_to_arb(
                env, real, acb_realref(roots + index), precision) ||
            !period_value_to_arb(
                env, imaginary, acb_imagref(roots + index), precision))
            return 0;
    }
    return 1;
}

static double period_acb_midpoint_distance_squared(
    const acb_t left, const acb_t right, int negate_left)
{
    double left_real = arf_get_d(
        arb_midref(acb_realref(left)), ARF_RND_NEAR);
    double left_imaginary = arf_get_d(
        arb_midref(acb_imagref(left)), ARF_RND_NEAR);
    const double right_real = arf_get_d(
        arb_midref(acb_realref(right)), ARF_RND_NEAR);
    const double right_imaginary = arf_get_d(
        arb_midref(acb_imagref(right)), ARF_RND_NEAR);
    double real_difference;
    double imaginary_difference;
    if (negate_left)
    {
        left_real = -left_real;
        left_imaginary = -left_imaginary;
    }
    real_difference = left_real - right_real;
    imaginary_difference = left_imaginary - right_imaginary;
    return real_difference * real_difference +
        imaginary_difference * imaginary_difference;
}

static int period_edge_batch(
    acb_ptr output,
    acb_srcptr roots,
    slong root_count,
    const arb_t leading,
    slong genus,
    slong panels,
    slong order,
    slong precision)
{
    const slong edge_count = 2 * genus;
    const slong sample_count = panels * order;
    const slong work_precision = precision + 16;
    arb_ptr nodes = _arb_vec_init(order);
    arb_ptr weights = _arb_vec_init(order);
    arb_ptr cosines = _arb_vec_init(sample_count);
    arb_ptr sample_weights = _arb_vec_init(sample_count);
    arb_t pi, theta, panel_midpoint, panel_half;
    acb_t midpoint, half_edge, x, residual;
    acb_t previous_root, factor, power, term;
    slong edge, panel, sample, root_index, differential, packed_index;
    int ok = 1;

    arb_init(pi);
    arb_init(theta);
    arb_init(panel_midpoint);
    arb_init(panel_half);
    acb_init(midpoint);
    acb_init(half_edge);
    acb_init(x);
    acb_init(residual);
    acb_init(previous_root);
    acb_init(factor);
    acb_init(power);
    acb_init(term);

    arb_const_pi(pi, work_precision);
    arb_set(panel_half, pi);
    arb_div_ui(panel_half, panel_half, (ulong) (2 * panels), work_precision);
    for (sample = 0; sample < order; sample++)
        arb_hypgeom_legendre_p_ui_root(
            nodes + sample, weights + sample,
            (ulong) order, (ulong) sample, work_precision);
    packed_index = 0;
    for (panel = 0; panel < panels; panel++)
    {
        arb_mul_ui(panel_midpoint, pi, (ulong) (2 * panel + 1), work_precision);
        arb_div_ui(panel_midpoint, panel_midpoint,
            (ulong) (2 * panels), work_precision);
        /* FLINT numbers Legendre roots from positive to negative.  Reverse
           them so square-root continuation follows increasing theta. */
        for (sample = order - 1; sample >= 0; sample--)
        {
            arb_mul(theta, panel_half, nodes + sample, work_precision);
            arb_add(theta, theta, panel_midpoint, work_precision);
            arb_cos(cosines + packed_index, theta, work_precision);
            arb_mul(sample_weights + packed_index,
                panel_half, weights + sample, work_precision);
            packed_index++;
        }
    }

    for (edge = 0; edge < edge_count && ok; edge++)
    {
        int has_previous = 0;
        acb_add(midpoint, roots + edge, roots + edge + 1, work_precision);
        acb_mul_2exp_si(midpoint, midpoint, -1);
        acb_sub(half_edge, roots + edge + 1, roots + edge, work_precision);
        acb_mul_2exp_si(half_edge, half_edge, -1);
        for (sample = 0; sample < sample_count; sample++)
        {
            acb_mul_arb(x, half_edge, cosines + sample, work_precision);
            acb_add(x, x, midpoint, work_precision);
            acb_set_arb(residual, leading);
            acb_neg(residual, residual);
            for (root_index = 0; root_index < root_count; root_index++)
            {
                if (root_index == edge || root_index == edge + 1)
                    continue;
                acb_sub(term, x, roots + root_index, work_precision);
                acb_mul(residual, residual, term, work_precision);
            }
            if (!acb_is_finite(residual) || acb_contains_zero(residual))
            {
                ok = 0;
                break;
            }
            acb_rsqrt(factor, residual, work_precision);
            if (!acb_is_finite(factor))
            {
                ok = 0;
                break;
            }
            if (has_previous &&
                period_acb_midpoint_distance_squared(
                    factor, previous_root, 1) <
                period_acb_midpoint_distance_squared(
                    factor, previous_root, 0))
                acb_neg(factor, factor);
            acb_set(previous_root, factor);
            has_previous = 1;
            acb_mul_arb(
                factor, factor, sample_weights + sample, work_precision);
            acb_one(power);
            for (differential = 0; differential < genus; differential++)
            {
                acb_mul(term, factor, power, work_precision);
                acb_add(output + edge * genus + differential,
                    output + edge * genus + differential,
                    term, work_precision);
                acb_mul(power, power, x, work_precision);
            }
        }
    }

    for (packed_index = 0; packed_index < edge_count * genus; packed_index++)
        if (!acb_is_finite(output + packed_index))
            ok = 0;

    acb_clear(term);
    acb_clear(power);
    acb_clear(factor);
    acb_clear(previous_root);
    acb_clear(residual);
    acb_clear(x);
    acb_clear(half_edge);
    acb_clear(midpoint);
    arb_clear(panel_half);
    arb_clear(panel_midpoint);
    arb_clear(theta);
    arb_clear(pi);
    _arb_vec_clear(sample_weights, sample_count);
    _arb_vec_clear(cosines, sample_count);
    _arb_vec_clear(weights, order);
    _arb_vec_clear(nodes, order);
    return ok;
}

static void period_run_init(sagejs_period_run *run, slong genus)
{
    acb_mat_init(run->period_matrix, genus, 2 * genus);
    arb_init(run->model_period);
    arb_init(run->symmetry_defect);
    arb_init(run->conjugation_defect);
    arb_init(run->lattice_imaginary_defect);
    run->component_count = 0;
    run->sign_mask = -1;
    run->sample_evaluations = 0;
    run->roots_ms = 0.0;
    run->quadrature_ms = 0.0;
    run->matrix_ms = 0.0;
    run->riemann_ms = 0.0;
    run->conjugation_ms = 0.0;
    run->lattice_ms = 0.0;
    run->initialized = 1;
}

static void period_run_clear(sagejs_period_run *run)
{
    if (!run->initialized)
        return;
    arb_clear(run->lattice_imaginary_defect);
    arb_clear(run->conjugation_defect);
    arb_clear(run->symmetry_defect);
    arb_clear(run->model_period);
    acb_mat_clear(run->period_matrix);
    run->initialized = 0;
}

static double period_acb_midpoint_real(const acb_t value)
{
    return arf_get_d(arb_midref(acb_realref(value)), ARF_RND_NEAR);
}

static double period_acb_midpoint_imaginary(const acb_t value)
{
    return arf_get_d(arb_midref(acb_imagref(value)), ARF_RND_NEAR);
}

static void period_canonicalize_edge_values(
    acb_ptr edges, slong edge_count, slong genus)
{
    slong edge, differential, index;
    for (edge = 0; edge < edge_count; edge++)
    {
        int negate = 0;
        for (differential = 0; differential < genus; differential++)
        {
            const acb_t *value = (const acb_t *)
                (edges + edge * genus + differential);
            const double real = period_acb_midpoint_real(*value);
            const double imaginary = period_acb_midpoint_imaginary(*value);
            if (real == 0.0 && imaginary == 0.0)
                continue;
            negate = fabs(real) >= fabs(imaginary) ? real < 0.0 : imaginary < 0.0;
            break;
        }
        if (negate)
            for (index = 0; index < genus; index++)
                acb_neg(edges + edge * genus + index,
                    edges + edge * genus + index);
    }
}

static int period_build_matrices_for_mask(
    acb_mat_t period_matrix, acb_mat_t tau,
    acb_srcptr edges, slong genus, slong mask, slong precision)
{
    acb_mat_t a_matrix, b_matrix;
    slong row, column, item;
    acb_t term;
    int solved;
    acb_mat_init(a_matrix, genus, genus);
    acb_mat_init(b_matrix, genus, genus);
    acb_init(term);
    for (column = 0; column < genus; column++)
    {
        const slong even_sign =
            column == 0 || !(mask & (1L << (2 * column - 1))) ? 1 : -1;
        for (row = 0; row < genus; row++)
        {
            acb_mul_si(acb_mat_entry(a_matrix, row, column),
                edges + (2 * column) * genus + row,
                2 * even_sign, precision);
            for (item = column; item < genus; item++)
            {
                const slong odd_edge = 2 * item + 1;
                const slong odd_sign =
                    mask & (1L << (odd_edge - 1)) ? -1 : 1;
                acb_mul_si(term, edges + odd_edge * genus + row,
                    2 * odd_sign, precision);
                acb_add(acb_mat_entry(b_matrix, row, column),
                    acb_mat_entry(b_matrix, row, column), term, precision);
            }
        }
    }
    solved = acb_mat_solve(tau, a_matrix, b_matrix, precision);
    if (solved)
        for (row = 0; row < genus; row++)
            for (column = 0; column < genus; column++)
            {
                acb_set(acb_mat_entry(period_matrix, row, column),
                    acb_mat_entry(a_matrix, row, column));
                acb_set(acb_mat_entry(period_matrix, row, genus + column),
                    acb_mat_entry(b_matrix, row, column));
            }
    acb_clear(term);
    acb_mat_clear(b_matrix);
    acb_mat_clear(a_matrix);
    return solved;
}

static int period_tau_midpoint_score(
    const acb_mat_t tau, slong genus, double *score_out)
{
    slong row, column;
    double maximum = 1.0;
    double defect = 0.0;
    double y[3][3] = {{0.0}};
    double determinant2;
    for (row = 0; row < genus; row++)
        for (column = 0; column < genus; column++)
        {
            const double real = period_acb_midpoint_real(
                acb_mat_entry(tau, row, column));
            const double imaginary = period_acb_midpoint_imaginary(
                acb_mat_entry(tau, row, column));
            const double magnitude = hypot(real, imaginary);
            const double transpose_real = period_acb_midpoint_real(
                acb_mat_entry(tau, column, row));
            const double transpose_imaginary = period_acb_midpoint_imaginary(
                acb_mat_entry(tau, column, row));
            const double difference = hypot(
                real - transpose_real, imaginary - transpose_imaginary);
            if (magnitude > maximum)
                maximum = magnitude;
            if (difference > defect)
                defect = difference;
            y[row][column] = 0.5 * (imaginary + transpose_imaginary);
        }
    if (!(y[0][0] > 0.0))
        return 0;
    determinant2 = y[0][0] * y[1][1] - y[0][1] * y[0][1];
    if (!(determinant2 > 0.0))
        return 0;
    if (genus == 3)
    {
        const double determinant3 =
            y[0][0] * (y[1][1] * y[2][2] - y[1][2] * y[1][2]) -
            y[0][1] * (y[0][1] * y[2][2] - y[1][2] * y[0][2]) +
            y[0][2] * (y[0][1] * y[1][2] - y[1][1] * y[0][2]);
        if (!(determinant3 > 0.0))
            return 0;
    }
    *score_out = defect / maximum;
    return isfinite(*score_out);
}

static int period_select_sign_mask(
    acb_mat_t period_matrix, acb_mat_t tau,
    acb_srcptr edges, slong genus, slong precision, slong *mask_out)
{
    const slong mask_count = 1L << (2 * genus - 1);
    acb_mat_t candidate_period, candidate_tau;
    slong mask;
    slong best_mask = -1;
    double best_score = HUGE_VAL;
    acb_mat_init(candidate_period, genus, 2 * genus);
    acb_mat_init(candidate_tau, genus, genus);
    for (mask = 0; mask < mask_count; mask++)
    {
        double score;
        acb_mat_zero(candidate_period);
        acb_mat_zero(candidate_tau);
        if (!period_build_matrices_for_mask(
                candidate_period, candidate_tau,
                edges, genus, mask, precision) ||
            !period_tau_midpoint_score(candidate_tau, genus, &score) ||
            score >= best_score)
            continue;
        best_score = score;
        best_mask = mask;
        acb_mat_set(period_matrix, candidate_period);
        acb_mat_set(tau, candidate_tau);
    }
    acb_mat_clear(candidate_tau);
    acb_mat_clear(candidate_period);
    *mask_out = best_mask;
    return best_mask >= 0;
}

static int period_validate_riemann(
    arb_t defect_out, const acb_mat_t tau,
    slong genus, slong validation_bits, slong precision)
{
    arb_mat_t imaginary;
    arb_mat_t principal2;
    arb_t difference, magnitude, scale, tolerance, determinant;
    acb_t delta;
    slong row, column;
    int ok = 1;
    arb_mat_init(imaginary, genus, genus);
    arb_mat_init(principal2, 2, 2);
    arb_init(difference);
    arb_init(magnitude);
    arb_init(scale);
    arb_init(tolerance);
    arb_init(determinant);
    acb_init(delta);
    arb_zero(defect_out);
    arb_one(scale);
    for (row = 0; row < genus; row++)
        for (column = 0; column < genus; column++)
        {
            acb_sub(delta, acb_mat_entry(tau, row, column),
                acb_mat_entry(tau, column, row), precision);
            acb_abs(difference, delta, precision);
            arb_max(defect_out, defect_out, difference, precision);
            acb_abs(magnitude, acb_mat_entry(tau, row, column), precision);
            arb_max(scale, scale, magnitude, precision);
            arb_add(arb_mat_entry(imaginary, row, column),
                acb_imagref(acb_mat_entry(tau, row, column)),
                acb_imagref(acb_mat_entry(tau, column, row)), precision);
            arb_mul_2exp_si(arb_mat_entry(imaginary, row, column),
                arb_mat_entry(imaginary, row, column), -1);
        }
    arb_set(tolerance, scale);
    arb_mul_2exp_si(tolerance, tolerance, -validation_bits);
    if (!arb_lt(defect_out, tolerance) ||
        !arb_is_positive(arb_mat_entry(imaginary, 0, 0)))
        ok = 0;
    for (row = 0; row < 2; row++)
        for (column = 0; column < 2; column++)
            arb_set(arb_mat_entry(principal2, row, column),
                arb_mat_entry(imaginary, row, column));
    arb_mat_det(determinant, principal2, precision);
    if (!arb_is_positive(determinant))
        ok = 0;
    if (genus == 3)
    {
        arb_mat_det(determinant, imaginary, precision);
        if (!arb_is_positive(determinant))
            ok = 0;
    }
    acb_clear(delta);
    arb_clear(determinant);
    arb_clear(tolerance);
    arb_clear(scale);
    arb_clear(magnitude);
    arb_clear(difference);
    arb_mat_clear(principal2);
    arb_mat_clear(imaginary);
    return ok;
}

static int period_validate_integer_action(
    const fmpz_mat_t action, slong genus)
{
    const slong dimension = 2 * genus;
    fmpz_mat_t product, intersection, transpose, temporary, transformed;
    slong row, column;
    fmpz_t negative;
    int ok = 1;
    fmpz_mat_init(product, dimension, dimension);
    fmpz_mat_init(intersection, dimension, dimension);
    fmpz_mat_init(transpose, dimension, dimension);
    fmpz_mat_init(temporary, dimension, dimension);
    fmpz_mat_init(transformed, dimension, dimension);
    fmpz_init(negative);
    fmpz_mat_mul(product, action, action);
    for (row = 0; row < dimension; row++)
        for (column = 0; column < dimension; column++)
        {
            const slong expected = row == column ? 1 : 0;
            if (!fmpz_equal_si(fmpz_mat_entry(product, row, column), expected))
                ok = 0;
            if (row < genus && column == genus + row)
                fmpz_one(fmpz_mat_entry(intersection, row, column));
            else if (row >= genus && column == row - genus)
                fmpz_set_si(fmpz_mat_entry(intersection, row, column), -1);
        }
    fmpz_mat_transpose(transpose, action);
    fmpz_mat_mul(temporary, transpose, intersection);
    fmpz_mat_mul(transformed, temporary, action);
    for (row = 0; row < dimension; row++)
        for (column = 0; column < dimension; column++)
        {
            fmpz_neg(negative, fmpz_mat_entry(intersection, row, column));
            if (!fmpz_equal(
                    fmpz_mat_entry(transformed, row, column), negative))
                ok = 0;
        }
    fmpz_clear(negative);
    fmpz_mat_clear(transformed);
    fmpz_mat_clear(temporary);
    fmpz_mat_clear(transpose);
    fmpz_mat_clear(intersection);
    fmpz_mat_clear(product);
    return ok;
}

static void period_primitive_nullspace_columns(
    fmpz_mat_t space, slong row_count, slong column_count)
{
    fmpz_t divisor, absolute;
    slong row, column;
    fmpz_init(divisor);
    fmpz_init(absolute);
    for (column = 0; column < column_count; column++)
    {
        fmpz_zero(divisor);
        for (row = 0; row < row_count; row++)
        {
            fmpz_abs(absolute, fmpz_mat_entry(space, row, column));
            fmpz_gcd(divisor, divisor, absolute);
        }
        if (!fmpz_is_zero(divisor) && !fmpz_is_one(divisor))
            for (row = 0; row < row_count; row++)
                fmpz_divexact(fmpz_mat_entry(space, row, column),
                    fmpz_mat_entry(space, row, column), divisor);
        for (row = 0; row < row_count; row++)
            if (!fmpz_is_zero(fmpz_mat_entry(space, row, column)))
            {
                if (fmpz_sgn(fmpz_mat_entry(space, row, column)) < 0)
                    for (slong index = 0; index < row_count; index++)
                        fmpz_neg(fmpz_mat_entry(space, index, column),
                            fmpz_mat_entry(space, index, column));
                break;
            }
    }
    fmpz_clear(absolute);
    fmpz_clear(divisor);
}

static int period_recover_conjugation(
    fmpz_mat_t action, arb_t defect_out,
    const acb_mat_t period_matrix, slong genus,
    slong validation_bits, slong precision)
{
    const slong dimension = 2 * genus;
    arb_mat_t real_basis, right, approximate;
    arb_t difference, scale, tolerance, magnitude;
    acb_t combination, delta, term;
    fmpz_t nearest;
    slong row, column, index;
    int ok = 1;
    arb_mat_init(real_basis, dimension, dimension);
    arb_mat_init(right, dimension, dimension);
    arb_mat_init(approximate, dimension, dimension);
    arb_init(difference);
    arb_init(scale);
    arb_init(tolerance);
    arb_init(magnitude);
    acb_init(combination);
    acb_init(delta);
    acb_init(term);
    fmpz_init(nearest);
    for (row = 0; row < dimension; row++)
        for (column = 0; column < dimension; column++)
        {
            const slong period_row = row < genus ? row : row - genus;
            const arb_t *component = row < genus
                ? (const arb_t *) acb_realref(
                    acb_mat_entry(period_matrix, period_row, column))
                : (const arb_t *) acb_imagref(
                    acb_mat_entry(period_matrix, period_row, column));
            arb_set(arb_mat_entry(real_basis, row, column), *component);
            arb_set(arb_mat_entry(right, row, column), *component);
            if (row >= genus)
                arb_neg(arb_mat_entry(right, row, column),
                    arb_mat_entry(right, row, column));
        }
    if (!arb_mat_solve(approximate, real_basis, right, precision))
        ok = 0;
    for (row = 0; row < dimension && ok; row++)
        for (column = 0; column < dimension; column++)
        {
            const arb_t *entry = (const arb_t *)
                arb_mat_entry(approximate, row, column);
            const double midpoint = arf_get_d(arb_midref(*entry), ARF_RND_NEAR);
            arf_get_fmpz(nearest, arb_midref(*entry), ARF_RND_NEAR);
            if (!isfinite(midpoint) ||
                fabs(midpoint - fmpz_get_d(nearest)) > 0.25)
            {
                ok = 0;
                break;
            }
            fmpz_set(fmpz_mat_entry(action, row, column), nearest);
        }
    if (ok && !period_validate_integer_action(action, genus))
        ok = 0;

    arb_zero(defect_out);
    arb_one(scale);
    for (row = 0; row < genus && ok; row++)
        for (column = 0; column < dimension; column++)
        {
            acb_zero(combination);
            for (index = 0; index < dimension; index++)
            {
                acb_mul_fmpz(term,
                    acb_mat_entry(period_matrix, row, index),
                    fmpz_mat_entry(action, index, column), precision);
                acb_add(combination, combination, term, precision);
            }
            acb_conj(delta, acb_mat_entry(period_matrix, row, column));
            acb_sub(delta, delta, combination, precision);
            acb_abs(difference, delta, precision);
            arb_max(defect_out, defect_out, difference, precision);
            acb_abs(magnitude,
                acb_mat_entry(period_matrix, row, column), precision);
            arb_max(scale, scale, magnitude, precision);
        }
    arb_set(tolerance, scale);
    arb_mul_2exp_si(tolerance, tolerance, -validation_bits);
    if (ok && !arb_lt(defect_out, tolerance))
        ok = 0;

    fmpz_clear(nearest);
    acb_clear(term);
    acb_clear(delta);
    acb_clear(combination);
    arb_clear(magnitude);
    arb_clear(tolerance);
    arb_clear(scale);
    arb_clear(difference);
    arb_mat_clear(approximate);
    arb_mat_clear(right);
    arb_mat_clear(real_basis);
    return ok;
}

static int period_real_lattice(
    arb_t model_period_out, arb_t imaginary_defect_out,
    slong *component_count_out,
    const acb_mat_t period_matrix, const fmpz_mat_t action,
    slong genus, slong validation_bits, slong precision)
{
    const slong dimension = 2 * genus;
    fmpz_mat_t fixed_operator, anti_operator;
    fmpz_mat_t fixed_space, anti_space, difference, coordinates, smith;
    fmpq_mat_t anti_columns, rational_difference, rational_coordinates;
    arb_mat_t real_periods;
    acb_t value, term;
    arb_t magnitude, scale, tolerance, determinant;
    fmpz_t component_count;
    slong row, column, index;
    slong fixed_rank, anti_rank;
    int status = 1;
    fmpz_mat_init(fixed_operator, dimension, dimension);
    fmpz_mat_init(anti_operator, dimension, dimension);
    fmpz_mat_init(fixed_space, dimension, dimension);
    fmpz_mat_init(anti_space, dimension, dimension);
    fmpz_mat_init(difference, dimension, dimension);
    fmpz_mat_init(coordinates, genus, dimension);
    fmpz_mat_init(smith, genus, dimension);
    fmpq_mat_init(anti_columns, dimension, genus);
    fmpq_mat_init(rational_difference, dimension, dimension);
    fmpq_mat_init(rational_coordinates, genus, dimension);
    arb_mat_init(real_periods, genus, genus);
    acb_init(value);
    acb_init(term);
    arb_init(magnitude);
    arb_init(scale);
    arb_init(tolerance);
    arb_init(determinant);
    fmpz_init(component_count);
    for (row = 0; row < dimension; row++)
        for (column = 0; column < dimension; column++)
        {
            fmpz_set(fmpz_mat_entry(fixed_operator, row, column),
                fmpz_mat_entry(action, row, column));
            fmpz_set(fmpz_mat_entry(anti_operator, row, column),
                fmpz_mat_entry(action, row, column));
            fmpz_neg(fmpz_mat_entry(difference, row, column),
                fmpz_mat_entry(action, row, column));
            if (row == column)
            {
                fmpz_sub_ui(fmpz_mat_entry(fixed_operator, row, column),
                    fmpz_mat_entry(fixed_operator, row, column), 1);
                fmpz_add_ui(fmpz_mat_entry(anti_operator, row, column),
                    fmpz_mat_entry(anti_operator, row, column), 1);
                fmpz_add_ui(fmpz_mat_entry(difference, row, column),
                    fmpz_mat_entry(difference, row, column), 1);
            }
        }
    fixed_rank = fmpz_mat_nullspace(fixed_space, fixed_operator);
    anti_rank = fmpz_mat_nullspace(anti_space, anti_operator);
    if (fixed_rank != genus || anti_rank != genus)
        status = -1;
    if (status == 1)
    {
        period_primitive_nullspace_columns(fixed_space, dimension, genus);
        period_primitive_nullspace_columns(anti_space, dimension, genus);
    }

    for (row = 0; row < dimension; row++)
        for (column = 0; column < genus; column++)
            fmpq_set_fmpz(fmpq_mat_entry(anti_columns, row, column),
                fmpz_mat_entry(anti_space, row, column));
    for (row = 0; row < dimension; row++)
        for (column = 0; column < dimension; column++)
            fmpq_set_fmpz(fmpq_mat_entry(rational_difference, row, column),
                fmpz_mat_entry(difference, row, column));
    if (status == 1 && !fmpq_mat_can_solve(
            rational_coordinates, anti_columns, rational_difference))
        status = -2;
    for (row = 0; row < genus && status == 1; row++)
        for (column = 0; column < dimension; column++)
        {
            const fmpq *entry = fmpq_mat_entry(
                rational_coordinates, row, column);
            if (!fmpz_is_one(fmpq_denref(entry)))
            {
                status = -3;
                break;
            }
            fmpz_set(fmpz_mat_entry(coordinates, row, column),
                fmpq_numref(entry));
        }
    if (status == 1)
        fmpz_mat_snf(smith, coordinates);
    fmpz_one(component_count);
    for (index = 0; index < genus && status == 1; index++)
    {
        if (fmpz_is_zero(fmpz_mat_entry(smith, index, index)))
        {
            status = -4;
            break;
        }
        fmpz_abs(fmpz_mat_entry(smith, index, index),
            fmpz_mat_entry(smith, index, index));
        fmpz_mul(component_count, component_count,
            fmpz_mat_entry(smith, index, index));
    }
    if (status == 1 && !fmpz_fits_si(component_count))
        status = -4;
    if (status == 1)
        *component_count_out = fmpz_get_si(component_count);

    arb_zero(imaginary_defect_out);
    arb_one(scale);
    for (column = 0; column < genus && status == 1; column++)
        for (row = 0; row < genus; row++)
        {
            acb_zero(value);
            for (index = 0; index < dimension; index++)
            {
                acb_mul_fmpz(term,
                    acb_mat_entry(period_matrix, row, index),
                    fmpz_mat_entry(fixed_space, index, column), precision);
                acb_add(value, value, term, precision);
            }
            arb_set(arb_mat_entry(real_periods, row, column), acb_realref(value));
            arb_abs(magnitude, acb_imagref(value));
            arb_max(imaginary_defect_out,
                imaginary_defect_out, magnitude, precision);
            arb_abs(magnitude, acb_realref(value));
            arb_max(scale, scale, magnitude, precision);
        }
    arb_set(tolerance, scale);
    arb_mul_2exp_si(tolerance, tolerance, -validation_bits);
    if (status == 1 && !arb_lt(imaginary_defect_out, tolerance))
        status = -5;
    if (status == 1)
    {
        arb_mat_det(determinant, real_periods, precision);
        arb_abs(determinant, determinant);
        arb_mul_fmpz(model_period_out, determinant, component_count, precision);
        if (!arb_is_positive(model_period_out) ||
            !arb_is_finite(model_period_out))
            status = -6;
    }

    fmpz_clear(component_count);
    arb_clear(determinant);
    arb_clear(tolerance);
    arb_clear(scale);
    arb_clear(magnitude);
    acb_clear(term);
    acb_clear(value);
    arb_mat_clear(real_periods);
    fmpq_mat_clear(rational_coordinates);
    fmpq_mat_clear(rational_difference);
    fmpq_mat_clear(anti_columns);
    fmpz_mat_clear(smith);
    fmpz_mat_clear(coordinates);
    fmpz_mat_clear(difference);
    fmpz_mat_clear(anti_space);
    fmpz_mat_clear(fixed_space);
    fmpz_mat_clear(anti_operator);
    fmpz_mat_clear(fixed_operator);
    return status;
}

static int period_compute_run(
    sagejs_period_run *run,
    qqbar_srcptr exact_roots, const slong *order, slong root_count,
    const fmpq_t leading, slong genus, slong panels, slong quadrature_order,
    slong precision, slong preferred_mask)
{
    const slong edge_count = 2 * genus;
    const slong value_count = edge_count * genus;
    const slong validation_bits = FLINT_MAX(24, FLINT_MIN(100, precision / 2));
    acb_ptr roots = _acb_vec_init(root_count);
    acb_ptr edges = _acb_vec_init(value_count);
    acb_mat_t tau;
    fmpz_mat_t action;
    arb_t leading_arb;
    slong index;
    int status = 1;
    uint64_t stage_started;
    acb_mat_init(tau, genus, genus);
    fmpz_mat_init(action, 2 * genus, 2 * genus);
    arb_init(leading_arb);
    period_run_init(run, genus);
    stage_started = uv_hrtime();
    for (index = 0; index < root_count; index++)
        qqbar_get_acb(roots + index, exact_roots + order[index], precision + 16);
    arb_set_fmpq(leading_arb, leading, precision + 16);
    run->roots_ms = (double) (uv_hrtime() - stage_started) / 1.0e6;
    stage_started = uv_hrtime();
    if (!period_edge_batch(edges, roots, root_count, leading_arb,
            genus, panels, quadrature_order, precision))
        status = -1;
    if (status == 1)
        period_canonicalize_edge_values(edges, edge_count, genus);
    run->quadrature_ms = (double) (uv_hrtime() - stage_started) / 1.0e6;
    stage_started = uv_hrtime();
    if (status == 1)
    {
        if (preferred_mask >= 0)
        {
            double score;
            if (!period_build_matrices_for_mask(
                    run->period_matrix, tau, edges,
                    genus, preferred_mask, precision) ||
                !period_tau_midpoint_score(tau, genus, &score))
                status = -2;
            else
                run->sign_mask = preferred_mask;
        }
        else if (!period_select_sign_mask(
                run->period_matrix, tau, edges, genus, precision,
                &run->sign_mask))
            status = -2;
    }
    run->matrix_ms = (double) (uv_hrtime() - stage_started) / 1.0e6;
    stage_started = uv_hrtime();
    if (status == 1 && !period_validate_riemann(
            run->symmetry_defect, tau, genus, validation_bits, precision))
        status = -3;
    run->riemann_ms = (double) (uv_hrtime() - stage_started) / 1.0e6;
    stage_started = uv_hrtime();
    if (status == 1 && !period_recover_conjugation(
            action, run->conjugation_defect, run->period_matrix,
            genus, validation_bits - 7, precision))
        status = -4;
    run->conjugation_ms = (double) (uv_hrtime() - stage_started) / 1.0e6;
    stage_started = uv_hrtime();
    if (status == 1)
    {
        const int lattice_status = period_real_lattice(
            run->model_period, run->lattice_imaginary_defect,
            &run->component_count, run->period_matrix, action,
            genus, validation_bits - 7, precision);
        if (lattice_status != 1)
            status = -50 + lattice_status;
    }
    run->lattice_ms = (double) (uv_hrtime() - stage_started) / 1.0e6;
    run->sample_evaluations = edge_count * panels * quadrature_order;
    arb_clear(leading_arb);
    fmpz_mat_clear(action);
    acb_mat_clear(tau);
    _acb_vec_clear(edges, value_count);
    _acb_vec_clear(roots, root_count);
    return status;
}

static int period_runs_stable(
    arb_t difference_out, arb_t tolerance_out,
    const sagejs_period_run *left, const sagejs_period_run *right,
    slong requested_precision, slong work_precision)
{
    const slong target_bits = FLINT_MAX(
        20, FLINT_MIN(80, requested_precision / 2));
    arb_t difference, scale, magnitude;
    acb_t delta;
    slong row, column;
    int stable;
    arb_init(difference);
    arb_init(scale);
    arb_init(magnitude);
    acb_init(delta);
    arb_zero(difference_out);
    arb_one(scale);
    for (row = 0; row < acb_mat_nrows(right->period_matrix); row++)
        for (column = 0; column < acb_mat_ncols(right->period_matrix); column++)
        {
            acb_sub(delta,
                acb_mat_entry(right->period_matrix, row, column),
                acb_mat_entry(left->period_matrix, row, column),
                work_precision);
            acb_abs(difference, delta, work_precision);
            arb_max(difference_out, difference_out, difference, work_precision);
            acb_abs(magnitude,
                acb_mat_entry(right->period_matrix, row, column),
                work_precision);
            arb_max(scale, scale, magnitude, work_precision);
        }
    arb_sub(difference,
        right->model_period, left->model_period, work_precision);
    arb_abs(difference, difference);
    arb_max(difference_out, difference_out, difference, work_precision);
    arb_abs(magnitude, right->model_period);
    arb_max(scale, scale, magnitude, work_precision);
    arb_set(tolerance_out, scale);
    arb_mul_2exp_si(tolerance_out, tolerance_out, -target_bits);
    stable = arb_lt(difference_out, tolerance_out);
    acb_clear(delta);
    arb_clear(magnitude);
    arb_clear(scale);
    arb_clear(difference);
    return stable;
}

static slong period_achieved_stability_bits(
    const arb_t difference, const arb_t tolerance,
    slong requested_precision, slong work_precision)
{
    const slong target_bits = FLINT_MAX(
        20, FLINT_MIN(80, requested_precision / 2));
    arb_t ratio;
    arf_t upper;
    slong exponent_bound, achieved;
    if (arb_is_zero(difference))
        return FLINT_MIN(requested_precision, work_precision);
    arb_init(ratio);
    arf_init(upper);
    arb_div(ratio, difference, tolerance, work_precision);
    arb_get_abs_ubound_arf(upper, ratio, work_precision);
    exponent_bound = arf_abs_bound_lt_2exp_si(upper);
    achieved = target_bits - exponent_bound;
    if (achieved < 0)
        achieved = 0;
    if (achieved > requested_precision)
        achieved = requested_precision;
    if (achieved > work_precision)
        achieved = work_precision;
    arf_clear(upper);
    arb_clear(ratio);
    return achieved;
}

static napi_value period_decimal_from_arf(
    napi_env env, const arf_t value, slong digits)
{
    char *text = arf_get_str(value, digits);
    napi_value result;
    int ok = text != NULL && period_check_napi(env,
        napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &result));
    if (text != NULL)
        flint_free(text);
    return ok ? result : NULL;
}

static int period_set_named(
    napi_env env, napi_value object, const char *name, napi_value value)
{
    return value != NULL && period_check_napi(env,
        napi_set_named_property(env, object, name, value));
}

static int period_set_named_slong(
    napi_env env, napi_value object, const char *name, slong value)
{
    napi_value converted;
    return period_check_napi(env,
            napi_create_int64(env, (int64_t) value, &converted)) &&
        period_set_named(env, object, name, converted);
}

static int period_set_named_double(
    napi_env env, napi_value object, const char *name, double value)
{
    napi_value converted;
    return period_check_napi(env,
            napi_create_double(env, value, &converted)) &&
        period_set_named(env, object, name, converted);
}

static napi_value period_ball_to_object(
    napi_env env, const acb_t value, slong digits, slong accuracy_cap)
{
    napi_value result, real, imaginary, real_radius, imaginary_radius, accuracy;
    arf_t radius;
    slong accuracy_bits = acb_rel_accuracy_bits(value);
    if (accuracy_bits > accuracy_cap)
        accuracy_bits = accuracy_cap;
    if (!period_check_napi(env, napi_create_object(env, &result)))
        return NULL;
    real = period_decimal_from_arf(
        env, arb_midref(acb_realref(value)), digits);
    imaginary = period_decimal_from_arf(
        env, arb_midref(acb_imagref(value)), digits);
    arf_init(radius);
    arf_set_mag(radius, arb_radref(acb_realref(value)));
    real_radius = period_decimal_from_arf(env, radius, digits);
    arf_set_mag(radius, arb_radref(acb_imagref(value)));
    imaginary_radius = period_decimal_from_arf(env, radius, digits);
    arf_clear(radius);
    if (!period_check_napi(env,
            napi_create_int64(env, (int64_t) accuracy_bits, &accuracy)) ||
        !period_set_named(env, result, "realMidpoint", real) ||
        !period_set_named(env, result, "imagMidpoint", imaginary) ||
        !period_set_named(env, result, "realRadius", real_radius) ||
        !period_set_named(env, result, "imagRadius", imaginary_radius) ||
        !period_set_named(env, result, "accuracyBits", accuracy))
        return NULL;
    return result;
}

napi_value sagejs_hyperelliptic_real_period_arb(
    napi_env env, napi_callback_info info)
{
    napi_value args[7];
    size_t argc = 7;
    slong genus, requested_precision, max_refinements;
    slong initial_panels, base_panels, quadrature_order;
    slong coefficient_count = 0;
    slong root_count, real_root_count = 0;
    slong order[SAGEJS_PERIOD_MAX_ROOTS];
    slong refinement, completed_runs = 0, selected_run = -1;
    slong total_samples = 0;
    slong validation_stage = 0;
    double clearance = 0.0, root_scale = 1.0;
    fmpq_poly_t polynomial, f_value, h_value, derivative, gcd;
    fmpq_t leading;
    qqbar_ptr exact_roots = NULL;
    sagejs_period_run runs[6];
    arb_t difference, tolerance;
    napi_value result = NULL;
    napi_value status = NULL;
    napi_value run_values = NULL;
    napi_value order_values = NULL;
    napi_value stage_timings = NULL;
    const char *status_text = "unsupported";
    slong index;
    uint64_t operation_started, model_validated, roots_isolated;
    uint64_t branch_planned, refinements_completed, result_assembled;

    memset(runs, 0, sizeof(runs));
    operation_started = uv_hrtime();

    if (!period_check_napi(env,
            napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != 7)
    {
        napi_throw_type_error(env, NULL,
            "hyperellipticRealPeriodArb expects f coefficients, h coefficients, "
            "genus, precision, refinements, initial panels, and quadrature order");
        return NULL;
    }
    if (!period_value_to_slong(env, args[2], 2, 3, &genus) ||
        !period_value_to_slong(env, args[3],
            SAGEJS_PERIOD_MIN_PRECISION, SAGEJS_PERIOD_MAX_PRECISION,
            &requested_precision) ||
        !period_value_to_slong(env, args[4], 2, 6, &max_refinements) ||
        !period_value_to_slong(
            env, args[5], 1, SAGEJS_PERIOD_MAX_PANELS, &initial_panels) ||
        !period_value_to_slong(env, args[6],
            SAGEJS_PERIOD_MIN_ORDER, SAGEJS_PERIOD_MAX_ORDER,
            &quadrature_order))
        return NULL;
    base_panels = genus == 3 && initial_panels < 4 ? 4 : initial_panels;

    fmpq_poly_init(polynomial);
    fmpq_poly_init(f_value);
    fmpq_poly_init(h_value);
    fmpq_poly_init(derivative);
    fmpq_poly_init(gcd);
    fmpq_init(leading);
    arb_init(difference);
    arb_init(tolerance);
    if (!period_values_to_fmpq_poly(env, args[0], f_value,
            1, 2 * genus + 3, 0, &coefficient_count) ||
        !period_values_to_fmpq_poly(env, args[1], h_value,
            1, genus + 3, 1, &coefficient_count))
        goto cleanup;
    fmpq_poly_mul(polynomial, h_value, h_value);
    fmpq_poly_scalar_mul_si(f_value, f_value, 4);
    fmpq_poly_add(polynomial, polynomial, f_value);
    coefficient_count = fmpq_poly_degree(polynomial) + 1;
    root_count = coefficient_count - 1;
    if (root_count != 2 * genus + 1 && root_count != 2 * genus + 2)
    {
        napi_throw_range_error(env, NULL,
            "the completed polynomial must have degree 2g+1 or 2g+2");
        goto cleanup;
    }
    fmpq_poly_derivative(derivative, polynomial);
    fmpq_poly_gcd(gcd, polynomial, derivative);
    if (fmpq_poly_degree(gcd) != 0)
    {
        napi_throw_range_error(env, NULL,
            "the completed hyperelliptic polynomial must be squarefree");
        goto cleanup;
    }
    model_validated = uv_hrtime();
    fmpq_poly_get_coeff_fmpq(leading, polynomial, root_count);
    exact_roots = _qqbar_vec_init(root_count);
    qqbar_roots_fmpq_poly(exact_roots, polynomial, 0);
    roots_isolated = uv_hrtime();
    if (!period_plan_branch_order(exact_roots, root_count,
            requested_precision + 96, order, &real_root_count,
            &clearance, &root_scale))
    {
        status_text = "branch_chain_not_isolated";
        branch_planned = uv_hrtime();
        refinements_completed = branch_planned;
        goto make_result;
    }
    branch_planned = uv_hrtime();

    for (refinement = 0; refinement < max_refinements; refinement++)
    {
        const slong work_precision =
            requested_precision + 32 * (refinement + 1);
        slong panels = base_panels * (1L << refinement);
        slong order_value = quadrature_order;
        if (clearance / root_scale < 1.0 / 1024.0)
        {
            panels *= 4;
            if (order_value < 64)
                order_value = 64;
        }
        else if (clearance / root_scale < 1.0 / 16.0)
        {
            panels *= 2;
            if (order_value < 32)
                order_value = 32;
        }
        if (panels > SAGEJS_PERIOD_MAX_PANELS)
        {
            status_text = "bounded_work_exceeded";
            break;
        }
        validation_stage = period_compute_run(runs + refinement,
            exact_roots, order, root_count,
            leading, genus, panels,
            order_value, work_precision,
            refinement == 0 ? -1 : runs[refinement - 1].sign_mask);
        if (validation_stage != 1)
        {
            status_text = "validation_failed";
            break;
        }
        completed_runs++;
        total_samples += runs[refinement].sample_evaluations;
        if (refinement > 0 &&
            runs[refinement - 1].sign_mask == runs[refinement].sign_mask &&
            period_runs_stable(difference, tolerance,
                runs + refinement - 1, runs + refinement,
                requested_precision, work_precision))
        {
            selected_run = refinement;
            status_text = "ok";
            break;
        }
    }
    refinements_completed = uv_hrtime();

make_result:
    if (!period_check_napi(env, napi_create_object(env, &result)) ||
        !period_check_napi(env, napi_create_string_utf8(
            env, status_text, NAPI_AUTO_LENGTH, &status)) ||
        !period_check_napi(env,
            napi_create_array_with_length(
                env, (size_t) completed_runs, &run_values)) ||
        !period_check_napi(env,
            napi_create_array_with_length(
                env, (size_t) root_count, &order_values)) ||
        !period_check_napi(env, napi_create_object(env, &stage_timings)) ||
        !period_set_named(env, result, "status", status) ||
        !period_set_named(env, result, "refinementRuns", run_values) ||
        !period_set_named(env, result, "branchOrder", order_values) ||
        !period_set_named(env, result, "stageTimingsMs", stage_timings) ||
        !period_set_named_slong(env, result, "requestedPrecisionBits",
            requested_precision) ||
        !period_set_named_slong(env, result, "genus", genus) ||
        !period_set_named_slong(env, result, "rootCount", root_count) ||
        !period_set_named_slong(env, result, "realRootCount", real_root_count) ||
        !period_set_named_slong(env, result, "validationStage", validation_stage) ||
        !period_set_named_slong(env, result, "sampleEvaluations", total_samples))
    {
        result = NULL;
        goto cleanup;
    }
    for (index = 0; index < root_count; index++)
    {
        napi_value value;
        if (!period_check_napi(env,
                napi_create_int64(env, (int64_t) order[index], &value)) ||
            !period_check_napi(env,
                napi_set_element(env, order_values, (uint32_t) index, value)))
        {
            result = NULL;
            goto cleanup;
        }
    }
    for (index = 0; index < completed_runs; index++)
    {
        napi_value item;
        napi_value engine;
        napi_value run_timings;
        slong panels = base_panels * (1L << index);
        slong order_value = quadrature_order;
        if (clearance / root_scale < 1.0 / 1024.0)
        {
            panels *= 4;
            if (order_value < 64)
                order_value = 64;
        }
        else if (clearance / root_scale < 1.0 / 16.0)
        {
            panels *= 2;
            if (order_value < 32)
                order_value = 32;
        }
        if (!period_check_napi(env, napi_create_object(env, &item)) ||
            !period_check_napi(env, napi_create_object(env, &run_timings)) ||
            !period_check_napi(env, napi_create_string_utf8(env,
                "arb-acb-complete-period", NAPI_AUTO_LENGTH, &engine)) ||
            !period_set_named(env, item, "engine", engine) ||
            !period_set_named(env, item, "stageTimingsMs", run_timings) ||
            !period_set_named_double(env, run_timings,
                "rootConversion", runs[index].roots_ms) ||
            !period_set_named_double(env, run_timings,
                "quadrature", runs[index].quadrature_ms) ||
            !period_set_named_double(env, run_timings,
                "matrixAssembly", runs[index].matrix_ms) ||
            !period_set_named_double(env, run_timings,
                "riemannValidation", runs[index].riemann_ms) ||
            !period_set_named_double(env, run_timings,
                "conjugationValidation", runs[index].conjugation_ms) ||
            !period_set_named_double(env, run_timings,
                "realLattice", runs[index].lattice_ms) ||
            !period_set_named_slong(env, item, "workPrecisionBits",
                requested_precision + 32 * (index + 1)) ||
            !period_set_named_slong(env, item, "quadraturePanels", panels) ||
            !period_set_named_slong(env, item, "quadratureOrder", order_value) ||
            !period_set_named_slong(env, item, "sampleEvaluations",
                runs[index].sample_evaluations) ||
            !period_check_napi(env,
                napi_set_element(env, run_values, (uint32_t) index, item)))
        {
            result = NULL;
            goto cleanup;
        }
    }
    if (selected_run >= 0)
    {
        napi_value model_period = period_decimal_from_arf(env,
            arb_midref(runs[selected_run].model_period),
            (slong) ceil((double) requested_precision *
                0.3010299956639812) + 10);
        napi_value difference_value = period_decimal_from_arf(env,
            arb_midref(difference),
            (slong) ceil((double) requested_precision *
                0.3010299956639812) + 10);
        napi_value tolerance_value = period_decimal_from_arf(env,
            arb_midref(tolerance),
            (slong) ceil((double) requested_precision *
                0.3010299956639812) + 10);
        napi_value clearance_value;
        char clearance_text[64];
        snprintf(clearance_text, sizeof(clearance_text), "%.17g", clearance);
        if (!period_check_napi(env, napi_create_string_utf8(env,
                clearance_text, NAPI_AUTO_LENGTH, &clearance_value)) ||
            !period_set_named(env, result, "modelPeriod", model_period) ||
            !period_set_named(env, result,
                "refinementDifference", difference_value) ||
            !period_set_named(env, result,
                "refinementTolerance", tolerance_value) ||
            !period_set_named(env, result,
                "branchChainClearance", clearance_value) ||
            !period_set_named_slong(env, result, "workPrecisionBits",
                requested_precision + 32 * (selected_run + 1)) ||
            !period_set_named_slong(env, result, "achievedStabilityBits",
                period_achieved_stability_bits(difference, tolerance,
                    requested_precision,
                    requested_precision + 32 * (selected_run + 1))) ||
            !period_set_named_slong(env, result, "realComponents",
                runs[selected_run].component_count) ||
            !period_set_named_slong(env, result, "arithmeticAccuracyBits",
                FLINT_MIN(requested_precision,
                    arb_rel_accuracy_bits(runs[selected_run].model_period))))
        {
            result = NULL;
            goto cleanup;
        }
    }
    result_assembled = uv_hrtime();
    if (!period_set_named_double(env, stage_timings, "modelValidation",
            (double) (model_validated - operation_started) / 1.0e6) ||
        !period_set_named_double(env, stage_timings, "exactRootIsolation",
            (double) (roots_isolated - model_validated) / 1.0e6) ||
        !period_set_named_double(env, stage_timings, "branchPlanning",
            (double) (branch_planned - roots_isolated) / 1.0e6) ||
        !period_set_named_double(env, stage_timings, "refinementAssembly",
            (double) (refinements_completed - branch_planned) / 1.0e6) ||
        !period_set_named_double(env, stage_timings, "resultAssembly",
            (double) (result_assembled - refinements_completed) / 1.0e6))
        result = NULL;

cleanup:
    for (index = 0; index < 6; index++)
        period_run_clear(runs + index);
    if (exact_roots != NULL)
        _qqbar_vec_clear(exact_roots, root_count);
    arb_clear(tolerance);
    arb_clear(difference);
    fmpq_clear(leading);
    fmpq_poly_clear(gcd);
    fmpq_poly_clear(derivative);
    fmpq_poly_clear(h_value);
    fmpq_poly_clear(f_value);
    fmpq_poly_clear(polynomial);
    return result;
}

napi_value sagejs_hyperelliptic_period_edge_batch_arb(
    napi_env env, napi_callback_info info)
{
    napi_value args[6];
    size_t argc = 6;
    bool is_array = false;
    uint32_t root_count_u32 = 0;
    slong genus, panels, order, precision;
    slong root_count, value_count, index;
    acb_ptr roots = NULL;
    acb_ptr output = NULL;
    arb_t leading;
    napi_value result = NULL;
    napi_value status = NULL;
    napi_value values = NULL;
    const char *status_text = "nonfinite";

    if (!period_check_napi(env,
            napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != 6)
    {
        napi_throw_type_error(env, NULL,
            "hyperellipticPeriodEdgeBatchArb expects roots, leading, genus, "
            "panels, quadrature order, and precision");
        return NULL;
    }
    if (!period_value_to_slong(env, args[2], 2, 3, &genus) ||
        !period_value_to_slong(
            env, args[3], 1, SAGEJS_PERIOD_MAX_PANELS, &panels) ||
        !period_value_to_slong(env, args[4],
            SAGEJS_PERIOD_MIN_ORDER, SAGEJS_PERIOD_MAX_ORDER, &order) ||
        !period_value_to_slong(env, args[5],
            SAGEJS_PERIOD_MIN_PRECISION, SAGEJS_PERIOD_MAX_PRECISION,
            &precision))
        return NULL;
    if (!period_check_napi(env, napi_is_array(env, args[0], &is_array)) ||
        !is_array ||
        !period_check_napi(env,
            napi_get_array_length(env, args[0], &root_count_u32)) ||
        root_count_u32 < (uint32_t) (2 * genus + 1) ||
        root_count_u32 > (uint32_t) (2 * genus + 2) ||
        root_count_u32 > SAGEJS_PERIOD_MAX_ROOTS)
    {
        napi_throw_range_error(env, NULL,
            "branch roots must have the completed degree 2g+1 or 2g+2");
        return NULL;
    }
    root_count = (slong) root_count_u32;
    value_count = 2 * genus * genus;
    roots = _acb_vec_init(root_count);
    output = _acb_vec_init(value_count);
    arb_init(leading);
    if (!period_values_to_roots(
            env, args[0], roots, root_count, precision + 32) ||
        !period_value_to_arb(env, args[1], leading, precision + 32))
        goto cleanup;

    if (period_edge_batch(output, roots, root_count, leading,
            genus, panels, order, precision))
        status_text = "ok";
    if (!period_check_napi(env, napi_create_object(env, &result)) ||
        !period_check_napi(env, napi_create_string_utf8(
            env, status_text, NAPI_AUTO_LENGTH, &status)) ||
        !period_check_napi(env,
            napi_create_array_with_length(env, (size_t) value_count, &values)) ||
        !period_set_named(env, result, "status", status) ||
        !period_set_named(env, result, "values", values) ||
        !period_set_named_slong(env, result, "precisionBits", precision) ||
        !period_set_named_slong(
            env, result, "workPrecisionBits", precision + 32) ||
        !period_set_named_slong(env, result, "rootCount", root_count) ||
        !period_set_named_slong(env, result, "edgeCount", 2 * genus) ||
        !period_set_named_slong(env, result, "genus", genus) ||
        !period_set_named_slong(env, result, "panels", panels) ||
        !period_set_named_slong(env, result, "quadratureOrder", order) ||
        !period_set_named_slong(env, result, "sampleEvaluations",
            2 * genus * panels * order))
    {
        result = NULL;
        goto cleanup;
    }
    for (index = 0; index < value_count; index++)
    {
        napi_value item = period_ball_to_object(
            env, output + index,
            (slong) ceil((double) precision * 0.3010299956639812) + 10,
            precision);
        if (item == NULL || !period_check_napi(env,
                napi_set_element(env, values, (uint32_t) index, item)))
        {
            result = NULL;
            goto cleanup;
        }
    }

cleanup:
    arb_clear(leading);
    _acb_vec_clear(output, value_count);
    _acb_vec_clear(roots, root_count);
    return result;
}
