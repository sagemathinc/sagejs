/* Bounded Node adapter around FLINT Arb/Acb Gauss--Legendre primitives. */

#include "period_quadrature.h"

#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include <flint/acb.h>
#include <flint/arb.h>
#include <flint/arb_hypgeom.h>
#include <flint/arf.h>
#include <flint/flint.h>

#define SAGEJS_PERIOD_MIN_PRECISION 32
#define SAGEJS_PERIOD_MAX_PRECISION 1024
#define SAGEJS_PERIOD_MIN_ORDER 8
#define SAGEJS_PERIOD_MAX_ORDER 64
#define SAGEJS_PERIOD_MAX_PANELS 64
#define SAGEJS_PERIOD_MAX_ROOTS 8

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
    const slong work_precision = precision + 32;
    arb_ptr nodes = _arb_vec_init(order);
    arb_ptr weights = _arb_vec_init(order);
    arb_ptr cosines = _arb_vec_init(sample_count);
    arb_ptr sample_weights = _arb_vec_init(sample_count);
    arb_t pi, theta, panel_midpoint, panel_half;
    acb_t midpoint, half_edge, x, residual, square_root;
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
    acb_init(square_root);
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
            acb_sqrt(square_root, residual, work_precision);
            if (!acb_is_finite(square_root) || acb_contains_zero(square_root))
            {
                ok = 0;
                break;
            }
            if (has_previous &&
                period_acb_midpoint_distance_squared(
                    square_root, previous_root, 1) <
                period_acb_midpoint_distance_squared(
                    square_root, previous_root, 0))
                acb_neg(square_root, square_root);
            acb_set(previous_root, square_root);
            has_previous = 1;
            acb_inv(factor, square_root, work_precision);
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
    acb_clear(square_root);
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
