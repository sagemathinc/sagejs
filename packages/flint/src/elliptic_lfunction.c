#include "elliptic_lfunction.h"

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/flint.h>
#include <flint/fmpz.h>
#include <flint/fmpz_vec.h>
#include <node_api.h>

#include "sagejs/elliptic_lfunction_ffi.h"

#define SAGEJS_PI 3.141592653589793238462643383279502884
#define SAGEJS_LN2 0.693147180559945309417232121458176568

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

int sagejs_ec_completed_lseries_jet(
    arb_ptr output,
    arb_t tail_bound,
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
        diagnostics->target_bits = target_bits;
        diagnostics->work_precision = work_precision;
        diagnostics->grid_step = 0.0;
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
    diagnostics->target_bits = target_bits;
    diagnostics->work_precision = work_precision;
    diagnostics->grid_step = h_double;
    diagnostics->rigorous_enclosure = 0;

    arb_t pi, conductor_arb, a, h, y, exponent, q, power, sum, value;
    arb_t jh, factor, term, current_tail;
    arb_init(pi);
    arb_init(conductor_arb);
    arb_init(a);
    arb_init(h);
    arb_init(y);
    arb_init(exponent);
    arb_init(q);
    arb_init(power);
    arb_init(sum);
    arb_init(value);
    arb_init(jh);
    arb_init(factor);
    arb_init(term);
    arb_init(current_tail);

    arb_const_pi(pi, work_precision);
    arb_set_fmpz(conductor_arb, conductor);
    arb_sqrt(conductor_arb, conductor_arb, work_precision);
    arb_mul_ui(a, pi, 2, work_precision);
    arb_div(a, a, conductor_arb, work_precision);
    arb_set_d(h, h_double);

    for (slong index = 0; index < derivative_count; ++index)
        arb_zero(output + index);

    for (slong grid = 0; grid < grid_points; ++grid)
    {
        arb_mul_ui(jh, h, (ulong) grid, work_precision);
        arb_exp(y, jh, work_precision);
        arb_mul(exponent, a, y, work_precision);
        arb_neg(exponent, exponent);
        arb_exp(q, exponent, work_precision);
        arb_one(power);
        arb_zero(sum);
        for (slong n = 1; n <= cutoff; ++n)
        {
            arb_mul(power, power, q, work_precision);
            if (!fmpz_is_zero(coefficients + n - 1))
                arb_addmul_fmpz(
                    sum, power, coefficients + n - 1, work_precision);
        }
        arb_mul(value, y, sum, work_precision);

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

    arb_zero(tail_bound);
    for (slong index = 0; index < derivative_count; ++index)
    {
        const slong order = first_order + index;
        if (((order & 1) == 0) != (root_number == 1)) continue;
        coefficient_tail_bound(
            current_tail, a, cutoff, order, work_precision);
        arb_union(tail_bound, tail_bound, current_tail, work_precision);
    }

    arb_clear(pi);
    arb_clear(conductor_arb);
    arb_clear(a);
    arb_clear(h);
    arb_clear(y);
    arb_clear(exponent);
    arb_clear(q);
    arb_clear(power);
    arb_clear(sum);
    arb_clear(value);
    arb_clear(jh);
    arb_clear(factor);
    arb_clear(term);
    arb_clear(current_tail);
    return (int) diagnostics->status;
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

    bool is_array = false;
    uint32_t coefficient_count = 0;
    if (!check_napi(env, napi_is_array(env, args[2], &is_array)) || !is_array ||
        !check_napi(env,
            napi_get_array_length(env, args[2], &coefficient_count)) ||
        coefficient_count < 2)
    {
        fmpz_clear(conductor);
        napi_throw_type_error(env, NULL,
            "coefficients must be an array containing a_0 through a_K");
        return NULL;
    }

    const slong cutoff = (slong) coefficient_count - 1;
    fmpz *coefficients = _fmpz_vec_init(cutoff);
    int valid = 1;
    for (slong n = 1; n <= cutoff; ++n)
    {
        napi_value coefficient;
        if (!check_napi(env,
                napi_get_element(env, args[2], (uint32_t) n, &coefficient)) ||
            !value_to_fmpz(env, coefficient, coefficients + n - 1))
        {
            valid = 0;
            break;
        }
    }
    if (!valid)
    {
        _fmpz_vec_clear(coefficients, cutoff);
        fmpz_clear(conductor);
        return NULL;
    }

    const slong work_precision = target_bits + 24;
    arb_ptr derivatives = _arb_vec_init(derivative_count);
    arb_t tail_bound;
    arb_init(tail_bound);
    sagejs_ec_lfunction_diagnostics diagnostics;
    const int call_status = sagejs_ec_completed_lseries_jet(
        derivatives, tail_bound, &diagnostics, coefficients, cutoff, conductor,
        (int) root_number, first_order, derivative_count, target_bits,
        work_precision);
    _fmpz_vec_clear(coefficients, cutoff);
    fmpz_clear(conductor);
    if (call_status == SAGEJS_EC_LFUNCTION_INVALID_INPUT ||
        call_status == SAGEJS_EC_LFUNCTION_RESOURCE_LIMIT)
    {
        _arb_vec_clear(derivatives, derivative_count);
        arb_clear(tail_bound);
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
            env, "coefficient_tail_only", NAPI_AUTO_LENGTH, &error_status)) ||
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
        !set_named_slong(env, result, "gridPoints", diagnostics.grid_points))
        goto failure;

    const slong digits = (slong) ceil((double) target_bits * 0.30103) + 8;
    arf_t converted;
    arf_init(converted);
    arb_get_ubound_arf(converted, tail_bound, work_precision);
    napi_value tail = decimal_from_arf(env, converted, digits);
    if (!set_named(env, result, "tailBound", tail))
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
    arb_clear(tail_bound);
    return result;

failure:
    _arb_vec_clear(derivatives, derivative_count);
    arb_clear(tail_bound);
    return NULL;
}
