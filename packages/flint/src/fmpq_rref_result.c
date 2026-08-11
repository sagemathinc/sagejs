#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>

#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/ulong_extras.h>

#include <sagejs/ffi_algorithms.h>

#include "fmpq_rref_result.h"

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

static int require_arguments(
    napi_env env,
    napi_callback_info info,
    size_t expected,
    napi_value *args)
{
    size_t argc = expected;

    if (!check_napi(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL)))
        return 0;
    if (argc != expected)
    {
        napi_throw_type_error(env, NULL, "wrong number of arguments");
        return 0;
    }
    return 1;
}

static napi_value ulong_to_bigint(napi_env env, ulong value)
{
    napi_value result;

    if (!check_napi(env,
        napi_create_bigint_uint64(env, (uint64_t) value, &result)))
        return NULL;
    return result;
}

/* Declared exact-output resources keep one expensive FLINT result alive while
 * JavaScript allocates caller-owned IntegerBuffers of the measured size.  The
 * host adapter below only understands the public signed-limb buffer ABI; the
 * mathematical operation and native-compiler lifetime live in
 * sagejs/ffi_algorithms.h. */
#define SAGEJS_FMPQ_RREF_RESULT_MAGIC UINT64_C(0x534A535252454651)

typedef struct
{
    int32_t *sizes;
    uint64_t *limbs;
    size_t length;
    size_t word_capacity;
} sagejs_packed_integer_view;

typedef struct
{
    uint64_t magic;
    sagejs_flint_fmpq_rref_result_t value;
} sagejs_fmpq_rref_result_value;

static const napi_type_tag sagejs_fmpq_rref_result_type_tag = {
    UINT64_C(0xc4e39584e03bd8d2),
    UINT64_C(0x831eef159417c7fa)
};

static int bigint_to_matrix_dimension(
    napi_env env,
    napi_value value,
    ulong *result)
{
    napi_valuetype type;
    uint64_t word;
    bool lossless;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL,
            "matrix dimensions must be BigInts");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_uint64(env, value, &word, &lossless)))
        return 0;
    if (!lossless || word > (uint64_t) WORD_MAX)
    {
        napi_throw_range_error(env, NULL,
            "matrix dimensions are outside the supported range");
        return 0;
    }
    *result = (ulong) word;
    return 1;
}

static int size_property(
    napi_env env,
    napi_value object,
    const char *name,
    size_t *result)
{
    napi_value value;
    double number;

    if (!check_napi(env,
        napi_get_named_property(env, object, name, &value)) ||
        !check_napi(env, napi_get_value_double(env, value, &number)))
        return 0;
    if (!isfinite(number) || floor(number) != number || number < 0 ||
        number > 9007199254740991.0 || number > (double) SIZE_MAX)
    {
        napi_throw_range_error(env, NULL,
            "invalid packed IntegerBuffer dimensions");
        return 0;
    }
    *result = (size_t) number;
    if ((double) *result != number)
    {
        napi_throw_range_error(env, NULL,
            "invalid packed IntegerBuffer dimensions");
        return 0;
    }
    return 1;
}

static int packed_integer_view(
    napi_env env,
    napi_value object,
    size_t expected_length,
    sagejs_packed_integer_view *view)
{
    napi_value sizes_value;
    napi_value limbs_value;
    napi_value array_buffer;
    napi_typedarray_type sizes_type;
    napi_typedarray_type limbs_type;
    size_t sizes_length;
    size_t limbs_length;
    size_t byte_offset;
    size_t length;
    size_t capacity;
    void *sizes_data;
    void *limbs_data;

    if (!size_property(env, object, "length", &length) ||
        !size_property(env, object, "wordCapacity", &capacity))
        return 0;
    if (length != expected_length || capacity == 0 ||
        capacity > (size_t) INT32_MAX ||
        (length != 0 && capacity > SIZE_MAX / length))
    {
        napi_throw_range_error(env, NULL,
            "packed IntegerBuffer length or capacity is invalid");
        return 0;
    }
    if (!check_napi(env,
        napi_get_named_property(env, object, "sizes", &sizes_value)) ||
        !check_napi(env,
            napi_get_named_property(env, object, "limbs", &limbs_value)) ||
        !check_napi(env, napi_get_typedarray_info(
            env, sizes_value, &sizes_type, &sizes_length, &sizes_data,
            &array_buffer, &byte_offset)) ||
        !check_napi(env, napi_get_typedarray_info(
            env, limbs_value, &limbs_type, &limbs_length, &limbs_data,
            &array_buffer, &byte_offset)))
        return 0;
    if (sizes_type != napi_int32_array ||
        limbs_type != napi_biguint64_array ||
        sizes_length != length || limbs_length != length * capacity)
    {
        napi_throw_type_error(env, NULL,
            "expected a packed exact-integer buffer");
        return 0;
    }
    view->sizes = (int32_t *) sizes_data;
    view->limbs = (uint64_t *) limbs_data;
    view->length = length;
    view->word_capacity = capacity;
    for (size_t index = 0; index < length; index++)
    {
        const int64_t signed_size = (int64_t) view->sizes[index];
        const uint64_t words = (uint64_t)
            (signed_size < 0 ? -signed_size : signed_size);
        if (words > (uint64_t) capacity)
        {
            napi_throw_range_error(env, NULL,
                "packed IntegerBuffer entry exceeds its capacity");
            return 0;
        }
    }
    return 1;
}

static void fmpz_set_packed_integer(
    fmpz *output,
    const sagejs_packed_integer_view *source,
    size_t index)
{
    const int64_t signed_size = (int64_t) source->sizes[index];
    const size_t words = (size_t)
        (signed_size < 0 ? -signed_size : signed_size);
    if (words == 0)
        fmpz_zero(output);
    else
    {
        fmpz_set_ui_array(output,
            (const ulong *) (source->limbs +
                index * source->word_capacity),
            (slong) words);
        if (signed_size < 0)
            fmpz_neg(output, output);
    }
}

static size_t fmpz_word_count(const fmpz *value)
{
    return (size_t) ((fmpz_bits(value) + 63) / 64);
}

static int packed_integer_can_store(
    napi_env env,
    const sagejs_packed_integer_view *output,
    const fmpz *value)
{
    if (fmpz_word_count(value) <= output->word_capacity)
        return 1;
    napi_throw_range_error(env, NULL,
        "IntegerBuffer word capacity exceeded");
    return 0;
}

static void packed_integer_set(
    sagejs_packed_integer_view *output,
    size_t index,
    const fmpz *value,
    fmpz_t magnitude)
{
    const size_t words = fmpz_word_count(value);
    uint64_t *slot = output->limbs + index * output->word_capacity;
    memset(slot, 0, output->word_capacity * sizeof(*slot));
    if (words != 0)
    {
        fmpz_abs(magnitude, value);
        fmpz_get_ui_array((ulong *) slot, (slong) words, magnitude);
    }
    output->sizes[index] = fmpz_sgn(value) < 0
        ? -(int32_t) words : (int32_t) words;
}

static void finalize_fmpq_rref_result(
    napi_env env,
    void *data,
    void *hint)
{
    sagejs_fmpq_rref_result_value *result = data;
    (void) env;
    (void) hint;
    if (result != NULL &&
        result->magic == SAGEJS_FMPQ_RREF_RESULT_MAGIC)
    {
        sagejs_flint_fmpq_rref_result_clear(result->value);
        result->magic = 0;
    }
    free(result);
}

static napi_value wrap_fmpq_rref_result(
    napi_env env,
    sagejs_fmpq_rref_result_value *result)
{
    napi_value object;
    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env, napi_type_tag_object(
            env, object, &sagejs_fmpq_rref_result_type_tag)) ||
        !check_napi(env, napi_wrap(
            env, object, result, finalize_fmpq_rref_result,
            NULL, NULL)))
    {
        finalize_fmpq_rref_result(env, result, NULL);
        return NULL;
    }
    return object;
}

static sagejs_fmpq_rref_result_value *unwrap_fmpq_rref_result(
    napi_env env,
    napi_value object)
{
    bool tagged = false;
    sagejs_fmpq_rref_result_value *result = NULL;
    if (!check_napi(env, napi_check_object_type_tag(
            env, object, &sagejs_fmpq_rref_result_type_tag, &tagged)))
        return NULL;
    if (!tagged ||
        !check_napi(env, napi_unwrap(env, object, (void **) &result)) ||
        result == NULL || result->magic != SAGEJS_FMPQ_RREF_RESULT_MAGIC)
    {
        napi_throw_type_error(env, NULL,
            "expected an open Sage.js FLINT RREF result");
        return NULL;
    }
    return result;
}

static int fmpq_rref_result_dimensions(
    napi_env env,
    sagejs_fmpq_rref_result_value *result,
    napi_value rows_value,
    napi_value columns_value,
    ulong *rows,
    ulong *columns,
    size_t *count)
{
    if (!bigint_to_matrix_dimension(env, rows_value, rows) ||
        !bigint_to_matrix_dimension(env, columns_value, columns))
        return 0;
    if ((slong) *rows != fmpq_mat_nrows(result->value->matrix) ||
        (slong) *columns != fmpq_mat_ncols(result->value->matrix) ||
        (*rows != 0 && (size_t) *columns > SIZE_MAX / (size_t) *rows))
    {
        napi_throw_range_error(env, NULL,
            "RREF result dimensions do not match");
        return 0;
    }
    *count = (size_t) *rows * (size_t) *columns;
    return 1;
}

napi_value sagejs_fmpq_rref_result_create(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    ulong rows;
    ulong columns;
    sagejs_fmpq_rref_result_value *result;
    if (!require_arguments(env, info, 2, args) ||
        !bigint_to_matrix_dimension(env, args[0], &rows) ||
        !bigint_to_matrix_dimension(env, args[1], &columns))
        return NULL;
    result = calloc(1, sizeof(*result));
    if (result == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate an RREF result");
        return NULL;
    }
    result->magic = SAGEJS_FMPQ_RREF_RESULT_MAGIC;
    if (!sagejs_flint_fmpq_rref_result_init(
            result->value, rows, columns))
    {
        result->magic = 0;
        free(result);
        napi_throw_range_error(env, NULL,
            "invalid RREF result dimensions");
        return NULL;
    }
    return wrap_fmpq_rref_result(env, result);
}

napi_value sagejs_fmpq_rref_result_close(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value undefined;
    bool tagged = false;
    sagejs_fmpq_rref_result_value *result = NULL;
    if (!require_arguments(env, info, 1, args) ||
        !check_napi(env, napi_check_object_type_tag(
            env, args[0], &sagejs_fmpq_rref_result_type_tag, &tagged)))
        return NULL;
    if (!tagged || !check_napi(env,
            napi_remove_wrap(env, args[0], (void **) &result)) ||
        result == NULL || result->magic != SAGEJS_FMPQ_RREF_RESULT_MAGIC)
    {
        napi_throw_type_error(env, NULL,
            "expected an open Sage.js FLINT RREF result");
        return NULL;
    }
    finalize_fmpq_rref_result(env, result, NULL);
    if (!check_napi(env, napi_get_undefined(env, &undefined)))
        return NULL;
    return undefined;
}

napi_value sagejs_fmpq_rref_result_compute(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[5];
    napi_value answer;
    sagejs_fmpq_rref_result_value *result;
    sagejs_packed_integer_view numerators;
    sagejs_packed_integer_view denominators;
    fmpz_mat_t numerator_matrix;
    fmpz_mat_t denominator_matrix;
    ulong rows;
    ulong columns;
    size_t count;
    int success;
    if (!require_arguments(env, info, 5, args) ||
        (result = unwrap_fmpq_rref_result(env, args[0])) == NULL ||
        !fmpq_rref_result_dimensions(
            env, result, args[3], args[4], &rows, &columns, &count) ||
        !packed_integer_view(env, args[1], count, &numerators) ||
        !packed_integer_view(env, args[2], count, &denominators))
        return NULL;
    fmpz_mat_init(numerator_matrix, (slong) rows, (slong) columns);
    fmpz_mat_init(denominator_matrix, (slong) rows, (slong) columns);
    for (size_t index = 0; index < count; index++)
    {
        fmpz_set_packed_integer(
            fmpz_mat_entry(numerator_matrix,
                (slong) (index / (size_t) columns),
                (slong) (index % (size_t) columns)),
            &numerators, index);
        fmpz_set_packed_integer(
            fmpz_mat_entry(denominator_matrix,
                (slong) (index / (size_t) columns),
                (slong) (index % (size_t) columns)),
            &denominators, index);
    }
    success = sagejs_flint_fmpq_rref_result_compute(
        result->value, numerator_matrix, denominator_matrix);
    fmpz_mat_clear(denominator_matrix);
    fmpz_mat_clear(numerator_matrix);
    if (!check_napi(env, napi_get_boolean(env, success != 0, &answer)))
        return NULL;
    return answer;
}

static napi_value fmpq_rref_result_word(
    napi_env env,
    napi_callback_info info,
    int which)
{
    napi_value args[1];
    sagejs_fmpq_rref_result_value *result;
    ulong value;
    if (!require_arguments(env, info, 1, args) ||
        (result = unwrap_fmpq_rref_result(env, args[0])) == NULL)
        return NULL;
    if (!result->value->computed)
    {
        napi_throw_error(env, NULL, "RREF result has not been computed");
        return NULL;
    }
    if (which == 0)
        value = sagejs_flint_fmpq_rref_result_rank(result->value);
    else if (which == 1)
        value = sagejs_flint_fmpq_rref_result_numerator_word_capacity(
            result->value);
    else
        value = sagejs_flint_fmpq_rref_result_denominator_word_capacity(
            result->value);
    return ulong_to_bigint(env, value);
}

napi_value sagejs_fmpq_rref_result_rank(
    napi_env env,
    napi_callback_info info)
{
    return fmpq_rref_result_word(env, info, 0);
}

napi_value sagejs_fmpq_rref_result_numerator_word_capacity(
    napi_env env,
    napi_callback_info info)
{
    return fmpq_rref_result_word(env, info, 1);
}

napi_value sagejs_fmpq_rref_result_denominator_word_capacity(
    napi_env env,
    napi_callback_info info)
{
    return fmpq_rref_result_word(env, info, 2);
}

napi_value sagejs_fmpq_rref_result_export(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[5];
    napi_value answer;
    sagejs_fmpq_rref_result_value *result;
    sagejs_packed_integer_view numerators;
    sagejs_packed_integer_view denominators;
    ulong rows;
    ulong columns;
    size_t count;
    fmpz_t magnitude;
    if (!require_arguments(env, info, 5, args) ||
        (result = unwrap_fmpq_rref_result(env, args[2])) == NULL ||
        !fmpq_rref_result_dimensions(
            env, result, args[3], args[4], &rows, &columns, &count) ||
        !packed_integer_view(env, args[0], count, &numerators) ||
        !packed_integer_view(env, args[1], count, &denominators))
        return NULL;
    if (!result->value->computed)
    {
        napi_throw_error(env, NULL, "RREF result has not been computed");
        return NULL;
    }
    for (size_t index = 0; index < count; index++)
    {
        const fmpq *entry = fmpq_mat_entry(result->value->matrix,
            (slong) (index / (size_t) columns),
            (slong) (index % (size_t) columns));
        if (!packed_integer_can_store(
                env, &numerators, fmpq_numref(entry)) ||
            !packed_integer_can_store(
                env, &denominators, fmpq_denref(entry)))
            return NULL;
    }
    fmpz_init(magnitude);
    for (size_t index = 0; index < count; index++)
    {
        const fmpq *entry = fmpq_mat_entry(result->value->matrix,
            (slong) (index / (size_t) columns),
            (slong) (index % (size_t) columns));
        packed_integer_set(
            &numerators, index, fmpq_numref(entry), magnitude);
        packed_integer_set(
            &denominators, index, fmpq_denref(entry), magnitude);
    }
    fmpz_clear(magnitude);
    if (!check_napi(env, napi_get_boolean(env, true, &answer)))
        return NULL;
    return answer;
}
