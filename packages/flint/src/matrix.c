#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <node_api.h>
#include <sagejs/native.h>

#include <flint/acb.h>
#include <flint/acb_mat.h>
#include <flint/arb.h>
#include <flint/arf.h>
#include <flint/flint.h>
#include <flint/fmpq.h>
#include <flint/fmpq_mat.h>
#include <flint/fmpq_poly.h>
#include <flint/fmpq_vec.h>
#include <flint/fmpz.h>
#include <flint/fmpz_mat.h>
#include <flint/fmpz_poly.h>
#include <flint/fmpz_vec.h>
#include <flint/gr.h>
#include <flint/gr_mat.h>
#include <flint/gr_poly.h>
#include <flint/nmod.h>
#include <flint/nmod_mat.h>
#include <flint/nmod_poly.h>
#include <flint/nf.h>
#include <flint/nf_elem.h>
#include <flint/qqbar.h>
#include <flint/ulong_extras.h>

#include "algebraic.h"
#include "charpoly.h"
#include "cyclotomic_rref.h"
#include "matrix.h"
#include "sparse_rational.h"

typedef enum
{
    SAGEJS_MATRIX_ZZ = 1,
    SAGEJS_MATRIX_QQ = 2,
    SAGEJS_MATRIX_NMOD = 3,
    SAGEJS_MATRIX_ZMOD = 4,
    SAGEJS_MATRIX_ACB = 5,
    SAGEJS_MATRIX_QQBAR = 6
} sagejs_matrix_kind;

typedef struct
{
    uint64_t magic;
    sagejs_matrix_kind kind;
    fmpz_mat_t integer;
    fmpq_mat_t rational;
    nmod_mat_t modular;
    acb_mat_t approximate;
    gr_mat_t algebraic;
    gr_ctx_t algebraic_context;
    int algebraic_real;
    ulong cyclotomic_order;
    size_t cyclotomic_degree;
    fmpq *cyclotomic_coordinates;
    slong precision;
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
    if (matrix->kind == SAGEJS_MATRIX_ACB)
        return acb_mat_nrows(matrix->approximate);
    if (matrix->kind == SAGEJS_MATRIX_QQBAR)
        return gr_mat_nrows(
            matrix->algebraic, matrix->algebraic_context);
    return nmod_mat_nrows(matrix->modular);
}

static slong matrix_ncols(const sagejs_matrix *matrix)
{
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
        return fmpz_mat_ncols(matrix->integer);
    if (matrix->kind == SAGEJS_MATRIX_QQ)
        return fmpq_mat_ncols(matrix->rational);
    if (matrix->kind == SAGEJS_MATRIX_ACB)
        return acb_mat_ncols(matrix->approximate);
    if (matrix->kind == SAGEJS_MATRIX_QQBAR)
        return gr_mat_ncols(
            matrix->algebraic, matrix->algebraic_context);
    return nmod_mat_ncols(matrix->modular);
}

static int rational_matrix_is_integral(const sagejs_matrix *matrix)
{
    slong rows = fmpq_mat_nrows(matrix->rational);
    slong columns = fmpq_mat_ncols(matrix->rational);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            if (!fmpz_is_one(fmpq_denref(fmpq_mat_entry(
                    matrix->rational, row, column))))
                return 0;
    return 1;
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
    else if (matrix->kind == SAGEJS_MATRIX_ACB)
        acb_mat_clear(matrix->approximate);
    else if (matrix->kind == SAGEJS_MATRIX_QQBAR)
    {
        if (matrix->cyclotomic_coordinates != NULL)
        {
            size_t count = (size_t) matrix_nrows(matrix) *
                (size_t) matrix_ncols(matrix) * matrix->cyclotomic_degree;
            _fmpq_vec_clear(matrix->cyclotomic_coordinates,
                (slong) (count == 0 ? 1 : count));
        }
        gr_mat_clear(matrix->algebraic, matrix->algebraic_context);
        gr_ctx_clear(matrix->algebraic_context);
    }
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

static sagejs_matrix *new_acb_matrix(
    napi_env env,
    slong rows,
    slong cols,
    slong precision)
{
    sagejs_matrix *matrix;

    if (precision < 2)
    {
        napi_throw_range_error(env, NULL,
            "approximate matrix precision must be at least 2 bits");
        return NULL;
    }
    matrix = calloc(1, sizeof(*matrix));
    if (matrix == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate matrix");
        return NULL;
    }
    matrix->magic = SAGEJS_MATRIX_MAGIC;
    matrix->kind = SAGEJS_MATRIX_ACB;
    matrix->precision = precision;
    acb_mat_init(matrix->approximate, rows, cols);
    return matrix;
}

static sagejs_matrix *new_qqbar_matrix(
    napi_env env,
    slong rows,
    slong cols,
    int real_only)
{
    sagejs_matrix *matrix = calloc(1, sizeof(*matrix));

    if (matrix == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate matrix");
        return NULL;
    }
    matrix->magic = SAGEJS_MATRIX_MAGIC;
    matrix->kind = SAGEJS_MATRIX_QQBAR;
    matrix->algebraic_real = real_only != 0;
    if (matrix->algebraic_real)
        gr_ctx_init_real_qqbar(matrix->algebraic_context);
    else
        gr_ctx_init_complex_qqbar(matrix->algebraic_context);
    gr_mat_init(
        matrix->algebraic, rows, cols, matrix->algebraic_context);
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
    if (source->kind == SAGEJS_MATRIX_ACB)
        return new_acb_matrix(env, rows, cols, source->precision);
    if (source->kind == SAGEJS_MATRIX_QQBAR)
        return new_qqbar_matrix(
            env, rows, cols, source->algebraic_real);
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

napi_value sagejs_zz_matrix_from_slong_entries(
    napi_env env,
    slong rows,
    slong cols,
    const slong *entries)
{
    sagejs_matrix *matrix;

    if (rows < 0 || cols < 0 ||
        (rows != 0 && (ulong) cols > SIZE_MAX / (ulong) rows) ||
        ((rows != 0 && cols != 0) && entries == NULL))
    {
        napi_throw_range_error(env, NULL, "invalid integer matrix entries");
        return NULL;
    }
    matrix = new_matrix(env, SAGEJS_MATRIX_ZZ, rows, cols);
    if (matrix == NULL)
        return NULL;
    for (slong row = 0; row < rows; row++)
        for (slong col = 0; col < cols; col++)
            fmpz_set_si(
                fmpz_mat_entry(matrix->integer, row, col),
                entries[(size_t) row * (size_t) cols + (size_t) col]);
    return wrap_matrix(env, matrix);
}

napi_value sagejs_qq_matrix_from_fmpq_mat(
    napi_env env,
    const fmpq_mat_t entries)
{
    sagejs_matrix *matrix = new_matrix(
        env, SAGEJS_MATRIX_QQ,
        fmpq_mat_nrows(entries), fmpq_mat_ncols(entries));

    if (matrix == NULL)
        return NULL;
    fmpq_mat_set(matrix->rational, entries);
    return wrap_matrix(env, matrix);
}

napi_value sagejs_qqbar_matrix_from_gr_mat(
    napi_env env,
    const gr_mat_t entries,
    const gr_ctx_t context)
{
    sagejs_matrix *matrix = new_qqbar_matrix(
        env, gr_mat_nrows(entries, context),
        gr_mat_ncols(entries, context), 0);

    if (matrix == NULL)
        return NULL;
    for (slong row = 0;
         row < gr_mat_nrows(entries, context); row++)
        for (slong col = 0;
             col < gr_mat_ncols(entries, context); col++)
            qqbar_set(
                (qqbar_ptr) gr_mat_entry_ptr(
                    matrix->algebraic, row, col,
                    matrix->algebraic_context),
                (qqbar_srcptr) gr_mat_entry_ptr(
                    (gr_mat_struct *) entries, row, col,
                    (gr_ctx_struct *) context));
    return wrap_matrix(env, matrix);
}

napi_value sagejs_qqbar_matrix_from_cyclotomic_gr_mat(
    napi_env env,
    const gr_mat_t entries,
    const gr_ctx_t context,
    ulong order,
    size_t degree,
    const fmpq *coordinates)
{
    slong rows = gr_mat_nrows(entries, context);
    slong columns = gr_mat_ncols(entries, context);
    size_t count;
    sagejs_matrix *matrix;

    if (order < 3 || degree == 0 || coordinates == NULL ||
        (rows != 0 && (size_t) columns > SIZE_MAX / (size_t) rows) ||
        (size_t) rows * (size_t) columns > SIZE_MAX / degree ||
        (size_t) rows * (size_t) columns * degree > (size_t) WORD_MAX)
    {
        napi_throw_range_error(env, NULL,
            "invalid cyclotomic matrix coordinates");
        return NULL;
    }
    matrix = new_qqbar_matrix(env, rows, columns, 0);
    if (matrix == NULL)
        return NULL;
    count = (size_t) rows * (size_t) columns * degree;
    matrix->cyclotomic_coordinates = _fmpq_vec_init(
        (slong) (count == 0 ? 1 : count));
    if (matrix->cyclotomic_coordinates == NULL)
    {
        finalize_matrix(env, matrix, NULL);
        napi_throw_error(env, NULL,
            "unable to allocate cyclotomic matrix coordinates");
        return NULL;
    }
    matrix->cyclotomic_order = order;
    matrix->cyclotomic_degree = degree;
    for (size_t index = 0; index < count; index++)
        fmpq_set(matrix->cyclotomic_coordinates + index,
            coordinates + index);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
            qqbar_set(
                (qqbar_ptr) gr_mat_entry_ptr(
                    matrix->algebraic, row, column,
                    matrix->algebraic_context),
                (qqbar_srcptr) gr_mat_entry_ptr(
                    (gr_mat_struct *) entries, row, column,
                    (gr_ctx_struct *) context));
    return wrap_matrix(env, matrix);
}

napi_value sagejs_qq_matrix_from_qqbar_gr_mat(
    napi_env env,
    const gr_mat_t entries,
    const gr_ctx_t context)
{
    sagejs_matrix *matrix = new_matrix(
        env, SAGEJS_MATRIX_QQ,
        gr_mat_nrows(entries, context), gr_mat_ncols(entries, context));

    if (matrix == NULL)
        return NULL;
    for (slong row = 0;
         row < gr_mat_nrows(entries, context); row++)
        for (slong col = 0;
             col < gr_mat_ncols(entries, context); col++)
        {
            qqbar_srcptr value = (qqbar_srcptr) gr_mat_entry_ptr(
                (gr_mat_struct *) entries, row, col,
                (gr_ctx_struct *) context);
            if (!qqbar_is_rational(value))
            {
                finalize_matrix(env, matrix, NULL);
                napi_throw_error(env, NULL,
                    "character matrix coefficient is not rational");
                return NULL;
            }
            qqbar_get_fmpq(
                fmpq_mat_entry(matrix->rational, row, col), value);
        }
    return wrap_matrix(env, matrix);
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

static int packed_width(napi_env env, napi_value value, size_t *width)
{
    uint32_t raw;

    if (!check_napi(env, napi_get_value_uint32(env, value, &raw)))
        return 0;
    if (raw != 1 && raw != 2 && raw != 4)
    {
        napi_throw_range_error(env, NULL,
            "packed matrix entry width must be 1, 2, or 4 bytes");
        return 0;
    }
    *width = (size_t) raw;
    return 1;
}

static ulong read_packed_entry(const uint8_t *source, size_t width)
{
    ulong value = source[0];

    if (width >= 2)
        value |= (ulong) source[1] << 8;
    if (width == 4)
    {
        value |= (ulong) source[2] << 16;
        value |= (ulong) source[3] << 24;
    }
    return value;
}

static void write_packed_entry(uint8_t *target, size_t width, ulong value)
{
    target[0] = (uint8_t) value;
    if (width >= 2)
        target[1] = (uint8_t) (value >> 8);
    if (width == 4)
    {
        target[2] = (uint8_t) (value >> 16);
        target[3] = (uint8_t) (value >> 24);
    }
}

static napi_value modular_matrix_from_packed(
    napi_env env,
    napi_callback_info info,
    sagejs_matrix_kind kind)
{
    napi_value args[5];
    napi_typedarray_type array_type;
    napi_value array_buffer;
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    ulong modulus;
    size_t width;
    size_t byte_length;
    size_t byte_offset;
    size_t entry_count;
    void *raw_data;
    uint8_t *data;

    if (!require_arguments(env, info, 5, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols) ||
        !packed_width(env, args[3], &width) ||
        !bigint_to_ulong(env, args[4], &modulus))
        return NULL;
    if (!check_napi(env, napi_get_typedarray_info(
        env, args[2], &array_type, &byte_length, &raw_data,
        &array_buffer, &byte_offset)))
        return NULL;
    if (array_type != napi_uint8_array)
    {
        napi_throw_type_error(env, NULL,
            "packed matrix entries must be a Uint8Array");
        return NULL;
    }
    if (rows != 0 && (size_t) cols > SIZE_MAX / (size_t) rows)
    {
        napi_throw_range_error(env, NULL, "matrix is too large");
        return NULL;
    }
    entry_count = (size_t) rows * (size_t) cols;
    if (entry_count > SIZE_MAX / width || byte_length != entry_count * width)
    {
        napi_throw_range_error(env, NULL,
            "packed matrix entry count does not match its dimensions");
        return NULL;
    }
    matrix = new_nmod_matrix(env, kind, rows, cols, modulus);
    if (matrix == NULL)
        return NULL;
    data = (uint8_t *) raw_data;
    for (size_t index = 0; index < entry_count; index++)
        nmod_mat_entry(
            matrix->modular,
            (slong) (index / (size_t) cols),
            (slong) (index % (size_t) cols)) =
            read_packed_entry(data + index * width, width) % modulus;
    return wrap_matrix(env, matrix);
}

napi_value sagejs_nmod_matrix_packed(
    napi_env env, napi_callback_info info)
{
    return modular_matrix_from_packed(env, info, SAGEJS_MATRIX_NMOD);
}

napi_value sagejs_zmod_matrix_packed(
    napi_env env, napi_callback_info info)
{
    return modular_matrix_from_packed(env, info, SAGEJS_MATRIX_ZMOD);
}

napi_value sagejs_matrix_export_packed(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value array_buffer;
    napi_value result;
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    size_t width;
    size_t entry_count;
    size_t byte_length;
    uint8_t *data;

    if (!require_arguments(env, info, 2, args) ||
        !packed_width(env, args[1], &width))
        return NULL;
    matrix = unwrap_matrix(env, args[0]);
    if (matrix == NULL)
        return NULL;
    if (!matrix_is_modular(matrix))
    {
        napi_throw_type_error(env, NULL,
            "only machine-word modular matrices have a packed encoding");
        return NULL;
    }
    rows = nmod_mat_nrows(matrix->modular);
    cols = nmod_mat_ncols(matrix->modular);
    if (rows != 0 && (size_t) cols > SIZE_MAX / (size_t) rows)
    {
        napi_throw_range_error(env, NULL, "matrix is too large");
        return NULL;
    }
    entry_count = (size_t) rows * (size_t) cols;
    if (entry_count > SIZE_MAX / width)
    {
        napi_throw_range_error(env, NULL, "packed matrix is too large");
        return NULL;
    }
    byte_length = entry_count * width;
    if (!check_napi(env, napi_create_arraybuffer(
        env, byte_length, (void **) &data, &array_buffer)) ||
        !check_napi(env, napi_create_typedarray(
            env, napi_uint8_array, byte_length, array_buffer, 0, &result)))
        return NULL;
    for (size_t index = 0; index < entry_count; index++)
        write_packed_entry(
            data + index * width,
            width,
            nmod_mat_entry(
                matrix->modular,
                (slong) (index / (size_t) cols),
                (slong) (index % (size_t) cols)));
    return result;
}

static void write_uint32_le(uint8_t *target, uint32_t value)
{
    target[0] = (uint8_t) value;
    target[1] = (uint8_t) (value >> 8);
    target[2] = (uint8_t) (value >> 16);
    target[3] = (uint8_t) (value >> 24);
}

static uint32_t read_uint32_le(const uint8_t *source)
{
    return (uint32_t) source[0] |
        (uint32_t) source[1] << 8 |
        (uint32_t) source[2] << 16 |
        (uint32_t) source[3] << 24;
}

napi_value sagejs_zz_matrix_export_packed(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value array_buffer;
    napi_value result;
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    size_t entry_count;
    size_t byte_length = 0;
    size_t maximum_words = 0;
    size_t offset = 0;
    ulong *words = NULL;
    uint8_t *data;
    fmpz_t magnitude;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    matrix = unwrap_matrix(env, args[0]);
    if (matrix == NULL)
        return NULL;
    if (matrix->kind != SAGEJS_MATRIX_ZZ)
    {
        napi_throw_type_error(env, NULL,
            "packed integer export requires a ZZ matrix");
        return NULL;
    }
    rows = fmpz_mat_nrows(matrix->integer);
    cols = fmpz_mat_ncols(matrix->integer);
    if (rows != 0 && (size_t) cols > SIZE_MAX / (size_t) rows)
    {
        napi_throw_range_error(env, NULL, "matrix is too large");
        return NULL;
    }
    entry_count = (size_t) rows * (size_t) cols;
    for (size_t index = 0; index < entry_count; index++)
    {
        const fmpz *entry = fmpz_mat_entry(
            matrix->integer,
            (slong) (index / (size_t) cols),
            (slong) (index % (size_t) cols));
        size_t bytes = (size_t) (fmpz_bits(entry) + 7) / 8;
        size_t word_count = (bytes + sizeof(ulong) - 1) / sizeof(ulong);

        if (bytes > UINT32_C(0x7fffffff) || byte_length > SIZE_MAX - 4 - bytes)
        {
            napi_throw_range_error(env, NULL,
                "integer matrix packed representation is too large");
            return NULL;
        }
        byte_length += 4 + bytes;
        if (word_count > maximum_words)
            maximum_words = word_count;
    }
    if (maximum_words != 0)
    {
        words = malloc(maximum_words * sizeof(ulong));
        if (words == NULL)
        {
            napi_throw_error(env, NULL,
                "unable to allocate packed integer matrix workspace");
            return NULL;
        }
    }
    if (!check_napi(env, napi_create_arraybuffer(
        env, byte_length, (void **) &data, &array_buffer)) ||
        !check_napi(env, napi_create_typedarray(
            env, napi_uint8_array, byte_length, array_buffer, 0, &result)))
    {
        free(words);
        return NULL;
    }
    fmpz_init(magnitude);
    for (size_t index = 0; index < entry_count; index++)
    {
        const fmpz *entry = fmpz_mat_entry(
            matrix->integer,
            (slong) (index / (size_t) cols),
            (slong) (index % (size_t) cols));
        size_t bytes = (size_t) (fmpz_bits(entry) + 7) / 8;
        size_t word_count = (bytes + sizeof(ulong) - 1) / sizeof(ulong);
        uint32_t header = (uint32_t) bytes;

        if (fmpz_sgn(entry) < 0)
            header |= UINT32_C(0x80000000);
        write_uint32_le(data + offset, header);
        offset += 4;
        if (bytes != 0)
        {
            fmpz_abs(magnitude, entry);
            fmpz_get_ui_array(words, (slong) word_count, magnitude);
            for (size_t byte = 0; byte < bytes; byte++)
                data[offset + byte] = (uint8_t)
                    (words[byte / sizeof(ulong)] >>
                     (8 * (byte % sizeof(ulong))));
            offset += bytes;
        }
    }
    fmpz_clear(magnitude);
    free(words);
    return result;
}

napi_value sagejs_zz_matrix_packed(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_typedarray_type array_type;
    napi_value array_buffer;
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    size_t entry_count;
    size_t byte_length;
    size_t byte_offset;
    size_t offset = 0;
    size_t maximum_words = 0;
    void *raw_data;
    uint8_t *data;
    ulong *words = NULL;

    if (!require_arguments(env, info, 3, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols))
        return NULL;
    if (!check_napi(env, napi_get_typedarray_info(
        env, args[2], &array_type, &byte_length, &raw_data,
        &array_buffer, &byte_offset)))
        return NULL;
    if (array_type != napi_uint8_array)
    {
        napi_throw_type_error(env, NULL,
            "packed integer matrix entries must be a Uint8Array");
        return NULL;
    }
    if (rows != 0 && (size_t) cols > SIZE_MAX / (size_t) rows)
    {
        napi_throw_range_error(env, NULL, "matrix is too large");
        return NULL;
    }
    entry_count = (size_t) rows * (size_t) cols;
    data = (uint8_t *) raw_data;
    for (size_t index = 0; index < entry_count; index++)
    {
        uint32_t header;
        size_t bytes;
        size_t word_count;

        if (byte_length - offset < 4)
            goto invalid;
        header = read_uint32_le(data + offset);
        offset += 4;
        bytes = (size_t) (header & UINT32_C(0x7fffffff));
        if (bytes > byte_length - offset)
            goto invalid;
        word_count = (bytes + sizeof(ulong) - 1) / sizeof(ulong);
        if (word_count > maximum_words)
            maximum_words = word_count;
        offset += bytes;
    }
    if (offset != byte_length)
        goto invalid;
    if (maximum_words != 0)
    {
        words = calloc(maximum_words, sizeof(ulong));
        if (words == NULL)
        {
            napi_throw_error(env, NULL,
                "unable to allocate packed integer matrix workspace");
            return NULL;
        }
    }
    matrix = new_matrix(env, SAGEJS_MATRIX_ZZ, rows, cols);
    if (matrix == NULL)
    {
        free(words);
        return NULL;
    }
    offset = 0;
    for (size_t index = 0; index < entry_count; index++)
    {
        uint32_t header = read_uint32_le(data + offset);
        size_t bytes = (size_t) (header & UINT32_C(0x7fffffff));
        size_t word_count = (bytes + sizeof(ulong) - 1) / sizeof(ulong);
        fmpz *entry = fmpz_mat_entry(
            matrix->integer,
            (slong) (index / (size_t) cols),
            (slong) (index % (size_t) cols));

        offset += 4;
        if (word_count != 0)
            memset(words, 0, word_count * sizeof(ulong));
        for (size_t byte = 0; byte < bytes; byte++)
            words[byte / sizeof(ulong)] |=
                (ulong) data[offset + byte] <<
                (8 * (byte % sizeof(ulong)));
        if (word_count == 0)
            fmpz_zero(entry);
        else
        {
            fmpz_set_ui_array(entry, words, (slong) word_count);
            if ((header & UINT32_C(0x80000000)) != 0)
                fmpz_neg(entry, entry);
        }
        offset += bytes;
    }
    free(words);
    return wrap_matrix(env, matrix);

invalid:
    napi_throw_range_error(env, NULL,
        "invalid packed integer matrix representation");
    return NULL;
}

/*
 * Packed QQ entries are a numerator signed-magnitude record followed by a
 * positive denominator magnitude record.  Each record starts with a 32-bit
 * little-endian byte length; the numerator uses the high bit as its sign.
 * FLINT stores canonical fmpq values, so importing canonicalizes once in C.
 */
napi_value sagejs_qq_matrix_export_packed(
    napi_env env, napi_callback_info info)
{
    napi_value args[1];
    napi_value array_buffer;
    napi_value result;
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    size_t entry_count;
    size_t byte_length = 0;
    size_t maximum_words = 0;
    size_t offset = 0;
    ulong *words = NULL;
    uint8_t *data;
    fmpz_t magnitude;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    matrix = unwrap_matrix(env, args[0]);
    if (matrix == NULL)
        return NULL;
    if (matrix->kind != SAGEJS_MATRIX_QQ)
    {
        napi_throw_type_error(env, NULL,
            "packed rational export requires a QQ matrix");
        return NULL;
    }
    rows = fmpq_mat_nrows(matrix->rational);
    cols = fmpq_mat_ncols(matrix->rational);
    if (rows != 0 && (size_t) cols > SIZE_MAX / (size_t) rows)
    {
        napi_throw_range_error(env, NULL, "matrix is too large");
        return NULL;
    }
    entry_count = (size_t) rows * (size_t) cols;
    for (size_t index = 0; index < entry_count; index++)
    {
        const fmpq *entry = fmpq_mat_entry(
            matrix->rational,
            (slong) (index / (size_t) cols),
            (slong) (index % (size_t) cols));
        const fmpz *parts[2] = {fmpq_numref(entry), fmpq_denref(entry)};

        for (size_t part = 0; part < 2; part++)
        {
            size_t bytes = (size_t) (fmpz_bits(parts[part]) + 7) / 8;
            size_t word_count =
                (bytes + sizeof(ulong) - 1) / sizeof(ulong);
            if (bytes > UINT32_C(0x7fffffff) ||
                byte_length > SIZE_MAX - 4 - bytes)
            {
                napi_throw_range_error(env, NULL,
                    "rational matrix packed representation is too large");
                return NULL;
            }
            byte_length += 4 + bytes;
            if (word_count > maximum_words)
                maximum_words = word_count;
        }
    }
    if (maximum_words != 0)
    {
        words = malloc(maximum_words * sizeof(ulong));
        if (words == NULL)
        {
            napi_throw_error(env, NULL,
                "unable to allocate packed rational matrix workspace");
            return NULL;
        }
    }
    if (!check_napi(env, napi_create_arraybuffer(
        env, byte_length, (void **) &data, &array_buffer)) ||
        !check_napi(env, napi_create_typedarray(
            env, napi_uint8_array, byte_length, array_buffer, 0, &result)))
    {
        free(words);
        return NULL;
    }
    fmpz_init(magnitude);
    for (size_t index = 0; index < entry_count; index++)
    {
        const fmpq *entry = fmpq_mat_entry(
            matrix->rational,
            (slong) (index / (size_t) cols),
            (slong) (index % (size_t) cols));
        const fmpz *parts[2] = {fmpq_numref(entry), fmpq_denref(entry)};

        for (size_t part = 0; part < 2; part++)
        {
            size_t bytes = (size_t) (fmpz_bits(parts[part]) + 7) / 8;
            size_t word_count =
                (bytes + sizeof(ulong) - 1) / sizeof(ulong);
            uint32_t header = (uint32_t) bytes;

            if (part == 0 && fmpz_sgn(parts[part]) < 0)
                header |= UINT32_C(0x80000000);
            write_uint32_le(data + offset, header);
            offset += 4;
            if (bytes != 0)
            {
                fmpz_abs(magnitude, parts[part]);
                fmpz_get_ui_array(words, (slong) word_count, magnitude);
                for (size_t byte = 0; byte < bytes; byte++)
                    data[offset + byte] = (uint8_t)
                        (words[byte / sizeof(ulong)] >>
                         (8 * (byte % sizeof(ulong))));
                offset += bytes;
            }
        }
    }
    fmpz_clear(magnitude);
    free(words);
    return result;
}

napi_value sagejs_qq_matrix_packed(
    napi_env env, napi_callback_info info)
{
    napi_value args[3];
    napi_typedarray_type array_type;
    napi_value array_buffer;
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    size_t entry_count;
    size_t byte_length;
    size_t byte_offset;
    size_t offset = 0;
    size_t maximum_words = 0;
    void *raw_data;
    uint8_t *data;
    ulong *words = NULL;
    fmpz_t numerator;
    fmpz_t denominator;

    if (!require_arguments(env, info, 3, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols))
        return NULL;
    if (!check_napi(env, napi_get_typedarray_info(
        env, args[2], &array_type, &byte_length, &raw_data,
        &array_buffer, &byte_offset)))
        return NULL;
    if (array_type != napi_uint8_array)
    {
        napi_throw_type_error(env, NULL,
            "packed rational matrix entries must be a Uint8Array");
        return NULL;
    }
    if (rows != 0 && (size_t) cols > SIZE_MAX / (size_t) rows)
    {
        napi_throw_range_error(env, NULL, "matrix is too large");
        return NULL;
    }
    entry_count = (size_t) rows * (size_t) cols;
    data = (uint8_t *) raw_data;
    for (size_t index = 0; index < entry_count; index++)
    {
        for (size_t part = 0; part < 2; part++)
        {
            uint32_t header;
            size_t bytes;
            size_t word_count;
            if (byte_length - offset < 4)
                goto invalid;
            header = read_uint32_le(data + offset);
            offset += 4;
            if (part == 1 && (header & UINT32_C(0x80000000)) != 0)
                goto invalid;
            bytes = (size_t) (header & UINT32_C(0x7fffffff));
            if (bytes > byte_length - offset)
                goto invalid;
            word_count = (bytes + sizeof(ulong) - 1) / sizeof(ulong);
            if (word_count > maximum_words)
                maximum_words = word_count;
            offset += bytes;
        }
    }
    if (offset != byte_length)
        goto invalid;
    if (maximum_words != 0)
    {
        words = calloc(maximum_words, sizeof(ulong));
        if (words == NULL)
        {
            napi_throw_error(env, NULL,
                "unable to allocate packed rational matrix workspace");
            return NULL;
        }
    }
    matrix = new_matrix(env, SAGEJS_MATRIX_QQ, rows, cols);
    if (matrix == NULL)
    {
        free(words);
        return NULL;
    }
    fmpz_init(numerator);
    fmpz_init(denominator);
    offset = 0;
    for (size_t index = 0; index < entry_count; index++)
    {
        fmpz *parts[2] = {numerator, denominator};
        for (size_t part = 0; part < 2; part++)
        {
            uint32_t header = read_uint32_le(data + offset);
            size_t bytes =
                (size_t) (header & UINT32_C(0x7fffffff));
            size_t word_count =
                (bytes + sizeof(ulong) - 1) / sizeof(ulong);
            offset += 4;
            if (word_count != 0)
                memset(words, 0, word_count * sizeof(ulong));
            for (size_t byte = 0; byte < bytes; byte++)
                words[byte / sizeof(ulong)] |=
                    (ulong) data[offset + byte] <<
                    (8 * (byte % sizeof(ulong)));
            if (word_count == 0)
                fmpz_zero(parts[part]);
            else
            {
                fmpz_set_ui_array(parts[part], words, (slong) word_count);
                if (part == 0 &&
                    (header & UINT32_C(0x80000000)) != 0)
                    fmpz_neg(parts[part], parts[part]);
            }
            offset += bytes;
        }
        if (fmpz_is_zero(denominator))
        {
            fmpz_clear(numerator);
            fmpz_clear(denominator);
            finalize_matrix(env, matrix, NULL);
            free(words);
            goto invalid;
        }
        fmpq_set_fmpz_frac(
            fmpq_mat_entry(
                matrix->rational,
                (slong) (index / (size_t) cols),
                (slong) (index % (size_t) cols)),
            numerator,
            denominator);
    }
    fmpz_clear(numerator);
    fmpz_clear(denominator);
    free(words);
    return wrap_matrix(env, matrix);

invalid:
    napi_throw_range_error(env, NULL,
        "invalid packed rational matrix representation");
    return NULL;
}

static napi_value modular_matrix_random(
    napi_env env,
    napi_callback_info info,
    sagejs_matrix_kind kind)
{
    napi_value args[5];
    sagejs_matrix *matrix;
    slong rows;
    slong cols;
    slong row;
    slong col;
    ulong modulus;
    ulong seed1;
    ulong seed2;
    flint_rand_t state;

    if (!require_arguments(env, info, 5, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols) ||
        !bigint_to_ulong(env, args[2], &modulus) ||
        !bigint_to_ulong(env, args[3], &seed1) ||
        !bigint_to_ulong(env, args[4], &seed2))
        return NULL;
    matrix = new_nmod_matrix(env, kind, rows, cols, modulus);
    if (matrix == NULL)
        return NULL;
    flint_rand_init(state);
    if (seed1 == 0 && seed2 == 0)
        seed2 = 1;
    flint_rand_set_seed(state, seed1, seed2);
    for (row = 0; row < rows; row++)
        for (col = 0; col < cols; col++)
            nmod_mat_entry(matrix->modular, row, col) =
                n_randint(state, modulus);
    flint_rand_clear(state);
    return wrap_matrix(env, matrix);
}

napi_value sagejs_nmod_matrix_random(
    napi_env env, napi_callback_info info)
{
    return modular_matrix_random(env, info, SAGEJS_MATRIX_NMOD);
}

napi_value sagejs_zmod_matrix_random(
    napi_env env, napi_callback_info info)
{
    return modular_matrix_random(env, info, SAGEJS_MATRIX_ZMOD);
}

static void acb_set_mpc_exact(acb_t target, const mpc_t source)
{
    arf_t part;

    arf_init(part);
    arf_set_mpfr(part, mpc_realref(source));
    arb_set_arf(acb_realref(target), part);
    arf_set_mpfr(part, mpc_imagref(source));
    arb_set_arf(acb_imagref(target), part);
    arf_clear(part);
}

static sagejs_complex *complex_from_acb_midpoint(
    napi_env env,
    const acb_t value,
    slong precision)
{
    sagejs_complex *result =
        sagejs_native_new_complex(env, (mpfr_prec_t) precision);

    if (result == NULL)
        return NULL;
    arf_get_mpfr(
        mpc_realref(result->value),
        arb_midref(acb_realref(value)),
        MPFR_RNDN);
    arf_get_mpfr(
        mpc_imagref(result->value),
        arb_midref(acb_imagref(value)),
        MPFR_RNDN);
    return result;
}

napi_value sagejs_acb_matrix(napi_env env, napi_callback_info info)
{
    napi_value args[4];
    sagejs_matrix *matrix;
    sagejs_complex *entry;
    slong rows;
    slong cols;
    slong precision;
    uint32_t length;
    uint64_t expected;
    uint32_t index;
    bool is_array = false;
    napi_value value;

    if (!require_arguments(env, info, 4, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols) ||
        !check_napi(env, napi_is_array(env, args[2], &is_array)) ||
        !value_to_dimension(env, args[3], &precision))
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
    matrix = new_acb_matrix(env, rows, cols, precision);
    if (matrix == NULL)
        return NULL;
    for (index = 0; index < length; index++)
    {
        if (!check_napi(env,
            napi_get_element(env, args[2], index, &value)) ||
            (entry = sagejs_native_unwrap_complex(env, value)) == NULL)
        {
            finalize_matrix(env, matrix, NULL);
            return NULL;
        }
        acb_set_mpc_exact(
            acb_mat_entry(
                matrix->approximate, index / cols, index % cols),
            entry->value);
    }
    return wrap_matrix(env, matrix);
}

napi_value sagejs_qqbar_matrix(napi_env env, napi_callback_info info)
{
    napi_value args[4];
    sagejs_matrix *matrix;
    qqbar_srcptr entry;
    slong rows;
    slong cols;
    uint32_t length;
    uint64_t expected;
    uint32_t index;
    bool is_array = false;
    bool real_only = false;
    napi_value value;

    if (!require_arguments(env, info, 4, args) ||
        !value_to_dimension(env, args[0], &rows) ||
        !value_to_dimension(env, args[1], &cols) ||
        !check_napi(env, napi_is_array(env, args[2], &is_array)) ||
        !check_napi(env, napi_get_value_bool(env, args[3], &real_only)))
        return NULL;
    if (!is_array ||
        !check_napi(env, napi_get_array_length(env, args[2], &length)))
    {
        napi_throw_type_error(env, NULL, "matrix entries must be an Array");
        return NULL;
    }
    expected = (uint64_t) rows * (uint64_t) cols;
    if (expected > UINT32_MAX || length != expected)
    {
        napi_throw_range_error(env, NULL,
            "matrix entry count does not match its dimensions");
        return NULL;
    }
    matrix = new_qqbar_matrix(env, rows, cols, real_only);
    if (matrix == NULL)
        return NULL;
    for (index = 0; index < length; index++)
    {
        if (!check_napi(env,
            napi_get_element(env, args[2], index, &value)) ||
            (entry = sagejs_qqbar_unwrap(env, value)) == NULL)
        {
            finalize_matrix(env, matrix, NULL);
            return NULL;
        }
        if (real_only && !qqbar_is_real(entry))
        {
            finalize_matrix(env, matrix, NULL);
            napi_throw_type_error(env, NULL,
                "AA matrix entries must be real");
            return NULL;
        }
        qqbar_set(
            (qqbar_ptr) gr_mat_entry_ptr(
                matrix->algebraic,
                index / cols,
                index % cols,
                matrix->algebraic_context),
            entry);
    }
    return wrap_matrix(env, matrix);
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
    if (left->kind == SAGEJS_MATRIX_ACB &&
        left->precision != right->precision)
    {
        napi_throw_type_error(env, NULL,
            "approximate matrix precisions differ");
        return NULL;
    }
    if (left->kind == SAGEJS_MATRIX_QQBAR &&
        left->algebraic_real != right->algebraic_real)
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
    else if (left->kind == SAGEJS_MATRIX_ACB)
    {
        if (operation == MATRIX_ADD)
            acb_mat_add(
                answer->approximate,
                left->approximate,
                right->approximate,
                left->precision);
        else if (operation == MATRIX_SUB)
            acb_mat_sub(
                answer->approximate,
                left->approximate,
                right->approximate,
                left->precision);
        else
            acb_mat_mul(
                answer->approximate,
                left->approximate,
                right->approximate,
                left->precision);
    }
    else if (left->kind == SAGEJS_MATRIX_QQBAR)
    {
        int status;

        if (operation == MATRIX_ADD)
            status = gr_mat_add(
                answer->algebraic,
                left->algebraic,
                right->algebraic,
                left->algebraic_context);
        else if (operation == MATRIX_SUB)
            status = gr_mat_sub(
                answer->algebraic,
                left->algebraic,
                right->algebraic,
                left->algebraic_context);
        else
            status = gr_mat_mul(
                answer->algebraic,
                left->algebraic,
                right->algebraic,
                left->algebraic_context);
        if (status != GR_SUCCESS)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_error(env, NULL,
                "FLINT algebraic matrix arithmetic failed");
            return NULL;
        }
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

napi_value sagejs_matrix_mul_blas(napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result;
    sagejs_matrix *left;
    sagejs_matrix *right;
    sagejs_matrix *answer;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_matrix(env, args[0]);
    right = unwrap_matrix(env, args[1]);
    if (left == NULL || right == NULL)
        return NULL;
    if (!matrix_is_modular(left) || left->kind != right->kind ||
        matrix_modulus(left) != matrix_modulus(right))
    {
        napi_throw_type_error(env, NULL,
            "BLAS multiplication requires matrices over the same word modulus");
        return NULL;
    }
    if (matrix_ncols(left) != matrix_nrows(right))
    {
        napi_throw_range_error(env, NULL,
            "matrix dimensions are incompatible for multiplication");
        return NULL;
    }
    answer = new_matrix_like(
        env, left, matrix_nrows(left), matrix_ncols(right));
    if (answer == NULL)
        return NULL;
    if (!nmod_mat_mul_blas(answer->modular, left->modular, right->modular))
    {
        finalize_matrix(env, answer, NULL);
        if (!check_napi(env, napi_get_null(env, &result)))
            return NULL;
        return result;
    }
    return wrap_matrix(env, answer);
}

static int matrix_sparse_left_cyclotomic(
    sagejs_matrix *answer,
    const sagejs_matrix *left,
    const sagejs_matrix *right)
{
    slong rows = matrix_nrows(left);
    slong inner = matrix_ncols(left);
    slong columns = matrix_ncols(right);
    size_t degree = right->cyclotomic_degree;
    size_t count, left_count;
    fmpq *left_coordinates = NULL;
    fmpz *products = NULL;
    fmpq_t product, weighted;
    fmpq_poly_t expression;
    fmpz_poly_t cyclotomic, monomial, remainder;
    qqbar_t root;

    if (right->cyclotomic_coordinates == NULL)
        return 1;
    if (rows != 0 && ((size_t) columns > SIZE_MAX / (size_t) rows ||
            (size_t) inner > SIZE_MAX / (size_t) rows))
        return 0;
    count = (size_t) rows * (size_t) columns;
    left_count = (size_t) rows * (size_t) inner;
    if (degree == 0 || count > SIZE_MAX / degree ||
        left_count > SIZE_MAX / degree ||
        count * degree > (size_t) WORD_MAX ||
        left_count * degree > (size_t) WORD_MAX)
        return 0;
    answer->cyclotomic_coordinates = _fmpq_vec_init(
        (slong) (count * degree == 0 ? 1 : count * degree));
    if (answer->cyclotomic_coordinates == NULL)
        return 0;
    answer->cyclotomic_order = right->cyclotomic_order;
    answer->cyclotomic_degree = degree;
    left_count *= degree;
    left_coordinates = _fmpq_vec_init(
        (slong) (left_count == 0 ? 1 : left_count));
    products = _fmpz_vec_init((slong) ((2 * degree - 1) * degree));
    if (left_coordinates == NULL || products == NULL)
        goto fail;
    fmpq_init(weighted);
    fmpq_init(product);
    fmpq_poly_init(expression);
    fmpz_poly_init(cyclotomic);
    fmpz_poly_init(monomial);
    fmpz_poly_init(remainder);
    qqbar_init(root);
    fmpz_poly_cyclotomic(cyclotomic, right->cyclotomic_order);
    qqbar_root_of_unity(root, 1, right->cyclotomic_order);
    for (size_t combined = 0; combined < 2 * degree - 1; combined++)
    {
        fmpz_poly_zero(monomial);
        fmpz_poly_set_coeff_ui(monomial, (slong) combined, 1);
        fmpz_poly_rem(remainder, monomial, cyclotomic);
        for (size_t power = 0; power < degree; power++)
            fmpz_poly_get_coeff_fmpz(
                products + combined * degree + power,
                remainder, (slong) power);
    }
    for (slong row = 0; row < rows; row++)
        for (slong index = 0; index < inner; index++)
        {
            qqbar_srcptr value = (qqbar_srcptr) gr_mat_entry_ptr(
                (gr_mat_struct *) left->algebraic, row, index,
                (gr_ctx_struct *) left->algebraic_context);
            if (qqbar_is_zero(value))
                continue;
            if (left->cyclotomic_coordinates != NULL &&
                left->cyclotomic_order == right->cyclotomic_order &&
                left->cyclotomic_degree == degree)
            {
                for (size_t power = 0; power < degree; power++)
                    fmpq_set(left_coordinates +
                            ((size_t) row * (size_t) inner +
                                (size_t) index) * degree + power,
                        left->cyclotomic_coordinates +
                            ((size_t) row * (size_t) inner +
                                (size_t) index) * degree + power);
                continue;
            }
            if (qqbar_is_rational(value))
            {
                qqbar_get_fmpq(left_coordinates +
                    ((size_t) row * (size_t) inner +
                        (size_t) index) * degree, value);
                continue;
            }
            {
                int expressed = 0;
                for (slong bits = 64; bits <= 4096 && !expressed; bits *= 2)
                    expressed = qqbar_express_in_field(
                        expression, root, value, bits, 0, bits);
                if (!expressed)
                    goto fail_initialized;
                for (size_t power = 0; power < degree; power++)
                    fmpq_poly_get_coeff_fmpq(left_coordinates +
                            ((size_t) row * (size_t) inner +
                                (size_t) index) * degree + power,
                        expression, (slong) power);
            }
        }
    for (slong row = 0; row < rows; row++)
        for (slong index = 0; index < inner; index++)
        {
            const fmpq *left_entry = left_coordinates +
                ((size_t) row * (size_t) inner + (size_t) index) * degree;
            int left_zero = 1;
            for (size_t left_power = 0; left_power < degree; left_power++)
                left_zero &= fmpq_is_zero(left_entry + left_power);
            if (left_zero)
                continue;
            for (slong column = 0; column < columns; column++)
            {
                const fmpq *right_entry = right->cyclotomic_coordinates +
                        ((size_t) index * (size_t) columns +
                            (size_t) column) * degree;
                fmpq *target = answer->cyclotomic_coordinates +
                    ((size_t) row * (size_t) columns +
                        (size_t) column) * degree;
                for (size_t left_power = 0;
                    left_power < degree; left_power++)
                    if (!fmpq_is_zero(left_entry + left_power))
                        for (size_t right_power = 0;
                            right_power < degree; right_power++)
                            if (!fmpq_is_zero(right_entry + right_power))
                            {
                                fmpq_mul(product, left_entry + left_power,
                                    right_entry + right_power);
                                for (size_t output_power = 0;
                                    output_power < degree; output_power++)
                                {
                                    const fmpz *factor = products +
                                        (left_power + right_power) * degree +
                                        output_power;
                                    if (fmpz_is_zero(factor))
                                        continue;
                                    fmpq_mul_fmpz(weighted, product, factor);
                                    fmpq_add(target + output_power,
                                        target + output_power, weighted);
                                }
                            }
            }
        }
    qqbar_clear(root);
    fmpz_poly_clear(remainder);
    fmpz_poly_clear(monomial);
    fmpz_poly_clear(cyclotomic);
    fmpq_poly_clear(expression);
    fmpq_clear(product);
    fmpq_clear(weighted);
    _fmpz_vec_clear(products, (slong) ((2 * degree - 1) * degree));
    _fmpq_vec_clear(left_coordinates,
        (slong) (left_count == 0 ? 1 : left_count));
    return 1;

fail_initialized:
    qqbar_clear(root);
    fmpz_poly_clear(remainder);
    fmpz_poly_clear(monomial);
    fmpz_poly_clear(cyclotomic);
    fmpq_poly_clear(expression);
    fmpq_clear(product);
    fmpq_clear(weighted);
fail:
    if (products != NULL)
        _fmpz_vec_clear(products, (slong) ((2 * degree - 1) * degree));
    if (left_coordinates != NULL)
        _fmpq_vec_clear(left_coordinates,
            (slong) (left_count == 0 ? 1 : left_count));
    _fmpq_vec_clear(answer->cyclotomic_coordinates,
        (slong) (count * degree == 0 ? 1 : count * degree));
    answer->cyclotomic_coordinates = NULL;
    answer->cyclotomic_order = 0;
    answer->cyclotomic_degree = 0;
    return 1;
}

napi_value sagejs_cyclotomic_matrix_poly_evaluate(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    sagejs_matrix *source, *answer = NULL;
    uint32_t length;
    napi_value item;
    qqbar_srcptr coefficient;
    fmpq *coefficient_coordinates = NULL;
    fmpz_poly_t cyclotomic_integer;
    fmpq_poly_t expression, defining;
    nf_t number_field;
    nf_elem_t coefficient_nf;
    gr_ctx_t number_field_context;
    gr_mat_t source_nf, current_nf, next_nf;
    qqbar_t root, value;
    slong size;
    size_t degree, coordinate_count, matrix_coordinate_count = 0;
    int scalar_initialized = 0, number_field_initialized = 0;
    int matrices_initialized = 0;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL || !check_napi(env,
            napi_get_array_length(env, args[1], &length)))
        return NULL;
    if (source->kind != SAGEJS_MATRIX_QQBAR ||
        source->cyclotomic_coordinates == NULL ||
        matrix_nrows(source) != matrix_ncols(source) || length == 0)
    {
        napi_throw_type_error(env, NULL,
            "cyclotomic polynomial evaluation requires a square "
            "cyclotomic matrix and a nonempty coefficient array");
        return NULL;
    }
    size = matrix_nrows(source);
    degree = source->cyclotomic_degree;
    if ((size_t) length > SIZE_MAX / degree)
        goto allocation_failure;
    coordinate_count = (size_t) length * degree;
    coefficient_coordinates = _fmpq_vec_init(
        (slong) (coordinate_count == 0 ? 1 : coordinate_count));
    if (coefficient_coordinates == NULL)
        goto allocation_failure;
    fmpz_poly_init(cyclotomic_integer);
    fmpq_poly_init(expression);
    fmpq_poly_init(defining);
    qqbar_init(root);
    qqbar_init(value);
    scalar_initialized = 1;
    qqbar_root_of_unity(root, 1, source->cyclotomic_order);
    for (uint32_t index = 0; index < length; index++)
    {
        int expressed;
        if (!check_napi(env, napi_get_element(env, args[1], index, &item)) ||
            (coefficient = sagejs_qqbar_unwrap(env, item)) == NULL)
            goto cleanup;
        fmpq_poly_zero(expression);
        expressed = qqbar_is_zero(coefficient);
        for (slong bits = 128; bits <= 8192 && !expressed; bits *= 2)
            expressed = qqbar_express_in_field(
                expression, root, coefficient, bits, 0, bits);
        if (!expressed)
        {
            napi_throw_range_error(env, NULL,
                "polynomial coefficient is not in the cyclotomic field");
            goto cleanup;
        }
        for (size_t power = 0; power < degree; power++)
            fmpq_poly_get_coeff_fmpq(
                coefficient_coordinates + (size_t) index * degree + power,
                    expression, (slong) power);
    }

    fmpz_poly_cyclotomic(cyclotomic_integer, source->cyclotomic_order);
    fmpq_poly_set_fmpz_poly(defining, cyclotomic_integer);
    nf_init(number_field, defining);
    number_field_initialized = 1;
    nf_elem_init(coefficient_nf, number_field);
    _gr_ctx_init_nf_from_ref(number_field_context, number_field);
    gr_mat_init(source_nf, size, size, number_field_context);
    gr_mat_init(current_nf, size, size, number_field_context);
    gr_mat_init(next_nf, size, size, number_field_context);
    matrices_initialized = 1;
    if (gr_mat_zero(current_nf, number_field_context) != GR_SUCCESS)
        goto arithmetic_failure;
    for (slong row = 0; row < size; row++)
        for (slong column = 0; column < size; column++)
        {
            fmpq_poly_zero(expression);
            for (size_t power = 0; power < degree; power++)
                fmpq_poly_set_coeff_fmpq(
                    expression, (slong) power,
                    source->cyclotomic_coordinates +
                        ((size_t) row * (size_t) size +
                            (size_t) column) * degree + power);
            nf_elem_set_fmpq_poly(
                (nf_elem_struct *) gr_mat_entry_ptr(
                    source_nf, row, column, number_field_context),
                expression, number_field);
        }
    fmpq_poly_zero(expression);
    for (size_t power = 0; power < degree; power++)
        fmpq_poly_set_coeff_fmpq(
            expression, (slong) power,
            coefficient_coordinates +
                ((size_t) length - 1) * degree + power);
    nf_elem_set_fmpq_poly(coefficient_nf, expression, number_field);
    for (slong diagonal = 0; diagonal < size; diagonal++)
        nf_elem_set(
            (nf_elem_struct *) gr_mat_entry_ptr(
                current_nf, diagonal, diagonal, number_field_context),
            coefficient_nf, number_field);

    for (slong index = (slong) length - 2; index >= 0; index--)
    {
        if (gr_mat_mul(next_nf, current_nf,
                source_nf, number_field_context) != GR_SUCCESS)
            goto arithmetic_failure;
        fmpq_poly_zero(expression);
        for (size_t power = 0; power < degree; power++)
            fmpq_poly_set_coeff_fmpq(
                expression, (slong) power,
                coefficient_coordinates + (size_t) index * degree + power);
        nf_elem_set_fmpq_poly(coefficient_nf, expression, number_field);
        for (slong diagonal = 0; diagonal < size; diagonal++)
        {
            nf_elem_struct *entry = (nf_elem_struct *) gr_mat_entry_ptr(
                next_nf, diagonal, diagonal, number_field_context);
            nf_elem_add(entry, entry, coefficient_nf, number_field);
        }
        gr_mat_swap(current_nf, next_nf, number_field_context);
    }

    answer = new_qqbar_matrix(env, size, size, 0);
    if (answer == NULL)
        goto cleanup;
    if ((size_t) size != 0 && (size_t) size > SIZE_MAX / (size_t) size)
        goto allocation_failure;
    matrix_coordinate_count =
        (size_t) size * (size_t) size * degree;
    answer->cyclotomic_coordinates = _fmpq_vec_init(
        (slong) (matrix_coordinate_count == 0
            ? 1 : matrix_coordinate_count));
    if (answer->cyclotomic_coordinates == NULL)
        goto allocation_failure;
    answer->cyclotomic_order = source->cyclotomic_order;
    answer->cyclotomic_degree = degree;
    for (slong row = 0; row < size; row++)
        for (slong column = 0; column < size; column++)
        {
            fmpq_poly_zero(expression);
            nf_elem_get_fmpq_poly(
                expression,
                (const nf_elem_struct *) gr_mat_entry_ptr(
                    current_nf, row, column, number_field_context),
                number_field);
            for (size_t power = 0; power < degree; power++)
                fmpq_poly_get_coeff_fmpq(
                    answer->cyclotomic_coordinates +
                        ((size_t) row * (size_t) size +
                            (size_t) column) * degree + power,
                    expression, (slong) power);
            qqbar_evaluate_fmpq_poly(value, expression, root);
            qqbar_set((qqbar_ptr) gr_mat_entry_ptr(
                answer->algebraic, row, column,
                answer->algebraic_context), value);
        }
    gr_mat_clear(next_nf, number_field_context);
    gr_mat_clear(current_nf, number_field_context);
    gr_mat_clear(source_nf, number_field_context);
    matrices_initialized = 0;
    nf_elem_clear(coefficient_nf, number_field);
    nf_clear(number_field);
    number_field_initialized = 0;
    qqbar_clear(value);
    qqbar_clear(root);
    fmpq_poly_clear(defining);
    fmpq_poly_clear(expression);
    fmpz_poly_clear(cyclotomic_integer);
    scalar_initialized = 0;
    _fmpq_vec_clear(coefficient_coordinates,
        (slong) (coordinate_count == 0 ? 1 : coordinate_count));
    return wrap_matrix(env, answer);

allocation_failure:
    napi_throw_error(env, NULL,
        "unable to allocate cyclotomic polynomial matrix coordinates");
    goto cleanup;
arithmetic_failure:
    napi_throw_error(env, NULL,
        "FLINT cyclotomic polynomial matrix evaluation failed");
cleanup:
    if (answer != NULL)
        finalize_matrix(env, answer, NULL);
    if (matrices_initialized)
    {
        gr_mat_clear(next_nf, number_field_context);
        gr_mat_clear(current_nf, number_field_context);
        gr_mat_clear(source_nf, number_field_context);
    }
    if (number_field_initialized)
    {
        nf_elem_clear(coefficient_nf, number_field);
        nf_clear(number_field);
    }
    if (scalar_initialized)
    {
        qqbar_clear(value);
        qqbar_clear(root);
        fmpq_poly_clear(defining);
        fmpq_poly_clear(expression);
        fmpz_poly_clear(cyclotomic_integer);
    }
    if (coefficient_coordinates != NULL)
        _fmpq_vec_clear(coefficient_coordinates,
            (slong) (coordinate_count == 0 ? 1 : coordinate_count));
    return NULL;
}

napi_value sagejs_matrix_sparse_left_mul(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    sagejs_matrix *left, *right, *answer;
    slong rows, inner, cols;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    left = unwrap_matrix(env, args[0]);
    right = unwrap_matrix(env, args[1]);
    if (left == NULL || right == NULL)
        return NULL;
    if (left->kind != right->kind ||
        (left->kind != SAGEJS_MATRIX_ZZ &&
         left->kind != SAGEJS_MATRIX_QQ &&
         left->kind != SAGEJS_MATRIX_QQBAR))
    {
        napi_throw_type_error(env, NULL,
            "sparse-left multiplication requires a common exact base ring");
        return NULL;
    }
    if (matrix_ncols(left) != matrix_nrows(right))
    {
        napi_throw_range_error(env, NULL,
            "matrix dimensions are incompatible for multiplication");
        return NULL;
    }
    rows = matrix_nrows(left);
    inner = matrix_ncols(left);
    cols = matrix_ncols(right);
    answer = new_matrix_like(env, left, rows, cols);
    if (answer == NULL)
        return NULL;
    if (left->kind == SAGEJS_MATRIX_ZZ)
    {
        for (slong row = 0; row < rows; row++)
            for (slong index = 0; index < inner; index++)
            {
                const fmpz *coefficient =
                    fmpz_mat_entry(left->integer, row, index);
                if (fmpz_is_zero(coefficient))
                    continue;
                for (slong col = 0; col < cols; col++)
                    fmpz_addmul(
                        fmpz_mat_entry(answer->integer, row, col),
                        coefficient,
                        fmpz_mat_entry(right->integer, index, col));
            }
    }
    else if (left->kind == SAGEJS_MATRIX_QQ)
    {
        fmpq_t product;
        fmpq_init(product);
        for (slong row = 0; row < rows; row++)
            for (slong index = 0; index < inner; index++)
            {
                const fmpq *coefficient =
                    fmpq_mat_entry(left->rational, row, index);
                if (fmpq_is_zero(coefficient))
                    continue;
                for (slong col = 0; col < cols; col++)
                {
                    fmpq_mul(
                        product,
                        coefficient,
                        fmpq_mat_entry(right->rational, index, col));
                    fmpq_add(
                        fmpq_mat_entry(answer->rational, row, col),
                        fmpq_mat_entry(answer->rational, row, col),
                        product);
                }
            }
        fmpq_clear(product);
    }
    else
    {
        qqbar_t product;
        qqbar_init(product);
        for (slong row = 0; row < rows; row++)
            for (slong index = 0; index < inner; index++)
            {
                qqbar_srcptr coefficient =
                    (qqbar_srcptr) gr_mat_entry_ptr(
                        left->algebraic, row, index,
                        left->algebraic_context);
                if (qqbar_is_zero(coefficient))
                    continue;
                for (slong col = 0; col < cols; col++)
                {
                    qqbar_ptr target =
                        (qqbar_ptr) gr_mat_entry_ptr(
                            answer->algebraic, row, col,
                            answer->algebraic_context);
                    qqbar_mul(
                        product,
                        coefficient,
                        (qqbar_srcptr) gr_mat_entry_ptr(
                            right->algebraic, index, col,
                            right->algebraic_context));
                    qqbar_add(target, target, product);
                }
            }
        qqbar_clear(product);
    }
    if (left->kind == SAGEJS_MATRIX_QQBAR &&
        !matrix_sparse_left_cyclotomic(answer, left, right))
    {
        finalize_matrix(env, answer, NULL);
        napi_throw_error(env, NULL,
            "unable to preserve cyclotomic matrix coordinates");
        return NULL;
    }
    return wrap_matrix(env, answer);
}

static int matrix_indices(
    napi_env env,
    napi_value value,
    slong limit,
    slong **indices,
    slong *count)
{
    bool is_array;
    uint32_t length;
    slong *result;

    if (!check_napi(env, napi_is_array(env, value, &is_array)))
        return 0;
    if (!is_array)
    {
        napi_throw_type_error(env, NULL, "matrix indices must be an array");
        return 0;
    }
    if (!check_napi(env, napi_get_array_length(env, value, &length)))
        return 0;
    result = malloc((length == 0 ? 1 : length) * sizeof(*result));
    if (result == NULL)
    {
        napi_throw_error(env, NULL, "unable to allocate matrix indices");
        return 0;
    }
    for (uint32_t index = 0; index < length; index++)
    {
        napi_value item;
        if (!check_napi(env, napi_get_element(env, value, index, &item)) ||
            !value_to_index(env, item, limit, &result[index]))
        {
            free(result);
            return 0;
        }
    }
    *indices = result;
    *count = (slong) length;
    return 1;
}

static void matrix_copy_entry(
    sagejs_matrix *target,
    slong target_row,
    slong target_col,
    const sagejs_matrix *source,
    slong source_row,
    slong source_col)
{
    if (source->kind == SAGEJS_MATRIX_ZZ)
        fmpz_set(
            fmpz_mat_entry(target->integer, target_row, target_col),
            fmpz_mat_entry(source->integer, source_row, source_col));
    else if (source->kind == SAGEJS_MATRIX_QQ)
        fmpq_set(
            fmpq_mat_entry(target->rational, target_row, target_col),
            fmpq_mat_entry(source->rational, source_row, source_col));
    else if (source->kind == SAGEJS_MATRIX_ACB)
        acb_set(
            acb_mat_entry(target->approximate, target_row, target_col),
            acb_mat_entry(source->approximate, source_row, source_col));
    else if (source->kind == SAGEJS_MATRIX_QQBAR)
        qqbar_set(
            (qqbar_ptr) gr_mat_entry_ptr(
                target->algebraic, target_row, target_col,
                target->algebraic_context),
            (qqbar_srcptr) gr_mat_entry_ptr(
                (gr_mat_struct *) source->algebraic,
                source_row, source_col,
                (gr_ctx_struct *) source->algebraic_context));
    else
        nmod_mat_entry(target->modular, target_row, target_col) =
            nmod_mat_entry(source->modular, source_row, source_col);
}

static int matrix_copy_cyclotomic_selection(
    sagejs_matrix *target,
    const sagejs_matrix *source,
    const slong *indices,
    int select_rows)
{
    slong rows = matrix_nrows(target);
    slong columns = matrix_ncols(target);
    size_t degree = source->cyclotomic_degree;
    size_t count;

    if (source->cyclotomic_coordinates == NULL)
        return 1;
    if (rows != 0 && (size_t) columns > SIZE_MAX / (size_t) rows)
        return 0;
    count = (size_t) rows * (size_t) columns;
    if (degree == 0 || count > SIZE_MAX / degree ||
        count * degree > (size_t) WORD_MAX)
        return 0;
    target->cyclotomic_coordinates = _fmpq_vec_init(
        (slong) (count * degree == 0 ? 1 : count * degree));
    if (target->cyclotomic_coordinates == NULL)
        return 0;
    target->cyclotomic_order = source->cyclotomic_order;
    target->cyclotomic_degree = degree;
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            slong source_row = select_rows ? indices[row] : row;
            slong source_column = select_rows ? column : indices[column];
            for (size_t power = 0; power < degree; power++)
                fmpq_set(
                    target->cyclotomic_coordinates +
                        ((size_t) row * (size_t) columns +
                            (size_t) column) * degree + power,
                    source->cyclotomic_coordinates +
                        ((size_t) source_row *
                            (size_t) matrix_ncols(source) +
                            (size_t) source_column) * degree + power);
        }
    return 1;
}

static napi_value matrix_select(
    napi_env env,
    napi_callback_info info,
    int select_rows)
{
    napi_value args[2];
    sagejs_matrix *source, *answer;
    slong *indices = NULL, count;
    slong rows, cols;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL || !matrix_indices(
            env, args[1],
            select_rows ? matrix_nrows(source) : matrix_ncols(source),
            &indices, &count))
        return NULL;
    rows = select_rows ? count : matrix_nrows(source);
    cols = select_rows ? matrix_ncols(source) : count;
    answer = new_matrix_like(env, source, rows, cols);
    if (answer == NULL)
    {
        free(indices);
        return NULL;
    }
    for (slong row = 0; row < rows; row++)
        for (slong col = 0; col < cols; col++)
            matrix_copy_entry(
                answer, row, col, source,
                select_rows ? indices[row] : row,
                select_rows ? col : indices[col]);
    if (!matrix_copy_cyclotomic_selection(
            answer, source, indices, select_rows))
    {
        free(indices);
        finalize_matrix(env, answer, NULL);
        napi_throw_error(env, NULL,
            "unable to preserve cyclotomic matrix coordinates");
        return NULL;
    }
    free(indices);
    return wrap_matrix(env, answer);
}

napi_value sagejs_matrix_select_rows(
    napi_env env, napi_callback_info info)
{
    return matrix_select(env, info, 1);
}

napi_value sagejs_matrix_select_columns(
    napi_env env, napi_callback_info info)
{
    return matrix_select(env, info, 0);
}

static int matrix_entry_is_zero(
    const sagejs_matrix *matrix, slong row, slong col)
{
    if (matrix->kind == SAGEJS_MATRIX_ZZ)
        return fmpz_is_zero(fmpz_mat_entry(matrix->integer, row, col));
    if (matrix->kind == SAGEJS_MATRIX_QQ)
        return fmpq_is_zero(fmpq_mat_entry(matrix->rational, row, col));
    if (matrix->kind == SAGEJS_MATRIX_ACB)
        return acb_is_zero(acb_mat_entry(matrix->approximate, row, col));
    if (matrix->kind == SAGEJS_MATRIX_QQBAR)
        return qqbar_is_zero((qqbar_srcptr) gr_mat_entry_ptr(
            (gr_mat_struct *) matrix->algebraic, row, col,
            (gr_ctx_struct *) matrix->algebraic_context));
    return nmod_mat_entry(matrix->modular, row, col) == 0;
}

napi_value sagejs_matrix_pivots(napi_env env, napi_callback_info info)
{
    napi_value args[1], result;
    sagejs_matrix *matrix;
    uint32_t count = 0;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    matrix = unwrap_matrix(env, args[0]);
    if (matrix == NULL || !check_napi(env, napi_create_array(env, &result)))
        return NULL;
    for (slong row = 0; row < matrix_nrows(matrix); row++)
        for (slong col = 0; col < matrix_ncols(matrix); col++)
        {
            napi_value index;
            if (matrix_entry_is_zero(matrix, row, col))
                continue;
            if (matrix->kind != SAGEJS_MATRIX_ZMOD ||
                nmod_mat_entry(matrix->modular, row, col) == 1)
            {
                if (col > INT32_MAX ||
                    !check_napi(env, napi_create_int64(env, col, &index)) ||
                    !check_napi(env, napi_set_element(
                        env, result, count++, index)))
                    return NULL;
            }
            break;
        }
    return result;
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
    else if (source->kind == SAGEJS_MATRIX_ACB)
        acb_mat_neg(answer->approximate, source->approximate);
    else if (source->kind == SAGEJS_MATRIX_QQBAR)
    {
        if (gr_mat_neg(
            answer->algebraic,
            source->algebraic,
            source->algebraic_context) != GR_SUCCESS)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_error(env, NULL,
                "FLINT algebraic matrix negation failed");
            return NULL;
        }
        if (source->cyclotomic_coordinates != NULL)
        {
            size_t degree = source->cyclotomic_degree;
            size_t count = (size_t) matrix_nrows(source) *
                (size_t) matrix_ncols(source) * degree;
            answer->cyclotomic_coordinates = _fmpq_vec_init(
                (slong) (count == 0 ? 1 : count));
            if (answer->cyclotomic_coordinates == NULL)
            {
                finalize_matrix(env, answer, NULL);
                napi_throw_error(env, NULL,
                    "unable to preserve negated cyclotomic coordinates");
                return NULL;
            }
            answer->cyclotomic_order = source->cyclotomic_order;
            answer->cyclotomic_degree = degree;
            for (size_t index = 0; index < count; index++)
                fmpq_neg(answer->cyclotomic_coordinates + index,
                    source->cyclotomic_coordinates + index);
        }
    }
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
    if (source->kind == SAGEJS_MATRIX_QQBAR)
    {
        napi_throw_type_error(env, NULL,
            "use qqbarMatrixScalarMul for algebraic matrices");
        return NULL;
    }
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

napi_value sagejs_acb_matrix_scalar_mul(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    sagejs_matrix *source;
    sagejs_matrix *answer;
    sagejs_complex *scalar;
    acb_t value;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_ACB)
    {
        napi_throw_type_error(env, NULL,
            "expected an approximate matrix");
        return NULL;
    }
    scalar = sagejs_native_unwrap_complex(env, args[1]);
    if (scalar == NULL)
        return NULL;
    answer = new_matrix_like(
        env, source, matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        return NULL;
    acb_init(value);
    acb_set_mpc_exact(value, scalar->value);
    acb_mat_scalar_mul_acb(
        answer->approximate,
        source->approximate,
        value,
        source->precision);
    acb_clear(value);
    return wrap_matrix(env, answer);
}

napi_value sagejs_qqbar_matrix_scalar_mul(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[2];
    sagejs_matrix *source;
    sagejs_matrix *answer;
    qqbar_srcptr scalar;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_QQBAR)
    {
        napi_throw_type_error(env, NULL,
            "expected an algebraic matrix");
        return NULL;
    }
    scalar = sagejs_qqbar_unwrap(env, args[1]);
    if (scalar == NULL)
        return NULL;
    if (source->algebraic_real && !qqbar_is_real(scalar))
    {
        napi_throw_type_error(env, NULL,
            "AA matrices require a real scalar");
        return NULL;
    }
    answer = new_matrix_like(
        env, source, matrix_nrows(source), matrix_ncols(source));
    if (answer == NULL)
        return NULL;
    if (gr_mat_mul_scalar(
        answer->algebraic,
        source->algebraic,
        scalar,
        source->algebraic_context) != GR_SUCCESS)
    {
        finalize_matrix(env, answer, NULL);
        napi_throw_error(env, NULL,
            "FLINT algebraic matrix scalar multiplication failed");
        return NULL;
    }
    return wrap_matrix(env, answer);
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
    else if (source->kind == SAGEJS_MATRIX_ACB)
        acb_mat_transpose(answer->approximate, source->approximate);
    else if (source->kind == SAGEJS_MATRIX_QQBAR)
    {
        if (gr_mat_transpose(
            answer->algebraic,
            source->algebraic,
            source->algebraic_context) != GR_SUCCESS)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_error(env, NULL,
                "FLINT algebraic matrix transpose failed");
            return NULL;
        }
        if (source->cyclotomic_coordinates != NULL &&
            source->cyclotomic_degree > 2)
        {
            size_t degree = source->cyclotomic_degree;
            size_t count = (size_t) matrix_nrows(source) *
                (size_t) matrix_ncols(source) * degree;
            answer->cyclotomic_coordinates = _fmpq_vec_init(
                (slong) (count == 0 ? 1 : count));
            if (answer->cyclotomic_coordinates == NULL)
            {
                finalize_matrix(env, answer, NULL);
                napi_throw_error(env, NULL,
                    "unable to preserve transposed cyclotomic coordinates");
                return NULL;
            }
            answer->cyclotomic_order = source->cyclotomic_order;
            answer->cyclotomic_degree = degree;
            for (slong row = 0; row < matrix_nrows(source); row++)
                for (slong column = 0;
                    column < matrix_ncols(source); column++)
                    for (size_t power = 0; power < degree; power++)
                        fmpq_set(answer->cyclotomic_coordinates +
                                ((size_t) column *
                                    (size_t) matrix_nrows(source) +
                                    (size_t) row) * degree + power,
                            source->cyclotomic_coordinates +
                                ((size_t) row *
                                    (size_t) matrix_ncols(source) +
                                    (size_t) column) * degree + power);
        }
    }
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
        else if (
            left->kind == SAGEJS_MATRIX_ACB &&
            left->precision == right->precision)
            equal = acb_mat_equal(
                left->approximate, right->approximate);
        else if (
            left->kind == SAGEJS_MATRIX_QQBAR &&
            left->algebraic_real == right->algebraic_real)
            equal = gr_mat_equal(
                left->algebraic,
                right->algebraic,
                left->algebraic_context) == T_TRUE;
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
    if (matrix->kind == SAGEJS_MATRIX_ACB)
    {
        sagejs_complex *result = complex_from_acb_midpoint(
            env,
            acb_mat_entry(matrix->approximate, row, col),
            matrix->precision);
        return result == NULL
            ? NULL
            : sagejs_native_wrap_complex(env, result);
    }
    if (matrix->kind == SAGEJS_MATRIX_QQBAR)
        return sagejs_qqbar_wrap_copy(
            env,
            (qqbar_srcptr) gr_mat_entry_ptr(
                matrix->algebraic,
                row,
                col,
                matrix->algebraic_context));
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
    acb_t approximate;

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
    if (matrix->kind == SAGEJS_MATRIX_ACB)
    {
        sagejs_complex *value;

        acb_init(approximate);
        acb_mat_det(
            approximate, matrix->approximate, matrix->precision);
        value = complex_from_acb_midpoint(
            env, approximate, matrix->precision);
        acb_clear(approximate);
        return value == NULL
            ? NULL
            : sagejs_native_wrap_complex(env, value);
    }
    if (matrix->kind == SAGEJS_MATRIX_QQBAR)
    {
        qqbar_t algebraic;

        qqbar_init(algebraic);
        if (gr_mat_det(
            algebraic,
            matrix->algebraic,
            matrix->algebraic_context) != GR_SUCCESS)
        {
            qqbar_clear(algebraic);
            napi_throw_error(env, NULL,
                "FLINT algebraic determinant failed");
            return NULL;
        }
        result = sagejs_qqbar_wrap_copy(env, algebraic);
        qqbar_clear(algebraic);
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

static slong acb_matrix_rref(
    acb_mat_t answer,
    const acb_mat_t source,
    slong precision)
{
    slong rows = acb_mat_nrows(source);
    slong cols = acb_mat_ncols(source);
    slong pivot_row = 0;
    slong pivot_col;
    slong row;
    slong col;
    slong selected;
    acb_t pivot;
    acb_t factor;

    acb_mat_set(answer, source);
    acb_init(pivot);
    acb_init(factor);
    for (pivot_col = 0;
         pivot_col < cols && pivot_row < rows;
         pivot_col++)
    {
        selected = -1;
        for (row = pivot_row; row < rows; row++)
        {
            if (!acb_contains_zero(
                acb_mat_entry(answer, row, pivot_col)))
            {
                selected = row;
                break;
            }
        }
        if (selected < 0)
            continue;
        if (selected != pivot_row)
            acb_mat_swap_rows(answer, NULL, selected, pivot_row);
        acb_set(pivot, acb_mat_entry(answer, pivot_row, pivot_col));
        for (col = pivot_col; col < cols; col++)
            acb_div(
                acb_mat_entry(answer, pivot_row, col),
                acb_mat_entry(answer, pivot_row, col),
                pivot,
                precision);
        acb_one(acb_mat_entry(answer, pivot_row, pivot_col));
        for (row = 0; row < rows; row++)
        {
            if (row == pivot_row)
                continue;
            acb_set(factor, acb_mat_entry(answer, row, pivot_col));
            if (acb_contains_zero(factor))
            {
                acb_zero(acb_mat_entry(answer, row, pivot_col));
                continue;
            }
            for (col = pivot_col + 1; col < cols; col++)
                acb_submul(
                    acb_mat_entry(answer, row, col),
                    factor,
                    acb_mat_entry(answer, pivot_row, col),
                    precision);
            acb_zero(acb_mat_entry(answer, row, pivot_col));
        }
        pivot_row++;
    }
    acb_clear(pivot);
    acb_clear(factor);
    return pivot_row;
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
    else if (matrix->kind == SAGEJS_MATRIX_ACB)
    {
        acb_mat_t reduced;

        acb_mat_init(
            reduced, matrix_nrows(matrix), matrix_ncols(matrix));
        rank = acb_matrix_rref(
            reduced, matrix->approximate, matrix->precision);
        acb_mat_clear(reduced);
    }
    else if (matrix->kind == SAGEJS_MATRIX_QQBAR)
    {
        if (gr_mat_rank(
            &rank,
            matrix->algebraic,
            matrix->algebraic_context) != GR_SUCCESS)
        {
            napi_throw_error(env, NULL,
                "FLINT algebraic matrix rank failed");
            return NULL;
        }
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
    if (source->kind == SAGEJS_MATRIX_ACB)
    {
        answer = new_matrix_like(
            env, source, matrix_nrows(source), matrix_ncols(source));
        if (answer == NULL)
            return NULL;
        acb_matrix_rref(
            answer->approximate,
            source->approximate,
            source->precision);
        return wrap_matrix(env, answer);
    }
    if (source->kind == SAGEJS_MATRIX_QQBAR)
    {
        slong rank;

        answer = new_matrix_like(
            env, source, matrix_nrows(source), matrix_ncols(source));
        if (answer == NULL)
            return NULL;
        if (gr_mat_rref(
            &rank,
            answer->algebraic,
            source->algebraic,
            source->algebraic_context) != GR_SUCCESS)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_error(env, NULL,
                "FLINT algebraic matrix RREF failed");
            return NULL;
        }
        return wrap_matrix(env, answer);
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
    if (source->kind == SAGEJS_MATRIX_ACB)
    {
        napi_throw_type_error(env, NULL,
            "approximate matrix kernels are not available");
        return NULL;
    }
    if (source->kind == SAGEJS_MATRIX_QQBAR)
    {
        /*
         * A wide matrix occurs naturally as the transpose of a thin
         * boundary map.  gr_mat_nullspace returns a perfectly good basis,
         * but putting its (large) nullspace into canonical row echelon form
         * can cost vastly more than reducing the original thin matrix.
         *
         * Reduce with the columns reversed instead.  Its pivot columns are
         * the rightmost possible independent columns in the original
         * ordering.  The usual free-variable kernel vectors therefore have
         * their leading 1 before every nonzero dependent coordinate after
         * reversing back, so they are already the canonical RREF basis.
         */
        if (rows < cols)
        {
            sagejs_matrix *reduced;
            slong *pivots;
            slong pivot_row;
            slong reverse_col;
            slong answer_row;

            reduced = new_matrix_like(env, source, rows, cols);
            if (reduced == NULL)
                return NULL;
            for (row = 0; row < rows; row++)
            {
                for (col = 0; col < cols; col++)
                {
                    qqbar_set(
                        (qqbar_ptr) gr_mat_entry_ptr(
                            reduced->algebraic,
                            row,
                            col,
                            reduced->algebraic_context),
                        (qqbar_srcptr) gr_mat_entry_ptr(
                            source->algebraic,
                            row,
                            cols - 1 - col,
                            source->algebraic_context));
                }
            }
            if (gr_mat_rref(
                &rank,
                reduced->algebraic,
                reduced->algebraic,
                reduced->algebraic_context) != GR_SUCCESS)
            {
                finalize_matrix(env, reduced, NULL);
                napi_throw_error(env, NULL,
                    "FLINT algebraic matrix RREF failed");
                return NULL;
            }
            nullity = cols - rank;
            answer = new_matrix_like(env, source, nullity, cols);
            pivots = rank == 0 ? NULL : malloc(rank * sizeof(*pivots));
            if (answer == NULL || (rank != 0 && pivots == NULL))
            {
                free(pivots);
                finalize_matrix(env, reduced, NULL);
                if (answer != NULL)
                    finalize_matrix(env, answer, NULL);
                if (answer == NULL)
                    return NULL;
                napi_throw_error(env, NULL,
                    "unable to allocate algebraic kernel pivots");
                return NULL;
            }
            for (pivot_row = 0; pivot_row < rank; pivot_row++)
            {
                pivots[pivot_row] = -1;
                for (col = 0; col < cols; col++)
                {
                    if (!qqbar_is_zero(
                        (qqbar_srcptr) gr_mat_entry_ptr(
                            reduced->algebraic,
                            pivot_row,
                            col,
                            reduced->algebraic_context)))
                    {
                        pivots[pivot_row] = col;
                        break;
                    }
                }
                if (pivots[pivot_row] < 0)
                {
                    free(pivots);
                    finalize_matrix(env, reduced, NULL);
                    finalize_matrix(env, answer, NULL);
                    napi_throw_error(env, NULL,
                        "inconsistent algebraic matrix rank");
                    return NULL;
                }
            }
            answer_row = 0;
            for (reverse_col = cols; reverse_col-- > 0;)
            {
                int is_pivot = 0;
                for (pivot_row = 0; pivot_row < rank; pivot_row++)
                {
                    if (pivots[pivot_row] == reverse_col)
                    {
                        is_pivot = 1;
                        break;
                    }
                }
                if (is_pivot)
                    continue;
                qqbar_one(
                    (qqbar_ptr) gr_mat_entry_ptr(
                        answer->algebraic,
                        answer_row,
                        cols - 1 - reverse_col,
                        answer->algebraic_context));
                for (pivot_row = 0; pivot_row < rank; pivot_row++)
                {
                    qqbar_neg(
                        (qqbar_ptr) gr_mat_entry_ptr(
                            answer->algebraic,
                            answer_row,
                            cols - 1 - pivots[pivot_row],
                            answer->algebraic_context),
                        (qqbar_srcptr) gr_mat_entry_ptr(
                            reduced->algebraic,
                            pivot_row,
                            reverse_col,
                            reduced->algebraic_context));
                }
                answer_row++;
            }
            free(pivots);
            finalize_matrix(env, reduced, NULL);
            return wrap_matrix(env, answer);
        }
        gr_mat_t basis_columns;

        gr_mat_init(
            basis_columns, 0, 0, source->algebraic_context);
        if (gr_mat_nullspace(
            basis_columns,
            source->algebraic,
            source->algebraic_context) != GR_SUCCESS)
        {
            gr_mat_clear(
                basis_columns, source->algebraic_context);
            napi_throw_error(env, NULL,
                "FLINT algebraic matrix nullspace failed");
            return NULL;
        }
        nullity = gr_mat_ncols(
            basis_columns, source->algebraic_context);
        answer = new_matrix_like(env, source, nullity, cols);
        if (answer == NULL)
        {
            gr_mat_clear(
                basis_columns, source->algebraic_context);
            return NULL;
        }
        for (row = 0; row < nullity; row++)
        {
            for (col = 0; col < cols; col++)
            {
                qqbar_set(
                    (qqbar_ptr) gr_mat_entry_ptr(
                        answer->algebraic,
                        row,
                        col,
                        answer->algebraic_context),
                    (qqbar_srcptr) gr_mat_entry_ptr(
                        basis_columns,
                        col,
                        row,
                        source->algebraic_context));
            }
        }
        if (gr_mat_rref(
            &rank,
            answer->algebraic,
            answer->algebraic,
            answer->algebraic_context) != GR_SUCCESS)
        {
            gr_mat_clear(
                basis_columns, source->algebraic_context);
            finalize_matrix(env, answer, NULL);
            napi_throw_error(env, NULL,
                "FLINT algebraic kernel normalization failed");
            return NULL;
        }
        gr_mat_clear(basis_columns, source->algebraic_context);
        return wrap_matrix(env, answer);
    }
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
        int sparse_reduced;

        fmpq_mat_init(reduced, rows, cols);
        sparse_reduced = sagejs_fmpq_mat_prefers_sparse_rref(
            source->rational);
        if (sparse_reduced)
        {
            if (!sagejs_fmpq_mat_rref_sparse(
                    reduced, &rank, source->rational))
            {
                fmpq_mat_clear(reduced);
                napi_throw_error(env, NULL,
                    "unable to allocate sparse rational kernel workspace");
                return NULL;
            }
        }
        else
        {
            rank = fmpq_mat_rref(reduced, source->rational);
        }
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
        if (sagejs_fmpq_mat_prefers_sparse_rref(answer->rational))
        {
            slong basis_rank;
            if (!sagejs_fmpq_mat_rref_sparse(
                    answer->rational, &basis_rank, answer->rational) ||
                basis_rank != nullity)
            {
                free(pivots);
                fmpq_mat_clear(reduced);
                finalize_matrix(env, answer, NULL);
                napi_throw_error(env, NULL,
                    "sparse rational kernel normalization failed");
                return NULL;
            }
        }
        else
        {
            fmpq_mat_rref(answer->rational, answer->rational);
        }
        free(pivots);
        fmpq_mat_clear(reduced);
        return wrap_matrix(env, answer);
    }
}

/*
 * Compute a right kernel using completely split primes and exact CRT
 * reconstruction in Q(zeta_order).  Generic qqbar elimination is an
 * important fallback, but it can suffer catastrophic coefficient growth on
 * matrices which are already known to lie in a modest cyclotomic field.
 */
napi_value sagejs_cyclotomic_matrix_right_kernel(
    napi_env env, napi_callback_info info)
{
    napi_value args[2];
    napi_value result = NULL;
    sagejs_matrix *source;
    ulong order;
    size_t degree, cell_count, coordinate_count, term_count = 0;
    size_t kernel_coordinate_count = 0;
    fmpq *coordinates = NULL;
    sagejs_cyclotomic_term *terms = NULL;
    gr_mat_t reduced, kernel;
    int reduced_initialized = 0, kernel_initialized = 0;
    slong rows, columns, rank = 0, nullity = 0;
    size_t *pivots = NULL, *free_columns = NULL;
    sagejs_cyclotomic_matrix reduced_coordinates = {0};
    fmpq *kernel_coordinates = NULL;
    fmpz_t row_denominator, scale, bound, absolute;
    fmpq_poly_t expression;
    qqbar_t root;
    int scalar_initialized = 0;

    if (!require_arguments(env, info, 2, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL || !bigint_to_ulong(env, args[1], &order))
        return NULL;
    if (source->kind != SAGEJS_MATRIX_QQBAR || order < 3)
    {
        napi_throw_type_error(env, NULL,
            "expected an algebraic matrix and a cyclotomic order");
        return NULL;
    }
    rows = matrix_nrows(source);
    columns = matrix_ncols(source);
    degree = (size_t) n_euler_phi(order);
    if (degree == 0 ||
        (rows != 0 && (size_t) columns > SIZE_MAX / (size_t) rows))
    {
        napi_throw_range_error(env, NULL,
            "cyclotomic matrix dimensions are too large");
        return NULL;
    }
    cell_count = (size_t) rows * (size_t) columns;
    if (cell_count > SIZE_MAX / degree ||
        cell_count * degree > (size_t) WORD_MAX)
    {
        napi_throw_range_error(env, NULL,
            "cyclotomic matrix dimensions are too large");
        return NULL;
    }
    coordinate_count = cell_count * degree;
    coordinates = _fmpq_vec_init(
        (slong) (coordinate_count == 0 ? 1 : coordinate_count));
    terms = malloc(
        (coordinate_count == 0 ? 1 : coordinate_count) * sizeof(*terms));
    if (coordinates == NULL || terms == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate cyclotomic kernel coordinates");
        goto cleanup_uninitialized;
    }
    fmpz_init(row_denominator);
    fmpz_init(scale);
    fmpz_init_set_ui(bound, 0);
    fmpz_init(absolute);
    fmpq_poly_init(expression);
    qqbar_init(root);
    scalar_initialized = 1;
    qqbar_root_of_unity(root, 1, order);

    if (source->cyclotomic_coordinates != NULL &&
        source->cyclotomic_order == order &&
        source->cyclotomic_degree == degree)
    {
        for (size_t index = 0; index < coordinate_count; index++)
            fmpq_set(coordinates + index,
                source->cyclotomic_coordinates + index);
    }
    else
    {
        for (slong row = 0; row < rows; row++)
            for (slong column = 0; column < columns; column++)
            {
                qqbar_srcptr value = (qqbar_srcptr) gr_mat_entry_ptr(
                    source->algebraic, row, column,
                    source->algebraic_context);
                int expressed = qqbar_is_zero(value);
                fmpq_poly_zero(expression);
                for (slong bits = 128;
                    bits <= 8192 && !expressed; bits *= 2)
                    expressed = qqbar_express_in_field(
                        expression, root, value, bits, 0, bits);
                if (!expressed)
                {
                    napi_throw_range_error(env, NULL,
                        "matrix entry is not in the cyclotomic field");
                    goto cleanup;
                }
                for (size_t power = 0; power < degree; power++)
                    fmpq_poly_get_coeff_fmpq(
                        coordinates +
                            ((size_t) row * (size_t) columns +
                                (size_t) column) * degree + power,
                        expression, (slong) power);
            }
    }
    for (slong row = 0; row < rows; row++)
    {
        fmpz_one(row_denominator);
        for (slong column = 0; column < columns; column++)
            for (size_t power = 0; power < degree; power++)
                fmpz_lcm(row_denominator, row_denominator,
                    fmpq_denref(coordinates +
                        ((size_t) row * (size_t) columns +
                            (size_t) column) * degree + power));
        for (slong column = 0; column < columns; column++)
            for (size_t power = 0; power < degree; power++)
            {
                const fmpq *value = coordinates +
                    ((size_t) row * (size_t) columns +
                        (size_t) column) * degree + power;
                if (fmpq_is_zero(value))
                    continue;
                fmpz_divexact(scale,
                    row_denominator, fmpq_denref(value));
                fmpz_mul(scale, scale, fmpq_numref(value));
                terms[term_count].row = (size_t) row;
                /*
                 * Reduce with columns reversed.  Choosing the rightmost
                 * possible pivots in the original ordering makes the
                 * free-variable kernel vectors an RREF basis after mapping
                 * the coordinates back.  This is the same normalization as
                 * the generic qqbar kernel above, without a second expensive
                 * elimination over algebraic numbers.
                 */
                terms[term_count].column =
                    (size_t) (columns - 1 - column);
                terms[term_count].exponent = (ulong) power;
                fmpz_init_set(&terms[term_count].coefficient, scale);
                fmpz_abs(absolute, scale);
                fmpz_add(bound, bound, absolute);
                term_count++;
            }
    }

    gr_mat_init(reduced, rows, columns, source->algebraic_context);
    reduced_initialized = 1;
    if (!sagejs_cyclotomic_rref_multimodular(
            reduced, &rank,
            (size_t) rows, (size_t) columns,
            terms, term_count, order, bound,
            source->algebraic_context, &reduced_coordinates))
    {
        napi_throw_error(env, NULL,
            "cyclotomic multimodular kernel reconstruction failed");
        goto cleanup;
    }
    if (rank < 0 || rank > columns)
    {
        napi_throw_error(env, NULL, "invalid cyclotomic matrix rank");
        goto cleanup;
    }
    nullity = columns - rank;
    pivots = malloc((rank == 0 ? 1 : (size_t) rank) * sizeof(*pivots));
    free_columns = malloc(
        (nullity == 0 ? 1 : (size_t) nullity) * sizeof(*free_columns));
    if (pivots == NULL || free_columns == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate cyclotomic kernel pivots");
        goto cleanup;
    }
    {
        slong pivot_count = 0, free_count = 0;
        for (slong column = 0; column < columns; column++)
        {
            int is_pivot = pivot_count < rank &&
                !qqbar_is_zero((qqbar_srcptr) gr_mat_entry_ptr(
                    reduced, pivot_count, column,
                    source->algebraic_context));
            if (is_pivot)
                pivots[pivot_count++] = (size_t) column;
            else
                free_columns[free_count++] = (size_t) column;
        }
        if (pivot_count != rank || free_count != nullity)
        {
            napi_throw_error(env, NULL,
                "unable to identify cyclotomic kernel pivots");
            goto cleanup;
        }
    }
    gr_mat_init(kernel, nullity, columns, source->algebraic_context);
    kernel_initialized = 1;
    if (gr_mat_zero(kernel, source->algebraic_context) != GR_SUCCESS)
        goto cleanup;
    {
        slong answer_row = 0;
        slong free_cursor = nullity;
        for (slong reverse_column = columns;
            reverse_column-- > 0;)
        {
            if (free_cursor == 0 ||
                free_columns[free_cursor - 1] != (size_t) reverse_column)
                continue;
            free_cursor--;
            qqbar_one((qqbar_ptr) gr_mat_entry_ptr(
                kernel, answer_row, columns - 1 - reverse_column,
                source->algebraic_context));
            for (slong pivot = 0; pivot < rank; pivot++)
                qqbar_neg(
                    (qqbar_ptr) gr_mat_entry_ptr(
                        kernel, answer_row,
                        columns - 1 - (slong) pivots[pivot],
                        source->algebraic_context),
                    (qqbar_srcptr) gr_mat_entry_ptr(
                        reduced, pivot, reverse_column,
                        source->algebraic_context));
            answer_row++;
        }
        if (answer_row != nullity || free_cursor != 0)
        {
            napi_throw_error(env, NULL,
                "unable to normalize cyclotomic kernel basis");
            goto cleanup;
        }
    }
    if ((size_t) nullity != 0 &&
        (size_t) columns > SIZE_MAX / (size_t) nullity)
        goto cleanup;
    {
        napi_value matrix_value, nullity_value;
        kernel_coordinate_count =
            (size_t) nullity * (size_t) columns * degree;
        kernel_coordinates = _fmpq_vec_init(
            (slong) (kernel_coordinate_count == 0
                ? 1 : kernel_coordinate_count));
        if (kernel_coordinates == NULL)
            goto cleanup;
        {
            slong answer_row = 0;
            slong free_cursor = nullity;
            for (slong reverse_column = columns;
                reverse_column-- > 0;)
            {
                slong free_index;
                if (free_cursor == 0 ||
                    free_columns[free_cursor - 1] !=
                        (size_t) reverse_column)
                    continue;
                free_cursor--;
                free_index = free_cursor;
                fmpq_one(kernel_coordinates +
                    ((size_t) answer_row * (size_t) columns +
                        (size_t) (columns - 1 - reverse_column)) * degree);
                for (slong pivot = 0; pivot < rank; pivot++)
                    for (size_t power = 0; power < degree; power++)
                        fmpq_neg(
                            kernel_coordinates +
                                ((size_t) answer_row * (size_t) columns +
                                    (size_t) (columns - 1 -
                                        (slong) pivots[pivot])) * degree +
                                    power,
                            reduced_coordinates.coefficients +
                                (power * (size_t) rank + (size_t) pivot) *
                                    (size_t) nullity +
                                    (size_t) free_index);
                answer_row++;
            }
            if (answer_row != nullity || free_cursor != 0)
                goto cleanup;
        }
        matrix_value = sagejs_qqbar_matrix_from_cyclotomic_gr_mat(
            env, kernel, source->algebraic_context,
            order, degree, kernel_coordinates);
        if (matrix_value == NULL ||
            !check_napi(env, napi_create_array_with_length(
                env, 2, &result)) ||
            !check_napi(env, napi_set_element(
                env, result, 0, matrix_value)) ||
            !check_napi(env, napi_create_int64(
                env, nullity, &nullity_value)) ||
            !check_napi(env, napi_set_element(
                env, result, 1, nullity_value)))
            result = NULL;
    }

cleanup:
    if (kernel_coordinates != NULL)
        _fmpq_vec_clear(kernel_coordinates,
            (slong) (kernel_coordinate_count == 0
                ? 1 : kernel_coordinate_count));
    free(free_columns);
    free(pivots);
    sagejs_cyclotomic_matrix_clear(&reduced_coordinates);
    if (kernel_initialized)
        gr_mat_clear(kernel, source->algebraic_context);
    if (reduced_initialized)
        gr_mat_clear(reduced, source->algebraic_context);
    if (scalar_initialized)
    {
        qqbar_clear(root);
        fmpq_poly_clear(expression);
        fmpz_clear(absolute);
        fmpz_clear(bound);
        fmpz_clear(scale);
        fmpz_clear(row_denominator);
    }
    for (size_t item = 0; item < term_count; item++)
        fmpz_clear(&terms[item].coefficient);
cleanup_uninitialized:
    free(terms);
    if (coordinates != NULL)
        _fmpq_vec_clear(coordinates,
            (slong) (coordinate_count == 0 ? 1 : coordinate_count));
    return result;
}

/*
 * Compute a cyclotomic characteristic polynomial through completely split
 * word primes.  Clearing one common denominator makes every lifted
 * coefficient integral; (1+B)^n is a deliberately conservative coefficient
 * bound when B is the maximum column sum of power-basis coefficient norms.
 */
static int matrix_charpoly_cyclotomic_multimodular(
    fmpq **result,
    const sagejs_matrix *source)
{
    slong n = matrix_nrows(source);
    size_t degree = source->cyclotomic_degree;
    size_t polynomial_length = (size_t) n + 1;
    size_t count;
    fmpz *residues = NULL;
    fmpq *answer = NULL;
    fmpz_t denominator, bound, modulus, temporary, scale, basis_coefficient;
    fmpz_poly_t cyclotomic, monomial, remainder;
    ulong multiple, prime = 0;
    int status = 0;

    if (n < 0 || degree == 0 || polynomial_length > SIZE_MAX / degree)
        return 0;
    count = polynomial_length * degree;
    residues = _fmpz_vec_init((slong) (count == 0 ? 1 : count));
    answer = _fmpq_vec_init((slong) (count == 0 ? 1 : count));
    if (residues == NULL || answer == NULL)
        goto done_uninitialized;
    fmpz_init_set_ui(denominator, 1);
    fmpz_init_set_ui(bound, 0);
    fmpz_init_set_ui(modulus, 1);
    fmpz_init(temporary);
    fmpz_init(scale);
    fmpz_init(basis_coefficient);
    fmpz_poly_init(cyclotomic);
    fmpz_poly_init(monomial);
    fmpz_poly_init(remainder);

    for (size_t item = 0;
        item < (size_t) n * (size_t) n * degree; item++)
        fmpz_lcm(denominator, denominator,
            fmpq_denref(source->cyclotomic_coordinates + item));
    for (slong column = 0; column < n; column++)
    {
        fmpz_zero(temporary);
        for (slong row = 0; row < n; row++)
            for (size_t power = 0; power < degree; power++)
            {
                const fmpq *value = source->cyclotomic_coordinates +
                    ((size_t) row * (size_t) n + (size_t) column) *
                        degree + power;
                fmpz_divexact(scale, denominator, fmpq_denref(value));
                fmpz_mul(scale, scale, fmpq_numref(value));
                fmpz_abs(scale, scale);
                fmpz_add(temporary, temporary, scale);
            }
        if (fmpz_cmp(temporary, bound) > 0)
            fmpz_set(bound, temporary);
    }
    /* Bound coefficient growth in one power-basis multiplication. */
    fmpz_one(scale);
    fmpz_poly_cyclotomic(cyclotomic, source->cyclotomic_order);
    for (size_t combined = 0; combined < 2 * degree - 1; combined++)
    {
        fmpz_poly_zero(monomial);
        fmpz_poly_set_coeff_ui(monomial, (slong) combined, 1);
        fmpz_poly_rem(remainder, monomial, cyclotomic);
        fmpz_zero(temporary);
        for (size_t power = 0; power < degree; power++)
        {
            fmpz_poly_get_coeff_fmpz(
                basis_coefficient, remainder, (slong) power);
            fmpz_abs(basis_coefficient, basis_coefficient);
            fmpz_add(temporary, temporary, basis_coefficient);
        }
        if (fmpz_cmp(temporary, scale) > 0)
            fmpz_set(scale, temporary);
    }
    fmpz_mul(bound, bound, scale);
    fmpz_add_ui(bound, bound, 1);
    fmpz_pow_ui(bound, bound, (ulong) n);
    fmpz_mul_ui(bound, bound, 2);

    multiple = UWORD(1000000000) / source->cyclotomic_order + 1;
    for (size_t attempt = 0; attempt < 64 && fmpz_cmp(modulus, bound) <= 0;
        attempt++)
    {
        nmod_mat_t vandermonde, inverse, matrix;
        nmod_poly_t polynomial;
        ulong *roots = NULL, *values = NULL, *interpolated = NULL;
        ulong primitive, root;
        size_t found = 0;
        int initialized = 0;

        do {
            if (multiple > (UWORD_MAX - 1) / source->cyclotomic_order)
                goto done;
            prime = n_nextprime(
                multiple * source->cyclotomic_order + 1, 1);
            multiple = prime / source->cyclotomic_order + 1;
        } while (prime % source->cyclotomic_order != 1 ||
            fmpz_fdiv_ui(denominator, prime) == 0);

        nmod_mat_init(vandermonde, (slong) degree, (slong) degree, prime);
        nmod_mat_init(inverse, (slong) degree, (slong) degree, prime);
        nmod_mat_init(matrix, n, n, prime);
        nmod_poly_init(polynomial, prime);
        initialized = 1;
        roots = malloc(degree * sizeof(*roots));
        values = calloc(degree * polynomial_length, sizeof(*values));
        interpolated = calloc(count == 0 ? 1 : count,
            sizeof(*interpolated));
        if (roots == NULL || values == NULL || interpolated == NULL)
            goto prime_done;
        primitive = n_primitive_root_prime(prime);
        root = n_powmod(primitive,
            (slong) ((prime - 1) / source->cyclotomic_order), prime);
        for (ulong exponent = 1;
            exponent <= source->cyclotomic_order && found < degree;
            exponent++)
            if (n_gcd(exponent, source->cyclotomic_order) == 1)
            {
                ulong value = n_powmod(root, (slong) exponent, prime);
                ulong root_power = 1;
                roots[found] = value;
                for (size_t power = 0; power < degree; power++)
                {
                    nmod_mat_entry(vandermonde,
                        (slong) found, (slong) power) = root_power;
                    root_power = nmod_mul(root_power, value,
                        vandermonde->mod);
                }
                found++;
            }
        if (found != degree || !nmod_mat_inv(inverse, vandermonde))
            goto prime_done;
        for (size_t embedding = 0; embedding < degree; embedding++)
        {
            for (slong row = 0; row < n; row++)
                for (slong column = 0; column < n; column++)
                {
                    ulong sum = 0, root_power = 1;
                    for (size_t power = 0; power < degree; power++)
                    {
                        const fmpq *entry = source->cyclotomic_coordinates +
                            ((size_t) row * (size_t) n +
                                (size_t) column) * degree + power;
                        ulong coefficient;
                        fmpz_divexact(scale, denominator,
                            fmpq_denref(entry));
                        fmpz_mul(scale, scale, fmpq_numref(entry));
                        coefficient = fmpz_fdiv_ui(scale, prime);
                        sum = nmod_add(sum,
                            nmod_mul(coefficient, root_power, matrix->mod),
                            matrix->mod);
                        root_power = nmod_mul(root_power, roots[embedding],
                            matrix->mod);
                    }
                    nmod_mat_entry(matrix, row, column) = sum;
                }
            nmod_mat_charpoly(polynomial, matrix);
            for (size_t index = 0; index < polynomial_length; index++)
                values[embedding * polynomial_length + index] =
                    nmod_poly_get_coeff_ui(polynomial, (slong) index);
        }
        for (size_t power = 0; power < degree; power++)
            for (size_t index = 0; index < polynomial_length; index++)
                for (size_t embedding = 0; embedding < degree; embedding++)
                    interpolated[power * polynomial_length + index] =
                        nmod_add(
                            interpolated[power * polynomial_length + index],
                            nmod_mul(nmod_mat_entry(inverse,
                                (slong) power, (slong) embedding),
                                values[embedding * polynomial_length + index],
                                inverse->mod), inverse->mod);
        for (size_t power = 0; power < degree; power++)
            for (size_t index = 0; index < polynomial_length; index++)
            {
                size_t item = index * degree + power;
                ulong value = interpolated[
                    power * polynomial_length + index];
                if (fmpz_is_one(modulus))
                    fmpz_set_ui(residues + item, value);
                else
                    fmpz_CRT_ui(residues + item, residues + item,
                        modulus, value, prime, 0);
            }
        fmpz_mul_ui(modulus, modulus, prime);

prime_done:
        free(roots);
        free(values);
        free(interpolated);
        if (initialized)
        {
            nmod_poly_clear(polynomial);
            nmod_mat_clear(matrix);
            nmod_mat_clear(inverse);
            nmod_mat_clear(vandermonde);
        }
        if (roots == NULL || values == NULL || interpolated == NULL)
            goto done;
    }
    if (fmpz_cmp(modulus, bound) <= 0)
        goto done;
    fmpz_one(scale);
    for (slong index = n; index >= 0; index--)
    {
        if (index < n)
            fmpz_mul(scale, scale, denominator);
        for (size_t power = 0; power < degree; power++)
        {
            size_t item = (size_t) index * degree + power;
            fmpz_mul_ui(temporary, residues + item, 2);
            if (fmpz_cmp(temporary, modulus) > 0)
                fmpz_sub(residues + item, residues + item, modulus);
            fmpq_set_fmpz_frac(answer + item, residues + item, scale);
        }
    }
    *result = answer;
    answer = NULL;
    status = 1;

done:
    fmpz_clear(scale);
    fmpz_clear(basis_coefficient);
    fmpz_clear(temporary);
    fmpz_clear(modulus);
    fmpz_clear(bound);
    fmpz_clear(denominator);
    fmpz_poly_clear(remainder);
    fmpz_poly_clear(monomial);
    fmpz_poly_clear(cyclotomic);
done_uninitialized:
    if (residues != NULL)
        _fmpz_vec_clear(residues, (slong) (count == 0 ? 1 : count));
    if (answer != NULL)
        _fmpq_vec_clear(answer, (slong) (count == 0 ? 1 : count));
    return status;
}

static int matrix_charpoly_cyclotomic(
    gr_poly_t output,
    const sagejs_matrix *source)
{
    slong n = matrix_nrows(source);
    size_t degree = source->cyclotomic_degree;
    fmpz_poly_t cyclotomic;
    fmpq_poly_t defining, coordinates;
    nf_t number_field;
    gr_ctx_t number_field_context;
    gr_mat_t matrix;
    gr_poly_t polynomial;
    qqbar_t root, value;
    int number_field_initialized = 0;
    int matrix_initialized = 0;
    int polynomial_initialized = 0;
    int status = 0;
    fmpq *multimodular = NULL;

    if (source->cyclotomic_coordinates == NULL ||
        source->cyclotomic_order < 3 || degree == 0)
        return 0;
    /* The split-prime interpolation path is aimed at genuinely higher
       coefficient degree.  Direct FLINT number-field arithmetic is both
       simpler and faster for quadratic cyclotomic fields. */
    if (degree > 2 &&
        matrix_charpoly_cyclotomic_multimodular(&multimodular, source))
    {
        qqbar_init(root);
        qqbar_init(value);
        fmpq_poly_init(coordinates);
        qqbar_root_of_unity(root, 1, source->cyclotomic_order);
        for (slong index = 0; index <= n; index++)
        {
            fmpq_poly_zero(coordinates);
            for (size_t power = 0; power < degree; power++)
                fmpq_poly_set_coeff_fmpq(coordinates, (slong) power,
                    multimodular + (size_t) index * degree + power);
            qqbar_evaluate_fmpq_poly(value, coordinates, root);
            if (gr_poly_set_coeff_scalar(output, index, value,
                    (gr_ctx_struct *) source->algebraic_context) != GR_SUCCESS)
                goto multimodular_done;
        }
        status = 1;
multimodular_done:
        _fmpq_vec_clear(multimodular,
            (slong) (((size_t) n + 1) * degree));
        fmpq_poly_clear(coordinates);
        qqbar_clear(value);
        qqbar_clear(root);
        return status;
    }
    fmpz_poly_init(cyclotomic);
    fmpq_poly_init(defining);
    fmpq_poly_init(coordinates);
    qqbar_init(root);
    qqbar_init(value);
    fmpz_poly_cyclotomic(cyclotomic, source->cyclotomic_order);
    fmpq_poly_set_fmpz_poly(defining, cyclotomic);
    nf_init(number_field, defining);
    number_field_initialized = 1;
    _gr_ctx_init_nf_from_ref(number_field_context, number_field);
    gr_mat_init(matrix, n, n, number_field_context);
    matrix_initialized = 1;
    gr_poly_init(polynomial, number_field_context);
    polynomial_initialized = 1;
    for (slong row = 0; row < n; row++)
        for (slong column = 0; column < n; column++)
        {
            fmpq_poly_zero(coordinates);
            for (size_t power = 0; power < degree; power++)
                fmpq_poly_set_coeff_fmpq(
                    coordinates, (slong) power,
                    source->cyclotomic_coordinates +
                        ((size_t) row * (size_t) n +
                            (size_t) column) * degree + power);
            nf_elem_set_fmpq_poly(
                (nf_elem_struct *) gr_mat_entry_ptr(
                    matrix, row, column, number_field_context),
                coordinates, number_field);
        }
    if (gr_mat_charpoly(
            polynomial, matrix, number_field_context) != GR_SUCCESS)
        goto done;
    qqbar_root_of_unity(root, 1, source->cyclotomic_order);
    for (slong index = 0; index <= n; index++)
    {
        nf_elem_get_fmpq_poly(
            coordinates,
            (const nf_elem_struct *) gr_poly_coeff_srcptr(
                polynomial, index, number_field_context),
            number_field);
        qqbar_evaluate_fmpq_poly(value, coordinates, root);
        if (gr_poly_set_coeff_scalar(
                output, index, value,
                (gr_ctx_struct *) source->algebraic_context) != GR_SUCCESS)
            goto done;
    }
    status = 1;

done:
    if (polynomial_initialized)
        gr_poly_clear(polynomial, number_field_context);
    if (matrix_initialized)
        gr_mat_clear(matrix, number_field_context);
    if (number_field_initialized)
        nf_clear(number_field);
    qqbar_clear(value);
    qqbar_clear(root);
    fmpq_poly_clear(coordinates);
    fmpq_poly_clear(defining);
    fmpz_poly_clear(cyclotomic);
    return status;
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
    if (source->kind == SAGEJS_MATRIX_ACB)
    {
        napi_throw_type_error(env, NULL,
            "characteristic polynomials are not available for this matrix");
        return NULL;
    }
    degree = matrix_nrows(source);
    if (!check_napi(env,
        napi_create_array_with_length(
            env, (size_t) degree + 1, &coefficients)))
        return NULL;
    if (source->kind == SAGEJS_MATRIX_QQBAR)
    {
        gr_poly_t polynomial;
        gr_poly_init(polynomial, source->algebraic_context);
        if (source->cyclotomic_coordinates != NULL)
        {
            if (!matrix_charpoly_cyclotomic(polynomial, source))
            {
                gr_poly_clear(polynomial, source->algebraic_context);
                napi_throw_error(env, NULL,
                    "FLINT cyclotomic characteristic polynomial failed");
                return NULL;
            }
        }
        else if (gr_mat_charpoly(
            polynomial, source->algebraic,
            source->algebraic_context) != GR_SUCCESS)
        {
            gr_poly_clear(polynomial, source->algebraic_context);
            napi_throw_error(env, NULL,
                "FLINT algebraic characteristic polynomial failed");
            return NULL;
        }
        for (index = 0; index <= degree; index++)
        {
            coefficient = sagejs_qqbar_wrap_copy(
                env, (qqbar_srcptr) gr_poly_coeff_srcptr(
                    polynomial, index, source->algebraic_context));
            if (coefficient == NULL || !check_napi(env,
                napi_set_element(
                    env, coefficients, (uint32_t) index, coefficient)))
            {
                gr_poly_clear(polynomial, source->algebraic_context);
                return NULL;
            }
        }
        gr_poly_clear(polynomial, source->algebraic_context);
        return coefficients;
    }
    if (source->kind == SAGEJS_MATRIX_ZZ ||
        (source->kind == SAGEJS_MATRIX_QQ &&
         rational_matrix_is_integral(source)))
    {
        fmpz_poly_t polynomial;
        fmpz_t value, one;
        fmpz_mat_t integral_matrix;
        const fmpz_mat_struct *matrix;
        int copied = source->kind == SAGEJS_MATRIX_QQ;

        fmpz_poly_init(polynomial);
        fmpz_init(value);
        fmpz_init_set_ui(one, 1);
        if (copied)
        {
            fmpz_mat_init(integral_matrix, degree, degree);
            for (slong row = 0; row < degree; row++)
                for (slong column = 0; column < degree; column++)
                    fmpz_set(fmpz_mat_entry(
                        integral_matrix, row, column),
                        fmpq_numref(fmpq_mat_entry(
                            source->rational, row, column)));
            matrix = integral_matrix;
        }
        else
        {
            matrix = source->integer;
        }
        sagejs_fmpz_mat_charpoly(polynomial, matrix);
        for (index = 0; index <= degree; index++)
        {
            fmpz_poly_get_coeff_fmpz(value, polynomial, index);
            coefficient = copied
                ? rational_result(env, value, one)
                : fmpz_to_bigint(env, value);
            if (coefficient == NULL ||
                !check_napi(env,
                    napi_set_element(
                        env, coefficients, (uint32_t) index, coefficient)))
            {
                if (copied)
                    fmpz_mat_clear(integral_matrix);
                fmpz_clear(one);
                fmpz_clear(value);
                fmpz_poly_clear(polynomial);
                return NULL;
            }
        }
        if (copied)
            fmpz_mat_clear(integral_matrix);
        fmpz_clear(one);
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
    if (
        left->kind == SAGEJS_MATRIX_QQBAR ||
        right->kind == SAGEJS_MATRIX_QQBAR
    )
    {
        if (
            left->kind != SAGEJS_MATRIX_QQBAR ||
            right->kind != SAGEJS_MATRIX_QQBAR ||
            left->algebraic_real != right->algebraic_real
        )
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
        answer = new_matrix_like(
            env, left, matrix_ncols(left), matrix_ncols(right));
        if (answer == NULL)
            return NULL;
        if (gr_mat_solve_field(
            answer->algebraic,
            left->algebraic,
            right->algebraic,
            left->algebraic_context) != GR_SUCCESS)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_range_error(env, NULL, "matrix is singular");
            return NULL;
        }
        return wrap_matrix(env, answer);
    }
    if (
        left->kind == SAGEJS_MATRIX_ACB ||
        right->kind == SAGEJS_MATRIX_ACB
    )
    {
        if (
            left->kind != SAGEJS_MATRIX_ACB ||
            right->kind != SAGEJS_MATRIX_ACB ||
            left->precision != right->precision
        )
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
        answer = new_acb_matrix(
            env, matrix_ncols(left), matrix_ncols(right),
            left->precision);
        if (answer == NULL)
            return NULL;
        solved = acb_mat_approx_solve(
            answer->approximate,
            left->approximate,
            right->approximate,
            left->precision);
        if (!solved)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_range_error(env, NULL, "matrix is singular");
            return NULL;
        }
        return wrap_matrix(env, answer);
    }
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
    if (source->kind == SAGEJS_MATRIX_ACB)
    {
        answer = new_acb_matrix(
            env, matrix_nrows(source), matrix_ncols(source),
            source->precision);
        if (answer == NULL)
            return NULL;
        inverted = acb_mat_approx_inv(
            answer->approximate,
            source->approximate,
            source->precision);
        if (!inverted)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_range_error(env, NULL, "matrix is singular");
            return NULL;
        }
        return wrap_matrix(env, answer);
    }
    if (source->kind == SAGEJS_MATRIX_QQBAR)
    {
        answer = new_matrix_like(
            env, source, matrix_nrows(source), matrix_ncols(source));
        if (answer == NULL)
            return NULL;
        if (gr_mat_inv(
            answer->algebraic,
            source->algebraic,
            source->algebraic_context) != GR_SUCCESS)
        {
            finalize_matrix(env, answer, NULL);
            napi_throw_range_error(env, NULL, "matrix is singular");
            return NULL;
        }
        return wrap_matrix(env, answer);
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

napi_value sagejs_matrix_exact_eigenvalues(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value value;
    sagejs_matrix *source;
    qqbar_ptr eigenvalues;
    slong *order;
    slong degree;
    slong index;
    slong position;
    slong selected;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (
        source->kind != SAGEJS_MATRIX_ZZ &&
        source->kind != SAGEJS_MATRIX_QQ
    )
    {
        napi_throw_type_error(env, NULL,
            "exact eigenvalues require an integer or rational matrix");
        return NULL;
    }
    if (matrix_nrows(source) != matrix_ncols(source))
    {
        napi_throw_range_error(env, NULL,
            "eigenvalues require a square matrix");
        return NULL;
    }
    degree = matrix_nrows(source);
    eigenvalues = _qqbar_vec_init(degree);
    order = degree == 0 ? NULL : malloc(degree * sizeof(slong));
    if (degree != 0 && order == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate exact eigenvalue ordering");
        _qqbar_vec_clear(eigenvalues, degree);
        return NULL;
    }
    if (source->kind == SAGEJS_MATRIX_ZZ)
        qqbar_eigenvalues_fmpz_mat(eigenvalues, source->integer, 0);
    else
        qqbar_eigenvalues_fmpq_mat(eigenvalues, source->rational, 0);
    for (index = 0; index < degree; index++)
        order[index] = index;
    for (index = 1; index < degree; index++)
    {
        int compare;
        int left_real;
        int right_real;

        selected = order[index];
        position = index;
        while (position > 0)
        {
            qqbar_srcptr left = eigenvalues + selected;
            qqbar_srcptr right = eigenvalues + order[position - 1];

            left_real = qqbar_is_real(left);
            right_real = qqbar_is_real(right);
            if (left_real != right_real)
                compare = left_real ? -1 : 1;
            else
            {
                compare = -qqbar_cmp_re(left, right);
                if (compare == 0)
                    compare = qqbar_cmpabs_im(left, right);
                if (compare == 0)
                    compare = qqbar_sgn_im(left);
            }
            if (compare >= 0)
                break;
            order[position] = order[position - 1];
            position--;
        }
        order[position] = selected;
    }
    if (!check_napi(env,
        napi_create_array_with_length(env, degree, &result)))
        goto fail;
    for (position = 0; position < degree; position++)
    {
        index = order[position];
        value = sagejs_qqbar_wrap_copy(env, eigenvalues + index);
        if (value == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, result, (uint32_t) position, value)))
            goto fail;
    }
    free(order);
    _qqbar_vec_clear(eigenvalues, degree);
    return result;

fail:
    free(order);
    _qqbar_vec_clear(eigenvalues, degree);
    return NULL;
}

static double acb_mid_real_double(const acb_t value)
{
    return arf_get_d(
        arb_midref(acb_realref(value)), ARF_RND_NEAR);
}

static double acb_mid_imag_double(const acb_t value)
{
    return arf_get_d(
        arb_midref(acb_imagref(value)), ARF_RND_NEAR);
}

static int acb_pretty_less(const acb_t left, const acb_t right)
{
    double left_real = acb_mid_real_double(left);
    double right_real = acb_mid_real_double(right);
    double left_imag;
    double right_imag;

    if (left_real < right_real)
        return 1;
    if (left_real > right_real)
        return 0;
    left_imag = acb_mid_imag_double(left);
    right_imag = acb_mid_imag_double(right);
    return left_imag < right_imag;
}

static napi_value wrap_acb_midpoint(
    napi_env env,
    const acb_t value,
    slong precision)
{
    sagejs_complex *complex =
        complex_from_acb_midpoint(env, value, precision);

    return complex == NULL
        ? NULL
        : sagejs_native_wrap_complex(env, complex);
}

static napi_value normalized_eigenvector(
    napi_env env,
    const acb_mat_t vectors,
    slong vector_index,
    int right,
    slong precision)
{
    slong size = acb_mat_nrows(vectors);
    slong index;
    slong pivot = 0;
    double largest = -1.0;
    double current;
    napi_value result;
    napi_value value;
    arb_t magnitude;
    arb_t pivot_magnitude;
    arb_t norm_squared;
    arb_t norm;
    acb_t factor;
    acb_t normalized;
    const acb_struct *entry;

    arb_init(magnitude);
    arb_init(pivot_magnitude);
    arb_init(norm_squared);
    arb_init(norm);
    acb_init(factor);
    acb_init(normalized);
    arb_zero(norm_squared);
    for (index = 0; index < size; index++)
    {
        entry = right
            ? acb_mat_entry(vectors, index, vector_index)
            : acb_mat_entry(vectors, vector_index, index);
        acb_abs(magnitude, entry, precision);
        arb_addmul(
            norm_squared, magnitude, magnitude, precision);
        current = arf_get_d(
            arb_midref(magnitude), ARF_RND_NEAR);
        if (current > largest)
        {
            largest = current;
            pivot = index;
            arb_set(pivot_magnitude, magnitude);
        }
    }
    arb_sqrt(norm, norm_squared, precision);
    entry = right
        ? acb_mat_entry(vectors, pivot, vector_index)
        : acb_mat_entry(vectors, vector_index, pivot);
    acb_conj(factor, entry);
    acb_div_arb(factor, factor, pivot_magnitude, precision);
    acb_div_arb(factor, factor, norm, precision);
    if (!check_napi(env,
        napi_create_array_with_length(env, size, &result)))
        goto fail;
    for (index = 0; index < size; index++)
    {
        entry = right
            ? acb_mat_entry(vectors, index, vector_index)
            : acb_mat_entry(vectors, vector_index, index);
        if (index == pivot)
        {
            acb_set_arb(normalized, pivot_magnitude);
            acb_div_arb(
                normalized, normalized, norm, precision);
        }
        else
        {
            acb_mul(normalized, entry, factor, precision);
        }
        value = wrap_acb_midpoint(env, normalized, precision);
        if (value == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, result, (uint32_t) index, value)))
            goto fail;
    }
    arb_clear(magnitude);
    arb_clear(pivot_magnitude);
    arb_clear(norm_squared);
    arb_clear(norm);
    acb_clear(factor);
    acb_clear(normalized);
    return result;

fail:
    arb_clear(magnitude);
    arb_clear(pivot_magnitude);
    arb_clear(norm_squared);
    arb_clear(norm);
    acb_clear(factor);
    acb_clear(normalized);
    return NULL;
}

napi_value sagejs_matrix_approx_eigensystem(
    napi_env env,
    napi_callback_info info)
{
    napi_value args[1];
    napi_value result;
    napi_value values;
    napi_value left_vectors;
    napi_value right_vectors;
    napi_value value;
    sagejs_matrix *source;
    acb_ptr eigenvalues;
    acb_mat_t left;
    acb_mat_t right;
    slong *order;
    slong size;
    slong index;
    slong position;
    slong selected;
    slong working_precision;
    int converged;

    if (!require_arguments(env, info, 1, args))
        return NULL;
    source = unwrap_matrix(env, args[0]);
    if (source == NULL)
        return NULL;
    if (source->kind != SAGEJS_MATRIX_ACB)
    {
        napi_throw_type_error(env, NULL,
            "approximate eigensystems require an approximate matrix");
        return NULL;
    }
    if (matrix_nrows(source) != matrix_ncols(source))
    {
        napi_throw_range_error(env, NULL,
            "eigensystems require a square matrix");
        return NULL;
    }
    size = matrix_nrows(source);
    working_precision = source->precision + 32;
    eigenvalues = _acb_vec_init(size);
    acb_mat_init(left, size, size);
    acb_mat_init(right, size, size);
    order = size == 0 ? NULL : malloc(size * sizeof(slong));
    if (size != 0 && order == NULL)
    {
        napi_throw_error(env, NULL,
            "unable to allocate eigenvalue ordering");
        goto fail;
    }
    converged = acb_mat_approx_eig_qr(
        eigenvalues,
        left,
        right,
        source->approximate,
        NULL,
        0,
        working_precision);
    if (!converged)
    {
        napi_throw_error(env, NULL,
            "FLINT's approximate eigensolver did not converge");
        goto fail;
    }
    for (index = 0; index < size; index++)
        order[index] = index;
    for (index = 1; index < size; index++)
    {
        selected = order[index];
        position = index;
        while (
            position > 0 &&
            acb_pretty_less(
                eigenvalues + selected,
                eigenvalues + order[position - 1])
        )
        {
            order[position] = order[position - 1];
            position--;
        }
        order[position] = selected;
    }
    if (!check_napi(env, napi_create_object(env, &result)) ||
        !check_napi(env,
            napi_create_array_with_length(env, size, &values)) ||
        !check_napi(env,
            napi_create_array_with_length(env, size, &left_vectors)) ||
        !check_napi(env,
            napi_create_array_with_length(env, size, &right_vectors)))
        goto fail;
    for (position = 0; position < size; position++)
    {
        index = order[position];
        value = wrap_acb_midpoint(
            env, eigenvalues + index, source->precision);
        if (value == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, values, (uint32_t) position, value)))
            goto fail;
        value = normalized_eigenvector(
            env, left, index, 0, source->precision);
        if (value == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, left_vectors, (uint32_t) position, value)))
            goto fail;
        value = normalized_eigenvector(
            env, right, index, 1, source->precision);
        if (value == NULL ||
            !check_napi(env,
                napi_set_element(
                    env, right_vectors, (uint32_t) position, value)))
            goto fail;
    }
    if (!check_napi(env,
        napi_set_named_property(env, result, "values", values)) ||
        !check_napi(env,
            napi_set_named_property(
                env, result, "leftVectors", left_vectors)) ||
        !check_napi(env,
            napi_set_named_property(
                env, result, "rightVectors", right_vectors)))
        goto fail;
    free(order);
    acb_mat_clear(left);
    acb_mat_clear(right);
    _acb_vec_clear(eigenvalues, size);
    return result;

fail:
    free(order);
    acb_mat_clear(left);
    acb_mat_clear(right);
    _acb_vec_clear(eigenvalues, size);
    return NULL;
}
