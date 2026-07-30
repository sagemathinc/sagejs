#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include <node_api.h>

#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/nmod_mat.h>
#include <flint/nmod_poly.h>
#include <flint/ulong_extras.h>

#include "matrix.h"

typedef enum
{
    SAGEJS_MATRIX_ZZ = 1,
    SAGEJS_MATRIX_QQ = 2,
    SAGEJS_MATRIX_NMOD = 3,
    SAGEJS_MATRIX_ZMOD = 4
} sagejs_matrix_kind;

typedef struct
{
    uint64_t magic;
    sagejs_matrix_kind kind;
    fmpz_mat_t integer;
    fmpq_mat_t rational;
    nmod_mat_t modular;
} sagejs_matrix;

#define SAGEJS_MATRIX_MAGIC UINT64_C(0x534147454A534D41)

static const napi_type_tag sagejs_matrix_type_tag = {
    UINT64_C(0x198a2dc27f5a47cc),
    UINT64_C(0x98fb02f0ce7f6dc6)
};

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

static int bigint_to_fmpz(napi_env env, napi_value value, fmpz_t result)
{
    napi_valuetype type;
    int sign = 0;
    size_t count = 0;
    uint64_t *words;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL, "expected a BigInt");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_words(env, value, NULL, &count, NULL)))
        return 0;
    if (count == 0)
    {
        fmpz_zero(result);
        return 1;
    }
    words = malloc(count * sizeof(uint64_t));
    if (words == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
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

static int bigint_to_ulong(napi_env env, napi_value value, ulong *result)
{
    napi_valuetype type;
    uint64_t word;
    bool lossless;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_bigint)
    {
        napi_throw_type_error(env, NULL, "expected a BigInt");
        return 0;
    }
    if (!check_napi(env,
        napi_get_value_bigint_uint64(env, value, &word, &lossless)))
        return 0;
    if (!lossless || word > (uint64_t) UWORD_MAX)
    {
        napi_throw_range_error(env, NULL,
            "prime-field matrix modulus does not fit in a machine word");
        return 0;
    }
    *result = (ulong) word;
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

static napi_value fmpz_to_bigint(napi_env env, const fmpz_t value)
{
    napi_value result;
    fmpz_t magnitude;
    flint_bitcnt_t bits;
    size_t count;
    uint64_t *words;
    int sign = fmpz_sgn(value) < 0;

    if (fmpz_is_zero(value))
    {
        if (!check_napi(env, napi_create_bigint_uint64(env, 0, &result)))
            return NULL;
        return result;
    }
    fmpz_init(magnitude);
    fmpz_abs(magnitude, value);
    bits = fmpz_bits(magnitude);
    count = (size_t) ((bits + 63) / 64);
    words = malloc(count * sizeof(uint64_t));
    if (words == NULL)
    {
        fmpz_clear(magnitude);
        napi_throw_error(env, NULL, "unable to allocate BigInt limbs");
        return NULL;
    }
    fmpz_get_ui_array((ulong *) words, (slong) count, magnitude);
    fmpz_clear(magnitude);
    if (!check_napi(env,
        napi_create_bigint_words(env, sign, count, words, &result)))
    {
        free(words);
        return NULL;
    }
    free(words);
    return result;
}

static int value_to_dimension(
    napi_env env,
    napi_value value,
    slong *result)
{
    napi_valuetype type;
    double number;

    if (!check_napi(env, napi_typeof(env, value, &type)))
        return 0;
    if (type != napi_number)
    {
        napi_throw_type_error(env, NULL,
            "matrix dimensions must be Numbers");
        return 0;
    }
    if (!check_napi(env, napi_get_value_double(env, value, &number)))
        return 0;
    if (!isfinite(number) || floor(number) != number ||
        number < 0 || number > 2147483647.0)
    {
        napi_throw_range_error(env, NULL,
            "matrix dimensions must be nonnegative integers");
        return 0;
    }
    *result = (slong) number;
    return 1;
}

static int value_to_index(
    napi_env env,
    napi_value value,
    slong limit,
    slong *result)
{
    if (!value_to_dimension(env, value, result))
        return 0;
    if (*result >= limit)
    {
        napi_throw_range_error(env, NULL, "matrix index out of range");
        return 0;
    }
    return 1;
}

static slong matrix_nrows(const sagejs_matrix *matrix)
{
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
        return fmpz_mat_nrows(matrix->integer);
    if (matrix->kind == SAGEJS_MATRIX_QQ)
        return fmpq_mat_nrows(matrix->rational);
    return nmod_mat_nrows(matrix->modular);
}

static slong matrix_ncols(const sagejs_matrix *matrix)
{
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
        return fmpz_mat_ncols(matrix->integer);
    if (matrix->kind == SAGEJS_MATRIX_QQ)
        return fmpq_mat_ncols(matrix->rational);
    return nmod_mat_ncols(matrix->modular);
}

static ulong matrix_modulus(const sagejs_matrix *matrix)
{
    return (matrix->kind == SAGEJS_MATRIX_NMOD ||
            matrix->kind == SAGEJS_MATRIX_ZMOD)
        ? matrix->modular->mod.n
        : 0;
}

static int matrix_is_modular(const sagejs_matrix *matrix)
{
    return matrix->kind == SAGEJS_MATRIX_NMOD ||
        matrix->kind == SAGEJS_MATRIX_ZMOD;
}

static void finalize_matrix(napi_env env, void *data, void *hint)
{
    sagejs_matrix *matrix = data;
    (void) env;
    (void) hint;

    if (matrix == NULL || matrix->magic != SAGEJS_MATRIX_MAGIC)
        return;
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
        fmpz_mat_clear(matrix->integer);
    else if (matrix->kind == SAGEJS_MATRIX_QQ)
        fmpq_mat_clear(matrix->rational);
    else
        nmod_mat_clear(matrix->modular);
    matrix->magic = 0;
    free(matrix);
}

static sagejs_matrix *new_matrix(
    napi_env env,
    sagejs_matrix_kind kind,
    slong rows,
    slong cols)
{
    sagejs_matrix *matrix = calloc(1, sizeof(*matrix));

    if (matrix == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate matrix");
        return NULL;
    }
    matrix->magic = SAGEJS_MATRIX_MAGIC;
    matrix->kind = kind;
    if (kind == SAGEJS_MATRIX_ZZ)
        fmpz_mat_init(matrix->integer, rows, cols);
    else if (kind == SAGEJS_MATRIX_QQ)
        fmpq_mat_init(matrix->rational, rows, cols);
    else
    {
        free(matrix);
        napi_throw_error(env, NULL,
            "modular matrices require an explicit modulus");
        return NULL;
    }
    return matrix;
}

static sagejs_matrix *new_nmod_matrix(
    napi_env env,
    sagejs_matrix_kind kind,
    slong rows,
    slong cols,
    ulong modulus)
{
    sagejs_matrix *matrix;

    if (modulus < 2)
    {
        napi_throw_range_error(env, NULL,
            "modular matrix modulus must be at least 2");
        return NULL;
    }
    matrix = calloc(1, sizeof(*matrix));
    if (matrix == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate matrix");
        return NULL;
    }
    matrix->magic = SAGEJS_MATRIX_MAGIC;
    matrix->kind = kind;
    nmod_mat_init(matrix->modular, rows, cols, modulus);
    return matrix;
}

static sagejs_matrix *new_matrix_like(
    napi_env env,
    const sagejs_matrix *source,
    slong rows,
    slong cols)
{
    if (matrix_is_modular(source))
        return new_nmod_matrix(
            env, source->kind, rows, cols, matrix_modulus(source));
    return new_matrix(env, source->kind, rows, cols);
}

static napi_value wrap_matrix(napi_env env, sagejs_matrix *matrix)
{
    napi_value object;

    if (!check_napi(env, napi_create_object(env, &object)) ||
        !check_napi(env,
            napi_type_tag_object(env, object, &sagejs_matrix_type_tag)) ||
        !check_napi(env,
            napi_wrap(env, object, matrix, finalize_matrix, NULL, NULL)))
    {
        finalize_matrix(env, matrix, NULL);
        return NULL;
    }
    return object;
}

static sagejs_matrix *unwrap_matrix(napi_env env, napi_value object)
{
    sagejs_matrix *matrix = NULL;
    bool tagged = false;

    if (!check_napi(env,
        napi_check_object_type_tag(
            env, object, &sagejs_matrix_type_tag, &tagged)))
        return NULL;
    if (!tagged)
    {
        napi_throw_type_error(env, NULL,
            "expected a Sage.js FLINT matrix");
        return NULL;
    }
    if (!check_napi(env, napi_unwrap(env, object, (void **) &matrix)))
        return NULL;
    if (matrix == NULL || matrix->magic != SAGEJS_MATRIX_MAGIC)
    {
        napi_throw_type_error(env, NULL,
            "invalid Sage.js FLINT matrix");
        return NULL;
    }
    return matrix;
}

static napi_value rational_result(
    napi_env env,
    const fmpz_t numerator,
    const fmpz_t denominator)
{
    napi_value result;
    napi_value numerator_value;
    napi_value denominator_value;

    numerator_value = fmpz_to_bigint(env, numerator);
    if (numerator_value == NULL)
        return NULL;
    denominator_value = fmpz_to_bigint(env, denominator);
    if (denominator_value == NULL)
        return NULL;
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_set_named_property(
                env, result, "numerator", numerator_value)) ||
        !check_napi(env,
            napi_set_named_property(
                env, result, "denominator", denominator_value)))
        return NULL;
    return result;
}

static int get_rational_pair(
    napi_env env,
    napi_value value,
    fmpz_t numerator,
    fmpz_t denominator)
{
    bool is_array = false;
    uint32_t length;
    napi_value part;

    if (!check_napi(env, napi_is_array(env, value, &is_array)))
        return 0;
    if (!is_array ||
        !check_napi(env, napi_get_array_length(env, value, &length)))
        return 0;
    if (length != 2)
    {
        napi_throw_type_error(env, NULL,
            "rational matrix entries must be numerator/denominator pairs");
        return 0;
    }
    if (!check_napi(env, napi_get_element(env, value, 0, &part)) ||
        !bigint_to_fmpz(env, part, numerator) ||
        !check_napi(env, napi_get_element(env, value, 1, &part)) ||
        !bigint_to_fmpz(env, part, denominator))
        return 0;
    if (fmpz_is_zero(denominator))
    {
        napi_throw_range_error(env, NULL,
            "rational denominator must be nonzero");
        return 0;
    }
    return 1;
}

static napi_value matrix_from_entries(
    napi_env env,
    napi_callback_info info,
    sagejs_matrix_kind kind)
{
    napi_value args[3];
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    uint32_t length;
    uint64_t expected;
    bool is_array = false;
    slong row;
    slong col;
    napi_value value;
    fmpz_t numerator;
    fmpz_t denominator;

    if (!require_arguments(env, info, 3, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols) ||
        !check_napi(env, napi_is_array(env, args[2], &is_array)))
        return NULL;
    if (!is_array)
    {
        napi_throw_type_error(env, NULL, "matrix entries must be an Array");
        return NULL;
    }
    if (!check_napi(env, napi_get_array_length(env, args[2], &length)))
        return NULL;
    expected = (uint64_t) rows * (uint64_t) cols;
    if (expected > UINT32_MAX || length != expected)
    {
        napi_throw_range_error(env, NULL,
            "matrix entry count does not match its dimensions");
        return NULL;
    }

    matrix = new_matrix(env, kind, rows, cols);
    if (matrix == NULL)
        return NULL;
    fmpz_init(numerator);
    fmpz_init(denominator);
    for (row = 0; row < rows; row++)
    {
        for (col = 0; col < cols; col++)
        {
            if (!check_napi(env,
                napi_get_element(
                    env, args[2], (uint32_t) (row * cols + col), &value)))
                goto fail;
            if (kind == SAGEJS_MATRIX_ZZ)
            {
                if (!bigint_to_fmpz(
                    env, value, fmpz_mat_entry(matrix->integer, row, col)))
                    goto fail;
            }
            else
            {
                if (!get_rational_pair(
                    env, value, numerator, denominator))
                    goto fail;
                fmpq_set_fmpz_frac(
                    fmpq_mat_entry(matrix->rational, row, col),
                    numerator,
                    denominator);
            }
        }
    }
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    return wrap_matrix(env, matrix);

fail:
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    finalize_matrix(env, matrix, NULL);
    return NULL;
}

napi_value sagejs_zz_matrix(napi_env env, napi_callback_info info)
{
    return matrix_from_entries(env, info, SAGEJS_MATRIX_ZZ);
}

napi_value sagejs_qq_matrix(napi_env env, napi_callback_info info)
{
    return matrix_from_entries(env, info, SAGEJS_MATRIX_QQ);
}

static napi_value modular_matrix_from_entries(
    napi_env env,
    napi_callback_info info,
    sagejs_matrix_kind kind)
{
    napi_value args[4];
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    ulong modulus;
    uint32_t length;
    uint64_t expected;
    bool is_array = false;
    slong row;
    slong col;
    napi_value value;
    ulong entry;

    if (!require_arguments(env, info, 4, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols) ||
        !check_napi(env, napi_is_array(env, args[2], &is_array)) ||
        !bigint_to_ulong(env, args[3], &modulus))
        return NULL;
    if (!is_array)
    {
        napi_throw_type_error(env, NULL, "matrix entries must be an Array");
        return NULL;
    }
    if (!check_napi(env, napi_get_array_length(env, args[2], &length)))
        return NULL;
    expected = (uint64_t) rows * (uint64_t) cols;
    if (expected > UINT32_MAX || length != expected)
    {
        napi_throw_range_error(env, NULL,
            "matrix entry count does not match its dimensions");
        return NULL;
    }
    matrix = new_nmod_matrix(env, kind, rows, cols, modulus);
    if (matrix == NULL)
        return NULL;
    for (row = 0; row < rows; row++)
    {
        for (col = 0; col < cols; col++)
        {
            if (!check_napi(env,
                napi_get_element(
                    env, args[2], (uint32_t) (row * cols + col), &value)) ||
                !bigint_to_ulong(env, value, &entry))
            {
                finalize_matrix(env, matrix, NULL);
                return NULL;
            }
            nmod_mat_entry(matrix->modular, row, col) =
                entry % modulus;
        }
    }
    return wrap_matrix(env, matrix);
}

napi_value sagejs_nmod_matrix(napi_env env, napi_callback_info info)
{
    return modular_matrix_from_entries(
        env, info, SAGEJS_MATRIX_NMOD);
}

napi_value sagejs_zmod_matrix(napi_env env, napi_callback_info info)
{
    return modular_matrix_from_entries(
        env, info, SAGEJS_MATRIX_ZMOD);
}

napi_value sagejs_zz_matrix_to_qq(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_ZZ)
    {
        napi_throw_type_error(env, NULL, "expected an integer matrix");
        return NULL;
    }
    answer = new_matrix(
        env, SAGEJS_MATRIX_QQ,
        matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        return NULL;
    fmpq_mat_set_fmpz_mat(answer->rational, source->integer);
    return wrap_matrix(env, answer);
}

typedef enum
{
    MATRIX_ADD,
    MATRIX_SUB,
    MATRIX_MUL
} matrix_binary_operation;

static napi_value matrix_binary(
    napi_env env,
    napi_callback_info info,
    matrix_binary_operation operation)
{
    napi_value args[2];
    sagejs_matrix *left;
    sagejs_matrix *right;
    sagejs_matrix *answer;
    slong rows;
    slong cols;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_matrix(env, args[0]);
    right = unwrap_matrix(env, args[1]);
    if (left == NULL || right == NULL)
        return NULL;
    if (left->kind != right->kind)
    {
        napi_throw_type_error(env, NULL, "matrix base rings differ");
        return NULL;
    }
    if (matrix_is_modular(left) &&
        matrix_modulus(left) != matrix_modulus(right))
    {
        napi_throw_type_error(env, NULL, "matrix base rings differ");
        return NULL;
    }
    if (operation == MATRIX_MUL)
    {
        if (matrix_ncols(left) != matrix_nrows(right))
        {
            napi_throw_range_error(env, NULL,
                "matrix dimensions are incompatible for multiplication");
            return NULL;
        }
        rows = matrix_nrows(left);
        cols = matrix_ncols(right);
    }
    else
    {
        if (matrix_nrows(left) != matrix_nrows(right) ||
            matrix_ncols(left) != matrix_ncols(right))
        {
            napi_throw_range_error(env, NULL,
                "matrix dimensions must agree");
            return NULL;
        }
        rows = matrix_nrows(left);
        cols = matrix_ncols(left);
    }
    answer = new_matrix_like(env, left, rows, cols);
    if (answer == NULL)
        return NULL;
    if (left->kind == SAGEJS_MATRIX_ZZ)
    {
        if (operation == MATRIX_ADD)
            fmpz_mat_add(answer->integer, left->integer, right->integer);
        else if (operation == MATRIX_SUB)
            fmpz_mat_sub(answer->integer, left->integer, right->integer);
        else
            fmpz_mat_mul(answer->integer, left->integer, right->integer);
    }
    else if (left->kind == SAGEJS_MATRIX_QQ)
    {
        if (operation == MATRIX_ADD)
            fmpq_mat_add(answer->rational, left->rational, right->rational);
        else if (operation == MATRIX_SUB)
            fmpq_mat_sub(answer->rational, left->rational, right->rational);
        else
            fmpq_mat_mul(answer->rational, left->rational, right->rational);
    }
    else
    {
        if (operation == MATRIX_ADD)
            nmod_mat_add(answer->modular, left->modular, right->modular);
        else if (operation == MATRIX_SUB)
            nmod_mat_sub(answer->modular, left->modular, right->modular);
        else
            nmod_mat_mul(answer->modular, left->modular, right->modular);
    }
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_add(napi_env env, napi_callback_info info)
{
    return matrix_binary(env, info, MATRIX_ADD);
}

napi_value sagejs_matrix_sub(napi_env env, napi_callback_info info)
{
    return matrix_binary(env, info, MATRIX_SUB);
}

napi_value sagejs_matrix_mul(napi_env env, napi_callback_info info)
{
    return matrix_binary(env, info, MATRIX_MUL);
}

napi_value sagejs_matrix_neg(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    answer = new_matrix_like(
        env, source, matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_MATRIX_ZZ)
        fmpz_mat_neg(answer->integer, source->integer);
    else if (source->kind == SAGEJS_MATRIX_QQ)
        fmpq_mat_neg(answer->rational, source->rational);
    else
        nmod_mat_neg(answer->modular, source->modular);
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_scalar_mul(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[3];
    sagejs_matrix *source;
    sagejs_matrix *answer;
    fmpz_t numerator;
    fmpz_t denominator;
    fmpq_t scalar;

    if (!require_arguments(env, info, 3, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    fmpz_init(numerator);
    fmpz_init(denominator);
    if (!bigint_to_fmpz(env, args[1], numerator) ||
        !bigint_to_fmpz(env, args[2], denominator))
        goto fail;
    if (fmpz_is_zero(denominator))
    {
        napi_throw_range_error(env, NULL,
            "rational denominator must be nonzero");
        goto fail;
    }
    if (source->kind != SAGEJS_MATRIX_QQ && !fmpz_is_one(denominator))
    {
        napi_throw_type_error(env, NULL,
            "integer and prime-field matrices require an integer scalar");
        goto fail;
    }
    answer = new_matrix_like(
        env, source, matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        goto fail;
    if (source->kind == SAGEJS_MATRIX_ZZ)
    {
        fmpz_mat_scalar_mul_fmpz(
            answer->integer, source->integer, numerator);
    }
    else if (source->kind == SAGEJS_MATRIX_QQ)
    {
        fmpq_init(scalar);
        fmpq_set_fmpz_frac(scalar, numerator, denominator);
        fmpq_mat_scalar_mul_fmpq(
            answer->rational, source->rational, scalar);
        fmpq_clear(scalar);
    }
    else
    {
        nmod_mat_scalar_mul(
            answer->modular,
            source->modular,
            fmpz_fdiv_ui(numerator, matrix_modulus(source)));
    }
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    return wrap_matrix(env, answer);

fail:
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    return NULL;
}

napi_value sagejs_matrix_transpose(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    answer = new_matrix_like(
        env, source, matrix_ncols(source), matrix_nrows(source));
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_MATRIX_ZZ)
        fmpz_mat_transpose(answer->integer, source->integer);
    else if (source->kind == SAGEJS_MATRIX_QQ)
        fmpq_mat_transpose(answer->rational, source->rational);
    else
        nmod_mat_transpose(answer->modular, source->modular);
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_equal(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_matrix *left;
    sagejs_matrix *right;
    int equal = 0;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_matrix(env, args[0]);
    right = unwrap_matrix(env, args[1]);
    if (left == NULL || right == NULL)
        return NULL;
    if (left->kind == right->kind &&
        matrix_nrows(left) == matrix_nrows(right) &&
        matrix_ncols(left) == matrix_ncols(right))
    {
        if (left->kind == SAGEJS_MATRIX_ZZ)
            equal = fmpz_mat_equal(left->integer, right->integer);
        else if (left->kind == SAGEJS_MATRIX_QQ)
            equal = fmpq_mat_equal(left->rational, right->rational);
        else if (matrix_modulus(left) == matrix_modulus(right))
            equal = nmod_mat_equal(left->modular, right->modular);
    }
    if (!check_napi(env, napi_get_boolean(env, equal, &result)))
        return NULL;
    return result;
}

napi_value sagejs_matrix_entry(napi_env env, napi_callback_info info)
{
    napi_value args[3];
    sagejs_matrix *matrix;
    slong row;
    slong col;
    const fmpq *entry;

    if (!require_arguments(env, info, 3, args))
        return NULL;
    matrix = unwrap_matrix(env, args[0]);
    if (matrix == NULL ||
        !value_to_index(env, args[1], matrix_nrows(matrix), &row) ||
        !value_to_index(env, args[2], matrix_ncols(matrix), &col))
        return NULL;
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
        return fmpz_to_bigint(
            env, fmpz_mat_entry(matrix->integer, row, col));
    if (matrix_is_modular(matrix))
        return ulong_to_bigint(
            env, nmod_mat_entry(matrix->modular, row, col));
    entry = fmpq_mat_entry(matrix->rational, row, col);
    return rational_result(
        env, fmpq_numref(entry), fmpq_denref(entry));
}

napi_value sagejs_matrix_det(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_matrix *matrix;
    fmpz_t integer;
    fmpq_t rational;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    matrix = unwrap_matrix(env, args[0]);
    if (matrix == NULL)
        return NULL;
    if (matrix_nrows(matrix) != matrix_ncols(matrix))
    {
        napi_throw_range_error(env, NULL,
            "determinant requires a square matrix");
        return NULL;
    }
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
    {
        fmpz_init(integer);
        fmpz_mat_det(integer, matrix->integer);
        result = fmpz_to_bigint(env, integer);
        fmpz_clear(integer);
        return result;
    }
    if (matrix_is_modular(matrix))
        return ulong_to_bigint(env, nmod_mat_det(matrix->modular));
    fmpq_init(rational);
    fmpq_mat_det(rational, matrix->rational);
    result = rational_result(
        env, fmpq_numref(rational), fmpq_denref(rational));
    fmpq_clear(rational);
    return result;
}

napi_value sagejs_matrix_rank(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    sagejs_matrix *matrix;
    fmpq_mat_t copy;
    slong rank;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    matrix = unwrap_matrix(env, args[0]);
    if (matrix == NULL)
        return NULL;
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
    {
        rank = fmpz_mat_rank(matrix->integer);
    }
    else if (matrix->kind == SAGEJS_MATRIX_QQ)
    {
        fmpq_mat_init_set(copy, matrix->rational);
        rank = fmpq_mat_rref(copy, copy);
        fmpq_mat_clear(copy);
    }
    else if (matrix->kind == SAGEJS_MATRIX_NMOD)
    {
        rank = nmod_mat_rank(matrix->modular);
    }
    else
    {
        sagejs_matrix *howell;
        slong row;
        slong col;
        slong howell_rows = matrix_nrows(matrix) > matrix_ncols(matrix)
            ? matrix_nrows(matrix)
            : matrix_ncols(matrix);

        howell = new_nmod_matrix(
            env, matrix->kind, howell_rows, matrix_ncols(matrix),
            matrix_modulus(matrix));
        if (howell == NULL)
            return NULL;
        for (row = 0; row < matrix_nrows(matrix); row++)
        {
            for (col = 0; col < matrix_ncols(matrix); col++)
            {
                nmod_mat_entry(howell->modular, row, col) =
                    nmod_mat_entry(matrix->modular, row, col);
            }
        }
        nmod_mat_howell_form(howell->modular);
        rank = 0;
        for (row = 0; row < howell_rows; row++)
        {
            for (col = 0; col < matrix_ncols(matrix); col++)
            {
                ulong value = nmod_mat_entry(
                    howell->modular, row, col);
                if (value != 0)
                {
                    if (value == 1)
                        rank++;
                    break;
                }
            }
        }
        finalize_matrix(env, howell, NULL);
    }
    if (!check_napi(env, napi_create_int64(env, rank, &result)))
        return NULL;
    return result;
}

napi_value sagejs_matrix_rref(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;
    fmpz_mat_t numerator;
    fmpz_t denominator;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind == SAGEJS_MATRIX_ZMOD)
    {
        napi_throw_type_error(env, NULL,
            "RREF over a residue ring requires Howell reduction");
        return NULL;
    }
    if (source->kind == SAGEJS_MATRIX_NMOD)
    {
        answer = new_matrix_like(
            env, source, matrix_nrows(source), matrix_ncols(source));
        if (answer == NULL)
            return NULL;
        nmod_mat_set(answer->modular, source->modular);
        nmod_mat_rref(answer->modular);
        return wrap_matrix(env, answer);
    }
    answer = new_matrix(
        env, SAGEJS_MATRIX_QQ,
        matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        return NULL;
    if (source->kind == SAGEJS_MATRIX_QQ)
    {
        fmpq_mat_rref(answer->rational, source->rational);
        return wrap_matrix(env, answer);
    }
    fmpz_mat_init(
        numerator, matrix_nrows(source), matrix_ncols(source));
    fmpz_init(denominator);
    fmpz_mat_rref(numerator, denominator, source->integer);
    fmpq_mat_set_fmpz_mat(answer->rational, numerator);
    fmpq_mat_scalar_div_fmpz(
        answer->rational, answer->rational, denominator);
    fmpz_mat_clear(numerator);
    fmpz_clear(denominator);
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_hermite(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_ZZ)
    {
        napi_throw_type_error(env, NULL,
            "Hermite form currently requires an integer matrix");
        return NULL;
    }
    answer = new_matrix(
        env, SAGEJS_MATRIX_ZZ,
        matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        return NULL;
    fmpz_mat_hnf(answer->integer, source->integer);
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_howell(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;
    slong rows;
    slong row;
    slong col;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_ZMOD)
    {
        napi_throw_type_error(env, NULL,
            "Howell form requires a residue-ring matrix");
        return NULL;
    }
    rows = matrix_nrows(source) > matrix_ncols(source)
        ? matrix_nrows(source)
        : matrix_ncols(source);
    answer = new_nmod_matrix(
        env, source->kind, rows, matrix_ncols(source),
        matrix_modulus(source));
    if (answer == NULL)
        return NULL;
    for (row = 0; row < matrix_nrows(source); row++)
    {
        for (col = 0; col < matrix_ncols(source); col++)
        {
            nmod_mat_entry(answer->modular, row, col) =
                nmod_mat_entry(source->modular, row, col);
        }
    }
    nmod_mat_howell_form(answer->modular);
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_hermite_transform(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value wrapped;
    sagejs_matrix *source;
    sagejs_matrix *hermite;
    sagejs_matrix *transform;
    slong rows;
    slong cols;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_ZZ)
    {
        napi_throw_type_error(env, NULL,
            "Hermite form currently requires an integer matrix");
        return NULL;
    }
    rows = matrix_nrows(source);
    cols = matrix_ncols(source);
    hermite = new_matrix(env, SAGEJS_MATRIX_ZZ, rows, cols);
    transform = new_matrix(env, SAGEJS_MATRIX_ZZ, rows, rows);
    if (hermite == NULL || transform == NULL)
    {
        if (hermite != NULL)
            finalize_matrix(env, hermite, NULL);
        if (transform != NULL)
            finalize_matrix(env, transform, NULL);
        return NULL;
    }
    fmpz_mat_hnf_transform(
        hermite->integer, transform->integer, source->integer);
    if (!check_napi(env, napi_create_array_with_length(env, 2, &result)))
    {
        finalize_matrix(env, hermite, NULL);
        finalize_matrix(env, transform, NULL);
        return NULL;
    }
    wrapped = wrap_matrix(env, hermite);
    if (wrapped == NULL ||
        !check_napi(env, napi_set_element(env, result, 0, wrapped)))
    {
        finalize_matrix(env, transform, NULL);
        return NULL;
    }
    wrapped = wrap_matrix(env, transform);
    if (wrapped == NULL ||
        !check_napi(env, napi_set_element(env, result, 1, wrapped)))
        return NULL;
    return result;
}

napi_value sagejs_matrix_smith(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value wrapped;
    sagejs_matrix *source;
    sagejs_matrix *smith;
    sagejs_matrix *left;
    sagejs_matrix *right;
    slong rows;
    slong cols;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_ZZ)
    {
        napi_throw_type_error(env, NULL,
            "Smith form currently requires an integer matrix");
        return NULL;
    }
    rows = matrix_nrows(source);
    cols = matrix_ncols(source);
    smith = new_matrix(env, SAGEJS_MATRIX_ZZ, rows, cols);
    left = new_matrix(env, SAGEJS_MATRIX_ZZ, rows, rows);
    right = new_matrix(env, SAGEJS_MATRIX_ZZ, cols, cols);
    if (smith == NULL || left == NULL || right == NULL)
    {
        if (smith != NULL)
            finalize_matrix(env, smith, NULL);
        if (left != NULL)
            finalize_matrix(env, left, NULL);
        if (right != NULL)
            finalize_matrix(env, right, NULL);
        return NULL;
    }
    fmpz_mat_snf_transform(
        smith->integer, left->integer, right->integer, source->integer);
    if (!check_napi(env, napi_create_array_with_length(env, 3, &result)))
    {
        finalize_matrix(env, smith, NULL);
        finalize_matrix(env, left, NULL);
        finalize_matrix(env, right, NULL);
        return NULL;
    }
    wrapped = wrap_matrix(env, smith);
    if (wrapped == NULL ||
        !check_napi(env, napi_set_element(env, result, 0, wrapped)))
    {
        finalize_matrix(env, left, NULL);
        finalize_matrix(env, right, NULL);
        return NULL;
    }
    wrapped = wrap_matrix(env, left);
    if (wrapped == NULL ||
        !check_napi(env, napi_set_element(env, result, 1, wrapped)))
    {
        finalize_matrix(env, right, NULL);
        return NULL;
    }
    wrapped = wrap_matrix(env, right);
    if (wrapped == NULL ||
        !check_napi(env, napi_set_element(env, result, 2, wrapped)))
        return NULL;
    return result;
}

napi_value sagejs_matrix_right_kernel(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;
    slong rows;
    slong cols;
    slong rank;
    slong nullity;
    slong row;
    slong col;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    rows = matrix_nrows(source);
    cols = matrix_ncols(source);

    if (source->kind == SAGEJS_MATRIX_ZMOD)
    {
        sagejs_matrix *howell;
        slong howell_rows = rows > cols ? rows : cols;
        slong *pivots;
        int *unit_pivots;
        slong pivot_count = 0;
        slong unit_rank = 0;
        slong current_row = 0;
        slong pivot_index = 0;
        slong index;
        slong position;
        ulong modulus = matrix_modulus(source);
        ulong modulus_inverse = n_preinvert_limb(modulus);

        howell = new_nmod_matrix(
            env, source->kind, howell_rows, cols, modulus);
        if (howell == NULL)
            return NULL;
        for (row = 0; row < rows; row++)
        {
            for (col = 0; col < cols; col++)
            {
                nmod_mat_entry(howell->modular, row, col) =
                    nmod_mat_entry(source->modular, row, col);
            }
        }
        nmod_mat_howell_form(howell->modular);
        pivots = cols == 0 ? NULL : malloc(cols * sizeof(slong));
        unit_pivots = cols == 0 ? NULL : malloc(cols * sizeof(int));
        if (cols != 0 && (pivots == NULL || unit_pivots == NULL))
        {
            free(pivots);
            free(unit_pivots);
            finalize_matrix(env, howell, NULL);
            napi_throw_error(env, NULL,
                "unable to allocate residue-ring kernel pivots");
            return NULL;
        }
        for (row = 0; row < howell_rows; row++)
        {
            for (col = 0; col < cols; col++)
            {
                ulong value = nmod_mat_entry(
                    howell->modular, row, col);
                if (value != 0)
                {
                    pivots[pivot_count] = col;
                    unit_pivots[pivot_count] = value == 1;
                    if (value == 1)
                        unit_rank++;
                    pivot_count++;
                    break;
                }
            }
        }
        answer = new_nmod_matrix(
            env, source->kind, cols - unit_rank, cols, modulus);
        if (answer == NULL)
        {
            free(pivots);
            free(unit_pivots);
            finalize_matrix(env, howell, NULL);
            return NULL;
        }
        for (col = 0; col < cols; col++)
        {
            int is_pivot =
                pivot_index < pivot_count &&
                pivots[pivot_index] == col;
            if (is_pivot && unit_pivots[pivot_index])
            {
                pivot_index++;
                continue;
            }
            index = pivot_index;
            if (is_pivot)
            {
                ulong pivot = nmod_mat_entry(
                    howell->modular, index, col);
                pivot_index++;
                nmod_mat_entry(
                    answer->modular, current_row, col) =
                    modulus / pivot;
            }
            else
            {
                nmod_mat_entry(
                    answer->modular, current_row, col) = 1;
            }
            for (position = index; position-- > 0;)
            {
                slong pivot_col = pivots[position];
                ulong pivot = nmod_mat_entry(
                    howell->modular, position, pivot_col);
                ulong sum = 0;
                ulong scale;
                slong inner;

                for (inner = pivot_col + 1; inner <= col; inner++)
                {
                    ulong product = n_mulmod2_preinv(
                        nmod_mat_entry(
                            answer->modular, current_row, inner),
                        nmod_mat_entry(
                            howell->modular, position, inner),
                        modulus,
                        modulus_inverse);
                    sum = n_addmod(sum, product, modulus);
                }
                if (sum % pivot != 0)
                {
                    scale = pivot / n_gcd(sum, pivot);
                    sum = n_mulmod2_preinv(
                        sum, scale, modulus, modulus_inverse);
                    for (
                        inner = pivot_col + 1;
                        inner <= col;
                        inner++
                    )
                    {
                        nmod_mat_entry(
                            answer->modular, current_row, inner) =
                            n_mulmod2_preinv(
                                nmod_mat_entry(
                                    answer->modular,
                                    current_row,
                                    inner),
                                scale,
                                modulus,
                                modulus_inverse);
                    }
                }
                nmod_mat_entry(
                    answer->modular, current_row, pivot_col) =
                    (sum == 0 ? 0 : modulus - sum) / pivot;
            }
            current_row++;
        }
        free(pivots);
        free(unit_pivots);
        finalize_matrix(env, howell, NULL);
        return wrap_matrix(env, answer);
    }
    if (source->kind == SAGEJS_MATRIX_NMOD)
    {
        nmod_mat_t basis_columns;

        rank = nmod_mat_rank(source->modular);
        nullity = cols - rank;
        answer = new_nmod_matrix(
            env, source->kind, nullity, cols, matrix_modulus(source));
        if (answer == NULL)
            return NULL;
        nmod_mat_init(
            basis_columns, cols, cols, matrix_modulus(source));
        nmod_mat_nullspace(basis_columns, source->modular);
        for (row = 0; row < nullity; row++)
        {
            for (col = 0; col < cols; col++)
            {
                nmod_mat_entry(answer->modular, row, col) =
                    nmod_mat_entry(basis_columns, col, row);
            }
        }
        nmod_mat_rref(answer->modular);
        nmod_mat_clear(basis_columns);
        return wrap_matrix(env, answer);
    }
    if (source->kind == SAGEJS_MATRIX_ZZ)
    {
        fmpz_mat_t transpose;
        fmpz_mat_t hermite;
        fmpz_mat_t transform;
        fmpz_mat_t basis;

        rank = fmpz_mat_rank(source->integer);
        nullity = cols - rank;
        answer = new_matrix(env, SAGEJS_MATRIX_ZZ, nullity, cols);
        if (answer == NULL)
            return NULL;
        fmpz_mat_init(transpose, cols, rows);
        fmpz_mat_init(hermite, cols, rows);
        fmpz_mat_init(transform, cols, cols);
        fmpz_mat_init(basis, nullity, cols);
        fmpz_mat_transpose(transpose, source->integer);
        fmpz_mat_hnf_transform(hermite, transform, transpose);
        for (row = 0; row < nullity; row++)
        {
            for (col = 0; col < cols; col++)
            {
                fmpz_set(
                    fmpz_mat_entry(basis, row, col),
                    fmpz_mat_entry(transform, rank + row, col));
            }
        }
        fmpz_mat_hnf(answer->integer, basis);
        fmpz_mat_clear(transpose);
        fmpz_mat_clear(hermite);
        fmpz_mat_clear(transform);
        fmpz_mat_clear(basis);
        return wrap_matrix(env, answer);
    }
    else
    {
        fmpq_mat_t reduced;
        slong *pivots;
        slong pivot_col;
        slong free_col;
        slong basis_row;
        int is_pivot;

        fmpq_mat_init(reduced, rows, cols);
        rank = fmpq_mat_rref(reduced, source->rational);
        nullity = cols - rank;
        answer = new_matrix(env, SAGEJS_MATRIX_QQ, nullity, cols);
        if (answer == NULL)
        {
            fmpq_mat_clear(reduced);
            return NULL;
        }
        pivots = rank == 0 ? NULL : malloc(rank * sizeof(slong));
        if (rank != 0 && pivots == NULL)
        {
            fmpq_mat_clear(reduced);
            finalize_matrix(env, answer, NULL);
            napi_throw_error(env, NULL, "unable to allocate kernel pivots");
            return NULL;
        }
        pivot_col = 0;
        for (row = 0; row < rank; row++)
        {
            while (pivot_col < cols &&
                fmpq_is_zero(
                    fmpq_mat_entry(reduced, row, pivot_col)))
                pivot_col++;
            pivots[row] = pivot_col;
            pivot_col++;
        }
        basis_row = 0;
        for (free_col = 0; free_col < cols; free_col++)
        {
            is_pivot = 0;
            for (row = 0; row < rank; row++)
            {
                if (pivots[row] == free_col)
                {
                    is_pivot = 1;
                    break;
                }
            }
            if (is_pivot)
                continue;
            fmpq_one(
                fmpq_mat_entry(answer->rational, basis_row, free_col));
            for (row = 0; row < rank; row++)
            {
                fmpq_neg(
                    fmpq_mat_entry(
                        answer->rational, basis_row, pivots[row]),
                    fmpq_mat_entry(reduced, row, free_col));
            }
            basis_row++;
        }
        fmpq_mat_rref(answer->rational, answer->rational);
        free(pivots);
        fmpq_mat_clear(reduced);
        return wrap_matrix(env, answer);
    }
}

napi_value sagejs_matrix_charpoly(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value coefficients;
    napi_value coefficient;
    sagejs_matrix *source;
    slong degree;
    slong index;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (matrix_nrows(source) != matrix_ncols(source))
    {
        napi_throw_range_error(env, NULL,
            "characteristic polynomial requires a square matrix");
        return NULL;
    }
    degree = matrix_nrows(source);
    if (!check_napi(env,
        napi_create_array_with_length(
            env, (size_t) degree + 1, &coefficients)))
        return NULL;
    if (source->kind == SAGEJS_MATRIX_ZZ)
    {
        fmpz_poly_t polynomial;
        fmpz_t value;

        fmpz_poly_init(polynomial);
        fmpz_init(value);
        fmpz_mat_charpoly(polynomial, source->integer);
        for (index = 0; index <= degree; index++)
        {
            fmpz_poly_get_coeff_fmpz(value, polynomial, index);
            coefficient = fmpz_to_bigint(env, value);
            if (coefficient == NULL ||
                !check_napi(env,
                    napi_set_element(
                        env, coefficients, (uint32_t) index, coefficient)))
            {
                fmpz_clear(value);
                fmpz_poly_clear(polynomial);
                return NULL;
            }
        }
        fmpz_clear(value);
        fmpz_poly_clear(polynomial);
    }
    else if (source->kind == SAGEJS_MATRIX_QQ)
    {
        fmpq_poly_t polynomial;
        fmpq_t value;

        fmpq_poly_init(polynomial);
        fmpq_init(value);
        fmpq_mat_charpoly(polynomial, source->rational);
        for (index = 0; index <= degree; index++)
        {
            fmpq_poly_get_coeff_fmpq(value, polynomial, index);
            coefficient = rational_result(
                env, fmpq_numref(value), fmpq_denref(value));
            if (coefficient == NULL ||
                !check_napi(env,
                    napi_set_element(
                        env, coefficients, (uint32_t) index, coefficient)))
            {
                fmpq_clear(value);
                fmpq_poly_clear(polynomial);
                return NULL;
            }
        }
        fmpq_clear(value);
        fmpq_poly_clear(polynomial);
    }
    else
    {
        nmod_poly_t polynomial;

        nmod_poly_init(polynomial, matrix_modulus(source));
        nmod_mat_charpoly(polynomial, source->modular);
        for (index = 0; index <= degree; index++)
        {
            coefficient = ulong_to_bigint(
                env, nmod_poly_get_coeff_ui(polynomial, index));
            if (coefficient == NULL ||
                !check_napi(env,
                    napi_set_element(
                        env, coefficients, (uint32_t) index, coefficient)))
            {
                nmod_poly_clear(polynomial);
                return NULL;
            }
        }
        nmod_poly_clear(polynomial);
    }
    return coefficients;
}

static void matrix_to_rational(
    fmpq_mat_t answer,
    const sagejs_matrix *source)
{
    if (source->kind == SAGEJS_MATRIX_ZZ)
        fmpq_mat_set_fmpz_mat(answer, source->integer);
    else
        fmpq_mat_set(answer, source->rational);
}

static int zmod_matrix_inverse(
    sagejs_matrix *answer,
    const sagejs_matrix *source)
{
    fmpz_mat_t lifted;
    fmpz_mat_t numerator;
    fmpz_t denominator;
    fmpz_t modulus;
    fmpz_t inverse_denominator;
    fmpz_t entry;
    slong row;
    slong col;
    int inverted;

    fmpz_mat_init(
        lifted, matrix_nrows(source), matrix_ncols(source));
    fmpz_mat_init(
        numerator, matrix_nrows(source), matrix_ncols(source));
    fmpz_init(denominator);
    fmpz_init(modulus);
    fmpz_init(inverse_denominator);
    fmpz_init(entry);
    fmpz_set_ui(modulus, matrix_modulus(source));
    for (row = 0; row < matrix_nrows(source); row++)
    {
        for (col = 0; col < matrix_ncols(source); col++)
        {
            fmpz_set_ui(
                fmpz_mat_entry(lifted, row, col),
                nmod_mat_entry(source->modular, row, col));
        }
    }
    inverted = fmpz_mat_inv(numerator, denominator, lifted);
    if (inverted)
        inverted = fmpz_invmod(
            inverse_denominator, denominator, modulus);
    if (inverted)
    {
        for (row = 0; row < matrix_nrows(source); row++)
        {
            for (col = 0; col < matrix_ncols(source); col++)
            {
                fmpz_mul(
                    entry,
                    fmpz_mat_entry(numerator, row, col),
                    inverse_denominator);
                nmod_mat_entry(answer->modular, row, col) =
                    fmpz_fdiv_ui(entry, matrix_modulus(source));
            }
        }
    }
    fmpz_mat_clear(lifted);
    fmpz_mat_clear(numerator);
    fmpz_clear(denominator);
    fmpz_clear(modulus);
    fmpz_clear(inverse_denominator);
    fmpz_clear(entry);
    return inverted;
}

napi_value sagejs_matrix_solve(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    sagejs_matrix *left;
    sagejs_matrix *right;
    sagejs_matrix *answer;
    fmpq_mat_t left_rational;
    fmpq_mat_t right_rational;
    int solved;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_matrix(env, args[0]);
    right = unwrap_matrix(env, args[1]);
    if (left == NULL || right == NULL)
        return NULL;
    if (matrix_is_modular(left) || matrix_is_modular(right))
    {
        int solved;
        sagejs_matrix *inverse;

        if (!matrix_is_modular(left) ||
            !matrix_is_modular(right) ||
            left->kind != right->kind ||
            matrix_modulus(left) != matrix_modulus(right))
        {
            napi_throw_type_error(env, NULL, "matrix base rings differ");
            return NULL;
        }
        if (matrix_nrows(left) != matrix_ncols(left) ||
            matrix_nrows(right) != matrix_nrows(left))
        {
            napi_throw_range_error(env, NULL,
                "solve requires a square matrix and compatible right side");
            return NULL;
        }
        answer = new_nmod_matrix(
            env, left->kind, matrix_ncols(left), matrix_ncols(right),
            matrix_modulus(left));
        if (answer == NULL)
            return NULL;
        if (left->kind == SAGEJS_MATRIX_NMOD)
        {
            solved = nmod_mat_solve(
                answer->modular, left->modular, right->modular);
        }
        else
        {
            inverse = new_nmod_matrix(
                env, left->kind,
                matrix_nrows(left), matrix_ncols(left),
                matrix_modulus(left));
            if (inverse == NULL)
            {
                finalize_matrix(env, answer, NULL);
                return NULL;
            }
            solved = zmod_matrix_inverse(inverse, left);
            if (solved)
                nmod_mat_mul(
                    answer->modular,
                    inverse->modular,
                    right->modular);
            finalize_matrix(env, inverse, NULL);
        }
        if (!solved)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_range_error(env, NULL, "matrix is singular");
            return NULL;
        }
        return wrap_matrix(env, answer);
    }
    if (matrix_nrows(left) != matrix_ncols(left) ||
        matrix_nrows(right) != matrix_nrows(left))
    {
        napi_throw_range_error(env, NULL,
            "solve requires a square matrix and compatible right side");
        return NULL;
    }
    answer = new_matrix(
        env, SAGEJS_MATRIX_QQ,
        matrix_ncols(left), matrix_ncols(right));
    if (answer == NULL)
        return NULL;
    fmpq_mat_init(
        left_rational, matrix_nrows(left), matrix_ncols(left));
    fmpq_mat_init(
        right_rational, matrix_nrows(right), matrix_ncols(right));
    matrix_to_rational(left_rational, left);
    matrix_to_rational(right_rational, right);
    solved = fmpq_mat_solve(
        answer->rational, left_rational, right_rational);
    fmpq_mat_clear(left_rational);
    fmpq_mat_clear(right_rational);
    if (!solved)
    {
        finalize_matrix(env, answer, NULL);
        napi_throw_range_error(env, NULL, "matrix is singular");
        return NULL;
    }
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_inverse(napi_env env, napi_callback_info info)
{
    napi_value args[1];
    sagejs_matrix *source;
    sagejs_matrix *answer;
    fmpq_mat_t rational;
    int inverted;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (matrix_nrows(source) != matrix_ncols(source))
    {
        napi_throw_range_error(env, NULL,
            "inverse requires a square matrix");
        return NULL;
    }
    if (matrix_is_modular(source))
    {
        answer = new_nmod_matrix(
            env, source->kind,
            matrix_nrows(source), matrix_ncols(source),
            matrix_modulus(source));
        if (answer == NULL)
            return NULL;
        if (source->kind == SAGEJS_MATRIX_NMOD)
            inverted = nmod_mat_inv(
                answer->modular, source->modular);
        else
            inverted = zmod_matrix_inverse(answer, source);
        if (!inverted)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_range_error(env, NULL, "matrix is singular");
            return NULL;
        }
        return wrap_matrix(env, answer);
    }
    answer = new_matrix(
        env, SAGEJS_MATRIX_QQ,
        matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        return NULL;
    fmpq_mat_init(
        rational, matrix_nrows(source), matrix_ncols(source));
    matrix_to_rational(rational, source);
    inverted = fmpq_mat_inv(answer->rational, rational);
    fmpq_mat_clear(rational);
    if (!inverted)
    {
        finalize_matrix(env, answer, NULL);
        napi_throw_range_error(env, NULL, "matrix is singular");
        return NULL;
    }
    return wrap_matrix(env, answer);
}
