/*
 * Host-neutral wasm32 MPFR/Acb numeric resources.
 *
 * This adapter contains no numerical algorithms of its own.  It gives the
 * public RealField/ComplexField layer bounded, generation-tagged resources
 * owned by one WebAssembly instance and delegates special functions to Acb.
 */

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <gmp.h>
#include <mpfr.h>

#include <flint/acb.h>
#include <flint/acb_dirichlet.h>
#include <flint/acb_hypgeom.h>
#include <flint/arb.h>
#include <flint/fmpz.h>

#define EXPORT __attribute__((visibility("default")))
#define NUMERIC_CAPACITY UINT32_C(65536)
#define NUMERIC_SLOT_BITS 13
#define NUMERIC_SLOT_COUNT (UINT32_C(1) << NUMERIC_SLOT_BITS)
#define NUMERIC_SLOT_MASK (NUMERIC_SLOT_COUNT - UINT32_C(1))
#define NUMERIC_GENERATION_MASK UINT32_C(0xffff)
#define NUMERIC_MAX_ZEROS UINT32_C(65536)
#define NUMERIC_MAX_EXPRESSION_OPS UINT32_C(4096)
#define NUMERIC_MAX_INTERVALS UINT32_C(100000)

enum
{
    NUMERIC_OK = 0,
    NUMERIC_INVALID_HANDLE = 1,
    NUMERIC_INVALID_INPUT = 2,
    NUMERIC_ALLOCATION_FAILED = 3,
    NUMERIC_RESOURCE_LIMIT = 4,
    NUMERIC_INVALID_EXPRESSION = 5,
    NUMERIC_NO_BRACKETED_ROOT = 6,
    NUMERIC_NONFINITE_RESULT = 7
};

typedef struct
{
    mpfr_t value;
    uint32_t generation;
    int live;
} real_slot;

typedef struct
{
    mpfr_t real;
    mpfr_t imaginary;
    uint32_t generation;
    int live;
} complex_slot;

static char numeric_input[NUMERIC_CAPACITY];
static char numeric_output[NUMERIC_CAPACITY];
static double zeta_zero_output[NUMERIC_MAX_ZEROS];
static real_slot real_slots[NUMERIC_SLOT_COUNT];
static complex_slot complex_slots[NUMERIC_SLOT_COUNT];
static uint32_t next_real_slot = 1;
static uint32_t next_complex_slot = 1;
static uint32_t numeric_status;
static uint32_t numeric_live_count;
static double symbolic_results[2];

static uint32_t next_generation(uint32_t generation)
{
    generation = (generation + 1) & NUMERIC_GENERATION_MASK;
    return generation == 0 ? 1 : generation;
}

static uint32_t slot_handle(uint32_t index, uint32_t generation)
{
    return (generation << NUMERIC_SLOT_BITS) | index;
}

static real_slot *real_from_handle(uint32_t handle)
{
    uint32_t index = handle & NUMERIC_SLOT_MASK;
    uint32_t generation = handle >> NUMERIC_SLOT_BITS;
    real_slot *slot;
    if (index == 0 || index >= NUMERIC_SLOT_COUNT)
        return NULL;
    slot = real_slots + index;
    return slot->live && slot->generation == generation ? slot : NULL;
}

static complex_slot *complex_from_handle(uint32_t handle)
{
    uint32_t index = handle & NUMERIC_SLOT_MASK;
    uint32_t generation = handle >> NUMERIC_SLOT_BITS;
    complex_slot *slot;
    if (index == 0 || index >= NUMERIC_SLOT_COUNT)
        return NULL;
    slot = complex_slots + index;
    return slot->live && slot->generation == generation ? slot : NULL;
}

static uint32_t allocate_real(mpfr_prec_t precision, real_slot **result)
{
    uint32_t searched;
    for (searched = 0; searched < NUMERIC_SLOT_COUNT - 1; searched++)
    {
        uint32_t index = next_real_slot++;
        real_slot *slot;
        if (next_real_slot == NUMERIC_SLOT_COUNT)
            next_real_slot = 1;
        slot = real_slots + index;
        if (!slot->live)
        {
            slot->generation = next_generation(slot->generation);
            mpfr_init2(slot->value, precision);
            slot->live = 1;
            numeric_live_count++;
            *result = slot;
            numeric_status = NUMERIC_OK;
            return slot_handle(index, slot->generation);
        }
    }
    numeric_status = NUMERIC_RESOURCE_LIMIT;
    return 0;
}

static uint32_t allocate_complex(mpfr_prec_t precision, complex_slot **result)
{
    uint32_t searched;
    for (searched = 0; searched < NUMERIC_SLOT_COUNT - 1; searched++)
    {
        uint32_t index = next_complex_slot++;
        complex_slot *slot;
        if (next_complex_slot == NUMERIC_SLOT_COUNT)
            next_complex_slot = 1;
        slot = complex_slots + index;
        if (!slot->live)
        {
            slot->generation = next_generation(slot->generation);
            mpfr_init2(slot->real, precision);
            mpfr_init2(slot->imaginary, precision);
            slot->live = 1;
            numeric_live_count++;
            *result = slot;
            numeric_status = NUMERIC_OK;
            return slot_handle(index, slot->generation);
        }
    }
    numeric_status = NUMERIC_RESOURCE_LIMIT;
    return 0;
}

static int valid_precision(uint32_t precision)
{
    return precision >= MPFR_PREC_MIN && precision <= UINT32_C(1048576);
}

static int parse_rational(mpfr_t result, const char *text)
{
    const char *slash = strchr(text, '/');
    mpz_t numerator;
    mpz_t denominator;
    char *left;
    int valid;
    if (slash == NULL)
        return mpfr_set_str(result, text, 10, MPFR_RNDN) == 0;
    left = (char *) malloc((size_t) (slash - text) + 1);
    if (left == NULL)
        return 0;
    memcpy(left, text, (size_t) (slash - text));
    left[slash - text] = '\0';
    mpz_init(numerator);
    mpz_init(denominator);
    valid = mpz_set_str(numerator, left, 10) == 0 &&
        mpz_set_str(denominator, slash + 1, 10) == 0 &&
        mpz_sgn(denominator) != 0;
    free(left);
    if (valid)
    {
        mpfr_set_z(result, numerator, MPFR_RNDN);
        mpfr_div_z(result, result, denominator, MPFR_RNDN);
    }
    mpz_clear(denominator);
    mpz_clear(numerator);
    return valid;
}

static char *format_real(mpfr_srcptr value)
{
    mpfr_prec_t precision = mpfr_get_prec(value);
    size_t digits = (size_t) floor((precision - 1) * 0.30102999566398119521);
    mpfr_exp_t exponent;
    char *raw;
    char *magnitude;
    char *result = NULL;
    size_t sign;
    size_t length;

    if (mpfr_nan_p(value))
        return strdup("NaN");
    if (mpfr_inf_p(value))
        return strdup(mpfr_signbit(value) ? "-infinity" : "+infinity");
    if (digits < 2)
        digits = 2;
    if (mpfr_zero_p(value))
    {
        result = (char *) malloc(digits + 4);
        if (result == NULL)
            return NULL;
        snprintf(result, digits + 4, "%s0.", mpfr_signbit(value) ? "-" : "");
        memset(result + (mpfr_signbit(value) ? 3 : 2), '0', digits);
        result[(mpfr_signbit(value) ? 3 : 2) + digits] = '\0';
        return result;
    }
    raw = mpfr_get_str(NULL, &exponent, 10, digits, value, MPFR_RNDN);
    if (raw == NULL)
        return NULL;
    sign = raw[0] == '-' ? 1 : 0;
    magnitude = raw + sign;
    if (exponent >= -4 && exponent <= 6)
    {
        size_t before = exponent > 0 ? (size_t) exponent : 1;
        size_t leading = exponent <= 0 ? (size_t) (-exponent) : 0;
        size_t after = exponent > 0
            ? (digits > (size_t) exponent ? digits - (size_t) exponent : 1)
            : leading + digits;
        length = sign + before + 1 + after;
        result = (char *) malloc(length + 1);
        if (result != NULL)
        {
            char *out = result;
            if (sign)
                *out++ = '-';
            if (exponent <= 0)
            {
                *out++ = '0';
                *out++ = '.';
                memset(out, '0', leading);
                out += leading;
                memcpy(out, magnitude, digits);
                out += digits;
            }
            else
            {
                size_t integer_digits = (size_t) exponent;
                size_t copied = integer_digits < digits ? integer_digits : digits;
                memcpy(out, magnitude, copied);
                out += copied;
                if (integer_digits > copied)
                {
                    memset(out, '0', integer_digits - copied);
                    out += integer_digits - copied;
                }
                *out++ = '.';
                if (digits > integer_digits)
                {
                    memcpy(out, magnitude + integer_digits, digits - integer_digits);
                    out += digits - integer_digits;
                }
                else
                    *out++ = '0';
            }
            *out = '\0';
        }
    }
    else
    {
        int exponent_chars = snprintf(NULL, 0, "%ld", (long) exponent - 1);
        length = sign + 1 + 1 + (digits - 1) + 1 + (size_t) exponent_chars;
        result = (char *) malloc(length + 1);
        if (result != NULL)
            snprintf(result, length + 1, "%s%c.%.*se%ld",
                sign ? "-" : "", magnitude[0], (int) digits - 1,
                magnitude + 1, (long) exponent - 1);
    }
    mpfr_free_str(raw);
    return result;
}

static int output_text(const char *text)
{
    size_t length = strlen(text);
    if (length >= NUMERIC_CAPACITY)
    {
        numeric_status = NUMERIC_RESOURCE_LIMIT;
        return 0;
    }
    memcpy(numeric_output, text, length + 1);
    numeric_status = NUMERIC_OK;
    return 1;
}

static void complex_multiply(
    mpfr_t out_real, mpfr_t out_imaginary,
    mpfr_srcptr left_real, mpfr_srcptr left_imaginary,
    mpfr_srcptr right_real, mpfr_srcptr right_imaginary,
    mpfr_prec_t precision)
{
    mpfr_t first;
    mpfr_t second;
    mpfr_init2(first, precision);
    mpfr_init2(second, precision);
    mpfr_mul(first, left_real, right_real, MPFR_RNDN);
    mpfr_mul(second, left_imaginary, right_imaginary, MPFR_RNDN);
    mpfr_sub(out_real, first, second, MPFR_RNDN);
    mpfr_mul(first, left_real, right_imaginary, MPFR_RNDN);
    mpfr_mul(second, left_imaginary, right_real, MPFR_RNDN);
    mpfr_add(out_imaginary, first, second, MPFR_RNDN);
    mpfr_clear(second);
    mpfr_clear(first);
}

static void complex_divide(
    mpfr_t out_real, mpfr_t out_imaginary,
    mpfr_srcptr left_real, mpfr_srcptr left_imaginary,
    mpfr_srcptr right_real, mpfr_srcptr right_imaginary,
    mpfr_prec_t precision)
{
    mpfr_t denominator;
    mpfr_t first;
    mpfr_t second;
    mpfr_init2(denominator, precision);
    mpfr_init2(first, precision);
    mpfr_init2(second, precision);
    mpfr_mul(denominator, right_real, right_real, MPFR_RNDN);
    mpfr_mul(first, right_imaginary, right_imaginary, MPFR_RNDN);
    mpfr_add(denominator, denominator, first, MPFR_RNDN);
    mpfr_mul(first, left_real, right_real, MPFR_RNDN);
    mpfr_mul(second, left_imaginary, right_imaginary, MPFR_RNDN);
    mpfr_add(first, first, second, MPFR_RNDN);
    mpfr_div(out_real, first, denominator, MPFR_RNDN);
    mpfr_mul(first, left_imaginary, right_real, MPFR_RNDN);
    mpfr_mul(second, left_real, right_imaginary, MPFR_RNDN);
    mpfr_sub(first, first, second, MPFR_RNDN);
    mpfr_div(out_imaginary, first, denominator, MPFR_RNDN);
    mpfr_clear(second);
    mpfr_clear(first);
    mpfr_clear(denominator);
}

EXPORT uintptr_t sagejs_numeric_input(void) { return (uintptr_t) numeric_input; }
EXPORT uint32_t sagejs_numeric_input_capacity(void) { return NUMERIC_CAPACITY; }
EXPORT uintptr_t sagejs_numeric_output(void) { return (uintptr_t) numeric_output; }
EXPORT uint32_t sagejs_numeric_output_capacity(void) { return NUMERIC_CAPACITY; }
EXPORT uint32_t sagejs_numeric_last_status(void) { return numeric_status; }
EXPORT uint32_t sagejs_numeric_live_count(void) { return numeric_live_count; }

EXPORT uint32_t sagejs_numeric_real_from_string(uint32_t precision)
{
    real_slot *slot;
    uint32_t handle;
    numeric_input[NUMERIC_CAPACITY - 1] = '\0';
    if (!valid_precision(precision))
    {
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    handle = allocate_real((mpfr_prec_t) precision, &slot);
    if (handle == 0)
        return 0;
    if (!parse_rational(slot->value, numeric_input))
    {
        mpfr_clear(slot->value);
        slot->live = 0;
        numeric_live_count--;
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    return handle;
}

EXPORT uint32_t sagejs_numeric_real_round(uint32_t source_handle, uint32_t precision)
{
    real_slot *source = real_from_handle(source_handle);
    real_slot *result;
    uint32_t handle;
    if (source == NULL || !valid_precision(precision))
    {
        numeric_status = source == NULL ? NUMERIC_INVALID_HANDLE : NUMERIC_INVALID_INPUT;
        return 0;
    }
    handle = allocate_real((mpfr_prec_t) precision, &result);
    if (handle != 0)
        mpfr_set(result->value, source->value, MPFR_RNDN);
    return handle;
}

EXPORT uint32_t sagejs_numeric_real_binary(
    uint32_t operation, uint32_t left_handle, uint32_t right_handle)
{
    real_slot *left = real_from_handle(left_handle);
    real_slot *right = real_from_handle(right_handle);
    real_slot *result;
    uint32_t handle;
    if (left == NULL || right == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    handle = allocate_real(mpfr_get_prec(left->value), &result);
    if (handle == 0)
        return 0;
    if (operation == 0)
        mpfr_add(result->value, left->value, right->value, MPFR_RNDN);
    else if (operation == 1)
        mpfr_sub(result->value, left->value, right->value, MPFR_RNDN);
    else if (operation == 2)
        mpfr_mul(result->value, left->value, right->value, MPFR_RNDN);
    else if (operation == 3)
        mpfr_div(result->value, left->value, right->value, MPFR_RNDN);
    else
    {
        mpfr_clear(result->value);
        result->live = 0;
        numeric_live_count--;
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    return handle;
}

EXPORT uint32_t sagejs_numeric_real_neg(uint32_t source_handle)
{
    real_slot *source = real_from_handle(source_handle);
    real_slot *result;
    uint32_t handle;
    if (source == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    handle = allocate_real(mpfr_get_prec(source->value), &result);
    if (handle != 0)
        mpfr_neg(result->value, source->value, MPFR_RNDN);
    return handle;
}

EXPORT uint32_t sagejs_numeric_real_pow_int(uint32_t source_handle)
{
    real_slot *source = real_from_handle(source_handle);
    real_slot *result;
    mpz_t exponent;
    uint32_t handle;
    numeric_input[NUMERIC_CAPACITY - 1] = '\0';
    if (source == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    mpz_init(exponent);
    if (mpz_set_str(exponent, numeric_input, 10) != 0)
    {
        mpz_clear(exponent);
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    handle = allocate_real(mpfr_get_prec(source->value), &result);
    if (handle != 0)
        mpfr_pow_z(result->value, source->value, exponent, MPFR_RNDN);
    mpz_clear(exponent);
    return handle;
}

EXPORT int32_t sagejs_numeric_real_equal(uint32_t left_handle, uint32_t right_handle)
{
    real_slot *left = real_from_handle(left_handle);
    real_slot *right = real_from_handle(right_handle);
    if (left == NULL || right == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return -1;
    }
    numeric_status = NUMERIC_OK;
    return mpfr_equal_p(left->value, right->value) ? 1 : 0;
}

EXPORT uint32_t sagejs_numeric_real_precision(uint32_t handle)
{
    real_slot *slot = real_from_handle(handle);
    if (slot == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    numeric_status = NUMERIC_OK;
    return (uint32_t) mpfr_get_prec(slot->value);
}

EXPORT double sagejs_numeric_real_to_double(uint32_t handle)
{
    real_slot *slot = real_from_handle(handle);
    if (slot == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return NAN;
    }
    numeric_status = NUMERIC_OK;
    return mpfr_get_d(slot->value, MPFR_RNDN);
}

EXPORT uint32_t sagejs_numeric_real_format(uint32_t handle)
{
    real_slot *slot = real_from_handle(handle);
    char *text;
    int ok;
    if (slot == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    text = format_real(slot->value);
    if (text == NULL)
    {
        numeric_status = NUMERIC_ALLOCATION_FAILED;
        return 0;
    }
    ok = output_text(text);
    free(text);
    return ok ? 1 : 0;
}

EXPORT uint32_t sagejs_numeric_real_close(uint32_t handle)
{
    real_slot *slot = real_from_handle(handle);
    if (slot == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    mpfr_clear(slot->value);
    slot->live = 0;
    numeric_live_count--;
    numeric_status = NUMERIC_OK;
    return 1;
}

EXPORT uint32_t sagejs_numeric_complex_from_reals(
    uint32_t real_handle, uint32_t imaginary_handle)
{
    real_slot *real = real_from_handle(real_handle);
    real_slot *imaginary = real_from_handle(imaginary_handle);
    complex_slot *result;
    uint32_t handle;
    mpfr_prec_t precision;
    if (real == NULL || imaginary == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    precision = mpfr_get_prec(real->value);
    if (mpfr_get_prec(imaginary->value) != precision)
    {
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    handle = allocate_complex(precision, &result);
    if (handle != 0)
    {
        mpfr_set(result->real, real->value, MPFR_RNDN);
        mpfr_set(result->imaginary, imaginary->value, MPFR_RNDN);
    }
    return handle;
}

EXPORT uint32_t sagejs_numeric_complex_round(uint32_t source_handle, uint32_t precision)
{
    complex_slot *source = complex_from_handle(source_handle);
    complex_slot *result;
    uint32_t handle;
    if (source == NULL || !valid_precision(precision))
    {
        numeric_status = source == NULL ? NUMERIC_INVALID_HANDLE : NUMERIC_INVALID_INPUT;
        return 0;
    }
    handle = allocate_complex((mpfr_prec_t) precision, &result);
    if (handle != 0)
    {
        mpfr_set(result->real, source->real, MPFR_RNDN);
        mpfr_set(result->imaginary, source->imaginary, MPFR_RNDN);
    }
    return handle;
}

EXPORT uint32_t sagejs_numeric_complex_binary(
    uint32_t operation, uint32_t left_handle, uint32_t right_handle)
{
    complex_slot *left = complex_from_handle(left_handle);
    complex_slot *right = complex_from_handle(right_handle);
    complex_slot *result;
    uint32_t handle;
    mpfr_prec_t precision;
    if (left == NULL || right == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    precision = mpfr_get_prec(left->real);
    handle = allocate_complex(precision, &result);
    if (handle == 0)
        return 0;
    if (operation == 0)
    {
        mpfr_add(result->real, left->real, right->real, MPFR_RNDN);
        mpfr_add(result->imaginary, left->imaginary, right->imaginary, MPFR_RNDN);
    }
    else if (operation == 1)
    {
        mpfr_sub(result->real, left->real, right->real, MPFR_RNDN);
        mpfr_sub(result->imaginary, left->imaginary, right->imaginary, MPFR_RNDN);
    }
    else if (operation == 2)
        complex_multiply(result->real, result->imaginary,
            left->real, left->imaginary, right->real, right->imaginary, precision);
    else if (operation == 3)
        complex_divide(result->real, result->imaginary,
            left->real, left->imaginary, right->real, right->imaginary, precision);
    else
    {
        mpfr_clear(result->imaginary);
        mpfr_clear(result->real);
        result->live = 0;
        numeric_live_count--;
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    return handle;
}

EXPORT uint32_t sagejs_numeric_complex_neg(uint32_t source_handle)
{
    complex_slot *source = complex_from_handle(source_handle);
    complex_slot *result;
    uint32_t handle;
    if (source == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    handle = allocate_complex(mpfr_get_prec(source->real), &result);
    if (handle != 0)
    {
        mpfr_neg(result->real, source->real, MPFR_RNDN);
        mpfr_neg(result->imaginary, source->imaginary, MPFR_RNDN);
    }
    return handle;
}

static void complex_pow_mpz(
    mpfr_t out_real, mpfr_t out_imaginary,
    mpfr_srcptr source_real, mpfr_srcptr source_imaginary,
    const mpz_t exponent, mpfr_prec_t precision)
{
    mpz_t remaining;
    mpfr_t base_real;
    mpfr_t base_imaginary;
    mpfr_t temp_real;
    mpfr_t temp_imaginary;
    int negative = mpz_sgn(exponent) < 0;
    mpz_init(remaining);
    mpz_abs(remaining, exponent);
    mpfr_init2(base_real, precision);
    mpfr_init2(base_imaginary, precision);
    mpfr_init2(temp_real, precision);
    mpfr_init2(temp_imaginary, precision);
    mpfr_set(base_real, source_real, MPFR_RNDN);
    mpfr_set(base_imaginary, source_imaginary, MPFR_RNDN);
    mpfr_set_ui(out_real, 1, MPFR_RNDN);
    mpfr_set_zero(out_imaginary, 0);
    while (mpz_sgn(remaining) != 0)
    {
        if (mpz_odd_p(remaining))
        {
            complex_multiply(temp_real, temp_imaginary,
                out_real, out_imaginary, base_real, base_imaginary, precision);
            mpfr_set(out_real, temp_real, MPFR_RNDN);
            mpfr_set(out_imaginary, temp_imaginary, MPFR_RNDN);
        }
        mpz_fdiv_q_2exp(remaining, remaining, 1);
        if (mpz_sgn(remaining) != 0)
        {
            complex_multiply(temp_real, temp_imaginary,
                base_real, base_imaginary, base_real, base_imaginary, precision);
            mpfr_set(base_real, temp_real, MPFR_RNDN);
            mpfr_set(base_imaginary, temp_imaginary, MPFR_RNDN);
        }
    }
    if (negative)
    {
        mpfr_set_ui(temp_real, 1, MPFR_RNDN);
        mpfr_set_zero(temp_imaginary, 0);
        complex_divide(base_real, base_imaginary,
            temp_real, temp_imaginary, out_real, out_imaginary, precision);
        mpfr_set(out_real, base_real, MPFR_RNDN);
        mpfr_set(out_imaginary, base_imaginary, MPFR_RNDN);
    }
    mpfr_clear(temp_imaginary);
    mpfr_clear(temp_real);
    mpfr_clear(base_imaginary);
    mpfr_clear(base_real);
    mpz_clear(remaining);
}

EXPORT uint32_t sagejs_numeric_complex_pow_int(uint32_t source_handle)
{
    complex_slot *source = complex_from_handle(source_handle);
    complex_slot *result;
    mpz_t exponent;
    uint32_t handle;
    numeric_input[NUMERIC_CAPACITY - 1] = '\0';
    if (source == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    mpz_init(exponent);
    if (mpz_set_str(exponent, numeric_input, 10) != 0)
    {
        mpz_clear(exponent);
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    handle = allocate_complex(mpfr_get_prec(source->real), &result);
    if (handle != 0)
        complex_pow_mpz(result->real, result->imaginary,
            source->real, source->imaginary, exponent, mpfr_get_prec(source->real));
    mpz_clear(exponent);
    return handle;
}

EXPORT int32_t sagejs_numeric_complex_equal(
    uint32_t left_handle, uint32_t right_handle)
{
    complex_slot *left = complex_from_handle(left_handle);
    complex_slot *right = complex_from_handle(right_handle);
    if (left == NULL || right == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return -1;
    }
    numeric_status = NUMERIC_OK;
    return mpfr_equal_p(left->real, right->real) &&
        mpfr_equal_p(left->imaginary, right->imaginary) ? 1 : 0;
}

EXPORT uint32_t sagejs_numeric_complex_precision(uint32_t handle)
{
    complex_slot *slot = complex_from_handle(handle);
    if (slot == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    numeric_status = NUMERIC_OK;
    return (uint32_t) mpfr_get_prec(slot->real);
}

EXPORT uint32_t sagejs_numeric_complex_part(uint32_t handle, uint32_t imaginary)
{
    complex_slot *source = complex_from_handle(handle);
    real_slot *result;
    uint32_t result_handle;
    if (source == NULL || imaginary > 1)
    {
        numeric_status = source == NULL ? NUMERIC_INVALID_HANDLE : NUMERIC_INVALID_INPUT;
        return 0;
    }
    result_handle = allocate_real(mpfr_get_prec(source->real), &result);
    if (result_handle != 0)
        mpfr_set(result->value, imaginary ? source->imaginary : source->real, MPFR_RNDN);
    return result_handle;
}

EXPORT double sagejs_numeric_complex_part_double(uint32_t handle, uint32_t imaginary)
{
    complex_slot *slot = complex_from_handle(handle);
    if (slot == NULL || imaginary > 1)
    {
        numeric_status = slot == NULL ? NUMERIC_INVALID_HANDLE : NUMERIC_INVALID_INPUT;
        return NAN;
    }
    numeric_status = NUMERIC_OK;
    return mpfr_get_d(imaginary ? slot->imaginary : slot->real, MPFR_RNDN);
}

EXPORT uint32_t sagejs_numeric_complex_format(uint32_t handle)
{
    complex_slot *slot = complex_from_handle(handle);
    char *real;
    char *imaginary;
    char *text;
    const char *magnitude;
    size_t length;
    int imaginary_zero;
    int real_zero;
    int negative;
    int ok;
    if (slot == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    real = format_real(slot->real);
    imaginary = format_real(slot->imaginary);
    if (real == NULL || imaginary == NULL)
    {
        free(real);
        free(imaginary);
        numeric_status = NUMERIC_ALLOCATION_FAILED;
        return 0;
    }
    imaginary_zero = mpfr_zero_p(slot->imaginary);
    real_zero = mpfr_zero_p(slot->real);
    negative = mpfr_signbit(slot->imaginary);
    magnitude = negative ? imaginary + 1 : imaginary;
    if (imaginary_zero)
        text = strdup(real);
    else if (real_zero)
    {
        length = strlen(imaginary) + 3;
        text = (char *) malloc(length + 1);
        if (text != NULL)
            snprintf(text, length + 1, "%s*I", imaginary);
    }
    else
    {
        length = strlen(real) + strlen(magnitude) + 6;
        text = (char *) malloc(length + 1);
        if (text != NULL)
            snprintf(text, length + 1, "%s %c %s*I",
                real, negative ? '-' : '+', magnitude);
    }
    free(imaginary);
    free(real);
    if (text == NULL)
    {
        numeric_status = NUMERIC_ALLOCATION_FAILED;
        return 0;
    }
    ok = output_text(text);
    free(text);
    return ok ? 1 : 0;
}

EXPORT uint32_t sagejs_numeric_complex_close(uint32_t handle)
{
    complex_slot *slot = complex_from_handle(handle);
    if (slot == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    mpfr_clear(slot->imaginary);
    mpfr_clear(slot->real);
    slot->live = 0;
    numeric_live_count--;
    numeric_status = NUMERIC_OK;
    return 1;
}

static void complex_to_acb(acb_t result, const complex_slot *source, slong precision)
{
    arb_set_interval_mpfr(acb_realref(result), source->real, source->real, precision);
    arb_set_interval_mpfr(
        acb_imagref(result), source->imaginary, source->imaginary, precision);
}

static void acb_midpoint_to_complex(complex_slot *result, const acb_t source)
{
    arf_get_mpfr(result->real, arb_midref(acb_realref(source)), MPFR_RNDN);
    arf_get_mpfr(result->imaginary, arb_midref(acb_imagref(source)), MPFR_RNDN);
}

EXPORT uint32_t sagejs_numeric_complex_ei(uint32_t source_handle)
{
    complex_slot *source = complex_from_handle(source_handle);
    complex_slot *result;
    acb_t input;
    acb_t output;
    mpfr_prec_t precision;
    uint32_t handle;
    if (source == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    precision = mpfr_get_prec(source->real);
    handle = allocate_complex(precision, &result);
    if (handle == 0)
        return 0;
    acb_init(input);
    acb_init(output);
    complex_to_acb(input, source, precision);
    acb_hypgeom_ei(output, input, precision);
    acb_midpoint_to_complex(result, output);
    acb_clear(output);
    acb_clear(input);
    return handle;
}

EXPORT uint32_t sagejs_numeric_complex_bessel_i(
    uint32_t order_handle, uint32_t argument_handle)
{
    complex_slot *order = complex_from_handle(order_handle);
    complex_slot *argument = complex_from_handle(argument_handle);
    complex_slot *result;
    acb_t acb_order;
    acb_t acb_argument;
    acb_t output;
    mpfr_prec_t precision;
    uint32_t handle;
    if (order == NULL || argument == NULL)
    {
        numeric_status = NUMERIC_INVALID_HANDLE;
        return 0;
    }
    precision = mpfr_get_prec(order->real);
    if (mpfr_get_prec(argument->real) > precision)
        precision = mpfr_get_prec(argument->real);
    handle = allocate_complex(precision, &result);
    if (handle == 0)
        return 0;
    acb_init(acb_order);
    acb_init(acb_argument);
    acb_init(output);
    complex_to_acb(acb_order, order, precision);
    complex_to_acb(acb_argument, argument, precision);
    acb_hypgeom_bessel_i(output, acb_order, acb_argument, precision);
    acb_midpoint_to_complex(result, output);
    acb_clear(output);
    acb_clear(acb_argument);
    acb_clear(acb_order);
    return handle;
}

EXPORT uintptr_t sagejs_numeric_zeta_zero_output(void)
{
    return (uintptr_t) zeta_zero_output;
}

EXPORT uint32_t sagejs_numeric_zeta_zeros(uint32_t count, uint32_t precision)
{
    arb_ptr zeros;
    fmpz_t start;
    uint32_t index;
    if (count > NUMERIC_MAX_ZEROS || !valid_precision(precision))
    {
        numeric_status = NUMERIC_RESOURCE_LIMIT;
        return 0;
    }
    zeros = _arb_vec_init((slong) count);
    if (zeros == NULL && count != 0)
    {
        numeric_status = NUMERIC_ALLOCATION_FAILED;
        return 0;
    }
    fmpz_init(start);
    fmpz_one(start);
    acb_dirichlet_hardy_z_zeros(zeros, start, (slong) count, (slong) precision);
    fmpz_clear(start);
    for (index = 0; index < count; index++)
        zeta_zero_output[index] =
            arf_get_d(arb_midref(zeros + index), ARF_RND_NEAR);
    _arb_vec_clear(zeros, (slong) count);
    numeric_status = NUMERIC_OK;
    return 1;
}

typedef struct
{
    double lower;
    double upper;
    double result;
    double error;
} numeric_interval;

static uint32_t read_expression_opcode(size_t offset)
{
    const unsigned char *bytes = (const unsigned char *) numeric_input + offset;
    return ((uint32_t) bytes[0]) |
        ((uint32_t) bytes[1] << 8) |
        ((uint32_t) bytes[2] << 16) |
        ((uint32_t) bytes[3] << 24);
}

static double read_expression_value(size_t offset)
{
    double value;
    memcpy(&value, numeric_input + offset + 4, sizeof(value));
    return value;
}

static int evaluate_expression(uint32_t length, double variable, double *result)
{
    double stack[NUMERIC_MAX_EXPRESSION_OPS];
    uint32_t count;
    uint32_t index;
    uint32_t size = 0;
    if (length == 0 || length % 12 != 0)
        return 0;
    count = length / 12;
    if (count > NUMERIC_MAX_EXPRESSION_OPS)
        return 0;
    for (index = 0; index < count; index++)
    {
        uint32_t opcode = read_expression_opcode((size_t) index * 12);
        double right;
        double left;
        if (opcode == 0 || opcode == 1)
        {
            if (size == NUMERIC_MAX_EXPRESSION_OPS)
                return 0;
            stack[size++] = opcode == 0
                ? variable : read_expression_value((size_t) index * 12);
            continue;
        }
        if (opcode >= 2 && opcode <= 6)
        {
            if (size < 2)
                return 0;
            right = stack[--size];
            left = stack[size - 1];
            if (opcode == 2)
                stack[size - 1] = left + right;
            else if (opcode == 3)
                stack[size - 1] = left - right;
            else if (opcode == 4)
                stack[size - 1] = left * right;
            else if (opcode == 5)
                stack[size - 1] = left / right;
            else
                stack[size - 1] = pow(left, right);
            continue;
        }
        if (size < 1)
            return 0;
        if (opcode == 7)
            stack[size - 1] = -stack[size - 1];
        else if (opcode == 8)
            stack[size - 1] = sin(stack[size - 1]);
        else if (opcode == 9)
            stack[size - 1] = cos(stack[size - 1]);
        else if (opcode == 10)
            stack[size - 1] = exp(stack[size - 1]);
        else if (opcode == 11)
            stack[size - 1] = log(stack[size - 1]);
        else if (opcode == 12)
            stack[size - 1] = sqrt(stack[size - 1]);
        else if (opcode == 13)
            stack[size - 1] = tan(stack[size - 1]);
        else if (opcode == 14)
            stack[size - 1] = fabs(stack[size - 1]);
        else
            return 0;
    }
    if (size != 1)
        return 0;
    *result = stack[0];
    return 1;
}

static const double kronrod_abscissae[10] = {
    0.9956571630258081, 0.9739065285171717,
    0.9301574913557082, 0.8650633666889845,
    0.7808177265864169, 0.6794095682990244,
    0.5627571346686047, 0.4333953941292472,
    0.2943928627014602, 0.14887433898163122
};
static const double kronrod_weights[10] = {
    0.011694638867371874, 0.03255816230796473,
    0.054755896574351996, 0.07503967481091995,
    0.0931254545836976, 0.10938715880229764,
    0.12349197626206585, 0.13470921731147333,
    0.14277593857706008, 0.14773910490133849
};
static const double gauss_weights[10] = {
    0.0, 0.06667134430868814, 0.0, 0.1494513491505806,
    0.0, 0.21908636251598204, 0.0, 0.26926671930999635,
    0.0, 0.29552422471475287
};

static int gauss_kronrod_21(
    uint32_t length, double lower, double upper,
    double *result, double *error)
{
    const double center_weight = 0.1494455540029169;
    const double machine_epsilon = 2.220446049250313e-16;
    double center = (lower + upper) / 2.0;
    double half_length = (upper - lower) / 2.0;
    double absolute_half_length = fabs(half_length);
    double center_value;
    double sampled_left[10];
    double sampled_right[10];
    double kronrod_sum;
    double gauss_sum = 0.0;
    double absolute_sum;
    double mean;
    double absolute_deviation;
    double gauss_result;
    double absolute_integral;
    uint32_t index;
    if (!evaluate_expression(length, center, &center_value))
        return 0;
    kronrod_sum = center_weight * center_value;
    absolute_sum = center_weight * fabs(center_value);
    for (index = 0; index < 10; index++)
    {
        double displacement = half_length * kronrod_abscissae[index];
        double pair_sum;
        if (!evaluate_expression(
                length, center - displacement, sampled_left + index) ||
            !evaluate_expression(
                length, center + displacement, sampled_right + index))
            return 0;
        pair_sum = sampled_left[index] + sampled_right[index];
        kronrod_sum += kronrod_weights[index] * pair_sum;
        gauss_sum += gauss_weights[index] * pair_sum;
        absolute_sum += kronrod_weights[index] *
            (fabs(sampled_left[index]) + fabs(sampled_right[index]));
    }
    mean = kronrod_sum / 2.0;
    absolute_deviation = center_weight * fabs(center_value - mean);
    for (index = 0; index < 10; index++)
        absolute_deviation += kronrod_weights[index] *
            (fabs(sampled_left[index] - mean) +
             fabs(sampled_right[index] - mean));
    *result = kronrod_sum * half_length;
    gauss_result = gauss_sum * half_length;
    absolute_integral = absolute_sum * absolute_half_length;
    absolute_deviation *= absolute_half_length;
    *error = fabs(*result - gauss_result);
    if (absolute_deviation != 0.0 && *error != 0.0)
    {
        double scale = pow(200.0 * *error / absolute_deviation, 1.5);
        *error = absolute_deviation * (scale < 1.0 ? scale : 1.0);
    }
    if (*error < 50.0 * machine_epsilon * absolute_integral)
        *error = 50.0 * machine_epsilon * absolute_integral;
    return 1;
}

EXPORT uint32_t sagejs_numeric_symbolic_integral(
    uint32_t length, double lower, double upper, uint32_t max_intervals,
    double eps_abs, double eps_rel, uint32_t adaptive)
{
    numeric_interval *intervals;
    uint32_t count = 1;
    if (length > NUMERIC_CAPACITY || max_intervals == 0 ||
        max_intervals > NUMERIC_MAX_INTERVALS ||
        eps_abs < 0.0 || eps_rel < 0.0 ||
        (eps_abs == 0.0 && eps_rel == 0.0))
    {
        numeric_status = NUMERIC_INVALID_INPUT;
        return 0;
    }
    intervals = (numeric_interval *) malloc(
        (size_t) max_intervals * sizeof(numeric_interval));
    if (intervals == NULL)
    {
        numeric_status = NUMERIC_ALLOCATION_FAILED;
        return 0;
    }
    if (!gauss_kronrod_21(
            length, lower, upper, symbolic_results, symbolic_results + 1))
    {
        free(intervals);
        numeric_status = NUMERIC_INVALID_EXPRESSION;
        return 0;
    }
    intervals[0].lower = lower;
    intervals[0].upper = upper;
    intervals[0].result = symbolic_results[0];
    intervals[0].error = symbolic_results[1];
    while (adaptive && isfinite(symbolic_results[0]) &&
        isfinite(symbolic_results[1]) &&
        symbolic_results[1] > fmax(eps_abs, eps_rel * fabs(symbolic_results[0])) &&
        count < max_intervals)
    {
        uint32_t index;
        uint32_t worst = 0;
        numeric_interval current;
        numeric_interval left;
        numeric_interval right;
        double midpoint;
        for (index = 1; index < count; index++)
            if (intervals[index].error > intervals[worst].error)
                worst = index;
        current = intervals[worst];
        midpoint = (current.lower + current.upper) / 2.0;
        if (midpoint == current.lower || midpoint == current.upper)
            break;
        left.lower = current.lower;
        left.upper = midpoint;
        right.lower = midpoint;
        right.upper = current.upper;
        if (!gauss_kronrod_21(
                length, left.lower, left.upper, &left.result, &left.error) ||
            !gauss_kronrod_21(
                length, right.lower, right.upper, &right.result, &right.error))
        {
            free(intervals);
            numeric_status = NUMERIC_INVALID_EXPRESSION;
            return 0;
        }
        symbolic_results[0] += left.result + right.result - current.result;
        symbolic_results[1] += left.error + right.error - current.error;
        intervals[worst] = left;
        intervals[count++] = right;
    }
    if (symbolic_results[1] < 0.0)
        symbolic_results[1] = 0.0;
    free(intervals);
    numeric_status = NUMERIC_OK;
    return 1;
}

EXPORT uint32_t sagejs_numeric_symbolic_find_root(
    uint32_t length, double lower, double upper,
    uint32_t max_iterations, double tolerance)
{
    double left_value;
    double right_value;
    uint32_t iteration;
    if (length > NUMERIC_CAPACITY || max_iterations == 0 ||
        max_iterations > UINT32_C(1000000) || tolerance < 0.0 ||
        !evaluate_expression(length, lower, &left_value) ||
        !evaluate_expression(length, upper, &right_value))
    {
        numeric_status = NUMERIC_INVALID_EXPRESSION;
        return 0;
    }
    if (!isfinite(left_value) || !isfinite(right_value))
    {
        numeric_status = NUMERIC_NONFINITE_RESULT;
        return 0;
    }
    if (left_value == 0.0)
    {
        symbolic_results[0] = lower;
        numeric_status = NUMERIC_OK;
        return 1;
    }
    if (right_value == 0.0)
    {
        symbolic_results[0] = upper;
        numeric_status = NUMERIC_OK;
        return 1;
    }
    if ((left_value < 0.0) == (right_value < 0.0))
    {
        numeric_status = NUMERIC_NO_BRACKETED_ROOT;
        return 0;
    }
    for (iteration = 0; iteration < max_iterations; iteration++)
    {
        double middle = (lower + upper) / 2.0;
        double middle_value;
        if (!evaluate_expression(length, middle, &middle_value) ||
            !isfinite(middle_value))
        {
            numeric_status = NUMERIC_NONFINITE_RESULT;
            return 0;
        }
        if (middle_value == 0.0 || fabs(upper - lower) <= tolerance)
        {
            symbolic_results[0] = middle;
            numeric_status = NUMERIC_OK;
            return 1;
        }
        if ((left_value < 0.0) != (middle_value < 0.0))
        {
            upper = middle;
            right_value = middle_value;
        }
        else
        {
            lower = middle;
            left_value = middle_value;
        }
    }
    symbolic_results[0] = (lower + upper) / 2.0;
    numeric_status = NUMERIC_OK;
    return 1;
}

EXPORT double sagejs_numeric_symbolic_result(uint32_t index)
{
    if (index >= 2)
    {
        numeric_status = NUMERIC_INVALID_INPUT;
        return NAN;
    }
    return symbolic_results[index];
}
