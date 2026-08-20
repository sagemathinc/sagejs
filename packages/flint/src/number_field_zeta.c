/*
 * Node-API adapter for packed number-field zeta primitives.
 *
 * Copyright (C) 2026 Sage.js contributors
 * License: GPL-3.0-only
 */

#include "number_field_zeta.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

#include <flint/fmpz.h>
#include <flint/fmpz_vec.h>

#include "number_field_zeta_core.h"

#define SAGEJS_NF_ZETA_MAX_DEGREE 64U
#define SAGEJS_NF_ZETA_MAX_PRIMES 65536U

static int check_napi(napi_env env, napi_status status)
{
    const napi_extended_error_info *info;

    if (status == napi_ok)
        return 1;
    napi_get_last_error_info(env, &info);
    napi_throw_error(env, NULL,
        info != NULL && info->error_message != NULL
            ? info->error_message
            : "Node-API call failed");
    return 0;
}

static int bigint_to_fmpz(napi_env env, napi_value value, fmpz_t result)
{
    size_t count = 0;
    int sign = 0;
    uint64_t *words;

    if (!check_napi(env,
            napi_get_value_bigint_words(env, value, NULL, &count, NULL)))
        return 0;
    if (count == 0)
    {
        fmpz_zero(result);
        return 1;
    }
    words = count == 0 ? NULL : malloc(count * sizeof(*words));
    if (count != 0 && words == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate integer limbs");
        return 0;
    }
    if (!check_napi(env,
            napi_get_value_bigint_words(env, value, &sign, &count, words)))
    {
        free(words);
        return 0;
    }
    fmpz_set_ui_array(result, (const ulong *) words, (slong) count);
    free(words);
    if (sign)
        fmpz_neg(result, result);
    return 1;
}

static int create_uint64_array(
    napi_env env,
    size_t length,
    napi_value *value,
    uint64_t **data)
{
    napi_value buffer;
    void *raw;

    if (!check_napi(env,
            napi_create_arraybuffer(
                env, length * sizeof(uint64_t), &raw, &buffer)) ||
        !check_napi(env,
            napi_create_typedarray(
                env, napi_biguint64_array, length, buffer, 0, value)))
        return 0;
    *data = raw;
    return 1;
}

napi_value sagejs_nf_factor_degrees_batch_value(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[3];
    size_t argc = 3;
    bool coefficients_are_array;
    uint32_t coefficient_count;
    napi_typedarray_type prime_type;
    size_t prime_count;
    void *prime_data;
    napi_value prime_buffer;
    size_t prime_offset;
    fmpz *coefficients = NULL;
    napi_value result;
    napi_value counts_value, exponents_value, degrees_value;
    napi_value degree_value, count_value;
    uint64_t *factor_counts, *exponents, *degrees;
    size_t cells;
    int failure;
    bool materialize_records;

    if (!check_napi(env,
            napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return NULL;
    if (argc != 3)
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return NULL;
    }
    if (!check_napi(env,
            napi_is_array(env, args[0], &coefficients_are_array)) ||
        !coefficients_are_array ||
        !check_napi(env,
            napi_get_array_length(env, args[0], &coefficient_count)))
    {
        if (!coefficients_are_array)
            napi_throw_type_error(env, NULL,
                "coefficients must be an Array of BigInts");
        return NULL;
    }
    if (coefficient_count < 2 ||
        coefficient_count > SAGEJS_NF_ZETA_MAX_DEGREE + 1)
    {
        napi_throw_range_error(env, NULL,
            "polynomial degree must be between 1 and 64");
        return NULL;
    }
    if (!check_napi(env,
            napi_get_typedarray_info(env, args[1], &prime_type, &prime_count,
                &prime_data, &prime_buffer, &prime_offset)))
        return NULL;
    (void) prime_buffer;
    (void) prime_offset;
    if (prime_type != napi_biguint64_array)
    {
        napi_throw_type_error(env, NULL,
            "primes must be a BigUint64Array");
        return NULL;
    }
    if (prime_count > SAGEJS_NF_ZETA_MAX_PRIMES)
    {
        napi_throw_range_error(env, NULL,
            "a factor-degree batch is limited to 65536 primes");
        return NULL;
    }
    if (!check_napi(env,
            napi_get_value_bool(env, args[2], &materialize_records)))
        return NULL;

    coefficients = _fmpz_vec_init((slong) coefficient_count);
    for (uint32_t index = 0; index < coefficient_count; index++)
    {
        napi_value item;
        if (!check_napi(env,
                napi_get_element(env, args[0], index, &item)) ||
            !bigint_to_fmpz(env, item, coefficients + index))
            goto failure;
    }
    if (!fmpz_is_one(coefficients + coefficient_count - 1))
    {
        napi_throw_range_error(env, NULL, "polynomial must be monic");
        goto failure;
    }

    cells = prime_count * (size_t) (coefficient_count - 1);
    if (!create_uint64_array(
            env, prime_count, &counts_value, &factor_counts) ||
        !create_uint64_array(
            env, cells, &exponents_value, &exponents) ||
        !create_uint64_array(env, cells, &degrees_value, &degrees))
        goto failure;

    failure = sagejs_nf_factor_degrees_batch(
        factor_counts,
        exponents,
        degrees,
        coefficients,
        (slong) coefficient_count,
        (const uint64_t *) prime_data,
        (slong) prime_count);
    _fmpz_vec_clear(coefficients, (slong) coefficient_count);
    if (failure != 0)
    {
        napi_throw_range_error(env, NULL,
            "unable to factor the polynomial at a supplied prime");
        return NULL;
    }

    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "factorCounts", counts_value)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "exponents", exponents_value)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "degrees", degrees_value)) ||
        !check_napi(env,
            napi_create_uint32(env, coefficient_count - 1, &degree_value)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "degree", degree_value)) ||
        !check_napi(env,
            napi_create_uint32(env, (uint32_t) prime_count, &count_value)) ||
        !check_napi(env,
            napi_set_named_property(env, result, "primeCount", count_value)))
        return NULL;
    if (materialize_records)
    {
        napi_value records;
        if (!check_napi(env,
                napi_create_array_with_length(env, prime_count, &records)))
            return NULL;
        for (size_t row = 0; row < prime_count; row++)
        {
            napi_value record, version, prime, factors;
            size_t count = (size_t) factor_counts[row];
            if (!check_napi(env, napi_create_object(env, &record)) ||
                !check_napi(env, napi_create_uint32(env, 1, &version)) ||
                !check_napi(env, napi_create_bigint_uint64(
                    env, ((const uint64_t *) prime_data)[row], &prime)) ||
                !check_napi(env,
                    napi_create_array_with_length(env, count, &factors)) ||
                !check_napi(env,
                    napi_set_named_property(env, record, "version", version)) ||
                !check_napi(env,
                    napi_set_named_property(env, record, "prime", prime)) ||
                !check_napi(env,
                    napi_set_named_property(env, record, "factors", factors)))
                return NULL;
            for (size_t index = 0; index < count; index++)
            {
                size_t offset = row * (size_t) (coefficient_count - 1) + index;
                napi_value factor, exponent, residue_degree;
                if (!check_napi(env, napi_create_object(env, &factor)) ||
                    !check_napi(env, napi_create_uint32(
                        env, (uint32_t) exponents[offset], &exponent)) ||
                    !check_napi(env, napi_create_uint32(
                        env, (uint32_t) degrees[offset], &residue_degree)) ||
                    !check_napi(env,
                        napi_set_named_property(env, factor, "e", exponent)) ||
                    !check_napi(env,
                        napi_set_named_property(env, factor, "f", residue_degree)) ||
                    !check_napi(env,
                        napi_set_element(env, factors, (uint32_t) index, factor)))
                    return NULL;
            }
            if (!check_napi(env,
                    napi_set_element(env, records, (uint32_t) row, record)))
                return NULL;
        }
        if (!check_napi(env,
                napi_set_named_property(env, result, "records", records)))
            return NULL;
    }
    return result;

failure:
    if (coefficients != NULL)
        _fmpz_vec_clear(coefficients, (slong) coefficient_count);
    return NULL;
}
